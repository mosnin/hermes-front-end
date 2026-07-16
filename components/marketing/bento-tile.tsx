"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A bento cell: bordered, rounded, hover-lift, with an optional designed
 * graphic sitting in a framed well. The graphic is the hero of the card, not a
 * decorative icon.
 */
export function BentoTile({
  title,
  body,
  graphic,
  className,
  accent,
  children,
}: {
  title?: string;
  body?: string;
  graphic?: ReactNode;
  className?: string;
  accent?: boolean;
  children?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.21, 0.55, 0.3, 1] }}
      whileHover={{ y: -4 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-6 transition-colors",
        accent ? "border-accent/40" : "border-border hover:border-accent/40",
        className,
      )}
    >
      {graphic && (
        <div className="mb-5 aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-[#0c0c0c]">
          <div className="grid h-full w-full place-items-center p-4">{graphic}</div>
        </div>
      )}
      {title && (
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      )}
      {body && <p className="mt-2 text-sm text-muted">{body}</p>}
      {children}
    </motion.div>
  );
}
