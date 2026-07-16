"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, Input, Modal, SkeletonRows, Toggle } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/marketing/motion";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { BellRing, Plus, Trash2, Zap } from "@/components/icons";

const METRICS = [
  { id: "errors_24h", label: "Errors (24h)", unit: "", dflt: 10, cmp: "gt" },
  { id: "budget_pct", label: "Budget used", unit: "%", dflt: 80, cmp: "gt" },
  { id: "agents_offline", label: "Agents offline", unit: "", dflt: 1, cmp: "gt" },
  { id: "run_success_rate", label: "Run success rate", unit: "%", dflt: 90, cmp: "lt" },
  { id: "dead_letters_open", label: "Open dead-letters", unit: "", dflt: 1, cmp: "gt" },
  { id: "a2a_rate", label: "A2A / minute", unit: "", dflt: 100, cmp: "gt" },
] as const;

export default function AlertsPage() {
  const { spaceId } = useActiveSpace();
  const canOperate = useCan("operator");
  const toast = useToast();
  const rules = useQuery(api.alerts.list, spaceId ? { spaceId } : "skip");
  const bridges = useQuery(api.bridges.list, spaceId ? { spaceId } : "skip");
  const create = useMutation(api.alerts.create);
  const toggle = useMutation(api.alerts.toggle);
  const remove = useMutation(api.alerts.remove);
  const testFire = useMutation(api.alerts.testFire);

  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<(typeof METRICS)[number]["id"]>("errors_24h");
  const [threshold, setThreshold] = useState(10);
  const [comparator, setComparator] = useState<"gt" | "lt">("gt");
  const [channel, setChannel] = useState("notification");
  const [bridgeId, setBridgeId] = useState<string>("");

  const chosen = METRICS.find((m) => m.id === metric)!;

  function pickMetric(id: (typeof METRICS)[number]["id"]) {
    const m = METRICS.find((x) => x.id === id)!;
    setMetric(id);
    setThreshold(m.dflt);
    setComparator(m.cmp);
  }

  async function submit() {
    if (!spaceId) return;
    try {
      await create({
        spaceId,
        name: `${chosen.label} ${comparator === "gt" ? ">" : "<"} ${threshold}${chosen.unit}`,
        metric,
        comparator,
        threshold,
        channel,
        bridgeId: channel === "bridge" && bridgeId ? (bridgeId as never) : undefined,
      });
      toast("Alert rule created", "success");
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted">
            Get paged when the fleet misbehaves, no dashboard-watching required.
          </p>
        </div>
        {canOperate && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New alert
          </Button>
        )}
      </div>

      {rules === undefined ? (
        <SkeletonRows rows={3} className="rounded-3xl border border-border bg-surface p-6" />
      ) : rules.length === 0 ? (
        <EmptyState
          title="No alert rules yet"
          body="Create a rule to be notified on error spikes, budget burn, agents dropping offline, or SLO breaches."
          action={canOperate ? <Button onClick={() => setOpen(true)}>Create your first alert</Button> : undefined}
        />
      ) : (
        <Stagger className="grid gap-3">
          {(rules ?? []).map((r) => (
            <StaggerItem key={r._id}>
              <Card className="flex items-center gap-4">
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r.enabled ? "bg-accent/10 text-accent" : "bg-surface-2 text-muted"}`}
                >
                  <BellRing className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted">
                    via {r.channel}
                    {r.lastFiredAt
                      ? ` · last fired ${timeAgo(r.lastFiredAt)}`
                      : " · never fired"}
                    {r.lastValue !== undefined ? ` · now ${Math.round(r.lastValue)}` : ""}
                  </p>
                </div>
                {r.lastFiredAt && Date.now() - r.lastFiredAt < 60 * 60 * 1000 && (
                  <Badge tone="red">firing</Badge>
                )}
                {canOperate && (
                  <>
                    <button
                      title="Test now"
                      onClick={async () => {
                        const res = await testFire({ spaceId: spaceId!, ruleId: r._id });
                        toast(`Fired (value ${Math.round(res.value)})`, "success");
                      }}
                      className="rounded-lg border border-border p-2 text-muted transition hover:text-accent"
                    >
                      <Zap className="h-4 w-4" />
                    </button>
                    <Toggle
                      checked={r.enabled}
                      onChange={(v) => toggle({ spaceId: spaceId!, ruleId: r._id, enabled: v })}
                    />
                    <button
                      title="Delete"
                      onClick={() => remove({ spaceId: spaceId!, ruleId: r._id })}
                      className="rounded-lg border border-border p-2 text-muted transition hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New alert rule">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Metric</label>
            <div className="grid grid-cols-2 gap-2">
              {METRICS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pickMetric(m.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${metric === m.id ? "border-accent bg-accent/10" : "border-border bg-surface-2 hover:border-muted"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={comparator}
              onChange={(e) => setComparator(e.target.value as "gt" | "lt")}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
            >
              <option value="gt">is above</option>
              <option value="lt">is below</option>
            </select>
            <Input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-28"
            />
            <span className="text-sm text-muted">{chosen.unit || "count"}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Notify via</label>
            <div className="flex gap-2">
              <button
                onClick={() => setChannel("notification")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${channel === "notification" ? "border-accent bg-accent/10" : "border-border bg-surface-2"}`}
              >
                In-app notification
              </button>
              <button
                onClick={() => setChannel("bridge")}
                disabled={!bridges?.length}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${channel === "bridge" ? "border-accent bg-accent/10" : "border-border bg-surface-2"}`}
              >
                Chat bridge
              </button>
            </div>
            {channel === "bridge" && (
              <select
                value={bridgeId}
                onChange={(e) => setBridgeId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
              >
                <option value="">Select a bridge…</option>
                {(bridges ?? []).map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name} ({b.type})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Create alert</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
