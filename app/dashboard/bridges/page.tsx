"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { MessageSquare, Send, Hash } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

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

const statusTone = {
  connected: "green",
  disconnected: "default",
  error: "red",
} as const;

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

  const [modal, setModal] = useState<{ type: string; name: string } | null>(
    null,
  );
  const [bridgeName, setBridgeName] = useState("");
  const [routeAgent, setRouteAgent] = useState("");
  const [busy, setBusy] = useState(false);

  const agentName = (id?: Id<"agents"> | null) =>
    (agents ?? []).find((a) => a._id === id)?.name;

  function openConnect(type: string, name: string) {
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

  return (
    <div className="p-8">
      <Reveal className="mb-6">
        <h1 className="text-2xl font-semibold">Chat bridges</h1>
        <p className="text-sm text-muted">
          Control your agents from Slack, Telegram, or Discord, message a bot,
          your agent replies.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mb-4 rounded-lg border border-border bg-surface/50 p-3 text-sm text-muted">
        Connecting a bridge registers the route here. The bot token and webhook
        are provisioned by the bridge worker, a connector / fleet-worker-style
        deployment that relays messages between the chat platform and your agent.
      </Reveal>

      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG.map((c) => (
          <StaggerItem key={c.type}>
            <Card>
              <div className="flex items-center gap-2">
                <c.Icon className="h-5 w-5 text-muted" />
                <p className="font-medium">{c.name}</p>
              </div>
              <p className="mt-1 text-sm text-muted">{c.body}</p>
              <div className="mt-4">
                <Button
                  disabled={!canManage || !spaceId}
                  onClick={() => openConnect(c.type, c.name)}
                >
                  Connect
                </Button>
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Connected bridges</h2>
      {bridges && bridges.length === 0 ? (
        <Reveal>
          <EmptyState
            title="No bridges yet"
            body="Connect Slack, Telegram, or Discord above to start controlling your agents from chat."
          />
        </Reveal>
      ) : (
        <Stagger className="space-y-3">
          {(bridges ?? []).map((b) => (
            <StaggerItem key={b._id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge tone="blue">{typeLabel[b.type] ?? b.type}</Badge>
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted">
                        Routed to {agentName(b.agentId) ?? "no agent"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone[b.status]}>{b.status}</Badge>
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
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                    >
                      <option value="">Route to agent…</option>
                      {(agents ?? []).map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      disabled={!canManage || !spaceId}
                      onClick={() => removeBridge(b._id, b.name)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={`Connect ${modal?.name ?? ""}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Name this bridge and pick which agent should answer incoming
            messages. Bot token and webhook setup happens via the bridge worker
            after you connect.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Bridge name
            </label>
            <Input
              value={bridgeName}
              onChange={(e) => setBridgeName(e.target.value)}
              placeholder="e.g. Support Slack"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Route messages to
            </label>
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
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button disabled={!bridgeName.trim() || busy} onClick={submitConnect}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
