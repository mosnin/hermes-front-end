"""Container security-policy configuration — parse + model, no enforcement.

This module is the *fixed data contract* every enforcement layer (egress
proxy, netfilter lockdown, fs quota, secret filter) and the boot orchestrator
build against. It parses the security-profile env vars the fleet worker
injects into every hosted agent container and exposes them as a single,
validated, immutable :class:`PolicyConfig`. It performs **no** enforcement and
opens **no** sockets — that lives in the per-layer modules the other teams own
(``egress.py``, ``netfilter.py``, ``fsquota.py``, ``secrets.py``).

Env-var contract (see docs/HARNESS_SPEC.md "Container policy (security
profiles, feature 17)"):

    HERMES_EGRESS_ALLOWLIST     csv of host globs      e.g. "*.github.com,pypi.org"
    HERMES_FS_QUOTA_MB          int (MB)               e.g. "512"
    HERMES_SECRET_SCOPES        csv of scope names     e.g. "github,slack"
    HERMES_TOOL_ALLOWLIST       csv of tool names      e.g. "search,send_email"
    HERMES_CONTAINER_POLICY_JSON  opaque JSON object   e.g. '{"failMode":"open"}'

Design rules baked in here:

* **Fail closed by default.** A policy that is *present* but cannot be applied
  must refuse to start the agent (``fail_mode == "closed"``). An operator can
  opt a profile into best-effort mode via
  ``HERMES_CONTAINER_POLICY_JSON={"failMode":"open"}`` — never via a code
  default.
* **Always-allow hosts are non-negotiable.** The control-plane host
  (``HERMES_CONTROL_PLANE_URL``) and the inferred model-API host(s) are always
  added to the egress allow set; without them the agent cannot register,
  heartbeat, stream work, or call its LLM. An empty ``HERMES_EGRESS_ALLOWLIST``
  means "no egress policy" (no restriction), *not* "deny all".
* **Malformed values fail closed, loudly.** A non-integer quota or invalid JSON
  raises :class:`PolicyConfigError` at parse time so boot aborts before the
  agent loop starts, rather than silently dropping the restriction.

Pure standard library, matching the rest of the connector.
"""

from __future__ import annotations

import dataclasses
import json
import os
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping, Optional
from urllib.parse import urlsplit

# ---------------------------------------------------------------------------
# Env var names (single source of truth — layers import these, never literals)
# ---------------------------------------------------------------------------
ENV_EGRESS_ALLOWLIST = "HERMES_EGRESS_ALLOWLIST"
ENV_FS_QUOTA_MB = "HERMES_FS_QUOTA_MB"
ENV_SECRET_SCOPES = "HERMES_SECRET_SCOPES"
ENV_TOOL_ALLOWLIST = "HERMES_TOOL_ALLOWLIST"
ENV_CONTAINER_POLICY_JSON = "HERMES_CONTAINER_POLICY_JSON"
ENV_CONTROL_PLANE_URL = "HERMES_CONTROL_PLANE_URL"
ENV_AGENT_MODEL = "HERMES_AGENT_MODEL"

# Hosts the built-in Hermes runtime dials directly for its LLM calls
# (agent_runtime.py hardcodes these). Inference keeps the egress allowlist from
# ever locking the agent out of its own model API.
_ANTHROPIC_HOST = "api.anthropic.com"
_OPENAI_HOST = "api.openai.com"

# Keys whose *values* must never be logged, wherever they appear in the opaque
# container-policy JSON. Matched case-insensitively as a substring.
_SENSITIVE_KEY_HINTS = ("secret", "token", "key", "password", "passwd", "cred", "auth")

_REDACTED = "***"


class PolicyConfigError(ValueError):
    """A security policy env var was present but malformed.

    Raised at parse time (``PolicyConfig.from_env``) so a broken policy aborts
    boot *before* the agent loop starts — never silently downgraded to "no
    restriction". This is the fail-closed contract at the config layer.
    """


