"use client";

import { ReactNode, useMemo, useState } from "react";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { RingGauge, type RingColor } from "./ui";

const SPARK_COLORS: Record<string, { stroke: string; fill: string }> = {
  accent: { stroke: "#ff5b04", fill: "rgba(255,91,4,0.14)" },
  green: { stroke: "#a3e635", fill: "rgba(163,230,53,0.12)" },
  yellow: { stroke: "#facc15", fill: "rgba(250,204,21,0.12)" },
  red: { stroke: "#ef4444", fill: "rgba(239,68,68,0.14)" },
  cyan: { stroke: "#67e8f9", fill: "rgba(103,232,249,0.12)" },
  muted: { stroke: "#4a4a4a", fill: "rgba(120,120,120,0.08)" },
};

/**
 * Area sparkline with faint column grid and a time axis — the instrument-panel
 * chart at the bottom of every sensor card. Pure SVG, no chart lib.
 */
export function AreaSpark({
  data,
  color = "accent",
  height = 88,
  axis = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"],
  className,
}: {
  data: number[];
  color?: RingColor;
  height?: number;
  axis?: string[];
  className?: string;
}) {
  const c = SPARK_COLORS[color] ?? SPARK_COLORS.accent;
  const W = 320;
  const H = 64;
  const path = useMemo(() => {
    if (!data.length) return { line: "", area: "" };
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const span = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * W;
      const y = H - 6 - ((v - min) / span) * (H - 14);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = `M${pts.join(" L")}`;
    const area = `${line} L${W},${H} L0,${H} Z`;
    return { line, area };
  }, [data]);

  return (
    <div className={cn("select-none", className)} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height: height - 18 }}
      >
        {/* faint column grid */}
        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={i}
            x1={(i / 6) * W}
            y1="0"
            x2={(i / 6) * W}
            y2={H}
            stroke="var(--border)"
            strokeWidth="0.6"
          />
        ))}
        {data.length > 0 && (
          <>
            <path d={path.area} fill={c.fill} />
            <path
              d={path.line}
              fill="none"
              stroke={c.stroke}
              strokeWidth="1.6"
              style={{ filter: `drop-shadow(0 0 4px ${c.fill.replace("0.1", "0.5")})` }}
            />
          </>
        )}
      </svg>
      <div className="flex justify-between px-0.5 pt-1 text-[9px] tracking-wide text-muted/70">
        {axis.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Small unit-pill pair (°C/°F style). Purely visual selector. */
export function UnitPills({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-border">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange?.(o)}
          className={cn(
            "px-2.5 py-1 text-xs transition",
            o === value
              ? "bg-surface-2 text-foreground"
              : "bg-transparent text-muted hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/**
 * The chirp sensor card: icon + title, "Last update", unit pills + gear row,
 * glowing ring gauge on the right, area chart across the bottom. `alert`
 * renders the red-bordered, red-glow variant.
 */
export function SensorCard({
  icon,
  title,
  lastUpdate,
  value,
  unit,
  color = "accent",
  pct = 1,
  data,
  axis,
  units,
  alert,
  alertLabel,
  onGear,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  lastUpdate?: string;
  value: ReactNode;
  unit?: string;
  color?: RingColor;
  pct?: number;
  data?: number[];
  axis?: string[];
  units?: string[];
  alert?: boolean;
  alertLabel?: string;
  onGear?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  const [u, setU] = useState(units?.[0] ?? "");
  const tone: RingColor = alert ? "red" : color;
  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-surface p-4",
        alert
          ? "border-red-500/60 shadow-[0_0_24px_rgba(239,68,68,0.12)]"
          : "border-border",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon && <span className={alert ? "text-red-400" : "text-muted"}>{icon}</span>}
            <h3 className="truncate text-sm font-medium">{title}</h3>
          </div>
          {lastUpdate && (
            <p className="mt-1 text-xs text-muted">Last update: {lastUpdate}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {units && units.length > 0 && (
              <UnitPills options={units} value={u} onChange={setU} />
            )}
            {onGear && (
              <button
                onClick={onGear}
                className="rounded-lg border border-border p-1.5 text-muted transition hover:text-foreground"
                title="Configure"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <RingGauge value={value} unit={unit} color={tone} pct={pct} size={92} />
      </div>

      {alert && alertLabel && (
        <div className="mt-3 inline-block rounded-lg bg-surface-2 px-3 py-1.5 text-xs text-red-400">
          {alertLabel}
        </div>
      )}

      {data && <AreaSpark data={data} color={tone} axis={axis} className="mt-3" />}
      {children}
    </div>
  );
}
