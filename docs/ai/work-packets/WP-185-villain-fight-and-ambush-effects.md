# WP-185 — Villain & Henchman Fight + Ambush Effects (Engine)

## Goal

Wire the engine to execute card-text-driven `Fight:` and `Ambush:` effects on
villain and henchman cards, so that defeating a Henchman that reads
`Fight: KO one of your Heroes` actually KOs a hero, and revealing a villain
that reads `Ambush: Each player gains a Wound` actually wounds each player.
Replace the pre-existing hardcoded `gainWound` placeholder in
`villainDeck.reveal.ts` (currently fires for every Ambush card regardless of
its text — wrong in every case where the card's Ambush text is not literally
"each player gains a wound") with a hook-driven dispatch that reads the
parsed ability text. After this WP, autoplay watch mode and human play alike
will see Fight: and Ambush: effects resolve per the printed card text for
the structured-effect subset defined in this WP.

---

## Assumes

- WP-009A ✅ — Rule hook contracts (`HookDefinition`, `RuleEffect`,
  `executeRuleHooks`) landed. Reused as the effect-application substrate.
- WP-009B ✅ — Rule execution pipeline + `applyRuleEffects` landed.
- WP-014A ✅ — Villain reveal pipeline (`villainDeck.reveal.ts`) landed.
  This WP modifies the existing Ambush branch within that file.
- WP-014B ✅ — `G.villainDeckCardTypes` setup-time classification landed.
- WP-016 ✅ — `fightVillain` move landed (the fire site for Fight:).
- WP-017 ✅ — KO, wounds, bystander capture helpers landed.
  (`koCard`, `gainWound`, `attachBystanderToVillain`,
  `awardAttachedBystanders` are the primitives Fight: / Ambush: effects
  will call.)
- WP-021 ✅ — Hero ability hook contracts (`HeroAbilityHook`,
  `setup/heroAbility.setup.ts`) landed. **This WP mirrors that pattern
  for villain/henchman abilities.**
- WP-022 ✅ — Hero ability execution (`heroEffects.execute.ts`) landed.
  The MVP effect-vocabulary discipline (4 keyword subset, magnitude
  validation, deterministic auto-resolution) is the model here.
- WP-025 ✅ — Board keywords (Patrol, Ambush, Guard) landed.
  `G.cardKeywords` exists and tags `ambush` per
  `buildCardKeywords.ts:detectAmbush`. **This WP replaces the
  Ambush execution branch in `villainDeck.reveal.ts:209-228` but does
  NOT change keyword detection or `G.cardKeywords` shape.**
- `data/cards/*.json` (40 sets) contains villain + henchman cards with
  `Fight:` and `Ambush:` ability text. Verified counts (2026-05-27):
  ~150 cards have `Fight:` text; ~304 cards have `Ambush:` text.
- **Drafting baseline:** `origin/main @ 0e2558f` (2026-05-27).

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Section 4 — boardgame.io Runtime Model`
  (Move Validation Contract, Rule Execution Pipeline) — moves never
  throw; rule handlers return RuleEffect[] without mutating G.
- `docs/ai/ARCHITECTURE.md §Section 1 — Layer Boundary (Authoritative)`
  — Game Engine layer; no registry runtime import.
- `docs/ai/ARCHITECTURE.md §Card Data Flow: Registry into Game Engine`
  — registry feeds data once at setup; engine never queries at runtime.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — `CardExtId` type
  alias, ability text shape (`abilities: string[]` on each card entry).
- `docs/ai/REFERENCE/00.6-code-style.md` — no `.reduce()` in zone
  operations or effect application; full English names; JSDoc on every
  function; explicit `// why:` comments.
- `docs/ai/DECISIONS.md` — scan D-2302 (board-keyword safe-skip),
  D-2403 (effect-type gap safe-skip), D-2802 (no aliasing in setup-time
  builders), D-8801 / D-8802 (canonical keyword emission order),
  D-13502 (per-copy fresh object literals).
- `.claude/rules/architecture.md §Move & Phase Rules` — move
  validation contract; no throws; only `Game.setup()` may throw.
