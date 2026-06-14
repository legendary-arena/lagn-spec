# WP-248 — Optional-KO-then-Reward Hero Effect Framework (`optional-ko-reward`)

> **Status:** DRAFT — pending review (do not execute until reviewed per
> `.claude/rules/work-packets.md` Review Gate).
> **Reserves:** D-24019.
> **Paired WP:** WP-249 (UX projection + client prompt) — **co-release locked**
> (the prompt cannot render without this engine packet; this engine packet has
> no player-facing choice surface without WP-249).
> **Paired EC:** EC-279.
> **Depends on:** WP-021, WP-022, WP-023, WP-215, WP-242 (all landed).

---

## Session Context

> WP-022 established the `executeHeroEffects` `onPlay` switch dispatch and the
> `attack`/`recruit`/`draw` reward executors; WP-215 added the `rescue`
> executor; WP-023 added conditional hero effects (`[hc:X]` self-exclusion
> evaluation via `evaluateAllConditions`); **WP-242** built the
> park→resolve→bot-auto-resolve pattern for an interactive KO-a-card choice
> (`G.pendingKoHeroChoices` FIFO, the `resolveKoHeroChoice` move, block-all +
> turn-end guards, deterministic bot auto-resolve via `getLegalMoves`
> short-circuit). This packet builds the **general** "you may KO a card, then
> get a reward" mechanism on top of all of them, reusing WP-242's choice infra.

---

## Goal

After this session, the hero-ability family **"You may KO a card from your
hand or discard pile. If you do, `<reward>`"** is executable through a SINGLE
general mechanism rather than a keyword per card. Concretely: a new
`optional-ko-reward` `HeroKeyword`; `HeroEffectDescriptor` gains
`rewardType?: HeroKeyword` (the reward granted **iff** the player KOs a card);
a new FIFO pending-choice queue `G.pendingOptionalKoRewards`; a new
`resolveOptionalKoReward` move (decline, or KO a named hand/discard card →
dispatch the reward to the existing reward executor); block-all + turn-end
guards while a choice is pending; and deterministic bot/sim auto-resolution.
The mechanism is **marked on only `core/black-widow/dangerous-rescue`**
(reward = `rescue`), fixing the reported bug (Dangerous Rescue does nothing
today — match `qxiY97A0m2J` diagnostic).

**Why general, not per-card.** The card corpus has **~15** lines of the form
`You may KO a card from your hand or discard pile. If you do, <reward>` across
10+ sets, where `<reward>` varies (`+attack`/`+recruit`, rescue, draw, gain a
Shard, gain a New Recruit). A keyword per reward-variant would multiply
keywords + WPs. Instead the family is one parameterized effect
(`optional-ko-reward` + a `rewardType` field), the reward dispatches to the
**already-built** `rescue`/`draw`/`attack`/`recruit` executors, each new card
is a data marker, and marking the corpus is a single follow-up **sweep** WP
(the WP-225 pattern).

---

## Assumes

> **Drafting baseline (01.0a Step 2):** drafted against `origin/main` after the
> WP-247 / EC-278 execution + D-24017 + the #312 mindmap backfill + #313
> hero-rescue logging. Supersession check (slug grep `--all`, WORK_INDEX/EC_INDEX
> scan, in-flight `claude/lagn-upload-extid-roundtrip` D-number check) returned
> no collision — no optional-KO-then-reward mechanism exists; the pattern appears
> only as `_deferred` notes (WP-218/224, which are *deck-reveal* optional-KOs, a
> different shape). D-24018 is reserved on the in-flight `#314` branch, so this
> packet reserves D-24019.

- **WP-022 complete.** `hero/heroEffects.execute.ts` exports
  `executeHeroEffects` + the private `executeSingleEffect(G, ctx, playerID,
  cardId, effect)` switch; the `attack`/`recruit`/`draw` reward cases exist and
  gate on `MVP_KEYWORDS` + `isValidMagnitude`.
- **WP-215 complete.** The `rescue` case exists (top-of-pile bystander → victory;
  empty-supply + success now log via D-24017).
- **WP-023 complete.** `evaluateAllConditions(G, playerID, conditions, cardId)`
  evaluates `[hc:X]` with self-exclusion. Dangerous Rescue's `[hc:covert]`
  condition is already parsed + evaluated.
- **WP-242 complete.** The interactive-choice infra exists:
  `G.pendingKoHeroChoices` FIFO, `resolveKoHeroChoice` (front-pop, `client:false`),
  block-all guard across action moves + `advanceStage`, dual turn-end guards,
  `getLegalMoves` short-circuit for bot auto-resolve, `selectDefaultKoTarget`.
  This packet **extends that pattern** (a second pending-choice type that
  coexists with `pendingKoHeroChoices` and `pendingHeroChoice`).
- `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` + §The Move
  Validation Contract + §Phase & Turn Transitions — the resolve move follows
  the validate-args → stage/pending gate → mutate-via-helpers → return-void
  contract; moves never throw.
