"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { PageHead, PillButton, Panel, ListRow } from "@/components/dash/kit";

export default function ReportsPage() {
  const { spaceId } = useActiveSpace();
  const reports = useQuery(api.reports.list, spaceId ? { spaceId } : "skip");
  const generate = useMutation(api.reports.generate);

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="reports · this space"
          title="Reports"
          sub="Auto-generated digests of what the Space accomplished. Daily digests run automatically; generate one on demand any time."
          actions={
            <>
              <PillButton variant="outline" onClick={() => spaceId && generate({ spaceId, kind: "daily" })}>
                Generate daily
              </PillButton>
              <PillButton onClick={() => spaceId && generate({ spaceId, kind: "weekly" })}>Generate weekly</PillButton>
            </>
          }
        />

        {reports?.length === 0 ? (
          <Panel>
            <EmptyState title="No reports yet" body="Generate a digest now, or wait for the automatic daily run." />
          </Panel>
        ) : (
          <Panel>
            <div>
              {(reports ?? []).map((r) => (
                <ListRow
                  key={r._id}
                  title={<span className="font-medium text-[var(--foreground)]">{r.title}</span>}
                  meta={
                    <>
                      {r.summary}
                      <span className="mx-1.5">·</span>
                      {new Date(r.periodStart).toLocaleDateString()} – {new Date(r.periodEnd).toLocaleDateString()}
                    </>
                  }
                  trailing={
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[11.5px] font-medium capitalize text-[var(--muted-strong)]">
                        {r.kind}
                      </span>
                      <span>{timeAgo(r.createdAt)}</span>
                    </div>
                  }
                />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
