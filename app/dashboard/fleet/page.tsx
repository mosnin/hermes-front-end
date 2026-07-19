"use client";

import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState, Input, Modal, SkeletonRows } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Boxes, KeyRound, RefreshCw, Rocket, Trash2 } from "@/components/icons";
import { TemplatesPanel } from "@/components/fleet/TemplatesPanel";
import { AutoscalePanel } from "@/components/fleet/AutoscalePanel";
import { RestartPanel } from "@/components/fleet/RestartPanel";
import { EASE } from "@/components/site/motion";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  PageHead,
  PillButton,
  Panel,
  StatTile,
  StatRow,
  ListRow,
  Dot,
  SectionLabel,
} from "@/components/dash/kit";

const deployTone = {
  provisioning: "yellow",
  running: "green",
  stopped: "default",
  failed: "red",
} as const;

/** Map a fleet agent's status string to a kit Dot tone. */
function fleetDotTone(status?: string): "online" | "paused" | "idle" | "error" {
  if (status === "online") return "online";
  if (status === "degraded") return "error";
  if (status === "pending") return "idle";
  return "idle";
}

function fleetListContainer(reduce: boolean | null): Variants {
  return { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.04 } } };
}

function fleetListItem(reduce: boolean | null): Variants {
  return {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? 0.3 : 0.5, ease: EASE } },
  };
}