- `packages/game-engine/src/moves/fightVillain.ts` + the WP-242 KO-hero choice
  files (`G.pendingKoHeroChoices`, `resolveKoHeroChoice`, the block-all guard,
  `selectDefaultKoTarget`, the `getLegalMoves` short-circuit) — the exact infra
  this packet mirrors. **Do not re-invent it — extend it.**
- `packages/game-engine/src/hero/heroEffects.execute.ts` — `executeSingleEffect`
  switch; the `rescue`/`draw`/`attack`/`recruit` cases the reward dispatches to.
- `packages/game-engine/src/types.ts` — `LegendaryGameState` (add the new
  `pendingOptionalKoRewards` field next to `pendingKoHeroChoices` /
  `pendingHeroChoice`); `PendingKoHeroChoice` is the shape precedent.
- `packages/game-engine/src/rules/heroKeywords.ts` — closed union + array.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — the marker-token
  parser; the new 3-segment reward token needs a parse block + descriptor build.
- `packages/game-engine/src/game.ts` — move registration + `getLegalMoves`.
- `scripts/convert-cards/apply-hero-ability-markers.mjs` +
  `inputs/hero-ability-markers.json` + `data/cards/core.json` — the marker.
- `docs/ai/DECISIONS.md` — D-22001/D-22003 (pendingHeroChoice reject-second),
  D-24006..D-24011 (WP-242 KO-hero choice) before reserving D-24019.
- `.claude/rules/code-style.md` + `00.6` + `.claude/skills/legendary-game-engine/SKILL.md`.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Full file contents for every new/modified file. Diffs/snippets forbidden.
- No `Math.random()`; **moves never throw** (only `Game.setup()` may); `G` stays
  JSON-serializable (the pending queue holds strings + numbers only — no
  functions/Maps/Sets).
- ESM only, Node v22+; `node:` prefix; test files `.test.ts`; no `.reduce()` in
  move/effect logic — use `for...of`.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — named-export
  imports, descriptive names, full-sentence errors, functions ≤ ~30 lines, no
  premature abstraction.
- Every `ctx.events.*` call (none expected here) needs a `// why:`; `// why:` on
  non-obvious decisions; full-sentence error/log messages.

**Packet-specific:**
- **Parameterized, not per-card.** Exactly ONE keyword `optional-ko-reward`; the
  reward variation lives entirely in `rewardType` + the reward dispatch. Never
  add a per-reward or per-card keyword.
- **Reward reuse (no duplication).** The KO-then-reward path MUST dispatch to the
  existing `rescue`/`draw`/`attack`/`recruit` executor logic (e.g., via
  `executeSingleEffect` with a synthesized `{ type: rewardType, magnitude }`
  descriptor), NOT a re-implementation. Seeded reward set: `rescue`, `draw`,
  `attack`, `recruit` (the already-built executors). `rewardType` values outside
  that set are a skipped no-op (defensive; the marker map only uses seeded ones).
- **Optional + player-choice (the whole point).** On play, the effect PARKS a
  choice; it never auto-KOs for a human. The player either declines (no KO, no
  reward) or KOs exactly one named hand/discard card (→ reward). Mirrors WP-242.
- **KO target = ANY card** in `playerZones[pid].hand` ∪ `playerZones[pid].discard`
  (the text says "a card", not "a Hero"). 0 eligible (both zones empty) → the
  effect is a skipped no-op with a `G.messages` line (mirrors D-24017).
- **FIFO queue + coexistence.** Use `G.pendingOptionalKoRewards?: PendingOptionalKoReward[]`
  (append on park, front-pop on resolve), mirroring `G.pendingKoHeroChoices?`. It
  coexists in the type with `pendingKoHeroChoices` + `pendingHeroChoice`, but the
  block-all guard (which freezes every action move while ANY choice is pending)
  means two pending-choice types can never actually be non-empty at the same time:
  you cannot play Dangerous Rescue while a KO-a-Hero choice is pending (`playCard`
  is frozen), and you cannot fight (which parks a KO-a-Hero choice) while an
  optional-KO-reward is pending (`fightVillain` is frozen). The block-all +
  turn-end guards must therefore be extended at EVERY existing guard site (see
  Scope G) to exempt ALL THREE resolve moves (`resolveOptionalKoReward`,
  `resolveKoHeroChoice`, `resolveHeroChoice`).
- **Pending-choice precedence (deterministic, defensive).** Because the guards
  prevent simultaneity, precedence is defensive only; nonetheless the order is
  FIXED so replay stays deterministic if state is ever constructed with more than
  one queue non-empty: `getLegalMoves` checks `hasPendingOptionalKoReward` FIRST
  (its short-circuit is inserted immediately before the existing
  `hasPendingKoHeroChoice` short-circuit at `simulation/ai.legalMoves.ts:115`),
  then the existing KO-hero short-circuit. Only the highest-priority non-empty
  queue may produce legal moves.
- **Reward fires only on KO (atomic).** Decline → no KO, no reward. KO → remove
  the card from its zone, add to `G.ko`, THEN dispatch the reward. The reward is
  never granted without the KO.
