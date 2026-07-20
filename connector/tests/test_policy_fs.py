"""Tests for connector.control_plane.policy.fsquota (HERMES_FS_QUOTA_MB)."""

from __future__ import annotations

import os
import sys
import time

import pytest

from connector.control_plane.policy import LayerStatus, PolicyConfig
from connector.control_plane.policy import fsquota


@pytest.fixture(autouse=True)
def _clean_workdir_env(monkeypatch):
    monkeypatch.delenv(fsquota.ENV_WORKDIR_OVERRIDE, raising=False)
    yield


def test_skipped_when_no_fs_policy():
    result = fsquota.apply_fs_quota(PolicyConfig(), logger=lambda *_: None)
    assert result.status is LayerStatus.SKIPPED


def test_creates_work_dir_and_applies_or_degrades(tmp_path, monkeypatch):
    monkeypatch.setenv(fsquota.ENV_WORKDIR_OVERRIDE, str(tmp_path / "work"))
    cfg = PolicyConfig(fs_quota_mb=64)
    lines = []
    result = fsquota.apply_fs_quota(cfg, logger=lines.append)
    try:
        assert result.status in (LayerStatus.APPLIED, LayerStatus.DEGRADED)
        assert os.path.isdir(result.detail["work_dir"])
        assert result.detail["quota_mb"] == 64
        assert callable(result.detail["stop"])
        assert isinstance(result.detail["mounted"], bool)
        # Non-privileged CI containers: watcher-only is expected, not a failure.
        if not result.detail["mounted"]:
            assert result.status is LayerStatus.DEGRADED
    finally:
        result.detail["stop"]()


def _write_past_quota(work_dir: str, size_bytes: int = 2 * 1024 * 1024) -> bool:
    """Write an oversized file into *work_dir*.

    Returns True if the kernel itself enforced the cap (write raised OSError
    — expected when a size-capped tmpfs is actually mounted, i.e. the
    privileged path). Returns False if the write succeeded (the watcher-only,
    unprivileged path), meaning the *watcher* must be the one to catch it.
    """
    try:
        with open(os.path.join(work_dir, "big.bin"), "wb") as fh:
            fh.write(b"0" * size_bytes)
    except OSError:
        return True
    return False


def test_tiny_quota_watcher_breaches_on_overflow(tmp_path, monkeypatch):
    monkeypatch.setenv(fsquota.ENV_WORKDIR_OVERRIDE, str(tmp_path / "work"))
    cfg = PolicyConfig(
        fs_quota_mb=1,
        container_policy={"fsQuotaAction": "log", "fsQuotaCheckIntervalSec": 0.2},
    )
    lines = []
    result = fsquota.apply_fs_quota(cfg, logger=lines.append)
    watcher = result.detail["watcher"]
    try:
        work_dir = result.detail["work_dir"]
        kernel_enforced = _write_past_quota(work_dir)
        if kernel_enforced:
            # Privileged path: the tmpfs mount itself is the enforcement.
            assert result.detail["mounted"] is True
            return
        deadline = time.time() + 5
        while time.time() < deadline and not watcher.breached.is_set():
            time.sleep(0.1)
        assert watcher.breached.is_set(), "watcher should detect the quota breach"
        assert any("CRITICAL" in line for line in lines)
    finally:
        result.detail["stop"]()


def test_block_action_chmods_dir_read_only(tmp_path, monkeypatch):
    monkeypatch.setenv(fsquota.ENV_WORKDIR_OVERRIDE, str(tmp_path / "work"))
    cfg = PolicyConfig(
        fs_quota_mb=1,
        container_policy={"fsQuotaAction": "block", "fsQuotaCheckIntervalSec": 0.2},
    )
    result = fsquota.apply_fs_quota(cfg, logger=lambda *_: None)
    watcher = result.detail["watcher"]
    work_dir = result.detail["work_dir"]
    try:
        kernel_enforced = _write_past_quota(work_dir)
        if kernel_enforced:
            # Privileged path: tmpfs itself refuses further writes (ENOSPC) —
            # that already satisfies "no further writes succeed"; the
            # chmod-based block is the unprivileged-path fallback.
            assert result.detail["mounted"] is True
            with pytest.raises(OSError):
                with open(os.path.join(work_dir, "should-fail.txt"), "w") as fh:
                    fh.write("x" * 1024)
            return
        deadline = time.time() + 5
        while time.time() < deadline and not watcher.breached.is_set():
            time.sleep(0.1)
        assert watcher.breached.is_set()
        time.sleep(0.3)  # let the block action's chmod land
        # New file creation should now fail (dir lost the write bit), unless
        # running as root where permission bits don't block the owner.
        if os.geteuid() != 0:
            with pytest.raises(PermissionError):
                open(os.path.join(work_dir, "should-fail.txt"), "w").close()
    finally:
        try:
            os.chmod(work_dir, 0o700)
        except OSError:
            pass
        result.detail["stop"]()


def test_work_dir_creation_failure_is_failed_not_degraded(monkeypatch):
    # Point the work dir at a path that cannot possibly be created (a file,
    # not a directory, in the path) to force a hard failure.
    monkeypatch.setenv(fsquota.ENV_WORKDIR_OVERRIDE, __file__ + "/impossible/child")
    cfg = PolicyConfig(fs_quota_mb=10)
    result = fsquota.apply_fs_quota(cfg, logger=lambda *_: None)
    assert result.status is LayerStatus.FAILED


def test_stop_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv(fsquota.ENV_WORKDIR_OVERRIDE, str(tmp_path / "work"))
    cfg = PolicyConfig(fs_quota_mb=32)
    result = fsquota.apply_fs_quota(cfg, logger=lambda *_: None)
    stop = result.detail["stop"]
    stop()
    stop()  # must not raise / must not double-unmount


def test_self_check_script_runs():
    import subprocess

    proc = subprocess.run(
        [sys.executable, "-m", "connector.control_plane.policy.fsquota"],
        cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "self-check OK" in proc.stdout
