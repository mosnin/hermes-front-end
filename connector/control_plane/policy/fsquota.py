"""HERMES_FS_QUOTA_MB enforcement — writable filesystem quota for the agent.

Implements :class:`connector.control_plane.policy.ApplyFsQuota`:

    apply_fs_quota(config: PolicyConfig, *, logger=None) -> LayerResult

Design (see docs/HARNESS_SPEC.md "Container policy (security profiles,
feature 17)" and the package roadmap):

* **Primary control (when privileged):** create/prepare a dedicated agent
  work directory and, if we can (root + a ``mount`` binary present), mount a
  size-capped ``tmpfs`` there. This gives a hard, kernel-enforced cap that
  even a confused/compromised agent process cannot exceed by writing fast.
* **Always-on control (regardless of privilege):** a stdlib background
  watcher thread that periodically walks the work directory computing its
  total size and, on breach, takes the configured action:
    - ``"block"`` (default) — best-effort revoke further writes (chmod the
      directory to remove the write bit so new files/subdirs fail to
      create) and log a CRITICAL line. Existing open file descriptors may
      still be able to append; this is defense-in-depth, not a substitute
      for the tmpfs cap when privilege is available.
    - ``"log"`` — log only, take no corrective action (advisory profiles).
    - ``"terminate"`` — hard-kill the agent process (SIGTERM then SIGKILL)
      so a runaway agent cannot continue past its quota at all.
* **No privilege ⇒ watcher-only.** Cloudflare Containers may not grant the
  capabilities needed to mount tmpfs; in that case we still create the work
  dir and still run the watcher, and the layer reports ``degraded`` (a real,
  if softer, control is in force) rather than ``failed``.
* **Fail closed only when we truly cannot do anything** — e.g. the work
  directory itself cannot be created (permission denied, disk full). That is
  the one case this module reports ``failed``.

Pure standard library: ``os``, ``shutil`` (which/disk_usage), ``subprocess``
(best-effort ``mount``/``umount``), ``threading``. No third-party deps.
"""

from __future__ import annotations

import os
import shutil
import signal
import stat
import subprocess
import tempfile
import threading
import time
from typing import Any, Callable, Optional

from .config import LayerResult, LayerStatus, PolicyConfig

# ---------------------------------------------------------------------------
# Tunables (overridable via the opaque HERMES_CONTAINER_POLICY_JSON)
# ---------------------------------------------------------------------------
ENV_WORKDIR_OVERRIDE = "HERMES_AGENT_WORKDIR"
DEFAULT_WORKDIR_NAME = "hermes-agent-workdir"
DEFAULT_CHECK_INTERVAL_SEC = 5.0
MIN_CHECK_INTERVAL_SEC = 0.5

ACTION_BLOCK = "block"
ACTION_LOG = "log"
ACTION_TERMINATE = "terminate"
_VALID_ACTIONS = (ACTION_BLOCK, ACTION_LOG, ACTION_TERMINATE)

_LOG_PREFIX = "[policy][fs-quota]"

Logger = Callable[[str], None]


def _default_work_dir() -> str:
    """Where the agent's writable working directory lives absent an override.

    Prefers a subdirectory of the current working directory (typically the
    container's app root) so relative paths the harness/agent uses still
    resolve sensibly; falls back to the system temp dir if that is not
    writable (e.g. a read-only app root).
    """
    override = os.environ.get(ENV_WORKDIR_OVERRIDE, "").strip()
    if override:
        return override
    candidate = os.path.join(os.getcwd(), DEFAULT_WORKDIR_NAME)
    parent = os.path.dirname(candidate) or "."
    if os.access(parent, os.W_OK):
        return candidate
    return os.path.join(tempfile.gettempdir(), DEFAULT_WORKDIR_NAME)


def _dir_size_bytes(path: str) -> int:
    """Best-effort recursive size of *path* in bytes.

    Pure stdlib (``os.walk`` + ``os.lstat``), never shells out to ``du`` (not
    guaranteed present in a minimal image). Tolerates files/dirs that vanish
    or become unreadable mid-walk (races with the agent itself writing) —
    those are skipped rather than raising, since a watcher must never crash
    the process it is protecting.
    """
    total = 0
    for dirpath, dirnames, filenames in os.walk(path, onerror=lambda e: None):
        for name in filenames:
            fp = os.path.join(dirpath, name)
            try:
                st = os.lstat(fp)
            except OSError:
                continue
            if stat.S_ISREG(st.st_mode) or stat.S_ISLNK(st.st_mode):
                total += st.st_size
    return total


def _is_privileged() -> bool:
    try:
        return hasattr(os, "geteuid") and os.geteuid() == 0
    except OSError:
        return False


