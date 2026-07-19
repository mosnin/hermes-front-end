"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { PagePath } from "@/components/page-header";
import { OrbitGraphic } from "@/components/marketing/graphics";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  FlaskConical,
  Play,
  Plus,
  Trash2,
  X,
  Zap,
} from "@/components/icons";
import { WorkflowTrace } from "@/components/workflow-trace";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

type StepDraft = { id: string; name: string; instruction: string; agentId: string };

const runTone = {
  pending: "default",
  running: "yellow",
  paused: "yellow",
  awaiting_approval: "blue",
  completed: "green",
  failed: "red",
  killed: "red",
} as const;

function newStep(): StepDraft {
  return { id: crypto.randomUUID(), name: "", instruction: "", agentId: "" };
}

export default function WorkflowsPage() {
  const { spaceId } = useActiveSpace();
  const workflows = useQuery(api.workflows.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const runs = useQuery(api.workflows.runs, spaceId ? { spaceId } : "skip");

  const create = useMutation(api.workflows.create);
  const start = useMutation(api.workflows.start);
  const remove = useMutation(api.workflows.remove);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sequential, setSequential] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([newStep()]);
  const [selectedRun, setSelectedRun] = useState<Id<"workflowRuns"> | null>(null);

  function addStep() {
    setSteps((s) => [...s, newStep()]);
  }

  function patchStep(id: string, patch: Partial<StepDraft>) {
    setSteps((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function removeStep(id: string) {
    setSteps((arr) => arr.filter((x) => x.id !== id));
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((arr) => {
      const next = [...arr];
      const target = index + dir;
      if (target < 0 || target >= next.length) return arr;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Validation: name required, and every non-empty step must have both a
  // name and instruction. At least one complete step required.
  const completeSteps = steps.filter(
    (s) => s.name.trim() && s.instruction.trim(),
  );
  const partialStep = steps.find(
    (s) =>
      (s.name.trim() && !s.instruction.trim()) ||
      (!s.name.trim() && s.instruction.trim()),
  );
  const canSubmit =
    Boolean(name.trim()) && completeSteps.length > 0 && !partialStep;

  async function submit() {
    if (!spaceId || !canSubmit) return;
    await create({
      spaceId,
      name: name.trim(),
      description: description.trim() || undefined,
      steps: completeSteps.map((s, i) => ({
        id: s.id,
        name: s.name.trim(),
        instruction: s.instruction.trim(),
        agentId: s.agentId ? (s.agentId as Id<"agents">) : undefined,
        dependsOn:
          sequential && i > 0 ? [completeSteps[i - 1].id] : undefined,
      })),
    });
    setName("");
    setDescription("");
    setSteps([newStep()]);
    setOpen(false);
  }

  return (
    <div className="p-8">
      <Reveal className="mb-6 flex items-center justify-between" y={12}>
        <div>
          <PagePath>workflows</PagePath>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted">
            Autonomous multi-agent workflows. Steps dispatch to agents and run
            under the Space&apos;s guardrails and kill switch.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New workflow
        </Button>
      </Reveal>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Definitions</h2>
          {workflows?.length === 0 ? (
            <Reveal>
              <EmptyState
                graphic={<OrbitGraphic />}
                title="No workflows yet"
                body="Compose a sequence of agent steps. Start a run and watch the engine drive it to completion."
                action={<Button onClick={() => setOpen(true)}>Create a workflow</Button>}
              />
            </Reveal>
          ) : (
            <Stagger className="space-y-3">
              {(workflows ?? []).map((wf) => (
                <StaggerItem key={wf._id}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{wf.name}</p>
                        {wf.description && (
                          <p className="text-sm text-muted">{wf.description}</p>
                        )}
                        <p className="mt-1 text-xs text-muted">
                          {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          title="Run with simulated step completion"
                          onClick={() =>
                            spaceId &&
                            start({
                              spaceId,
                              workflowId: wf._id,
                              autoComplete: true,
                            })
                          }
                        >
                          <FlaskConical className="h-4 w-4" /> Simulate
                        </Button>
                        <Button
                          title="Run live (agents execute each step)"
                          onClick={() =>
                            spaceId &&
                            start({
                              spaceId,
                              workflowId: wf._id,
                              autoComplete: false,
                            })
                          }
                        >
                          <Play className="h-4 w-4" /> Run live
                        </Button>
                        <button
                          onClick={() =>
                            spaceId && remove({ spaceId, workflowId: wf._id })
                          }
                          className="text-muted hover:text-red-500"
                          title="Delete workflow"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Runs (live)</h2>
          {runs?.length === 0 ? (
            <p className="text-sm text-muted">No runs yet. Start a workflow.</p>
          ) : (
            <Stagger className="space-y-3">
              {(runs ?? []).map((r) => (
                <StaggerItem key={r._id}>
                  <Card>
                    <button
                      className="flex w-full items-center justify-between"
                      onClick={() =>
                        setSelectedRun(selectedRun === r._id ? null : r._id)
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-accent" />
                        <span className="text-sm">
                          {r.stepsDone} done · {r.hops} hops · {r.trigger}
                        </span>
                      </div>
                      <Badge tone={runTone[r.status]}>{r.status}</Badge>
                    </button>
                    <p className="mt-1 text-xs text-muted">
                      started {timeAgo(r.startedAt)}
                      {r.error ? ` · ${r.error}` : ""}
                    </p>
                    {selectedRun === r._id && <WorkflowTrace runId={r._id} />}
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New workflow">
        <div className="space-y-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow name"
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this workflow do?"
            rows={2}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted">Steps</label>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={sequential}
                  onChange={(e) => setSequential(e.target.checked)}
                />
                {sequential ? "run sequentially" : "run in parallel"}
              </label>
            </div>
            {steps.map((s, i) => {
              const incomplete =
                (s.name.trim() && !s.instruction.trim()) ||
                (!s.name.trim() && s.instruction.trim());
              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-border p-2"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-5 text-xs text-muted">#{i + 1}</span>
                    <Input
                      value={s.name}
                      onChange={(e) => patchStep(s.id, { name: e.target.value })}
                      placeholder="Step name"
                    />
                    <select
                      value={s.agentId}
                      onChange={(e) =>
                        patchStep(s.id, { agentId: e.target.value })
                      }
                      className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm"
                    >
                      <option value="">Auto agent</option>
                      {(agents ?? []).map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center">
                      <button
                        onClick={() => moveStep(i, -1)}
                        disabled={i === 0}
                        className="text-muted hover:text-foreground disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveStep(i, 1)}
                        disabled={i === steps.length - 1}
                        className="text-muted hover:text-foreground disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      {steps.length > 1 && (
                        <button
                          onClick={() => removeStep(s.id)}
                          className="text-muted hover:text-red-500"
                          title="Remove step"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <Input
                    value={s.instruction}
                    onChange={(e) =>
                      patchStep(s.id, { instruction: e.target.value })
                    }
                    placeholder="Instruction for the agent…"
                  />
                  {incomplete && (
                    <p className="mt-1 text-xs text-red-500">
                      Both a name and an instruction are required.
                    </p>
                  )}
                </div>
              );
            })}
            <Button variant="outline" onClick={addStep}>
              <Plus className="h-4 w-4" /> Add step
            </Button>
          </div>
          <div className="flex items-center justify-end gap-2">
            {!canSubmit && (name.trim() || completeSteps.length > 0) && (
              <span className="mr-auto text-xs text-muted">
                {!name.trim()
                  ? "Add a workflow name."
                  : partialStep
                    ? "Finish or clear incomplete steps."
                    : "Add at least one complete step."}
              </span>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
