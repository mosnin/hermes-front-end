"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";

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
  const { spaceId } = useActiveSpace();
  const [category, setCategory] = useState("all");
  const events = useQuery(
    api.workEvents.history,
    spaceId
      ? { spaceId, category: category === "all" ? undefined : category, limit: 300 }
      : "skip",
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Work history</h1>
        <p className="text-sm text-muted">
          The durable, immutable record of everything that happened in this
          Space, the source of truth for what got done.
        </p>
      </div>

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

      <Card>
        {events === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : events.length === 0 ? (
          <EmptyState
            title="No recorded work yet"
            body="As agents and workflows act, every event is appended here permanently."
          />
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e._id} className="flex items-start gap-3 py-3">
                <Badge tone={tone[e.category] ?? "default"}>{e.category}</Badge>
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
    </div>
  );
}
