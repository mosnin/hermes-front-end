import { ReactNode, SVGProps } from "react";

/* ---------------------------------------------------------------------------
   Bespoke line-icon set. Replaces lucide-react app-wide so the product carries
   one hand-drawn, restrained iconography instead of a stock icon library.
   Every glyph shares the Icon wrapper: 24x24 grid, currentColor stroke, 1.75
   weight, round caps. The public API (className, size, spread props) matches
   lucide's so imports are a drop-in swap.
--------------------------------------------------------------------------- */

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number | string;
};

function Icon({
  size,
  className,
  children,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* --- motion / arrows --------------------------------------------------------- */
export const Activity = (p: IconProps) => (
  <Icon {...p}><path d="M3 12h4l2.5 7 5-14 2.5 7H21" /></Icon>
);
export const ArrowUp = (p: IconProps) => (
  <Icon {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>
);
export const ArrowDown = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Icon>
);
export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>
);
export const ArrowRight = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
export const ChevronUp = (p: IconProps) => (
  <Icon {...p}><path d="M6 15l6-6 6 6" /></Icon>
);
export const ChevronDown = (p: IconProps) => (
  <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>
);
export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}><path d="M15 6l-6 6 6 6" /></Icon>
);
export const ChevronRight = (p: IconProps) => (
  <Icon {...p}><path d="M9 6l6 6-6 6" /></Icon>
);
export const ChevronsUp = (p: IconProps) => (
  <Icon {...p}><path d="M7 12l5-5 5 5M7 18l5-5 5 5" /></Icon>
);
export const Undo2 = (p: IconProps) => (
  <Icon {...p}><path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2" /></Icon>
);
export const RefreshCw = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M21 4v4h-4M3 20v-4h4" />
  </Icon>
);
export const Loader2 = (p: IconProps) => (
  <Icon {...p}><path d="M12 3a9 9 0 1 0 9 9" /></Icon>
);

/* --- status ------------------------------------------------------------------ */
export const Check = (p: IconProps) => (
  <Icon {...p}><path d="M5 12.5l4.5 4.5L19 6.5" /></Icon>
);
export const X = (p: IconProps) => (
  <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
);
export const Plus = (p: IconProps) => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
);
export const Circle = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /></Icon>
);
export const Square = (p: IconProps) => (
  <Icon {...p}><rect x="4" y="4" width="16" height="16" rx="2" /></Icon>
);
export const CheckCircle2 = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></Icon>
);
export const XCircle = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></Icon>
);
export const AlertCircle = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5" /><circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" /></Icon>
);
export const AlertTriangle = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.5l9.5 16.5H2.5L12 3.5Z" /><path d="M12 9.5v4.5" /><circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none" /></Icon>
);
export const Pause = (p: IconProps) => (
  <Icon {...p}><path d="M9 5v14M15 5v14" /></Icon>
);
export const Play = (p: IconProps) => (
  <Icon {...p}><path d="M7 5l12 7-12 7V5Z" /></Icon>
);
export const Power = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v9" /><path d="M6.3 6.3a9 9 0 1 0 11.4 0" /></Icon>
);

