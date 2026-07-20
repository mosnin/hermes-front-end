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

## generic-cli requires `agentCommand`

`generic-cli`'s adapter (`connector/control_plane/frameworks.py`'s
`CliExecutor`) has no default command — it fails fast at container boot if
`HERMES_AGENT_COMMAND` is unset. `fleet.ts deploy()` therefore **requires** an
`agentCommand` argument whenever `harness === "generic-cli"` and no `imageRef`
is set (BYO images are opaque to us, so this validation doesn't apply to
them), and rejects the whole batch before spawning anything if it's missing —
better than spawning N containers that immediately crash-loop. `agentCommand`
flows `fleet.ts` → `lib/cloudflare.ts spawnAgent()` → the fleet worker's
`/spawn` body → `HERMES_AGENT_COMMAND` container env (layered on top of any
manifest-fixed env, so a caller-supplied command always wins). It's an
optional override for any other harness too (each of those ships a working
default command already, per `FRAMEWORK_COMMANDS` in `frameworks.py`).
`agentCommand` is spawn-time-only, like the BYOK `modelApiKey` — it is not
persisted on the `agents` row.

## Container policy (security profiles, feature 17)

`fleet.ts deploy()` accepts an optional `securityProfileId`
(`securityProfiles` table, owned/CRUD'd by `convex/securityProfiles.ts`).
When set, `deploy()` resolves the profile (verifying it belongs to the same
Space), builds a `ContainerPolicy` object from its `egressAllowlist` /
`fsQuotaMb` / `secretScopes` / `toolAllowlist` / opaque `containerPolicy`
fields, forwards it through `lib/cloudflare.ts spawnAgent({ containerPolicy })`
to the fleet worker's `/spawn` body, and stores `securityProfileId` on the
resulting `agents` row (`securityProfiles.assign` can also change it later,
independent of a redeploy).

The worker turns `containerPolicy` into container env vars, layered on top of
everything else (manifest-fixed env, `agentCommand`) so a security profile
always wins on key overlap:

| Policy field       | Container env                  |
|---------------------|---------------------------------|
| `egressAllowlist`   | `HERMES_EGRESS_ALLOWLIST` (comma-joined) |
| `fsQuotaMb`          | `HERMES_FS_QUOTA_MB`           |
| `secretScopes`       | `HERMES_SECRET_SCOPES` (comma-joined) |
| `toolAllowlist`      | `HERMES_TOOL_ALLOWLIST` (comma-joined) |
| opaque `containerPolicy` | `HERMES_CONTAINER_POLICY_JSON` (JSON) |

**What's actually enforced today:** `toolAllowlist` is enforced server-side in
Convex (`securityProfiles.assertToolAllowed`, called from the router/connector
dispatch paths before a tool call is allowed through) — independent of the
container-env plumbing below. As of this change, `egressAllowlist` /
`fsQuotaMb` / `secretScopes` are now **also enforced in-container**, for every
built-in harness (hermes, openclaw, goose, generic-cli) alike, before the
agent loop ever starts. `hasContainerPolicy: boolean` is still recorded on the
worker's registry entry (surfaced in `/list`) for operator observability.

### In-container enforcement (connector/control_plane/policy/)

Every harness image now runs a policy boot sequence as its Docker
`ENTRYPOINT` (`connector/harnesses/entrypoint.sh`, a one-line `exec` shim into
`python -m connector.control_plane.policy.entrypoint`) as the container's
FIRST process, ahead of anything agent-related:

1. **Parse** — `HERMES_EGRESS_ALLOWLIST` / `HERMES_FS_QUOTA_MB` /
   `HERMES_SECRET_SCOPES` / `HERMES_TOOL_ALLOWLIST` /
   `HERMES_CONTAINER_POLICY_JSON` are parsed into an immutable `PolicyConfig`
   (`policy/config.py`). Absent/empty vars mean "no restriction" for that
   dimension — a valid, explicit state. A present-but-malformed value (a
   non-integer quota, invalid JSON, an unrecognized `failMode`) raises before
   anything is applied.
2. **Egress (primary control)** — a threaded stdlib `http.server` forward +
   CONNECT proxy bound to loopback (`policy/egress.py`) is started and
   `HTTP_PROXY`/`HTTPS_PROXY` (+ lowercase) are exported so the agent process
   dials out through it. Every request/tunnel is checked against the host
   allowlist; anything that doesn't match is refused (HTTP 403 / closed
   tunnel), deny-by-default. This is the layer that actually holds even with
   zero container privileges — see "why not just iptables" below.