class FailMode(str, Enum):
    """What to do when an enforcement layer cannot be applied.

    * ``CLOSED`` (default) — refuse to start the agent; the missing restriction
      is treated as a security failure.
    * ``OPEN`` — best effort; log the degradation and start anyway. Opt-in only,
      via ``HERMES_CONTAINER_POLICY_JSON={"failMode":"open"}``.
    """

    CLOSED = "closed"
    OPEN = "open"

    @classmethod
    def parse(cls, raw: Any) -> "FailMode":
        if raw is None:
            return cls.CLOSED
        val = str(raw).strip().lower()
        if val in ("", "closed", "close", "strict"):
            return cls.CLOSED
        if val in ("open", "best-effort", "best_effort", "advisory"):
            return cls.OPEN
        raise PolicyConfigError(
            f"invalid failMode {raw!r} in {ENV_CONTAINER_POLICY_JSON} "
            "(expected 'closed' or 'open')"
        )


class LayerStatus(str, Enum):
    """Outcome of one enforcement layer.

    * ``APPLIED``  — the restriction is fully in force.
    * ``DEGRADED`` — partially in force via a weaker mechanism (e.g. the egress
      proxy is up but kernel-level netfilter lockdown was unavailable). Not a
      failure: the primary control still holds.
    * ``SKIPPED``  — nothing to do (the corresponding policy field was unset).
    * ``FAILED``   — the restriction could not be established. In
      ``fail_mode == closed`` this makes the whole report not-ok and boot aborts.
    """

    APPLIED = "applied"
    DEGRADED = "degraded"
    SKIPPED = "skipped"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# Per-layer result / aggregate report
# ---------------------------------------------------------------------------
@dataclass
class LayerResult:
    """Result of applying (or attempting) one enforcement layer.

    The enforcement modules (``egress``/``netfilter``/``fsquota``/``secrets``)
    return one of these; the orchestrator folds them into a :class:`PolicyReport`.
    """

    layer: str
    status: LayerStatus
    message: str = ""
    detail: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def applied(cls, layer: str, message: str = "", **detail: Any) -> "LayerResult":
        return cls(layer, LayerStatus.APPLIED, message, dict(detail))

    @classmethod
    def degraded(cls, layer: str, message: str, **detail: Any) -> "LayerResult":
        return cls(layer, LayerStatus.DEGRADED, message, dict(detail))

    @classmethod
    def skipped(cls, layer: str, message: str = "", **detail: Any) -> "LayerResult":
        return cls(layer, LayerStatus.SKIPPED, message, dict(detail))

    @classmethod
    def failed(cls, layer: str, message: str, **detail: Any) -> "LayerResult":
        return cls(layer, LayerStatus.FAILED, message, dict(detail))


@dataclass
class PolicyReport:
    """Aggregate outcome of applying a :class:`PolicyConfig`.

    Built by ``enforce_policy_from_env``; consumed by the boot path to decide
    whether the agent loop may start. ``ok`` encodes the fail-closed contract:
    any ``FAILED`` layer makes it False unless ``fail_mode == OPEN``.
    """

    fail_mode: FailMode = FailMode.CLOSED
    layers: list[LayerResult] = field(default_factory=list)

    def record(self, result: LayerResult) -> LayerResult:
        """Append a layer result and return it (so callers can chain/inspect)."""
        self.layers.append(result)
        return result

    def add(
        self,
        layer: str,
        status: LayerStatus,
        message: str = "",
        **detail: Any,
    ) -> LayerResult:
        return self.record(LayerResult(layer, status, message, dict(detail)))

    @property
    def failed_layers(self) -> list[LayerResult]:
        return [r for r in self.layers if r.status is LayerStatus.FAILED]

    @property
    def degraded_layers(self) -> list[LayerResult]:
        return [r for r in self.layers if r.status is LayerStatus.DEGRADED]

    @property
    def ok(self) -> bool:
        """True when the agent loop is cleared to start.

        Fail-closed: any FAILED layer blocks boot. In OPEN mode a failure is
        downgraded to a warning and boot proceeds. DEGRADED never blocks.
        """
        if not self.failed_layers:
            return True
        return self.fail_mode is FailMode.OPEN

    def to_log_lines(self) -> list[str]:
        """Operator-facing, one line per layer, safe to print at boot."""
        lines = [
            f"[policy] {r.layer}: {r.status.value}" + (f" — {r.message}" if r.message else "")
            for r in self.layers
        ]
        if not self.ok:
            names = ", ".join(r.layer for r in self.failed_layers)
            lines.append(
                f"[policy] FAIL-CLOSED: refusing to start agent — layer(s) failed: {names}"
            )
        elif self.failed_layers:  # OPEN mode swallowed a real failure
            names = ", ".join(r.layer for r in self.failed_layers)
            lines.append(
                f"[policy] WARNING (failMode=open): started with failed layer(s): {names}"
            )
        return lines


