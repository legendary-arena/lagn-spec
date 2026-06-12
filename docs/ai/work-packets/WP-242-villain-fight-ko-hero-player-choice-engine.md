# WP-242 — Villain Fight KO-Hero Player Choice: Engine (Park → Resolve, Bot Auto-Resolve)

**Status:** Draft
**Primary Layer:** Game Engine (+ Simulation)
**Dependencies:** WP-185 (villain ability executor + `koHeroCurrentPlayer`) ✅, WP-191 (ext_id grammar — hooks resolve end-to-end) ✅, WP-220 (`PendingHeroChoice` / `resolveHeroChoice` precedent) ✅, WP-236 (sim move-stream + sentinel-regen precedent) ✅
**Paired with:** WP-243 — Villain Fight KO-Hero Player Choice: UX (UIState projection + client prompt). **Co-release lock:** WP-242 must NOT be deployed to `play.legendary-arena.com` ahead of WP-243. Without the client prompt, a live human game whose Fight KO has ≥2 eligible heroes soft-locks (the board freezes on a choice the client cannot send). Bots and the sweep are unaffected (they auto-resolve in-engine). See §Out of Scope and §Risk Review.

---

## Session Context

> **Live bug on `play.legendary-arena.com`.** When a player defeats a villain
> whose Fight ability is "KO a Hero from your hand or discard pile", the engine
> resolves it **automatically** — `executeVillainAbilities(..., 'onFight')`
> dispatches the `koHeroCurrentPlayer` keyword to `koOneHeroForPlayer`, which
> auto-picks a deterministic target (a starting S.H.I.E.L.D. card, else the
> lexically-first hero, scanning discard → hand → inPlay). The player never
> chooses. The printed card grants the player the choice; the engine has
> always taken it. The auto-resolution `// why:` block in
> `villain/villainEffects.execute.ts` records this as a known deferral:
> *"The printed card grants player choice; interactive targeting is deferred
> to a future UI WP (WP-185 §Out of Scope)."* This WP closes that deferral for
> the **current-player** variant.
>
> The project already has a battle-tested player-choice mechanism from WP-220:
> a pending field in `G` + a `resolve*` move + dual turn-end guards. This WP
> mirrors that shape for the KO choice, with three differences the hero-reveal
> choice did not face: (1) the choice is a **selection among N eligible cards**,
> not a binary; (2) the same effect runs in the **simulation/autoplay bot**, so
> the bot must auto-resolve deterministically or every Fight-KO cell wedges;
> (3) the change moves a mutation out of `fightVillain` into a later move,
> which **shifts the bot's move stream** and therefore the sentinel replay.
>
> **Scope is current-player only** (operator decision 2026-06-12). The
> `koHeroEachPlayer` / `koHeroEachPlayerMag2` variants keep their auto-pick
> (non-active players choosing off-turn is a larger turn-flow change, out of
> scope). **Eligible zones are discard + hand + inPlay** (operator decision
> 2026-06-12) — the same union the current auto-resolver walks (D-20603),
> carried into the interactive set.

---

## Goal

After this packet:

- A `G.pendingKoHeroChoices?: PendingKoHeroChoice[]` FIFO queue exists on
  `LegendaryGameState`, typed and validated. Each entry records that the named
  player still owes one KO-a-Hero choice.
- The `koHeroCurrentPlayer` effect no longer auto-KOs when the player has a
  genuine choice. It computes the eligible target set across the current
  player's discard + hand + inPlay; if **0** eligible it is a silent no-op
  (unchanged), if exactly **1** eligible it auto-KOs that card (decision C —
  no decision to make), and if **≥2** eligible it appends a
  `PendingKoHeroChoice` and KOs nothing yet.
- A `resolveKoHeroChoice` move lands the player's selection: it validates the
  submitted `{ zone, cardId }` against the **current** zone contents, KOs the
  first matching occurrence, and pops the queue front.
- Turn-end is blocked while the queue is non-empty at **both** turn-end
  callsites (`endTurn` move + `advanceStage` at cleanup), mirroring WP-220.
- While the queue is non-empty, **every other action move is a silent no-op**
  (decision B — the board is frozen until the player resolves), except
  `resolveKoHeroChoice` and `resolveHeroChoice`.
- The simulation/autoplay bot auto-resolves: `getLegalMoves` short-circuits to
  a single `resolveKoHeroChoice` whose target is the **existing deterministic
  pick** (`selectKoHeroTarget` priority, discard → hand → inPlay), so the bot's
  KO target is byte-identical to today's auto-resolution.
- The `koHeroEachPlayer` / `koHeroEachPlayerMag2` variants are **unchanged**
  (still auto via `koOneHeroForPlayer`).

---

## Assumes

- WP-185 shipped: `koHeroCurrentPlayer` ∈ `VillainEffectKeyword` +
  `VILLAIN_EFFECT_KEYWORDS`; `koOneHeroForPlayer` + `selectKoHeroTarget` live in
  `villain/villainEffects.execute.ts`; `executeVillainAbilities` is the
  `onFight` / `onAmbush` / `onEscape` entry point.
- WP-191 shipped: villain ability hooks resolve against real zone-instance
  ext_ids end-to-end (`koHeroCurrentPlayer` actually fires in real games).
- WP-220 shipped: `G.pendingHeroChoice?: PendingHeroChoice`, the
  `resolveHeroChoice` move, and the dual turn-end guards
  (`coreMoves.impl.ts:endTurn()` top-of-body; `game.ts:advanceStage()` at
  cleanup) all exist as the pattern to mirror. `undefined` is the locked
  absent-value form for optional `G` fields; `null` is never used.
- WP-236 shipped: the play-phase `turn.onBegin` auto-draws; `getLegalMoves`
  no longer emits `drawCards`; the sentinel fixture
  (`sentinel-core-doom-2p`) + `PRE_WP080_HASH` were last regenerated by
  WP-236. This WP follows WP-236's sentinel-regeneration discipline if the
  replay diverges (it will if the sentinel's bot ever defeats a Fight-KO
  villain — see §Risk Review).
- `G.pendingKoHeroChoices` does NOT exist before this WP. It is created here as
  a new optional field (`PendingKoHeroChoice[] | undefined`); `undefined` and
  `[]` both mean "no pending choice" (the guards test `.length`).
