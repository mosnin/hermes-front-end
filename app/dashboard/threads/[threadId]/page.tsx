"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import {
  MessageBubble,
  type ChatMessage,
} from "@/components/chat/message-bubble";
import { Markdown } from "@/components/chat/markdown";
import { ArrowLeft, Brain, Send, Square } from "@/components/icons";
import { Reveal } from "@/components/site/motion";
import { PillButton, Dot } from "@/components/dash/kit";

export default function ThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = use(params);
  const id = threadId as Id<"threads">;
  const router = useRouter();
  const toast = useToast();
  const { spaceId } = useActiveSpace();

  const thread = useQuery(
    api.threads.get,
    spaceId ? { spaceId, threadId: id } : "skip",
  );
  const messages = useQuery(
    api.threads.messages,
    spaceId ? { spaceId, threadId: id } : "skip",
  );
  const send = useMutation(api.messages.send);
  const ingest = useAction(api.memories.ingestThread);

  // The most recent non-finalized stream for this thread (null when idle).
  const activeStreamId = useQuery(
    api.streaming.activeStream,
    spaceId ? { spaceId, threadId: id } : "skip",
  );
  // Live chunks for the active stream — Convex reactivity pushes new tokens.
  const streamChunks = useQuery(
    api.streaming.chunks,
    spaceId && activeStreamId
      ? { spaceId, streamId: activeStreamId }
      : "skip",
  );

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom whenever messages change or new stream chunks land.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamChunks]);

  // Grow textarea with content.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [draft]);

  if (thread === undefined) {
    return <div className="p-8 text-[13.5px] text-muted">Loading…</div>;
  }
  if (thread === null) {
    return <div className="p-8 text-[13.5px] text-muted">Thread not found.</div>;
  }

  async function submit() {
    const content = draft.trim();
    if (!content || !spaceId || sending) return;
    setSending(true);
    setDraft("");
    try {
      await send({ spaceId, threadId: id, role: "user", content });
    } catch {
      // Restore the draft so the user doesn't lose their message.
      setDraft(content);
      toast("Failed to send message", "error");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function saveToMemory() {
    if (!spaceId || saving) return;
    setSaving(true);
    try {
      await ingest({ spaceId, threadId: id });
      toast("Saved to memory", "success");
    } catch {
      toast("Failed to save to memory", "error");
    } finally {
      setSaving(false);
    }
  }

  const list = (messages ?? []) as ChatMessage[];

  // Concatenated text of the in-flight reply. We show the typing bubble while
  // chunks exist and none has been marked done (the connector sends done on the
  // final chunk; finalizeStream then deletes the rows and the message lands).
  const streamText = (streamChunks ?? []).map((c) => c.text).join("");
  const streaming =
    !!streamChunks &&
    streamChunks.length > 0 &&
    !streamChunks.some((c) => c.done);

  return (
    <div className="flex h-full flex-col">
      <Reveal as="div" y={-8} duration={0.4} className="flex items-center gap-3 border-b border-[var(--border)] p-4">
        <button
          onClick={() => router.push("/dashboard/threads")}
          className="text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center gap-2.5">
          <Dot tone={thread.status === "active" ? "online" : thread.status === "archived" ? "paused" : "idle"} />
          <p className="text-[14.5px] font-medium text-foreground">{thread.title}</p>
          <span className="text-[12.5px] text-muted">{thread.status}</span>
        </div>
        <PillButton
          variant="outline"
          onClick={saveToMemory}
          className={saving ? "pointer-events-none opacity-60" : undefined}
        >
          <Brain className="h-4 w-4" /> {saving ? "Saving…" : "Save to memory"}
        </PillButton>
      </Reveal>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
        {list.map((m) => (
          <MessageBubble key={m._id} message={m} />
        ))}
        {messages?.length === 0 && !streaming && (
          <p className="text-center text-sm text-muted">No messages yet.</p>
        )}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[78%] rounded-2xl border border-border bg-surface px-4 py-2.5 text-foreground">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Assistant
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-muted/70">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                  typing…
                </span>
              </div>
              {streamText && <Markdown content={streamText} />}
            </div>
          </div>
        )}
        {sending && !streaming && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                Sending…
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message this agent…  (Enter to send, Shift+Enter for newline)"
            className={cn(
              "w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent",
              "max-h-[200px] min-h-[2.5rem]",
            )}
          />
          {sending ? (
            <PillButton variant="outline" onClick={() => setSending(false)}>
              <Square className="h-4 w-4" /> Stop
            </PillButton>
          ) : (
            <PillButton onClick={submit} className={!draft.trim() ? "pointer-events-none opacity-50" : undefined}>
              <Send className="h-4 w-4" />
            </PillButton>
          )}
        </div>
      </div>
    </div>
  );
}
