# EC-137 — Hero Card-Instance Distinctness + Data-Driven cardCounts (Execution Checklist)

**Source:** docs/ai/work-packets/WP-137-hero-card-instance-distinctness-and-data-driven-card-counts.md
**Layer:** Game Engine (`packages/game-engine/src/{setup,economy,versioning}/`) + Registry (`packages/registry/src/schema.ts`) + Replay-producer fixture

## Before Starting
- [ ] WP-135 complete: `buildHeroDeck`, `buildHeroDeckCards`, `shuffleHeroDeck`, `RegistryReader`, `RARITY_COPY_COUNT`, `SUPPORTED_RARITY_LABELS`, `parseQualifiedIdForSetup` all exported from `packages/game-engine/src/setup/buildHeroDeck.ts`
- [ ] WP-018 complete: `buildCardStats` hero branch builds `stats[extId]` (currently around line 251 of `economy.logic.ts`)
- [ ] WP-111 complete: `buildCardDisplayData` hero branch builds `displayData[extId]` (currently around line 327)
- [ ] WP-113 complete: replay-hash regression guard + canonical `PRE_WP080_HASH` literal exist in engine test suite
- [ ] Phase A landed: `git log --oneline | Select-String -SimpleMatch cdd37aa` returns at least one match
- [ ] `data/cards/2099.json` heroes show populated `cardCounts` (`spider-man-2099` = `{"Retractable Talons":5,"Venomous Fangs":5,"Spider-Silk Webbing":3,"Spider-Sense Telepathy":1}` — apply-card-counts.mjs path)
- [ ] `data/cards/core.json` heroes show populated `cardCounts` for at least one explicit-patch hero (e.g., `captain-america` — convert-cards-v15.mjs path)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline `679 / 148 / 0`)
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] Latest entry in `docs/ai/DECISIONS.md` D-13xxx range is D-13601 (D-13701/02/03 slots are free)

## Locked Values (do not re-derive)
- Hero card-instance ext_id format (D-13502 extended by D-13702): `<setAbbr>/<heroSlug>/<cardSlug>#<copyIndex>`
- Suffix grammar: `#<decimal>`, zero-indexed, contiguous from `#0` to `#(N-1)`, no leading zeros, no spaces
- `RARITY_COPY_COUNT` (D-13501; unchanged; fallback only): `{ 'Common 1': 5, 'Common 2': 3, 'Uncommon': 3, 'Rare': 3 }`
- `cardCounts` shape: `Record<string, number> | null` at the **hero** level (`HeroSchema`); keys are card display **names** (NOT slugs); a value is treated as valid only when ALL three predicates hold: `typeof v === 'number'` AND `Number.isInteger(v)` AND `v >= 1` — any other value falls through to rarity-map fallback
- Lookup direction: cardCounts → resolve count by `card.name`; ext_id emit → use `card.slug`. The asymmetry is isolated to a single seam at the top of the hero loop in each of three sites.
- Three sites must produce identical resolved copy counts for any (hero, card) pair: `buildHeroDeckCards`, `buildCardStats` (hero branch), `buildCardDisplayData` (hero branch). **Locked author choice (RS-4 resolution):** a shared helper `resolveHeroCardCopyCount(card: { name?: string; rarityLabel: string }, nameLookup: Map<string, number>): number | null` is defined as a named non-default export in `packages/game-engine/src/setup/buildHeroDeck.ts` and imported by `economy/economy.logic.ts` and `setup/buildCardDisplayData.ts`. A sibling exported helper `buildCardCountsNameLookup(cardCounts: unknown): Map<string, number>` builds the per-hero lookup once at the top of each hero loop. Returns `null` when both sources fail (caller in `buildHeroDeckCards` throws on `null`; callers in the two fan-out sites treat `null` as silent fall-through since their throw surface is reserved for `Game.setup()` proper). Grep gate: each of the three sites must import `resolveHeroCardCopyCount` from `'./buildHeroDeck.js'` or `'../setup/buildHeroDeck.js'` (positive assertion).
- Loud-fail throw fires ONLY when both sources fail: `nameLookup.get(card.name)` does not yield positive integer AND `RARITY_COPY_COUNT[card.rarityLabel]` is absent.
- Phase A precondition commit: `cdd37aa`
- Decisions to land in DECISIONS.md: D-13701 (cardCounts authority + schema additive), D-13702 (`#N` suffix grammar), D-13703 (deferred placeholder closure)
- Engine version bump (PS-1): `1.0.0` → `1.1.0` (in `versioning.check.ts:CURRENT_ENGINE_VERSION_VALUE` AND `package.json:version`, kept in lockstep per the comment block at `versioning.check.ts:22–28`)
- Data axis bump (PS-1): `CURRENT_DATA_VERSION = { version: 1 }` → `{ version: 2 }`
- Migration registry key (PS-2): `'1.0.0->1.1.0'`
- Migration function name (PS-2): `migrateHeroExtIdsForCopyIndex` (named export from `versioning.migrate.ts`)
- Suite delta lock (RS-3): engine baseline `679 / 148 / 0` → final `(679 + N) / 150 / 0` with `N ≥ 8`; suite delta exactly `+2` (one new `describe()` in `buildHeroDeck.test.ts`, one in `gameRules.checks.test.ts`)
- Replay-hash literal (PS-3 cascade source): pre-edit `PRE_WP080_HASH = '2baeecc3'` at `replay.execute.test.ts:54`

