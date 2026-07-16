"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, RingGauge } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/marketing/motion";
import { CheckCircle2, AlertCircle, XCircle } from "@/components/icons";

const STATUS_META = {
  pass: { icon: CheckCircle2, cls: "text-lime-400", label: "Pass" },
  warn: { icon: AlertCircle, cls: "text-amber-400", label: "Attention" },
  fail: { icon: XCircle, cls: "text-red-400", label: "Fail" },
} as const;

export default function AdminCompliance() {
  const data = useQuery(api.admin.compliance, {});

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">SOC 2 controls</h1>
        <p className="text-sm text-muted">
          Live control posture, each mapped to a Trust Service Criterion and
          backed by real system state, not a static checklist.
        </p>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="flex items-center gap-5">
          <RingGauge
            value={data?.score ?? 0}
            unit="%"
            color={
              (data?.score ?? 0) >= 90
                ? "green"
                : (data?.score ?? 0) >= 70
                  ? "accent"
                  : "red"
            }
            pct={(data?.score ?? 0) / 100}
            size={110}
          />
          <div>
            <p className="text-sm text-muted">Controls passing</p>
            <p className="text-3xl font-semibold">
              {data ? `${data.passed}/${data.total}` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Evidence refreshes from platform state on every load.
            </p>
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">What this means</h2>
          <p className="text-sm text-muted">
            These controls demonstrate the platform&apos;s security and
            availability posture for an SOC 2 Type II audit. Every privileged
            action in this console is written to an immutable audit trail, tenant
            data is isolated on every query, and budgets/kill-switches bound
            autonomous spend. Failing or attention items link to the remediation
            surface in the product.
          </p>
        </Card>
      </div>

      <Stagger className="grid gap-3">
        {(data?.controls ?? []).map((c) => {
          const meta = STATUS_META[c.status as keyof typeof STATUS_META];
          const Icon = meta.icon;
          return (
            <StaggerItem key={c.id}>
              <Card className="flex items-start gap-4">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">
                      {c.id}
                    </span>
                    <h3 className="font-medium">{c.title}</h3>
                    <span className="ml-auto text-xs text-muted">{c.criteria}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{c.evidence}</p>
                </div>
                <span className={`shrink-0 text-xs font-medium ${meta.cls}`}>
                  {meta.label}
                </span>
              </Card>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
