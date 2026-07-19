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
  // Older pages loaded via "Load older", newest-first per page (matches
  // `tail`'s ordering); the live tail (most recent 200) is a separate,
  // always-fresh reactive query so new lines keep streaming in underneath.
  const [olderBefore, setOlderBefore] = useState<number | null>(null);
  const [olderLines, setOlderLines] = useState<
    { _id: string; ts: number; level: Level; message: string; source?: string }[]
  >([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const mergedCursorRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useQuery(api.logs.tail, {
    spaceId,
    agentId,
    level: level === "all" ? undefined : level,
    limit: 200,
  });
  const counts = useQuery(api.logs.levelCounts, { spaceId, agentId });
  const loadMore = useQuery(
    api.logs.tail,
    olderBefore !== null
      ? { spaceId, agentId, level: level === "all" ? undefined : level, limit: 200, before: olderBefore }
      : "skip",
  );

  // Reset the "load older" buffer whenever the agent or level filter changes
  // — the pagination cursor is only valid within one filtered view.
  useEffect(() => {
    setOlderLines([]);
    setOlderBefore(null);
    setExhausted(false);
    mergedCursorRef.current = null;
  }, [level, agentId]);

  useEffect(() => {
    if (loadMore === undefined || olderBefore === null) return;
    // Guard against the effect re-firing for the same cursor (e.g. a
    // reactive re-render with unchanged data) so we never double-append.
    if (mergedCursorRef.current === olderBefore) return;
    mergedCursorRef.current = olderBefore;
    setOlderLines((prev) => [...prev, ...loadMore]);
    if (loadMore.length < 200) setExhausted(true);
    setLoadingOlder(false);
  }, [loadMore, olderBefore]);

  // Newest-first from the server; render oldest-first like a terminal, with
  // any previously loaded older pages stitched in front.
  const tailLines = rows ? [...rows].reverse() : undefined;
  const lines = tailLines ? [...[...olderLines].reverse(), ...tailLines] : undefined;
  const canLoadOlder = !exhausted && ((rows?.length ?? 0) >= 200 || olderLines.length > 0);

  useEffect(() => {
    if (!follow || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [tailLines, follow]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setFollow(atBottom);
  }

  function loadOlder() {
    // Cursor is the ts of the oldest line loaded so far.
    const cursor = olderLines.length > 0 ? olderLines[olderLines.length - 1].ts : rows?.at(-1)?.ts;
    if (cursor === undefined) return;
    setFollow(false);
    setLoadingOlder(true);
    setOlderBefore(cursor);
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
            {canLoadOlder && (
              <div className="pb-1 pt-0.5 text-center">
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground disabled:opacity-50"
                >
                  {loadingOlder ? "Loading…" : "Load older"}
                </button>
              </div>
            )}
            {exhausted && olderLines.length > 0 && (
              <p className="pb-1 text-center text-[11px] text-muted">— start of retained history —</p>
            )}
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
