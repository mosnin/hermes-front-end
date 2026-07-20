"""Application-layer egress allowlist proxy (EGRESS team, cycle 1).

This is the PRIMARY enforcement boundary for ``HERMES_EGRESS_ALLOWLIST``.
Cloudflare Containers may not grant ``CAP_NET_ADMIN``, so a kernel-level
firewall (see ``netfilter.py``) cannot be relied on alone. Instead, boot
starts a small threaded stdlib HTTP(S) forward proxy bound to loopback and
points the agent's ``HTTP_PROXY``/``HTTPS_PROXY`` at it. Every plain-HTTP
request and every CONNECT tunnel is checked against
``config.host_matcher()`` (which already folds in the always-allow hosts —
the control-plane host and the inferred model-API host(s)) before any bytes
are forwarded. Anything that doesn't match is refused: HTTP requests get a
403, CONNECT tunnels are closed before the handshake completes.

Pure standard library: ``http.server`` + ``socketserver`` + ``socket`` +
``threading``. No new dependency.

Fail-closed contract: ``start_egress_proxy`` raises on any condition that
would leave the agent thinking it's protected when it isn't (bind failure,
thread that dies immediately). The orchestrator in ``policy/__init__.py``
turns that raise into a FAILED layer, which aborts boot in the default
(closed) fail mode. It never silently returns a proxy that isn't actually
listening.
"""

from __future__ import annotations

import ipaddress
import os
import select
import socket
import socketserver
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Callable, Optional
from urllib.parse import urlsplit

from .config import PolicyConfig, normalize_host

Logger = Callable[[str], None]

# Chunk size for the CONNECT tunnel relay loop.
_BUF_SIZE = 65536
# How long a relay `select()` call waits before checking for shutdown.
_SELECT_TIMEOUT = 1.0
# Socket connect timeout to the upstream target.
_CONNECT_TIMEOUT = 10.0
# Idle timeout for a stalled tunnel leg (no data either direction).
_IDLE_TIMEOUT = 300.0


class EgressDenied(Exception):
    """Raised internally when a target host fails the allowlist check."""


def _client_addr_repr(address: tuple) -> str:
    """A refusal-log-safe rendering of a client peer address (no secrets, no
    full request data — just the port to distinguish concurrent refusals)."""
    try:
        return f"{address[0]}:{address[1]}"
    except Exception:  # noqa: BLE001
        return "?"


