"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { PageHead, Panel, ListRow, Dot } from "@/components/dash/kit";

/** Map a thread status string to a kit Dot tone. */
function toneFor(status: string): "online" | "paused" | "idle" | "error" {
  if (status === "active") return "online";
  if (status === "archived") return "paused";
  return "idle";
}

export default function ThreadsPage() {
  const { spaceId } = useActiveSpace();
  const threads = useQuery(api.threads.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const agentName = (id?: string) =>
    agents?.find((a) => a._id === id)?.name ?? "Unassigned";

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="threads"
          title="Threads"
          sub="Lines of work with your agents, created automatically as agents converse, or start one."
        />

        {threads?.length === 0 ? (
          <EmptyState
            title="No threads yet"
            body="Threads appear here as your connected agents start conversations and work."
          />
        ) : (
          <Panel>
            <div>
              {(threads ?? []).map((t) => (
                <ListRow
                  key={t._id}
                  href={`/dashboard/threads/${t._id}`}
                  leading={<Dot tone={toneFor(t.status)} />}
                  title={t.title}
                  meta={`${agentName(t.agentId)} · ${t.messageCount ?? 0} messages · ${t.status}`}
                  trailing={timeAgo(t.lastMessageAt ?? t.createdAt)}
                />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
