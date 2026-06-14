# EC-279 — Optional-KO-then-Reward Hero Effect Framework (Execution Checklist)

**Source:** docs/ai/work-packets/WP-248-optional-ko-reward-framework.md
**Layer:** Game Engine (`rules/heroKeywords.ts`, `rules/heroAbility.types.ts`,
`types.ts`, `setup/heroAbility.setup.ts`, `hero/heroEffects.execute.ts`,
`moves/optionalKoReward.resolve.ts` NEW + test NEW, `game.ts`,
`simulation/ai.legalMoves.ts` + test, `rules/heroAbility.setup.test.ts`,
`hero/heroEffects.execute.test.ts`) + card-data tooling
(`apply-hero-ability-markers.mjs`, `inputs/hero-ability-markers.json`,
`data/cards/core.json`)
**Paired:** WP-249 / EC-280 (UX) — **co-release locked**.

> Use locked values from WP-248 verbatim. EC-279 is the operational order +
> gates + failure smells; if EC-279 and WP-248 conflict on **design intent**,
> WP-248 wins.

## Execution Mode — STRICT EC BINDING (no-interpretation)
- **EC-279 binds execution correctness.** Every Locked Value, Guardrail, and
  After-Completing gate is mandatory and binary. Implement them exactly.
- **WP-248 binds design intent only** (the "why" / scope). On an *execution-detail*
  conflict the EC's locked value wins; on a *design-intent* question WP-248 wins.
- **Ambiguity → STOP, do not interpret.** If any locked value, file boundary, or
  contract is unclear or appears to conflict with the actual source (especially
  the WP-242 infra reuse sites), halt and ask — never guess, extend, optimize, or
  "improve". No inferred scope, no helpful additions.
- The PASS set is the union of `## Acceptance Criteria` in WP-248 (binary; ALL
  required) + this EC's After-Completing gates. Any single FALSE = failed execution.

## Before Starting
- [ ] **WP-242 landed** — `G.pendingKoHeroChoices?` FIFO (`types.ts`),
  `resolveKoHeroChoice` + `hasPendingKoHeroChoice` (`moves/koHeroChoice.resolve.ts`),
  registered `client:false` at `game.ts:304`, the board-freeze guard, the
  `getLegalMoves` short-circuit (`simulation/ai.legalMoves.ts`) using
  `selectDefaultKoTarget` (`villain/villainEffects.execute.ts`), lazy-init at
  point of use (`villainEffects.execute.ts:190`). **Confirm these sites live
  before extending them — STOP if shape differs.**
- [ ] **WP-022/215/023 landed** — `executeSingleEffect` switch + the
  `rescue`/`draw`/`attack`/`recruit` reward executors + `evaluateAllConditions`.
- [ ] Read WP-248 §Goal, §Non-Negotiable Constraints, §Acceptance Criteria.
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 (anchor count).

## Locked Values (verbatim from WP-248 — do not re-derive)
- **Keyword:** `'optional-ko-reward'` — ONE keyword for the whole "you may KO a
  card, then `<reward>`" family; appended to the `HeroKeyword` union AND
  `HERO_KEYWORDS` array, before `'conditional'`.
- **Descriptor:** `HeroEffectDescriptor` gains `rewardType?: HeroKeyword`; reward
  magnitude reuses the existing `magnitude` field.
- **Pending shape:** `PendingOptionalKoReward = { playerID: string; rewardType:
  HeroKeyword; rewardMagnitude: number; sourceCardId: CardExtId }`.
- **State field:** `G.pendingOptionalKoRewards?: PendingOptionalKoReward[] | undefined`
  (FIFO; **lazy-init at the park site**, mirroring `villainEffects.execute.ts:190` —
  NOT a setup-assembler change).
- **Move:** `resolveOptionalKoReward` (new `moves/optionalKoReward.resolve.ts`),
  args `{ decline: true }` OR `{ zone: 'hand' | 'discard', cardId: CardExtId }`;
  registered `client: false` next to `resolveKoHeroChoice`. Module also exports
  `hasPendingOptionalKoReward(G)` (mirrors `hasPendingKoHeroChoice`).
- **Reward dispatch:** on KO, grant the reward by reusing the existing executor
  (e.g. `executeSingleEffect(G, ctx, playerID, sourceCardId, { type: rewardType,
  magnitude: rewardMagnitude })`) — NO re-implementation. Seeded reward set:
  `rescue`, `draw`, `attack`, `recruit`. A `rewardType` outside that set is a
  skipped no-op.
