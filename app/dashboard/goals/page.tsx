"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { AutoPlanDialog } from "@/components/auto-plan-dialog";
import { Target } from "@/components/icons";
import { EASE, CountUp } from "@/components/site/motion";
import { motion, useReducedMotion } from "motion/react";
import {
  PageHead,
  PillButton,
  Panel,
  SectionLabel,
} from "@/components/dash/kit";

const goalTone = { active: "green", at_risk: "yellow", done: "blue", archived: "default" } as const;

function Bar({ progress }: { progress: number }) {
  const reduce = useReducedMotion();
  const pct = Math.round(progress * 100);
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--surface)]">
      <motion.div
        className="h-1.5 rounded-full bg-[var(--foreground)]"
        initial={{ width: reduce ? `${pct}%` : 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
      />
    </div>
  );
}

export default function GoalsPage() {
  const { spaceId, active } = useActiveSpace();
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

  const [planOpen, setPlanOpen] = useState(false);

  const goals = board?.goals ?? [];
  const projects = board?.projects ?? [];
  const isEmpty = board && goals.length === 0 && projects.length === 0;

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · goals`}
          title="Goals & projects"
          sub="Outcomes the Space is driving toward, with progress rolled up from tasks."
          actions={
            <>
              <PillButton variant="outline" onClick={() => setPlanOpen(true)}>
                Auto-plan with AI
              </PillButton>
              <PillButton variant="outline" onClick={() => setPOpen(true)}>
                New project
              </PillButton>
              <PillButton onClick={() => setOpen(true)}>New goal</PillButton>
            </>
          }
        />

        {isEmpty ? (
          <Panel>
            <EmptyState
              title="No goals yet"
              body="Set a goal, break it into projects and tasks, and watch progress roll up automatically."
              action={<Button onClick={() => setOpen(true)}>Create a goal</Button>}
            />
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <SectionLabel>goals</SectionLabel>
              <Panel>
                {goals.length === 0 ? (
                  <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">No goals yet.</p>
                ) : (
                  <div>
                    {goals.map((g) => (
                      <div key={g._id} className="border-b border-[var(--border)] py-4 first:pt-0 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-[var(--muted-strong)]" />
                            <span className="text-[14.5px] font-medium text-[var(--foreground)]">{g.title}</span>
                          </div>
                          <select
                            value={g.status}
                            onChange={(e) =>
                              spaceId &&
                              updateGoal({ spaceId, goalId: g._id, status: e.target.value as never })
                            }
                            className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[12px] text-[var(--muted-strong)]"
                          >
                            <option value="active">active</option>
                            <option value="at_risk">at risk</option>
                            <option value="done">done</option>
                            <option value="archived">archived</option>
                          </select>
                        </div>
                        {g.description && (
                          <p className="mt-1 text-[13px] text-[var(--muted)]">{g.description}</p>
                        )}
                        <Bar progress={g.progress} />
                        <p className="mt-1.5 text-[12px] text-[var(--muted)]">
                          {g.done}/{g.total} tasks ·{" "}
                          <CountUp value={Math.round(g.progress * 100)} suffix="%" duration={0.8} pop={false} />
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div>
              <SectionLabel>projects</SectionLabel>
              <Panel tone="band">
                {projects.length === 0 ? (
                  <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">No projects yet.</p>
                ) : (
                  <div>
                    {projects.map((p) => (
                      <div key={p._id} className="border-b border-[var(--border)] py-4 first:pt-0 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[14.5px] font-medium text-[var(--foreground)]">{p.name}</span>
                          <Badge tone={p.status === "done" ? "blue" : "green"}>{p.status}</Badge>
                        </div>
                        <Bar progress={p.progress} />
                        <p className="mt-1.5 text-[12px] text-[var(--muted)]">
                          {p.done}/{p.total} tasks
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}
      </div>

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
              {goals.map((g) => (
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

      <AutoPlanDialog open={planOpen} onClose={() => setPlanOpen(false)} />
    </div>
  );
}
