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
  Moon,
  Network,
  Plug,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveSpace } from "./active-space";
import { useTheme } from "./theme";
import { useDialog } from "./dialog";
import { useToast } from "./toast";

const SECTIONS: {
  title: string;
  items: { href: string; label: string; icon: typeof Boxes; exact?: boolean }[];
}[] = [
  {
    title: "Work",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/dashboard/agents", label: "Agents", icon: Boxes },
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
    ],
  },
  {
    title: "Knowledge",
    items: [
      { href: "/dashboard/skills", label: "Skills", icon: Sparkles },
      { href: "/dashboard/knowledge", label: "Knowledge", icon: Brain },
      { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
    ],
  },
  {
    title: "Insight",
    items: [
      { href: "/dashboard/history", label: "Work history", icon: History },
      { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/dashboard/reports", label: "Reports", icon: FileText },
      { href: "/dashboard/ops", label: "Ops & scale", icon: Activity },
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
  const { active } = useActiveSpace();
  const { theme, toggle } = useTheme();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface/50 p-3">
      <Link href="/dashboard" className="mb-3 flex items-center gap-2 px-2 py-1 font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/20 text-accent">⬢</span>
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
            <p className="px-3 pb-1 text-[10px] uppercase tracking-wide text-muted">
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
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition",
                    isActive
                      ? "bg-surface-2 text-foreground"
                      : "text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-3 flex items-center gap-2 border-t border-border px-2 pt-3">
        <UserButton afterSignOutUrl="/" />
        <span className="flex-1 text-xs text-muted">Account</span>
        <button
          onClick={toggle}
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