# ---------------------------------------------------------------------------
# Host-glob matching (shared by the egress proxy and netfilter layers)
# ---------------------------------------------------------------------------
def normalize_host(host: str) -> str:
    """Lowercase, strip a trailing dot and any :port, for stable comparison."""
    h = (host or "").strip().lower()
    if not h:
        return ""
    # Strip a scheme if a full URL slipped in.
    if "://" in h:
        h = urlsplit(h).hostname or ""
    # Strip userinfo/port.
    if "@" in h:
        h = h.rsplit("@", 1)[-1]
    if h.startswith("[") and "]" in h:  # IPv6 literal
        return h[: h.index("]") + 1]
    if ":" in h:
        h = h.split(":", 1)[0]
    return h.rstrip(".")


def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Compile a host glob into an anchored regex.

    ``*`` matches one or more label characters but never a dot, so
    ``*.github.com`` matches ``api.github.com`` but not ``github.com`` and not
    ``evil.api.github.com.attacker.net``. A leading ``*.`` additionally matches
    the bare apex (``*.github.com`` also matches ``github.com``) — the common
    operator intent. A bare ``*`` matches any host (explicit allow-all).
    """
    pat = normalize_host(pattern)
    if pat == "*":
        return re.compile(r".*", re.IGNORECASE)
    apex_alt = ""
    if pat.startswith("*."):
        # Allow the apex too: "*.github.com" -> also match "github.com".
        apex = re.escape(pat[2:])
        apex_alt = f"|{apex}"
    parts = pat.split("*")
    rx = "[^.]+".join(re.escape(p) for p in parts)
    return re.compile(rf"(?:{rx}{apex_alt})\Z", re.IGNORECASE)


@dataclass(frozen=True)
class HostMatcher:
    """Immutable compiled matcher for a set of host globs.

    Built once from :attr:`PolicyConfig.effective_egress_hosts`; the egress
    proxy calls :meth:`allows` per CONNECT/request. Empty pattern set means
    "no egress policy" and :meth:`allows` returns True for everything — callers
    must gate on :attr:`PolicyConfig.has_egress_policy` first if they want
    deny-by-default semantics.
    """

    patterns: tuple[str, ...]
    _regexes: tuple[re.Pattern[str], ...] = field(default=(), compare=False, repr=False)

    @classmethod
    def build(cls, patterns: "tuple[str, ...] | list[str]") -> "HostMatcher":
        pats = tuple(p for p in (normalize_host(x) for x in patterns) if p)
        return cls(pats, tuple(_glob_to_regex(p) for p in pats))

    @property
    def is_empty(self) -> bool:
        return not self._regexes

    def allows(self, host: str) -> bool:
        """True if *host* matches any pattern (or the matcher is empty)."""
        if self.is_empty:
            return True
        h = normalize_host(host)
        if not h:
            return False
        return any(rx.match(h) for rx in self._regexes)


# ---------------------------------------------------------------------------
# The config object
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class PolicyConfig:
    """Immutable, parsed view of the container security policy.

    Construct via :meth:`from_env`. All fields are plain data; no enforcement
    happens here. Enforcement modules read these fields and act.

    Attributes:
        egress_allowlist: operator-supplied host globs (may be empty).
        always_allow_hosts: hosts the agent must always reach (control plane +
            model API); merged into :meth:`effective_egress_hosts`.
        fs_quota_mb: writable-fs quota in MB, or ``None`` if unset.
        secret_scopes: env-secret scope names the agent is allowed to see.
        tool_allowlist: tool names the agent may call (enforced server-side in
            Convex today; carried here for the container-side secret filter and
            observability).
        container_policy: parsed opaque JSON object (``{}`` if unset).
        fail_mode: CLOSED (default) or OPEN.
    """

    egress_allowlist: tuple[str, ...] = ()
    always_allow_hosts: tuple[str, ...] = ()
    fs_quota_mb: Optional[int] = None
    secret_scopes: tuple[str, ...] = ()
    tool_allowlist: tuple[str, ...] = ()
    container_policy: Mapping[str, Any] = field(default_factory=dict)
    fail_mode: FailMode = FailMode.CLOSED

    # -- feature predicates ------------------------------------------------
    @property
    def has_egress_policy(self) -> bool:
        """True when the operator restricted egress (a non-empty allowlist).

        Note: :attr:`always_allow_hosts` alone does NOT constitute a policy —
        those exist to keep an *active* policy from locking the agent out.
        """
        return bool(self.egress_allowlist)

    @property
    def has_fs_policy(self) -> bool:
        return self.fs_quota_mb is not None

    @property
    def has_secret_policy(self) -> bool:
        return bool(self.secret_scopes)

    @property
    def has_tool_policy(self) -> bool:
        return bool(self.tool_allowlist)

    @property
    def has_any_policy(self) -> bool:
        return (
            self.has_egress_policy
            or self.has_fs_policy
            or self.has_secret_policy
            or self.has_tool_policy
        )

    # -- derived egress view ----------------------------------------------
    def effective_egress_hosts(self) -> tuple[str, ...]:
        """The full allow set the egress proxy enforces: operator globs +
        always-allow hosts, de-duplicated, order-stable. Only meaningful when
        :attr:`has_egress_policy` is True (otherwise egress is unrestricted)."""
        seen: dict[str, None] = {}
        for h in (*self.egress_allowlist, *self.always_allow_hosts):
            nh = normalize_host(h) if "*" not in h else h.strip().lower()
            if nh and nh not in seen:
                seen[nh] = None
        return tuple(seen)

    def host_matcher(self) -> HostMatcher:
        """Compiled matcher over :meth:`effective_egress_hosts`."""
        return HostMatcher.build(self.effective_egress_hosts())

    def is_host_allowed(self, host: str) -> bool:
        """Convenience: True if egress to *host* is permitted under this policy.

        When there is no egress policy, everything is allowed. When there is,
        always-allow hosts and matching globs are allowed; everything else is
        denied (fail-closed at the request boundary)."""
        if not self.has_egress_policy:
            return True
        return self.host_matcher().allows(host)

    # -- parsing -----------------------------------------------------------
    @classmethod
    def from_env(cls, env: Optional[Mapping[str, str]] = None) -> "PolicyConfig":
        """Parse a policy from the environment.

        Absent/empty vars mean "no policy for that dimension" (no restriction);
        present-but-malformed vars raise :class:`PolicyConfigError` (fail closed
        at parse time). ``env`` defaults to ``os.environ`` and is never mutated.
        """
        e = os.environ if env is None else env

        container_policy = _parse_json_object(e.get(ENV_CONTAINER_POLICY_JSON))
        fail_mode = FailMode.parse(container_policy.get("failMode"))

        egress = _parse_csv(e.get(ENV_EGRESS_ALLOWLIST))
        secret_scopes = _parse_csv(e.get(ENV_SECRET_SCOPES))
        tool_allowlist = _parse_csv(e.get(ENV_TOOL_ALLOWLIST))
        fs_quota_mb = _parse_quota_mb(e.get(ENV_FS_QUOTA_MB))

        always_allow = _derive_always_allow(e, container_policy)

        return cls(
            egress_allowlist=egress,
            always_allow_hosts=always_allow,
            fs_quota_mb=fs_quota_mb,
            secret_scopes=secret_scopes,
            tool_allowlist=tool_allowlist,
            container_policy=container_policy,
            fail_mode=fail_mode,
        )

    # -- logging / redaction ----------------------------------------------
    def redact(self) -> dict[str, Any]:
        """A JSON-safe, secret-free summary of this policy, for boot logging.

        The parsed fields here (host globs, scope names, tool names, quota)
        are not themselves secrets, but the opaque ``container_policy`` JSON may
        carry credentials an operator stuffed in — those values are masked by
        key name. Never returns raw secret material.
        """
        return {
            "egress_allowlist": list(self.egress_allowlist),
            "always_allow_hosts": list(self.always_allow_hosts),
            "fs_quota_mb": self.fs_quota_mb,
            "secret_scopes": list(self.secret_scopes),
            "tool_allowlist": list(self.tool_allowlist),
            "fail_mode": self.fail_mode.value,
            "container_policy": redact_mapping(self.container_policy),
            "has_policy": {
                "egress": self.has_egress_policy,
                "fs": self.has_fs_policy,
                "secret": self.has_secret_policy,
                "tool": self.has_tool_policy,
            },
        }

    def summary_line(self) -> str:
        """One-line boot banner, e.g.
        ``[policy] egress=3 host(s) fs=512MB secrets=2 tools=5 failMode=closed``.
        """
        parts = []
        parts.append(
            f"egress={len(self.egress_allowlist)} host(s)"
            if self.has_egress_policy
            else "egress=off"
        )
        parts.append(f"fs={self.fs_quota_mb}MB" if self.has_fs_policy else "fs=off")
        parts.append(
            f"secrets={len(self.secret_scopes)}" if self.has_secret_policy else "secrets=off"
        )
        parts.append(
            f"tools={len(self.tool_allowlist)}" if self.has_tool_policy else "tools=off"
        )
        parts.append(f"failMode={self.fail_mode.value}")
        return "[policy] " + " ".join(parts)


# ---------------------------------------------------------------------------
# parsing helpers (module-level; layers may reuse)
# ---------------------------------------------------------------------------
def _parse_csv(raw: Optional[str]) -> tuple[str, ...]:
    """Split a comma-separated value, trimming blanks, order-stable + de-duped."""
    if not raw:
        return ()
    seen: dict[str, None] = {}
    for item in raw.split(","):
        v = item.strip()
        if v and v not in seen:
            seen[v] = None
    return tuple(seen)


def _parse_quota_mb(raw: Optional[str]) -> Optional[int]:
    """Parse an integer MB quota. Empty/unset => None (no fs policy).

    A present-but-non-integer or non-positive value fails closed."""
    if raw is None:
        return None
    s = raw.strip()
    if s == "":
        return None
    try:
        val = int(s, 10)
    except ValueError as exc:
        raise PolicyConfigError(
            f"invalid {ENV_FS_QUOTA_MB}={raw!r} — expected a positive integer (MB)"
        ) from exc
    if val <= 0:
        raise PolicyConfigError(
            f"invalid {ENV_FS_QUOTA_MB}={raw!r} — must be a positive integer (MB)"
        )
    return val


def _parse_json_object(raw: Optional[str]) -> dict[str, Any]:
    """Parse the opaque container-policy JSON. Empty/unset => {}.

    Present-but-invalid JSON, or valid JSON that isn't an object, fails closed."""
    if raw is None:
        return {}
    s = raw.strip()
    if s == "":
        return {}
    try:
        parsed = json.loads(s)
    except (ValueError, TypeError) as exc:
        raise PolicyConfigError(
            f"invalid {ENV_CONTAINER_POLICY_JSON} — not valid JSON: {exc}"
        ) from exc
    if not isinstance(parsed, dict):
        raise PolicyConfigError(
            f"invalid {ENV_CONTAINER_POLICY_JSON} — expected a JSON object, "
            f"got {type(parsed).__name__}"
        )
    return parsed