- **Deterministic bot/sim auto-resolve.** `getLegalMoves` short-circuits to
  `resolveOptionalKoReward` when a choice is pending; the default policy KOs the
  lowest-cost eligible card (discard-preferred over hand; ties broken
  deterministically by zone order then array index) and takes the reward — a pure
  selector `selectDefaultOptionalKoTarget`, no RNG. (Decline is a human-only
  option; the bot always takes the reward.)
- **Determinism preserved.** Parking + resolution are pure over `G`; the only RNG
  is the existing `draw` reward's reshuffle (`ctx.random.Shuffle`), reached via
  the dispatched executor — unchanged. Re-pin the sentinel/`PRE_WP080_HASH` ONLY
  if a fixture diverges (no fixture plays Dangerous Rescue).

**Locked Contract Values:**
- Keyword: `'optional-ko-reward'` (`HeroKeyword` union + `HERO_KEYWORDS` array,
  before `'conditional'`).
- Descriptor: `HeroEffectDescriptor.rewardType?: HeroKeyword`; reward magnitude
  reuses the existing `magnitude` field.
- Pending shape: `PendingOptionalKoReward = { playerID: string; rewardType:
  HeroKeyword; rewardMagnitude: number; sourceCardId: CardExtId }` (eligible
  cards are recomputed fresh from hand+discard at projection + validated at
  resolve — no snapshot, mirrors WP-242 "eligible recomputed fresh").
- State field: `G.pendingOptionalKoRewards?: PendingOptionalKoReward[] | undefined`
  (FIFO, optional `| undefined` to mirror `pendingKoHeroChoices?`; **lazily
  initialized at the park site** — `if (!G.pendingOptionalKoRewards)
  G.pendingOptionalKoRewards = []` — mirroring `villainEffects.execute.ts:190`,
  **NEVER initialized in `Game.setup`**. `hasPendingOptionalKoReward` treats both
  `undefined` and `[]` as "no pending choice", mirroring `hasPendingKoHeroChoice`).
- Eligible set (locked): the KO target is chosen from a flat concatenation of
  `playerZones[pid].discard` then `playerZones[pid].hand` — ANY card, INCLUDING
  wounds (the printed text says "a card", not "a Hero", so unlike WP-242's
  `selectDefaultKoTarget` this does NOT exclude wounds and does NOT prefer
  S.H.I.E.L.D. cards). No filtering by type, cost, or keyword at the eligibility
  stage. 0 eligible (both zones empty) → skipped no-op + a `G.messages` line.
- Deterministic bot tie-break (locked): `selectDefaultOptionalKoTarget` picks by
  (1) lowest `G.cardStats[id]?.cost ?? 0`; then (2) discard-zone before hand-zone;
  then (3) lowest array index within the chosen zone. No other tie-breakers. The
  bot ALWAYS returns a `{ zone, cardId }` (never `{ decline: true }`).
- Move: `resolveOptionalKoReward` (new `moves/optionalKoReward.resolve.ts`,
  mirroring `moves/koHeroChoice.resolve.ts`), args `{ decline: true }` OR
  `{ zone: 'hand' | 'discard', cardId: CardExtId }`; registered `client: false`
  in `game.ts` (next to `resolveKoHeroChoice` at game.ts:304). The module also
  exports a `hasPendingOptionalKoReward(G)` predicate (mirrors the exported
  `hasPendingKoHeroChoice`) that the board-freeze guard consumes.
- Bot default + getLegalMoves: `getLegalMoves` lives in
  `simulation/ai.legalMoves.ts` (NOT `game.ts`); the short-circuit returns EXACTLY
  ONE `resolveOptionalKoReward` with `selectDefaultOptionalKoTarget(...)`, a new
  pure selector in `hero/heroEffects.execute.ts` — structurally analogous to
  `selectDefaultKoTarget` (`villain/villainEffects.execute.ts`) but with its OWN
  policy per the tie-break lock above (NOT a reuse: it does not exclude wounds or
  prefer S.H.I.E.L.D. cards). Inserted immediately before the existing
  `hasPendingKoHeroChoice` short-circuit (precedence above).
- Marker token: `[keyword:optional-ko-reward:<reward>:<n>]`, `<reward>` ∈ the
  seeded reward set, `<n>` ≥ 1. Dangerous Rescue: `setAbbr: 'core'`,
  `heroSlug: 'black-widow'`, `cardSlug: 'dangerous-rescue'`, `abilityIndex: 0`,
  `markupToken: '[keyword:optional-ko-reward:rescue:1]'`.
- Token regex addition (apply-script `VALID_TOKEN_PATTERN`, the strict build-time
  gate): `^\[keyword:optional-ko-reward:[a-z][a-z-]*:[1-9]\d*\]$` (`[1-9]\d*`
  rejects `:0` and leading zeros at card-data build time).
