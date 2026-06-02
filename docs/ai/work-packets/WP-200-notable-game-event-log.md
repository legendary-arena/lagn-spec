# WP-200 — Notable Game Event Log (Engine)

## Goal

Stand up a deterministic, JSON-serialisable **structured event log** on `G` —
`G.notableEvents: NotableGameEvent[]` — emitted by the engine at four fire
sites (fight, ambush reveal, scheme twist resolution, mastermind strike
resolution) and projected through `UIState.notableEvents` so the arena-client
can render descriptive "what happened" overlays without parsing free-text
log strings. After this WP, the engine emits a typed event with a composed
narrative for every Fight / Ambush / Scheme Twist / Mastermind Strike
resolution; WP-201 consumes it on the UI side.

> **Why structured, not string-parse.** `useRevealDetector.ts` today identifies
> a bystander reveal via `message.toLowerCase().includes('bystander')` against
> `UIState.log`. That same brittleness propagates to every "what happened"
> case if the UI keeps parsing strings: every new effect would need a parser
> update, i18n is hostile, and replay-determinism cannot guarantee
> string-stability under refactors. A typed `NotableGameEvent` discriminated
> union — append-only on `G`, projected through UIState the same way `log`
> already is — gives the UI structured payloads while keeping `G.messages`
> intact for diagnostic use.

---

## Assumes

- WP-009A ✅ — Rule hook contracts.
- WP-009B ✅ — Rule execution pipeline (`executeRuleHooks` / `applyRuleEffects`).
- WP-014A ✅ — Villain reveal pipeline (`villainDeck.reveal.ts`).
- WP-014B ✅ — `G.villainDeckCardTypes` setup-time classification.
- WP-016 ✅ — `fightVillain` move.
- WP-017 ✅ — KO / wounds / bystander helpers.
- WP-019 ✅ — Mastermind state + tactics.
- WP-024 ✅ — Mastermind strike pipeline (`rules/mastermindHandlers.ts`).
- WP-025 ✅ — Board keywords + `G.cardKeywords`.
- WP-028 ✅ — `UIState` projection contract (`buildUIState`).
- WP-111 ✅ — Display-bearing UIState entries (`UICardDisplay`, `cardDisplayData`).
- WP-128 ✅ — `UIState.log: string[]` projection pattern (precedent for
  `notableEvents` projection).
- WP-182 ✅ — Scheme twist resolver framework (`rules/schemeTwistResolvers.ts`,
  five resolvers: `revealOrPunish`, `chainedReveals`, `woundAll`, `koFromHq`,
  `midtownBankRobbery`).
- WP-185 ✅ — Villain `Fight:` / `Ambush:` effect hooks
  (`villainEffects.execute.ts`); the executor currently returns `void` and
  pushes no messages — this WP widens its return to
  `VillainEffectKeyword[]` (additive).
- WP-191 ✅ — Engine ext_id grammar reconciliation (D-18704..D-18708).
  Per-card lookup tables now key by the zone-instance ext_id, so villain
  Fight / Ambush effects resolve end-to-end at the fire sites this WP
  observes.
- `apps/arena-client/src/composables/useRevealDetector.ts` and
  `apps/arena-client/src/components/play/RevealOverlay.vue` are read-only
  references for this WP (the engine ships the contract; WP-201 rewrites
  those files to consume it).
- **Drafting baseline:** `origin/main @ 84f7729`.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Section 1 — Layer Boundary (Authoritative)`
  — Engine layer; engine emits typed projections, UI consumes UIState only.
- `docs/ai/ARCHITECTURE.md §Section 4 — boardgame.io Runtime Model`
  (Move Validation Contract, Rule Execution Pipeline).
- `docs/ai/ARCHITECTURE.md §Persistence Boundary` — `G` is runtime-only and
  must remain JSON-serialisable; the new `notableEvents` field stays
  serialisable (plain objects, no functions / Maps / Sets / classes).
- `docs/ai/REFERENCE/00.6-code-style.md` — full English names; no `.reduce()`
  for effect application; `// why:` comments on non-obvious decisions.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — `CardExtId` alias, locked
  field names.
- `.claude/rules/architecture.md §Move & Phase Rules` — moves never throw;
  only `Game.setup()` may throw.
- `.claude/rules/code-style.md` — pure helpers (no boardgame.io imports);
  drift-detection tests for canonical arrays.
