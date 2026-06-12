"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card, EmptyState, Input, Modal, Textarea } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Plus, Search } from "lucide-react";

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

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Skills</h1>
          <p className="text-sm text-muted">
            Reusable instructions and context for your agents. Semantic search
            powered by Convex vector search.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New skill
        </Button>
      </div>

      <div className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search skills by meaning…"
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
          title={results ? "No matching skills" : "No skills yet"}
          body={
            results
              ? "Try a different search."
              : "Save a prompt, playbook, or set of instructions your agents can reuse."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <Card key={s._id}>
              <div className="flex items-start justify-between">
                <p className="font-medium">{s.name}</p>
                <button
                  onClick={() => spaceId && remove({ spaceId, skillId: s._id as never })}
                  className="text-xs text-muted hover:text-red-400"
                >
                  Delete
                </button>
              </div>
              {s.description && (
                <p className="mt-1 text-sm text-muted">{s.description}</p>
              )}
              <p className="mt-2 line-clamp-3 text-xs text-muted">{s.content}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {(s.tags ?? []).map((t) => (
                  <Badge key={t} tone="blue">
                    {t}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

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
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !name.trim() || !content.trim()}>
              {busy ? "Saving…" : "Save skill"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
