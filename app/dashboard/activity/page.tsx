"use client";

import { Card } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { Reveal } from "@/components/site/motion";

export default function ActivityPage() {
  return (
    <div className="p-8">
      <Reveal as="div" className="mb-6">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted">
          A live, real-time feed of everything your agents do.
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <Card>
          <ActivityFeed limit={200} />
        </Card>
      </Reveal>
    </div>
  );
}
