import Link from "next/link";
import { cn } from "@/lib/utils";

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

/** Solid near-black pill button. */
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
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[#1f1f1c] px-5 py-2.5 text-[15px] font-medium text-white transition hover:bg-black",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Outline pill with a chevron, e.g. "Explore >". */
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
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--site-line)] bg-white px-4 py-2 text-[14px] font-medium text-[var(--site-ink)] shadow-[0_1px_2px_rgba(31,31,28,0.04)] transition hover:border-[#d6d4cd]",
        className,
      )}
    >
      {children}
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
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
        <h2 className="text-[34px] font-medium leading-[1.12] tracking-[-0.01em] text-[var(--site-ink)] sm:text-[40px]">
          {title}
        </h2>
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
