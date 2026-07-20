"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Megaphone, Pause, Play, Trash2 } from "@/components/icons";
import { Stagger, StaggerItem } from "@/components/site/motion";
import { PageHead, PillButton, Panel, StatTile, StatRow } from "@/components/dash/kit";

const statusTone = {
  active: "green",
  paused: "yellow",
  completed: "blue",
} as const;

export default function CampaignsPage() {
  const { spaceId, active } = useActiveSpace();
  const canOperate = useCan("operator");
  const toast = useToast();

  const campaigns = useQuery(
    api.campaigns.list,
    spaceId ? { spaceId } : "skip",
  );
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");

  const create = useMutation(api.campaigns.create);
  const setStatus = useMutation(api.campaigns.setStatus);
  const remove = useMutation(api.campaigns.remove);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [agentId, setAgentId] = useState("");
  const [cadence, setCadence] = useState("");

  const agentName = (id?: Id<"agents">) =>
    agents?.find((a) => a._id === id)?.name;

  async function submit() {
    if (!spaceId || !name.trim() || !objective.trim()) return;
    try {
      await create({
        spaceId,
        name: name.trim(),
        objective: objective.trim(),
        agentId: agentId ? (agentId as Id<"agents">) : undefined,
        cadence: cadence.trim() || undefined,
      });
      toast(`Created campaign "${name.trim()}"`, "success");
      setName("");
      setObjective("");
      setAgentId("");
      setCadence("");
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create campaign", "error");
    }
  }

  async function toggle(
    campaignId: Id<"campaigns">,
    status: "active" | "paused" | "completed",
  ) {
    if (!spaceId) return;
    const next = status === "active" ? "paused" : "active";
    try {
      await setStatus({ spaceId, campaignId, status: next });
      toast(next === "active" ? "Campaign resumed" : "Campaign paused", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update campaign", "error");
    }
  }

  async function del(campaignId: Id<"campaigns">, label: string) {
    if (!spaceId) return;
    try {
      await remove({ spaceId, campaignId });
      toast(`Removed campaign "${label}"`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove campaign", "error");
    }
  }

  const list = campaigns ?? [];
  const activeCount = list.filter((c) => c.status === "active").length;
  const pausedCount = list.filter((c) => c.status === "paused").length;
  const completedCount = list.filter((c) => c.status === "completed").length;

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · campaigns`}
          title="Campaigns"
          sub="Ongoing jobs your agents pursue continuously, e.g. outreach: find contacts, send, follow up, book demos. Not one-off tasks."
          actions={
            canOperate && (
              <PillButton onClick={() => setOpen(true)}>New campaign</PillButton>
            )
          }
        />

        <StatRow>
          <StatTile value={list.length} label="Campaigns" hint="total" tone="ink" />
          <StatTile value={activeCount} label="Active" hint="running now" />
          <StatTile value={pausedCount} label="Paused" hint="on hold" />
          <StatTile value={completedCount} label="Completed" hint="wrapped up" />
        </StatRow>

        {campaigns && campaigns.length === 0 ? (
          <Panel>
            <EmptyState
              title="No campaigns yet"
              body="Launch a standing objective, like ongoing outreach, and assign an agent to pursue it on a cadence."
              action={
                canOperate ? (
                  <Button onClick={() => setOpen(true)}>Create a campaign</Button>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" gap={0.06}>
            {list.map((c) => {
              const m = c.metrics ?? {};
              return (
                <StaggerItem key={c._id}>
                  <Panel
                    title={
                      <span className="flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-[var(--muted-strong)]" />
                        {c.name}
                      </span>
                    }
                    action={<Badge tone={statusTone[c.status]}>{c.status}</Badge>}
                  >
                    <p className="line-clamp-3 text-[13.5px] text-[var(--muted)]">
                      {c.objective}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--muted)]">
                      <span>
                        Agent:{" "}
                        <span className="text-[var(--muted-strong)]">
                          {c.agentId ? (agentName(c.agentId) ?? "agent") : "unassigned"}
                        </span>
                      </span>
                      {c.cadence && <span>Cadence: {c.cadence}</span>}
                      {c.status === "active" && c.nextRunAt && (
                        <span>Next run: {timeAgo(c.nextRunAt)}</span>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-[14px] bg-[var(--surface)] p-3 text-center">
                      <div>
                        <div className="text-[17px] font-medium text-[var(--foreground)]">{m.contacted ?? 0}</div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          Contacted
                        </div>
                      </div>
                      <div>
                        <div className="text-[17px] font-medium text-[var(--foreground)]">{m.replied ?? 0}</div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          Replied
                        </div>
                      </div>
                      <div>
                        <div className="text-[17px] font-medium text-[var(--foreground)]">{m.booked ?? 0}</div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          Booked
                        </div>
                      </div>
                    </div>

                    {canOperate && (
                      <div className="mt-4 flex items-center gap-2">
                        {c.status !== "completed" && (
                          <PillButton variant="outline" onClick={() => toggle(c._id, c.status)}>
                            {c.status === "active" ? (
                              <>
                                <Pause className="h-3.5 w-3.5" /> Pause
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5" /> Resume
                              </>
                            )}
                          </PillButton>
                        )}
                        <button
                          onClick={() => del(c._id, c.name)}
                          className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-[var(--muted)] transition-colors hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    )}
                  </Panel>
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New campaign">
        <div className="space-y-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Campaign name (e.g. Q3 outbound outreach)"
            autoFocus
          />
          <Textarea
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="What should the agent pursue continuously? e.g. Find SaaS founders, send a personalized intro, follow up twice, book a demo."
            rows={4}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Assignee agent</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
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
            <div>
              <label className="mb-1 block text-xs text-muted">Cadence</label>
              <Input
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                placeholder="e.g. every 1h, daily"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim() || !objective.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
