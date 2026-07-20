"""Tests for connector.control_plane.policy.secrets (HERMES_SECRET_SCOPES)."""

from __future__ import annotations

import os
import sys

from connector.control_plane.policy import PolicyConfig
from connector.control_plane.policy import secrets as secrets_mod

SAMPLE_ENV = {
    "PATH": "/usr/bin",
    "HOME": "/root",
    "HERMES_CONTROL_PLANE_URL": "https://example.convex.site",
    "HERMES_CONNECTOR_TOKEN": "tok-abc123",
    "ANTHROPIC_API_KEY": "sk-ant-secret",
    "OPENAI_API_KEY": "sk-oai-secret",
    "COMPOSIO_API_KEY": "cmp-secret",
    "GITHUB_TOKEN": "ghp-secret",
    "SLACK_BOT_TOKEN": "xoxb-secret",
    "SOME_RANDOM_APP_SECRET": "unclassified-secret",
}


def test_no_policy_is_noop():
    out = secrets_mod.filtered_environ(PolicyConfig(), SAMPLE_ENV)
    assert out == SAMPLE_ENV


def test_empty_env_unset_vars_still_noop_when_no_policy():
    out = secrets_mod.filtered_environ(PolicyConfig(), {})
    assert out == {}


def test_model_scope_keeps_model_vars_and_always_required_only():
    cfg = PolicyConfig(secret_scopes=("model",))
    out = secrets_mod.filtered_environ(cfg, SAMPLE_ENV)
    assert out["ANTHROPIC_API_KEY"] == SAMPLE_ENV["ANTHROPIC_API_KEY"]
    assert out["OPENAI_API_KEY"] == SAMPLE_ENV["OPENAI_API_KEY"]
    assert "COMPOSIO_API_KEY" not in out
    assert "GITHUB_TOKEN" not in out
    assert "SLACK_BOT_TOKEN" not in out
    assert "SOME_RANDOM_APP_SECRET" not in out
    # always-required survive regardless of scope
    assert out["HERMES_CONTROL_PLANE_URL"] == SAMPLE_ENV["HERMES_CONTROL_PLANE_URL"]
    assert out["HERMES_CONNECTOR_TOKEN"] == SAMPLE_ENV["HERMES_CONNECTOR_TOKEN"]
    assert out["PATH"] == SAMPLE_ENV["PATH"]


def test_integrations_scope_keeps_integration_vars_not_model():
    cfg = PolicyConfig(secret_scopes=("integrations",))
    out = secrets_mod.filtered_environ(cfg, SAMPLE_ENV)
    assert "ANTHROPIC_API_KEY" not in out
    assert "OPENAI_API_KEY" not in out
    assert out["COMPOSIO_API_KEY"] == SAMPLE_ENV["COMPOSIO_API_KEY"]
    assert out["GITHUB_TOKEN"] == SAMPLE_ENV["GITHUB_TOKEN"]
    assert out["SLACK_BOT_TOKEN"] == SAMPLE_ENV["SLACK_BOT_TOKEN"]
    # unrecognized secret defaults into the integrations bucket
    assert out["SOME_RANDOM_APP_SECRET"] == SAMPLE_ENV["SOME_RANDOM_APP_SECRET"]


def test_both_scopes_keeps_both_buckets():
    cfg = PolicyConfig(secret_scopes=("model", "integrations"))
    out = secrets_mod.filtered_environ(cfg, SAMPLE_ENV)
    assert "ANTHROPIC_API_KEY" in out
    assert "COMPOSIO_API_KEY" in out


def test_wildcard_and_all_keep_everything():
    for token in ("*", "all", "ALL"):
        cfg = PolicyConfig(secret_scopes=(token,))
        out = secrets_mod.filtered_environ(cfg, SAMPLE_ENV)
        assert out == SAMPLE_ENV, f"scope token {token!r} should keep everything"


def test_malformed_scope_fails_closed_to_always_required_only():
    logged = []
    cfg = PolicyConfig(secret_scopes=("not-a-real-scope",))
    out = secrets_mod.filtered_environ(cfg, SAMPLE_ENV, logger=logged.append)
    assert "ANTHROPIC_API_KEY" not in out
    assert "COMPOSIO_API_KEY" not in out
    assert out["HERMES_CONTROL_PLANE_URL"] == SAMPLE_ENV["HERMES_CONTROL_PLANE_URL"]
    assert out["HERMES_CONNECTOR_TOKEN"] == SAMPLE_ENV["HERMES_CONNECTOR_TOKEN"]
    assert out["PATH"] == SAMPLE_ENV["PATH"]
    assert any("malformed" in line for line in logged)


def test_mixed_known_and_unknown_scope_is_still_malformed():
    # A typo alongside a valid scope must not silently grant the valid one
    # and ignore the typo -- the whole value is untrustworthy.
    cfg = PolicyConfig(secret_scopes=("model", "modle"))
    out = secrets_mod.filtered_environ(cfg, SAMPLE_ENV)
    assert "ANTHROPIC_API_KEY" not in out
    assert out["HERMES_CONTROL_PLANE_URL"] == SAMPLE_ENV["HERMES_CONTROL_PLANE_URL"]


def test_never_mutates_input_mapping():
    original = dict(SAMPLE_ENV)
    cfg = PolicyConfig(secret_scopes=("model",))
    secrets_mod.filtered_environ(cfg, SAMPLE_ENV)
    assert SAMPLE_ENV == original


def test_is_secret_shaped_and_classify_scope():
    assert secrets_mod.is_secret_shaped("ANTHROPIC_API_KEY")
    assert secrets_mod.is_secret_shaped("HERMES_CONNECTOR_TOKEN")
    assert not secrets_mod.is_secret_shaped("PATH")
    assert not secrets_mod.is_secret_shaped("HERMES_AGENT_MODEL")
    assert secrets_mod.classify_scope("ANTHROPIC_API_KEY") == secrets_mod.SCOPE_MODEL
    assert secrets_mod.classify_scope("COMPOSIO_API_KEY") == secrets_mod.SCOPE_INTEGRATIONS
    assert secrets_mod.classify_scope("HERMES_CONNECTOR_TOKEN") == secrets_mod.SCOPE_CONTROL_PLANE
    assert secrets_mod.classify_scope("WHATEVER_UNKNOWN_TOKEN") == secrets_mod.SCOPE_INTEGRATIONS


def test_redact_environ_masks_only_secret_shaped_values():
    red = secrets_mod.redact_environ(SAMPLE_ENV)
    assert red["PATH"] == SAMPLE_ENV["PATH"]
    assert red["ANTHROPIC_API_KEY"] == "***"
    assert red["HERMES_CONNECTOR_TOKEN"] == "***"


def test_describe_filtering_never_leaks_values():
    cfg = PolicyConfig(secret_scopes=("model",))
    filtered = secrets_mod.filtered_environ(cfg, SAMPLE_ENV)
    desc = secrets_mod.describe_filtering(SAMPLE_ENV, filtered)
    dumped = repr(desc)
    for secret_val in ("sk-ant-secret", "sk-oai-secret", "cmp-secret", "xoxb-secret"):
        assert secret_val not in dumped
    assert "COMPOSIO_API_KEY" in desc["dropped_names"]
    assert "ANTHROPIC_API_KEY" in desc["kept_secret_names"]


def test_self_check_script_runs():
    import subprocess

    proc = subprocess.run(
        [sys.executable, "-m", "connector.control_plane.policy.secrets"],
        cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "self-check OK" in proc.stdout