- **Eligible set:** flat concat of `playerZones[pid].discard` then `.hand` — ANY
  card INCLUDING wounds (printed text is "a card", not "a Hero"); no type/cost/
  keyword filtering. 0 eligible (both empty) → skipped no-op + `G.messages` line.
- **Bot default:** `selectDefaultOptionalKoTarget(zones)` (new pure selector in
  `hero/heroEffects.execute.ts`) — tie-break ORDER is EXACT: (1) lowest
  `G.cardStats[id]?.cost ?? 0`; then (2) discard-zone before hand-zone; then (3)
  lowest array index in the chosen zone. No other tie-breakers. The bot ALWAYS
  returns `{ zone, cardId }` and NEVER `{ decline: true }`. Structurally analogous
  to `selectDefaultKoTarget` but its OWN policy (NOT a reuse — does not exclude
  wounds or prefer S.H.I.E.L.D. cards).
- **Marker token:** `[keyword:optional-ko-reward:<reward>:<n>]`, `<reward>` ∈ the
  seeded set, `<n>` ≥ 1. Dangerous Rescue:
  `core`/`black-widow`/`dangerous-rescue`/abilityIndex 0/`[keyword:optional-ko-reward:rescue:1]`.
- **Token regex addition (apply-script `VALID_TOKEN_PATTERN`, strict build gate):**
  `^\[keyword:optional-ko-reward:[a-z][a-z-]*:[1-9]\d*\]$`.
- **Engine-parser regex (`heroAbility.setup.ts`):**
  `\[keyword:optional-ko-reward:([a-z][a-z-]*):(\d+)\]` — `(\d+)`, matching the
  existing `COUNT_SCALED_PATTERN` (`attack-per-count`, `heroAbility.setup.ts:117`),
  NOT `[1-9]\d*`. The divergence is INTENTIONAL: the apply-script is the strict
  build gate; the parser captures the integer and the `n ≥ 1` check is enforced
  downstream (`isValidMagnitude`). Do NOT align the engine regex to `[1-9]\d*`.
- **Precedence (deterministic, defensive):** the block-all guards prevent two
  pending-choice queues from ever being non-empty at once; nonetheless the
  `getLegalMoves` short-circuit for `hasPendingOptionalKoReward` is inserted
  immediately BEFORE the existing `hasPendingKoHeroChoice` short-circuit
  (`simulation/ai.legalMoves.ts:115`) so order is fixed.
- **Timing:** `onPlay`.

## Guardrails

> **Inherit all WP-248 §Non-Negotiable Constraints verbatim** (full files,
> ESM/Node 22, no `Math.random`, moves never throw, no `.reduce()` in move/effect
> logic, 00.6). EC-279 lists only the execution-critical contracts + greps +
> failure detection.

- **Parameterized, not per-card (HARD).** Exactly ONE keyword; the reward
  variation lives in `rewardType` + the dispatch. No per-reward/per-card keyword.
- **Reuse the WP-242 infra (HARD).** Extend the existing pending-choice system —
  do NOT fork a parallel one. New field mirrors `pendingKoHeroChoices?`; new move
  mirrors `koHeroChoice.resolve.ts`; the board-freeze + turn-end guards are
  EXTENDED to exempt all three resolve moves (`resolveOptionalKoReward`,
  `resolveKoHeroChoice`, `resolveHeroChoice`); `getLegalMoves` gains the
  short-circuit.
- **Block-all completeness (HARD).** The WP-242 guard is DISTRIBUTED inline across
  SIX files — add `if (hasPendingOptionalKoReward(G)) return;` beside the existing
  `hasPendingKoHeroChoice(G)` check at EVERY one (verified live 2026-06-14):
  `coreMoves.impl.ts` (`drawCards` ~:58 / `playCard` ~:115 / `endTurn` ~:171),
  `game.ts` (`advanceStage` ~:86 + cleanup turn-end ~:91), `fightVillain.ts` (~:94),
  `fightMastermind.ts` (~:67), `recruitHero.ts` (~:75),
  `villainDeck/villainDeck.reveal.ts` (~:71). Additive checks only — do NOT
  refactor into a combined predicate. Missing ANY site = partial freeze →
  soft-lock / skipped reward.
- **Reward reuse (HARD).** The KO-then-reward path dispatches to the existing
  `rescue`/`draw`/`attack`/`recruit` executor — a grep MUST show no duplicated
  reward body in the resolve move.
