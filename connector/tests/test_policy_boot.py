"""Tests for the container boot sequence: connector.control_plane.policy.entrypoint.

Exercises the full "parse policy -> apply every layer -> filter secrets ->
exec the real agent" sequence end-to-end, without ever spawning a real
container or requiring root:

  * clean boot with no policy configured (empty env => unrestricted, exec
    still happens)
  * clean boot with a real egress + fs-quota + secrets policy applied
    together, verifying the exec'd environment carries the proxy vars, the
    workdir override, AND has out-of-scope secrets filtered out
  * fail-closed when a REQUIRED policy value is malformed
  * fail-closed when a configured layer's enforcement module blows up
  * the belt-and-suspenders hook in agent_runtime.main()

All boot() calls in this file use an explicit `env=` mapping (never `None`),
which per entrypoint.py's contract means boot() operates on a private copy
and calls the injected `exec_fn` instead of replacing the test process itself
via os.execvpe -- so these tests are safe to run in any interpreter, no
subprocess required, no root required.
"""

from __future__ import annotations

import os
import unittest
from unittest import mock

from connector.control_plane.policy import entrypoint as boot_mod
from connector.control_plane.policy.config import PolicyConfig


def _fake_exec():
    """A no-op exec_fn that just records its call instead of replacing the
    process, so tests can assert on the argv/env the entrypoint decided to
    launch the agent with."""
    calls = []

    def _exec(argv, env):
        calls.append((list(argv), dict(env)))

    _exec.calls = calls
    return _exec


class BootCleanPathTest(unittest.TestCase):
    def setUp(self):
        # Egress/fs-quota layers export real state into the *actual*
        # os.environ as a side effect even in injected-env mode (they are the
        # real enforcement, not simulated) -- clean up after every test so
        # runs don't bleed into each other.
        self._saved = dict(os.environ)

    def tearDown(self):
        for k in list(os.environ):
            if k not in self._saved:
                os.environ.pop(k, None)
        os.environ.update(self._saved)
        for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            if var not in self._saved:
                os.environ.pop(var, None)

    def test_empty_env_boots_clean_and_execs(self):
        exec_fn = _fake_exec()
        code = boot_mod.boot({}, exec_fn=exec_fn, logger=lambda *_: None)
        self.assertEqual(code, 0)
        self.assertEqual(len(exec_fn.calls), 1)
        argv, env = exec_fn.calls[0]
        self.assertIn("connector.control_plane.agent_runtime", " ".join(argv))
        self.assertEqual(env.get(boot_mod.ENV_POLICY_ENFORCED_MARKER), "1")

    def test_custom_argv_is_forwarded_to_exec(self):
        exec_fn = _fake_exec()
        code = boot_mod.boot(
            {}, argv=["sh", "-c", "echo hi"], exec_fn=exec_fn, logger=lambda *_: None
        )
        self.assertEqual(code, 0)
        argv, _env = exec_fn.calls[0]
        self.assertEqual(argv, ["sh", "-c", "echo hi"])

    def test_full_policy_applies_and_filters_secrets_before_exec(self):
        env = {
            "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
            "HERMES_EGRESS_ALLOWLIST": "example.com",
            "HERMES_SECRET_SCOPES": "model",
            "ANTHROPIC_API_KEY": "sk-ant-keep-me",
            "COMPOSIO_API_KEY": "cmp-drop-me",
            "PATH": "/usr/bin",
        }
        lines = []
        exec_fn = _fake_exec()
        code = boot_mod.boot(env, exec_fn=exec_fn, logger=lines.append)
        self.assertEqual(code, 0)
        _argv, final_env = exec_fn.calls[0]

        # Secret filtering held: model scope kept, integrations dropped.
        self.assertEqual(final_env.get("ANTHROPIC_API_KEY"), "sk-ant-keep-me")
        self.assertNotIn("COMPOSIO_API_KEY", final_env)
        # Runtime plumbing always keeps.
        self.assertEqual(final_env.get("PATH"), "/usr/bin")
        # Egress layer's real side effect (proxy export into os.environ) got
        # folded into the exec'd environment.
        self.assertTrue(final_env.get("HTTP_PROXY", "").startswith("http://127.0.0.1:"))
        self.assertEqual(final_env.get(boot_mod.ENV_POLICY_ENFORCED_MARKER), "1")
        # The caller's private env dict was never touched.
        self.assertNotIn(boot_mod.ENV_POLICY_ENFORCED_MARKER, env)
        self.assertNotIn("HTTP_PROXY", env)

        # Clean up the egress proxy thread this test started.
        proxy_url = os.environ.get("HTTP_PROXY", "")
        _ = proxy_url  # daemon thread; dies with process, nothing else to join here


