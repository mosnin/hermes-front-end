"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Input, SkeletonRows } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Building2, Pause, Play } from "lucide-react";

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

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted">
            Every company on the platform. Read-only — tenant data is never
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
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 border-b border-border px-6 py-3 text-xs uppercase tracking-wider text-muted">
          <span>Company</span>
          <span className="text-right">Spaces</span>
          <span className="text-right">Agents</span>
          <span className="text-right">Paused</span>
          <span className="text-right">Plans</span>
          <span className="text-right">Control</span>
        </div>
        {rows.map((t) => {
          const allPaused = t.paused >= t.spaces && t.spaces > 0;
          return (
            <div
              key={t.companyId}
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 border-b border-border px-6 py-3.5 text-sm last:border-b-0"
            >
              <span className="flex items-center gap-2 truncate font-mono text-xs">
                <Building2 className="h-4 w-4 shrink-0 text-muted" />
                {t.companyId}
              </span>
              <span className="text-right">{t.spaces}</span>
              <span className="text-right">{t.agents}</span>
              <span className={`text-right ${t.paused > 0 ? "text-red-400" : "text-muted"}`}>
                {t.paused}
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
                  className={`rounded-lg border p-1.5 transition disabled:opacity-40 ${allPaused ? "border-lime-400/30 text-lime-400" : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}
                >
                  {allPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
              </span>
            </div>
          );
        })}
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
    </div>
  );
}
