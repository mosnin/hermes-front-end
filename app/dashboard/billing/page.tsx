"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Badge, Button, Card } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { Check, Sparkles } from "lucide-react";

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
  const setPlan = useMutation(api.billing.setPlan);

  const currentPlan = (current?.plan ?? "free") as PlanId;

  const changePlan = async (id: PlanId) => {
    if (!spaceId) return;
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

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Billing &amp; plans</h1>
        <p className="text-sm text-muted">
          Your plan tier and usage for this Space.
        </p>
      </div>

      {/* Current usage */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Usage this month</h2>
          <Badge>{currentPlan} plan</Badge>
        </div>
        <p className="mt-2 text-3xl font-semibold">
          ${usage?.totalCost.toFixed(2) ?? "0.00"}
          {usage && usage.budget > 0 && (
            <span className="text-base font-normal text-muted">
              {" "}
              / ${usage.budget}
            </span>
          )}
        </p>
        {usage && usage.budget > 0 && (
          <div className="mt-2 h-2 w-full rounded-full bg-surface-2">
            <div
              className={`h-2 rounded-full ${usage.budgetUsedPct >= 1 ? "bg-red-500" : "bg-accent-2"}`}
              style={{ width: `${Math.round(usage.budgetUsedPct * 100)}%` }}
            />
          </div>
        )}
        <p className="mt-3 text-sm text-muted">
          {usage?.events ?? 0} usage events recorded this month.
        </p>
        <div className="mt-3 space-y-1">
          {usage &&
            Object.entries(usage.byKind).map(([k, val]) => {
              const vv = val as { count: number; cost: number };
              return (
                <div key={k} className="flex justify-between text-sm">
                  <span className="capitalize text-muted">{k}</span>
                  <span>
                    {vv.count} · ${vv.cost.toFixed(2)}
                  </span>
                </div>
              );
            })}
        </div>
      </Card>

      {/* Plan cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.id === currentPlan;
          return (
            <Card
              key={p.id}
              className={isCurrent ? "border-accent-2 ring-1 ring-accent-2" : ""}
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {isCurrent && (
                  <Badge tone="green">
                    <Sparkles className="h-3 w-3" />
                    Current plan
                  </Badge>
                )}
              </div>
              <p className="text-2xl font-semibold">{p.price}</p>
              <p className="mb-4 text-sm text-muted">{p.blurb}</p>
              <ul className="mb-5 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-accent-2" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <Button variant="outline" disabled>
                  Current plan
                </Button>
              ) : p.id === "enterprise" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    (window.location.href = "mailto:sales@hermes.dev")
                  }
                >
                  Contact sales
                </Button>
              ) : (
                <Button
                  disabled={!canAdmin || !spaceId}
                  onClick={() => changePlan(p.id)}
                >
                  {p.id === "team" ? "Upgrade" : "Switch"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted">
        Note: real metered billing (Stripe) is wired up in a later phase. For
        now this sets your plan tier and shows current usage.
      </p>
    </div>
  );
}
