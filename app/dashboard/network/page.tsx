"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, StatusDot, Toggle } from "@/components/ui";
import { MeshGraphic } from "@/components/marketing/graphics";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { ArrowRight, Globe, Plus, Send, Target, Trash2, Wrench } from "@/components/icons";
import { EASE, Reveal, Stagger, StaggerItem } from "@/components/site/motion";

// `Stagger`/`StaggerItem` (Lane A, components/site/motion.tsx) only support
// block-level tags (div/span/h1-4/p/li), not `ul`/`ol` containers. For the
// two `<ul>` list containers on this page we cascade children with raw
// `motion/react` using the same easing/variant shape instead.
function listContainerVariants(reduce: boolean | null): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.05 } },
  };
}
function listItemVariants(reduce: boolean | null): Variants {
  return {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? 0.2 : 0.5, ease: EASE } },
  };
}

export default function NetworkPage() {
  const { spaceId } = useActiveSpace();
  const directory = useQuery(api.a2a.directory, spaceId ? { spaceId } : "skip");
  const messages = useQuery(api.a2a.recent, spaceId ? { spaceId, limit: 50 } : "skip");
  const send = useMutation(api.a2a.send);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!from || !to || from === to || !content.trim() || !spaceId) return;
    setBusy(true);
    setError(null);
    try {
      await send({
        spaceId,
        fromAgentId: from as Id<"agents">,
        toAgentId: to as Id<"agents">,
        content: content.trim(),
      });
      setContent("");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*GuardViolation: /, "Blocked: ") : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const agents = directory ?? [];
  const reduce = useReducedMotion();
  const containerV = listContainerVariants(reduce);
  const itemV = listItemVariants(reduce);

  return (
    <div className="p-8">
      <Reveal className="mb-6" y={12}>
        <h1 className="text-2xl font-semibold">Agent network</h1>
        <p className="text-sm text-muted">
          Agents coordinate in real time through the A2A broker, guarded by
          loop detection, budgets, and the Space kill switch.
        </p>
      </Reveal>

      {agents.length < 2 ? (
        <Reveal>
          <EmptyState
            graphic={<MeshGraphic />}
            title="Connect at least two agents"
            body="A2A needs two or more agents to coordinate. Connect another agent (or load demo data), then route messages between them here."
          />
        </Reveal>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <Reveal x={-16} y={0}>
              <Card>
                <h2 className="mb-3 font-semibold">Directory (Agent Cards)</h2>
                <motion.ul
                  className="space-y-2"
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px", amount: 0.2 }}
                  variants={containerV}
                >
                  {agents.map((c) => (
                    <motion.li key={c.id} variants={itemV}>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <StatusDot status={c.status} />
                          <span className="text-sm font-medium">{c.name}</span>
                          <Badge>{c.kind}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.skills.map((s) => (
                            <Badge key={s.id} tone="blue">
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              </Card>
            </Reveal>

            <Reveal x={-16} y={0} delay={0.06}>
            <Card>
              <h2 className="mb-3 font-semibold">Route a message</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                  >
                    <option value="">From…</option>
                    {agents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                  <select
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                  >
                    <option value="">To…</option>
                    {agents
                      .filter((c) => c.id !== from)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="Message to relay between agents…"
                  />
                  <Button
                    onClick={submit}
                    disabled={busy || !from || !to || from === to || !content.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            </Card>
            </Reveal>
          </div>

          <Reveal x={16} y={0} delay={0.1}>
          <Card>
            <h2 className="mb-3 font-semibold">Live inter-agent messages</h2>
            {messages === undefined ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted">
                No agent-to-agent messages yet. Route one, or run the A2A demo.
              </p>
            ) : (
              <motion.ul
                className="divide-y divide-border"
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px", amount: 0.2 }}
                variants={containerV}
              >
                {messages.map((m) => (
                  <motion.li key={m._id} variants={itemV} className="py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{m.fromName}</span>
                      <ArrowRight className="h-3 w-3 text-muted" />
                      <span className="font-medium">{m.toName}</span>
                      <Badge tone="green">{m.kind}</Badge>
                      <span className="ml-auto text-xs text-muted">
                        {timeAgo(m.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{m.content}</p>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </Card>
          </Reveal>
        </div>
      )}

      <CapabilityGrantsSection />
      <RoutingPreviewSection />
      <DirectorySection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Normalized tool layer (feature 12) — admin-only CRUD for capability tag ->
// tool name grants that the router (feature 11) and connectors resolve
// against. Space-scoped, RBAC'd on the backend; the UI here just gates
// mutation controls behind `useCan("admin")` so operators can see, not edit.
// ---------------------------------------------------------------------------

const PROVIDERS: { value: "composio" | "mcp" | "builtin"; label: string }[] = [
  { value: "composio", label: "Composio" },
  { value: "mcp", label: "MCP" },
  { value: "builtin", label: "Builtin" },
];

function CapabilityGrantsSection() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const grants = useQuery(api.capabilities.listGrants, spaceId ? { spaceId } : "skip");
  const known = useQuery(api.capabilities.listKnown, {});
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const upsertGrant = useMutation(api.capabilities.upsertGrant);
  const removeGrant = useMutation(api.capabilities.removeGrant);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"capabilityGrants"> | null>(null);
  const [capability, setCapability] = useState("");
  const [toolNamesText, setToolNamesText] = useState("");
  const [provider, setProvider] = useState<"composio" | "mcp" | "builtin" | "">("");
  const [restrictedAgents, setRestrictedAgents] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditingId(null);
    setCapability("");
    setToolNamesText("");
    setProvider("");
    setRestrictedAgents(new Set());
    setEnabled(true);
    setOpen(true);
  }

  function openEdit(g: NonNullable<typeof grants>[number]) {
    setEditingId(g._id);
    setCapability(g.capability);
    setToolNamesText(g.toolNames.join(", "));
    setProvider((g.provider as typeof provider) ?? "");
    setRestrictedAgents(new Set(g.agentIds ?? []));
    setEnabled(g.enabled);
    setOpen(true);
  }

  async function save() {
    if (!spaceId || !capability.trim()) return;
    const toolNames = toolNamesText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!toolNames.length) {
      toast("Add at least one tool name", "error");
      return;
    }
    setSaving(true);
    try {
      await upsertGrant({
        spaceId,
        grantId: editingId ?? undefined,
        capability: capability.trim(),
        toolNames,
        provider: provider || undefined,
        agentIds: restrictedAgents.size
          ? (Array.from(restrictedAgents) as Id<"agents">[])
          : undefined,
        enabled,
      });
      toast(editingId ? "Grant updated" : "Grant created", "success");
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save grant", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(g: NonNullable<typeof grants>[number], next: boolean) {
    if (!spaceId) return;
    try {
      await upsertGrant({
        spaceId,
        grantId: g._id,
        capability: g.capability,
        toolNames: g.toolNames,
        provider: g.provider as "composio" | "mcp" | "builtin" | undefined,
        agentIds: g.agentIds,
        enabled: next,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update grant", "error");
    }
  }

  async function del(g: NonNullable<typeof grants>[number]) {
    if (!spaceId) return;
    if (!confirm(`Remove the "${g.capability}" grant (${g.toolNames.length} tool(s))?`)) return;
    try {
      await removeGrant({ spaceId, grantId: g._id });
      toast("Grant removed", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove grant", "error");
    }
  }

  return (
    <Reveal className="mt-8">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Tool capability grants</h2>
            <p className="text-sm text-muted">
              Map harness-neutral capability tags (e.g. <code>browser</code>, <code>crm</code>) to
              concrete Composio/MCP/builtin tool names. The router and connectors resolve these
              per Space, optionally restricted to specific agents.
            </p>
          </div>
          {canAdmin && (
            <Button variant="ghost" onClick={openNew}>
              <Plus className="h-4 w-4" /> New grant
            </Button>
          )}
        </div>

        {grants && grants.length === 0 ? (
          <p className="text-sm text-muted">
            No capability grants yet. Agents that declare required capabilities will resolve to
            zero tools until grants exist here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {(grants ?? []).map((g) => (
              <li key={g._id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{g.capability}</Badge>
                    {g.provider && <Badge>{g.provider}</Badge>}
                    {g.agentIds && g.agentIds.length > 0 && (
                      <Badge>{g.agentIds.length} agent(s) only</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">{g.toolNames.join(", ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={g.enabled}
                    onChange={(v) => (canAdmin ? toggleEnabled(g, v) : undefined)}
                  />
                  {canAdmin && (
                    <>
                      <Button variant="ghost" onClick={() => openEdit(g)}>
                        <Wrench className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" onClick={() => del(g)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={open} onClose={() => !saving && setOpen(false)} title={editingId ? "Edit grant" : "New capability grant"}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Capability tag</label>
            <Input
              value={capability}
              onChange={(e) => setCapability(e.target.value)}
              placeholder="browser"
              list="known-capabilities"
            />
            <datalist id="known-capabilities">
              {(known ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Tool names (comma-separated)</label>
            <Input
              value={toolNamesText}
              onChange={(e) => setToolNamesText(e.target.value)}
              placeholder="composio_browser_navigate, composio_browser_click"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">Unspecified</option>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Restrict to agents (none = all agents in this Space)
            </label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {(agents ?? []).map((a) => (
                <label key={a._id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={restrictedAgents.has(a._id)}
                    onChange={(e) => {
                      const next = new Set(restrictedAgents);
                      if (e.target.checked) next.add(a._id);
                      else next.delete(a._id);
                      setRestrictedAgents(next);
                    }}
                  />
                  {a.name}
                </label>
              ))}
              {agents?.length === 0 && <p className="text-xs text-muted">No agents yet.</p>}
            </div>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!capability.trim() || !toolNamesText.trim() || saving}>
              {saving ? "Saving…" : editingId ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Capability-based routing (feature 11) — an ops preview that runs the same
// scorer the dispatch path uses (`router.route`) against arbitrary required
// capabilities, so admins can sanity-check "which agent would this route to"
// before wiring a workflow step or task to a set of tags.
// ---------------------------------------------------------------------------

function RoutingPreviewSection() {
  const { spaceId } = useActiveSpace();
  const known = useQuery(api.capabilities.listKnown, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [harness, setHarness] = useState("");

  const ranked = useQuery(
    api.router.route,
    spaceId && selected.size > 0
      ? {
          spaceId,
          requiredCapabilities: Array.from(selected),
          harness: harness || undefined,
        }
      : "skip",
  );

  function toggle(cap: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });
  }

  return (
    <Reveal className="mt-8">
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-muted" />
          <h2 className="font-semibold">Capability routing preview</h2>
        </div>
        <p className="mb-3 text-sm text-muted">
          Pick required capabilities to see how the router would score and rank this Space&apos;s
          agents, the same scorer (capability match + health + recent cost + harness) used to
          auto-assign tasks and workflow steps.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {(known ?? []).map((c) => (
            <button
              key={c}
              onClick={() => toggle(c)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                selected.has(c)
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="mb-4 flex items-center gap-2">
          <label className="text-xs text-muted">Harness filter</label>
          <Input
            value={harness}
            onChange={(e) => setHarness(e.target.value)}
            placeholder="e.g. hermes (optional)"
            className="max-w-xs"
          />
        </div>

        {selected.size === 0 ? (
          <p className="text-sm text-muted">Select at least one capability to preview routing.</p>
        ) : ranked === undefined ? (
          <p className="text-sm text-muted">Scoring…</p>
        ) : ranked.length === 0 ? (
          <p className="text-sm text-muted">No agents in this Space yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Score</th>
                  <th className="py-2 pr-3 font-medium">Matched</th>
                  <th className="py-2 pr-3 font-medium">Missing</th>
                  <th className="py-2 pr-3 font-medium">Not tool-ready</th>
                  <th className="py-2 pr-3 font-medium">Health</th>
                  <th className="py-2 pr-3 font-medium">Recent cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ranked.map((r, i) => (
                  <tr key={r.agentId} className={i === 0 ? "bg-accent/5" : undefined}>
                    <td className="py-2 pr-3 font-medium">
                      {r.name} {i === 0 && <Badge tone="green">best</Badge>}
                    </td>
                    <td className="py-2 pr-3">{(r.score * 100).toFixed(0)}%</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {r.matchedCapabilities.map((c) => (
                          <Badge key={c} tone="blue">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {r.missingCapabilities.map((c) => (
                          <Badge key={c} tone="red">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {r.ungrantedCapabilities.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1" title="Declared by the agent but no capabilityGrants row wired up yet in this Space">
                          {r.ungrantedCapabilities.map((c: string) => (
                            <Badge key={c} tone="yellow">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted">{r.status}</td>
                    <td className="py-2 pr-3 text-muted">${r.recentCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// A2A federation groundwork (feature 15) — publish agent cards to the public
// cross-tenant directory, and browse what other Spaces have published.
// Inbound A2A calls remain gated by the existing per-agent guardrails
// (autonomy pause, guard config, inbound key) — this section only controls
// discoverability.
// ---------------------------------------------------------------------------

// Local shapes for `api.capabilities.*` results — typed by hand since that
// module is new this cycle and not yet reflected in `_generated/api.d.ts`
// (see the cycle report; `npx tsc --noEmit` will still flag the `api.capabilities.*`
// call sites themselves until the integrator regenerates codegen).
type PublishableAgent = {
  agentId: Id<"agents">;
  name: string;
  description?: string;
  status: string;
  capabilities: string[];
  published: boolean;
};

type PublicDirectoryAgent = {
  agentId: Id<"agents">;
  name: string;
  description?: string;
  capabilities: string[];
  harness?: string;
  cardPath: string;
};

function DirectorySection() {
  const { spaceId } = useActiveSpace();
  const publishable = useQuery(api.capabilities.listPublishable, spaceId ? { spaceId } : "skip");
  const setDirectoryEnabled = useMutation(api.capabilities.setDirectoryEnabled);
  const setAgentPublished = useMutation(api.capabilities.setAgentPublished);
  const toast = useToast();

  const [browseOpen, setBrowseOpen] = useState(false);
  const publicDirectory = useQuery(api.capabilities.publicDirectory, browseOpen ? {} : "skip");

  async function toggleDirectory(enabled: boolean) {
    if (!spaceId) return;
    try {
      await setDirectoryEnabled({ spaceId, enabled });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update directory setting", "error");
    }
  }

  async function togglePublish(agentId: Id<"agents">, published: boolean) {
    if (!spaceId) return;
    try {
      await setAgentPublished({ spaceId, agentId, published });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update agent visibility", "error");
    }
  }

  return (
    <Stagger className="mt-8 grid gap-4 lg:grid-cols-2" gap={0.1}>
      <StaggerItem>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Public agent directory</h2>
            <p className="text-sm text-muted">
              Publish selected agent cards so other Spaces can discover and call them via A2A.
            </p>
          </div>
          <Toggle
            checked={publishable?.directoryEnabled ?? false}
            onChange={toggleDirectory}
            label="Enabled"
          />
        </div>
        {!publishable?.agents.length ? (
          <p className="text-sm text-muted">No agents in this Space yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {publishable.agents.map((a: PublishableAgent) => (
              <li key={a.agentId} className="flex items-center justify-between gap-2 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusDot status={a.status} />
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  {a.capabilities.slice(0, 2).map((c: string) => (
                    <Badge key={c} tone="blue">
                      {c}
                    </Badge>
                  ))}
                </div>
                <Toggle
                  checked={a.published}
                  onChange={(v) => togglePublish(a.agentId, v)}
                  label={a.published ? "Published" : "Private"}
                />
              </li>
            ))}
          </ul>
        )}
        {publishable && !publishable.directoryEnabled && (
          <p className="mt-3 text-xs text-muted">
            Enable the directory for this Space for published agents to actually appear publicly.
          </p>
        )}
      </Card>
      </StaggerItem>

      <StaggerItem>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Browse the directory</h2>
          <Button variant="ghost" onClick={() => setBrowseOpen((v) => !v)}>
            <Globe className="h-4 w-4" /> {browseOpen ? "Hide" : "Browse"}
          </Button>
        </div>
        {!browseOpen ? (
          <p className="text-sm text-muted">
            Browse agent cards other Spaces (and organizations) have published to the public directory.
          </p>
        ) : publicDirectory === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : publicDirectory.page.length === 0 ? (
          <p className="text-sm text-muted">No agents published yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {publicDirectory.page.map((a: PublicDirectoryAgent) => (
              <li key={a.agentId} className="py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{a.name}</span>
                  {a.harness && <Badge>{a.harness}</Badge>}
                </div>
                {a.description && <p className="mt-0.5 text-xs text-muted">{a.description}</p>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.capabilities.map((c: string) => (
                    <Badge key={c} tone="blue">
                      {c}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </StaggerItem>
    </Stagger>
  );
}
