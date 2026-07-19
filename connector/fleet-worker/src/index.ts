/**
 * Hermes Fleet Worker — boots one isolated container per agent on Cloudflare,
 * harness-agnostic (feature 1/2/3/5, see docs/HARNESS_SPEC.md).
 *
 * The control plane (Convex, see convex/lib/cloudflare.ts) calls /spawn,
 * /terminate, /status, /restart with a shared Bearer secret. Each agent maps
 * to a Durable Object that extends the Cloudflare `Container` class and owns
 * a single Container instance. WHICH image it runs is picked by `harness`
 * (one Durable Object class/binding per harness — Cloudflare Containers bind
 * exactly one image per class at deploy time, see docs/HARNESS_SPEC.md) or,
 * for enterprise BYO-image deploys, routed to the reserved `custom` slot.
 *
 *   GET  /health     (no auth)                                        -> { ok }
 *   POST /spawn      { token, controlPlaneUrl, region?, model?, modelApiKey?,
 *                       name, harness?, imageRef?, agentCommand?,
 *                       containerPolicy? }                              -> { id, harness, harnessVersion }
 *   POST /terminate  { id }                                            -> { ok }
 *   POST /status     { id }                                            -> { status }
 *   POST /restart    { id }                                            -> { ok, status } (rolling restart, feature 5)
 *   POST /list       (no body)                                         -> { instances }
 *
 * Containers API: https://developers.cloudflare.com/containers/
 * Uses the official `@cloudflare/containers` helper package (Container class,
 * getContainer helper). The package wraps the lower-level Durable Object +
 * Container runtime bindings; pin a known-good version in package.json.
 *
 * `modelApiKey` is BYOK passthrough: when a customer supplies their own model
 * API key, the control plane forwards it here and we inject it into the
 * container as HERMES_MODEL_API_KEY. It is never logged and never echoed back
 * in any response.
 */

import { Container } from "@cloudflare/containers";
import { DurableObject } from "cloudflare:workers";
import { HARNESS_IDS, isKnownHarness, loadManifest } from "../../harnesses/registry";

export interface Env {
  /** Shared secret the control plane sends as `Authorization: Bearer <secret>`. */
  FLEET_SECRET: string;
  /**
   * One Container-backed Durable Object namespace per harness (see
   * wrangler.jsonc `containers` + `durable_objects` blocks). One DO instance
   * == one agent container.
   */
  AGENT_HERMES: DurableObjectNamespace<AgentContainer>;
  AGENT_OPENCLAW: DurableObjectNamespace<AgentContainer>;
  AGENT_GOOSE: DurableObjectNamespace<AgentContainer>;
  AGENT_GENERIC_CLI: DurableObjectNamespace<AgentContainer>;
  /** Reserved slot for enterprise BYO-image deploys (see docs/HARNESS_SPEC.md). */
  AGENT_BYO: DurableObjectNamespace<AgentContainer>;
  /**
   * Singleton Durable Object that tracks which agent ids we've spawned (and
   * which harness/binding each belongs to), so `/list`, `/status`,
   * `/terminate`, and `/restart` know which namespace to address without the
   * caller re-supplying `harness` every time.
   */
  REGISTRY: DurableObjectNamespace<FleetRegistry>;
}

/** Env injected into each agent container at boot (matches agent_runtime.py + frameworks.py). */
interface SpawnConfig {
  token?: string;
  controlPlaneUrl?: string;
  region?: string;
  model?: string;
  modelApiKey?: string;
  name?: string;
  /** Extra fixed env from the harness manifest (e.g. HERMES_AGENT_FRAMEWORK). */
  extraEnv?: Record<string, string>;
}

/**
 * Body accepted by `/spawn`. `agentCommand` is the customer-supplied argv
 * template for `generic-cli` (and an override for any other CLI-shaped
 * harness) — connector/control_plane/frameworks.py's `CliExecutor` fails fast
 * at container boot if `HERMES_AGENT_COMMAND` is unset for `harness ===
 * "generic-cli"`, so `fleet.ts deploy()` requires this field for that harness
 * before ever calling here (see the validation there); this worker still
 * honors it as a straight passthrough for any harness that accepts it.
 */
