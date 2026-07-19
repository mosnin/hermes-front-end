# Lane E-auth-admin progress

(Track what is done and what is next here, one dated bullet per cycle.)

- 2026-07-19 (cycle 1): Rebuilt the auth wall in the exact light editorial
  system. `app/layout.tsx`: dropped the Clerk `dark` baseTheme and set a full
  light-theme `appearance` (variables mirroring the paper/ink/beige tokens +
  element overrides so the pill primary button, inputs, dividers, social
  buttons, and OTP/identity fields all read as part of the product, not a
  bolted-on widget) — auth flow and Clerk routing untouched. Added
  `app/sign-in/auth-shell.tsx`, a shared split-panel shell (brand mark +
  editorial headline + ConnectMock illustration with BreathingRings on a
  beige band panel, left; eyebrow/title/subtitle + the Clerk form, right)
  with staggered entrance motion built on Lane A's `EASE`/reduced-motion
  pattern (falls back to a static, settled pose under `useReducedMotion`).
  `app/sign-in/[[...sign-in]]/page.tsx` and
  `app/sign-up/[[...sign-up]]/page.tsx` now render through this shell
  (sign-up imports the shared shell from sign-in's directory) with distinct
  copy per page; `<SignIn />` / `<SignUp />` themselves are unchanged, no
  auth logic touched. Admin surfaces (cycle 2+ per the program schedule) not
  touched this cycle. Verified `npx tsc --noEmit` clean and `npx next build`
  green (all routes compiled, including `/sign-in/[[...sign-in]]` and
  `/sign-up/[[...sign-up]]`).
  Next: cycle 2 — sign-up polish already folded in above; admin overview
  restyle to the light system with motion is next up per the schedule.

- 2026-07-19 (cycle 2): Admin overview restyled to the light editorial system
  (sign-up was already covered in cycle 1, so this cycle is the "admin
  overview" half of the schedule). `components/admin/admin-shell.tsx`:
  replaced the near-black instrument-panel chrome with the paper/beige shell
  (bg-white main pane, `#f5f4f0` sidebar band, hairline borders, `Mark`
  wordmark) while keeping the "elevated access" identity legible via a
  restrained red accent (nav active-pill, the platform-admin badge, the
  audit-trail banner) instead of the old all-red dark sidebar; added entrance
  motion (sidebar slide-fade, main-pane fade on route change) and a
  reduced-motion-safe `AccessDenied` state (previously had no
  `useReducedMotion` guard). RBAC gating (`api.admin.status`,
  fail-closed `AccessDenied`) and audit logging
  (`api.admin.logAccess` effect keyed on `pathname`) are byte-for-byte
  unchanged. `app/admin/page.tsx` (Platform overview): swapped the
  `components/marketing/motion` `Stagger`/`StaggerItem` import for the
  canonical `components/site/motion` `Reveal`/`Stagger`/`StaggerItem` (same
  primitives every other lane uses, now wraps the header, both fleet/controls
  cards, and the error-stream panel in scroll/entrance reveals); replaced the
  hardcoded `bg-[#0c0c0c]` terminal-window background and the neon
  `red-400`/`red-500`/`lime-400` accents with the light-system equivalents
  (`bg-white` log panel with a `band` titlebar, `red-600`/`red-50`/`red-200`
  for warnings and break-glass controls, `green-500` for the live dot). All
  Convex hooks (`platformStats`, `flags`, `recentErrors`, `setFlag`
  mutation), the toast copy, and the KPI/RingGauge/Toggle/Badge data wiring
  are unchanged. `app/admin/tenants|fleet|compliance|audit/page.tsx` left
  untouched this cycle (scheduled for cycle 3 and cycle 5 per the program).
  Verified `npx tsc --noEmit` clean for every lane-E file (only pre-existing
  Lane D errors remain in `app/dashboard/network/page.tsx` and
  `components/workflow-trace.tsx`, unrelated to this lane and not fixed here
  per the ownership rule); `next build` currently fails only on that same
  Lane D `Stagger as="ul"` type mismatch, outside this lane's ownership.
  Next: cycle 3 — admin tenants/compliance/audit restyle.

- 2026-07-19 (cycle 3): Restyled the four remaining admin surfaces
  (`app/admin/tenants/page.tsx`, `app/admin/fleet/page.tsx`,
  `app/admin/compliance/page.tsx`, `app/admin/audit/page.tsx`) to the light
  editorial system with motion, matching the pattern the overview page set in
  cycle 2. Replaced every leftover dark-theme accent
  (`text-lime-400`/`text-red-400`/`text-amber-400`/`text-yellow-400` and the
  `border-*-500/30` break-glass button treatment) with the light-system
  equivalents (`text-green-600`/`text-red-600`/`text-amber-500`/`amber-600`,
  `bg-*-50`/`border-*-200` pill buttons) and added explicit `text-foreground`
  where headings/values had been relying on an implicit dark-mode default.
  `app/admin/compliance/page.tsx` also had its `Stagger`/`StaggerItem` import
  switched from the legacy `components/marketing/motion` to the canonical
  `components/site/motion` (same fix already applied to the overview page
  last cycle, now the whole admin section is on one motion source). Added
  `Reveal` on every page header/panel and `Stagger`/`StaggerItem` row-reveal
  on the tenants and fleet tables (grid row divs become the `StaggerItem`
  root directly, so table grid layout is unchanged, just entrance-animated).
  The audit trail (up to 200 rows) intentionally does NOT get a per-row
  stagger, a single container-level `Reveal` covers the whole card; per-item
  viewport animation at that row count would add animated nodes with no
  visible benefit past a screenful. No RBAC, audit-logging, Convex query/
  mutation, or route/prop changes anywhere; `components/admin/admin-shell.tsx`
  untouched this cycle (already done in cycle 2). Verified
  `npx tsc --noEmit` clean with zero errors repo-wide and `npx next build`
  fully green (all 47 routes compiled, including all five `/admin/*` routes).
  Next: cycle 4 — auth error/loading states per the program schedule.

- 2026-07-19 (cycle 4): Auth error/loading states + admin fleet refinement,
  per this cycle's assignment. `app/layout.tsx`: extended the Clerk
  `appearance.elements` map with the full error/warning/info/loading
  vocabulary Clerk exposes — `alert`/`alert__danger`/`alert__warning`/
  `alert__info`/`alertIcon`/`alertText` for top-level form alerts (e.g.
  "that email is taken"), `formFieldErrorText`/`formFieldWarningText`/
  `formFieldSuccessText`/`formFieldInfoText`/`formFieldHintText` and
  `formFieldInput__error` for per-field validation, and `spinner` /
  `formButtonPrimary__loading` for the in-flight submit state, all in the
  same red-600/amber-500/green-600 palette the rest of the light system
  uses (verified every selector key against `@clerk/shared`'s
  `ElementsConfig`/`ControlState`/`AlertId` types before wiring it in, so
  nothing is a silently-ignored typo). `app/sign-in/auth-shell.tsx`: gave
  those error/warning/info nodes a small `cd-auth-in` settle-in animation
  (keyframes scoped via a local `<style>` tag in this owned file, not
  `app/globals.css`; a `prefers-reduced-motion` media query kills it
  outright) so Clerk mounting a new error message reads as a soft arrival
  instead of a pop. Also added a Clerk loading state: `<ClerkLoading>`
  now renders a shaped `FormSkeleton` (label-row + input-row placeholders,
  a pill-shaped button bar, a divider) with a gentle opacity pulse loop
  (static under reduced motion) in place of a blank panel while the Clerk
  bundle/session bootstraps, and `<ClerkLoaded>` fades the real
  `<SignIn />`/`<SignUp />` in on top once ready, both wrapped in
  `motion/react` fades keyed off `useReducedMotion()`; no Clerk auth call,
  route, or prop changed, purely what wraps it while (and before) it
  loads. `app/admin/fleet/page.tsx`: added a search icon + animated clear
  button (`AnimatePresence`/scale-fade, transform+opacity only) to the
  filter input, a `hover:bg-band/60` row wash on the fleet table (CSS
  transition, matches the `Card` hover language already used elsewhere),
  an ambient opacity-pulse on the status badge specifically for rows in
  `provisioning` (stops immediately under reduced motion or once a row
  settles into `running`/`stopped`/`failed`), and replaced the bare "No
  hosted agents match" text with a small icon + differentiated empty vs.
  filtered-empty copy, entrance-animated. No Convex query
  (`api.admin.fleet`), filter logic, or RBAC/audit behavior touched;
  admin tenants/compliance/audit pages and `admin-shell.tsx` untouched
  this cycle (already restyled in cycles 2-3; fleet-and-beyond
  consistency pass is cycle 5 per the schedule). Verified
  `npx tsc --noEmit` exits 0 with zero errors repo-wide and `npx next
  build` fully green (all 47 routes compiled, including `/sign-in`,
  `/sign-up`, and all five `/admin/*` routes).
  Next: cycle 5 — admin fleet + settings per the program schedule (fleet
  already got its loading/hover/empty-state pass this cycle; settings and
  any remaining consistency work is next).

- 2026-07-19 (cycle 5): Admin settings + remaining-admin consistency pass.
  There is no dedicated `/admin/settings` route in this app (the nav is
  Overview/Tenants/Fleet/SOC 2/Audit), so "admin settings" this cycle means
  the platform-controls panel on `app/admin/page.tsx`, the one surface that
  actually toggles platform-wide flags: renamed its section label to
  "fleet · settings" (with a `Settings` glyph) and gave the "Maintenance
  mode" row a `Wrench` icon so both break-glass rows read as a settings
  block, not just the autonomy-pause row. Layered `CountUp` (from Lane A's
  `components/site/motion`) onto every plain numeric readout across the
  admin surfaces that wasn't already animated (the KPI ring gauges already
  count up on their own, that code lives in Lane C's `components/ui.tsx`
  and was left untouched): the six "Fleet & reliability" metrics on the
  overview page, a new totals strip on `app/admin/tenants/page.tsx`
  (companies / spaces / agents / paused, the paused chip only rendering
  when non-zero) plus per-row spaces/agents/paused counts, the
  running/provisioning/stopped totals strip on `app/admin/fleet/page.tsx`,
  the "passed/total" SOC 2 score on `app/admin/compliance/page.tsx`, and a
  new "N entries" chip on `app/admin/audit/page.tsx`. All of these read off
  `useMemo`/`.length` derived from the same Convex query results already on
  the page (`api.admin.tenants`, `api.admin.fleet`, `api.admin.compliance`,
  `api.admin.auditTrail`), no new query, mutation, or route was added.
  Also did a token-consistency sweep of `components/admin/admin-shell.tsx`
  (owned only by this lane): replaced every literal hex Tailwind arbitrary
  value (`text-[#1f1f1c]`, `text-[#6c6a64]`, `bg-[#f5f4f0]`,
  `border-[#e7e5df]`, `hover:border-[#d6d4cd]`, `text-[#8a8781]`,
  `text-[#4a4842]`) with the semantic tokens Lane C's `globals.css` already
  defines and every other restyled surface (`components/sidebar.tsx`,
  `components/ui.tsx`, the admin pages themselves) already uses
  (`text-foreground`, `text-muted-strong`, `bg-band`, `border-border`,
  `hover:border-border-hover`, `text-muted`), so the shell now tracks the
  same palette source as the rest of the app instead of hardcoded hex that
  would silently drift from it; same sweep on the remaining literal hex in
  `app/admin/page.tsx` (`text-foreground`/`bg-border` in the mono
  prompt/terminal-dots row). RBAC gating, audit `logAccess` effect, the
  `setFlag`/`setCompanyAutonomy` mutations, and every Convex query on every
  page are byte-for-byte unchanged; only presentation and the count-up
  motion layer moved. Verified `npx tsc --noEmit` has zero errors in every
  file this lane owns (`app/sign-in/**`, `app/sign-up/**`, `app/layout.tsx`,
  `app/admin/**`, `components/admin/*`); the one remaining repo-wide tsc
  error (`app/dashboard/models/page.tsx`, an unclosed `Reveal` JSX tag) is a
  Lane D file mid-edit this same cycle, outside this lane's ownership, not
  touched here.
  Next: cycle 6 — reduced-motion + performance pass across every Lane E
  file; re-verify every looping/ambient animation (fleet provisioning
  pulse, auth-shell error settle-in, Clerk loading skeleton pulse) fully
  stops under `useReducedMotion`, and re-confirm no dark-token leftovers.

- 2026-07-19 (cycle 6): Reduced-motion + performance audit of every file
  this lane owns (`app/sign-in/**`, `app/sign-up/**`, `app/layout.tsx`,
  `app/admin/**`, `components/admin/*`). Read every `motion.*`/`animate`/
  `repeat: Infinity`/CSS-animation call site: `auth-shell.tsx`'s
  `SkeletonBar` pulse and `cd-auth-in` settle-in keyframes, `admin-shell.tsx`'s
  sidebar/main entrance and `AccessDenied` motion, and every admin page's
  `Reveal`/`Stagger`/`CountUp`/`AnimatePresence` usage were all already
  gated correctly (either an explicit `useReducedMotion()` branch collapsing
  `repeat: Infinity` to a static value with `transition: undefined`, or
  built on Lane A's `components/site/motion` primitives, which are
  reduced-motion-safe by construction and confirmed by re-reading that
  file). The two bare CSS loops in this lane's files
  (`animate-spin` on the admin-shell auth-loading state,
  `animate-ping` on the "live" dot on `/admin`) are covered by Lane C's
  global `prefers-reduced-motion` rule in `app/globals.css` (forces
  `animation-iteration-count: 1` on every element), so no per-lane fix was
  needed there either; verified that rule still exists before relying on
  it. Confirmed zero data-URI/dark-token leftovers: swept every owned file
  for `dark:`, near-black backgrounds, and translucent white/black overlay
  patterns typical of a dark theme; the only two `text-white` hits
  (Clerk's button `spinner` on the ink-colored primary pill, and the
  active red nav-pill label in `admin-shell.tsx`) are correct-contrast
  text-on-dark-accent, not stray dark-theme remnants, left as-is. Made one
  real performance fix: `app/admin/fleet/page.tsx`'s per-row "provisioning"
  status badge previously ran its own Framer Motion `animate`/
  `transition: { repeat: Infinity }` loop per row (a JS-driven tick per
  provisioning agent); replaced it with Tailwind's CSS `animate-pulse`
  utility (opacity-only, compositor-driven, and already killed under
  reduced motion by the same global CSS rule above), which is materially
  cheaper when a fleet has many agents provisioning simultaneously and
  removes the need for a duplicate local `reduce` check on that node.
  No auth flow, Convex query/mutation, route, prop, or RBAC/audit behavior
  touched anywhere. Verified `npx tsc --noEmit` exits 0 with zero errors
  repo-wide and `npx next build` fully green (all 47 routes compiled,
  including `/sign-in`, `/sign-up`, and all five `/admin/*` routes).
  Next: cycle 7 — cross-surface consistency pass (spacing/radii/type
  scale/motion timing unified to shared constants) per the program
  schedule.

- 2026-07-19 (cycle 7): Cross-surface consistency pass across every file this
  lane owns, converging on the shared constants the other lanes introduced
  this same cycle instead of re-typing near-identical magic numbers. Radii:
  the two 26px "elevated overlay panel" literals
  (`app/sign-in/auth-shell.tsx`'s floating illustration frame,
  `components/admin/admin-shell.tsx`'s `AccessDenied` panel) now use Lane C's
  new `rounded-modal` utility (`app/globals.css`'s `--radius-modal: 26px`
  token, a cycle-7 addition whose own comment explicitly named this lane's
  two literals as candidates for adopting it); the admin overview page's terminal-style
  error-stream panel (`app/admin/page.tsx`) moved off a one-off `rounded-2xl`
  onto `rounded-card` to read at the same corner-radius scale as the `Card`
  components immediately above it on the same page, instead of visibly
  drifting a size class off. Shadows: the two `shadow-[0_1px_2px_rgba(31,31,
  28,0.04)]` literals (`admin-shell.tsx`'s identity chip,
  `app/admin/page.tsx`'s error-stream panel) now use Lane C's `shadow-card`
  token, an exact value match. Motion timing: replaced every bespoke
  reduced-motion duration fallback (`0.2`, `0.25`, `0.3`) in this lane's raw
  `motion.div` transitions with `DURATION.reduced` (the constant
  `components/site/motion.tsx` documents as "one settle time everywhere
  instead of a different number per call site") across `auth-shell.tsx`
  (5 call sites) and `admin-shell.tsx` (3 call sites); snapped every
  full-motion duration to the nearest named step on the same `DURATION` scale
  (`slow`/`slower`/`medium`/`base`) instead of the previous `0.4`/`0.45`/
  `0.5`/`0.55`/`0.6`/`0.7` spread of near-duplicates, and replaced
  `app/admin/fleet/page.tsx`'s one-off `duration: 0.15` micro-pop with
  `DURATION.instant`. The auth-shell brand-panel entrance group's stagger gap
  (`0.09`) now uses `STAGGER.loose`, the named constant whose own doc-comment
  ("a slower, more dramatic single-column reveal") describes exactly that
  entrance. Springs: `admin-shell.tsx`'s nav active-pill spring
  (`stiffness 420 / damping 36`) was a near-duplicate of Lane C's own
  `UI_SPRING.pill` (`420/34`, already shared by `components/sidebar.tsx`'s
  active pill and every Segmented/Badge/Toggle pop in `components/ui.tsx`);
  imported `UI_SPRING` from `@/components/ui` and now uses `UI_SPRING.pill`
  directly so the admin nav pill glides with the exact same feel as the app
  sidebar's, not a point off. Type scale: the auth-shell brand-panel headline
  was a bespoke `text-[34px] font-semibold ... xl:text-[38px]` that had
  drifted from Lane B's new `TYPE_H2` constant
  (`components/site/ui.tsx`, also a cycle-7 addition) in weight (semibold vs
  medium), tracking, and breakpoint despite being the same visual role (a
  big editorial headline on a light-system panel); swapped it for `TYPE_H2`
  directly. Color tokens: `auth-shell.tsx` still had eight raw hex literals
  (`#1f1f1c`/`#8a8781`/`#e7e5df`/`#efede7`) left over from cycle 1, even
  though the component is wrapped in the same `.site-light` scope every
  (site) page uses and Lane B's convention there is `text-[var(--site-ink)]`
  / `text-[var(--site-body)]` / `border-[var(--site-line)]` /
  `bg-[var(--site-card)]` (confirmed by grepping `app/(site)/pricing/page.tsx`
  for the pattern); replaced all eight with the matching `--site-*` var
  reference so this lane's one auth-shell file reads off the identical
  token source as every marketing page instead of a hardcoded snapshot of
  the same values. Left alone, deliberately: `app/layout.tsx`'s Clerk
  `appearance` hex literals (already documented in that file's own comment
  as intentionally mirrored, since `ClerkProvider` renders before CSS custom
  properties resolve, not old-style drift); the admin pages' own
  `Stagger`/`CountUp` micro-timing (row-stagger `gap={0.03}`, chip-strip
  `gap={0.05}`, `CountUp duration={0.6-0.9}`) which is already
  self-consistent across `tenants`/`fleet`/`compliance`/`audit` and
  deliberately looser than the `STAGGER`/`DURATION` scale's named buckets
  for a different reason (many-row lists needing a faster per-item stagger,
  and count-ups needing longer settle times than a fade/rise) rather than
  drift. No auth flow, Convex query/mutation, route, prop, or RBAC/audit
  behavior touched anywhere; every change in this cycle is a class-name or
  transition-value swap to an already-defined shared constant. Verified
  `npx tsc --noEmit` exits 0 with zero errors repo-wide and `npx next build`
  fully green (all routes compiled, including `/sign-in`, `/sign-up`, and
  all five `/admin/*` routes).
  Next: cycle 8 — final self-review against the spec (auth flows/RBAC/audit
  untouched, reduced-motion complete, tsc + build green, no stray old-style
  surfaces) per the program schedule.

- 2026-07-19 (cycle 8): Final self-audit of every file this lane owns
  (`app/sign-in/**`, `app/sign-up/**`, `app/layout.tsx`, `app/admin/**`,
  `components/admin/*`) against the master spec. Checklist run: (1) no
  `lucide-react` imports anywhere in this lane (grep clean, this lane already
  used `@/components/icons` throughout); (2) all motion imports `motion/react`,
  zero `framer-motion` imports; (3) every looping/ambient animation
  (`auth-shell.tsx`'s `SkeletonBar` pulse and `cd-auth-in` settle-in,
  `admin-shell.tsx`'s entrance/AccessDenied motion, the fleet-page
  provisioning `animate-pulse`, the admin-overview `animate-ping` live dot,
  the admin-shell loading `animate-spin`) either has an explicit
  `useReducedMotion()` branch collapsing to a static end state or is a bare
  CSS animation covered by `app/globals.css`'s global
  `prefers-reduced-motion` rule (re-verified the rule is still present and
  unmodified at lines 135-144, `animation-iteration-count: 1 !important` /
  `transition-duration: 0.01ms !important` on `*`); (4) only `transform` and
  `opacity` (plus non-animated `border-color`/`background-color` CSS
  transitions on hover, which are not scroll/loop-driven) are animated
  anywhere in this lane's files; (5) swept for em-dashes and found three
  leftovers that had escaped every prior cycle's sweep because they sit in
  a metadata string and in-code comments rather than visible page copy
  (`app/layout.tsx`'s `metadata.description`, a code comment in the Clerk
  `appearance` block; `app/sign-in/auth-shell.tsx`'s top-of-file doc
  comment) and replaced all three with a colon, matching the zero-em-dash
  convention already established across every `(site)` and `dashboard`
  file; left the "—" empty-state/placeholder glyphs in
  `app/admin/compliance/page.tsx` and `app/admin/fleet/page.tsx` alone since
  that is a distinct, repo-wide convention (same glyph used the same way in
  `app/dashboard/agents`, `app/dashboard/ops`, `app/dashboard/evals`, etc.
  for "no value"), not prose punctuation. Re-read every owned file in full:
  no data-URI dark-theme leftovers, no stray hex literals off the
  `--site-*`/semantic-token system (the layout.tsx Clerk `appearance` hex
  values remain intentional, documented, pre-CSS-custom-property literals).
  Confirmed by re-reading: Convex hooks unchanged
  (`api.admin.status`/`logAccess`/`platformStats`/`flags`/`recentErrors`/
  `setFlag`/`tenants`/`setCompanyAutonomy`/`fleet`/`compliance`/
  `auditTrail`), RBAC fail-closed `AccessDenied` gate unchanged, audit
  `logAccess` effect unchanged, Clerk `<SignIn />`/`<SignUp />` components
  and their props unchanged, every route path unchanged. Verified
  `npx tsc --noEmit` exits 0 with zero errors repo-wide (all five lanes)
  and `npx next build` fully green: all 47 routes compiled, including
  `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`, and all five
  `/admin/*` routes, no warnings besides an unrelated stale webpack cache
  notice. Lane E is complete for the 8-cycle program: auth wall rebuilt in
  the split-panel light editorial system with full entrance/loading/error
  motion, all five admin surfaces restyled to the same system with RBAC/
  audit behavior byte-for-byte preserved, reduced-motion-safe throughout.
