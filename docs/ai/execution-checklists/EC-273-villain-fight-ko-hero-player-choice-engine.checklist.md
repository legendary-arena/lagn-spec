# EC-273 — Villain Fight KO-Hero Player Choice: Engine (Execution Checklist)

**Source:** docs/ai/work-packets/WP-242-villain-fight-ko-hero-player-choice-engine.md
**Layer:** Game Engine (+ Simulation)

## Before Starting
- [ ] WP-185 ✅ (`koHeroCurrentPlayer`, `koOneHeroForPlayer`, `selectKoHeroTarget`), WP-191 ✅, WP-220 ✅ (`PendingHeroChoice` pattern), WP-236 ✅ (sentinel-regen precedent)
- [ ] `G.pendingKoHeroChoices` does NOT yet exist on `LegendaryGameState`
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — record BASELINE pass count
- [ ] Read the auto-resolution `// why:` block in `villainEffects.execute.ts` (line ~328) — this WP supersedes it for the current-player case only

## Locked Values (do not re-derive)
- `G.pendingKoHeroChoices?: PendingKoHeroChoice[]` — absent-value `undefined`; `.length === 0` ≡ no pending choice
- `PendingKoHeroChoice = { choiceType: 'ko-hero'; playerID: string }` — discriminant exactly `'ko-hero'`
- Move name `'resolveKoHeroChoice'`; registered `{ move: resolveKoHeroChoice, client: false }`
- `ResolveKoHeroChoiceArgs = { zone: 'discard' | 'hand' | 'inPlay'; cardId: CardExtId }`
- Eligible-count thresholds: 0 → no-op; 1 → auto-KO; ≥2 → **append** a pending entry (contract term: append/front-pop; code: `push`/`shift` — do not say enqueue/dequeue in the contract)
- Eligible zones / bot default-pick priority order: `discard`, `hand`, `inPlay`
- A "hero" for KO = any card `!== WOUND_EXT_ID` (wounds excluded even when sitting in an otherwise-valid zone)
- `G.pendingKoHeroChoices` is never `null` — `undefined` / `[]` are the only absent forms
- `game.ts` registered-move count after = **10** (was 9)
- Block-all guard exempts `resolveKoHeroChoice` AND `resolveHeroChoice`

## Guardrails
- Change ONLY the `koHeroCurrentPlayer` case; `koHeroEachPlayer` / `koHeroEachPlayerMag2` / `koOneHeroForPlayer` / `selectKoHeroTarget` stay byte-unchanged
- **Queue discipline:** only the parker **appends**; only `resolveKoHeroChoice` **front-pops** (index 0). No other path reassigns, `splice`s, clears, or reorders the queue. Resolving the front never clears the whole queue and never reorders remaining entries
- Store NO eligible-card snapshot — recompute eligibility fresh from CURRENT `G` at every use (parker count, move validation, WP-243 projection); never cached/historical
- Bot KO target MUST equal today's auto-resolution: `selectDefaultKoTarget` reuses `selectKoHeroTarget` over discard → hand → inPlay (parity test captures both KO'd cardIds and asserts equality)
- `resolveKoHeroChoice` front-pops ONLY on `found` (invalid/stale target = no-op, queue intact). It NEVER auto-resolves: a later entry whose eligible set has collapsed to 1 STILL needs an explicit resolve (only the parker auto-resolves)
- **Block-all guard placement (identical at every site):** immediately after the stage gate (where one exists), BEFORE any other `G`/zone read or write, `return` with no side effects
- **Dual-pending:** `pendingHeroChoice` (WP-220) + `pendingKoHeroChoices` may co-exist — each resolver acts only on its own state, either may be resolved first; block-all exempts both resolvers; turn-end blocked until both clear
- `getLegalMoves` returns a list of length EXACTLY 1 while a KO is pending — no other move appended/merged
- Moves never throw; silent no-op on every invalid state; no `boardgame.io`/registry import in `villainEffects.execute.ts` or `ai.legalMoves.ts`; no `.reduce()` in either
- **Sentinel (binary):** if the replay diverges → re-pin MUST occur AND the coherent-game gate (winner / terminal counters unchanged in kind; `snapshotPerTurn.length` unchanged) MUST pass. If the gate FAILS → STOP, do NOT re-pin (real regression). If no divergence → touch no fixture

