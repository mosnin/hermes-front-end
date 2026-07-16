"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useActiveSpace } from "./active-space";
import { useToast } from "./toast";
import { runGlobalAction } from "./global-actions";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  Brain,
  Cable,
  Code2,
  Cpu,
  CreditCard,
  DollarSign,
  Megaphone,
  Server,
  FileSearch,
  FileText,
  Gauge,
  History,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Network,
  Plug,
  Radar,
  Rocket,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agents", href: "/dashboard/agents", icon: Boxes },
  { label: "Fleet", href: "/dashboard/fleet", icon: Rocket },
  { label: "Mission control", href: "/dashboard/mission", icon: Radar },
  { label: "Threads", href: "/dashboard/threads", icon: MessagesSquare },
  { label: "Agent network", href: "/dashboard/network", icon: Network },
  { label: "Tasks", href: "/dashboard/tasks", icon: ListTodo },
  { label: "Goals", href: "/dashboard/goals", icon: Target },
  { label: "Workflows", href: "/dashboard/workflows", icon: Workflow },
  { label: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
  { label: "Model router", href: "/dashboard/models", icon: Cpu },
  { label: "Skills", href: "/dashboard/skills", icon: Sparkles },
  { label: "Knowledge", href: "/dashboard/knowledge", icon: Brain },
  { label: "Integrations", href: "/dashboard/integrations", icon: Plug },
  { label: "MCP servers", href: "/dashboard/mcp", icon: Server },
  { label: "Chat bridges", href: "/dashboard/bridges", icon: Cable },
  { label: "Approvals", href: "/dashboard/approvals", icon: ShieldCheck },
  { label: "Alerts", href: "/dashboard/alerts", icon: Bell },
  { label: "Action ledger", href: "/dashboard/ledger", icon: ScrollText },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { label: "Work history", href: "/dashboard/history", icon: History },
  { label: "Audit log", href: "/dashboard/audit", icon: FileSearch },
  { label: "Agent evals", href: "/dashboard/evals", icon: Gauge },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Reports", href: "/dashboard/reports", icon: FileText },
  { label: "Ops & scale", href: "/dashboard/ops", icon: Activity },
  { label: "Developer", href: "/dashboard/developer", icon: Code2 },
  { label: "Secrets vault", href: "/dashboard/secrets", icon: KeyRound },
  { label: "Billing & plans", href: "/dashboard/billing", icon: CreditCard },
  { label: "Space settings", href: "/dashboard/settings", icon: Settings },
];

type Row = {
  label: string;
  sub?: string;
  href?: string;
  run?: () => void | Promise<void>;
  group: string;
  danger?: boolean;
};

export function CommandPalette() {
  const router = useRouter();
  const { spaceId, active: activeSpace } = useActiveSpace();
  const setAutonomyPaused = useMutation(api.spaces.setAutonomyPaused);
  const setShadowMode = useMutation(api.spaces.setShadowMode);
  const seed = useMutation(api.demo.seed);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const results = useQuery(
    api.search.global,
    open && spaceId && q.trim().length >= 2 ? { spaceId, query: q } : "skip",
  );

  const actions: Row[] = useMemo(() => {
    if (!spaceId) return [];
    const sid = spaceId;
    const paused = !!activeSpace?.autonomyPaused;
    const shadow = !!activeSpace?.shadowMode;
    const list: Row[] = [
      {
        label: "Connect an agent",
        sub: "Register a new agent",
        group: "Actions",
        run: () => runGlobalAction("connect-agent"),
      },
      {
        label: paused ? "Resume autonomy" : "Pause autonomy (kill switch)",
        sub: paused ? "Re-enable dispatch" : "Halt all dispatch in this Space",
        group: "Actions",
        danger: !paused,
        run: async () => {
          await setAutonomyPaused({ spaceId: sid, paused: !paused });
          toast(paused ? "Autonomy resumed" : "Autonomy paused", paused ? "success" : "error");
        },
      },
      {
        label: shadow ? "Disable shadow mode" : "Enable shadow mode",
        sub: "Propose actions instead of executing",
        group: "Actions",
        run: async () => {
          await setShadowMode({ spaceId: sid, shadow: !shadow });
          toast(shadow ? "Shadow mode off" : "Shadow mode on", "success");
        },
      },
      {
        label: "Load demo data",
        sub: "Seed this Space with sample agents & activity",
        group: "Actions",
        run: async () => {
          await seed({ spaceId: sid });
          toast("Demo data loaded", "success");
        },
      },
    ];
    return list.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, spaceId, activeSpace?.autonomyPaused, activeSpace?.shadowMode]);

  const rows: Row[] = useMemo(() => {
    const nav: Row[] = NAV.filter((n) =>
      n.label.toLowerCase().includes(q.toLowerCase()),
    ).map((n) => ({ label: n.label, href: n.href, group: "Navigate" }));

    const r = results;
    const dyn: Row[] = r
      ? [
          ...r.agents.map((h) => ({ label: h.label, sub: h.sub, href: `/dashboard/agents/${h.id}`, group: "Agents" })),
          ...r.threads.map((h) => ({ label: h.label, href: `/dashboard/threads/${h.id}`, group: "Threads" })),
          ...r.tasks.map((h) => ({ label: h.label, sub: h.sub, href: `/dashboard/tasks`, group: "Tasks" })),
          ...r.workflows.map((h) => ({ label: h.label, href: `/dashboard/workflows`, group: "Workflows" })),
          ...r.skills.map((h) => ({ label: h.label, href: `/dashboard/skills`, group: "Skills" })),
          ...r.memories.map((h) => ({ label: h.label, sub: h.sub, href: `/dashboard/knowledge`, group: "Knowledge" })),
        ]
      : [];
    return [...actions, ...nav, ...dyn];
  }, [q, results, actions]);

  function run(row: Row) {
    setOpen(false);
    if (row.href) {
      router.push(row.href);
    } else if (row.run) {
      Promise.resolve(row.run()).catch((e) =>
        toast(e instanceof Error ? e.message : "Action failed", "error"),
      );
    }
  }

  if (!open) return null;

  let idx = -1;
  const groups = [...new Set(rows.map((r) => r.group))];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && rows[active]) {
                run(rows[active]);
              }
            }}
            placeholder="Search agents, threads, tasks, skills… or jump to a page"
            className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">
              {q.length >= 2 ? "No matches." : "Type to search…"}
            </p>
          )}
          {groups.map((group) => (
            <div key={group}>
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted">
                {group}
              </p>
              {rows
                .filter((r) => r.group === group)
                .map((r) => {
                  idx++;
                  const i = idx;
                  return (
                    <button
                      key={`${r.group}-${r.label}-${i}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(r)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                        active === i ? "bg-surface-2" : "hover:bg-surface-2",
                      )}
                    >
                      <span className={cn("truncate", r.danger && "text-red-400")}>{r.label}</span>
                      {r.sub && <span className="text-xs text-muted">{r.sub}</span>}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
