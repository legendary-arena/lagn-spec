---
title: Figma Logo Design
type: Concept
tags:
  - design
  - brand
  - figma
  - logo
related:
  - hugo-web-system.md
  - wiki-viewer.md
status: draft
source: []
last-reviewed: 2026-05-13
---

## Repository base URLs

| Repo | Base URL (local) | Site |
|---|---|---|
| Engine | `C:\pcloud\BB\DEV\legendary-arena\` | `ewiki.legendary-arena.com` |
| Marketing | `C:\www\legendary-arena-com\` | `www.legendary-arena.com` |
| Research / Notes | `C:\pcloud\LA\ewiki\` | (not published) |

## Summary

A step-by-step walkthrough for building a production-grade SVG logo
system in Figma. The workflow follows a deterministic pipeline:
reference inputs, constrained shape construction, system variants,
and export artifacts. This is not a "draw freely and clean up later"
approach — it mirrors the same inputs-to-outputs discipline used
across the Legendary Arena codebase.

## Mechanics

### Phase 0 — Setup

1. Go to [figma.com](https://figma.com) and create a new Design File.
2. Name the file `legendary-arena-logo-v1`.
3. Create four Pages inside the file (this mirrors an inputs-to-outputs
   pipeline):

| Page | Purpose |
|---|---|
| `00_refs` | Reference images and constraints |
| `01_construction` | Shape building and composition |
| `02_logo_system` | Variants (full color, mono, icon) |
| `03_exports` | Final SVG and PNG export staging |

### Phase 1 — Import reference assets

1. Navigate to the `00_refs` page.
2. Drag in your reference images (concept art, existing mock logo,
   mechanical references, etc.).
3. Reduce visual noise on each reference:
   - Set opacity to 40-60%.
   - Lock the layer (`Ctrl + Shift + L` on Windows, `Cmd + Shift + L`
     on Mac).

These references create a visual constraint field. You are not tracing
over raster images — you are using them as compositional guides.

### Phase 2 — Build the construction grid

1. Navigate to the `01_construction` page.
2. Create a Frame sized `1920 x 640` (horizontal working canvas).
3. Add layout guides:
   - Vertical center line.
   - Left and right margins at approximately 10%.
   - Title center zone at approximately 40-55% of total width.

The grid enforces symmetry, controls collision space between design
elements, and prevents compositional drift during iteration.

### Phase 3 — Create the title text

The title is the compositional anchor. Build it first.

1. Add a text layer and type the title (e.g., `LEGENDARY` on line 1,
   `ARENA` on line 2).
2. Apply typography settings:
   - Font: Bebas Neue (or your chosen display font).
   - All caps.
   - Center aligned.
   - Tracking (letter spacing): -15 to -25.
   - Line height: approximately 90%.
   - Scale the primary word (e.g., `LEGENDARY`) to approximately 115%
     of the secondary word's size.
3. Convert text to vector outlines:
   - Select the text layer.
   - Right-click, then select **Outline Stroke**.

Once outlined, the text is pure vector geometry — alignment-safe and
font-independent for export.

### Phase 4 — Apply color styling

1. Set the fill color on the outlined text. Example base gold:
   `#D4AF37`.
2. For highlights: duplicate the text shape, create a thin highlight
   shape along the top edge, and clip it inside the letters.

Rules:
- Keep all shading shape-based (overlapping fills, clipped highlights).
- Do NOT use the Effects panel for glow or bevel.
- Do NOT apply gradients across the entire text surface.

### Phase 5 — Build organic elements (left side)

Example: flowing hair, ribbons, or similar asymmetric organic shapes.

1. Draw 8-12 thick ribbon shapes using the Pen tool. Each ribbon
   should be thick near its origin and taper toward center.
2. Use fills only, no strokes. Layer structure per strand:

| Layer | Purpose |
|---|---|
| `hair-base` | Primary shape fill |
| `hair-shadow` | Clipped shadow shape for depth |
| `hair-highlight` | Optional highlight strip (top edge) |

3. Shape rules:
   - Use large, smooth S-curves only.
   - Avoid tiny curls or micro-detail.
   - Keep visible spacing between strands.
   - 2-3 strands should extend closest to center as hero strands.

Zoom out to 25%. If the element looks noisy at that scale, simplify
by removing strands or smoothing curves.

