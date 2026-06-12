"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, Input, Modal, StatusDot } from "@/components/ui";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { Globe, Plus } from "lucide-react";

export default function AgentsPage() {
  const { spaceId } = useActiveSpace();
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const registerExternal = useMutation(api.agents.registerExternal);
  const [open, setOpen] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  const [extName, setExtName] = useState("");
  const [extUrl, setExtUrl] = useState("");
  const [extCaps, setExtCaps] = useState("");

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-muted">
            Every Hermes agent connected to this Space.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExtOpen(true)}>
            <Globe className="h-4 w-4" /> Add external A2A
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Connect agent
          </Button>
        </div>
      </div>

      {agents?.length === 0 ? (
        <EmptyState
          title="No agents connected"
          body="Deploy a Hermes agent anywhere, then connect it here to give it threads, tasks, and skills."
          action={<Button onClick={() => setOpen(true)}>Connect your first agent</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(agents ?? []).map((a) => (
            <Link key={a._id} href={`/dashboard/agents/${a._id}`}>
              <Card className="h-full transition hover:border-accent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot status={a.status} />
                    <span className="font-medium">{a.name}</span>
                  </div>
                  <Badge>{a.platform ?? a.kind ?? "—"}</Badge>
                </div>
                {a.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">
                    {a.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {(a.capabilities ?? []).slice(0, 4).map((c) => (
                    <Badge key={c} tone="blue">
                      {c}
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Last seen {timeAgo(a.lastHeartbeat)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <RegisterAgentDialog open={open} onClose={() => setOpen(false)} />

      <Modal open={extOpen} onClose={() => setExtOpen(false)} title="Add external A2A agent">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Connect any agent that speaks the A2A protocol by its Agent Card URL.
            Your agents and workflows can then call it; the same guardrails apply.
          </p>
          <Input
            value={extName}
            onChange={(e) => setExtName(e.target.value)}
            placeholder="Agent name"
            autoFocus
          />
          <Input
            value={extUrl}
            onChange={(e) => setExtUrl(e.target.value)}
            placeholder="https://example.com/.well-known/agent-card.json"
          />
          <Input
            value={extCaps}
            onChange={(e) => setExtCaps(e.target.value)}
            placeholder="Capabilities (comma separated)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExtOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!spaceId || !extName.trim() || !extUrl.trim()) return;
                await registerExternal({
                  spaceId,
                  name: extName.trim(),
                  cardUrl: extUrl.trim(),
                  capabilities: extCaps
                    .split(",")
                    .map((c) => c.trim())
                    .filter(Boolean),
                });
                setExtName("");
                setExtUrl("");
                setExtCaps("");
                setExtOpen(false);
              }}
            >
              Add agent
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
