# EC-227 — Notable Game Event Log (Execution Checklist)

**Source:** docs/ai/work-packets/WP-200-notable-game-event-log.md
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting
- [ ] WP-009A/B complete ✅ (rule hook contracts + pipeline)
- [ ] WP-014A/B complete ✅ (villain reveal pipeline + classification)
- [ ] WP-016 + WP-017 complete ✅ (`fightVillain`; KO / wounds / bystander helpers)
- [ ] WP-024 complete ✅ (`rules/mastermindHandlers.ts`)
- [ ] WP-028 + WP-111 + WP-128 complete ✅ (UIState + display projection + `log` precedent)
- [ ] WP-182 complete ✅ (`rules/schemeTwistResolvers.ts` — five resolvers)
- [ ] WP-185 complete ✅ (villainEffects executor)
- [ ] WP-191 complete ✅ (ext_id grammar reconciliation — Fight/Ambush effects resolve end-to-end)
- [ ] Read `packages/game-engine/src/types.ts` (LegendaryGameState shape + adjacency for the new field)
- [ ] Read `packages/game-engine/src/ui/uiState.types.ts` (line 55, `log: string[]` projection precedent)
- [ ] Read `packages/game-engine/src/ui/uiState.build.ts` + `uiState.filter.ts:388` (projection + filter pattern)
- [ ] Read `packages/game-engine/src/moves/fightVillain.ts` (Fight fire site; emission post-message-push)
- [ ] Read `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` (Ambush fire site; emission post-`executeVillainAbilities`, pre-unconditional-attach)
- [ ] Read `packages/game-engine/src/villain/villainEffects.execute.ts` (executor return widening site)
- [ ] Read `packages/game-engine/src/rules/schemeTwistResolvers.ts` (five resolver terminal points)
- [ ] Read `packages/game-engine/src/rules/mastermindHandlers.ts` (`mastermindStrikeHandler` terminal point)
- [ ] Read `packages/game-engine/src/replay/replay.execute.test.ts` (`PRE_WP080_HASH`) and `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json` (`finalStateHash`)
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (record baseline test count for the post-execution diff)

