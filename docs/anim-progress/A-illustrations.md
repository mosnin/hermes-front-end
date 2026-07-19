# Lane A-illustrations progress

(Track what is done and what is next here, one dated bullet per cycle.)

- 2026-07-19 (cycle 1): Built `components/site/motion.tsx`, the shared motion
  primitives library every other lane imports: `Reveal`, `Stagger` /
  `StaggerItem`, `Parallax`, `MagneticButton`, `CountUp`, `TextReveal`,
  `Marquee` (raw animation-frame loop over a single transform so hover-pause
  never snaps), `StickyScene` (pinned scroll track that hands children a
  scroll-progress `MotionValue`), and `PageTransition` (pathname-keyed
  `AnimatePresence` fade/rise). All export a shared `EASE` curve and every
  primitive checks `useReducedMotion()` and fully collapses to a static,
  settled pose (no residual scroll/loop motion) when set.
  Created `components/site/illustration/packet.tsx` with three small shared
  pieces used by the diagrams: `TravelingPacket` (a dot that travels a
  straight segment via transform x/y + opacity, looped), `BreathingRings`
  (opacity-only concentric pulse), `LiveDot` (opacity+scale ping status dot) —
  all reduced-motion-safe.
  Rebuilt all four mocks in `components/site/mockups.tsx` on top of a shared
  `useCardEnergy()` hook (per-card `useScroll` + spring, offset tuned so the
  card "energizes" as it arrives in the viewport) layered under the existing
  entrance stagger, plus hover states, all transform/opacity only:
  - `ConnectMock`: rows keep their staggered reveal, added a scroll-linked
    settle-scale on the whole list, per-row hover nudge, glyph hover pop, and
    switched the active-row ping to the shared `LiveDot`.
  - `OrchestrateMock`: the fanned step cards now spread open (rotateZ +
    per-card translateX, unrolled as five explicit `useTransform` calls to
    keep hook order static) as the card scrolls into view rather than being
    statically fanned; reduced motion renders the fully-fanned static end
    pose. Added per-card hover lift.
  - `GovernMock`: added a scroll-linked scanning sweep (a soft bar that
    travels down the row stack once as the card arrives, transform y +
    opacity), kept the ambient ping dots (now `LiveDot`), added row hover
    scale.
  - `IntegrateMock`: added a subtle scroll-linked settle tilt on the tile
    grid and a breathing ring loop on the active "MCP" tile; tile hover
    scale/lift on all tiles.
  - `ControlPlaneDiagram`: connector line opacity now ramps in with scroll
    energy; added four `TravelingPacket` dots animating along the four
    connectors as an ambient "system is live" loop; swapped the ring pulse
    for the shared `BreathingRings`; pill and center hover states.
  Verified `npx tsc --noEmit` clean repo-wide and `npx next build` green.
  Did not touch Realtime/Skills illustrations or diagram/ambient refinement
  beyond the above — per the master spec's per-cycle table those land in
  cycle 3 (Realtime/Skills) and cycle 4 (scroll-scene refinement); the four
  mocks and diagram already carry ambient loops + scroll energy now so later
  cycles can focus on tuning rather than building from zero. Did not edit any
  page — Lane B still owns wiring `RealtimeMock`/`SkillsMock` replacements
  once those land.
