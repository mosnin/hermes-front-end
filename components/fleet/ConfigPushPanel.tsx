"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import { useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Settings, Send, X } from "@/components/icons";

/**
 * Remote config push (feature 7). Operators edit desired model / system
 * prompt / tool allowlist / env overrides here; the connector polls + acks
 * the change out-of-band, and this panel shows drift until it does.
 */
export function ConfigPushPanel({
  spaceId,
  agentId,
}: {
  spaceId: Id<"spaces">;
  agentId: Id<"agents">;
}) {
  const canEdit = useCan("operator");
  const toast = useToast();
  const drift = useQuery(api.agentOps.configDrift, { spaceId, agentId });
  const pushConfig = useMutation(api.agentOps.pushConfig);
  const cancelPending = useMutation(api.agentOps.cancelPendingConfig);

  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toolAllowlist, setToolAllowlist] = useState("");
  const [envOverrides, setEnvOverrides] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!drift) return;
    const base = drift.pending ?? drift.applied;
    setModel(base?.model ?? "");
    setSystemPrompt(base?.systemPrompt ?? "");
    setToolAllowlist((base?.toolAllowlist ?? []).join(", "));
    setEnvOverrides(
      Object.entries(base?.envOverrides ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    );
  }, [drift]);

  if (drift === undefined) {
    return (
      <Card>
        <p className="text-sm text-muted">Loading config…</p>
      </Card>
    );
  }

  if (drift === null) {
    return (
      <Card>
        <p className="text-sm text-muted">Remote config unavailable for this agent.</p>
      </Card>
    );
  }

  async function push() {
    setBusy(true);
    try {
      const envPairs = envOverrides
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const idx = l.indexOf("=");
          return idx === -1 ? [l, ""] : [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        });
      await pushConfig({
        spaceId,
        agentId,
        model: model.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        toolAllowlist: toolAllowlist.trim()
          ? toolAllowlist.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
        envOverrides: envPairs.length ? Object.fromEntries(envPairs) : undefined,
      });
      toast("Config pushed — waiting for the agent to apply it", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Push failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await cancelPending({ spaceId, agentId });
      toast("Pending config cancelled", "info");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Settings className="h-4 w-4" /> Remote config
        </h2>
        {drift.drift ? (
          <Badge tone="yellow">
            drift: v{drift.pending?.version} pending
            {drift.applied ? ` (applied v${drift.applied.version})` : " (never applied)"}
          </Badge>
        ) : (
          <Badge tone="green">
            in sync{drift.applied ? ` — v${drift.applied.version}` : ""}
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        Edits here become the agent&apos;s <em>desired</em> config. The connector polls, applies,
        and acks; until it does, the change shows as drift.
        {drift.configAckedAt ? ` Last applied ${timeAgo(drift.configAckedAt)}.` : ""}
      </p>

      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted">Model</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={!canEdit}
              placeholder="claude-opus-4-8"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-muted">Tool allowlist (comma separated)</label>
            <Input
              value={toolAllowlist}
              onChange={(e) => setToolAllowlist(e.target.value)}
              disabled={!canEdit}
              placeholder="browser, code-exec"
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted">System prompt</label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            disabled={!canEdit}
            rows={4}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted">Env overrides (KEY=value per line)</label>
          <Textarea
            value={envOverrides}
            onChange={(e) => setEnvOverrides(e.target.value)}
            disabled={!canEdit}
            rows={3}
            placeholder={"FEATURE_FLAG=1\nMAX_TOKENS=4096"}
            className="mt-1 font-mono text-xs"
          />
        </div>

        {canEdit && (
          <div className="flex justify-end gap-2">
            {drift.drift && (
              <Button variant="ghost" onClick={cancel} disabled={busy}>
                <X className="h-4 w-4" /> Cancel pending
              </Button>
            )}
            <Button onClick={push} disabled={busy}>
              <Send className="h-4 w-4" /> {busy ? "Pushing…" : "Push config"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
