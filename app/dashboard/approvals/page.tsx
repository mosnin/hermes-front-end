"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Textarea,
  Toggle,
} from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { ShieldCheck, Settings, ChevronDown, ChevronRight, Check, X } from "@/components/icons";
import { Reveal, Stagger, StaggerItem } from "@/components/site/motion";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
] as const;

const statusTone: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  pending: "yellow",
  approved: "green",
  rejected: "red",
};

const riskTone: Record<string, "default" | "green" | "yellow" | "red" | "blue"> = {
  low: "blue",
  medium: "yellow",
  high: "red",
};

function PreviewDiff({ preview }: { preview: unknown }) {
  if (preview === undefined || preview === null) return null;
  if (
    typeof preview === "object" &&
    preview !== null &&
    ("before" in (preview as Record<string, unknown>) ||
      "after" in (preview as Record<string, unknown>))
  ) {
    const { before, after } = preview as { before?: unknown; after?: unknown };
    return (
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-red-50 p-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-red-700">
            Before
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted">
            {typeof before === "string" ? before : JSON.stringify(before, null, 2) ?? "—"}
          </pre>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
            After
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-muted">
            {typeof after === "string" ? after : JSON.stringify(after, null, 2) ?? "—"}
          </pre>
        </div>
      </div>
    );
  }
  return (
    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 p-2 text-xs text-muted">
      {typeof preview === "string" ? preview : JSON.stringify(preview, null, 2)}
    </pre>
  );
}

