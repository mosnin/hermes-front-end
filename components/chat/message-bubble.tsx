"use client";

import { useState } from "react";
import { ChevronRight, Wrench } from "@/components/icons";
import { cn, timeAgo } from "@/lib/utils";
import { Markdown } from "./markdown";

export type ChatMessage = {
  _id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: unknown;
  createdAt: number;
};

const roleLabels: Record<ChatMessage["role"], string> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
};

function ToolCallCard({ toolCalls }: { toolCalls: unknown }) {
  const [open, setOpen] = useState(false);

  // Best-effort extraction of a tool name.
  let name = "tool call";
  const tc = toolCalls as Record<string, unknown> | undefined;
  if (tc && typeof tc === "object") {
    if (typeof tc.name === "string") name = tc.name;
    else if (Array.isArray(toolCalls) && toolCalls.length) {
      const first = toolCalls[0] as Record<string, unknown>;
      if (first && typeof first.name === "string") name = first.name;
    }
  }

  let pretty = "";
  try {
    pretty = JSON.stringify(toolCalls, null, 2);
  } catch {
    pretty = String(toolCalls);
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted hover:text-foreground"
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
        />
        <Wrench className="h-3.5 w-3.5" />
        <span className="font-mono">{name}</span>
        {!open && <span className="ml-auto opacity-60">show details</span>}
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-border bg-surface px-3 py-2 font-mono text-[0.75rem] leading-relaxed text-foreground">
          <code>{pretty}</code>
        </pre>
      )}
    </div>
  );
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const hasToolCalls =
    message.toolCalls !== undefined && message.toolCalls !== null;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-accent text-white"
            : "border border-border bg-surface text-foreground",
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            className={cn(
              "text-[10px] font-medium uppercase tracking-wide",
              isUser ? "text-white/70" : "text-muted",
            )}
          >
            {roleLabels[message.role]}
          </span>
          <span
            className={cn(
              "text-[10px]",
              isUser ? "text-white/50" : "text-muted/70",
            )}
          >
            {timeAgo(message.createdAt)}
          </span>
        </div>

        {message.content && (
          <Markdown
            content={message.content}
            className={isUser ? "text-white" : undefined}
          />
        )}

        {hasToolCalls && <ToolCallCard toolCalls={message.toolCalls} />}
      </div>
    </div>
  );
}
