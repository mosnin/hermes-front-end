"use client";

import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState, SkeletonRows } from "./ui";
import { timeAgo } from "@/lib/utils";
import { useActiveSpace } from "./active-space";

const typeTone: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  system: "blue",
  tool_call: "green",
  message: "default",
  status: "yellow",
  error: "red",
  task: "blue",
  a2a: "green",
};

export function ActivityFeed({
  agentId,
  limit,
}: {
  agentId?: Id<"agents">;
  limit?: number;
}) {
  const { spaceId } = useActiveSpace();
  const events = useQuery(
    api.activity.feed,
    spaceId ? { spaceId, agentId, limit } : "skip",
  );

  if (events === undefined) {
    return <SkeletonRows rows={limit && limit <= 6 ? limit : 5} />;
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
      {/* New events slide in from the top as they arrive over the live query;
          popLayout keeps the rest of the list settling smoothly. */}
      <AnimatePresence initial={false} mode="popLayout">
        {events.map((e) => (
          <motion.li
            key={e._id}
            layout
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="flex items-start gap-3 py-3"
          >
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
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
