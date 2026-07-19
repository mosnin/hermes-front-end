"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Input, Modal } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { PageHead, PillButton, Panel, ListRow, Dot, SectionLabel } from "@/components/dash/kit";
import { Stagger, StaggerItem } from "@/components/site/motion";

type Transport = "sse" | "http" | "stdio";
type McpScope = "space" | "agent";

const dotTone = {
  connected: "online",
  disconnected: "idle",
  error: "error",
} as const;

/** One-click presets. URLs are placeholders, edit them after prefilling. */
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
    if (!canManage) return;
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
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Build"
          title="MCP servers"
          sub="Plug in existing MCP servers, contact lookup, AgentMail, MiniChat, Calendly, and more, so your agents can use their tools."
          actions={
            <PillButton
              className={!canManage ? "pointer-events-none opacity-50" : undefined}
              onClick={() => openPreset()}
            >
              Add MCP
            </PillButton>
          }
        />

        <div>
          <SectionLabel>common mcp servers</SectionLabel>
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.map((c) => (
              <StaggerItem key={c.name}>
                <Panel
                  title={c.name}
                  action={
                    <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--muted-strong)]">
                      {c.transport}
                    </span>
                  }
                >
                  <p className="text-[13.5px] text-[var(--muted)]">{c.body}</p>
                  <div className="mt-4">
                    <PillButton
                      variant="outline"
                      className={!canManage ? "pointer-events-none opacity-50" : undefined}
                      onClick={() => openPreset(c)}
                    >
                      Add
                    </PillButton>
                  </div>
                </Panel>
              </StaggerItem>
            ))}
            <StaggerItem>
              <Panel title="Custom MCP" tone="band">
                <p className="text-[13.5px] text-[var(--muted)]">Connect any MCP server by URL.</p>
                <div className="mt-4">
                  <PillButton
                    className={!canManage ? "pointer-events-none opacity-50" : undefined}
                    onClick={() => openPreset()}
                  >
                    Add custom
                  </PillButton>
                </div>
              </Panel>
            </StaggerItem>
          </Stagger>
          <p className="mt-4 text-[12.5px] text-[var(--muted)]">
            Preset URLs are placeholders, edit them to your real MCP endpoint before connecting.
          </p>
        </div>

        <div>
          <SectionLabel>connected</SectionLabel>
          {servers === undefined ? (
            <p className="text-[13.5px] text-[var(--muted)]">Loading…</p>
          ) : servers.length === 0 ? (
            <Panel>
              <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">
                No MCP servers yet. Add one from the catalog above, or connect a custom MCP server.
              </p>
            </Panel>
          ) : (
            <Panel>
              <div>
                {servers.map((s) => (
                  <ListRow
                    key={s._id}
                    leading={<Dot tone={dotTone[s.status]} />}
                    title={<span className="font-medium">{s.name}</span>}
                    meta={`${s.transport} · ${s.scope === "agent" ? `agent: ${agentName(s.agentId)}` : "space"} · ${s.url}`}
                    trailing={
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-[var(--muted)]">{s.status}</span>
                        <button
                          className={
                            !canManage || !spaceId
                              ? "pointer-events-none text-[12.5px] text-[var(--muted)] opacity-50"
                              : "text-[12.5px] text-[var(--muted)] transition-colors hover:text-red-500"
                          }
                          onClick={() => spaceId && remove({ spaceId, mcpId: s._id })}
                        >
                          Remove
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <ModalMcpForm
        open={open}
        onClose={() => setOpen(false)}
        form={form}
        setForm={setForm}
        agents={agents ?? []}
        busy={busy}
        onSubmit={submit}
      />
    </div>
  );
}

/* Kept as a small local component so the page body above stays a clean
   read of the editorial layout; behavior and fields are unchanged. */
function ModalMcpForm({
  open,
  onClose,
  form,
  setForm,
  agents,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  form: typeof EMPTY;
  setForm: (f: typeof EMPTY) => void;
  agents: { _id: string; name: string }[];
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add MCP server">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Name</label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="AgentMail"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">URL</label>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://mcp.example.com/sse"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Transport</label>
          <select
            value={form.transport}
            onChange={(e) => setForm({ ...form, transport: e.target.value as Transport })}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="sse">sse</option>
            <option value="http">http</option>
            <option value="stdio">stdio</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Auth header (optional)</label>
          <Input
            value={form.authHeader}
            onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
            placeholder="Bearer sk-…"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Scope</label>
          <select
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value as McpScope })}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="space">Whole space</option>
            <option value="agent">Single agent</option>
          </select>
        </div>
        {form.scope === "agent" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Agent</label>
            <select
              value={form.agentId}
              onChange={(e) => setForm({ ...form, agentId: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <PillButton variant="outline" onClick={onClose}>
            Cancel
          </PillButton>
          <PillButton className={busy ? "pointer-events-none opacity-50" : undefined} onClick={() => !busy && onSubmit()}>
            {busy ? "Connecting…" : "Connect"}
          </PillButton>
        </div>
      </div>
    </Modal>
  );
}
