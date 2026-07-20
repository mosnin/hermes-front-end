"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion, useReducedMotion } from "motion/react";
import { api } from "@/convex/_generated/api";
import { ActivityFeed } from "@/components/activity-feed";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { useActiveSpace } from "@/components/active-space";
import { Onboarding } from "@/components/onboarding";
import { timeAgo } from "@/lib/utils";
import { EASE, Reveal } from "@/components/site/motion";
import {
  PageHead,
  PillButton,
  Panel,
  StatTile,
  StatRow,
  ListRow,
  Dot,
  SectionLabel,
} from "@/components/dash/kit";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Map an agent status string to a kit Dot tone. */
function toneFor(status?: string): "online" | "paused" | "idle" | "error" {
  if (status === "online") return "online";
  if (status === "paused") return "paused";
  if (status === "error" || status === "degraded") return "error";
  return "idle";
}

export default function OverviewPage() {
  const reduce = useReducedMotion();
  const { spaceId, active } = useActiveSpace();
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const activity = useQuery(api.activity.feed, spaceId ? { spaceId, limit: 200 } : "skip");
  const errors = useQuery(api.observability.listErrors, spaceId ? { spaceId, limit: 100 } : "skip");
  const metrics = useQuery(api.metrics.summary, spaceId ? { spaceId } : "skip");
  const seed = useMutation(api.demo.seed);
  const [open, setOpen] = useState(false);

  const agentList = agents ?? [];
  const online = agentList.filter((a) => a.status === "online").length;
  const errorCount = errors?.length ?? 0;
  const a2aSent = metrics?.a2a?.sent ?? 0;
  const runsLive = metrics?.runs?.running ?? 0;

  // Throughput: events per day for the trailing 7 days (oldest to newest).
  const week = useMemo(() => {
    const now = Date.now();
    const days = Array.from({ length: 7 }, (_, i) => 6 - i); // 6..0
    return days.map((d) => {
      const count = (activity ?? []).filter((a) => {
        const age = now - a.createdAt;
        return age >= d * DAY_MS && age < (d + 1) * DAY_MS;
      }).length;
      const label = d === 0 ? "Today" : new Date(now - d * DAY_MS).toLocaleDateString([], { weekday: "short" }).slice(0, 1);
      return { count, label };
    });
  }, [activity]);
  const weekMax = Math.max(1, ...week.map((w) => w.count));

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <Onboarding />

        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · control plane`}
          title="Overview"
          sub="Your fleet at a glance. Live agent health, throughput, and what shipped."
          actions={
            <>
              <PillButton variant="outline" onClick={() => spaceId && seed({ spaceId })}>
                Load demo
              </PillButton>
              <PillButton onClick={() => setOpen(true)}>Connect agent</PillButton>
            </>
          }
        />

        <StatRow>
          <StatTile
            value={online}
            label="Agents online"
            hint={`of ${agentList.length} connected`}
            tone="ink"
          />
          <StatTile value={runsLive} label="Workflows running" hint="live now" />
          <StatTile value={a2aSent} label="Messages · 24h" hint="A2A and bridges" />
          <StatTile
            value={errorCount}
            label="Errors · 24h"
            hint={errorCount === 0 ? "all clear" : "needs a look"}
          />
        </StatRow>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel
            title="Live activity"
            action={<PillButton variant="outline" href="/dashboard/history">See all</PillButton>}
          >
            <ActivityFeed limit={7} />
          </Panel>

          <Panel
            title="Fleet"
            tone="band"
            action={<PillButton variant="outline" href="/dashboard/agents">Manage</PillButton>}
          >
            {agentList.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">
                No agents yet. Connect one to see it here.
              </p>
            ) : (
              <div>
                {agentList.slice(0, 6).map((a) => (
                  <ListRow
                    key={a._id}
                    leading={<Dot tone={toneFor(a.status)} />}
                    title={a.name}
                    meta={a.framework ?? a.platform ?? "hermes"}
                    trailing={a.lastHeartbeat ? timeAgo(a.lastHeartbeat) : "never"}
                    href={`/dashboard/agents/${a._id}`}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div>
          <SectionLabel>throughput · last 7 days</SectionLabel>
          <Panel>
            <div className="flex h-40 items-end gap-2.5">
              {week.map((w, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <motion.div
                    initial={{ scaleY: reduce ? 1 : 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: reduce ? 0 : i * 0.05, ease: EASE }}
                    style={{ height: `${Math.max(6, (w.count / weekMax) * 100)}%`, transformOrigin: "bottom" }}
                    className="w-full rounded-t-lg bg-[var(--foreground)]"
                    title={`${w.count} events`}
                  />
                  <span className="text-[11px] text-[var(--muted)]">{w.label}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <RegisterAgentDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