- `.claude/skills/legendary-game-engine/SKILL.md` — Engine layer enforcement.
- `packages/game-engine/src/types.ts` — `LegendaryGameState` shape; add
  `notableEvents` adjacent to `messages` / `heroAbilityHooks` /
  `villainAbilityHooks` (all setup-time-or-append-only-runtime fields).
- `packages/game-engine/src/ui/uiState.types.ts` — `UIState.log: string[]`
  (the projection precedent this WP mirrors at line 55).
- `packages/game-engine/src/ui/uiState.build.ts` — projection builder
  (append `notableEvents: [...G.notableEvents]` mirroring the `log` projection).
- `packages/game-engine/src/ui/uiState.filter.ts:388` — `log: [...uiState.log]`
  filter precedent.
- `packages/game-engine/src/moves/fightVillain.ts` — Fight fire site
  (post-WP-185 layout; emission is the **last** step in the move —
  inserted after the existing `executeVillainAbilities(...,'onFight')`
  call AND after the existing `G.messages.push` calls, so the event
  observes fully settled post-effect, post-log state).
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — Ambush
  fire site (post-WP-185 layout; emission inserted **after** the gated
  `executeVillainAbilities(...,'onAmbush')` call, before the unconditional
  bystander attachment block).
- `packages/game-engine/src/villain/villainEffects.execute.ts` — return
  type widened from `void` to `VillainEffectKeyword[]` (the applied effects,
  in dispatch order). Callers that ignore the return value compile unchanged.
- `packages/game-engine/src/rules/schemeTwistResolvers.ts` — five resolver
  functions (`revealOrPunish`, `chainedReveals`, `woundAll`, `koFromHq`,
  `midtownBankRobbery`) each push descriptive `gameState.messages` strings
  today. Each gets ONE new `gameState.notableEvents.push({...})` call at
  the resolver's terminal point, carrying `resolverKey` +
  engine-composed narrative.
- `packages/game-engine/src/rules/mastermindHandlers.ts` —
  `mastermindStrikeHandler` (exported) + `resolveMagnetoStrike` /
  `buildGenericStrikeEffects`. Strike resolution gets ONE new emission at
  the handler's terminal point.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — initialise
  `notableEvents: []` in the base state composition block.
- `packages/game-engine/src/replay/replay.execute.test.ts` — `PRE_WP080_HASH`
  re-pinned (behavior-neutral; the constant is the post-`Game.setup()` hash
  of an empty-registry G — adding an empty array to G changes the hash).
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
  — `finalStateHash` re-pinned for the same reason (empty registry → no events
  emitted → hash shifts only because the array exists).

---

## Context

The engine surfaces game events as free-text strings in `G.messages` (and via
`UIState.log`). `RevealOverlay.vue` shows a 2-second card-name + hard-coded
destination label ("Scheme Twist!", "Master Strike!", "Enters the City",
"Bystander captured") — partial information that doesn't tell the player what
*happened*. Concretely:

1. **No fight overlay exists at all.** `useRevealDetector` watches
   `villainDeckCount` decreasing; fights are a player move, not a deck reveal,
   so a defeated villain triggers no UI overlay despite the engine pushing
   descriptive log strings.
2. **Ambush is conflated with "Enters the City."** Every city reveal gets the
   same label regardless of whether the villain has Ambush or what effect
   fired — even though, after WP-185 + WP-191, ambush effects (KO Hero,
   capture Bystander, etc.) now resolve end-to-end.
3. **Scheme Twist and Master Strike show only the card name + a generic
   label.** The resolver's actual effect on game state lives in
   `G.messages` as free text the UI doesn't display structurally.
4. **Villain ability effects mutate G silently.**
   `villain/villainEffects.execute.ts` pushes no messages — the
   `koHeroCurrentPlayer` / `captureBystander` / `gainWoundEachPlayer` etc.
   branches mutate state without trace beyond the helper-driven zone
   changes.

This WP closes the engine half: emit a typed `NotableGameEvent` at each of
the four fire sites with an engine-composed narrative summarising what
happened. WP-201 (paired) replaces `useRevealDetector` / `RevealOverlay`
with a typed-event consumer that renders descriptive overlays — including
the new Fight case.

---

## Scope (In)

- **`NotableGameEvent` discriminated union** — closed union of exactly four
  variants (canonical order):
  - `'fightResolved'` — `{ type, playerId, cardId, citySpace, bystandersRescued, appliedEffects, narrative }`
  - `'ambushResolved'` — `{ type, revealedCardId, citySpace, appliedEffects, narrative }`
  - `'schemeTwistResolved'` — `{ type, twistCardId, resolverKey, narrative }`
  - `'mastermindStrikeResolved'` — `{ type, strikeCardId, narrative }`
