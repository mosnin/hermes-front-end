"""HTTP client for the Hermes Control Plane connector ingestion API.

Pure standard library (urllib) so it runs anywhere a Hermes agent runs without
extra dependencies. Talks to the Convex HTTP actions defined in
convex/http.ts using the per-agent connector token.

Environment:
    HERMES_CONTROL_PLANE_URL   Convex HTTP actions base, e.g.
                               https://<deployment>.convex.site
    HERMES_CONNECTOR_TOKEN     The one-time token shown when you registered the
                               agent in the control plane UI.
"""

from __future__ import annotations

import json
import os
import platform
import socket
import time
import urllib.error
import urllib.request
from typing import Any, Optional

CONNECTOR_VERSION = "0.1.0"


class ControlPlaneClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        timeout: float = 10.0,
    ) -> None:
        self.base_url = (base_url or os.environ.get("HERMES_CONTROL_PLANE_URL", "")).rstrip("/")
        self.token = token or os.environ.get("HERMES_CONNECTOR_TOKEN", "")
        self.timeout = timeout
        if not self.base_url or not self.token:
            raise ValueError(
                "Set HERMES_CONTROL_PLANE_URL and HERMES_CONNECTOR_TOKEN "
                "(see connector/control_plane/README.md)."
            )

    # -- low-level ----------------------------------------------------------
    def _post(
        self,
        path: str,
        payload: dict[str, Any],
        headers: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {self.token}")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")
            raise RuntimeError(f"control plane {path} -> {e.code}: {detail}") from e

    # -- high-level API -----------------------------------------------------
    def register(self, platform_name: Optional[str] = None, capabilities: Optional[list[str]] = None) -> dict[str, Any]:
        return self._post(
            "/connector/register",
            {
                "connectorVersion": CONNECTOR_VERSION,
                "platform": platform_name or os.environ.get("HERMES_AGENT_PLATFORM"),
                "capabilities": capabilities or [],
                "meta": {
                    "host": socket.gethostname(),
                    "python": platform.python_version(),
                    "os": platform.platform(),
                    "pid": os.getpid(),
                },
            },
        )

    def heartbeat(self, status: str = "online") -> dict[str, Any]:
        return self._post("/connector/heartbeat", {"status": status})

    def activity(
        self,
        type: str,
        title: str,
        detail: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
        thread_key: Optional[str] = None,
        thread_title: Optional[str] = None,
    ) -> dict[str, Any]:
        return self._post(
            "/connector/activity",
            {
                "type": type,
                "title": title,
                "detail": detail,
                "payload": payload,
                "threadKey": thread_key,
                "threadTitle": thread_title,
            },
        )

    def message(
        self,
        thread_key: str,
        content: str,
        role: str = "assistant",
        thread_title: Optional[str] = None,
        tool_calls: Optional[Any] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        """Post a message to a thread. Pass a stable idempotency_key to make
        retries safe (a duplicate is dropped server-side, returning
        {"deduped": true})."""
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return self._post(
            "/connector/message",
            {
                "threadKey": thread_key,
                "threadTitle": thread_title,
                "role": role,
                "content": content,
                "toolCalls": tool_calls,
            },
            headers=headers,
        )

    # -- A2A (agent-to-agent) ----------------------------------------------
    def a2a_discover(self) -> dict[str, Any]:
        """List the Agent Cards this agent can talk to (excludes self)."""
        return self._post("/a2a/discover", {})

    def a2a_send(
        self,
        to: str,
        content: str,
        kind: str = "message",
    ) -> dict[str, Any]:
        """Send a message to another agent by id or name, via the broker."""
        return self._post("/a2a/send", {"to": to, "content": content, "kind": kind})

    def a2a_inbox(self, limit: int = 50) -> list[dict[str, Any]]:
        """Pull queued messages addressed to this agent (marks them delivered)."""
        resp = self._post("/a2a/inbox", {"limit": limit})
        return resp.get("messages", [])

    # -- Workflow engine ---------------------------------------------------
    def workflow_inbox(self) -> list[dict[str, Any]]:
        """Claim workflow steps dispatched to this agent (marks them running)."""
        resp = self._post("/workflow/inbox", {})
        return resp.get("steps", [])

    def workflow_result(
        self,
        run_id: str,
        step_id: str,
        ok: bool = True,
        output: Optional[str] = None,
    ) -> dict[str, Any]:
        """Report the result of a workflow step back to the engine."""
        return self._post(
            "/workflow/result",
            {"runId": run_id, "stepId": step_id, "ok": ok, "output": output},
        )

    # -- Context engine (RAG) ----------------------------------------------
    def context_search(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        """Retrieve relevant Space + company memory for this agent (vector search)."""
        resp = self._post("/context/search", {"query": query, "limit": limit})
        return resp.get("memories", [])

    # -- Deliverables ------------------------------------------------------
    def submit_artifact(
        self,
        name: str,
        kind: str = "text",
        text: Optional[str] = None,
        url: Optional[str] = None,
    ) -> dict[str, Any]:
        """Submit a deliverable (text or link) produced by this agent."""
        return self._post(
            "/artifact", {"name": name, "kind": kind, "text": text, "url": url}
        )

    # -- Integrations (Composio tools) -------------------------------------
    def execute_integration(
        self,
        toolkit: str,
        tool: str,
        arguments: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Run a Composio tool (e.g. toolkit='github', tool='GITHUB_CREATE_ISSUE')."""
        return self._post(
            "/integrations/execute",
            {"toolkit": toolkit, "tool": tool, "arguments": arguments or {}},
        )

    def stream_inbox(self, handler, max_seconds: float = 20.0) -> None:
        """Receive A2A messages in near real time over SSE (lower latency than
        polling). Returns when the bounded stream ends; reconnect in a loop."""
        url = f"{self.base_url}/a2a/stream"
        data = json.dumps({}).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {self.token}")
        deadline = time.time() + max_seconds
        with urllib.request.urlopen(req, timeout=max_seconds + 5) as resp:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if line.startswith("data:"):
                    try:
                        payload = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    for msg in payload.get("messages", []):
                        handler(msg)
                if time.time() > deadline:
                    break

    def pull_work(self, handler, max_seconds: float = 25.0) -> bool:
        """Real-time work transport: hold one SSE connection to /connector/pull
        and dispatch pushed work as it arrives. `handler` is called with a dict
        {"steps": [...], "messages": [...]} for each event. Also refreshes the
        agent heartbeat server-side, so no separate ping loop is needed.

        Returns True if the stream connected (even if it delivered nothing);
        False if the endpoint is unavailable, so the caller can fall back to
        polling on older deployments. The connection is bounded server-side
        (~25s); reconnect in a loop.
        """
        url = f"{self.base_url}/connector/pull"
        data = json.dumps({}).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Authorization", f"Bearer {self.token}")
        try:
            resp = urllib.request.urlopen(req, timeout=max_seconds + 10)
        except urllib.error.HTTPError as e:
            # Only a definitive "not found / not allowed" means the deployment
            # doesn't support the endpoint → fall back to polling. Any other HTTP
            # status is transient; re-raise so the caller retries the stream
            # instead of permanently downgrading on a blip.
            if e.code in (404, 405):
                return False
            raise
        except urllib.error.URLError:
            # Transient network error (DNS, reset, timeout) — retry the stream.
            raise
        with resp:
            for raw in resp:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue  # ": connected" / ": ping" keep-alives
                try:
                    payload = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                if payload.get("steps") or payload.get("messages"):
                    handler(payload)
        return True

    def get_secrets(self) -> dict[str, str]:
        """Fetch this Space's secrets (name -> value) to use as credentials."""
        resp = self._post("/connector/secrets", {})
        return {s["name"]: s["value"] for s in resp.get("secrets", [])}

    def send_bridge(self, bridge_id: str, text: str) -> dict[str, Any]:
        """Post a message OUT to a chat channel (Slack/Telegram/Discord) via a
        bridge routed to this agent. Use for outreach replies and notifications."""
        return self._post(
            "/bridges/send", {"bridgeId": bridge_id, "text": text}
        )

    def list_mcp(self) -> list[dict[str, Any]]:
        """Fetch the MCP servers assigned to this agent (name/url/transport/auth)."""
        resp = self._post("/connector/mcp", {})
        return resp.get("servers", [])

    def stream_chunk(
        self,
        thread_key: str,
        stream_id: str,
        seq: int,
        text: str,
        done: bool = False,
        thread_title: Optional[str] = None,
    ) -> dict[str, Any]:
        """Stream a buffered chunk of an agent reply for real-time UI rendering.
        Send a few tokens per call (not per token) to keep cost sane; set
        done=True on the final chunk to finalize into a permanent message."""
        return self._post(
            "/connector/stream",
            {
                "threadKey": thread_key,
                "threadTitle": thread_title,
                "streamId": stream_id,
                "seq": seq,
                "text": text,
                "done": done,
            },
        )

    def run_heartbeat_loop(self, interval: float = 30.0) -> None:
        """Block, sending heartbeats forever. Useful as a standalone process."""
        while True:
            try:
                self.heartbeat()
            except Exception as e:  # noqa: BLE001 - keep the loop alive
                print(f"[connector] heartbeat failed: {e}")
            time.sleep(interval)
