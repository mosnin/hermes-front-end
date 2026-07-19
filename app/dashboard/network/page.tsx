"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, StatusDot, Toggle } from "@/components/ui";
import { MeshGraphic } from "@/components/marketing/graphics";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { ArrowRight, Globe, Send } from "@/components/icons";

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
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Agent network</h1>
        <p className="text-sm text-muted">
          Agents coordinate in real time through the A2A broker, guarded by
          loop detection, budgets, and the Space kill switch.
        </p>
      </div>

      {agents.length < 2 ? (
        <EmptyState
          graphic={<MeshGraphic />}
          title="Connect at least two agents"
          body="A2A needs two or more agents to coordinate. Connect another agent (or load demo data), then route messages between them here."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <Card>
              <h2 className="mb-3 font-semibold">Directory (Agent Cards)</h2>
              <ul className="space-y-2">
                {agents.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-border px-3 py-2"
                  >
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
                  </li>
                ))}
              </ul>
            </Card>

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
                {error && <p className="text-xs text-red-400">{error}</p>}
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 font-semibold">Live inter-agent messages</h2>
            {messages === undefined ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted">
                No agent-to-agent messages yet. Route one, or run the A2A demo.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {messages.map((m) => (
                  <li key={m._id} className="py-3">
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
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <DirectorySection />
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
    <div className="mt-8 grid gap-4 lg:grid-cols-2">
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
    </div>
  );
}
