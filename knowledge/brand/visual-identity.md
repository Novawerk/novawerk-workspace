---
title: Visual identity (VI) guide
category: brand
status: evolving
source:
  - nw-web-portal/app/(frontend)/globals.css
  - nw-web-portal/components/icons/nova-star.tsx
  - nw-web-portal/components/layout/header.tsx
reference:
  - https://m3.material.io/blog/building-with-m3-expressive
updated: 2026-05-14
---

# Visual identity

How Novawerk looks. This guide is the single source of truth for logo
usage, colour, type, shape, motion, and the rhythm by which they're
combined. It pairs with — and never contradicts — [brand voice](./voice.md)
and [brand mark](./mark.md).

The visual posture borrows from **Material Design 3 "Expressive"**: design
that *makes you feel something*, achieved through deliberate use of
**colour, shape, size, motion, and containment** — and grounded in the
plain-spoken voice that Novawerk already uses in copy.

## 1. Logo system

The Nova Star is the root mark. Everything else is a lockup of the star
with the Novawerk wordmark.

| Lockup                    | File                                                                                  | Use when                                              |
|---------------------------|---------------------------------------------------------------------------------------|-------------------------------------------------------|
| Mark — colour             | [`nova-star.svg`](./assets/nova-star.svg)                                      | Favicons, avatars, inline accent on cream/white.      |
| Mark — black & white      | [`nova-star-bw.svg`](./assets/nova-star-bw.svg)                                | Single-ink print, partner contexts, light surfaces.   |
| Mark — dark               | [`nova-star-dark.svg`](./assets/nova-star-dark.svg)                            | Dark UIs, avatar tiles, anything on ink ground.       |
| Horizontal — colour       | [`nova-star-horizontal.svg`](./assets/nova-star-horizontal.svg)                | Default lockup. Headers, signatures, slide footers.   |
| Horizontal — mixed        | [`nova-star-horizontal-mixed.svg`](./assets/nova-star-horizontal-mixed.svg)    | Green mark + ink wordmark. When the wordmark needs maximum legibility (long-form pages, body-text contexts). |
| Horizontal — black & white| [`nova-star-horizontal-bw.svg`](./assets/nova-star-horizontal-bw.svg)          | Single-ink print, accessibility fallback.             |
| Horizontal — dark         | [`nova-star-horizontal-dark.svg`](./assets/nova-star-horizontal-dark.svg)      | Dark surfaces — social cards, dark mode chrome, video lower-thirds. |

### Mark construction

The mark is a four-pointed star with a concentric four-pointed hole, on a `100 × 100` viewBox:

- **Outer star** — `--color-accent` (`#1f7a4a`). Outer points at the
  cardinal compass positions, inner pinch ±5 from centre.
- **Inner core** — a **cutout**, ~28% the size of the outer star, same
  rotation. It has no colour of its own: the ground shows through (one
  `<path>`, `fill-rule="evenodd"`). Reads as depth — *is it pulling in or
  radiating out?* — and works against any background.
- **B&W variant** — star `#0f0f0f`, same cut-out core.

The mark always sits alone on its surface — **no rounded square, no
tile, no enclosing shape.**

### Wordmark construction

- "Novawerk" — set in **Cabinet Grotesk 800**, letter-spacing `-3.2px`
  at 74 px display size. One word, capital N, lowercase rest.
- Cabinet Grotesk is loaded from Fontshare (`api.fontshare.com`); the
  SVG files inline a `@import` so they render as-shipped.

### Spacing

- In the horizontal lockup, the gap between the star's right edge and
  the wordmark's left edge equals **about half the star's height**.
- Clear-space margin around any lockup equals **the star's full height**
  on every side. Don't crowd it.

### Minimum size

- Mark: 16 px square.
- Horizontal lockup: 120 px wide. Below that, fall back to the mark.

### Don'ts

- Don't recreate the wordmark in a different typeface.
- Don't stack the wordmark above the star without drawing a new asset
  to formal spec (no ad-hoc stacking).
- Don't add a tagline lockup yet — *An open workshop for early ideas.*
  appears in copy, not in the logo.
- Don't outline, italicise, condense, or letter-space the wordmark
  away from spec.

