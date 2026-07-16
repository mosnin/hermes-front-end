"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useActiveSpace, useCan } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { Copy, KeyRound, Plus, Terminal } from "@/components/icons";

export default function DeveloperPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const toast = useToast();

  const keys = useQuery(api.apiKeys.list, spaceId ? { spaceId } : "skip");
  const createKey = useAction(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  const site = convexUrl.replace(".convex.cloud", ".convex.site");

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard", "success");
    } catch {
      toast("Could not copy", "error");
    }
  };

  const handleCreate = async () => {
    if (!spaceId || !name.trim()) return;
    setCreating(true);
    try {
      const r = await createKey({ spaceId, name: name.trim() });
      setNewKey(r.key);
      setName("");
      toast("API key created", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create key", "error");
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setOpen(false);
    setNewKey(null);
    setName("");
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Developer</h1>
          <p className="text-sm text-muted">
            API keys to drive the control plane programmatically.
          </p>
        </div>
        {canAdmin && (
          <Button onClick={() => setOpen(true)} disabled={!spaceId}>
            <Plus className="h-4 w-4" />
            Create key
          </Button>
        )}
      </div>

      {/* Keys list */}
      {keys === undefined ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : keys.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          body="Create a key to call the control plane from your own scripts, services, or CI."
          action={
            canAdmin ? (
              <Button onClick={() => setOpen(true)} disabled={!spaceId}>
                <Plus className="h-4 w-4" />
                Create key
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="mb-4 p-0">
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li
                key={k._id}
                className="flex items-center gap-3 px-5 py-3 text-sm"
              >
                <KeyRound className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        k.revoked
                          ? "truncate font-medium text-muted line-through"
                          : "truncate font-medium"
                      }
                    >
                      {k.name}
                    </span>
                    {k.revoked && <Badge tone="red">revoked</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5">
                      {k.prefix}…
                    </code>
                    <span>created {timeAgo(k.createdAt)}</span>
                    <span>
                      last used{" "}
                      {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}
                    </span>
                  </div>
                </div>
                {canAdmin && !k.revoked && (
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={async () => {
                      if (!spaceId) return;
                      try {
                        await revokeKey({
                          spaceId,
                          keyId: k._id as Id<"apiKeys">,
                        });
                        toast("Key revoked", "success");
                      } catch (e) {
                        toast(
                          e instanceof Error ? e.message : "Failed to revoke",
                          "error",
                        );
                      }
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Using your key */}
      <Card>
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted" />
          <h2 className="font-semibold">Using your key</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Pass your key as a bearer token. Keep it secret — anyone with the key
          can act on this Space.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs">
          {`curl -H "Authorization: Bearer hk_..." \\\n  ${site}/api/v1/ping`}
        </pre>
      </Card>

      {/* Create modal */}
      <Modal open={open} onClose={closeModal} title="Create API key">
        {newKey ? (
          <div>
            <p className="text-sm text-amber-400">
              Copy your key now. For security it won&apos;t be shown again.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs">
              {newKey}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => copy(newKey)}>
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button onClick={closeModal}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted">
              Key name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI pipeline"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !name.trim() || !spaceId}
              >
                {creating ? "Creating…" : "Create key"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