- `.claude/rules/code-style.md` — pure helpers (no boardgame.io
  imports); `// why:` comment locations.
- `.claude/skills/legendary-game-engine/SKILL.md` — Engine layer
  enforcement rules (loads on demand during engine WP execution).
- `packages/game-engine/src/rules/heroAbility.types.ts` —
  **canonical precedent** for the data-only hook shape this WP mirrors.
- `packages/game-engine/src/setup/heroAbility.setup.ts` —
  canonical precedent for the setup-time markup parser this WP
  mirrors for villain ability text.
- `packages/game-engine/src/hero/heroEffects.execute.ts` —
  canonical precedent for the deterministic execution path with MVP
  keyword subset + safe-skip on out-of-vocabulary keywords.
- `packages/game-engine/src/moves/fightVillain.ts` — the Fight: fire
  site (modified by this WP).
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
  the Ambush: fire site; current hardcoded `gainWound` placeholder
  at lines 203-228 is replaced by this WP.
- `packages/game-engine/src/board/boardKeywords.logic.ts:hasAmbush`
  — the existing detection function; **kept**, but no longer
  semantically drives "each player gains a wound" — it becomes a
  marker that gates the hook dispatch.

---

## Context

The engine has shipped 184 WPs but never implemented the most basic class
of villain card effects: text that fires when a villain enters the City
(`Ambush:`) or when a villain is defeated (`Fight:`). Currently:

1. **`Fight:` text has zero execution.** `fightVillain.ts` moves the card
   from City to victory pile and awards attached bystanders. No rule hook
   fires, no ability text is read, no effect applies. Every `Fight: KO ...`
   / `Fight: Each player ...` card is dead text.
2. **`Ambush:` text has a placeholder bug.** `buildCardKeywords.ts` tags
   any villain whose ability starts with `"Ambush"` as having the `ambush`
   board keyword. `villainDeck.reveal.ts:209-228` then fires a hardcoded
   "each player gains a wound" on city entry for every such card —
   regardless of what the Ambush text actually says. This is wrong in
   nearly every case: real Ambush text varies from "captures a Bystander"
   to "Put the top card of the Hero Deck into the Escape Pile" to
   `[Double-Cross]` keyword application.

User-visible symptom (reported 2026-05-27): the "watch bot play" mode of
`play.legendary-arena.com` never KOs a card, even when defeated Henchmen
clearly read `Fight: KO ...`. Same gap exists in human play but is less
obvious because humans see one fight at a time. The bot-watch surface is
where the systematic absence becomes visible.

This WP closes the engine gap by mirroring the WP-021 / WP-022 hero
ability pattern for villain/henchman cards: a setup-time markup parser
produces a data-only `VillainAbilityHook[]` table, a fire site in
`fightVillain.ts` (Fight:) and `villainDeck.reveal.ts` (Ambush:) dispatches
to an executor that applies a small MVP effect vocabulary. Effects outside
the MVP vocabulary safely no-op with a `// why:` deferral comment — same
discipline as WP-022.

**WP-186 (paired)** will extend this infrastructure to `Escape:` and
`Overrun:` effects (different fire site within `villainDeck.reveal.ts`).
WP-186 depends on WP-185.

---

## Scope (In)

- **New canonical timing union** —
  `VillainAbilityTiming = 'onAmbush' | 'onFight'` + canonical array
  `VILLAIN_ABILITY_TIMINGS` with drift-detection (parallel to
  `HERO_ABILITY_TIMINGS`). `'onEscape'` is reserved for WP-186 and is
  **not** added in this WP.
- **New canonical effect-keyword union** —
  `VillainEffectKeyword = 'gainWoundEachPlayer' | 'gainWoundCurrentPlayer' | 'koHeroCurrentPlayer' | 'heroDeckTopToEscape' | 'captureBystander'`
  + canonical array `VILLAIN_EFFECT_KEYWORDS` with drift-detection.
  v1 vocabulary is intentionally small; out-of-vocabulary effects
  safely no-op per WP-022 precedent.
- **`VillainAbilityHook` data-only descriptor type** —
  `{ cardId, timing, keywords, effects }` mirroring `HeroAbilityHook`
  shape. Stored in new G field `G.villainAbilityHooks: VillainAbilityHook[]`.