## 2. Colour

The palette is small on purpose. Two anchors (green + cream) carry the
brand; one expressive accent punctuates it; ink and a muted grey carry
the rest.

| Token                       | Hex       | Role                                                  |
|-----------------------------|-----------|-------------------------------------------------------|
| `--color-accent`            | `#1f7a4a` | **Primary green.** Mark outer, accent words, key CTAs.|
| `--color-accent-deep`       | `#155a36` | Hover / pressed state of primary green.               |
| `--color-accent-core`       | `#0a3920` | Deepest green for UI accents. **Not used in the mark** — the core is a cutout. Not for type. |
| `--color-background`        | `#efe9d8` | **Cream.** Default page background.                   |
| `--color-foreground`        | `#0f0f0f` | Body text, dark CTA blocks, deep contrast.            |
| `--color-blue` *(accent)*   | `#2a5dc8` | Expressive secondary — links, charts, occasional mark recolour. |
| `--color-mute`              | `#7a7468` | Captions, metadata, divider text.                     |

### Expressive use (M3-inspired)

M3 Expressive prescribes **strategic vibrancy, not blanket vibrancy**.
The Novawerk reading:

- **Green is the brand.** Cream is the room. Everything else is a
  highlight.
- **One expressive accent per surface.** A page can rotate the mark
  through `--color-accent`, `--color-blue`, or `--color-foreground`,
  but only one accent is "loud" at a time.
- **Earn contrast.** A button or callout that uses pure foreground on
  cream (the highest-contrast pair) should be reserved for the action
  you most want the reader to take.
- **Accessibility floor.** Body text against background must meet WCAG
  AA (≥ 4.5:1). Green-on-cream `#1f7a4a / #efe9d8` ≈ 5.4:1 — passes for
  body and large text.

### Pairings to keep

- Green star on cream ground (canonical).
- Cream type on deep-foreground block (inverted CTAs).
- B&W lockup for partner contexts, single-ink print, dark UIs.

### Pairings to avoid

- Green on blue, or green on any saturated colour — clashes and drops
  the green's recognisability.
- Gradients, drop shadows, or duotone fills on the outer mark.
- More than two accents on one screen.

## 3. Typography