class _AllowlistHandler(BaseHTTPRequestHandler):
    """Handles both CONNECT (HTTPS tunnel) and plain-HTTP forward requests.

    Class-level attributes are injected by ``_build_handler_class`` per proxy
    instance (there is one handler class per ``start_egress_proxy`` call, so
    this is safe despite being "class state").
    """

    matcher = None  # type: ignore[assignment]
    log: Logger = staticmethod(lambda line: None)  # type: ignore[assignment]
    counters: dict = {}
    protocol_version = "HTTP/1.1"
    server_version = "HermesEgressProxy/1"

    # Silence the default stderr access log; we log our own, redacted lines.
    def log_message(self, fmt: str, *args) -> None:  # noqa: D401
        return

    def _deny(self, host: str, *, via: str) -> None:
        self.counters["denied"] = self.counters.get("denied", 0) + 1
        self.log(
            f"[policy] egress: DENY host={host!r} via={via} "
            f"client={_client_addr_repr(self.client_address)}"
        )

    def _allow_count(self) -> None:
        self.counters["allowed"] = self.counters.get("allowed", 0) + 1

    # -- CONNECT (HTTPS tunneling) ------------------------------------
    def do_CONNECT(self) -> None:
        target = self.path  # "host:port"
        host, _, port_s = target.rpartition(":")
        if not host:
            host, port_s = target, "443"
        try:
            port = int(port_s)
        except ValueError:
            port = 443

        if not self._host_allowed(host):
            self._deny(host, via="CONNECT")
            try:
                self.send_response(403, "Forbidden by egress policy")
                self.end_headers()
            except Exception:  # noqa: BLE001
                pass
            return

        self._allow_count()
        try:
            upstream = socket.create_connection((host, port), timeout=_CONNECT_TIMEOUT)
        except OSError as exc:
            self.log(f"[policy] egress: upstream connect failed host={host!r}: {exc}")
            try:
                self.send_response(502, "Bad Gateway")
                self.end_headers()
            except Exception:  # noqa: BLE001
                pass
            return

        try:
            self.send_response(200, "Connection Established")
            self.end_headers()
        except Exception:  # noqa: BLE001
            upstream.close()
            return

        client_sock = self.connection
        try:
            _relay(client_sock, upstream)
        finally:
            try:
                upstream.close()
            except Exception:  # noqa: BLE001
                pass

    # -- plain HTTP forward proxying -----------------------------------
    # Hop-by-hop headers per RFC 7230 sec. 6.1 that must never be blindly
    # relayed to the upstream server (a forward proxy terminates these
    # itself for each leg of the connection).
    _HOP_BY_HOP = frozenset(
        {
            "connection",
            "proxy-connection",
            "keep-alive",
            "proxy-authenticate",
            "proxy-authorization",
            "te",
            "trailer",
            "transfer-encoding",
            "upgrade",
        }
    )

    def _handle_plain(self, method: str) -> None:
        """Forward a plain-HTTP (absolute- or origin-form) request to the
        real target, deny-by-default on the allowlist check first.

        This is a genuine one-shot (non-keepalive) forward: request headers
        are relayed minus hop-by-hop headers, the body (if any, per
        Content-Length) is relayed verbatim, and the upstream's raw response
        bytes are streamed straight back to the client. No response
        buffering/parsing is attempted — the proxy is a dumb relay, not an
        HTTP cache, so it never has to understand or rewrite response
        bodies (which would risk corrupting content the agent depends on).
        """
        url = self.path
        parsed = urlsplit(url if "://" in url else f"http://{self.headers.get('Host', '')}{url}")
        host = parsed.hostname or self.headers.get("Host", "")

        if not self._host_allowed(host):
            self._deny(host or "?", via=f"HTTP {method}")
            body = b"Forbidden by egress policy\n"
            self.send_response(403, "Forbidden by egress policy")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            try:
                self.wfile.write(body)
            except Exception:  # noqa: BLE001
                pass
            return

        port = parsed.port or 80
        origin_path = parsed.path or "/"
        if parsed.query:
            origin_path = f"{origin_path}?{parsed.query}"

        # Read the request body (if any) before doing anything else — the
        # client already sent it as part of this request and it must be
        # drained from rfile regardless of what happens next.
        try:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            content_length = 0
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""

        try:
            upstream = socket.create_connection((host, port), timeout=_CONNECT_TIMEOUT)
        except OSError as exc:
            self.log(f"[policy] egress: upstream connect failed host={host!r}: {exc}")
            try:
                self.send_response(502, "Bad Gateway")
                self.end_headers()
            except Exception:  # noqa: BLE001
                pass
            return

        self._allow_count()
        try:
            header_lines = [f"{method} {origin_path} HTTP/1.1\r\n"]
            sent_host = False
            for key, value in self.headers.items():
                if key.lower() in self._HOP_BY_HOP:
                    continue
                if key.lower() == "host":
                    sent_host = True
                header_lines.append(f"{key}: {value}\r\n")
            if not sent_host:
                header_lines.append(f"Host: {host}\r\n")
            header_lines.append("Connection: close\r\n\r\n")
            request_bytes = "".join(header_lines).encode("latin-1", errors="replace") + body_bytes

            upstream.sendall(request_bytes)
        except OSError as exc:
            self.log(f"[policy] egress: upstream send failed host={host!r}: {exc}")
            try:
                upstream.close()
            except Exception:  # noqa: BLE001
                pass
            try:
                self.send_response(502, "Bad Gateway")
                self.end_headers()
            except Exception:  # noqa: BLE001
                pass
            return

        try:
            client_sock = self.connection
            client_sock.setblocking(True)
            upstream.settimeout(_IDLE_TIMEOUT)
            while True:
                try:
                    chunk = upstream.recv(_BUF_SIZE)
                except socket.timeout:
                    break
                except OSError:
                    break
                if not chunk:
                    break
                try:
                    client_sock.sendall(chunk)
                except OSError:
                    break
        finally:
            try:
                upstream.close()
            except Exception:  # noqa: BLE001
                pass

    def do_GET(self) -> None:
        self._handle_plain("GET")

    def do_POST(self) -> None:
        self._handle_plain("POST")

    def do_PUT(self) -> None:
        self._handle_plain("PUT")

    def do_PATCH(self) -> None:
        self._handle_plain("PATCH")

    def do_DELETE(self) -> None:
        self._handle_plain("DELETE")

    def do_HEAD(self) -> None:
        self._handle_plain("HEAD")

    def do_OPTIONS(self) -> None:
        self._handle_plain("OPTIONS")

    # -- shared allow check ----------------------------------------------
    def _host_allowed(self, host: str) -> bool:
        """Deny-by-default host check.

        Re-normalizes and re-validates the *actual* requested hostname on
        every call (never trust a cached decision) to close DNS-rebinding /
        TOCTOU gaps: the string checked here is exactly the string used to
        open the upstream connection, and ``socket.create_connection``
        re-resolves it independently — there is no cached IP smuggled past
        the check. A bare IP-literal target is normalized like any other
        host, so it is allowed only if it matches an allowlist entry
        (typically it won't), preventing an IP-literal bypass of hostname
        globs.
        """
        h = normalize_host(host)
        if not h:
            return False
        return self.matcher.allows(h)


def _relay(a: socket.socket, b: socket.socket) -> None:
    """Bidirectionally pump bytes between two connected sockets until either
    side closes, errors, or goes idle past ``_IDLE_TIMEOUT``. Robust to
    abrupt client disconnects (broken pipe / reset) — those simply end the
    relay, they never crash the server thread."""
    a.setblocking(False)
    b.setblocking(False)
    last_activity = time.monotonic()
    socks = [a, b]
    try:
        while True:
            try:
                readable, _, exceptional = select.select(socks, [], socks, _SELECT_TIMEOUT)
            except (OSError, ValueError):
                return
            if exceptional:
                return
            if not readable:
                if time.monotonic() - last_activity > _IDLE_TIMEOUT:
                    return
                continue
            last_activity = time.monotonic()
            for src in readable:
                dst = b if src is a else a
                try:
                    chunk = src.recv(_BUF_SIZE)
                except (BlockingIOError, InterruptedError):
                    continue
                except OSError:
                    return
                if not chunk:
                    return
                try:
                    dst.sendall(chunk)
                except OSError:
                    return
    finally:
        return


