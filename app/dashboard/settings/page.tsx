"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Input } from "@/components/ui";
import { ScheduleCard } from "@/components/schedule-card";
import { useActiveSpace, useCan } from "@/components/active-space";
import { Stagger, StaggerItem } from "@/components/site/motion";
import {
  PageHead,
  PillButton,
  Panel,
  Dot,
} from "@/components/dash/kit";

type Guards = {
  maxStepsPerRun: number;
  maxAgentHops: number;
  maxConcurrentRuns: number;
  maxRunWallclockMs: number;
  dailyMessageBudget: number;
  maxLoopRepeats: number;
  maxMessagesPerMinute: number;
  monthlyBudgetUsd: number;
};

const GUARD_DEFAULTS: Guards = {
  maxStepsPerRun: 50,
  maxAgentHops: 25,
  maxConcurrentRuns: 10,
  maxRunWallclockMs: 3_600_000,
  dailyMessageBudget: 5000,
  maxLoopRepeats: 4,
  maxMessagesPerMinute: 120,
  monthlyBudgetUsd: 0,
};

const GUARD_FIELDS: { key: keyof Guards; label: string; hint: string }[] = [
  { key: "maxStepsPerRun", label: "Max steps / run", hint: "Hard cap on steps in one workflow run" },
  { key: "maxAgentHops", label: "Max agent hops", hint: "Runaway guard for agent-to-agent chains" },
  { key: "maxConcurrentRuns", label: "Max concurrent runs", hint: "Parallel workflow runs allowed" },
  { key: "maxRunWallclockMs", label: "Max run time (ms)", hint: "Kill a run after this duration" },
  { key: "dailyMessageBudget", label: "Daily message budget", hint: "A2A/message cap per 24h" },
  { key: "maxLoopRepeats", label: "Max loop repeats", hint: "Identical-message loop threshold" },
  { key: "maxMessagesPerMinute", label: "Max messages / minute", hint: "Burst rate limit" },
  { key: "monthlyBudgetUsd", label: "Monthly budget ($)", hint: "0 = unlimited; autonomy auto-pauses when exceeded" },
];

