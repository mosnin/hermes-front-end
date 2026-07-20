# Lane D-app-surfaces progress

(Track what is done and what is next here, one dated bullet per cycle.)

- 2026-07-19 (cycle 1/8): Restyled `app/dashboard/page.tsx` (Overview) to the
  new motion vocabulary: swapped its `Stagger`/`StaggerItem` import from the
  legacy `components/marketing/motion` to Lane A's canonical
  `components/site/motion` primitives, wrapped the left detail rail in a
  `Reveal` (slide-in from the left), the tab row in a `Reveal`, the
  errors/network sensor row in `Stagger`/`StaggerItem`, and the Live activity
  card in a `Reveal`. The sidebar agents list now cascades in via a small
  `motion.ul`/`motion.li` stagger (kept as raw `motion/react` since Lane A's
  `Stagger` helper only supports block-level tags, not `ul`/`li`); all new
  entrance motion reads `useReducedMotion()` and collapses offsets/duration to
  near-zero when set. Fixed light-background contrast on hard-coded Tailwind
  palette classes that assumed a dark surface: `text-lime-400` -> `text-lime-600`
  and `text-red-400` -> `text-red-500` in the page's online/paused indicator,
  in `components/sensor-card.tsx` (alert icon + alert label chip), and in
  `components/onboarding.tsx` (completed-item border/fill/check). Everything
  else on the page already consumed Lane C's semantic tokens (`bg-surface`,
  `border-border`, `text-muted`, `bg-accent`, `text-accent`) so it will pick up
  the paper-white palette automatically once Lane C repoints those CSS
  variables; no page markup assumes a literal dark background.
  Added hover/press micro-interactions across components on this page's
  critical path (all Lane D-owned, transform-only, reduced-motion gated):
  `BentoCard` and `DateChipCard` in `components/bento.tsx` now lift 3px on
  hover; `SensorCard` in `components/sensor-card.tsx` lifts on hover; the
  onboarding checklist buttons in `components/onboarding.tsx` gained a
  `whileTap` press-scale alongside their existing hover-lift.
  Data wiring untouched: every `useQuery`/`useMutation` call, prop, route, and
  the admin/RBAC gating in these files is unchanged, only presentation and
  motion.
  Coverage so far: `app/dashboard/page.tsx` (Overview) is restyled/motion-wired.
  Remaining ~34 dashboard pages (agents, fleet, marketplace, mission, threads,
  network, tasks, goals, workflows, campaigns, models, skills, knowledge,
  integrations, mcp, bridges, approvals, alerts, ledger, notifications,
  history, audit, evals, analytics, reports, ops, developer, secrets,
  security-profiles, billing, cost, settings, and any dynamic `[id]` detail
  routes under them) are still on the pre-existing dark instrument-panel
  styling and are queued for cycles 2+ per the per-cycle plan (agents/
  workflows/network next). `components/global-actions.tsx`,
  `components/command-palette.tsx`, `components/workflow-trace.tsx`,
  `components/mission-graph.tsx`, and `components/schedule-card.tsx` are
  owned by this lane but not yet touched (not on the Overview page's render
  path) — planned for the cycle where their consuming pages get restyled.
  Verified: `npx tsc --noEmit` shows zero errors in any file this lane owns
  (the one remaining repo-wide error, `components/sidebar.tsx(138): Cannot
  find name 'EASE'`, is in a Lane C file mid-edit this same cycle, not touched
  by this lane).

