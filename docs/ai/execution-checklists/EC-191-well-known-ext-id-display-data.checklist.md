# EC-191 — Well-Known Ext_id Display Data Coverage (Execution Checklist)

**Source:** docs/ai/work-packets/WP-173-well-known-ext-id-display-data.md
**Layer:** Game Engine / Setup

## Before Starting
- [ ] WP-172 ✅ (D-17201 tiered display resolution + helpers); WP-111 / EC-118 ✅ (`G.cardDisplayData`).
- [ ] `packages/game-engine/src/setup/buildCardDisplayData.ts` exports `buildCardDisplayData(registry, matchConfig, numPlayers)` (3-arg signature post-WP-172).
- [ ] Six well-known ext_id constants exist at `pilesInit.ts:22/25/28/31` + `buildInitialGameState.ts:74/77`.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (WP-172 baseline 773 / 0 fail).
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 (baseline).

## Locked Values (do not re-derive)
- Six well-known ext_ids (import constants — DO NOT re-type the strings):
  - `BYSTANDER_EXT_ID = 'pile-bystander'` (`pilesInit.ts:22`)
  - `WOUND_EXT_ID = 'pile-wound'` (`pilesInit.ts:25`)
  - `SHIELD_OFFICER_EXT_ID = 'pile-shield-officer'` (`pilesInit.ts:28`)
  - `SIDEKICK_EXT_ID = 'pile-sidekick'` (`pilesInit.ts:31`)
  - `SHIELD_AGENT_EXT_ID = 'starting-shield-agent'` (`buildInitialGameState.ts:74`)
  - `SHIELD_TROOPER_EXT_ID = 'starting-shield-trooper'` (`buildInitialGameState.ts:77`)
- Six tier-2 literal display payloads (verbatim — match the printed cards; S.H.I.E.L.D. periods are intentional). All `imageUrl: ''`:
  - `pile-bystander` → `'Bystander'`; `pile-wound` → `'Wound'`; `pile-sidekick` → `'Sidekick'`
  - `pile-shield-officer` → `'S.H.I.E.L.D. Officer'`; `starting-shield-agent` → `'S.H.I.E.L.D. Agent'`; `starting-shield-trooper` → `'S.H.I.E.L.D. Trooper'`
- Tier-1 source paths per D-17301 (defensively walked; do NOT scan all sets):
  - `pile-bystander` → `core.bystanders[*]` where `slug === 'bystander'`; `pile-wound` → `core.wounds[*]` where `slug === 'wound'` → `{ name, imageUrl }`.
  - `pile-shield-officer` / `starting-shield-agent` / `starting-shield-trooper` → `core.heroes[*]` where `slug === 'officer' | 'agent' | 'trooper'`; name from `cards[0].name`; imageUrl from `physicalCards[0].imageUrl`.
  - `pile-sidekick` → `ssw1.other[*]` where `cardType === 'sidekick'` → `{ name, imageUrl }`.
