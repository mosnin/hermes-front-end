"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";

export default function NotificationsPage() {
  const { spaceId } = useActiveSpace();
  const toast = useToast();

  const notifications = useQuery(
    api.notifications.list,
    spaceId ? { spaceId, limit: 100 } : "skip",
  );
  const markAllRead = useMutation(api.notifications.markAllRead);

  async function onMarkAll() {
    if (!spaceId) return;
    try {
      await markAllRead({ spaceId });
      toast("All notifications marked read", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to mark read", "error");
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted">
            Everything happening in this Space that needs your attention.
          </p>
        </div>
        <Button variant="outline" onClick={onMarkAll}>
          Mark all read
        </Button>
      </div>

      {notifications === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          body="Updates from agents, workflows, and your team will show up here."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card key={n._id} className={n.read ? "opacity-70" : undefined}>
              <div className="flex items-start gap-3">
                <Badge tone={n.read ? "default" : "blue"}>{n.type}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
