"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/changelog", label: "Changelog" },
  { href: "/about", label: "Company" },
  { href: "/contact", label: "Contact" },
];

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 text-lg font-bold lowercase tracking-tight",
        className,
      )}
    >
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent font-mono text-white shadow-[0_0_16px_rgba(255,91,4,0.45)]">
        h
      </span>
      cadre
    </Link>
  );
}

/** Drawn hamburger / close, no icon lib. */
function MenuToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? "Close menu" : "Open menu"}
      className="relative h-9 w-9 rounded-lg border border-border md:hidden"
    >
      <span
        className={cn(
          "absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 bg-foreground transition-transform",
          open ? "rotate-45" : "-translate-y-[5px]",
        )}
      />
      <span
        className={cn(
          "absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 bg-foreground transition-opacity",
          open && "opacity-0",
        )}
      />
      <span
        className={cn(
          "absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 bg-foreground transition-transform",
          open ? "-rotate-45" : "translate-y-[5px]",
        )}
      />
    </button>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
        <Wordmark />
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-lg px-3 py-1.5 transition",
                pathname === n.href
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 text-sm">
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <SignedOut>
              <SignInButton mode="modal">
                <button className="rounded-lg px-3 py-2 text-muted hover:text-foreground">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-lg bg-accent px-4 py-2 font-medium text-white shadow-[0_0_16px_rgba(255,91,4,0.35)] transition hover:brightness-110">
                  Get started
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <Link
                href="/dashboard"
                className="rounded-lg bg-accent px-4 py-2 font-medium text-white shadow-[0_0_16px_rgba(255,91,4,0.35)] transition hover:brightness-110"
              >
                Dashboard
              </Link>
            </SignedIn>
          </div>
          <MenuToggle open={open} onClick={() => setOpen((v) => !v)} />
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-3">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-foreground"
                >
                  {n.label}
                </Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                <SignedOut>
                  <SignUpButton mode="modal">
                    <button className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white">
                      Get started
                    </button>
                  </SignUpButton>
                  <SignInButton mode="modal">
                    <button className="rounded-lg border border-border px-4 py-2.5 text-muted">
                      Sign in
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-accent px-4 py-2.5 text-center font-medium text-white"
                  >
                    Dashboard
                  </Link>
                </SignedIn>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

const FOOTER_COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/changelog", label: "Changelog" },
      { href: "/status", label: "Status" },
    ],
  },
  {
    title: "Frameworks",
    links: [
      { href: "/features#frameworks", label: "Hermes" },
      { href: "/features#frameworks", label: "OpenClaw" },
      { href: "/features#frameworks", label: "Goose" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Mission control for autonomous agents. Connect, orchestrate, and
            govern your fleet from one panel.
          </p>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.title}>
            <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted">
              {col.title}
            </p>
            <ul className="space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-muted transition hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-muted sm:flex-row sm:px-6">
          <span className="lowercase">© {new Date().getFullYear()} cadre</span>
          <span className="font-mono">convex · clerk · a2a · mcp</span>
        </div>
      </div>
    </footer>
  );
}
