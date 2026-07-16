import { ReactNode } from "react";

/**
 * Terminal-style breadcrumb that sits above a page title, e.g.
 * `cadre://analytics`. Ties dashboard surfaces to the mission-control
 * aesthetic without disturbing each page's existing header layout.
 */
export function PagePath({
  children,
  live = true,
}: {
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <p className="mb-1.5 flex items-center gap-2 font-mono text-xs text-muted">
      <span className="text-accent">cadre://{children}</span>
      {live && (
        <>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime-400" />
            </span>
            live
          </span>
        </>
      )}
    </p>
  );
}