### Phase 6 — Build mechanical elements (right side)

Example: segmented tentacles, robotic arms, or similar hard-surface
shapes.

1. Draw a smooth curved path as the tentacle or arm base.
2. Build segmentation with repeating shapes (not strokes):

```
Segment 1 | Segment 2 | Joint | Segment 3 | Segment 4 | Joint
```

   - Every 2-3 segments, add a slightly larger joint ring.

3. Apply color layers per segment:

| Layer | Purpose |
|---|---|
| Base shape | Steel gray or primary mechanical color |
| Shadow shape | Bottom/inner side shadow |
| Highlight band | Top/outer curve highlight |

   No gradients required — shape layering creates the depth.

4. Build the terminal detail (e.g., claw, gripper):
   - 3 prongs maximum, each prong is one clean shape.
   - Large negative space between prongs.
   - Add one shadow wedge inside.

Zoom to 48px equivalent. If the terminal detail does not read clearly
at that size, simplify further.

### Phase 7 — Compose the collision point

Position the organic and mechanical elements so they approach the
title from opposite sides.

Rules:
- Elements approach but do not touch. Gap should be approximately
  1-2% of total composition width.
- The gap must not overlap the title text.
- Depth layering: organic elements sit slightly behind the title
  plane, mechanical elements sit slightly in front.

The composition should convey tension without clutter.

### Phase 8 — Build system variants

Navigate to the `02_logo_system` page and create these variants:

**Full Color** — Copy the finished composition as-is.

**Monochrome** — Convert all fills to white-on-dark and black-on-light
versions. Rules:
- The design must read purely from shapes, with no reliance on color
  contrast.
- Test both versions against their intended background.

**Icon Crop** — Remove the title text. Keep only the interaction point
between organic and mechanical elements. Test:
- Scale the icon to 48px.
- It must still read clearly at that size.

### Phase 9 — Export

Navigate to the `03_exports` page.

1. Pre-export checklist:
   - All strokes are outlined (no live strokes remain).
   - No raster images remain in the export group.
   - No masks that break on flatten (flatten complex masks first).
2. Export formats:
   - **SVG** — primary deliverable for web use.
   - **PNG** — export at 1x, 2x, and 4x for fallback and social media.

### Final validation checklist

Run through these checks before considering the logo complete:

| Check | Criteria |
|---|---|
| Title readability | Readable at 320px total width |
| Icon readability | Icon variant reads at 48px |
| Composition balance | Left and right sides feel balanced |
| Collision point | Clear focal point where elements meet |
| Detail control | No micro-detail visible at small sizes |
| Shape simplicity | Hair/tentacles reduced to major forms only |
| Vector integrity | No live strokes, clean paths, no unnecessary anchor points |

### Process model

Treat logo design as a deterministic pipeline:

```
inputs (references + prompt + constraints)
  -> constrained shape construction
  -> system variants (color, mono, icon)
  -> export artifacts (SVG, PNG 1x/2x/4x)
```

This avoids the common anti-pattern of drawing freely and then trying
to clean up retroactively, which produces multiple redesign passes and
inconsistent output.

## Interactions

- [Hugo Web System](hugo-web-system.md) — the exported SVG and PNG
  assets are consumed by the marketing site's templates and brand
  tokens.
- [Wiki Viewer](wiki-viewer.md) — images referenced in wiki pages
  are stored at `C:\www\legendary-arena-com\static\images\`.

## Edge Cases

- **Font availability.** If Bebas Neue is not installed locally, Figma
  will substitute a default font. Install the font before starting or
  use Google Fonts integration inside Figma.
- **Raster contamination.** Dragging reference images into construction
  pages and forgetting to remove them before export produces mixed
  raster/vector SVGs. Keep references isolated on `00_refs`.
- **Mask flattening.** Complex clipping masks can break when exported
  to SVG. Flatten masks before export and verify the SVG renders
  correctly in a browser.
- **Color profile mismatch.** Figma uses sRGB. If brand tokens
  reference colors in a different profile, convert before applying
  fills.

## References

- [Figma](https://figma.com) — design tool
- [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) — display
  font used in title construction
- `C:\www\legendary-arena-com\static\brand-tokens.css` — brand color
  tokens consumed by the marketing site
