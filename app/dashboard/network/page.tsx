"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState, Input, Modal, Toggle } from "@/components/ui";
import { MeshGraphic } from "@/components/marketing/graphics";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { ArrowRight, Globe, Plus, Send, Target, Trash2, Wrench } from "@/components/icons";
import { PageHead, PillButton, Panel, ListRow, Dot, SectionLabel } from "@/components/dash/kit";

/** Map an agent/card status string to a kit Dot tone. */
function toneFor(status?: string): "online" | "paused" | "idle" | "error" {
  if (status === "online") return "online";
  if (status === "paused") return "paused";
  if (status === "error" || status === "degraded") return "error";
  return "idle";
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

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="network"
          title="Agent network"
          sub="Agents coordinate in real time through the A2A broker, guarded by loop detection, budgets, and the Space kill switch."
        />

        {agents.length < 2 ? (
          <EmptyState
            graphic={<MeshGraphic />}
            title="Connect at least two agents"
            body="A2A needs two or more agents to coordinate. Connect another agent (or load demo data), then route messages between them here."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <Panel title="Directory (Agent Cards)">
                <div>
                  {agents.map((c) => (
                    <ListRow
                      key={c.id}
                      leading={<Dot tone={toneFor(c.status)} />}
                      title={
                        <>
                          <span className="font-medium">{c.name}</span>{" "}
                          <span className="text-[12.5px] text-[var(--muted)]">{c.kind}</span>
                        </>
                      }
                      meta={c.skills.map((s) => s.name).join(", ") || undefined}
                    />
                  ))}
                </div>
              </Panel>

              <Panel title="Route a message">
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
                    <PillButton
                      onClick={submit}
                      className={busy || !from || !to || from === to || !content.trim() ? "pointer-events-none opacity-50" : undefined}
                    >
                      <Send className="h-4 w-4" />
                    </PillButton>
                  </div>
                  {error && <p className="text-xs text-red-500">{error}</p>}
                </div>
              </Panel>
            </div>

            <Panel title="Live inter-agent messages" tone="band">
              {messages === undefined ? (
                <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
              ) : messages.length === 0 ? (
                <p className="text-[13.5px] text-[var(--muted)]">
                  No agent-to-agent messages yet. Route one, or run the A2A demo.
                </p>
              ) : (
                <div>
                  {messages.map((m) => (
                    <ListRow
                      key={m._id}
                      title={
                        <>
                          <span className="font-medium">{m.fromName}</span>
                          {" → "}
                          <span className="font-medium">{m.toName}</span>{" "}
                          <span className="text-[12.5px] text-[var(--muted)]">{m.kind}</span>
                        </>
                      }
                      meta={m.content}
                      trailing={timeAgo(m.createdAt)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        )}

        <CapabilityGrantsSection />
        <RoutingPreviewSection />
        <DirectorySection />
      </div>
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
    <div>
      <SectionLabel>tool capability grants</SectionLabel>
      <Panel
        action={
          canAdmin && (
            <PillButton variant="outline" onClick={openNew}>
              <Plus className="h-4 w-4" /> New grant
            </PillButton>
          )
        }
      >
        <p className="-mt-2 mb-4 text-[13.5px] text-[var(--muted)]">
          Map harness-neutral capability tags (e.g. <code>browser</code>, <code>crm</code>) to concrete
          Composio/MCP/builtin tool names. The router and connectors resolve these per Space, optionally
          restricted to specific agents.
        </p>

        {grants && grants.length === 0 ? (
          <p className="text-[13.5px] text-[var(--muted)]">
            No capability grants yet. Agents that declare required capabilities will resolve to
            zero tools until grants exist here.
          </p>
        ) : (
          <div>
            {(grants ?? []).map((g) => (
              <div
                key={g._id}
                className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-1 py-3.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{g.capability}</Badge>
                    {g.provider && <Badge>{g.provider}</Badge>}
                    {g.agentIds && g.agentIds.length > 0 && (
                      <Badge>{g.agentIds.length} agent(s) only</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[12.5px] text-[var(--muted)]">{g.toolNames.join(", ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle
                    checked={g.enabled}
                    onChange={(v) => (canAdmin ? toggleEnabled(g, v) : undefined)}
                  />
                  {canAdmin && (
                    <>
                      <button onClick={() => openEdit(g)} className="text-[var(--muted)] hover:text-[var(--foreground)]">
                        <Wrench className="h-4 w-4" />
                      </button>
                      <button onClick={() => del(g)} className="text-[var(--muted)] hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

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
            <PillButton variant="outline" onClick={() => setOpen(false)} className={saving ? "pointer-events-none opacity-50" : undefined}>
              Cancel
            </PillButton>
            <PillButton
              onClick={save}
              className={!capability.trim() || !toolNamesText.trim() || saving ? "pointer-events-none opacity-50" : undefined}
            >
              {saving ? "Saving…" : editingId ? "Save" : "Create"}
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
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
    <div>
      <SectionLabel>capability routing preview</SectionLabel>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[var(--muted)]" /> Routing preview
          </span>
        }
      >
        <p className="-mt-2 mb-4 text-[13.5px] text-[var(--muted)]">
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
                  ? "border-[var(--foreground)] bg-[var(--foreground)]/10 text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
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
          <p className="text-[13.5px] text-[var(--muted)]">Select at least one capability to preview routing.</p>
        ) : ranked === undefined ? (
          <p className="text-[13.5px] text-[var(--muted)]">Scoring…</p>
        ) : ranked.length === 0 ? (
          <p className="text-[13.5px] text-[var(--muted)]">No agents in this Space yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 pr-3 font-medium">Score</th>
                  <th className="py-2 pr-3 font-medium">Matched</th>
                  <th className="py-2 pr-3 font-medium">Missing</th>
                  <th className="py-2 pr-3 font-medium">Not tool-ready</th>
                  <th className="py-2 pr-3 font-medium">Health</th>
                  <th className="py-2 pr-3 font-medium">Recent cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {ranked.map((r, i) => (
                  <tr key={r.agentId} className={i === 0 ? "bg-[var(--surface)]/60" : undefined}>
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
                        <span className="text-[var(--muted)]">—</span>
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
                    <td className="py-2 pr-3 text-[var(--muted)]">{r.status}</td>
                    <td className="py-2 pr-3 text-[var(--muted)]">${r.recentCostUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
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
    <div>
      <SectionLabel>public directory</SectionLabel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Public agent directory"
          action={<Toggle checked={publishable?.directoryEnabled ?? false} onChange={toggleDirectory} label="Enabled" />}
        >
          <p className="-mt-2 mb-4 text-[13.5px] text-[var(--muted)]">
            Publish selected agent cards so other Spaces can discover and call them via A2A.
          </p>
          {!publishable?.agents.length ? (
            <p className="text-[13.5px] text-[var(--muted)]">No agents in this Space yet.</p>
          ) : (
            <div>
              {publishable.agents.map((a: PublishableAgent) => (
                <div key={a.agentId} className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-1 py-2.5 last:border-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Dot tone={toneFor(a.status)} />
                    <span className="truncate text-[14px] font-medium text-[var(--foreground)]">{a.name}</span>
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
                </div>
              ))}
            </div>
          )}
          {publishable && !publishable.directoryEnabled && (
            <p className="mt-3 text-[12.5px] text-[var(--muted)]">
              Enable the directory for this Space for published agents to actually appear publicly.
            </p>
          )}
        </Panel>

        <Panel
          title="Browse the directory"
          action={
            <PillButton variant="outline" onClick={() => setBrowseOpen((v) => !v)}>
              <Globe className="h-4 w-4" /> {browseOpen ? "Hide" : "Browse"}
            </PillButton>
          }
        >
          {!browseOpen ? (
            <p className="text-[13.5px] text-[var(--muted)]">
              Browse agent cards other Spaces (and organizations) have published to the public directory.
            </p>
          ) : publicDirectory === undefined ? (
            <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : publicDirectory.page.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No agents published yet.</p>
          ) : (
            <div>
              {publicDirectory.page.map((a: PublicDirectoryAgent) => (
                <div key={a.agentId} className="border-b border-[var(--border)] py-2.5 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--foreground)]">{a.name}</span>
                    {a.harness && <Badge>{a.harness}</Badge>}
                  </div>
                  {a.description && <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">{a.description}</p>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.capabilities.map((c: string) => (
                      <Badge key={c} tone="blue">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
