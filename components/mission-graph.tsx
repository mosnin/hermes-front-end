"use client";

import { useMemo } from "react";
import { StatusDot } from "@/components/ui";
import { cn } from "@/lib/utils";

export type GraphAgent = {
  id: string;
  name: string;
  platform: string | null;
  kind: string;
  status: string;
  online: boolean;
};

export type GraphEdge = {
  from: string;
  to: string;
  count: number;
};

/**
 * Dependency-free radial topology. Agents are laid out on a circle as
 * absolutely-positioned nodes; A2A relationships are drawn as SVG lines
 * underneath. Online agents pulse.
 */
export function MissionGraph({
  agents,
  edges,
}: {
  agents: GraphAgent[];
  edges: GraphEdge[];
}) {
  // Polar layout in a normalized 0..100 viewBox so the graph scales fluidly.
  const positions = useMemo(() => {
    const cx = 50;
    const cy = 50;
    const radius = agents.length <= 1 ? 0 : 38;
    const map = new Map<string, { x: number; y: number }>();
    agents.forEach((a, i) => {
      // Start at the top (-90deg) and go clockwise.
      const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      map.set(a.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    return map;
  }, [agents]);

  const maxCount = useMemo(
    () => edges.reduce((m, e) => Math.max(m, e.count), 1),
    [edges],
  );

  return (
    <div className="relative aspect-square w-full">
      {/* Edges + ambient rings sit behind the nodes. */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="mc-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(99 102 241 / 0.25)" />
            <stop offset="70%" stopColor="rgb(99 102 241 / 0.04)" />
            <stop offset="100%" stopColor="rgb(99 102 241 / 0)" />
          </radialGradient>
        </defs>

        {/* Concentric guide rings for a "command center" feel. */}
        <circle cx="50" cy="50" r="44" className="fill-none stroke-border/40" strokeWidth="0.2" />
        <circle cx="50" cy="50" r="30" className="fill-none stroke-border/30" strokeWidth="0.2" />
        <circle cx="50" cy="50" r="16" className="fill-none stroke-border/20" strokeWidth="0.2" />
        <circle cx="50" cy="50" r="44" fill="url(#mc-core)" />

        {edges.map((e, i) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const weight = 0.25 + (e.count / maxCount) * 0.7;
          return (
            <g key={`${e.from}-${e.to}-${i}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="stroke-indigo-400/30"
                strokeWidth={weight}
                strokeLinecap="round"
              />
              {/* Animated packet travelling along the edge. */}
              <circle r="0.7" className="fill-indigo-300">
                <animateMotion
                  dur={`${2.4 + (i % 4) * 0.5}s`}
                  repeatCount="indefinite"
                  path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                />
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Central hub label. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-[10px] uppercase tracking-widest text-muted">A2A broker</p>
        <p className="text-xs font-semibold text-accent">Hermes</p>
      </div>

      {/* Agent nodes. */}
      {agents.map((a) => {
        const p = positions.get(a.id);
        if (!p) return null;
        return (
          <div
            key={a.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="relative">
                {a.online && (
                  <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-emerald-400/30" />
                )}
                <div
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border bg-surface-2 text-xs font-semibold shadow-lg",
                    a.online
                      ? "border-emerald-400/60 text-emerald-300"
                      : a.status === "degraded"
                        ? "border-amber-400/50 text-amber-300"
                        : "border-border text-muted",
                  )}
                  title={`${a.name} · ${a.status}`}
                >
                  {initials(a.name)}
                </div>
              </div>
              <div className="flex max-w-[7rem] flex-col items-center">
                <div className="flex items-center gap-1">
                  <StatusDot status={a.status} />
                  <span className="truncate text-[11px] font-medium text-foreground">
                    {a.name}
                  </span>
                </div>
                {a.platform && (
                  <span className="truncate text-[10px] text-muted">{a.platform}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
