# Cadre logged-out site — design spec (light editorial system)

The logged-out site is being rebuilt to match a reference layout (Mobbin
screenshot, crops in the session scratchpad `ref/` folder). We recreate the
reference's LAYOUT STRUCTURE with Cadre's own copy and branding. The logged-in
dashboard/admin keep their dark instrument-panel theme; nothing under
`app/dashboard` or `app/admin` changes.

## Hard rules

- NO gradient artwork. Anywhere the reference shows a photo/painting, render
  `<ImagePlaceholder />` from `components/site/painting.tsx` (flat #eceae4
  fill, hairline hatch, corner "Image" chip). Real assets come later.
- No em-dashes anywhere in copy. Use commas, periods, or "·".
- No lucide/stock icons. Inline thin-stroke (1.5) SVGs only, or reuse
  existing site components.
- Never touch files outside your assigned ownership. Use plain `mv` (not git
  commands) if a move is required. Never run git.
- Marketing pages live in the `app/(site)/` route group which applies the
  light theme + SiteNav + SiteFooter automatically. Pages must NOT import the
  old dark chrome (`components/marketing/site-chrome`).
- Old dark-theme components under `components/marketing/` are legacy for
  these pages: do not import them in (site) pages. (Dashboard still uses
  some; leave those files alone.)
- Every page must remain `"use client"` only if it uses hooks/motion;
  otherwise server components are fine.
- Copy tone: plain, confident, concrete. Product = Cadre, a control plane for
  autonomous agents (Hermes native; OpenClaw/Goose adapters; generic CLI).

## Design tokens (already defined in globals.css under `.site-light`)

- Page background: white `#ffffff` (`--site-bg`)
- Band background: `#f5f4f0` (`--site-band`) for alternating full-width bands
- Card fill: `#efede7` (`--site-card`) for beige feature cards
- Ink: `#1f1f1c` (`--site-ink`) headlines and primary text
- Body: `#8a8781` (`--site-body`) secondary text
- Hairline: `#e7e5df` (`--site-line`)
- Font: Instrument Sans via `--font-site` (applied by the layout)

## Component API (components/site/)

- `ImagePlaceholder({ label, className, dark, fadeBottom })` — flat image
  stand-in. Give it explicit height/aspect via className, plus rounding.
- `ui.tsx`: `Mark` (asterisk logo), `DarkPill` (black pill link),
  `ExplorePill` (white outline pill with chevron), `PillLabel` (grey label
  pill), `SectionHead({label,title,sub,explore})` (left headline block +
  right Explore pill).
- `mockups.tsx`: `ConnectMock`, `OrchestrateMock`, `GovernMock`,
  `IntegrateMock` (animated beige UI-art cards), `ControlPlaneDiagram`.
- `chrome.tsx`: `SiteNav`, `SiteFooter` (rendered by the (site) layout).

## Layout recipes

- Content container: `mx-auto max-w-[1060px] px-5 sm:px-7`.
- Headline scale: page hero `text-[44px] sm:text-[64px] font-medium
  leading-[1.06] tracking-[-0.015em]`; section `text-[34px] sm:text-[40px]
  font-medium tracking-[-0.01em]`; card titles ~`text-[16.5px] font-medium`.
- Cards: `rounded-[20px]`..`rounded-[26px]`, no borders on beige/white fills.
- Buttons: black pill (`rounded-full bg-[#1f1f1c] text-white`), outline pill
  via `ExplorePill`.
- Product-section pattern (see home): `SectionHead` with `PillLabel`, then a
  2-col grid: animated mock card on one side, feature list on the other
  (first feature highlighted in a beige rounded box with icon + title +
  body; remaining features simple icon + label rows). Alternate sides.
- Full-width bands use `bg-[var(--site-band)] py-20` and contain a normal
  container inside.
- Animations: motion/react `whileInView` fade/rise (`once: true`), small
  stagger; honor `useReducedMotion` for loops.
- Mobile: single column stacks, `sm:`/`lg:` breakpoints, generous tap
  targets. No horizontal overflow at 390px.

## Page assignments

Each page: move `app/<page>` to `app/(site)/<page>` with plain `mv`, then
rebuild in this system, keeping any existing data wiring (Convex hooks) and
route paths identical.

- features: hero headline band, then the six product pillars using the
  product-section pattern (reuse the four mocks; simple beige cards for the
  remaining two), closing CTA band.
- pricing: centered headline + sub, 3 plan cards (middle "Team" plan on
  beige emphasis card, dark pill CTAs, thin-check feature rows), FAQ as a
  two-column list, closing CTA. Port existing plan copy/prices.
- about: editorial headline, 2-3 short prose paragraphs (max-w-[640px]),
  numbered principles list (01/02/03 rows with hairline separators), team
  row of 4 `ImagePlaceholder` portraits, closing CTA.
- contact: two-column: left headline + copy + black `mailto:sales@cadre.to`
  pill; right a quiet card with contact rows (sales, support, security).
- changelog: "News" style: intro headline, then entries as editorial rows
  (date · category, title, body) with hairline separators. Port existing
  entry copy.
- status: keep live Convex status data exactly as wired today; restyle:
  headline + big state pill, component rows with small status dots, history
  placeholder strip. Light theme only.
