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
from .mcp_client import McpClient, connect_all

DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

# Max tool-use round-trips per task. Ongoing outreach chains (contact lookup →
# email → chat → calendar) need several hops; cap it so a confused agent can't
# spin forever.
MAX_TOOL_ITERS = 8


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


def _stringify_tool_result(result: dict) -> str:
    """Render an MCP tools/call result (or error) as readable text.

    MCP results carry a `content` list of {type, text|...} blocks; we pull out
    the text blocks. Falls back to compact JSON for anything else.
    """
    if not isinstance(result, dict):
        return str(result)
    if "error" in result:
        err = result["error"]
        msg = err.get("message") if isinstance(err, dict) else err
        return f"error: {msg}"
    content = result.get("content")
    if isinstance(content, list):
        texts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
        joined = "\n".join(t for t in texts if t)
        if joined:
            return joined
    try:
        return json.dumps(result, ensure_ascii=False)[:2000]
    except (TypeError, ValueError):
        return str(result)


class AgentRuntime:
    def __init__(self, client: ControlPlaneClient) -> None:
        self.client = client
        self.system = os.environ.get("HERMES_AGENT_SYSTEM_PROMPT", "")
        # MCP wiring (populated by _load_mcp on startup; empty if none assigned).
        self.mcp_clients: dict[str, McpClient] = {}
        # tool_name -> (McpClient, tool_dict{name, description, inputSchema})
        self.mcp_tools: dict[str, tuple[McpClient, dict]] = {}

    # -- MCP --------------------------------------------------------------
    def _load_mcp(self) -> None:
        """Fetch the MCP servers assigned to this agent and register their tools.

        The control plane exposes a `/connector/mcp` endpoint surfaced as
        ControlPlaneClient.list_mcp(). That method may not exist yet (older
        client) — guard with hasattr + try/except so the runtime still works.
        Returned servers are expected as a list of
        {name, url, authHeader?, transport?}.
        """
        servers: list = []
        if hasattr(self.client, "list_mcp"):
            try:
                servers = self.client.list_mcp() or []
            except Exception as e:  # noqa: BLE001 — endpoint missing / offline
                print(f"[runtime] list_mcp failed: {e}")
                servers = []
        if not servers:
            print("[runtime] no MCP servers assigned")
            return
        try:
            self.mcp_clients, self.mcp_tools = connect_all(servers)
        except Exception as e:  # noqa: BLE001 — never let MCP break startup
            print(f"[runtime] MCP connect failed: {e}")
            return
        if self.mcp_tools:
            print(f"[runtime] MCP tools available: {', '.join(sorted(self.mcp_tools))}")

    def _mcp_tool_summary(self) -> str:
        """One-line-per-tool summary for the LLM prompt context."""
        lines = []
        for name, (_client, tool) in sorted(self.mcp_tools.items()):
            desc = (tool.get("description") or "").strip().replace("\n", " ")
            lines.append(f"- {name}: {desc[:160]}" if desc else f"- {name}")
        return "\n".join(lines)

    def maybe_use_tools(self, instruction: str) -> str:
        """v1 heuristic: if a connected MCP tool name appears in the instruction,
        call it and return a formatted result block to append to the reply.

        This is intentionally naive: we do a substring match of each tool name
        against the instruction, then best-effort build arguments by mapping the
        tool's top-level inputSchema property names onto words in the
        instruction. Returns "" when nothing matched or no tools are connected.
        Always defensive — never raises.
        """
        if not self.mcp_tools or not instruction:
            return ""
        text = instruction.lower()
        blocks: list[str] = []
        for name, (client, tool) in self.mcp_tools.items():
            if name.lower() not in text:
                continue
            args = self._guess_arguments(tool, instruction)
            print(f"[runtime] MCP call: {name}({args})")
            try:
                result = client.call_tool(name, args)
            except Exception as e:  # noqa: BLE001 — defensive, call_tool shouldn't raise
                result = {"error": {"message": str(e)}}
            blocks.append(f"[tool {name} result]\n{_stringify_tool_result(result)[:1500]}")
        return ("\n\n".join(blocks)) if blocks else ""

    @staticmethod
    def _guess_arguments(tool: dict, instruction: str) -> dict:
        """Best-effort v1 argument extraction from a free-text instruction.

        We look at the tool's JSON-schema properties. If there is a single
        string-ish property (or a 'query'/'q'/'input'/'text' one), we pass the
        whole instruction as its value. Otherwise we return {} and let the MCP
        server apply its own defaults / report a validation error.
        """
        schema = tool.get("inputSchema") or {}
        props = schema.get("properties") if isinstance(schema, dict) else None
        if not isinstance(props, dict) or not props:
            return {}
        for key in ("query", "q", "input", "text", "message", "prompt"):
            if key in props:
                return {key: instruction}
        # Single property: hand it the instruction as a reasonable default.
        if len(props) == 1:
            (only_key,) = props.keys()
            return {only_key: instruction}
        return {}

    # -- agentic tool-use loop -------------------------------------------
    def _anthropic_tools(self) -> list[dict]:
        """Expose connected MCP tools in Anthropic tool-use schema."""
        tools = []
        for name, (_client, tool) in sorted(self.mcp_tools.items()):
            schema = tool.get("inputSchema") or {"type": "object", "properties": {}}
            tools.append(
                {
                    "name": name,
                    "description": (tool.get("description") or name)[:1000],
                    "input_schema": schema,
                }
            )
        return tools

    def _execute_tool(self, name: str, args: dict) -> str:
        """Run one MCP tool call and return its result as text."""
        entry = self.mcp_tools.get(name)
        if not entry:
            return f"error: no such tool '{name}'"
        client, _tool = entry
        print(f"[runtime] tool call: {name}({args})")
        try:
            result = client.call_tool(name, args or {})
        except Exception as e:  # noqa: BLE001 — never let a tool crash the loop
            return f"error: {e}"
        return _stringify_tool_result(result)[:4000]

    def run_agentic(self, prompt: str, system: str = "") -> str:
        """Multi-step reasoning + tool use. When an Anthropic key and MCP tools
        are both available, run a real tool-use loop so the agent can chain
        several tools (e.g. look up a contact, send an email, check for a reply,
        book a meeting) before answering. Otherwise fall back to a single LLM
        call plus the naive heuristic tool pass — so the runtime still works with
        no key or with OpenAI configured.
        """
        anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
        if not (anthropic_key and self.mcp_tools):
            out = llm_respond(self._augment(prompt), system)
            tool_out = self.maybe_use_tools(prompt)
            return f"{out}\n\n{tool_out}" if tool_out else out

        model = os.environ.get("HERMES_AGENT_MODEL", "").strip() or DEFAULT_ANTHROPIC_MODEL
        tools = self._anthropic_tools()
        messages: list[dict] = [{"role": "user", "content": self._augment(prompt)}]
        for _ in range(MAX_TOOL_ITERS):
            try:
                data = _http_json(
                    "https://api.anthropic.com/v1/messages",
                    {
                        "x-api-key": anthropic_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    {
                        "model": model,
                        "max_tokens": 1024,
                        "system": system or "You are a capable autonomous outreach agent. Use the available tools to complete ongoing jobs end to end.",
                        "tools": tools,
                        "messages": messages,
                    },
                )
            except (urllib.error.HTTPError, urllib.error.URLError, KeyError, ValueError) as e:
                return f"(LLM error: {e})"

            content = data.get("content", [])
            messages.append({"role": "assistant", "content": content})
            if data.get("stop_reason") != "tool_use":
                return "".join(b.get("text", "") for b in content if b.get("type") == "text") or "(done)"

            # Execute every requested tool and feed the results back.
            tool_results = []
            for block in content:
                if block.get("type") != "tool_use":
                    continue
                result_text = self._execute_tool(block.get("name", ""), block.get("input", {}))
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.get("id"),
                        "content": result_text,
                    }
                )
            messages.append({"role": "user", "content": tool_results})
        return "(reached tool-iteration limit)"

    def _augment(self, prompt: str) -> str:
        """Pull relevant Space/company memory (RAG) to ground the response,
        and tell the LLM which MCP tools it has at its disposal."""
        try:
            memories = self.client.context_search(prompt, limit=4)
        except Exception:  # noqa: BLE001
            memories = []
        parts: list[str] = []
        if memories:
            context = "\n".join(
                f"- {m.get('title')}: {m.get('content', '')[:300]}" for m in memories
            )
            parts.append(f"Relevant context:\n{context}")
        if self.mcp_tools:
            parts.append(f"Available tools (via MCP):\n{self._mcp_tool_summary()}")
        if not parts:
            return prompt
        return "\n\n".join(parts) + f"\n\nTask: {prompt}"

    def _handle_step(self, step: dict) -> None:
        """Execute one dispatched workflow step and report the result."""
        print(f"[runtime] workflow step: {step['name']}")
        self.client.activity("tool_call", f"thinking: {step['name']}")
        instruction = step["instruction"]
        # Real multi-step tool use when tools are connected; single call otherwise.
        out = self.run_agentic(instruction, self.system)
        self.client.workflow_result(step["runId"], step["stepId"], ok=True, output=out[:4000])

    def _handle_message(self, msg: dict) -> None:
        """Reply to one inbound A2A message."""
        sender = msg.get("from", {})
        print(f"[runtime] A2A from {sender.get('name')}: {msg['content'][:60]}")
        reply = self.run_agentic(msg["content"], self.system)
        try:
            self.client.a2a_send(to=sender.get("id", ""), content=reply[:4000])
        except Exception as e:  # noqa: BLE001
            print(f"[runtime] reply failed: {e}")

    def _dispatch(self, payload: dict) -> None:
        """Handle a pushed {steps, messages} batch from the work stream."""
        for step in payload.get("steps", []):
            self._handle_step(step)
        for msg in payload.get("messages", []):
            self._handle_message(msg)

    def _poll_once(self) -> None:
        """Legacy fallback: one round of pull-by-polling (older deployments)."""
        for step in self.client.workflow_inbox():
            self._handle_step(step)
        for msg in self.client.a2a_inbox():
            self._handle_message(msg)

    def run(self) -> None:
        caps = ["chat", "workflow", "rag"]
        info = self.client.register(platform_name="runtime", capabilities=caps)
        print(f"[runtime] registered as {info.get('name')} ({info.get('agentId')})")

        # Connect to the MCP servers assigned to this agent (best-effort).
        self._load_mcp()
        if self.mcp_tools:
            caps.append("mcp")

        # Real-time transport: hold one long-poll connection and process work as
        # it's pushed. The server refreshes the heartbeat for us. If the endpoint
        # is unavailable (older deployment), fall back to the 2s polling loop.
        use_stream = True
        last_heartbeat = 0.0
        while True:
            if use_stream:
                try:
                    connected = self.client.pull_work(self._dispatch)
                except Exception as e:  # noqa: BLE001 — reconnect on any error
                    print(f"[runtime] stream error, retrying: {e}")
                    connected = True
                if not connected:
                    print("[runtime] /connector/pull unavailable — polling instead")
                    use_stream = False
                continue

            # Fallback polling path (with its own heartbeat).
            now = time.time()
            if now - last_heartbeat > 30:
                self.client.heartbeat()
                last_heartbeat = now
            self._poll_once()
            time.sleep(2.0)


def main() -> None:
    client = ControlPlaneClient()
    AgentRuntime(client).run()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[runtime] stopped")
