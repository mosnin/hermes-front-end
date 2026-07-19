// Cloudflare fleet provider — spins up an isolated container per agent,
// harness-agnostic (features 1,2,3,5 — see docs/HARNESS_SPEC.md).
//
// Cloudflare doesn't expose a generic "create a VM" REST call; instead you
// deploy a small Cloudflare Worker (see connector/fleet-worker/) that uses
// Cloudflare Containers + Durable Objects to boot one container per agent. The
// control plane talks to THAT worker. Configure in the Convex env:
//   CLOUDFLARE_FLEET_WORKER_URL   https://fleet.<your-worker>.workers.dev
//   CLOUDFLARE_FLEET_SECRET       shared secret the worker checks
//
// When unconfigured, deploy() still provisions the agent record + token so you
// can run the connector by hand — the dashboard just shows it "provisioning".

/**
 * Harness ids the worker/manifests know how to boot. Convex functions can
 * only import from within convex/ (the bundler restricts it), so this list
 * is intentionally a mirror of connector/harnesses/schema.ts's HARNESS_IDS —
 * keep them in sync when adding a harness (see docs/HARNESS_SPEC.md step 6;
 * convex/tests/fleet.test.ts documents the expectation).
 */
export const KNOWN_HARNESS_IDS = ["hermes", "openclaw", "goose", "generic-cli"] as const;
export type KnownHarnessId = (typeof KNOWN_HARNESS_IDS)[number];

export function isKnownHarness(id: string): id is KnownHarnessId {
  return (KNOWN_HARNESS_IDS as readonly string[]).includes(id);
}

/**
 * Display + capability metadata for each built-in harness, mirrored from
 * connector/harnesses/<id>/harness.json for the same cross-boundary reason as
 * `KNOWN_HARNESS_IDS` above (convex/ can't import connector/ code). Drives:
 *   - `fleet.harnessCatalog` — a public query UIs can use to build a harness
 *     picker (id/displayName/description/version/capabilities) without any
 *     team needing to touch connector/harnesses/** themselves.
 *   - `agents.capabilities` on hosted deploys (see fleet.ts deploy()) — feeds
 *     the A2A directory/card listing (capabilities.ts) with the framework's
 *     real capability tags instead of leaving it empty for fleet agents.
 *
 * Keep in sync with the harness.json files when adding/changing a harness —
 * convex/tests/fleet.test.ts has a tripwire test for it.
 */
export const HARNESS_CATALOG: Record<
  KnownHarnessId,
  { displayName: string; description: string; version: string; capabilities: string[] }
> = {
  hermes: {
    displayName: "Hermes (built-in)",
    description:
      "The default agentic LLM loop: Anthropic/OpenAI tool-use with MCP tools + RAG context, wired straight to the control plane. No external agent framework installed.",
    version: "1.0.0",
    capabilities: ["chat", "workflow", "rag", "mcp"],
  },
  openclaw: {
    displayName: "OpenClaw",
    description:
      "Runs the OpenClaw CLI agent for each dispatched instruction. The connector still owns registration, heartbeat, A2A and work-stream plumbing; OpenClaw only produces the response text.",
    version: "0.1.0",
    capabilities: ["chat", "workflow", "framework:openclaw"],
  },
  goose: {
    displayName: "Goose (Block)",
    description: "Runs Block's Goose CLI headlessly for each dispatched instruction.",
    version: "1.0.0",
    capabilities: ["chat", "workflow", "framework:goose"],
  },
  "generic-cli": {
    displayName: "Generic CLI agent",
    description:
      "Wraps an arbitrary CLI agent binary via HERMES_AGENT_COMMAND ('{instruction}' substituted, or piped on stdin).",
    version: "1.0.0",
    capabilities: ["chat", "workflow", "framework:cli"],
  },
};

/** Capability tags this Convex mirror advertises for a resolved harness (or "custom" BYO). */
export function harnessCapabilities(harness: string): string[] {
  if (harness in HARNESS_CATALOG) return HARNESS_CATALOG[harness as KnownHarnessId].capabilities;
  // BYO-image (harness === "custom") has no known manifest — the image is
  // opaque to us, so advertise only the baseline every harness supports.
  return ["chat", "workflow"];
}

export function cloudflareConfigured(): boolean {
  return !!process.env.CLOUDFLARE_FLEET_WORKER_URL && !!process.env.CLOUDFLARE_FLEET_SECRET;
}

async function call(path: string, body: unknown): Promise<any> {
  const base = process.env.CLOUDFLARE_FLEET_WORKER_URL!;
  const secret = process.env.CLOUDFLARE_FLEET_SECRET!;
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`cloudflare fleet ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

/** Boot one agent container. Returns the Cloudflare instance id + resolved harness/version. */
export async function spawnAgent(args: {
  token: string;
  controlPlaneUrl: string;
  region?: string;
  model?: string;
  /** BYOK passthrough: the customer's own model API key, if they supplied one. */
  modelApiKey?: string;
  name: string;
  /** Which harness runtime image to boot; defaults to "hermes" in the worker. */
  harness?: string;
  /**
   * BYO image (enterprise-gated by the caller — see fleet.ts deploy()): an
   * arbitrary container image ref. When set, the worker routes to the
   * reserved "custom" slot instead of `harness`. See docs/HARNESS_SPEC.md.
   */
  imageRef?: string;
  /**
   * argv template for CLI-shaped harnesses (HERMES_AGENT_COMMAND). Required
   * by fleet.ts deploy() when `harness === "generic-cli"` — that harness's
   * adapter (connector/control_plane/frameworks.py's CliExecutor) fails fast
   * at container boot without it. Optional override for other harnesses.
   */
  agentCommand?: string;
}): Promise<{ vmId: string; harness: string; harnessVersion: string | null }> {
  const data = await call("/spawn", {
    token: args.token,
    controlPlaneUrl: args.controlPlaneUrl,
    region: args.region,
    model: args.model,
    modelApiKey: args.modelApiKey,
    name: args.name,
    harness: args.harness,
    imageRef: args.imageRef,
    agentCommand: args.agentCommand,
  });
  return {
    vmId: data.id ?? data.vmId ?? "",
    harness: data.harness ?? args.harness ?? "hermes",
    harnessVersion: data.harnessVersion ?? null,
  };
}

export async function terminateAgent(vmId: string): Promise<void> {
  await call("/terminate", { id: vmId });
}

export async function agentStatus(vmId: string): Promise<string> {
  const data = await call("/status", { id: vmId });
  return data.status ?? "unknown";
}

/** Rolling restart (feature 5): stop + reboot one already-running container in place. */
export async function restartAgent(vmId: string): Promise<string> {
  const data = await call("/restart", { id: vmId });
  return data.status ?? "unknown";
}