- **Atomic (HARD — exact order).** Mirrors `koHeroChoice.resolve.ts`: (1) validate
  args (`{decline}` XOR `{zone,cardId}`); (2) validate FRONT entry (non-empty queue,
  `front.playerID === playerID`); (3) `{decline}` → front-pop only, NO KO/reward;
  (4) `{zone,cardId}` → card present in `playerZones[pid][zone]` NOW (recompute
  fresh) else no-op queue-intact; (5) remove from zone → `G.ko = koCard(...)`; (6)
  THEN dispatch reward via `executeSingleEffect(G, context, playerID,
  front.sourceCardId, { type: front.rewardType, magnitude: front.rewardMagnitude })`;
  (7) front-pop (`shift()`) LAST. Any failure before step 5 ABORTS the reward. No
  reward without KO; no KO (the `{zone,cardId}` path) without reward dispatch. The
  move destructures `context` (the `draw` reward needs `ctx.random`) — it is NOT a
  byte-copy of `koHeroChoice.resolve.ts` (which omits `ctx`).
- **Logging (HARD — match precedent, do not over-log).** 0-eligible skip logs a
  `G.messages` line (mirrors D-24017). The reward grant is logged by the dispatched
  executor (e.g. D-24017 `rescue`) — the resolve move adds NO duplicate. Park,
  decline, and invalid-resolve are SILENT (mirror WP-242 `koHeroChoice`, which
  parks/resolves with no `G.messages` line).
- **Optional + parked (HARD).** On play the effect PARKS a choice; it NEVER
  auto-KOs for a human. 0 eligible (hand ∪ discard empty) → skipped no-op + a
  `G.messages` line (mirrors D-24017).
- **Moves never throw; `G` JSON-serializable.** The pending queue holds strings +
  numbers only. Guard `playerZones`, missing/empty queue, invalid card/zone.
- **Deterministic.** Park + resolve pure over `G`; the bot default is a pure
  selector (no RNG); the only RNG is the existing draw-reward reshuffle, reached
  via the dispatched executor. Sentinel unchanged unless a fixture diverges
  (none plays Dangerous Rescue) — re-pin per WP-236 if it does.
- **Card data REGENERATED, not hand-edited.** Run the apply script; confirm ONLY
  the dangerous-rescue line in `core.json` changed.
- **Seed ONLY `rescue` reward + mark ONLY dangerous-rescue.** Other rewards
  (gain-shard / new-recruit need new executors) + the rest of the family =
  follow-up WPs.

## Required `// why:` Comments
- `heroKeywords.ts` — `// why: D-24019` on the new keyword.
- `heroAbility.types.ts` + `types.ts` — `// why: D-24019` on `rewardType` + the
  pending field/shape.
- `heroAbility.setup.ts` — `// why: D-24019` on the reward-token parse block.
- `heroEffects.execute.ts` — `// why:` parks an interactive choice (mirrors
  WP-242); the reward is granted on resolve, not at play.
- `optionalKoReward.resolve.ts` — `// why:` reward fires only on KO (atomic);
  front-pop FIFO; reuses the existing reward executor.
- `ai.legalMoves.ts` / selector — `// why:` deterministic default; decline is
  human-only.

## Files to Produce
- `packages/game-engine/src/rules/heroKeywords.ts` — **modified** — keyword.
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `rewardType?`.
- `packages/game-engine/src/types.ts` — **modified** — `PendingOptionalKoReward` + field.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — reward-token parse.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — MVP set + park case + `selectDefaultOptionalKoTarget`.
- `packages/game-engine/src/moves/optionalKoReward.resolve.ts` — **new** — move + `hasPendingOptionalKoReward`.
- `packages/game-engine/src/game.ts` — **modified** — registration + `advanceStage`/cleanup turn-end guard site.
- `packages/game-engine/src/moves/coreMoves.impl.ts` — **modified** — guard sites: `drawCards`, `playCard`, `endTurn`.
- `packages/game-engine/src/moves/fightVillain.ts` — **modified** — guard site.
- `packages/game-engine/src/moves/fightMastermind.ts` — **modified** — guard site.
- `packages/game-engine/src/moves/recruitHero.ts` — **modified** — guard site.
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` — **modified** — guard site (`revealVillainCard`).
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — **modified** — bot short-circuit.
- `packages/game-engine/src/moves/optionalKoReward.resolve.test.ts` — **new**.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified**.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — drift + parse.
- `packages/game-engine/src/simulation/ai.legalMoves.test.ts` — **modified** — bot default.
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified**.
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified**.
- `data/cards/core.json` — **modified** — regenerated dangerous-rescue line.
- `docs/ai/STATUS.md` — **modified**.
- `docs/ai/DECISIONS.md` — **modified** — D-24019 Reserved → Active.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-248 `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-279 Pending → Done.