- **Setup-time parser** —
  `packages/game-engine/src/setup/villainAbility.setup.ts` reads villain
  + henchman ability text via a structural `VillainAbilityRegistryReader`
  interface (local; no `@legendary-arena/registry` import), detects
  `Ambush:` / `Fight:` prefixes, extracts structured `[icon:]` /
  `[keyword:]` markup, and emits one `VillainAbilityHook` per matched
  ability line. Free-text effects outside the markup vocabulary produce
  a hook with empty `effects: []` (the timing label is preserved so
  future WPs can introspect coverage).
- **Setup wiring** — `buildInitialGameState.ts` calls
  `buildVillainAbilityHooks(registry, matchConfig)` once at setup and
  writes the result to `G.villainAbilityHooks`.
- **`G` shape extension** — `LegendaryGameState.villainAbilityHooks:
  Readonly<VillainAbilityHook[]>` added. Per D-8802 / D-13502 the field
  is a freshly-constructed array, no aliasing with registry data.
- **Effect executor** —
  `packages/game-engine/src/villain/villainEffects.execute.ts` accepts
  `(G, ctx, cardId, timing)`, looks up hooks via
  `getVillainHooksForCard(cardId, timing)`, and applies the MVP effect
  vocabulary deterministically using existing helpers
  (`gainWound`, `koCard`, `attachBystanderToVillain`).
- **Fight: fire site** — `fightVillain.ts` modified: after the card is
  pushed to the player's victory pile and bystanders are awarded
  (existing Step 3 + 3b), call
  `executeVillainAbilities(G, ctx, cardId, 'onFight')`. Move return
  contract unchanged (still returns `void`, still never throws).
- **Ambush: fire site replacement** — `villainDeck.reveal.ts` modified:
  the existing `if (hasAmbush(...))` block (lines 203-228) is replaced
  with a call to `executeVillainAbilities(G, ctx, cardId, 'onAmbush')`.
  `hasAmbush` is **kept as a fast gate** — the executor is only called
  when the card has the `ambush` board keyword, preserving the
  detection invariant from `buildCardKeywords.ts`.
- **MVP effect vocabulary semantics:**
  - `gainWoundEachPlayer` — every player in `G.playerZones` gains 1
    wound from `G.piles.wounds` (silently no-ops when wound pile is
    empty, mirroring existing escape-wound semantics).
  - `gainWoundCurrentPlayer` — current player gains 1 wound.
  - `koHeroCurrentPlayer` — KO 1 hero card from current player's
    hand-or-discard. Deterministic auto-resolution: lowest-VP hero in
    discard first; if discard has no heroes, lowest-VP hero in hand;
    silent no-op if neither. Auto-resolution is intentional MVP scope;
    interactive choice is deferred to a future UI/UX WP.
  - `heroDeckTopToEscape` — `G.piles.heroDeck[0]` → `G.escapedPile`.
    Silent no-op when hero deck empty.
  - `captureBystander` — attach 1 bystander from `G.piles.bystanders`
    to the revealing villain card (`payload.cardId`). Silent no-op
    when bystander pile empty. Reuses
    `attachBystanderToVillain(...)` (already in `bystanders.logic.ts`).
- **Drift-detection tests** —
  `VILLAIN_ABILITY_TIMINGS` must exactly match the
  `VillainAbilityTiming` union (same pattern as `HERO_ABILITY_TIMINGS`
  drift test); `VILLAIN_EFFECT_KEYWORDS` must exactly match the
  `VillainEffectKeyword` union.
- **Unit tests** — setup-time parser (Ambush + Fight detection),
  executor per effect keyword, fire-site integration (fight a villain
  with `Fight: KO ...` → hero KO'd; reveal a villain with
  `Ambush: each player gains a Wound` → all players wounded), free-text
  safe-skip, deterministic replay across hook execution.
- **STATUS.md entry**, **DECISIONS.md entries** (D-18501..D-18504),
  **WORK_INDEX.md flip to `[x]`**, **EC-212 flip to Done**.

## Out of Scope

