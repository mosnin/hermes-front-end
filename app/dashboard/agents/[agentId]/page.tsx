"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Input, StatusDot } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { useActiveSpace, useCan } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { ArrowLeft, Trash2 } from "lucide-react";

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
