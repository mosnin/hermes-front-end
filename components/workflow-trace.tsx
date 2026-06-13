"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Square,
} from "lucide-react";

const stepTone = {
  pending: "default",
  dispatched: "blue",
  running: "yellow",
  done: "green",
  failed: "red",
  skipped: "default",
} as const;

type StepStatus = keyof typeof stepTone;

function formatDuration(startedAt?: number, finishedAt?: number): string {
  if (!startedAt || !finishedAt) return "—";
  const ms = Math.max(0, finishedAt - startedAt);
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

export function WorkflowTrace({ runId }: { runId: Id<"workflowRuns"> }) {
  const { spaceId } = useActiveSpace();
  const steps = useQuery(
    api.workflows.runSteps,
    spaceId ? { spaceId, runId } : "skip",
  );
  const cancel = useMutation(api.workflows.cancelRun);
  const pause = useMutation(api.workflows.pauseRun);
  const resume = useMutation(api.workflows.resumeRun);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-3 flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => spaceId && pause({ spaceId, runId })}
        >
          <Pause className="h-4 w-4" /> Pause
        </Button>
        <Button
          variant="outline"
          onClick={() => spaceId && resume({ spaceId, runId })}
        >
          <Play className="h-4 w-4" /> Resume
        </Button>
        <Button
          variant="danger"
          onClick={() => spaceId && cancel({ spaceId, runId })}
        >
          <Square className="h-4 w-4" /> Kill
        </Button>
      </div>

      {steps === undefined ? (
        <p className="text-sm text-muted">Loading trace…</p>
      ) : steps.length === 0 ? (
        <p className="text-sm text-muted">No steps recorded for this run.</p>
      ) : (
        <ol className="space-y-0">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            const hasDetail = Boolean(s.output) || Boolean(s.error);
            const isOpen = expanded[s._id];
            const status = s.status as StepStatus;
            return (
              <li key={s._id} className="relative flex gap-3">
                {/* Waterfall rail */}
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "mt-1 h-3 w-3 shrink-0 rounded-full border-2",
                      status === "done" && "border-emerald-400 bg-emerald-400/30",
                      status === "failed" && "border-red-400 bg-red-400/30",
                      status === "running" && "border-amber-400 bg-amber-400/30",
                      status === "dispatched" && "border-indigo-400 bg-indigo-400/30",
                      (status === "pending" || status === "skipped") &&
                        "border-border bg-surface-2",
                    )}
                  />
                  {!isLast && (
                    <span className="w-px flex-1 bg-border" aria-hidden />
                  )}
                </div>

                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-xs text-muted">
                      {s.index + 1}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {s.name}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDuration(s.startedAt, s.finishedAt)}
                    </span>
                    {s.attempts > 0 && (
                      <span className="text-xs text-muted">
                        {s.attempts} attempt{s.attempts === 1 ? "" : "s"}
                      </span>
                    )}
                    <Badge tone={stepTone[status] ?? "default"}>{status}</Badge>
                  </div>

                  {hasDetail && (
                    <button
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [s._id]: !e[s._id] }))
                      }
                      className="mt-1 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {s.error ? "Error" : "Output"}
                    </button>
                  )}

                  {hasDetail && isOpen && (
                    <pre
                      className={cn(
                        "mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-xs",
                        s.error ? "text-red-400" : "text-foreground",
                      )}
                    >
                      {s.error ?? s.output}
                    </pre>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default WorkflowTrace;