**Total: 24 files** (20 engine/data + 4 governance), per WP-248 §Files Expected
to Change. **Pre-flight pin RESOLVED (2026-06-14 hardening pass):** the board-freeze
guard is NOT a single module — it is distributed inline across six move files
(`coreMoves.impl.ts`, `game.ts`, `fightVillain.ts`, `fightMastermind.ts`,
`recruitHero.ts`, `villainDeck/villainDeck.reveal.ts`), each taking the new
`hasPendingOptionalKoReward` check. Count is LOCKED at 24 — no flex.

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0; net-new
  drift (keyword) + parse + executor-park + resolve (decline / KO-hand / KO-discard
  / invalid / atomic) + bot-default cases; no regress.
- [ ] Drift grep: `grep -c "optional-ko-reward" .../heroKeywords.ts` = 2.
- [ ] **Reward-reuse grep (HARD).** `optionalKoReward.resolve.ts` contains no
  duplicated reward body — it calls the existing executor (grep shows the
  dispatch call, no inline `addResources`/`moveCardFromZone(...bystanders...)`).
- [ ] **Registry-boundary grep = 0** on `optionalKoReward.resolve.ts` +
  `hero/heroEffects.execute.ts` (no `@legendary-arena/registry`).
- [ ] **Apply-script single-hunk gate (HARD).** Re-run the apply script;
  `git diff --stat data/cards/core.json` = EXACTLY 1 file / 1 hunk affecting ONLY
  the `core/black-widow/dangerous-rescue` line. Any extra file/hunk/line = HARD FAIL.
- [ ] **Atomicity assertion (HARD).** A unit test proves: decline → no KO + no
  reward; KO → exactly one card leaves the named zone into `G.ko` AND the reward
  applied exactly once; invalid card/zone → no-op, move does not throw.
- [ ] **Block-all completeness assertion (HARD).** A test proves a pending
  `optional-ko-reward` is a no-op for EACH guarded move individually — `playCard`,
  `recruitHero`, `fightVillain`, `fightMastermind`, `revealVillainCard`,
  `advanceStage`, `drawCards`, `endTurn` — while the three resolve moves stay
  available, and `getLegalMoves` returns EXACTLY ONE deterministic
  `resolveOptionalKoReward` (never `{decline}`). One missed guard site = one
  failing assertion.
- [ ] `git diff --name-only` = exactly the 24 files (count locked; no pre-flight flex).
- [ ] STATUS updated; DECISIONS D-24019 Active byte-identical; WORK_INDEX WP-248
  `[x]`; EC_INDEX EC-279 → Done.

## Completion Output (MANDATORY — emit at session close)
1. **TEST** — engine `build` exit; `test` pass/fail (baseline → final); net-new
   case names (drift, parse, park/0-eligible, resolve decline/KO-hand/KO-discard/
   invalid/atomic, bot-default).
2. **DRIFT** — `optional-ko-reward` grep = 2; reward-reuse grep (no dup body);
   registry grep = 0.
3. **DIFF** — `git diff --name-only` (must equal the 24-file allowlist).
4. **APPLY-SCRIPT** — confirmation: 1 file, 1 hunk, dangerous-rescue line only.
5. **GOVERNANCE** — STATUS updated; D-24019 → Active; WORK_INDEX WP-248 → `[x]`;
   EC_INDEX EC-279 → Done; **WP-249 co-release status** (engine must not ship to a
   player-visible release without the UX twin).

## Commit Discipline (`.githooks/commit-msg` — enforced)
- Code path → prefix `EC-279:` (`SPEC:` rejected for code, D-20801; `INFRA:` is
  for non-EC code only — this is EC-scoped, use `EC-279:`). ≥ 12 chars after prefix.
- Governance close → `SPEC:` (two-commit topology: `EC-279:` impl + `SPEC:` close).
- Avoid forbidden subject words (`WIP`, `fix stuff`, `misc`, `tmp`, `updates`,
  `changes`, `debug`).