- **Canonical type array** `NOTABLE_EVENT_TYPES: readonly NotableGameEventType[]`
  with drift-detection test (bidirectional union ↔ array, same pattern as
  `REVEALED_CARD_TYPES` / `VILLAIN_ABILITY_TIMINGS`).
- **New `G.notableEvents: NotableGameEvent[]`** on `LegendaryGameState`,
  initialised to `[]` in `buildInitialGameState.ts`. Append-only at
  runtime; no clearing, no truncation. Deterministic by construction
  (events are pushed in fire-site order; same seed + same moves = identical
  event sequence).
- **Fight fire site emission** — `fightVillain.ts` captures the
  `VillainEffectKeyword[]` returned by `executeVillainAbilities(...,'onFight')`
  and pushes one `fightResolved` event after the existing message push.
  Narrative composed via a pure helper:
  `composeFightNarrative(cardName, bystandersRescued, appliedEffects)`.
- **Ambush fire site emission** — `villainDeck.reveal.ts` ambush branch
  captures the `VillainEffectKeyword[]` returned by
  `executeVillainAbilities(...,'onAmbush')` and pushes one
  `ambushResolved` event. Narrative composed via
  `composeAmbushNarrative(cardName, appliedEffects)`. The unconditional
  bystander-attachment block (lines after the ambush call) is preserved
  unchanged; it represents the engine's MVP "every villain captures a
  bystander on entry" rule, not an Ambush effect.
- **Scheme twist emission** — each of the five resolvers in
  `schemeTwistResolvers.ts` pushes one `schemeTwistResolved` event at its
  terminal point with `resolverKey` (locked union; see Locked Contract
  Values) and narrative reusing the resolver's already-composed
  `gameState.messages.push` summary line. No string-parsing of the
  resolver's other internal `messages.push` calls — `narrative` is the
  resolver's top-level summary, composed once at the emission site.
- **Mastermind strike emission** — `mastermindStrikeHandler` pushes one
  `mastermindStrikeResolved` event at its terminal point with the strike
  card id and a composed narrative.
- **`VillainEffectKeyword[]` return on `executeVillainAbilities`** —
  signature change from `: void` to `: VillainEffectKeyword[]`. The
  executor returns the applied-effect keywords in dispatch order
  (post-out-of-vocab safe-skip filtering: only effects whose case branch
  ran are listed). Callers that ignore the return type compile unchanged
  (assignment is optional). Mirrors the data-only contract WP-185 / WP-191
  established; no new boardgame.io imports.
- **UIState projection** — add `notableEvents: NotableGameEvent[]` to
  `UIState`. Project as `[...G.notableEvents]` in `uiState.build.ts`
  (mirror the existing `log` projection pattern). Add the same shape to
  `uiState.filter.ts` (filter copies the array). The event payload types
  are display-safe (no engine internals leaked).
- **Narrative composition helpers** — `composeFightNarrative`,
  `composeAmbushNarrative` in
  `packages/game-engine/src/events/notableEvents.compose.ts`. Pure
  functions: `(cardName: string, ...effect data...) => string`. Single
  sentence per event. Uses `G.cardDisplayData[cardId].name` at the call
  site (passed in as plain string — composer is pure, no G dependency).
- **Drift-detection test** for `NOTABLE_EVENT_TYPES`.
- **Replay-oracle re-pin** — `PRE_WP080_HASH` in
  `replay/replay.execute.test.ts` and `finalStateHash` in
  `test/fixtures/games/sentinel-core-doom-2p.replay.json`. Behaviour-neutral:
  with an empty registry the engine emits no events, so the only delta
  driving the hash change is the existence of the empty `notableEvents`
  array.

## Out of Scope

- **UI consumption** — WP-201 (paired follow-on) replaces
  `useRevealDetector` / `RevealOverlay` and adds the Fight overlay.
- **Per-effect granularity** — single event per Fight / Ambush / Twist /
  Strike. Multiple effects on one fight (e.g.
  `[effect:koHeroCurrentPlayer]` + `[effect:captureBystander]`) surface as
  one event with `appliedEffects: ['koHeroCurrentPlayer', 'captureBystander']`,
  not two events. Splitting is a future-WP question (e.g., when the UI
  wants per-effect badges with timing).
