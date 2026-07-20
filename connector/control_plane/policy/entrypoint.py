"""Container boot orchestration — ``python -m connector.control_plane.policy.entrypoint``.

This is the FIRST process every harness container runs (wired as the Docker
``ENTRYPOINT`` via the shared ``connector/harnesses/entrypoint.sh`` wrapper,
see that file for why it's a thin ``exec`` shim rather than doing the work in
shell). It is the piece that finally closes the gap docs/HARNESS_SPEC.md
"Container policy (security profiles, feature 17)" documents: the fleet
worker has always injected ``HERMES_EGRESS_ALLOWLIST`` /
``HERMES_FS_QUOTA_MB`` / ``HERMES_SECRET_SCOPES`` / ``HERMES_TOOL_ALLOWLIST``
/ ``HERMES_CONTAINER_POLICY_JSON`` into every hosted agent container, but
nothing read them at runtime. This module does, for every harness (hermes
built-in, openclaw, goose, generic-cli) alike, before any agent code runs:

  1. Parse ``PolicyConfig`` from the environment (fail closed on malformed
     values — handled inside :func:`connector.control_plane.policy.enforce_policy_from_env`).
  2. Start the egress allowlist proxy (the primary control) and, best-effort,
     the netfilter lockdown (defense-in-depth; degrades without
     ``CAP_NET_ADMIN`` — Cloudflare Containers may not grant it).
  3. Apply the fs quota (tmpfs cap when privileged, watcher-only otherwise).
  4. Compute the filtered environment (drops out-of-scope secrets, always
     keeps control-plane + proxy + runtime plumbing vars).
  5. ``exec`` the real agent process (default:
     ``python -m connector.control_plane.agent_runtime``, or whatever argv the
     Docker ``CMD`` passed through the entrypoint shim) with that filtered
     environment — replacing this process's PID, so signals reach the agent
     directly.

Fail-closed contract: if any layer the operator actually configured could not
be enforced (:attr:`~connector.control_plane.policy.PolicyReport.ok` is
False), this module refuses to start the agent at all. It prints a clear
operator-facing log line and exits with :data:`EXIT_POLICY_REFUSED` — the
container exits, it does NOT fall back to running the agent unprotected.

The whole thing is also implemented as an importable, side-effect-injectable
:func:`boot` function (rather than only a ``__main__`` script) so
``connector/tests/test_policy_boot.py`` can exercise the full sequence
without an environment override, and without actually replacing the test
process — pass an explicit ``env`` mapping and a fake ``exec_fn`` to observe
the outcome instead of calling ``os.execvpe``.
"""

from __future__ import annotations

import os
import sys
from typing import Callable, Mapping, Optional, Sequence

from . import (
    PolicyConfig,
    PolicyConfigError,
    PolicyReport,
    enforce_policy_from_env,
)
from .secrets import filtered_environ

Logger = Callable[[str], None]
ExecFn = Callable[[Sequence[str], Mapping[str, str]], None]

#: Distinct from common shell exit codes (126 "not executable", 127 "not
#: found", 1 generic traceback) so operators can grep container exit codes /
#: logs for "the security policy refused to start this agent" unambiguously.
EXIT_POLICY_REFUSED = 90
#: A bug in the entrypoint itself (not a policy failure) — kept distinct so
#: operators don't conflate "policy correctly refused" with "entrypoint
#: crashed".
EXIT_ENTRYPOINT_ERROR = 91

DEFAULT_AGENT_MODULE = "connector.control_plane.agent_runtime"

#: Set (into the child's environment) once this module has successfully
#: applied the full policy and is about to exec the real agent. The
#: belt-and-suspenders hook in ``agent_runtime.main()`` checks this to know
#: whether it's the primary enforcement path (this module) or a bypass
#: (module started directly, without the policy entrypoint as PID 1).
ENV_POLICY_ENFORCED_MARKER = "HERMES_POLICY_ENFORCED"


def _default_logger(line: str) -> None:
    print(line, flush=True)


def _default_exec(argv: Sequence[str], env: Mapping[str, str]) -> None:
    """Replace this process with *argv*, using *env* as its environment.

    ``os.execvpe`` searches ``PATH`` for ``argv[0]`` (so ``"sh"``/``"python"``
    resolve without an absolute path) and never returns on success — the
    calling process image is gone. If it *does* return, the exec failed
    (e.g. the binary genuinely doesn't exist), which is why callers of
    :func:`boot` must treat a returning ``exec_fn`` as an error, not success.
    """
    os.execvpe(argv[0], list(argv), dict(env))


def _default_argv() -> list[str]:
    return [sys.executable, "-m", DEFAULT_AGENT_MODULE]


