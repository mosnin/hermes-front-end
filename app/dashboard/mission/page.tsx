"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, EmptyState } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { MissionGraph, GraphEdge } from "@/components/mission-graph";
import {
  PageHead,
  Panel,
  StatTile,
  StatRow,
  ListRow,
  Dot,
  SectionLabel,
} from "@/components/dash/kit";

function toneFor(status?: string): "online" | "paused" | "idle" | "error" {
  if (status === "online") return "online";
  if (status === "degraded") return "error";
  if (status === "paused") return "paused";
  return "idle";
}

export default function MissionPage() {
  const { spaceId, active } = useActiveSpace();
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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · mission control`}
          title="Mission control"
          sub="A live command center for every agent and the A2A coordination flowing between them, in real time."
        />

        <StatRow>
          <StatTile
            value={onlineCount}
            label="Agents online"
            hint={`of ${agents.length} in this space`}
            tone="ink"
          />
          <StatTile value={activeThreads} label="Active threads" hint="in flight" />
          <StatTile value={messagesToday} label="A2A messages" hint="today" />
          <StatTile value={edges.length} label="Live connections" hint="agent to agent" />
        </StatRow>

        {loading ? (
          <Panel>
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">Establishing uplink…</p>
          </Panel>
        ) : agents.length === 0 ? (
          <Panel>
            <EmptyState
              title="No agents in this Space yet"
              body="Connect an agent (or load demo data) to bring the mission control topology online."
            />
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Panel
              title="Coordination topology"
              action={<Badge tone={edges.length > 0 ? "green" : "default"}>{edges.length > 0 ? "live" : "idle"}</Badge>}
            >
              <div className="mx-auto max-w-xl">
                <MissionGraph agents={agents} edges={edges} />
              </div>
              {edges.length === 0 && (
                <p className="mt-2 text-center text-[12.5px] text-[var(--muted)]">
                  No agent-to-agent traffic yet. Connections appear here as agents
                  start coordinating.
                </p>
              )}
            </Panel>

            <div className="space-y-4">
              <Panel title="Agent roster" tone="band">
                <div>
                  {agents.map((a) => (
                    <ListRow
                      key={a.id}
                      leading={<Dot tone={toneFor(a.status)} />}
                      title={a.name}
                      meta={a.platform ?? undefined}
                      trailing={
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
                      }
                    />
                  ))}
                </div>
              </Panel>

              <Panel title="Live activity">
                <div className="max-h-[26rem] overflow-y-auto pr-1">
                  <ActivityFeed limit={30} />
                </div>
              </Panel>
            </div>
          </div>
        )}

        {!loading && agents.length > 0 && messages.length > 0 && (
          <div>
            <SectionLabel>recent inter-agent exchanges</SectionLabel>
            <Panel>
              <div>
                {messages.slice(0, 6).map((m) => (
                  <ListRow
                    key={m._id}
                    title={
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{m.fromName}</span>
                        <span className="text-[var(--muted)]">&rarr;</span>
                        <span className="font-medium">{m.toName}</span>
                        <Badge tone="green">{m.kind}</Badge>
                      </span>
                    }
                    meta={m.content}
                    trailing={timeAgo(m.createdAt)}
                  />
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
