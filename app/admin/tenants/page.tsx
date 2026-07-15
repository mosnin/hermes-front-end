"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge, Input } from "@/components/ui";
import { Building2 } from "lucide-react";

export default function AdminTenants() {
  const tenants = useQuery(api.admin.tenants, {});
  const [q, setQ] = useState("");

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
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-border px-6 py-3 text-xs uppercase tracking-wider text-muted">
          <span>Company</span>
          <span className="text-right">Spaces</span>
          <span className="text-right">Agents</span>
          <span className="text-right">Paused</span>
          <span className="text-right">Plans</span>
        </div>
        {rows.map((t) => (
          <div
            key={t.companyId}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-border px-6 py-3.5 text-sm last:border-b-0"
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
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-muted">
            {tenants === undefined ? "Loading tenants…" : "No tenants match."}
          </p>
        )}
      </Card>
    </div>
  );
}