def boot(
    env: Optional[Mapping[str, str]] = None,
    *,
    argv: Optional[Sequence[str]] = None,
    logger: Optional[Logger] = None,
    exec_fn: Optional[ExecFn] = None,
) -> int:
    """Apply the container security policy, then exec the real agent.

    Two modes, selected by whether *env* is given:

    * ``env=None`` (real boot): operates directly on the live process
      environment. ``enforce_policy_from_env`` is called with
      ``apply_secret_filter=True`` and no explicit ``env``, so its secret
      layer clears/repopulates ``os.environ`` in place; the egress/fs-quota
      layers already export their vars (``HTTP_PROXY``, ``HERMES_AGENT_WORKDIR``,
      ...) into ``os.environ`` as a side effect before that filtering runs, so
      nothing exported by an earlier layer is lost. The (possibly-replaced)
      ``os.environ`` is exactly what gets exec'd with.
    * ``env=<mapping>`` (tests / dependency injection): operates on a private
      copy throughout — never touches the calling process's real environment
      — and returns the computed exit code / calls the injected *exec_fn*
      instead of replacing the test process.

    Returns an ``int`` exit code. ``0`` means "policy applied cleanly and
    exec was invoked" (which, for the real ``exec_fn``, means the function
    never actually returns — the process image is gone). Any nonzero return
    means boot refused to start the agent; the caller (``main()``) must
    ``sys.exit`` with it, never launch the agent anyway.
    """
    log: Logger = logger or _default_logger
    do_exec: ExecFn = exec_fn or _default_exec
    child_argv = list(argv) if argv else _default_argv()

    real_boot = env is None

    try:
        if real_boot:
            # Parse once up front purely to fail fast on malformed values with
            # a clean message before we mutate anything (enforce_policy_from_env
            # would catch this too, but doing it here keeps the "malformed
            # config" failure path identical in both modes for tests).
            try:
                PolicyConfig.from_env()
            except PolicyConfigError as exc:
                log(f"[policy] entrypoint: malformed policy config: {exc}")
                log("[policy] entrypoint: FAIL-CLOSED: refusing to start agent")
                return EXIT_POLICY_REFUSED

            report = enforce_policy_from_env(logger=log, apply_secret_filter=True)
            if not report.ok:
                log("[policy] entrypoint: FAIL-CLOSED: refusing to start agent")
                return EXIT_POLICY_REFUSED

            os.environ[ENV_POLICY_ENFORCED_MARKER] = "1"
            final_env: Mapping[str, str] = dict(os.environ)
        else:
            working_env = dict(env)
            try:
                config = PolicyConfig.from_env(working_env)
            except PolicyConfigError as exc:
                log(f"[policy] entrypoint: malformed policy config: {exc}")
                log("[policy] entrypoint: FAIL-CLOSED: refusing to start agent")
                return EXIT_POLICY_REFUSED

            # Never mutate the real process environment in injected-env mode
            # (that's what makes this branch safe to unit test repeatedly in
            # the same interpreter). Layers that export into os.environ as a
            # side effect (egress proxy, fs quota) still do so for real —
            # they're the actual enforcement, not simulated — but we start
            # from a copy of the CALLER-SUPPLIED env for the parts of the
            # sequence that are meant to be observed by the test, and fold in
            # whatever the layers exported afterward.
            report = enforce_policy_from_env(
                working_env, logger=log, apply_secret_filter=False
            )
            if not report.ok:
                log("[policy] entrypoint: FAIL-CLOSED: refusing to start agent")
                return EXIT_POLICY_REFUSED

            # Fold in anything a layer exported into the real os.environ
            # (proxy vars, workdir override) on top of the caller's env, then
            # filter secrets against that combined view — mirroring exactly
            # what the real-boot branch produces, without ever touching
            # os.environ ourselves.
            merged = {**working_env, **_layer_exported_vars()}
            try:
                filtered = filtered_environ(config, merged, logger=log)
            except Exception as exc:  # noqa: BLE001 — a filter bug must fail closed
                log(f"[policy] entrypoint: secret filtering errored ({exc}) — fail closed")
                return EXIT_POLICY_REFUSED
            filtered = dict(filtered)
            filtered[ENV_POLICY_ENFORCED_MARKER] = "1"
            final_env = filtered
    except Exception as exc:  # noqa: BLE001 — an entrypoint bug must not launch an unprotected agent
        log(f"[policy] entrypoint: unexpected error applying policy ({exc!r}) — fail closed")
        return EXIT_ENTRYPOINT_ERROR

    log(f"[policy] entrypoint: policy applied cleanly — execing: {' '.join(child_argv)}")
    do_exec(child_argv, final_env)
    # A real os.execvpe never returns on success. Reaching here means either
    # exec_fn is a test double (expected — it records the call and returns),
    # or a genuine exec failure occurred and _default_exec raised (caught
    # above) or — for a raw OSError from execvpe that somehow didn't
    # propagate — we still must not report success by omission.
    return 0


def _layer_exported_vars() -> dict[str, str]:
    """The subset of the live process environment that the egress/fs-quota
    layers export as a side effect, so injected-env test mode can fold them
    into its own private copy without adopting the rest of the real
    ``os.environ`` (which would defeat the point of passing an explicit
    ``env``)."""
    keys = (
        "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
        "NO_PROXY", "no_proxy", "HERMES_AGENT_WORKDIR",
    )
    return {k: os.environ[k] for k in keys if k in os.environ}


def main() -> None:
    """Console entrypoint: ``python -m connector.control_plane.policy.entrypoint``.

    ``sys.argv[1:]`` (if any) becomes the argv to exec once the policy is
    applied — this is how ``entrypoint.sh`` forwards the Docker ``CMD`` (e.g.
    ``sh -c "python -m http.server ... & exec python -m
    connector.control_plane.agent_runtime"``) through this gate. With no
    extra argv, falls back to launching the built-in agent runtime directly.
    """
    argv = sys.argv[1:] or None
    code = boot(argv=argv)
    if code:
        sys.exit(code)


if __name__ == "__main__":  # pragma: no cover - process entry, exercised via boot() in tests
    main()
