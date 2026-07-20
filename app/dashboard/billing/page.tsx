"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Check, Sparkles } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  PageHead,
  PillButton,
  Panel,
  StatTile,
  StatRow,
  ListRow,
  SectionLabel,
} from "@/components/dash/kit";

type PlanId = "free" | "team" | "enterprise";

const PLANS: {
  id: PlanId;
  name: string;
  price: string;
  blurb: string;
  features: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    blurb: "For solo builders kicking the tires.",
    features: ["1 Space", "3 agents", "Community support"],
  },
  {
    id: "team",
    name: "Team",
    price: "$99/mo",
    blurb: "For teams running real workloads.",
    features: ["10 Spaces", "50 agents", "Integrations", "Email support"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Contact us",
    blurb: "For scaled, governed deployments.",
    features: [
      "Unlimited Spaces & agents",
      "SSO",
      "BYOC (bring your own cloud)",
      "Audit & compliance",
    ],
  },
];

export default function BillingPage() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const toast = useToast();

  const usage = useQuery(api.usage.summary, spaceId ? { spaceId } : "skip");
  const current = useQuery(api.billing.plan, spaceId ? { spaceId } : "skip");
  const entitlements = useQuery(
    api.billing.entitlements,
    spaceId ? { spaceId } : "skip",
  );
  const setPlan = useMutation(api.billing.setPlan);
  const createCheckout = useAction(api.stripe.createCheckout);

  const currentPlan = (current?.plan ?? "free") as PlanId;

  const changePlan = async (id: PlanId) => {
    if (!spaceId) return;
    // Paid tiers go through Stripe checkout when it's configured; the webhook
    // applies the plan after payment. Falls back to the manual switch (admin)
    // when Stripe isn't set up, and for downgrades to free.
    if (id !== "free") {
      try {
        const { url } = await createCheckout({ spaceId, plan: id });
        window.location.href = url;
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (!msg.includes("not configured")) {
          toast(msg || "Checkout failed.", "error");
          return;
        }
        // Stripe not configured → manual plan switch below.
      }
    }
    try {
      await setPlan({ spaceId, plan: id });
      toast(
        `Plan switched to ${id.charAt(0).toUpperCase() + id.slice(1)}.`,
        "success",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to change plan.", "error");
    }
  };

  const entitlementRows = entitlements
    ? ([
        ["Agents", entitlements.usage.agents, entitlements.limits.maxAgents],
        ["Workflows", entitlements.usage.workflows, entitlements.limits.maxWorkflows],
        ["Bridges", entitlements.usage.bridges, entitlements.limits.maxBridges],
        ["API keys", entitlements.usage.apiKeys, entitlements.limits.maxApiKeys],
      ] as const)
    : null;

  return (
    <div className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-[1120px] space-y-8">
        <PageHead
          eyebrow="billing"
          title="Billing & plans"
          sub="Your plan tier and usage for this Space."
        />

        <Panel
          title="Usage this month"
          tone="band"
          action={<Badge>{currentPlan} plan</Badge>}
        >
          <p className="text-[38px] font-medium leading-none tracking-[-0.02em] tabular-nums text-[var(--foreground)] sm:text-[44px]">
            ${usage?.totalCost.toFixed(2) ?? "0.00"}
            {usage && usage.budget > 0 && (
              <span className="ml-1.5 text-[16px] font-normal text-[var(--muted)]">
                / ${usage.budget}
              </span>
            )}
          </p>
          {usage && usage.budget > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--background)]">
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  usage.budgetUsedPct >= 1 ? "bg-red-500" : "bg-[var(--foreground)]",
                )}
                style={{ width: `${Math.round(usage.budgetUsedPct * 100)}%` }}
              />
            </div>
          )}
          <p className="mt-3 text-[13px] text-[var(--muted)]">
            {usage?.events ?? 0} usage events recorded this month.
          </p>

          {entitlementRows && (
            <StatRow className="mt-6">
              {entitlementRows.map(([label, used, max]) => (
                <StatTile
                  key={label}
                  value={used}
                  label={label}
                  hint={`of ${max >= 100000 ? "∞" : max}`}
                />
              ))}
            </StatRow>
          )}

          {usage && Object.keys(usage.byKind).length > 0 && (
            <div className="mt-6">
              <SectionLabel>by kind</SectionLabel>
              <div>
                {Object.entries(usage.byKind).map(([k, val]) => {
                  const vv = val as { count: number; cost: number };
                  return (
                    <ListRow
                      key={k}
                      title={<span className="capitalize">{k}</span>}
                      meta={`${vv.count} events`}
                      trailing={`$${vv.cost.toFixed(2)}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </Panel>

        <div>
          <SectionLabel>plans</SectionLabel>
          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => {
              const isCurrent = p.id === currentPlan;
              const disabled = !canAdmin || !spaceId;
              return (
                <Panel
                  key={p.id}
                  tone={isCurrent ? "band" : "white"}
                  title={p.name}
                  action={
                    isCurrent ? (
                      <Badge tone="green">
                        <Sparkles className="h-3 w-3" />
                        Current
                      </Badge>
                    ) : undefined
                  }
                >
                  <p className="text-[26px] font-medium tracking-[-0.01em] text-[var(--foreground)]">
                    {p.price}
                  </p>
                  <p className="mt-1 text-[13.5px] text-[var(--muted)]">{p.blurb}</p>
                  <ul className="mt-4 space-y-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-[13.5px] text-[var(--foreground)]">
                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--muted-strong)]" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    {isCurrent ? (
                      <PillButton variant="outline" className="pointer-events-none opacity-60">
                        Current plan
                      </PillButton>
                    ) : p.id === "enterprise" ? (
                      <PillButton
                        variant="outline"
                        onClick={() => (window.location.href = "mailto:sales@cadre.to")}
                      >
                        Contact sales
                      </PillButton>
                    ) : (
                      <PillButton
                        onClick={() => {
                          if (disabled) return;
                          changePlan(p.id);
                        }}
                        className={disabled ? "pointer-events-none opacity-50" : undefined}
                      >
                        {p.id === "team" ? "Upgrade" : "Switch"}
                      </PillButton>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>

        <p className="text-[12.5px] text-[var(--muted)]">
          Note: real metered billing (Stripe) is wired up in a later phase. For
          now this sets your plan tier and shows current usage.
        </p>
      </div>
    </div>
  );
}
