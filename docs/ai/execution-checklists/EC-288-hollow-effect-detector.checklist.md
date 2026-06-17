# EC-288 — Hollow Effect Detector (Execution Checklist)

**Source:** docs/ai/work-packets/WP-257-hollow-effect-detector.md
**Layer:** Game Engine

## Before Starting
- [ ] `DESIGN-HOLLOW-EFFECT-DETECTION.md` is on `main` (the design spine this implements)
- [ ] D-24033 + D-24034 reserved in `DECISIONS.md` (drafted; land at close)
- [ ] WP-251 (`HANDLED_KEYWORDS`/`MVP_KEYWORDS`) + WP-200 (`executeVillainAbilities` applied return) are Done
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- `EFFECT_EXECUTION_REASONS = ['applied','handler-noop','condition-failed','deferred','no-handler','unsupported-keyword','parse-unrecognized']`
- Hollow-flagging reasons (exactly these three): `parse-unrecognized`, `no-handler`, `unsupported-keyword`
- Non-flagging reasons: `applied`, `handler-noop`, `condition-failed`, `deferred`
- `HollowEffectRecord` fields: `cardId`, `cardType` (`'hero'|'villain'|'henchman'`), `timing`, `mechanic`, `reason` (a hollow reason), `turn`
- `G.diagnostics` shape: `{ hollowEffects: HollowEffectRecord[]; hollowEffectsDropped: number }`; bound = `HOLLOW_EFFECTS_CAP`
- `DEFERRED_BY_DESIGN_MECHANICS` is an explicit allowlist constant (its members locked in D-24033)
- Hook additive field (BOTH `HeroAbilityHook` and the villain hook type): `unresolvedMarkers?: string[]`
- Hero per-hook rule: a hook flags hollow ⇔ (declared ≥1 effect) ∧ (no `applied`/`handler-noop`/`condition-failed`/`deferred` outcome in the hook) ∧ (≥1 hollow reason)
- Writer: `recordHollowEffect(G, record)` — lazy-init `G.diagnostics`, cap + `hollowEffectsDropped`, append `G.messages` line
- `executeHeroEffects` stays `void`; `executeVillainAbilities` keeps its `VillainEffectKeyword[]` applied return **byte-unchanged**

## Guardrails
- **Reachability, NOT state-diff** — classify on handler presence/reachability; never diff pre/post `G`. (Keystone; D-24033.)
- **Executors write directly; no return/caller change** — `coreMoves.impl.ts`, `fightVillain.ts`, `villainDeck.reveal.ts` are NOT modified; no signature/return change.
- `G.diagnostics` is runtime-only: never persisted, never snapshotted, **never read by any move/rule/`endIf`** (gameplay-input forbidden).
- Never throw in detection or effect execution — warn-and-continue; a missing/non-array `G.messages` must not throw.
- The parser surfaces unresolved markers ONLY for real marker tokens — flavor text yields empty/absent `unresolvedMarkers` (no false flag).
- `HeroKeyword`/`HERO_KEYWORDS`/`MVP_KEYWORDS`/`HANDLED_KEYWORDS` + the villain keyword union are unchanged.
- Channel bounded by `HOLLOW_EFFECTS_CAP` + `hollowEffectsDropped`; lazy-init at the writer (mirror `pendingOptionalKoRewards`), reset empty at `buildInitialGameState`.
- No `boardgame.io`/registry/server import in the detector; no barrel/`apps/**` change.

## Required `// why:` Comments
- The reachability-not-state-diff invariant (hero + villain detection sites)
- `DEFERRED_BY_DESIGN_MECHANICS` — why an explicit allowlist (wound/conditional have no handler → would trip no-handler)
- `unresolvedMarkers` surfacing — why parser-level (hooks carry parsed descriptors only; flavor vs unresolved marker)
- `G.diagnostics` channel + `recordHollowEffect` — why runtime-only + never gameplay input + the cap rationale
- Why `executeVillainAbilities` writes directly rather than changing its return (keep `fightVillain.ts`/`villainDeck.reveal.ts` callers byte-stable)

