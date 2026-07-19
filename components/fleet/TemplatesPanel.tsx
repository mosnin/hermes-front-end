"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal } from "@/components/ui";
import { useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Rocket, Sparkles, Trash2 } from "@/components/icons";

type Template = {
  _id: Id<"agentTemplates">;
  spaceId?: Id<"spaces"> | null;
  name: string;
  visibility: "public" | "space";
  suggestedModel?: string;
  installCount?: number;
};

/** Templates (curated public + this Space's snapshots) with deploy-N-like-this (feature 9). */
export function TemplatesPanel({ spaceId }: { spaceId: Id<"spaces"> }) {
  const canOperate = useCan("operator");
  const toast = useToast();
  const templates = useQuery(api.agentOps.listTemplates, { spaceId });
  const removeTemplate = useMutation(api.agentOps.removeTemplate);
  const deployFromTemplate = useAction(api.agentOps.deployFromTemplate);

  const [target, setTarget] = useState<{ id: Id<"agentTemplates">; name: string } | null>(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<{ name: string; token: string }[] | null>(null);

  async function submitDeploy() {
    if (!target) return;
    setBusy(true);
    setTokens(null);
    try {
      const res = await deployFromTemplate({
        spaceId,
        templateId: target.id,
        count: Math.max(1, Math.min(count, 25)),
      });
      if (res.cloudflare) {
        toast(`Deployed ${res.deployed.length} agent(s) from "${target.name}"`, "success");
        setTarget(null);
      } else {
        setTokens(
          (res.deployed as { agentId: string; name: string; token: string }[]).map((d) => ({
            name: d.name,
            token: d.token,
          })),
        );
        toast("Agents created, Cloudflare not configured — connect manually", "info");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Deploy failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Sparkles className="h-4 w-4" /> Agent templates
      </h2>
      <p className="mb-3 text-sm text-muted">
        Snapshots of your own agents plus curated starting points. Deploy any number of new
        agents stamped from one.
      </p>
      {templates === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          body="Snapshot an agent from its detail page to create your first template."
        />
      ) : (
        <ul className="divide-y divide-border">
          {(templates as Template[]).map((t) => (
            <li key={t._id} className="flex items-center gap-3 py-2">
              <span className="flex-1 truncate text-sm">{t.name}</span>
              {t.visibility === "public" && <Badge tone="blue">public</Badge>}
              {t.suggestedModel && <Badge>{t.suggestedModel}</Badge>}
              {typeof t.installCount === "number" && t.installCount > 0 && (
                <Badge tone="green">{t.installCount} deployed</Badge>
              )}
              {canOperate && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setTarget({ id: t._id, name: t.name });
                    setCount(1);
                  }}
                >
                  <Rocket className="h-4 w-4" /> Deploy
                </Button>
              )}
              {canOperate && t.spaceId && (
                <button
                  onClick={async () => {
                    try {
                      await removeTemplate({ spaceId, templateId: t._id });
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Remove failed", "error");
                    }
                  }}
                  className="text-muted hover:text-red-400"
                  title="Remove template"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!target}
        onClose={() => {
          setTarget(null);
          setTokens(null);
        }}
        title={`Deploy from "${target?.name ?? ""}"`}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted">How many</label>
            <Input
              type="number"
              min={1}
              max={25}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>

          {tokens && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-2 text-xs text-amber-300">
                Cloudflare isn&apos;t configured, connect these agents manually with their
                one-time tokens:
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-surface-2 p-2 text-[11px]">
                {tokens.map((t) => `${t.name}: ${t.token}`).join("\n")}
              </pre>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Close
            </Button>
            <Button onClick={submitDeploy} disabled={busy}>
              {busy ? "Deploying…" : "Deploy"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