## Guardrails
- `buildHeroDeckCards` is the canonical emitter of the reservoir. Build-time fan-out (`buildCardStats`, `buildCardDisplayData`) may mirror the suffixing solely to populate ext_id-keyed maps. **No runtime consumer** (move handlers, projection builders, replay verifiers, UI) may construct or strip hero card-instance ext_ids.
- `cardCounts[card.slug]` is ALWAYS WRONG. The data ships keyed by display name. Build a per-hero `nameLookup` (`Map<string, number>`) once at the top of each hero loop, then resolve via `nameLookup.get(card.name)`.
- Hero card-instance ext_ids MUST NOT be embedded unencoded in URLs. `#` is the URL fragment delimiter; raw embedding truncates the ext_id at `#`. If forced to traverse a URL, percent-encode (`#` → `%23`).
- Do not modify `packages/preplan/**`, `apps/server/**`, `apps/arena-client/**`, `apps/registry-viewer/**`, `scripts/convert-cards/**`, `data/cards/**`, or `bbcode/modern-master-strike` (the latter is no longer in this repo's pipeline).
- Do not extend `RARITY_COPY_COUNT` to AMWP-class labels (`'Common 3'`, `'Uncommon 2'`, etc.) — data-driven counts via cardCounts supersede that need.
- Schema change is **additive only**: new optional nullable `cardCounts` on `HeroSchema`. No other field renamed, removed, narrowed, or widened.
- The single `ctx.random.Shuffle` call site in `shuffleHeroDeck` is unchanged. Reservoir flat-array construction order is unchanged (rarity-map iteration order × `cards[]` order × per-copy emit order).

## Required `// why:` Comments
- `buildHeroDeck.ts` at the cardCounts-vs-rarity-map fork: cite D-13701 (cardCounts authoritative when present), D-13501 (rarity-map fallback), D-13703 (deferred-placeholder closure). Note that the lookup is name-keyed against `card.name`.
- `buildHeroDeck.ts` at the `#${copyIndex}` suffix append site: cite D-13702 (suffix grammar) and the `Set.size === Array.length` invariant tested in Scope G.
- `buildHeroDeck.ts` at the loud-fail throw: state that the throw fires only when BOTH copy-count sources fail; the message enumerates both attempted paths.
- `economy.logic.ts` and `buildCardDisplayData.ts` hero branches: cite D-13702 (fan-out) + byte-for-byte parity requirement with `buildHeroDeckCards` (divergence causes silent lookup misses across `G.cardStats` / `G.cardDisplayData`).
- `versioning.migrate.ts` above `migrateHeroExtIdsForCopyIndex`: state the migration's exact contract — best-effort schema compatibility (preventing `#`-absent crashes in legacy ext_ids); does NOT guarantee semantic equivalence; pre-WP-137 replays expected to fail re-verification because shuffle order shifts under the new copy-index convention.
- `versioning.check.ts` at the `CURRENT_ENGINE_VERSION_VALUE` and `CURRENT_DATA_VERSION` bumps: cite D-13702 (suffix grammar — engine reducer behavior change → engine axis) and D-13701 (`cardCounts` authoritative — wire-shape change → data axis). Note that the two bumps occur together because WP-137's surface change is simultaneously a behavior change and a wire-shape change.
- `schema.ts` above `HeroSchema`: verbatim sentence — *"`cardCounts` keys are card display names from the upstream dataset; the engine resolves them against `cards[].name` and emits ext_ids using `cards[].slug`."* Cite D-13701.

## Files to Produce
- `packages/game-engine/src/setup/buildHeroDeck.ts` — **modified** — name-keyed `cardCounts` lookup with rarity-map fallback; `#${copyIndex}` appended in copy loop; loud-fail softened to require both sources missing
- `packages/game-engine/src/setup/buildHeroDeck.test.ts` — **modified** — distinctness invariant (`Set.size`); cardCounts authority with well-formed map; rarity fallback; orphan-entry-ignored; missing-card-name fallback; both-sources-fail throw; rarity-map drift test
- `packages/game-engine/src/economy/economy.logic.ts` — **modified** — hero branch fans out `stats[extId#i]` per copy with identical numerics; same name-keyed resolution as `buildHeroDeck`
- `packages/game-engine/src/economy/economy.logic.test.ts` — **modified** — assert per-copy parity of `G.cardStats` numeric values
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — **modified** — hero branch fans out `displayData[extId#i]` per copy with identical display payload
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` — **modified** — assert per-copy parity of `G.cardDisplayData`
- `packages/game-engine/src/invariants/gameRules.checks.test.ts` — **modified** — 100-seed regression test running `Game.setup()` against a known-pre-WP-137-tripping loadout; all 100 must pass `checkNoCardInMultipleZones`
- `packages/game-engine/package.json` — **modified** — bump `"version"` from `"1.0.0"` to `"1.1.0"` in lockstep with `versioning.check.ts:CURRENT_ENGINE_VERSION_VALUE`
- `packages/game-engine/src/versioning/versioning.check.ts` — **modified** — bump `CURRENT_ENGINE_VERSION_VALUE` to `{1,1,0}` and `CURRENT_DATA_VERSION` to `{version:2}` (PS-1 resolution: this file owns the constants, not `versioning.types.ts`)
- `packages/game-engine/src/versioning/versioning.migrate.ts` — **modified** — define `migrateHeroExtIdsForCopyIndex(payload: unknown): unknown` (named export) and replace `Object.freeze({})` with `Object.freeze({ '1.0.0->1.1.0': migrateHeroExtIdsForCopyIndex })` (PS-2 resolution)
- `packages/game-engine/src/versioning/versioning.test.ts` — **modified** — assert `migrationRegistry['1.0.0->1.1.0']` exists; assert `migrateHeroExtIdsForCopyIndex` rewrites bare hero ext_ids to `#0`-suffixed form, leaves villain/mastermind/henchman/scheme ext_ids untouched, and returns the input unchanged when the payload doesn't satisfy the `ReplayInput`-shape guard
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** — cascade per WP-128 D-12807 / WP-135 cascade template: capture pre-edit `PRE_WP080_HASH` (`'2baeecc3'`), run engine test post-edit, update literal **iff** hash diverges; record pre/post pair in WP-137 §Verification Steps Step 7 (PS-3 resolution, **01.5 IS INVOKED** as a conditional cascade)
- `packages/registry/src/schema.ts` — **modified** — additive optional `cardCounts: z.record(z.string(), z.number().int().min(1)).nullable().optional()` on `HeroSchema` + the verbatim name-vs-slug sentence in the comment block
- `packages/registry/src/registry.smoke.test.ts` — **modified** — assert `cardCounts` populates for at least one set with patch data (e.g., `2099` or `core/captain-america`) and remains absent/null for at least one set without
- `apps/replay-producer/samples/three-turn-sample.inputs.json` — **modified** — regenerated; new ext_ids carry `#N` suffixes
- `docs/ai/{STATUS.md, DECISIONS.md, work-packets/WORK_INDEX.md, execution-checklists/EC_INDEX.md}` — **modified** — see `## After Completing` for required updates per file

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — final count `(679 + N) / 150 / 0` with `N ≥ 8` and **suite delta locked at `+2`** (RS-3 resolution): one new `describe()` block in `buildHeroDeck.test.ts` for the cardCounts-resolution suite + one new `describe()` block in `gameRules.checks.test.ts` for the 100-seed regression. All other new tests (in `economy.logic.test.ts`, `buildCardDisplayData.test.ts`, `versioning.test.ts`) are added as `test()` calls inside existing `describe()` blocks for suite delta `+0` per file. Per WP-031 precedent: bare top-level `test()` calls register `+0` suites; `describe()` blocks register `+1` each.
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] Grep gates all pass (zero matches each): `Math\.random\s*\(` under `packages/game-engine/src`; `from 'boardgame\.io'` in the three modified `*.ts`; `@legendary-arena/registry` in `buildHeroDeck.ts`; `cardCounts\[\w+\.slug\]` anywhere in modified files (catches `cardCounts[card.slug]`, `cardCounts[heroCard.slug]`, etc.)
- [ ] Positive grep gate: `economy/economy.logic.ts` and `setup/buildCardDisplayData.ts` each contain exactly one `import { resolveHeroCardCopyCount, buildCardCountsNameLookup } from '...buildHeroDeck.js'` line (RS-4 shared-helper enforcement)
- [ ] `package.json`/`versioning.check.ts` lockstep: `packages/game-engine/package.json` `"version"` exactly matches `formatEngineVersion(CURRENT_ENGINE_VERSION_VALUE)` from `versioning.check.ts` (both `"1.1.0"`)
- [ ] `git diff --name-only` returns only files listed in `## Files to Produce`; `git diff -- scripts/convert-cards/ data/cards/ packages/preplan/ apps/arena-client/ apps/server/` returns no output
- [ ] Phase A precondition still holds: cdd37aa still reachable; `data/cards/2099.json` and `data/cards/core.json` still show populated cardCounts
- [ ] Replay fixture has `#N`-suffixed hero ext_ids (regex-grep `apps/replay-producer/samples/three-turn-sample.inputs.json` for `\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+#\d`)
- [ ] WP-113 replay-hash regression guard passes (or canonical literal regenerated; pre/post hash pair recorded in WP-137 §Verification Steps)
- [ ] `STATUS.md` prepended with `### WP-137 / EC-137 Executed` block; `DECISIONS.md` has D-13701/02/03 inserted in numeric order with rationale + alternatives-rejected; `WORK_INDEX.md` WP-137 row checked off + Phase 7 deferred placeholder replaced with WP-137 back-reference; `EC_INDEX.md` EC-137 row flipped Draft → Done

## Common Failure Smells
- Tests pass against fixtures but production returns 500 on second `POST /games/legendary-arena/create` → consumer site uses `cardCounts[card.slug]` against the name-keyed data; the lookup misses everywhere, falls through to rarity map, and the bug is masked in fixtures that happen to have rarity-mapped values matching cardCounts. Re-grep all three sites for `card\.slug` near `cardCounts`.
- 100-seed `checkNoCardInMultipleZones` test fails on some seeds → at least one of the three fan-out sites resolves a different copy count than `buildHeroDeckCards`; `G.cardStats` or `G.cardDisplayData` keys diverge from the reservoir; under specific RNG orderings the divergent key set causes invariant violation. The fix is to make the resolution helper a single shared function called from all three sites.
- `Internal Server Error` body on `/games/legendary-arena/create` with no detail → boardgame.io's Koa default error handler swallowing a Game.setup() throw. Check Render runtime log for the trace; expect `Error` from `gameRules.checks.ts` or `buildHeroDeck.ts`.
- Replay-hash regression guard fails after the change → fan-out keys diverged from reservoir, OR the canonical `PRE_WP080_HASH` literal needs intentional regeneration (legitimate for this WP because state shape changes; document the pre/post pair in `## Verification Steps` Step 7).
