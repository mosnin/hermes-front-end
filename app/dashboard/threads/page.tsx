"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

const statusTone = { active: "green", idle: "yellow", archived: "default" } as const;

export default function ThreadsPage() {
  const { spaceId } = useActiveSpace();
  const threads = useQuery(api.threads.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const agentName = (id?: string) =>
    agents?.find((a) => a._id === id)?.name ?? "Unassigned";

  return (
    <div className="p-8">
      <Reveal as="div" className="mb-6">
        <h1 className="text-2xl font-semibold">Threads</h1>
        <p className="text-sm text-muted">
          Lines of work with your agents, created automatically as agents
          converse, or start one.
        </p>
      </Reveal>

      {threads?.length === 0 ? (
        <EmptyState
          title="No threads yet"
          body="Threads appear here as your connected agents start conversations and work."
        />
      ) : (
        <Stagger className="space-y-2" gap={0.05}>
          {(threads ?? []).map((t) => (
            <StaggerItem key={t._id}>
              <Link href={`/dashboard/threads/${t._id}`}>
                <Card className="flex items-center gap-4 transition hover:border-accent">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs text-muted">
                      {agentName(t.agentId)} · {t.messageCount ?? 0} messages
                    </p>
                  </div>
                  <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                  <span className="text-xs text-muted">
                    {timeAgo(t.lastMessageAt ?? t.createdAt)}
                  </span>
                </Card>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
