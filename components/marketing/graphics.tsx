"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Designed, animated SVG graphics. These replace stock icons — each is a small
   piece of generative-looking art in the house palette (orange #ff5b04, lime
   #a3e635, cyan #67e8f9) on the dark instrument surface. All honor reduced
   motion. Sized by the wrapper; draw at 100x100 and scale.
--------------------------------------------------------------------------- */

const ACCENT = "#ff5b04";
const LIME = "#a3e635";
const CYAN = "#67e8f9";

function Frame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("h-full w-full", className)}
      fill="none"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** A processor die: pins on four edges, internal traces, a pulsing core.
    "Little computer chip." */
export function ChipGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const pins = Array.from({ length: 6 }, (_, i) => 24 + i * 10.4);
  return (
    <Frame className={className}>
      {/* pins */}
      {pins.map((p, i) => (
        <g key={i} stroke="#3a3a3a" strokeWidth="2">
          <line x1={p} y1="14" x2={p} y2="24" />
          <line x1={p} y1="76" x2={p} y2="86" />
          <line x1="14" y1={p} x2="24" y2={p} />
          <line x1="76" y1={p} x2="86" y2={p} />
        </g>
      ))}
      {/* die */}
      <rect x="24" y="24" width="52" height="52" rx="8" fill="#161616" stroke="#2f2f2f" strokeWidth="1.5" />
      {/* traces */}
      <g stroke="#2a2a2a" strokeWidth="1.4">
        <path d="M34 40 H50 V56" />
        <path d="M66 36 V52 H50" />
        <path d="M34 62 H44" />
      </g>
      {/* current pulses along traces */}
      {!reduce && (
        <>
          <motion.circle r="1.6" fill={ACCENT}
            animate={{ offsetDistance: ["0%", "100%"] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            style={{ offsetPath: "path('M34 40 H50 V56')" } as never} />
          <motion.circle r="1.6" fill={CYAN}
            animate={{ offsetDistance: ["0%", "100%"] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "linear", delay: 0.6 }}
            style={{ offsetPath: "path('M66 36 V52 H50')" } as never} />
        </>
      )}
      {/* core */}
      <motion.rect
        x="44" y="44" width="12" height="12" rx="3" fill={ACCENT}
        animate={reduce ? {} : { opacity: [0.6, 1, 0.6], scale: [1, 1.12, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "50px 50px", filter: `drop-shadow(0 0 6px ${ACCENT})` }}
      />
    </Frame>
  );
}

/** Agent-to-agent mesh: nodes with packets traveling the edges. */
export function MeshGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const nodes = [
    { x: 50, y: 22 },
    { x: 24, y: 44 },
    { x: 76, y: 44 },
    { x: 34, y: 74 },
    { x: 66, y: 74 },
  ];
  const edges = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [1, 2],
  ];
  return (
    <Frame className={className}>
      {edges.map(([a, b], i) => {
        const d = `M${nodes[a].x} ${nodes[a].y} L${nodes[b].x} ${nodes[b].y}`;
        return (
          <g key={i}>
            <path d={d} stroke="#2c2c2c" strokeWidth="1.4" />
            {!reduce && (
              <motion.circle r="1.8" fill={i % 2 ? LIME : ACCENT}
                animate={{ offsetDistance: ["0%", "100%"] }}
                transition={{ duration: 1.8 + i * 0.2, repeat: Infinity, ease: "linear", delay: i * 0.3 }}
                style={{ offsetPath: `path('${d}')` } as never} />
            )}
          </g>
        );
      })}
      {nodes.map((n, i) => (
        <motion.circle key={i} cx={n.x} cy={n.y} r="5" fill="#161616" stroke={i === 0 ? ACCENT : "#3a3a3a"} strokeWidth="2"
          animate={reduce ? {} : { stroke: [i === 0 ? ACCENT : "#3a3a3a", ACCENT, "#3a3a3a"] }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }} />
      ))}
    </Frame>
  );
}

/** Orchestration orbit: a core with agents circling on dotted rings. */
export function OrbitGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const rings = [18, 28, 38];
  return (
    <Frame className={className}>
      {rings.map((r, i) => (
        <circle key={i} cx="50" cy="50" r={r} stroke="#2c2c2c" strokeWidth="1" strokeDasharray="1.5 4" />
      ))}
      <motion.circle cx="50" cy="50" r="7" fill={ACCENT}
        style={{ filter: `drop-shadow(0 0 6px ${ACCENT})`, transformOrigin: "50px 50px" }}
        animate={reduce ? {} : { scale: [1, 1.1, 1] }} transition={{ duration: 2.5, repeat: Infinity }} />
      {rings.map((r, i) => (
        <motion.g key={i} style={{ transformOrigin: "50px 50px" }}
          animate={reduce ? {} : { rotate: i % 2 ? -360 : 360 }}
          transition={{ duration: 8 + i * 4, repeat: Infinity, ease: "linear" }}>
          <circle cx={50 + r} cy="50" r="3" fill={[LIME, CYAN, "#fff"][i]} />
        </motion.g>
      ))}
    </Frame>
  );
}

