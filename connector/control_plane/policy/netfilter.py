"""Kernel-level egress lockdown (iptables/nftables) — defense in depth ONLY.

The application-layer proxy in ``egress.py`` is the PRIMARY enforcement
boundary and must hold on its own with zero kernel privileges. This module
is a best-effort *second* layer: when the container happens to run as root
with ``CAP_NET_ADMIN`` (not guaranteed — Cloudflare Containers may withhold
it), pin ``OUTPUT`` traffic to the proxy's loopback port + DNS + loopback,
so that even a process which ignores ``HTTP_PROXY``/``HTTPS_PROXY``
env vars (or talks raw sockets) cannot reach the network directly.

Contract (``policy/__init__.py::Lockdown``): capability/binary absence is
NOT a failure — it returns ``LayerResult.degraded(...)`` and boot proceeds
with proxy-only enforcement. Only a lockdown that was *attempted* and left
iptables/nftables in a partial/inconsistent state (e.g. rules partially
applied then a later rule failed) is ``failed``.

Pure standard library: shells out to ``iptables``/``nft`` via
``subprocess`` if present; no dependency on a Python netfilter binding.
"""

from __future__ import annotations

import ctypes
import ctypes.util
import os
import shutil
import subprocess
from typing import Callable, Optional

from .config import LayerResult, PolicyConfig

Logger = Callable[[str], None]

LAYER = "netfilter"

# linux/capability.h
_CAP_NET_ADMIN = 12
# prctl(2) PR_CAPBSET_READ
_PR_CAPBSET_READ = 23

_SUBPROCESS_TIMEOUT = 10


def _run(cmd: list[str]) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=_SUBPROCESS_TIMEOUT,
            text=True,
            check=False,
        )
        return proc.returncode, proc.stdout or ""
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, str(exc)


def _is_root() -> bool:
    try:
        return hasattr(os, "geteuid") and os.geteuid() == 0
    except Exception:  # noqa: BLE001
        return False


