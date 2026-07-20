"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { EmptyState, Input, Modal, Textarea } from "@/components/ui";
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
import { PageHead, PillButton, Panel, Dot, SectionLabel } from "@/components/dash/kit";

type StepDraft = { id: string; name: string; instruction: string; agentId: string };

/** Map a workflow run status to a kit Dot tone. */
function runDotTone(status: string): "online" | "paused" | "idle" | "error" {
  if (status === "running" || status === "completed") return "online";
  if (status === "paused" || status === "awaiting_approval") return "paused";
  if (status === "failed" || status === "killed") return "error";
  return "idle";
}

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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="workflows"
          title="Workflows"
          sub="Autonomous multi-agent workflows. Steps dispatch to agents and run under the Space's guardrails and kill switch."
          actions={
            <PillButton onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New workflow
            </PillButton>
          }
        />

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <SectionLabel>definitions</SectionLabel>
            {workflows?.length === 0 ? (
              <EmptyState
                graphic={<OrbitGraphic />}
                title="No workflows yet"
                body="Compose a sequence of agent steps. Start a run and watch the engine drive it to completion."
                action={<PillButton onClick={() => setOpen(true)}>Create a workflow</PillButton>}
              />
            ) : (
              <Panel>
                <div>
                  {(workflows ?? []).map((wf) => (
                    <div
                      key={wf._id}
                      className="flex flex-col gap-3 border-b border-[var(--border)] px-1 py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-medium text-[var(--foreground)]">{wf.name}</p>
                        {wf.description && (
                          <p className="truncate text-[12.5px] text-[var(--muted)]">{wf.description}</p>
                        )}
                        <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                          {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PillButton
                          variant="outline"
                          onClick={() =>
                            spaceId &&
                            start({
                              spaceId,
                              workflowId: wf._id,
                              autoComplete: true,
                            })
                          }
                          className="!px-3"
                        >
                          <FlaskConical className="h-4 w-4" /> Simulate
                        </PillButton>
                        <PillButton
                          onClick={() =>
                            spaceId &&
                            start({
                              spaceId,
                              workflowId: wf._id,
                              autoComplete: false,
                            })
                          }
                          className="!px-3"
                        >
                          <Play className="h-4 w-4" /> Run live
                        </PillButton>
                        <button
                          onClick={() =>
                            spaceId && remove({ spaceId, workflowId: wf._id })
                          }
                          className="text-[var(--muted)] hover:text-red-500"
                          title="Delete workflow"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          <div>
            <SectionLabel>runs · live</SectionLabel>
            {runs?.length === 0 ? (
              <p className="text-[13.5px] text-[var(--muted)]">No runs yet. Start a workflow.</p>
            ) : (
              <Panel>
                <div>
                  {(runs ?? []).map((r) => (
                    <div key={r._id} className="border-b border-[var(--border)] last:border-0">
                      <button
                        className="flex w-full items-center gap-3.5 px-1 py-3.5 text-left transition-colors hover:bg-[var(--surface)]/50"
                        onClick={() =>
                          setSelectedRun(selectedRun === r._id ? null : r._id)
                        }
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface)] text-[var(--muted-strong)]">
                          <Zap className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] text-[var(--foreground)]">
                            {r.stepsDone} done &middot; {r.hops} hops &middot; {r.trigger}
                          </p>
                          <p className="truncate text-[12.5px] text-[var(--muted)]">
                            started {timeAgo(r.startedAt)}
                            {r.error ? ` · ${r.error}` : ""}
                          </p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--muted)]">
                          <Dot tone={runDotTone(r.status)} /> {r.status}
                        </span>
                      </button>
                      {selectedRun === r._id && (
                        <div className="px-1 pb-4">
                          <WorkflowTrace runId={r._id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
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
            <PillButton variant="outline" onClick={addStep}>
              <Plus className="h-4 w-4" /> Add step
            </PillButton>
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
            <PillButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </PillButton>
            <PillButton
              onClick={submit}
              className={!canSubmit ? "pointer-events-none opacity-50" : undefined}
            >
              Create
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
