/**
 * Hermes Fleet Worker — boots one isolated container per agent on Cloudflare.
 *
 * The control plane (Convex, see convex/lib/cloudflare.ts) calls /spawn,
 * /terminate, /status with a shared Bearer secret. Each agent maps to a
 * Durable Object that extends the Cloudflare `Container` class and owns a
 * single Container instance running the Hermes connector image (see Dockerfile).
 *
 *   POST /spawn     { token, controlPlaneUrl, region?, model?, name } -> { id }
 *   POST /terminate { id }                                            -> { ok }
 *   POST /status    { id }                                            -> { status }
 *
 * Containers API: https://developers.cloudflare.com/containers/
 * Uses the official `@cloudflare/containers` helper package (Container class,
 * getContainer helper). The package wraps the lower-level Durable Object +
 * Container runtime bindings; pin a known-good version in package.json.
 */

import { Container } from "@cloudflare/containers";

export interface Env {
  /** Shared secret the control plane sends as `Authorization: Bearer <secret>`. */
  FLEET_SECRET: string;
  /**
   * Container-backed Durable Object namespace (see wrangler.jsonc `containers`
   * + `durable_objects` blocks). One DO instance == one agent container.
   */
  AGENT: DurableObjectNamespace<AgentContainer>;
}

/** Env injected into each agent container at boot (matches agent_runtime.py). */
interface SpawnConfig {
  token?: string;
  controlPlaneUrl?: string;
  region?: string;
  model?: string;
  name?: string;
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
 * Durable Object that owns exactly one agent container.
 *
 * Extending `Container` from `@cloudflare/containers` gives us lifecycle
 * helpers (start/startAndWaitForPorts, stop, destroy, getState) plus declarative
 * config via class fields. We expose tiny internal HTTP routes (/start, /stop,
 * /status) so the stateless Worker fetch handler can drive a specific instance.
 */
export class AgentContainer extends Container<Env> {
  /**
   * Port the connector listens on inside the container, if any. The Hermes
   * connector (agent_runtime) is an outbound-only worker — it dials the control
   * plane and has no inbound HTTP server — but Containers currently require a
   * `defaultPort` to health-check readiness. The Dockerfile EXPOSEs a tiny
   * liveness port for this purpose.
   */
  defaultPort = 8080;

  /** Stop the container after this long with no traffic to save resources. */
  sleepAfter = "30m";

  /**
   * Default env vars. Per-spawn values (token, control plane URL, model, name)
   * are layered on top in `startAgent` via `start({ envVars })`, which the
   * Container runtime forwards to the container process.
   */
  envVars: Record<string, string> = {
    HERMES_CONTROL_PLANE_URL: "",
    HERMES_CONNECTOR_TOKEN: "",
    HERMES_AGENT_MODEL: "",
    HERMES_AGENT_NAME: "",
  };

  /** Start (or restart) the container with this agent's configuration. */
  async startAgent(cfg: SpawnConfig): Promise<void> {
    const envVars: Record<string, string> = {
      HERMES_CONTROL_PLANE_URL: cfg.controlPlaneUrl ?? "",
      HERMES_CONNECTOR_TOKEN: cfg.token ?? "",
      HERMES_AGENT_MODEL: cfg.model ?? "",
      HERMES_AGENT_NAME: cfg.name ?? "",
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
    if (url.pathname === "/status") {
      return json({ status: await this.agentStatus() });
    }
    return json({ error: "not found" }, 404);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // --- Auth: every request must carry the shared fleet secret. ---
    const auth = req.headers.get("Authorization") ?? "";
    const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.FLEET_SECRET || presented !== env.FLEET_SECRET) return unauthorized();

    const url = new URL(req.url);
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;

    // --- POST /spawn: create a uniquely-named DO and boot its container. ---
    if (url.pathname === "/spawn") {
      // A fresh unique id == a brand new agent/container. We hand the caller
      // back the id string so /terminate and /status can address it later.
      const id = env.AGENT.newUniqueId();
      // env.AGENT.get(id) returns the typed DO stub (our AgentContainer).
      // (The @cloudflare/containers `getContainer(binding, name)` helper takes
      //  a string name; we address instances by DurableObjectId instead so the
      //  control plane can round-trip the exact id via /terminate and /status.)
      const container = env.AGENT.get(id);
      await container.startAgent({
        token: body.token,
        controlPlaneUrl: body.controlPlaneUrl,
        region: body.region,
        model: body.model,
        name: body.name,
      });
      return json({ id: id.toString() });
    }

    // --- POST /terminate: stop/destroy the addressed container. ---
    if (url.pathname === "/terminate") {
      if (!body.id) return json({ error: "missing id" }, 400);
      const container = env.AGENT.get(env.AGENT.idFromString(body.id));
      await container.stopAgent();
      return json({ ok: true });
    }

    // --- POST /status: report running/stopped for the addressed container. ---
    if (url.pathname === "/status") {
      if (!body.id) return json({ error: "missing id" }, 400);
      const container = env.AGENT.get(env.AGENT.idFromString(body.id));
      const status = await container.agentStatus();
      return json({ status });
    }

    return json({ error: "not found" }, 404);
  },
};
