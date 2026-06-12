"use client";

import { Card } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";

export default function ActivityPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted">
          A live, real-time feed of everything your agents do.
        </p>
      </div>
      <Card>
        <ActivityFeed limit={200} />
      </Card>
    </div>
  );
}