def _try_mount_tmpfs(work_dir: str, quota_mb: int, logger: Logger) -> bool:
    """Best-effort ``mount -t tmpfs -o size=<n>m tmpfs <work_dir>``.

    Returns True only on a verified-successful mount. Any missing binary,
    missing privilege, or non-zero exit is treated as "not available" — the
    caller falls back to the watcher-only path, never raises.
    """
    if not _is_privileged():
        return False
    # Idempotency: if the work dir is ALREADY a mountpoint (e.g. the primary
    # boot path mounted the tmpfs pre-exec, and this is the agent process
    # re-establishing the in-process controls after os.execvpe), mounting again
    # would STACK a second tmpfs over the first — hiding the original and
    # requiring two umounts to unwind. Treat an existing mount as success.
    try:
        if os.path.ismount(work_dir):
            logger(f"{_LOG_PREFIX} {work_dir!r} already a tmpfs mountpoint — reusing existing cap")
            return True
    except OSError:
        pass
    mount_bin = shutil.which("mount")
    if not mount_bin:
        logger(f"{_LOG_PREFIX} no 'mount' binary present — tmpfs cap unavailable, watcher-only")
        return False
    try:
        result = subprocess.run(
            [mount_bin, "-t", "tmpfs", "-o", f"size={quota_mb}m,mode=0700", "tmpfs", work_dir],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger(f"{_LOG_PREFIX} tmpfs mount attempt errored: {exc} — falling back to watcher-only")
        return False
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        logger(
            f"{_LOG_PREFIX} tmpfs mount refused (rc={result.returncode}) "
            f"{detail!r} — falling back to watcher-only"
        )
        return False
    return True


def _try_umount(work_dir: str, logger: Logger) -> None:
    umount_bin = shutil.which("umount")
    if not umount_bin:
        return
    try:
        subprocess.run([umount_bin, work_dir], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError) as exc:
        logger(f"{_LOG_PREFIX} umount on stop() failed (non-fatal): {exc}")


def _resolve_action(config: PolicyConfig) -> str:
    raw = config.container_policy.get("fsQuotaAction")
    if not isinstance(raw, str):
        return ACTION_BLOCK
    val = raw.strip().lower()
    return val if val in _VALID_ACTIONS else ACTION_BLOCK


def _resolve_interval(config: PolicyConfig) -> float:
    raw = config.container_policy.get("fsQuotaCheckIntervalSec")
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return DEFAULT_CHECK_INTERVAL_SEC
    return max(MIN_CHECK_INTERVAL_SEC, val)


class FsQuotaWatcher:
    """Background thread that polls a directory's size against a byte cap.

    Always started (privileged or not) — this is the control that holds even
    when a tmpfs mount is impossible. Exposes a :class:`threading.Event` so a
    runtime loop can poll ``breached.is_set()`` cheaply instead of parsing
    logs, plus ``stop()`` for clean shutdown.
    """

    def __init__(
        self,
        work_dir: str,
        quota_bytes: int,
        *,
        action: str,
        interval_sec: float,
        logger: Logger,
    ) -> None:
        self.work_dir = work_dir
        self.quota_bytes = quota_bytes
        self.action = action
        self.interval_sec = interval_sec
        self._logger = logger
        self.breached = threading.Event()
        self.check_count = 0
        self.last_size_bytes = 0
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._run, name="hermes-fsquota-watcher", daemon=True
        )

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        # Don't block boot/shutdown on a slow last du() pass.
        self._thread.join(timeout=2.0)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                size = _dir_size_bytes(self.work_dir)
                self.last_size_bytes = size
                self.check_count += 1
                if size > self.quota_bytes and not self.breached.is_set():
                    self._on_breach(size)
            except Exception as exc:  # noqa: BLE001 — watcher must never die silently
                self._logger(f"{_LOG_PREFIX} watcher error (continuing): {exc}")
            self._stop_event.wait(self.interval_sec)

    def _on_breach(self, size_bytes: int) -> None:
        self.breached.set()
        mb = size_bytes / (1024 * 1024)
        cap_mb = self.quota_bytes / (1024 * 1024)
        self._logger(
            f"{_LOG_PREFIX} CRITICAL: quota breached — {mb:.1f}MB > {cap_mb:.1f}MB cap "
            f"in {self.work_dir!r}; action={self.action}"
        )
        if self.action == ACTION_LOG:
            return
        if self.action in (ACTION_BLOCK, ACTION_TERMINATE):
            self._block_further_writes()
        if self.action == ACTION_TERMINATE:
            self._logger(f"{_LOG_PREFIX} terminating agent process due to fs quota breach")
            self._terminate_process()

    def _block_further_writes(self) -> None:
        try:
            os.chmod(self.work_dir, stat.S_IRUSR | stat.S_IXUSR)  # r-x------: no new writes
        except OSError as exc:
            self._logger(f"{_LOG_PREFIX} could not chmod work dir read-only: {exc}")

    def _terminate_process(self) -> None:
        pid = os.getpid()
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
        time.sleep(0.5)
        os._exit(137)  # SIGKILL-equivalent exit code; last resort, always succeeds