- **Escape: and Overrun: effects** — WP-186 (paired follow-on; reuses
  the same hook table by adding `'onEscape'` to
  `VILLAIN_ABILITY_TIMINGS`).
- **Free-text Fight / Ambush effects that can't be expressed in the
  MVP vocabulary** — e.g., `Fight: Each other player reveals their hand
  and KOs one of their cards that shares a Hero Class with any of
  Ghost's Kidnapped Victims.` These produce hooks with empty `effects:
  []` and safe-skip at execution. A per-card carveout enumeration lives
  in `docs/ai/STATUS.md` post-execution, not in the engine.
- **Interactive player choice for KO targeting** — MVP uses
  deterministic auto-resolution (lowest VP first). Interactive choice
  is a future UI/server WP.
- **`Master Strike:` / `Twist:` text-driven effects** — separate audit
  WP later; partially handled by WP-024 / WP-182 already.
- **`Bystander:` ability text** (overrides bystander attachment
  semantics) — separate WP later.
- **`Rescue:` ability text** — separate WP later.
- **Mastermind `Fight:` / `Healing:` text** — masterminds are tactic
  cards, not city cards; their fight semantics live in
  `fightMastermind.ts` and are a separate WP.
- **Endgame condition variants** (`Evil Wins:` / `Good Wins:` / etc.) —
  separate audit WP later.
- **Setup-only directives** (`Setup:` / `Start Game:` /
  `Always Include:` / `Always Leads:`) — already handled at setup or
  separate scope.
- **Changes to `G.cardKeywords` shape, `buildCardKeywords.ts`
  emission order, or the `BoardKeyword` union** — `ambush` stays as
  the marker keyword.
- **`PatternFilter.vue` / registry-viewer changes** — entire WP-184
  surface is out of scope.
- **Henchman-group ability text** for groups whose ability text lives
  at the group level rather than per-card — current registry data
  shape places henchman ability text on the **group** entry (not on
  individual henchman card entries). The parser MUST handle this
  (read henchman ability from `group.abilities[]`, apply to every
  card-instance ext_id within the group) — but the henchman data
  shape itself is locked and out of scope to change.

---

## Files Expected to Change

1. `packages/game-engine/src/rules/villainAbility.types.ts` — **new** —
   `VillainAbilityTiming` union, `VILLAIN_ABILITY_TIMINGS` canonical
   array, `VillainEffectKeyword` union, `VILLAIN_EFFECT_KEYWORDS`
   canonical array, `VillainAbilityHook` data-only interface,
   `getVillainHooksForCard()` pure filter helper.
2. `packages/game-engine/src/setup/villainAbility.setup.ts` — **new** —
   setup-time parser; structural `VillainAbilityRegistryReader`;
   `buildVillainAbilityHooks(registry, matchConfig)` produces the hook
   table from villain + henchman ability text.
3. `packages/game-engine/src/villain/villainEffects.execute.ts` —
   **new** — deterministic executor;
   `executeVillainAbilities(G, ctx, cardId, timing)` applies MVP
   effect vocabulary; safe-skip on out-of-vocabulary keywords.
4. `packages/game-engine/src/types.ts` — **modified** — add
   `villainAbilityHooks: Readonly<VillainAbilityHook[]>` to
   `LegendaryGameState`; re-export new types.
5. `packages/game-engine/src/setup/buildInitialGameState.ts` —
   **modified** — call `buildVillainAbilityHooks` and assign the
   result to `G.villainAbilityHooks`. One new line in the setup
   composition block; no other behavior change.
6. `packages/game-engine/src/moves/fightVillain.ts` — **modified** —
   add `executeVillainAbilities(G, ctx, cardId, 'onFight')` call
   after Step 3b (bystander award) and before the existing message
   push. No change to validation, gating, or zone mutation order.