def has_cap_net_admin() -> bool:
    """Best-effort detection of ``CAP_NET_ADMIN`` in the effective set.

    Tries, in order:
      1. ``prctl(PR_CAPBSET_READ, CAP_NET_ADMIN)`` via ``ctypes`` against
         libc — cheap, no subprocess, works without ``python-prctl``.
      2. Parse ``/proc/self/status`` ``CapEff`` bitmask.
    Any failure (non-Linux, sandboxed ``/proc``, missing libc symbol) is
    treated as "capability absent" — the safe, degrade-not-fail default.
    """
    if not _is_root():
        # Without root, iptables/nft mutation is refused by the kernel
        # regardless of capability bits (containers rarely give a
        # non-root user CAP_NET_ADMIN + writable nat/filter tables).
        return False

    try:
        libc_name = ctypes.util.find_library("c")
        if libc_name:
            libc = ctypes.CDLL(libc_name, use_errno=True)
            res = libc.prctl(_PR_CAPBSET_READ, _CAP_NET_ADMIN, 0, 0, 0)
            if res == 1:
                return True
            if res == 0:
                return False
            # res < 0: prctl not supported for this arg here — fall through.
    except Exception:  # noqa: BLE001
        pass

    try:
        with open("/proc/self/status", "r", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("CapEff:"):
                    mask = int(line.split(":", 1)[1].strip(), 16)
                    return bool(mask & (1 << _CAP_NET_ADMIN))
    except (OSError, ValueError):
        pass

    return False


def _find_firewall_tool() -> Optional[str]:
    """Prefer nft (modern) if present and workable, else legacy iptables."""
    if shutil.which("nft"):
        return "nft"
    if shutil.which("iptables"):
        return "iptables"
    return None


def _apply_nft(proxy_port: int, allow_hosts_note: str) -> tuple[bool, str]:
    """Best-effort nftables lockdown: a dedicated table restricting OUTPUT to
    loopback + DNS(53) + the proxy port; everything else in the ``inet``
    family is dropped. Idempotent: the table is flushed/recreated each call.
    """
    ruleset = f"""
table inet hermes_egress {{
  chain output {{
    type filter hook output priority 0; policy drop;
    oif lo accept
    ct state established,related accept
    udp dport 53 accept
    tcp dport 53 accept
    tcp dport {proxy_port} ip daddr 127.0.0.1 accept
  }}
}}
""".strip()
    try:
        proc = subprocess.run(
            ["nft", "-f", "-"],
            input=ruleset,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=_SUBPROCESS_TIMEOUT,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            return False, (proc.stdout or "").strip()
        return True, f"nft table inet hermes_egress applied ({allow_hosts_note})"
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)


def _apply_iptables(proxy_port: int, allow_hosts_note: str) -> tuple[bool, str]:
    """Best-effort legacy-iptables lockdown mirroring ``_apply_nft``: a
    dedicated OUTPUT policy allowing loopback, established/related, DNS, and
    the proxy port, dropping everything else. Applied as an ordered rule
    list (iptables has no atomic multi-rule load like ``nft -f``), so a
    mid-sequence failure is reported precisely and treated as FAILED
    (partial state), never silently ignored.
    """
    commands = [
        ["-F", "OUTPUT"],
        ["-A", "OUTPUT", "-o", "lo", "-j", "ACCEPT"],
        ["-A", "OUTPUT", "-m", "state", "--state", "ESTABLISHED,RELATED", "-j", "ACCEPT"],
        ["-A", "OUTPUT", "-p", "udp", "--dport", "53", "-j", "ACCEPT"],
        ["-A", "OUTPUT", "-p", "tcp", "--dport", "53", "-j", "ACCEPT"],
        ["-A", "OUTPUT", "-d", "127.0.0.1", "-p", "tcp", "--dport", str(proxy_port), "-j", "ACCEPT"],
        ["-A", "OUTPUT", "-j", "DROP"],
    ]
    applied = 0
    for args in commands:
        rc, out = _run(["iptables", *args])
        if rc != 0:
            if applied == 0:
                # Nothing changed yet — safe, report as a clean failure.
                return False, out.strip()
            # Partial application: some rules landed, the sequence broke
            # midway. This is the genuinely dangerous case (inconsistent
            # firewall state) the Lockdown contract calls out as `failed`
            # rather than `degraded`.
            return False, (
                f"partial iptables lockdown after {applied} rule(s): {out.strip()}"
            )
        applied += 1
    return True, f"iptables OUTPUT policy applied ({allow_hosts_note})"


def lockdown(config: PolicyConfig, *, logger: Optional[Logger] = None) -> LayerResult:
    """Attempt kernel-level egress lockdown as defense-in-depth.

    Only meaningful once the egress proxy is up (its loopback port is what
    traffic gets pinned to). Degrades — never fails — when root/CAP_NET_ADMIN
    or a firewall binary is unavailable, per the ``Lockdown`` Protocol
    contract in ``policy/__init__.py``.
    """
    log: Logger = logger or (lambda line: print(line))

    if not _is_root():
        log("[policy] netfilter: not running as root — degraded (proxy-only)")
        return LayerResult.degraded(
            LAYER, "not running as root; proxy-only enforcement in effect"
        )

    if not has_cap_net_admin():
        log("[policy] netfilter: CAP_NET_ADMIN not available — degraded (proxy-only)")
        return LayerResult.degraded(
            LAYER, "CAP_NET_ADMIN unavailable (e.g. Cloudflare Containers); proxy-only enforcement in effect"
        )

    tool = _find_firewall_tool()
    if tool is None:
        log("[policy] netfilter: no iptables/nft binary found — degraded (proxy-only)")
        return LayerResult.degraded(
            LAYER, "no iptables/nft binary in image; proxy-only enforcement in effect"
        )

    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or ""
    proxy_port = _extract_port(proxy_url)
    if proxy_port is None:
        # The egress proxy layer hasn't run (or failed) yet — lockdown
        # without it would just drop everything, which is not "hardening",
        # it's an outage. Degrade rather than break the agent.
        log("[policy] netfilter: no egress proxy port found — degraded (proxy-only)")
        return LayerResult.degraded(
            LAYER, "egress proxy not running yet; skipping kernel lockdown this pass"
        )

    allow_note = f"{len(config.effective_egress_hosts())} host(s) via proxy:{proxy_port}"
    ok, detail = _apply_nft(proxy_port, allow_note) if tool == "nft" else _apply_iptables(proxy_port, allow_note)

    if ok:
        log(f"[policy] netfilter: {detail}")
        return LayerResult.applied(LAYER, detail, tool=tool, proxy_port=proxy_port)

    log(f"[policy] netfilter: lockdown attempt failed via {tool}: {detail}")
    return LayerResult.failed(LAYER, f"{tool} lockdown failed: {detail}", tool=tool)


def _extract_port(proxy_url: str) -> Optional[int]:
    if not proxy_url:
        return None
    try:
        tail = proxy_url.rsplit(":", 1)[-1]
        tail = tail.rstrip("/")
        return int(tail)
    except (ValueError, IndexError):
        return None


if __name__ == "__main__":  # pragma: no cover - manual smoke path
    from .config import PolicyConfig as _PC

    demo_env = {
        "HERMES_EGRESS_ALLOWLIST": "*.example.com",
        "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
    }
    cfg = _PC.from_env(demo_env)
    os.environ.setdefault("HTTPS_PROXY", "http://127.0.0.1:38080")
    result = lockdown(cfg)
    print(f"status={result.status.value} message={result.message!r} detail={result.detail}")
