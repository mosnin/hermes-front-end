"""HERMES_SECRET_SCOPES enforcement — env secret-scope filter.

Implements :class:`connector.control_plane.policy.FilteredEnviron`:

    filtered_environ(config: PolicyConfig, env=None) -> dict[str, str]

Scope taxonomy
--------------
Only *secret-shaped* env vars (matched by name, see :func:`is_secret_shaped`)
are ever candidates for removal — ordinary runtime/config vars (``PATH``,
``HOME``, ``HERMES_AGENT_MODEL``, proxy vars the egress layer exports, ...)
always pass through untouched. Each secret-shaped var is classified into
exactly one scope by :func:`classify_scope`:

    "model"          model-provider API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY,
                     GOOGLE_API_KEY, MISTRAL_API_KEY, ...).
    "integrations"   third-party/Composio-style integration credentials
                     (COMPOSIO_API_KEY, GITHUB_TOKEN, SLACK_*, HERMES_A2A_*, ...)
                     — also the default bucket for any secret-shaped var this
                     module doesn't specifically recognize, so an unknown
                     secret is deny-by-default rather than silently kept.
    "control-plane"  HERMES_CONTROL_PLANE_URL / HERMES_CONNECTOR_TOKEN — the
                     connector cannot function at all without these, so they
                     are ALWAYS kept regardless of ``HERMES_SECRET_SCOPES``.

``HERMES_SECRET_SCOPES`` also accepts the sentinel ``"all"`` / ``"*"`` meaning
"no restriction, keep every secret" — an explicit operator opt-out, not the
absence of a policy (absence is handled by ``config.has_secret_policy``).

Fail-closed behavior
---------------------
* Env var unset/empty -> ``config.has_secret_policy`` is False -> this module
  returns the environment unchanged (no restriction is a valid, explicit
  state; that's ``config.py``'s job to encode, not this module's).
* Env var set but every token is unrecognized (not in the known taxonomy) ->
  **malformed**: keep ONLY the always-required vars and drop everything else,
  including secrets we cannot safely classify. Logged loudly.
* Any unexpected exception while filtering -> same fail-closed fallback
  (only always-required vars survive) rather than propagating a filtered
  dict that might accidentally be "everything".

Never mutates ``os.environ`` in place — always returns a new dict. The
orchestrator (``policy/__init__.py``) decides whether/how to apply it to the
live process environment.

Pure standard library.
"""

from __future__ import annotations

import os
import sys
from typing import Callable, Mapping, Optional

from .config import PolicyConfig

Logger = Callable[[str], None]

_LOG_PREFIX = "[policy][secrets]"


def _default_logger(line: str) -> None:
    print(line, file=sys.stderr)


# ---------------------------------------------------------------------------
# Scope taxonomy
# ---------------------------------------------------------------------------
SCOPE_MODEL = "model"
SCOPE_INTEGRATIONS = "integrations"
SCOPE_CONTROL_PLANE = "control-plane"
SCOPE_ALL = "all"
SCOPE_WILDCARD = "*"

#: Scope tokens ``HERMES_SECRET_SCOPES`` may legally contain. Anything outside
#: this set makes the whole value malformed (fail closed), since an operator
#: typo'd scope name silently granting nothing (or worse, being ignored and
#: granting everything) is exactly the failure mode we must not have.
KNOWN_SCOPES = frozenset(
    {SCOPE_MODEL, SCOPE_INTEGRATIONS, SCOPE_CONTROL_PLANE, SCOPE_ALL, SCOPE_WILDCARD}
)

#: Vars that must survive filtering under every scope configuration — runtime
#: plumbing the connector itself needs to keep functioning, not "secrets" an
#: operator is trying to scope away. Includes the policy env vars themselves
#: (so a re-exec/child process can still see the profile) and the egress
#: proxy vars the egress layer exports into os.environ.
ALWAYS_KEEP_VARS = frozenset(
    {
        "HERMES_CONTROL_PLANE_URL",
        "HERMES_CONNECTOR_TOKEN",
        "HERMES_AGENT_MODEL",
        "HERMES_AGENT_FRAMEWORK",
        "HERMES_AGENT_WORKDIR",
        "HERMES_EGRESS_ALLOWLIST",
        "HERMES_FS_QUOTA_MB",
        "HERMES_SECRET_SCOPES",
        "HERMES_TOOL_ALLOWLIST",
        "HERMES_CONTAINER_POLICY_JSON",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "http_proxy",
        "https_proxy",
        "NO_PROXY",
        "no_proxy",
        "PATH",
        "HOME",
        "LANG",
        "LC_ALL",
        "PYTHONPATH",
        "PYTHONUNBUFFERED",
        "PYTHONDONTWRITEBYTECODE",
        "PYTHONIOENCODING",
        "HOSTNAME",
        "TERM",
        "TZ",
        "SHELL",
        "PWD",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "REQUESTS_CA_BUNDLE",
    }
)

