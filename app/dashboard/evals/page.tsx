"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { BarChart3, FlaskConical, Loader2, Sparkles, Star, Trash2 } from "@/components/icons";
import { EASE, Stagger, StaggerItem } from "@/components/site/motion";
import { motion, useReducedMotion } from "motion/react";
import {
  PageHead,
  PillButton,
  Panel,
  ListRow,
  SectionLabel,
} from "@/components/dash/kit";

function Stars({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= rounded ? "fill-yellow-400 text-yellow-400" : "text-[var(--muted)]"
          }`}
        />
      ))}
    </div>
  );
}

export default function EvalsPage() {
  const { spaceId, active } = useActiveSpace();
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

  const reduce = useReducedMotion();
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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · evals`}
          title="Agent evals"
          sub="Score agent performance and track quality, speed, and cost over time."
          actions={
            <>
              <PillButton variant="outline" onClick={() => setAutoOpen(true)}>
                Auto-evaluate
              </PillButton>
              <PillButton onClick={() => setOpen(true)}>Log evaluation</PillButton>
            </>
          }
        />

        <div>
          <SectionLabel>scorecards</SectionLabel>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.06}>
            {(scorecards ?? []).map((s) => (
              <StaggerItem key={s.agentId}>
                <Panel
                  title={s.name}
                  action={<Badge>{s.count} evals</Badge>}
                >
                  <div className="flex items-center gap-2">
                    <Stars value={s.avg} />
                    <span className="text-[13px] text-[var(--muted)]">
                      {s.count ? `${s.avg.toFixed(1)}/5` : "N/5"}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-[var(--surface)]">
                    <motion.div
                      className="h-1.5 rounded-full bg-[var(--foreground)]"
                      initial={{ width: reduce ? `${(s.count / maxCount) * 100}%` : 0 }}
                      animate={{ width: `${(s.count / maxCount) * 100}%` }}
                      transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
                      style={{ minWidth: s.count ? 2 : 0 }}
                    />
                  </div>
                </Panel>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <div>
          <SectionLabel>recent evaluations</SectionLabel>
          {evals && evals.length === 0 ? (
            <Panel>
              <EmptyState
                title="No evaluations yet"
                body="Log your first evaluation to start building agent scorecards."
                action={<Button onClick={() => setOpen(true)}>Log evaluation</Button>}
              />
            </Panel>
          ) : (
            <Panel>
              <div>
                {(evals ?? []).map((e) => (
                  <ListRow
                    key={e._id}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{agentName(e.agentId) ?? "Agent"}</span>
                        <Stars value={e.rating} />
                        {e.dimension && <Badge tone="blue">{e.dimension}</Badge>}
                      </span>
                    }
                    meta={e.comment}
                    trailing={timeAgo(e.createdAt)}
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

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
  const canOperate = useCan("operator");
  const reduce = useReducedMotion();
  const benchmarks = useQuery(api.evals.listBenchmarks, spaceId ? { spaceId } : "skip");
  const batches = useQuery(api.evals.listBatches, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const createBenchmark = useMutation(api.evals.createBenchmark);
  const removeBenchmark = useMutation(api.evals.removeBenchmark);
  const runBatch = useAction(api.evals.runBenchmarkBatch);
  const toast = useToast();

  const [trendBenchmarkId, setTrendBenchmarkId] = useState<Id<"evalBenchmarks"> | null>(null);
  const trend = useQuery(
    api.evals.benchmarkTrend,
    spaceId && trendBenchmarkId ? { spaceId, benchmarkId: trendBenchmarkId } : "skip",
  );

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

  async function deleteBenchmark(benchmarkId: Id<"evalBenchmarks">, name: string) {
    if (!spaceId) return;
    if (!confirm(`Delete benchmark "${name}"? Past run history stays intact.`)) return;
    try {
      await removeBenchmark({ spaceId, benchmarkId });
      if (trendBenchmarkId === benchmarkId) setTrendBenchmarkId(null);
      toast("Benchmark deleted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete benchmark", "error");
    }
  }

  const maxCost = Math.max(0.0001, ...(comparison ?? []).map((r) => r.costUsd ?? 0));
  const trendMaxCost = Math.max(0.0001, ...(trend ?? []).map((t) => t.totalCostUsd));

  return (
    <div className="mx-auto mt-8 max-w-[1120px] space-y-8 border-t border-[var(--border)] pt-8">
      <PageHead
        eyebrow="cross-harness"
        title="Benchmarks"
        sub="Run the same prompt across multiple agents (different harness/model) and compare cost vs quality."
        actions={
          <PillButton variant="outline" onClick={() => setNewOpen(true)}>
            New benchmark
          </PillButton>
        }
      />

      {benchmarks && benchmarks.length === 0 ? (
        <Panel>
          <EmptyState
            title="No benchmarks yet"
            body="Create a benchmark prompt to compare agents side by side on cost and quality."
            action={<Button onClick={() => setNewOpen(true)}>New benchmark</Button>}
          />
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Benchmarks">
            <div>
              {(benchmarks ?? []).map((b) => (
                <ListRow
                  key={b._id}
                  title={b.name}
                  meta={b.description}
                  trailing={
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() =>
                          setTrendBenchmarkId((cur) => (cur === b._id ? null : b._id))
                        }
                        title="View quality/cost trend across runs"
                        className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                      >
                        <BarChart3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setRunOpen(b._id);
                          setSelectedAgents(new Set());
                        }}
                        className="rounded-full px-3 py-1.5 text-[12.5px] text-[var(--muted-strong)] transition-colors hover:bg-[var(--surface)]"
                      >
                        Run
                      </button>
                      {canOperate && (
                        <button
                          onClick={() => deleteBenchmark(b._id, b.name)}
                          title="Delete benchmark"
                          className="grid h-8 w-8 place-items-center rounded-full text-red-500/80 transition-colors hover:bg-[var(--surface)] hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  }
                />
              ))}
            </div>
          </Panel>

          <Panel title="Recent batches" tone="band">
            {batches && batches.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-[var(--muted)]">No runs yet.</p>
            ) : (
              <div>
                {(batches ?? []).map((b) => (
                  <ListRow
                    key={b.batchId}
                    onClick={() => setActiveBatch(b.batchId)}
                    title={b.benchmarkName}
                    meta={`${b.runCount} run${b.runCount === 1 ? "" : "s"} · ${timeAgo(b.startedAt)}`}
                    trailing={
                      <div className="flex shrink-0 items-center gap-2">
                        {b.avgQuality != null && (
                          <Badge tone={qualityTone(b.avgQuality)}>
                            {(b.avgQuality * 100).toFixed(0)}% quality
                          </Badge>
                        )}
                        <Badge>${b.totalCostUsd.toFixed(4)}</Badge>
                        {b.status === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {trendBenchmarkId && (
        <Panel
          title={`Trend across runs: ${benchmarks?.find((b) => b._id === trendBenchmarkId)?.name ?? "Benchmark"}`}
          action={
            <PillButton variant="outline" onClick={() => setTrendBenchmarkId(null)}>
              Close
            </PillButton>
          }
        >
          {trend === undefined ? (
            <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : trend.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No batches run for this benchmark yet.</p>
          ) : (
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {trend.map((t) => (
                <button
                  key={t.batchId}
                  onClick={() => setActiveBatch(t.batchId)}
                  className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg px-1 py-1 transition-colors hover:bg-[var(--surface)]"
                  title={`${t.runCount} run(s) · ${timeAgo(t.startedAt)}`}
                >
                  <div className="flex h-24 w-full items-end justify-center gap-1">
                    <motion.div
                      className="w-3 rounded-t bg-[var(--foreground)]"
                      initial={{ height: reduce ? Math.max(4, (t.avgQuality ?? 0) * 96) : 0 }}
                      animate={{ height: Math.max(4, (t.avgQuality ?? 0) * 96) }}
                      transition={{ duration: reduce ? 0 : 0.6, ease: EASE }}
                    />
                    <motion.div
                      className="w-3 rounded-t bg-sky-500"
                      initial={{ height: reduce ? Math.max(4, (t.totalCostUsd / trendMaxCost) * 96) : 0 }}
                      animate={{ height: Math.max(4, (t.totalCostUsd / trendMaxCost) * 96) }}
                      transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.08, ease: EASE }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--muted)]">{timeAgo(t.startedAt)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-4 text-[12px] text-[var(--muted)]">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--foreground)]" /> avg quality
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-500" /> total cost (relative)
            </span>
            <span className="ml-auto">Click a bar to open that batch&apos;s comparison</span>
          </div>
        </Panel>
      )}

      {activeBatch && (
        <Panel
          title="Cost vs quality"
          action={
            <PillButton variant="outline" onClick={() => setActiveBatch(null)}>
              Close
            </PillButton>
          }
        >
          {comparison === undefined ? (
            <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : comparison.length === 0 ? (
            <p className="text-[13.5px] text-[var(--muted)]">No runs found for this batch.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead>
                  <tr className="text-left text-[11.5px] text-[var(--muted)]">
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 font-medium">Harness / model</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Quality</th>
                    <th className="py-2 pr-3 font-medium">Cost</th>
                    <th className="py-2 pr-3 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {comparison.map((r) => (
                    <tr key={r.runId}>
                      <td className="py-2 pr-3 font-medium text-[var(--foreground)]">{r.agentName}</td>
                      <td className="py-2 pr-3 text-[var(--muted)]">
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
                            <div className="h-1.5 w-16 rounded-full bg-[var(--surface)]">
                              <motion.div
                                className="h-1.5 rounded-full bg-[var(--foreground)]"
                                initial={{ width: reduce ? `${r.qualityScore * 100}%` : 0 }}
                                animate={{ width: `${r.qualityScore * 100}%` }}
                                transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
                              />
                            </div>
                            <span>{(r.qualityScore * 100).toFixed(0)}%</span>
                          </div>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-[var(--surface)]">
                            <motion.div
                              className="h-1.5 rounded-full bg-sky-500"
                              initial={{ width: reduce ? `${((r.costUsd ?? 0) / maxCost) * 100}%` : 0 }}
                              animate={{ width: `${((r.costUsd ?? 0) / maxCost) * 100}%` }}
                              transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
                            />
                          </div>
                          <span>{r.costUsd != null ? `$${r.costUsd.toFixed(4)}` : "—"}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-[var(--muted)]">
                        {r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
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
            Select the agents to run this benchmark against, picking agents on different harnesses/models to compare.
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