def _derive_always_allow(
    env: Mapping[str, str], container_policy: Mapping[str, Any]
) -> tuple[str, ...]:
    """Compute the hosts that must always be reachable regardless of the
    allowlist: the control-plane host and the inferred model-API host(s), plus
    any explicit ``alwaysAllow`` list in the opaque policy JSON.

    Without these, an active egress policy would sever the agent from the
    control plane or its LLM. Inference is conservative: if we cannot tell which
    model provider is in use, BOTH known model hosts are allowed so the agent
    can still function (the operator can tighten via the allowlist itself, which
    is additive, not subtractive, here)."""
    hosts: dict[str, None] = {}

    def add(h: Optional[str]) -> None:
        nh = normalize_host(h or "")
        if nh:
            hosts[nh] = None

    # Control plane (required for register/heartbeat/work stream/A2A).
    add(env.get(ENV_CONTROL_PLANE_URL))

    # Model API host inference (agent_runtime.py dials these directly).
    add_model = _infer_model_hosts(env)
    for h in add_model:
        add(h)

    # Operator-declared extra always-allow hosts from the opaque JSON.
    extra = container_policy.get("alwaysAllow")
    if isinstance(extra, str):
        for h in _parse_csv(extra):
            add(h)
    elif isinstance(extra, (list, tuple)):
        for h in extra:
            if isinstance(h, str):
                add(h)

    # An explicit model API base override, if a profile carries one.
    add(_host_of(container_policy.get("modelApiHost")))
    add(_host_of(container_policy.get("modelApiBaseUrl")))

    return tuple(hosts)


