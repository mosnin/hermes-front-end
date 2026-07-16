"""Mock connector — streams fake agent activity into the control plane.

Lets you see the dashboard come alive (agents online, threads, messages, tool
calls, live activity) without wiring a real Hermes agent yet. Register an agent
in the UI, grab its token, then:

    export HERMES_CONTROL_PLANE_URL=https://<deployment>.convex.site
    export HERMES_CONNECTOR_TOKEN=<token from the UI>
    python -m connector.control_plane.mock_agent
"""

from __future__ import annotations

import random
import time

from .client import ControlPlaneClient

THREADS = [
    ("research-1", "Competitor landscape report"),
    ("ops-1", "Nightly deploy + smoke tests"),
    ("support-1", "Summarize this week's tickets"),
]

TOOL_CALLS = [
    ("web.search", "query: agent orchestration platforms"),
    ("shell.run", "pytest -q tests/"),
    ("git.commit", "feat: add nightly research job"),
    ("memory.write", "stored: customer pricing tiers"),
    ("http.get", "GET https://api.example.com/status"),
]

ASSISTANT_LINES = [
    "Pulling the latest data now…",
    "Found 5 relevant sources, summarizing.",
    "Deploy succeeded; smoke tests green.",
    "Drafted the report — want me to publish it?",
    "Blocked on credentials for the staging env.",
]


def main() -> None:
    client = ControlPlaneClient()
    caps = ["web", "shell", "git", "memory", "summarize"]
    info = client.register(platform_name="mock", capabilities=caps)
    print(f"[mock] registered as {info.get('name')} ({info.get('agentId')})")

    last_heartbeat = 0.0
    while True:
        now = time.time()
        if now - last_heartbeat > 30:
            client.heartbeat()
            last_heartbeat = now

        # Execute any workflow steps the engine dispatched to us, then report.
        for step in client.workflow_inbox():
            print(f"[mock] workflow step: {step['name']}")
            time.sleep(random.uniform(0.5, 1.5))  # pretend to work
            client.workflow_result(
                step["runId"],
                step["stepId"],
                ok=True,
                output=f"Completed '{step['name']}'",
            )

        roll = random.random()
        key, title = random.choice(THREADS)
        if roll < 0.45:
            tool, detail = random.choice(TOOL_CALLS)
            client.activity("tool_call", tool, detail=detail, thread_key=key, thread_title=title)
            print(f"[mock] tool_call {tool}")
        elif roll < 0.8:
            line = random.choice(ASSISTANT_LINES)
            client.message(thread_key=key, thread_title=title, role="assistant", content=line)
            print(f"[mock] message: {line}")
        else:
            client.activity("status", "Thinking…", detail="reasoning over context", thread_key=key, thread_title=title)
            print("[mock] status")

        time.sleep(random.uniform(2.0, 5.0))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[mock] stopped")
