"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ArrowLeft, Send } from "lucide-react";

export default function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const id = threadId as Id<"threads">;
  const router = useRouter();
  const thread = useQuery(api.threads.get, { threadId: id });
  const messages = useQuery(api.threads.messages, { threadId: id });
  const send = useMutation(api.messages.send);
  const [draft, setDraft] = useState("");

  if (thread === undefined) {
    return <div className="p-8 text-sm text-muted">Loading…</div>;
  }
  if (thread === null) {
    return <div className="p-8 text-sm text-muted">Thread not found.</div>;
  }

  async function submit() {
    if (!draft.trim()) return;
    await send({ threadId: id, role: "user", content: draft.trim() });
    setDraft("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <button
          onClick={() => router.push("/dashboard/threads")}
          className="text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <p className="font-medium">{thread.title}</p>
        </div>
        <Badge tone={thread.status === "active" ? "green" : "default"}>
          {thread.status}
        </Badge>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {(messages ?? []).map((m) => (
          <div
            key={m._id}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                m.role === "user"
                  ? "bg-accent text-white"
                  : "border border-border bg-surface",
              )}
            >
              <p className="mb-1 text-[10px] uppercase tracking-wide opacity-60">
                {m.role}
              </p>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {messages?.length === 0 && (
          <p className="text-center text-sm text-muted">No messages yet.</p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-4">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Message this agent…"
        />
        <Button onClick={submit} disabled={!draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
