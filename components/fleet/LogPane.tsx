"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Segmented } from "@/components/ui";
import { ScrollText } from "@/components/icons";
import { cn } from "@/lib/utils";

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: (Level | "all")[] = ["all", "debug", "info", "warn", "error"];

const LEVEL_TONE: Record<Level, "default" | "green" | "yellow" | "red" | "blue"> = {
  debug: "default",
  info: "blue",
  warn: "yellow",
  error: "red",
};

/**
 * Live log pane for an agent (feature 6). Convex's reactive `useQuery`
 * already re-renders on new inserts, so "follow the tail" is just "keep the
 * scroll pinned to the bottom whenever new lines arrive and the user hasn't
 * scrolled up to read history".
 */
export function LogPane({
  spaceId,
  agentId,
}: {
  spaceId: Id<"spaces">;
  agentId: Id<"agents">;
}) {
  const [level, setLevel] = useState<Level | "all">("all");
  const [follow, setFollow] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useQuery(api.logs.tail, {
    spaceId,
    agentId,
    level: level === "all" ? undefined : level,
    limit: 200,
  });
  const counts = useQuery(api.logs.levelCounts, { spaceId, agentId });

  // Newest-first from the server; render oldest-first like a terminal.
  const lines = rows ? [...rows].reverse() : undefined;

  useEffect(() => {
    if (!follow || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines, follow]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setFollow(atBottom);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ScrollText className="h-4 w-4" /> Live logs
        </h2>
        <div className="flex items-center gap-3">
          {counts && (
            <div className="hidden items-center gap-1.5 sm:flex">
              {counts.error > 0 && <Badge tone="red">{counts.error} err/1h</Badge>}
              {counts.warn > 0 && <Badge tone="yellow">{counts.warn} warn/1h</Badge>}
            </div>
          )}
          <Segmented
            value={level}
            onChange={(v) => setLevel(v)}
            options={LEVELS.map((l) => ({ value: l, label: l }))}
          />
          <button
            onClick={() => {
              setFollow(true);
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
            }}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition",
              follow ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground",
            )}
            title={follow ? "Following the tail" : "Jump to latest"}
          >
            {follow ? "● live" : "○ paused"}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-72 overflow-y-auto p-3 font-mono text-xs leading-relaxed"
      >
        {lines === undefined ? (
          <p className="text-muted">Loading…</p>
        ) : lines.length === 0 ? (
          <p className="text-muted">
            No log lines yet. Once the connector streams output, it shows up here in real time.
          </p>
        ) : (
          <div className="space-y-0.5">
            {lines.map((l) => (
              <div key={l._id} className="flex items-start gap-2">
                <span className="shrink-0 text-muted">
                  {new Date(l.ts).toLocaleTimeString()}
                </span>
                <Badge tone={LEVEL_TONE[l.level as Level]}>{l.level}</Badge>
                {l.source && <span className="shrink-0 text-muted">[{l.source}]</span>}
                <span className="whitespace-pre-wrap break-all">{l.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
