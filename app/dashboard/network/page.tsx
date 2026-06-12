"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, StatusDot } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { ArrowRight, Send } from "lucide-react";

export default function NetworkPage() {
  const directory = useQuery(api.a2a.directory);
  const messages = useQuery(api.a2a.recent, { limit: 50 });
  const send = useMutation(api.a2a.send);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!from || !to || from === to || !content.trim()) return;
    setBusy(true);
    try {
      await send({
        fromAgentId: from as Id<"agents">,
        toAgentId: to as Id<"agents">,
        content: content.trim(),
      });
      setContent("");
    } finally {
      setBusy(false);
    }
  }

  const agents = directory ?? [];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Agent network</h1>
        <p className="text-sm text-muted">
          Agents talk to each other in real time through the A2A broker — even
          when they&apos;re behind NAT. Route a message, or watch them coordinate.
        </p>
      </div>

      {agents.length < 2 ? (
        <EmptyState
          title="Connect at least two agents"
          body="A2A needs two or more agents to coordinate. Connect another agent (or load demo data), then route messages between them here."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <Card>
              <h2 className="mb-3 font-semibold">Directory (Agent Cards)</h2>
              <ul className="space-y-2">
                {agents.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <StatusDot status={c.status} />
                      <span className="text-sm font-medium">{c.name}</span>
                      <Badge>{c.platform ?? "—"}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.skills.map((s) => (
                        <Badge key={s.id} tone="blue">
                          {s.name}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">Route a message</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                  >
                    <option value="">From…</option>
                    {agents.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
                  <select
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
                  >
                    <option value="">To…</option>
                    {agents
                      .filter((c) => c.id !== from)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="Message to relay between agents…"
                  />
                  <Button
                    onClick={submit}
                    disabled={busy || !from || !to || from === to || !content.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="mb-3 font-semibold">Live inter-agent messages</h2>
            {messages === undefined ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted">
                No agent-to-agent messages yet. Route one, or run the A2A demo.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {messages.map((m) => (
                  <li key={m._id} className="py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{m.fromName}</span>
                      <ArrowRight className="h-3 w-3 text-muted" />
                      <span className="font-medium">{m.toName}</span>
                      <Badge tone="green">{m.kind}</Badge>
                      <span className="ml-auto text-xs text-muted">
                        {timeAgo(m.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{m.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
