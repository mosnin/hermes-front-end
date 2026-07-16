"""Dependency-free MCP (Model Context Protocol) client for the Hermes connector.

A deployed agent is assigned a set of MCP servers (e.g. contact lookup,
AgentMail, MiniChat, Calendly) by the control plane. This module lets the agent
discover those servers' tools and call them at runtime.

Pure standard library (urllib + json) so it runs anywhere a Hermes agent runs,
matching the style of client.py. Everything here is best-effort: the MCP server
may be down, speak SSE, or return junk — we never raise out of these helpers,
we just return empty lists / error dicts and log with "[mcp] ...".

Transport: we speak MCP's JSON-RPC 2.0 over HTTP. For the "streamable HTTP" and
SSE transports the response to a POST is either a plain JSON body or an
"event-stream" whose payload lives on a `data:` line — we handle both.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional


class McpClient:
    """Minimal JSON-RPC 2.0 client for a single MCP server over HTTP/SSE."""

    def __init__(
        self,
        base_url: str,
        auth_header: Optional[str] = None,
        name: Optional[str] = None,
        timeout: float = 15.0,
    ) -> None:
        self.base_url = (base_url or "").rstrip("/")
        # auth_header is the full value, e.g. "Bearer xyz" — passed straight
        # through as the Authorization header when present.
        self.auth_header = auth_header
        self.name = name or self.base_url
        self.timeout = timeout
        self._id = 0

    # -- low-level ----------------------------------------------------------
    def _next_id(self) -> int:
        self._id += 1
        return self._id

    def _rpc(self, method: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        """POST a JSON-RPC 2.0 request and return the parsed envelope.

        Returns the full JSON-RPC response dict ({"result": ...} or
        {"error": ...}). On any transport/parse failure returns
        {"error": {"message": "..."}} so callers can stay simple.
        """
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params or {},
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(self.base_url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        # MCP streamable-HTTP servers want to know we can take either form.
        req.add_header("Accept", "application/json, text/event-stream")
        if self.auth_header:
            req.add_header("Authorization", self.auth_header)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8", "replace")
            return self._parse_body(body)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "replace")
            except Exception:  # noqa: BLE001
                pass
            print(f"[mcp] {self.name} {method} -> HTTP {e.code}: {detail[:200]}")
            return {"error": {"code": e.code, "message": detail or str(e)}}
        except (urllib.error.URLError, ValueError, OSError) as e:  # noqa: BLE001
            print(f"[mcp] {self.name} {method} failed: {e}")
            return {"error": {"message": str(e)}}

    @staticmethod
    def _parse_body(body: str) -> dict[str, Any]:
        """Parse a JSON or SSE (text/event-stream) response body.

        Plain JSON: just json.loads it. SSE: scan for `data:` lines and return
        the last one that parses as a JSON-RPC envelope (servers may send
        keep-alives / multiple events). Robust to garbage -> {"error": ...}.
        """
        body = (body or "").strip()
        if not body:
            return {"error": {"message": "empty response"}}
        # Fast path: a plain JSON object/array.
        if body[0] in "{[":
            try:
                return json.loads(body)
            except ValueError:
                pass  # might still be SSE with a leading brace; fall through
        # SSE: collect data: lines and keep the last JSON-RPC-looking one.
        result: Optional[dict[str, Any]] = None
        for line in body.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            chunk = line[5:].strip()
            if not chunk or chunk == "[DONE]":
                continue
            try:
                parsed = json.loads(chunk)
            except ValueError:
                continue
            if isinstance(parsed, dict) and ("result" in parsed or "error" in parsed):
                result = parsed
        if result is not None:
            return result
        return {"error": {"message": "could not parse MCP response"}}

    # -- high-level API -----------------------------------------------------
    def list_tools(self) -> list[dict[str, Any]]:
        """Return [{name, description, inputSchema}, ...] via tools/list.

        Best-effort: returns [] on any error so the runtime keeps working.
        """
        env = self._rpc("tools/list")
        if "error" in env:
            return []
        tools = (env.get("result") or {}).get("tools")
        if not isinstance(tools, list):
            return []
        # Normalise to the documented shape; tolerate missing keys.
        out: list[dict[str, Any]] = []
        for t in tools:
            if not isinstance(t, dict) or not t.get("name"):
                continue
            out.append(
                {
                    "name": t.get("name"),
                    "description": t.get("description", ""),
                    "inputSchema": t.get("inputSchema") or t.get("input_schema") or {},
                }
            )
        return out

    def call_tool(self, name: str, arguments: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        """Invoke a tool via tools/call.

        Returns the JSON-RPC result dict on success, or {"error": ...} on
        failure. Never raises.
        """
        env = self._rpc("tools/call", {"name": name, "arguments": arguments or {}})
        if "error" in env:
            return {"error": env["error"]}
        return env.get("result") or {}


def connect_all(
    servers: list[dict[str, Any]],
) -> tuple[dict[str, McpClient], dict[str, tuple[McpClient, dict[str, Any]]]]:
    """Connect to every assigned MCP server and build a merged tool registry.

    Args:
        servers: list of {name, url, authHeader?, transport?} dicts (the shape
            returned by the control plane's /connector/mcp endpoint).

    Returns:
        (clients, registry) where
          clients  is {server_name -> McpClient}
          registry is {tool_name -> (McpClient, tool_dict)} merged across all
                   servers. On a tool-name collision, the first server wins and
                   we log the conflict.

    Best-effort: a server that fails to connect / list tools is simply skipped.
    """
    clients: dict[str, McpClient] = {}
    registry: dict[str, tuple[McpClient, dict[str, Any]]] = {}
    for spec in servers or []:
        if not isinstance(spec, dict):
            continue
        url = spec.get("url")
        if not url:
            continue
        name = spec.get("name") or url
        client = McpClient(
            base_url=url,
            auth_header=spec.get("authHeader") or spec.get("auth_header"),
            name=name,
        )
        clients[name] = client
        tools = client.list_tools()
        print(f"[mcp] connected '{name}' ({url}) -> {len(tools)} tool(s)")
        for tool in tools:
            tname = tool.get("name")
            if not tname:
                continue
            if tname in registry:
                # v1: first server wins; flag the collision for visibility.
                print(f"[mcp] tool name collision '{tname}' ({name}) — keeping first")
                continue
            registry[tname] = (client, tool)
    return clients, registry
