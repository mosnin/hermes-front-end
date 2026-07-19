"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ClerkLoaded, ClerkLoading } from "@clerk/nextjs";
import { motion, useReducedMotion } from "motion/react";
import { DURATION, EASE, STAGGER } from "@/components/site/motion";
import { cn } from "@/lib/utils";
import { Mark, TYPE_H2 } from "@/components/site/ui";
import { ConnectMock } from "@/components/site/mockups";
import { BreathingRings } from "@/components/site/illustration/packet";

/* ---------------------------------------------------------------------------
   The auth wall: the same light editorial system as the marketing site and
   application shell (paper white, warm beige band, ink text, hairline
   borders), laid out as a split panel exactly like the reference: brand +
   an animated illustration on one side, the Clerk form on the other. Clerk's
   own visual theme is set globally in app/layout.tsx; this shell only frames
   it and supplies the entrance motion. Auth flows themselves are untouched:
   `children` renders whatever Clerk component the page passes in, unchanged.
--------------------------------------------------------------------------- */

const panelVariants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

function EntranceGroup({
  children,
  className,
  delayStart = 0,
}: {
  children: ReactNode;
  className?: string;
  delayStart?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? "show" : "hidden"}
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : STAGGER.loose, delayChildren: delayStart } },
      }}
    >
      {children}
    </motion.div>
  );
}

