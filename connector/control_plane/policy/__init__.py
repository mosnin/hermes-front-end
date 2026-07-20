"""Container security-policy enforcement package.

The fleet worker injects a security profile into every hosted agent container
as env vars (``HERMES_EGRESS_ALLOWLIST`` / ``HERMES_FS_QUOTA_MB`` /
``HERMES_SECRET_SCOPES`` / ``HERMES_TOOL_ALLOWLIST`` /
``HERMES_CONTAINER_POLICY_JSON``). Historically **nothing inside the container
read or enforced them** — they were advisory (see docs/HARNESS_SPEC.md,
"Container policy (security profiles, feature 17)"). This package closes that
gap: it turns the env contract into real, fail-closed, in-process enforcement
applied *before* any harness starts its agent loop.

Architecture (this file is the contract; teams own the layers):

    config.py    (ARCHITECT — this cycle)  parse + model: PolicyConfig / PolicyReport
    egress.py    (EGRESS team)             application-layer allowlist proxy
    netfilter.py (EGRESS team)             optional iptables/nftables lockdown
    fsquota.py   (FS-SECRETS team)         writable-fs quota
    secrets.py   (FS-SECRETS team)         env secret-scope filter
    __init__.py  (BOOT team fleshes out)   enforce_policy_from_env orchestration

Boot integration (BOOT team, in agent_runtime.main / AgentRuntime.__init__):

    from connector.control_plane.policy import enforce_policy_from_env
    report = enforce_policy_from_env()
    for line in report.to_log_lines():
        print(line)
    if not report.ok:
        raise SystemExit(90)   # fail closed — do NOT start the agent loop

The four layer entrypoints below are declared here as **typed Protocols** so
every team implements the same signature and tests can target the names before
the modules exist. ``enforce_policy_from_env`` orchestrates them via lazy
imports and degrades safely: a policy that is present but whose enforcing
module is missing or raises is recorded ``FAILED`` and (in the default
``closed`` fail-mode) makes ``report.ok`` False, so boot aborts rather than
running an agent with an unenforced restriction.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Mapping, Optional, Protocol, runtime_checkable

from .config import (
    ENV_AGENT_MODEL,
    ENV_CONTAINER_POLICY_JSON,
    ENV_CONTROL_PLANE_URL,
    ENV_EGRESS_ALLOWLIST,
    ENV_FS_QUOTA_MB,
    ENV_SECRET_SCOPES,
    ENV_TOOL_ALLOWLIST,
    FailMode,
    HostMatcher,
    LayerResult,
    LayerStatus,
    PolicyConfig,
    PolicyConfigError,
    PolicyReport,
    normalize_host,
    redact,
    redact_mapping,
    redact_value,
)

# A logger is any sink taking one preformatted line. Defaults to print so the
# connector needs no logging setup; boot can pass its own.
Logger = Callable[[str], None]


# ---------------------------------------------------------------------------
# Layer entrypoint Protocols — the FIXED interface each team implements.
# ---------------------------------------------------------------------------
@runtime_checkable
class EgressHandle(Protocol):
    """Live handle returned by the egress proxy so boot can wire the agent to it
    and shut it down cleanly.

    Implementation (EGRESS team, ``egress.py``): a threaded stdlib
    ``http.server``/``socketserver`` proxy that terminates CONNECT tunnels and
    forwards only allowlisted hosts. Starting it must also point the agent at
    it by exporting ``HTTP_PROXY``/``HTTPS_PROXY`` (and lowercase variants) into
    ``os.environ`` so ``urllib`` in ``agent_runtime`` routes through it.
    """

    #: The ``http://host:port`` the agent's proxy env vars should point at.
    proxy_url: str

    def stop(self) -> None:
        """Stop accepting connections and release the port. Idempotent."""
        ...


class StartEgressProxy(Protocol):
    """Signature for ``egress.start_egress_proxy``.

    Contract:
      * Precondition: ``config.has_egress_policy`` is True (caller gates on it).
      * Bind a loopback proxy, export ``HTTP(S)_PROXY`` into ``os.environ``,
        and enforce ``config.host_matcher()`` on every forwarded request/CONNECT.
      * ``config.always_allow_hosts`` (control plane + model API) are already
        folded into the matcher — the proxy must NOT special-case them itself.
      * Deny-by-default: any host not matching is refused (HTTP 403 / closed
        tunnel), and the refusal is logged.
      * Returns an :class:`EgressHandle`; on unrecoverable bind failure, raise —
        the orchestrator turns that into a FAILED layer (fail closed).
    """

    def __call__(
        self, config: PolicyConfig, *, logger: Optional[Logger] = None
    ) -> EgressHandle: ...


class Lockdown(Protocol):
    """Signature for ``netfilter.lockdown`` — defense-in-depth ONLY.

    Contract:
      * Attempt a kernel-level egress lockdown (iptables/nftables) that pins
        outbound traffic to the proxy + always-allow hosts, as a second layer
        behind the application proxy.
      * Cloudflare Containers may not grant ``CAP_NET_ADMIN``. When the
        capability/binary is absent, return
        ``LayerResult.degraded(...)`` — NOT failed: the proxy is the primary
        control and still holds. Only return ``failed`` if a lockdown was
        attempted and left the system in an inconsistent/partial state.
    """

    def __call__(
        self, config: PolicyConfig, *, logger: Optional[Logger] = None
    ) -> LayerResult: ...


class ApplyFsQuota(Protocol):
    """Signature for ``fsquota.apply_fs_quota``.

    Contract:
      * Precondition: ``config.has_fs_policy`` is True.
      * Constrain the agent's writable filesystem to ``config.fs_quota_mb`` MB
        (e.g. relocate scratch to a size-capped tmpfs/quota dir and export the
        path). Prefer stdlib + best-effort OS calls; degrade gracefully.
      * Return ``applied`` when the cap is enforceable, ``degraded`` when only a
        soft/advisory cap could be set, ``failed`` when a hard requirement
        (the policy is present) could not be met at all.
    """

    def __call__(
        self, config: PolicyConfig, *, logger: Optional[Logger] = None
    ) -> LayerResult: ...


class FilteredEnviron(Protocol):
    """Signature for ``secrets.filtered_environ``.

    Contract:
      * Return a NEW mapping derived from ``env`` (default ``os.environ``) with
        every secret the agent is not scoped for removed, keyed by
        ``config.secret_scopes``.
      * Must always preserve the vars the connector needs to function
        (``HERMES_CONTROL_PLANE_URL``, ``HERMES_CONNECTOR_TOKEN``, proxy vars,
        and the model API key for the in-use provider).
      * Pure/no side effects: the caller (boot) decides whether to
        ``os.environ.clear(); os.environ.update(...)``. Never logs raw secret
        values — use :func:`redact` for any diagnostics.
    """

    def __call__(
        self, config: PolicyConfig, env: Optional[Mapping[str, str]] = None
    ) -> dict[str, str]: ...


# Layer/module names the orchestrator lazy-imports. Kept as data so tests and
# tooling can introspect the expected module + attribute for each layer.
LAYER_EGRESS = "egress"
LAYER_NETFILTER = "netfilter"
LAYER_FSQUOTA = "fs-quota"
LAYER_SECRETS = "secrets"

#: layer -> (module basename within this package, attribute name)
LAYER_ENTRYPOINTS: dict[str, tuple[str, str]] = {
    LAYER_EGRESS: ("egress", "start_egress_proxy"),
    LAYER_NETFILTER: ("netfilter", "lockdown"),
    LAYER_FSQUOTA: ("fsquota", "apply_fs_quota"),
    LAYER_SECRETS: ("secrets", "filtered_environ"),
}


# ---------------------------------------------------------------------------
# Orchestration entrypoint.
# ---------------------------------------------------------------------------
def _resolve(module_basename: str, attr: str):
    """Lazy-import ``policy.<module_basename>.<attr>``.

    Returns the callable, or raises ImportError/AttributeError if the layer
    module (owned by another team) hasn't landed yet. The orchestrator turns
    that into a FAILED layer so a present policy fails closed until the enforcer
    exists — never silently unenforced.
    """
    import importlib

    mod = importlib.import_module(f"{__name__}.{module_basename}")
    return getattr(mod, attr)


def enforce_policy_from_env(
    env: Optional[Mapping[str, str]] = None,
    *,
    logger: Optional[Logger] = None,
    apply_secret_filter: bool = True,
) -> PolicyReport:
    """Parse the security policy from the environment and apply every layer.

    This is THE boot-time entrypoint every harness calls before starting its
    agent loop. It is intentionally thin: it parses a :class:`PolicyConfig`,
    then for each dimension the operator set, invokes the owning team's layer
    (:class:`StartEgressProxy` / :class:`Lockdown` / :class:`ApplyFsQuota` /
    :class:`FilteredEnviron`) and folds the outcome into a :class:`PolicyReport`.

    Fail-closed semantics:
      * No policy set for a dimension  -> that layer is ``skipped`` (fine).
      * Malformed policy value         -> ``PolicyConfigError`` at parse time,
        recorded as a FAILED ``config`` layer; ``report.ok`` is False.
      * Policy set but enforcing module missing/raising -> FAILED layer;
        ``report.ok`` is False in the default ``closed`` fail-mode.

    The BOOT team fleshes out the per-layer wiring (handle lifetimes, applying
    the filtered environ, ordering). The stub here already produces a correct,
    conservative report — anything it cannot actually enforce fails closed.

    Returns a :class:`PolicyReport`; the caller must check ``report.ok`` and
    refuse to start the agent when it is False.
    """
    log: Logger = logger or (lambda line: print(line))

    # --- parse (fail closed on malformed values) -------------------------
    try:
        config = PolicyConfig.from_env(env)
    except PolicyConfigError as exc:
        report = PolicyReport(fail_mode=FailMode.CLOSED)
        report.add("config", LayerStatus.FAILED, str(exc))
        for line in report.to_log_lines():
            log(line)
        return report

    report = PolicyReport(fail_mode=config.fail_mode)
    log(config.summary_line())

    if not config.has_any_policy:
        # Nothing to enforce — unrestricted is a valid, explicit state.
        report.add("config", LayerStatus.SKIPPED, "no container policy set")
        for line in report.to_log_lines():
            log(line)
        return report

    # --- egress proxy (primary) + netfilter (defense in depth) -----------
    if config.has_egress_policy:
        _run_layer(
            report, LAYER_EGRESS, config, logger=log,
            summarize=lambda handle: LayerResult.applied(
                LAYER_EGRESS,
                f"proxy up on {getattr(handle, 'proxy_url', '?')}, "
                f"{len(config.effective_egress_hosts())} host(s) allowed",
            ),
        )
        # netfilter is best-effort defense-in-depth; it never blocks boot on
        # its own — a missing CAP_NET_ADMIN degrades, it doesn't fail.
        _run_layer(
            report, LAYER_NETFILTER, config, logger=log,
            treat_missing_as=LayerStatus.DEGRADED,
        )
    else:
        report.add(LAYER_EGRESS, LayerStatus.SKIPPED, "no egress allowlist")

    # --- fs quota --------------------------------------------------------
    if config.has_fs_policy:
        _run_layer(report, LAYER_FSQUOTA, config, logger=log)
    else:
        report.add(LAYER_FSQUOTA, LayerStatus.SKIPPED, "no fs quota")

    # --- secret scope filter --------------------------------------------
    if config.has_secret_policy:
        _run_secret_layer(report, config, env=env, apply=apply_secret_filter, logger=log)
    else:
        report.add(LAYER_SECRETS, LayerStatus.SKIPPED, "no secret scopes")

    for line in report.to_log_lines():
        log(line)
    return report


def _run_layer(
    report: PolicyReport,
    layer: str,
    config: PolicyConfig,
    *,
    logger: Logger,
    summarize: Optional[Callable[[Any], LayerResult]] = None,
    treat_missing_as: LayerStatus = LayerStatus.FAILED,
) -> None:
    """Invoke one layer's entrypoint and record its outcome.

    A layer function may return a :class:`LayerResult` directly (netfilter,
    fsquota) or an opaque object like an :class:`EgressHandle` (egress) — in the
    latter case pass ``summarize`` to fold it into a result. Import/attribute
    errors (module not landed) are recorded as ``treat_missing_as``; any other
    exception is a hard FAILED (fail closed).
    """
    module_basename, attr = LAYER_ENTRYPOINTS[layer]
    try:
        fn = _resolve(module_basename, attr)
    except (ImportError, AttributeError) as exc:
        report.add(
            layer, treat_missing_as,
            f"enforcement module {module_basename!r} not available yet: {exc}",
        )
        return
    try:
        outcome = fn(config, logger=logger)
    except NotImplementedError as exc:
        report.add(layer, treat_missing_as, f"not implemented yet: {exc}")
        return
    except Exception as exc:  # noqa: BLE001 — a failing enforcer must fail closed
        report.add(layer, LayerStatus.FAILED, f"error applying policy: {exc}")
        return
    if isinstance(outcome, LayerResult):
        report.record(outcome)
    elif summarize is not None:
        report.record(summarize(outcome))
    else:
        report.add(layer, LayerStatus.APPLIED)


def _run_secret_layer(
    report: PolicyReport,
    config: PolicyConfig,
    *,
    env: Optional[Mapping[str, str]],
    apply: bool,
    logger: Logger,
) -> None:
    """Invoke ``secrets.filtered_environ`` and (optionally) apply the result to
    ``os.environ``. Kept separate because its return type (a mapping) and its
    side-effect (replacing the process environment) differ from the other
    layers. Applying is gated by ``apply`` so tests can compute the filtered
    view without mutating their own environment."""
    module_basename, attr = LAYER_ENTRYPOINTS[LAYER_SECRETS]
    try:
        fn = _resolve(module_basename, attr)
    except (ImportError, AttributeError) as exc:
        report.add(
            LAYER_SECRETS, LayerStatus.FAILED,
            f"enforcement module {module_basename!r} not available yet: {exc}",
        )
        return
    try:
        filtered = fn(config, env)
    except NotImplementedError as exc:
        report.add(LAYER_SECRETS, LayerStatus.FAILED, f"not implemented yet: {exc}")
        return
    except Exception as exc:  # noqa: BLE001 — fail closed
        report.add(LAYER_SECRETS, LayerStatus.FAILED, f"error filtering secrets: {exc}")
        return
    if apply and env is None:
        # Only mutate the real process env when operating on it.
        os.environ.clear()
        os.environ.update(filtered)
    dropped = _count_dropped(env, filtered)
    report.add(
        LAYER_SECRETS, LayerStatus.APPLIED,
        f"{len(config.secret_scopes)} scope(s), {dropped} var(s) filtered out",
    )


def _count_dropped(
    env: Optional[Mapping[str, str]], filtered: Mapping[str, str]
) -> int:
    src = os.environ if env is None else env
    try:
        return max(0, len(src) - len(filtered))
    except TypeError:
        return 0


# ---------------------------------------------------------------------------
# verify_or_reapply — placeholder for the BOOT team.
# ---------------------------------------------------------------------------
def verify_or_reapply(
    config: PolicyConfig,
    report: PolicyReport,
    *,
    logger: Optional[Logger] = None,
) -> PolicyReport:
    """Re-check that previously applied layers are STILL in force, re-applying
    if a layer has drifted (e.g. the egress proxy thread died, proxy env vars
    were unset by the framework CLI, or a tmpfs was unmounted).

    Intended to be called periodically from the runtime loop (cheap liveness
    probe) so a long-running agent can't outlive its own sandbox. The BOOT team
    implements the actual re-verification per layer; this placeholder simply
    returns the report unchanged so the interface is importable and callable
    today.

    Returns a (possibly new) :class:`PolicyReport` reflecting the current state.
    """
    # TODO(boot): probe each applied layer (proxy socket reachable + env vars
    # still set, quota dir still mounted, secret filter still holds) and
    # re-invoke the owning entrypoint on drift, folding results in. Fail closed
    # on a layer that cannot be re-established.
    _ = (config, logger)
    return report


__all__ = [
    # config re-exports (single import site for teams)
    "PolicyConfig",
    "PolicyReport",
    "LayerResult",
    "LayerStatus",
    "FailMode",
    "HostMatcher",
    "PolicyConfigError",
    "normalize_host",
    "redact",
    "redact_value",
    "redact_mapping",
    "ENV_EGRESS_ALLOWLIST",
    "ENV_FS_QUOTA_MB",
    "ENV_SECRET_SCOPES",
    "ENV_TOOL_ALLOWLIST",
    "ENV_CONTAINER_POLICY_JSON",
    "ENV_CONTROL_PLANE_URL",
    "ENV_AGENT_MODEL",
    # layer interface contract
    "Logger",
    "EgressHandle",
    "StartEgressProxy",
    "Lockdown",
    "ApplyFsQuota",
    "FilteredEnviron",
    "LAYER_EGRESS",
    "LAYER_NETFILTER",
    "LAYER_FSQUOTA",
    "LAYER_SECRETS",
    "LAYER_ENTRYPOINTS",
    # orchestration
    "enforce_policy_from_env",
    "verify_or_reapply",
]