## Locked Values (do not re-derive)
- `NotableGameEventType` union = exactly four entries in canonical order: `'fightResolved'`, `'ambushResolved'`, `'schemeTwistResolved'`, `'mastermindStrikeResolved'`
- `NOTABLE_EVENT_TYPES` canonical order = matches the union exactly
- `SchemeTwistResolverKey` union = exactly five entries: `'revealOrPunish'`, `'chainedReveals'`, `'woundAll'`, `'koFromHq'`, `'midtownBankRobbery'` (locked to WP-182's resolver framework)
- `SCHEME_TWIST_RESOLVER_KEYS` canonical order = matches the union exactly
- `G.notableEvents: NotableGameEvent[]` — new field, initialised `[]`, append-only at runtime, JSON-serialisable
- Event payload schemas (per the WP §Locked contract values block) are exact — no extra fields, no renames
- `narrative` is a **single sentence** of plain English, no markup, no emoji, composed once at emission
- `executeVillainAbilities` return type widens from `void` to `VillainEffectKeyword[]` (applied effects in dispatch order, post-safe-skip)
- Emission order at each fire site: AFTER the state mutation it describes
- `UIState.notableEvents: NotableGameEvent[]` projection (mirror `log`); `uiState.filter.ts` copies the array

## Guardrails
- No `@legendary-arena/registry` import in `events/notableEvents.types.ts`, `events/notableEvents.compose.ts`, or either test file
- No `boardgame.io` import in `events/notableEvents.types.ts` or `events/notableEvents.compose.ts`
- No `.reduce()` for multi-step branching; use `for...of` with descriptive loop variables
- Moves never throw — event emission must not throw on missing `cardDisplayData` (fall back to raw `cardId` string in narrative)
- `narrative` is composed at the emission site by a pure helper in `notableEvents.compose.ts`; never composed in a move, never composed in the UI
- `G.notableEvents` is JSON-serialisable — no functions, no Maps, no Sets, no class instances anywhere in any event payload
- Existing `G.messages` pushes are PRESERVED — diff before / after on the sentinel fixture must show zero log-line removals
- `executeVillainAbilities` body behaviour (which effects mutate G) is unchanged — only the return value is added
- Drift-detection tests are mandatory for BOTH canonical arrays; bidirectional union ↔ array + length + uniqueness
- Replay re-pin is BEHAVIOUR-NEUTRAL — the sentinel fixture's `messages` array (and every other observable G field) must be byte-identical pre/post; only the hash shifts
- `G.notableEvents` is strictly write-only via `.push(...)` — no splice / shift / pop, no array-reassignment (`G.notableEvents = [...]`), no mutation of prior entries
- `appliedEffects` is embedded in the event in the exact order returned by `executeVillainAbilities`; no sorting / de-duplication / reordering at any call site
- The unconditional bystander-attach that fires on every villain entering the City is NOT an Ambush effect — never include it in `ambushResolved.appliedEffects` and never describe it as an Ambush effect in the narrative
- Narrative strings are byte-stable for identical inputs; no conditional punctuation, no optional clauses, no `toLocaleString` / `Intl.*` / locale-sensitive formatters; format changes require replay re-pin
- Event emission is the LAST step at each fire site (after all attributable state mutations AND after any `G.messages.push` calls). Exception: the ambush fire site emits before the unrelated unconditional bystander-attach block
- Event identity is implicit by index in `G.notableEvents` — no `eventId` / `seq` / `timestamp` field; debug uses the array index as the trace handle

## Required `// why:` Comments
- `NOTABLE_EVENT_TYPES` declaration: why drift-detection (must match union exactly; adding `'escapeResolved'` requires WP-186's follow-up)
- `SCHEME_TWIST_RESOLVER_KEYS` declaration: why locked to WP-182's five resolvers (expansion = data WP, not this one)
- `G.notableEvents` field declaration in `LegendaryGameState`: why append-only (replay determinism)
- `executeVillainAbilities` return change: why widened from `void` (event emission needs the applied keywords; behaviour unchanged)
- `fightVillain.ts` emission point: why after message push and after bystander award (event observes post-mutation state)
- `villainDeck.reveal.ts` ambush emission point: why after `executeVillainAbilities` and before the unconditional bystander-attachment block (the unconditional attach is the MVP city-entry rule, not an Ambush effect)
- Each scheme-twist resolver's emission point: why at the terminal (after all internal `messages.push` calls and state mutations)
- `mastermindStrikeHandler` emission point: why at the terminal
- `notableEvents.compose.ts` narrative composers: why pure-string inputs (no G dependency; replay-deterministic; testable in isolation)
- Replay re-pin: why behaviour-neutral (empty-registry fixture → no emissions → only the empty-array existence shifts the hash)

## Files to Produce
- `packages/game-engine/src/events/notableEvents.types.ts` — **new** — event type union + canonical arrays + four event interfaces + `NotableGameEvent` discriminated union + `SchemeTwistResolverKey` lock
- `packages/game-engine/src/events/notableEvents.compose.ts` — **new** — four pure narrative composers
- `packages/game-engine/src/events/notableEvents.types.test.ts` — **new** — drift detection (NOTABLE_EVENT_TYPES + SCHEME_TWIST_RESOLVER_KEYS) + JSON round-trip per variant
- `packages/game-engine/src/events/notableEvents.compose.test.ts` — **new** — narrative golden strings per event type
- `packages/game-engine/src/types.ts` — **modified** — add `notableEvents` to `LegendaryGameState`; re-export new types
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — initialise `notableEvents: []`
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — widen return to `VillainEffectKeyword[]`
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — assert return shape (additive)
- `packages/game-engine/src/moves/fightVillain.ts` — **modified** — capture executor return; push `fightResolved` event after message push
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — capture ambush executor return; push `ambushResolved` event before unconditional attach
- `packages/game-engine/src/rules/schemeTwistResolvers.ts` — **modified** — five emissions (one per resolver) at terminal points
- `packages/game-engine/src/rules/mastermindHandlers.ts` — **modified** — strike handler terminal emission
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — add `notableEvents` to `UIState`
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project `notableEvents: [...G.notableEvents]`
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — clone `notableEvents` in the filter (mirror line 388)
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — extend drift to cover new field
- `packages/game-engine/src/moves/fightVillain.test.ts` — **modified** — emission integration test
- `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` — **modified** — ambush emission integration test
- `packages/game-engine/src/rules/schemeTwistResolvers.test.ts` — **modified** — each resolver emits its event
- `packages/game-engine/src/rules/mastermindHandlers.test.ts` — **modified** — strike handler emits its event
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** — re-pin `PRE_WP080_HASH` (behaviour-neutral)
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json` — **modified** — re-pin `finalStateHash` (behaviour-neutral)

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline + N new tests)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: zero `@legendary-arena/registry` matches in `packages/game-engine/src/events/`
- [ ] Grep: zero `boardgame.io` matches in `packages/game-engine/src/events/`
- [ ] Grep: at least one `notableEvents.push` match in each of `fightVillain.ts`, `villainDeck.reveal.ts`, `mastermindHandlers.ts`; exactly five in `schemeTwistResolvers.ts`
- [ ] Diff of sentinel-fixture `messages` array pre/post: zero log-line removals or rewrites
- [ ] Drift tests pass: `NOTABLE_EVENT_TYPES` (length 4, exact order, no duplicates) + `SCHEME_TWIST_RESOLVER_KEYS` (length 5, exact order, no duplicates)
- [ ] Determinism assertion: running the same setup + moves twice produces byte-identical `G.notableEvents`
- [ ] `docs/ai/STATUS.md` updated with `### WP-200 Executed` block
- [ ] `docs/ai/DECISIONS.md` updated with D-20001..D-20008 (D-20008 flips from `Drafted` to `Active` — entry already drafted into DECISIONS.md at WP-200 drafting time per copilot check `01.7 §13` resolution; do NOT re-add the body, just flip the `**Status:**` line)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-200 flipped to `[x]` with completion date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-227 flipped to `Done`

## Common Failure Smells
- Adding a fifth top-level event variant (e.g., `'escapeResolved'`) "to get a head start on WP-186" → scope-creep FAIL; WP-186 owns its own event addition
- Composing `narrative` on the client → D-20002 violation (engine owns narrative composition)
- Including `display: UICardDisplay` inline in event payloads → projection drift FAIL; UI looks up display data via `UIState.cardDisplayData`
- Emitting events from the per-effect helpers (gainWound / koCard / attachBystanderToVillain) instead of from the fire-site wrapper → fan-out FAIL; one event per fight/ambush/twist/strike
- Truncating or clearing `G.notableEvents` mid-game → D-20004 violation (append-only invariant)
- Re-pinning `PRE_WP080_HASH` / `finalStateHash` with changed `messages` content → behaviour-neutrality FAIL; investigate (an unintended log push slipped in)
- `narrative` containing emoji or markdown → D-20002 violation (plain English only)
- Pushing the event BEFORE the state mutation it describes → D-20006 violation (post-mutation observation invariant)
- `executeVillainAbilities` return value missing safe-skipped keywords or including them → must list only effects whose case branch ran
- `appliedEffects` array length != number of effects that actually mutated G → emission/return drift; rerun the execute tests
- Removing or rewriting an existing `G.messages.push` line → preservation FAIL; the structured event log is additive
- Sorting / deduplicating / reordering `appliedEffects` before embedding in the event → dispatch-order invariant violation; UI badge order drifts and replay byte-identity breaks
- Including the unconditional city-entry bystander attach in `ambushResolved.appliedEffects` or referring to it as an Ambush effect in the narrative → causal-surface confusion (it is the city-entry rule, not Ambush)
- Adding `eventId` / `seq` / `timestamp` to event payloads "for debugging" → payload-surface drift; debug uses the array index as the implicit trace handle
- Reassigning `G.notableEvents = [...G.notableEvents, newEvent]` or `.splice()`/`.shift()`/`.pop()` calls → write-only push invariant violation
- Tweaking a narrative format string without re-pinning `PRE_WP080_HASH` + the sentinel `finalStateHash` → replay-determinism break
- Using `toLocaleString` / `Intl.*` / any locale-sensitive formatter inside a narrative composer → replay-determinism break under different runtime locales
- Adding `eventIndex` lookup logic that consumers cache (instead of reading by position at the moment of need) → implicit-identity contract drift
