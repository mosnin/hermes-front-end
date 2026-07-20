import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Image placeholder. Everywhere the reference design uses a photo or painted
   artwork we render an honest placeholder: flat quiet fill, hairline border,
   small frame glyph in the corner. Swap for a real <Image> when assets exist.
--------------------------------------------------------------------------- */

export function ImagePlaceholder({
  label = "Image",
  className,
  dark,
  fadeBottom,
  children,
}: {
  label?: string;
  className?: string;
  /** darker fill for cards that sit on white */
  dark?: boolean;
  /** dissolve the lower edge into white (hero treatment) */
  fadeBottom?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        dark ? "bg-[#e3e1db]" : "bg-[#eceae4]",
        className,
      )}
    >
      {/* subtle diagonal hatch so it reads as "asset goes here" */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 22px, rgba(31,31,28,0.045) 22px 23px)",
        }}
      />
      <div
        aria-hidden
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-md bg-white/70 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[#8a8781]"
      >
        <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
          <circle cx="5" cy="5.2" r="1.1" />
          <path d="M2.5 10.5l3-3 2.5 2.5 2-2 1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </div>
      {fadeBottom && (
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-white" />
      )}
      {children}
    </div>
  );
}

/** Back-compat alias used by chrome/mockups. */
export function Painting({
  scene,
  className,
  fadeBottom,
  children,
}: {
  scene?: string;
  className?: string;
  fadeBottom?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <ImagePlaceholder
      label={scene ? `Image · ${scene}` : "Image"}
      className={className}
      fadeBottom={fadeBottom}
    >
      {children}
    </ImagePlaceholder>
  );
}
