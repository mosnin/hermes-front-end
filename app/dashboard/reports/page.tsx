"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";

export default function ReportsPage() {
  const { spaceId } = useActiveSpace();
  const reports = useQuery(api.reports.list, spaceId ? { spaceId } : "skip");
  const generate = useMutation(api.reports.generate);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted">
            Auto-generated digests of what the Space accomplished. Daily digests
            run automatically; generate one on demand any time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => spaceId && generate({ spaceId, kind: "daily" })}
          >
            Generate daily
          </Button>
          <Button onClick={() => spaceId && generate({ spaceId, kind: "weekly" })}>
            Generate weekly
          </Button>
        </div>
      </div>

      {reports?.length === 0 ? (
        <EmptyState
          title="No reports yet"
          body="Generate a digest now, or wait for the automatic daily run."
        />
      ) : (
        <div className="space-y-3">
          {(reports ?? []).map((r) => (
            <Card key={r._id}>
              <div className="flex items-center justify-between">
                <p className="font-medium">{r.title}</p>
                <div className="flex items-center gap-2">
                  <Badge tone="blue">{r.kind}</Badge>
                  <span className="text-xs text-muted">{timeAgo(r.createdAt)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted">{r.summary}</p>
              <p className="mt-2 text-xs text-muted">
                {new Date(r.periodStart).toLocaleDateString()} –{" "}
                {new Date(r.periodEnd).toLocaleDateString()}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
