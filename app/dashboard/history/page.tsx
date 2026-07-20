"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, EmptyState, SkeletonRows } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { PageHead, PillButton, Panel, ListRow } from "@/components/dash/kit";

const CATEGORIES = ["all", "agent", "a2a", "task", "workflow", "governance", "integration", "note"];

const tone: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  agent: "blue",
  a2a: "green",
  task: "default",
  workflow: "blue",
  governance: "red",
  integration: "yellow",
};

export default function HistoryPage() {
  const { spaceId, active } = useActiveSpace();
  const [category, setCategory] = useState("all");
  const events = useQuery(
    api.workEvents.history,
    spaceId
      ? { spaceId, category: category === "all" ? undefined : category, limit: 300 }
      : "skip",
  );

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · history`}
          title="Work history"
          sub="The durable, immutable record of everything that happened in this Space, the source of truth for what got done."
        />

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

        {events === undefined ? (
          <Panel>
            <SkeletonRows rows={6} />
          </Panel>
        ) : events.length === 0 ? (
          <Panel>
            <EmptyState
              title="No recorded work yet"
              body="As agents and workflows act, every event is appended here permanently."
            />
          </Panel>
        ) : (
          <Panel>
            <div>
              {events.map((e) => (
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
      </div>
    </div>
  );
}
