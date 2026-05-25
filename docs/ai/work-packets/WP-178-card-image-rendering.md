# WP-178 — Card Image Rendering on Play Surface

## Goal

Upgrade the arena-client play surface so all board cards render as images
(when `imageUrl` is available) via a single reusable `<CardTile>` component.
Currently every card renders as a text label only. After this WP, the "Watch
Bot Play" experience renders faithful card art for all cards with image data.

## Assumes

- WP-111 / EC-118 — UIState card display projection (ships `UICardDisplay` with `imageUrl`) ✅
- WP-172 / EC-190 — Villain-deck display data coverage (all villain-deck cards have `imageUrl`) ✅
- WP-173 / EC-191 — Well-known ext_id display data (starter cards have `imageUrl`) ✅
- WP-100 — Interactive gameplay surface scaffold ✅
- WP-129 — Board layout (desktop + mobile) ✅
- D-6512 — `defineComponent({ setup() { return {...} } })` pattern lock
- D-16502 — engine barrel publishes UIState sub-types (type-only client import)
- `UICardDisplay = { extId: string; name: string; imageUrl: string; cost: number | null }`
- `imageUrl` is precomputed by `buildCardDisplayData.ts` at setup time; client consumes as-is
- Card images hosted at `https://images.legendary-arena.com/`
- Baseline: `origin/main @ d53ed81` (2026-05-25)

## Context

The engine now populates `imageUrl` for all cards via WP-172 and WP-173. The
arena-client renders everything as text buttons. This is the minimal visual
upgrade that makes the play surface look like a card game rather than a
spreadsheet. Subsequent WPs handle click interactions (WP-100 already wired),
animations, and performance optimization (lazy decode hints, shimmer, preload).

## Scope (In)

- `apps/arena-client/src/components/play/CardTile.vue` — NEW file
- `apps/arena-client/src/components/play/HandRow.vue` — wire `<CardTile>`
- `apps/arena-client/src/components/play/CityRow.vue` — wire `<CardTile>`
- `apps/arena-client/src/components/play/HQRow.vue` — wire `<CardTile>`
- `apps/arena-client/src/components/play/MastermindTile.vue` — wire `<CardTile>`
- `apps/arena-client/src/components/play/YourDeckDiscardZone.vue` — wire `<CardTile>`
- `apps/arena-client/src/components/play/SchemeTile.vue` — wire `<CardTile>` (fallback mode)
- `apps/arena-client/src/components/play/CardTile.test.ts` — NEW unit tests
- Integration test updates for existing component test files (fixture updates)

## Scope (Out)

- Engine, registry, or server changes
- UIState or contract shape changes
- Click interactions (already wired by WP-100/WP-129)
- Animations, zoom, card backs
- Pile counts or overlays beyond cost badge
- Client-side URL construction (consume `imageUrl` as-is)
- Performance hardening (decoding hints, shimmer, preload — future WP)
- `PileBrowseModal.vue` thumbnail rendering (stretch goal only)
- New package dependencies

## Files Expected to Change

| File | Action |
|------|--------|
| `apps/arena-client/src/components/play/CardTile.vue` | CREATE |
| `apps/arena-client/src/components/play/CardTile.test.ts` | CREATE |
| `apps/arena-client/src/components/play/HandRow.vue` | MODIFY |
| `apps/arena-client/src/components/play/CityRow.vue` | MODIFY |
| `apps/arena-client/src/components/play/HQRow.vue` | MODIFY |
| `apps/arena-client/src/components/play/MastermindTile.vue` | MODIFY |
| `apps/arena-client/src/components/play/YourDeckDiscardZone.vue` | MODIFY |
| `apps/arena-client/src/components/play/SchemeTile.vue` | MODIFY |

## Contract

### CardTile Component API

```ts
props:
  display: UICardDisplay       // required
  size?: 'sm' | 'md' | 'lg'   // default 'md'
  showCost?: boolean           // default true
  interactive?: boolean        // default false

emits: none
```

### Rendering Contract

