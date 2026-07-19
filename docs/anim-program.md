# Motion program — "make it alive" across site + app + auth

Goal (from the user): (1) animate the existing feature illustrations super cleanly
with scroll-linked and ambient motion, without rebuilding them; (2) add
motion/react (framer) animation throughout so the whole website feels alive;
(3) bring this exact light editorial UI + motion INTO the application and the
login/signup wall. Comprehensive, production quality, not MVP slop.

Five fixed-lane teams (Sonnet), orchestrated across 8 cycles. Each cycle every
team advances its lane's coverage and quality, reads its progress note, appends
what it did, and MUST leave the build green.

## Absolute rules (all lanes, every cycle)

- Edit ONLY files in your lane's ownership list. Never touch another lane's
  files. Never run git. Use plain `mv` if a move is ever needed.
- NEVER change data logic: preserve every Convex `useQuery`/`useMutation`/
  `useAction`, every route path, every prop contract, all auth gating. You are
  changing presentation and motion ONLY.
- All motion uses `motion/react` (this repo's framer-motion). Respect
  `useReducedMotion()` — every looping/ambient animation must fully stop, and
  scroll effects must degrade to static, when reduced motion is set.
- Performance: animate only `transform` and `opacity` for anything scroll- or
  loop-driven. No layout thrash. Use `useScroll`/`useTransform`/`useSpring`,
  `whileInView` with `viewport={{ once: true }}` for reveals, `will-change`
  sparingly. Keep 60fps; no jank on mobile.
- No gradient artwork; image slots stay `ImagePlaceholder`. No em-dashes. No
  lucide in (site)/components/site. Keep tsc + `next build` green.
- Read your lane progress file at docs/anim-progress/<lane>.md first; append a
  dated bullet of what you changed at the end each cycle.

## Design language to apply everywhere (site + app + auth)

Paper white `#ffffff`, band `#f5f4f0`, beige card `#efede7`, ink `#1f1f1c`,
body `#8a8781`, hairline `#e7e5df`; Instrument Sans; pill buttons (solid black,
outline chevron); big grotesk headlines; rounded-[20..26px] cards; the four
animated mock illustrations. Motion vocabulary: scroll-reveal rise/fade,
parallax depth, sticky/pinned scroll scenes, magnetic + press micro-interactions
on buttons, animated number count-ups, text line/word stagger, marquee, shared
layout transitions, page-transition fades.

## Lanes and ownership

### Lane A — illustration + motion engine
Own: `components/site/mockups.tsx`, `components/site/motion.tsx` (create),
`components/site/illustration/*` (create as needed).
Do: make ConnectMock, OrchestrateMock, GovernMock, IntegrateMock and
ControlPlaneDiagram animate cleanly — scroll-linked progress (useScroll on the
card, drive row reveal / fan spread / tile shimmer / diagram energy by scroll),
plus tasteful ambient loops (pulsing active row, traveling packets on the
diagram connectors, gentle float). Add the two feature-only illustrations
(Realtime, Skills) as exported components here so pages import them (Lane B
wires the imports). Build `components/site/motion.tsx`: reusable primitives
(Reveal, Stagger, StaggerItem, Parallax, MagneticButton, CountUp, TextReveal,
Marquee, StickyScene, PageTransition) that every other lane consumes. Do NOT
edit pages.

### Lane B — marketing site aliveness
Own: `app/(site)/**` (all page.tsx), `components/site/chrome.tsx`,
`components/site/ui.tsx`, `components/site/painting.tsx`.
Do: wire Lane A's primitives across every (site) page so the whole site feels
alive: hero text reveals + parallax on the hero image slot, scroll-reveal every
section, count-up the stats, marquee the logo row, magnetic CTA pills, sticky
product-section scenes where it reads well, nav hide/show + shrink on scroll,
footer parallax, and a route page-transition wrapper. Import illustrations/mocks
from Lane A. Keep copy and structure; add motion and micro-interactions only.

### Lane C — application shell + light theme
Own: `app/globals.css` (add app-light system; only this lane edits globals.css),
`components/sidebar.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/template.tsx`,
`components/ui.tsx` (the app UI kit), `components/theme.tsx`.
Do: introduce the light editorial design system as the application's skin.
Restyle the sidebar, dashboard shell, and shared UI-kit primitives (Button,
Card, Badge, Input, Modal, etc.) to the paper-white system with the pill/beige
card language, and add motion (animated sidebar active pill via layoutId,
page-transition in template.tsx, hover/press micro-interactions in Button/Card).
Preserve every prop and behavior so all consuming pages keep working.

### Lane D — application surfaces
Own: `app/dashboard/**/page.tsx` (NOT layout/template), `components/bento.tsx`,
`components/activity-feed.tsx`, `components/sensor-card.tsx`,
`components/schedule-card.tsx`, `components/global-actions.tsx`,
`components/onboarding.tsx`, `components/command-palette.tsx`,
`components/workflow-trace.tsx`, `components/mission-graph.tsx`.
Do: progressively restyle dashboard pages to the light system consuming Lane C's
theme and Lane A's motion, one batch of pages per cycle (record coverage in the
progress file so later cycles pick up where you left off). Add scroll-reveal and
micro-interactions. Preserve ALL data wiring, RBAC gating, and behavior.

### Lane E — auth wall + admin
Own: `app/sign-in/**`, `app/sign-up/**`, `app/layout.tsx` (Clerk appearance +
metadata), `app/admin/**`, `components/admin/*`, `app/(site)` is NOT yours.
Do: rebuild the login/signup wall in the exact light editorial UI (split layout:
brand + animated illustration on one side, Clerk form on the other; motion on
entry), set Clerk `appearance` to the light theme in app/layout.tsx, and restyle
the admin surfaces to the light system with motion. Preserve auth flows and
admin RBAC/audit behavior exactly.

## Per-cycle focus (progressive)

1 Site illustrations animated (A) + motion primitives (A) + home wired (B) +
  app-light tokens + shell (C) + auth wall shell (E) + dashboard overview (D).
2 Diagram + ambient loops (A) + features/pricing alive (B) + UI-kit primitives
  light+motion (C) + agents/workflows/network pages (D) + sign-up + admin
  overview (E).
3 Realtime/Skills illustrations (A) + about/contact/changelog/status alive (B) +
  sidebar polish + page transitions (C) + ops/analytics/cost/alerts (D) +
  admin tenants/compliance/audit (E).
4 Scroll-scene refinement (A) + sticky scenes + nav scroll (B) + modal/toast/
  command-palette motion (C) + knowledge/skills/mcp/integrations/bridges (D) +
  auth error/loading states (E).
5 Parallax + count-ups polish (A/B) + remaining dashboard pages (D) + admin
  fleet + settings (E) + consistency of shell (C).
6 Reduced-motion + performance pass every lane; fix any jank; remove leftover
  dark tokens in restyled files.
7 Cross-surface consistency: spacing, radii, type scale, motion timing unified
  to shared constants; fill any page still on the old style.
8 Final audit + fix: each lane self-reviews against this spec, ensures tsc +
  build green, no reduced-motion violations, no data-logic changes.
