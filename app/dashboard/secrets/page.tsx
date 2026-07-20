"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { EmptyState, Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { Copy, KeyRound } from "@/components/icons";
import {
  PageHead,
  PillButton,
  Panel,
  ListRow,
} from "@/components/dash/kit";

function cnDisabled(disabled: boolean): string | undefined {
  return disabled ? "pointer-events-none opacity-45" : undefined;
}

function RevealValue({
  spaceId,
  secretId,
}: {
  spaceId: Id<"spaces">;
  secretId: Id<"secrets">;
}) {
  const toast = useToast();
  // Reveal is a mutation (not a query) so every exposure lands in the audit
  // trail; fire it once on mount and hold the value locally.
  const reveal = useMutation(api.secrets.reveal);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    reveal({ spaceId, secretId })
      .then((r) => {
        if (!cancelled) setValue(r.value);
      })
      .catch(() => {
        if (!cancelled) toast("Could not reveal secret", "error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, secretId]);

  if (value === null) {
    return <span className="text-[12px] text-[var(--muted)]">Revealing…</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <code className="break-all rounded bg-[var(--surface)] px-2 py-1 text-[11.5px] text-[var(--foreground)]">
        {value}
      </code>
      <button
        title="Copy value"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast("Copied secret value", "success");
        }}
        className="text-[var(--muted)] hover:text-[var(--foreground)]"
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

  const addDisabled = !spaceId;
  const saveDisabled = !name.trim() || !value || saving || !spaceId;

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="secrets"
          title="Secrets vault"
          sub="Credentials your agents and integrations use. Values are masked; only admins can manage them."
          actions={
            canAdmin ? (
              <PillButton
                className={cnDisabled(addDisabled)}
                onClick={() => {
                  if (addDisabled) return;
                  setOpen(true);
                }}
              >
                Add secret
              </PillButton>
            ) : undefined
          }
        />

        {!canAdmin ? (
          <Panel tone="band">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-[var(--muted)]" />
              <div>
                <p className="text-[14.5px] font-medium text-[var(--foreground)]">Admins only</p>
                <p className="text-[13px] text-[var(--muted)]">
                  You need the admin role to view and manage this Space&apos;s secrets.
                </p>
              </div>
            </div>
          </Panel>
        ) : (secrets ?? []).length === 0 ? (
          <EmptyState
            title="No secrets yet"
            body="Add API keys, tokens, and other credentials here. Values are masked and only admins can reveal them."
            action={
              <PillButton
                className={cnDisabled(addDisabled)}
                onClick={() => {
                  if (addDisabled) return;
                  setOpen(true);
                }}
              >
                Add secret
              </PillButton>
            }
          />
        ) : (
          <Panel title="Secrets">
            <div>
              {(secrets ?? []).map((s) => {
                const isRevealed = revealId === s._id;
                return (
                  <ListRow
                    key={s._id}
                    title={s.name}
                    meta={`Updated ${timeAgo(s.updatedAt)} · ${s.createdBy}`}
                    trailing={
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isRevealed && spaceId ? (
                          <RevealValue spaceId={spaceId} secretId={s._id} />
                        ) : (
                          <code className="rounded bg-[var(--surface)] px-2 py-1 text-[11.5px] text-[var(--muted)]">
                            {s.preview}
                          </code>
                        )}
                        <PillButton
                          variant="outline"
                          onClick={() => setRevealId(isRevealed ? null : s._id)}
                        >
                          {isRevealed ? "Hide" : "Reveal"}
                        </PillButton>
                        <PillButton
                          variant="outline"
                          className="text-red-600 hover:border-red-300"
                          onClick={() => remove(s._id, s.name)}
                        >
                          Remove
                        </PillButton>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </Panel>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add secret">
        <div className="space-y-4">
          <p className="text-[13.5px] text-[var(--muted)]">
            Stored encrypted at rest in your Space. The value is masked
            everywhere except an explicit admin reveal.
          </p>
          <div>
            <label className="mb-1 block text-[11.5px] text-[var(--muted)]">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. STRIPE_API_KEY"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] text-[var(--muted)]">Value</label>
            <Input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste the secret value"
            />
          </div>
          <div className="flex justify-end gap-2">
            <PillButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </PillButton>
            <PillButton
              className={cnDisabled(saveDisabled)}
              onClick={() => {
                if (saveDisabled) return;
                save();
              }}
            >
              {saving ? "Saving…" : "Save secret"}
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
