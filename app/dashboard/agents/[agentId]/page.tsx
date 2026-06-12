"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, StatusDot } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
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
  const agent = useQuery(api.agents.get, { agentId: id });
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
            <Badge>{agent.platform ?? "—"}</Badge>
          </div>
          {agent.description && (
            <p className="mt-1 text-sm text-muted">{agent.description}</p>
          )}
        </div>
        <Button
          variant="danger"
          onClick={async () => {
            await remove({ agentId: id });
            router.push("/dashboard/agents");
          }}
        >
          <Trash2 className="h-4 w-4" /> Remove
        </Button>
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

      <Card>
        <h2 className="mb-3 font-semibold">Activity</h2>
        <ActivityFeed agentId={id} limit={50} />
      </Card>
    </div>
  );
}
