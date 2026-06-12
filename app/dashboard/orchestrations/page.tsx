"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { Plus } from "lucide-react";

const statusTone = {
  draft: "default",
  running: "green",
  paused: "yellow",
  completed: "blue",
} as const;

export default function OrchestrationsPage() {
  const flows = useQuery(api.orchestrations.list);
  const create = useMutation(api.orchestrations.create);
  const update = useMutation(api.orchestrations.update);
  const remove = useMutation(api.orchestrations.remove);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit() {
    if (!name.trim()) return;
    await create({ name: name.trim(), description: description.trim() || undefined });
    setName("");
    setDescription("");
    setOpen(false);
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orchestration</h1>
          <p className="text-sm text-muted">
            Compose multi-step, multi-agent workflows.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New workflow
        </Button>
      </div>

      {flows?.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          body="Chain agents together into a workflow — each step hands off to the next."
          action={<Button onClick={() => setOpen(true)}>Create a workflow</Button>}
        />
      ) : (
        <div className="space-y-3">
          {(flows ?? []).map((f) => (
            <Card key={f._id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{f.name}</p>
                  {f.description && (
                    <p className="text-sm text-muted">{f.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone[f.status]}>{f.status}</Badge>
                  <select
                    value={f.status}
                    onChange={(e) =>
                      update({
                        orchestrationId: f._id,
                        status: e.target.value as never,
                      })
                    }
                    className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                  >
                    <option value="draft">draft</option>
                    <option value="running">running</option>
                    <option value="paused">paused</option>
                    <option value="completed">completed</option>
                  </select>
                  <button
                    onClick={() => remove({ orchestrationId: f._id })}
                    className="text-xs text-muted hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                {f.steps.length} step{f.steps.length === 1 ? "" : "s"}
              </p>
            </Card>
          ))}
        </div>
      )}

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
            rows={3}
          />
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
