# Hermes Fleet Worker (Cloudflare Workers + Containers)

The control plane's "one-click deploy" provisions agents by calling **this**
Cloudflare Worker, which boots one **isolated container per agent** using
[Cloudflare Containers](https://developers.cloudflare.com/containers/) backed by
Durable Objects. Each container runs the Hermes connector
(`connector/control_plane/agent_runtime.py`), which auto-registers back into the
control plane.

```
  Convex deploy() action ──HTTPS (Bearer secret)──▶ Fleet Worker ──▶ Container (agent)
                                                          │                 │ connector auto-registers
                                                          ▼                 ▼
                                          Durable Object per agent      Control plane (online ✓)
```

## How it works

- `src/index.ts` exports a Worker (`fetch`) and a Durable Object class
  `AgentContainer` that **extends `Container`** from `@cloudflare/containers`.
- **One DO instance == one agent container.** `/spawn` mints a fresh
  `DurableObjectId`, gets that instance's stub, and calls `startAgent(...)`,
  which boots the container image with the agent's env vars.
- `/terminate` calls `destroy()` on the instance; `/status` reads its lifecycle
  state and normalizes it to `running` / `stopped`.

## Endpoints the control plane calls

`GET /health` is unauthenticated (for uptime checks). Every other request must
carry `Authorization: Bearer <FLEET_SECRET>`. These match
`convex/lib/cloudflare.ts` exactly:

| Method · Path | Auth | Body | Returns |
| --- | --- | --- | --- |
| `GET /health` | none | — | `{ ok: true }` |
| `POST /spawn` | required | `{ token, controlPlaneUrl, region?, model?, modelApiKey?, name }` | `{ id }` |
| `POST /terminate` | required | `{ id }` | `{ ok: true }` |
| `POST /status` | required | `{ id }` | `{ status }` |
| `POST /list` | required | — | `{ instances: [{ id, name?, spawnedAt, status }] }` |

On `/spawn` the worker injects these env vars into the container (consumed by
`agent_runtime.py` / `client.py`):

| Container env var | Source field |
| --- | --- |
| `HERMES_CONTROL_PLANE_URL` | `controlPlaneUrl` |
| `HERMES_CONNECTOR_TOKEN` | `token` |
| `HERMES_AGENT_MODEL` | `model` |
| `HERMES_AGENT_NAME` | `name` |
| `HERMES_MODEL_API_KEY` | `modelApiKey` (BYOK passthrough, optional) |

(`region` is accepted for forward-compat but Cloudflare schedules containers
globally; it is currently unused.)

`modelApiKey` is the customer's own model API key when they've brought their
own key (BYOK). It is only ever placed into the `HERMES_MODEL_API_KEY`
container env var — the worker never logs it and never echoes it back in a
response.

### `/list` and instance enumeration

Cloudflare's Containers/Durable Objects API has no call to "list every DO
instance of a class," so `/list` is backed by a small side registry: a
singleton `FleetRegistry` Durable Object (see the `REGISTRY` binding in
`wrangler.jsonc`) that the worker updates on `/spawn` (add) and `/terminate`
(remove), storing only `{ id, name, spawnedAt }`. `/list` reads that registry
and fans out to each instance's `/status` for a live status. This is a
best-effort index maintained by this worker, not a Cloudflare-native listing —
if an instance is ever removed out-of-band (e.g. manually via the dashboard),
the registry entry can go stale until the next `/terminate` call for that id.

## The agent image (Dockerfile)

`Dockerfile` builds a small `python:3.12-slim` image that copies in
`connector/control_plane/` and runs `python -m connector.control_plane.agent_runtime`.

> **Build context must be the repo root** (`hermes-front-end/`), because the
> Dockerfile `COPY`s the connector package that lives one directory up from
> `connector/fleet-worker/`. `wrangler.jsonc` sets this automatically via
> `"image_build_context": "../../"`. To build by hand:
>
> ```bash
> # from the repo root
> docker build -f connector/fleet-worker/Dockerfile -t hermes-agent .
> ```

## Deploy

```bash
cd connector/fleet-worker
npm install

# 1. Set the shared secret the worker checks on every request.
npx wrangler secret put FLEET_SECRET

# 2. Build the container image + deploy the worker + DO migration.
#    (wrangler builds the Dockerfile and pushes it to Cloudflare's registry.)
npx wrangler deploy
```

Requires a Cloudflare account with **Containers** enabled. The first deploy runs
the `v1` Durable Object migration (`new_sqlite_classes: ["AgentContainer"]`).

## Wire it to the control plane

In the **Convex deployment env** (the two vars `convex/lib/cloudflare.ts` reads):

```
CLOUDFLARE_FLEET_WORKER_URL = https://hermes-fleet.<account>.workers.dev
CLOUDFLARE_FLEET_SECRET     = <the same secret you set via `wrangler secret put FLEET_SECRET`>
```

When both are set, `cloudflareConfigured()` returns true and `deploy()` boots a
real container per agent. When unset, the control plane still provisions the
agent record + token so you can run the connector by hand.

## Security notes

- One isolated container **per agent** — no shared process between tenants.
- The worker authenticates every request with the shared `FLEET_SECRET`; rotate
  it via `npx wrangler secret put FLEET_SECRET`.
- The connector token and BYOK `modelApiKey` are injected as container env vars
  at boot (`HERMES_CONNECTOR_TOKEN`, `HERMES_MODEL_API_KEY`), never logged or
  persisted by the worker — the `FleetRegistry` side index (used by `/list`)
  only ever stores `{ id, name, spawnedAt }`, never secrets.
- `terminate` calls `destroy()`, which fully tears the container down — pair it
  with the control plane's per-Space budget caps + kill switch.
- `instance_type` and `max_instances` in `wrangler.jsonc` are the fleet-wide
  cost cap; see the inline comment there before raising `max_instances`.

## API version notes

Cloudflare Containers and `@cloudflare/containers` are evolving. The code follows
the current surface (`Container` base class with `defaultPort` / `sleepAfter` /
`envVars`, instance methods `start({ envVars })` / `destroy()` / `getState()`,
and the `containers` block with `image` / `instance_type` / `max_instances`). If
you bump the `@cloudflare/containers` dependency and a method or field is
renamed, the call sites flagged with comments in `src/index.ts` are the ones to
revisit.

`FleetRegistry` is a plain Durable Object (imported from the `cloudflare:workers`
module, not `@cloudflare/containers`) that relies on Workers RPC — public
methods on the class become callable directly on the stub returned by
`env.REGISTRY.get(id)`, the same pattern already used for `AgentContainer`'s
`startAgent`/`stopAgent`/`agentStatus`.