- Engine-parser regex (`heroAbility.setup.ts`):
  `\[keyword:optional-ko-reward:([a-z][a-z-]*):(\d+)\]` uses `(\d+)` as the capture
  group, **matching the existing `COUNT_SCALED_PATTERN` (`attack-per-count`)
  precedent at `heroAbility.setup.ts:117` — NOT `[1-9]\d*`**. This divergence from
  the apply-script gate is INTENTIONAL and load-bearing: the strict `[1-9]\d*` gate
  is the apply-script's job (build time), the engine parser captures the integer,
  and the magnitude `n ≥ 1` check is enforced downstream (`isValidMagnitude` at the
  reward executor), exactly as `attack-per-count` does. Do NOT "align" the engine
  regex to `[1-9]\d*` — that would diverge from `COUNT_SCALED_PATTERN`.
- Timing: `onPlay` (the choice is parked at play; resolved before turn end).

**Session protocol:** if the WP-242 infra's actual shape (queue field name,
guard list, `getLegalMoves` short-circuit site) differs from what this WP
assumes, **stop and ask** — do not fork a parallel choice system.

---

## Scope (In)

### A) `rules/heroKeywords.ts` — modified
- Add `'optional-ko-reward'` to the union + array (before `'conditional'`),
  `// why: D-24019`.

### B) `rules/heroAbility.types.ts` — modified
- Add `rewardType?: HeroKeyword` to `HeroEffectDescriptor`, `// why: D-24019`.

### C) `types.ts` — modified
- Add `PendingOptionalKoReward` interface + `pendingOptionalKoRewards?:
  PendingOptionalKoReward[] | undefined` to `LegendaryGameState` (next to the
  WP-242 `pendingKoHeroChoices?`). **Lazily initialized** at the park site (not at
  setup) — mirrors WP-242's `villainEffects.execute.ts:190`
  `if (!G.pendingKoHeroChoices) G.pendingKoHeroChoices = []` pattern; the optional
  field tolerates older snapshots without it.

### D) `setup/heroAbility.setup.ts` — modified
- Add a reward-token regex `\[keyword:optional-ko-reward:([a-z][a-z-]*):(\d+)\]`
  (note `(\d+)`, matching the `COUNT_SCALED_PATTERN` precedent — the strict
  `[1-9]\d*` gate is the apply-script's job, NOT the engine parser's) + a parse
  block emitting `{ type: 'optional-ko-reward', rewardType, magnitude: n }` ONLY
  when `rewardType ∈` the seeded reward set AND `n ≥ 1` (`isValidMagnitude`); an
  unseeded reward or `n < 1` emits no descriptor (such a marker can never reach the
  pending queue). `// why: D-24019`.

### E) `hero/heroEffects.execute.ts` — modified
- Add `'optional-ko-reward'` to `MVP_KEYWORDS`; add the `case`:
  guard `playerZones`; compute eligible = `discard ∪ hand` (flat concat, ANY card
  incl. wounds — no filtering); 0 eligible → a `G.messages` log + no-op; else build
  the `PendingOptionalKoReward` ONLY when `rewardType ∈` the seeded set (defensive;
  the parser already filters, so an unseeded type here is a logged no-op), then
  **lazy-init** (`if (!G.pendingOptionalKoRewards) G.pendingOptionalKoRewards = []`)
  + append. The park itself is SILENT (no `G.messages` line), mirroring the WP-242
  park (`villainEffects.execute.ts` parks `pendingKoHeroChoices` with no log line).
  `// why:` parks an interactive choice (mirrors WP-242); the reward is granted on
  resolve, not here.
- Add the pure `selectDefaultOptionalKoTarget(zones)` selector — lowest `cost`,
  discard-before-hand, lowest array index (the tie-break lock); ALWAYS returns
  `{ zone, cardId }`, never declines — used by `getLegalMoves` for bot/sim
  auto-resolve. Structurally analogous to `selectDefaultKoTarget` but with its OWN
  policy (NOT a reuse; it does not exclude wounds or prefer S.H.I.E.L.D. cards).

### F) `moves/optionalKoReward.resolve.ts` — **new** (move impl) + registration in `game.ts`
- `resolveOptionalKoReward({ G, playerID, ...context }, args)` — the move
  destructures `context` because the reward dispatch needs `ctx` (the `draw`
  reward's `ctx.random.Shuffle`); `koHeroChoice.resolve.ts` omits `ctx`, so this
  move is NOT a byte-copy of it. Atomic sequence (HARD — exact order, mirrors
  `koHeroChoice.resolve.ts`):
  1. Validate args (`{ decline: true }` XOR `{ zone ∈ {hand,discard},
     cardId: string }`); invalid shape → silent no-op (queue intact).
  2. Validate the FRONT queue entry: queue non-empty, `front.playerID === playerID`.
  3. `{ decline: true }` → front-pop ONLY, NO KO, NO reward (silent).
  4. `{ zone, cardId }` → the card must be present in `playerZones[pid][zone]` NOW
     (recomputed fresh; no snapshot). Absent/stale → silent no-op, queue intact
     (resubmit; the block-all guard guarantees a target still exists).
  5. Remove the card from its zone → `G.ko = koCard(G.ko, cardId)`.
  6. THEN dispatch the reward by REUSING the existing executor:
     `executeSingleEffect(G, context, playerID, front.sourceCardId,
     { type: front.rewardType, magnitude: front.rewardMagnitude })` — no
     re-implementation. The reward's own success/empty logging (e.g. D-24017 for
     `rescue`) is the only reward log; the resolve move adds no duplicate.
  7. Front-pop (`queue.shift()`) LAST, mirroring WP-242.
  Any failure before step 5 ABORTS the reward (no KO ⇒ no reward; no reward without
  a KO). Move count N→N+1. `client: false`. Decline/invalid resolutions are silent.
  Also export `hasPendingOptionalKoReward(G)` (mirrors `hasPendingKoHeroChoice`).

