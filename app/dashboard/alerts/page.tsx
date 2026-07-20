"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState, Input, Modal, SkeletonRows, Toggle } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { BellRing, Trash2, Zap } from "@/components/icons";
import { PageHead, PillButton, Panel, ListRow, Dot } from "@/components/dash/kit";

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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="alerts · this space"
          title="Alerts"
          sub="Get paged when the fleet misbehaves, no dashboard-watching required."
          actions={canOperate && <PillButton onClick={() => setOpen(true)}>New alert</PillButton>}
        />

        {rules === undefined ? (
          <Panel>
            <SkeletonRows rows={3} />
          </Panel>
        ) : rules.length === 0 ? (
          <Panel>
            <EmptyState
              title="No alert rules yet"
              body="Create a rule to be notified on error spikes, budget burn, agents dropping offline, or SLO breaches."
              action={canOperate ? <PillButton onClick={() => setOpen(true)}>Create your first alert</PillButton> : undefined}
            />
          </Panel>
        ) : (
          <Panel>
            <div>
              {rules.map((r) => {
                const firing = !!r.lastFiredAt && Date.now() - r.lastFiredAt < 60 * 60 * 1000;
                return (
                  <ListRow
                    key={r._id}
                    leading={
                      <span
                        className={`grid h-9 w-9 place-items-center rounded-xl ${
                          r.enabled ? "bg-[var(--foreground)]/10 text-[var(--foreground)]" : "bg-[var(--surface)] text-[var(--muted)]"
                        }`}
                      >
                        <BellRing className="h-4 w-4" />
                      </span>
                    }
                    title={r.name}
                    meta={`via ${r.channel}${r.lastFiredAt ? ` · last fired ${timeAgo(r.lastFiredAt)}` : " · never fired"}${
                      r.lastValue !== undefined ? ` · now ${Math.round(r.lastValue)}` : ""
                    }`}
                    trailing={
                      <div className="flex items-center gap-3">
                        {firing && <Dot tone="error" />}
                        {canOperate && (
                          <>
                            <button
                              title="Test now"
                              onClick={async () => {
                                const res = await testFire({ spaceId: spaceId!, ruleId: r._id });
                                toast(`Fired (value ${Math.round(res.value)})`, "success");
                              }}
                              className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                            >
                              <Zap className="h-3.5 w-3.5" />
                            </button>
                            <Toggle
                              checked={r.enabled}
                              onChange={(v) => toggle({ spaceId: spaceId!, ruleId: r._id, enabled: v })}
                            />
                            <button
                              title="Delete"
                              onClick={() => remove({ spaceId: spaceId!, ruleId: r._id })}
                              className="grid h-7 w-7 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[#fbe9e9] hover:text-[#b3261e]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    }
                  />
                );
              })}
            </div>
          </Panel>
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
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      metric === m.id
                        ? "border-[var(--foreground)] bg-[var(--surface)]"
                        : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--border-hover)]"
                    }`}
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
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none"
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
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${
                    channel === "notification"
                      ? "border-[var(--foreground)] bg-[var(--surface)]"
                      : "border-[var(--border)] bg-[var(--background)]"
                  }`}
                >
                  In-app notification
                </button>
                <button
                  onClick={() => setChannel("bridge")}
                  disabled={!bridges?.length}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors disabled:opacity-40 ${
                    channel === "bridge"
                      ? "border-[var(--foreground)] bg-[var(--surface)]"
                      : "border-[var(--border)] bg-[var(--background)]"
                  }`}
                >
                  Chat bridge
                </button>
              </div>
              {channel === "bridge" && (
                <select
                  value={bridgeId}
                  onChange={(e) => setBridgeId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none"
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
              <PillButton variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </PillButton>
              <PillButton onClick={submit}>Create alert</PillButton>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