- **Image mode** (when `display.imageUrl` is truthy):
  - Render `<img>` with `loading="lazy"`, `src=display.imageUrl`, `alt=display.name`
  - `title=display.name` for tooltip
  - Cost badge overlay when `showCost=true` and `display.cost !== null`
  - Text label hidden

- **Fallback mode** (when `display.imageUrl` is falsy):
  - Render text layout: name + cost (if present)
  - No `<img>` element emitted
  - No broken image placeholders

### Visual Contract

- 5:7 aspect ratio via CSS `aspect-ratio: 5/7`
- Size variants: `sm` (~60px wide), `md` (~90px wide), `lg` (~120px wide)
- Cost badge: top-right corner overlay, position: absolute
- Hover scale effect only when `interactive=true`
- All styling owned by `CardTile.vue` — no component-specific overrides

### Single Rendering Surface Rule

All play-surface cards MUST render via `<CardTile>` when a `UICardDisplay`
exists. No parent component may render its own `<img>` tag or reconstruct
tile styling independently.

## Acceptance Criteria

- [ ] All play-surface cards render images when `imageUrl` is provided
- [ ] All play-surface cards fall back cleanly to text mode when `imageUrl` absent
- [ ] No broken image icons appear under any condition
- [ ] Cost badge overlays consistently across all surfaces
- [ ] `<CardTile>` is the ONLY image-rendering surface (grep-verifiable: no `<img` in parent components)
- [ ] No violations of layer boundaries (no runtime engine/registry imports)
- [ ] No regression in existing tests
- [ ] Layout remains stable in desktop + mobile (no overflow, no aspect distortion)
- [ ] `cost: null` renders no badge (not "0")
- [ ] SchemeTile renders through `<CardTile>` in fallback mode when `imageUrl` is missing

## Verification Steps

1. `pnpm --filter @legendary-arena/arena-client test` — all pass, no regression
2. `pnpm -r build` — exits 0
3. `pnpm --filter @legendary-arena/arena-client typecheck` — exits 0
4. `grep -r '<img' apps/arena-client/src/components/play/ --include="*.vue" | grep -v CardTile` — returns empty (single rendering surface)
5. `grep -r "from '@legendary-arena/game-engine'" apps/arena-client/src/ | grep -v 'import type'` — returns empty (type-only imports)
6. `grep -r "from '@legendary-arena/registry'" apps/arena-client/src/` — returns empty (layer boundary)

## Definition of Done

- [ ] All Acceptance Criteria satisfied
- [ ] All Verification Steps pass
- [ ] EC-201 clauses all checked
- [ ] WORK_INDEX.md flipped to `[x]`
- [ ] EC_INDEX.md status → Done

## Lint Gate Self-Review

| # | Item | Verdict |
|---|------|---------|
| 1 | Goal is one paragraph, user-visible | ✅ PASS |
| 2 | Assumes cites sources | ✅ PASS |
| 3 | Scope (In) is closed enumeration | ✅ PASS |
| 4 | Scope (Out) explicitly listed | ✅ PASS |
| 5 | Files Expected to Change present | ✅ PASS |
| 6 | Contract section present | ✅ PASS |
| 7 | Acceptance Criteria testable bullets | ✅ PASS |
| 8 | Verification Steps operator-runnable | ✅ PASS |
| 9 | Definition of Done binary gates | ✅ PASS |
| 10 | No .reduce() in new code | ✅ PASS |
| 11 | No Math.random() | N/A (UI-only) |
| 12 | No boardgame.io runtime import | ✅ PASS (type-only) |
| 13 | Test file extension .test.ts | ✅ PASS |
| 14 | ESM-only | ✅ PASS |
| 15 | Full English names | ✅ PASS |
| 16 | No factory functions for one-time setup | ✅ PASS |
| 17 | defineComponent pattern | ✅ PASS (D-6512) |
| 18 | Error messages full sentences | N/A (no errors thrown) |
| 19 | No new dependencies | ✅ PASS |
| 20 | Vision alignment | ✅ (tabletop faithfulness — card images) |
| 21 | API catalog update | N/A (no server endpoints) |
