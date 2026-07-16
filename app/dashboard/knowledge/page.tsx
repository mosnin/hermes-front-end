"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { FileText, Link2, Plus, Search } from "@/components/icons";

type Memory = {
  _id: string;
  title: string;
  content: string;
  scope: "space" | "company";
  source: string;
  tags?: string[];
};

export default function KnowledgePage() {
  const { spaceId } = useActiveSpace();
  const toast = useToast();
  const all = useQuery(api.memories.list, spaceId ? { spaceId } : "skip");
  const add = useAction(api.memories.add);
  const remove = useAction(api.memories.remove);
  const runSearch = useAction(api.memories.search);
  const ingestUrl = useAction(api.memories.ingestUrl);
  const ingestText = useAction(api.memories.ingestText);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<"space" | "company">("space");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlScope, setUrlScope] = useState<"space" | "company">("space");
  const [urlBusy, setUrlBusy] = useState(false);

  const [docOpen, setDocOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docScope, setDocScope] = useState<"space" | "company">("space");
  const [docBusy, setDocBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Memory[] | null>(null);
  const [searching, setSearching] = useState(false);

  const list = (results ?? all ?? []) as Memory[];

  async function submit() {
    if (!spaceId || !title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await add({
        spaceId,
        title: title.trim(),
        content: content.trim(),
        scope,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setTitle("");
      setContent("");
      setTags("");
      setScope("space");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    if (!spaceId || !query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = (await runSearch({ spaceId, query: query.trim() })) as Memory[];
      setResults(r);
    } finally {
      setSearching(false);
    }
  }

  async function submitUrl() {
    if (!spaceId || !url.trim()) return;
    setUrlBusy(true);
    try {
      await ingestUrl({ spaceId, url: url.trim(), scope: urlScope });
      toast("URL ingested into memory", "success");
      setUrl("");
      setUrlScope("space");
      setUrlOpen(false);
    } catch {
      toast("Could not ingest that URL", "error");
    } finally {
      setUrlBusy(false);
    }
  }

  async function submitDoc() {
    if (!spaceId || !docTitle.trim() || !docContent.trim()) return;
    setDocBusy(true);
    try {
      await ingestText({
        spaceId,
        title: docTitle.trim(),
        content: docContent.trim(),
        scope: docScope,
      });
      toast("Document ingested into memory", "success");
      setDocTitle("");
      setDocContent("");
      setDocScope("space");
      setDocOpen(false);
    } catch {
      toast("Could not ingest that document", "error");
    } finally {
      setDocBusy(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge</h1>
          <p className="text-sm text-muted">
            The shared memory brain. Space-scoped and company-wide context your
            agents retrieve with semantic (vector) search.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setUrlOpen(true)}>
            <Link2 className="h-4 w-4" /> Ingest URL
          </Button>
          <Button variant="outline" onClick={() => setDocOpen(true)}>
            <FileText className="h-4 w-4" /> Ingest document
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add memory
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search memory by meaning…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={search} disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
        {results && (
          <Button
            variant="ghost"
            onClick={() => {
              setResults(null);
              setQuery("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={results ? "No matching memory" : "No memory yet"}
          body={
            results
              ? "Try a different search."
              : "Add company policies, learnings, or context. Agents retrieve it automatically via the context engine."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <Card key={m._id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{m.title}</p>
                <Badge tone={m.scope === "company" ? "blue" : "default"}>
                  {m.scope}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-4 text-xs text-muted">{m.content}</p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  <Badge>{m.source}</Badge>
                  {(m.tags ?? []).map((t) => (
                    <Badge key={t} tone="blue">
                      {t}
                    </Badge>
                  ))}
                </div>
                <button
                  onClick={() =>
                    spaceId && remove({ spaceId, memoryId: m._id as never })
                  }
                  className="text-xs text-muted hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add memory">
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            autoFocus
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="The knowledge / context / policy…"
            rows={6}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as never)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                <option value="space">This Space only</option>
                <option value="company">Company-wide</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Tags</label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="comma, separated"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !title.trim() || !content.trim()}>
              {busy ? "Saving…" : "Save memory"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={urlOpen} onClose={() => setUrlOpen(false)} title="Ingest URL">
        <div className="space-y-4">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitUrl()}
            placeholder="https://example.com/article"
            autoFocus
          />
          <div>
            <label className="mb-1 block text-xs text-muted">Scope</label>
            <select
              value={urlScope}
              onChange={(e) => setUrlScope(e.target.value as never)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="space">This Space only</option>
              <option value="company">Company-wide</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUrlOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitUrl} disabled={urlBusy || !url.trim()}>
              {urlBusy ? "Ingesting…" : "Ingest URL"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title="Ingest document"
      >
        <div className="space-y-4">
          <Input
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Document title"
            autoFocus
          />
          <Textarea
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
            placeholder="Paste the document text…"
            rows={10}
          />
          <div>
            <label className="mb-1 block text-xs text-muted">Scope</label>
            <select
              value={docScope}
              onChange={(e) => setDocScope(e.target.value as never)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="space">This Space only</option>
              <option value="company">Company-wide</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDocOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitDoc}
              disabled={docBusy || !docTitle.trim() || !docContent.trim()}
            >
              {docBusy ? "Ingesting…" : "Ingest document"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