/** Real-time signal: an animated line with a moving scan head. */
export function WaveGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const d = "M8 60 Q22 30 34 52 T60 44 T86 34";
  return (
    <Frame className={className}>
      <line x1="8" y1="72" x2="92" y2="72" stroke="#2a2a2a" strokeWidth="1" />
      <motion.path d={d} stroke={ACCENT} strokeWidth="2.4" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${ACCENT})` }}
        initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: "easeInOut" }} />
      {!reduce && (
        <motion.circle r="2.6" fill="#fff"
          animate={{ offsetDistance: ["0%", "100%"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ offsetPath: `path('${d}')` } as never} />
      )}
    </Frame>
  );
}

/** Governance: a hex shield with a sweeping scan line. */
export function ShieldGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const hex = "M50 16 L78 30 V56 Q78 74 50 84 Q22 74 22 56 V30 Z";
  return (
    <Frame className={className}>
      <path d={hex} fill="#161616" stroke="#3a3a3a" strokeWidth="2" />
      <motion.path d={hex} fill="none" stroke={ACCENT} strokeWidth="2"
        initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: "easeInOut" }}
        style={{ filter: `drop-shadow(0 0 5px ${ACCENT})` }} />
      <path d="M40 50 L47 58 L61 42" stroke={LIME} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {!reduce && (
        <motion.line x1="24" x2="76" stroke={CYAN} strokeWidth="1.5" opacity="0.5"
          animate={{ y1: [30, 78, 30], y2: [30, 78, 30] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
      )}
    </Frame>
  );
}

/** Skills/knowledge: stacked nodes with a search sweep. */
export function KnowledgeGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <Frame className={className}>
      {[30, 44, 58, 72].map((y, i) => (
        <g key={i}>
          <rect x="22" y={y - 5} width="46" height="9" rx="3" fill="#161616" stroke="#2f2f2f" />
          <motion.rect x="22" y={y - 5} width="46" height="9" rx="3" fill="none" stroke={ACCENT} strokeWidth="1.5"
            animate={reduce ? {} : { opacity: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }} />
        </g>
      ))}
      <motion.circle cx="74" cy="30" r="8" fill="none" stroke={CYAN} strokeWidth="2.5"
        animate={reduce ? {} : { cy: [30, 72, 30] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
      <motion.line x1="80" y1="36" x2="86" y2="42" stroke={CYAN} strokeWidth="2.5" strokeLinecap="round"
        animate={reduce ? {} : { y1: [36, 78, 36], y2: [42, 84, 42] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
    </Frame>
  );
}

/** Integrations/MCP: a hub plugging into ports. */
export function PlugGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const ports = [{ x: 20, y: 30 }, { x: 20, y: 70 }, { x: 80, y: 30 }, { x: 80, y: 70 }];
  return (
    <Frame className={className}>
      <rect x="40" y="40" width="20" height="20" rx="5" fill={ACCENT} style={{ filter: `drop-shadow(0 0 5px ${ACCENT})` }} />
      {ports.map((p, i) => {
        const d = `M50 50 L${p.x} ${p.y}`;
        return (
          <g key={i}>
            <path d={d} stroke="#2c2c2c" strokeWidth="1.6" />
            <circle cx={p.x} cy={p.y} r="4.5" fill="#161616" stroke="#3a3a3a" strokeWidth="2" />
            {!reduce && (
              <motion.circle r="1.8" fill={LIME}
                animate={{ offsetDistance: ["0%", "100%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: i * 0.4 }}
                style={{ offsetPath: `path('${d}')` } as never} />
            )}
          </g>
        );
      })}
    </Frame>
  );
}

/** Threads/tasks: a checklist that fills in. */
export function TasksGraphic({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <Frame className={className}>
      {[28, 44, 60, 76].map((y, i) => (
        <g key={i}>
          <rect x="24" y={y - 6} width="12" height="12" rx="3" fill="#161616" stroke="#3a3a3a" strokeWidth="1.5" />
          <line x1="42" y1={y} x2="76" y2={y} stroke="#2c2c2c" strokeWidth="2.5" strokeLinecap="round" />
          <motion.path d={`M27 ${y} L30 ${y + 3} L34 ${y - 3}`} stroke={LIME} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"
            initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
            transition={{ duration: 0.4, delay: reduce ? 0 : 0.3 + i * 0.25 }} />
        </g>
      ))}
    </Frame>
  );
}

export const GRAPHICS = {
  chip: ChipGraphic,
  mesh: MeshGraphic,
  orbit: OrbitGraphic,
  wave: WaveGraphic,
  shield: ShieldGraphic,
  knowledge: KnowledgeGraphic,
  plug: PlugGraphic,
  tasks: TasksGraphic,
} as const;

export type GraphicName = keyof typeof GRAPHICS;
