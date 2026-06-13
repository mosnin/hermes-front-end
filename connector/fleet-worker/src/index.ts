/**
 * Hermes Fleet Worker — boots one isolated container per agent on Cloudflare.
 *
 * The control plane (Convex) calls /spawn, /terminate, /status with a shared
 * Bearer secret. Each agent maps to a Durable Object that owns a Container
 * instance running the Hermes connector image.
 *
 * This is a working scaffold: wire the Container binding (see wrangler.jsonc)
 * to your connector image and complete the start/stop calls per the current
 * Cloudflare Containers docs (https://developers.cloudflare.com/containers/).
 */

export interface Env {
  FLEET_SECRET: string;
  // Container-backed Durable Object namespace (see wrangler.jsonc).
  AGENT: DurableObjectNamespace;
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.FLEET_SECRET || token !== env.FLEET_SECRET) return unauthorized();

    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as any;

    if (url.pathname === "/spawn" && req.method === "POST") {
      // One agent == one Durable Object (named by a fresh id) owning a container.
      const id = env.AGENT.newUniqueId();
      const stub = env.AGENT.get(id);
      await stub.fetch("https://agent/start", {
        method: "POST",
        body: JSON.stringify({
          token: body.token,
          controlPlaneUrl: body.controlPlaneUrl,
          model: body.model,
          name: body.name,
        }),
      });
      return json({ id: id.toString() });
    }

    if (url.pathname === "/terminate" && req.method === "POST") {
      const stub = env.AGENT.get(env.AGENT.idFromString(body.id));
      await stub.fetch("https://agent/stop", { method: "POST" });
      return json({ ok: true });
    }

    if (url.pathname === "/status" && req.method === "POST") {
      const stub = env.AGENT.get(env.AGENT.idFromString(body.id));
      const res = await stub.fetch("https://agent/status");
      return json({ status: (await res.text()) || "unknown" });
    }

    return json({ error: "not found" }, 404);
  },
};

/**
 * Durable Object that owns one agent container. Replace the TODOs with the
 * Cloudflare Containers binding calls (container.start({ env }), container.stop()).
 */
export class Agent {
  state: DurableObjectState;
  // @ts-expect-error container binding is provided by the Containers runtime
  container: { start: (o: { env: Record<string, string> }) => Promise<void>; stop: () => Promise<void>; running: boolean };

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/start") {
      const cfg = (await req.json()) as any;
      await this.container.start({
        env: {
          HERMES_CONTROL_PLANE_URL: cfg.controlPlaneUrl ?? "",
          HERMES_CONNECTOR_TOKEN: cfg.token ?? "",
          HERMES_AGENT_MODEL: cfg.model ?? "",
          HERMES_AGENT_NAME: cfg.name ?? "",
        },
      });
      return new Response("started");
    }
    if (url.pathname === "/stop") {
      await this.container.stop();
      return new Response("stopped");
    }
    if (url.pathname === "/status") {
      return new Response(this.container?.running ? "running" : "stopped");
    }
    return new Response("not found", { status: 404 });
  }
}