- `moveCardFromZone(zone, [], cardId)` removes the first matching occurrence of
  `cardId` from `zone` and reports `found` (existing helper; used by
  `koOneHeroForPlayer` today).
- The current player's zones (`discard`, `hand`, `inPlay`) hold repeatable
  definition-level ext_ids (e.g. two `starting-shield-agent` entries). The
  choice key is therefore **(zone, cardId)**; two copies of the same ext_id in
  the same zone collapse to one option (KOing either is outcome-identical), and
  the move removes the first matching occurrence.
- `WOUND_EXT_ID`, `SHIELD_AGENT_EXT_ID`, `SHIELD_TROOPER_EXT_ID` are exported
  constants already imported by `villainEffects.execute.ts`.
- Baseline test counts are read at execution time from a clean `origin/main`
  (`pnpm --filter @legendary-arena/game-engine test`); this WP adds cases on
  top of that baseline (delta in §Verification Steps), it does not assert an
  absolute pre-count.
- The action moves to guard live in: `moves/coreMoves.impl.ts` (`drawCards`,
  `playCard`, `endTurn`), `moves/fightVillain.ts`, `moves/fightMastermind.ts`,
  `moves/recruitHero.ts`, `moves/villainDeck.reveal.ts` (`revealVillainCard`),
  and `game.ts` (`advanceStage`). `resolveHeroChoice` and the new
  `resolveKoHeroChoice` are NOT guarded (both must remain callable so a player
  who owes both a hero-reveal choice and a KO choice can clear each).

---

## Non-Negotiable Constraints

### Engine-wide
- Full file contents for every new or modified file — no diffs, no snippets.
- ESM only; Node v22+; `node:`-prefixed built-ins.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — named-export
  imports, descriptive names, full-sentence errors, functions ≤ ~30 lines.
- No `.reduce()` in zone operations or effect application; zone mutations go
  through `zoneOps.ts` helpers; no `boardgame.io` import in pure helpers
  (`villainEffects.execute.ts`, `ai.legalMoves.ts` stay framework-free).
- Moves never throw; only `Game.setup()` may throw. Every invalid state is a
  silent no-op.
- `// why:` comment required on: every new turn-end / block-all guard, every
  `ctx.random.*` use (none added here), and the determinism-load-bearing
  default-target selection.

### Packet-specific
- **Queue discipline (single-writer / single-popper).** `G.pendingKoHeroChoices`
  is `PendingKoHeroChoice[] | undefined`. Entries are **appended only** by the
  `koHeroCurrentPlayer` effect case and **removed only** (front-popped) by
  `resolveKoHeroChoice`. No other code path may reassign, `splice`, clear,
  reorder, or otherwise mutate the queue. It is **never set to `null`** —
  `undefined` (or `[]`) is the only absent form (WP-220 standard).
- **Terminology.** Contract language uses **"append"** (add an entry) and
  **"front-pop"** (remove the front entry); implementation uses `Array.push`
  (append) and `Array.shift` (front-pop). Do not mix "enqueue/dequeue" into the
  contract prose.
- **Fresh eligibility (no snapshot).** The pending entry stores **no
  eligible-card snapshot**. Eligibility MUST be derived from the **current `G`
  at the exact time** it is needed — the parker's count, `resolveKoHeroChoice`'s
  validation, and WP-243's projection each recompute it; none may read cached or
  historical state. This eliminates stale-target bugs across multi-KO queues.
- **Wound exclusion.** A "hero" for KO is any card `!== WOUND_EXT_ID`.
  Eligibility excludes `WOUND_EXT_ID` even when wounds sit in an otherwise-valid
  zone (D-18503 carries forward).
- **Resolve never auto-resolves (the ≥2→1 collapse rule).** Only the **parker**
  auto-resolves, and only the exactly-1-eligible case. `resolveKoHeroChoice`
  NEVER auto-resolves: if a multi-KO queue's earlier resolution reduces the
  eligible set to 1 before a later entry is resolved, that later entry STILL
  requires an explicit `resolveKoHeroChoice` call. No implicit KO occurs during
  the resolve phase.
- **Front-only resolution.** `resolveKoHeroChoice` always operates on the
  **front** entry (index 0). The payload carries no entry index, so a non-front
  entry can never be targeted. Resolving the front MUST NOT alter the identity
  or order of the remaining entries (beyond the zone mutation that may change
  their eligibility), and MUST NOT clear the whole queue.
- **Dual pending-choice coexistence (with WP-220).** `G.pendingHeroChoice`
  (WP-220) and `G.pendingKoHeroChoices` (this WP) may both be present at once.
  Each resolver operates **solely on its own state** and ignores the other;
  **either may be resolved first** (no ordering guarantee). Determinism holds
  because each resolver is pure over current `G`. The block-all guard exempts
  BOTH resolvers (`resolveKoHeroChoice` AND `resolveHeroChoice`) so neither
  system can wedge the other.
- `koHeroEachPlayer` and `koHeroEachPlayerMag2` cases are **byte-unchanged** —
  they keep calling `koOneHeroForPlayer`. Only the `koHeroCurrentPlayer` case
  changes. The shared `koOneHeroForPlayer` + `selectKoHeroTarget` resolvers are
  **kept** (each-player still uses them; the bot's default pick reuses
  `selectKoHeroTarget`).
- The bot's KO target MUST equal today's auto-resolution target in every case
  (the `selectKoHeroTarget` priority over discard → hand → inPlay). This is the
  replay-determinism invariant; a divergent target is a FAIL.

### Session protocol
- Stop and ask if any scope, contract, or determinism ambiguity arises. Do not
  invent a second pending-choice merge policy, a new stage, or a new keyword.

### Locked Contract Values (locked by EC-273)
- New field: `G.pendingKoHeroChoices?: PendingKoHeroChoice[]` (absent-value
  `undefined`; `.length === 0` ≡ no pending choice).
- `PendingKoHeroChoice = { choiceType: 'ko-hero'; playerID: string }` —
  `choiceType` discriminant string is exactly `'ko-hero'`.
- New move name: `'resolveKoHeroChoice'` (exact string). Registered
  `{ move: resolveKoHeroChoice, client: false }`.
