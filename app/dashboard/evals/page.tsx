"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { FlaskConical, Loader2, Plus, Sparkles, Star } from "@/components/icons";

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
      toast(`Auto-eval: ${result.rating}/5, ${result.comment}`, "success");
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

      <BenchmarkSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cross-harness eval benchmarking (feature 13)
// ---------------------------------------------------------------------------

function qualityTone(score: number | null): "default" | "green" | "yellow" | "red" {
  if (score == null) return "default";
  if (score >= 0.7) return "green";
  if (score >= 0.4) return "yellow";
  return "red";
}

function BenchmarkSection() {
  const { spaceId } = useActiveSpace();
  const benchmarks = useQuery(api.evals.listBenchmarks, spaceId ? { spaceId } : "skip");
  const batches = useQuery(api.evals.listBatches, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const createBenchmark = useMutation(api.evals.createBenchmark);
  const runBatch = useAction(api.evals.runBenchmarkBatch);
  const toast = useToast();

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [rubric, setRubric] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");

  const [runOpen, setRunOpen] = useState<Id<"evalBenchmarks"> | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

  const [activeBatch, setActiveBatch] = useState<string | null>(null);
  const comparison = useQuery(
    api.evals.compareBatch,
    spaceId && activeBatch ? { spaceId, batchId: activeBatch } : "skip",
  );

  async function submitBenchmark() {
    if (!spaceId || !name.trim() || !prompt.trim()) return;
    try {
      await createBenchmark({
        spaceId,
        name: name.trim(),
        description: description.trim() || undefined,
        prompt: prompt.trim(),
        rubric: rubric.trim() || undefined,
        expectedOutput: expectedOutput.trim() || undefined,
      });
      toast("Benchmark created", "success");
      setNewOpen(false);
      setName("");
      setDescription("");
      setPrompt("");
      setRubric("");
      setExpectedOutput("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create benchmark", "error");
    }
  }

  async function submitRun() {
    if (!spaceId || !runOpen || selectedAgents.size === 0) return;
    setRunning(true);
    try {
      const { batchId } = await runBatch({
        spaceId,
        benchmarkId: runOpen,
        agentIds: Array.from(selectedAgents) as Id<"agents">[],
      });
      toast(`Benchmark run started across ${selectedAgents.size} agent(s)`, "success");
      setRunOpen(null);
      setSelectedAgents(new Set());
      setActiveBatch(batchId);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to start benchmark run", "error");
    } finally {
      setRunning(false);
    }
  }

  const maxCost = Math.max(0.0001, ...(comparison ?? []).map((r) => r.costUsd ?? 0));

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Cross-harness benchmarks</h2>
          <p className="text-sm text-muted">
            Run the same prompt across multiple agents (different harness/model) and compare cost vs quality.
          </p>
        </div>
        <Button variant="ghost" onClick={() => setNewOpen(true)}>
          <FlaskConical className="h-4 w-4" /> New benchmark
        </Button>
      </div>

      {benchmarks && benchmarks.length === 0 ? (
        <EmptyState
          title="No benchmarks yet"
          body="Create a benchmark prompt to compare agents side by side on cost and quality."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <FlaskConical className="h-4 w-4" /> New benchmark
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-muted">Benchmarks</h3>
            <ul className="divide-y divide-border">
              {(benchmarks ?? []).map((b) => (
                <li key={b._id} className="flex items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    {b.description && (
                      <p className="truncate text-xs text-muted">{b.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRunOpen(b._id);
                      setSelectedAgents(new Set());
                    }}
                  >
                    Run
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-muted">Recent batches</h3>
            {batches && batches.length === 0 ? (
              <p className="text-sm text-muted">No runs yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(batches ?? []).map((b) => (
                  <li key={b.batchId} className="py-3">
                    <button
                      onClick={() => setActiveBatch(b.batchId)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{b.benchmarkName}</p>
                        <p className="text-xs text-muted">
                          {b.runCount} run{b.runCount === 1 ? "" : "s"} · {timeAgo(b.startedAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {b.avgQuality != null && (
                          <Badge tone={qualityTone(b.avgQuality)}>
                            {(b.avgQuality * 100).toFixed(0)}% quality
                          </Badge>
                        )}
                        <Badge>${b.totalCostUsd.toFixed(4)}</Badge>
                        {b.status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {activeBatch && (
        <Card className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted">Cost vs quality</h3>
            <Button variant="ghost" onClick={() => setActiveBatch(null)}>
              Close
            </Button>
          </div>
          {comparison === undefined ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : comparison.length === 0 ? (
            <p className="text-sm text-muted">No runs found for this batch.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 font-medium">Harness / model</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Quality</th>
                    <th className="py-2 pr-3 font-medium">Cost</th>
                    <th className="py-2 pr-3 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comparison.map((r) => (
                    <tr key={r.runId}>
                      <td className="py-2 pr-3 font-medium">{r.agentName}</td>
                      <td className="py-2 pr-3 text-muted">
                        {r.harness} / {r.model}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={r.status === "failed" ? "red" : r.status === "completed" ? "green" : "default"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {r.qualityScore != null ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-surface-2">
                              <div
                                className="h-1.5 rounded-full bg-accent"
                                style={{ width: `${r.qualityScore * 100}%` }}
                              />
                            </div>
                            <span>{(r.qualityScore * 100).toFixed(0)}%</span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-surface-2">
                            <div
                              className="h-1.5 rounded-full bg-sky-400"
                              style={{ width: `${((r.costUsd ?? 0) / maxCost) * 100}%` }}
                            />
                          </div>
                          <span>{r.costUsd != null ? `$${r.costUsd.toFixed(4)}` : "—"}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-muted">
                        {r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New benchmark">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Benchmark name" />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt to run against each agent…"
            rows={4}
          />
          <Textarea
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            placeholder="Grading rubric (optional)"
            rows={2}
          />
          <Textarea
            value={expectedOutput}
            onChange={(e) => setExpectedOutput(e.target.value)}
            placeholder="Expected output for reference (optional)"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitBenchmark} disabled={!name.trim() || !prompt.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={runOpen !== null}
        onClose={() => !running && setRunOpen(null)}
        title="Run benchmark across agents"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Select the agents to run this benchmark against — pick agents on different harnesses/models to compare.
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {(agents ?? []).map((a) => (
              <label
                key={a._id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  checked={selectedAgents.has(a._id)}
                  onChange={(e) => {
                    const next = new Set(selectedAgents);
                    if (e.target.checked) next.add(a._id);
                    else next.delete(a._id);
                    setSelectedAgents(next);
                  }}
                />
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-muted">
                  {a.harness ?? a.framework ?? "unknown"} / {a.model ?? "unknown"}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRunOpen(null)} disabled={running}>
              Cancel
            </Button>
            <Button onClick={submitRun} disabled={selectedAgents.size === 0 || running}>
              {running ? "Running…" : `Run across ${selectedAgents.size || ""} agent(s)`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