- **`'onEscape'` event** (WP-186 territory) — when WP-186 lands, a new
  `'escapeResolved'` variant is the additive extension and a NEW WP.
  This WP does not pre-add it.
- **`G.messages` rewrites or removals** — existing log strings stay as-is
  for diagnostic/debug use; this WP layers structured events alongside,
  not in place of. Scheme-twist and strike resolvers keep their internal
  `messages.push` calls; only ADD the structured event at the terminal
  point.
- **i18n / localisation** — `narrative` is English plain text composed by
  the engine. A future WP introduces a key/params shape for localisation.
- **Truncation / windowing** — `G.notableEvents` is unbounded
  append-only. UI windowing (e.g., last 10) is WP-201's concern.
- **Per-card UICardDisplay enrichment on events** — events carry IDs +
  composed narrative only; the UI looks up display data via
  `UIState.cardDisplayData` at render time (already exposed by WP-111).
  No `display: UICardDisplay` embedded in event payloads (avoids
  duplication / projection drift).

---

## Files Expected to Change

1. `packages/game-engine/src/events/notableEvents.types.ts` — **new** —
   `NotableGameEventType` union, `NOTABLE_EVENT_TYPES` canonical array,
   four event interfaces (`FightResolvedEvent`, `AmbushResolvedEvent`,
   `SchemeTwistResolvedEvent`, `MastermindStrikeResolvedEvent`),
   `NotableGameEvent` discriminated union, `SchemeTwistResolverKey`
   canonical union + array (locked to the five WP-182 resolvers).
2. `packages/game-engine/src/events/notableEvents.compose.ts` — **new** —
   pure helpers `composeFightNarrative`, `composeAmbushNarrative`,
   `composeSchemeTwistNarrative`, `composeMastermindStrikeNarrative`.
   All inputs are plain strings / arrays / numbers; no G/ctx dependency;
   no boardgame.io imports.
3. `packages/game-engine/src/events/notableEvents.types.test.ts` —
   **new** — drift-detection (NOTABLE_EVENT_TYPES + SCHEME_TWIST_RESOLVER_KEYS);
   JSON-serialisability proof for each variant.
4. `packages/game-engine/src/events/notableEvents.compose.test.ts` —
   **new** — narrative-composition unit tests per event type (golden
   strings for representative inputs; deterministic).
5. `packages/game-engine/src/types.ts` — **modified** — add
   `notableEvents: NotableGameEvent[]` to `LegendaryGameState`; re-export
   new types from `./events/notableEvents.types.js`.
6. `packages/game-engine/src/setup/buildInitialGameState.ts` —
   **modified** — initialise `notableEvents: []` in the base state
   composition block (one new line; no other behaviour change).
7. `packages/game-engine/src/villain/villainEffects.execute.ts` —
   **modified** — widen return type from `void` to
   `VillainEffectKeyword[]`. Accumulate applied keywords in dispatch order
   (after the existing out-of-vocab safe-skip), return at the end.
8. `packages/game-engine/src/villain/villainEffects.execute.test.ts` —
   **modified** — update existing tests to assert the new return shape
   (additive assertion; preserves existing behaviour assertions).
9. `packages/game-engine/src/moves/fightVillain.ts` — **modified** —
   capture the executor's return; after the existing message push,
   `G.notableEvents.push({ type: 'fightResolved', ... })` with composed
   narrative.
