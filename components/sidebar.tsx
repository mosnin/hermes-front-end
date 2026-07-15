"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton, useUser, SignOutButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  BarChart3,
  Bell,
  BellRing,
  Boxes,
  Brain,
  Cable,
  ChevronDown,
  Code2,
  Cpu,
  CreditCard,
  DollarSign,
  FileSearch,
  FileText,
  Gauge,
  History,
  KeyRound,
  Megaphone,
  Server,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Network,
  Plug,
  Plus,
  Radar,
  Rocket,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveSpace } from "./active-space";
import { useDialog } from "./dialog";
import { useToast } from "./toast";
import { NotificationBell } from "./notification-bell";

const SECTIONS: {
  title: string;
  items: { href: string; label: string; icon: typeof Boxes; exact?: boolean }[];
}[] = [
  {
    title: "Work",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/agents", label: "Agents", icon: Boxes },
      { href: "/dashboard/fleet", label: "Fleet", icon: Rocket },
      { href: "/dashboard/mission", label: "Mission control", icon: Radar },
      { href: "/dashboard/threads", label: "Threads", icon: MessagesSquare },
      { href: "/dashboard/network", label: "Agent network", icon: Network },
    ],
  },
  {
    title: "Plan",
    items: [
      { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
      { href: "/dashboard/goals", label: "Goals", icon: Target },
      { href: "/dashboard/workflows", label: "Workflows", icon: Workflow },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/dashboard/models", label: "Model router", icon: Cpu },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { href: "/dashboard/skills", label: "Skills", icon: Sparkles },
      { href: "/dashboard/knowledge", label: "Knowledge", icon: Brain },
      { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
      { href: "/dashboard/mcp", label: "MCP servers", icon: Server },
      { href: "/dashboard/bridges", label: "Chat bridges", icon: Cable },
    ],
  },
  {
    title: "Insight",
    items: [
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck },
      { href: "/dashboard/alerts", label: "Alerts", icon: BellRing },
      { href: "/dashboard/ledger", label: "Action ledger", icon: ScrollText },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/history", label: "Work history", icon: History },
      { href: "/dashboard/audit", label: "Audit log", icon: FileSearch },
      { href: "/dashboard/evals", label: "Agent evals", icon: Gauge },
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/reports", label: "Reports", icon: FileText },
      { href: "/dashboard/ops", label: "Ops & scale", icon: Activity },
      { href: "/dashboard/developer", label: "Developer", icon: Code2 },
      { href: "/dashboard/secrets", label: "Secrets vault", icon: KeyRound },
      { href: "/dashboard/billing", label: "Billing & plans", icon: CreditCard },
      { href: "/dashboard/cost", label: "Cost (estimated)", icon: DollarSign },
      { href: "/dashboard/settings", label: "Space settings", icon: Settings },
    ],
  },
];

function SpaceSwitcher() {
  const { spaces, active, setSpace } = useActiveSpace();
  const createSpace = useMutation(api.spaces.create);
  const dialog = useDialog();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
      >
        <span className="flex items-center gap-2 truncate">
          <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_rgba(255,91,4,0.7)]" />
          {active?.name ?? "Loading…"}
        </span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface p-1 shadow-xl">
          {spaces.map((s) => (
            <button
              key={s._id}
              onClick={() => {
                setSpace(s._id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-2",
                active?._id === s._id && "bg-surface-2",
              )}
            >
              <span className="truncate">{s.name}</span>
              <span className="text-[10px] uppercase text-muted">{s.role}</span>
            </button>
          ))}
          <button
            onClick={async () => {
              setOpen(false);
              const name = await dialog.prompt({
                title: "New Space",
                label: "Name",
                placeholder: "e.g. Growth, Engineering, Support",
                confirmLabel: "Create",
              });
              if (name?.trim()) {
                const id = await createSpace({ name: name.trim() });
                setSpace(id);
                toast(`Created Space "${name.trim()}"`, "success");
              }
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-accent hover:bg-surface-2"
          >
            <Plus className="h-3.5 w-3.5" /> New Space
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { active, spaceId } = useActiveSpace();
  const { user } = useUser();
  const adminStatus = useQuery(api.admin.status, {});
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const counts: Record<string, number | undefined> = {
    "/dashboard/agents": agents?.length || undefined,
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background p-3">
      <Link
        href="/dashboard"
        className="mb-3 flex items-center gap-2 px-2 py-1 text-lg font-bold lowercase tracking-tight"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white shadow-[0_0_14px_rgba(255,91,4,0.45)]">
          ⬢
        </span>
        hermes
      </Link>

      <div className="mb-2 px-1">
        <OrganizationSwitcher
          hidePersonal={false}
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger: "w-full justify-between",
            },
          }}
        />
      </div>
      <div className="mb-2">
        <SpaceSwitcher />
        {active?.autonomyPaused && (
          <p className="mt-1 rounded-md bg-red-500/15 px-2 py-1 text-[11px] text-red-400">
            ⏸ Autonomy paused (kill switch)
          </p>
        )}
      </div>

      <button
        onClick={() => {
          const e = new KeyboardEvent("keydown", { key: "k", metaKey: true });
          window.dispatchEvent(e);
        }}
        className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" /> Search…
        <kbd className="ml-auto rounded border border-border px-1 text-[10px]">⌘K</kbd>
      </button>

      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1 text-[10px] uppercase tracking-widest text-muted/70">
              {section.title}
            </p>
            {section.items.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition",
                    isActive
                      ? "text-white"
                      : "text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {/* The active pill glides between nav items. */}
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active-pill"
                      className="absolute inset-0 rounded-lg bg-accent shadow-[0_0_16px_rgba(255,91,4,0.3)]"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <item.icon className="relative h-4 w-4 transition-transform group-hover:scale-110" />
                  <span className="relative flex-1 truncate">{item.label}</span>
                  {counts[item.href] !== undefined && (
                    <span
                      className={cn(
                        "relative rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        isActive ? "bg-white/20 text-white" : "bg-surface-2 text-muted",
                      )}
                    >
                      {counts[item.href]}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Platform admin — only rendered for allowlisted administrators. */}
      {adminStatus?.isAdmin && (
        <Link
          href="/admin"
          className="mt-2 flex items-center gap-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-sm text-red-300 transition hover:border-red-500/50"
        >
          <ShieldCheck className="h-4 w-4" />
          <span className="flex-1">Platform admin</span>
        </Link>
      )}

      {/* Promo block (chirp "Marketplace") */}
      <Link
        href="/dashboard/fleet"
        className="mt-3 block rounded-xl border border-accent/25 bg-gradient-to-br from-accent/15 to-transparent p-3 transition hover:border-accent/50"
      >
        <p className="text-[10px] uppercase tracking-wider text-muted">
          Deploy your next agent
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-accent">
          <Rocket className="h-3.5 w-3.5" /> Fleet
        </p>
      </Link>

      {/* Account card */}
      <div className="mt-3 flex items-center gap-2.5 border-t border-border px-1 pt-3">
        <UserButton afterSignOutUrl="/" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">
            {user?.firstName ?? user?.username ?? "Account"}
          </p>
          <SignOutButton>
            <button className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">
              Logout
            </button>
          </SignOutButton>
        </div>
        <NotificationBell />
      </div>
    </aside>
  );
}
