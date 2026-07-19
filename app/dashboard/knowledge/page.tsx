"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Search } from "@/components/icons";
import { PageHead, PillButton, Panel, ListRow, SectionLabel } from "@/components/dash/kit";

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

  const canSubmit = !busy && !!title.trim() && !!content.trim();
  const canSubmitUrl = !urlBusy && !!url.trim();
  const canSubmitDoc = !docBusy && !!docTitle.trim() && !!docContent.trim();

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Build"
          title="Knowledge"
          sub="The shared memory brain. Space-scoped and company-wide context your agents retrieve with semantic (vector) search."
          actions={
            <>
              <PillButton variant="outline" onClick={() => setUrlOpen(true)}>
                Ingest URL
              </PillButton>
              <PillButton variant="outline" onClick={() => setDocOpen(true)}>
                Ingest document
              </PillButton>
              <PillButton onClick={() => setOpen(true)}>Add memory</PillButton>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search memory by meaning…"
              className="rounded-full pl-10"
            />
          </div>
          <PillButton variant="outline" onClick={search}>
            {searching ? "Searching…" : "Search"}
          </PillButton>
          {results && (
            <PillButton
              variant="outline"
              onClick={() => {
                setResults(null);
                setQuery("");
              }}
            >
              Clear
            </PillButton>
          )}
        </div>

        <div>
          <SectionLabel>{results ? "search results" : "memory"}</SectionLabel>
          {list.length === 0 ? (
            <Panel>
              <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">
                {results
                  ? "No matching memory. Try a different search."
                  : "Add company policies, learnings, or context. Agents retrieve it automatically via the context engine."}
              </p>
            </Panel>
          ) : (
            <Panel>
              <div>
                {list.map((m) => (
                  <ListRow
                    key={m._id}
                    leading={m.scope === "company" ? "CO" : "SP"}
                    title={<span className="font-medium">{m.title}</span>}
                    meta={[m.content, m.source, ...(m.tags ?? [])].filter(Boolean).join(" · ")}
                    trailing={
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--muted-strong)]">
                          {m.scope}
                        </span>
                        <button
                          onClick={() => spaceId && remove({ spaceId, memoryId: m._id as never })}
                          className="text-[12.5px] text-[var(--muted)] transition-colors hover:text-red-500"
                        >
                          Delete
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
            <PillButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </PillButton>
            <PillButton
              className={!canSubmit ? "pointer-events-none opacity-50" : undefined}
              onClick={() => canSubmit && submit()}
            >
              {busy ? "Saving…" : "Save memory"}
            </PillButton>
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
            <PillButton variant="outline" onClick={() => setUrlOpen(false)}>
              Cancel
            </PillButton>
            <PillButton
              className={!canSubmitUrl ? "pointer-events-none opacity-50" : undefined}
              onClick={() => canSubmitUrl && submitUrl()}
            >
              {urlBusy ? "Ingesting…" : "Ingest URL"}
            </PillButton>
          </div>
        </div>
      </Modal>

      <Modal open={docOpen} onClose={() => setDocOpen(false)} title="Ingest document">
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
            <PillButton variant="outline" onClick={() => setDocOpen(false)}>
              Cancel
            </PillButton>
            <PillButton
              className={!canSubmitDoc ? "pointer-events-none opacity-50" : undefined}
              onClick={() => canSubmitDoc && submitDoc()}
            >
              {docBusy ? "Ingesting…" : "Ingest document"}
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