10. `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
    **modified** — capture the executor's return in the ambush branch
    (only when `hasAmbush(...)` is true); push one `ambushResolved`
    event before the unconditional bystander-attachment block.
11. `packages/game-engine/src/rules/schemeTwistResolvers.ts` —
    **modified** — each of the five resolvers pushes one
    `schemeTwistResolved` event at its terminal point with its
    `resolverKey` (locked to the canonical union) and narrative.
12. `packages/game-engine/src/rules/mastermindHandlers.ts` —
    **modified** — `mastermindStrikeHandler` pushes one
    `mastermindStrikeResolved` event at its terminal point.
13. `packages/game-engine/src/ui/uiState.types.ts` — **modified** — add
    `notableEvents: NotableGameEvent[]` to `UIState` (alongside `log`).
14. `packages/game-engine/src/ui/uiState.build.ts` — **modified** —
    project `notableEvents: [...G.notableEvents]` (mirror the existing
    `log` projection).
15. `packages/game-engine/src/ui/uiState.filter.ts` — **modified** —
    add `notableEvents: [...uiState.notableEvents]` to the filter clone
    (mirror line 388 `log` filter).
16. `packages/game-engine/src/ui/uiState.types.drift.test.ts` —
    **modified** — extend the drift test to cover the new field.
17. `packages/game-engine/src/moves/fightVillain.test.ts` — **modified
    or new test file** — emission integration test: a fight produces
    exactly one `fightResolved` event with correct payload.
18. `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts` —
    **modified** — emission integration test: revealing an Ambush
    villain produces one `ambushResolved` event.
19. `packages/game-engine/src/rules/schemeTwistResolvers.test.ts` —
    **modified** — each resolver emits one `schemeTwistResolved` event.
20. `packages/game-engine/src/rules/mastermindHandlers.test.ts` —
    **modified** — strike handler emits one `mastermindStrikeResolved`
    event.
21. `packages/game-engine/src/replay/replay.execute.test.ts` —
    **modified** — re-pin `PRE_WP080_HASH` (behaviour-neutral, see
    Non-Negotiable Constraints).
22. `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
    — **modified** — re-pin `finalStateHash` (behaviour-neutral).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. No diffs / snippets.
- ESM only, Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — no
  abbreviations, no nested ternaries, no `.reduce()` for multi-step
  branching, every function has JSDoc, every non-obvious decision has a
  `// why:` comment.
- All randomness via `ctx.random.*`. No `Math.random()`, no clocks, no
  filesystem / network / env access from emissions.
- `G` is JSON-serialisable: `G.notableEvents` and every event payload
  contain only primitives / arrays / plain objects. No functions, no
  Maps, no Sets, no class instances.
- Moves never throw. Only `Game.setup()` may throw. Event emissions never
  throw (defensive: if `cardDisplayData[cardId]` is missing, fall back
  to the raw `cardId` string in narrative).
- No `@legendary-arena/registry` import from `packages/game-engine`.
- No `boardgame.io` import in pure event/narrative helpers.

**Packet-specific:**

