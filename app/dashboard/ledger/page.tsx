"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Undo2 } from "lucide-react";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "proposed", label: "Proposed" },
  { key: "executed", label: "Executed" },
  { key: "reverted", label: "Reverted" },
  { key: "blocked", label: "Blocked" },
] as const;

const statusTone: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  proposed: "yellow",
  executed: "green",
  reverted: "default",
  blocked: "red",
};

export default function LedgerPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const toast = useToast();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const entries = useQuery(
    api.ledger.list,
    spaceId
      ? { spaceId, status: filter === "all" ? undefined : filter }
      : "skip",
  );

  const revert = useMutation(api.ledger.revert);

  async function onRevert(entryId: Id<"actionLedger">) {
    if (!spaceId) return;
    try {
      await revert({ spaceId, entryId });
      toast("Action reverted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to revert", "error");
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Action ledger</h1>
        <p className="text-sm text-muted">
          Every action agents take or propose — with rollback.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs ${
              filter === f.key
                ? "bg-accent text-white"
                : "border border-border text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {entries === undefined ? (
        <Card>
          <p className="text-sm text-muted">Loading…</p>
        </Card>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No actions yet"
          body="As agents take or propose actions, they land here — every one reversible by an admin."
        />
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <Card key={e._id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone[e.status] ?? "default"}>
                      {e.status}
                    </Badge>
                    <span className="text-sm font-medium">{e.action}</span>
                    {e.target && (
                      <span className="truncate text-sm text-muted">
                        → {e.target}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {e.agentId ? `Agent ${e.agentId}` : "System"}
                    {" · "}
                    {timeAgo(e.createdAt)}
                    {e.reversible ? " · reversible" : ""}
                  </p>
                </div>
                {e.status === "executed" && e.reversible && canAdmin && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => onRevert(e._id)}
                    >
                      <Undo2 className="h-4 w-4" /> Revert
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
