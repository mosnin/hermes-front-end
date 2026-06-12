"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, Input, Modal } from "./ui";
import { Check, Copy } from "lucide-react";
import { useActiveSpace } from "./active-space";

/**
 * The "connect an agent" flow. Creating an agent returns a one-time connector
 * token; we show the exact env config the user drops into their deployed agent.
 */
export function RegisterAgentDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createAgent = useAction(api.agents.create);
  const { spaceId } = useActiveSpace();
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://<your-convex-deployment>";
  // Convex HTTP actions are served from the .convex.site domain.
  const httpUrl = convexUrl.replace(".convex.cloud", ".convex.site");

  async function submit() {
    if (!name.trim() || !spaceId) return;
    setBusy(true);
    try {
      const res = await createAgent({
        spaceId,
        name: name.trim(),
        platform: platform.trim() || undefined,
      });
      setResult({ token: res.token });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName("");
    setPlatform("");
    setResult(null);
    setCopied(false);
    onClose();
  }

  const envBlock = result
    ? `HERMES_CONTROL_PLANE_URL=${httpUrl}\nHERMES_CONNECTOR_TOKEN=${result.token}`
    : "";

  return (
    <Modal open={open} onClose={reset} title="Connect an agent">
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Register a Hermes agent you&apos;ve deployed (AWS, local, anywhere).
            You&apos;ll get a one-time token to paste into its connector config.
          </p>
          <div>
            <label className="mb-1 block text-xs text-muted">Agent name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Research Agent"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Platform (optional)
            </label>
            <Input
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="aws / local / fly / gcp"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create token"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Copy this into your agent&apos;s connector environment. This token is
            shown <span className="text-foreground">only once</span>.
          </p>
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs">
              {envBlock}
            </pre>
            <Button
              variant="outline"
              className="absolute right-2 top-2 px-2 py-1"
              onClick={() => {
                navigator.clipboard.writeText(envBlock);
                setCopied(true);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted">
            Then run the connector from <code>connector/control_plane</code> (see
            its README). The agent will appear here as soon as it checks in.
          </p>
          <div className="flex justify-end">
            <Button onClick={reset}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
