"""Real agent runtime — connects an actual LLM-backed agent to the control plane.

Unlike mock_agent.py (which emits fake activity), this registers a real agent
and does real work: it pulls dispatched workflow steps and inbound A2A messages,
generates responses with an LLM (augmented with retrieved memory), and relays
the results back to the control plane.

Run on the machine where the agent should live (AWS, a VM, your laptop):

    export HERMES_CONTROL_PLANE_URL=https://<deployment>.convex.site
    export HERMES_CONNECTOR_TOKEN=<token from the UI>
    # one of these enables real responses (else it echoes):
    export ANTHROPIC_API_KEY=sk-ant-...      # uses HERMES_AGENT_MODEL or a default
    export OPENAI_API_KEY=sk-...
    python -m connector.control_plane.agent_runtime
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

from .client import ControlPlaneClient

DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"


def _http_json(url: str, headers: dict[str, str], payload: dict) -> dict:
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def llm_respond(prompt: str, system: str = "") -> str:
    """Generate a response using whatever LLM is configured. Falls back to echo."""
    model = os.environ.get("HERMES_AGENT_MODEL", "").strip()
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    try:
        if anthropic_key:
            data = _http_json(
                "https://api.anthropic.com/v1/messages",
                {
                    "x-api-key": anthropic_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                {
                    "model": model or DEFAULT_ANTHROPIC_MODEL,
                    "max_tokens": 1024,
                    "system": system or "You are a capable autonomous agent.",
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            return "".join(b.get("text", "") for b in data.get("content", [])) or "(no output)"
        if openai_key:
            data = _http_json(
                "https://api.openai.com/v1/chat/completions",
                {"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
                {
                    "model": model or DEFAULT_OPENAI_MODEL,
                    "messages": [
                        {"role": "system", "content": system or "You are a capable autonomous agent."},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            return data["choices"][0]["message"]["content"]
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError, ValueError) as e:
        return f"(LLM error: {e}) — echo: {prompt}"

    # No LLM configured: try the full Hermes agent, else echo.
    try:
        from run_agent import AIAgent  # type: ignore  # noqa: PLC0415

        agent = AIAgent(model=model or None, platform="control-plane")
        return str(agent.run(prompt))  # integration point for the full agent
    except Exception:  # noqa: BLE001 — agent not installed / different API
        return f"(echo) {prompt}"


class AgentRuntime:
    def __init__(self, client: ControlPlaneClient) -> None:
        self.client = client
        self.system = os.environ.get("HERMES_AGENT_SYSTEM_PROMPT", "")

    def _augment(self, prompt: str) -> str:
        """Pull relevant Space/company memory (RAG) to ground the response."""
        try:
            memories = self.client.context_search(prompt, limit=4)
        except Exception:  # noqa: BLE001
            memories = []
        if not memories:
            return prompt
        context = "\n".join(f"- {m.get('title')}: {m.get('content', '')[:300]}" for m in memories)
        return f"Relevant context:\n{context}\n\nTask: {prompt}"

    def run(self) -> None:
        caps = ["chat", "workflow", "rag"]
        info = self.client.register(platform_name="runtime", capabilities=caps)
        print(f"[runtime] registered as {info.get('name')} ({info.get('agentId')})")

        last_heartbeat = 0.0
        while True:
            now = time.time()
            if now - last_heartbeat > 30:
                self.client.heartbeat()
                last_heartbeat = now

            # 1. Execute dispatched workflow steps.
            for step in self.client.workflow_inbox():
                print(f"[runtime] workflow step: {step['name']}")
                self.client.activity("tool_call", f"thinking: {step['name']}")
                out = llm_respond(self._augment(step["instruction"]), self.system)
                self.client.workflow_result(step["runId"], step["stepId"], ok=True, output=out[:4000])

            # 2. Reply to inbound A2A messages.
            for msg in self.client.a2a_inbox():
                sender = msg.get("from", {})
                print(f"[runtime] A2A from {sender.get('name')}: {msg['content'][:60]}")
                reply = llm_respond(self._augment(msg["content"]), self.system)
                try:
                    self.client.a2a_send(to=sender.get("id", ""), content=reply[:4000])
                except Exception as e:  # noqa: BLE001
                    print(f"[runtime] reply failed: {e}")

            time.sleep(2.0)


def main() -> None:
    client = ControlPlaneClient()
    AgentRuntime(client).run()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[runtime] stopped")
