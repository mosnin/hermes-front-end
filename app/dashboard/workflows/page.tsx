"use client";

import { Card } from "@/components/ui";
import { Workflow } from "lucide-react";

export default function WorkflowsPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Workflows</h1>
        <p className="text-sm text-muted">
          Multi-step, multi-agent autonomous workflows.
        </p>
      </div>
      <Card>
        <div className="flex items-start gap-3">
          <Workflow className="mt-0.5 h-5 w-5 text-accent" />
          <div>
            <p className="font-medium">Workflow runtime — Phase 3</p>
            <p className="mt-1 max-w-xl text-sm text-muted">
              The execution engine (Convex scheduler-driven steps, retries,
              timeouts, scheduled/webhook/event triggers, durable run state) is
              the next phase. The schema (<code>workflows</code>,{" "}
              <code>workflowRuns</code>, <code>runSteps</code>,{" "}
              <code>triggers</code>) and all guardrails it relies on (loop
              detection, hop/step/wall-clock caps, kill switch) are already in
              place — see Space settings.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
