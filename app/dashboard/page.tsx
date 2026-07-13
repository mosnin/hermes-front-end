"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, StatusDot, Toggle } from "@/components/ui";
import { SensorCard } from "@/components/sensor-card";
import {
  CardMenuLabel,
  DateChipCard,
  DotMatrixCard,
  MediaCard,
  ReviewListCard,
  SteppedChartCard,
  type ReviewRow,
} from "@/components/bento";
import { ActivityFeed } from "@/components/activity-feed";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { useActiveSpace } from "@/components/active-space";
import { Onboarding } from "@/components/onboarding";
import { timeAgo } from "@/lib/utils";
import { AlertTriangle, ChevronLeft, Network, Plus } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/marketing/motion";

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
const DAY_MS = 24 * 60 * 60 * 1000;

// Capabilities plotted on the fleet skills board.
const SKILL_ROWS = [
  { cap: "chat", label: "Chat" },
  { cap: "workflow", label: "Jobs" },
  { cap: "rag", label: "Memory" },
  { cap: "mcp", label: "MCP" },
];

export default function OverviewPage() {
  const { spaceId, active } = useActiveSpace();
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
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
  const errorCount = errors?.length ?? 0;
  const lastUpdate = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const today = new Date().toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Real 24h series for waveform + sparklines.
  const series = useMemo(() => {
    const all = (activity ?? []).map((a) => a.createdAt);
    const a2a = (activity ?? [])
      .filter((a) => a.type === "a2a")
      .map((a) => a.createdAt);
    const errs = (errors ?? []).map((e) => e.createdAt);
    return { wave: bucket24h(all, 36), a2a: bucket24h(a2a), errs: bucket24h(errs) };
  }, [activity, errors]);

  // Fleet skills: how many agents carry each capability (dots of 10).
  const skillRows = useMemo(
    () =>
      SKILL_ROWS.map((s) => ({
        label: s.label,
        value: Math.min(
          10,
          (agents ?? []).filter((a) => (a.capabilities ?? []).includes(s.cap)).length,
        ),
      })).concat([
        { label: "Online", value: Math.min(10, online) },
      ]),
    [agents, online],
  );

  // Throughput: activity events for the last three days (stepped columns).
  const dayColumns = useMemo(() => {
    const now = Date.now();
    const counts = [2, 1, 0].map(
      (d) =>
        (activity ?? []).filter((a) => {
          const age = now - a.createdAt;
          return age >= d * DAY_MS && age < (d + 1) * DAY_MS;
        }).length,
    );
    const names = [2, 1, 0].map((d) =>
      d === 0
        ? "Today"
        : new Date(now - d * DAY_MS).toLocaleDateString([], { weekday: "long" }),
    );
    const tones = ["lime", "muted", "accent"] as const;
    return counts.map((value, i) => ({
      label: names[i],
      sub: `${value} events`,
      value,
      tone: tones[i],
    }));
  }, [activity]);

  const delta = useMemo(() => {
    const [, yest, today] = dayColumns.map((c) => c.value);
    if (!yest) return today > 0 ? "Activity is picking up today" : null;
    const pct = Math.round(((today - yest) / yest) * 100);
    return pct >= 0
      ? `Fleet activity increased by ${pct}%`
      : `Fleet activity decreased by ${-pct}%`;
  }, [dayColumns]);

  const reviewRows: ReviewRow[] = (agents ?? []).slice(0, 3).map((a) => ({
    id: a._id,
    glyph: a.name.slice(0, 2).toUpperCase(),
    name: a.name,
    role: a.framework ?? a.platform ?? "hermes",
    pill: a.status === "online" ? "Active" : a.status,
    href: `/dashboard/agents/${a._id}`,
    right: (
      <>
        <span className="text-xs text-muted">
          {a.lastHeartbeat ? timeAgo(a.lastHeartbeat) : "never"}
        </span>
        <span title="Reflects the connector heartbeat">
          <Toggle checked={a.status === "online"} onChange={() => {}} />
        </span>
      </>
    ),
  }));

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Detail panel */}
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
            <Badge tone={active?.autonomyPaused ? "red" : "green"}>{online}</Badge>
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
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Agents</p>
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

        {/* Bento row 1: skills board + (date chip / media card) */}
        <Stagger className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <StaggerItem>
          <DotMatrixCard
            title="Fleet skills"
            rows={skillRows}
            axis={["None", "Half fleet", "Full fleet"]}
            action={<CardMenuLabel>Circles view</CardMenuLabel>}
          />
          </StaggerItem>
          <StaggerItem className="grid content-start gap-4">
            <DateChipCard date={today} label="Ops session" />
            <MediaCard
              title="Activity pulse"
              subtitle={`with ${active?.name ?? "your fleet"}`}
              bars={series.wave}
              meta={`${activity?.length ?? 0} events`}
              href="/dashboard/history"
            />
          </StaggerItem>
        </Stagger>

        {/* Bento row 2: agents review + throughput chart */}
        <Stagger className="mt-4 grid gap-4 xl:grid-cols-2">
          <StaggerItem>
          <ReviewListCard
            title="Agents review"
            rows={reviewRows}
            onAdd={() => setOpen(true)}
            addLabel="Add new agent"
          />
          </StaggerItem>
          <StaggerItem>
          <SteppedChartCard
            title="Throughput"
            columns={dayColumns}
            insight={delta ?? undefined}
            insightHref="/dashboard/analytics"
            action={<CardMenuLabel>3 days</CardMenuLabel>}
          />
          </StaggerItem>
        </Stagger>

        {/* Instruments row: errors + network sensors, live feed */}
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
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
        </div>

        <div className="mt-4">
          <Card>
            <h2 className="mb-3 text-xl font-semibold tracking-tight">Live activity</h2>
            <ActivityFeed limit={8} />
          </Card>
        </div>
      </div>

      <RegisterAgentDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
