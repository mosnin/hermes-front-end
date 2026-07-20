# Lane C-shell progress

(Track what is done and what is next here, one dated bullet per cycle.)

- 2026-07-19 (cycle 1): Stood up the app-light editorial system as the
  application's single skin. `app/globals.css`: replaced the dark
  "chirp" `:root` tokens with the paper/beige/ink palette (`--background
  #fff`, new `--band #f5f4f0`, `--surface #efede7`, `--border #e7e5df`,
  `--foreground #1f1f1c`, `--muted #8a8781`, `--accent` now solid ink
  `#1f1f1c` for the "solid black pill" language, `--accent-2` a warm
  `#c9a15c`); dropped the old `[data-theme="light"]` dark-forcing hack
  entirely (single skin, no dark branch, so a stale localStorage "dark"
  value can no longer resurrect the old UI); added a `--color-band` /
  `bg-band` utility; re-tuned the shared scrollbar, `.glow-*` helpers, and
  skeleton shimmer to read on white/beige instead of near-black (kept the
  class names stable since other lanes' unowned files reference them).
  Added a `.app-light` font scope resolving `--font-app`. `components/
  theme.tsx`: kept the exact `ThemeProvider`/`useTheme` API but default
  theme is now `"light"`; no CSS branches on `data-theme` today so toggling
  is a harmless no-op (kept for forward-compat, not consumed elsewhere in
  the app). `app/dashboard/layout.tsx`: loads Instrument Sans locally
  (`--font-app` via next/font, scoped through `.app-light`) and wraps the
  shell in the new tokens; sidebar now sits on `bg-band` beside a
  paper-white `main`. `components/sidebar.tsx`: full restyle to the
  pill/card language — asterisk brand mark, paper-white cards for the org/
  space switchers (space dropdown now animates open/close with
  AnimatePresence), pill search button, rounded-full nav rows with the
  existing `layoutId="sidebar-active-pill"` now gliding as a solid-ink pill,
  hover/press micro-interactions (`hover:bg-white`, `active:scale-[0.98]`,
  icon nudge), softened admin/promo/account cards to hairline-bordered
  white cards. `components/ui.tsx`: full pass (not just Button/Card, since
  I own the whole file and cycle 2 was only scheduled to deepen it) —
  `Button` is now a `motion.button` pill (whileHover lift + whileTap
  spring-scale, reduced-motion safe) with an `Omit`-narrowed prop type to
  avoid the native-vs-motion `onDrag`/`onAnimationStart` collision; `Card`
  is a rounded-[22px] beige card with a hover shadow lift; `Badge`/`Input`/
  `Textarea`/`Modal`/`EmptyState`/`StatusDot`/`RingGauge`/`Segmented`/
  `Toggle` all re-themed to the light palette (readable light-toned badge
  tones instead of neon-on-dark, ink focus rings instead of orange glow,
  softened RingGauge stroke colors). `app/dashboard/template.tsx`: tuned
  the per-route rise transition to share Lane A's `EASE` curve. Verified
  `npx tsc --noEmit` clean and `next build` green (all dashboard/admin/
  site/auth routes compiled) before finishing. Left for later cycles per
  the plan: sidebar/shell polish + page-transition refinement is cycle 3;
  I did a light touch on template.tsx now but will revisit. Any residual
  hardcoded dark literals (glow rgbas, gradients) inside Lane D/E-owned
  page files are outside my ownership and will fade as those lanes reach
  their pages — the shared tokens already carry those files to the light
  palette for anything using semantic `bg-*`/`text-*`/`border-*` utilities.
- 2026-07-19 (cycle 2): Deepened motion on the five UI-kit primitives called
  out for this cycle, in `components/ui.tsx` (still the only file touched;
  `app/globals.css`, `sidebar.tsx`, dashboard `layout.tsx`/`template.tsx`,
  `theme.tsx` untouched this cycle). `Badge` now mounts with a reduced-motion
  safe spring pop-in (`opacity`/`scale` only) so badges that appear inside
  conditionally-rendered list rows (fleet templates, MCP transports, log
  levels, etc. — checked call sites across `components/fleet/*`,
  `components/marketplace/*`, several dashboard pages) get a tasteful
  entrance instead of popping in flat; tones/props unchanged. `Input`/
  `Textarea` are now `motion.input`/`motion.textarea` with a subtle
  `whileFocus` scale (`1.006`/`1.003`, transform-only, skipped under
  `useReducedMotion`) layered on top of the existing focus-ring transition;
  had to introduce `NativeInputProps`/`NativeTextareaProps` (same `Omit`
  pattern already used for `Button`) to resolve the native-vs-motion
  `onDrag`/`onAnimationStart` type collision — confirmed no call site holds a
  ref into either component before making the swap, so behavior/props are
  unchanged. `Modal` gained a close (X) affordance in the corner (rotates on
  hover, springs on tap, calls the same `onClose` the backdrop click already
  used) — purely additive, does not disturb any of the ~20 call sites' custom
  header/footer content since it is absolutely positioned. `Segmented`
  options and `Toggle`'s track button now get a `whileTap` press-scale
  (skipped under reduced motion) on top of the existing layoutId pill glide
  and spring knob. Verified `npx tsc --noEmit` clean and `next build` green
  across all site/dashboard/admin/auth routes after the change (had to fix
  the Input/Textarea prop-collision compile error before it was clean). Next
  up per the plan: sidebar polish + page-transition refinement is cycle 3.
- 2026-07-19 (cycle 3): Sidebar polish + page-transition refinement, as
  scheduled. `components/sidebar.tsx`: the whole rail now cascades in on
  mount (brand mark, org switcher, space switcher, search pill, the four
  nav sections, admin/promo/account cards) via Lane A's `Reveal`/`Stagger`/
  `StaggerItem` primitives, each with a small stepped delay so it reads as
  one top-to-bottom sweep rather than everything popping in at once (the
  nav-section stagger uses a `contents`-display wrapper so the cascade
  container never disturbs the existing `flex flex-col gap-4` layout of the
  section list). The live agent-count badge next to "Agents" now pops with
  a spring (`AnimatePresence mode="popLayout"`, transform/opacity only) any
  time the underlying Convex count actually changes, instead of silently
  swapping text. `SpaceSwitcher`'s trigger and the search pill are now
  `motion.button`s with a reduced-motion-gated `whileTap` press-scale
  (replacing a plain `active:scale-[0.98]` that ignored prefers-reduced-
  motion). Fleet promo card gets a small icon nudge on hover. The active-
  pill `layoutId` glide, all Convex queries/mutations, every href, and RBAC-
  gated admin link are unchanged. `app/dashboard/layout.tsx` /
  `app/dashboard/template.tsx`: replaced the cycle-1 hand-rolled enter-only
  fade with Lane A's canonical `PageTransition` primitive (the one the spec
  calls out for every lane to consume), mounted once in `layout.tsx` around
  `{children}`. Since the layout persists across client-side navigations
  (unlike `template.tsx`, which Next.js remounts on every route change),
  this is the one place its internal `AnimatePresence` can actually run a
  real exit animation before the next route's enter, keyed by pathname,
  instead of only ever fading in. `template.tsx` no longer duplicates that
  motion (would have double-animated every navigation); it now uses its
  per-navigation remount guarantee for the one thing only it can do well:
  resetting the app's scrollable content pane to the top on every route
  change, so navigating from a long page to a short one never leaves you
  scrolled halfway down. Confirmed `export const dynamic = "force-dynamic"`
  in `layout.tsx` stays valid (layout.tsx itself is still a Server
  Component; `PageTransition` is a client boundary imported from Lane A's
  already-"use client" `components/site/motion.tsx`, not a "use client"
  directive added to the layout file itself). Verified `npx tsc --noEmit`
  clean (zero output project-wide) and `next build` green (every dashboard/
  admin/site/auth route compiled, static pages generated) before finishing.
  Untouched this cycle: `app/globals.css`, `components/ui.tsx`,
  `components/theme.tsx` (no functional need this cycle; cycle 2 already
  deepened the UI kit). Next up per the plan: cycle 4 is modal/toast/
  command-palette motion in `components/ui.tsx`.
