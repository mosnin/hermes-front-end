"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Keyboard } from "@/components/icons";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Open command palette / actions" },
  { keys: ["?"], label: "Show this shortcuts sheet" },
  { keys: ["Esc"], label: "Close any overlay" },
  { keys: ["↑", "↓"], label: "Move through palette results" },
  { keys: ["↵"], label: "Run the selected command" },
];

/**
 * Global keyboard-shortcut help. Press "?" anywhere (outside a text field) to
 * reveal it — the discoverability layer that makes the keyboard-first UX feel
 * intentional rather than hidden.
 */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] grid place-items-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Keyboard className="h-5 w-5 text-accent" /> Keyboard shortcuts
            </h2>
            <ul className="space-y-2.5">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted">{s.label}</span>
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-6 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-center text-xs"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
