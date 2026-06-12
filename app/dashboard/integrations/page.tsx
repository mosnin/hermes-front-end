"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";

const statusTone = { connected: "green", disconnected: "default", error: "red" } as const;

export default function IntegrationsPage() {
  const { spaceId } = useActiveSpace();
  const canManage = useCan("admin");
  const skip = spaceId ? { spaceId } : "skip";
  const catalog = useQuery(api.integrations.catalog, {});
  const status = useQuery(api.integrations.status, {});
  const installed = useQuery(api.integrations.list, skip);
  const workflows = useQuery(api.workflows.list, skip);

  const initiate = useAction(api.integrations.initiate);
  const refresh = useAction(api.integrations.refresh);
  const enableTrigger = useAction(api.integrations.enableTrigger);
  const remove = useMutation(api.integrations.remove);

  const [busy, setBusy] = useState<string | null>(null);
  const [trigOpen, setTrigOpen] = useState<{ toolkit: string } | null>(null);
  const [trigSlug, setTrigSlug] = useState("");
  const [trigWf, setTrigWf] = useState("");

  const byToolkit = new Map((installed ?? []).map((i) => [i.type, i]));

  async function connect(toolkit: string, name: string) {
    if (!spaceId) return;
    const authConfigId = window.prompt(
      `Composio auth config id for ${name}\n(create one in the Composio dashboard for this toolkit):`,
    );
    if (!authConfigId?.trim()) return;
    setBusy(toolkit);
    try {
      const res = await initiate({
        spaceId,
        toolkit,
        name,
        authConfigId: authConfigId.trim(),
      });
      if (res.redirectUrl) window.open(res.redirectUrl, "_blank");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-sm text-muted">
            Connect tools via Composio managed OAuth. Agents and workflows can
            then execute actions, and Composio triggers can start workflows.
          </p>
        </div>
        {canManage && spaceId && (
          <Button variant="outline" onClick={() => refresh({ spaceId })}>
            Refresh status
          </Button>
        )}
      </div>

      {status && !status.composioConfigured && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          Composio isn&apos;t configured. Set <code>COMPOSIO_API_KEY</code> in the
          Convex environment to enable managed OAuth, tool execution, and
          triggers.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(catalog ?? []).map((c) => {
          const existing = byToolkit.get(c.toolkit);
          return (
            <Card key={c.toolkit}>
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.name}</p>
                {existing && (
                  <Badge tone={statusTone[existing.status]}>{existing.status}</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">{c.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {existing ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={!canManage}
                      onClick={() => setTrigOpen({ toolkit: c.toolkit })}
                    >
                      Add trigger
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!canManage || !spaceId}
                      onClick={() =>
                        spaceId && remove({ spaceId, integrationId: existing._id })
                      }
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    disabled={!canManage || busy === c.toolkit}
                    onClick={() => connect(c.toolkit, c.name)}
                  >
                    {busy === c.toolkit ? "Connecting…" : "Connect"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={!!trigOpen}
        onClose={() => setTrigOpen(null)}
        title={`Add ${trigOpen?.toolkit ?? ""} trigger`}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Bind a Composio trigger to a workflow. When the event fires, the
            workflow runs — fully autonomous.
          </p>
          <Input
            value={trigSlug}
            onChange={(e) => setTrigSlug(e.target.value)}
            placeholder="Composio trigger slug (e.g. SLACK_RECEIVE_MESSAGE)"
          />
          <select
            value={trigWf}
            onChange={(e) => setTrigWf(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="">Select workflow…</option>
            {(workflows ?? []).map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTrigOpen(null)}>
              Cancel
            </Button>
            <Button
              disabled={!trigSlug.trim() || !trigWf}
              onClick={async () => {
                if (!spaceId || !trigOpen) return;
                await enableTrigger({
                  spaceId,
                  toolkit: trigOpen.toolkit,
                  triggerSlug: trigSlug.trim(),
                  workflowId: trigWf as Id<"workflows">,
                });
                setTrigSlug("");
                setTrigWf("");
                setTrigOpen(null);
              }}
            >
              Enable trigger
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