7. `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
   **modified** — replace lines 203-228 (the hardcoded Ambush
   `gainWound` loop) with a single call to
   `executeVillainAbilities(G, ctx, cardId, 'onAmbush')`. The
   `hasAmbush(...)` gate is preserved as the fast pre-check. All
   other branches (escape wound, bystander attachment, deck routing)
   unchanged.
8. `packages/game-engine/src/rules/villainAbility.types.test.ts` —
   **new** — drift-detection tests for both canonical arrays vs.
   their union types; getVillainHooksForCard query tests.
9. `packages/game-engine/src/setup/villainAbility.setup.test.ts` —
   **new** — Ambush detection, Fight detection, henchman group-level
   ability application to every group member, structured markup
   extraction, free-text safe-skip, deterministic emission order.
10. `packages/game-engine/src/villain/villainEffects.execute.test.ts`
    — **new** — per-effect-keyword unit tests; fire-site integration
    via direct `executeVillainAbilities` calls on a mock G;
    deterministic replay; safe-skip on empty piles.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. **No diffs. No
  snippets. No "show only the changed section."** Output that omits
  unchanged sections is rejected.
- ESM only, Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — no
  abbreviations, no nested ternaries, no `.reduce()` in zone/effect
  application, every function has JSDoc, every non-obvious decision
  has a `// why:` comment.
- All randomness via `ctx.random.*`. **No `Math.random()`. No clocks.
  No filesystem / network / env access from moves or effects.**
- `G` is JSON-serializable: no functions, no classes, no Maps, no
  Sets in `G.villainAbilityHooks` or its descendants.
- Moves never throw. Only `Game.setup()` may throw.
- No `@legendary-arena/registry` import from `packages/game-engine`.
  Setup-time registry reader is a structural interface defined
  locally in `villainAbility.setup.ts` (same pattern as
  `HeroAbilityRegistryReader`).
