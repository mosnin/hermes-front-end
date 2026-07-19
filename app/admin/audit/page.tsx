"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { timeAgo } from "@/lib/utils";
import { PageHead, Panel, StatTile, StatRow, ListRow, Dot } from "@/components/dash/kit";

const SEV_TONE = {
  info: "idle",
  warning: "paused",
  critical: "error",
} as const;

const SEV_LABEL_CLS = {
  info: "text-[var(--muted)]",
  warning: "text-amber-600",
  critical: "text-red-600",
} as const;

export default function AdminAudit() {
  const trail = useQuery(api.admin.auditTrail, { limit: 200 });
  const rows = trail ?? [];

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Platform admin · audit trail"
          title="Admin audit trail"
          sub="Append-only record of every platform-admin action. There is no delete or edit path, this is the tamper-evident record of privileged access."
        />

        <StatRow>
          <StatTile
            value={rows.length}
            label={rows.length === 1 ? "Entry recorded" : "Entries recorded"}
            hint="last 200, newest first"
            tone="ink"
          />
        </StatRow>

        <Panel title="Activity">
          {trail === undefined ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">No admin actions recorded yet.</p>
          ) : (
            <div>
              {rows.map((e) => (
                <ListRow
                  key={e._id}
                  leading={<Dot tone={SEV_TONE[(e.severity ?? "info") as keyof typeof SEV_TONE]} />}
                  title={
                    <>
                      <span className="font-medium">{e.action}</span>
                      {e.resource && <span className="text-[var(--muted)]"> · {e.resource}</span>}
                      {e.target && <span className="ml-1.5 font-mono text-[12px] text-[var(--muted)]">{e.target}</span>}
                    </>
                  }
                  meta={`${e.adminEmail ?? e.adminId}${e.detail ? `, ${e.detail}` : ""}`}
                  trailing={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={SEV_LABEL_CLS[(e.severity ?? "info") as keyof typeof SEV_LABEL_CLS]}>
                        {e.severity ?? "info"}
                      </span>
                      <span>{timeAgo(e.createdAt)}</span>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
