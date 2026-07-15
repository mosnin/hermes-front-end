"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { motion } from "motion/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  Activity,
  Building2,
  LayoutDashboard,
  Loader2,
  Lock,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/compliance", label: "SOC 2 controls", icon: ShieldCheck },
  { href: "/admin/audit", label: "Admin audit", icon: ScrollText },
];

function AccessDenied() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md rounded-3xl border border-red-500/40 bg-surface p-8 text-center shadow-[0_0_40px_rgba(239,68,68,0.1)]"
      >
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-red-500/10 text-red-400">
          <Lock className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-semibold">Restricted area</h1>
        <p className="mt-2 text-sm text-muted">
          Platform administration requires an allowlisted administrator
          identity. This access attempt is logged.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-lg border border-border px-4 py-2 text-sm transition hover:border-muted"
        >
          Back to dashboard
        </Link>
      </motion.div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const status = useQuery(api.admin.status, {});
  const logAccess = useMutation(api.admin.logAccess);

  useEffect(() => {
    if (status?.isAdmin) {
      logAccess({ resource: pathname }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.isAdmin, pathname]);

  if (status === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }
  if (!status.isAdmin) return <AccessDenied />;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-red-500/20 bg-background p-3">
        <div className="mb-4 flex items-center gap-2 px-2 py-1">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-red-500/15 text-red-400 shadow-[0_0_14px_rgba(239,68,68,0.25)]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold lowercase tracking-tight">cadre</p>
            <p className="text-[10px] uppercase tracking-widest text-red-400/80">
              platform admin
            </p>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-300/80">
          Elevated access · every action is audited
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  active ? "text-white" : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="admin-active-pill"
                    className="absolute inset-0 rounded-lg bg-red-500/90 shadow-[0_0_16px_rgba(239,68,68,0.3)]"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                )}
                <item.icon className="relative h-4 w-4" />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/dashboard"
          className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <Activity className="h-4 w-4" /> Exit to app
        </Link>
        <div className="mt-2 flex items-center gap-2 border-t border-border px-2 pt-3">
          <UserButton afterSignOutUrl="/" />
          <span className="text-xs text-muted">Administrator</span>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
