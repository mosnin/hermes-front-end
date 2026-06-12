"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import {
  Activity,
  Boxes,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Network,
  Plug,
  Sparkles,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/agents", label: "Agents", icon: Boxes },
  { href: "/dashboard/threads", label: "Threads", icon: MessagesSquare },
  { href: "/dashboard/network", label: "Agent network", icon: Network },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
  { href: "/dashboard/skills", label: "Skills", icon: Sparkles },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/orchestrations", label: "Orchestration", icon: Workflow },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface/50 p-3">
      <Link
        href="/dashboard"
        className="mb-4 flex items-center gap-2 px-2 py-2 font-semibold"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/20 text-accent">
          ⬢
        </span>
        Hermes
      </Link>

      <div className="mb-3 px-1">
        <OrganizationSwitcher
          hidePersonal={false}
          appearance={{ elements: { rootBox: "w-full", organizationSwitcherTrigger: "w-full justify-between" } }}
        />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
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
