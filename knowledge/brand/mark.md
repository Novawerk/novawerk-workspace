---
title: Brand mark (Nova Star)
category: brand
status: stable
source:
  - nw-web-portal/components/icons/nova-star.tsx
  - nw-web-portal/app/(frontend)/globals.css
updated: 2026-05-14
---

# Brand mark — Nova Star

The Novawerk logomark is a **four-pointed star** called the **Nova Star**.
It functions as both favicon and inline accent throughout the site.

## The shape

A four-pointed star on a `100 × 100` viewBox, drawn as **two concentric
closed paths** — an outer star and an inner depth core. The four outer
points sit at the cardinal compass positions (N / E / S / W) and the
four inner points pinch tightly toward the centre (±5 units from the
midpoint), giving the star its sharp, spike-like silhouette.

The inner core is the same shape at ~28% scale, in a deeper green —
reading as depth, ambiguous between *contracting* and *expanding*.

**SVG paths:**

```
Outer:  M50 0 L55 45 L100 50 L55 55 L50 100 L45 55 L0 50 L45 45 Z
Core:   M50 36 L51.4 48.6 L64 50 L51.4 51.4 L50 64 L48.6 51.4 L36 50 L48.6 48.6 Z
```

The mark is always the star alone — **no background tile, no rounded
square, no enclosing shape.** See [`assets/nova-star.svg`](./assets/nova-star.svg).

## Brand colours used with the mark

Source of truth: `app/(frontend)/globals.css` (`@theme` block).

| Token                      | Hex       | Where it's used                                  |
|----------------------------|-----------|--------------------------------------------------|
| `--color-accent`           | `#1f7a4a` | Outer star fill                                  |
| `--color-accent-core`      | `#0a3920` | Inner depth core                                 |
| `--color-accent-deep`      | `#155a36` | Hover / pressed accent                           |
| `--color-background`       | `#efe9d8` | Page background (cream)                          |
| `--color-foreground`       | `#0f0f0f` | Body text, dark CTA blocks                       |

The canonical rendering is a **green star with deep-green core on cream
background**, with no enclosing tile or shape — the star is the entire mark.

For B&W contexts (single-ink print, dark UIs), outer is `#0f0f0f` and
the core is `#ffffff` — reading as a cutout / event horizon. See
[`assets/nova-star-bw.svg`](./assets/nova-star-bw.svg).

## Asset files in this repo

