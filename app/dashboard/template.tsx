"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Route-transition wrapper: templates remount on every navigation, so each
 * dashboard page eases in with a short rise — the whole app feels responsive
 * without any per-page wiring. Honors prefers-reduced-motion.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="h-full"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.8, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
