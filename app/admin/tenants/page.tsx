"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Input, SkeletonRows } from "@/components/ui";
import { CountUp, Reveal, Stagger, StaggerItem } from "@/components/site/motion";
import { useToast } from "@/components/toast";
import { Boxes, Building2, Pause, Play, Server } from "@/components/icons";

export default function AdminTenants() {
  const tenants = useQuery(api.admin.tenants, {});
  const setCompanyAutonomy = useMutation(api.admin.setCompanyAutonomy);
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function togglePause(companyId: string, paused: boolean) {
    setBusy(companyId);
    try {
      const res = await setCompanyAutonomy({ companyId, paused });
      toast(
        `${paused ? "Paused" : "Resumed"} ${res.spaces} space(s)`,
        paused ? "error" : "success",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    const list = tenants ?? [];
    const needle = q.trim().toLowerCase();
    return needle
      ? list.filter((t) => t.companyId.toLowerCase().includes(needle))
      : list;
  }, [tenants, q]);

  const totals = useMemo(() => {
    const list = tenants ?? [];
    return list.reduce(
      (acc, t) => ({
        spaces: acc.spaces + t.spaces,
        agents: acc.agents + t.agents,
        paused: acc.paused + t.paused,
      }),
      { spaces: 0, agents: 0, paused: 0 },
    );
  }, [tenants]);

  return (
    <div className="p-8">
      <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tenants</h1>
          <p className="text-sm text-muted">
            Every company on the platform. Read-only, tenant data is never
            mutated from here.
          </p>
        </div>
        <div className="w-64">
          <Input
            placeholder="Filter by company id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </Reveal>

      {tenants !== undefined && (
        <Stagger className="mb-4 flex flex-wrap gap-3 text-sm" gap={0.05}>
          <StaggerItem as="div" y={8} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted" />
            <span className="text-foreground">
              <CountUp value={tenants.length} duration={0.9} /> {tenants.length === 1 ? "company" : "companies"}
            </span>
          </StaggerItem>
          <StaggerItem as="div" y={8} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
            <Server className="h-3.5 w-3.5 text-muted" />
            <span className="text-foreground">
              <CountUp value={totals.spaces} duration={0.9} /> spaces
            </span>
          </StaggerItem>
          <StaggerItem as="div" y={8} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5">
            <Boxes className="h-3.5 w-3.5 text-muted" />
            <span className="text-foreground">
              <CountUp value={totals.agents} duration={0.9} /> agents
            </span>
          </StaggerItem>
          {totals.paused > 0 && (
            <StaggerItem as="div" y={8} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5">
              <Pause className="h-3.5 w-3.5 text-red-600" />
              <span className="text-red-700">
                <CountUp value={totals.paused} duration={0.9} /> paused
              </span>
            </StaggerItem>
          )}
        </Stagger>
      )}

      <Reveal delay={0.06}>
        <Card className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 border-b border-border px-6 py-3 text-xs uppercase tracking-wider text-muted">
            <span>Company</span>
            <span className="text-right">Spaces</span>
            <span className="text-right">Agents</span>
            <span className="text-right">Paused</span>
            <span className="text-right">Plans</span>
            <span className="text-right">Control</span>
          </div>
          <Stagger as="div" gap={0.03}>
            {rows.map((t) => {
              const allPaused = t.paused >= t.spaces && t.spaces > 0;
              return (
                <StaggerItem
                  key={t.companyId}
                  as="div"
                  y={8}
                  duration={0.4}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 border-b border-border px-6 py-3.5 text-sm last:border-b-0"
                >
                  <span className="flex items-center gap-2 truncate font-mono text-xs text-foreground">
                    <Building2 className="h-4 w-4 shrink-0 text-muted" />
                    {t.companyId}
                  </span>
                  <span className="text-right text-foreground">
                    <CountUp value={t.spaces} duration={0.6} pop={false} />
                  </span>
                  <span className="text-right text-foreground">
                    <CountUp value={t.agents} duration={0.6} pop={false} />
                  </span>
                  <span className={`text-right ${t.paused > 0 ? "text-red-600" : "text-muted"}`}>
                    <CountUp value={t.paused} duration={0.6} pop={false} />
                  </span>
                  <span className="flex justify-end gap-1">
                    {t.plans.map((p) => (
                      <Badge
                        key={p}
                        tone={p === "enterprise" ? "green" : p === "team" ? "blue" : "default"}
                      >
                        {p}
                      </Badge>
                    ))}
                  </span>
                  <span className="flex justify-end">
                    <button
                      disabled={busy === t.companyId}
                      onClick={() => togglePause(t.companyId, !allPaused)}
                      title={allPaused ? "Resume all autonomy" : "Pause all autonomy (break-glass)"}
                      className={`rounded-lg border p-1.5 transition-colors disabled:opacity-40 ${allPaused ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}
                    >
                      {allPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </button>
                  </span>
                </StaggerItem>
              );
            })}
          </Stagger>
          {tenants === undefined && (
            <div className="p-6">
              <SkeletonRows rows={5} />
            </div>
          )}
          {tenants !== undefined && rows.length === 0 && (
            <p className="px-6 py-10 text-center text-sm text-muted">
              No tenants match.
            </p>
          )}
        </Card>
      </Reveal>
    </div>
  );
}
