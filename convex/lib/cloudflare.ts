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
