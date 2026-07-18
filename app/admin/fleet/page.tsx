"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Input, SkeletonRows } from "@/components/ui";
import { Server } from "@/components/icons";

const STATUS_TONE: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  running: "green",
  provisioning: "yellow",
  stopped: "default",
  failed: "red",
  unknown: "default",
};

export default function AdminFleet() {
  const fleet = useQuery(api.admin.fleet, {});
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = fleet ?? [];
    const needle = q.trim().toLowerCase();
    return needle
      ? list.filter(
          (a) =>
            a.name.toLowerCase().includes(needle) ||
            a.companyId.toLowerCase().includes(needle) ||
            a.spaceName.toLowerCase().includes(needle),
        )
      : list;
  }, [fleet, q]);

  const totals = useMemo(() => {
    const list = fleet ?? [];
    return {
      running: list.filter((a) => a.deploymentStatus === "running").length,
      provisioning: list.filter((a) => a.deploymentStatus === "provisioning").length,
      stopped: list.filter((a) => a.deploymentStatus === "stopped" || a.deploymentStatus === "failed")
        .length,
    };
  }, [fleet]);

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fleet</h1>
          <p className="text-sm text-muted">
            Every hosted agent across all tenants (managed hosting on Cloudflare
            Containers). Read-only, no terminate action yet.
          </p>
        </div>
        <div className="w-64">
          <Input
            placeholder="Filter by agent, company, space…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
          <Server className="h-3.5 w-3.5 text-lime-400" />
          {totals.running} running
        </span>
        <span className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
          <Server className="h-3.5 w-3.5 text-yellow-400" />
          {totals.provisioning} provisioning
        </span>
        <span className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
          <Server className="h-3.5 w-3.5 text-muted" />
          {totals.stopped} stopped
        </span>
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-4 border-b border-border px-6 py-3 text-xs uppercase tracking-wider text-muted">
          <span>Agent</span>
          <span>Company / Space</span>
          <span className="text-right">Provider</span>
          <span className="text-right">Region</span>
          <span className="text-right">Status</span>
          <span className="text-right">Created</span>
        </div>
        {rows.map((a) => (
          <div
            key={a.agentId}
            className="grid grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-4 border-b border-border px-6 py-3.5 text-sm last:border-b-0"
          >
            <span className="flex items-center gap-2 truncate">
              <Server className="h-4 w-4 shrink-0 text-muted" />
              {a.name}
            </span>
            <span className="truncate font-mono text-xs text-muted">
              {a.companyId} / {a.spaceName}
            </span>
            <span className="text-right text-xs uppercase text-muted">{a.vmProvider}</span>
            <span className="text-right text-xs text-muted">{a.region ?? "—"}</span>
            <span className="flex justify-end">
              <Badge tone={STATUS_TONE[a.deploymentStatus] ?? "default"}>
                {a.deploymentStatus}
              </Badge>
            </span>
            <span className="text-right text-xs text-muted">
              {new Date(a.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
        {fleet === undefined && (
          <div className="p-6">
            <SkeletonRows rows={5} />
          </div>
        )}
        {fleet !== undefined && rows.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-muted">
            No hosted agents match.
          </p>
        )}
      </Card>
    </div>
  );
}