- All six new entry types carry `cost: null` (no printed cost on the physical token / starter cards; SHIELD Officer's recruit cost lives in `G.cardStats[SHIELD_OFFICER_EXT_ID]` — separate surface).
- `UICardDisplay` shape: `{ extId: string; name: string; imageUrl: string; cost: number | null }`.

## Guardrails
- `buildCardDisplayData.ts` must NOT import `@legendary-arena/registry` or `boardgame.io`. Extend the local structural `CardDisplayDataRegistryReader` interface only (already in place).
- `pilesInit.ts`, `buildInitialGameState.ts`, `uiState.build.ts`, `HandRow.vue` must NOT be modified — all four are locked surfaces.
- Import the six ext_id constants from `pilesInit.ts` + `buildInitialGameState.ts` — do NOT re-type the literal strings (drift surface; the EC §Verification grep relies on the constants being the single source of truth).
- Defensive registry reads — gate every iteration with `typeof entry === 'object' && entry !== null`, then `typeof === 'string'` field guards. Soft-skip on parse / lookup failure (mirrors WP-172 §5/§6/§7 pattern). Only `Game.setup()` may throw.
- Per-entry fresh object literals — no aliasing across keys (D-2802 / D-13502 / D-14102 precedent).
- No `.reduce()` with branching. Use explicit `for...of` loops with descriptive variable names (`coreSetData`, `ssw1SetData`, `heroEntry`, `bystanderEntry`, `woundEntry`).
- No abbreviations: `findHeroByExactSlug` not `findHeroBySlug`; `findBystanderArrayEntry` not `findBystanderEntry` (the WP-172 `findGenericBystanderEntry` exists; do not consolidate per Rule §16.1).
- Do NOT consolidate `findGenericBystanderEntry` (WP-172, hard-coded `slug === 'bystander'`) and the new `findBystanderArrayEntry` (parameterized slug) — Rule §16.1 forbids 2-call-site abstraction across sections.
- Section 8 (new) goes AFTER the existing section 7 (Villain-Deck Bystanders) and BEFORE the final `return result;`.

## Required `// why:` Comments
- Section 8 header: D-17301 (mirrors WP-172 / D-17201); cite production symptom (2026-05-23 match `WT_9sGMLmdG` showed `pile-bystander` + `starting-shield-trooper` as `<unknown>`).
- Sidekick `'ssw1'` lookup: only set carrying `cardType === 'sidekick'` in `other[]` (2026-05-23); single call site per Rule §16.1.
- SHIELD Officer `cost: null`: `UICardDisplay.cost` is printed cost (none); recruit-cost-3 lives in `G.cardStats` (separate surface).
- Each new helper: source data shape + why distinct from WP-172 helpers (different shapes; Rule §16.1 no consolidation).

## Files to Produce
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — **modified** — Section 8 (Well-Known Generic Cards) + 3 new defensive-read helpers.
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` — **modified** — fixture extensions (`core.bystanders` / `core.wounds` / `core.heroes` for agent/trooper/officer / `ssw1.other` for sidekick) + ~10 new tests including the Well-Known Coverage Invariant.
- `apps/arena-client/src/components/play/HandRow.test.ts` — **modified** — two fixture refreshes (`<unknown>` → `'S.H.I.E.L.D. Agent'` / `'S.H.I.E.L.D. Trooper'`).
- `docs/ai/STATUS.md` — **modified** — placeholder no longer surfaces for the six well-known ext_ids.
- `docs/ai/DECISIONS.md` — **modified** — append D-17301.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — append WP-173 entry.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — append EC-191 entry.

## After Completing
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (≥ 773 + new tests, 0 fail).
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0.
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "@legendary-arena/registry"` returns zero matches.
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "boardgame.io"` returns zero matches.
- [ ] `git diff --name-only` lists exactly the seven files in `## Files to Produce`.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` updated — D-17301 appended.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-173 checked off with today's date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-191 appended.

## Common Failure Smells
- "`<unknown>` still shows in production after merge" — deploy lag OR the match was started before the redeploy. `G.cardDisplayData` is frozen at `Game.setup()`; existing matches keep their pre-WP-173 map. Start a fresh match post-deploy to verify.
- "SHIELD Officer test asserts `cost === 3` but got `null`" — test expectation is wrong. `UICardDisplay.cost` is the PRINTED cost; SHIELD Officer has no printed cost (the recruit-cost-3 is in `G.cardStats`). All six WP-173 entries are `cost: null`.
- "Tempted to consolidate `findGenericBystanderEntry` (WP-172) + `findBystanderArrayEntry` (WP-173) into one helper" — NOT allowed (Rule §16.1, 2-call-site abstraction forbidden). Different scopes; keep distinct.
- "Sidekick falls back to tier-2 in matches that load SSW1" — verify the helper matches `cardType === 'sidekick'` (NOT `slug ===`); see `data/cards/ssw1.json:2359` for the contract.
- "HandRow humanize-fallback test broke" — that test uses a synthesized unknown extId for defense-in-depth; only the two `starting-shield-*` fixtures should change. If broader, the change overreached.
