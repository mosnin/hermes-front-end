"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Toggle } from "@/components/ui";
import { useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Gauge, ArrowUp, ArrowDown } from "@/components/icons";

type Squad = { _id: Id<"squads">; name: string; autoscale?: AutoscaleConfig };
type AutoscaleConfig = {
  enabled: boolean;
  minAgents: number;
  maxAgents: number;
  queueDepthPerAgent: number;
  cooldownMinutes: number;
  templateId?: Id<"agentTemplates">;
  lastScaleAt?: number;
  lastScaleDirection?: "up" | "down";
  lastEvaluatedAt?: number;
};
type Template = { _id: Id<"agentTemplates">; name: string };

const DIRECTION_ICON = { up: ArrowUp, down: ArrowDown };

/**
 * Squad-level autoscaling config (feature 8). The evaluation engine
 * (agentOps.evaluateAutoscale) runs on a 5-minute cron; this panel is purely
 * the control surface + a glance at what it last did.
 */
export function AutoscalePanel({ spaceId }: { spaceId: Id<"spaces"> }) {
  const canAdmin = useCan("admin");
  const squads = useQuery(api.squads.list, { spaceId });
  const templates = useQuery(api.agentOps.listTemplates, { spaceId });
  const setAutoscale = useMutation(api.agentOps.setSquadAutoscale);
  const toast = useToast();

  if (!squads) {
    return (
      <Card>
        <p className="text-sm text-muted">Loading squads…</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Gauge className="h-4 w-4" /> Squad autoscaling
      </h2>
      <p className="mb-3 text-sm text-muted">
        Set a min/max agent band and a queue-depth-per-agent rule; the autoscaler evaluates every
        squad every 5 minutes and scales one agent at a time, respecting a cooldown between moves.
      </p>
      {squads.length === 0 ? (
        <EmptyState title="No squads yet" body="Create a squad to configure autoscaling for it." />
      ) : (
        <div className="space-y-3">
          {(squads as Squad[]).map((s) => (
            <SquadRow
              key={s._id}
              squad={s}
              templates={(templates as Template[] | undefined) ?? []}
              canAdmin={canAdmin}
              onSave={async (cfg) => {
                try {
                  await setAutoscale({ spaceId, squadId: s._id, ...cfg });
                  toast(`Autoscaling ${cfg.enabled ? "enabled" : "updated"} for "${s.name}"`, "success");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Failed to save", "error");
                }
              }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function SquadRow({
  squad,
  templates,
  canAdmin,
  onSave,
}: {
  squad: Squad;
  templates: Template[];
  canAdmin: boolean;
  onSave: (cfg: {
    enabled: boolean;
    minAgents: number;
    maxAgents: number;
    queueDepthPerAgent: number;
    cooldownMinutes: number;
    templateId?: Id<"agentTemplates">;
  }) => void | Promise<void>;
}) {
  const cfg = squad.autoscale;
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(cfg?.enabled ?? false);
  const [minAgents, setMinAgents] = useState(cfg?.minAgents ?? 1);
  const [maxAgents, setMaxAgents] = useState(cfg?.maxAgents ?? 3);
  const [queueDepthPerAgent, setQueueDepthPerAgent] = useState(cfg?.queueDepthPerAgent ?? 3);
  const [cooldownMinutes, setCooldownMinutes] = useState(cfg?.cooldownMinutes ?? 15);
  const [templateId, setTemplateId] = useState(cfg?.templateId ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(cfg?.enabled ?? false);
    setMinAgents(cfg?.minAgents ?? 1);
    setMaxAgents(cfg?.maxAgents ?? 3);
    setQueueDepthPerAgent(cfg?.queueDepthPerAgent ?? 3);
    setCooldownMinutes(cfg?.cooldownMinutes ?? 15);
    setTemplateId(cfg?.templateId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.enabled, cfg?.minAgents, cfg?.maxAgents, cfg?.queueDepthPerAgent, cfg?.cooldownMinutes, cfg?.templateId]);

  const DirIcon = cfg?.lastScaleDirection ? DIRECTION_ICON[cfg.lastScaleDirection] : null;

  async function save() {
    if (maxAgents < minAgents) {
      return;
    }
    setBusy(true);
    try {
      await onSave({
        enabled,
        minAgents,
        maxAgents,
        queueDepthPerAgent,
        cooldownMinutes,
        templateId: (templateId || undefined) as Id<"agentTemplates"> | undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {squad.name}
          {cfg?.enabled ? (
            <Badge tone="green">
              autoscale {cfg.minAgents}–{cfg.maxAgents}
            </Badge>
          ) : (
            <Badge>autoscale off</Badge>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {DirIcon && cfg?.lastScaleAt && (
            <span className="flex items-center gap-1">
              <DirIcon className="h-3 w-3" /> {timeAgo(cfg.lastScaleAt)}
            </span>
          )}
          {cfg?.lastEvaluatedAt && <span>evaluated {timeAgo(cfg.lastEvaluatedAt)}</span>}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-muted">Min agents</label>
              <Input
                type="number"
                min={0}
                value={minAgents}
                disabled={!canAdmin}
                onChange={(e) => setMinAgents(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Max agents</label>
              <Input
                type="number"
                min={0}
                value={maxAgents}
                disabled={!canAdmin}
                onChange={(e) => setMaxAgents(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Queue depth / agent</label>
              <Input
                type="number"
                min={1}
                value={queueDepthPerAgent}
                disabled={!canAdmin}
                onChange={(e) => setQueueDepthPerAgent(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted">Cooldown (min)</label>
              <Input
                type="number"
                min={1}
                value={cooldownMinutes}
                disabled={!canAdmin}
                onChange={(e) => setCooldownMinutes(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted">Template to stamp new agents from</label>
            <select
              value={templateId}
              disabled={!canAdmin}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">— none (scale-up holds until set) —</option>
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {maxAgents < minAgents && (
            <p className="text-xs text-red-400">Max agents must be ≥ min agents.</p>
          )}
          {canAdmin && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={busy || maxAgents < minAgents}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
