"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHead, Panel, StatTile, StatRow, ListRow, Dot } from "@/components/dash/kit";

const STATUS_META = {
  pass: { tone: "online", cls: "text-green-600", label: "Pass" },
  warn: { tone: "paused", cls: "text-amber-600", label: "Attention" },
  fail: { tone: "error", cls: "text-red-600", label: "Fail" },
} as const;

export default function AdminCompliance() {
  const data = useQuery(api.admin.compliance, {});
  const score = data?.score ?? 0;
  const passed = data?.passed ?? 0;
  const total = data?.total ?? 0;
  const controls = data?.controls ?? [];

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Platform admin · compliance"
          title="SOC 2 controls"
          sub="Live control posture, each mapped to a Trust Service Criterion and backed by real system state, not a static checklist."
        />

        <StatRow>
          <StatTile value={score} suffix="%" label="Compliance score" hint="refreshes on every load" tone="ink" />
          <StatTile value={passed} label="Controls passing" hint={`of ${total} total`} />
        </StatRow>

        <Panel title="What this means" tone="band">
          <p className="text-[14.5px] leading-relaxed text-[var(--muted)]">
            These controls demonstrate the platform&apos;s security and availability posture for an SOC 2 Type II
            audit. Every privileged action in this console is written to an immutable audit trail, tenant data is
            isolated on every query, and budgets/kill-switches bound autonomous spend. Failing or attention items
            link to the remediation surface in the product.
          </p>
        </Panel>

        <Panel title="Controls">
          {data === undefined ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : controls.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">No controls configured.</p>
          ) : (
            <div>
              {controls.map((c) => {
                const meta = STATUS_META[c.status as keyof typeof STATUS_META];
                return (
                  <ListRow
                    key={c.id}
                    leading={<Dot tone={meta.tone} />}
                    title={
                      <>
                        <span className="font-mono text-[12px] text-[var(--muted)]">{c.id}</span>{" "}
                        <span className="font-medium">{c.title}</span>
                      </>
                    }
                    meta={c.evidence}
                    trailing={
                      <div className="flex flex-col items-end gap-0.5">
                        <span>{c.criteria}</span>
                        <span className={meta.cls}>{meta.label}</span>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