def apply_fs_quota(config: PolicyConfig, *, logger: Optional[Logger] = None) -> LayerResult:
    """Enforce ``config.fs_quota_mb`` on the agent's working directory.

    Returns:
      * ``skipped``  — no fs quota configured (defensive; the orchestrator
        already gates on ``config.has_fs_policy`` before calling this).
      * ``applied``  — a privileged size-capped tmpfs is mounted AND the
        watcher is running (the strongest control available).
      * ``degraded`` — no privilege for tmpfs; watcher-only (still enforces,
        just softer/slower than a kernel cap).
      * ``failed``   — could not even create/prepare the work directory; the
        policy is unenforceable and boot must fail closed.

    The returned :class:`LayerResult.detail` carries ``work_dir``,
    ``quota_mb``, ``mounted`` (bool), ``action``, ``watcher`` (the
    :class:`FsQuotaWatcher`), and ``stop`` (idempotent zero-arg callable) so
    callers get the ``{work_dir, status, stop()}`` shape the roadmap
    describes on top of the fixed ``LayerResult`` contract.
    """
    log: Logger = logger or (lambda line: print(line))
    layer = "fs-quota"

    if not config.has_fs_policy:
        return LayerResult.skipped(layer, "no fs quota configured")

    quota_mb = config.fs_quota_mb
    assert quota_mb is not None  # has_fs_policy guarantees this
    quota_bytes = quota_mb * 1024 * 1024

    work_dir = _default_work_dir()
    try:
        os.makedirs(work_dir, exist_ok=True)
        os.chmod(work_dir, 0o700)
    except OSError as exc:
        return LayerResult.failed(
            layer,
            f"could not create/prepare agent work dir {work_dir!r}: {exc}",
            work_dir=work_dir,
            quota_mb=quota_mb,
        )

    mounted = _try_mount_tmpfs(work_dir, quota_mb, log)

    action = _resolve_action(config)
    interval = _resolve_interval(config)
    watcher = FsQuotaWatcher(
        work_dir, quota_bytes, action=action, interval_sec=interval, logger=log
    )
    watcher.start()

    # Point the rest of the runtime at the quota-managed directory.
    os.environ[ENV_WORKDIR_OVERRIDE] = work_dir

    stopped = threading.Event()

    def stop() -> None:
        if stopped.is_set():
            return
        stopped.set()
        watcher.stop()
        if mounted:
            _try_umount(work_dir, log)

    detail: dict[str, Any] = {
        "work_dir": work_dir,
        "quota_mb": quota_mb,
        "mounted": mounted,
        "action": action,
        "check_interval_sec": interval,
        "watcher": watcher,
        "stop": stop,
    }

    if mounted:
        return LayerResult.applied(
            layer,
            f"tmpfs capped at {quota_mb}MB mounted on {work_dir!r}; watcher armed ({action})",
            **detail,
        )
    return LayerResult.degraded(
        layer,
        f"no privilege for tmpfs — watcher-only cap of {quota_mb}MB on {work_dir!r} ({action})",
        **detail,
    )


def __self_check() -> None:
    """``python -m connector.control_plane.policy.fsquota`` — manual smoke test.

    Exercises: no-policy skip, work-dir creation, tiny-quota breach detection
    (fast check interval so this is deterministic, not a race with the
    default 5s interval), and idempotent stop().
    """
    # 1) no fs policy configured -> skip, no side effects.
    skip_result = apply_fs_quota(PolicyConfig(), logger=print)
    assert skip_result.status is LayerStatus.SKIPPED
    print("no-policy path: skipped OK")

    # 2) tiny quota, fast poll interval -> deterministic breach detection,
    #    whichever control ends up primary in this environment:
    #      * privileged (tmpfs mounted): the KERNEL enforces the cap — the
    #        oversized write itself fails with ENOSPC. That's the strongest
    #        possible enforcement, so it counts as success on its own.
    #      * unprivileged (watcher-only): the write succeeds and the
    #        background watcher must flag the breach within a few polls.
    with tempfile.TemporaryDirectory() as td:
        os.environ[ENV_WORKDIR_OVERRIDE] = os.path.join(td, "work")
        cfg = PolicyConfig(
            fs_quota_mb=1,  # 1MB — tiny quota, easy to breach
            container_policy={"fsQuotaAction": "log", "fsQuotaCheckIntervalSec": 0.2},
        )
        result = apply_fs_quota(cfg, logger=print)
        try:
            print("status:", result.status.value, "detail keys:", sorted(result.detail))
            assert result.status in (LayerStatus.APPLIED, LayerStatus.DEGRADED)
            wd = result.detail["work_dir"]
            watcher: FsQuotaWatcher = result.detail["watcher"]
            kernel_enforced = False
            try:
                with open(os.path.join(wd, "big.bin"), "wb") as fh:
                    fh.write(b"0" * (2 * 1024 * 1024))  # 2MB > 1MB cap
            except OSError as exc:
                kernel_enforced = True
                print(f"kernel enforced the cap directly (expected under tmpfs): {exc}")

            if kernel_enforced:
                assert result.detail["mounted"], "ENOSPC with no tmpfs mounted is unexpected"
            else:
                deadline = time.time() + 10
                while time.time() < deadline and not watcher.breached.is_set():
                    time.sleep(0.1)
                assert watcher.breached.is_set(), "watcher failed to detect the quota breach"
                print("watcher detected breach OK")
        finally:
            result.detail["stop"]()
            result.detail["stop"]()  # idempotent
        print("self-check OK")


if __name__ == "__main__":
    __self_check()
