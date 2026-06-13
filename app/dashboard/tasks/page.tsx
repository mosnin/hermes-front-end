"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Plus } from "lucide-react";

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
] as const;

const priorityTone = {
  low: "default",
  medium: "blue",
  high: "yellow",
  urgent: "red",
} as const;

export default function TasksPage() {
  const { spaceId } = useActiveSpace();
  const tasks = useQuery(api.tasks.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const create = useMutation(api.tasks.create);
  const update = useMutation(api.tasks.update);
  const remove = useMutation(api.tasks.remove);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [assignee, setAssignee] = useState<string>("");
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const agentName = (id?: Id<"agents">) =>
    agents?.find((a) => a._id === id)?.name;

  const total = (tasks ?? []).length;
  const doneCount = (tasks ?? []).filter((t) => t.status === "done").length;

  function onDragStart(e: React.DragEvent, taskId: Id<"tasks">) {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(e: React.DragEvent, column: string) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (!spaceId || !taskId) return;
    update({ spaceId, taskId: taskId as Id<"tasks">, status: column as never });
  }

  async function submit() {
    if (!title.trim() || !spaceId) return;
    await create({
      spaceId,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      assigneeAgentId: assignee ? (assignee as Id<"agents">) : undefined,
    });
    setTitle("");
    setDescription("");
    setPriority("medium");
    setAssignee("");
    setOpen(false);
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-muted">
            Assign work to agents and move it across the board.
          </p>
          <p className="mt-1 text-xs text-muted">
            {doneCount}/{total} done
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New task
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = (tasks ?? []).filter((t) => t.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverCol !== col.key) setDragOverCol(col.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverCol((c) => (c === col.key ? null : c));
                }
              }}
              onDrop={(e) => onDrop(e, col.key)}
              className={`rounded-2xl border bg-surface/40 p-3 transition-colors ${
                dragOverCol === col.key
                  ? "border-accent bg-accent/10"
                  : "border-border"
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{col.label}</span>
                <Badge>{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <div
                    key={t._id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t._id)}
                    className="cursor-grab active:cursor-grabbing"
                  >
                  <Card className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{t.title}</p>
                      <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                    </div>
                    {t.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted">
                        {t.description}
                      </p>
                    )}
                    {t.assigneeAgentId && (
                      <p className="mt-2 text-xs text-accent-2">
                        @{agentName(t.assigneeAgentId) ?? "agent"}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={t.status}
                        onChange={(e) =>
                          spaceId &&
                          update({
                            spaceId,
                            taskId: t._id,
                            status: e.target.value as never,
                          })
                        }
                        className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => spaceId && remove({ spaceId, taskId: t._id })}
                        className="text-xs text-muted hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </Card>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted">
                    Nothing here
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New task">
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the task…"
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as never)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Assignee</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {(agents ?? []).map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
