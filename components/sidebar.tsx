"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton, useUser, SignOutButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  Lock,
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
  Star,
  Target,
  Workflow,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { DURATION, EASE, Reveal, Stagger, StaggerItem, STAGGER } from "@/components/site/motion";
import { UI_SPRING } from "@/components/ui";
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
      { href: "/dashboard/marketplace", label: "Marketplace", icon: Star },
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
      { href: "/dashboard/security-profiles", label: "Security profiles", icon: Lock },
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
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  // Escape and click-outside close the dropdown, matching the behavior a
  // menu/modal-like overlay is expected to have. Purely additive UX polish
  // around the existing toggle-button open/close state.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={reduce ? undefined : { y: -1 }}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        transition={{ duration: DURATION.instant, ease: EASE }}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground shadow-card transition-colors hover:border-border-hover"
      >
        <span className="flex items-center gap-2 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          {active?.name ?? "Loading…"}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: DURATION.instant, ease: EASE }}
            className="absolute z-20 mt-1.5 w-full rounded-xl border border-border bg-background p-1 shadow-lg"
          >
            {spaces.map((s) => (
              <button
                key={s._id}
                onClick={() => {
                  setSpace(s._id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-band",
                  active?._id === s._id && "bg-band",
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
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-band"
            >
              <Plus className="h-3.5 w-3.5" /> New Space
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The asterisk-style brand mark, matching the marketing site's wordmark. */
function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <g stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
        <path d="M12 3v18" />
        <path d="M4.2 7.5l15.6 9" />
        <path d="M19.8 7.5l-15.6 9" />
      </g>
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { active, spaceId } = useActiveSpace();
  const { user } = useUser();
  const adminStatus = useQuery(api.admin.status, {});
  const agents = useQuery(api.agents.list, spaceId ? { spaceId } : "skip");
  const reduce = useReducedMotion();
  const counts: Record<string, number | undefined> = {
    "/dashboard/agents": agents?.length || undefined,
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-band p-3">
      <Reveal duration={DURATION.medium}>
        <Link
          href="/dashboard"
          className="mb-4 flex items-center gap-2 px-2 py-1 text-[15px] font-semibold lowercase tracking-[0.02em] text-foreground transition-opacity hover:opacity-70"
        >
          <BrandMark />
          cadre
        </Link>
      </Reveal>

      <Reveal delay={0.04} duration={DURATION.medium} className="mb-2 px-0.5">
        <OrganizationSwitcher
          hidePersonal={false}
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger:
                "w-full justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm shadow-card hover:border-border-hover",
            },
          }}
        />
      </Reveal>
      <Reveal delay={0.08} duration={DURATION.medium} className="mb-2">
        <SpaceSwitcher />
        {active?.autonomyPaused && (
          <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
            Autonomy paused (kill switch)
          </p>
        )}
      </Reveal>

      <Reveal delay={0.12} duration={DURATION.medium}>
        <motion.button
          onClick={() => {
            const e = new KeyboardEvent("keydown", { key: "k", metaKey: true });
            window.dispatchEvent(e);
          }}
          whileHover={reduce ? undefined : { y: -1 }}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          transition={{ duration: DURATION.instant, ease: EASE }}
          className="group mb-3 flex w-full items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-xs text-muted transition-colors hover:border-border-hover hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5 transition-transform duration-200 group-hover:scale-110" />
          Search…
          <kbd className="ml-auto rounded border border-border bg-band px-1.5 py-0.5 text-[10px] text-muted transition-colors group-hover:border-border-hover group-hover:text-foreground">
            ⌘K
          </kbd>
        </motion.button>
      </Reveal>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pr-0.5">
        {/* `contents` keeps this cascade wrapper out of the flex/gap layout
            entirely — the sections still stack exactly as before, they just
            fade+rise in on mount, top to bottom. */}
        <Stagger as="div" className="contents" gap={STAGGER.tight}>
          {SECTIONS.map((section) => (
            <StaggerItem as="div" key={section.title} y={10} duration={DURATION.base}>
              <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted/80">
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  const count = counts[item.href];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-full px-3 py-[7px] text-sm transition-colors active:scale-[0.98]",
                        isActive
                          ? "text-white"
                          : "text-muted-strong hover:bg-background hover:text-foreground",
                      )}
                    >
                      {/* The active pill glides between nav items. */}
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active-pill"
                          className="absolute inset-0 rounded-full bg-[var(--foreground)]"
                          transition={UI_SPRING.pill}
                        />
                      )}
                      <item.icon className="relative h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      <span className="relative flex-1 truncate">{item.label}</span>
                      {count !== undefined && (
                        <span
                          className={cn(
                            "relative inline-grid overflow-hidden rounded-full text-[10px] font-semibold",
                            isActive ? "bg-white/20 text-white" : "bg-band text-muted",
                          )}
                        >
                          {/* Bumps with a quick spring whenever the live count
                              changes, so a fleet coming online reads as alive
                              instead of the badge just silently updating. */}
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                              key={count}
                              initial={reduce ? false : { opacity: 0, y: 6, scale: 0.7 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.7 }}
                              transition={UI_SPRING.pop}
                              className="col-start-1 row-start-1 px-1.5 py-0.5"
                            >
                              {count}
                            </motion.span>
                          </AnimatePresence>
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </nav>

      {/* Platform admin — only rendered for allowlisted administrators. */}
      {adminStatus?.isAdmin && (
        <Reveal duration={DURATION.base}>
          <Link
            href="/admin"
            className="mt-2 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 transition-colors hover:border-red-300"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="flex-1">Platform admin</span>
          </Link>
        </Reveal>
      )}

      {/* Promo block */}
      <Reveal delay={0.1} duration={DURATION.medium}>
        <Link
          href="/dashboard/fleet"
          className="group mt-3 block rounded-2xl border border-border bg-background p-3.5 shadow-card transition-colors hover:border-border-hover"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Deploy your next agent
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm font-medium text-foreground">
            <Rocket className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            Fleet
          </p>
        </Link>
      </Reveal>

      {/* Account card */}
      <Reveal delay={0.14} duration={DURATION.medium} className="mt-3 flex items-center gap-2.5 border-t border-border px-1 pt-3">
        <UserButton afterSignOutUrl="/" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-foreground">
            {user?.firstName ?? user?.username ?? "Account"}
          </p>
          <SignOutButton>
            <button className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">
              Logout
            </button>
          </SignOutButton>
        </div>
        <NotificationBell />
      </Reveal>
    </aside>
  );
}