- The `NotableGameEvent` union is exactly four variants in canonical
  order: `fightResolved` → `ambushResolved` → `schemeTwistResolved` →
  `mastermindStrikeResolved`. Adding a fifth requires a new WP + a
  `DECISIONS.md` entry (e.g., WP-186's eventual `escapeResolved`).
- The `SchemeTwistResolverKey` union is exactly the five WP-182 resolver
  keys: `revealOrPunish`, `chainedReveals`, `woundAll`, `koFromHq`,
  `midtownBankRobbery`. Adding a sixth tracks with the WP-182 resolver
  framework, not this WP.
- `narrative` is engine-composed English plain text, **single sentence**,
  composed once at the emission site via a pure helper from
  `notableEvents.compose.ts`. No client-side composition. No formatting
  markup. No emoji.
- `appliedEffects: VillainEffectKeyword[]` lists the effects the executor
  actually applied (post-safe-skip), in dispatch order — never the
  parsed-but-out-of-vocab tokens, never empty-array-equals-no-effects-fired
  ambiguity.
- Events are pushed AFTER all state mutations attributable to the
  event's trigger AND after any associated `G.messages.push` calls
  (the event emission is the LAST step in each fire site). Exception:
  the ambush fire site emits before the unrelated unconditional
  bystander-attach block — that block is causally part of the city-
  entry rule, not the Ambush trigger, and is sequenced per §Scope (In).
  A fight event's `bystandersRescued` reflects post-award state; an
  ambush event's `appliedEffects` reflects effects that actually ran.
- `G.notableEvents` is strictly write-only via `.push(...)`. Code MUST
  NOT splice / shift / pop the array, reassign a new array reference
  (`G.notableEvents = [...]`), or mutate any prior entry (no in-place
  narrative rewrites, no event coalescing, no post-hoc sort).
- Narrative strings MUST be canonical and byte-stable for identical
  inputs: identical (cardName, count, effect-keyword) tuples produce
  identical output. No conditional punctuation, no optional clauses
  that reorder or omit segments, no locale-sensitive formatters
  (`toLocaleString` / `Intl.*` / number formatters). Any change to a
  narrative format string is a replay-affecting change and requires
  re-pinning `PRE_WP080_HASH` + the sentinel `finalStateHash`.
- `appliedEffects` ordering is the exact order in which the executor's
  effect case branches ran inside `executeVillainAbilities`. Call sites
  embed the array as returned — no sorting, no de-duplication, no
  reordering. The executor's dispatch order is the authoritative
  ordering; downstream consumers (UI badges, tests, narrative
  composers) must not re-derive it.
- Event identity is implicit by index position in `G.notableEvents`.
  No `eventId` / `seq` / `timestamp` field is introduced — debug
  traces and replay-mismatch diagnostics use the array index as the
  trace handle. This preserves minimal payload surface and forecloses
  a future "we need event IDs" expansion WP.
- The unconditional bystander attachment that fires on every villain
  entering the City (the MVP city-entry rule) is NOT an Ambush effect.
  It MUST NOT be included in `ambushResolved.appliedEffects` and MUST
  NOT be described as an Ambush effect in the narrative. Ambush
  effects are exactly the keywords returned by
  `executeVillainAbilities(...,'onAmbush')`; the unconditional attach
  is a separate causal surface.
- Existing `G.messages` strings are PRESERVED. The structured event log
  is additive; do not remove or rephrase any existing message push.
- `executeVillainAbilities` return-type widening from `void` to
  `VillainEffectKeyword[]` is the only signature change. The body's
  observable behaviour (which effects mutate G) is unchanged.

**Replay determinism preservation:**

- Identical setup + identical moves must produce a byte-identical
  `G.notableEvents` sequence (event order, payloads, narrative strings).
  Narrative composition uses only the inputs passed by the emission site
  (no `Date.now()`, no `Math.random()`, no clock reads).
- `PRE_WP080_HASH` and the sentinel fixture `finalStateHash` are
  re-pinned at execution time; both are behaviour-neutral because the
  fixtures run with an empty registry → no fire site emits any event →
  the only hash delta is the empty `notableEvents` array's existence.

**Session protocol:**

- If any assumption above is false at session start, stop and report
  `BLOCKED:` with the missing dependency. Do not work around.
- The WP-185 / WP-191 executor return-type change (Files row 7) is
  intentional; if a downstream caller exists outside the
  fightVillain / villainDeck.reveal sites that breaks under the new
  return type, treat it as an additional caller to update (additive)
  rather than reverting the widening.

**Locked contract values:**

```typescript
export type NotableGameEventType =
  | 'fightResolved'
  | 'ambushResolved'
  | 'schemeTwistResolved'
  | 'mastermindStrikeResolved';

export const NOTABLE_EVENT_TYPES: readonly NotableGameEventType[] = [
  'fightResolved',
  'ambushResolved',
  'schemeTwistResolved',
  'mastermindStrikeResolved',
] as const;

export type SchemeTwistResolverKey =
  | 'revealOrPunish'
  | 'chainedReveals'
  | 'woundAll'
  | 'koFromHq'
  | 'midtownBankRobbery';

export const SCHEME_TWIST_RESOLVER_KEYS: readonly SchemeTwistResolverKey[] = [
  'revealOrPunish',
  'chainedReveals',
  'woundAll',
  'koFromHq',
  'midtownBankRobbery',
] as const;

export interface FightResolvedEvent {
  type: 'fightResolved';
  playerId: string;            // boardgame.io player-index string ("0", "1", ...)
  cardId: CardExtId;           // zone-instance ext_id of the defeated villain/henchman
  citySpace: number;           // 0..4
  bystandersRescued: number;   // count, >= 0
  appliedEffects: VillainEffectKeyword[];
  narrative: string;
}

export interface AmbushResolvedEvent {
  type: 'ambushResolved';
  revealedCardId: CardExtId;
  citySpace: number;           // 0..4
  appliedEffects: VillainEffectKeyword[];
  narrative: string;
}

export interface SchemeTwistResolvedEvent {
  type: 'schemeTwistResolved';
  twistCardId: CardExtId;
  resolverKey: SchemeTwistResolverKey;
  narrative: string;
}

export interface MastermindStrikeResolvedEvent {
  type: 'mastermindStrikeResolved';
  strikeCardId: CardExtId;
  narrative: string;
}

export type NotableGameEvent =
  | FightResolvedEvent
  | AmbushResolvedEvent
  | SchemeTwistResolvedEvent
  | MastermindStrikeResolvedEvent;
```

---

## Acceptance Criteria

- [ ] `NotableGameEventType` union and `NOTABLE_EVENT_TYPES` canonical
  array are exact siblings — drift-detection test asserts bidirectional
  equality, length 4, no duplicates.
- [ ] `SchemeTwistResolverKey` union and `SCHEME_TWIST_RESOLVER_KEYS`
  canonical array are exact siblings — drift-detection test asserts the
  same.
- [ ] `G.notableEvents` is initialised to `[]` at setup and is
  JSON-serialisable for every variant (round-trip preserved).
- [ ] `executeVillainAbilities` returns the applied
  `VillainEffectKeyword[]` in dispatch order; existing behaviour tests
  remain green; new test pins the return shape.
- [ ] Fighting a villain pushes exactly one `fightResolved` event with
  the correct `playerId` / `cardId` / `citySpace` / `bystandersRescued`
  / `appliedEffects`; `narrative` is non-empty single-sentence English.
- [ ] Revealing a villain whose `Ambush:` line has at least one
  `[effect:]` marker pushes exactly one `ambushResolved` event with
  correct `revealedCardId` / `citySpace` / `appliedEffects`.
- [ ] Revealing a villain whose Ambush execution returns zero applied
  effects (`executeVillainAbilities(...,'onAmbush')` returns `[]`) MUST
  still push exactly one `ambushResolved` event with
  `appliedEffects: []` and a narrative that names the villain without
  any effect claim. The criterion binds to the executor's return
  value, not to parser-token inspection — a parser change that filters
  markers differently must not silently flip this contract.
- [ ] Each of the five scheme-twist resolvers
  (`revealOrPunish` / `chainedReveals` / `woundAll` / `koFromHq` /
  `midtownBankRobbery`) emits exactly one `schemeTwistResolved` event
  with the matching `resolverKey`.
- [ ] `mastermindStrikeHandler` emits exactly one
  `mastermindStrikeResolved` event per strike resolution.
- [ ] `G.messages` retains every pre-WP-200 string push — diff of
  pre/post run on the sentinel fixture produces the same log lines
  (no removals, no rewrites).
- [ ] `UIState.notableEvents` is populated identically to
  `G.notableEvents` (length-equal, content-equal after copy).
- [ ] `uiState.filter.ts` clones `notableEvents` identically to `log`.
- [ ] Identical setup + identical moves produces byte-identical
  `G.notableEvents` (deterministic-replay assertion).
- [ ] `PRE_WP080_HASH` and sentinel fixture `finalStateHash` re-pinned;
  the replay test passes. The fixture's `messages` array is unchanged
  (behaviour-neutral check beyond the hash).
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; new
  tests pass and pre-existing baseline preserved.
- [ ] `pnpm -r build` exits 0.
- [ ] No `@legendary-arena/registry` or `boardgame.io` import in any new
  file (`events/notableEvents.types.ts`,
  `events/notableEvents.compose.ts`, both test files).

---

## Verification Steps

```pwsh
# Build & test the engine
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test

# Layer-boundary greps (each must return zero matches)
grep -rn "@legendary-arena/registry" packages/game-engine/src/events/
grep -rn "boardgame.io" packages/game-engine/src/events/

# Confirm emission at each of the four fire sites (each must return >= 1)
grep -n "notableEvents.push" packages/game-engine/src/moves/fightVillain.ts
grep -n "notableEvents.push" packages/game-engine/src/villainDeck/villainDeck.reveal.ts
grep -nc "notableEvents.push" packages/game-engine/src/rules/schemeTwistResolvers.ts   # expect 5
grep -n "notableEvents.push" packages/game-engine/src/rules/mastermindHandlers.ts

# Drift-detection tests must pass
pnpm --filter @legendary-arena/game-engine test --grep "NOTABLE_EVENT_TYPES"
pnpm --filter @legendary-arena/game-engine test --grep "SCHEME_TWIST_RESOLVER_KEYS"

# Replay determinism
pnpm --filter @legendary-arena/game-engine test --grep "replay"

# Full monorepo build
pnpm -r build
```

Expected outputs: each `grep` for registry/boardgame.io in the named
files returns nothing; the four `notableEvents.push` greps return at
least one match each (five for the scheme-twist resolvers); both
drift-detection tests pass; replay tests pass after the re-pin.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` updated with a `### WP-200 Executed` block —
  engine surface, four emission sites, executor return widened,
  replay re-pin reference.
- [ ] `docs/ai/DECISIONS.md` updated with **D-20001..D-20008**:
  - D-20001: `NotableGameEvent` discriminated union with four canonical
    variants; adding a fifth requires a new WP.
  - D-20002: `narrative` is engine-composed plain English, single
    sentence, no markup; client-side composition is forbidden.
  - D-20003: `executeVillainAbilities` widened from `void` to
    `VillainEffectKeyword[]` (applied effects in dispatch order).
  - D-20004: `G.notableEvents` is append-only; no clearing /
    truncation / coalescing; UI windowing lives in WP-201.
  - D-20005: scheme twist + mastermind strike events use
    `resolverKey` / narrative (no `appliedEffects` array); fight +
    ambush events expose `appliedEffects` for typed UI badges.
  - D-20006: events are pushed AFTER state mutation at each fire
    site (events observe post-mutation state).
  - D-20007: replay-oracle re-pin is behaviour-neutral
    (`PRE_WP080_HASH` + sentinel `finalStateHash` only shift because
    the empty `notableEvents` array exists; no event emissions in
    empty-registry fixtures).
  - D-20008: `packages/game-engine/src/events/` classified as engine
    code category (mirrors D-2706 / D-2801 / D-3001 / D-3101 /
    D-3201 / D-3301 / D-3401 / D-3501 / D-3601 / D-3701 / D-4001
    precedent chain); drafted at WP-200 drafting time per copilot
    check `01.7 §13` resolution; flips to Active on WP-200 execution
    close. Also landed in same drafting commit as the
    `02-CODE-CATEGORIES.md §Engine` directory-row addition.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-200 flipped to
  `[x]` with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-227 flipped
  to `Done`.
- [ ] No files outside the 22-file `## Files Expected to Change` list
  were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness — surfacing what
happened mirrors the tabletop "everyone sees the card text resolve" UX),
§2 (Mechanical fidelity), §10 (Card-data semantics — the narrative names
the effect that fired), §22 (Replay determinism — events are
deterministically composed).