/* --- comms / feeds ----------------------------------------------------------- */
export const Bell = (p: IconProps) => (
  <Icon {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></Icon>
);
export const BellRing = (p: IconProps) => (
  <Icon {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /><path d="M20.5 5.5c1 1 1.5 2.3 1.5 3.5M3.5 5.5C2.5 6.5 2 7.8 2 9" /></Icon>
);
export const MessageSquare = (p: IconProps) => (
  <Icon {...p}><path d="M4 5h16v11H9l-5 4V5Z" /></Icon>
);
export const MessagesSquare = (p: IconProps) => (
  <Icon {...p}><path d="M3 4h13v9H8l-5 4V4Z" /><path d="M8 13v3a1 1 0 0 0 1 1h8l4 3V9a1 1 0 0 0-1-1h-1" /></Icon>
);
export const Send = (p: IconProps) => (
  <Icon {...p}><path d="M21 3L3 10.5l7 2.5 2.5 7L21 3Z" /><path d="M10 13l4-4" /></Icon>
);
export const Megaphone = (p: IconProps) => (
  <Icon {...p}><path d="M4 10v4l11 5V5L4 10Z" /><path d="M4 10H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1" /><path d="M8 15v3a2 2 0 0 0 4 0" /></Icon>
);
export const Radio = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="2" /><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" /></Icon>
);
export const Radar = (p: IconProps) => (
  <Icon {...p}><path d="M20 12a8 8 0 1 1-4.6-7.2" /><path d="M12 12l6-4" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>
);

/* --- data / files ------------------------------------------------------------ */
export const FileText = (p: IconProps) => (
  <Icon {...p}><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4" /><path d="M9 12h6M9 16h6" /></Icon>
);
export const FileSearch = (p: IconProps) => (
  <Icon {...p}><path d="M6 3h8l4 4v6" /><path d="M14 3v4h4" /><path d="M6 3v18h6" /><circle cx="16" cy="17" r="2.5" /><path d="M18 19l2 2" /></Icon>
);
export const ScrollText = (p: IconProps) => (
  <Icon {...p}><path d="M5 4h11v13a3 3 0 0 0 3 3H8a3 3 0 0 1-3-3V4Z" /><path d="M5 4a2 2 0 0 0-2 2v1h2M9 8h5M9 12h5" /></Icon>
);
export const Copy = (p: IconProps) => (
  <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>
);
export const Download = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v11M8 10l4 4 4-4" /><path d="M4 17v3h16v-3" /></Icon>
);
export const Hash = (p: IconProps) => (
  <Icon {...p}><path d="M9 3L7 21M17 3l-2 18M4 8.5h16M3 15.5h16" /></Icon>
);
export const BarChart3 = (p: IconProps) => (
  <Icon {...p}><path d="M4 4v16h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></Icon>
);
export const Gauge = (p: IconProps) => (
  <Icon {...p}><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 14l4-4" /><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" /></Icon>
);
export const History = (p: IconProps) => (
  <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></Icon>
);
export const CalendarClock = (p: IconProps) => (
  <Icon {...p}><path d="M4 6h12v5" /><path d="M4 6v14h7" /><path d="M8 3v4M14 3v4M4 10h12" /><circle cx="17" cy="16" r="4" /><path d="M17 14.5V16l1 1" /></Icon>
);

/* --- system / infra ---------------------------------------------------------- */
export const Cpu = (p: IconProps) => (
  <Icon {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /><rect x="10" y="10" width="4" height="4" rx="0.5" /><path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2" /></Icon>
);
export const Server = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></Icon>
);
export const Boxes = (p: IconProps) => (
  <Icon {...p}><path d="M12 3l4 2v4l-4 2-4-2V5l4-2Z" /><path d="M6 11l4 2v4l-4 2-4-2v-4l4-2Z" /><path d="M18 11l4 2v4l-4 2-4-2v-4l4-2Z" /></Icon>
);
export const Network = (p: IconProps) => (
  <Icon {...p}><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M12 12H6v4M12 12h6v4" /></Icon>
);
export const Cable = (p: IconProps) => (
  <Icon {...p}><path d="M5 3v4a3 3 0 0 0 3 3h8a3 3 0 0 1 3 3v4" /><path d="M3 4h4M3 7h4M17 17h4M17 20h4" /></Icon>
);
export const Plug = (p: IconProps) => (
  <Icon {...p}><path d="M12 12v9" /><path d="M7 8h10v2a5 5 0 0 1-10 0V8Z" /><path d="M9 8V3M15 8V3" /></Icon>
);
export const Link2 = (p: IconProps) => (
  <Icon {...p}><path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></Icon>
);
export const Cloud = (p: IconProps) => (
  <Icon {...p}><path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6.5A3.7 3.7 0 0 1 17 18H7Z" /></Icon>
);
export const Globe = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></Icon>
);
export const Workflow = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><path d="M10 6.5h4a3 3 0 0 1 3 3V14" /></Icon>
);
export const LayoutDashboard = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="3" width="8" height="9" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></Icon>
);
export const ListTodo = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="6" height="6" rx="1.5" /><path d="M4.5 7l1.2 1.2L8 6" /><rect x="3" y="14" width="6" height="6" rx="1.5" /><path d="M13 7h8M13 17h8" /></Icon>
);
export const Terminal = (p: IconProps) => (
  <Icon {...p}><path d="M4 6l6 6-6 6" /><path d="M12 18h8" /></Icon>
);
export const Code2 = (p: IconProps) => (
  <Icon {...p}><path d="M8 6l-5 6 5 6M16 6l5 6-5 6" /></Icon>
);

