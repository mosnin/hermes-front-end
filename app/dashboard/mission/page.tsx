"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Card, EmptyState, StatusDot } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo, cn } from "@/lib/utils";
import { MissionGraph, GraphEdge } from "@/components/mission-graph";
import { Activity, Network, Radio, Users } from "@/components/icons";

export default function MissionPage() {
  const { spaceId } = useActiveSpace();
  const directory = useQuery(api.a2a.directory, spaceId ? { spaceId } : "skip");
  const recent = useQuery(api.a2a.recent, spaceId ? { spaceId, limit: 100 } : "skip");
  const threads = useQuery(api.threads.list, spaceId ? { spaceId } : "skip");

  const loading =
    directory === undefined || recent === undefined || threads === undefined;

  const agents = directory ?? [];
  const messages = recent ?? [];

  // Aggregate from→to pairs into weighted edges for the topology.
  const edges = useMemo<GraphEdge[]>(() => {
    const counts = new Map<string, number>();
    for (const m of messages) {
      if (!m.fromAgentId || !m.toAgentId || m.fromAgentId === m.toAgentId) continue;
      const key = `${m.fromAgentId}->${m.toAgentId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => {
      const [from, to] = key.split("->");
      return { from, to, count };
    });
  }, [messages]);

  // Stats.
  const onlineCount = agents.filter((a) => a.online).length;
  const activeThreads = (threads ?? []).filter((t) => t.status === "active").length;
  const startOfDay = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const messagesToday = messages.filter((m) => m.createdAt >= startOfDay).length;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-2 text-accent">
          <Radio className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">Mission control</h1>
          <p className="text-sm text-muted">
            A live command center for every agent and the A2A coordination
            flowing between them — in real time.
          </p>
        </div>
      </div>

      {/* Top stat row. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Agents online"
          value={`${onlineCount} / ${agents.length}`}
          loading={loading}
          accent={onlineCount > 0}
        />
        <Stat
          icon={<Network className="h-4 w-4" />}
          label="Active threads"
          value={`${activeThreads}`}
          loading={loading}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="A2A messages today"
          value={`${messagesToday}`}
          loading={loading}
        />
        <Stat
          icon={<Radio className="h-4 w-4" />}
          label="Live connections"
          value={`${edges.length}`}
          loading={loading}
        />
      </div>

      {loading ? (
        <div className="grid h-64 place-items-center rounded-2xl border border-border bg-surface">
          <p className="text-sm text-muted">Establishing uplink…</p>
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          title="No agents in this Space yet"
          body="Connect an agent (or load demo data) to bring the mission control topology online."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          {/* Topology. */}
          <Card className="overflow-hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Coordination topology</h2>
              <Badge tone={edges.length > 0 ? "green" : "default"}>
                {edges.length > 0 ? "live" : "idle"}
              </Badge>
            </div>
            <div className="mx-auto max-w-xl">
              <MissionGraph agents={agents} edges={edges} />
            </div>
            {edges.length === 0 && (
              <p className="mt-2 text-center text-xs text-muted">
                No agent-to-agent traffic yet. Connections appear here as agents
                start coordinating.
              </p>
            )}
          </Card>

          {/* Right column: roster + live feed. */}
          <div className="space-y-4">
            <Card>
              <h2 className="mb-3 font-semibold">Agent roster</h2>
              <ul className="space-y-2">
                {agents.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <StatusDot status={a.status} />
                    <span className="flex-1 truncate text-sm font-medium">
                      {a.name}
                    </span>
                    {a.platform && (
                      <span className="text-xs text-muted">{a.platform}</span>
                    )}
                    <Badge
                      tone={
                        a.status === "online"
                          ? "green"
                          : a.status === "degraded"
                            ? "yellow"
                            : "default"
                      }
                    >
                      {a.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">Live activity</h2>
              <div className="max-h-[26rem] overflow-y-auto pr-1">
                <ActivityFeed limit={30} />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Recent A2A exchanges strip. */}
      {!loading && agents.length > 0 && messages.length > 0 && (
        <Card className="mt-4">
          <h2 className="mb-3 font-semibold">Recent inter-agent exchanges</h2>
          <ul className="divide-y divide-border">
            {messages.slice(0, 6).map((m) => (
              <li key={m._id} className="flex items-center gap-2 py-2 text-sm">
                <span className="font-medium">{m.fromName}</span>
                <span className="text-muted">→</span>
                <span className="font-medium">{m.toName}</span>
                <Badge tone="green">{m.kind}</Badge>
                <span className="truncate text-muted">{m.content}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {timeAgo(m.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  loading,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      {accent && (
        <span className="absolute right-3 top-3 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      )}
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-semibold tabular-nums",
          accent && "text-foreground",
        )}
      >
        {loading ? "—" : value}
      </p>
    </Card>
  );
}
