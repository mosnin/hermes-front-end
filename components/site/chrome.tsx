"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { SignedIn, SignedOut, SignUpButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Mark } from "./ui";
import { ImagePlaceholder } from "./painting";

const NAV = [
  { href: "/features", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "Company" },
  { href: "/changelog", label: "Resources" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300",
        scrolled
          ? "border-[var(--site-line)] bg-white/85 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1060px] items-center justify-between px-5 sm:px-7">
        <Link href="/" className="flex items-center gap-1.5 text-[15px] font-semibold tracking-[0.14em] text-[var(--site-ink)]">
          <Mark />
          CADRE
        </Link>

        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[15px] text-[#5f5d57] md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition hover:text-[var(--site-ink)]">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SignedOut>
            <SignUpButton mode="modal">
              <button className="rounded-full bg-[#1f1f1c] px-4 py-2 text-[13.5px] font-medium text-white transition hover:bg-black">
                Get started
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="rounded-full bg-[#1f1f1c] px-4 py-2 text-[13.5px] font-medium text-white transition hover:bg-black"
            >
              Dashboard
            </Link>
          </SignedIn>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            className="relative ml-1 h-9 w-9 rounded-full border border-black/10 bg-white/60 backdrop-blur md:hidden"
          >
            <span className={cn("absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 bg-[var(--site-ink)] transition-transform", open ? "rotate-45" : "-translate-y-[4px]")} />
            <span className={cn("absolute left-1/2 top-1/2 h-[1.5px] w-4 -translate-x-1/2 bg-[var(--site-ink)] transition-transform", open ? "-rotate-45" : "translate-y-[4px]")} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mx-4 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-lg md:hidden"
          >
            <div className="flex flex-col p-2">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-[15px] text-[#3c3a35] transition hover:bg-[var(--site-band)]"
                >
                  {n.label}
                </Link>
              ))}
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
      { href: "/features", label: "Hermes" },
      { href: "/features", label: "OpenClaw" },
      { href: "/features", label: "Goose" },
      { href: "/features", label: "Generic CLI" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/changelog", label: "News" },
      { href: "/status", label: "Trust" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24">
      <div className="absolute inset-0">
        <ImagePlaceholder label="Footer artwork" className="h-full w-full" />
      </div>
      <div className="relative mx-auto max-w-[1060px] px-5 pb-12 pt-16 sm:px-7">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-[15px] font-semibold text-[var(--site-ink)]">{col.title}</p>
              <ul className="space-y-2.5 text-[14.5px] text-[#4b4943]">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="transition hover:text-[var(--site-ink)]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* tall spacer so the placeholder artwork has room to breathe, echoing
            the reference footer where the illustration dominates */}
        <div className="h-[220px] sm:h-[300px]" aria-hidden />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#4b4943]">
          <span>© Cadre {new Date().getFullYear()}</span>
          <Link href="/about" className="hover:text-[var(--site-ink)]">Privacy Policy</Link>
          <Link href="/status" className="hover:text-[var(--site-ink)]">Security</Link>
        </div>
      </div>
      <div className="relative bg-[#101210]">
        <div className="mx-auto flex max-w-[1060px] flex-col items-center gap-3 px-5 py-5 text-center sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:text-left">
          <span className="flex items-center gap-2 text-lg font-semibold text-white">
            <Mark className="h-5 w-5" />
            Cadre
          </span>
          <span className="text-[13px] text-white/50">The control plane for autonomous agents</span>
        </div>
      </div>
    </footer>
  );
}
