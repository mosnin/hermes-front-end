"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { Play, Plus, Trash2, X, Zap } from "lucide-react";

type StepDraft = { id: string; name: string; instruction: string; agentId: string };

const runTone = {
  pending: "default",
  running: "yellow",
  paused: "yellow",
  completed: "green",
  failed: "red",
  killed: "red",
} as const;

const stepTone = {
  pending: "default",
  dispatched: "blue",
  running: "yellow",
  done: "green",
  failed: "red",
  skipped: "default",
} as const;

export default function WorkflowsPage() {
  const { spaceId } = useActiveSpace();
  const skip = spaceId ? { spaceId } : "skip";
  const workflows = useQuery(api.workflows.list, skip);
  const agents = useQuery(api.agents.list, skip);
  const runs = useQuery(api.workflows.runs, skip);

  const create = useMutation(api.workflows.create);
  const start = useMutation(api.workflows.start);
  const remove = useMutation(api.workflows.remove);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sequential, setSequential] = useState(true);
  const [steps, setSteps] = useState<StepDraft[]>([
    { id: crypto.randomUUID(), name: "", instruction: "", agentId: "" },
  ]);
  const [selectedRun, setSelectedRun] = useState<Id<"workflowRuns"> | null>(null);

  function addStep() {
    setSteps((s) => [
      ...s,
      { id: crypto.randomUUID(), name: "", instruction: "", agentId: "" },
    ]);
  }

  async function submit() {
    if (!spaceId || !name.trim()) return;
    const clean = steps.filter((s) => s.name.trim() && s.instruction.trim());
    if (clean.length === 0) return;
    await create({
      spaceId,
      name: name.trim(),
      description: description.trim() || undefined,
      steps: clean.map((s, i) => ({
        id: s.id,
        name: s.name.trim(),
        instruction: s.instruction.trim(),
        agentId: s.agentId ? (s.agentId as Id<"agents">) : undefined,
        dependsOn: sequential && i > 0 ? [clean[i - 1].id] : undefined,
      })),
    });
    setName("");
    setDescription("");
    setSteps([{ id: crypto.randomUUID(), name: "", instruction: "", agentId: "" }]);
    setOpen(false);
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-sm text-muted">
            Autonomous multi-agent workflows. Steps dispatch to agents and run
            under the Space&apos;s guardrails and kill switch.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New workflow
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Definitions</h2>
          {workflows?.length === 0 ? (
            <EmptyState
              title="No workflows yet"
              body="Compose a sequence of agent steps. Start a run and watch the engine drive it to completion."
              action={<Button onClick={() => setOpen(true)}>Create a workflow</Button>}
            />
          ) : (
            (workflows ?? []).map((wf) => (
              <Card key={wf._id}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{wf.name}</p>
                    {wf.description && (
                      <p className="text-sm text-muted">{wf.description}</p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {wf.steps.length} step{wf.steps.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        spaceId && start({ spaceId, workflowId: wf._id })
                      }
                    >
                      <Play className="h-4 w-4" /> Run
                    </Button>
                    <button
                      onClick={() =>
                        spaceId && remove({ spaceId, workflowId: wf._id })
                      }
                      className="text-muted hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted">Runs (live)</h2>
          {runs?.length === 0 ? (
            <p className="text-sm text-muted">No runs yet. Start a workflow.</p>
          ) : (
            (runs ?? []).map((r) => (
              <Card key={r._id}>
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
                {selectedRun === r._id && <RunSteps runId={r._id} />}
              </Card>
            ))
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
                run sequentially
              </label>
            </div>
            {steps.map((s, i) => (
              <div key={s.id} className="rounded-lg border border-border p-2">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs text-muted">#{i + 1}</span>
                  <Input
                    value={s.name}
                    onChange={(e) =>
                      setSteps((arr) =>
                        arr.map((x) =>
                          x.id === s.id ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="Step name"
                  />
                  <select
                    value={s.agentId}
                    onChange={(e) =>
                      setSteps((arr) =>
                        arr.map((x) =>
                          x.id === s.id ? { ...x, agentId: e.target.value } : x,
                        ),
                      )
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
                  {steps.length > 1 && (
                    <button
                      onClick={() =>
                        setSteps((arr) => arr.filter((x) => x.id !== s.id))
                      }
                      className="text-muted hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Input
                  value={s.instruction}
                  onChange={(e) =>
                    setSteps((arr) =>
                      arr.map((x) =>
                        x.id === s.id ? { ...x, instruction: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Instruction for the agent…"
                />
              </div>
            ))}
            <Button variant="outline" onClick={addStep}>
              <Plus className="h-4 w-4" /> Add step
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RunSteps({ runId }: { runId: Id<"workflowRuns"> }) {
  const { spaceId } = useActiveSpace();
  const steps = useQuery(
    api.workflows.runSteps,
    spaceId ? { spaceId, runId } : "skip",
  );
  const cancel = useMutation(api.workflows.cancelRun);
  const pause = useMutation(api.workflows.pauseRun);
  const resume = useMutation(api.workflows.resumeRun);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <ol className="space-y-2">
        {(steps ?? []).map((s) => (
          <li key={s._id} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-xs text-muted">{s.index + 1}</span>
            <span className="flex-1 truncate">{s.name}</span>
            <Badge tone={stepTone[s.status]}>{s.status}</Badge>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" onClick={() => spaceId && pause({ spaceId, runId })}>
          Pause
        </Button>
        <Button variant="outline" onClick={() => spaceId && resume({ spaceId, runId })}>
          Resume
        </Button>
        <Button variant="danger" onClick={() => spaceId && cancel({ spaceId, runId })}>
          Kill
        </Button>
      </div>
    </div>
  );
}
