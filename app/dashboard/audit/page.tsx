"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Download, Search, ShieldAlert } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";

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
  const { spaceId } = useActiveSpace();
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
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit log</h1>
          <p className="text-sm text-muted">
            Immutable record of every action, for compliance. Admin only.
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => setExporting(true)}
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export JSON"}
          </Button>
        )}
      </div>

      {!isAdmin ? (
        <Card>
          <div className="flex items-center gap-3 text-sm text-muted">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            Admins only — you don&apos;t have access to the audit log.
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1 text-xs ${
                  category === c
                    ? "bg-accent text-white"
                    : "border border-border text-muted hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mb-4 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search summaries…"
            />
          </div>

          <Card>
            {events === undefined ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No matching events"
                body="Every agent, task, and governance action is appended here permanently."
              />
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((e) => (
                  <li key={e._id} className="flex items-start gap-3 py-3">
                    <Badge tone={tone[e.category] ?? "default"}>
                      {e.category}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{e.summary}</p>
                      <p className="text-xs text-muted">
                        {e.actorType}
                        {e.action ? ` · ${e.action}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {timeAgo(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
