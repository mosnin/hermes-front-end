"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState, SkeletonRows } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Undo2 } from "@/components/icons";
import { PageHead, PillButton, Panel, ListRow } from "@/components/dash/kit";

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
  const { spaceId, active } = useActiveSpace();
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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · ledger`}
          title="Action ledger"
          sub="Every action agents take or propose, with rollback."
        />

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <PillButton
              key={f.key}
              variant={filter === f.key ? "solid" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </PillButton>
          ))}
        </div>

        {entries === undefined ? (
          <Panel>
            <SkeletonRows rows={6} />
          </Panel>
        ) : entries.length === 0 ? (
          <Panel>
            <EmptyState
              title="No actions yet"
              body="As agents take or propose actions, they land here, every one reversible by an admin."
            />
          </Panel>
        ) : (
          <Panel>
            <div>
              {entries.map((e) => (
                <ListRow
                  key={e._id}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone[e.status] ?? "default"}>{e.status}</Badge>
                      <span className="font-medium">{e.action}</span>
                      {e.target && (
                        <span className="truncate text-[13px] text-[var(--muted)]">→ {e.target}</span>
                      )}
                    </span>
                  }
                  meta={`${e.agentId ? `Agent ${e.agentId}` : "System"} · ${timeAgo(e.createdAt)}${
                    e.reversible ? " · reversible" : ""
                  }`}
                  trailing={
                    e.status === "executed" && e.reversible && canAdmin ? (
                      <PillButton variant="outline" onClick={() => onRevert(e._id)}>
                        <Undo2 className="h-3.5 w-3.5" /> Revert
                      </PillButton>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
