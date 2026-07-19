"use client";

import { ActivityFeed } from "@/components/activity-feed";
import { PageHead, Panel } from "@/components/dash/kit";

export default function ActivityPage() {
  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="activity · this space"
          title="Activity"
          sub="A live, real-time feed of everything your agents do."
        />

        <Panel>
          <ActivityFeed limit={200} />
        </Panel>
      </div>
    </div>
  );
}