3. **Netfilter (defense-in-depth, best-effort)** — `policy/netfilter.py`
   attempts an `iptables`/`nft` `OUTPUT` lockdown pinning traffic to the proxy
   port + DNS + loopback, as a second layer behind the proxy for processes
   that ignore `HTTP(S)_PROXY` or talk raw sockets. Requires root +
   `CAP_NET_ADMIN` + a firewall binary in the image; **degrades** (never
   fails boot) when any of those is missing.
4. **FS quota** — `policy/fsquota.py` prepares a dedicated agent work
   directory, best-effort mounts a size-capped `tmpfs` there when privileged,
   and always starts a background watcher thread that polls the directory's
   size and takes a configured action (`block` default / `log` / `terminate`)
   on breach — the control that holds even without tmpfs privilege.
5. **Secret-scope filter** — `policy/secrets.py` computes a new environment
   with every secret-shaped var (`*_KEY`/`*_TOKEN`/`*_SECRET`/...) not in an
   allowed scope removed, keyed by `HERMES_SECRET_SCOPES`. Control-plane
   credentials (`HERMES_CONTROL_PLANE_URL`/`HERMES_CONNECTOR_TOKEN`) and
   runtime plumbing (`PATH`, proxy vars, etc.) always survive regardless of
   scope.
6. **Exec** — the entrypoint then `exec`s the real agent process (replacing
   its own PID, so signals land on the agent directly) with the filtered,
   proxy-aware environment, plus `HERMES_POLICY_ENFORCED=1` as a marker.

**Two-layer egress model, and why it must be this way:** Cloudflare
Containers may not grant `CAP_NET_ADMIN`, so a kernel firewall alone is not a
viable *primary* control — a container that got no such capability would run
completely unrestricted. The application-layer proxy is therefore the
mandatory, primary boundary (works with zero privilege); netfilter is a
genuine second layer bolted on **only** when the capability happens to be
present, so a process that bypasses `HTTP_PROXY` entirely still hits a wall
in the privileged case. Losing netfilter never means losing enforcement,
only losing the second layer.

**Always-allow hosts:** the control-plane host (parsed from
`HERMES_CONTROL_PLANE_URL`) and the inferred model-API host(s) (from
`HERMES_AGENT_MODEL` or whichever of `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` is
present; both `api.anthropic.com` and `api.openai.com` if ambiguous) are
folded into the effective allowlist unconditionally — an operator-set
`egressAllowlist` can never accidentally sever the agent from the control
plane or its own LLM.

**Fail-closed semantics:** a policy dimension the operator actually
configured that cannot be enforced (malformed value, a layer's enforcement
module missing/raising) aborts the container *before* the agent loop starts
— logged as `[policy] FAIL-CLOSED: refusing to start agent`, process exits
non-zero (`entrypoint.py`'s `EXIT_POLICY_REFUSED = 90`). This is opt-out only
via `HERMES_CONTAINER_POLICY_JSON={"failMode":"open"}`, which downgrades a
failure to a logged warning and starts the agent best-effort — never the
default. Capability absence (no root, no `CAP_NET_ADMIN`, no firewall
binary) is explicitly **not** a failure for the netfilter layer — it degrades
to proxy-only, since the proxy is the primary control and still holds.

**Belt-and-suspenders second hook:** `agent_runtime.main()` calls
`_enforce_boot_policy()` before constructing the control-plane client. If the
`HERMES_POLICY_ENFORCED` marker is absent (this module was started without
going through the policy entrypoint — local dev, an older image, a harness
Dockerfile that forgot to prepend it), it applies the exact same
`enforce_policy_from_env` sequence in-process and fails closed identically.
If the marker is present, it only runs a cheap `verify_or_reapply` drift
probe and never re-blocks boot on its own.

**Cross-team note (this Convex/worker plumbing, unchanged):** the manifest +
env var contract (`fleet.ts` → `lib/cloudflare.ts spawnAgent()` → the fleet
worker's `/spawn` body → the env table above) required no changes to close
this gap — it was already the correct seam. Nothing here required a
Convex/wrangler change.

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
