"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { EmptyState, Input, SkeletonRows } from "@/components/ui";
import { useActiveSpace } from "@/components/active-space";
import { Boxes, Copy, Search } from "@/components/icons";
import { TemplateCard, MarketplaceTemplate } from "@/components/marketplace/TemplateCard";
import { TemplateDetailModal } from "@/components/marketplace/InstallDialog";
import { SaveAgentDialog } from "@/components/marketplace/SaveAgentDialog";
import { Stagger, StaggerItem } from "@/components/site/motion";
import { PageHead, PillButton, StatTile, StatRow, SectionLabel } from "@/components/dash/kit";

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
  const { spaceId, active } = useActiveSpace();
  const [category, setCategory] = useState<CategoryValue>("all");
  const [openId, setOpenId] = useState<Id<"agentTemplates"> | null>(null);
  const [search, setSearch] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

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
  const yourSpaceCount = useMemo(
    () => (templates ?? []).filter((t: MarketplaceTemplate) => t.visibility === "space").length,
    [templates],
  );

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow={`${active?.name ?? "Workspace"} · marketplace`}
          title="Template marketplace"
          sub="Curated agent templates: harness, bundled skills, and suggested config, ready to install into this Space."
          actions={
            <PillButton variant="outline" onClick={() => setSaveOpen(true)}>
              <Copy className="h-4 w-4" /> Save an agent as template
            </PillButton>
          }
        />

        <StatRow>
          <StatTile value={(templates ?? []).length} label="Templates" hint="matching current filter" tone="ink" />
          <StatTile value={featured.length} label="Featured" hint="curated picks" />
          <StatTile value={yourSpaceCount} label="Your Space" hint="saved from your agents" />
        </StatRow>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <PillButton
              key={c.value}
              variant={category === c.value ? "solid" : "outline"}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </PillButton>
          ))}
        </div>

        {templates === undefined ? (
          <SkeletonRows rows={6} />
        ) : templates.length === 0 ? (
          <EmptyState
            title={search.trim() ? "No templates match your search" : "No templates yet"}
            body={
              search.trim()
                ? "Try a different search term, or clear the search to browse all templates."
                : "Curated templates will appear here once seeded, or use \"Save an agent as template\" above to add your own."
            }
            graphic={<Boxes className="h-full w-full text-muted" />}
          />
        ) : (
          <div className="space-y-8">
            {featured.length > 0 && (
              <div>
                <SectionLabel>featured</SectionLabel>
                <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {featured.map((t) => (
                    <StaggerItem key={t._id}>
                      <TemplateCard template={t} onClick={() => setOpenId(t._id)} />
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            )}
            <div>
              {featured.length > 0 && <SectionLabel>all templates</SectionLabel>}
              <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {rest.map((t) => (
                  <StaggerItem key={t._id}>
                    <TemplateCard template={t} onClick={() => setOpenId(t._id)} />
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        )}
      </div>

      <TemplateDetailModal templateId={openId} onClose={() => setOpenId(null)} />
      <SaveAgentDialog open={saveOpen} onClose={() => setSaveOpen(false)} />
    </div>
  );
}