## Required `// why:` Comments
- `koHeroCurrentPlayer` parker: 0/1/≥2 dispatch (D-24006 / D-24007 decision C)
- Each block-all guard (6 move files + `advanceStage`): board-freeze rationale (D-24008)
- Extended turn-end guards (`endTurn`, `advanceStage`): queue-non-empty blocks turn-end (D-24008)
- `getLegalMoves` short-circuit: bot target = prior auto-resolution, replay determinism (D-24009)

## Files to Produce
- `packages/game-engine/src/types.ts` — **modified** — `PendingKoHeroChoice` + `pendingKoHeroChoices?`
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — rewrite `koHeroCurrentPlayer`; add `buildKoEligibleTargets`/`selectDefaultKoTarget`/`koSingleTarget`
- `packages/game-engine/src/moves/koHeroChoice.resolve.ts` — **new** — move + `ResolveKoHeroChoiceArgs` + `hasPendingKoHeroChoice`
- `packages/game-engine/src/game.ts` — **modified** — register move; extend `advanceStage` turn-end + block-all guard
- `packages/game-engine/src/moves/coreMoves.impl.ts` — **modified** — extend `endTurn` guard; block-all on `drawCards` + `playCard`
- `packages/game-engine/src/moves/fightVillain.ts` — **modified** — block-all guard
- `packages/game-engine/src/moves/fightMastermind.ts` — **modified** — block-all guard
- `packages/game-engine/src/moves/recruitHero.ts` — **modified** — block-all guard
- `packages/game-engine/src/moves/villainDeck.reveal.ts` — **modified** — block-all guard
- `packages/game-engine/src/simulation/ai.legalMoves.ts` — **modified** — `SIMULATION_MOVE_NAMES` + pending-choice short-circuit
- `packages/game-engine/src/moves/koHeroChoice.resolve.test.ts` — **new** — resolve + turn-end + block-all cases (≥8)
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — parker park/auto-1/no-op (≥6)
- `packages/game-engine/src/setup/henchmanFightKo.repro.test.ts` — **modified** — flip auto-resolution assertions
- `packages/game-engine/src/simulation/ai.legalMoves.test.ts` — **new/modified** — short-circuit + parity
- `packages/game-engine/src/game.test.ts` — **modified** — move-list 9 → 10
- sentinel fixture + `PRE_WP080_HASH` — **modified ONLY IF** the determinism suite diverges (else untouched)

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 — pass count ≥ BASELINE + ~20
- [ ] `pnpm -r build` exits 0
- [ ] Sentinel path recorded (unchanged vs re-pinned) in the completion note
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated — D-24006..D-24009 Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-273 Draft → Done
- [ ] `git diff --name-only` = exactly the allowlist files

## Common Failure Smells (Optional)
- Bot sweep numbers shift in *kind* (not just the re-pinned hash) ⇒ `selectDefaultKoTarget` diverged from `selectKoHeroTarget`'s priority
- A Fight-KO cell wedges in the sweep ⇒ `getLegalMoves` short-circuit missing or returns an empty list when a choice is pending
- Existing each-player KO tests fail ⇒ a shared resolver was changed instead of only the `koHeroCurrentPlayer` case
- Turn never ends in a live game ⇒ block-all guard accidentally blocks `resolveKoHeroChoice`
- Whole queue clears on one resolve ⇒ resolver reassigned/`= []` instead of front-popping (`shift`)
- A guarded move still mutated zones while pending ⇒ block-all guard placed after a zone read/write, not immediately after the stage gate
- A KO silently lands during the resolve phase when 1 eligible remains ⇒ resolver auto-resolved (only the parker may)
- One pending system wedges the other ⇒ block-all didn't exempt `resolveHeroChoice` (dual-pending)