- Move payload: `ResolveKoHeroChoiceArgs = { zone: 'discard' | 'hand' | 'inPlay'; cardId: CardExtId }`.
- Auto-resolve threshold: eligible count `0` → no-op; `1` → auto-KO; `≥2` →
  append (decision C).
- Eligible zones (in priority order for the bot default pick): `discard`,
  `hand`, `inPlay` (decision: carry D-20603 union into the interactive set).
- A "hero" for KO purposes is any card that is **not** `WOUND_EXT_ID`
  (wounds are never eligible — D-18503 carries forward).
- `game.ts` registered-move count after this WP: **10** (was 9).
- `SIMULATION_MOVE_NAMES` after this WP includes `'resolveKoHeroChoice'`.

---

## Context (Read First)

1. `packages/game-engine/src/villain/villainEffects.execute.ts` — the
   `koHeroCurrentPlayer` case (line ~164), `koHeroEachPlayer` /
   `koHeroEachPlayerMag2` cases (keep unchanged), `koOneHeroForPlayer` (line
   ~346), `selectKoHeroTarget` (line ~417), and the auto-resolution `// why:`
   block (line ~328) this WP supersedes for the current-player case.
2. `packages/game-engine/src/moves/heroChoice.resolve.ts` — the WP-220 resolve
   move this one mirrors (validate args → validate pending → clear/pop →
   mutate; silent no-ops; moves never throw).
3. `packages/game-engine/src/types.ts` — `LegendaryGameState`, the
   `PendingHeroChoice` interface + `pendingHeroChoice?` field (the
   optional-field convention to copy), `CardExtId`.
4. `packages/game-engine/src/moves/coreMoves.impl.ts` — `endTurn()` turn-end
   guard (top-of-body, before the zone sweep); `drawCards` / `playCard` move
   bodies (where the block-all guard goes, after the stage gate).
5. `packages/game-engine/src/game.ts` — the `moves:` registration map; the
   `advanceStage()` cleanup turn-end guard; `MoveContext` alias.
6. `packages/game-engine/src/moves/fightVillain.ts` — the `onFight` fire site
   (`executeVillainAbilities(..., 'onFight')`, line ~116) that triggers the
   parker; block-all guard goes at the top of the move body.
7. `packages/game-engine/src/moves/fightMastermind.ts`,
   `packages/game-engine/src/moves/recruitHero.ts`,
   `packages/game-engine/src/moves/villainDeck.reveal.ts` — the other action
   moves that take the block-all guard.
8. `packages/game-engine/src/simulation/ai.legalMoves.ts` — `getLegalMoves`,
   `SIMULATION_MOVE_NAMES`, the RS-13 enumeration-order lock, and the
   fail-closed short-circuit pattern (empty zones) the pending-choice
   short-circuit mirrors.
9. `packages/game-engine/src/game.test.ts` — the move-list drift assertion
   (currently 9 moves, line ~110) that becomes 10.
10. `packages/game-engine/src/setup/henchmanFightKo.repro.test.ts` — the tests
    that currently pin the auto-resolution; they flip to assert park / auto-1 /
    resolve behavior.
11. `docs/ai/DECISIONS.md` — D-18503, D-20602, D-20603 (auto-resolve target
    priority — carried into the bot default pick), D-22001..D-22003 (the WP-220
    pending-choice pattern), D-23601/D-23604 (WP-236 sentinel-regen precedent).
12. `docs/ai/ARCHITECTURE.md` §Layer Boundary, §The Move Validation Contract,
    §The Rule Execution Pipeline — `G` runtime-only, moves never throw, no
    `.reduce()` in effect application.
13. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code constraints.
14. `docs/ai/01-VISION.md` §22 (Deterministic Eval) — the bot move-stream /
    sentinel-replay determinism this WP must preserve.

---

## Scope (In)

### 1. New field + type (`types.ts`)

- Add the interface (locked home in `types.ts`; do not create a new file):
  ```typescript
  export interface PendingKoHeroChoice {
    /** Discriminant for future extensibility (mirrors PendingHeroChoice). */
    choiceType: 'ko-hero';
    /** Only this player's resolveKoHeroChoice call is accepted. */
    playerID: string;
  }
  ```
- Add the optional queue field to `LegendaryGameState`:
  ```typescript
  pendingKoHeroChoices?: PendingKoHeroChoice[];
  ```
  Optional so existing full-`G` literals in tests need no update.

### 2. Parker (`villain/villainEffects.execute.ts`)

- Add a pure `buildKoEligibleTargets(zones)` helper returning the deduped
  eligible options `{ zone: 'discard' | 'hand' | 'inPlay'; cardId: CardExtId }[]`
  — every non-`WOUND_EXT_ID` card across the three zones, deduped by
  `(zone, cardId)` (a `Set` of `` `${zone}:${cardId}` `` keys; `for...of`, no
  `.reduce()`).
- Add a pure `selectDefaultKoTarget(zones)` helper returning the single
  `{ zone, cardId } | null` that today's auto-resolution would pick: run
  `selectKoHeroTarget(zones.discard)`, then `(zones.hand)`, then
  `(zones.inPlay)`, returning the first non-null with its zone. This is the
  **bot default pick** and the **auto-1 pick**, and it is the determinism
  anchor (reuses the unchanged `selectKoHeroTarget`).
- Rewrite ONLY the `koHeroCurrentPlayer` case:
  ```typescript
  case 'koHeroCurrentPlayer': {
    // why: interactive KO for the current player (supersedes the WP-185
    // auto-resolution deferral, D-24006). 0 eligible → no-op; exactly 1 →
    // auto-KO (no decision to make, D-24007 decision C); ≥2 → append a
    // pending choice and KO nothing yet (the player picks via
    // resolveKoHeroChoice). Each-player variants below are unchanged.
    const zones = G.playerZones[currentPlayer];
    if (!zones) return true;
    const eligible = buildKoEligibleTargets(zones);
    if (eligible.length === 0) return true;
    if (eligible.length === 1) {
      koSingleTarget(G, zones, eligible[0]!);
      return true;
    }
    if (!G.pendingKoHeroChoices) G.pendingKoHeroChoices = [];
    G.pendingKoHeroChoices.push({ choiceType: 'ko-hero', playerID: currentPlayer });
    return true;
  }
  ```
  `koSingleTarget(G, zones, target)` is a tiny shared mutator: `moveCardFromZone`
  the `cardId` out of the named `zone`, then `G.ko = koCard(G.ko, cardId)` on
  `found` — the same two-line mutation `resolveKoHeroChoice` performs (one copy
  here, one in the move; a third appearance would justify extracting it, not
  before — §16.1).
