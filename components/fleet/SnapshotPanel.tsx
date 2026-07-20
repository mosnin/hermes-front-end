"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, Input } from "@/components/ui";
import { useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Sparkles } from "@/components/icons";

/**
 * Snapshot this agent's config + toolset into a reusable template (feature 9).
 * Deploying N-like-this happens from the Fleet page's template list.
 */
export function SnapshotPanel({
  spaceId,
  agentId,
  agentName,
}: {
  spaceId: Id<"spaces">;
  agentId: Id<"agents">;
  agentName: string;
}) {
  const canEdit = useCan("operator");
  const toast = useToast();
  const snapshot = useMutation(api.agentOps.snapshotAgent);
  const [name, setName] = useState(`${agentName} template`);
  const [busy, setBusy] = useState(false);

  if (!canEdit) return null;

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-semibold">
        <Sparkles className="h-4 w-4" /> Snapshot &amp; clone
      </h2>
      <p className="mt-1 text-sm text-muted">
        Capture this agent&apos;s model, system prompt, and toolset as a template. Deploy any
        number of new agents from it later on the Fleet page.
      </p>
      <div className="mt-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
        <Button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await snapshot({ spaceId, agentId, name: name.trim() });
              toast("Snapshot saved as a template", "success");
            } catch (e) {
              toast(e instanceof Error ? e.message : "Snapshot failed", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save template"}
        </Button>
      </div>
    </Card>
  );
}