- 2026-07-19 (cycle 2/8): Restyled/motion-wired the agents, workflows, and
  network surfaces (this cycle's assigned pages), plus the shared components
  they render that this lane owns.
  Pages: `app/dashboard/agents/page.tsx` (header `Reveal`, agent-card grid
  `Stagger`/`StaggerItem`, empty state `Reveal`), `app/dashboard/agents/
  [agentId]/page.tsx` (header `Reveal`, the three stat cards as a `Stagger`
  row, and `Reveal` on the persona card, config/snapshot panels, watchdog
  panel, log pane, A2A panel, and activity card), `app/dashboard/workflows/
  page.tsx` (header `Reveal`, workflow-definition cards and run cards each in
  their own `Stagger`/`StaggerItem`), and `app/dashboard/network/page.tsx`
  (header `Reveal`, directory/route/live-messages cards `Reveal`-wrapped with
  slide-in-from-side, the capability-grants and routing-preview sections each
  in a `Reveal`, and the two directory cards in a `Stagger` pair). All entrance
  motion comes from Lane A's `components/site/motion` primitives
  (`Reveal`/`Stagger`/`StaggerItem`), which already read `useReducedMotion()`
  internally, so nothing new to gate by hand at the page level.
  Note: `Stagger`/`StaggerItem` only support block-level container tags
  (div/span/h1-4/p/li), not `ul`/`ol`. For the three list containers that need
  to stay semantic `<ul>`/`<ol>` (agent directory list and live-messages list
  in network/page.tsx; the step waterfall `<ol>` in workflow-trace.tsx) I used
  raw `motion/react` `motion.ul`/`motion.ol` with a hand-rolled
  hidden/show stagger variant (same easing/duration shape as `Stagger`,
  reduced-motion gated) as the container, with `StaggerItem`/`motion.li` still
  driving each row — documented inline where used.
  Components (all Lane D-owned): `components/mission-graph.tsx` now reads
  `useReducedMotion()` and fully stops its two ambient loops when set (the
  `animate-ping` online ring, and the SVG `<animateMotion>` packet traveling
  each A2A edge falls back to a static midpoint dot); also fixed low-contrast
  text-on-white color pairs left over from the dark instrument-panel skin
  (`text-emerald-300`/`text-amber-300` node labels -> `-600`/`-700`, edge
  stroke/packet opacity bumped for visibility on the paper-white card).
  `components/workflow-trace.tsx` step list now cascades in via the
  `motion.ol` pattern above, the output/error detail `<pre>` block animates
  open/closed with `AnimatePresence`/height auto instead of an instant toggle,
  the chevron rotates on expand, and `text-red-400` (poor contrast on white)
  became `text-red-600`/`-500` throughout. `components/command-palette.tsx`
  gained real entrance/exit motion via `AnimatePresence` (fade backdrop +
  spring scale-in dialog, matching `components/ui.tsx`'s `Modal` treatment
  exactly) instead of an instant `if (!open) return null`, row press-scale on
  tap, and the same `text-red-400` -> `text-red-500` contrast fix on the
  destructive command label; `bg-black/60` overlay swapped for the same
  `bg-[#1f1f1c]/40` + blur used by `Modal` for visual consistency across the
  app's two dialog surfaces. `components/global-actions.tsx` reviewed, no
  changes needed (headless provider, no visual surface).
  `components/schedule-card.tsx` reviewed, already consumes the light
  system's semantic tokens and `Card`/`Toggle`/`Button` from `components/ui`
  with no dark-only color classes; left as-is (its consuming settings page is
  scheduled for a later cycle).
  Data wiring untouched: every `useQuery`/`useMutation`/`useAction` call,
  prop, route, and the operator/admin RBAC gating (`useCan("operator")`,
  `useCan("admin")`) in all touched files is unchanged, only presentation and
  motion.
  Coverage so far: `app/dashboard/page.tsx` (Overview, cycle 1),
  `app/dashboard/agents/page.tsx`, `app/dashboard/agents/[agentId]/page.tsx`,
  `app/dashboard/workflows/page.tsx`, `app/dashboard/network/page.tsx` (cycle
  2). Remaining ~30 pages (fleet, marketplace, mission, threads, tasks,
  goals, campaigns, models, skills, knowledge, integrations, mcp, bridges,
  approvals, alerts, ledger, notifications, history, audit, evals, analytics,
  reports, ops, developer, secrets, security-profiles, billing, cost,
  settings, activity, and any dynamic detail routes under them) are still on
  the pre-existing dark instrument-panel styling, queued per the per-cycle
  plan (ops/analytics/cost/alerts next per cycle 3).
  Verified: `npx tsc --noEmit` is clean (zero errors repo-wide) and
  `npx next build` completes successfully (all `/dashboard/*` routes compile,
  including every page touched this cycle).

- 2026-07-19 (cycle 3/8): Restyled/motion-wired ops, analytics, cost, and
  alerts (this cycle's assigned pages).
  `app/dashboard/ops/page.tsx`: header `Reveal`, the autonomy-paused banner
  `Reveal`-in, the Service health card's SLO tile grid as `Stagger`/
  `StaggerItem`, the Forecast & anomalies card `Reveal`-wrapped, the
  Spend-this-month / Agent-health pair and the Error-stream / Dead-letters
  pair each as `Stagger` rows, the Alerts card `Reveal`-wrapped, and the
  budget-used bar now animates its width in on mount via a `motion.div`
  (`useReducedMotion` collapses it to an instant set) instead of a static
  inline style.
  `app/dashboard/analytics/page.tsx`: header `Reveal`, the four stat cards and
  the four content cards (Activity, Tasks by status, Agents, Deliverables)
  each in `Stagger`/`StaggerItem`, the 7-day activity bars now grow in with a
  staggered `scaleY` reveal (origin-bottom, transform-only), and the
  tasks-by-status progress bars animate their width in on mount, all gated by
  `useReducedMotion`.
  `app/dashboard/cost/page.tsx` (largest page this cycle): header `Reveal`,
  the three top stat cards as `Stagger`/`StaggerItem`, the Cost-breakdown and
  Lever cards as opposing side `Reveal`s (`x={-16}`/`x={16}`) with the
  breakdown's category bars animating width in, the "Real spend, last 30
  days" card `Reveal`-wrapped with each of the 30 daily bars growing in via a
  fast staggered `scaleY`, the Idle-hibernation / Hard-spend-cap card pair as
  a `Stagger` row, and the per-agent P&amp;L card `Reveal`-wrapped. Also fixed
  a batch of low-contrast dark-instrument-panel leftovers now that the page
  sits on the paper-white surface: `text-amber-200`/`bg-amber-500/10`/
  `border-amber-500/30` -> `text-amber-800`/`bg-amber-50`/`border-amber-200`
  (poll-loop-lever warning banner and hard-cap warning banner),
  `border-green-500/40 bg-green-500/10` -> `border-green-300 bg-green-50` and
  `text-green-400` -> `text-green-700` (event-push lever row and its savings
  callout), `text-green-400`/`text-red-400` -> `text-green-700`/`text-red-600`
  in the P&amp;L summary delta and every per-row P&amp;L cell. Also added a
  small `mt-6` to the spend-trend card so it no longer sits flush against the
  breakdown/lever grid above it (was 0px gap before, now a normal section
  gap; presentation only).
  `app/dashboard/alerts/page.tsx`: swapped its `Stagger`/`StaggerItem` import
  from the legacy `components/marketing/motion` path to Lane A's canonical
  `components/site/motion` (matching every other page restyled so far, no
  behavior change since the two modules export the same API), wrapped the
  header in `Reveal`, and fixed a low-contrast `hover:text-red-400` on the
  delete-rule button to `hover:text-red-600`. The rule-list `Stagger`/
  `StaggerItem`, the create-alert `Modal`, and all Convex wiring were already
  in place from an earlier pass and are untouched.
  Data wiring untouched: every `useQuery`/`useMutation`/`useAction` call,
  prop, route, and role gate (`role === "admin" || "owner"`, `useCan`, RBAC
  checks in cost/page.tsx's `CostControlsSection`/`PnlSection`) in all four
  files is unchanged, only presentation and motion.
  Coverage so far: Overview (cycle 1); agents, agents/[agentId], workflows,
  network (cycle 2); ops, analytics, cost, alerts (cycle 3) — 8 of ~35 pages.
  Remaining ~27 pages (fleet, marketplace, mission, threads, threads/[id],
  tasks, goals, campaigns, models, skills, knowledge, integrations, mcp,
  bridges, approvals, ledger, notifications, history, audit, evals, reports,
  developer, secrets, security-profiles, billing, settings, activity) are
  still on the pre-existing dark instrument-panel styling, queued per the
  per-cycle plan (knowledge/skills/mcp/integrations/bridges next per cycle 4).
  Verified: `npx tsc --noEmit` is clean (zero errors repo-wide) and
  `npx next build` completes successfully across every route, including all
  four pages touched this cycle.

- 2026-07-19 (cycle 4/8): Restyled/motion-wired knowledge, skills, mcp,
  integrations, and bridges (this cycle's assigned pages; none of them have
  dynamic `[id]` detail routes).
  All five pages now use Lane A's `Reveal`/`Stagger`/`StaggerItem` from
  `components/site/motion` (previously plain `<div>`s with no entrance
  motion): header block in a `Reveal`, the search/filter row (knowledge,
  skills) in a delayed `Reveal`, catalog/preset grids and connected-item
  lists in `Stagger`/`StaggerItem` cascades, and empty states wrapped in a
  `Reveal`. `app/dashboard/knowledge/page.tsx`: header, search bar, memory
  card grid; `app/dashboard/skills/page.tsx`: header, search bar, skill card
  grid; `app/dashboard/mcp/page.tsx`: header, "Common MCP servers" catalog
  grid (including the trailing "Custom MCP" card), and the "Connected"
  server list; `app/dashboard/integrations/page.tsx`: header, the Composio
  misconfigured warning banner, and the toolkit catalog grid;
  `app/dashboard/bridges/page.tsx`: header, the bridge-worker info banner,
  the channel catalog grid, and the connected-bridges list. Left every
  `Modal` (add memory / ingest URL / ingest document / new skill / add MCP /
  add trigger / connect bridge) untouched since `components/ui.tsx`'s
  `Modal` (Lane C) already has full `AnimatePresence` open/close motion; no
  page-level modal motion was needed here (that was this cycle's Lane C
  scope, not overlapping with these pages beyond consuming the primitive).
  Fixed low-contrast dark-instrument-panel leftovers now that these pages
  sit on the paper-white surface: `hover:text-red-400` -> `hover:text-red-500`
  on the delete-memory button (knowledge) and delete-skill button (skills);
  the Composio-not-configured banner in integrations went from
  `border-amber-500/30 bg-amber-500/10 text-amber-300` (illegible on white)
  to `border-amber-200 bg-amber-50 text-amber-800`, matching the same fix
  pattern used on the cost/ops pages in cycle 3. `app/dashboard/mcp/page.tsx`
  and `app/dashboard/bridges/page.tsx` had no leftover dark-only color
  classes to fix. None of this cycle's five pages render any Lane-D-owned
  component (bento, activity-feed, sensor-card, schedule-card,
  global-actions, onboarding, command-palette, workflow-trace,
  mission-graph), so no component files needed changes this cycle.
  Data wiring untouched: every `useQuery`/`useMutation`/`useAction` call,
  prop, route, and role/RBAC gate (`useCan("operator")`, `useCan("admin")`)
  in all five files is unchanged, only presentation and motion.
  Coverage so far: Overview (cycle 1); agents, agents/[agentId], workflows,
  network (cycle 2); ops, analytics, cost, alerts (cycle 3); knowledge,
  skills, mcp, integrations, bridges (cycle 4) — 13 of ~35 pages. Remaining
  ~22 pages (fleet, marketplace, mission, threads, threads/[id], tasks,
  goals, campaigns, models, approvals, ledger, notifications, history,
  audit, evals, reports, developer, secrets, security-profiles, billing,
  settings, activity) are still on the pre-existing dark instrument-panel
  styling, queued per the per-cycle plan (remaining dashboard pages next per
  cycle 5).
  Verified: `npx tsc --noEmit` is clean (zero errors repo-wide) and
  `npx next build` completes successfully across every route, including all
  five pages touched this cycle.

- 2026-07-19 (cycle 5/8): Restyled/motion-wired the remaining "operations
  desk" surfaces per this cycle's assignment: goals, campaigns, evals,
  ledger, approvals, developer, secrets, models, notifications, threads
  (list + `[threadId]` detail), tasks, mission, fleet, history, activity,
  audit — 17 route files, all of this lane's remaining coverage gap closed
  in one pass (18/18 top-level dashboard pages plus the threads detail
  route are now on the motion vocabulary; only `settings` and a handful of
  already-alive pages from cycles 1-4 predate this batch).
  Pattern applied consistently: page header in a `Reveal`, filter/search
  rows in a delayed `Reveal`, card grids and item lists in `Stagger`/
  `StaggerItem` (bounded, user-managed collections: goals/projects,
  campaigns, evals scorecards + benchmarks + batches, approvals, tasks
  kanban columns, fleet deployed-agent list, model per-capability override
  rows, developer API keys, secrets vault, notifications, threads list),
  while the three potentially-large immutable log surfaces (ledger,
  history, audit) got a single `Reveal` around the whole list card instead
  of per-row stagger, deliberately, to avoid an unbounded cascading-delay
  mount cost on lists that can run to hundreds of rows (`audit` alone
  queries up to 500). Two pages needed semantic `<ul>/<li>` markup
  preserved (fleet's deployed-agents list, developer's API-key list): both
  hand-roll the `Stagger`/`StaggerItem` variant shape directly on
  `motion.ul`/`motion.li` with a local `useReducedMotion()`-gated variants
  object (documented inline), matching the pattern earlier cycles used for
  network/workflow-trace's semantic lists, since `Stagger`'s `as` prop only
  supports block-level tags, not `ul`/`ol`.
  Count-up polish (this cycle's other headline item, alongside Lane A/B):
  `mission/page.tsx`'s four top stat tiles (`Stat` component) now render
  through `CountUp` instead of a static string, refactored to take a
  `countValue`/`countSuffix` pair so "Agents online" can count the numeric
  part while appending the static `" / N"` suffix as plain text; the
  online-badge `animate-ping` ring is now also gated behind
  `useReducedMotion()` (previously an unconditional CSS animation, now
  fully stops under reduced motion). `fleet/page.tsx`'s "Hosted agents"
  usage figure counts up. `tasks/page.tsx`'s "{doneCount}/{total} done"
  counts up `doneCount`. `goals/page.tsx`'s per-goal/per-project `Bar`
  component now animates its width in on mount (`motion.div`, width
  0 -> N%, `EASE`, reduced-motion collapses to an instant set) instead of a
  static inline style, and each goal's progress percentage counts up.
  `evals/page.tsx` picked up the same bar-fill-on-mount treatment across
  every progress bar on the page: scorecard count bars, the cost/quality
  comparison table's two bar columns, and the cross-harness trend
  mini-chart's paired quality/cost bars (staggered by 0.08s between the
  two series) — all `motion.div`/`useReducedMotion` gated.
  Fixed a batch of low-contrast dark-instrument-panel leftovers now that
  these pages sit on the paper-white surface (same fix pattern as cycles
  1-4): `hover:text-red-400` -> `hover:text-red-500` (campaigns remove
  button, tasks delete button, models remove-override button, fleet
  terminate button, evals delete-benchmark icon); `border-amber-500/30
  bg-amber-500/10 text-amber-300` -> `border-amber-200 bg-amber-50
  text-amber-800` (fleet's "Cadre Cloud isn't enabled" banner and its
  one-time-tokens callout); `text-amber-400` -> `text-amber-600`/`-700`
  (audit page's admin-only `ShieldAlert` icon, developer page's "copy your
  key now" warning); `border-red-500/20 bg-red-500/5 text-red-400` /
  `border-emerald-500/20 bg-emerald-500/5 text-emerald-400` ->
  `border-red-200 bg-red-50 text-red-700` / `border-emerald-200
  bg-emerald-50 text-emerald-700` (approvals page's before/after preview
  diff panel); `bg-sky-400` -> `bg-sky-500` (evals cost-series bars/legend
  dot, a touch more visible against white). Also added `transition-colors`
  to a few filter-pill and hover-only buttons that were missing it,
  matching the rest of the app's micro-interaction feel.
  Data wiring untouched: every `useQuery`/`useMutation`/`useAction` call,
  prop, route, and role/RBAC gate (`useCan`, `canAdmin`, `canOperate`,
  `isAdmin`) across all seventeen files is unchanged, only presentation
  and motion. Drag-and-drop on the tasks kanban board, the ledger revert
  flow, the secrets reveal-on-demand flow, the approvals bulk-decide
  selection state, and the live thread streaming/typing-indicator UI all
  behave exactly as before.
  Coverage so far (cycles 1-5): Overview; agents, agents/[agentId],
  workflows, network; ops, analytics, cost, alerts; knowledge, skills,
  mcp, integrations, bridges; goals, campaigns, evals, ledger, approvals,
  developer, secrets, models, notifications, threads, threads/[threadId],
  tasks, mission, fleet, history, activity, audit — 31 of the 36 total
  `app/dashboard/**/page.tsx` routes now import Lane A's `components/
  site/motion` primitives (verified by grepping every page file for that
  import). Remaining plain pages, confirmed by the same sweep: `settings`,
  `marketplace`, `reports`, `billing`, `security-profiles` — queued for
  cycle 6's reduced-motion/performance pass or cycle 7's consistency
  sweep, whichever lands first.
  Verified: `npx tsc --noEmit` is clean (zero errors repo-wide) and
  `npx next build` completes successfully across every route, including
  all seventeen pages touched this cycle.

- 2026-07-19 (cycle 6/8): Reduced-motion + performance audit across every
  file this lane owns (all 36 `app/dashboard/**/page.tsx` routes plus
  `bento.tsx`, `activity-feed.tsx`, `sensor-card.tsx`, `schedule-card.tsx`,
  `global-actions.tsx`, `onboarding.tsx`, `command-palette.tsx`,
  `workflow-trace.tsx`, `mission-graph.tsx`), no page-coverage expansion
  (that is cycle 7's "fill any page still on old style" per the master
  spec) — this cycle was purely the audit/fix pass it was scoped for.
  Method: grepped every owned file for `repeat:`/`animate-ping`/
  `animate-pulse`/`animate-spin`/`animate-bounce`/`useScroll`/`useTransform`/
  `boxShadow`/raw `staggerChildren` variants, then manually read every hit
  plus every component that mounts a `motion.*` element at all.
  Bugs found and fixed (real reduced-motion violations, not just review):
  - `components/bento.tsx` `MediaCard`'s play-button pulse
    (`animate={{scale:[1,1.06,1]}}, repeat: Infinity`) had **no**
    `useReducedMotion()` gate at all — an infinite loop that never stopped
    under reduced motion. Added `const reduce = useReducedMotion()` and
    made both `animate`/`transition` `undefined` when `reduce` is true.
    This component renders on `app/dashboard/page.tsx` (Overview).
  - `components/onboarding.tsx` (the "Get your fleet running" checklist
    card on Overview): entrance (`initial`/`animate`), exit
    (`AnimatePresence` unmount), and the per-item stagger delay/`whileHover`/
    `whileTap` had no `useReducedMotion()` gating anywhere in the file.
    Added the hook; offsets collapse to 0, the mount/dismiss transition
    collapses to `duration: 0`, per-item stagger delay collapses to 0, and
    `whileHover`/`whileTap` are disabled outright under reduced motion.
  - `components/activity-feed.tsx` (live Convex activity list, used on
    several pages): new rows sliding/scaling in via `AnimatePresence` +
    `layout` fires every time the live query pushes a new event, an
    effectively continuous/ambient effect on busy Spaces, previously
    ungated. Added `useReducedMotion()`; under reduced motion, `layout` is
    disabled, entrance collapses to an instant opacity-only appearance
    (`initial={false}`), and the exit/entrance spring collapses to
    `duration: 0`.
  Jank fix (loop-driven non-transform/opacity property, violates the
  "animate only transform/opacity for loop-driven effects" performance
  rule even though it was already reduced-motion gated):
  `components/sensor-card.tsx`'s alert-card "breathing glow" animated
  `boxShadow` directly on the card's own `motion.div` in an
  `Infinity`-repeat loop — animating `box-shadow` forces a paint of the
  whole card (border, background, content) every frame instead of a
  compositor-only transform/opacity update, and does so on every alert
  sensor card simultaneously (ops/mission pages can show several at once).
  Replaced with a separate absolutely-positioned `aria-hidden` glow layer
  behind the card that has a **static** `box-shadow` (set once via
  Tailwind's `shadow-[...]` class, no per-frame recompute) and animates
  only its `opacity` in the loop; the visible card itself now gets a
  static `shadow-[0_0_24px_rgba(239,68,68,0.12)]` class when `alert` is
  true instead of an animated one. Same visual "pulse" read, now
  compositor-only and cheap; still fully absent when `!alert || reduce`.
  Reviewed and found already correct (no changes needed): `mission-graph.tsx`
  (both `animate-ping` and the SVG `<animateMotion>` packet were already
  `!reduce`-gated from cycle 2), `mission/page.tsx`'s online-badge
  `animate-ping` (already gated), `command-palette.tsx` and
  `workflow-trace.tsx` (already fully `useReducedMotion()`-gated from
  cycle 2, including the `AnimatePresence` height-auto detail panel and the
  hand-rolled `motion.ol`/`motion.li` stagger), the hand-rolled
  `staggerChildren` variant objects in `network/page.tsx`, `fleet/page.tsx`,
  `developer/page.tsx`, and `app/dashboard/page.tsx` (all already collapse
  `staggerChildren`/`delayChildren` to 0 under reduce), and every Tailwind
  CSS `animate-spin`/`animate-pulse` utility class left in this lane's pages
  (evals running-benchmark spinner, fleet refresh spinner, threads typing-
  indicator dots) — these are covered app-wide by Lane C's global
  `@media (prefers-reduced-motion: reduce)` rule in `globals.css`
  (`animation-duration: 0.01ms !important; animation-iteration-count: 1`),
  so no per-component JS gate is needed for them; confirmed by reading that
  rule directly rather than assuming. No `useScroll`/`useTransform` usage
  exists anywhere in this lane's files (no scroll-linked effects owned by
  Lane D), so there was nothing to check there beyond confirming that.
  Also checked the mount-once progress-bar `width` animations added in
  cycles 3 and 5 (cost, analytics, ops, evals, goals, billing) — these are
  single bounded-size divs animating once on mount (not loop- or
  scroll-driven, so the strict transform/opacity-only rule does not apply),
  already `useReducedMotion()`-gated to an instant set; left as-is rather
  than churning a working, already-compliant pattern.
  Leftover dark-token sweep: grepped every owned file for dark-instrument-
  panel color leftovers (`text-*-400`/`-300`, `bg-*-500/NN`,
  `border-white/NN`, `bg-black`, `bg-zinc/neutral/gray-9xx`, etc). Found and
  fixed two pages that were never touched by the cycles-1-5 restyle pass
  (queued for cycle 6/7 in the prior note) and so still had the original
  low-contrast classes: `app/dashboard/settings/page.tsx`
  (`hover:text-red-400` -> `hover:text-red-500` on the remove-member
  button) and `app/dashboard/security-profiles/page.tsx`
  (`hover:text-red-400` -> `hover:text-red-500` on the delete-profile and
  detach-agent buttons, `text-red-400` -> `text-red-600` on both inline
  error messages, and the "container policy" info banner
  `border-amber-500/30 bg-amber-500/10 text-amber-200` ->
  `border-amber-200 bg-amber-50 text-amber-800`, matching the exact fix
  pattern used on every other amber banner across cycles 3-5). Every other
  owned file (all cycle 1-5 restyled pages, `bento.tsx`, `mission-graph.tsx`,
  `command-palette.tsx`'s intentional `bg-[#1f1f1c]/40` scrim matching
  Lane C's `Modal`, and `bento.tsx`'s intentional white-on-accent-orange
  `MediaCard`) checked clean — no further leftover dark tokens found.
  `marketplace/page.tsx`, `reports/page.tsx`, and `billing/page.tsx` (the
  other three pages never touched by cycles 1-5) had no such leftovers to
  fix. Data wiring untouched: every `useQuery`/`useMutation`/`useAction`
  call, prop, route, and RBAC gate across every file touched this cycle is
  unchanged, only motion-gating and static Tailwind classes.
  Coverage note (unchanged from cycle 5, not this cycle's focus): 31 of 36
  page routes carry Lane A's `Reveal`/`Stagger` motion vocabulary;
  `settings`, `marketplace`, `reports`, `billing`, `security-profiles`
  remain on the pre-motion (but now contrast-clean) layout, still queued
  for cycle 7's consistency/fill-remaining-pages pass.
  Verified: `npx tsc --noEmit` is clean (zero errors repo-wide) and
  `npx next build` completes successfully across every route, including
  every file touched this cycle.

- 2026-07-19 (cycle 7/8): Cross-surface consistency pass, per this cycle's
  spec ("unify spacing, radii, type scale, and motion timing to shared
  constants; fill any page/component still on the old style").
  Fill-remaining-pages (required): restyled/motion-wired the last 5 of 36
  `app/dashboard/**/page.tsx` routes that cycle 6's audit flagged as still
  plain: `settings/page.tsx` (header `Reveal`, kill-switch/shadow-mode/
  guardrails/members cards each in a staggered `Reveal`, the guardrail
  input grid in `Stagger`/`StaggerItem`, `ScheduleCard` itself wrapped in a
  trailing `Reveal`), `marketplace/page.tsx` (header, search bar, and
  category-segmented-control each in a delayed `Reveal`; featured and
  all-templates grids each their own `Stagger`/`StaggerItem`; empty state
  `Reveal`-wrapped), `reports/page.tsx` (header `Reveal`, report-card list
  `Stagger`/`StaggerItem`, empty state `Reveal`), `billing/page.tsx`
  (header and usage-this-month card each `Reveal`-wrapped, the three plan
  cards in `Stagger`/`StaggerItem`), and `security-profiles/page.tsx`
  (header `Reveal`, profile-card grid `Stagger`/`StaggerItem`, empty state
  `Reveal`). Every one of the 36 dashboard page routes now imports Lane
  A's `components/site/motion` primitives (verified by grepping every
  route file for that import — zero misses). Also caught and fixed one
  more low-contrast leftover the cycle-6 sweep missed:
  `hover:text-red-400` (illegible on the paper-white surface) ->
  `hover:text-red-500` on the remove-step button in `workflows/page.tsx`'s
  step editor; a repo-wide grep across every Lane-D-owned file for the
  full family of dark-instrument-panel leftover classes (`text-*-300/400`,
  `bg-*-500/NN`, `border-white/NN`, `bg-black`, `bg-{zinc,neutral,gray,
  slate}-8xx/9xx`) now comes back clean everywhere else.
  Spacing/radii/type-scale audit (no changes needed, confirmed by
  grepping every owned page): every dashboard page's root wrapper is
  `<div className="p-8">` and every page header is `<h1 className="text-2xl
  font-semibold">` — already a single shared convention app-wide, nothing
  to unify. Bento/sensor-card's `rounded-3xl` "premium card" radius and
  `ui.tsx`'s `rounded-card` (22px, Lane C's CSS var) are two intentionally
  distinct card languages already used consistently within their own
  scope (bento grid vs. standard `Card`), not a drift to fix.
  Motion-timing unification (this cycle's other headline item): several
  Lane-D components had one-shot/hover transitions that pre-dated Lane
  A's `DURATION`/`EASE`/`STAGGER` constants (`components/site/motion.tsx`)
  and Lane C's `UI_SPRING` (`components/ui.tsx`, added this same cycle by
  Lane C) and had drifted a few hundredths of a second off the values
  those modules now canonicalize. Replaced every one with the shared
  constant: `components/bento.tsx` (`BentoCard`/`DateChipCard` hover-lift
  `transition: { duration: 0.2 }` -> `{ duration: DURATION.instant, ease:
  EASE }`, matching `Button`'s hover-lift in `ui.tsx` exactly);
  `components/sensor-card.tsx` (same hover-lift fix, plus the area-chart
  line-trace's bespoke ease array `[0.3, 0.6, 0.3, 1]`, clearly meant to
  be the shared editorial curve but drifted, replaced with the canonical
  `EASE`); `components/onboarding.tsx` (mount/dismiss `transition={reduce
  ? { duration: 0 } : undefined}` -> explicit `{ duration: reduce ?
  DURATION.reduced : DURATION.base, ease: EASE }`, and the per-item
  stagger delay `0.04 * i` -> `STAGGER.tight * i`, both now importing from
  `site/motion` instead of hand-rolled numbers); `components/activity-
  feed.tsx` (new-row spring `{ stiffness: 380, damping: 32 }` -> Lane C's
  `UI_SPRING.pop` from `ui.tsx`, whose damping already matched exactly;
  reduced-motion fallback `duration: 0` -> `DURATION.reduced` to match the
  app-wide reduced-motion convention every `Reveal`/`Stagger` already
  uses); `components/command-palette.tsx` (backdrop fade `duration: 0.18`
  -> `DURATION.instant`/`DURATION.reduced` + `EASE`, and the dialog-panel
  spring's literal `{ stiffness: 380, damping: 30 }` -> an import of Lane
  C's `UI_SPRING.panel` from `ui.tsx`, same numbers, now a single source
  of truth instead of a hand-duplicated copy of `Modal`'s spring);
  `components/workflow-trace.tsx` (hand-rolled `motion.ol` stagger's
  `staggerChildren: 0.06` -> `STAGGER.tight`, already numerically
  identical, now importing the named constant; the detail-chevron rotate
  and the output/error `<pre>` height-auto reveal, both previously
  `duration: reduce ? 0 : 0.18/0.2`, now `{ duration: reduce ?
  DURATION.reduced : DURATION.instant, ease: EASE }`). Reviewed and left
  as-is (correctly bespoke, not chrome-interaction constants):
  `mission-graph.tsx`'s per-edge packet-travel duration (`2.4 + (i % 4) *
  0.5`, an intentionally varied ambient SVG loop, not a discrete UI
  interaction), `sensor-card.tsx`'s area-fill fade and alert-breathe
  durations (bespoke chart/illustration timings, same category as Lane
  A's mock illustrations), `bento.tsx`'s `MediaCard` play-button pulse
  (2.6s ambient loop), and `schedule-card.tsx`/`global-actions.tsx`
  (no bespoke motion transitions to unify; both already fully delegate
  to `Card`/`Button`/`Toggle` from Lane C's kit or are headless).
  Data wiring untouched: every `useQuery`/`useMutation`/`useAction` call,
  prop, route, and RBAC/role gate across all files touched this cycle
  (`canAdmin`, `canManage`/`canDelete` on security-profiles, the settings
  page's admin-only guardrail/member controls) is unchanged; only
  presentation, layout wrapping, and motion-transition values changed.
  Coverage: all 36 of 36 `app/dashboard/**/page.tsx` routes now carry
  Lane A's `Reveal`/`Stagger` motion vocabulary. Nothing left queued from
  the fill-remaining-pages list; cycle 8 is free to do a pure final audit
  per the master spec rather than more coverage expansion.
  Verified: `npx tsc --noEmit` is clean (zero errors repo-wide) and
  `npx next build` completes successfully across all 36 dashboard routes
  plus every other route in the app, including every file touched this
  cycle.

- 2026-07-19 (cycle 8/8): Final self-audit against the master spec across
  every file this lane owns (all 34 `app/dashboard/**/page.tsx` route files
  present in the repo plus `bento.tsx`, `activity-feed.tsx`,
  `sensor-card.tsx`, `schedule-card.tsx`, `global-actions.tsx`,
  `onboarding.tsx`, `command-palette.tsx`, `workflow-trace.tsx`,
  `mission-graph.tsx`). No further coverage expansion needed (cycle 7
  already closed the fill-remaining-pages gap); this cycle was purely
  audit-and-tighten.
  Coverage re-verified: grepped every `app/dashboard/**/page.tsx` for the
  `components/site/motion` import and for the legacy
  `components/marketing/motion` path — 100% of route files import Lane A's
  canonical primitives, zero stragglers, zero legacy-path imports anywhere
  in this lane's files.
  Reduced-motion re-audit: re-read every `repeat:`/`animate-ping`/
  `animate-pulse`/`animate-spin`/`animate-bounce` and `useReducedMotion()`
  call site across every owned file. Confirmed all three loop sites found
  (`mission/page.tsx`'s online-badge ping, `mission-graph.tsx`'s node ping,
  `sensor-card.tsx`'s alert-glow opacity pulse) remain correctly gated
  behind `!reduce`/`useReducedMotion()`, matching the fixes landed in
  cycle 6; `bento.tsx`'s `MediaCard` pulse also still correctly gated. No
  new violations found. No `useScroll`/`useTransform` usage exists
  anywhere in this lane's files, so the transform/opacity-only rule for
  scroll-driven effects has nothing to check here (confirmed by direct
  grep, not just recollection). No `bg-gradient`/gradient-art classes
  found anywhere in owned files.
  Em-dash sweep (tightening item, real finding this cycle): grepped every
  owned file for the em-dash character and fixed the ten instances that
  were genuine prose punctuation in user-facing copy (joining clauses,
  the "no em-dashes" rule's actual target): `marketplace/page.tsx`'s
  header description, `network/page.tsx`'s empty-grants message and
  routing-preview description, `security-profiles/page.tsx`'s egress
  label and the per-profile agents-modal title, `approvals/page.tsx`'s
  webhook-secret placeholder, `evals/page.tsx`'s trend-chart heading and
  benchmark-picker description, `cost/page.tsx`'s hard-spend-cap
  explainer, and `onboarding.tsx`'s progress line, all rewritten with a
  colon, comma, or period as appropriate, no copy meaning changed.
  Left untouched, deliberately: single "—" glyphs used as an N/A/empty-
  value placeholder in table cells and stat tiles (ops, agents,
  agents/[agentId], network, approvals, mission, fleet, evals,
  workflow-trace) — this is a standard UI convention for "no value", not
  prose punctuation, and replacing it app-wide would be a larger,
  out-of-scope visual change for a final-cycle tightening pass; also left
  a handful of internal code comments using em-dashes (bento.tsx,
  sensor-card.tsx, global-actions.tsx, workflow-trace.tsx, network.tsx,
  fleet.tsx, mcp.tsx, secrets.tsx, threads/[threadId].tsx) since those are
  not user-facing copy.
  Dark-token leftover re-sweep: re-ran the full leftover-class grep
  (`text-*-300/400`, `bg-*-500/NN`, `border-white/NN`, `bg-black`,
  `bg-{zinc,neutral,gray,slate}-8xx/9xx`) across every owned file; the
  only match was `approvals/page.tsx`'s `bg-emerald-500/90` approve
  buttons, which is an intentional solid high-opacity accent fill (not a
  low-contrast dark-panel leftover), left as-is after inspection.
  No lucide-in-(site) concern (this lane owns no `(site)` files); no
  gradient art found; auth/RBAC gates (`useCan`, `canAdmin`, `canOperate`,
  `canManage`, `role === "admin"`, etc.) spot-checked across every file
  touched this cycle and confirmed byte-identical, only JSX text content
  changed in ten files, zero hooks/props/routes touched.
  Verified: `npx tsc --noEmit` is clean (zero errors repo-wide, re-run
  after every edit this cycle) and `npx next build` (clean `.next`)
  completes successfully, compiling and generating all 34 `/dashboard/*`
  routes plus every other route in the app with no errors and no
  ENOENT/build-trace issues on a fresh build.