function NotificationPrefsPanel({ onClose }: { onClose: () => void }) {
  const { spaceId } = useActiveSpace();
  const toast = useToast();
  const prefs = useQuery(api.notifications.getPrefs, spaceId ? { spaceId } : "skip");
  const setPrefs = useMutation(api.notifications.setPrefs);
  const testDeliver = useAction(api.notifications.testDeliver);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (prefs === undefined || hydrated) return;
    setHydrated(true);
    if (prefs) {
      setEmailEnabled(!!prefs.emailEnabled);
      setEmailAddress(prefs.emailAddress ?? "");
      setWebhookEnabled(!!prefs.webhookEnabled);
      setWebhookUrl(prefs.webhookUrl ?? "");
    }
  }, [prefs, hydrated]);

  async function save() {
    if (!spaceId) return;
    setSaving(true);
    try {
      await setPrefs({
        spaceId,
        emailEnabled,
        emailAddress: emailAddress.trim() || undefined,
        webhookEnabled,
        webhookUrl: webhookUrl.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
        categories: ["approval"],
      });
      setWebhookSecret("");
      toast("Notification preferences saved", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!spaceId) return;
    setTesting(true);
    try {
      const res = await testDeliver({ spaceId });
      const parts: string[] = [];
      if (res.email) parts.push(`email: ${res.email}`);
      if (res.webhook) parts.push(`webhook: ${res.webhook}`);
      toast(parts.length ? parts.join(" · ") : "No channels enabled", parts.length ? "success" : "error");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Test failed", "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Approval delivery channels">
      <div className="space-y-5">
        <p className="text-xs text-muted">
          Choose how you're notified when an approval needs your decision, in
          addition to the in-app bell. Emails and webhook pushes include
          one-click approve/deny links.
        </p>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <Toggle checked={emailEnabled} onChange={setEmailEnabled} label="Email" />
          {emailEnabled && (
            <Input
              placeholder="you@company.com"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <Toggle checked={webhookEnabled} onChange={setWebhookEnabled} label="Webhook" />
          {webhookEnabled && (
            <>
              <Input
                placeholder="https://example.com/hooks/cadre"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
              <Input
                placeholder={
                  prefs?.hasWebhookSecret
                    ? "•••••••• (set, leave blank to keep)"
                    : "Signing secret (HMAC-SHA256, optional)"
                }
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
              />
              <p className="text-[11px] text-muted">
                Payloads are signed as{" "}
                <code className="text-foreground">X-Cadre-Signature: sha256=&lt;hmac&gt;</code>{" "}
                when a secret is set.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? "Sending…" : "Send test"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function ApprovalsPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const canOperate = useCan("operator");
  const toast = useToast();

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const approvals = useQuery(
    api.approvals.list,
    spaceId
      ? { spaceId, status: filter === "all" ? undefined : filter }
      : "skip",
  );

  const decide = useMutation(api.approvals.decide);
  const bulkDecide = useMutation(api.approvals.bulkDecide);
  const request = useMutation(api.approvals.request);

  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState("action");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<Id<"approvals">>>(new Set());

  const pendingIds = useMemo(
    () => (approvals ?? []).filter((a) => a.status === "pending").map((a) => a._id),
    [approvals],
  );
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  function toggleSelect(id: Id<"approvals">) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allPendingSelected ? new Set() : new Set(pendingIds));
  }

  async function onDecide(approvalId: Id<"approvals">, approve: boolean) {
    if (!spaceId) return;
    try {
      await decide({ spaceId, approvalId, approve });
      toast(approve ? "Approved" : "Rejected", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to decide", "error");
    }
  }

  async function onBulkDecide(approve: boolean) {
    if (!spaceId || selected.size === 0) return;
    try {
      const res = await bulkDecide({
        spaceId,
        approvalIds: Array.from(selected),
        approve,
      });
      toast(
        `${approve ? "Approved" : "Rejected"} ${res.succeeded}${
          res.failed.length ? `, ${res.failed.length} skipped` : ""
        }`,
        "success",
      );
      setSelected(new Set());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Bulk action failed", "error");
    }
  }

  async function submit() {
    if (!title.trim() || !spaceId) return;
    try {
      await request({
        spaceId,
        kind: kind.trim() || "action",
        title: title.trim(),
        detail: detail.trim() || undefined,
      });
      toast("Approval requested", "success");
      setTitle("");
      setDetail("");
      setKind("action");
      setOpen(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to request", "error");
    }
  }

  return (
    <div className="p-8">
      <Reveal as="div" className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Approvals</h1>
          <p className="text-sm text-muted">
            Human-in-the-loop gates. Off by default, used only for actions you
            designate high-risk.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPrefsOpen(true)}>
            <Settings className="h-4 w-4" /> Notifications
          </Button>
          {canOperate && (
            <Button onClick={() => setOpen(true)}>
              <ShieldCheck className="h-4 w-4" /> Request approval
            </Button>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.06} className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                filter === f.key
                  ? "bg-accent text-white"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {pendingIds.length > 0 && canAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-muted hover:text-foreground"
            >
              {allPendingSelected ? "Deselect all" : `Select all pending (${pendingIds.length})`}
            </button>
            {selected.size > 0 && (
              <>
                <Badge>{selected.size} selected</Badge>
                <Button
                  variant="primary"
                  className="bg-emerald-500/90 hover:bg-emerald-500"
                  onClick={() => onBulkDecide(true)}
                >
                  <Check className="h-4 w-4" /> Approve selected
                </Button>
                <Button variant="danger" onClick={() => onBulkDecide(false)}>
                  <X className="h-4 w-4" /> Reject selected
                </Button>
              </>
            )}
          </div>
        )}
      </Reveal>

      {approvals === undefined ? (
        <Card>
          <p className="text-sm text-muted">Loading…</p>
        </Card>
      ) : approvals.length === 0 ? (
        <EmptyState
          title="No approvals here"
          body="When an agent or workflow hits a gate you marked high-risk, it pauses here for a human decision."
        />
      ) : (
        <Stagger className="space-y-3" gap={0.06}>
          {approvals.map((a) => {
            const isExpanded = !!expanded[a._id];
            const hasPreview = a.preview !== undefined && a.preview !== null;
            return (
              <StaggerItem key={a._id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {a.status === "pending" && canAdmin && (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 accent-accent"
                        checked={selected.has(a._id)}
                        onChange={() => toggleSelect(a._id)}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{a.kind}</Badge>
                        <Badge tone={statusTone[a.status] ?? "default"}>{a.status}</Badge>
                        {a.riskLevel && (
                          <Badge tone={riskTone[a.riskLevel] ?? "default"}>
                            {a.riskLevel} risk
                          </Badge>
                        )}
                        {a.deliveredChannels && a.deliveredChannels.length > 0 && (
                          <Badge tone="blue">via {a.deliveredChannels.join(", ")}</Badge>
                        )}
                        <span className="text-sm font-medium">{a.title}</span>
                      </div>
                      {a.detail && <p className="mt-2 text-sm text-muted">{a.detail}</p>}
                      {hasPreview && (
                        <button
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [a._id]: !prev[a._id] }))
                          }
                          className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          {isExpanded ? "Hide" : "View"} preview
                        </button>
                      )}
                      {isExpanded && hasPreview && <PreviewDiff preview={a.preview} />}
                      <p className="mt-2 text-xs text-muted">
                        {a.requestedBy ? `Requested by ${a.requestedBy}` : "Requested"}
                        {" · "}
                        {timeAgo(a.createdAt)}
                        {a.status === "pending" && a.expiresAt && (
                          <>
                            {" · "}
                            {a.expiresAt < Date.now()
                              ? "expired"
                              : `expires ${timeAgo(a.expiresAt)}`}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  {a.status === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="primary"
                        className="bg-emerald-500/90 hover:bg-emerald-500"
                        disabled={!canAdmin}
                        onClick={() => onDecide(a._id, true)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        disabled={!canAdmin}
                        onClick={() => onDecide(a._id, false)}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Request approval">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Kind</label>
            <Input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="action"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs a human decision?"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Detail</label>
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Add context for the approver…"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!title.trim()}>
              Request
            </Button>
          </div>
        </div>
      </Modal>

      {prefsOpen && <NotificationPrefsPanel onClose={() => setPrefsOpen(false)} />}
    </div>
  );
}