function EntranceItem({ children, className, y = 16 }: { children: ReactNode; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : y },
        show: { opacity: 1, y: 0, transition: { duration: reduce ? DURATION.reduced : DURATION.slow, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

/** The stat row under the illustration on the brand panel. */
function ProofStrip() {
  return (
    <div className="flex items-center gap-4 border-t border-[var(--site-line)] pt-5">
      <div className="flex -space-x-2">
        {["#c9c6bf", "#a7a49c", "#8a8781"].map((c, i) => (
          <span
            key={i}
            className="h-7 w-7 rounded-full border-2 border-[var(--site-band)]"
            style={{ background: c }}
            aria-hidden
          />
        ))}
      </div>
      <p className="text-[13px] leading-snug text-[#6c6a64]">
        Teams run thousands of autonomous agent tasks a day on Cadre&apos;s
        control plane.
      </p>
    </div>
  );
}

/** Global keyframes for the small settle-in Clerk's own error/warning/info
 *  nodes get when they mount (see the `cd-auth-in` class wired through the
 *  `appearance.elements` map in app/layout.tsx). Scoped to this component
 *  tree only via a unique class name, not touching app/globals.css (Lane C's
 *  file); fully inert under reduced motion. */
function AuthMotionStyles() {
  return (
    <style>{`
      @keyframes cd-auth-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .cd-auth-in { animation: cd-auth-in 0.22s cubic-bezier(0.22, 0.61, 0.24, 1) both; }
      @media (prefers-reduced-motion: reduce) {
        .cd-auth-in { animation: none; }
      }
    `}</style>
  );
}

/** A field-shaped placeholder bar; pulses gently while ambient (reduced
 *  motion collapses it to a static, settled fill). */
function SkeletonBar({ className, delay = 0, reduce }: { className: string; delay?: number; reduce: boolean }) {
  return (
    <motion.div
      className={cn("bg-[var(--site-card)]", className)}
      animate={reduce ? { opacity: 0.7 } : { opacity: [0.5, 0.85, 0.5] }}
      transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

/** Stand-in for the Clerk form while its bundle/session state loads, shaped
 *  like the real thing (label rows, an input, a primary pill) so the swap
 *  to the live form on `<ClerkLoaded>` reads as a fill-in, not a layout
 *  jump. Purely presentational; renders whenever Clerk hasn't mounted yet. */
function FormSkeleton() {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-4" aria-hidden role="presentation">
      <div className="space-y-2">
        <SkeletonBar className="h-3 w-24 rounded-md" reduce={!!reduce} />
        <SkeletonBar className="h-10 w-full rounded-xl" reduce={!!reduce} delay={0.08} />
      </div>
      <div className="space-y-2">
        <SkeletonBar className="h-3 w-20 rounded-md" reduce={!!reduce} delay={0.05} />
        <SkeletonBar className="h-10 w-full rounded-xl" reduce={!!reduce} delay={0.13} />
      </div>
      <SkeletonBar className="mt-2 h-10 w-full rounded-full" reduce={!!reduce} delay={0.18} />
      <div className="flex items-center gap-3 pt-1">
        <SkeletonBar className="h-px flex-1 rounded-none" reduce={!!reduce} delay={0.1} />
        <SkeletonBar className="h-3 w-16 shrink-0 rounded-md" reduce={!!reduce} delay={0.12} />
        <SkeletonBar className="h-px flex-1 rounded-none" reduce={!!reduce} delay={0.1} />
      </div>
      <SkeletonBar className="h-10 w-full rounded-xl" reduce={!!reduce} delay={0.2} />
    </div>
  );
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  headline,
  bodyCopy,
  footer,
  children,
}: {
  /** Small mono label above the form heading, e.g. "Sign in". */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Editorial headline on the left brand panel. */
  headline: string;
  bodyCopy: string;
  /** Optional content rendered below the form, e.g. a "Sign up instead" note. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="site-light grid min-h-screen bg-white lg:grid-cols-2">
      <AuthMotionStyles />
      {/* Brand + illustration panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--site-band)] px-12 py-10 lg:flex xl:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent 0 22px, rgba(31,31,28,0.035) 22px 23px)",
          }}
        />
        <EntranceGroup className="relative">
          <EntranceItem>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--site-ink)]"
            >
              <Mark />
              Cadre
            </Link>
          </EntranceItem>
          <EntranceItem className="mt-16 max-w-md" y={20}>
            <h2 className={TYPE_H2}>{headline}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#6c6a64]">{bodyCopy}</p>
          </EntranceItem>
        </EntranceGroup>

        <motion.div
          initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.96, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reduce ? DURATION.reduced : DURATION.slower, delay: reduce ? 0 : 0.25, ease: EASE }}
          className="relative z-[1] mx-auto my-8 w-full max-w-[320px]"
        >
          <div className="relative">
            <BreathingRings
              count={2}
              baseSize={300}
              step={26}
              color="#dcd9d2"
              duration={3.4}
              className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[999px]"
            />
            <div className="relative rounded-modal bg-white p-1.5 shadow-[0_20px_50px_rgba(31,31,28,0.10)]">
              <ConnectMock />
            </div>
          </div>
        </motion.div>

        <EntranceGroup className="relative" delayStart={reduce ? 0 : 0.5}>
          <EntranceItem>
            <ProofStrip />
          </EntranceItem>
        </EntranceGroup>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-14 sm:px-12 md:px-16 lg:px-14 xl:px-20">
        <motion.div
          initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? DURATION.reduced : DURATION.slow, ease: EASE }}
          className="mx-auto w-full max-w-[400px]"
        >
          <Link
            href="/"
            className="mb-10 inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[var(--site-ink)] lg:hidden"
          >
            <Mark />
            Cadre
          </Link>

          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-[var(--site-body)]">
            {eyebrow}
          </p>
          <h1 className="text-[28px] font-semibold tracking-tight text-[var(--site-ink)] sm:text-[32px]">
            {title}
          </h1>
          <p className="mt-2 text-[15px] text-[#6c6a64]">{subtitle}</p>

          <div className="mt-8">
            {/* Clerk's SDK/session bootstrap can take a beat on a cold load;
                show a shaped skeleton instead of a blank panel, then cross
                the real form in once it mounts. Neither branch touches
                Clerk's own auth logic, only what wraps it while it loads. */}
            <ClerkLoading>
              <motion.div
                initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
              >
                <FormSkeleton />
              </motion.div>
            </ClerkLoading>
            <ClerkLoaded>
              <motion.div
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? DURATION.reduced : DURATION.base, ease: EASE }}
              >
                {children}
              </motion.div>
            </ClerkLoaded>
          </div>

          {footer && <div className="mt-6 text-[13px] text-[var(--site-body)]">{footer}</div>}
        </motion.div>
      </div>
    </div>
  );
}
