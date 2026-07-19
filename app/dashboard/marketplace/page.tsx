"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { EmptyState, Input, Segmented, SkeletonRows } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Boxes, Search } from "@/components/icons";
import { TemplateCard, MarketplaceTemplate } from "@/components/marketplace/TemplateCard";
import { TemplateDetailModal } from "@/components/marketplace/InstallDialog";

type CategoryValue = "all" | "sales" | "support" | "engineering" | "ops" | "marketing" | "custom";

const CATEGORIES: { value: CategoryValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "engineering", label: "Engineering" },
  { value: "ops", label: "Ops" },
  { value: "marketing", label: "Marketing" },
  { value: "custom", label: "Your Space" },
];

export default function MarketplacePage() {
  const { spaceId } = useActiveSpace();
  const [category, setCategory] = useState<CategoryValue>("all");
  const [openId, setOpenId] = useState<Id<"agentTemplates"> | null>(null);
  const [search, setSearch] = useState("");

  const templates = useQuery(
    api.marketplace.listTemplates,
    spaceId
      ? {
          spaceId,
          category: category === "all" ? undefined : category,
          search: search.trim() || undefined,
        }
      : "skip",
  ) as MarketplaceTemplate[] | undefined;

  const featured = useMemo(
    () => (templates ?? []).filter((t: MarketplaceTemplate) => t.featured && t.visibility === "public"),
    [templates],
  );
  const rest = useMemo(
    () => (templates ?? []).filter((t: MarketplaceTemplate) => !t.featured || t.visibility !== "public"),
    [templates],
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Template marketplace</h1>
        <p className="text-sm text-muted">
          Curated agent templates — harness, bundled skills, and suggested config, ready to
          install into this Space. Save a live agent as a private template from its detail page.
        </p>
      </div>

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="mb-6 overflow-x-auto">
        <Segmented options={CATEGORIES} value={category} onChange={setCategory} />
      </div>

      {templates === undefined ? (
        <SkeletonRows rows={6} />
      ) : templates.length === 0 ? (
        <EmptyState
          title={search.trim() ? "No templates match your search" : "No templates yet"}
          body={
            search.trim()
              ? "Try a different search term, or clear the search to browse all templates."
              : "Curated templates will appear here once seeded, or save one of your own agents as a private template."
          }
          graphic={<Boxes className="h-full w-full text-muted" />}
        />
      ) : (
        <div className="space-y-8">
          {featured.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-medium text-muted">Featured</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {featured.map((t) => (
                  <TemplateCard key={t._id} template={t} onClick={() => setOpenId(t._id)} />
                ))}
              </div>
            </div>
          )}
          <div>
            {featured.length > 0 && <h2 className="mb-3 text-sm font-medium text-muted">All templates</h2>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rest.map((t) => (
                <TemplateCard key={t._id} template={t} onClick={() => setOpenId(t._id)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <TemplateDetailModal templateId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
