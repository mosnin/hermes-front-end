"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, Input, Modal } from "./ui";
import { Check, Copy } from "@/components/icons";
import { useActiveSpace } from "./active-space";
import { cn } from "@/lib/utils";

const FRAMEWORKS = [
  { id: "hermes", label: "Hermes", hint: "Built-in LLM runtime + MCP tools" },
  { id: "openclaw", label: "OpenClaw", hint: "OpenClaw CLI adapter" },
  { id: "goose", label: "Goose", hint: "Block's Goose CLI adapter" },
  { id: "cli", label: "Any CLI", hint: "Your own command" },
];

/**
 * The "connect an agent" flow. Creating an agent returns a one-time connector
 * token; we show the exact env config the user drops into their deployed agent
 * — tailored to the framework they picked.
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
  const [framework, setFramework] = useState("hermes");
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
        framework,
      });
      setResult({ token: res.token });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setName("");
    setPlatform("");
    setFramework("hermes");
    setResult(null);
    setCopied(false);
    onClose();
  }

  const envLines = [
    `HERMES_CONTROL_PLANE_URL=${httpUrl}`,
    `HERMES_CONNECTOR_TOKEN=${result?.token ?? ""}`,
  ];
  if (framework !== "hermes") {
    envLines.push(`HERMES_AGENT_FRAMEWORK=${framework}`);
  }
  if (framework === "cli") {
    envLines.push(`HERMES_AGENT_COMMAND='my-agent --task {instruction}'`);
  }
  const envBlock = envLines.join("\n");

  return (
    <Modal open={open} onClose={reset} title="Connect an agent">
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Register an agent you&apos;ve deployed (AWS, local, anywhere).
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
            <label className="mb-1 block text-xs text-muted">Framework</label>
            <div className="grid grid-cols-2 gap-2">
              {FRAMEWORKS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFramework(f.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition",
                    framework === f.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface-2 hover:border-muted",
                  )}
                >
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-[11px] text-muted">{f.hint}</p>
                </button>
              ))}
            </div>
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
            Then run <code>python -m connector.control_plane.agent_runtime</code>
            {framework !== "hermes" && (
              <> — it will drive your {FRAMEWORKS.find((f) => f.id === framework)?.label} agent via its CLI</>
            )}
            . The agent appears here as soon as it checks in.
          </p>
          <div className="flex justify-end">
            <Button onClick={reset}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
