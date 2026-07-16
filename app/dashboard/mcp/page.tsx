"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Boxes, Plus, Trash2 } from "@/components/icons";

type Transport = "sse" | "http" | "stdio";
type McpScope = "space" | "agent";

const statusTone = {
  connected: "green",
  disconnected: "default",
  error: "red",
} as const;

/** One-click presets. URLs are placeholders — edit them after prefilling. */
const CATALOG: {
  name: string;
  url: string;
  transport: Transport;
  body: string;
}[] = [
  {
    name: "AgentMail",
    url: "https://mcp.agentmail.to/sse",
    transport: "sse",
    body: "Send and read email from your agents.",
  },
  {
    name: "MiniChat",
    url: "https://mcp.minichat.example/sse",
    transport: "sse",
    body: "Live chat + messaging tools.",
  },
  {
    name: "Calendly",
    url: "https://mcp.calendly.example/http",
    transport: "http",
    body: "Scheduling and availability lookups.",
  },
  {
    name: "Contact Lookup",
    url: "https://mcp.contacts.example/sse",
    transport: "sse",
    body: "Enrich and resolve contact records.",
  },
];

const EMPTY = {
  name: "",
  url: "",
  transport: "sse" as Transport,
  authHeader: "",
  scope: "space" as McpScope,
  agentId: "" as string,
};

export default function McpPage() {
  const { spaceId } = useActiveSpace();
  const canManage = useCan("operator");
  const servers = useQuery(api.mcp.list, spaceId ? { spaceId } : "skip");
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");

  const add = useMutation(api.mcp.add);
  const remove = useMutation(api.mcp.remove);

  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  function openPreset(preset?: (typeof CATALOG)[number]) {
    setForm(
      preset
        ? { ...EMPTY, name: preset.name, url: preset.url, transport: preset.transport }
        : EMPTY,
    );
    setOpen(true);
  }

  async function submit() {
    if (!spaceId) return;
    if (!form.name.trim() || !form.url.trim()) {
      toast("Name and URL are required", "error");
      return;
    }
    if (form.scope === "agent" && !form.agentId) {
      toast("Select an agent for agent scope", "error");
      return;
    }
    setBusy(true);
    try {
      await add({
        spaceId,
        name: form.name.trim(),
        url: form.url.trim(),
        transport: form.transport,
        authHeader: form.authHeader.trim() || undefined,
        scope: form.scope,
        agentId:
          form.scope === "agent"
            ? (form.agentId as Id<"agents">)
            : undefined,
      });
      toast(`Connected ${form.name.trim()}`, "success");
      setOpen(false);
      setForm(EMPTY);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to connect", "error");
    } finally {
      setBusy(false);
    }
  }

  const agentName = (id?: Id<"agents">) =>
    (agents ?? []).find((a) => a._id === id)?.name ?? "agent";

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">MCP servers</h1>
          <p className="text-sm text-muted">
            Plug in existing MCP servers — contact lookup, AgentMail, MiniChat,
            Calendly, and more — so your agents can use their tools.
          </p>
        </div>
        <Button disabled={!canManage} onClick={() => openPreset()}>
          <Plus className="h-4 w-4" />
          Add MCP
        </Button>
      </div>

      <h2 className="mb-3 text-sm font-medium text-muted">Common MCP servers</h2>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATALOG.map((c) => (
          <Card key={c.name}>
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted" />
              <p className="font-medium">{c.name}</p>
              <Badge tone="blue">{c.transport}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{c.body}</p>
            <div className="mt-4">
              <Button
                variant="outline"
                disabled={!canManage}
                onClick={() => openPreset(c)}
              >
                Add
              </Button>
            </div>
          </Card>
        ))}
        <Card>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-muted" />
            <p className="font-medium">Custom MCP</p>
          </div>
          <p className="mt-1 text-sm text-muted">
            Connect any MCP server by URL.
          </p>
          <div className="mt-4">
            <Button disabled={!canManage} onClick={() => openPreset()}>
              Add custom
            </Button>
          </div>
        </Card>
      </div>

      <p className="mb-4 text-xs text-muted">
        Preset URLs are placeholders — edit them to your real MCP endpoint
        before connecting.
      </p>

      <h2 className="mb-3 text-sm font-medium text-muted">Connected</h2>
      {servers === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : servers.length === 0 ? (
        <EmptyState
          title="No MCP servers yet"
          body="Add one from the catalog above, or connect a custom MCP server."
        />
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <Card key={s._id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.name}</p>
                  <Badge tone="blue">{s.transport}</Badge>
                  <Badge>
                    {s.scope === "agent"
                      ? `agent: ${agentName(s.agentId)}`
                      : "space"}
                  </Badge>
                  <Badge tone={statusTone[s.status]}>{s.status}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted">{s.url}</p>
              </div>
              <Button
                variant="ghost"
                disabled={!canManage || !spaceId}
                onClick={() =>
                  spaceId && remove({ spaceId, mcpId: s._id })
                }
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add MCP server">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Name
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="AgentMail"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              URL
            </label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://mcp.example.com/sse"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Transport
            </label>
            <select
              value={form.transport}
              onChange={(e) =>
                setForm({ ...form, transport: e.target.value as Transport })
              }
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="sse">sse</option>
              <option value="http">http</option>
              <option value="stdio">stdio</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Auth header (optional)
            </label>
            <Input
              value={form.authHeader}
              onChange={(e) =>
                setForm({ ...form, authHeader: e.target.value })
              }
              placeholder="Bearer sk-…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Scope
            </label>
            <select
              value={form.scope}
              onChange={(e) =>
                setForm({ ...form, scope: e.target.value as McpScope })
              }
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="space">Whole space</option>
              <option value="agent">Single agent</option>
            </select>
          </div>
          {form.scope === "agent" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Agent
              </label>
              <select
                value={form.agentId}
                onChange={(e) =>
                  setForm({ ...form, agentId: e.target.value })
                }
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <option value="">Select agent…</option>
                {(agents ?? []).map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
