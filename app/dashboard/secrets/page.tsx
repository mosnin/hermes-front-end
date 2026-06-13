"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button, Card, EmptyState, Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";

function RevealValue({
  spaceId,
  secretId,
}: {
  spaceId: Id<"spaces">;
  secretId: Id<"secrets">;
}) {
  const toast = useToast();
  const revealed = useQuery(api.secrets.reveal, { spaceId, secretId });
  if (revealed === undefined) {
    return <span className="text-xs text-muted">Revealing…</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <code className="break-all rounded bg-surface-2 px-2 py-1 text-xs">
        {revealed.value}
      </code>
      <button
        title="Copy value"
        onClick={() => {
          navigator.clipboard.writeText(revealed.value);
          toast("Copied secret value", "success");
        }}
        className="text-muted hover:text-foreground"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function SecretsPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const toast = useToast();

  const secrets = useQuery(
    api.secrets.list,
    spaceId && canAdmin ? { spaceId } : "skip",
  );
  const setSecret = useMutation(api.secrets.set);
  const removeSecret = useMutation(api.secrets.remove);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealId, setRevealId] = useState<Id<"secrets"> | null>(null);

  async function save() {
    if (!spaceId || !name.trim() || !value) return;
    setSaving(true);
    try {
      await setSecret({ spaceId, name: name.trim(), value });
      toast(`Saved secret ${name.trim()}`, "success");
      setName("");
      setValue("");
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save secret", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(secretId: Id<"secrets">, secretName: string) {
    if (!spaceId) return;
    try {
      await removeSecret({ spaceId, secretId });
      if (revealId === secretId) setRevealId(null);
      toast(`Removed secret ${secretName}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to remove secret", "error");
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Secrets vault</h1>
          <p className="text-sm text-muted">
            Credentials your agents and integrations use. Values are masked; only
            admins can manage them.
          </p>
        </div>
        {canAdmin && (
          <Button disabled={!spaceId} onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add secret
          </Button>
        )}
      </div>

      {!canAdmin ? (
        <Card>
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-muted" />
            <div>
              <p className="font-medium">Admins only</p>
              <p className="text-sm text-muted">
                You need the admin role to view and manage this Space&apos;s
                secrets.
              </p>
            </div>
          </div>
        </Card>
      ) : (secrets ?? []).length === 0 ? (
        <EmptyState
          title="No secrets yet"
          body="Add API keys, tokens, and other credentials here. Values are masked and only admins can reveal them."
          action={
            <Button disabled={!spaceId} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Add secret
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {(secrets ?? []).map((s) => {
            const isRevealed = revealId === s._id;
            return (
              <Card key={s._id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted">
                      Updated {timeAgo(s.updatedAt)} · {s.createdBy}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {isRevealed && spaceId ? (
                      <RevealValue spaceId={spaceId} secretId={s._id} />
                    ) : (
                      <code className="rounded bg-surface-2 px-2 py-1 text-xs text-muted">
                        {s.preview}
                      </code>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setRevealId(isRevealed ? null : s._id)}
                    >
                      {isRevealed ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Reveal
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => remove(s._id, s.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add secret">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Stored encrypted at rest in your Space. The value is masked
            everywhere except an explicit admin reveal.
          </p>
          <div>
            <label className="mb-1 block text-xs text-muted">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. STRIPE_API_KEY"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Value</label>
            <Input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste the secret value"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || !value || saving || !spaceId}
              onClick={save}
            >
              {saving ? "Saving…" : "Save secret"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
