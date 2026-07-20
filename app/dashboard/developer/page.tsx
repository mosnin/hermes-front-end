"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, EmptyState, Input, Modal } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useActiveSpace, useCan } from "@/components/active-space";
import { timeAgo } from "@/lib/utils";
import { KeyRound, Terminal } from "@/components/icons";
import {
  PageHead,
  PillButton,
  Panel,
  ListRow,
} from "@/components/dash/kit";

function cnDisabled(disabled: boolean): string | undefined {
  return disabled ? "pointer-events-none opacity-45" : undefined;
}

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

  const handleRevoke = async (keyId: Id<"apiKeys">) => {
    if (!spaceId) return;
    try {
      await revokeKey({ spaceId, keyId });
      toast("Key revoked", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to revoke", "error");
    }
  };

  const closeModal = () => {
    setOpen(false);
    setNewKey(null);
    setName("");
  };

  const createDisabled = !spaceId;
  const submitDisabled = creating || !name.trim() || !spaceId;

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="developer"
          title="Developer"
          sub="API keys to drive the control plane programmatically."
          actions={
            canAdmin ? (
              <PillButton
                className={cnDisabled(createDisabled)}
                onClick={() => {
                  if (createDisabled) return;
                  setOpen(true);
                }}
              >
                Create key
              </PillButton>
            ) : undefined
          }
        />

        {keys === undefined ? (
          <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
        ) : keys.length === 0 ? (
          <EmptyState
            title="No API keys yet"
            body="Create a key to call the control plane from your own scripts, services, or CI."
            action={
              canAdmin ? (
                <PillButton
                  className={cnDisabled(createDisabled)}
                  onClick={() => {
                    if (createDisabled) return;
                    setOpen(true);
                  }}
                >
                  Create key
                </PillButton>
              ) : undefined
            }
          />
        ) : (
          <Panel title="API keys">
            <div>
              {keys.map((k) => (
                <ListRow
                  key={k._id}
                  leading={<KeyRound className="h-4 w-4" />}
                  title={
                    <span className={k.revoked ? "text-[var(--muted)] line-through" : undefined}>
                      {k.name}
                    </span>
                  }
                  meta={`${k.prefix}… · created ${timeAgo(k.createdAt)} · last used ${k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}`}
                  trailing={
                    k.revoked ? (
                      <Badge tone="red">revoked</Badge>
                    ) : canAdmin ? (
                      <PillButton
                        variant="outline"
                        onClick={() => handleRevoke(k._id as Id<"apiKeys">)}
                      >
                        Revoke
                      </PillButton>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Using your key">
          <div className="flex items-center gap-2 text-[13.5px] text-[var(--muted)]">
            <Terminal className="h-4 w-4" />
            <span>
              Pass your key as a bearer token. Keep it secret, anyone with the
              key can act on this Space.
            </span>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
            {`curl -H "Authorization: Bearer hk_..." \\\n  ${site}/api/v1/ping`}
          </pre>
        </Panel>
      </div>

      <Modal open={open} onClose={closeModal} title="Create API key">
        {newKey ? (
          <div>
            <p className="text-[13.5px] text-amber-700">
              Copy your key now. For security it won&apos;t be shown again.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--surface)] p-3 text-xs text-[var(--foreground)]">
              {newKey}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <PillButton variant="outline" onClick={() => copy(newKey)}>
                Copy
              </PillButton>
              <PillButton onClick={closeModal}>Done</PillButton>
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[11.5px] text-[var(--muted)]">Key name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI pipeline"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <PillButton variant="outline" onClick={closeModal}>
                Cancel
              </PillButton>
              <PillButton
                className={cnDisabled(submitDisabled)}
                onClick={() => {
                  if (submitDisabled) return;
                  handleCreate();
                }}
              >
                {creating ? "Creating…" : "Create key"}
              </PillButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
