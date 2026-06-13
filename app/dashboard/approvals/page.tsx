"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { timeAgo } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

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
  const request = useMutation(api.approvals.request);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState("action");

  async function onDecide(approvalId: Id<"approvals">, approve: boolean) {
    if (!spaceId) return;
    try {
      await decide({ spaceId, approvalId, approve });
      toast(approve ? "Approved" : "Rejected", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to decide", "error");
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Approvals</h1>
          <p className="text-sm text-muted">
            Human-in-the-loop gates. Off by default — used only for actions you
            designate high-risk.
          </p>
        </div>
        {canOperate && (
          <Button onClick={() => setOpen(true)}>
            <ShieldCheck className="h-4 w-4" /> Request approval
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs ${
              filter === f.key
                ? "bg-accent text-white"
                : "border border-border text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

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
        <div className="space-y-3">
          {approvals.map((a) => (
            <Card key={a._id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{a.kind}</Badge>
                    <Badge tone={statusTone[a.status] ?? "default"}>
                      {a.status}
                    </Badge>
                    <span className="text-sm font-medium">{a.title}</span>
                  </div>
                  {a.detail && (
                    <p className="mt-2 text-sm text-muted">{a.detail}</p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    {a.requestedBy ? `Requested by ${a.requestedBy}` : "Requested"}
                    {" · "}
                    {timeAgo(a.createdAt)}
                  </p>
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
          ))}
        </div>
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
    </div>
  );
}