| File                                                                                                | viewBox       | Use case                                                                          |
|-----------------------------------------------------------------------------------------------------|---------------|-----------------------------------------------------------------------------------|
| [`assets/nova-star.svg`](./assets/nova-star.svg)                                       | `0 0 100 100` | Mark — colour, two-path depth, transparent.                                       |
| [`assets/nova-star-bw.svg`](./assets/nova-star-bw.svg)                                 | `0 0 100 100` | Mark — single-ink (ink + cream cutout).                                           |
| [`assets/nova-star-dark.svg`](./assets/nova-star-dark.svg)                             | `0 0 100 100` | Mark — dark, cream star on ink ground.                                            |
| [`assets/nova-star-horizontal.svg`](./assets/nova-star-horizontal.svg)                 | `0 0 460 120` | Horizontal lockup — colour default. See [VI guide](./visual-identity.md#1-logo-system). |
| [`assets/nova-star-horizontal-mixed.svg`](./assets/nova-star-horizontal-mixed.svg)     | `0 0 460 120` | Horizontal lockup — green mark + ink wordmark.                                    |
| [`assets/nova-star-horizontal-bw.svg`](./assets/nova-star-horizontal-bw.svg)           | `0 0 460 120` | Horizontal lockup — single-ink.                                                   |
| [`assets/nova-star-horizontal-dark.svg`](./assets/nova-star-horizontal-dark.svg)       | `0 0 460 120` | Horizontal lockup — dark, cream on ink ground.                                    |

## How the live site renders the mark

The site uses a React component, **not** an `<img>` tag, so the star can
be coloured and animated inline:

```tsx
// nw-web-portal/components/icons/nova-star.tsx
<NovaStar size={28} fill="var(--color-accent)" spin />
```

Props:

- `size` (number, default `22`) — pixel width/height.
- `fill` (string, default `currentColor`) — any CSS colour or token.
- `spin` (boolean, default `false`) — applies the `animate-nw-spin`
  animation.

## Motion

When `spin` is enabled, the mark rotates 360° on a 14-second linear loop:

```css
@keyframes nw-spin {
  to { transform: rotate(360deg); }
}
.animate-nw-spin {
  animation: nw-spin 14s linear infinite;
}
```

Silenced under `@media (prefers-reduced-motion: reduce)`.

## Usage rules

**Do:**

- Use it as the favicon, the inline accent character, and the principle
  card icon.
- Recolour it with any token from the palette above. Inline usage often
  rotates through `--color-accent`, `--color-blue`, `--color-foreground`.
- Use the `spin` variant for moments of "this is the brand speaking"
  (hero loaders, decorative background marks at low opacity).

**Don't:**

- Don't redraw the star with a different point count, different inner-arm
  ratio, or rounded corners. The sharp pinch is the recognisable part.
- Don't enclose the mark in a rounded square, circle, or any other
  container shape. The star stands alone.
- Don't add gradients, shadows, or strokes. The mark is solid-fill only —
  depth comes from the two concentric layers, not effects.
- Don't drop the depth core unless rendering at < 16 px, where it
  becomes a single solid star for legibility.

## In AI-generated images

Image generators routinely **break** the Nova Star — they round the
corners, add gradients, change the point count, or enclose it in a
circle. The star is the brand element most often violated by AI output,
so the rule below is strict.

### Why generators struggle

- "Four-pointed star" is fuzzy across training data — most output skews
  to 5 or 8 points, or to "starburst" with many rays.
- Models add atmospheric effects (glow, lens flare, sparkle) to
  star-shaped objects by default.
- The two-concentric-layer construction (outer star + smaller inner
  core, same shape) is hard to describe in plain text.

### Default workflow — composite, don't generate

**Generate the surrounding image *without* the star, then drop in
[`assets/nova-star.svg`](./assets/nova-star.svg) in Figma
at the final composition stage.** This is the only way to guarantee
spec compliance.

In the prompt, leave a clean negative space where the star will go:

```
... A small clean area of empty cream space in the upper-right corner,
approximately 8% of the canvas width, with no decoration or texture.
```

Then composite the SVG into that space at the brand-correct size.

### If you must let the generator draw it

For quick sketches where compositing isn't worth the round trip,
describe the star precisely:

```
A four-pointed star with sharp pinched arms — points at top, bottom,
left, right; the inner pinch sits close to the center. Solid fill in
forest green (#1f7a4a), with a smaller concentric four-pointed star
at the center in deeper green (#0a3920). NO rounding, NO gradient,
NO glow, NO lens flare, NO sparkle, NO enclosing circle or square,
NO outline, NO drop shadow. Solid silhouette only. Sharp edges.
The star sits alone on the surface.
```

Always review the result against the **Don't** list under
[Usage rules](#usage-rules) above — if any rule is violated, regenerate
or fall back to compositing.

### Negative prompt fragment

Append this to any AI-image prompt where the star appears:

```
5-pointed star, 6-pointed star, 8-pointed star, starburst, sparkle,
rounded star, soft star, glowing star, lens flare, sun rays,
gradient on star, neon star, star inside circle, star with halo,
outlined star, embossed star, star with shadow
```

## Related

- [Name and tagline](../culture/name-and-tagline.md)
- [Brand voice](./voice.md)
- [Visual assets for posts](../community/promotion/visual-assets.md) — 文生图模型选择和 prompt 模版