### G) Block-all + turn-end guards (DISTRIBUTED — every existing guard site) + bot auto-resolve (`simulation/ai.legalMoves.ts`)
- **The WP-242 block-all guard is NOT a single guard — it is an inline
  `if (hasPendingKoHeroChoice(G)) return;` at the top of EVERY action move.** A new
  exported `hasPendingOptionalKoReward(G)` predicate (from
  `moves/optionalKoReward.resolve.ts`, mirroring `hasPendingKoHeroChoice`) must be
  added as an adjacent `if (hasPendingOptionalKoReward(G)) return;` check at EVERY
  one of these confirmed sites (verified live 2026-06-14):
  - `moves/coreMoves.impl.ts` — `drawCards` (~:58), `playCard` (~:115),
    `endTurn` (~:171).
  - `game.ts` — `advanceStage` (~:86), and the cleanup turn-end check (~:91, which
    currently also checks `pendingHeroChoice`).
  - `moves/fightVillain.ts` (~:94), `moves/fightMastermind.ts` (~:67),
    `moves/recruitHero.ts` (~:75), `villainDeck/villainDeck.reveal.ts` (~:71).
  Missing ANY site = the board is only partially frozen → soft-lock or a skipped
  reward (the exact "board-freeze guard not extended" failure smell). Keep the
  change ADDITIVE — add a second inline check beside the existing
  `hasPendingKoHeroChoice` call; do NOT refactor the existing calls into a combined
  predicate (out of scope), mirroring how `endTurn` already stacks
  `pendingHeroChoice` + `hasPendingKoHeroChoice` checks. The three resolve moves
  (`resolveOptionalKoReward`, `resolveKoHeroChoice`, `resolveHeroChoice`) are never
  guarded — they ARE the resolution.
- Extend `getLegalMoves` (`simulation/ai.legalMoves.ts`) with a
  `hasPendingOptionalKoReward` short-circuit that returns EXACTLY ONE
  `resolveOptionalKoReward` with `selectDefaultOptionalKoTarget(...)`, inserted
  immediately BEFORE the existing `hasPendingKoHeroChoice` short-circuit (~:115)
  per the precedence lock. `selectDefaultOptionalKoTarget` is the new pure selector
  in `hero/heroEffects.execute.ts` (its own policy; see Scope E).

### I) `scripts/convert-cards/apply-hero-ability-markers.mjs` — modified
- Add `^\[keyword:optional-ko-reward:[a-z][a-z-]*:[1-9]\d*\]$` to
  `VALID_TOKEN_PATTERN` + the `assertValidToken` message. `// why: D-24019`.

### J) `scripts/convert-cards/inputs/hero-ability-markers.json` — modified
- Add the `core` dangerous-rescue entry (locked marker values).

### K) `data/cards/core.json` — modified (regenerated)
- Run the apply script; ONLY the dangerous-rescue line gains the token.

### L) Tests
- `moves/optionalKoReward.resolve.test.ts` — **new**: decline (no KO/reward);
  KO-from-hand → reward; KO-from-discard → reward; invalid card/zone → no-op;
  front-pop ordering; atomicity (no reward without KO).
- `hero/heroEffects.execute.test.ts` — **modified**: play parks a choice when
  hand/discard non-empty; 0 eligible → no-op + log; reward dispatch grants the
  named reward on resolve.
- Drift test — `optional-ko-reward` in both union + array (extend the existing
  HERO_KEYWORDS drift test count).
- A `getLegalMoves`/bot test — pending choice short-circuits to the default
  (deterministic target) and the bot never declines.
- **Block-all coverage test (catches the distributed-guard gap).** With a pending
  `optional-ko-reward`, assert EACH guarded move is a no-op: `playCard`,
  `recruitHero`, `fightVillain`, `fightMastermind`, `revealVillainCard`,
  `advanceStage`, `drawCards`, `endTurn` — and that all three resolve moves stay
  available. One missed guard site = one failing assertion.