export default function SettingsPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const space = useQuery(api.spaces.get, spaceId ? { spaceId } : "skip");
  const members = useQuery(api.spaces.members, spaceId ? { spaceId } : "skip");

  const setGuardConfig = useMutation(api.spaces.setGuardConfig);
  const setPaused = useMutation(api.spaces.setAutonomyPaused);
  const setShadowMode = useMutation(api.spaces.setShadowMode);
  const addMember = useMutation(api.spaces.addMember);
  const setRole = useMutation(api.spaces.setMemberRole);
  const removeMember = useMutation(api.spaces.removeMember);

  const [guards, setGuards] = useState<Guards | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"viewer" | "operator" | "admin" | "owner">("operator");

  useEffect(() => {
    if (space?.guardConfig) {
      setGuards({ ...GUARD_DEFAULTS, ...(space.guardConfig as Partial<Guards>) });
    }
  }, [space]);

  if (!space) {
    return (
      <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
        <div className="mx-auto max-w-[1120px]">
          <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  const canPause = canAdmin && !!spaceId;
  const canAddMember = canAdmin && !!spaceId && !!newUserId.trim();

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="settings"
          title="Space settings"
          sub={`Autonomy guardrails, the kill switch, and access for ${space.name}.`}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Kill switch */}
          <Panel title="Kill switch">
            <div className="flex items-center gap-2.5">
              <Dot tone={space.autonomyPaused ? "paused" : "online"} />
              <p className="text-[13.5px] text-[var(--muted)]">
                {space.autonomyPaused
                  ? "Autonomy is paused, agents will not dispatch."
                  : "Autonomy is active. Agents and workflows run freely within guards."}
              </p>
            </div>
            <div className="mt-4">
              <PillButton
                variant={space.autonomyPaused ? "solid" : "outline"}
                className={cnDisabled(!canPause)}
                onClick={() => {
                  if (!canPause) return;
                  setPaused({ spaceId: spaceId!, paused: !space.autonomyPaused });
                }}
              >
                {space.autonomyPaused ? "Resume autonomy" : "Pause all autonomy"}
              </PillButton>
            </div>
          </Panel>

          {/* Shadow mode */}
          <Panel title="Shadow mode">
            <div className="flex items-center gap-2.5">
              <Dot tone={space.shadowMode ? "idle" : "online"} />
              <p className="text-[13.5px] text-[var(--muted)]">
                {space.shadowMode
                  ? "Shadow mode is on, agents propose actions to the ledger instead of executing them."
                  : "Shadow mode is off, agents execute actions directly. When on, agents propose actions to the ledger instead of executing them."}
              </p>
            </div>
            <div className="mt-4">
              <PillButton
                variant={space.shadowMode ? "solid" : "outline"}
                className={cnDisabled(!canPause)}
                onClick={() => {
                  if (!canPause) return;
                  setShadowMode({ spaceId: spaceId!, shadow: !space.shadowMode });
                }}
              >
                {space.shadowMode ? "Disable shadow mode" : "Enable shadow mode"}
              </PillButton>
            </div>
          </Panel>
        </div>

        {/* Guardrails */}
        <Panel title="Autonomy guardrails">
          <p className="mb-5 max-w-2xl text-[13.5px] text-[var(--muted)]">
            Safe-by-default limits that keep autonomous agents from running away,
            no human approval required.
          </p>
          {guards && (
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.05}>
              {GUARD_FIELDS.map((f) => (
                <StaggerItem key={f.key} y={10}>
                  <label className="mb-1 block text-[11.5px] text-[var(--muted)]">{f.label}</label>
                  <Input
                    type="number"
                    value={guards[f.key]}
                    disabled={!canAdmin}
                    onChange={(e) =>
                      setGuards({ ...guards, [f.key]: Number(e.target.value) })
                    }
                  />
                  <p className="mt-1 text-[11px] text-[var(--muted)]">{f.hint}</p>
                </StaggerItem>
              ))}
            </Stagger>
          )}
          {canAdmin && guards && (
            <div className="mt-5 flex justify-end">
              <PillButton onClick={() => spaceId && setGuardConfig({ spaceId, guardConfig: guards })}>
                Save guardrails
              </PillButton>
            </div>
          )}
        </Panel>

        {/* Members */}
        <Panel title="Members & roles">
          <p className="mb-4 text-[13.5px] text-[var(--muted)]">
            Roles: viewer · operator · admin · owner. Per-Space isolation means
            members only see this Space&apos;s data.
          </p>
          <div>
            {(members ?? []).map((m) => (
              <ListRowMember
                key={m._id}
                userId={m.userId}
                role={m.role}
                canAdmin={canAdmin}
                onRoleChange={(role) =>
                  spaceId && setRole({ spaceId, memberId: m._id, role: role as never })
                }
                onRemove={() => spaceId && removeMember({ spaceId, memberId: m._id })}
              />
            ))}
          </div>
          {canAdmin && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-[11.5px] text-[var(--muted)]">
                  Add member (Clerk user id)
                </label>
                <Input
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="user_xxx"
                />
              </div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as never)}
                className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13.5px] text-[var(--foreground)]"
              >
                <option value="viewer">viewer</option>
                <option value="operator">operator</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
              <PillButton
                className={cnDisabled(!canAddMember)}
                onClick={async () => {
                  if (!canAddMember || !spaceId) return;
                  await addMember({ spaceId, userId: newUserId.trim(), role: newRole });
                  setNewUserId("");
                }}
              >
                Add
              </PillButton>
            </div>
          )}
        </Panel>

        <ScheduleCard />
      </div>
    </div>
  );
}

/** Small helper: a consistent visual-disabled treatment for PillButton, which
 *  has no native `disabled` prop. Pair with an onClick guard so the handler
 *  itself is a no-op while the condition holds. */
function cnDisabled(disabled: boolean): string | undefined {
  return disabled ? "pointer-events-none opacity-45" : undefined;
}

function ListRowMember({
  userId,
  role,
  canAdmin,
  onRoleChange,
  onRemove,
}: {
  userId: string;
  role: string;
  canAdmin: boolean;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 border-b border-[var(--border)] px-1 py-3.5 last:border-0">
      <p className="min-w-0 flex-1 truncate text-[14.5px] text-[var(--foreground)]">{userId}</p>
      {canAdmin ? (
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          className="rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-[12.5px] text-[var(--foreground)]"
        >
          <option value="viewer">viewer</option>
          <option value="operator">operator</option>
          <option value="admin">admin</option>
          <option value="owner">owner</option>
        </select>
      ) : (
        <Badge>{role}</Badge>
      )}
      {canAdmin && (
        <button
          onClick={onRemove}
          className="text-[12.5px] text-[var(--muted)] hover:text-red-500"
        >
          Remove
        </button>
      )}
    </div>
  );
}
