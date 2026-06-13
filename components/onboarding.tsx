"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { CheckCircle2, Circle, X } from "lucide-react";

export function Onboarding() {
  const { spaceId } = useActiveSpace();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(localStorage.getItem("onboardingDismissed") === "1");
  }, []);

  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const goals = useQuery(api.goals.board, spaceId ? { spaceId } : "skip");
  const workflows = useQuery(api.workflows.list, spaceId ? { spaceId } : "skip");
  const memories = useQuery(api.memories.list, spaceId ? { spaceId } : "skip");
  const fleet = useQuery(api.fleet.list, spaceId ? { spaceId } : "skip");

  const items = [
    {
      label: "Connect an agent",
      done: (agents ?? []).length > 0,
      href: "/dashboard/agents",
    },
    {
      label: "Set a goal",
      done: (goals?.goals ?? []).length > 0,
      href: "/dashboard/goals",
    },
    {
      label: "Create a workflow",
      done: (workflows ?? []).length > 0,
      href: "/dashboard/workflows",
    },
    {
      label: "Add knowledge",
      done: (memories ?? []).length > 0,
      href: "/dashboard/knowledge",
    },
    {
      label: "Deploy a fleet agent",
      done: (fleet ?? []).length > 0,
      href: "/dashboard/fleet",
    },
  ];

  const total = items.length;
  const completed = items.filter((i) => i.done).length;
  const allComplete = completed === total;

  function dismiss() {
    if (typeof window !== "undefined") {
      localStorage.setItem("onboardingDismissed", "1");
    }
    setDismissed(true);
  }

  if (dismissed || allComplete) return null;

  const pct = Math.round((completed / total) * 100);

  return (
    <Card className="mb-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="font-semibold">Get started</h2>
          <p className="text-sm text-muted">
            {completed} of {total} complete
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss onboarding"
          className="rounded-lg p-1 text-muted transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent-2 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Circle className="h-4 w-4 text-muted" />
            )}
            <span className="flex-1 truncate text-sm">{item.label}</span>
            <Link href={item.href} className="text-xs text-accent">
              Go
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