- 2026-07-19 (cycle 2): Deepened `ControlPlaneDiagram` "energy" and added
  ambient loops across the remaining mocks per this cycle's focus.
  `illustration/packet.tsx`: extended `TravelingPacket` with a `pingpong`
  mode (round-trip out-and-back along a connector instead of one-way) and a
  `trail` option (a soft blurred, scaling second dot chasing the head, still
  transform/opacity only) so connectors read as continuously exchanging
  rather than a single pass; added a new `OrbitDots` primitive (a ring of
  small dots that slowly rotates around a relatively-positioned parent,
  pure-rotation transform, fully removed under reduced motion) for reuse by
  future diagram illustrations. `mockups.tsx`: introduced a small
  `CONTROL_NODES` accent map (Decide amber, Connect purple, Lifecycle sky,
  Data platform green) so each pill's status dot, its connector's stroke
  tint, and its packet color now visually match one system instead of
  uniform gray; connectors use the new pingpong+trail packets; each pill
  grew a `LiveDot` that pulses timed to when its packet visually "arrives";
  added a slow ring of `OrbitDots` and an independent ambient breathing
  scale on the center Painting node (layered under the existing scroll
  spring/hover so they don't fight); wrapped the whole diagram in a very
  subtle continuous vertical float. Also broadened "ambient loops" to the
  other three mocks so the whole set feels equally alive: `ConnectMock`'s
  active-row glyph now idles with its own slow pulse (independent of hover,
  using a per-state `transition` so hovering doesn't inherit the infinite
  loop); `OrchestrateMock`'s active fanned card grew a soft pulsing outline
  ring; `GovernMock`'s "Budget guard" row grew a thin live usage bar that
  breathes opacity; `IntegrateMock` grew a periodic diagonal shimmer sweep
  across the tile grid (solid translucent band, not a gradient, clipped to
  the card) matching the spec's "tile shimmer" vocabulary. All new loops are
  guarded by `useReducedMotion()` and animate only transform/opacity.
  Verified `npx tsc --noEmit` clean and `npx next build` green. Did not
  touch Realtime/Skills illustrations (still slated for cycle 3) or edit any
  page.
- 2026-07-19 (cycle 3): Added the two feature-only illustrations to
  `components/site/mockups.tsx` as full-craft exported components matching
  the other four (same `useCardEnergy()` scroll-link, ambient loops, hover
  states, and shared `illustration/packet.tsx` primitives), replacing the
  bare inline placeholders that currently live in Lane B's
  `app/(site)/features/page.tsx` (`RealtimeMock`/`SkillsMock` local
  functions there, unchanged by me since that file isn't mine):
  - `RealtimeMock`: a "held connection" header strip with a dashed feed line
    and a `TravelingPacket` running along it on an ambient loop ("the socket
    is always open"); below, the same five-row event list as before, each
    row now getting its own staggered `LiveDot`, and the active "Burst
    drain" row growing a queue-drain bar whose width is driven by scroll
    energy (full at rest, drained as the card settles into view) next to a
    `CountUp` latency readout (0 to 250ms) instead of static "250ms" text.
  - `SkillsMock`: skill chips keep their staggered reveal but the "grounded"
    chip (Pricing table) now carries the same soft pulsing ring treatment as
    the active tiles/cards elsewhere in the set; the "Vector search" row's
    match count is now a `CountUp` (0 to 3 matches); the "Grounded response
    ready" row grew a thin relevance meter (same visual language as
    `GovernMock`'s budget bar) that fills from scroll energy as the card
    arrives.
  Both new exports pull `CountUp` from `./motion` (added to the existing
  import) and reuse `LiveDot`/`TravelingPacket` from `./illustration/packet`,
  so no new primitives were needed this cycle. Did not edit any page —
  `features/page.tsx` still defines its own local `RealtimeMock`/`SkillsMock`;
  Lane B can now delete those and import these instead. Did not touch the
  scroll-scene refinement pass (cycle 4) or any other mock. Verified
  `npx tsc --noEmit` clean repo-wide and `npx next build` green (all
  `/features`-adjacent routes still compile; the new exports are currently
  unused pending Lane B's import swap, which build tooling does not flag).
- 2026-07-19 (cycle 4): Refined scroll scenes and hover states across every
  mock, per this cycle's focus. `motion.tsx`: added a new shared primitive,
  `TiltCard` — wraps a card so it tilts gently in 3D toward the pointer
  (rotateX/rotateY driven by mouse position, springed) and lifts with a small
  scale on hover, springing back flat on leave; fully inert (renders children
  with no wrapper transforms at all) under reduced motion so layout stays
  identical but static. `mockups.tsx`: reworked `useCardEnergy` from a
  two-point "arrive only" scroll range to a full-viewport lifecycle
  (`offset: ["start end", "end start"]`) that now returns both `energy`
  (0->1 as the card arrives and settles, unchanged in spirit from before) and
  a new `recede` value (0->1 as the card later scrolls up and out of view),
  plus two small shared helpers, `useSceneScale`/`useSceneOpacity`, that
  combine the two into a gentle scale-down and opacity dim as a card recedes,
  so every scene now has a full arrive/settle/recede arc instead of snapping
  to a static pose once revealed and staying frozen there. Wired the recede
  arc into all six card mocks (`ConnectMock`, `OrchestrateMock`, `GovernMock`,
  `IntegrateMock`, `RealtimeMock`, `SkillsMock`) and into `ControlPlaneDiagram`
  (its whole-diagram float now also carries a scene opacity). Wrapped all six
  card mocks in the new `TiltCard` for a pointer-tracked 3D hover lift (the
  diagram was left un-tilted since it spans the full row and a group tilt
  read wrong at that width). Added a dedicated hover refinement to
  `OrchestrateMock`: the fanned steps now spread further while the card is
  hovered (a springed hover motion value blends with the scroll energy to
  drive both the fan's `translateX` offsets and its `rotateZ`, unrolled per
  step so hook order stays static, via a renamed `useFanX` helper so it reads
  as the hook it is), springing back to the scroll-driven pose on mouse
  leave. Refined `ControlPlaneDiagram` hover states: pills now scale/lift
  slightly more (1.06/-3) with a solid-color hover tint (no gradients), and
  hovering anywhere on the diagram now speeds up the center's `OrbitDots`
  rotation and `BreathingRings` pulse (26s/3s at rest down to 10s/1.8s while
  hovered) so the "system is live" ambient loop visibly quickens under
  attention; the center node's hover scale was bumped slightly (1.02 ->
  1.035). Also fixed one pre-existing em-dash in a `motion.tsx` code comment.
  All new scroll/loop-driven motion remains transform/opacity-only (the
  recede scale/opacity, the fan hover, the orbit/ring hover retiming are all
  transform or opacity changes; the pill hover tint is a discrete
  non-looping CSS color transition, not scroll- or loop-driven, so it is not
  bound by the transform/opacity-only rule) and every new interaction is
  fully guarded by `useReducedMotion()`. Verified `npx tsc --noEmit` clean
  repo-wide and `npx next build` green. Did not edit any page or touch
  `illustration/packet.tsx`'s primitives themselves (`OrbitDots`/
  `BreathingRings` already accepted a `duration` prop, reused as-is).
- 2026-07-19 (cycle 5): Parallax + count-up polish, per this cycle's focus.
  `motion.tsx`: `Parallax` gained `axis` ("x" | "y", default "y", back-compat
  unchanged), an optional `scale` prop for a subtle scroll-linked depth-zoom
  (transform-only, layered on top of the existing offset spring), and a
  `springConfig` override so callers can tune stiffness/damping/mass per use;
  all existing call sites (`offset`/`direction`/`className` only) are
  unaffected. `CountUp` was hardened for reuse beyond one-shot stat rows: it
  now animates onward from its current displayed value if `value` changes
  after the count has already started (via a `currentRef` instead of always
  restarting from 0), so it is now safe as a live/ticking counter and not
  just a scroll-triggered one-shot; added a `pop` option (default on) that
  gives the number a small one-shot transform-only scale flourish
  (`popScale` motion value) when the count finishes, skipped entirely under
  reduced motion; added an `easing` prop (defaults to the shared `EASE`) so
  callers can override the curve; the rendered `span` is now a `motion.span`
  with `fontVariantNumeric: "tabular-nums"` so counting digits no longer
  jitter the surrounding layout width. `mockups.tsx`: `ControlPlaneDiagram`'s
  four pills each gained a literal parallax entrance (a new `PILL_DEPTH`
  table drives a per-node, axis-appropriate `useTransform(energy, ...)`
  settle-in offset, e.g. the top "Decide" pill now visibly drifts down into
  place while the left "Connect" pill drifts in from the left) plus their own
  independent idle float loop (distinct amplitude/duration/phase per pill,
  nested under the entrance offset so the two compose without fighting over
  the same transform key), so the four pills now read as sitting at genuinely
  different depths around the center instead of moving in lockstep with the
  single whole-diagram float. `IntegrateMock`'s 3x3 tile grid gained the same
  treatment per row (three unrolled `useTransform` calls, `rowParallax`,
  nearest row settling less than the furthest), each tile now wrapped in an
  outer parallax div ahead of its existing hover/reveal inner div so the grid
  settles in as visibly layered rather than flat. `GovernMock`'s "Budget
  guard" row swapped its static "82% of cap" label for `CountUp` (now
  benefiting from the primitive's polish above) to match the count-up
  treatment already used in `RealtimeMock`/`SkillsMock`. Verified
  `npx tsc --noEmit` clean repo-wide and `npx next build` green (full route
  list compiled, including all dashboard/admin/site routes). Did not touch
  `illustration/packet.tsx` or add any new exported primitive; did not edit
  any page (Lane B owns applying the polished `Parallax` more broadly across
  (site) pages this cycle).
- 2026-07-19 (cycle 6): Reduced-motion + performance pass across all owned
  files, per this cycle's focus. Audited every `whileInView`/`initial`
  entrance in `mockups.tsx` for unguarded translate/scale offsets (a few
  local reveals set `x`/`y`/`scale` in `initial` without checking `reduce`,
  unlike the shared `Reveal` primitive which already zeroes them): fixed all
  8 occurrences across `ConnectMock`, `GovernMock`, `IntegrateMock`,
  `RealtimeMock`, `SkillsMock` (three separate reveal blocks), and
  `ControlPlaneDiagram`'s center entrance, so under
  `prefers-reduced-motion` every one-shot reveal now fades in place with
  zero travel distance instead of still sliding/scaling a few px, matching
  the vocabulary the `Reveal` primitive already established. Also shortened
  their transition `duration` to 0.3s under reduce for consistency.
  Bigger performance fix: every mock and the control-plane diagram carries
  several `repeat: Infinity` ambient loops (pulsing glyphs, breathing rings,
  traveling packets, shimmer sweeps, idle pill floats, orbiting dots), all
  correctly gated by `useReducedMotion()` already but previously running
  continuously in the background even while scrolled far off-screen, since
  nothing paused them by viewport visibility, real jank/battery cost on
  pages that mount many illustrations at once (home, features). Added an
  opt-in `active` prop (default `true`, fully back-compatible with the one
  external caller, Lane E's `<BreathingRings>` in `app/sign-in/auth-shell.tsx`,
  which is unaffected) to every shared ambient primitive in
  `illustration/packet.tsx` (`TravelingPacket`, `OrbitDots`, `BreathingRings`,
  `LiveDot`): when inactive they render nothing, tearing the loop down
  entirely rather than leaving it running off-screen. `mockups.tsx`:
  `useCardEnergy` now also returns a plain `inView` boolean (via `useInView`
  on the same card ref, independent of the eased scroll-energy curve) that
  every card threads into its ambient loops and into every `LiveDot`/
  `TravelingPacket`/`BreathingRings`/`OrbitDots` instance it renders, so all
  seven illustrations (the four original mocks, `RealtimeMock`, `SkillsMock`,
  and `ControlPlaneDiagram`, including its four pills' idle floats, its
  whole-diagram float, its center painting's breathing scale, and its four
  connector packets) now fully pause their infinite loops the moment they
  scroll out of view and resume cleanly on the way back in, on top of the
  existing full stop under reduced motion. Fixed two em-dashes I had
  introduced in my own new code comments while writing the above (repo rule
  is no em-dashes anywhere). Swept all three owned files for leftover dark
  theme tokens (dark background/text classes, `dark:` variants); found none,
  the only `hover:bg-black` hits in `components/site` belong to Lane B's
  `ui.tsx`/`chrome.tsx`, not mine to touch. Confirmed no `lucide` import
  anywhere in `components/site`. Verified `npx tsc --noEmit` clean repo-wide
  and `npx next build` green across every route. Did not edit any page or
  change any illustration's visual composition, only its reduced-motion and
  off-screen-pause behavior.
- 2026-07-19 (cycle 7): Cross-surface motion-timing consistency pass, per this
  cycle's focus. Audited `motion.tsx`, `mockups.tsx`, and
  `illustration/packet.tsx` for scattered duration/spring magic numbers and
  found the entrance/hover/press family (as opposed to the ambient
  `repeat: Infinity` loops, whose varied per-piece timing is intentional
  design language from earlier cycles and was left alone) had drifted into a
  dozen near-duplicate values across the six card mocks. `motion.tsx`: added
  three new exported token tables so every lane's motion timing traces back
  to one source of truth: `DURATION` (`reduced` 0.3 for every reduced-motion
  one-shot fallback, `instant` 0.2 for micro-pops, `fast` 0.28 for
  pointer-linked hover/press, `base` 0.4 for a standard row/tile/chip
  entrance, `medium` 0.5 for a larger single-element entrance, `slow` 0.6 and
  `slower` 0.7 matching `StaggerItem`/`Reveal`'s existing defaults, `route`
  0.32 matching `PageTransition`'s existing cross-fade), `STAGGER` (`tight`
  0.06 dense grids, `base` 0.07 typical ~5-item lists, `loose` 0.1 a slower
  dramatic single-column reveal), and `SPRING` (`snappy` 300/22/0.4
  pointer-linked, `scroll` 140/26/0.5 scroll-linked progress smoothing,
  `soft` 120/30/0.4 slow ambient drift). Rewired every internal call site in
  `Reveal`, `StaggerItem`, `Parallax`'s spring, `MagneticButton`'s spring,
  `TiltCard`'s spring and hover duration, `TextReveal`'s default and reduced
  fallback, and `PageTransition`'s duration to reference these tokens instead
  of inline numbers (values chosen to match, or in TiltCard's/the diagram's
  hover-spring's case very slightly retune toward, the existing feel, so this
  reads as a naming pass plus a light tightening rather than a visual
  rewrite). `mockups.tsx`: replaced every entrance/hover/press magic number
  across `ConnectMock`, `OrchestrateMock`, `GovernMock`, `IntegrateMock`,
  `RealtimeMock`, `SkillsMock`, and `ControlPlaneDiagram`'s center node with
  the shared tokens, and fixed two genuine inconsistencies this surfaced:
  `GovernMock`'s row stagger had drifted to `i * 0.08` while every sibling
  mock used `0.07` (now unified to `STAGGER.base`), and that same row's
  reduced-motion transition had a stray `duration: undefined` instead of a
  real fallback (now `DURATION.reduced`, so it actually degrades to a fast
  settle under reduced motion instead of silently inheriting Motion's own
  default tween). `useCardEnergy`'s scroll spring and `OrchestrateMock`'s
  hover-boost spring now both reference `SPRING.scroll`/`SPRING.snappy`
  respectively instead of one-off stiffness/damping/mass literals. Audited
  radii/spacing/type-scale across the same three files: card radius (26px,
  via the shared `CARD` constant already reused everywhere) matches Lane C's
  modal radius and sits inside the spec's 20-26px range, tile/chip radii use
  Tailwind's own `rounded-xl`/`rounded-2xl`/`rounded-full` scale
  consistently, card padding (`p-6 sm:p-8`) matches Lane C's `Card`, and the
  CSS-transition hover states (`duration-300`) were already uniform across
  all six mocks; no drift found there, so no further change was needed on
  that front beyond the motion-timing tokens above. Verified
  `npx tsc --noEmit` clean repo-wide and `npx next build` green across every
  route; swept the three owned files for em-dashes and stray `lucide`
  imports, found none. Did not edit any page, did not touch
  `illustration/packet.tsx`'s ambient-loop durations (intentionally varied,
  not drift), and did not change any illustration's visual composition
  beyond the tightened spring values noted above.
- 2026-07-19 (cycle 8): Final self-audit against the master spec across all
  three owned files (`motion.tsx`, `mockups.tsx`, `illustration/packet.tsx`).
  Confirmed: all ten required primitives present and exported from
  `motion.tsx` (`Reveal`, `Stagger`/`StaggerItem`, `Parallax`,
  `MagneticButton`, `CountUp`, `TextReveal`, `Marquee`, `StickyScene`,
  `PageTransition`, plus the bonus `TiltCard`), consumed by 63 files across
  every other lane (site pages, dashboard pages, admin, sign-in), so the
  shared library's public API has stood stable through the full 8-cycle
  program with no breaking changes. All seven mock illustrations
  (`ConnectMock`, `OrchestrateMock`, `GovernMock`, `IntegrateMock`,
  `RealtimeMock`, `SkillsMock`, `ControlPlaneDiagram`) present and exported
  from `mockups.tsx`. Re-swept every `initial={{...}}` and `animate={{...}}`
  call site in `mockups.tsx` line by line: every translate/scale offset in an
  `initial` prop is gated `reduce ? 0/1 : value`, and every `animate` on a
  `repeat: Infinity` ambient loop is either wrapped in a
  `{!reduce && inView && (...)}` conditional render or has an inline
  `reduce || !inView ? undefined : {...}` guard, so nothing loops or travels
  under `prefers-reduced-motion` and nothing loops while off-screen either.
  Re-confirmed zero em-dashes, zero `lucide` imports, and zero gradient
  classes/CSS (`grep -niE "gradient"`) across all three owned files. Zero
  `dark:` variants or leftover dark tokens. All scroll- and loop-driven
  motion remains transform/opacity only (verified no `width`/`height`/`top`/
  `left` layout properties are animated anywhere; the one non-transform
  looking case, `IntegrateMock`'s shimmer sweep, animates `x` as a percentage
  transform, not a layout property). No data logic touched: these files
  render static content arrays and props only, no Convex hooks, routes, or
  auth gates exist in this lane's files to begin with. Did not edit any page
  (out of scope for this lane throughout the program). No code changes were
  needed this cycle beyond this audit; the seven-cycle build already left the
  lane in the target state. Verified `npx tsc --noEmit` clean repo-wide and
  `npx next build` green across all 56 routes (site, dashboard, admin,
  sign-in/sign-up) as the final gate for the whole program.
