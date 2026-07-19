# Hermes Fleet Worker (Cloudflare Workers + Containers)

The control plane's "one-click deploy" provisions agents by calling **this**
Cloudflare Worker, which boots one **isolated container per agent** using
[Cloudflare Containers](https://developers.cloudflare.com/containers/) backed by
Durable Objects. Each container runs a **harness** — the built-in Hermes LLM
loop, or a third-party agent framework (OpenClaw, Goose, an arbitrary CLI
agent) driven by the connector's adapter layer
(`connector/control_plane/frameworks.py`) — which auto-registers back into the
control plane. See **`docs/HARNESS_SPEC.md`** for the full harness manifest
spec and onboarding steps.

```
  Convex deploy() action ──HTTPS (Bearer secret)──▶ Fleet Worker ──▶ Container (harness image)
                                                          │                 │ connector auto-registers
                                                          ▼                 ▼
                                    Durable Object per agent (per-harness class)   Control plane (online ✓)
```

## How it works

- `src/index.ts` exports a Worker (`fetch`) and a Durable Object class
  `AgentContainer` that **extends `Container`** from `@cloudflare/containers`,
  subclassed once per harness (`HermesAgentContainer`, `OpenclawAgentContainer`,
  `GooseAgentContainer`, `GenericCliAgentContainer`, plus the enterprise-only
  `CustomAgentContainer` for BYO images) purely so each gets its own
  `class_name`/image binding in `wrangler.jsonc` — Cloudflare Containers bind
  exactly **one image per Durable Object class** at deploy time, so a harness
  can't be chosen by swapping images at request time; it's chosen by routing
  to the right *class*.
- `connector/harnesses/registry.ts` loads and validates each built-in
  harness's `harness.json` manifest at Worker module-load time and exposes
  `loadManifest(id)` / `isKnownHarness(id)`.
- **One DO instance == one agent container.** `/spawn` resolves `harness` (or
  `imageRef` for BYO) to a binding, mints a fresh `DurableObjectId` in that
  namespace, gets the instance's stub, and calls `startAgent(...)`, which
  boots the container image with the agent's env vars (including any
  harness-fixed env from the manifest, e.g. `HERMES_AGENT_FRAMEWORK=goose`).
