"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import {
  PageHead,
  PillButton,
  Panel,
  ListRow,
  Dot,
} from "@/components/dash/kit";

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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="notifications"
          title="Notifications"
          sub="Everything happening in this Space that needs your attention."
          actions={<PillButton variant="outline" onClick={onMarkAll}>Mark all read</PillButton>}
        />

        {notifications === undefined ? (
          <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
        ) : notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            body="Updates from agents, workflows, and your team will show up here."
          />
        ) : (
          <Panel title="Activity">
            <div>
              {notifications.map((n) => (
                <ListRow
                  key={n._id}
                  leading={<span className="text-[11px] uppercase">{n.type.slice(0, 2)}</span>}
                  title={
                    <span className={n.read ? "text-[var(--muted)]" : "font-medium"}>{n.title}</span>
                  }
                  meta={n.body}
                  trailing={
                    <div className="flex items-center gap-2">
                      <Dot tone={n.read ? "idle" : "online"} />
                      {timeAgo(n.createdAt)}
                    </div>
                  }
                />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
