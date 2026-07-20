"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Toggle } from "@/components/ui";
import { useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { ShieldAlert, ShieldCheck, RefreshCw } from "@/components/icons";

type WatchdogAgent = {
  restartAttempts?: number;
  lastRestartAt?: number;
  nextRestartAt?: number;
  watchdogDisabled?: boolean;
};

/**
 * Self-healing watchdog status + controls for a HOSTED agent (feature 10).
 * The engine itself runs on a cron (health.watchdogTick); this panel just
 * surfaces where an agent stands in the backoff cycle and lets an admin
 * pause it (planned maintenance) or reset it (issue fixed, retry now).
 */
export function WatchdogPanel({
  spaceId,
  agentId,
  agent,
}: {
  spaceId: Id<"spaces">;
  agentId: Id<"agents">;
  agent: WatchdogAgent;
}) {
  const canAdmin = useCan("admin");
  const toast = useToast();
  const setDisabled = useMutation(api.health.setWatchdogDisabled);
  const reset = useMutation(api.health.resetWatchdog);
  const [busy, setBusy] = useState(false);

  const attempts = agent.restartAttempts ?? 0;
  const disabled = !!agent.watchdogDisabled;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          {disabled ? (
            <ShieldAlert className="h-4 w-4 text-red-400" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          )}
          Self-healing watchdog
        </h2>
        {disabled ? (
          <Badge tone="red">disabled — needs attention</Badge>
        ) : attempts > 0 ? (
          <Badge tone="yellow">{attempts} restart attempt{attempts === 1 ? "" : "s"}</Badge>
        ) : (
          <Badge tone="green">armed</Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        If this agent goes offline, the watchdog confirms it with the fleet worker and restarts
        it in place, backing off exponentially between attempts. After repeated failures it
        disables itself here so a human can look.
      </p>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Restart attempts</p>
          <p className="mt-0.5 font-medium">{attempts}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Last restart</p>
          <p className="mt-0.5 font-medium">
            {agent.lastRestartAt ? timeAgo(agent.lastRestartAt) : "never"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Next attempt</p>
          <p className="mt-0.5 font-medium">
            {disabled
              ? "—"
              : agent.nextRestartAt
                ? agent.nextRestartAt > Date.now()
                  ? `in ${Math.max(1, Math.round((agent.nextRestartAt - Date.now()) / 60_000))}m`
                  : "due now"
                : "as soon as needed"}
          </p>
        </div>
      </div>

      {canAdmin && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <Toggle
            checked={!disabled}
            onChange={async (armed) => {
              setBusy(true);
              try {
                await setDisabled({ spaceId, agentId, disabled: !armed });
                toast(armed ? "Watchdog armed" : "Watchdog paused", "info");
              } catch (e) {
                toast(e instanceof Error ? e.message : "Failed", "error");
              } finally {
                setBusy(false);
              }
            }}
            label={disabled ? "Paused" : "Armed"}
          />
          {(attempts > 0 || disabled) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await reset({ spaceId, agentId });
                  toast("Backoff reset — the watchdog will retry immediately", "success");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Failed", "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw className="h-4 w-4" /> Reset backoff
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
