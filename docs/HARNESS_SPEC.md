# Harness Spec

A **harness** is the agent framework that actually turns an instruction into a
result inside a hosted (Cloudflare Container) agent: the built-in Hermes LLM
loop, OpenClaw, Goose, or an arbitrary CLI agent. This document specifies the
manifest contract new harnesses implement to onboard, and how the fleet
deploy path (`fleet.ts deploy()` → Cloudflare fleet worker → container) picks
one.

Source of truth for the TS shape: `connector/harnesses/schema.ts`
(`HarnessManifest`). The loader that resolves ids to manifests at runtime:
`connector/harnesses/registry.ts`.

## Why manifests, not just Dockerfiles

The connector (`connector/control_plane/agent_runtime.py`) is
framework-agnostic by design: it always owns registration, heartbeat, the
work stream, and A2A; only "how do I turn one instruction into text" is
pluggable, via `connector/control_plane/frameworks.py`'s adapter selection
(`HERMES_AGENT_FRAMEWORK` + `build_executor`). A harness manifest packages
everything the fleet worker needs to boot a container that satisfies that
adapter contract, so adding a harness is "write a manifest + a Dockerfile",
not "touch the worker or convex/fleet.ts".

## The manifest shape

```ts
interface HarnessManifest {
  id: "hermes" | "openclaw" | "goose" | "generic-cli" | "custom";
  displayName: string;
  description?: string;
  version: string; // harness framework version this image pins

  install: {
    dockerfile: string; // path relative to repo root
    baseImage: string;  // informational; Dockerfile is authoritative
  };

  start: {
    command: string[]; // argv the image's CMD/entrypoint runs
  };

  env: {
    required: string[];            // fleet worker always sets these
    optional?: string[];           // read if present, harness runs without them
    fixed?: Record<string, string>; // baked-in env this harness's adapter needs
  };

  health: {
    port: number;             // must match Container.defaultPort
    path?: string;            // HTTP readiness path, if any (else TCP-only)
    intervalSeconds?: number;
    timeoutSeconds?: number;
  };

  capabilities: string[];   // "chat" | "workflow" | "rag" | "mcp" | "framework:<id>" | ...
  containerBinding: string; // Durable Object binding in wrangler.jsonc that boots this image
  byoImage?: boolean;       // true only for the reserved "custom" BYO-image slot
}
```

`connector/harnesses/registry.ts` validates every built-in manifest at Worker
module-load time (`validateManifest`, no external deps — keeps the Worker
bundle small) — a malformed `harness.json` fails the build/boot, not a
request.

## Onboarding a new harness

1. Add an adapter to `connector/control_plane/frameworks.py`
   (`FRAMEWORK_COMMANDS["<id>"]`, or rely on `HERMES_AGENT_COMMAND` for a bare
   CLI wrapper via the `generic-cli` harness — no code change needed for that
   case).
2. Create `connector/harnesses/<id>/harness.json` matching the shape above.
   `env.fixed.HERMES_AGENT_FRAMEWORK` should equal the frameworks.py key.
3. Create `connector/harnesses/<id>/Dockerfile`. Build context is always the
   **repo root** (`image_build_context: "../../"` in wrangler.jsonc) so it can
   `COPY connector/control_plane/`. Install the framework's CLI, keep
   `HERMES_AGENT_FRAMEWORK` set via `ENV`, and end with the same liveness-port
   + agent_runtime `CMD` pattern the built-in harnesses use.
4. Register the id in `connector/harnesses/registry.ts`'s `RAW` map and in
   `connector/harnesses/schema.ts`'s `HARNESS_IDS`.
5. Add a `containers` entry + Durable Object binding + class export in
   `connector/fleet-worker/wrangler.jsonc` / `src/index.ts` (see below — each
   harness needs its own DO class/binding because Cloudflare Containers bind
   one image per class at deploy time).
6. Add the id to the mirrored allow-list in `convex/lib/cloudflare.ts`
   (`KNOWN_HARNESS_IDS`) so `fleet.deploy()` validates it server-side. Convex
   functions can only import from `convex/`, so this list is intentionally
   duplicated from `connector/harnesses/schema.ts`'s `HARNESS_IDS` — keep them
   in sync (a test in `convex/tests/fleet.test.ts` documents the expectation).
7. Add the same displayName/description/version/capabilities to
   `convex/lib/cloudflare.ts`'s `HARNESS_CATALOG` (mirrors the new
   `harness.json`, same cross-boundary reason as step 6). This feeds two
   things: the `fleet.harnessCatalog` public query (a harness-picker UI can
   list every option without touching `connector/harnesses/**`) and the
   `capabilities` array written onto every hosted agent at deploy time (see
   "Capability tags flow into agents.capabilities" below). A tripwire test in
   `convex/tests/fleet.test.ts` checks `HARNESS_CATALOG` stays in sync with
   the real `harness.json` files.

