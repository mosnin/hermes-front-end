"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  BarChart3,
  Boxes,
  Brain,
  ChevronDown,
  FileText,
  History,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Network,
  Plug,
  Plus,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveSpace } from "./active-space";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/agents", label: "Agents", icon: Boxes },
  { href: "/dashboard/threads", label: "Threads", icon: MessagesSquare },
  { href: "/dashboard/network", label: "Agent network", icon: Network },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
  { href: "/dashboard/goals", label: "Goals", icon: Target },
  { href: "/dashboard/workflows", label: "Workflows", icon: Workflow },
  { href: "/dashboard/skills", label: "Skills", icon: Sparkles },
  { href: "/dashboard/knowledge", label: "Knowledge", icon: Brain },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/history", label: "Work history", icon: History },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/ops", label: "Ops & scale", icon: ShieldAlert },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Space settings", icon: Settings },
];

function SpaceSwitcher() {
  const { spaces, active, setSpace } = useActiveSpace();
  const createSpace = useMutation(api.spaces.create);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
      >
        <span className="flex items-center gap-2 truncate">
          <span className="h-2 w-2 rounded-full bg-accent" />
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
              const name = window.prompt("New Space name");
              if (name?.trim()) {
                const id = await createSpace({ name: name.trim() });
                setSpace(id);
              }
              setOpen(false);
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
  const { active } = useActiveSpace();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface/50 p-3">
      <Link
        href="/dashboard"
        className="mb-3 flex items-center gap-2 px-2 py-1 font-semibold"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/20 text-accent">
          ⬢
        </span>
        Hermes
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
      <div className="mb-3">
        <SpaceSwitcher />
        {active?.autonomyPaused && (
          <p className="mt-1 rounded-md bg-red-500/15 px-2 py-1 text-[11px] text-red-400">
            ⏸ Autonomy paused (kill switch)
          </p>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {nav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 flex items-center gap-3 border-t border-border px-2 pt-3">
        <UserButton afterSignOutUrl="/" />
        <span className="text-xs text-muted">Account</span>
      </div>
    </aside>
  );
}
