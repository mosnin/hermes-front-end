"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { EmptyState, Input, Modal } from "@/components/ui";
import { MeshGraphic } from "@/components/marketing/graphics";
import { RegisterAgentDialog } from "@/components/register-agent-dialog";
import { useActiveSpace } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { Globe, Plus } from "@/components/icons";
import { PageHead, PillButton, Panel, ListRow, Dot } from "@/components/dash/kit";

/** Map an agent status string to a kit Dot tone. */
function toneFor(status?: string): "online" | "paused" | "idle" | "error" {
  if (status === "online") return "online";
  if (status === "paused") return "paused";
  if (status === "error" || status === "degraded") return "error";
  return "idle";
}

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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="agents"
          title="Agents"
          sub="Every agent connected to this Space."
          actions={
            <>
              <PillButton variant="outline" onClick={() => setExtOpen(true)}>
                <Globe className="h-4 w-4" /> Add external A2A
              </PillButton>
              <PillButton onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Connect agent
              </PillButton>
            </>
          }
        />

        {agents?.length === 0 ? (
          <EmptyState
            graphic={<MeshGraphic />}
            title="No agents connected"
            body="Deploy an agent anywhere, then connect it here to give it threads, tasks, and skills."
            action={<PillButton onClick={() => setOpen(true)}>Connect your first agent</PillButton>}
          />
        ) : (
          <Panel title="Fleet">
            <div>
              {(agents ?? []).map((a) => (
                <ListRow
                  key={a._id}
                  href={`/dashboard/agents/${a._id}`}
                  leading={<Dot tone={toneFor(a.status)} />}
                  title={
                    <>
                      <span className="font-medium">{a.name}</span>{" "}
                      <span className="text-[12.5px] text-[var(--muted)]">{a.platform ?? a.kind ?? "—"}</span>
                    </>
                  }
                  meta={
                    a.description ||
                    ((a.capabilities ?? []).length > 0 ? (a.capabilities ?? []).slice(0, 4).join(", ") : undefined)
                  }
                  trailing={`Last seen ${timeAgo(a.lastHeartbeat)}`}
                />
              ))}
            </div>
          </Panel>
        )}
      </div>

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
            <PillButton variant="outline" onClick={() => setExtOpen(false)}>
              Cancel
            </PillButton>
            <PillButton
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
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
