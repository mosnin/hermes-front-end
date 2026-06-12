"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, StatusDot } from "@/components/ui";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { timeAgo } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function AgentsPage() {
  const agents = useQuery(api.agents.list);
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-muted">
            Every Hermes agent connected to this account.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Connect agent
        </Button>
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
                  <Badge>{a.platform ?? "—"}</Badge>
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
    </div>
  );
}