- `koHeroEachPlayer` / `koHeroEachPlayerMag2` / all other cases: **unchanged**.

### 3. New move (`moves/koHeroChoice.resolve.ts` — new file)

- `resolveKoHeroChoice({ G, playerID }: MoveContext, args: ResolveKoHeroChoiceArgs): void`
  (boardgame.io `(context, args)` shape — same as `resolveHeroChoice`).
- Local `MoveContext` + exported `ResolveKoHeroChoiceArgs` (house style — each
  move file declares its own alias).
- Logic (validate → validate pending → mutate → pop):
  1. Validate `args.zone` ∈ `{ 'discard', 'hand', 'inPlay' }` and `args.cardId`
     is a non-empty string and `!== WOUND_EXT_ID` — else no-op.
  2. Queue empty → no-op. `front = G.pendingKoHeroChoices[0]`;
     `front.playerID !== playerID` → no-op; `front.choiceType !== 'ko-hero'` →
     no-op.
  3. Resolve against **current** `G`: the chosen `cardId` must be present in
     `G.playerZones[playerID][args.zone]`. `moveCardFromZone(zone, [], cardId)`;
     on `found`, write back the shortened zone and `G.ko = koCard(G.ko, cardId)`.
  4. Pop the front entry **only on `found`** (an invalid/stale target is a
     no-op that leaves the queue intact so the player resubmits — the
     board-freeze guard guarantees a valid target still exists).
- Export `hasPendingKoHeroChoice(G): boolean` (`(G.pendingKoHeroChoices?.length ?? 0) > 0`)
  from this file — the single predicate the turn-end and block-all guards
  import (justified at 7 call sites, §16.1).

### 4. Move registration + guards

- `game.ts`: import + register `resolveKoHeroChoice: { move: resolveKoHeroChoice, client: false }`;
  extend `advanceStage()` cleanup guard to also return when
  `hasPendingKoHeroChoice(G)`; add the block-all guard to `advanceStage()`
  (return when `hasPendingKoHeroChoice(G)` regardless of stage).
- `coreMoves.impl.ts`: extend `endTurn()` top-of-body guard to also return when
  `hasPendingKoHeroChoice(G)` (before the zone sweep); add the block-all guard
  (after the stage gate, before mutation) to `drawCards` and `playCard`.
- `fightVillain.ts`, `fightMastermind.ts`, `recruitHero.ts`,
  `villainDeck.reveal.ts`: add the block-all guard to each move body, each with
  a `// why:` citing D-24008.

**Block-all guard contract (identical at every site — no implementer
discretion):** the guard MUST run **immediately after** the move's
stage-validation logic (where one exists) and **before any other read or write
of `G` or zones**, and MUST `return` with **no side effects**. Concretely:
`if (hasPendingKoHeroChoice(G)) { return; }` placed after the stage gate and
before the first zone/economy access. This ordering is load-bearing — a guard
placed after a zone read or mutation would leak partial state while a choice is
pending.

### 5. Simulation / autoplay auto-resolve (`ai.legalMoves.ts`)

- Add `'resolveKoHeroChoice'` to `SIMULATION_MOVE_NAMES`.
- At the **top** of `getLegalMoves` (after the zones-undefined fail-closed,
  before the stage-keyed enumeration): if `hasPendingKoHeroChoice(gameState)`
  for the active player, return a single-element list
  `[{ name: 'resolveKoHeroChoice', args: selectDefaultKoTarget(zones) }]`. The
  returned list MUST have **length exactly 1** — no other move may be appended
  or merged while a KO choice is pending (mirrors the engine block-all so the
  bot resolves before any other move). `selectDefaultKoTarget` is non-null here
  (a choice is only appended when ≥2 eligible exist and the board is frozen).
  `// why:` the bot KO target equals today's auto-resolution (D-24009) — replay
  determinism.

### 6. Tests

- `moves/koHeroChoice.resolve.test.ts` (new): ≥12 cases —
  - resolve KOs the chosen card from each of discard / hand / inPlay; front-pops.
  - **Front-only integrity:** with a 2-entry queue, one resolve removes exactly
    the front entry and leaves the remaining entry's identity + position intact;
    a resolve never clears the whole queue.
  - **Repeated invalid resolves (spam):** N successive invalid resolves (empty
    queue / wrong player / wrong choiceType / invalid zone / wound cardId /
    card-not-in-zone) each leave the queue byte-identical — no pop, no mutation.
  - **Queue unchanged after non-resolver moves:** after any guarded action move
    runs while a choice is pending, `G.pendingKoHeroChoices` is byte-identical.
  - **No mutation in guarded move:** a guarded move (`playCard` / `fightVillain`)
    invoked while pending mutates **no** `G` zone or economy field.
  - `hasPendingKoHeroChoice` true/false.
- `villain/villainEffects.execute.test.ts` (or `henchmanFightKo.repro.test.ts`,
  modified): ≥7 cases — 0 eligible → no-op + no append; 1 eligible → auto-KO +
  no append; ≥2 eligible → append + KO nothing; each-player variants unchanged
  (still auto); multi-KO-in-one-move appends N entries; **eligible-collapse:** a
  2-entry queue whose first resolution drops the eligible set to 1 still leaves
  the second entry present (resolve never auto-resolves the collapse).
- **Parity test** (`villain/villainEffects.execute.test.ts` or the repro test):
  on two identical-zone copies of `G`, (a) run the legacy `koOneHeroForPlayer`
  in isolation and capture the removed `cardId`; (b) run the new flow —
  `selectDefaultKoTarget` then `resolveKoHeroChoice` with its result — and
  capture the KO'd `cardId`. The two `cardId`s MUST be identical (the
  byte-for-byte bot-determinism anchor).
