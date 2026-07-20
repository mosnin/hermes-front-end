"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MagneticButton } from "./motion";

/* ---------------------------------------------------------------------------
   Shared UI-kit for the marketing site: brand mark, pill buttons (magnetic +
   press-responsive via Lane A's MagneticButton), and section headers. The
   reusable motion toolkit itself (Reveal, Stagger, CountUp, Marquee,
   TextReveal, Parallax, PageTransition, StickyScene) lives in
   components/site/motion.tsx; every (site) page imports it from there.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Shared design constants (cycle 7: cross-surface consistency). The site's
   whole corner-radius and headline type scale collapses to these few named
   values so every page reads as one system instead of one-off px picks.
   Motion timing's single shared constant is `EASE`, exported from ./motion;
   every page imports it directly rather than re-typing the curve inline.
--------------------------------------------------------------------------- */

/** Corner-radius scale shared by every card/tile across the site. Compose
 *  with `cn(RADIUS.card, "bg-... p-...")` rather than a bespoke `rounded-[Npx]`. */
export const RADIUS = {
  /** Compact nested callout inside a larger card (e.g. the highlight row
   *  under a product mock, the mobile nav popover). */
  compact: "rounded-[18px]",
  /** Photo/portrait/cover placeholder crops. */
  image: "rounded-[20px]",
  /** Standard grid tile / testimonial panel. */
  tile: "rounded-[22px]",
  /** Prominent standalone card: pricing plan, feature pillar mock, status
   *  pill, list-card wrapper (contact rows, status components). */
  card: "rounded-[24px]",
} as const;

/** Hero (H1) headline scale, shared by every page's top-of-page headline.
 *  Deliberately carries no color so a page can layer its own ink tone
 *  (nearly every page uses `text-[var(--site-ink)]`; the home hero sits over
 *  a fading image and uses a slightly softer tone). */
export const TYPE_H1 = "text-[44px] font-medium leading-[1.06] tracking-[-0.015em] sm:text-[64px]";

/** Section (H2) headline scale, shared by every page's section headers
 *  (also used by `SectionHead` below). */
export const TYPE_H2 =
  "text-[34px] font-medium leading-[1.12] tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]";

/** The asterisk-style brand mark. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-[18px] w-[18px]", className)} aria-hidden>
      <g stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
        <path d="M12 3v18" />
        <path d="M4.2 7.5l15.6 9" />
        <path d="M19.8 7.5l-15.6 9" />
      </g>
    </svg>
  );
}

/** Solid near-black pill button. Magnetic on hover, presses on tap. */
export function DarkPill({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MagneticButton strength={0.3} range={10}>
      <Link
        href={href}
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-[#1f1f1c] px-5 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-black",
          className,
        )}
      >
        {children}
      </Link>
    </MagneticButton>
  );
}

/** Outline pill with a chevron, e.g. "Explore >". Magnetic + the chevron
 *  nudges forward on hover. */
export function ExplorePill({
  href = "/features",
  children = "Explore",
  className,
}: {
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <MagneticButton strength={0.26} range={8} className="group">
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-[var(--site-line)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--site-ink)] shadow-[0_1px_2px_rgba(31,31,28,0.04)] transition-colors hover:border-[#d6d4cd]",
          className,
        )}
      >
        {children}
        <svg
          viewBox="0 0 12 12"
          className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
          aria-hidden
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </MagneticButton>
  );
}

/** Small grey pill label above section headlines. */
export function PillLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-[var(--site-band)] px-3 py-1 text-[12.5px] font-medium text-[#5f5d57]">
      {children}
    </span>
  );
}

/** Section headline pair used across product sections. */
export function SectionHead({
  label,
  title,
  sub,
  explore,
  className,
}: {
  label?: string;
  title: React.ReactNode;
  sub?: string;
  explore?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-6", className)}>
      <div>
        {label && (
          <div className="mb-4">
            <PillLabel>{label}</PillLabel>
          </div>
        )}
        <h2 className={TYPE_H2}>{title}</h2>
        {sub && (
          <p className="mt-3 max-w-md text-[17px] leading-relaxed text-[var(--site-body)]">
            {sub}
          </p>
        )}
      </div>
      {explore && <ExplorePill href={explore} className="mt-1 shrink-0" />}
    </div>
  );
}
