// Cloudflare fleet provider — spins up an isolated container per agent.
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

/** Boot one agent container. Returns the Cloudflare instance id. */
export async function spawnAgent(args: {
  token: string;
  controlPlaneUrl: string;
  region?: string;
  model?: string;
  name: string;
}): Promise<{ vmId: string }> {
  const data = await call("/spawn", {
    token: args.token,
    controlPlaneUrl: args.controlPlaneUrl,
    region: args.region,
    model: args.model,
    name: args.name,
  });
  return { vmId: data.id ?? data.vmId ?? "" };
}

export async function terminateAgent(vmId: string): Promise<void> {
  await call("/terminate", { id: vmId });
}

export async function agentStatus(vmId: string): Promise<string> {
  const data = await call("/status", { id: vmId });
  return data.status ?? "unknown";
}
