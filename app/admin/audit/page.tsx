"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, Badge } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

const SEV_TONE = {
  info: "default",
  warning: "yellow",
  critical: "red",
} as const;

export default function AdminAudit() {
  const trail = useQuery(api.admin.auditTrail, { limit: 200 });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin audit trail</h1>
        <p className="text-sm text-muted">
          Append-only record of every platform-admin action. There is no delete
          or edit path — this is the tamper-evident record of privileged access.
        </p>
      </div>

      <Card className="p-0">
        {(trail ?? []).map((e) => (
          <div
            key={e._id}
            className="flex items-start gap-3 border-b border-border px-6 py-3.5 last:border-b-0"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{e.action}</span>
                {e.resource && <span className="text-muted">· {e.resource}</span>}
                {e.target && (
                  <span className="font-mono text-xs text-muted">{e.target}</span>
                )}
              </p>
              <p className="truncate text-xs text-muted">
                {e.adminEmail ?? e.adminId}
                {e.detail ? ` — ${e.detail}` : ""}
              </p>
            </div>
            <Badge tone={SEV_TONE[(e.severity ?? "info") as keyof typeof SEV_TONE]}>
              {e.severity ?? "info"}
            </Badge>
            <span className="shrink-0 text-xs text-muted">{timeAgo(e.createdAt)}</span>
          </div>
        ))}
        {(trail ?? []).length === 0 && (
          <p className="px-6 py-10 text-center text-sm text-muted">
            {trail === undefined ? "Loading…" : "No admin actions recorded yet."}
          </p>
        )}
      </Card>
    </div>
  );
}
