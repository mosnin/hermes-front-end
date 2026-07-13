"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white shadow-[0_0_16px_rgba(255,91,4,0.45)]">
        ⬢
      </span>
      hermes
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
      </div>
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
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Mission control for autonomous agents. Connect, orchestrate, and
            govern your fleet — from one panel.
          </p>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.title}>
            <p className="mb-3 text-xs uppercase tracking-wider text-muted">
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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 text-xs text-muted">
          <span className="lowercase">© {new Date().getFullYear()} hermes control plane</span>
          <span>Convex · Clerk · A2A · MCP</span>
        </div>
      </div>
    </footer>
  );
}