- **Dual-pending coexistence** (`moves/koHeroChoice.resolve.test.ts`): with both
  `pendingHeroChoice` and a `pendingKoHeroChoices` entry set, resolving either
  first yields a valid state; each resolver clears only its own state and leaves
  the other intact; turn-end stays blocked until both are clear.
- `simulation/ai.legalMoves.test.ts` (new or modified): with a pending KO,
  `getLegalMoves` returns a list of **length exactly 1** whose single entry is
  `resolveKoHeroChoice` with target = `selectKoHeroTarget`'s pick; with no
  pending KO, enumeration is unchanged.
- `game.test.ts` (modified): move-list assertion 9 → 10 (adds
  `resolveKoHeroChoice`).
- Turn-end + block-all guard tests (in `koHeroChoice.resolve.test.ts`):
  `endTurn` / `advanceStage` / `playCard` / `fightVillain` / `recruitHero` /
  `fightMastermind` / `revealVillainCard` are no-ops while the queue is
  non-empty; `resolveKoHeroChoice` and `resolveHeroChoice` are NOT blocked.

### 7. Sentinel replay (conditional — WP-236 discipline)

- Run the determinism/sentinel suite. If `sentinel-core-doom-2p` and/or
  `PRE_WP080_HASH` diverge because the bot now defeats a Fight-KO villain and
  resolves it one move later, **regenerate the fixture and re-pin the hash**
  per the WP-236 pattern, gated by a coherent-game sanity check (winner
  unchanged in kind; terminal counters unchanged in kind;
  `snapshotPerTurn.length` unchanged). If the suite does NOT diverge (the
  sentinel never defeats a Fight-KO villain), make **no** fixture change and
  record that in §Verification output. The executor resolves which path
  applies by running the test; both are accounted for in the allowlist.
- **Binary rule (no narrative judgment):** if the replay diverges, re-pinning
  MUST occur **and** the coherent-game gate MUST pass. If the coherent-game gate
  **fails**, **STOP** — do **not** re-pin. A failing gate means the divergence
  is a real behavioral regression (wrong winner, changed terminal counters,
  changed turn count), not the expected one-move KO deferral, and the WP is not
  done until the regression is found and fixed.

---

## Out of Scope

- **`koHeroEachPlayer` / `koHeroEachPlayerMag2`** — stay auto-resolved
  (operator decision). Making non-active players choose off-turn is a separate
  turn-flow WP.
- **UIState projection + client prompt** — that is WP-243 (paired). This WP
  adds the engine pending state and bot auto-resolve only; it does NOT touch
  `packages/game-engine/src/ui/**` or `apps/arena-client/**`. (Because this WP
  adds no UIState field, the recurring arena-client fixture-backfill tax does
  not apply here — it lands with WP-243.)
- **Other choice-bearing villain effects** (capture-target choice, etc.) —
  deferred until this pattern proves stable.
- **A second pending-choice merge across systems** — `pendingHeroChoice`
  (WP-220) and `pendingKoHeroChoices` (this WP) are independent; each resolver
  ignores the other's state. No unified queue.
