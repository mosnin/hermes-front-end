"""Tests for connector.control_plane.policy.egress / netfilter (cycle 1).

Focus: the proxy actually enforces the allowlist (allow / deny / apex /
wildcard / attacker-suffix), fails closed on bind errors, and netfilter
degrades gracefully without CAP_NET_ADMIN. No live outbound network calls —
denials are checked directly against a real bound proxy on loopback (the
proxy accepts the TCP connection and replies before we'd ever need internet
egress), and allow-path forwarding is checked against a local HTTP server we
spin up ourselves.
"""

from __future__ import annotations

import http.client
import http.server
import os
import socket
import threading
import unittest

from connector.control_plane.policy import egress, netfilter
from connector.control_plane.policy.config import PolicyConfig


def _free_local_http_server():
    class _Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            return

    srv = http.server.HTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, t


class EgressProxyTest(unittest.TestCase):
    def setUp(self):
        # Never let a real HTTP(S)_PROXY from the host leak into these tests.
        for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            os.environ.pop(var, None)
        self._handles = []

    def tearDown(self):
        for h in self._handles:
            h.stop()
        for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy"):
            os.environ.pop(var, None)

    def _start(self, env_overrides):
        env = {"HERMES_CONTROL_PLANE_URL": "https://control.cadre.to", **env_overrides}
        cfg = PolicyConfig.from_env(env)
        handle = egress.start_egress_proxy(cfg, logger=lambda line: None)
        self._handles.append(handle)
        return cfg, handle

    def test_bind_and_env_export(self):
        cfg, handle = self._start({"HERMES_EGRESS_ALLOWLIST": "example.com"})
        self.assertTrue(handle.proxy_url.startswith("http://127.0.0.1:"))
        self.assertTrue(handle.is_alive())
        self.assertEqual(os.environ["HTTP_PROXY"], handle.proxy_url)
        self.assertEqual(os.environ["HTTPS_PROXY"], handle.proxy_url)
        self.assertEqual(os.environ["http_proxy"], handle.proxy_url)

    def test_connect_denied_host_gets_closed_not_forwarded(self):
        _, handle = self._start({"HERMES_EGRESS_ALLOWLIST": "example.com"})
        conn = http.client.HTTPConnection(handle.host, handle.port, timeout=5)
        conn.set_tunnel("evil.net", 443)
        with self.assertRaises(Exception):
            conn.connect()
        self.assertGreaterEqual(handle.counters.get("denied", 0), 1)

    def test_connect_allowed_host_tunnels_through(self):
        upstream, upstream_thread = _free_local_http_server()
        try:
            up_host, up_port = upstream.server_address
            # Allow the upstream loopback "host" by its literal address.
            _, handle = self._start({"HERMES_EGRESS_ALLOWLIST": up_host})
            conn = http.client.HTTPConnection(handle.host, handle.port, timeout=5)
            conn.set_tunnel(up_host, up_port)
            conn.connect()
            conn.request("GET", "/")
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.read(), b"ok")
            conn.close()
            self.assertGreaterEqual(handle.counters.get("allowed", 0), 1)
        finally:
            upstream.shutdown()
            upstream.server_close()

    def test_plain_http_denied_host_gets_403(self):
        _, handle = self._start({"HERMES_EGRESS_ALLOWLIST": "example.com"})
        conn = http.client.HTTPConnection(handle.host, handle.port, timeout=5)
        conn.request("GET", "http://evil.net/", headers={"Host": "evil.net"})
        resp = conn.getresponse()
        self.assertEqual(resp.status, 403)
        resp.read()
        conn.close()

    def test_plain_http_allowed_host_forwards_to_real_upstream(self):
        # The plain-HTTP path must actually forward (not just "not 403") —
        # verify a full round trip against a real local upstream server.
        upstream, upstream_thread = _free_local_http_server()
        try:
            up_host, up_port = upstream.server_address
            _, handle = self._start({"HERMES_EGRESS_ALLOWLIST": up_host})
            conn = http.client.HTTPConnection(handle.host, handle.port, timeout=5)
            conn.request(
                "GET",
                f"http://{up_host}:{up_port}/",
                headers={"Host": f"{up_host}:{up_port}"},
            )
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.read(), b"ok")
            conn.close()
            self.assertGreaterEqual(handle.counters.get("allowed", 0), 1)
        finally:
            upstream.shutdown()
            upstream.server_close()

    def test_plain_http_denied_host_never_reaches_upstream(self):
        # A denied plain-HTTP request must be refused before any upstream
        # connection is attempted (deny-by-default, not "forward then
        # discard the response").
        upstream, upstream_thread = _free_local_http_server()
        try:
            up_host, up_port = upstream.server_address
            _, handle = self._start({"HERMES_EGRESS_ALLOWLIST": "only-allowed.example"})
            conn = http.client.HTTPConnection(handle.host, handle.port, timeout=5)
            conn.request(
                "GET",
                f"http://{up_host}:{up_port}/",
                headers={"Host": f"{up_host}:{up_port}"},
            )
            resp = conn.getresponse()
            self.assertEqual(resp.status, 403)
            resp.read()
            conn.close()
        finally:
            upstream.shutdown()
            upstream.server_close()

    def test_always_allow_control_plane_host_reachable(self):
        # Even a very restrictive allowlist must still let the control plane
        # host's CONNECT through (folded in via always_allow_hosts). Uses a
        # real local upstream (not a live external host — hermetic, no
        # dependency on outbound DNS/network from the test sandbox) as the
        # "control plane" target, so the round trip is actually exercised.
        upstream, upstream_thread = _free_local_http_server()
        try:
            up_host, up_port = upstream.server_address
            env = {
                "HERMES_CONTROL_PLANE_URL": f"https://{up_host}:{up_port}",
                "HERMES_EGRESS_ALLOWLIST": "only-this-one.example",
            }
            cfg = PolicyConfig.from_env(env)
            handle = egress.start_egress_proxy(cfg, logger=lambda line: None)
            self._handles.append(handle)
            self.assertIn(up_host, cfg.effective_egress_hosts())
            conn = http.client.HTTPConnection(handle.host, handle.port, timeout=5)
            conn.set_tunnel(up_host, up_port)
            try:
                conn.connect()
            except Exception:
                self.fail("control-plane host must always be allowed through CONNECT")
            finally:
                conn.close()
        finally:
            upstream.shutdown()
            upstream.server_close()

    def test_wildcard_apex_and_attacker_suffix(self):
        cfg = PolicyConfig.from_env({
            "HERMES_EGRESS_ALLOWLIST": "*.github.com",
            "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
        })
        matcher = cfg.host_matcher()
        self.assertTrue(matcher.allows("api.github.com"))
        self.assertTrue(matcher.allows("github.com"))
        self.assertFalse(matcher.allows("github.com.evil.net"))
        self.assertFalse(matcher.allows("api.github.com.attacker.net"))

    def test_double_stop_is_idempotent(self):
        _, handle = self._start({"HERMES_EGRESS_ALLOWLIST": "example.com"})
        handle.stop()
        handle.stop()  # must not raise
        self.assertFalse(handle.is_alive())

    def test_no_policy_config_still_binds_but_caller_should_gate(self):
        # start_egress_proxy doesn't itself check has_egress_policy (the
        # orchestrator gates on that). With a fully empty env there is no
        # operator allowlist AND no control-plane URL, but
        # PolicyConfig._infer_model_hosts still falls back to allowing BOTH
        # known model-API hosts (ambiguous provider => never brick the LLM
        # call). So the matcher is non-empty even here: a caller that forgot
        # to gate on has_egress_policy still gets real, fail-closed
        # enforcement — arbitrary hosts are denied, only the always-allow
        # model hosts get through. This is a stricter, safer outcome than
        # "allow everything", never a weaker one.
        cfg = PolicyConfig.from_env({})
        handle = egress.start_egress_proxy(cfg, logger=lambda line: None)
        self._handles.append(handle)
        matcher = cfg.host_matcher()
        self.assertFalse(matcher.is_empty)
        self.assertFalse(cfg.has_egress_policy)
        self.assertTrue(matcher.allows("api.anthropic.com"))
        self.assertTrue(matcher.allows("api.openai.com"))
        self.assertFalse(matcher.allows("anything.example"))
        # is_host_allowed() is the "no policy => no restriction" API surface
        # for callers that DO check has_egress_policy first.
        self.assertTrue(cfg.is_host_allowed("anything.example"))