### M) Required `// why:` annotations
- keyword (`heroKeywords.ts`) — `// why: D-24019`.
- descriptor + state field — `// why: D-24019`.
- parser reward-token block — `// why: D-24019`.
- executor park case — `// why:` parks an interactive choice; reward on resolve.
- resolve move — `// why:` reward fires only on KO (atomic); front-pop FIFO.
- each block-all guard site (6 files) — `// why:` block-all guard (D-24019) —
  optional-KO-reward choice pending; board frozen until resolved (beside the
  existing D-24008 KO-hero check).
- bot default — `// why:` deterministic default; decline is human-only.

---

## Out of Scope

- **The rest of the ~15-card family.** ONLY `dangerous-rescue` is marked here;
  the corpus sweep is a follow-up **sweep** WP (the WP-225 pattern).
- **Not-yet-built rewards** (`gain a Shard`, `gain a New Recruit`) — those reward
  executors do not exist; their cards stay deferred until a reward-executor WP.
- **The UX** (projection, redaction, client prompt, page mount, turn-action
  gating) — that is the co-release-locked **WP-249** (this engine packet parks +
  resolves + bot-auto-resolves, but ships no human-facing prompt on its own).
- **Multi-card / repeat KO**, KO-from-other-zones (deck/inPlay), and conditional
  rewards beyond the seeded set — later WPs.
- **Any registry, server, preplan, or other-app change.**

---

## Files Expected to Change

