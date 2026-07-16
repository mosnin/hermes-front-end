"""Agent-framework adapters — run OpenClaw, Goose, or any CLI agent as a
managed fleet member.

The control-plane protocol is framework-agnostic: an agent is anything that
can take an instruction and produce a result. This module turns third-party
agent frameworks into executors the runtime can drive:

    HERMES_AGENT_FRAMEWORK=goose      python -m connector.control_plane.agent_runtime
    HERMES_AGENT_FRAMEWORK=openclaw   ...
    HERMES_AGENT_FRAMEWORK=cli HERMES_AGENT_COMMAND='my-agent --task {instruction}' ...

Unset (or "hermes") keeps the built-in LLM runtime with MCP tool use.

Adapters shell out to the framework's CLI with the instruction and return its
stdout. Override any adapter's command with HERMES_AGENT_COMMAND; the string
is split shell-style and `{instruction}` is replaced with the task text (or,
if no placeholder is present, the instruction is passed on stdin).
"""

from __future__ import annotations

import os
import shlex
import subprocess
from typing import Optional

DEFAULT_TIMEOUT = float(os.environ.get("HERMES_FRAMEWORK_TIMEOUT", "300"))

# Default invocations per framework. `{instruction}` is substituted; frameworks
# move fast, so every one of these can be overridden via HERMES_AGENT_COMMAND.
FRAMEWORK_COMMANDS: dict[str, str] = {
    # Block's Goose: headless one-shot run with the task as text.
    "goose": "goose run --no-session --quiet -t {instruction}",
    # OpenClaw: one-shot agent turn from the CLI.
    "openclaw": "openclaw run --print {instruction}",
    # Bare CLI adapter: HERMES_AGENT_COMMAND is required.
    "cli": "",
}


class CliExecutor:
    """Run a command-line agent for each instruction and capture its output."""

    def __init__(self, command: str, timeout: float = DEFAULT_TIMEOUT) -> None:
        if not command.strip():
            raise ValueError(
                "no command configured — set HERMES_AGENT_COMMAND "
                "(use {instruction} where the task text goes)"
            )
        self.command = command
        self.timeout = timeout

    def run(self, instruction: str) -> str:
        parts = shlex.split(self.command)
        uses_placeholder = any("{instruction}" in p for p in parts)
        argv = [p.replace("{instruction}", instruction) for p in parts]
        try:
            proc = subprocess.run(
                argv,
                input=None if uses_placeholder else instruction,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
        except FileNotFoundError:
            return f"error: framework binary not found: {argv[0]!r} — is it installed and on PATH?"
        except subprocess.TimeoutExpired:
            return f"error: framework timed out after {self.timeout:.0f}s"
        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        if proc.returncode != 0:
            detail = err or out or f"exit code {proc.returncode}"
            return f"error: framework failed: {detail[:1500]}"
        return out or err or "(no output)"


def build_executor(
    framework: Optional[str] = None,
    command: Optional[str] = None,
) -> Optional[CliExecutor]:
    """Build the executor for the configured framework, or None for the
    built-in Hermes runtime. Raises ValueError on an unknown framework or a
    bare `cli` with no command."""
    fw = (framework or os.environ.get("HERMES_AGENT_FRAMEWORK", "hermes")).strip().lower()
    if fw in ("", "hermes"):
        return None
    if fw not in FRAMEWORK_COMMANDS:
        known = ", ".join(sorted([*FRAMEWORK_COMMANDS, "hermes"]))
        raise ValueError(f"unknown framework {fw!r} — supported: {known}")
    cmd = command or os.environ.get("HERMES_AGENT_COMMAND") or FRAMEWORK_COMMANDS[fw]
    return CliExecutor(cmd)


def framework_name() -> str:
    """The configured framework name ("hermes" when unset)."""
    return (os.environ.get("HERMES_AGENT_FRAMEWORK", "hermes")).strip().lower() or "hermes"
