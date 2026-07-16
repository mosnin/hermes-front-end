# Hermes Control Plane connector

This connects a **deployed Hermes agent** to the **Hermes Control Plane** (the
Next.js + Convex app at the repo root). Your agent stays wherever you deployed
it — AWS, GCP, a VM, or your laptop — and the connector registers it with the
control plane and streams its activity (messages, tool calls, status) up over
HTTPS.

```
  deployed Hermes agent (this checkout)
        │
        │  connector/control_plane  ──HTTPS──▶  Convex HTTP actions (convex/http.ts)
        │                                              │
        ▼                                              ▼
  AIAgent / sessions                          Control Plane dashboard (Next.js)
```

## 1. Register the agent

In the control plane UI: **Agents → Connect agent**. Give it a name; you'll get
a one-time token. Copy the two env vars it shows you.

## 2. Configure the connector

```bash
export HERMES_CONTROL_PLANE_URL=https://<your-deployment>.convex.site
export HERMES_CONNECTOR_TOKEN=<token from the UI>
```

`HERMES_CONTROL_PLANE_URL` is the Convex **HTTP actions** URL — the
`*.convex.site` domain (not `*.convex.cloud`). The UI generates the right value
for you.

## 3a. Try it with the mock agent (no real agent needed)

```bash
# from the repo root
python -m connector.control_plane.mock_agent
```

The agent turns **online** in the dashboard and a live feed of fake messages,
tool calls, and status events starts flowing. Great for demoing the UI.

## 3b. Wire a real Hermes agent

The connector is a thin client (`client.py`, standard library only). To relay a
real agent, call it from the agent's run loop / streaming hooks:

```python
from connector.control_plane import ControlPlaneClient

cp = ControlPlaneClient()           # reads the env vars above
cp.register(platform_name="aws", capabilities=["web", "shell", "memory"])

# in your streaming/tool callbacks:
cp.message(thread_key=session_id, thread_title=title, role="assistant", content=text)
cp.activity("tool_call", tool_name, detail=args_summary, thread_key=session_id)

# periodically, from a background thread:
cp.run_heartbeat_loop(interval=30)
```

The natural integration points in this hermes-webui checkout are the streaming
callbacks in `api/streaming.py` (token/tool-call/done events) and the session
lifecycle in `api/session_*.py`. Map each `session_id` to a `thread_key` so the
control plane groups turns into the same thread.

## API surface (for reference)

All requests are `POST` with `Authorization: Bearer <token>`:

| Endpoint | Purpose |
| --- | --- |
| `/connector/register` | Mark online, report version/capabilities/meta |
| `/connector/heartbeat` | Liveness ping (send every ~30s) |
| `/connector/activity` | Append an activity event |
| `/connector/message` | Relay a conversation turn into a thread |

These are implemented in `convex/http.ts`.