class _ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    # Bound concurrency isn't strictly needed for a single-agent sidecar
    # proxy, but keeps a runaway client from spawning unbounded threads.
    request_queue_size = 128


class EgressProxyHandle:
    """Concrete :class:`~policy.EgressHandle` implementation."""

    def __init__(self, server: _ThreadingHTTPServer, thread: threading.Thread, host: str, port: int, counters: dict, logger: Logger):
        self._server = server
        self._thread = thread
        self._stopped = False
        self._lock = threading.Lock()
        self._log = logger
        self.host = host
        self.port = port
        self.counters = counters
        self.proxy_url = f"http://{host}:{port}"

    def is_alive(self) -> bool:
        """Liveness probe for ``verify_or_reapply``: the accept-loop thread
        is still running and the listening socket is still bound."""
        if not self._thread.is_alive():
            return False
        try:
            self._server.socket.getsockname()
        except OSError:
            return False
        return True

    def stop(self) -> None:
        with self._lock:
            if self._stopped:
                return
            self._stopped = True
        try:
            self._server.shutdown()
        except Exception:  # noqa: BLE001
            pass
        try:
            self._server.server_close()
        except Exception:  # noqa: BLE001
            pass
        self._thread.join(timeout=5.0)


def start_egress_proxy(config: PolicyConfig, *, logger: Optional[Logger] = None) -> EgressProxyHandle:
    """Start the loopback allowlist proxy and point the agent at it.

    Contract (see ``policy/__init__.py::StartEgressProxy``): binds to
    ``127.0.0.1`` on an ephemeral port, enforces ``config.host_matcher()``
    (always-allow hosts already folded in) on every forwarded
    request/CONNECT, exports ``HTTP_PROXY``/``HTTPS_PROXY`` (+ lowercase) into
    ``os.environ``, and returns a live :class:`EgressProxyHandle`. Raises on
    bind failure or if the accept-loop thread dies immediately — the caller
    (``enforce_policy_from_env``) turns that into a FAILED layer, which fails
    the whole boot closed.
    """
    log: Logger = logger or (lambda line: print(line))
    matcher = config.host_matcher()
    counters: dict = {"allowed": 0, "denied": 0}

    handler_cls = type(
        "_BoundAllowlistHandler",
        (_AllowlistHandler,),
        {"matcher": matcher, "log": staticmethod(log), "counters": counters},
    )

    try:
        server = _ThreadingHTTPServer(("127.0.0.1", 0), handler_cls)
    except OSError as exc:
        raise RuntimeError(f"egress proxy: failed to bind loopback port: {exc}") from exc

    host, port = server.server_address[:2]
    thread = threading.Thread(
        target=server.serve_forever,
        kwargs={"poll_interval": 0.25},
        name="hermes-egress-proxy",
        daemon=True,
    )
    thread.start()

    # Confirm the accept loop is actually alive before handing back a handle
    # boot will trust — a thread that dies on startup must fail closed, not
    # silently produce a proxy_url nobody is listening on.
    time.sleep(0.05)
    if not thread.is_alive():
        try:
            server.server_close()
        except Exception:  # noqa: BLE001
            pass
        raise RuntimeError("egress proxy: accept-loop thread died on startup")

    handle = EgressProxyHandle(server, thread, host, port, counters, log)

    for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        os.environ[var] = handle.proxy_url
    # Never proxy loopback-to-loopback traffic (control-plane calls that
    # already target 127.0.0.1 in dev, and the proxy's own health checks).
    os.environ.setdefault("NO_PROXY", "127.0.0.1,localhost")
    os.environ.setdefault("no_proxy", "127.0.0.1,localhost")

    log(
        f"[policy] egress: proxy listening on {handle.proxy_url}, "
        f"{len(config.effective_egress_hosts())} host(s) allowed"
    )
    return handle


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return False


if __name__ == "__main__":  # pragma: no cover - manual smoke path
    import sys

    demo_env = {
        "HERMES_EGRESS_ALLOWLIST": "*.example.com,pypi.org",
        "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
        "HERMES_AGENT_MODEL": "claude-3-5-sonnet",
    }
    cfg = PolicyConfig.from_env(demo_env)
    h = start_egress_proxy(cfg)
    print(f"proxy_url={h.proxy_url}")
    print(f"effective hosts={cfg.effective_egress_hosts()}")
    print("Try: curl -x", h.proxy_url, "-I https://pypi.org  (should succeed)")
    print("Try: curl -x", h.proxy_url, "-I https://example.org  (should 403/close)")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        sys.stderr.write("\nstopping\n")
        h.stop()
