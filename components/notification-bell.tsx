"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";

export function NotificationBell() {
  const { spaceId } = useActiveSpace();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const count = useQuery(
    api.notifications.unreadCount,
    spaceId ? { spaceId } : "skip",
  );
  const notifications = useQuery(
    api.notifications.list,
    spaceId && open ? { spaceId, limit: 20 } : "skip",
  );

  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  async function onRowClick(
    notificationId: Id<"notifications">,
    href?: string,
  ) {
    if (!spaceId) return;
    try {
      await markRead({ spaceId, notificationId });
    } catch {
      /* ignore — non-critical */
    }
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  async function onMarkAll() {
    if (!spaceId) return;
    try {
      await markAllRead({ spaceId });
    } catch {
      /* ignore */
    }
  }

  const unread = count ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        disabled={!spaceId}
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && spaceId && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              <button
                type="button"
                onClick={onMarkAll}
                className="text-xs text-muted transition hover:text-foreground"
              >
                Mark all read
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications === undefined ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  Loading…
                </p>
              ) : notifications.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">
                  No notifications yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => (
                    <li key={n._id}>
                      <button
                        type="button"
                        onClick={() => onRowClick(n._id, n.href)}
                        className="flex w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-surface-2"
                      >
                        <span
                          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                            n.read ? "bg-transparent" : "bg-red-500"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="truncate text-xs text-muted">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-muted">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