- **Disconnect / reconnect while a KO choice is pending** — separate hardening
  WP (mirrors WP-222's deferral).
- **Any new keyword, stage, or effect type** — the `koHeroCurrentPlayer`
  keyword is unchanged; only its resolution path changes.
- Any engine change beyond the files in §Files Expected to Change.

---

## Files Expected to Change

**Engine (modified):**
1. `packages/game-engine/src/types.ts` — `PendingKoHeroChoice` interface + `pendingKoHeroChoices?` field
2. `packages/game-engine/src/villain/villainEffects.execute.ts` — rewrite `koHeroCurrentPlayer` case; add `buildKoEligibleTargets`, `selectDefaultKoTarget`, `koSingleTarget`; each-player cases + `koOneHeroForPlayer` + `selectKoHeroTarget` unchanged
3. `packages/game-engine/src/game.ts` — register `resolveKoHeroChoice`; extend `advanceStage` turn-end guard + add block-all guard
4. `packages/game-engine/src/moves/coreMoves.impl.ts` — extend `endTurn` turn-end guard; add block-all guard to `drawCards` + `playCard`
5. `packages/game-engine/src/moves/fightVillain.ts` — block-all guard
6. `packages/game-engine/src/moves/fightMastermind.ts` — block-all guard
7. `packages/game-engine/src/moves/recruitHero.ts` — block-all guard
8. `packages/game-engine/src/moves/villainDeck.reveal.ts` — block-all guard
9. `packages/game-engine/src/simulation/ai.legalMoves.ts` — `SIMULATION_MOVE_NAMES` + pending-choice short-circuit (bot auto-resolve)

**Engine (new):**
10. `packages/game-engine/src/moves/koHeroChoice.resolve.ts` — `resolveKoHeroChoice` move + `ResolveKoHeroChoiceArgs` + `hasPendingKoHeroChoice` predicate

**Engine tests (new or modified):**
11. `packages/game-engine/src/moves/koHeroChoice.resolve.test.ts` — new; resolve + turn-end + block-all guard cases
12. `packages/game-engine/src/villain/villainEffects.execute.test.ts` — modified; parker park / auto-1 / no-op cases (or the repro test in #13)
13. `packages/game-engine/src/setup/henchmanFightKo.repro.test.ts` — modified; flips auto-resolution assertions to park/auto-1/resolve
14. `packages/game-engine/src/simulation/ai.legalMoves.test.ts` — new or modified; pending-choice short-circuit + unchanged-when-absent
15. `packages/game-engine/src/game.test.ts` — modified; move-list 9 → 10

**Engine fixtures (conditional — only if the replay diverges, §Scope 7):**
16. sentinel fixture + `PRE_WP080_HASH` re-pin (the WP-236 fixture/hash files) — **modified only if** the determinism suite diverges; otherwise untouched

**Governance:**
17. `docs/ai/DECISIONS.md` — D-24006..D-24009
18. `docs/ai/STATUS.md` — WP-242 executed
19. `docs/ai/work-packets/WORK_INDEX.md` — WP-242 entry checked off
20. `docs/ai/execution-checklists/EC_INDEX.md` — EC-273 Draft → Done

Up to 20 files (15 code/test + ≤1 conditional fixture set + 4 governance).
Exceeds the lint §5 ~8-file guideline — **operator-authorised** (the block-all
guard is intentionally wide, one line per action move; precedent WP-220 = 16,
WP-236 = 21). Each guard edit is a single import + single early-return.

---

## Contract

### New field `G.pendingKoHeroChoices` (D-24007)

| Field | Type | Semantics |
|---|---|---|
| `G.pendingKoHeroChoices` | `PendingKoHeroChoice[] \| undefined` | FIFO queue of owed KO-a-Hero choices. Appended by the `koHeroCurrentPlayer` effect (one entry per ≥2-eligible firing); front-popped by `resolveKoHeroChoice`. `undefined` or `[]` ≡ no pending choice. No eligible-card snapshot stored — eligibility is always recomputed from current `G`. |

`PendingKoHeroChoice = { choiceType: 'ko-hero'; playerID: string }`.

### New move `resolveKoHeroChoice` (D-24008)

Signature: `resolveKoHeroChoice({ G, playerID }: MoveContext, args: ResolveKoHeroChoiceArgs): void`.

| Payload field | Type | Semantics |
|---|---|---|
| `args.zone` | `'discard' \| 'hand' \| 'inPlay'` | Which of the player's zones to KO from. |
| `args.cardId` | `CardExtId` | The ext_id to KO (first matching occurrence in `zone`). |

**No-ops (silent):** invalid `zone`; `cardId` empty or `=== WOUND_EXT_ID`;
empty queue; `front.playerID !== playerID`; `front.choiceType !== 'ko-hero'`;
`cardId` not present in `G.playerZones[playerID][zone]` (queue intact — resubmit).
**On success:** first matching `cardId` moves `zone → G.ko`; the front entry is
popped.

### Guards (D-24008)

- **Turn-end** (both callsites, mirrors WP-220): `endTurn()` and
  `advanceStage()` at cleanup return silently while `hasPendingKoHeroChoice(G)`.
- **Block-all** (decision B): every action move (`drawCards`, `playCard`,
  `recruitHero`, `fightVillain`, `fightMastermind`, `revealVillainCard`,
  `advanceStage`) returns silently while `hasPendingKoHeroChoice(G)`. Exempt:
  `resolveKoHeroChoice`, `resolveHeroChoice`.

### Bot auto-resolve (D-24009)

`getLegalMoves` returns exactly `[{ name: 'resolveKoHeroChoice', args: selectDefaultKoTarget(zones) }]`
while a KO choice is pending. `selectDefaultKoTarget` reuses the unchanged
`selectKoHeroTarget` priority (discard → hand → inPlay; starter-S.H.I.E.L.D.
first; ext_id lexical tie-break), so the bot's KO target is **byte-identical**
to today's auto-resolution. The only observable change to the bot stream is
that the KO lands one move later (a `resolveKoHeroChoice` move), which may
re-pin the sentinel replay (§Scope 7).

### Queue & coexistence invariants (D-24007 / D-24008)

| Invariant | Rule |
|---|---|
| Single-writer / single-popper | Only `koHeroCurrentPlayer` appends; only `resolveKoHeroChoice` front-pops. No other code path mutates the queue. Never `null`. |
| Front-only resolution | `resolveKoHeroChoice` always targets the **front** entry (no entry index in the payload). Resolving the front never alters the identity or order of remaining entries (beyond zone-mutation eligibility effects) and never clears the whole queue. |
| Fresh eligibility | Eligibility is recomputed from current `G` at every use; no snapshot, no cached/historical state. |
| Resolve never auto-resolves | Only the parker auto-resolves (exactly-1-eligible case). If a later queue entry's eligible set collapses to 1, that entry still requires an explicit `resolveKoHeroChoice`. |
| Dual pending-choice coexistence | `pendingHeroChoice` (WP-220) and `pendingKoHeroChoices` may both exist. Each resolver acts only on its own state and ignores the other; **either may be resolved first**; no ordering guarantee. Determinism holds because each resolver is pure over current `G`. Block-all exempts both resolvers; turn-end stays blocked until both are clear. |

---

## Decisions to Reserve

- **D-24006** — `koHeroCurrentPlayer` becomes interactive for the current
  player (park → resolve), superseding the WP-185 §Out-of-Scope auto-resolution
  deferral. Eligible zones = discard + hand + inPlay (carries the D-20603
  union into the interactive set). `koHeroEachPlayer` / `koHeroEachPlayerMag2`
  remain auto (explicitly out of scope).
- **D-24007** — `G.pendingKoHeroChoices` FIFO queue + `PendingKoHeroChoice`
  type; no eligible snapshot (fresh recompute); auto-resolve when exactly 1
  eligible, append when ≥2, no-op when 0 (decision C).
- **D-24008** — `resolveKoHeroChoice` move (`{ zone, cardId }`,
  validate-against-current-`G`, KO first occurrence, front-pop-on-success,
  front-only — no entry index); dual turn-end guard extension + block-all
  action-move guard (decision B) exempting both resolvers; dual pending-choice
  coexistence with WP-220 (`pendingHeroChoice` + `pendingKoHeroChoices` may
  co-exist, either resolved first, each pure over current `G`).
- **D-24009** — bot/sim auto-resolve: `getLegalMoves` short-circuits to a
  single `resolveKoHeroChoice` using `selectKoHeroTarget`'s priority; bot KO
  target byte-identical to prior auto-resolution; sentinel replay re-pinned if
  it diverges (WP-236 discipline).

---

## Vision Alignment

- **Vision clauses touched:** §22 (Deterministic Eval). The change moves the KO
  mutation out of `fightVillain` into a later `resolveKoHeroChoice`, altering
  the bot's move stream; the sweep/autoplay AI and the sentinel replay run on
  that stream.
- **Conflict assertion:** No conflict — this WP preserves §22. The bot's KO
  **target** is byte-identical to today (`selectKoHeroTarget` reused verbatim);
  the resolution is fully deterministic (no `ctx.random.*`, no wall-clock). The
  only stream change is a deterministic one-move deferral of the KO, handled by
  re-pinning the sentinel fixture under a coherent-game gate exactly as WP-236
  did (D-23604 precedent).
- **Determinism preservation:** Confirmed. `PendingKoHeroChoice` is plain
  serializable state (string discriminant + playerID). No RNG is introduced or
  consumed by the parker, the move, or the bot short-circuit. Given identical
  setup + moves, replay is identical; the only behavioral delta (KO lands one
  move later, same target) is captured by the re-pinned hash.
- **Non-Goal proximity:** N/A — no monetization, competitive-ranking, or
  persuasive surface (NG-1..7 untouched).

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no failures.
2. `pnpm -r build` exits 0.
3. `G.pendingKoHeroChoices` exists on `LegendaryGameState` as
   `PendingKoHeroChoice[] | undefined`; `PendingKoHeroChoice` is
   `{ choiceType: 'ko-hero'; playerID: string }`.
4. `koHeroCurrentPlayer` with **0** eligible heroes for the current player is a
   silent no-op and appends nothing.
5. `koHeroCurrentPlayer` with exactly **1** eligible hero auto-KOs that card
   (to `G.ko`) and appends nothing (decision C).
6. `koHeroCurrentPlayer` with **≥2** eligible heroes appends one
   `PendingKoHeroChoice` for the current player and KOs nothing.
7. A single move that fires `koHeroCurrentPlayer` twice appends **two**
   entries (multi-KO queue).
8. `koHeroEachPlayer` and `koHeroEachPlayerMag2` behavior is unchanged (still
   auto-resolve via `koOneHeroForPlayer`; existing tests pass unmodified in
   intent).
9. `resolveKoHeroChoice({ zone, cardId })` KOs the first matching `cardId` from
   the named zone, writes it to `G.ko`, and pops the front entry.
10. `resolveKoHeroChoice` is a silent no-op (queue intact) on: empty queue,
    wrong `playerID`, wrong `choiceType`, invalid `zone`, `cardId ===
    WOUND_EXT_ID`, and `cardId` absent from the named zone.
11. `endTurn` and `advanceStage` (at cleanup) are silent no-ops while the queue
    is non-empty; neither calls `events.endTurn()` nor sweeps the hand.
12. `drawCards`, `playCard`, `recruitHero`, `fightVillain`, `fightMastermind`,
    `revealVillainCard`, and `advanceStage` are silent no-ops while the queue
    is non-empty; `resolveKoHeroChoice` and `resolveHeroChoice` are NOT blocked.
13. `getLegalMoves` returns exactly one `resolveKoHeroChoice` (target =
    `selectKoHeroTarget`'s pick over discard → hand → inPlay) while a KO choice
    is pending, and is otherwise unchanged.
14. **Parity (explicit mechanism):** a test builds two identical-zone copies of
    `G`; (a) runs the legacy `koOneHeroForPlayer` in isolation and captures the
    removed `cardId`; (b) runs `selectDefaultKoTarget` then `resolveKoHeroChoice`
    with its result and captures the KO'd `cardId`. The two `cardId`s match
    exactly.
15. `game.ts` registers exactly 10 moves; the `game.test.ts` move-list
    assertion includes `resolveKoHeroChoice`.
16. Either the sentinel/`PRE_WP080_HASH` suite passes unchanged, OR it is
    regenerated + re-pinned under the coherent-game gate (winner unchanged in
    kind; terminal counters unchanged in kind; `snapshotPerTurn.length`
    unchanged) — and §Verification output states which path was taken.
17. No `boardgame.io` / registry import added to `villainEffects.execute.ts` or
    `ai.legalMoves.ts`; no `.reduce()` added to either.
20. **Queue discipline:** no code path other than `koHeroCurrentPlayer` appends
    to `G.pendingKoHeroChoices`, and none other than `resolveKoHeroChoice`
    removes entries; the queue is never reassigned, spliced, cleared, reordered,
    or set to `null` elsewhere. A test asserts the queue is byte-identical after
    every non-resolver move (including repeated invalid resolves).
21. **Dual pending coexistence:** with both `pendingHeroChoice` and a
    `pendingKoHeroChoices` entry present, resolving either first yields a valid
    state, clears only its own state, and does not diverge replay for an
    identical move stream; turn-end stays blocked until both are clear.
22. **Multi-entry FIFO integrity:** resolving the front entry removes exactly
    that entry and does not alter the identity or order of the remaining entries
    (beyond zone-mutation eligibility effects); a resolve never clears the whole
    queue, and a non-front entry can never be targeted.
23. **No mutation while guarded:** no `G` field or zone is mutated by any
    guarded action move while `hasPendingKoHeroChoice(G)` is true (the guard
    returns before any zone/economy access).
24. **Sim short-circuit length:** `getLegalMoves` returns a list of length
    exactly 1 while a KO choice is pending; no other move is appended or merged.
25. **Resolve never auto-resolves on collapse:** if a multi-KO queue's earlier
    resolution reduces a later entry's eligible set to 1, that later entry still
    requires an explicit `resolveKoHeroChoice` (no implicit KO during the
    resolve phase).
26. No files outside §Files Expected to Change were modified.
27. D-24006..D-24009 are Active in `docs/ai/DECISIONS.md`.

---

## Verification Steps

```bash
# Baseline (record the number; AC deltas are relative)
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; record pass count as BASELINE

git diff --name-only packages/game-engine/
# Expected: empty before work

# After engine changes:
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; pass count ≥ BASELINE + ~28 new cases

# Move count is 10
grep -c "client: false" packages/game-engine/src/game.ts
# Expected: ≥ the prior count + 1 (resolveKoHeroChoice registered)

# resolveKoHeroChoice wired into the sim
grep "resolveKoHeroChoice" packages/game-engine/src/simulation/ai.legalMoves.ts
# Expected: ≥1 line (SIMULATION_MOVE_NAMES + short-circuit)

# Determinism suite (records whether the sentinel re-pinned)
pnpm --filter @legendary-arena/game-engine test -- --test-name-pattern sentinel
# Expected: exits 0 (either unchanged, or green against the re-pinned hash)

pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria met.
- [ ] `PendingKoHeroChoice` + `pendingKoHeroChoices?` in `types.ts`.
- [ ] `koHeroCurrentPlayer` parker (0 → no-op, 1 → auto-KO, ≥2 → append) with
      `// why: D-24006/D-24007`; each-player cases byte-unchanged.
- [ ] `resolveKoHeroChoice` move (`(context, args)`, validate-against-current-`G`,
      front-only, front-pop-on-success) + `hasPendingKoHeroChoice` predicate,
      registered `client: false`.
- [ ] Queue discipline holds: single-writer/single-popper, never `null`, never
      cleared/reordered elsewhere; dual-pending coexistence with WP-220 verified.
- [ ] Dual turn-end guard extended + block-all guard on all action moves
      (after stage gate, before any G/zone access, no side effects; exempting
      both resolvers), each with a `// why:` citing D-24008.
- [ ] `getLegalMoves` pending-choice short-circuit; `SIMULATION_MOVE_NAMES`
      updated; bot KO target byte-identical (parity test).
- [ ] ~28 new tests (incl. parity, dual-pending coexistence, multi-entry
      integrity, no-mutation-while-guarded, sim length-1, eligible-collapse);
      `game.test.ts` move-list 9 → 10.
- [ ] Sentinel suite passes (unchanged or re-pinned under the coherent gate);
      §Verification output records which.
- [ ] `docs/ai/DECISIONS.md` D-24006..D-24009 Active.
- [ ] `docs/ai/STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated.
- [ ] No files outside §Files Expected to Change were modified.

---

## Risk Review

- **Co-release with WP-243 (production soft-lock):** if WP-242 deploys without
  the client prompt, a live human game whose Fight KO has ≥2 eligible heroes
  freezes (block-all guard + no UI to send `resolveKoHeroChoice`). Mitigation:
  the co-release lock at the top of this file; WP-243 is the paired UX packet;
  bots/sweep are unaffected (in-engine auto-resolve). The single-eligible
  auto-resolve (decision C) shrinks the exposed surface to ≥2-eligible Fight
  KOs only.
- **Sentinel / sweep determinism (the WP-236 class):** the KO now lands one bot
  move later. Mitigation: same target via `selectKoHeroTarget`; no RNG
  introduced; sentinel re-pinned under a coherent-game gate if it diverges
  (§Scope 7). The sweep's aggregate metrics are unaffected in kind (same games,
  same outcomes, one extra resolve move per Fight KO).
- **Block-all blast radius (operator-authorised):** the block-all guard touches
  6 move files. Each edit is one import + one early-return. The queue
  (D-24007) already makes the engine corruption-proof on its own (fresh-eligible
  recompute, pop-on-success, dual turn-end guard); the block-all layer adds the
  board-freeze so a player resolves the Fight effect before any other action
  and so multi-KO queues never interleave with zone-mutating moves. If a leaner
  engine is preferred, the block-all guards can be dropped and the modal
  enforced purely in WP-243's client — the engine stays correct either way.
- **Stale target across a multi-KO queue:** resolving entry 1 changes the
  zones before entry 2 is resolved. Mitigation: no eligible snapshot is stored;
  `resolveKoHeroChoice` validates against current `G` and the WP-243 projection
  recomputes eligibility each frame.

---

## Lint Gate Self-Review

**Verdict: PASS** (all applicable sections resolved).

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Structure | PASS | Goal, Assumes, Context, Scope (In), Out of Scope, Files, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done all present and non-empty; Out of Scope lists 7 explicit exclusions |
| §2 | Constraints | PASS | Engine-wide + packet-specific + session protocol + locked values; forbids diffs/snippets; references `00.6-code-style.md` (Context 13) |
| §3 | Prerequisites | PASS | WP-185/191/220/236 deps with shapes; `moveCardFromZone`, `selectKoHeroTarget`, the guarded move files all enumerated |
| §4 | Context | PASS | 14 specific items incl. ARCHITECTURE.md sections, DECISIONS ids, Vision §22 |
| §5 | Output Completeness | PASS | ≤20 files, each new/modified with a one-line change; single authoritative count; over-8 operator-authorised with precedent |
| §6 | Naming | PASS | `pendingKoHeroChoices`, `PendingKoHeroChoice`, `resolveKoHeroChoice`, `ResolveKoHeroChoiceArgs`, `choiceType: 'ko-hero'`, `CardExtId` consistent |
| §7 | Dependencies | PASS | No new npm deps; existing `zoneOps`/`ko.logic` helpers only |
| §8 | Architectural Boundaries | PASS | Engine + simulation only; `G` runtime-only; moves never throw; no `boardgame.io` in pure helpers; no `.reduce()` |
| §9 | Windows | N/A | Node built-ins; no shell scripts or OS paths |
| §10 | Env Vars | N/A | None touched |
| §11 | Auth | N/A | No auth surface |
| §12 | Test Quality | PASS | `node:test`, `.test.ts`, `makeMockCtx`, no boardgame.io/network/DB; determinism parity + sentinel coherent-gate |
| §13 | Verification | PASS | Exact `pnpm`/`grep` commands; baseline-relative deltas; sentinel path recorded |
| §14 | Acceptance Criteria | PASS | 27 binary, observable, code-path-specific items (count exceeds the 6–12 guideline — established precedent WP-220 = 30; each item is a distinct code path) |
| §15 | Definition of Done | PASS | STATUS / DECISIONS / WORK_INDEX / EC_INDEX + scope-boundary check |
| §16 | Code Style | PASS | `// why:` on guards + default-target; named imports; no `.reduce()`; small functions; duplicate-twice (koSingleTarget) not abstracted |
| §17 | Vision Alignment | PASS (block present) | §22 triggered (sim/replay determinism); determinism-preservation line included; no NG-1..7 crossed |
| §18 | Prose-vs-Grep | N/A | Verification greps target project tokens (`resolveKoHeroChoice`, `client: false`), not forbidden-import literals; no adjacent forbidden-token prose |
| §19 | Bridge-vs-HEAD | N/A | Not a repo-state-summarizing artifact |
| §20 | Funding Surface | N/A | Gameplay engine only; no funding copy or paid surface |
| §21 | API Catalog | N/A | `resolveKoHeroChoice` is a boardgame.io move (registered in `game.ts`), not an `apps/server` HTTP endpoint or `Library-only` function; `api-endpoints.md` needs no row |
