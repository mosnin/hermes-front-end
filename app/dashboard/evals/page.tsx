"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Plus, Sparkles, Star } from "lucide-react";

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-4 w-4 ${
            n <= rounded ? "fill-yellow-400 text-yellow-400" : "text-muted"
          }`}
        />
      ))}
    </div>
  );
}

export default function EvalsPage() {
  const { spaceId } = useActiveSpace();
  const scorecards = useQuery(api.evals.scorecards, spaceId ? { spaceId } : "skip");
  const evals = useQuery(api.evals.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const log = useMutation(api.evals.log);
  const autoEvaluate = useAction(api.evals.autoEvaluate);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [rating, setRating] = useState<number>(5);
  const [dimension, setDimension] = useState("");
  const [comment, setComment] = useState("");

  const [autoOpen, setAutoOpen] = useState(false);
  const [autoAgentId, setAutoAgentId] = useState<string>("");
  const [autoDimension, setAutoDimension] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);

  const agentName = (id: Id<"agents">) => agents?.find((a) => a._id === id)?.name;

  const maxCount = Math.max(1, ...((scorecards ?? []).map((s) => s.count)));

  async function submit() {
    if (!spaceId || !agentId) return;
    try {
      await log({
        spaceId,
        agentId: agentId as Id<"agents">,
        rating,
        dimension: dimension.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      toast("Evaluation logged", "success");
      setAgentId("");
      setRating(5);
      setDimension("");
      setComment("");
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to log evaluation", "error");
    }
  }

  async function runAuto() {
    if (!spaceId || !autoAgentId) return;
    setAutoBusy(true);
    try {
      const result = await autoEvaluate({
        spaceId,
        agentId: autoAgentId as Id<"agents">,
        dimension: autoDimension.trim() || undefined,
      });
      toast(`Auto-eval: ${result.rating}/5 — ${result.comment}`, "success");
      setAutoOpen(false);
      setAutoAgentId("");
      setAutoDimension("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Auto-evaluation failed", "error");
    } finally {
      setAutoBusy(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agent evals</h1>
          <p className="text-sm text-muted">
            Score agent performance and track quality, speed, and cost over time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setAutoOpen(true)}>
            <Sparkles className="h-4 w-4" /> Auto-evaluate
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Log evaluation
          </Button>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(scorecards ?? []).map((s) => (
          <Card key={s.agentId}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{s.name}</p>
              <Badge>{s.count} evals</Badge>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Stars value={s.avg} />
              <span className="text-sm text-muted">
                {s.count ? `${s.avg.toFixed(1)}/5` : "N/5"}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-surface-2">
              <div
                className="h-2 rounded-full bg-accent"
                style={{ width: `${(s.count / maxCount) * 100}%`, minWidth: s.count ? 2 : 0 }}
              />
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 font-semibold">Recent evaluations</h2>
      {evals && evals.length === 0 ? (
        <EmptyState
          title="No evaluations yet"
          body="Log your first evaluation to start building agent scorecards."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Log evaluation
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {(evals ?? []).map((e) => (
              <li key={e._id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {agentName(e.agentId) ?? "Agent"}
                    </span>
                    <Stars value={e.rating} />
                    {e.dimension && <Badge tone="blue">{e.dimension}</Badge>}
                  </div>
                  {e.comment && (
                    <p className="mt-1 text-sm text-muted">{e.comment}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Log evaluation">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">Select an agent…</option>
              {(agents ?? []).map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Rating</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Dimension</label>
              <Input
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
                placeholder="quality / speed / cost"
              />
            </div>
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment (optional)…"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!agentId}>
              Log
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={autoOpen}
        onClose={() => !autoBusy && setAutoOpen(false)}
        title="Auto-evaluate agent"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            An LLM judge rates the agent&apos;s recent output and logs an
            automated evaluation.
          </p>
          <div>
            <label className="mb-1 block text-xs text-muted">Agent</label>
            <select
              value={autoAgentId}
              onChange={(e) => setAutoAgentId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">Select an agent…</option>
              {(agents ?? []).map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Dimension</label>
            <Input
              value={autoDimension}
              onChange={(e) => setAutoDimension(e.target.value)}
              placeholder="quality (default)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setAutoOpen(false)}
              disabled={autoBusy}
            >
              Cancel
            </Button>
            <Button onClick={runAuto} disabled={!autoAgentId || autoBusy}>
              {autoBusy ? "Evaluating…" : "Run auto-eval"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
