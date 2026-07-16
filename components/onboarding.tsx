"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@/convex/_generated/api";
import { Card, RingGauge } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { runGlobalAction } from "@/components/global-actions";
import { CheckCircle2, Circle, Sparkles, X } from "@/components/icons";

export function Onboarding() {
  const { spaceId } = useActiveSpace();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem("onboardingDismissed") === "1");
  }, []);

  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const workflows = useQuery(api.workflows.list, spaceId ? { spaceId } : "skip");
  const alerts = useQuery(api.alerts.list, spaceId ? { spaceId } : "skip");
  const space = useQuery(api.spaces.get, spaceId ? { spaceId } : "skip");

  const items = [
    {
      label: "Connect an agent",
      hint: "Register a Hermes, OpenClaw, or Goose agent",
      done: (agents ?? []).length > 0,
      act: () => runGlobalAction("connect-agent"),
    },
    {
      label: "Create a workflow",
      hint: "Give your fleet an ongoing job",
      done: (workflows ?? []).length > 0,
      act: () => router.push("/dashboard/workflows"),
    },
    {
      label: "Set a monthly budget",
      hint: "Auto-pause autonomy on real spend",
      done: (space?.guardConfig?.monthlyBudgetUsd ?? 0) > 0,
      act: () => router.push("/dashboard/settings"),
    },
    {
      label: "Add an alert",
      hint: "Get paged when something breaks",
      done: (alerts ?? []).length > 0,
      act: () => router.push("/dashboard/alerts"),
    },
    {
      label: "Invite your team",
      hint: "Bring operators into this Space",
      done: false,
      act: () => router.push("/dashboard/settings"),
      optional: true,
    },
  ];

  const required = items.filter((i) => !i.optional);
  const completed = required.filter((i) => i.done).length;
  const total = required.length;
  const allComplete = completed === total;

  function dismiss() {
    if (typeof window !== "undefined") localStorage.setItem("onboardingDismissed", "1");
    setDismissed(true);
  }

  if (dismissed || allComplete) return null;

  const pct = completed / total;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
      >
        <Card className="mb-6 overflow-hidden">
          <div className="flex items-center gap-5">
            <RingGauge
              value={`${Math.round(pct * 100)}%`}
              color="accent"
              pct={pct}
              size={72}
            />
            <div className="flex-1">
              <h2 className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-4 w-4 text-accent" /> Get your fleet running
              </h2>
              <p className="text-sm text-muted">
                {completed} of {total} essentials done — you&apos;re almost there.
              </p>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <motion.button
                key={item.label}
                onClick={item.act}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i }}
                whileHover={{ y: -2 }}
                className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                  item.done
                    ? "border-lime-400/30 bg-lime-400/5"
                    : "border-border bg-surface-2/40 hover:border-accent/40"
                }`}
              >
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-lime-400" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted" />
                )}
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium ${item.done ? "text-muted line-through" : ""}`}>
                    {item.label}
                    {item.optional && <span className="ml-1 text-[10px] text-muted">optional</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{item.hint}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