/* --- security ---------------------------------------------------------------- */
export const ShieldCheck = (p: IconProps) => (
  <Icon {...p}><path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></Icon>
);
export const ShieldAlert = (p: IconProps) => (
  <Icon {...p}><path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3Z" /><path d="M12 8v4" /><circle cx="12" cy="15.3" r="0.6" fill="currentColor" stroke="none" /></Icon>
);
export const Lock = (p: IconProps) => (
  <Icon {...p}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon>
);
export const KeyRound = (p: IconProps) => (
  <Icon {...p}><circle cx="8" cy="8" r="4.5" /><path d="M11 11l8 8M16 16l2-2M18 18l2-2" /></Icon>
);
export const Eye = (p: IconProps) => (
  <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.5" /></Icon>
);
export const EyeOff = (p: IconProps) => (
  <Icon {...p}><path d="M4 5l16 14" /><path d="M9.5 6.3A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.6 3.2M6.2 8.2A17 17 0 0 0 2 12s3.5 6 10 6a9.7 9.7 0 0 0 3.2-.5" /><path d="M9.9 10.1a2.5 2.5 0 0 0 3.5 3.5" /></Icon>
);

/* --- money ------------------------------------------------------------------- */
export const DollarSign = (p: IconProps) => (
  <Icon {...p}><path d="M12 2v20" /><path d="M17 6.5c0-2-2.2-3.3-5-3.3S7 4.5 7 6.5 9.2 9.8 12 10.3s5 1.6 5 3.6-2.2 3.4-5 3.4-5-1.4-5-3.4" /></Icon>
);
export const CreditCard = (p: IconProps) => (
  <Icon {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" /></Icon>
);

/* --- misc glyphs ------------------------------------------------------------- */
export const Search = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Icon>
);
export const Settings = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></Icon>
);
export const Wrench = (p: IconProps) => (
  <Icon {...p}><path d="M15 6a4 4 0 0 0-5.3 5L4 16.7 7.3 20l5.7-5.7A4 4 0 0 0 18 9l-2.5 2.5L13 9l2.5-2.5A4 4 0 0 0 15 6Z" /></Icon>
);
export const Sparkles = (p: IconProps) => (
  <Icon {...p}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" /></Icon>
);
export const Star = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" /></Icon>
);
export const Target = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>
);
export const Zap = (p: IconProps) => (
  <Icon {...p}><path d="M13 2L4 13h6l-1 9 9-11h-6l1-9Z" /></Icon>
);
export const Rocket = (p: IconProps) => (
  <Icon {...p}><path d="M12 3c3 1.5 5 5 5 9l-3 3h-4l-3-3c0-4 2-7.5 5-9Z" /><circle cx="12" cy="9" r="1.5" /><path d="M9 15l-2 2 1 3 3-2M15 15l2 2-1 3-3-2" /></Icon>
);
export const Brain = (p: IconProps) => (
  <Icon {...p}><path d="M12 5a3 3 0 0 0-5.8-1A2.8 2.8 0 0 0 4 7a2.8 2.8 0 0 0 .5 4.5A3 3 0 0 0 8 17a3 3 0 0 0 4 2V5Z" /><path d="M12 5a3 3 0 0 1 5.8-1A2.8 2.8 0 0 1 20 7a2.8 2.8 0 0 1-.5 4.5A3 3 0 0 1 16 17a3 3 0 0 1-4 2" /></Icon>
);
export const Building2 = (p: IconProps) => (
  <Icon {...p}><path d="M4 21V6l7-3v18" /><path d="M11 9h7a1 1 0 0 1 1 1v11" /><path d="M7 8v.01M7 12v.01M7 16v.01M15 13v.01M15 17v.01" /></Icon>
);
export const Users = (p: IconProps) => (
  <Icon {...p}><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3.5 3.5 0 0 1 0 7M17 14a6 6 0 0 1 4 6" /></Icon>
);
export const Keyboard = (p: IconProps) => (
  <Icon {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" /></Icon>
);
export const Trash2 = (p: IconProps) => (
  <Icon {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></Icon>
);
export const FlaskConical = (p: IconProps) => (
  <Icon {...p}><path d="M9 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 9.5V3" /><path d="M8 3h8M7.5 14h9" /></Icon>
);

/* Aliases some call sites may use. */
export const Loader = Loader2;
