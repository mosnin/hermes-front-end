"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Cpu } from "@/components/icons";
import { PageHead, PillButton, Panel, SectionLabel } from "@/components/dash/kit";
import { Stagger, StaggerItem } from "@/components/site/motion";

type ModelPolicy = {
  primary: string;
  fallbacks: string[];
  byCapability?: Record<string, string>;
};

type CapRow = { capability: string; model: string };

export default function ModelsPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const toast = useToast();

  const policy = useQuery(api.router.getPolicy, spaceId ? { spaceId } : "skip");
  const setPolicy = useMutation(api.router.setPolicy);

  const [primary, setPrimary] = useState("");
  const [fallbacks, setFallbacks] = useState("");
  const [caps, setCaps] = useState<CapRow[]>([]);

  useEffect(() => {
    if (!policy) return;
    setPrimary(policy.primary);
    setFallbacks((policy.fallbacks ?? []).join(", "));
    setCaps(
      Object.entries(policy.byCapability ?? {}).map(([capability, model]) => ({
        capability,
        model,
      })),
    );
  }, [policy]);

  const save = async () => {
    if (!spaceId) return;
    const byCapability: Record<string, string> = {};
    for (const row of caps) {
      const key = row.capability.trim();
      const model = row.model.trim();
      if (key && model) byCapability[key] = model;
    }
    const next: ModelPolicy = {
      primary: primary.trim(),
      fallbacks: fallbacks
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      byCapability,
    };
    try {
      await setPolicy({ spaceId, policy: next });
      toast("Model policy saved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save", "error");
    }
  };

  if (!policy) {
    return (
      <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
        <div className="mx-auto max-w-[1120px]">
          <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Build"
          title="Model router"
          sub="Choose the default model, fallback chain, and per-capability overrides. Agents and workflows route through this."
        />

        <Panel tone="band">
          <div className="flex items-center gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--background)] ring-1 ring-inset ring-[var(--border)]">
              <Cpu className="h-5 w-5 text-[var(--muted-strong)]" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] text-[var(--muted)]">Effective primary model</p>
              <p className="truncate font-mono text-[18px] font-medium text-[var(--foreground)]">{policy.primary}</p>
            </div>
          </div>
        </Panel>

        <div>
          <SectionLabel>routing policy</SectionLabel>
          <Panel>
            <p className="mb-5 text-[13.5px] text-[var(--muted)]">
              The primary model is used by default; the fallback chain is tried in order when the primary is
              unavailable.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted">Primary model</label>
                <Input
                  value={primary}
                  disabled={!canAdmin}
                  onChange={(e) => setPrimary(e.target.value)}
                  placeholder="claude-opus-4-8"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Fallback chain (comma-separated)</label>
                <Input
                  value={fallbacks}
                  disabled={!canAdmin}
                  onChange={(e) => setFallbacks(e.target.value)}
                  placeholder="claude-sonnet-4-6, gpt-4o-mini"
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <label className="block text-xs text-muted">Per-capability overrides</label>
                {canAdmin && (
                  <button
                    onClick={() => setCaps([...caps, { capability: "", model: "" }])}
                    className="text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                  >
                    + Add override
                  </button>
                )}
              </div>
              {caps.length === 0 ? (
                <p className="text-[12.5px] text-[var(--muted)]">
                  No overrides, every capability uses the primary model.
                </p>
              ) : (
                <Stagger className="flex flex-col gap-2" gap={0.05}>
                  {caps.map((row, i) => (
                    <StaggerItem key={i} className="flex items-center gap-2">
                      <Input
                        value={row.capability}
                        disabled={!canAdmin}
                        onChange={(e) =>
                          setCaps(caps.map((r, j) => (j === i ? { ...r, capability: e.target.value } : r)))
                        }
                        placeholder="capability (e.g. vision)"
                      />
                      <Input
                        value={row.model}
                        disabled={!canAdmin}
                        onChange={(e) => setCaps(caps.map((r, j) => (j === i ? { ...r, model: e.target.value } : r)))}
                        placeholder="model (e.g. gpt-4o)"
                      />
                      {canAdmin && (
                        <button
                          onClick={() => setCaps(caps.filter((_, j) => j !== i))}
                          aria-label="Remove override"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-red-500"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </div>

            {canAdmin && (
              <div className="mt-6 flex justify-end">
                <PillButton
                  className={!spaceId ? "pointer-events-none opacity-50" : undefined}
                  onClick={() => spaceId && save()}
                >
                  Save policy
                </PillButton>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
