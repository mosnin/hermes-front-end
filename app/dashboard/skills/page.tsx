"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Search } from "@/components/icons";
import { PageHead, PillButton, Panel, ListRow, SectionLabel } from "@/components/dash/kit";

type Skill = {
  _id: string;
  name: string;
  description?: string;
  content: string;
  tags?: string[];
};

export default function SkillsPage() {
  const { spaceId } = useActiveSpace();
  const all = useQuery(api.skills.list, spaceId ? { spaceId } : "skip");
  const create = useAction(api.skills.create);
  const runSearch = useAction(api.skills.search);
  const remove = useMutation(api.skills.remove);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Skill[] | null>(null);
  const [searching, setSearching] = useState(false);

  const list = results ?? all ?? [];

  async function submit() {
    if (!name.trim() || !content.trim() || !spaceId) return;
    setBusy(true);
    try {
      await create({
        spaceId,
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setName("");
      setDescription("");
      setContent("");
      setTags("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    if (!query.trim() || !spaceId) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = (await runSearch({ spaceId, query: query.trim() })) as Skill[];
      setResults(r);
    } finally {
      setSearching(false);
    }
  }

  const canSubmit = !busy && !!name.trim() && !!content.trim();

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="Build"
          title="Skills"
          sub="Reusable instructions and context for your agents. Semantic search powered by Convex vector search."
          actions={<PillButton onClick={() => setOpen(true)}>New skill</PillButton>}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search skills by meaning…"
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
          <SectionLabel>{results ? "search results" : "your skills"}</SectionLabel>
          {list.length === 0 ? (
            <Panel>
              <p className="py-10 text-center text-[13.5px] text-[var(--muted)]">
                {results
                  ? "No matching skills. Try a different search."
                  : "No skills yet. Save a prompt, playbook, or set of instructions your agents can reuse."}
              </p>
            </Panel>
          ) : (
            <Panel>
              <div>
                {list.map((s) => (
                  <ListRow
                    key={s._id}
                    leading={s.name.slice(0, 2).toUpperCase()}
                    title={
                      <>
                        <span className="font-medium">{s.name}</span>
                        {s.description && <span className="text-[var(--muted)]"> · {s.description}</span>}
                      </>
                    }
                    meta={[s.content, ...(s.tags ?? [])].filter(Boolean).join(" · ")}
                    trailing={
                      <button
                        onClick={() => spaceId && remove({ spaceId, skillId: s._id as never })}
                        className="text-[12.5px] text-[var(--muted)] transition-colors hover:text-red-500"
                      >
                        Delete
                      </button>
                    }
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New skill">
        <div className="space-y-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Skill name"
            autoFocus
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
          />
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="The instructions / prompt / playbook…"
            rows={6}
          />
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Tags, comma separated"
          />
          <div className="flex justify-end gap-2">
            <PillButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </PillButton>
            <PillButton
              className={!canSubmit ? "pointer-events-none opacity-50" : undefined}
              onClick={() => canSubmit && submit()}
            >
              {busy ? "Saving…" : "Save skill"}
            </PillButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