- `packages/game-engine/src/rules/heroKeywords.ts` — **modified**.
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified**.
- `packages/game-engine/src/types.ts` — **modified**.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified**.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified**.
- `packages/game-engine/src/moves/optionalKoReward.resolve.ts` — **new** (move + `hasPendingOptionalKoReward` predicate).
- `packages/game-engine/src/game.ts` — **modified** (move registration + `advanceStage`/cleanup turn-end block-all guard site).
- `packages/game-engine/src/moves/coreMoves.impl.ts` — **modified** (block-all guard sites: `drawCards`, `playCard`, `endTurn`).
- `packages/game-engine/src/moves/fightVillain.ts` — **modified** (block-all guard site).
- `packages/game-engine/src/moves/fightMastermind.ts` — **modified** (block-all guard site).
- `packages/game-engine/src/moves/recruitHero.ts` — **modified** (block-all guard site).
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** (block-all guard site: `revealVillainCard`).
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — **modified** (bot short-circuit).
- `packages/game-engine/src/moves/optionalKoReward.resolve.test.ts` — **new**.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified**.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** (drift + parse).
- `packages/game-engine/src/simulation/ai.legalMoves.test.ts` — **modified** (bot default).
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified**.
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified**.
- `data/cards/core.json` — **modified** (regenerated).
- `docs/ai/DECISIONS.md` — **modified** — D-24019 Reserved → Active.
- `docs/ai/STATUS.md` — **modified**.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-248 `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-279 → Done.

**Total: 24 files** (20 engine/data + 4 governance: STATUS / DECISIONS /
WORK_INDEX / EC_INDEX). Over the lint §5 ~8 guideline — justified inline: a new
interactive-move subsystem (pending state + move + registration + bot path + their
tests) is irreducible end-to-end, AND the WP-242 block-all guard it must extend is
DISTRIBUTED inline across six move files (`coreMoves.impl.ts`, `game.ts`,
`fightVillain.ts`, `fightMastermind.ts`, `recruitHero.ts`,
`villainDeck/villainDeck.reveal.ts`) — each needs the new
`hasPendingOptionalKoReward` check, exactly mirroring how the existing
`hasPendingKoHeroChoice` guard is spread today. It reuses WP-242's infra rather
than duplicating it, and it is the LAST multi-file engine WP for this family
(subsequent cards are data markers). The distributed-guard footprint was confirmed
by live inspection during the 2026-06-14 hardening pass (the earlier "±1 / shared
helper" pin is RESOLVED: the guard is neither game.ts-only nor a shared module);
the count is LOCKED at 24 — no flex.

---

## Vision Alignment

**Vision clauses touched:** §1 (faithful card behavior), §2 (card data), §22
(determinism). **No conflict.** Makes a printed ability execute as written;
invents no card text; deterministic (pure park/resolve + a deterministic bot
default; the only RNG is the existing draw-reward reshuffle). Non-Goals NG-1..7:
none crossed.

## Funding Surface Gate

**N/A — justified.** No funding affordance, copy, or channel.

## API Catalog (§21)

**N/A — justified.** No HTTP endpoint or `apps/server/src/**` library function
added/modified/removed; the new move is an engine move (boardgame.io), not an
HTTP endpoint, and `getLegalMoves`/move registration are engine-internal.

---

## Acceptance Criteria

> **Binary — PASS requires ALL TRUE. Any single FALSE = failed execution
> (STOP, do not interpret).**

1. `HeroKeyword` union + `HERO_KEYWORDS` array each contain
   `'optional-ko-reward'` (same index; the ONLY optional-KO-reward keyword); the
   parity drift test passes.
2. `HeroEffectDescriptor` has `rewardType?: HeroKeyword`; `LegendaryGameState` has
   `pendingOptionalKoRewards?: PendingOptionalKoReward[] | undefined`, **lazily
   initialized at the park site (never in `Game.setup`)** — mirroring
   `pendingKoHeroChoices?`; `hasPendingOptionalKoReward` treats `undefined` and `[]`
   alike; `G` stays JSON-serializable.
3. Parsing the marked dangerous-rescue line yields exactly one effect
   `{ type: 'optional-ko-reward', rewardType: 'rescue', magnitude: 1 }` (+ the
   existing `[hc:covert]` condition/`conditional` keyword).
4. Playing the marked card with ≥1 card in hand/discard PARKS a
   `PendingOptionalKoReward` (no auto-KO); with 0 eligible it is a no-op + a
   `G.messages` line; the reward is NOT granted at play time.
5. `resolveOptionalKoReward({decline:true})` front-pops with no KO and no reward;
   `resolveOptionalKoReward({zone,cardId})` KOs that card (zone→`G.ko`) and grants
   the reward via the existing executor; an invalid card/zone is a no-op (move
   never throws); the reward never fires without the KO.
6. While `G.pendingOptionalKoRewards` is non-empty, EVERY action move (`playCard`,
   `recruitHero`, `fightVillain`, `fightMastermind`, `revealVillainCard`,
   `advanceStage`, `drawCards`) AND turn-end are blocked (board freeze), exempting
   `resolveOptionalKoReward`, `resolveKoHeroChoice`, `resolveHeroChoice`;
   `getLegalMoves` short-circuits to EXACTLY ONE `resolveOptionalKoReward` whose
   target is the deterministic `selectDefaultOptionalKoTarget` (lowest-cost,
   discard-before-hand, lowest index) — the bot KOs + takes the reward and NEVER
   emits `{ decline: true }`.
7. `apply-hero-ability-markers.mjs` `VALID_TOKEN_PATTERN` gains EXACTLY
   `^\[keyword:optional-ko-reward:[a-z][a-z-]*:[1-9]\d*\]$`; re-running it changes
   EXACTLY 1 file (`core.json`) in EXACTLY 1 hunk affecting ONLY the
   dangerous-rescue line.
8. `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 with the
   net-new cases; no pre-existing test regresses; sentinel unchanged (no fixture
   plays Dangerous Rescue) OR re-pinned per WP-236 discipline.
9. `git diff --name-only` lists exactly the 24 files in `## Files Expected to
   Change` (count LOCKED — the distributed-guard footprint is confirmed, no flex;
   EC-279 carries the same allowlist).

---

## Verification Steps

```bash
# Baseline (record the number; AC deltas are relative)
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; record pass count as BASELINE

# After engine + card-data changes:
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0

pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; pass count ≥ BASELINE + the net-new cases (drift, parse,
# executor-park / 0-eligible, resolve decline / KO-hand / KO-discard / invalid /
# atomic, bot-default, block-all completeness); no pre-existing test regresses

# Keyword drift: the union + the array each carry the keyword once (same index)
grep -c "optional-ko-reward" packages/game-engine/src/rules/heroKeywords.ts
# Expected: 2

# Reward reuse: the resolve move dispatches to the existing executor (no re-impl)
grep -c "executeSingleEffect" packages/game-engine/src/moves/optionalKoReward.resolve.ts
# Expected: ≥1 dispatch call; no inline rescue/draw/attack/recruit reward body

# Layer boundary: no registry import in the resolve move or the executor
grep -c "import .*@legendary-arena/registry" packages/game-engine/src/moves/optionalKoReward.resolve.ts packages/game-engine/src/hero/heroEffects.execute.ts
# Expected: 0 for each file

# Apply-script single-hunk gate (card data regenerated, never hand-edited)
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff --stat data/cards/core.json
# Expected: exactly 1 file, 1 hunk, affecting ONLY the
# core/black-widow/dangerous-rescue line

# Scope lock
git diff --name-only
# Expected: exactly the 24 files in §Files Expected to Change (count LOCKED)

pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria (1–9) pass.
- [ ] `build` + `test` exit 0; apply-script single-hunk; drift greps pass.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` D-24019 Reserved → Active (byte-identical to the
      EC-279 §Verbatim Block).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-248 checked off; `EC_INDEX.md`
      EC-279 → Done.
- [ ] Paired EC-279 satisfied; WP-249 (UX) co-released (not merged engine-only
      into a player-visible release without the prompt).
- [ ] No files outside `## Files Expected to Change` modified.

---

## Pre-Flight & Copilot Verdicts (01.0a Step 5)

Gate order (pre-flight → copilot → lint), against `origin/main` (post WP-247 /
D-24017 / #313). Per 01.0a Step 5's re-run rule, the 2026-06-13 runs were
**invalidated** by the 2026-06-14 hardening edits; the verdicts below are the
re-run against `HEAD`.

- **Pre-flight (01.4): READY TO EXECUTE** (2026-06-13; re-affirmed 2026-06-14).
  Class: Behavior / State Mutation + new interactive move. The WP-242 infra
  reuse points were verified **live against source**, every line number exact:
  the six distributed `hasPendingKoHeroChoice` guard sites (`coreMoves.impl.ts`
  :58/:115/:171, `game.ts:86`, `fightVillain.ts:94`, `fightMastermind.ts:67`,
  `recruitHero.ts:75`, `villainDeck/villainDeck.reveal.ts:71`), the
  `getLegalMoves` short-circuit (`simulation/ai.legalMoves.ts:115`), lazy-init
  (`villain/villainEffects.execute.ts:190`), `selectDefaultKoTarget`
  (`villainEffects.execute.ts:516`), registration (`game.ts:304`), the
  `hasPendingKoHeroChoice` export (`moves/koHeroChoice.resolve.ts:48`), and the
  `COUNT_SCALED_PATTERN` `(\d+)` precedent (`setup/heroAbility.setup.ts:117`).
  Deps WP-021/022/023/215/242 ✅. The board-freeze guard is confirmed distributed
  across six move files (not a single module); the file count is LOCKED at 24.
- **Copilot check (01.7): PASS** (2026-06-13; re-affirmed 2026-06-14). The three
  load-bearing risks are locked with HARD gates in EC-279: reward-reuse
  (dispatch, no re-impl), atomicity (reward only on KO), and three-choice
  coexistence (guards exempt all three resolve moves). No RISK/BLOCK.

---

## Lint Gate Self-Review

**Verdict: PASS** (re-run 2026-06-14; all applicable sections resolved). The
2026-06-13 self-review reported PASS but missed two structural gaps that the
2026-06-14 hardening edits should have caught — a missing `## Verification
Steps` section (§1) and a `## Non-Negotiable Constraints` block that cited
`00.6-code-style.md` only in §Context rather than in-block (§2) — plus a stale
"19 files" count carried in the WORK_INDEX / EC_INDEX rows after the WP body and
EC-279 were raised to "24 files". All three are fixed in this commit.

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Structure | PASS | Goal, Assumes, Context, Scope (In), Out of Scope, Files, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done all present and non-empty; Out of Scope lists 5 explicit exclusions |
| §2 | Constraints | PASS | Engine-wide + packet-specific + session protocol + locked contract values; forbids diffs/snippets; cites `00.6-code-style.md` in the Engine-wide block |
| §3 | Prerequisites | PASS | WP-021/022/023/215/242 with the exact infra shapes (queue field, predicate, six guard sites, selector) enumerated |
| §4 | Context | PASS | Specific items incl. ARCHITECTURE.md sections, DECISIONS ids (D-22001/D-24006..11), code-style + SKILL |
| §5 | Output Completeness | PASS | 24 files, each new/modified with a one-line change; single authoritative count; over-8 justified inline (distributed block-all guard) |
| §6 | Naming | PASS | `pendingOptionalKoRewards`, `PendingOptionalKoReward`, `resolveOptionalKoReward`, `hasPendingOptionalKoReward`, `selectDefaultOptionalKoTarget`, `rewardType`, `CardExtId` consistent |
| §7 | Dependencies | PASS | No new npm deps; reuses existing reward executors + zone helpers |
| §8 | Architectural Boundaries | PASS | Engine + simulation + card-data tooling only; `G` runtime-only; moves never throw; no registry import in resolver/executor; no `.reduce()` |
| §9 | Windows | N/A | Node built-ins; the apply script is a `node` invocation, no shell-specific paths |
| §10 | Env Vars | N/A | None touched |
| §11 | Auth | N/A | No auth surface |
| §12 | Test Quality | PASS | `node:test`, `.test.ts`, `makeMockCtx`; no boardgame.io/network/DB; determinism preserved (pure park/resolve + pure bot default) |
| §13 | Verification | PASS | Exact `pnpm` / `grep` / apply-script commands with expected output; baseline-relative deltas; single-hunk + scope-lock gates |
| §14 | Acceptance Criteria | PASS | 9 binary, observable, code-path-specific items |
| §15 | Definition of Done | PASS | STATUS / DECISIONS / WORK_INDEX / EC_INDEX + scope-boundary check |
| §16 | Code Style | PASS | `// why:` on keyword/descriptor/parser/park/resolve/guards/bot-default; named imports; no `.reduce()`; small functions |
| §17 | Vision Alignment | PASS (block present) | §1/§2/§22 cited; determinism-preservation line included; NG-1..7 none crossed |
| §18 | Prose-vs-Grep | PASS | The registry-boundary grep is import-scoped and targets two source files (`optionalKoReward.resolve.ts`, `heroEffects.execute.ts`), not markdown prose; no adjacent forbidden-token enumeration |
| §19 | Bridge-vs-HEAD | N/A | Not a repo-state-summarizing artifact |
| §20 | Funding Surface | N/A | Gameplay engine only; no funding copy or paid surface (§Funding Surface Gate) |
| §21 | API Catalog | N/A | `resolveOptionalKoReward` is a boardgame.io move, not an `apps/server` HTTP endpoint or `Library-only` function (§API Catalog) |
