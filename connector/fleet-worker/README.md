# Hermes Fleet Worker (Cloudflare)

The control plane's "one-click deploy" provisions agents by calling **this**
Cloudflare Worker, which boots one **isolated container per agent** using
[Cloudflare Containers](https://developers.cloudflare.com/containers/) backed by
Durable Objects. Each container runs the Hermes connector (the agent), which
auto-registers back into the control plane.

```
  Convex deploy() action ──HTTPS (Bearer secret)──▶ Fleet Worker ──▶ Container (agent)
                                                          │                 │ connector auto-registers
                                                          ▼                 ▼
                                              Durable Object per agent   Control plane (online ✓)
```

## Endpoints the control plane calls

All requests carry `Authorization: Bearer <CLOUDFLARE_FLEET_SECRET>`:

| Method · Path | Body | Returns |
| --- | --- | --- |
| `POST /spawn` | `{ token, controlPlaneUrl, region?, model?, name }` | `{ id }` (container instance id) |
| `POST /terminate` | `{ id }` | `{ ok: true }` |
| `POST /status` | `{ id }` | `{ status }` |

`token` is the agent's one-time connector token; the worker injects it (plus
`controlPlaneUrl`/`model`) into the container env. The container image is the
Hermes connector (see ../control_plane) with these env vars:
`HERMES_CONTROL_PLANE_URL`, `HERMES_CONNECTOR_TOKEN`, optional `HERMES_AGENT_MODEL`.

## Wire it to the control plane

In the Convex deployment env:

```
CLOUDFLARE_FLEET_WORKER_URL = https://hermes-fleet.<account>.workers.dev
CLOUDFLARE_FLEET_SECRET     = <same secret this worker checks>
```

## Deploy

```
cd connector/fleet-worker
npm install
npx wrangler deploy        # requires a Cloudflare account with Containers enabled
```

## Security notes

- One Firecracker-isolated container **per agent** — no shared process between
  tenants.
- The worker authenticates every request with the shared secret; rotate it via
  `wrangler secret put CLOUDFLARE_FLEET_SECRET`.
- Tokens are injected as container env at boot, never logged or persisted.
- Pair with the control plane's per-Space budget caps + kill switch:
  `terminate` both stops dispatch and destroys the container.

> `src/index.ts` and `wrangler.jsonc` are a working scaffold — fill in your
> account id and container image, then `wrangler deploy`. Cloudflare's Containers
> API is evolving; check the docs for the current binding syntax.
