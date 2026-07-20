"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Search, X } from "@/components/icons";
import { PageHead, Panel, StatTile, StatRow, ListRow, Dot } from "@/components/dash/kit";

const STATUS_TONE = {
  running: "online",
  provisioning: "paused",
  stopped: "idle",
  failed: "error",
  unknown: "idle",
} as const;

const STATUS_CLS: Record<string, string> = {
  running: "text-green-600",
  provisioning: "text-amber-600",
  stopped: "text-[var(--muted)]",
  failed: "text-red-600",
  unknown: "text-[var(--muted)]",
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
      stopped: list.filter((a) => a.deploymentStatus === "stopped" || a.deploymentStatus === "failed").length,
    };
  }, [fleet]);

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Platform admin · infrastructure"
          title="Fleet"
          sub="Every hosted agent across all tenants (managed hosting on Cloudflare Containers). Read-only, no terminate action yet."
        />

        <StatRow>
          <StatTile value={totals.running} label="Running" hint="hosted agents live" tone="ink" />
          <StatTile value={totals.provisioning} label="Provisioning" hint="coming online" />
          <StatTile value={totals.stopped} label="Stopped" hint="stopped or failed" />
        </StatRow>

        <Panel
          title="Hosted agents"
          action={
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="text"
                placeholder="Filter by agent, company, space…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full rounded-full border border-[var(--border)] bg-[var(--background)] py-2 pl-9 pr-8 text-[14px] text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--border-hover)]"
              />
              {q.length > 0 && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setQ("")}
                  className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface)]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          }
        >
          {fleet === undefined ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">
              {q.trim() ? "No hosted agents match that filter." : "No hosted agents yet."}
            </p>
          ) : (
            <div>
              {rows.map((a) => (
                <ListRow
                  key={a.agentId}
                  leading={<Dot tone={STATUS_TONE[a.deploymentStatus as keyof typeof STATUS_TONE] ?? "idle"} />}
                  title={a.name}
                  meta={`${a.companyId} / ${a.spaceName} · ${a.vmProvider.toUpperCase()} · ${a.region ?? "—"}`}
                  trailing={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={STATUS_CLS[a.deploymentStatus] ?? "text-[var(--muted)]"}>
                        {a.deploymentStatus}
                      </span>
                      <span>{new Date(a.createdAt).toLocaleDateString()}</span>
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