- No `boardgame.io` import in pure helpers (the types file, the
  setup parser, and the executor's per-effect helpers).

**Packet-specific:**

- The MVP effect vocabulary is `gainWoundEachPlayer`,
  `gainWoundCurrentPlayer`, `koHeroCurrentPlayer`,
  `heroDeckTopToEscape`, `captureBystander` — **exactly these five
  strings, in this canonical order**. Adding a sixth requires a new
  WP and a `DECISIONS.md` entry.
- Out-of-vocabulary effects safely no-op. The executor MUST NOT
  throw, log to console, or block the move/reveal pipeline on an
  unknown effect keyword.
- The hardcoded `gainWound` loop at
  `villainDeck.reveal.ts:209-228` MUST be deleted (not commented
  out, not gated by a flag, not left dormant). Its replacement is
  the single `executeVillainAbilities(G, ctx, cardId, 'onAmbush')`
  call.
- The Fight: fire site in `fightVillain.ts` is added **after** the
  bystander award and **before** the message push, so a Fight:
  `captureBystander` effect (rare but it exists) observes the
  post-award bystander pile.
- `hasAmbush(...)` from `boardKeywords.logic.ts` is **kept** as the
  fast pre-check. Calls to `executeVillainAbilities(..., 'onAmbush')`
  must be gated by `hasAmbush(cardId, G.cardKeywords ?? {})` —
  consistent with the existing detection invariant.
- Henchman ability text lives at the **group** entry, not per-card.
  The setup parser MUST detect this shape and emit one
  `VillainAbilityHook` per card-instance ext_id within the group.
- `VILLAIN_ABILITY_TIMINGS` includes `'onEscape'`? **No.** That is
  reserved for WP-186. Adding it in this WP is out of scope.
- Per-copy hook objects are freshly constructed (no aliasing across
  multiple card-instance ext_ids that share the same ability text).
  Mirrors D-13502 hero-card-instance precedent.

**Session protocol:**

- If any assumption above is false at session start, stop and report
  `BLOCKED:` with the missing dependency. Do not work around.
- If during execution a real Ambush or Fight card's effect cannot be
  expressed in the MVP vocabulary, the executor must safely no-op AND
  the parser must emit a hook with empty `effects: []` (the timing
  label is preserved). Do NOT extend the vocabulary mid-session.
- If a test failure suggests amending the locked vocabulary, the
  fix is a future WP — not an inline amendment.

**Locked contract values:**

```typescript
export type VillainAbilityTiming = 'onAmbush' | 'onFight';

export const VILLAIN_ABILITY_TIMINGS: readonly VillainAbilityTiming[] = [
  'onAmbush',
  'onFight',
] as const;

export type VillainEffectKeyword =
  | 'gainWoundEachPlayer'
  | 'gainWoundCurrentPlayer'
  | 'koHeroCurrentPlayer'
  | 'heroDeckTopToEscape'
  | 'captureBystander';

export const VILLAIN_EFFECT_KEYWORDS: readonly VillainEffectKeyword[] = [
  'gainWoundEachPlayer',
  'gainWoundCurrentPlayer',
  'koHeroCurrentPlayer',
  'heroDeckTopToEscape',
  'captureBystander',
] as const;

export interface VillainAbilityHook {
  cardId: CardExtId;
  timing: VillainAbilityTiming;
  keywords: VillainEffectKeyword[];
  effects: VillainEffectKeyword[];
}
```

---

## Acceptance Criteria

- [ ] `VillainAbilityTiming` union and `VILLAIN_ABILITY_TIMINGS`
  canonical array are exact siblings — drift-detection test asserts
  bidirectional equality.
- [ ] `VillainEffectKeyword` union and `VILLAIN_EFFECT_KEYWORDS`
  canonical array are exact siblings — drift-detection test asserts
  bidirectional equality.
- [ ] `G.villainAbilityHooks` is populated at setup time and is a
  freshly-constructed array (no aliasing with registry).
- [ ] `buildVillainAbilityHooks` emits exactly one
  `VillainAbilityHook` per (card-instance ext_id × matched ability
  timing) pair. Henchman group-level ability text fans out to every
  card-instance ext_id in the group.
- [ ] Fighting a villain whose ability text reads `Fight: KO one of
  your Heroes` produces exactly one KO in the current player's KO
  pile (chosen per the documented auto-resolution heuristic).
- [ ] Revealing a villain whose ability text reads `Ambush: Each
  player gains a Wound` increments every player's discard by exactly
  1 wound (subject to wound pile availability, mirroring existing
  escape-wound semantics).
- [ ] Revealing a villain whose ability text reads
  `Ambush: <text outside MVP vocabulary>` no-ops at the executor
  (no state mutation) and logs no warning.
- [ ] The hardcoded `gainWound` loop previously at
  `villainDeck.reveal.ts:203-228` no longer exists; `grep -n
  "gained a wound from Ambush"` returns zero matches in
  `packages/game-engine/src/villainDeck/`.
- [ ] `fightVillain.ts` calls `executeVillainAbilities(...,
  'onFight')` after bystander award and before message push.
- [ ] `villainDeck.reveal.ts` calls `executeVillainAbilities(...,
  'onAmbush')` only when `hasAmbush(...)` is true.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with
  the pre-WP baseline +N new tests (drift-detection, setup parser,
  executor, fire-site integration).
- [ ] No `@legendary-arena/registry` or `boardgame.io` import in any
  new file (verified by grep at verification time).
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Build & test the engine
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test

# Layer-boundary greps (must each return zero matches)
grep -rn "@legendary-arena/registry" packages/game-engine/src/rules/villainAbility.types.ts
grep -rn "@legendary-arena/registry" packages/game-engine/src/setup/villainAbility.setup.ts
grep -rn "@legendary-arena/registry" packages/game-engine/src/villain/villainEffects.execute.ts
grep -rn "boardgame.io" packages/game-engine/src/rules/villainAbility.types.ts
grep -rn "boardgame.io" packages/game-engine/src/villain/villainEffects.execute.ts

# Confirm the hardcoded gainWound loop is gone (must return zero matches)
grep -n "gained a wound from Ambush" packages/game-engine/src/villainDeck/

# Confirm executeVillainAbilities is wired at both fire sites
grep -n "executeVillainAbilities" packages/game-engine/src/moves/fightVillain.ts
grep -n "executeVillainAbilities" packages/game-engine/src/villainDeck/villainDeck.reveal.ts

# Drift-detection tests must pass
pnpm --filter @legendary-arena/game-engine test --grep "VILLAIN_ABILITY_TIMINGS"
pnpm --filter @legendary-arena/game-engine test --grep "VILLAIN_EFFECT_KEYWORDS"

# Full monorepo build
pnpm -r build
```

Expected outputs: each `grep` for `@legendary-arena/registry` and
`boardgame.io` in the named files returns nothing; the
`"gained a wound from Ambush"` grep returns nothing; the
`executeVillainAbilities` grep returns one match in each of the two
fire-site files; both drift-detection tests pass.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` updated with what changed (one
  `### WP-185 Executed` block + dated entry summarizing engine
  surface, MVP vocabulary, deleted hardcode, file count).
- [ ] `docs/ai/DECISIONS.md` updated with **D-18501..D-18504**
  (proposed):
  - D-18501: New `VillainAbilityHook` table parallels
    `HeroAbilityHook` shape rather than reusing the global
    `HookRegistry`; rationale = direct cardId dispatch, no
    handler-side `payload.cardId === sourceId` filtering.
  - D-18502: MVP effect vocabulary locked to 5 keywords; expansion
    requires future WP.
  - D-18503: Auto-resolution of `koHeroCurrentPlayer` is
    deterministic (lowest VP in discard, then hand); interactive
    choice deferred.
  - D-18504: Deletion of the hardcoded `gainWound` Ambush
    placeholder (`villainDeck.reveal.ts:203-228`) supersedes the
    D-2403 safe-skip note for the Ambush case specifically.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-185 flipped
  to `[x]` with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-212
  flipped to `Done`.
- [ ] No files outside the 10-file `## Files Expected to Change`
  list were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §22 (Replay determinism), §10 (Card-data semantics).

**Conflict assertion:** No conflict. This WP makes the engine behave
**more** faithfully to the printed Marvel Legendary cards by executing
ability text that was previously dead code. The MVP vocabulary scope is
acknowledged in §Out of Scope and §Non-Negotiable Constraints — the WP
does not claim full coverage of all printed Fight: / Ambush: text.

**Non-Goal proximity check:** None of NG-1..NG-7 are crossed. This is a
pure engine correctness change — no PvP framing, no monetization
surface, no scoring/leaderboard impact, no UI gating beyond the
existing turn flow.

**Determinism preservation:** All new code paths are deterministic.
`koHeroCurrentPlayer` auto-resolution sorts by VP using a stable
total-order tie-break (VP ascending, then ext_id lexically) — same
seed + same moves = same KO target every replay. No new `ctx.random.*`
sites introduced. The setup parser is a pure function of registry
input. The executor reads only `G` and emits only `G` mutations via
existing zone helpers.

---

## Funding Surface Gate

N/A — engine-only WP; no §20.1 trigger surfaces touched (no global
navigation funding affordance, no registry-viewer surface, no profile
funding attribution, no tournament integration, no user-visible donate
copy).

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
| 2 | Assumes lists all prerequisites with status | ✅ |
| 3 | Context (Read First) is specific (file paths + sections) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract; 10 files (engine + tests) | ✅ |
| 6 | Non-Negotiable Constraints section present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria are testable bullets | ✅ |
| 8 | Verification Steps are operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — no registry/boardgame.io imports in pure helpers | ✅ |
| 11 | Identity model N/A — no auth surface | N/A |
| 12 | Test rules: node:test only, makeMockCtx, no boardgame.io/testing | ✅ |
| 13 | pnpm commands only; expected output shown | ✅ |
| 14 | Acceptance ≤ 13 binary items; specific filenames + token greps | ✅ |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX / scope-bound | ✅ |
| 16 | Code style: full English names, JSDoc, no .reduce in effect application | ✅ |
| 17 | Vision Alignment present; clauses §1 / §2 / §10 / §22; determinism line included | ✅ |
| 18 | Prose-vs-grep: §Verification Steps grep targets are scoped to filenames, not raw tokens like Math.random | ✅ |
| 19 | Bridge-vs-HEAD staleness rule — commit-time discipline | N/A |
| 20 | Funding surface N/A with explicit justification | ✅ |
| 21 | API catalog N/A with explicit justification | ✅ |

---

*Drafted: 2026-05-27. Baseline `origin/main @ 0e2558f`. Paired with
WP-186 (Escape + Overrun).*
