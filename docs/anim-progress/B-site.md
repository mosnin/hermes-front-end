# Lane B-site progress

(Track what is done and what is next here, one dated bullet per cycle.)

- 2026-07-19 (cycle 1): Wired home page alive end to end and consumed Lane
  A's `components/site/motion.tsx` primitives once they landed mid-cycle
  (Reveal, Stagger/StaggerItem, TextReveal, CountUp, Marquee, MagneticButton,
  PageTransition). Hero: scroll-linked parallax + fade on the hero image
  (useScroll/useTransform, transform+opacity only) plus a word-by-word
  TextReveal headline. Logo row now an infinite Marquee (pauses on hover,
  freezes to a static wrapped row under reduced motion). Stats count up on
  scroll-into-view via CountUp (parsed into number/prefix/suffix so "10x",
  "90%", "~1s" render exactly as before once settled). Feature trio grid
  wrapped in Stagger/StaggerItem. Every remaining section already had scroll
  reveals (former page-local `Rise`); swapped all of them for Lane A's
  shared `Reveal` for one consistent easing/timing vocabulary. DarkPill and
  ExplorePill (components/site/ui.tsx) are now magnetic + press-responsive
  via Lane A's `MagneticButton`, so every page that already uses these pills
  (features, pricing, about, contact, changelog, status hero/CTAs) picks up
  magnetic behavior for free even before I restyle those pages' own content
  in upcoming cycles. Nav (components/site/chrome.tsx): added hide-on-scroll-
  down / show-on-scroll-up (transform-only, respects reduced motion, closes
  itself if the mobile menu is open) on top of the existing scrolled-state
  blur; both CTA buttons are now MagneticButton-wrapped (verified Clerk's
  SignUpButton onClick-clone still fires through the wrapper). Footer: added
  scroll-linked parallax on the artwork placeholder (useScroll bound to the
  footer's own bounds, transform-only, footer has overflow-hidden to clip
  the overscan) and reveal-in on the four link columns. app/(site)/layout.tsx
  now wraps `{children}` in Lane A's `PageTransition` for the route-level
  cross-fade (nav/footer persist outside it). tsc and `next build` both green
  (the only other tsc error seen mid-cycle was in Lane A's motion.tsx and
  was not mine to fix; it was resolved by the time I finished). Not touched
  this cycle: features/pricing/about/contact/changelog/status page bodies
  (scheduled for cycles 2-3 per the program's per-cycle table) beyond the
  free magnetic-pill upgrade above; sticky-pinned product scenes on home
  (scheduled cycle 4).
- 2026-07-19 (cycle 2): Made `/features` and `/pricing` alive, per this
  cycle's focus. Both pages had their own page-local `Rise` helper (a
  duplicate of the old pre-shared-primitives pattern); deleted it from both
  files and rewired everything through Lane A's `components/site/motion.tsx`
  (Reveal, Stagger/StaggerItem, TextReveal, Parallax, CountUp,
  MagneticButton, EASE). Features: hero headline is now a word-by-word
  `TextReveal`; each of the six product-pillar mocks sits in a subtle
  `Parallax` wrapper (offset 20px, transform-only) so it drifts slightly
  against scroll like the home page's product sections; the highlight card
  now has a spring hover lift (motion.div whileHover y:-3); the feature
  bullet list under each pillar is a `Stagger`/`StaggerItem` cascade instead
  of static text (nested a plain `<ul>` inside `Stagger` and `StaggerItem
  as="li">` per row so semantics stay correct and variant propagation still
  works through the non-motion `<ul>`). Pricing: hero headline split into two
  `TextReveal` lines to preserve the original two-line break; the three plan
  cards are a `Stagger`/`StaggerItem` grid with a hover lift + shadow-bloom
  per card; added a `PriceTag` helper that runs Lane A's `CountUp` on any
  plain "$N" price (Team's $49) and falls back to plain text for non-numeric
  prices ("Custom") so it counts up into place on scroll; the FAQ's two
  columns are now `Stagger` containers with `StaggerItem` rows instead of
  manually-indexed delays; every CTA (plan buttons, "Get early access",
  closing "Get started"/"Open dashboard", including inside Clerk's
  `SignUpButton` modal trigger) is wrapped in `MagneticButton` for the same
  magnetic-pull/press feel as the rest of the site. One care point: several
  of those CTA wrappers need `w-full` blocks (full-width plan buttons)
  fighting `MagneticButton`'s own default `inline-block`; used Tailwind's
  `!block` important-modifier on those specific instances so the intended
  display type wins deterministically instead of depending on utility
  generation order. Did not touch `chrome.tsx`/`painting.tsx`/`ui.tsx` this
  cycle (nothing on this cycle's list needed changes there); did not touch
  about/contact/changelog/status (scheduled cycle 3). `npx tsc --noEmit` is
  clean across the whole repo (zero errors) and `next build` is green,
  `/features` and `/pricing` both compile and prerender as static routes.
- 2026-07-19 (cycle 3): Made about/contact/changelog/status alive, per this
  cycle's focus. All four pages had their own page-local `Rise` helper (the
  same duplicate pattern cleared out of features/pricing last cycle); removed
  it from every file and rewired through Lane A's `components/site/motion.tsx`
  (`Reveal`, `Stagger`/`StaggerItem`, `TextReveal`). About: hero headline is a
  word-by-word `TextReveal`; the three numbered principles now cascade
  through a single `Stagger` container instead of per-item `delay={i * 0.06}`
  math; the four team portrait cards are a `Stagger` grid with a spring hover
  lift (`whileHover={{ y: -4 }}`); closing CTA link swapped for `DarkPill` so
  it picks up the magnetic/press treatment other pages already have. Contact:
  headline split into two `TextReveal` lines ("Tell us what your" / "fleet
  needs to do"); the three contact rows (sales/support/security) cascade via
  `Stagger` with a small `whileHover={{ x: 3 }}` nudge per row; mailto pill
  already used `DarkPill` (untouched, already magnetic). Changelog: "What
  shipped" header is now a `TextReveal`; all six changelog entries moved off
  manual `delay={Math.min(i * 0.05, 0.2)}` onto one `Stagger` container, each
  entry wrapped in a `motion.article` with a subtle hover nudge. Status: this
  page is Convex-backed (`useQuery(api.status.page, {})`) so I was careful to
  touch only presentation, none of the query/props/logic; "System status"
  headline is a `TextReveal`; component rows cascade through `Stagger` with a
  hover nudge; added a new `StatusDot` sub-component that gives the big
  status pill's dot a quiet ambient pulse (expanding ring, opacity 0.5 to 0,
  transform/opacity only, `useReducedMotion()`-gated, only pulses when
  `level === "operational"`) so the live/alive status page actually reads as
  live; the 90-day history strip and all level/copy mapping objects
  (`OVERALL_COPY`, `DOT_CLASS`, `PILL_BG_CLASS`, `ROW_TEXT_CLASS`,
  `ROW_LABEL`, `levelOf`) are untouched. Did not touch `chrome.tsx`/
  `painting.tsx`/`ui.tsx` this cycle (nav/footer/pill primitives already
  cover these pages via cycle 1/2 work; nothing new needed). `npx tsc
  --noEmit` is clean across the whole repo (zero errors) and `next build` is
  green; `/about`, `/contact`, `/changelog`, `/status` all compile and
  prerender (status is a client component so its Convex `useQuery` data
  fetches client-side post-hydration as before; the shell still prerenders
  static, matching its pre-cycle-3 behavior exactly). Not touched this
  cycle: sticky-pinned product scenes
  (scheduled cycle 4 per the program's per-cycle table), nav scroll
  refinement (also cycle 4).
- 2026-07-19 (cycle 5): Parallax + count-up polish pass across the whole
  site, per this cycle's focus. Home (`app/(site)/page.tsx`): the six
  "Trusted by operators" grid tiles (logo card, portraits, quote panels)
  each now sit in their own Lane A `Parallax` wrapper with a distinct
  offset/direction (10 to 22px, alternating up/down) so the grid reads with
  real depth as it scrolls instead of moving as one flat block; the three
  "News" cover placeholders got the same treatment (12px, alternating by
  index). Added a new `TrustBadge` component for the SOC 2 / GDPR / ISO
  27001 ring badges in the "Safe and secure" band: the dashed inner ring now
  spins in a slow continuous ambient loop (360deg / 44s, linear, transform-
  only via `motion.span` `animate`), fully stopped under
  `useReducedMotion()` (the four corner stars and outer ring stay static,
  so it reads as a quiet compliance-seal detail, not a spinner). Status
  (`app/(site)/status/page.tsx`, Convex-backed, presentation-only changes):
  the "100% uptime" label is now a `CountUp` (100, suffix "% uptime") instead
  of static text; the 90-day history strip's bar row now sweeps in with a
  single `scaleX` 0 to 1 reveal (`transformOrigin: left`, `whileInView`,
  once) instead of appearing instantly, gated behind a new `reduce` check in
  `StatusPage` so reduced-motion users get the bars fully rendered with zero
  animation. About: the four team portrait cards each sit in a `Parallax`
  wrapper (14px, alternating direction) nested inside their existing hover-
  lift `motion.div`, layering scroll drift under the hover interaction.
  Contact: the right-hand contact-rows card (sales/support/security) now has
  a subtle 10px `Parallax` drift of its own, on top of the existing Stagger
  entrance. Changelog: added a small `CountUp`-driven line under the intro
  paragraph ("N releases shipped since launch", N computed from
  `ENTRIES.length`, the same static content array the page already
  renders, so this is a presentational count, not new data) using the same
  `CountUp` primitive as the pricing/home stats. All of the above are
  transform/opacity only (`Parallax` drives `y` via spring off
  `useScroll`/`useTransform`, `TrustBadge`'s loop drives `rotate`, the
  history-strip reveal drives `scaleX`) and every one degrades correctly
  under `useReducedMotion()` (Parallax and CountUp already handle this
  internally per Lane A's primitives; the two new inline cases, `TrustBadge`
  and the status bar sweep, added their own explicit `reduce` gates). Did
  not touch `chrome.tsx` or `painting.tsx` this cycle (nothing on this
  cycle's list needed changes there; `ui.tsx` untouched too, its pill/
  section-head primitives already cover every page). `npx tsc --noEmit` is
  clean (zero errors) and `next build` is fully green across every route,
  including all six `(site)` pages plus the shared dashboard/admin routes
  owned by other lanes.
- 2026-07-19 (cycle 4): Sticky product scenes + nav scroll + footer
  parallax, per this cycle's focus. Home (`app/(site)/page.tsx`): the four
  Connect/Orchestrate/Govern/Integrate sections now play as a pinned scroll
  scene on desktop, built on Lane A's `StickyScene` primitive: one 400vh
  track (100vh per stage) pins the viewport while the four scenes cross-fade
  in place (opacity + a small 22px rise/settle, transform/opacity only),
  driven by a `sceneWindow(index, count)` helper that computes each stage's
  fade-in/hold/fade-out keyframe window off the shared `scrollYProgress`; a
  small step rail (`SceneRail`/`SceneRailItem`, xl breakpoint only) sits on
  the right edge with a dot + label per stage that brightens and the dot
  scales up while its stage is active, so the pin reads as a sequence, not
  just a fade. Off-stage panels get `pointer-events: none` and
  `visibility: hidden` (not `display: none`, so layout/position holds)
  while faded out, so keyboard/AT users never land on a transparent
  duplicate "Explore" link. Pinned scenes only mount on `lg`+ viewports
  (a small `useMinWidth` `matchMedia` hook, SSR-safe: server and first
  paint always render the plain stacked layout, then upgrade after mount)
  and never at all under `useReducedMotion()`; both cases fall back to the
  exact previous stacked-reveal layout (extracted verbatim into
  `StackedProductSections`, zero behavior change there) so the feature is
  fully opt-in to devices that can afford a 4-screen pin and motion that
  is welcome. Nav (`components/site/chrome.tsx`): added a shrink-on-scroll
  to the bar itself (h-16 to h-14, plus the brand mark glyph scaling down
  slightly) layered on top of cycle 1's hide-on-scroll-down/show-on-scroll-
  up and blur-on-scroll, so the nav now visibly compacts once you're past
  the hero, not just changes background. Footer (`SiteFooter`): the
  artwork placeholder now gets its own independent scroll-linked entrance
  (a second `useScroll` bound to the artwork band itself, offset
  `["start end", "start 55%"]`) driving a zoom-settle (scale 1.1 to 1) and
  fade-in (opacity 0.55 to 1) as it first enters view, layered under the
  existing whole-footer drift parallax (`artY`); the legal line and the
  dark brand bar at the very bottom are now wrapped in `Reveal` too so the
  footer settles in as a sequence top-to-bottom instead of just the four
  link columns animating and everything below appearing instantly. All new
  scroll-linked motion is transform/opacity only and spring/reduced-motion
  safe via Lane A's primitives; nothing here touches copy, structure, data
  fetching, or any Convex/Clerk wiring. `npx tsc --noEmit` reports zero
  errors in any file I own (a transient parse error was visible mid-cycle
  in Lane A's `components/site/mockups.tsx`, not mine to fix, and was
  resolved by the time I finished); `next build` is fully green end to end
  across every route. Not touched this cycle: `components/site/ui.tsx` and
  `components/site/painting.tsx` (nothing on this cycle's list needed
  changes there).
- 2026-07-19 (cycle 6): Reduced-motion + performance audit across every file
  in lane B's ownership, per this cycle's focus. Method: read every page
  (`app/(site)/page.tsx`, `features`, `pricing`, `about`, `contact`,
  `changelog`, `status`) plus `chrome.tsx`/`ui.tsx`/`painting.tsx` end to end,
  grepped for every `initial={{`, `animate={{`, `whileHover={{`, `whileInView`
  and `repeat: Infinity` call site to verify each one either goes through
  Lane A's `components/site/motion.tsx` primitives (which already gate
  correctly) or, for raw `motion.*` usage written directly in a page, that it
  zeroes its travel distance and drops to a fully-settled instant transition
  under `useReducedMotion()`. Found and fixed two real gaps: (1)
  `app/(site)/features/page.tsx`'s two inline mock components (`RealtimeMock`'s
  row-in cascade, `SkillsMock`'s chip and memory-row cascades) used raw
  `motion.div`/`motion.span` with a hardcoded `x: -10` / `y: 6` travel that
  was never zeroed under reduced motion (only their stagger `delay` was), the
  one inconsistency in the codebase versus every other reveal which already
  does this via `Reveal`/`StaggerItem`; fixed all three call sites to
  `x/y: reduce ? 0 : <value>` and dropped their duration to 0.3s under reduce,
  matching the shared primitives' convention exactly (their existing ambient
  pulse dots were already correctly gated with `{!reduce && ...}` conditional
  mounts, untouched). (2) `components/site/chrome.tsx`'s mobile nav dropdown
  (`AnimatePresence` height/opacity toggle) had no `transition` override at
  all, so it always animated at the library default regardless of reduced
  motion; added `transition={{ duration: reduce ? 0 : 0.25, ... }}` so the
  menu snaps open/closed instantly instead of animating under reduced motion,
  consistent with the header's own hide-on-scroll (`reduce` already gated)
  and the logo-scale-on-scroll motion right next to it. Verified every
  ambient/looping animation in scope (`TrustBadge`'s 44s ring rotation on
  home, the `StatusDot` and `RealtimeMock` pulse rings, the `Marquee` logo
  row's rAF loop) fully stops under reduced motion by inspection of each
  `reduce`/`!reduce` gate, not just by pattern-matching the primitive; all
  were already correct. Verified the pinned `StickyScene` product-section
  scroll scene on the home page falls back to `StackedProductSections`
  (no pin, no scroll-linked transform) under both reduced motion and
  sub-`lg` viewports, and that off-stage panels use `visibility: hidden` +
  `pointer-events: none` (not `display: none`) so layout/position never
  jumps. Performance/jank: confirmed every scroll- or loop-driven animation
  in lane B's files animates only `transform`/`opacity` (checked every
  `useTransform`/`animate`/`whileInView` call for stray `width`/`height`/
  color-driven scroll effects; found none besides the two already-fine CSS
  `transition-[height]`/`transition-shadow`/`transition-colors` hover/scroll
  state changes, which are short, non-repeating, and not parallax so they're
  intentionally left running under reduced motion, matching how the codebase
  already treats hover feedback). Dark-token sweep: grepped every hex color
  and `bg-black`/`dark:` class across all owned files; every hardcoded color
  is a legitimate light-editorial-system token (ink `#1f1f1c`, body greys,
  hairline greys, the intentional near-black footer bottom bar `#101210`,
  `hover:bg-black` on the solid pill buttons) or a pre-existing accent
  (`#8b5cf6` in the Realtime/Skills mocks); found zero leftover dark-mode
  surface colors and zero `dark:` variants anywhere in scope, so no removal
  was needed beyond the reduced-motion fixes above. `npx tsc --noEmit` is
  clean (zero errors) and `npx next build` is fully green across every route
  including all `(site)` pages and the shared dashboard/admin routes owned
  by other lanes. Not touched this cycle: no page needed structural changes,
  only the two reduced-motion fixes above; `components/site/ui.tsx` and
  `components/site/painting.tsx` needed no changes (already fully
  reduced-motion safe from prior cycles).