- 2026-07-19 (cycle 4): Modal/toast/command-palette motion, scoped to what is
  actually inside my ownership list (`components/toast.tsx` and
  `components/command-palette.tsx` are not on my owned-files list — Lane D
  owns the palette explicitly and the toast provider is not granted to any
  lane — so I left both untouched rather than reach outside my lane).
  `components/ui.tsx` `Modal`: added `Escape`-to-close (a `keydown` listener
  scoped to `open`, calling the exact same `onClose` every one of the ~20
  call sites already passes in) and a body-scroll lock while open (saves/
  restores the previous `overflow` inline style, so nested pages that
  already set their own overflow are not clobbered on close). Wrapped
  `title`+`children` in a `motion.div` that fades in ~60ms after the panel's
  entrance spring starts, so the frame reads as arriving first and the
  content filling it, instead of everything popping simultaneously (opacity
  only, reduced-motion gated to render with no delay/animation). Gated the
  existing close-button `whileHover`/`whileTap` behind `useReducedMotion`
  (previously unconditional). `components/sidebar.tsx`: the command-palette
  launcher (the "Search... /⌘K" pill that dispatches the synthetic `⌘K`
  keydown Lane D's palette listens for — dispatch mechanism untouched) now
  gets a `whileHover` lift plus a hover-driven icon scale and `kbd` tint via
  a `group` wrapper, matching the press feedback it already had. Also gave
  `SpaceSwitcher`'s dropdown (the one modal-like overlay in the sidebar)
  `Escape`-to-close and click-outside-to-close via a root ref + window
  listeners scoped to `open`, on top of its existing open/close state and
  `layoutId`-free `AnimatePresence` — purely additive interaction polish,
  no change to the Convex `spaces.create` mutation call or any prop.
  Verified `npx tsc --noEmit` clean and `npx next build` green (every site/
  dashboard/admin/auth route compiled, static pages generated) after the
  change. Untouched this cycle: `app/globals.css`, `app/dashboard/layout.tsx`,
  `app/dashboard/template.tsx`, `components/theme.tsx`. Next up per the plan:
  cycle 5 is consistency-of-shell alongside the other lanes' remaining-page
  and admin-fleet/settings work.
- 2026-07-19 (cycle 5): Shell-consistency pass, as scheduled ("C: shell
  consistency"). Audited `components/sidebar.tsx` and `components/ui.tsx` for
  drift between call sites that were restyled in different cycles and found
  the same three values repeated as raw literals at 12+ call sites across both
  files: the hover-border tint (`#d6d4cd`), the resting card shadow
  (`0 1px 2px rgba(31,31,28,0.04)`), and its hover-lift counterpart
  (`0 8px 24px rgba(31,31,28,0.07)`) — plus one narrower case, the resting-
  state nav-item ink (`#4a4842`, distinct from `--muted`, used once).
  Promoted all four to real design tokens in `app/globals.css` (the only file
  I own that any lane can build on): `--border-hover`, `--muted-strong`, and a
  `--shadow-card` / `--shadow-card-hover` pair, each mapped through `@theme
  inline` into Tailwind utilities (`border-border-hover`, `text-muted-strong`,
  `shadow-card`, `shadow-card-hover`). Rewired every call site in
  `sidebar.tsx` (SpaceSwitcher trigger + dropdown, OrganizationSwitcher
  appearance classNames, search pill, its `kbd`, nav-item resting text, promo
  card) and `ui.tsx` (Button outline variant, Card, Segmented) off the raw
  bracket literals onto the new utilities — same computed colors/shadows,
  zero visual diff, just one definition to tune from now on instead of
  hunting bracket syntax across two files (and the same literals already
  appear, unowned, in Lane A/B/D/E files — `mockups.tsx`, `auth-shell.tsx`,
  `admin-shell.tsx`, the pricing/features pages, `bento.tsx`, `site/ui.tsx`,
  `site/painting.tsx` — so the token is there now for those lanes to adopt at
  their own pace without me touching their files). Also swapped literal
  `bg-white` for the semantic `bg-background` token everywhere in both files
  where it represents the actual paper-white surface (SpaceSwitcher/
  OrgSwitcher/search-pill/promo-card fills, nav-item hover fill, Button
  outline, Input/Textarea, Modal panel, EmptyState graphic frame, Segmented
  track, Toggle knob) — left the two spots where "white" is a deliberate
  transparency/contrast effect rather than a surface (`bg-white/20` badge
  overlay on the ink active pill) untouched, since that is not standing in
  for the page background. Separately, caught and fixed a real reduced-motion
  gap while auditing: `StatusDot`'s "online" ping ring was an unconditional
  `repeat: Infinity` loop with no `useReducedMotion()` gate, violating the
  program's absolute rule that every looping/ambient animation must fully
  stop under reduced motion — it now only renders when `!reduce`, matching
  every other loop in the file (RingGauge arc, skeleton shimmer, sidebar
  active-count badge). No prop, behavior, Convex call, or auth gate touched
  anywhere. Verified `npx tsc --noEmit` clean and `npx next build` green
  (every site/dashboard/admin/auth route compiled, static pages generated)
  after the change. Untouched this cycle: `app/dashboard/layout.tsx`,
  `app/dashboard/template.tsx`, `components/theme.tsx` (no functional need;
  layout/template got their consistency pass in cycle 3, theme.tsx has been a
  stable no-op API since cycle 1). Next up per the plan: cycle 6 is the
  reduced-motion + performance pass and removing any leftover dark tokens
  (this cycle's `StatusDot` fix is a head start on that).
- 2026-07-19 (cycle 6): Reduced-motion + performance audit across all six
  owned files, as scheduled. Verified every loop: `StatusDot`'s online ping
  (fixed cycle 5) is the only `repeat: Infinity` in `components/ui.tsx` or
  `components/sidebar.tsx`, and it is correctly gated behind `!reduce`; the
  two CSS `@keyframes` loops in `app/globals.css` (`site-marquee`,
  `hermes-shimmer`) already carry `@media (prefers-reduced-motion: reduce) {
  animation: none }` overrides. Confirmed no `useScroll`/`useTransform`/
  `useAnimationFrame`/`whileInView` scroll-linked effects exist in any file I
  own (Lane C's shell has none; the scroll/loop primitives themselves live in
  Lane A's `components/site/motion.tsx`, read-only for me, and re-verified
  every one of its exports — `Reveal`, `Stagger`, `Parallax`, `Marquee`,
  `StickyScene`, `PageTransition`, `CountUp`, `TextReveal`, `TiltCard`,
  `MagneticButton` — degrades correctly under `useReducedMotion()` since my
  `sidebar.tsx` and `app/dashboard/layout.tsx` consume them directly).
  Audited every `animate=`/`initial=` in `ui.tsx` and `sidebar.tsx`: all are
  `opacity`/`y`/`scale` (transform) except `RingGauge`'s one-time
  `strokeDashoffset` arc draw-in, which is neither scroll- nor loop-driven so
  is outside the transform/opacity rule's scope, and was left as is (5px
  `drop-shadow` blur radius, cheap even with several gauges mounting at once
  on a sensor-heavy page). Confirmed zero leftover dark-theme literals:
  grepped `app/globals.css`, `components/ui.tsx`, and `components/sidebar.tsx`
  for near-black/`neutral-900`/`zinc-900`/`dark:`/`data-theme="dark"`/
  `color-scheme` patterns and found nothing (the one hex hit,
  `RING_COLORS.cyan.stroke = "#0891b2"`, is a light-palette gauge accent, not
  a dark-mode leftover); `components/theme.tsx` still only sets a
  `data-theme` attribute nothing in CSS branches on, confirmed harmless.
  Added one genuinely new thing this cycle: a global reduced-motion safety
  net in `app/globals.css` (`@media (prefers-reduced-motion: reduce) { *,
  *::before, *::after { animation-duration/transition-duration: 0.01ms
  !important; animation-iteration-count: 1 !important; scroll-behavior: auto
  !important } }`), the standard defense-in-depth reset (a la Josh Comeau's
  CSS reset) so any plain CSS `transition`/`animation` anywhere in the app
  (including third-party Clerk widget chrome, or a future call site in any
  lane that forgets to gate a hover/focus CSS transition through
  `useReducedMotion()` in JS) collapses to effectively instant rather than
  relying on every author remembering the gate by hand. It only shortens
  duration to near-zero and forces `scroll-behavior: auto`; it does not
  remove transitions outright, so end states are unaffected, and it cannot
  interfere with this codebase's `motion/react` animations since those are
  driven imperatively (WAAPI/rAF), not through the CSS `transition`/
  `animation` shorthand this rule targets. Deliberately left `Card`'s
  `hover:shadow-card-hover transition-shadow duration-300` (box-shadow, not
  transform/opacity) alone after evaluating a transform/opacity-only
  refactor: doing that safely would require wrapping `children` in an extra
  DOM layer, which would break the ~15+ call sites across Lane D/E pages that
  pass layout classes like `flex items-center gap-4` in `className` expecting
  `children` to be direct flex items of the styled div — not worth risking
  "preserve every prop and behavior" for a hover-only, non-scroll/non-loop
  paint cost. Verified `npx tsc --noEmit` clean (zero output) and
  `npx next build` green (every site/dashboard/admin/auth route compiled,
  static pages generated, no route regressions) after the change. Untouched
  this cycle: `components/sidebar.tsx`, `app/dashboard/layout.tsx`,
  `app/dashboard/template.tsx`, `components/ui.tsx`, `components/theme.tsx`
  (audited all four thoroughly; no violations found beyond what the global
  CSS backstop now covers for free). Next up per the plan: cycle 7 is
  cross-surface consistency (spacing/radii/type-scale/motion-timing unified
  to shared constants).
- 2026-07-19 (cycle 7): Cross-surface consistency pass, as scheduled ("unify
  spacing, radii, type scale, and motion timing to shared constants; fill any
  page/component still on the old style"). Audited `components/ui.tsx` and
  `components/sidebar.tsx` together (the two files a redesign pass actually
  touches token-by-token) and found real drift that had accumulated across six
  cycles of independent edits: **radii** — `rounded-[22px]` (Card, EmptyState)
  and `rounded-[26px]` (Modal) were bare bracket literals, also duplicated,
  unowned, in Lane A/B/D/E's `mockups.tsx`, `site/ui.tsx`, `admin-shell.tsx`,
  `auth-shell.tsx`; promoted both to real tokens in `app/globals.css`
  (`--radius-card: 22px`, `--radius-modal: 26px` inside `@theme inline`,
  following the exact `shadow-card` precedent from cycle 5) and rewired every
  call site onto the new `rounded-card` / `rounded-modal` Tailwind utilities
  — verified in the built CSS (`.rounded-card{border-radius:22px}`,
  `.rounded-modal{border-radius:26px}`) that the utilities compile correctly.
  **Motion timing** — the exact literal `duration: 0.15` (a hover/press
  micro-interaction) was repeated verbatim at 7 call sites across the two
  files (Button, Input, Textarea in `ui.tsx`; SpaceSwitcher trigger/dropdown
  and the search pill in `sidebar.tsx`) with no shared name; replaced every
  one with Lane A's already-exported `DURATION.instant` from
  `site/motion.tsx` (its doc comment literally reads "instant micro-pops: a
  glyph or pill nudging on hover" — exactly this use case, just not being
  reached for). Also found three near-duplicate spring presets doing the same
  job with slightly different numbers (pill glide: 420/34 in Segmented vs.
  420/36 in the sidebar's active-nav pill; pop-in: 500/32 in Badge/Toggle vs.
  500/30 in the sidebar's live-count badge) plus Modal's one-off 380/30 panel
  spring; consolidated all of them into one exported `UI_SPRING` object in
  `ui.tsx` (`pill`/`pop`/`panel`) that `sidebar.tsx` now imports too, so the
  two files' pill/badge motion literally shares one definition instead of
  eyeballing "close enough" numbers. Also caught two one-shot easing curves
  (`Reading`'s count-up, `RingGauge`'s arc draw-in) carrying their own
  hand-rolled `[0.22, 0.8, 0.3, 1]` bezier instead of the shared editorial
  `EASE` `[0.22, 0.61, 0.24, 1]` already imported in the same file for
  everything else — unified both to `EASE`. Modal's backdrop-fade and
  content-fade transitions were also missing an explicit `ease` entirely
  (silently falling back to framer's default curve while every sibling
  transition in the same component used `EASE`); both now specify
  `ease: EASE` too. In `sidebar.tsx`, replaced every bare `duration={0.5}` /
  `duration={0.4}` passed into `Reveal`/`StaggerItem` with the named
  `DURATION.medium` / `DURATION.base` they already numerically equal, and the
  cascade's `gap={0.05}` with `STAGGER.tight` (0.06, imperceptibly tighter,
  now a named constant instead of a bespoke one-off) so the intent reads at
  the call site instead of a magic number a future edit could drift off
  without anyone noticing. **Type scale** — the sidebar's "autonomy paused"
  warning was the one place in the shell using a bespoke `text-[11px]`
  instead of Tailwind's standard `text-xs` (12px) step that the rest of the
  file's small body copy already uses; switched it to `text-xs` (the other
  small sizes I audited, `text-[10px]` on eyebrow labels/kbd/badges and
  `text-[15px]` on the single-letterform brand wordmark, are each already
  used consistently for one distinct semantic role across every occurrence,
  so left them as deliberate, not drift). **Fill any page/component still on
  the old style**: re-swept all six owned files for `rounded-[NNpx]` bracket
  radii, bare `duration:`/`stiffness:`/`damping:` literals, and off-scale
  `text-[NNpx]` sizes after the above changes — zero remaining hits; every
  owned file is now fully on the shared-token vocabulary. No prop, behavior,
  Convex call, route, or auth gate touched. Verified `npx tsc --noEmit`
  clean (zero output) and `npx next build` green (every site/dashboard/
  admin/auth route compiled, static pages generated, no route regressions)
  after the change, plus the direct CSS-output check above for the two new
  radius utilities. Next up per the plan: cycle 8 is the final self-review
  audit against the spec.
- 2026-07-19 (cycle 8): Final self-audit against the spec across all six owned
  files, as scheduled ("final self-audit against the spec in every lane;
  ensure tsc + build green, no reduced-motion violations, zero data-logic
  changes; tighten anything rough"). Re-verified every loop/ambient animation
  end to end: `StatusDot`'s online ping is the only `repeat: Infinity` in
  `ui.tsx`/`sidebar.tsx` and stays `!reduce`-gated; the two CSS `@keyframes`
  (`site-marquee`, `hermes-shimmer`) both carry their reduced-motion `animation:
  none` override; the cycle-6 global `@media (prefers-reduced-motion: reduce)`
  backstop in `globals.css` is still in place and un-regressed. Re-confirmed
  every `motion.*` mount/hover/tap/pill/badge animation in `ui.tsx` and
  `sidebar.tsx` is gated behind `useReducedMotion()` (Button, Badge, Input,
  Textarea, Modal's backdrop/panel/close-button/content-fade, Segmented,
  Toggle, SpaceSwitcher trigger/dropdown, the sidebar search pill, and the
  live-count badge's `AnimatePresence`), and that every scroll/loop-adjacent
  animation touches only `transform`/`opacity` (the two documented, deliberate
  exceptions from cycles 6-7 — `RingGauge`'s one-shot `strokeDashoffset` arc
  draw-in and `Card`'s hover `box-shadow` transition — are neither scroll- nor
  loop-driven, so outside the rule's scope, and both remain correctly
  reasoned in-file). Grepped all six owned files for em-dashes in rendered
  JSX text (as opposed to code comments, which are not user-facing copy) and
  for `lucide` imports: zero hits in either case — `components/icons` is the
  only icon source, matching every other lane. Re-confirmed zero
  `[data-theme="dark"]` branch exists anywhere in `globals.css` and
  `theme.tsx` remains a harmless, unconsumed no-op API, so the single-skin
  guarantee from cycle 1 still holds. Diffed intent against the spec's Lane C
  paragraph line by line: paper-white/pill/beige-card language (done, cycle
  1), `layoutId` active pill (done, cycle 1, tokenized cycle 7),
  page-transition (done, cycle 3, consuming Lane A's canonical primitive),
  hover/press micro-interactions in Button/Card and across the UI kit (done,
  cycles 1-2), every prop and behavior preserved (re-verified: no Convex hook,
  route `href`, component prop signature, or RBAC/auth condition differs from
  a plain presentational read of each file). Found nothing rough enough to
  warrant a change; this cycle is verification-only, no file edits. Verified
  `npx tsc --noEmit` clean (zero output, workspace-wide) and `npx next build`
  green (every site/dashboard/admin/auth route compiled and listed in the
  build's route table, static pages generated, zero route regressions)
  immediately before writing this note. Lane C's shell + light theme
  restyle is complete across all 8 cycles per the program spec.
