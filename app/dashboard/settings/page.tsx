"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Input } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { Power, EyeOff } from "lucide-react";

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

  if (!space) return <div className="p-8 text-sm text-muted">Loading…</div>;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Space settings</h1>
        <p className="text-sm text-muted">
          Autonomy guardrails, the kill switch, and access for {space.name}.
        </p>
      </div>

      {/* Kill switch */}
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Kill switch</h2>
            <p className="text-sm text-muted">
              {space.autonomyPaused
                ? "Autonomy is paused — agents will not dispatch."
                : "Autonomy is active. Agents and workflows run freely within guards."}
            </p>
          </div>
          <Button
            variant={space.autonomyPaused ? "primary" : "danger"}
            disabled={!canAdmin || !spaceId}
            onClick={() =>
              spaceId && setPaused({ spaceId, paused: !space.autonomyPaused })
            }
          >
            <Power className="h-4 w-4" />
            {space.autonomyPaused ? "Resume autonomy" : "Pause all autonomy"}
          </Button>
        </div>
      </Card>

      {/* Shadow mode */}
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Shadow mode</h2>
            <p className="text-sm text-muted">
              {space.shadowMode
                ? "Shadow mode is on — agents propose actions to the ledger instead of executing them."
                : "Shadow mode is off — agents execute actions directly. When on, agents propose actions to the ledger instead of executing them."}
            </p>
          </div>
          <Button
            variant={space.shadowMode ? "primary" : "outline"}
            disabled={!canAdmin || !spaceId}
            onClick={() =>
              spaceId &&
              setShadowMode({ spaceId, shadow: !space.shadowMode })
            }
          >
            <EyeOff className="h-4 w-4" />
            {space.shadowMode ? "Disable shadow mode" : "Enable shadow mode"}
          </Button>
        </div>
      </Card>

      {/* Guardrails */}
      <Card className="mb-4">
        <h2 className="mb-1 font-semibold">Autonomy guardrails</h2>
        <p className="mb-4 text-sm text-muted">
          Safe-by-default limits that keep autonomous agents from running away —
          no human approval required.
        </p>
        {guards && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GUARD_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-xs text-muted">{f.label}</label>
                <Input
                  type="number"
                  value={guards[f.key]}
                  disabled={!canAdmin}
                  onChange={(e) =>
                    setGuards({ ...guards, [f.key]: Number(e.target.value) })
                  }
                />
                <p className="mt-1 text-[11px] text-muted">{f.hint}</p>
              </div>
            ))}
          </div>
        )}
        {canAdmin && guards && (
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => spaceId && setGuardConfig({ spaceId, guardConfig: guards })}
            >
              Save guardrails
            </Button>
          </div>
        )}
      </Card>

      {/* Members */}
      <Card>
        <h2 className="mb-1 font-semibold">Members & roles</h2>
        <p className="mb-4 text-sm text-muted">
          Roles: viewer · operator · admin · owner. Per-Space isolation means
          members only see this Space&apos;s data.
        </p>
        <ul className="mb-4 divide-y divide-border">
          {(members ?? []).map((m) => (
            <li key={m._id} className="flex items-center gap-3 py-2">
              <span className="flex-1 truncate text-sm">{m.userId}</span>
              {canAdmin ? (
                <select
                  value={m.role}
                  onChange={(e) =>
                    spaceId &&
                    setRole({
                      spaceId,
                      memberId: m._id,
                      role: e.target.value as never,
                    })
                  }
                  className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                >
                  <option value="viewer">viewer</option>
                  <option value="operator">operator</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
              ) : (
                <Badge>{m.role}</Badge>
              )}
              {canAdmin && (
                <button
                  onClick={() =>
                    spaceId && removeMember({ spaceId, memberId: m._id })
                  }
                  className="text-xs text-muted hover:text-red-400"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {canAdmin && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted">
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
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="viewer">viewer</option>
              <option value="operator">operator</option>
              <option value="admin">admin</option>
              <option value="owner">owner</option>
            </select>
            <Button
              onClick={async () => {
                if (!spaceId || !newUserId.trim()) return;
                await addMember({ spaceId, userId: newUserId.trim(), role: newRole });
                setNewUserId("");
              }}
            >
              Add
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