def _infer_model_hosts(env: Mapping[str, str]) -> tuple[str, ...]:
    """Best-effort guess at which model-API host(s) the agent will dial.

    Signals, in priority order: an explicit provider hint in HERMES_AGENT_MODEL,
    then which API key(s) are present. Falls back to allowing both known hosts
    so egress restriction never accidentally bricks the LLM call."""
    model = (env.get(ENV_AGENT_MODEL) or "").strip().lower()
    if model.startswith(("claude", "anthropic")):
        return (_ANTHROPIC_HOST,)
    if model.startswith(("gpt", "o1", "o3", "o4", "openai", "text-", "chatgpt")):
        return (_OPENAI_HOST,)

    have_anthropic = bool((env.get("ANTHROPIC_API_KEY") or "").strip())
    have_openai = bool((env.get("OPENAI_API_KEY") or "").strip())
    if have_anthropic and not have_openai:
        return (_ANTHROPIC_HOST,)
    if have_openai and not have_anthropic:
        return (_OPENAI_HOST,)

    # Ambiguous / no signal: allow both so the agent can always reach its model.
    return (_ANTHROPIC_HOST, _OPENAI_HOST)


def _host_of(value: Any) -> Optional[str]:
    """Extract a hostname from a URL-or-host string; None for anything else."""
    if not isinstance(value, str) or not value.strip():
        return None
    return normalize_host(value)


