# Managed hosting (Cadre Cloud) — operator runbook

This is the operator's guide to launching **Cadre Cloud**: customers click
**Deploy** in the dashboard, we boot an isolated Cloudflare Container running
the Hermes connector per agent, and bill them per hosted agent. It sits on top
of the existing "fleet" pipeline — this doc is the launch + ops checklist for
that pipeline, not a re-description of it. For the code-level how-it-works,
read [`connector/fleet-worker/README.md`](../connector/fleet-worker/README.md),
[`convex/fleet.ts`](../convex/fleet.ts), and
[`convex/lib/cloudflare.ts`](../convex/lib/cloudflare.ts) first.

## Architecture recap

```
 Dashboard "Deploy" ──▶ fleet.deploy (action) ──▶ lib/cloudflare.spawnAgent ──▶ Fleet Worker ──▶ Container
                              │                                                                     │
                              ▼                                                                     ▼
                    agents row (vmProvider="cloudflare",                              connector auto-registers
                    deploymentStatus, tokenHash)                                       back into control plane
```

- One Durable Object + one Container **per agent** — no shared tenant process
  (`connector/fleet-worker/src/index.ts`, `AgentContainer` class).
- `fleet.deploy` is env-gated by `cloudflareConfigured()`
  (`convex/lib/cloudflare.ts:13`), which is `true` only when both
  `CLOUDFLARE_FLEET_WORKER_URL` and `CLOUDFLARE_FLEET_SECRET` are set in the
  Convex env. **When unconfigured, `deploy()` still inserts the agent row**
  (status `provisioning`) and hands back a one-time connector token so the
  customer can run the connector by hand — nothing about the dashboard breaks
  in dev without Cloudflare. Every piece of this pipeline you add must degrade
  the same way.
- Per-Space hosted-agent ceilings are enforced by plan
  (`convex/fleet.ts` — `checkHostedCapacity`, `hostedAgentLimit`) against
  `PLAN_LIMITS[plan].hostedAgents` (`convex/lib/plans.ts`): free = 0, team = 5,
  enterprise = 25.

## Prerequisites

1. **Cloudflare Workers Paid plan** — Containers require a paid Workers
   account (the free tier does not support the `containers` block in
   `wrangler.jsonc`).
2. **Containers enabled** on that Cloudflare account (Cloudflare dashboard →
   Workers & Pages → Containers → enable). Until this is on, `wrangler deploy`
   for the fleet worker will fail to provision the `containers` block.
3. A **Convex deployment** you can set env vars on (`npx convex env set`).
4. A **Stripe account** with a flat recurring price created for
   `STRIPE_PRICE_HOSTED_AGENT` (see Metering & billing below).
5. Docker available locally if you want to build/verify the agent image by
   hand before `wrangler deploy` builds it remotely
   (`connector/fleet-worker/README.md` → "The agent image").

## Deploy steps (exact)

Run from the repo root unless noted.

```bash
# 1. Install the fleet worker's deps.
cd connector/fleet-worker
npm install

# 2. Set the shared secret the worker checks on every request from Convex.
#    Generate a long random value yourself (e.g. `openssl rand -hex 32`) and
#    keep it — you'll set the same value as CLOUDFLARE_FLEET_SECRET below.
npx wrangler secret put FLEET_SECRET

# 3. Deploy: wrangler builds connector/fleet-worker/Dockerfile (build context
#    is the REPO ROOT per wrangler.jsonc's image_build_context: "../../",
#    since the Dockerfile COPYs connector/control_plane/ from one dir up),
#    pushes the image, deploys the Worker, and runs the v1 Durable Object
#    migration (new_sqlite_classes: ["AgentContainer"]).
npx wrangler deploy
```

Note the deployed Worker URL from the `wrangler deploy` output (looks like
`https://hermes-fleet.<account>.workers.dev`).