**Conflict assertion:** none. The structured event log is an additive
projection layer; it changes no rules, no scoring, no win conditions.

**Non-Goal proximity check:** none of NG-1..NG-7 are crossed. This is
an information-surface change, no PvP/scoring/leaderboard impact.

**Determinism preservation:** all narrative composition is pure
(plain-string inputs / outputs). All emission sites are deterministic
given the same G/ctx inputs. No `ctx.random.*` usage introduced. The
sentinel fixture stays empty-registry → no emissions → re-pin is
behaviour-neutral.

---

## Funding Surface Gate

N/A — engine-only WP; no §20.1 trigger surfaces touched.

---

## API Catalog Update

N/A — engine-only WP; no HTTP endpoints added/modified/removed in
`apps/server/`; no `apps/server/src/**` library function changes
recorded in the catalog as `Library-only`.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites with status | ✅ (incl. WP-185/191 ✅; arena-client files listed as read-only refs) |
| 3 | Context (Read First) is specific (file paths + sections) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract; 22 files | ✅ |
| 6 | Non-Negotiable Constraints section present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria are testable bullets | ✅ |
| 8 | Verification Steps are operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — no registry/boardgame.io imports in pure helpers | ✅ |
| 11 | Identity model N/A — no auth surface | N/A |
| 12 | Test rules: node:test only, makeMockCtx, no boardgame.io/testing | ✅ |
| 13 | pnpm commands only; expected output shown | ✅ |
| 14 | Acceptance criteria objective and scope-aligned (§14) | ✅ (15 binary items, named filenames + token greps) |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX / scope-bound | ✅ |
| 16 | Code style: full English names, JSDoc, no .reduce in event emission | ✅ |
| 17 | Vision Alignment present; clauses §1 / §2 / §10 / §22; determinism line included | ✅ |
| 18 | Prose-vs-grep: §Verification Steps grep targets are scoped to filenames | ✅ |
| 19 | Bridge-vs-HEAD staleness rule — commit-time discipline | N/A |
| 20 | Funding surface N/A with explicit justification | ✅ |
| 21 | API catalog N/A with explicit justification | ✅ |

---

*Drafted 2026-06-02. Baseline `origin/main @ 84f7729`. Paired with WP-201
(UI consumer + descriptive overlay + Fight overlay). Hard prerequisites:
WP-185 ✅, WP-191 ✅, WP-182 ✅, WP-024 ✅, WP-028 ✅, WP-111 ✅,
WP-128 ✅. D-20001..D-20008 reserved (D-20008 added at copilot-check
resolution 2026-06-02 — engine-category classification for the new
`packages/game-engine/src/events/` directory; mirrors D-4001 template).*
