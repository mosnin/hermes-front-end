"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, StatusDot } from "@/components/ui";
import { SensorCard } from "@/components/sensor-card";
import { ActivityFeed } from "@/components/activity-feed";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { useActiveSpace } from "@/components/active-space";
import { Onboarding } from "@/components/onboarding";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ListTodo,
  MessagesSquare,
  Network,
  Plus,
  Wallet,
  Workflow,
} from "lucide-react";

const TABS = [
  { label: "Overview", href: "/dashboard", active: true },
  { label: "Activity", href: "/dashboard/history" },
  { label: "Workflows", href: "/dashboard/workflows" },
  { label: "Rules", href: "/dashboard/approvals" },
];

/** Bucket timestamps into `bins` equal slots over the trailing 24h. */
function bucket24h(times: number[], bins = 24): number[] {
  const now = Date.now();
  const span = 24 * 60 * 60 * 1000;
  const out = Array(bins).fill(0);
  for (const t of times) {
    const age = now - t;
    if (age < 0 || age >= span) continue;
    out[bins - 1 - Math.floor((age / span) * bins)]++;
  }
  return out;
}

const AXIS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"];

export default function OverviewPage() {
  const { spaceId, active } = useActiveSpace();
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const threads = useQuery(api.threads.list, spaceId ? { spaceId } : "skip");
  const tasks = useQuery(api.tasks.list, spaceId ? { spaceId } : "skip");
  const activity = useQuery(
    api.activity.feed,
    spaceId ? { spaceId, limit: 200 } : "skip",
  );
  const errors = useQuery(
    api.observability.listErrors,
    spaceId ? { spaceId, limit: 100 } : "skip",
  );
  const metrics = useQuery(api.metrics.summary, spaceId ? { spaceId } : "skip");
  const seed = useMutation(api.demo.seed);
  const [open, setOpen] = useState(false);

  const online = (agents ?? []).filter((a) => a.status === "online").length;
  const total = agents?.length ?? 0;
  const openTasks = (tasks ?? []).filter((t) => t.status !== "done").length;
  const errorCount = errors?.length ?? 0;
  const lastUpdate = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Real 24h series for the card sparklines.
  const series = useMemo(() => {
    const all = (activity ?? []).map((a) => a.createdAt);
    const a2a = (activity ?? [])
      .filter((a) => a.type === "a2a")
      .map((a) => a.createdAt);
    const msgs = (activity ?? [])
      .filter((a) => a.type === "message")
      .map((a) => a.createdAt);
    const wf = (activity ?? [])
      .filter((a) => a.type === "workflow")
      .map((a) => a.createdAt);
    const errs = (errors ?? []).map((e) => e.createdAt);
    return {
      all: bucket24h(all),
      a2a: bucket24h(a2a),
      msgs: bucket24h(msgs),
      wf: bucket24h(wf),
      errs: bucket24h(errs),
    };
  }, [activity, errors]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Detail panel (chirp left card) */}
      <div className="w-full shrink-0 border-b border-border bg-surface p-5 lg:w-80 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface-2">
            <ChevronLeft className="h-4 w-4 text-muted" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {active?.name ?? "Overview"}
            </h1>
            <p className="text-xs text-muted">Control plane</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <Badge tone={active?.autonomyPaused ? "red" : "green"}>
              {online}
            </Badge>
            <span className={active?.autonomyPaused ? "text-red-400" : "text-lime-400"}>
              {active?.autonomyPaused ? "Paused" : "Online"}
            </span>
            <span className="text-xs text-muted">Updated {lastUpdate}</span>
          </span>
          <Button onClick={() => setOpen(true)} className="px-3 py-1.5">
            Actions
          </Button>
        </div>

        <button
          onClick={() => spaceId && seed({ spaceId })}
          disabled={!spaceId}
          className="mt-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-muted transition hover:text-foreground"
        >
          Load demo data
        </button>

        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">
            Agents
          </p>
          <ul className="space-y-1.5">
            {(agents ?? []).slice(0, 8).map((a) => (
              <li key={a._id}>
                <Link
                  href={`/dashboard/agents/${a._id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm transition hover:border-muted"
                >
                  <StatusDot status={a.status} />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-[10px] uppercase text-muted">
                    {a.framework ?? a.platform ?? "hermes"}
                  </span>
                </Link>
              </li>
            ))}
            {agents?.length === 0 && (
              <li className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
                No agents yet — hit Actions to connect one.
              </li>
            )}
          </ul>
          <button
            onClick={() => setOpen(true)}
            className="mt-2 grid w-full place-items-center rounded-lg border border-border bg-surface-2/50 py-2 text-muted transition hover:text-accent"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto p-5">
        <Onboarding />
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {TABS.map((t) =>
              t.active ? (
                <span
                  key={t.label}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white shadow-[0_0_14px_rgba(255,91,4,0.3)]"
                >
                  {t.label}
                </span>
              ) : (
                <Link
                  key={t.label}
                  href={t.href}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground"
                >
                  {t.label}
                </Link>
              ),
            )}
          </div>
          <Link
            href="/dashboard/analytics"
            className="rounded-lg border border-accent/50 px-3 py-1.5 text-sm text-accent transition hover:bg-accent/10"
          >
            Analytics
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <SensorCard
            icon={<Boxes className="h-4 w-4" />}
            title="Agents"
            lastUpdate={lastUpdate}
            value={online}
            unit={`/${total}`}
            color={total > 0 && online === 0 ? "yellow" : "green"}
            pct={total ? online / total : 0.02}
            data={series.all}
            axis={AXIS}
            units={["up", "all"]}
            onGear={() => {}}
          />
          <SensorCard
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Errors"
            lastUpdate={lastUpdate}
            value={errorCount}
            unit="24h"
            pct={Math.min(1, errorCount / 50)}
            color="muted"
            alert={errorCount > 0}
            alertLabel={errorCount > 0 ? `${errorCount} failures captured` : undefined}
            data={series.errs}
            axis={AXIS}
            onGear={() => {}}
          />
          <SensorCard
            icon={<Network className="h-4 w-4" />}
            title="Agent network"
            lastUpdate={lastUpdate}
            value={metrics?.a2a.sent ?? 0}
            unit="msg"
            color="yellow"
            pct={Math.min(1, (metrics?.a2a.sent ?? 0) / 100)}
            data={series.a2a}
            axis={AXIS}
            units={["24h", "1h"]}
            onGear={() => {}}
          />
          <SensorCard
            icon={<Workflow className="h-4 w-4" />}
            title="Workflow runs"
            lastUpdate={lastUpdate}
            value={metrics?.runs.completed ?? 0}
            unit="done"
            color="accent"
            pct={metrics?.runs.successRate ?? 0.02}
            data={series.wf}
            axis={AXIS}
            units={["ok", "all"]}
            onGear={() => {}}
          />
          <SensorCard
            icon={<MessagesSquare className="h-4 w-4" />}
            title="Threads"
            lastUpdate={lastUpdate}
            value={threads?.length ?? 0}
            color="cyan"
            pct={Math.min(1, (threads?.length ?? 0) / 20)}
            data={series.msgs}
            axis={AXIS}
            onGear={() => {}}
          />
          <SensorCard
            icon={<Wallet className="h-4 w-4" />}
            title="Spend"
            lastUpdate={lastUpdate}
            value={`$${(metrics?.spend.windowUsd ?? 0).toFixed(0)}`}
            unit="24h"
            color="accent"
            pct={Math.min(1, (metrics?.spend.windowUsd ?? 0) / 50)}
            data={series.all}
            axis={AXIS}
            units={["usd"]}
            onGear={() => {}}
          />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <ListTodo className="h-4 w-4 text-muted" /> Open tasks
                <Badge tone="yellow">{openTasks}</Badge>
              </h2>
              <Link href="/dashboard/tasks" className="text-xs text-accent">
                Board
              </Link>
            </div>
            <ul className="space-y-1.5">
              {(tasks ?? [])
                .filter((t) => t.status !== "done")
                .slice(0, 5)
                .map((t) => (
                  <li
                    key={t._id}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        t.status === "in_progress" ? "bg-accent" : "bg-zinc-600",
                      )}
                    />
                    <span className="flex-1 truncate">{t.title}</span>
                    <span className="text-[10px] uppercase text-muted">{t.status}</span>
                  </li>
                ))}
              {openTasks === 0 && (
                <li className="text-sm text-muted">Nothing open.</li>
              )}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-medium">Live activity</h2>
            <ActivityFeed limit={8} />
          </Card>
        </div>
      </div>

      <RegisterAgentDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
