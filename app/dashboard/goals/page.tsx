"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Plus, Target } from "lucide-react";

const goalTone = { active: "green", at_risk: "yellow", done: "blue", archived: "default" } as const;

function Bar({ progress }: { progress: number }) {
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-surface-2">
      <div
        className="h-2 rounded-full bg-accent-2"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

export default function GoalsPage() {
  const { spaceId } = useActiveSpace();
  const board = useQuery(api.goals.board, spaceId ? { spaceId } : "skip");
  const createGoal = useMutation(api.goals.createGoal);
  const updateGoal = useMutation(api.goals.updateGoal);
  const createProject = useMutation(api.goals.createProject);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [pOpen, setPOpen] = useState(false);
  const [pName, setPName] = useState("");
  const [pGoal, setPGoal] = useState("");

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Goals & projects</h1>
          <p className="text-sm text-muted">
            Outcomes the Space is driving toward, with progress rolled up from
            tasks.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New goal
          </Button>
        </div>
      </div>

      {board && board.goals.length === 0 && board.projects.length === 0 ? (
        <EmptyState
          title="No goals yet"
          body="Set a goal, break it into projects and tasks, and watch progress roll up automatically."
          action={<Button onClick={() => setOpen(true)}>Create a goal</Button>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted">Goals</h2>
            {(board?.goals ?? []).map((g) => (
              <Card key={g._id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-accent" />
                    <span className="font-medium">{g.title}</span>
                  </div>
                  <select
                    value={g.status}
                    onChange={(e) =>
                      spaceId &&
                      updateGoal({ spaceId, goalId: g._id, status: e.target.value as never })
                    }
                    className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                  >
                    <option value="active">active</option>
                    <option value="at_risk">at risk</option>
                    <option value="done">done</option>
                    <option value="archived">archived</option>
                  </select>
                </div>
                {g.description && <p className="mt-1 text-sm text-muted">{g.description}</p>}
                <Bar progress={g.progress} />
                <p className="mt-1 text-xs text-muted">
                  {g.done}/{g.total} tasks · {Math.round(g.progress * 100)}%
                </p>
              </Card>
            ))}
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted">Projects</h2>
            {(board?.projects ?? []).map((p) => (
              <Card key={p._id}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <Badge tone={p.status === "done" ? "blue" : "green"}>{p.status}</Badge>
                </div>
                <Bar progress={p.progress} />
                <p className="mt-1 text-xs text-muted">
                  {p.done}/{p.total} tasks
                </p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New goal">
        <div className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goal title" autoFocus />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's the outcome?" rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={!title.trim()}
              onClick={async () => {
                if (!spaceId || !title.trim()) return;
                await createGoal({ spaceId, title: title.trim(), description: description.trim() || undefined });
                setTitle("");
                setDescription("");
                setOpen(false);
              }}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={pOpen} onClose={() => setPOpen(false)} title="New project">
        <div className="space-y-4">
          <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Project name" autoFocus />
          <div>
            <label className="mb-1 block text-xs text-muted">Goal (optional)</label>
            <select
              value={pGoal}
              onChange={(e) => setPGoal(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">No goal</option>
              {(board?.goals ?? []).map((g) => (
                <option key={g._id} value={g._id}>{g.title}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPOpen(false)}>Cancel</Button>
            <Button
              disabled={!pName.trim()}
              onClick={async () => {
                if (!spaceId || !pName.trim()) return;
                await createProject({
                  spaceId,
                  name: pName.trim(),
                  goalId: pGoal ? (pGoal as Id<"goals">) : undefined,
                });
                setPName("");
                setPGoal("");
                setPOpen(false);
              }}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