## Files to Produce
- `diagnostics/hollowEffect.types.ts` — **new (contract)** — reasons array + `isHollowReason` + `EffectExecutionOutcome` + `HollowEffectRecord` + `GameDiagnostics` + cap + deferred allowlist
- `diagnostics/hollowEffect.record.ts` — **new** — `recordHollowEffect` (lazy-init + cap + `G.messages` line)
- `hero/heroEffects.execute.ts` — **modified** — per-hook hollow detection + `recordHollowEffect` (stays `void`)
- `villain/villainEffects.execute.ts` — **modified** — per-descriptor hollow detection at the skip site (return unchanged)
- `rules/heroAbility.types.ts` — **modified** — `unresolvedMarkers?: string[]` on `HeroAbilityHook`
- `rules/villainAbility.types.ts` — **modified** — `unresolvedMarkers?: string[]` on the villain hook type
- `setup/heroAbility.setup.ts` + `setup/villainAbility.setup.ts` — **modified** — surface unresolved markers
- `types.ts` — **modified** — `diagnostics?: GameDiagnostics` on `LegendaryGameState`
- `setup/buildInitialGameState.ts` — **modified** — init `G.diagnostics` empty
- `diagnostics/hollowEffect.test.ts` — **new** — drift + predicate + writer cap + non-array `G.messages` no-throw
- `hero/heroEffects.execute.test.ts` — **modified** — hero hollow + empty-supply/failed-condition/deferred = NO record + mixed-hook
- `setup/heroAbility.setup.test.ts` — **modified** — unresolved-marker vs flavor-text
- `villain/villainEffects.execute.test.ts` — **modified** — villain hollow + recognized-no-op = NO record + applied-return byte-unchanged

## Execution Amendments (test-only EC path corrections, 2026-06-16)
- The EC listed `setup/heroAbility.setup.test.ts` for the unresolved-marker-vs-flavor test, but **that file does not exist** — the `buildHeroAbilityHooks` suite lives at `rules/heroAbility.setup.test.ts`. The hero parser tests were added there.
- The EC's Files list omitted a villain **setup-parser** test even though it modifies `setup/villainAbility.setup.ts`. A villain unresolved-marker test block was added to the existing `setup/villainAbility.setup.test.ts`.
- Both are test-only additions covering already-allowlisted **source** changes (01.1 §"the EC missed a file" → fold inline, no scope expansion). No production file outside the allowlist was touched.
- `setup/buildInitialGameState.ts` is **comment-only**: the channel "resets empty at setup" is realized as the field being **absent** (lazy-init at the writer), NOT a seeded `{ hollowEffects: [], hollowEffectsDropped: 0 }` literal — a seeded literal changes the canonical-JSON `finalStateHash` and breaks AC-E. (Documented under D-24034.)

## After Completing
- [x] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [x] `pnpm --filter @legendary-arena/game-engine test` exits 0 (1394 → 1433/0)
- [x] `git diff --name-only -- data/cards/` empty; no `coreMoves.impl.ts`/`fightVillain.ts`/`villainDeck.reveal.ts`/barrel/`apps/**` diff
- [x] Grep confirms no move/rule/`endIf` reads `G.diagnostics` (only the detector writes it)
- [x] Sentinel/replay `finalStateHash` unchanged (EMPTY_REGISTRY fixtures → channel ABSENT → byte-identical hash)
- [x] Live-on-surface: N/A — `User-Visible Surface = none — infrastructure`; STATUS.md states "No user-observable feature — infrastructure only"
- [x] `docs/ai/STATUS.md` updated
- [x] `docs/ai/DECISIONS.md` updated — D-24033 + D-24034 flipped to Active
- [x] `docs/ai/work-packets/WORK_INDEX.md` WP-257 checked off with date; `docs/ai/execution-checklists/EC_INDEX.md` EC-288 Done
- [x] `docs/05-ROADMAP-MINDMAP.md` WP-257 node added; `node scripts/roadmap-counts.mjs --check` passes

## Common Failure Smells
- A hollow record fires on an empty-supply rescue or failed condition → the detector is diffing `G` instead of checking handler reachability (the keystone violation).
- A flavor-text line trips `parse-unrecognized` → the parser is treating any empty hook as an unresolved marker instead of surfacing only real marker tokens.
- `wound`/`conditional` flag as hollow → the `DEFERRED_BY_DESIGN_MECHANICS` allowlist is missing or not consulted before classifying `no-handler`.
- A villain test or `fightVillain.ts` breaks → the executor's `VillainEffectKeyword[]` return was changed instead of writing directly via `recordHollowEffect`.
