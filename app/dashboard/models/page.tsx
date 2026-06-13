"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, Card, Input } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Cpu, Plus, X } from "lucide-react";

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

  const policy = useQuery(
    api.router.getPolicy,
    spaceId ? { spaceId } : "skip",
  );
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

  if (!policy) return <div className="p-8 text-sm text-muted">Loading…</div>;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Model router</h1>
        <p className="text-sm text-muted">
          Choose the default model, fallback chain, and per-capability
          overrides. Agents and workflows route through this.
        </p>
      </div>

      {/* Effective primary */}
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-muted" />
          <div>
            <p className="text-xs text-muted">Effective primary model</p>
            <p className="font-mono text-lg font-semibold">
              {policy.primary}
            </p>
          </div>
        </div>
      </Card>

      {/* Editor */}
      <Card className="mb-4">
        <h2 className="mb-1 font-semibold">Routing policy</h2>
        <p className="mb-4 text-sm text-muted">
          The primary model is used by default; the fallback chain is tried in
          order when the primary is unavailable.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">
              Primary model
            </label>
            <Input
              value={primary}
              disabled={!canAdmin}
              onChange={(e) => setPrimary(e.target.value)}
              placeholder="claude-opus-4-8"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Fallback chain (comma-separated)
            </label>
            <Input
              value={fallbacks}
              disabled={!canAdmin}
              onChange={(e) => setFallbacks(e.target.value)}
              placeholder="claude-sonnet-4-6, gpt-4o-mini"
            />
          </div>
        </div>

        {/* Per-capability overrides */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-xs text-muted">
              Per-capability overrides
            </label>
            {canAdmin && (
              <button
                onClick={() =>
                  setCaps([...caps, { capability: "", model: "" }])
                }
                className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Add override
              </button>
            )}
          </div>
          {caps.length === 0 ? (
            <p className="text-xs text-muted">
              No overrides — every capability uses the primary model.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {caps.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.capability}
                    disabled={!canAdmin}
                    onChange={(e) =>
                      setCaps(
                        caps.map((r, j) =>
                          j === i
                            ? { ...r, capability: e.target.value }
                            : r,
                        ),
                      )
                    }
                    placeholder="capability (e.g. vision)"
                  />
                  <Input
                    value={row.model}
                    disabled={!canAdmin}
                    onChange={(e) =>
                      setCaps(
                        caps.map((r, j) =>
                          j === i ? { ...r, model: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="model (e.g. gpt-4o)"
                  />
                  {canAdmin && (
                    <button
                      onClick={() =>
                        setCaps(caps.filter((_, j) => j !== i))
                      }
                      className="text-muted hover:text-red-400"
                      aria-label="Remove override"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {canAdmin && (
          <div className="mt-6 flex justify-end">
            <Button onClick={save} disabled={!spaceId}>
              Save policy
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