/**
 * Security-profile policy (convex/securityProfiles.ts, forwarded verbatim by
 * convex/lib/cloudflare.ts's spawnAgent()). Convex has no network boundary to
 * enforce egress/fs/secret scoping from, so the worker's job is limited to
 * turning this into env vars the container's connector MAY read — see
 * docs/HARNESS_SPEC.md "Container policy" for exactly what's enforced today
 * (tool allowlist only, server-side in Convex) vs. advisory (everything
 * here).
 */
interface ContainerPolicy {
  egressAllowlist?: string[];
  fsQuotaMb?: number;
  secretScopes?: string[];
  toolAllowlist?: string[];
  extra?: unknown;
}

interface SpawnBody {
  token?: string;
  controlPlaneUrl?: string;
  region?: string;
  model?: string;
  modelApiKey?: string;
  name?: string;
  harness?: string;
  imageRef?: string;
  agentCommand?: string;
  containerPolicy?: ContainerPolicy;
}

/** Turn a containerPolicy into the env vars the container boundary layers in at boot. */
function containerPolicyEnv(policy: ContainerPolicy | undefined): Record<string, string> {
  if (!policy) return {};
  const env: Record<string, string> = {};
  if (policy.egressAllowlist && policy.egressAllowlist.length > 0) {
    env.HERMES_EGRESS_ALLOWLIST = policy.egressAllowlist.join(",");
  }
  if (policy.fsQuotaMb !== undefined) {
    env.HERMES_FS_QUOTA_MB = String(policy.fsQuotaMb);
  }
  if (policy.secretScopes && policy.secretScopes.length > 0) {
    env.HERMES_SECRET_SCOPES = policy.secretScopes.join(",");
  }
  if (policy.toolAllowlist && policy.toolAllowlist.length > 0) {
    env.HERMES_TOOL_ALLOWLIST = policy.toolAllowlist.join(",");
  }
  if (policy.extra !== undefined) {
    try {
      env.HERMES_CONTAINER_POLICY_JSON = JSON.stringify(policy.extra);
    } catch {
      // opaque/non-serializable extra policy — skip rather than crash the spawn.
    }
  }
  return env;
}

/** Registry entry for one spawned agent, keyed by DO id string. */
interface RegistryEntry {
  name?: string;
  /** Harness id (or "custom" for BYO) — used to resolve the correct DO binding later. */
  harness: string;
  harnessVersion?: string;
  imageRef?: string;
  spawnedAt: number;
  /** True when a security profile's policy was forwarded on spawn (observability only). */
  hasContainerPolicy?: boolean;
}

/** Maps a harness id (or "custom") to its Env binding key. */
const BINDING_BY_HARNESS: Record<string, keyof Env> = {
  hermes: "AGENT_HERMES",
  openclaw: "AGENT_OPENCLAW",
  goose: "AGENT_GOOSE",
  "generic-cli": "AGENT_GENERIC_CLI",
  custom: "AGENT_BYO",
};

function bindingFor(env: Env, harness: string): DurableObjectNamespace<AgentContainer> {
  const key = BINDING_BY_HARNESS[harness];
  if (!key) throw new Error(`no container binding for harness ${JSON.stringify(harness)}`);
  return env[key] as DurableObjectNamespace<AgentContainer>;
}

/**
 * Tiny singleton Durable Object that records which agent ids exist (and which
 * harness namespace they live in), purely so `/list`/`/status`/`/terminate`/
 * `/restart` have something to look up (Cloudflare doesn't expose a "list all
 * DO instances of this class" API). Addressed via `idFromName("registry")` so
 * every call hits the same instance.
 */
export class FleetRegistry extends DurableObject<Env> {
  async add(id: string, entry: RegistryEntry): Promise<void> {
    const all = (await this.ctx.storage.get<Record<string, RegistryEntry>>("agents")) ?? {};
    all[id] = entry;
    await this.ctx.storage.put("agents", all);
  }

  async remove(id: string): Promise<void> {
    const all = (await this.ctx.storage.get<Record<string, RegistryEntry>>("agents")) ?? {};
    delete all[id];
    await this.ctx.storage.put("agents", all);
  }

  async get(id: string): Promise<RegistryEntry | undefined> {
    const all = (await this.ctx.storage.get<Record<string, RegistryEntry>>("agents")) ?? {};
    return all[id];
  }

