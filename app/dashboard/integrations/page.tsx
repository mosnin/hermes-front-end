"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";

const CATALOG = [
  { type: "slack", name: "Slack", body: "Let agents post and respond in channels." },
  { type: "github", name: "GitHub", body: "Open PRs, review code, manage issues." },
  { type: "gmail", name: "Gmail", body: "Read and send email on your behalf." },
  { type: "linear", name: "Linear", body: "Create and update issues and projects." },
  { type: "notion", name: "Notion", body: "Read and write docs and databases." },
  { type: "calendar", name: "Calendar", body: "Schedule and manage events." },
];

const statusTone = { connected: "green", disconnected: "default", error: "red" } as const;

export default function IntegrationsPage() {
  const { spaceId } = useActiveSpace();
  const canManage = useCan("admin");
  const installed = useQuery(
    api.integrations.list,
    spaceId ? { spaceId } : "skip",
  );
  const connect = useMutation(api.integrations.connect);
  const remove = useMutation(api.integrations.remove);

  const byType = new Map((installed ?? []).map((i) => [i.type, i]));

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted">
          Connect the tools your agents should act in. {!canManage && "(admins only)"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG.map((c) => {
          const existing = byType.get(c.type);
          return (
            <Card key={c.type}>
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.name}</p>
                {existing && (
                  <Badge tone={statusTone[existing.status]}>
                    {existing.status}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">{c.body}</p>
              <div className="mt-4">
                {existing ? (
                  <Button
                    variant="outline"
                    disabled={!canManage}
                    onClick={() =>
                      spaceId &&
                      remove({ spaceId, integrationId: existing._id })
                    }
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    disabled={!canManage}
                    onClick={() =>
                      spaceId && connect({ spaceId, type: c.type, name: c.name })
                    }
                  >
                    Connect
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
