"use client";

import { useEffect } from "react";

/**
 * Next.js `template.tsx` convention: this component gets a brand-new
 * instance on every navigation within `/dashboard`, even between sibling
 * routes that share the same layout. The actual page-transition motion
 * (fade + rise, with a real exit before the next route enters) now lives
 * once at the persistent shell level — `PageTransition` wraps `{children}`
 * in `app/dashboard/layout.tsx` — because a layout doesn't remount on
 * navigation the way this file does, so that's the only place an
 * AnimatePresence exit animation can actually run. Layering another
 * transition here on top would just double-animate every route change.
 *
 * What this remount-per-navigation guarantee is still good for: resetting
 * the app's scrollable content pane back to the top on every route change.
 * `<main>` (the scroll container, see layout.tsx) never unmounts across a
 * client-side navigation, so without this its scroll position would carry
 * over from whatever the previous page left it at, and a short page would
 * open still scrolled halfway down.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.getElementById("main-content")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  return <>{children}</>;
}
