"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState } from "./ui";
import { timeAgo } from "@/lib/utils";

const typeTone: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  system: "blue",
  tool_call: "green",
  message: "default",
  status: "yellow",
  error: "red",
  task: "blue",
};

export function ActivityFeed({
  agentId,
  limit,
}: {
  agentId?: Id<"agents">;
  limit?: number;
}) {
  const events = useQuery(api.activity.feed, { agentId, limit });

  if (events === undefined) {
    return <p className="text-sm text-muted">Loading activity…</p>;
  }
  if (events.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        body="When your agents connect and start working, everything they do shows up here in real time."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((e) => (
        <li key={e._id} className="flex items-start gap-3 py-3">
          <Badge tone={typeTone[e.type] ?? "default"}>{e.type}</Badge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{e.title}</p>
            {e.detail && (
              <p className="truncate text-xs text-muted">{e.detail}</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted">
            {timeAgo(e.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
