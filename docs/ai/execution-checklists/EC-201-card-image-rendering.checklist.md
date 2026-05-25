# EC-201 — Card Image Rendering on Play Surface

> Source: WP-178  
> Layer: App (`apps/arena-client/src/**`)  
> Status: Draft

---

## Before Starting

- [ ] WP-111, WP-172, WP-173 all Done in WORK_INDEX.md
- [ ] `pnpm --filter @legendary-arena/arena-client test` passes (baseline)
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0
- [ ] Confirm `UICardDisplay.imageUrl` field exists in `packages/game-engine/src/ui/uiState.types.ts`

---

## Locked Values

- Aspect ratio: `aspect-ratio: 5/7` (CSS)
- Size widths: `sm` = 60px, `md` = 90px, `lg` = 120px
- Cost badge position: top-right corner (`position: absolute; top: 4px; right: 4px`)
- `loading="lazy"` on all `<img>` elements
- Props: `display: UICardDisplay` (required), `size?: 'sm'|'md'|'lg'`, `showCost?: boolean`, `interactive?: boolean`
- Defaults: `size='md'`, `showCost=true`, `interactive=false`
- Component name: `CardTile`
- File path: `apps/arena-client/src/components/play/CardTile.vue`

---

## Guardrails

- [ ] No runtime `import` from `@legendary-arena/game-engine` — type-only (`import type`) exclusively
- [ ] No `import` from `@legendary-arena/registry` (layer boundary)
- [ ] No `<img>` tag in any parent component — only in `CardTile.vue`
- [ ] No `.reduce()` in new code
- [ ] No Pinia store imports in `CardTile.vue`
- [ ] `defineComponent({ setup() { return {...} } })` — no `<script setup>` (D-6512)
- [ ] No `<img>` element emitted when `imageUrl` is falsy (no broken icons)
- [ ] Cost badge must NOT render when `display.cost === null`

---

## Required Comments

- `// why:` on the `loading="lazy"` choice (reserves bandwidth for visible cards)
- `// why:` on the fallback branch (imageUrl falsy → text mode, no broken placeholders)

---

## Files to Produce

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

---

## After Completing

- [ ] `WORK_INDEX.md` — flip WP-178 row to `[x]`
- [ ] `EC_INDEX.md` — status → Done
- [ ] Run all Verification Steps from WP-178

---

## Common Failure Smells

- Broken image icon when `imageUrl` is empty string (falsy check must catch `''`)
- Cost badge appearing for `cost: null` (guard on strict `!== null`)
- Parent components still rendering their own text display alongside `<CardTile>` (leftover markup)
- Aspect ratio distortion when container is too narrow (ensure `min-width` on container, not the tile)
- Hover scale on non-interactive tiles (guard on `interactive` prop)
