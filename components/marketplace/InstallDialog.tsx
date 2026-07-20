"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Input, Modal, Segmented } from "@/components/ui";
import { Boxes, CheckCircle2, Cloud, Sparkles, Workflow } from "@/components/icons";
import { useActiveSpace } from "@/components/active-space";

type Template = {
  _id: Id<"agentTemplates">;
  name: string;
  tagline?: string;
  description?: string;
  category?: string;
  harness?: string;
  suggestedModel?: string;
  systemPrompt?: string;
  toolsets?: string[];
  capabilities?: string[];
  skills?: { name: string; description?: string; tags?: string[] }[];
  workflowBundle?: unknown;
  securityProfileName?: string;
  author?: string;
  version?: string;
  installCount?: number;
};

export function TemplateDetailModal({
  templateId,
  onClose,
}: {
  templateId: Id<"agentTemplates"> | null;
  onClose: () => void;
}) {
  const { spaceId } = useActiveSpace();
  const template = useQuery(
    api.marketplace.getTemplate,
    spaceId && templateId ? { spaceId, templateId } : "skip",
  ) as Template | null | undefined;
  const squads = useQuery(api.squads.list, spaceId ? { spaceId } : "skip");
  const securityProfiles = useQuery(
    api.securityProfiles.list,
    spaceId ? { spaceId } : "skip",
  ) as { _id: Id<"securityProfiles">; name: string }[] | undefined;
  const install = useAction(api.marketplace.install);

  const [name, setName] = useState("");
  const [squadId, setSquadId] = useState<string>("");
  const [securityProfileId, setSecurityProfileId] = useState<string>("");
  const [mode, setMode] = useState<"hosted" | "connect">("connect");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ agentId: string; token?: string; hosted: boolean } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  if (!templateId) return null;

  async function submit() {
    if (!spaceId || !templateId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await install({
        spaceId,
        templateId,
        name: name.trim() || undefined,
        squadId: squadId ? (squadId as Id<"squads">) : undefined,
        deployHosted: mode === "hosted",
        securityProfileId: securityProfileId
          ? (securityProfileId as Id<"securityProfiles">)
          : undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setResult(null);
    setError(null);
    setName("");
    setSquadId("");
    setSecurityProfileId("");
    onClose();
  }

  return (
    <Modal open={!!templateId} onClose={close} title={template?.name ?? "Template"}>
      {!template ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
            <div>
              <p className="font-medium text-green-300">
                Installed{result.hosted ? " and deployed" : ""}.
              </p>
              <p className="mt-1 text-muted">
                {result.hosted
                  ? "Your hosted agent is provisioning now — check the Fleet page for status."
                  : "The agent is registered. Connect it with the token below."}
              </p>
            </div>
          </div>
          {result.token && (
            <div>
              <p className="mb-1 text-xs text-muted">Connector token (shown once)</p>
              <code className="block break-all rounded-lg border border-border bg-surface-2 p-3 text-xs">
                {result.token}
              </code>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {template.tagline && <p className="text-sm text-muted">{template.tagline}</p>}
          {template.description && <p className="text-sm">{template.description}</p>}

          <div className="flex flex-wrap gap-1.5">
            {template.category && <Badge tone="blue">{template.category}</Badge>}
            {template.harness && <Badge>{template.harness}</Badge>}
            {template.suggestedModel && <Badge tone="green">{template.suggestedModel}</Badge>}
            {template.securityProfileName && (
              <Badge tone="yellow">security: {template.securityProfileName}</Badge>
            )}
          </div>

          {template.capabilities && template.capabilities.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Capabilities</p>
              <div className="flex flex-wrap gap-1">
                {template.capabilities.map((c) => (
                  <Badge key={c}>{c}</Badge>
                ))}
              </div>
            </div>
          )}

          {template.skills && template.skills.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
                <Sparkles className="h-3 w-3" /> Bundled skills ({template.skills.length})
              </p>
              <ul className="space-y-1">
                {template.skills.map((s) => (
                  <li key={s.name} className="rounded-lg border border-border bg-surface-2 p-2 text-sm">
                    <p className="font-medium">{s.name}</p>
                    {s.description && <p className="text-xs text-muted">{s.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!template.workflowBundle && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2 text-sm text-muted">
              <Workflow className="h-4 w-4" /> Includes a bundled workflow
            </div>
          )}

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">Install into this Space</p>
            <div className="space-y-3">
              <Input
                placeholder={`Agent name (default: ${template.name})`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {squads && squads.length > 0 && (
                <select
                  value={squadId}
                  onChange={(e) => setSquadId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  <option value="">No squad</option>
                  {squads.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {securityProfiles && securityProfiles.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs text-muted">Security profile</label>
                  <select
                    value={securityProfileId}
                    onChange={(e) => setSecurityProfileId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    <option value="">
                      {template.securityProfileName
                        ? `Template default (${template.securityProfileName})`
                        : "None"}
                    </option>
                    {securityProfiles.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {template.securityProfileName &&
                    !securityProfiles.some((p) => p.name === template.securityProfileName) && (
                      <p className="mt-1 text-xs text-yellow-400">
                        This template suggests a profile named &quot;{template.securityProfileName}
                        &quot;, which doesn&apos;t exist in this Space yet — the agent will install
                        without one unless you pick one above.
                      </p>
                    )}
                </div>
              )}
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: "connect", label: "Self-connect" },
                  { value: "hosted", label: "Hosted deploy" },
                ]}
              />
              <p className="text-xs text-muted">
                {mode === "hosted" ? (
                  <span className="inline-flex items-center gap-1">
                    <Cloud className="h-3 w-3" /> Provisions a cloud VM via Fleet deploy (plan
                    limits apply).
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Boxes className="h-3 w-3" /> Registers the agent + connector token; run the
                    connector yourself.
                  </span>
                )}
              </p>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={busy}>
                  {busy ? "Installing…" : "Install template"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
