# EC-210 — Scheme Twist Pattern Taxonomy (Execution Checklist)

**Source:** docs/ai/work-packets/WP-183-scheme-twist-pattern-taxonomy.md
**Layer:** Registry (`packages/registry/src/`) + Registry Viewer (`apps/registry-viewer/src/`)

## Before Starting
- [ ] WP-182 (Scheme Twist Resolver Framework) complete ✅
- [ ] WP-083 (Fetch-Time Schema Validation) complete ✅
- [ ] WP-170 (Card Count Display) complete ✅
- [ ] Read `apps/registry-viewer/src/lib/cardAbilitiesClient.ts` (singleton-factory pattern)
- [ ] Read `apps/registry-viewer/src/registry/shared.ts` (`flattenSet`, `applyQuery`)
- [ ] Read `apps/registry-viewer/src/components/AbilityEffectFilter.vue` (chip pattern)
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] Registry tests: 112 pass / 0 fail
- [ ] Viewer tests: 39 pass / 0 fail

## Locked Values (do not re-derive)
- `TWIST_PATTERN_SLUGS` const array: `reveal-or-punish`, `stack-and-escalate`, `chained-reveals`, `bystander-capture`, `hero-ko`, `wound-distribution`, `hand-disruption`, `board-manipulation`
- `TwistPatternSlugSchema = z.enum(TWIST_PATTERN_SLUGS)` — used in both pattern and assignment schemas
- Pattern order values: 10, 20, 30, 40, 50, 60, 70, 80 (in slug order above)
- Assignment key format: `{setAbbr}/{scheme-slug}` (matches engine ext_id)
- Assignment coverage: >= 95% of 191 schemes (>= 182 assigned)
- Drift guard console prefix: `[scheme-twist]`
- `flattenSet(set, schemeTwistAssignments?: Map<string, string>)` — param-based, pure
- Filters are AND-combined; active twist filter implicitly enforces scheme-only
- Filter chips are multi-select (`Set<string>`); UI sorts by `order` ascending

## Guardrails
- No `game-engine` imports in `apps/registry-viewer/` or `packages/registry/`
- `flattenSet` must NOT read from singleton — assignments passed as parameter only
- `.safeParse()` at every fetch boundary — warn + degrade, never throw
- Drift guards use `console.warn`, never `throw`
- No per-render recomputation — Map built once at load time
- No `.reduce()` for multi-step operations
- Chip styles use existing CSS variables (`--chip-bg`, `--chip-border`, `--chip-text`)
- Unassigned schemes: no badge, pass filters when no pattern filter active
- UI sorts patterns by `order` ascending, never by array insertion position
- Partial failure: patterns-fail → no filter UI; assignments-fail → informational chips only; both-fail → fully degraded

## Required `// why:` Comments
- `flattenSet` assignments parameter: why optional (degraded mode)
- Drift guard warn-not-throw: why non-blocking
- Filter AND-combination: why non-scheme cards excluded when filter active
- `Map<string, string>` for assignments: why Map over plain object (dynamic key lookup semantics)

## Files to Produce
- `data/metadata/scheme-twist-patterns.json` — **new** — 8 pattern entries
- `data/metadata/scheme-twist-assignments.json` — **new** — 191 scheme mappings
- `packages/registry/src/schema.ts` — **modified** — 3 Zod schemas + types
- `apps/registry-viewer/src/lib/schemeTwistClient.ts` — **new** — singleton-cached fetcher
- `apps/registry-viewer/src/components/SchemeTwistFilter.vue` — **new** — filter chip ribbon
- `apps/registry-viewer/src/components/CardDetail.vue` — **modified** — pattern badge
- `apps/registry-viewer/src/components/CardGrid.vue` — **modified** — tile badge overlay
- `apps/registry-viewer/src/registry/shared.ts` — **modified** — flattenSet param + applyQuery filter
- `apps/registry-viewer/src/registry/types/types-index.ts` — **modified** — `twistPattern?` on FlatCard
- `apps/registry-viewer/src/App.vue` — **modified** — fetch + wire + pass to flattenSet

## After Completing
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` passes (≥112)
- [ ] `pnpm --filter registry-viewer build` exits 0
- [ ] `pnpm --filter registry-viewer test` passes (≥39)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: zero `game-engine` matches in `apps/registry-viewer/`
- [ ] Grep: `schemeTwistAssignments` appears in `shared.ts` (flattenSet param)
- [ ] Grep: `[scheme-twist]` appears in `schemeTwistClient.ts` (drift guards)
- [ ] Grep: `SchemeTwistPatternSchema` appears in `packages/registry/src/schema.ts`
- [ ] `data/metadata/scheme-twist-assignments.json` has ≥182 entries (≥95% of 191)
- [ ] Coverage test: assigned + documented-unassigned === total scheme count
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` flipped to Done

## Common Failure Smells
- `flattenSet` reads from singleton → breaks purity, introduces load-order bug
- Assignment values not validated against pattern slugs → silent UI drift
- Filter excludes unassigned schemes when NO filter active → data loss
- `throw` in validation path → breaks degraded mode contract
- Pattern-specific CSS colors added → bikeshedding; v1 uses emoji only
- Assignments JSON keyed wrong (`scheme-slug` instead of `setAbbr/scheme-slug`) → zero matches
- `z.record(z.string(), z.string())` instead of `z.record(z.string(), TwistPatternSlugSchema)` → typos pass validation
- Chips sorted by label alphabetically instead of `order` → inconsistent ordering across renders
