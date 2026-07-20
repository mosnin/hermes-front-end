"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { cn } from "@/lib/utils";
import { DURATION, EASE, STAGGER, StaggerItem } from "@/components/site/motion";
import {
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
  Square,
} from "@/components/icons";

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
  const reduce = useReducedMotion();
  // `Stagger` (Lane A, components/site/motion.tsx) only supports block-level
  // container tags (div/span/h1-4/p/li), not `ol` — so this list's cascade
  // uses a raw `motion.ol` with the same variant shape instead; `StaggerItem`
  // (which does support `li`) still drives each row.
  const olVariants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : STAGGER.tight } },
  };

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
        <motion.ol
          className="space-y-0"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px", amount: 0.2 }}
          variants={olVariants}
        >
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            const hasDetail = Boolean(s.output) || Boolean(s.error);
            const isOpen = expanded[s._id];
            const status = s.status as StepStatus;
            return (
              <StaggerItem key={s._id} as="li" y={10} className="relative flex gap-3">
                {/* Waterfall rail */}
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "mt-1 h-3 w-3 shrink-0 rounded-full border-2",
                      status === "done" && "border-emerald-500 bg-emerald-400/30",
                      status === "failed" && "border-red-500 bg-red-400/30",
                      status === "running" && "border-amber-500 bg-amber-400/30",
                      status === "dispatched" && "border-indigo-500 bg-indigo-400/30",
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
                      <motion.span
                        animate={{ rotate: isOpen ? 90 : 0 }}
                        transition={{ duration: reduce ? DURATION.reduced : DURATION.instant, ease: EASE }}
                        className="inline-flex"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </motion.span>
                      {s.error ? "Error" : "Output"}
                    </button>
                  )}

                  <AnimatePresence initial={false}>
                    {hasDetail && isOpen && (
                      <motion.pre
                        initial={reduce ? false : { opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                        exit={reduce ? undefined : { opacity: 0, height: 0, marginTop: 0 }}
                        transition={{ duration: reduce ? DURATION.reduced : DURATION.instant, ease: EASE }}
                        className={cn(
                          "max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3 text-xs",
                          s.error ? "text-red-600" : "text-foreground",
                        )}
                      >
                        {s.error ?? s.output}
                      </motion.pre>
                    )}
                  </AnimatePresence>
                </div>
              </StaggerItem>
            );
          })}
        </motion.ol>
      )}
    </div>
  );
}

export default WorkflowTrace;