# ---------------------------------------------------------------------------
# Redaction helpers (importable; the secrets layer and loggers reuse these)
# ---------------------------------------------------------------------------
def _is_sensitive_key(key: str) -> bool:
    k = key.lower()
    return any(hint in k for hint in _SENSITIVE_KEY_HINTS)


def redact_value(value: Any) -> Any:
    """Mask a scalar that is assumed sensitive (keeps type-ish shape for logs)."""
    if value is None:
        return None
    return _REDACTED


def redact_mapping(obj: Any) -> Any:
    """Recursively copy *obj*, masking values under sensitive-looking keys.

    Safe to call on the opaque container-policy JSON before logging it. Lists
    and nested objects are walked; scalars under a sensitive key are replaced
    with ``"***"``."""
    if isinstance(obj, Mapping):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            if isinstance(k, str) and _is_sensitive_key(k):
                out[k] = _REDACTED
            else:
                out[k] = redact_mapping(v)
        return out
    if isinstance(obj, (list, tuple)):
        return [redact_mapping(v) for v in obj]
    return obj


def redact(obj: Any) -> Any:
    """Public redaction entrypoint.

    * A :class:`PolicyConfig` -> its :meth:`PolicyConfig.redact` summary dict.
    * A mapping -> a key-masked copy (:func:`redact_mapping`).
    * Anything else -> masked scalar (:func:`redact_value`).
    """
    if isinstance(obj, PolicyConfig):
        return obj.redact()
    if isinstance(obj, Mapping):
        return redact_mapping(obj)
    return redact_value(obj)


__all__ = [
    # env var names
    "ENV_EGRESS_ALLOWLIST",
    "ENV_FS_QUOTA_MB",
    "ENV_SECRET_SCOPES",
    "ENV_TOOL_ALLOWLIST",
    "ENV_CONTAINER_POLICY_JSON",
    "ENV_CONTROL_PLANE_URL",
    "ENV_AGENT_MODEL",
    # core types
    "PolicyConfig",
    "PolicyReport",
    "LayerResult",
    "LayerStatus",
    "FailMode",
    "HostMatcher",
    "PolicyConfigError",
    # helpers
    "normalize_host",
    "redact",
    "redact_value",
    "redact_mapping",
]
