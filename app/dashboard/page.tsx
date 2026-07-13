"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, Card, RingGauge, StatusDot, type RingColor } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { useActiveSpace } from "@/components/active-space";
import { Onboarding } from "@/components/onboarding";
import { Plus } from "lucide-react";

export default function OverviewPage() {
  const { spaceId, active } = useActiveSpace();
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const threads = useQuery(api.threads.list, spaceId ? { spaceId } : "skip");
  const tasks = useQuery(api.tasks.list, spaceId ? { spaceId } : "skip");
  const skills = useQuery(api.skills.list, spaceId ? { spaceId } : "skip");
  const seed = useMutation(api.demo.seed);
  const [open, setOpen] = useState(false);

  const online = (agents ?? []).filter((a) => a.status === "online").length;
  const total = agents?.length ?? 0;
  const openTasks = (tasks ?? []).filter((t) => t.status !== "done").length;
  const doneTasks = (tasks?.length ?? 0) - openTasks;

  // Sensor-style dials: value + how full/healthy the ring reads.
  const stats: {
    label: string;
    value: string | number;
    unit?: string;
    color: RingColor;
    pct: number;
  }[] = [
    {
      label: "Agents online",
      value: online,
      unit: `/${total}`,
      color: total > 0 && online === 0 ? "red" : "green",
      pct: total ? online / total : 0.02,
    },
    {
      label: "Threads",
      value: threads?.length ?? 0,
      color: "accent",
      pct: Math.min(1, (threads?.length ?? 0) / 20),
    },
    {
      label: "Open tasks",
      value: openTasks,
      color: "yellow",
      pct: tasks?.length ? openTasks / tasks.length : 0.02,
    },
    {
      label: "Skills",
      value: skills?.length ?? 0,
      color: "cyan",
      pct: Math.min(1, (skills?.length ?? 0) / 20),
    },
  ];

  const lastUpdate = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="p-8">
      <Onboarding />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{active?.name ?? "Overview"}</h1>
          <p className="text-sm text-muted">
            Everything your agents are doing in this Space, at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => spaceId && seed({ spaceId })}
            disabled={!spaceId}
          >
            Load demo data
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Connect agent
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{s.label}</p>
              <p className="mt-0.5 text-xs text-muted">Last update: {lastUpdate}</p>
            </div>
            <RingGauge value={s.value} unit={s.unit} color={s.color} pct={s.pct} size={88} />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Agents</h2>
            <Link href="/dashboard/agents" className="text-xs text-accent">
              View all
            </Link>
          </div>
          <ul className="space-y-2">
            {(agents ?? []).slice(0, 6).map((a) => (
              <li
                key={a._id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <StatusDot status={a.status} />
                <span className="flex-1 truncate text-sm">{a.name}</span>
                <span className="text-xs text-muted">{a.platform ?? "—"}</span>
              </li>
            ))}
            {agents?.length === 0 && (
              <p className="text-sm text-muted">
                No agents yet — connect one or load demo data.
              </p>
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Live activity</h2>
          <ActivityFeed limit={12} />
        </Card>
      </div>

      <RegisterAgentDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