- `/terminate` calls `destroy()` on the instance; `/status` reads its
  lifecycle state and normalizes it to `running` / `stopped`; `/restart`
  stops and reboots the SAME instance with its persisted config (rolling
  restart — draining/scheduling which agents to restart is `fleet.ts`'s job,
  not the worker's).
- The `FleetRegistry` side index (below) now also records which **harness**
  each id belongs to, so `/status`/`/terminate`/`/restart` can resolve the
  correct DO namespace from just the id — callers don't need to resend
  `harness` after `/spawn`.

## Endpoints the control plane calls

`GET /health` is unauthenticated (for uptime checks). Every other request must
carry `Authorization: Bearer <FLEET_SECRET>`. These match
`convex/lib/cloudflare.ts` exactly:

| Method · Path | Auth | Body | Returns |
| --- | --- | --- | --- |
| `GET /health` | none | — | `{ ok: true }` |
| `POST /spawn` | required | `{ token, controlPlaneUrl, region?, model?, modelApiKey?, name, harness?, imageRef?, agentCommand? }` | `{ id, harness, harnessVersion }` |
| `POST /terminate` | required | `{ id }` | `{ ok: true }` |
| `POST /status` | required | `{ id }` | `{ status }` |
| `POST /restart` | required | `{ id }` | `{ ok: true, status }` |
| `POST /list` | required | — | `{ instances: [{ id, name?, harness, harnessVersion?, imageRef?, spawnedAt, status }] }` |

`harness` is one of `hermes` (default) \| `openclaw` \| `goose` \|
`generic-cli`. Passing `imageRef` (enterprise plan only — gated in
`convex/fleet.ts`, not re-checked by the worker) routes the spawn to the
reserved `custom`/`AGENT_BYO` slot instead — see **BYO image** below.

On `/spawn` the worker injects these env vars into the container (consumed by
`agent_runtime.py` / `client.py` / `frameworks.py`):

| Container env var | Source field |
| --- | --- |
| `HERMES_CONTROL_PLANE_URL` | `controlPlaneUrl` |
| `HERMES_CONNECTOR_TOKEN` | `token` |
| `HERMES_AGENT_MODEL` | `model` |
| `HERMES_AGENT_NAME` | `name` |
| `HERMES_MODEL_API_KEY` | `modelApiKey` (BYOK passthrough, optional) |
| `HERMES_AGENT_FRAMEWORK` (+ any other `env.fixed` keys) | the resolved harness manifest |
| `HERMES_BYO_IMAGE_REF` | `imageRef`, BYO deploys only (audit/observability) |
| `HERMES_AGENT_COMMAND` | `agentCommand` (required by `fleet.ts` for `harness: "generic-cli"`; optional override otherwise) |

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
(remove), storing `{ id, name, harness, harnessVersion?, imageRef?, spawnedAt }`
(no secrets). `/list` reads that registry and fans out to each instance's
`/status` for a live status. This is a best-effort index maintained by this
worker, not a Cloudflare-native listing — if an instance is ever removed
out-of-band (e.g. manually via the dashboard), the registry entry can go
stale until the next `/terminate` call for that id.

## Harness images (Dockerfiles)

Each harness has its own Dockerfile under `connector/harnesses/<id>/`, all
copying in `connector/control_plane/` and running
`python -m connector.control_plane.agent_runtime`, differing only in which
framework CLI (if any) they install and the `HERMES_AGENT_FRAMEWORK` env var
they bake in. See `docs/HARNESS_SPEC.md` for the manifest contract and how to
add a new one.

> **Build context must be the repo root** (`hermes-front-end/`), because every
> harness Dockerfile `COPY`s the connector package that lives outside
> `connector/harnesses/`. `wrangler.jsonc` sets this per-container via
> `"image_build_context": "../../"`. To build one by hand:
>
> ```bash
> # from the repo root
> docker build -f connector/harnesses/hermes/Dockerfile -t hermes-agent-hermes .
> docker build -f connector/harnesses/goose/Dockerfile -t hermes-agent-goose .
> ```

## BYO image (enterprise)

`imageRef` on `/spawn` is plumbed end-to-end (dashboard → `fleet.ts` →
worker → agent record) but Cloudflare's per-class-image limitation (above)
means `/spawn` cannot pull an arbitrary registry ref at request time today —
`AGENT_BYO` still runs whatever image is currently configured for that class
in `wrangler.jsonc` (defaults to the fully env-parameterized `generic-cli`
image). `imageRef` is recorded on the agent and forwarded into the container
as `HERMES_BYO_IMAGE_REF` for audit/observability. See
`docs/HARNESS_SPEC.md`'s "BYO image" section for the full explanation and
what changes when Cloudflare adds per-spawn image selection.

## Deploy

```bash
cd connector/fleet-worker
npm install

# 1. Set the shared secret the worker checks on every request.
npx wrangler secret put FLEET_SECRET

# 2. Build every harness's container image + deploy the worker + DO migration.
#    (wrangler builds each Dockerfile in `containers[]` and pushes to Cloudflare's registry.)
npx wrangler deploy
```

Requires a Cloudflare account with **Containers** enabled. The first deploy
runs the `v1` Durable Object migration (`new_sqlite_classes` for all five
container classes + `FleetRegistry`).

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
  never stores secrets.
- BYO image (`imageRef`) is gated to the enterprise plan in `convex/fleet.ts`;
  the worker itself does not re-check the plan, so treat `CLOUDFLARE_FLEET_SECRET`
  as the trust boundary for that field.
- `terminate` calls `destroy()`, which fully tears the container down — pair it
  with the control plane's per-Space budget caps + kill switch.
- `instance_type` and `max_instances` in `wrangler.jsonc` are the fleet-wide
  cost cap (per harness class); see the inline comment there before raising
  `max_instances`.

## API version notes

Cloudflare Containers and `@cloudflare/containers` are evolving. The code follows
the current surface (`Container` base class with `defaultPort` / `sleepAfter` /
`envVars`, instance methods `start({ envVars })` / `stop()` / `destroy()` /
`getState()`, and the `containers` block with `image` / `instance_type` /
`max_instances`). If you bump the `@cloudflare/containers` dependency and a
method or field is renamed, the call sites flagged with comments in
`src/index.ts` are the ones to revisit.

`FleetRegistry` is a plain Durable Object (imported from the `cloudflare:workers`
module, not `@cloudflare/containers`) that relies on Workers RPC — public
methods on the class become callable directly on the stub returned by
`env.REGISTRY.get(id)`, the same pattern already used for `AgentContainer`'s
`startAgent`/`stopAgent`/`restartAgent`/`agentStatus`.
