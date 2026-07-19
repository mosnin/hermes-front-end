"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/toast";
import { Building2, Pause, Play } from "@/components/icons";
import { PageHead, Panel, StatTile, StatRow, ListRow } from "@/components/dash/kit";

const PLAN_CLS: Record<string, string> = {
  enterprise: "bg-green-50 text-green-700",
  team: "bg-sky-50 text-sky-700",
};

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
      toast(`${paused ? "Paused" : "Resumed"} ${res.spaces} space(s)`, paused ? "error" : "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    const list = tenants ?? [];
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((t) => t.companyId.toLowerCase().includes(needle)) : list;
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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Platform admin · tenants"
          title="Tenants"
          sub="Every company on the platform. Read-only, tenant data is never mutated from here."
        />

        <StatRow>
          <StatTile value={(tenants ?? []).length} label="Companies" hint="on the platform" tone="ink" />
          <StatTile value={totals.spaces} label="Spaces" hint="across all tenants" />
          <StatTile value={totals.agents} label="Agents" hint="registered" />
          <StatTile
            value={totals.paused}
            label="Paused"
            hint={totals.paused > 0 ? "autonomy on hold" : "all clear"}
          />
        </StatRow>

        <Panel
          title="Companies"
          action={
            <input
              type="text"
              placeholder="Filter by company id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-full border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-[14px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--border-hover)] sm:w-64"
            />
          }
        >
          {tenants === undefined ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">No tenants match.</p>
          ) : (
            <div>
              {rows.map((t) => {
                const allPaused = t.paused >= t.spaces && t.spaces > 0;
                return (
                  <ListRow
                    key={t.companyId}
                    leading={<Building2 className="h-4 w-4" />}
                    title={<span className="font-mono text-[13px]">{t.companyId}</span>}
                    meta={`${t.spaces} space${t.spaces === 1 ? "" : "s"} · ${t.agents} agent${t.agents === 1 ? "" : "s"}${t.paused > 0 ? ` · ${t.paused} paused` : ""}`}
                    trailing={
                      <div className="flex items-center gap-2">
                        {t.plans.map((p) => (
                          <span
                            key={p}
                            className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${PLAN_CLS[p] ?? "bg-[var(--surface)] text-[var(--muted)]"}`}
                          >
                            {p}
                          </span>
                        ))}
                        <button
                          disabled={busy === t.companyId}
                          onClick={() => togglePause(t.companyId, !allPaused)}
                          title={allPaused ? "Resume all autonomy" : "Pause all autonomy (break-glass)"}
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40 ${
                            allPaused
                              ? "bg-green-50 text-green-700 hover:bg-green-100"
                              : "bg-red-50 text-red-600 hover:bg-red-100"
                          }`}
                        >
                          {allPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        </button>
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