# Substrings that mark an env var name as "secret-shaped". Matched
# case-insensitively; only vars matching one of these are ever candidates for
# removal — everything else passes through regardless of scope.
_SECRET_HINTS = ("_KEY", "_TOKEN", "_SECRET", "_PASSWORD", "_PASSWD", "_CREDENTIAL", "_CRED", "_AUTH")

# Exact names known to be model-provider credentials.
_MODEL_VAR_NAMES = frozenset(
    {
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_KEY",
        "MISTRAL_API_KEY",
        "COHERE_API_KEY",
        "OPENROUTER_API_KEY",
        "GROQ_API_KEY",
        "TOGETHER_API_KEY",
        "PERPLEXITY_API_KEY",
        "XAI_API_KEY",
        "DEEPSEEK_API_KEY",
        "HUGGINGFACE_API_KEY",
        "HF_TOKEN",
        "VERTEX_API_KEY",
        "BEDROCK_API_KEY",
    }
)

# Name prefixes that route a secret-shaped var to the "model" scope even if
# not in the exact-name set above (e.g. a future FOO_API_KEY variant).
_MODEL_PREFIX_HINTS = (
    "ANTHROPIC_",
    "OPENAI_",
    "AZURE_OPENAI_",
    "GOOGLE_",
    "GEMINI_",
    "MISTRAL_",
    "COHERE_",
    "OPENROUTER_",
    "GROQ_",
    "TOGETHER_",
    "PERPLEXITY_",
    "XAI_",
    "DEEPSEEK_",
    "VERTEX_",
    "BEDROCK_",
)

# Name prefixes that route a secret-shaped var to the "integrations" scope.
# (Not exhaustive — anything secret-shaped and unmatched falls into this same
# bucket by default; this list just documents the common, expected cases.)
_INTEGRATION_PREFIX_HINTS = (
    "COMPOSIO_",
    "GITHUB_",
    "GH_",
    "SLACK_",
    "HERMES_A2A_",
    "NOTION_",
    "LINEAR_",
    "JIRA_",
    "STRIPE_",
    "TWILIO_",
    "SENDGRID_",
    "AWS_",
    "GCP_",
    "GOOGLE_CLOUD_",
    "SUPABASE_",
    "DISCORD_",
    "TELEGRAM_",
)


def is_secret_shaped(name: str) -> bool:
    """True if *name* looks like it carries a credential, by naming convention."""
    n = name.upper()
    return any(hint in n for hint in _SECRET_HINTS)


def classify_scope(name: str) -> str:
    """Best-effort scope classification for a secret-shaped env var name.

    Unrecognized secret-shaped vars are classified ``"integrations"`` — a
    deny-by-default bucket — never silently treated as always-kept or as
    belonging to the (usually more narrowly granted) ``"model"`` scope.
    """
    n = name.upper()
    if n in ("HERMES_CONTROL_PLANE_URL", "HERMES_CONNECTOR_TOKEN"):
        return SCOPE_CONTROL_PLANE
    if n in _MODEL_VAR_NAMES or n.startswith(_MODEL_PREFIX_HINTS):
        return SCOPE_MODEL
    if n.startswith(_INTEGRATION_PREFIX_HINTS):
        return SCOPE_INTEGRATIONS
    return SCOPE_INTEGRATIONS


def _normalize_scopes(raw_scopes: "tuple[str, ...]") -> set[str]:
    return {s.strip().lower() for s in raw_scopes if s and s.strip()}


def _always_keep_subset(base: Mapping[str, str]) -> dict[str, str]:
    return {k: v for k, v in base.items() if k in ALWAYS_KEEP_VARS}


def filtered_environ(
    config: PolicyConfig,
    env: Optional[Mapping[str, str]] = None,
    *,
    logger: Optional[Logger] = None,
) -> dict[str, str]:
    """Return a NEW environment mapping with unscoped secrets dropped.

    Never mutates ``env``/``os.environ``. See module docstring for the full
    fail-closed contract; summary:

      * no secret policy set        -> ``env`` (or ``os.environ``) unchanged
      * scopes include "all"/"*"    -> unchanged, but still exercises the
                                        classification path (so a bad name in
                                        the taxonomy would still be visible)
      * every scope token unknown   -> ONLY :data:`ALWAYS_KEEP_VARS` survive
      * otherwise                   -> secret-shaped vars kept iff their
                                        scope is in ``config.secret_scopes``
                                        (or always-required)
    """
    log: Logger = logger or _default_logger
    base: dict[str, str] = dict(os.environ if env is None else env)

    if not config.has_secret_policy:
        return base

    scopes = _normalize_scopes(config.secret_scopes)
    unknown = scopes - KNOWN_SCOPES

    if not scopes or unknown:
        bad = sorted(unknown) if unknown else ["<empty>"]
        log(
            f"{_LOG_PREFIX} malformed HERMES_SECRET_SCOPES (unrecognized: {bad}) — "
            "fail closed: keeping only always-required vars, dropping everything else"
        )
        return _always_keep_subset(base)

    allow_all = SCOPE_ALL in scopes or SCOPE_WILDCARD in scopes

    try:
        out: dict[str, str] = {}
        dropped: list[str] = []
        for k, v in base.items():
            if k in ALWAYS_KEEP_VARS:
                out[k] = v
                continue
            if not is_secret_shaped(k):
                out[k] = v
                continue
            scope = classify_scope(k)
            if scope == SCOPE_CONTROL_PLANE or allow_all or scope in scopes:
                out[k] = v
            else:
                dropped.append(k)
        if dropped:
            log(f"{_LOG_PREFIX} dropped {len(dropped)} unscoped secret(s): {sorted(dropped)}")
        return out
    except Exception as exc:  # noqa: BLE001 — a filter bug must fail closed, not fail open
        log(f"{_LOG_PREFIX} error while filtering ({exc!r}) — fail closed to always-required vars")
        return _always_keep_subset(base)


