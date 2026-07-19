"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, Send, Hash } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { PageHead, PillButton, Panel, ListRow, SectionLabel } from "@/components/dash/kit";
import { Stagger, StaggerItem } from "@/components/site/motion";

const CATALOG = [
  {
    type: "slack",
    name: "Slack",
    body: "Message a Slack bot and your routed agent replies in-channel.",
    Icon: Hash,
  },
  {
    type: "telegram",
    name: "Telegram",
    body: "Chat with a Telegram bot to drive your agent from anywhere.",
    Icon: Send,
  },
  {
    type: "discord",
    name: "Discord",
    body: "Talk to a Discord bot and let your agent respond in your server.",
    Icon: MessageSquare,
  },
] as const;

const typeLabel: Record<string, string> = {
  slack: "Slack",
  telegram: "Telegram",
  discord: "Discord",
};

export default function BridgesPage() {
  const { spaceId } = useActiveSpace();
  const canManage = useCan("admin");
  const toast = useToast();

  const bridges = useQuery(api.bridges.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");

  const connect = useMutation(api.bridges.connect);
  const setAgent = useMutation(api.bridges.setAgent);
  const remove = useMutation(api.bridges.remove);

  const [modal, setModal] = useState<{ type: string; name: string } | null>(null);
  const [bridgeName, setBridgeName] = useState("");
  const [routeAgent, setRouteAgent] = useState("");
  const [busy, setBusy] = useState(false);

  const agentName = (id?: Id<"agents"> | null) => (agents ?? []).find((a) => a._id === id)?.name;

  function openConnect(type: string, name: string) {
    if (!canManage || !spaceId) return;
    setBridgeName(`${name} bridge`);
    setRouteAgent("");
    setModal({ type, name });
  }

  async function submitConnect() {
    if (!spaceId || !modal || !bridgeName.trim()) return;
    setBusy(true);
    try {
      await connect({
        spaceId,
        type: modal.type,
        name: bridgeName.trim(),
        agentId: routeAgent ? (routeAgent as Id<"agents">) : undefined,
      });
      toast(`${modal.name} bridge connected`, "success");
      setModal(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to connect", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeBridge(bridgeId: Id<"bridges">, name: string) {
    if (!spaceId) return;
    try {
      await remove({ spaceId, bridgeId });
      toast(`Removed ${name}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove", "error");
    }
  }

  const canSubmitConnect = !busy && !!bridgeName.trim();

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Build"
          title="Chat bridges"
          sub="Control your agents from Slack, Telegram, or Discord, message a bot, your agent replies."
        />

        <div className="rounded-[18px] bg-[var(--surface)] px-4 py-3.5 text-[13.5px] text-[var(--muted)] ring-1 ring-inset ring-[var(--border)]">
          Connecting a bridge registers the route here. The bot token and webhook are provisioned by the bridge
          worker, a connector / fleet-worker-style deployment that relays messages between the chat platform and
          your agent.
        </div>

        <div>
          <SectionLabel>catalog</SectionLabel>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.map((c) => (
              <StaggerItem key={c.type}>
                <Panel title={c.name} action={<c.Icon className="h-4 w-4 text-[var(--muted)]" />}>
                  <p className="text-[13.5px] text-[var(--muted)]">{c.body}</p>
                  <div className="mt-4">
                    <PillButton
                      className={!canManage || !spaceId ? "pointer-events-none opacity-50" : undefined}
                      onClick={() => openConnect(c.type, c.name)}
                    >
                      Connect
                    </PillButton>
                  </div>
                </Panel>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <div>
          <SectionLabel>connected bridges</SectionLabel>
          {bridges && bridges.length === 0 ? (
            <Panel>
              <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">
                No bridges yet. Connect Slack, Telegram, or Discord above to start controlling your agents from
                chat.
              </p>
            </Panel>
          ) : (
            <Panel>
              <div>
                {(bridges ?? []).map((b) => (
                  <ListRow
                    key={b._id}
                    leading={typeLabel[b.type]?.slice(0, 2).toUpperCase() ?? b.type.slice(0, 2).toUpperCase()}
                    title={<span className="font-medium">{b.name}</span>}
                    meta={`Routed to ${agentName(b.agentId) ?? "no agent"}`}
                    trailing={
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] text-[var(--muted)]">{b.status}</span>
                        <select
                          value={b.agentId ?? ""}
                          disabled={!canManage || !spaceId}
                          onChange={(e) => {
                            if (!spaceId) return;
                            const val = e.target.value;
                            setAgent({
                              spaceId,
                              bridgeId: b._id,
                              agentId: val ? (val as Id<"agents">) : null,
                            });
                          }}
                          className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[12.5px] text-[var(--foreground)]"
                        >
                          <option value="">Route to agent…</option>
                          {(agents ?? []).map((a) => (
                            <option key={a._id} value={a._id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className={
                            !canManage || !spaceId
                              ? "pointer-events-none text-[12.5px] text-[var(--muted)] opacity-50"
                              : "text-[12.5px] text-[var(--muted)] transition-colors hover:text-red-500"
                          }
                          onClick={() => removeBridge(b._id, b.name)}
                        >
                          Remove
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={`Connect ${modal?.name ?? ""}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Name this bridge and pick which agent should answer incoming messages. Bot token and webhook setup
            happens via the bridge worker after you connect.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Bridge name</label>
            <Input value={bridgeName} onChange={(e) => setBridgeName(e.target.value)} placeholder="e.g. Support Slack" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Route messages to</label>
            <select
              value={routeAgent}
              onChange={(e) => setRouteAgent(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">No agent (set later)</option>
              {(agents ?? []).map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <PillButton variant="outline" onClick={() => setModal(null)}>
              Cancel
            </PillButton>
            <PillButton
              className={!canSubmitConnect ? "pointer-events-none opacity-50" : undefined}
              onClick={() => canSubmitConnect && submitConnect()}
            >
              {busy ? "Connecting…" : "Connect"}
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