```bash
# 4. Back at the repo root, wire the Convex deployment to the worker.
npx convex env set CLOUDFLARE_FLEET_WORKER_URL https://hermes-fleet.<account>.workers.dev
npx convex env set CLOUDFLARE_FLEET_SECRET <the same value you set in step 2>

# 5. Give deployed agents somewhere to register back into.
npx convex env set CONVEX_SITE_URL https://<your-deployment>.convex.site

# 6. Create the flat per-hosted-agent Stripe price (Stripe dashboard or
#    `stripe prices create --unit-amount ... --recurring[interval]=month
#    --product ...`), then:
npx convex env set STRIPE_PRICE_HOSTED_AGENT price_...
```

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_TEAM`,
`STRIPE_PRICE_ENTERPRISE`, and `APP_URL` must already be set per
[`docs/ENTERPRISE.md`](./ENTERPRISE.md) — `createCheckout` (`convex/stripe.ts`)
throws if `STRIPE_SECRET_KEY`/the plan price are missing, and separately
throws if `hostedAgentSeats > 0` but `STRIPE_PRICE_HOSTED_AGENT` is unset.

Once `CLOUDFLARE_FLEET_WORKER_URL` + `CLOUDFLARE_FLEET_SECRET` are both set,
`cloudflareConfigured()` flips to `true` and the next `fleet.deploy` call boots
a real container. Verify with `convex/fleet.ts`'s `providerStatus` query (also
surfaced in the dashboard) before announcing the launch.

## Env var reference

