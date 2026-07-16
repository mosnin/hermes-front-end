"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Button, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Sparkles } from "@/components/icons";

export function AutoPlanDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { spaceId } = useActiveSpace();
  const plan = useAction(api.planner.plan);
  const toast = useToast();

  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<{ name: string; instruction: string }[] | null>(
    null,
  );

  function reset() {
    setGoal("");
    setBusy(false);
    setSteps(null);
  }

  async function generate() {
    if (!spaceId || !goal.trim() || busy) return;
    setBusy(true);
    try {
      const result = await plan({ spaceId, goal: goal.trim() });
      setSteps(result.steps);
      toast("Workflow created — see Workflows", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to generate plan", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Auto-plan with AI"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Describe a goal in plain English. The planner turns it into an ordered
          multi-agent workflow you can run.
        </p>
        <Textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Launch a weekly customer newsletter and grow signups"
          rows={3}
          autoFocus
          disabled={busy}
        />

        {steps && (
          <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs font-medium text-muted">
              Planned steps ({steps.length})
            </p>
            <ol className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium">
                    {i + 1}. {s.name}
                  </span>
                  <p className="text-xs text-muted">{s.instruction}</p>
                </li>
              ))}
            </ol>
            <Link
              href="/dashboard/workflows"
              className="inline-block text-xs text-accent hover:underline"
            >
              View it in Workflows →
            </Link>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {steps ? "Close" : "Cancel"}
          </Button>
          <Button disabled={!goal.trim() || busy} onClick={generate}>
            <Sparkles className="h-4 w-4" />
            {busy ? "Planning…" : steps ? "Re-generate" : "Generate plan"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
