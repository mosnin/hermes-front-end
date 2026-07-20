"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { CheckCircle2 } from "@/components/icons";
import { useActiveSpace } from "@/components/active-space";

/**
 * Entry point for "save a live agent as a private template" (feature 16 /
 * feature 9 snapshot). marketplace.snapshotAgent has existed since cycle 1
 * with no UI caller anywhere in the app — the marketplace page's own copy
 * promised this ("Save a live agent as a private template from its detail
 * page") but the agent detail page isn't in this team's ownership, so this
 * dialog lives here instead: a self-contained agent picker + snapshot form
 * reachable from the marketplace page itself.
 */
export function SaveAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaceId } = useActiveSpace();
  const agents = useQuery(api.agents.list, spaceId && open ? { spaceId } : "skip") as
    | Doc<"agents">[]
    | undefined;
  const snapshotAgent = useMutation(api.marketplace.snapshotAgent);

  const [agentId, setAgentId] = useState<string>("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  function reset() {
    setAgentId("");
    setName("");
    setTagline("");
    setDescription("");
    setError(null);
    setSavedName(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    if (!spaceId || !agentId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Template name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await snapshotAgent({
        spaceId,
        agentId: agentId as Id<"agents">,
        name: trimmedName,
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
      });
      setSavedName(trimmedName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save template");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Save agent as template">
      {savedName ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
            <div>
              <p className="font-medium text-green-300">Saved as &quot;{savedName}&quot;.</p>
              <p className="mt-1 text-muted">
                It now appears under the &quot;Your Space&quot; tab, private to this Space, and can
                be installed like any other template.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Snapshots the agent&apos;s harness, model, system prompt, and this Space&apos;s skills
            (up to 25) into a private template only this Space can see or install.
          </p>
          {agents === undefined ? (
            <p className="text-sm text-muted">Loading agents…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted">
              This Space has no agents yet — deploy or connect one first, then save it here.
            </p>
          ) : (
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Choose an agent…</option>
              {agents.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                  {a.harness ? ` (${a.harness})` : a.framework ? ` (${a.framework})` : ""}
                </option>
              ))}
            </select>
          )}
          <Input
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="Tagline (optional, one line)"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !agentId}>
              {busy ? "Saving…" : "Save as template"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
