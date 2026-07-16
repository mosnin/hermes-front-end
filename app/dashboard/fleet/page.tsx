"use client";

import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, StatusDot } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Cloud, Plus, Rocket, Trash2 } from "@/components/icons";

const deployTone = {
  provisioning: "yellow",
  running: "green",
  stopped: "default",
  failed: "red",
} as const;

export default function FleetPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const canOperate = useCan("operator");
  const toast = useToast();

  const provider = useQuery(api.fleet.providerStatus, {});
  const fleet = useQuery(api.fleet.list, spaceId ? { spaceId } : "skip");
  const org = useQuery(api.fleet.orgChart, spaceId ? { spaceId } : "skip");
  const squads = useQuery(api.squads.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");

  const deploy = useAction(api.fleet.deploy);
  const terminate = useAction(api.fleet.terminate);

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [prefix, setPrefix] = useState("Agent");
  const [region, setRegion] = useState("");
  const [model, setModel] = useState("claude-opus-4-8");
  const [squad, setSquad] = useState("");
  const [manager, setManager] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<{ name: string; token: string }[] | null>(null);

  async function submit() {
    if (!spaceId) return;
    setBusy(true);
    setTokens(null);
    try {
      const res = await deploy({
        spaceId,
        count: Math.max(1, Math.min(count, 25)),
        namePrefix: prefix.trim() || "Agent",
        region: region.trim() || undefined,
        model: model.trim() || undefined,
        squadId: squad ? (squad as Id<"squads">) : undefined,
        reportsTo: manager ? (manager as Id<"agents">) : undefined,
      });
      if (res.cloudflare) {
        toast(`Deployed ${res.deployed.length} agent(s) on Cloudflare`, "success");
        setOpen(false);
      } else {
        // Not configured — surface the one-time tokens to connect manually.
        setTokens(res.deployed.map((d) => ({ name: d.name, token: d.token })));
        toast("Agents created, Cloudflare not configured, connect manually", "info");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Deploy failed", "error");
    } finally {
      setBusy(false);
    }
  }

  // Build the org tree from reportsTo.
  const tree = useMemo(() => {
    const nodes = org ?? [];
    const byParent = new Map<string | null, typeof nodes>();
    for (const n of nodes) {
      const key = (n.reportsTo as string | null) ?? null;
      const arr = byParent.get(key) ?? [];
      arr.push(n);
      byParent.set(key, arr);
    }
    const ids = new Set<string>(nodes.map((n) => n.id));
    // Roots: no manager, or manager outside this set.
    const roots = nodes.filter((n) => !n.reportsTo || !ids.has(n.reportsTo as string));
    return { byParent, roots };
  }, [org]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fleet</h1>
          <p className="text-sm text-muted">
            One-click deploy agents onto cloud VMs and assign them to your
            hierarchy. Each agent runs isolated and auto-connects.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={!canOperate}>
          <Rocket className="h-4 w-4" /> Deploy agents
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <Cloud className="h-4 w-4 text-accent" />
        Cloudflare:
        {provider?.cloudflare ? (
          <Badge tone="green">configured</Badge>
        ) : (
          <span className="text-muted">
            not configured, set <code>CLOUDFLARE_FLEET_WORKER_URL</code> +{" "}
            <code>CLOUDFLARE_FLEET_SECRET</code> (deploy the worker in
            connector/fleet-worker). Agents still provision; connect them manually.
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="mb-3 font-semibold">Deployed agents</h2>
          {fleet?.length === 0 ? (
            <EmptyState
              title="No fleet agents yet"
              body="Deploy your first batch of agents onto the cloud."
              action={<Button onClick={() => setOpen(true)} disabled={!canOperate}>Deploy agents</Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {(fleet ?? []).map((a) => (
                <li key={a._id} className="flex items-center gap-3 py-2">
                  <StatusDot status={a.status} />
                  <span className="flex-1 truncate text-sm">{a.name}</span>
                  <Badge>{a.region ?? a.vmProvider}</Badge>
                  <Badge tone={deployTone[a.deploymentStatus ?? "provisioning"]}>
                    {a.deploymentStatus ?? "provisioning"}
                  </Badge>
                  {canAdmin && (
                    <button
                      onClick={() => spaceId && terminate({ spaceId, agentId: a._id })}
                      className="text-muted hover:text-red-400"
                      title="Terminate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Org chart</h2>
          {tree.roots.length === 0 ? (
            <p className="text-sm text-muted">No agents yet.</p>
          ) : (
            <div className="space-y-1">
              {tree.roots.map((n) => (
                <OrgNode key={n.id} node={n} byParent={tree.byParent} depth={0} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Deploy agents">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">How many</label>
              <Input
                type="number"
                min={1}
                max={25}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Name prefix</label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Region (optional)</label>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="auto" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Model</label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Squad (optional)</label>
              <select
                value={squad}
                onChange={(e) => setSquad(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {(squads ?? []).map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Reports to (optional)</label>
              <select
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <option value="">— none —</option>
                {(agents ?? []).map((a) => (
                  <option key={a._id} value={a._id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {tokens && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-2 text-xs text-amber-300">
                Cloudflare isn&apos;t configured, connect these agents manually with
                their one-time tokens:
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-surface-2 p-2 text-[11px]">
                {tokens.map((t) => `${t.name}: ${t.token}`).join("\n")}
              </pre>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Deploying…" : <><Plus className="h-4 w-4" /> Deploy</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

type Node = { id: string; name: string; status: string; reportsTo: string | null; vmProvider: string | null };

function OrgNode({
  node,
  byParent,
  depth,
}: {
  node: Node;
  byParent: Map<string | null, Node[]>;
  depth: number;
}) {
  const children = byParent.get(node.id) ?? [];
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm"
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <StatusDot status={node.status} />
        <span className="truncate">{node.name}</span>
        {node.vmProvider && <Badge tone="blue">{node.vmProvider}</Badge>}
      </div>
      {children.map((c) => (
        <OrgNode key={c.id} node={c} byParent={byParent} depth={depth + 1} />
      ))}
    </div>
  );
}