  async list(): Promise<Record<string, RegistryEntry>> {
    return (await this.ctx.storage.get<Record<string, RegistryEntry>>("agents")) ?? {};
  }
}

function unauthorized(): Response {
  return json({ error: "unauthorized" }, 401);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Durable Object that owns exactly one agent container. Subclassed per
 * harness purely so each gets a distinct `class_name` in wrangler.jsonc
 * (Cloudflare requires one DO class per container image) — behavior is
 * identical across subclasses.
 *
 * Extending `Container` from `@cloudflare/containers` gives us lifecycle
 * helpers (start/startAndWaitForPorts, stop, destroy, getState) plus declarative
 * config via class fields. We expose tiny internal HTTP routes (/start, /stop,
 * /status) so the stateless Worker fetch handler can drive a specific instance.
 */
export class AgentContainer extends Container<Env> {
  /**
   * Port the connector listens on inside the container, if any. Every
   * harness's connector (agent_runtime) is an outbound-only worker — it dials
   * the control plane and has no inbound HTTP server — but Containers
   * currently require a `defaultPort` to health-check readiness. Every
   * harness's Dockerfile EXPOSEs a tiny liveness port for this purpose
   * (matches `health.port` in each harness.json).
   */
  defaultPort = 8080;

  /** Stop the container after this long with no traffic to save resources. */
  sleepAfter = "30m";

  /**
   * Default env vars. Per-spawn values (token, control plane URL, model, name,
   * harness-fixed env) are layered on top in `startAgent` via `start({ envVars })`,
   * which the Container runtime forwards to the container process.
   */
  envVars: Record<string, string> = {
    HERMES_CONTROL_PLANE_URL: "",
    HERMES_CONNECTOR_TOKEN: "",
    HERMES_AGENT_MODEL: "",
    HERMES_AGENT_NAME: "",
    HERMES_MODEL_API_KEY: "",
  };

  /** Start (or restart) the container with this agent's configuration. */
  async startAgent(cfg: SpawnConfig): Promise<void> {
    // NOTE: cfg.modelApiKey (BYOK) is only ever placed in the env var below —
    // never logged, never included in any response body.
    const envVars: Record<string, string> = {
      HERMES_CONTROL_PLANE_URL: cfg.controlPlaneUrl ?? "",
      HERMES_CONNECTOR_TOKEN: cfg.token ?? "",
      HERMES_AGENT_MODEL: cfg.model ?? "",
      HERMES_AGENT_NAME: cfg.name ?? "",
      HERMES_MODEL_API_KEY: cfg.modelApiKey ?? "",
      ...(cfg.extraEnv ?? {}),
    };
    // Persist on the instance so restarts (e.g. after sleep) keep the config.
    this.envVars = { ...this.envVars, ...envVars };
    // `start` boots the image with these env vars. We don't wait for ports so
    // /spawn returns fast; the connector dials the control plane on its own.
    // NOTE: if a future @cloudflare/containers version renames `start`/`envVars`,
    // bump the dep and adjust here (the public surface has been stable as
    // start({ envVars }) / startAndWaitForPorts({ envVars })).
    await this.start({ envVars: this.envVars });
  }

  /** Stop and destroy the container so it stops consuming resources. */
  async stopAgent(): Promise<void> {
    // `destroy()` tears the container down completely (vs `stop()` which can be
    // resumed). Terminate means "kill this agent", so we destroy.
    await this.destroy();
  }

  /**
   * Rolling restart (feature 5): stop the running container and reboot it with
   * the SAME env vars/config (picks up a newer image once one is rebuilt +
   * deployed for this harness's class). Unlike stopAgent, this keeps the DO
   * instance registered — the caller's vmId/agent record is unchanged.
   */
  async restartAgent(): Promise<void> {
    await this.stop();
    await this.start({ envVars: this.envVars });
  }

  /** Report a coarse running/stopped status the control plane understands. */
  async agentStatus(): Promise<string> {
    // getState() returns the runtime lifecycle ("running", "stopped",
    // "healthy", "stopping", ...). Normalize to running/stopped for the API.
    try {
      const state = await this.getState();
      const s = (typeof state === "string" ? state : (state as any)?.status ?? "").toLowerCase();
      if (s.includes("run") || s.includes("health") || s.includes("start")) return "running";
      if (!s) return "stopped";
      return s;
    } catch {
      return "stopped";
    }
  }

  /**
   * Internal HTTP surface used by the Worker to drive THIS instance. The
   * Worker holds the DO stub and calls these via stub.fetch(...).
   */
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/start" && req.method === "POST") {
      const cfg = (await req.json().catch(() => ({}))) as SpawnConfig;
      await this.startAgent(cfg);
      return json({ ok: true, status: "running" });
    }
    if (url.pathname === "/stop" && req.method === "POST") {
      await this.stopAgent();
      return json({ ok: true, status: "stopped" });
    }
    if (url.pathname === "/restart" && req.method === "POST") {
      await this.restartAgent();
      return json({ ok: true, status: await this.agentStatus() });
    }
    if (url.pathname === "/status") {
      return json({ status: await this.agentStatus() });
    }
    return json({ error: "not found" }, 404);
  }
}