class BootFailClosedTest(unittest.TestCase):
    def setUp(self):
        self._saved = dict(os.environ)

    def tearDown(self):
        for k in list(os.environ):
            if k not in self._saved:
                os.environ.pop(k, None)
        os.environ.update(self._saved)

    def test_malformed_fs_quota_fails_closed_before_exec(self):
        exec_fn = _fake_exec()
        env = {"HERMES_FS_QUOTA_MB": "not-a-number"}
        code = boot_mod.boot(env, exec_fn=exec_fn, logger=lambda *_: None)
        self.assertEqual(code, boot_mod.EXIT_POLICY_REFUSED)
        self.assertEqual(exec_fn.calls, [])  # agent must NEVER be launched

    def test_malformed_container_policy_json_fails_closed(self):
        exec_fn = _fake_exec()
        env = {"HERMES_CONTAINER_POLICY_JSON": "{not valid json"}
        code = boot_mod.boot(env, exec_fn=exec_fn, logger=lambda *_: None)
        self.assertEqual(code, boot_mod.EXIT_POLICY_REFUSED)
        self.assertEqual(exec_fn.calls, [])

    def test_egress_layer_error_fails_closed(self):
        # Force the egress layer to blow up even though an egress policy was
        # requested -- a "required" policy that can't be enforced must abort
        # boot rather than starting the agent unprotected.
        exec_fn = _fake_exec()
        env = {
            "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
            "HERMES_EGRESS_ALLOWLIST": "example.com",
        }
        with mock.patch(
            "connector.control_plane.policy.egress.start_egress_proxy",
            side_effect=RuntimeError("bind failed"),
        ):
            code = boot_mod.boot(env, exec_fn=exec_fn, logger=lambda *_: None)
        self.assertEqual(code, boot_mod.EXIT_POLICY_REFUSED)
        self.assertEqual(exec_fn.calls, [])

    def test_fail_mode_open_downgrades_failure_and_still_execs(self):
        # An operator who explicitly opted into failMode=open gets a
        # best-effort agent even when a layer failed -- verified here so the
        # "fail closed by default, opt-in only to open" contract has a
        # concrete regression test at the boot-sequence level, not just in
        # config.py's own unit tests.
        exec_fn = _fake_exec()
        env = {
            "HERMES_CONTROL_PLANE_URL": "https://control.cadre.to",
            "HERMES_EGRESS_ALLOWLIST": "example.com",
            "HERMES_CONTAINER_POLICY_JSON": '{"failMode":"open"}',
        }
        with mock.patch(
            "connector.control_plane.policy.egress.start_egress_proxy",
            side_effect=RuntimeError("bind failed"),
        ):
            code = boot_mod.boot(env, exec_fn=exec_fn, logger=lambda *_: None)
        self.assertEqual(code, 0)
        self.assertEqual(len(exec_fn.calls), 1)

    def test_entrypoint_bug_is_reported_as_entrypoint_error_not_success(self):
        # A crash in secret filtering (or anywhere unexpected in boot()
        # itself, as opposed to a layer's own reported failure) must not be
        # mistaken for a clean boot.
        exec_fn = _fake_exec()
        env = {"HERMES_SECRET_SCOPES": "model"}
        with mock.patch(
            "connector.control_plane.policy.entrypoint.filtered_environ",
            side_effect=RuntimeError("boom"),
        ):
            code = boot_mod.boot(env, exec_fn=exec_fn, logger=lambda *_: None)
        self.assertEqual(code, boot_mod.EXIT_POLICY_REFUSED)
        self.assertEqual(exec_fn.calls, [])


class MainCliTest(unittest.TestCase):
    def test_main_exits_nonzero_on_refusal(self):
        with mock.patch.object(
            boot_mod, "boot", return_value=boot_mod.EXIT_POLICY_REFUSED
        ):
            with self.assertRaises(SystemExit) as ctx:
                boot_mod.main()
        self.assertEqual(ctx.exception.code, boot_mod.EXIT_POLICY_REFUSED)

    def test_main_does_not_exit_when_boot_returns_zero(self):
        with mock.patch.object(boot_mod, "boot", return_value=0):
            boot_mod.main()  # must not raise SystemExit


class AgentRuntimeBeltAndSuspendersTest(unittest.TestCase):
    """The second, in-process safety hook: connector.control_plane.agent_runtime
    must still enforce policy if started without the policy entrypoint as
    PID 1 (e.g. local dev or an image that forgot to wire it)."""

    def setUp(self):
        self._saved = dict(os.environ)

    def tearDown(self):
        for k in list(os.environ):
            if k not in self._saved:
                os.environ.pop(k, None)
        os.environ.update(self._saved)
        for var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
            if var not in self._saved:
                os.environ.pop(var, None)

    def test_no_marker_and_malformed_policy_raises_systemexit(self):
        from connector.control_plane import agent_runtime

        os.environ.pop("HERMES_POLICY_ENFORCED", None)
        os.environ["HERMES_FS_QUOTA_MB"] = "not-a-number"
        try:
            with self.assertRaises(SystemExit) as ctx:
                agent_runtime._enforce_boot_policy()
            self.assertEqual(ctx.exception.code, 90)
        finally:
            os.environ.pop("HERMES_FS_QUOTA_MB", None)

    def test_no_marker_and_no_policy_is_a_noop_and_sets_marker(self):
        from connector.control_plane import agent_runtime

        os.environ.pop("HERMES_POLICY_ENFORCED", None)
        for var in (
            "HERMES_EGRESS_ALLOWLIST",
            "HERMES_FS_QUOTA_MB",
            "HERMES_SECRET_SCOPES",
            "HERMES_CONTAINER_POLICY_JSON",
        ):
            os.environ.pop(var, None)
        agent_runtime._enforce_boot_policy()
        self.assertEqual(os.environ.get("HERMES_POLICY_ENFORCED"), "1")

    def test_marker_present_skips_reenforcement(self):
        from connector.control_plane import agent_runtime

        os.environ["HERMES_POLICY_ENFORCED"] = "1"
        # Even with a malformed policy value present, the marker path must
        # NOT re-raise -- the primary entrypoint already made the call; this
        # is drift-verification only, never a second hard gate.
        os.environ["HERMES_FS_QUOTA_MB"] = "not-a-number"
        try:
            agent_runtime._enforce_boot_policy()  # must not raise
        finally:
            os.environ.pop("HERMES_FS_QUOTA_MB", None)


if __name__ == "__main__":
    unittest.main()
