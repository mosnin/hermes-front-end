"""Boot-sequence-level tests for the fs-quota layer (HERMES_FS_QUOTA_MB).

connector/tests/test_policy_fs.py (owned by the fs-secrets team) already
covers fsquota.py's own unit behavior in depth (tmpfs mount attempt, watcher
breach detection, block/terminate actions, idempotent stop). This file
focuses on the BOOT team's concern: that the fs-quota layer is correctly
wired into enforce_policy_from_env / the entrypoint boot sequence --
no-op when unset, a real trip-on-breach observable through the orchestrator
report, and that its resources get released rather than leaking a live
watcher thread across boots.
"""

from __future__ import annotations

import os
import time
import unittest

from connector.control_plane import policy as policy_pkg
from connector.control_plane.policy import fsquota
from connector.control_plane.policy.config import LayerStatus, PolicyConfig


class FsQuotaNoopWhenUnsetTest(unittest.TestCase):
    def setUp(self):
        self._saved_workdir = os.environ.pop(fsquota.ENV_WORKDIR_OVERRIDE, None)

    def tearDown(self):
        if self._saved_workdir is not None:
            os.environ[fsquota.ENV_WORKDIR_OVERRIDE] = self._saved_workdir
        else:
            os.environ.pop(fsquota.ENV_WORKDIR_OVERRIDE, None)

    def test_empty_env_reports_skipped_no_side_effects(self):
        # A fully empty env has NO policy at all, so the orchestrator short
        # circuits before even listing per-layer entries (see
        # policy/__init__.py's `has_any_policy` early return) -- verify that
        # short circuit itself is clean and fsquota left no trace.
        lines = []
        report = policy_pkg.enforce_policy_from_env({}, logger=lines.append)
        self.assertTrue(report.ok)
        self.assertFalse(any(r.layer == policy_pkg.LAYER_FSQUOTA for r in report.layers))
        self.assertNotIn(fsquota.ENV_WORKDIR_OVERRIDE, os.environ)

    def test_other_policy_set_fs_quota_unset_reports_fsquota_skipped(self):
        # With SOME policy active (secrets here) but no fs quota configured,
        # the orchestrator explicitly walks the fs-quota branch and must
        # record it as skipped -- a real no-op, not silent omission.
        lines = []
        env = {"HERMES_SECRET_SCOPES": "model"}
        report = policy_pkg.enforce_policy_from_env(
            env, logger=lines.append, apply_secret_filter=False
        )
        fs_result = next(r for r in report.layers if r.layer == policy_pkg.LAYER_FSQUOTA)
        self.assertEqual(fs_result.status, LayerStatus.SKIPPED)
        self.assertNotIn(fsquota.ENV_WORKDIR_OVERRIDE, os.environ)

    def test_apply_fs_quota_direct_noop_when_unset(self):
        result = fsquota.apply_fs_quota(PolicyConfig(), logger=lambda *_: None)
        self.assertEqual(result.status, LayerStatus.SKIPPED)
        self.assertEqual(result.detail, {})


class FsQuotaBoundThroughOrchestratorTest(unittest.TestCase):
    def setUp(self):
        self._saved_workdir = os.environ.pop(fsquota.ENV_WORKDIR_OVERRIDE, None)
        self._stop_callables: list = []

    def tearDown(self):
        for stop in self._stop_callables:
            try:
                stop()
            except Exception:  # noqa: BLE001
                pass
        if self._saved_workdir is not None:
            os.environ[fsquota.ENV_WORKDIR_OVERRIDE] = self._saved_workdir
        else:
            os.environ.pop(fsquota.ENV_WORKDIR_OVERRIDE, None)

    def test_watcher_trips_on_breach_via_orchestrator(self):
        import shutil
        import tempfile

        td = tempfile.mkdtemp()
        try:
            work_dir = os.path.join(td, "work")
            os.environ[fsquota.ENV_WORKDIR_OVERRIDE] = work_dir
            env = {
                "HERMES_FS_QUOTA_MB": "1",
                "HERMES_CONTAINER_POLICY_JSON": (
                    '{"fsQuotaAction":"log","fsQuotaCheckIntervalSec":0.2}'
                ),
            }
            lines = []
            report = policy_pkg.enforce_policy_from_env(
                env, logger=lines.append, apply_secret_filter=False
            )
            fs_result = next(r for r in report.layers if r.layer == policy_pkg.LAYER_FSQUOTA)
            self.assertIn(fs_result.status, (LayerStatus.APPLIED, LayerStatus.DEGRADED))
            self.assertTrue(report.ok)
            stop = fs_result.detail["stop"]

            watcher = fs_result.detail["watcher"]
            actual_work_dir = fs_result.detail["work_dir"]

            try:
                kernel_enforced = False
                try:
                    with open(os.path.join(actual_work_dir, "big.bin"), "wb") as fh:
                        fh.write(b"0" * (2 * 1024 * 1024))
                except OSError:
                    kernel_enforced = True

                if kernel_enforced:
                    self.assertTrue(fs_result.detail["mounted"])
                else:
                    deadline = time.time() + 10
                    while time.time() < deadline and not watcher.breached.is_set():
                        time.sleep(0.1)
                    self.assertTrue(watcher.breached.is_set())
                    self.assertTrue(
                        any("fs-quota" in line and "CRITICAL" in line for line in lines)
                    )
            finally:
                # Unmount (if a tmpfs was mounted) / stop the watcher BEFORE
                # trying to remove the temp dir tree -- an active tmpfs mount
                # under `td` makes rmtree fail with EBUSY otherwise.
                stop()
        finally:
            shutil.rmtree(td, ignore_errors=True)

    def test_malformed_quota_fails_the_whole_report_closed(self):
        env = {"HERMES_FS_QUOTA_MB": "-5"}
        lines = []
        report = policy_pkg.enforce_policy_from_env(env, logger=lines.append)
        self.assertFalse(report.ok)
        self.assertTrue(any("FAIL-CLOSED" in line for line in report.to_log_lines()))

    def test_fs_quota_error_in_layer_fails_report_closed(self):
        from unittest import mock

        env = {"HERMES_FS_QUOTA_MB": "10"}
        with mock.patch(
            "connector.control_plane.policy.fsquota.apply_fs_quota",
            side_effect=RuntimeError("disk exploded"),
        ):
            report = policy_pkg.enforce_policy_from_env(
                env, logger=lambda *_: None, apply_secret_filter=False
            )
        fs_result = next(r for r in report.layers if r.layer == policy_pkg.LAYER_FSQUOTA)
        self.assertEqual(fs_result.status, LayerStatus.FAILED)
        self.assertFalse(report.ok)


if __name__ == "__main__":
    unittest.main()
