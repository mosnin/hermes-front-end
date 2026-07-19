"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { PageHead, PillButton, Panel, SectionLabel } from "@/components/dash/kit";
import { Stagger, StaggerItem } from "@/components/site/motion";

const statusLabel = { connected: "connected", disconnected: "disconnected", error: "error" } as const;

export default function IntegrationsPage() {
  const { spaceId } = useActiveSpace();
  const canManage = useCan("admin");
  const catalog = useQuery(api.integrations.catalog, {});
  const status = useQuery(api.integrations.status, {});
  const installed = useQuery(api.integrations.list, spaceId ? { spaceId } : "skip");
  const workflows = useQuery(api.workflows.list, spaceId ? { spaceId } : "skip");

  const initiate = useAction(api.integrations.initiate);
  const refresh = useAction(api.integrations.refresh);
  const enableTrigger = useAction(api.integrations.enableTrigger);
  const remove = useMutation(api.integrations.remove);

  const dialog = useDialog();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [trigOpen, setTrigOpen] = useState<{ toolkit: string } | null>(null);
  const [trigSlug, setTrigSlug] = useState("");
  const [trigWf, setTrigWf] = useState("");

  const byToolkit = new Map((installed ?? []).map((i) => [i.type, i]));

  async function connect(toolkit: string, name: string) {
    if (!spaceId) return;
    const authConfigId = await dialog.prompt({
      title: `Connect ${name}`,
      label: "Composio auth config id",
      placeholder: "ac_…",
      confirmLabel: "Connect",
    });
    if (!authConfigId?.trim()) return;
    setBusy(toolkit);
    try {
      const res = await initiate({ spaceId, toolkit, name, authConfigId: authConfigId.trim() });
      if (res.redirectUrl) {
        window.open(res.redirectUrl, "_blank");
        toast(`Opening ${name} authorization…`, "info");
      } else {
        toast(`${name} connection started`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to connect", "error");
    } finally {
      setBusy(null);
    }
  }

  const canEnableTrigger = !!trigSlug.trim() && !!trigWf;

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Build"
          title="Integrations"
          sub="Connect tools via Composio managed OAuth. Agents and workflows can then execute actions, and Composio triggers can start workflows."
          actions={
            canManage && spaceId ? (
              <PillButton variant="outline" onClick={() => refresh({ spaceId })}>
                Refresh status
              </PillButton>
            ) : undefined
          }
        />

        {status && !status.composioConfigured && (
          <div className="rounded-[18px] bg-amber-50 px-4 py-3.5 text-[13.5px] text-amber-800 ring-1 ring-inset ring-amber-200">
            Composio isn&apos;t configured. Set <code className="font-mono text-[12.5px]">COMPOSIO_API_KEY</code> in
            the Convex environment to enable managed OAuth, tool execution, and triggers.
          </div>
        )}

        <div>
          <SectionLabel>catalog</SectionLabel>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(catalog ?? []).map((c) => {
              const existing = byToolkit.get(c.toolkit);
              return (
                <StaggerItem key={c.toolkit}>
                  <Panel
                    title={c.name}
                    action={
                      existing && (
                        <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--muted-strong)]">
                          {statusLabel[existing.status]}
                        </span>
                      )
                    }
                  >
                    <p className="text-[13.5px] text-[var(--muted)]">{c.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {existing ? (
                        <>
                          <PillButton
                            variant="outline"
                            className={!canManage ? "pointer-events-none opacity-50" : undefined}
                            onClick={() => canManage && setTrigOpen({ toolkit: c.toolkit })}
                          >
                            Add trigger
                          </PillButton>
                          <PillButton
                            variant="outline"
                            className={!canManage || !spaceId ? "pointer-events-none opacity-50" : undefined}
                            onClick={() => spaceId && canManage && remove({ spaceId, integrationId: existing._id })}
                          >
                            Disconnect
                          </PillButton>
                        </>
                      ) : (
                        <PillButton
                          className={!canManage || busy === c.toolkit ? "pointer-events-none opacity-50" : undefined}
                          onClick={() => canManage && busy !== c.toolkit && connect(c.toolkit, c.name)}
                        >
                          {busy === c.toolkit ? "Connecting…" : "Connect"}
                        </PillButton>
                      )}
                    </div>
                  </Panel>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </div>

      <Modal open={!!trigOpen} onClose={() => setTrigOpen(null)} title={`Add ${trigOpen?.toolkit ?? ""} trigger`}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Bind a Composio trigger to a workflow. When the event fires, the workflow runs, fully autonomous.
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
            <PillButton variant="outline" onClick={() => setTrigOpen(null)}>
              Cancel
            </PillButton>
            <PillButton
              className={!canEnableTrigger ? "pointer-events-none opacity-50" : undefined}
              onClick={async () => {
                if (!spaceId || !trigOpen || !canEnableTrigger) return;
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
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
