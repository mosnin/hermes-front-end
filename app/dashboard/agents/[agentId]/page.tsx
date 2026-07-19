"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Input, StatusDot, Textarea } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { ArrowLeft, Cpu, Trash2 } from "@/components/icons";
import { LogPane } from "@/components/fleet/LogPane";
import { ConfigPushPanel } from "@/components/fleet/ConfigPushPanel";
import { SnapshotPanel } from "@/components/fleet/SnapshotPanel";

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const id = agentId as Id<"agents">;
  const router = useRouter();
  const { spaceId } = useActiveSpace();
  const canEdit = useCan("operator");
  const agent = useQuery(
    api.agents.get,
    spaceId ? { spaceId, agentId: id } : "skip",
  );
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const remove = useMutation(api.agents.remove);

  if (agent === undefined) {
    return <div className="p-8 text-sm text-muted">Loading…</div>;
  }
  if (agent === null) {
    return <div className="p-8 text-sm text-muted">Agent not found.</div>;
  }

  return (
    <div className="p-8">
      <button
        onClick={() => router.push("/dashboard/agents")}
        className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Agents
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot status={agent.status} />
            <h1 className="text-2xl font-semibold">{agent.name}</h1>
            <Badge>{agent.platform ?? agent.kind ?? "—"}</Badge>
          </div>
          {agent.description && (
            <p className="mt-1 text-sm text-muted">{agent.description}</p>
          )}
        </div>
        {canEdit && (
          <Button
            variant="danger"
            onClick={async () => {
              if (!spaceId) return;
              await remove({ spaceId, agentId: id });
              router.push("/dashboard/agents");
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        )}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Status</p>
          <p className="mt-1 text-lg font-medium capitalize">{agent.status}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Last heartbeat</p>
          <p className="mt-1 text-lg font-medium">
            {timeAgo(agent.lastHeartbeat)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Connector</p>
          <p className="mt-1 text-lg font-medium">
            {agent.connectorVersion ?? "—"}
          </p>
        </Card>
      </div>

      <div className="mb-6">
        <PersonaCard
          agentId={id}
          agent={agent}
          agents={agents ?? []}
        />
      </div>

      {agent.kind !== "a2a-external" && spaceId && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <ConfigPushPanel spaceId={spaceId} agentId={id} />
          <SnapshotPanel spaceId={spaceId} agentId={id} agentName={agent.name} />
        </div>
      )}

      {agent.kind !== "a2a-external" && spaceId && (
        <div className="mb-6">
          <LogPane spaceId={spaceId} agentId={id} />
        </div>
      )}

      <div className="mb-6">
        {agent.kind === "a2a-external" ? (
          <ExternalA2APanel agentId={id} name={agent.name} />
        ) : (
          <InboundA2APanel agentId={id} />
        )}
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">Activity</h2>
        <ActivityFeed agentId={id} limit={50} />
      </Card>
    </div>
  );
}

type AgentDoc = {
  _id: Id<"agents">;
  name: string;
  systemPrompt?: string;
  model?: string;
  modelProvider?: string;
  toolsets?: string[];
  reportsTo?: Id<"agents"> | null;
};

function PersonaCard({
  agentId,
  agent,
  agents,
}: {
  agentId: Id<"agents">;
  agent: AgentDoc;
  agents: AgentDoc[];
}) {
  const { spaceId } = useActiveSpace();
  const canEdit = useCan("operator");
  const toast = useToast();
  const updatePersona = useMutation(api.agents.updatePersona);

  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("");
  const [modelProvider, setModelProvider] = useState("");
  const [toolsets, setToolsets] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSystemPrompt(agent.systemPrompt ?? "");
    setModel(agent.model ?? "");
    setModelProvider(agent.modelProvider ?? "");
    setToolsets((agent.toolsets ?? []).join(", "));
    setReportsTo(agent.reportsTo ?? "");
  }, [agent]);

  const others = agents.filter((a) => a._id !== agentId);

  async function save() {
    if (!spaceId) return;
    setSaving(true);
    try {
      await updatePersona({
        spaceId,
        agentId,
        systemPrompt: systemPrompt.trim() || undefined,
        model: model.trim() || undefined,
        modelProvider: modelProvider.trim() || undefined,
        toolsets: toolsets
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        reportsTo: (reportsTo as Id<"agents">) || null,
      });
      toast("Saved", "success");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold">
        <Cpu className="h-4 w-4" /> Persona &amp; config
      </h2>
      <p className="mt-1 text-sm text-muted">
        The system prompt, model, toolsets, and org hierarchy for this agent.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="text-xs text-muted">System prompt</label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful agent that…"
            rows={6}
            disabled={!canEdit}
            className="mt-1"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted">Model</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="claude-opus-4-8"
              disabled={!canEdit}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted">Model provider</label>
            <Input
              value={modelProvider}
              onChange={(e) => setModelProvider(e.target.value)}
              placeholder="anthropic"
              disabled={!canEdit}
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted">Toolsets</label>
          <Input
            value={toolsets}
            onChange={(e) => setToolsets(e.target.value)}
            placeholder="Toolsets, comma separated"
            disabled={!canEdit}
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Reports to</label>
          <select
            value={reportsTo}
            onChange={(e) => setReportsTo(e.target.value)}
            disabled={!canEdit}
            className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">— none —</option>
            {others.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function InboundA2APanel({ agentId }: { agentId: Id<"agents"> }) {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const rotate = useAction(api.agents.rotateInboundKey);
  const [key, setKey] = useState<string | null>(null);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  const site = convexUrl.replace(".convex.cloud", ".convex.site");
  const cardUrl = `${site}/a2a/card/${agentId}`;

  return (
    <Card>
      <h2 className="font-semibold">Expose over A2A</h2>
      <p className="mt-1 text-sm text-muted">
        This agent is an A2A server. External A2A clients can discover it via its
        Agent Card and call it over JSON-RPC.
      </p>
      <div className="mt-3">
        <label className="text-xs text-muted">Agent Card URL</label>
        <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-surface-2 p-2 text-xs">
          {cardUrl}
        </pre>
      </div>
      {canAdmin && (
        <div className="mt-3">
          <Button
            variant="outline"
            onClick={async () => {
              if (!spaceId) return;
              const r = await rotate({ spaceId, agentId });
              setKey(r.key);
            }}
          >
            Generate inbound key
          </Button>
          {key && (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-2 p-2 text-xs">
              Authorization: Bearer {key}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}

function ExternalA2APanel({
  agentId,
  name,
}: {
  agentId: Id<"agents">;
  name: string;
}) {
  const { spaceId } = useActiveSpace();
  const send = useAction(api.a2aExternal.send);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold">Call {name} (external A2A)</h2>
      <p className="mt-1 text-sm text-muted">
        Send a message to this external agent over the A2A protocol. The reply
        is recorded in a thread and the work history.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message to send…"
        />
        <Button
          disabled={busy || !text.trim()}
          onClick={async () => {
            if (!spaceId || !text.trim()) return;
            setBusy(true);
            setReply(null);
            try {
              const r = await send({ spaceId, toAgentId: agentId, text: text.trim() });
              setReply(r.reply);
              setText("");
            } catch (e) {
              setReply(e instanceof Error ? e.message : "Failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
      {reply && (
        <p className="mt-3 rounded-lg border border-border bg-surface-2 p-2 text-sm">
          {reply}
        </p>
      )}
    </Card>
  );
}