## Common Failure Smells
- A parallel pending-choice system instead of extending WP-242's → coexistence
  bugs + duplicated guards.
- The reward re-implemented inside the resolve move instead of dispatching to the
  existing executor → drift from the canonical rescue/draw/attack/recruit logic.
- Reward granted on decline, or without the KO actually removing a card → breaks
  atomicity.
- The board-freeze guard not extended → the player can end the turn with an
  unresolved choice (soft-lock or skipped reward).
- The block-all guard added to only SOME of the six sites (e.g. `game.ts` only,
  per the original file list) → partial freeze: the player plays cards / fights
  while a choice is pending. The per-move completeness assertion is what catches it.
- The engine parser regex "aligned" to `[1-9]\d*` → gratuitous divergence from the
  `COUNT_SCALED_PATTERN` (`attack-per-count`) precedent. Keep `(\d+)`; the strict
  gate is the apply-script's.
- The reward re-logged in the resolve move (duplicating the executor's D-24017
  log), or the park logged (WP-242 parks silently) → log drift.
- Keyword in union but not array (or vice versa) → drift test fails.
- `data/cards/core.json` hand-edited / apply run touches more than the
  dangerous-rescue line.
- Registry import in the resolve move or executor → layer-boundary HARD FAIL.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> The D-24019 entry lands in `docs/ai/DECISIONS.md` at draft time as `Reserved
> (proposed)` and flips to `Active` at execution close, byte-identical to the
> block below. Status is the only field that changes.

**D-24019: Optional-KO-then-Reward Hero Effect Framework — `optional-ko-reward` Keyword + Player-Choice Resolve Move**

Hero abilities of the form "You may KO a card from your hand or discard pile. If
you do, `<reward>`" are handled by a SINGLE parameterized mechanism, not a keyword
per card. A new closed-union hero keyword `optional-ko-reward` parks an
interactive choice when the hero card is played (`onPlay`): the active player
either declines (no KO, no reward) or KOs exactly one card from their hand or
discard pile, in which case a `<reward>` is granted. The reward is a value of the
existing closed `HeroKeyword` union carried on the `HeroEffectDescriptor`
(`rewardType?: HeroKeyword`, with the existing `magnitude` as the reward
magnitude); on KO it is dispatched to the ALREADY-BUILT reward executor
(`rescue`/`draw`/`attack`/`recruit`) rather than re-implemented. The choice reuses
the WP-242 interactive-choice infrastructure: a FIFO `G.pendingOptionalKoRewards`
(lazy-initialized at the park site, like `pendingKoHeroChoices`), a new
`resolveOptionalKoReward` move (`{decline}` or `{zone,cardId}`, front-pop,
`client:false`) plus a `hasPendingOptionalKoReward` predicate, the board-freeze +
turn-end guards extended to exempt all three resolve moves, and a `getLegalMoves`
short-circuit whose deterministic bot/sim default (`selectDefaultOptionalKoTarget`:
lowest-cost eligible card, discard-preferred) KOs and takes the reward (decline is
human-only). The reward fires ONLY on an actual KO (atomic). The marker token
grammar is `[keyword:optional-ko-reward:<reward>:<perUnit>]` (added to
`apply-hero-ability-markers.mjs`'s `VALID_TOKEN_PATTERN`); only
`core/black-widow/dangerous-rescue` (reward `rescue`) is marked in this packet.

**Extension recipe (the point of this decision):** a NEW "you may KO a card, then
X" card needs (1) IF X is a new reward: build the reward executor (its own WP) +
add it to the seeded reward set; (2) a data marker. Marking the whole ~15-card
family is a single follow-up **sweep** WP (the WP-225 pattern), never per-card
WPs. Deferred: the `gain-shard` / `gain-new-recruit` rewards (no executor yet),
multi-card / repeat KO, and KO from other zones. Determinism preserved (pure
park/resolve + a pure bot default; the only RNG is the existing draw-reward
reshuffle); re-pin the replay sentinel only if it diverges (no fixture plays
Dangerous Rescue). The player-facing choice surface (projection + prompt) ships
in the co-release-locked WP-249 / EC-280 (D-24020); this engine packet parks,
resolves, and bot-auto-resolves but renders no human prompt on its own.

**Packet:** WP-248 (EC-279). Co-release: WP-249 (EC-280).
**Drafted:** 2026-06-13 (reserved). **Landed:** TBD (execution close — flips to Active).
**Status:** Reserved (proposed)