- 2026-07-19 (cycle 7): Cross-surface consistency pass, per this cycle's
  focus: audited every file in lane B's ownership for spacing/radius/type/
  motion-timing values that had drifted from a shared constant, then added
  the constants and fixed the drift. `components/site/ui.tsx` gets a new
  "shared design constants" block: `RADIUS` (a four-tier corner-radius scale,
  `compact`/`image`/`tile`/`card` mapped to the 18/20/22/24px values already
  in use across the site), `TYPE_H1` (the hero headline scale six of seven
  pages already shared) and `TYPE_H2` (the section headline scale `SectionHead`
  already used, now exported so raw page-local h2's can reference it too;
  `SectionHead` itself now renders through `TYPE_H2` instead of its own
  literal copy). Motion timing's shared constant was already Lane A's `EASE`
  export from `motion.tsx`; the actual gap was four pages re-typing the same
  `[0.22, 0.61, 0.24, 1]` array inline instead of importing it (about,
  contact, changelog, status x2) plus three raw cascades in features'
  `RealtimeMock`/`SkillsMock` mocks that specified a delay/duration but no
  `ease` at all, silently falling back to the library default curve instead
  of the site's editorial ease; all seven now import and use `EASE`. Found
  two real "still on old style" bugs this pass: (1) `/contact` and `/status`
  hero h1's were sized `sm:text-[56px]` while every other page's hero (home,
  features, pricing, about, changelog) is `sm:text-[64px]`, a visible type-
  scale mismatch; both now use the shared `TYPE_H1` and read at the same size
  as the rest of the site. (2) home's "News" `h2` was missing the
  `sm:text-[40px]` breakpoint bump every other section heading has (it was
  stuck at 34px on desktop); fixed by switching it to `TYPE_H2` along with
  the other four raw `h2`'s on the home page. Radius: `features/page.tsx`'s
  shared `CARD` constant was the one outlier in the site's radius scale at
  26px (nothing else on the site uses that value); brought down to the
  `RADIUS.card` 24px tier so it now matches pricing's plan cards, the
  Cadre Cloud add-on panel, status's big state pill, and both list-card
  wrappers (status components, contact rows) exactly. Every other radius
  literal that already numerically matched a tier (18/20/22px across home,
  about, features) was switched to reference the named `RADIUS` constant
  instead of a bespoke `rounded-[Npx]` literal, so a future tier change is
  one edit, not a grep-and-replace; the one deliberately distinct radius left
  as a literal is status's 90-day history strip background (16px, a thin
  bar-holder, not a card, with no other site element at that size to unify
  against). `components/site/chrome.tsx`'s mobile nav popover was on a bare
  Tailwind `rounded-2xl` (16px, not part of the site's own scale at all);
  moved it onto `RADIUS.compact` (18px) so every rounded surface on the site
  now traces to the same named scale. `components/site/painting.tsx` needed
  no changes (no radius/type/timing of its own; callers already supply it).
  All constant swaps are literal-for-literal (same computed class list),
  so this cycle is a pure consistency/DRY pass plus the two genuine visual
  fixes called out above, no other structural or copy changes. `npx tsc
  --noEmit` is clean (zero errors) and `npx next build` is fully green across
  every route, static and dynamic, including all `(site)` pages.
- 2026-07-19 (cycle 8): Final self-audit against the spec across every file
  in lane B's ownership (all seven `app/(site)/**` pages, `chrome.tsx`,
  `ui.tsx`, `painting.tsx`), per this cycle's focus. Method: re-read every
  owned file end to end against the master spec's absolute rules one by
  one, then grepped the whole ownership set for em-dashes (zero), `lucide`
  imports (zero), non-fade gradient artwork (zero, the two `gradient(...)`
  hits in `painting.tsx` are the pre-existing diagonal-hatch texture and
  the hero fade-to-white mask on `ImagePlaceholder`, both established UI
  chrome from cycle 1, not decorative illustration), every `repeat: Infinity`
  call site (three: home's `TrustBadge` ring, features' `RealtimeMock` pulse
  dot, status's `StatusDot` pulse; all three confirmed still correctly gated
  behind `!reduce`/conditional-mount, none run under reduced motion), and
  every `whileInView`/`animate`/`whileHover` call site for stray non-transform/
  opacity properties driving scroll or loop effects (found none; the few
  CSS `transition-[height]`/`transition-colors` hover and scroll-threshold
  state changes are short, non-looping UI feedback, consistent with prior
  cycles' judgment call). Found and fixed one real remaining inconsistency:
  `components/site/chrome.tsx` had three `motion` transitions (header hide-
  on-scroll, brand-mark scale-on-scroll, mobile nav height/opacity toggle)
  still hardcoding a raw Material-style `[0.4, 0, 0.2, 1]` easing curve
  instead of importing the shared `EASE` constant from Lane A's
  `components/site/motion.tsx` that cycle 7 already unified every page onto;
  this was the one file cycle 7's consistency pass missed (it audited pages
  for duplicate copies of `EASE`'s own array, not chrome.tsx's use of a
  categorically different curve). Fixed by importing `EASE` and swapping all
  three transitions onto it, so the nav's own motion now reads with the same
  timing feel as every reveal/stagger/parallax elsewhere on the site. No
  other rough edges found: `TYPE_H1`/`TYPE_H2`/`RADIUS` scale usage is
  consistent site-wide (verified again this cycle), every ambient/looping
  animation is reduced-motion gated, every scroll-linked effect
  (`Hero`/`SiteFooter`/`Parallax`/`StickyScene`/status history-strip sweep)
  animates only `transform`/`opacity`, and no Convex hook, route, prop, or
  auth gate was touched (status page's `useQuery(api.status.page, {})` and
  every `SignedIn`/`SignedOut`/`SignUpButton` Clerk usage across chrome,
  home, and pricing are byte-for-byte the same wiring as prior cycles, only
  the easing-curve values changed in chrome.tsx). `npx tsc --noEmit` is
  clean (zero errors) and `npx next build` is fully green end to end across
  every route: all seven `(site)` pages plus every dashboard/admin/auth
  route owned by the other four lanes. Lane B's ownership is in a shippable,
  production-quality state at the close of the 8-cycle program.