# ---------------------------------------------------------------------------
# Redaction / diagnostics helpers for logs
# ---------------------------------------------------------------------------
def describe_filtering(base: Mapping[str, str], filtered: Mapping[str, str]) -> dict[str, object]:
    """A safe-to-log summary of what :func:`filtered_environ` did.

    Only var NAMES appear — never values — so this is safe to pass straight
    to a logger even though ``base``/``filtered`` themselves are not.
    """
    dropped_names = sorted(set(base) - set(filtered))
    kept_secret_names = sorted(
        k for k in filtered if is_secret_shaped(k) and k not in ALWAYS_KEEP_VARS
    )
    return {
        "total_vars_in": len(base),
        "total_vars_out": len(filtered),
        "dropped_count": len(dropped_names),
        "dropped_names": dropped_names,
        "kept_secret_names": kept_secret_names,
        "kept_secret_scopes": sorted({classify_scope(k) for k in kept_secret_names}),
    }


def redact_environ(env: Mapping[str, str]) -> dict[str, str]:
    """Mask the *values* of secret-shaped vars in *env* for safe logging.

    Non-secret-shaped vars pass through as-is; this is for diagnostics that
    print a whole environment snapshot, not for the actual filtering path.
    """
    return {k: ("***" if is_secret_shaped(k) else v) for k, v in env.items()}


def __self_check() -> None:
    """``python -m connector.control_plane.policy.secrets`` — manual smoke test."""
    sample_env = {
        "PATH": "/usr/bin",
        "HERMES_CONTROL_PLANE_URL": "https://example.convex.site",
        "HERMES_CONNECTOR_TOKEN": "tok-abc123",
        "ANTHROPIC_API_KEY": "sk-ant-should-be-kept-if-model-scope",
        "OPENAI_API_KEY": "sk-oai-should-be-kept-if-model-scope",
        "COMPOSIO_API_KEY": "cmp-should-be-kept-if-integrations-scope",
        "GITHUB_TOKEN": "ghp-should-be-kept-if-integrations-scope",
        "RANDOM_APP_SECRET": "s3cr3t-unclassified-defaults-to-integrations",
    }

    # 1) no policy -> unchanged
    cfg_none = PolicyConfig()
    out = filtered_environ(cfg_none, sample_env, logger=print)
    assert out == sample_env, "no-policy path must be a no-op"

    # 2) model-only scope -> keeps model + always-required, drops the rest
    cfg_model = PolicyConfig(secret_scopes=("model",))
    out = filtered_environ(cfg_model, sample_env, logger=print)
    assert "ANTHROPIC_API_KEY" in out and "OPENAI_API_KEY" in out
    assert "COMPOSIO_API_KEY" not in out and "GITHUB_TOKEN" not in out
    assert "RANDOM_APP_SECRET" not in out
    assert out["HERMES_CONNECTOR_TOKEN"] == sample_env["HERMES_CONNECTOR_TOKEN"]

    # 3) malformed scope -> only always-required survive
    cfg_bad = PolicyConfig(secret_scopes=("bogus-scope",))
    out = filtered_environ(cfg_bad, sample_env, logger=print)
    assert "ANTHROPIC_API_KEY" not in out
    assert out["HERMES_CONTROL_PLANE_URL"] == sample_env["HERMES_CONTROL_PLANE_URL"]
    assert out["PATH"] == sample_env["PATH"]

    # 4) wildcard -> everything kept
    cfg_all = PolicyConfig(secret_scopes=("*",))
    out = filtered_environ(cfg_all, sample_env, logger=print)
    assert out == sample_env

    print("describe_filtering:", describe_filtering(sample_env, filtered_environ(cfg_model, sample_env)))
    print("redact_environ sample:", redact_environ(sample_env))
    print("self-check OK")


if __name__ == "__main__":
    __self_check()
