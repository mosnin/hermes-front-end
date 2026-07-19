"use client";

import { Badge, Card } from "@/components/ui";
import { Boxes, Sparkles, Star } from "@/components/icons";
import { Id } from "@/convex/_generated/dataModel";

export type MarketplaceTemplate = {
  _id: Id<"agentTemplates">;
  name: string;
  tagline?: string;
  category?: string;
  visibility: "public" | "space";
  featured?: boolean;
  harness?: string;
  installCount?: number;
  skills?: unknown[];
};

export function TemplateCard({
  template,
  onClick,
}: {
  template: MarketplaceTemplate;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="block w-full text-left">
      <Card className="h-full transition hover:border-accent/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2">
            <Boxes className="h-4 w-4 text-muted" />
          </div>
          {template.featured && (
            <Badge tone="yellow">
              <Star className="h-3 w-3" /> Featured
            </Badge>
          )}
        </div>
        <p className="mt-3 font-medium">{template.name}</p>
        {template.tagline && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{template.tagline}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {template.category && <Badge tone="blue">{template.category}</Badge>}
          {template.harness && <Badge>{template.harness}</Badge>}
          {template.visibility === "space" && <Badge tone="green">Your Space</Badge>}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {template.skills?.length ?? 0} skill{(template.skills?.length ?? 0) === 1 ? "" : "s"}
          </span>
          <span>{template.installCount ?? 0} installs</span>
        </div>
      </Card>
    </button>
  );
}