| Var | Where | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_FLEET_WORKER_URL` | Convex env | Base URL of the deployed fleet Worker (`lib/cloudflare.ts`). |
| `CLOUDFLARE_FLEET_SECRET` | Convex env | Bearer secret the Worker checks on `/spawn`, `/terminate`, `/status`; same value as the Worker's `FLEET_SECRET` (`wrangler secret put`). |
| `CONVEX_SITE_URL` | Convex env | The control-plane URL injected into containers as `HERMES_CONTROL_PLANE_URL` so spawned connectors register back (`convex/fleet.ts` `controlPlaneUrl()`). |
| `STRIPE_PRICE_HOSTED_AGENT` | Convex env | Flat recurring Stripe price id for one hosted-agent seat; bundled as a second Checkout line item when `hostedAgentSeats > 0` (`convex/stripe.ts`). |
| `FLEET_SECRET` | Cloudflare Worker secret | Same value as `CLOUDFLARE_FLEET_SECRET`, set via `wrangler secret put` inside `connector/fleet-worker/`. |

## BYOK vs. platform-key model access

`fleet.deploy` (`convex/fleet.ts`) accepts an optional `modelApiKey` argument:
a customer-supplied API key for their model provider, passed straight through
to `spawnAgent` (`convex/lib/cloudflare.ts`) and on to the Fleet Worker's
`/spawn` call, which injects it into the container as a runtime env var
alongside `HERMES_AGENT_MODEL`. It is **never persisted** on the `agents` row
— raw secrets live in `convex/secrets.ts`, not on the fleet pipeline, and the
Worker never logs it (`connector/fleet-worker/README.md` → Security notes).

- **BYOK**: customer passes `modelApiKey`; their container calls the model
  provider directly on their own account/quota. We host the compute, they pay
  the model provider.
- **Platform-key**: customer omits `modelApiKey`; the container falls back to
  whatever the connector's default model wiring uses. This is the path to
  meter model spend as part of hosting rather than leaving it to the
  customer — if you wire a platform-side key into the container image/env,
  make sure usage against it is attributed to the Space so `usage`/`costs.ts`
  actually knows about it. As shipped, the pipeline moves whatever key you
  give it through unmodified; it does not itself inject a platform key.

## Metering model

Two independent charges make up hosted-agent revenue:

1. **Flat per-agent Stripe subscription line item.** `createCheckout`
   (`convex/stripe.ts`) bundles `hostedAgentSeats` × `STRIPE_PRICE_HOSTED_AGENT`
   as a second Checkout line item alongside the plan price. This is the
   "seats" charge — what the customer is buying rights to run, independent of
   whether a container is actually up at any given moment.
2. **Hourly agent-hour usage rows** (`convex/fleetMetering.ts`). A cron
   (`internal.fleetMetering.runHourly`, wired in `convex/crons.ts`) scans all
   agents once an hour, and for every agent that is both `vmProvider` set and
   `deploymentStatus === "running"`, inserts one `usage` row of kind
   `hosted_agent_hour` at `HOSTED_AGENT_HOURLY_USD` (currently a **$0.10/hour
   placeholder** — tune to your real Cloudflare Container cost + margin before
   launch). It's idempotent per agent per UTC-hour bucket (checks existing
   `hosted_agent_hour` rows via the `by_space_time` usage index before
   inserting) and paginates + self-schedules like `health.sweep` so it scales
   past one page of agents.

These agent-hour rows show up next to token/message usage in the Space's
usage view and are meant to be the ground-truth signal you reconcile the flat
Stripe seat charge against — they are **not** currently pushed to Stripe as
metered billing; today they're an internal cost/usage record only. If you
want true metered Stripe billing (Stripe Billing Meters / usage records) wire
that as a follow-up in `convex/fleetMetering.ts`'s cron handler.

Subscription lapse: on `customer.subscription.deleted`, the webhook
(`convex/http.ts` → `/billing/stripe/webhook`) calls
`internal.stripe.lapseHostedFleet` (`convex/stripe.ts`), which marks every
hosted agent in the Space (`deploymentStatus !== "stopped"`) as `stopped` /
`offline`. **This does not tear down the actual Cloudflare Container** — it
only stops the agent-hour meter and hides it as "live" in the dashboard.
Actually destroying the container still requires `fleet.terminate`
(`convex/fleet.ts`), which calls `terminateAgent` → Worker `/terminate` →
`destroy()` on the Durable Object. Treat "lapsed but container still running"
as a real cost leak until you close that loop (see Incident playbook below).

## Cost envelope + suggested pricing

Inputs to model your margin on, all grounded in the current config
(`connector/fleet-worker/wrangler.jsonc`):

- `instance_type: "basic"` — the smallest Cloudflare Container tier; check the
  [Containers pricing page](https://developers.cloudflare.com/containers/pricing/)
  for the current basic-tier $/vCPU-hour and $/GiB-hour, since Cloudflare
  revises these.
- `max_instances: 100` — hard ceiling on concurrently running containers for
  the whole Worker account, independent of any Space's plan limit. If your
  aggregate hosted-agent demand across all customers can exceed 100
  concurrent, raise this before it silently caps provisioning.
- `sleepAfter = "30m"` (`connector/fleet-worker/src/index.ts`) — an idle
  container sleeps (and presumably stops incurring compute cost) after 30
  minutes with no activity, but it still counts as `deploymentStatus:
  "running"` in Convex until you poll status and it comes back `stopped`
  (`fleet.refreshStatus`). Don't assume the agent-hour meter tracks *actual*
  Cloudflare billed compute time 1:1 — it tracks "we believe this agent is
  live," which lags real container sleep/wake.
- Plan ceilings bound worst case per Space: team = 5 hosted agents, enterprise
  = 25 (`convex/lib/plans.ts`).

Suggested starting price, once you've filled in the real basic-tier Cloudflare
rate: price `STRIPE_PRICE_HOSTED_AGENT` comfortably above
`HOSTED_AGENT_HOURLY_USD × ~730 hours/month` (the $0.10/hr placeholder implies
~$73/month in raw compute if an agent runs continuously) plus margin for
support + the shared Worker/DO overhead. Until you've measured real Cloudflare
Container invoices, treat both the $0.10/hr constant and any headline price as
a placeholder to revisit, not a committed number.

## Incident playbook

**Stuck provisioning** (`deploymentStatus` stuck at `provisioning`):
- Check `providerStatus` (`convex/fleet.ts`) — if `cloudflare: false`, the
  Space's agents were created without ever calling the Worker; that's
  expected in dev, not an incident. If `cloudflare: true`, `spawnAgent`
  (`convex/lib/cloudflare.ts`) threw and `fleet.deploy` caught it, setting
  `status: "failed"` — check Worker logs (`wrangler tail` in
  `connector/fleet-worker/`) for the `/spawn` failure. `deploymentStatus:
  "failed"` (not "provisioning") is the actual failure signal to alert on.
- If it's genuinely wedged at `"provisioning"` with `cloudflare: true`,
  suspect the Worker never got the request (network/`FLEET_SECRET` mismatch —
  `lib/cloudflare.ts`'s `call()` throws `cloudflare fleet /spawn -> <status>`
  on any non-2xx, which `deploy()` swallows into `status: "failed"`, so a true
  hang here points at the fetch itself, not the Worker's response).

**Runaway / misbehaving container**:
- `fleet.terminate` (`convex/fleet.ts`) is the kill path: it calls
  `terminateAgent(vmId)` → Worker `/terminate` → `destroy()` on that agent's
  Durable Object, which fully tears the container down, then marks the agent
  `stopped`/`offline` regardless of whether the Cloudflare call succeeded
  (best-effort — see the `catch` in `terminate`).
- Existing Space-level guardrails (kill switch, loop/runaway guards —
  `convex/lib/guards.ts`) apply to hosted agents exactly like any other agent
  since they're the same `agents` table row; use those first if the fleet
  agent is spamming actions rather than misbehaving at the infra level.
- Requires `admin` role (`prepareTerminate` calls `requireRole(scope,
  "admin")`) — a lower-role operator cannot self-serve a kill, by design.

**Subscription lapse mid-flight**:
- The webhook auto-stops the *billing signal* (`lapseHostedFleet` in
  `convex/stripe.ts`) but, per Metering model above, leaves the actual
  container running. Run `fleet.terminate` per affected agent (or add a
  follow-up job that does so automatically) to stop real Cloudflare spend, not
  just the dashboard-visible meter.
- Because `lapseHostedFleet` matches on `deploymentStatus !== "stopped"` for
  every agent in the Space, double check you're not silently marking
  non-hosted agents offline — as shipped it should only ever see hosted rows
  since `deploymentStatus` is only set on fleet-deployed agents
  (`insertFleetAgent`), but if that invariant ever changes this filter needs a
  matching `vmProvider` check.

**Hosted-agent limit false positives**: `checkHostedCapacity`
(`convex/fleet.ts`) counts agents with `vmProvider` set AND
`deploymentStatus` in `{provisioning, running}` — if terminate or the lapse
handler ever leaves an agent in a state outside `{stopped, provisioning,
running, failed}`, it'll either undercount (customer gets billed for capacity
they can't use) or overcount (customer blocked from deploying agents they're
entitled to). Any new deployment-status value needs to be added to that
filter consciously.

## Launch checklist

- [ ] Cloudflare account has Workers **Paid** plan + **Containers** enabled.
- [ ] `connector/fleet-worker`: `npm install`, `npx wrangler secret put
      FLEET_SECRET`, `npx wrangler deploy` succeeds and the `v1` DO migration
      applies cleanly.
- [ ] Convex env has `CLOUDFLARE_FLEET_WORKER_URL`, `CLOUDFLARE_FLEET_SECRET`
      (same value as the Worker secret), `CONVEX_SITE_URL`.
- [ ] `fleet.providerStatus` returns `{ cloudflare: true }` in the target
      Convex deployment.
- [ ] Stripe: `STRIPE_PRICE_HOSTED_AGENT` created and set; existing
      `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_TEAM`/
      `STRIPE_PRICE_ENTERPRISE`/`APP_URL` already configured per
      [`docs/ENTERPRISE.md`](./ENTERPRISE.md).
- [ ] `convex/crons.ts` has `fleetMetering.runHourly` scheduled and it's
      actually inserting `hosted_agent_hour` usage rows (check the Space's
      usage view after a live deploy has run ≥1 hour).
- [ ] `HOSTED_AGENT_HOURLY_USD` (`convex/fleetMetering.ts`) updated from the
      placeholder to a value backed by real Cloudflare Container pricing.
- [ ] End-to-end smoke test: deploy 1 agent from the dashboard on a `team`+
      Space, confirm the container comes up (`deploymentStatus: "running"`
      after `fleet.refreshStatus`), confirm `fleet.terminate` tears it down,
      confirm a canceled Stripe subscription stops the agent-hour meter
      (`lapseHostedFleet`) — and manually verify you also terminated the
      actual container per the Incident playbook note above.
- [ ] Confirm `max_instances: 100` in `wrangler.jsonc` covers your expected
      launch-day concurrent hosted-agent count across all customers; raise it
      if not.
