"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea, Toggle } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Lock, Plus, ShieldAlert, ShieldCheck, Trash2, Users, X } from "@/components/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

type Profile = {
  _id: Id<"securityProfiles">;
  name: string;
  description?: string;
  egressAllowlist?: string[];
  fsQuotaMb?: number;
  secretScopes?: string[];
  toolAllowlist?: string[];
  isDefault?: boolean;
};

type AgentSummary = {
  _id: Id<"agents">;
  name: string;
  status: string;
};

function csv(v?: string[]): string {
  return (v ?? []).join(", ");
}
function parseCsv(s: string): string[] | undefined {
  const list = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export default function SecurityProfilesPage() {
  const { spaceId, role } = useActiveSpace();
  const canManage = role === "operator" || role === "admin" || role === "owner";
  const canDelete = role === "admin" || role === "owner";

  const profiles = useQuery(api.securityProfiles.list, spaceId ? { spaceId } : "skip") as
    | Profile[]
    | undefined;
  const create = useMutation(api.securityProfiles.create);
  const update = useMutation(api.securityProfiles.update);
  const remove = useMutation(api.securityProfiles.remove);

  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [egress, setEgress] = useState("");
  const [fsQuota, setFsQuota] = useState("");
  const [secretScopes, setSecretScopes] = useState("");
  const [toolAllowlist, setToolAllowlist] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setName("");
    setDescription("");
    setEgress("");
    setFsQuota("");
    setSecretScopes("");
    setToolAllowlist("");
    setIsDefault(false);
    setError(null);
    setOpen(true);
  }

  function openEdit(p: Profile) {
    setEditing(p);
    setName(p.name);
    setDescription(p.description ?? "");
    setEgress(csv(p.egressAllowlist));
    setFsQuota(p.fsQuotaMb ? String(p.fsQuotaMb) : "");
    setSecretScopes(csv(p.secretScopes));
    setToolAllowlist(csv(p.toolAllowlist));
    setIsDefault(!!p.isDefault);
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (!spaceId || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        egressAllowlist: parseCsv(egress),
        fsQuotaMb: fsQuota ? Number(fsQuota) : undefined,
        secretScopes: parseCsv(secretScopes),
        toolAllowlist: parseCsv(toolAllowlist),
        isDefault,
      };
      if (editing) {
        await update({ spaceId, profileId: editing._id, ...payload });
      } else {
        await create({ spaceId, ...payload });
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(p: Profile) {
    if (!spaceId) return;
    if (!confirm(`Delete security profile "${p.name}"?`)) return;
    try {
      await remove({ spaceId, profileId: p._id });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="p-8">
      <Reveal as="div" className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Security profiles</h1>
          <p className="text-sm text-muted">
            Named policies attachable to agents: egress allowlist, filesystem quota, secret
            scopes, and tool allowlist. Tool allowlist is enforced server-side; the rest is
            forwarded to the fleet worker as container policy for hosted agents.
          </p>
        </div>
        {canManage && (
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New profile
          </Button>
        )}
      </Reveal>

      {profiles === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : profiles.length === 0 ? (
        <Reveal delay={0.05}>
          <EmptyState
            title="No security profiles yet"
            body="Create a profile to restrict which tools, hosts, and secrets an agent can reach."
            action={
              canManage ? (
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" /> New profile
                </Button>
              ) : undefined
            }
            graphic={<ShieldCheck className="h-full w-full text-muted" />}
          />
        </Reveal>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <StaggerItem key={p._id}>
              <Card>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted" />
                    <p className="font-medium">{p.name}</p>
                  </div>
                  {p.isDefault && <Badge tone="green">Default</Badge>}
                </div>
                {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}

                <div className="mt-3 space-y-1.5 text-xs text-muted">
                  <div className="flex items-center justify-between">
                    <span>Tool allowlist</span>
                    <span className="text-foreground">
                      {p.toolAllowlist?.length ? `${p.toolAllowlist.length} tools` : "unrestricted"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Egress allowlist</span>
                    <span className="text-foreground">
                      {p.egressAllowlist?.length ? `${p.egressAllowlist.length} hosts` : "unrestricted"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>FS quota</span>
                    <span className="text-foreground">{p.fsQuotaMb ? `${p.fsQuotaMb} MB` : "unset"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Secret scopes</span>
                    <span className="text-foreground">{p.secretScopes?.length ?? 0}</span>
                  </div>
                </div>

                {canManage && (
                  <div className="mt-4 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAssigning(p)}>
                      <Users className="h-4 w-4" /> Agents
                    </Button>
                    <Button variant="outline" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    {canDelete && (
                      <button
                        onClick={() => onDelete(p)}
                        className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit profile" : "New security profile"}>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" autoFocus />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
          />
          <div>
            <label className="mb-1 block text-xs text-muted">Tool allowlist (comma separated; empty = unrestricted)</label>
            <Input value={toolAllowlist} onChange={(e) => setToolAllowlist(e.target.value)} placeholder="email, crm, web-search" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Egress allowlist: hostnames/CIDRs (comma separated)</label>
            <Input value={egress} onChange={(e) => setEgress(e.target.value)} placeholder="api.stripe.com, 10.0.0.0/8" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">FS quota (MB)</label>
              <Input
                type="number"
                value={fsQuota}
                onChange={(e) => setFsQuota(e.target.value)}
                placeholder="512"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Secret scopes (comma-separated secret names)</label>
            <Input value={secretScopes} onChange={(e) => setSecretScopes(e.target.value)} placeholder="stripe_key, sendgrid_key" />
          </div>
          <Toggle checked={isDefault} onChange={setIsDefault} label="Default profile for new agents" />

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Egress/FS/secret-scope fields are forwarded to the fleet worker as container policy
              and only take effect for hosted agents once the worker enforces them.
            </span>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !name.trim()}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create profile"}
            </Button>
          </div>
        </div>
      </Modal>

      <AssignmentsModal
        profile={assigning}
        canManage={canManage}
        onClose={() => setAssigning(null)}
      />
    </div>
  );
}

function AssignmentsModal({
  profile,
  canManage,
  onClose,
}: {
  profile: Profile | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const { spaceId } = useActiveSpace();
  const assignedAgents = useQuery(
    api.securityProfiles.agentsUsingProfile,
    spaceId && profile ? { spaceId, profileId: profile._id } : "skip",
  ) as { _id: Id<"agents">; name: string; status: string }[] | undefined;
  const allAgents = useQuery(api.agents.list, spaceId && profile ? { spaceId } : "skip") as
    | AgentSummary[]
    | undefined;
  const assign = useMutation(api.securityProfiles.assign);

  const [selected, setSelected] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;

  const assignedIds = new Set((assignedAgents ?? []).map((a) => a._id));
  const candidates = (allAgents ?? []).filter((a) => !assignedIds.has(a._id));

  async function addAgent() {
    if (!spaceId || !profile || !selected) return;
    setBusyId(selected);
    setError(null);
    try {
      await assign({ spaceId, agentId: selected as Id<"agents">, profileId: profile._id });
      setSelected("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign");
    } finally {
      setBusyId(null);
    }
  }

  async function removeAgent(agentId: Id<"agents">) {
    if (!spaceId) return;
    setBusyId(agentId);
    setError(null);
    try {
      await assign({ spaceId, agentId, profileId: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unassign");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal open={!!profile} onClose={onClose} title={`Agents: ${profile.name}`}>
      <div className="space-y-4">
        {canManage && (
          <div className="flex gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">
                {allAgents === undefined
                  ? "Loading agents…"
                  : candidates.length === 0
                    ? "No unassigned agents"
                    : "Select an agent to attach…"}
              </option>
              {candidates.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button onClick={addAgent} disabled={!selected || busyId === selected}>
              Attach
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {assignedAgents === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : assignedAgents.length === 0 ? (
          <p className="text-sm text-muted">No agents are attached to this profile yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {assignedAgents.map((a) => (
              <li
                key={a._id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span>{a.name}</span>
                  <Badge tone={a.status === "online" ? "green" : undefined}>{a.status}</Badge>
                </div>
                {canManage && (
                  <button
                    onClick={() => removeAgent(a._id)}
                    disabled={busyId === a._id}
                    className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-red-500"
                    title="Detach"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
