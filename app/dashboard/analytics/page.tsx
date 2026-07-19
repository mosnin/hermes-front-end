"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Input } from "@/components/ui";
import { EASE } from "@/components/site/motion";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { Plus } from "@/components/icons";
import { PageHead, PillButton, Panel, StatTile, StatRow, ListRow, Dot, SectionLabel } from "@/components/dash/kit";

/** Map an agent status string to a kit Dot tone. */
function toneFor(status?: string): "online" | "paused" | "idle" | "error" {
  if (status === "online") return "online";
  if (status === "paused") return "paused";
  if (status === "error" || status === "degraded") return "error";
  return "idle";
}

export default function AnalyticsPage() {
  const reduce = useReducedMotion();
  const { spaceId } = useActiveSpace();
  const s = useQuery(api.analytics.summary, spaceId ? { spaceId } : "skip");
  const artifacts = useQuery(api.artifacts.list, spaceId ? { spaceId } : "skip");
  const createArtifact = useMutation(api.artifacts.create);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const maxDay = Math.max(1, ...(s?.perDay ?? [1]));

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="analytics · this space"
          title="Analytics"
          sub="Throughput, completion, and cost for this Space, what got done."
        />

        <StatRow>
          <StatTile
            value={s?.agents.online ?? 0}
            label="Agents online"
            hint={s ? `of ${s.agents.total} connected` : undefined}
            tone="ink"
          />
          <StatTile
            value={s ? Math.round(s.tasks.completionRate * 100) : 0}
            suffix="%"
            label="Task completion"
          />
          <StatTile value={s?.eventsLast7d ?? 0} label="Events · 7d" />
          <StatTile value={s ? Math.round(s.costUsd) : 0} prefix="$" label="Cost · 7d" hint={s ? `$${s.costUsd.toFixed(2)} exact` : undefined} />
        </StatRow>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Activity, last 7 days">
            <div className="flex h-32 items-end gap-2.5">
              {(s?.perDay ?? []).map((n, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-2">
                  <motion.div
                    className="w-full origin-bottom rounded-t-lg bg-[var(--foreground)]"
                    initial={{ scaleY: reduce ? 1 : 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : i * 0.05, ease: EASE }}
                    style={{ height: `${Math.max(4, (n / maxDay) * 100)}%` }}
                  />
                  <span className="text-[11px] text-[var(--muted)]">{n}</span>
                </div>
              ))}
              {s === undefined && <p className="w-full text-center text-[13.5px] text-[var(--muted)]">Loading…</p>}
            </div>
          </Panel>

          <Panel title="Tasks by status">
            <div className="space-y-3">
              {s &&
                Object.entries(s.tasks.byStatus).map(([k, n]) => {
                  const count = n as number;
                  return (
                    <div key={k} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-[13px] capitalize text-[var(--muted-strong)]">
                        {k.replace("_", " ")}
                      </span>
                      <div className="h-1.5 flex-1 rounded-full bg-[var(--surface)]">
                        <motion.div
                          className="h-1.5 rounded-full bg-[var(--foreground)]"
                          initial={{ width: 0 }}
                          animate={{ width: `${s.tasks.total ? (count / s.tasks.total) * 100 : 0}%` }}
                          transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
                        />
                      </div>
                      <span className="w-6 text-right text-[12.5px] text-[var(--muted)]">{count}</span>
                    </div>
                  );
                })}
              {s === undefined && <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>}
            </div>

            <div className="mt-5">
              <SectionLabel>workflow runs</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {s &&
                  Object.entries(s.runs.byStatus).map(([k, n]) => (
                    <Badge key={k} tone={k === "completed" ? "green" : k === "failed" ? "red" : "default"}>
                      {k}: {n as number}
                    </Badge>
                  ))}
                {s && s.runs.total === 0 && (
                  <span className="text-[13px] text-[var(--muted)]">No runs yet.</span>
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Agents" tone="band">
            {(s?.agentBreakdown ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">No agents yet.</p>
            ) : (
              <div>
                {(s?.agentBreakdown ?? []).map((a) => (
                  <ListRow
                    key={a.name}
                    leading={<Dot tone={toneFor(a.status)} />}
                    title={a.name}
                    trailing={`${a.tasks} tasks`}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Deliverables"
            action={
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  className="w-28 sm:w-32"
                />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://link"
                  className="w-32 sm:w-40"
                />
                <PillButton
                  className={!name.trim() || !url.trim() ? "pointer-events-none opacity-40" : ""}
                  onClick={async () => {
                    if (!spaceId || !name.trim() || !url.trim()) return;
                    await createArtifact({ spaceId, name: name.trim(), kind: "link", url: url.trim() });
                    setName("");
                    setUrl("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </PillButton>
              </div>
            }
          >
            {(artifacts ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">No deliverables yet.</p>
            ) : (
              <div>
                {(artifacts ?? []).map((a) => (
                  <ListRow
                    key={a._id}
                    leading={a.kind.slice(0, 2).toUpperCase()}
                    title={
                      a.downloadUrl ? (
                        <a href={a.downloadUrl} target="_blank" rel="noreferrer" className="hover:underline">
                          {a.name}
                        </a>
                      ) : (
                        a.name
                      )
                    }
                    meta={a.kind}
                    trailing={timeAgo(a.createdAt)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
