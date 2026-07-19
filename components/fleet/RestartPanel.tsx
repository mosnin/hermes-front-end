"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { RefreshCw } from "@/components/icons";

/**
 * Rolling-restart status panel (feature 5 UI, consuming Team A's
 * fleet.pendingRestarts + fleet.rollingRestart). Shows any agent currently
 * queued for a rolling restart (drained vs. actually restarted-and-pending
 * retry), plus a manual trigger scoped to one harness or "all".
 */
export function RestartPanel({
  spaceId,
  harnessFilter,
}: {
  spaceId: Id<"spaces">;
  harnessFilter?: string;
}) {
  const canOperate = useCan("operator");
  const toast = useToast();
  const pending = useQuery(api.fleet.pendingRestarts, { spaceId });
  const rollingRestart = useAction(api.fleet.rollingRestart);
  const [busy, setBusy] = useState(false);

  async function trigger() {
    setBusy(true);
    try {
      const res = await rollingRestart({
        spaceId,
        harness: harnessFilter || undefined,
      });
      if (res.total === 0) {
        toast("No hosted agents eligible for a rolling restart", "info");
      } else {
        toast(
          `Restarted ${res.restarted.length}, drained ${res.drained.length}${
            res.failed.length ? `, failed ${res.failed.length}` : ""
          } (of ${res.total})`,
          res.failed.length ? "error" : "success",
        );
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Rolling restart failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Rolling restart</h2>
        <Button variant="ghost" onClick={trigger} disabled={busy || !canOperate}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Restarting…" : `Restart${harnessFilter ? ` ${harnessFilter}` : " all"}`}
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Reboots running hosted agents in place so they pick up the newest
        harness image. Agents with an in-flight task are drained (queued for
        a retry) instead of interrupted.
      </p>
      {pending === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : pending.length === 0 ? (
        <EmptyState
          title="Nothing pending"
          body="No agent is queued for a rolling restart right now."
        />
      ) : (
        <ul className="divide-y divide-border">
          {pending.map((p) => (
            <li key={p.agentId} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1 truncate">{p.name}</span>
              <Badge tone="blue">{p.harness}</Badge>
              {p.draining ? (
                <Badge tone="yellow">draining</Badge>
              ) : (
                <Badge tone="default">queued</Badge>
              )}
              <span className="text-xs text-muted">
                {new Date(p.restartRequestedAt).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
