"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, Input, StatusDot } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function AnalyticsPage() {
  const { spaceId } = useActiveSpace();
  const s = useQuery(api.analytics.summary, spaceId ? { spaceId } : "skip");
  const artifacts = useQuery(api.artifacts.list, spaceId ? { spaceId } : "skip");
  const createArtifact = useMutation(api.artifacts.create);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const maxDay = Math.max(1, ...(s?.perDay ?? [1]));

  const stats = s
    ? [
        { label: "Agents online", value: `${s.agents.online}/${s.agents.total}` },
        { label: "Task completion", value: `${Math.round(s.tasks.completionRate * 100)}%` },
        { label: "Events (7d)", value: s.eventsLast7d },
        { label: "Cost (7d)", value: `$${s.costUsd.toFixed(2)}` },
      ]
    : [];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted">
          Throughput, completion, and cost for this Space — what got done.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((st) => (
          <Card key={st.label}>
            <p className="text-sm text-muted">{st.label}</p>
            <p className="mt-1 text-3xl font-semibold">{st.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Activity (last 7 days)</h2>
          <div className="flex h-32 items-end gap-2">
            {(s?.perDay ?? []).map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-accent"
                  style={{ height: `${(n / maxDay) * 100}%`, minHeight: 2 }}
                />
                <span className="text-[10px] text-muted">{n}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Tasks by status</h2>
          <div className="space-y-2">
            {s &&
              Object.entries(s.tasks.byStatus).map(([k, n]) => {
                const count = n as number;
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-24 text-sm capitalize">{k.replace("_", " ")}</span>
                    <div className="h-2 flex-1 rounded-full bg-surface-2">
                      <div
                        className="h-2 rounded-full bg-accent-2"
                        style={{ width: `${s.tasks.total ? (count / s.tasks.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs text-muted">{count}</span>
                  </div>
                );
              })}
          </div>
          <h2 className="mb-2 mt-5 font-semibold">Workflow runs</h2>
          <div className="flex flex-wrap gap-2">
            {s &&
              Object.entries(s.runs.byStatus).map(([k, n]) => (
                <Badge key={k} tone={k === "completed" ? "green" : k === "failed" ? "red" : "default"}>
                  {k}: {n as number}
                </Badge>
              ))}
            {s && s.runs.total === 0 && <span className="text-sm text-muted">No runs yet.</span>}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Agents</h2>
          <ul className="space-y-2">
            {(s?.agentBreakdown ?? []).map((a) => (
              <li key={a.name} className="flex items-center gap-2 text-sm">
                <StatusDot status={a.status} />
                <span className="flex-1 truncate">{a.name}</span>
                <span className="text-xs text-muted">{a.tasks} tasks</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Deliverables</h2>
          </div>
          <div className="mb-3 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://link" />
            <Button
              disabled={!name.trim() || !url.trim()}
              onClick={async () => {
                if (!spaceId || !name.trim() || !url.trim()) return;
                await createArtifact({ spaceId, name: name.trim(), kind: "link", url: url.trim() });
                setName("");
                setUrl("");
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {(artifacts ?? []).map((a) => (
              <li key={a._id} className="flex items-center gap-2 py-2 text-sm">
                <Badge>{a.kind}</Badge>
                {a.downloadUrl ? (
                  <a href={a.downloadUrl} target="_blank" className="flex-1 truncate text-accent" rel="noreferrer">
                    {a.name}
                  </a>
                ) : (
                  <span className="flex-1 truncate">{a.name}</span>
                )}
                <span className="text-xs text-muted">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
            {artifacts?.length === 0 && <li className="py-2 text-sm text-muted">No deliverables yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