// Distinct subclasses so each gets its own wrangler.jsonc `class_name` (see
// AgentContainer's docstring — behavior is identical, only the bound image
// differs, configured per-class in wrangler.jsonc's `containers` block).
export class HermesAgentContainer extends AgentContainer {}
export class OpenclawAgentContainer extends AgentContainer {}
export class GooseAgentContainer extends AgentContainer {}
export class GenericCliAgentContainer extends AgentContainer {}
export class CustomAgentContainer extends AgentContainer {}

/** Singleton stub for the fleet registry — every call addresses the same DO. */
function registryStub(env: Env) {
  return env.REGISTRY.get(env.REGISTRY.idFromName("registry"));
}

/** Resolve the DO namespace + entry a previously-spawned id belongs to, from the registry. */
async function resolveInstance(
  env: Env,
  id: string,
): Promise<{ ns: DurableObjectNamespace<AgentContainer>; entry: RegistryEntry | undefined }> {
  const entry = await registryStub(env).get(id);
  const harness = entry?.harness && BINDING_BY_HARNESS[entry.harness] ? entry.harness : "hermes";
  return { ns: bindingFor(env, harness), entry };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // --- GET /health: unauthenticated liveness check for uptime monitors. ---
    if (url.pathname === "/health" && req.method === "GET") {
      return json({ ok: true });
    }

    // --- Auth: every other request must carry the shared fleet secret. ---
    const auth = req.headers.get("Authorization") ?? "";
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.FLEET_SECRET || presented !== env.FLEET_SECRET) return unauthorized();

    // --- POST /list: enumerate known instance ids + status. ---
    // Cloudflare's Containers API has no "list all DO instances" call, so this
    // reads our own side registry (populated on /spawn, pruned on /terminate)
    // and fans out to each instance for its live status.
    if (url.pathname === "/list" && req.method === "POST") {
      const entries = await registryStub(env).list();
      const instances = await Promise.all(
        Object.entries(entries).map(async ([id, meta]) => {
          const ns = bindingFor(env, BINDING_BY_HARNESS[meta.harness] ? meta.harness : "hermes");
          const status = await ns
            .get(ns.idFromString(id))
            .agentStatus()
            .catch(() => "unknown");
          return {
            id,
            name: meta.name,
            harness: meta.harness,
            harnessVersion: meta.harnessVersion,
            imageRef: meta.imageRef,
            spawnedAt: meta.spawnedAt,
            hasContainerPolicy: !!meta.hasContainerPolicy,
            status,
          };
        }),
      );
      return json({ instances });
    }

    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    // --- POST /spawn: create a uniquely-named DO and boot its container. ---
    if (url.pathname === "/spawn") {
      const spawnBody = body as SpawnBody;
      const requestedHarness = typeof spawnBody.harness === "string" && spawnBody.harness ? spawnBody.harness : "hermes";
      const imageRef = typeof spawnBody.imageRef === "string" && spawnBody.imageRef ? spawnBody.imageRef : undefined;
      const agentCommand =
        typeof spawnBody.agentCommand === "string" && spawnBody.agentCommand.trim()
          ? spawnBody.agentCommand.trim()
          : undefined;

      // BYO image (enterprise, gated upstream by convex/fleet.ts) routes to the
      // reserved `custom` slot regardless of `harness`. Otherwise the harness
      // must be one of the built-in manifests.
      const harness = imageRef ? "custom" : requestedHarness;
      if (!imageRef && !isKnownHarness(harness)) {
        return json(
          { error: `unknown harness ${JSON.stringify(harness)} — supported: ${HARNESS_IDS.filter((h) => h !== "custom").join(", ")}` },
          400,
        );
      }

      let extraEnv: Record<string, string> = {};
      let harnessVersion: string | undefined;
      if (!imageRef) {
        const manifest = loadManifest(harness);
        extraEnv = { ...(manifest.env.fixed ?? {}) };
        harnessVersion = manifest.version;
      } else {
        // Record the requested customer image for audit/observability (see
        // docs/HARNESS_SPEC.md "BYO image" — the container itself still runs
        // whatever AGENT_BYO's class is currently configured with).
        extraEnv = { HERMES_BYO_IMAGE_REF: imageRef };
      }
      // agentCommand overrides/sets HERMES_AGENT_COMMAND for CLI-shaped
      // harnesses (required for generic-cli — see fleet.ts deploy()'s
      // validation, which never lets an unset one reach here for that
      // harness). Applied after the manifest's fixed env so a caller-supplied
      // command always wins over any manifest default.
      if (agentCommand) extraEnv = { ...extraEnv, HERMES_AGENT_COMMAND: agentCommand };
      // Container policy (security profile, feature 17) applied last so it
      // always wins over the harness manifest's fixed env / the
      // caller-supplied agentCommand for the same key (none currently
      // overlap, but this keeps the precedence explicit).
      extraEnv = { ...extraEnv, ...containerPolicyEnv(spawnBody.containerPolicy) };

      const ns = bindingFor(env, harness);
      // A fresh unique id == a brand new agent/container. We hand the caller
      // back the id string so /terminate, /status, /restart can address it
      // later. IDs are namespace-scoped in Cloudflare DO, so the registry
      // records which harness/binding this id belongs to.
      const id = ns.newUniqueId();
      const container = ns.get(id);
      await container.startAgent({
        token: spawnBody.token,
        controlPlaneUrl: spawnBody.controlPlaneUrl,
        region: spawnBody.region,
        model: spawnBody.model,
        modelApiKey: spawnBody.modelApiKey,
        name: spawnBody.name,
        extraEnv,
      });
      // Never log `body`/`spawnBody` here — they may carry `token`/`modelApiKey`.
      await registryStub(env).add(id.toString(), {
        name: spawnBody.name,
        harness,
        harnessVersion,
        imageRef,
        spawnedAt: Date.now(),
        hasContainerPolicy: !!spawnBody.containerPolicy,
      });
      return json({ id: id.toString(), harness, harnessVersion: harnessVersion ?? null });
    }

    // --- POST /terminate: stop/destroy the addressed container. ---
    if (url.pathname === "/terminate") {
      if (!body.id) return json({ error: "missing id" }, 400);
      const { ns } = await resolveInstance(env, body.id);
      const container = ns.get(ns.idFromString(body.id));
      await container.stopAgent();
      await registryStub(env).remove(body.id);
      return json({ ok: true });
    }

    // --- POST /status: report running/stopped for the addressed container. ---
    if (url.pathname === "/status") {
      if (!body.id) return json({ error: "missing id" }, 400);
      const { ns } = await resolveInstance(env, body.id);
      const container = ns.get(ns.idFromString(body.id));
      const status = await container.agentStatus();
      return json({ status });
    }

    // --- POST /restart: rolling restart of one already-running container. ---
    // Draining (skip agents with in-flight work) is the caller's (fleet.ts)
    // responsibility — this endpoint just performs the stop+start.
    if (url.pathname === "/restart") {
      if (!body.id) return json({ error: "missing id" }, 400);
      const { ns } = await resolveInstance(env, body.id);
      const container = ns.get(ns.idFromString(body.id));
      await container.restartAgent();
      const status = await container.agentStatus();
      return json({ ok: true, status });
    }

    return json({ error: "not found" }, 404);
  },
};
