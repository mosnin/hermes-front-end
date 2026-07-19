"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Download, Search, ShieldAlert } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { Badge, EmptyState, Input, SkeletonRows } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { PageHead, PillButton, Panel, ListRow } from "@/components/dash/kit";

const CATEGORIES = [
  "all",
  "agent",
  "a2a",
  "task",
  "workflow",
  "governance",
  "integration",
  "system",
];

const tone: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  agent: "blue",
  a2a: "green",
  task: "default",
  workflow: "blue",
  governance: "red",
  integration: "yellow",
  system: "default",
};

export default function AuditPage() {
  const { spaceId, active } = useActiveSpace();
  const isAdmin = useCan("admin");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");

  const events = useQuery(
    api.audit.list,
    isAdmin && spaceId
      ? { spaceId, category: category === "all" ? undefined : category, limit: 500 }
      : "skip",
  );

  const [exporting, setExporting] = useState(false);
  const audit = useQuery(
    api.audit.export_,
    exporting && spaceId ? { spaceId, sinceDays: 30 } : "skip",
  );

  useEffect(() => {
    if (exporting && audit) {
      const blob = new Blob([JSON.stringify(audit, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExporting(false);
    }
  }, [exporting, audit]);

  const term = search.trim().toLowerCase();
  const filtered = (events ?? []).filter((e) =>
    term ? (e.summary ?? "").toLowerCase().includes(term) : true,
  );

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · audit`}
          title="Audit log"
          sub="Immutable record of every action, for compliance. Admin only."
          actions={
            isAdmin && (
              <PillButton variant="outline" onClick={() => setExporting(true)} className={exporting ? "pointer-events-none opacity-60" : undefined}>
                <Download className="h-4 w-4" />
                {exporting ? "Exporting…" : "Export JSON"}
              </PillButton>
            )
          }
        />

        {!isAdmin ? (
          <Panel>
            <div className="flex items-center gap-3 text-[13.5px] text-[var(--muted)]">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Admins only, you don&apos;t have access to the audit log.
            </div>
          </Panel>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <PillButton
                  key={c}
                  variant={category === c ? "solid" : "outline"}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </PillButton>
              ))}
            </div>

            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search summaries…"
                className="pl-9"
              />
            </div>

            {events === undefined ? (
              <Panel>
                <SkeletonRows rows={6} />
              </Panel>
            ) : filtered.length === 0 ? (
              <Panel>
                <EmptyState
                  title="No matching events"
                  body="Every agent, task, and governance action is appended here permanently."
                />
              </Panel>
            ) : (
              <Panel>
                <div>
                  {filtered.map((e) => (
                    <ListRow
                      key={e._id}
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={tone[e.category] ?? "default"}>{e.category}</Badge>
                          <span>{e.summary}</span>
                        </span>
                      }
                      meta={`${e.actorType}${e.action ? ` · ${e.action}` : ""}`}
                      trailing={timeAgo(e.createdAt)}
                    />
                  ))}
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