## Harness picker + capability tags for UI/routing consumers

`fleet.harnessCatalog` (public, unauthenticated — static catalog data, not
Space-scoped) returns `{ id, displayName, description, version, capabilities
}[]` for every built-in harness, so any team's dashboard can render a harness
picker without reaching past `convex/fleet.ts`.

`fleet.deploy()` also writes the resolved harness's capability tags onto the
new agent's `agents.capabilities` (via `insertFleetAgent`) — e.g. `["chat",
"workflow", "rag", "mcp"]` for `hermes`, `["chat", "workflow",
"framework:goose"]` for `goose`. A BYO-image (`imageRef` set, harness
resolves to `"custom"`) gets the conservative baseline `["chat", "workflow"]`
since the actual image is opaque to the fleet worker. This is what feeds the
A2A directory/card listing in `capabilities.ts` with real capability tags for
fleet-hosted agents instead of leaving the field empty.

`fleet.pendingRestarts(spaceId)` (operator-gated) lists every agent currently
flagged `restartRequestedAt` — restarted-and-cleared or still waiting on
`sweepPendingRestarts` — plus live drain status, for a rolling-restart status
panel.

## Cloudflare Containers constraint: one image per DO class

Cloudflare Containers bind exactly **one** container image to a Durable
Object class at Worker deploy time (`wrangler.jsonc`'s `containers[]`); there
is currently no API to select an image per `/spawn` call. The fleet worker
therefore runs one DO class **per harness**:

| harness       | DO binding            | class                     |
|---------------|------------------------|---------------------------|
| `hermes`      | `AGENT_HERMES`          | `HermesAgentContainer`    |
| `openclaw`    | `AGENT_OPENCLAW`        | `OpenclawAgentContainer`  |
| `goose`       | `AGENT_GOOSE`           | `GooseAgentContainer`     |
| `generic-cli` | `AGENT_GENERIC_CLI`     | `GenericCliAgentContainer`|
| `custom` (BYO)| `AGENT_BYO`             | `CustomAgentContainer`    |

`/spawn` resolves `harness` → manifest → `containerBinding` → the matching DO
namespace and boots a fresh instance there. The `FleetRegistry` side-index
records which harness each spawned id belongs to, so `/status`, `/terminate`,
and the rolling-restart action can address the right namespace later without
the caller re-supplying it.

## BYO image (enterprise)

`fleet.ts deploy()` accepts an optional `imageRef` gated to the `enterprise`
plan (`planOf(scope) === "enterprise"`). When set, `/spawn` routes to the
reserved `AGENT_BYO` binding instead of a harness-specific one and records
`imageRef` on the agent (`agents.imageRef`) and forwards it into the
container as `HERMES_BYO_IMAGE_REF` for audit/observability.

**Known limitation:** because of the one-image-per-class constraint above,
`AGENT_BYO` still runs whatever image is currently configured for that
binding in `wrangler.jsonc` (defaults to the `generic-cli` image, which is
already parameterized entirely by env vars) — `/spawn` cannot pull an
arbitrary registry ref at request time today. The plumbing (enterprise gate,
`imageRef` flowing from the dashboard through `fleet.ts` to the worker to the
agent record) is in place end-to-end so that when Cloudflare ships per-spawn
image selection, only the worker's binding-resolution step needs to change —
callers, gating, and the agent record shape do not.

## Version tracking (feature 5)

Each manifest pins a `version` (the harness framework's version, not the
connector's). On a successful `/spawn`, the worker returns
`{ id, harness, harnessVersion }`; `fleet.ts` writes `harness` +
`harnessVersion` (from the manifest) and `connectorVersion` (from
`connector/control_plane`, reported back on the agent's first heartbeat) onto
the `agents` row. `fleet.rollingRestart` re-applies the currently configured
image to already-running agents of a harness (or all harnesses) in a Space,
**draining** first: any agent with a `runSteps` row in `status: "running"`
for it is skipped for that pass (flagged `agents.restartRequestedAt`) so an
in-flight task is never killed mid-execution.

`fleet.sweepPendingRestarts` (internal action) automatically retries every
agent still carrying a `restartRequestedAt` flag: Space by Space, it
re-checks drain status and restarts anything that's now idle, leaving
still-draining agents flagged for the next sweep. It's system-triggered (no
end-user identity — it only retries a restart an operator already authorized
via `rollingRestart`, never initiates a new one) and is intended to run on an
hourly cron; **cron registration is a cross-team request** since `crons.ts`
is shared (the integrator owns it — see cycle report).