export default function FleetPage() {
  const { spaceId, active } = useActiveSpace();
  const canAdmin = useCan("admin");
  const canOperate = useCan("operator");
  const toast = useToast();
  const reduce = useReducedMotion();

  const provider = useQuery(api.fleet.providerStatus, {});
  const harnessCatalog = useQuery(api.fleet.harnessCatalog, {});
  const fleet = useQuery(api.fleet.list, spaceId ? { spaceId } : "skip");
  const org = useQuery(api.fleet.orgChart, spaceId ? { spaceId } : "skip");
  const squads = useQuery(api.squads.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  // Hosted-agent plan usage. Falls back to counting the fleet list client-side
  // if entitlements hasn't loaded yet, so the page still shows something sane.
  const entitlements = useQuery(
    api.billing.entitlements,
    spaceId ? { spaceId } : "skip",
  );
  const fleetList = fleet ?? [];
  const runningCount = fleetList.filter((a) => a.deploymentStatus === "running").length;
  const provisioningCount = fleetList.filter((a) => a.deploymentStatus === "provisioning").length;
  const hostedUsed =
    entitlements?.usage.hostedAgents ??
    fleetList.filter(
      (a) => a.deploymentStatus === "provisioning" || a.deploymentStatus === "running",
    ).length;
  const hostedLimit = entitlements?.limits.hostedAgents;
  const hostedLimitLabel = hostedLimit && hostedLimit >= 100000 ? "unlimited plan" : `of ${hostedLimit ?? "—"} allowed`;
  const atLimit = typeof hostedLimit === "number" && hostedUsed >= hostedLimit && hostedLimit > 0;

  const deploy = useAction(api.fleet.deploy);
  const terminate = useAction(api.fleet.terminate);
  const refreshStatus = useAction(api.fleet.refreshStatus);

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [prefix, setPrefix] = useState("Agent");
  const [region, setRegion] = useState("");
  const [model, setModel] = useState("claude-opus-4-8");
  const [apiKey, setApiKey] = useState("");
  const [harness, setHarness] = useState("hermes");
  const [imageRef, setImageRef] = useState("");
  const [squad, setSquad] = useState("");
  const [manager, setManager] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
        modelApiKey: apiKey.trim() || undefined,
        harness: imageRef.trim() ? undefined : harness || undefined,
        imageRef: imageRef.trim() || undefined,
      });
      if (res.cloudflare) {
        toast(`Deployed ${res.deployed.length} agent(s) on Cloudflare`, "success");
        setOpen(false);
      } else {
        // Not configured — surface the one-time tokens to connect manually.
        setTokens(res.deployed.map((d) => ({ name: d.name, token: d.token })));
        toast("Agents created, Cloudflare not configured, connect manually", "info");
      }
      setApiKey("");
      setImageRef("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Deploy failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doRefresh() {
    if (!spaceId) return;
    setRefreshing(true);
    try {
      await refreshStatus({ spaceId });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Refresh failed", "error");
    } finally {
      setRefreshing(false);
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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · fleet`}
          title="Fleet"
          sub="One-click deploy agents onto cloud VMs and assign them to your hierarchy. Each agent runs isolated and auto-connects."
          actions={
            <>
              <PillButton variant="outline" onClick={doRefresh} className={refreshing || !spaceId ? "pointer-events-none opacity-60" : undefined}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh status"}
              </PillButton>
              <PillButton onClick={() => canOperate && setOpen(true)} className={!canOperate ? "pointer-events-none opacity-50" : undefined}>
                <Rocket className="h-4 w-4" /> Deploy agents
              </PillButton>
            </>
          }
        />

        <StatRow>
          <StatTile value={fleetList.length} label="Deployed agents" hint="in fleet" tone="ink" />
          <StatTile value={runningCount} label="Running" hint="healthy now" />
          <StatTile value={provisioningCount} label="Provisioning" hint="spinning up" />
          <StatTile value={hostedUsed} label="Hosted usage" hint={hostedLimitLabel} />
        </StatRow>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[13px] text-[var(--muted-strong)]">
            <Dot tone={provider?.cloudflare ? "online" : "idle"} />
            Cloudflare {provider?.cloudflare ? "configured" : "not configured"}
          </span>
          {atLimit && <Badge tone="yellow">at limit</Badge>}
        </div>

        {!provider?.cloudflare && (
          <Panel tone="band">
            <p className="text-[14.5px] font-medium text-amber-700">Cadre Cloud isn&apos;t enabled yet</p>
            <p className="mt-1 text-[13.5px] text-[var(--muted)]">
              Managed hosting requires <code>CLOUDFLARE_FLEET_WORKER_URL</code> +{" "}
              <code>CLOUDFLARE_FLEET_SECRET</code> (deploy the worker in
              connector/fleet-worker). Until then, deploy still creates agents
              and hands you one-time tokens to connect them manually.
            </p>
          </Panel>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Panel title="Deployed agents">
            {fleet === undefined ? (
              <SkeletonRows rows={4} />
            ) : fleetList.length === 0 ? (
              <EmptyState
                title="No fleet agents yet"
                body="Deploy your first batch of agents onto the cloud."
                action={
                  <PillButton onClick={() => setOpen(true)} className={!canOperate ? "pointer-events-none opacity-50" : undefined}>
                    Deploy agents
                  </PillButton>
                }
              />
            ) : (
              // Semantic <ul>/<li>, so this hand-rolls the Stagger/StaggerItem
              // variant shape directly on motion.ul/motion.li (those helpers
              // only support block-level container tags, not lists).
              <motion.ul
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-40px", amount: 0.2 }}
                variants={fleetListContainer(reduce)}
              >
                {fleetList.map((a) => (
                  <motion.li key={a._id} variants={fleetListItem(reduce)}>
                    <ListRow
                      leading={<Dot tone={fleetDotTone(a.status)} />}
                      title={a.name}
                      trailing={
                        <div className="flex items-center gap-1.5">
                          <Badge>{a.region ?? a.vmProvider}</Badge>
                          {a.harness && a.harness !== "hermes" && <Badge tone="blue">{a.harness}</Badge>}
                          <Badge tone={deployTone[a.deploymentStatus ?? "provisioning"]}>
                            {a.deploymentStatus ?? "provisioning"}
                          </Badge>
                          {canAdmin && (
                            <button
                              onClick={() => spaceId && terminate({ spaceId, agentId: a._id })}
                              className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[#fbe9e9] hover:text-red-500"
                              title="Terminate"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      }
                    />
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </Panel>

          <Panel title="Org chart" tone="band">
            {tree.roots.length === 0 ? (
              <p className="text-[13.5px] text-[var(--muted)]">No agents yet.</p>
            ) : (
              <div className="space-y-1">
                {tree.roots.map((n) => (
                  <OrgNode key={n.id} node={n} byParent={tree.byParent} depth={0} />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {spaceId && (
          <div>
            <SectionLabel>autoscaling · templates · restarts</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
              <AutoscalePanel spaceId={spaceId} />
              <TemplatesPanel spaceId={spaceId} />
              <RestartPanel spaceId={spaceId} />
            </div>
          </div>
        )}
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
              <label className="mb-1 block text-xs text-muted">Harness</label>
              <select
                value={harness}
                onChange={(e) => setHarness(e.target.value)}
                disabled={!!imageRef.trim()}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm disabled:opacity-50"
              >
                {(harnessCatalog ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{h.displayName ?? h.id}</option>
                ))}
                {(harnessCatalog ?? []).length === 0 && (
                  <option value="hermes">hermes</option>
                )}
              </select>
              {harnessCatalog?.find((h) => h.id === harness)?.description && (
                <p className="mt-1 text-xs text-muted">
                  {harnessCatalog.find((h) => h.id === harness)?.description}
                </p>
              )}
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

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">
              <KeyRound className="h-3 w-3" /> Model API key (optional)
            </label>
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
            />
            <p className="mt-1 text-xs text-muted">
              BYOK: passed to the container as a runtime secret, never stored on
              the agent record. Leave blank to configure keys on the agent later.
            </p>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs text-muted">
              <Boxes className="h-3 w-3" /> Bring your own container image (optional)
            </label>
            <Input
              value={imageRef}
              onChange={(e) => setImageRef(e.target.value)}
              placeholder="registry.example.com/my-agent:latest"
              disabled={entitlements?.plan !== "enterprise"}
            />
            <p className="mt-1 text-xs text-muted">
              {entitlements?.plan === "enterprise"
                ? "Overrides the harness picker above and boots this image directly."
                : "Enterprise plan only. Upgrade to deploy an arbitrary container image instead of a built-in harness."}
            </p>
          </div>

          {tokens && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs text-amber-800">
                Cloudflare isn&apos;t configured, connect these agents manually with
                their one-time tokens:
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-surface-2 p-2 text-[11px]">
                {tokens.map((t) => `${t.name}: ${t.token}`).join("\n")}
              </pre>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <PillButton variant="outline" onClick={() => setOpen(false)}>Close</PillButton>
            <PillButton onClick={submit} className={busy ? "pointer-events-none opacity-60" : undefined}>
              {busy ? "Deploying…" : "Deploy"}
            </PillButton>
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
        className="flex items-center gap-2 rounded-md px-2 py-1 text-[13.5px] text-[var(--foreground)]"
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        <Dot tone={fleetDotTone(node.status)} />
        <span className="truncate">{node.name}</span>
        {node.vmProvider && <Badge tone="blue">{node.vmProvider}</Badge>}
      </div>
      {children.map((c) => (
        <OrgNode key={c.id} node={c} byParent={byParent} depth={depth + 1} />
      ))}
    </div>
  );
}
