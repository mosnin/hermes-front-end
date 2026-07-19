"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge } from "@/components/ui";
import { CountUp, Reveal } from "@/components/site/motion";
import { timeAgo } from "@/lib/utils";
import { ShieldCheck } from "@/components/icons";

const SEV_TONE = {
  info: "default",
  warning: "yellow",
  critical: "red",
} as const;

export default function AdminAudit() {
  const trail = useQuery(api.admin.auditTrail, { limit: 200 });

  return (
    <div className="p-8">
      <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Admin audit trail</h1>
          <p className="text-sm text-muted">
            Append-only record of every platform-admin action. There is no delete
            or edit path, this is the tamper-evident record of privileged access.
          </p>
        </div>
        {trail !== undefined && (
          <span className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground">
            <CountUp value={trail.length} duration={0.8} /> {trail.length === 1 ? "entry" : "entries"}
          </span>
        )}
      </Reveal>

      <Reveal delay={0.06}>
        <Card className="p-0">
          {/* Rows fade/rise in together as a single reveal rather than a
              per-row stagger: the trail can hold up to 200 entries, and
              per-item viewport animation at that scale buys nothing visually
              once the list runs past a screenful, only extra animated nodes. */}
          {(trail ?? []).map((e) => (
            <div
              key={e._id}
              className="flex items-start gap-3 border-b border-border px-6 py-3.5 last:border-b-0"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{e.action}</span>
                  {e.resource && <span className="text-muted">· {e.resource}</span>}
                  {e.target && (
                    <span className="font-mono text-xs text-muted">{e.target}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {e.adminEmail ?? e.adminId}
                  {e.detail ? `, ${e.detail}` : ""}
                </p>
              </div>
              <Badge tone={SEV_TONE[(e.severity ?? "info") as keyof typeof SEV_TONE]}>
                {e.severity ?? "info"}
              </Badge>
              <span className="shrink-0 text-xs text-muted">{timeAgo(e.createdAt)}</span>
            </div>
          ))}
          {(trail ?? []).length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-muted">
              {trail === undefined ? "Loading…" : "No admin actions recorded yet."}
            </p>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
