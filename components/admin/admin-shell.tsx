"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { motion, useReducedMotion } from "motion/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { DURATION, EASE } from "@/components/site/motion";
import { Mark } from "@/components/site/ui";
import { UI_SPRING } from "@/components/ui";
import {
  Activity,
  Building2,
  LayoutDashboard,
  Loader2,
  Lock,
  ScrollText,
  Server,
  ShieldCheck,
} from "@/components/icons";

/* ---------------------------------------------------------------------------
   Platform admin shell: the same paper-white / beige-band editorial system as
   the rest of the product, with a restrained red accent reserved for the
   "elevated access" identity (nav pill, banner, restricted-area state) so the
   surface reads unmistakably as break-glass without falling back to a dark
   instrument panel. RBAC gating and audit logging below are untouched: the
   `status` query, `logAccess` mutation, and the fail-closed AccessDenied path
   all behave exactly as before.
--------------------------------------------------------------------------- */

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/fleet", label: "Fleet", icon: Server },
  { href: "/admin/compliance", label: "SOC 2 controls", icon: ShieldCheck },
  { href: "/admin/audit", label: "Admin audit", icon: ScrollText },
];

function AccessDenied() {
  const reduce = useReducedMotion();
  return (
    <div className="grid min-h-screen place-items-center bg-white p-6">
      <motion.div
        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? DURATION.reduced : DURATION.medium, ease: EASE }}
        className="max-w-md rounded-modal border border-red-200 bg-white p-8 text-center shadow-[0_20px_50px_rgba(31,31,28,0.08)]"
      >
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-600">
          <Lock className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-semibold text-foreground">Restricted area</h1>
        <p className="mt-2 text-sm text-muted-strong">
          Platform administration requires an allowlisted administrator
          identity. This access attempt is logged.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-border-hover"
        >
          Back to dashboard
        </Link>
      </motion.div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
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
      <div className="grid min-h-screen place-items-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }
  if (!status.isAdmin) return <AccessDenied />;

  return (
    <div className="flex h-screen overflow-hidden bg-white text-foreground">
      <motion.aside
        initial={reduce ? { opacity: 1 } : { opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: reduce ? DURATION.reduced : DURATION.medium, ease: EASE }}
        className="flex w-64 shrink-0 flex-col border-r border-border bg-band p-3"
      >
        <Link
          href="/admin"
          className="mb-4 flex items-center gap-2 px-2 py-1 text-[15px] font-semibold tracking-tight text-foreground transition-opacity hover:opacity-70"
        >
          <Mark />
          Cadre
        </Link>

        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 shadow-card">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-red-50 text-red-600">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">Platform admin</p>
            <p className="truncate text-[10px] uppercase tracking-widest text-red-600/80">
              elevated access
            </p>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-snug text-red-700">
          Every action on this surface is written to the audit trail.
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-full px-3 py-[7px] text-sm transition-colors active:scale-[0.98]",
                  active ? "text-white" : "text-muted-strong hover:bg-white hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="admin-active-pill"
                    className="absolute inset-0 rounded-full bg-red-600"
                    transition={UI_SPRING.pill}
                  />
                )}
                <item.icon className="relative h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span className="relative flex-1 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <Link
          href="/dashboard"
          className="mt-2 flex items-center gap-2 rounded-full px-3 py-[7px] text-sm text-muted-strong transition-colors hover:bg-white hover:text-foreground"
        >
          <Activity className="h-4 w-4" /> Exit to app
        </Link>
        <div className="mt-3 flex items-center gap-2.5 border-t border-border px-1 pt-3">
          <UserButton afterSignOutUrl="/" />
          <span className="text-xs text-muted">Administrator</span>
        </div>
      </motion.aside>

      <motion.main
        key={pathname}
        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
        className="flex-1 overflow-y-auto bg-white"
      >
        {children}
      </motion.main>
    </div>
  );
}