| Role       | Family                                                              | Weights   | Notes                                                                                       |
|------------|---------------------------------------------------------------------|-----------|---------------------------------------------------------------------------------------------|
| Display    | **Cabinet Grotesk** (fallback: Inter Tight, system-ui)              | 700 / 800 | The wordmark, hero lines, section openers. Industrial, structured — matches the "werk".     |
| Body       | **Inter** (fallback: system-ui, -apple-system, Segoe UI, Roboto)    | 400 / 500 | Paragraphs, UI labels, captions.                                                            |
| Accent     | Body family in **italic**                                           | 400 / 500 | The one accent word per sentence (see [brand voice](./voice.md#visual-accents-in-copy)). |

Cabinet Grotesk ships from Fontshare. Inter ships from Google Fonts.
Both are free for commercial use.

### Hierarchy (M3-Expressive flavour)

Lean on **size and weight contrast**, not many sizes. A page rarely
needs more than four steps in the type scale.

| Step       | Size (≈) | Weight | When                            |
|------------|----------|--------|---------------------------------|
| Display L  | 56–80 px | 800    | Hero lines on landing surfaces. |
| Display M  | 36–44 px | 700    | Section openers.                |
| Body L     | 18–20 px | 400    | Lede paragraphs.                |
| Body       | 16 px    | 400    | Default.                        |
| Caption    | 13–14 px | 500    | Metadata, eyebrows.             |

### Voice → type

- One *italic accent* per sentence (the same rule as in copy). Always
  paired with `--color-accent`.
- No all-caps headlines. Eyebrows may use small-caps via
  `font-feature-settings: "smcp"` at caption size.
- No tracked-out display type. Display sets tight (`letter-spacing`
  between `-2px` and `-3.5px`).

## 4. Shape

The mark is sharp by design — that's its identity. Everything *around*
the mark gets softer.

- **Cards and surfaces** — `border-radius: 16px` (M3 "large" range).
- **Buttons / inputs** — `border-radius: 999px` (full pill) or `12px`
  (rectangular CTAs).
- **Images** — `border-radius: 12px` minimum; never square-corner
  unless edge-to-edge.
- **The mark** — never rounded, never enclosed. The eight sharp tips
  are the recognisable thing.

## 5. Motion

M3 Expressive's motion principle: **springy, not snappy**. The brand
has one signature motion — the 14-second star spin — and the rest of
the system layers behind it.

| Motion                          | Use                                                  | Easing / duration                                |
|---------------------------------|------------------------------------------------------|--------------------------------------------------|
| **Star spin** (existing)        | "This is the brand speaking" moments — hero loaders, decorative low-opacity marks. | `nw-spin` — 14 s, linear, infinite. |
| **UI transitions**              | Page chrome, dropdowns, modals.                      | `cubic-bezier(.2, .8, .2, 1)` — 180–240 ms.      |
| **Emphasis** (M3-Expressive)    | Confirm states, hero entrance, accent word landing.  | Spring-feel: `cubic-bezier(.34, 1.56, .64, 1)` — 280–360 ms. |
| **Scroll reveals**              | Long-form copy, principle cards.                     | 200 ms fade + 8 px translate. No parallax.       |

All motion must respect `@media (prefers-reduced-motion: reduce)` —
fall back to instant transitions, kill the spin.

## 6. Layout & containment

M3 Expressive uses **containment** — grouping with shape, colour, and
spacing — to make hierarchy felt before it's read.

- **One hero, one accent.** Each surface earns exactly one moment of
  full brand voice (loud type, accent colour, or motion). The rest
  reads quietly.
- **Generous vertical rhythm.** Section padding is `96–128 px` on
  desktop, `48–64 px` on mobile.
- **Asymmetry is allowed.** Don't force a centred lockup if the
  composition wants a left-anchored one. Off-centre is more expressive.
- **Cards over panels.** Group related content in soft-edged cards
  (`16 px` radius) on cream rather than full-width banded sections.

## 7. Quick reference — do / don't

**Do**

- Use the horizontal lockup in headers, the mark in compact contexts.
- Treat cream as a *colour*, not as a default — it's the room the
  brand lives in.
- Pair the mark's sharpness with softer UI shapes (cards, pills).
- Let one element on each surface be loud; let the rest read quietly.
- Animate sparingly. Spring easings, short durations, reduced-motion
  fallback.

**Don't**

- Don't re-letter the wordmark, recolour the mark with gradients, or
  enclose it in a tile.
- Don't run more than two accent colours on one screen.
- Don't all-caps display type, condense the wordmark, or track-out
  headlines.
- Don't use parallax, scroll-jacking, or auto-playing motion as
  brand "personality".

## Asset files in this repo

| File                                                                                            | Purpose                                                            |
|-------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| [`assets/nova-star.svg`](./assets/nova-star.svg)                                   | Mark — colour (green star, cut-out core), transparent ground.      |
| [`assets/nova-star-bw.svg`](./assets/nova-star-bw.svg)                             | Mark — single-ink (ink star, cut-out core).                        |
| [`assets/nova-star-dark.svg`](./assets/nova-star-dark.svg)                         | Mark — dark variant (cream star on ink ground, core punches through to ground). |
| [`assets/nova-star-horizontal.svg`](./assets/nova-star-horizontal.svg)             | Horizontal lockup — colour default.                                |
| [`assets/nova-star-horizontal-mixed.svg`](./assets/nova-star-horizontal-mixed.svg) | Horizontal lockup — green mark + ink wordmark.                     |
| [`assets/nova-star-horizontal-bw.svg`](./assets/nova-star-horizontal-bw.svg)       | Horizontal lockup — single-ink.                                    |
| [`assets/nova-star-horizontal-dark.svg`](./assets/nova-star-horizontal-dark.svg)   | Horizontal lockup — dark (cream on ink ground).                    |

## Related

- [Brand mark (Nova Star)](./mark.md) — the star itself, in detail.
- [Brand voice](./voice.md) — how the brand sounds.
- [Name and tagline](../culture/name-and-tagline.md) — what to call it.