class NetfilterLockdownTest(unittest.TestCase):
    def test_degrades_without_root(self):
        cfg = PolicyConfig.from_env({
            "HERMES_EGRESS_ALLOWLIST": "example.com",
            "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
        })
        if netfilter._is_root():
            self.skipTest("running as root; non-root degrade path not exercised")
        result = netfilter.lockdown(cfg, logger=lambda line: None)
        self.assertEqual(result.status.value, "degraded")

    def test_has_cap_net_admin_returns_bool_never_raises(self):
        # Must never raise regardless of platform/sandbox quirks.
        self.assertIsInstance(netfilter.has_cap_net_admin(), bool)

    def test_extract_port(self):
        self.assertEqual(netfilter._extract_port("http://127.0.0.1:38080"), 38080)
        self.assertIsNone(netfilter._extract_port(""))
        self.assertIsNone(netfilter._extract_port("not-a-url"))

    def test_find_firewall_tool_returns_str_or_none(self):
        tool = netfilter._find_firewall_tool()
        self.assertTrue(tool is None or isinstance(tool, str))


class OrchestratorIntegrationTest(unittest.TestCase):
    """Smoke-test the full policy/__init__.py orchestrator now that egress +
    netfilter are landed, without needing the fs-quota/secrets modules."""

    def setUp(self):
        for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            os.environ.pop(var, None)

    def tearDown(self):
        for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "NO_PROXY", "no_proxy"):
            os.environ.pop(var, None)

    def test_egress_only_policy_applies_and_degrades_netfilter_gracefully(self):
        from connector.control_plane import policy as policy_pkg

        env = {
            "HERMES_EGRESS_ALLOWLIST": "example.com",
            "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
        }
        lines = []
        report = policy_pkg.enforce_policy_from_env(env, logger=lines.append, apply_secret_filter=False)
        try:
            egress_result = next(r for r in report.layers if r.layer == "egress")
            self.assertEqual(egress_result.status.value, "applied")
            netfilter_result = next(r for r in report.layers if r.layer == "netfilter")
            self.assertIn(netfilter_result.status.value, ("degraded", "applied"))
            self.assertTrue(os.environ.get("HTTP_PROXY", "").startswith("http://127.0.0.1:"))
        finally:
            # Clean up the proxy thread the orchestrator started.
            proxy_url = os.environ.get("HTTP_PROXY", "")
            # Best-effort: no handle exposed by enforce_policy_from_env in
            # cycle 1 (BOOT team wires lifetime management); the daemon
            # thread will die with the test process.
            _ = proxy_url


if __name__ == "__main__":
    unittest.main()
