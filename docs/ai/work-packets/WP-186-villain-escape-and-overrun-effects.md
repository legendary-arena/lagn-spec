# WP-186 — Villain & Henchman Escape + Overrun Effects (Engine)

## Goal

Extend WP-185's villain-ability hook infrastructure to execute card-text-driven
`Escape:` and `Overrun:` effects when a villain or henchman escapes the City
(pushed off the escape edge during reveal) or when a scheme-driven overrun
event triggers. After this WP, a villain that reads
`Escape: Each player gains a Wound and KOs a card` will execute those effects
when it escapes — currently the engine only increments the escape counter,
moves the card to `G.escapedPile`, releases attached bystanders, and applies
the generic per-escape wound to the current player. The new path adds a single
`executeVillainAbilities(..., 'onEscape')` call in the existing escape branch
of `villainDeck.reveal.ts`, gated by detection of `Escape:` ability text on
the escaping card.

---

## Assumes

- **WP-185 ✅ (paired hard-dep)** — Villain ability hook table
  (`G.villainAbilityHooks`), setup-time parser
  (`buildVillainAbilityHooks`), executor (`executeVillainAbilities`),
  MVP effect vocabulary, and the `VILLAIN_ABILITY_TIMINGS` / 
  `VILLAIN_EFFECT_KEYWORDS` canonical arrays must all be landed
  before WP-186 starts. This WP **extends** those types — it does
  not redefine them.
- WP-009A / WP-009B / WP-014A / WP-014B / WP-015 ✅ — escape pipeline
  exists (`villainDeck.reveal.ts` lines 153-201 handle the
  `pushResult.escapedCard !== null` branch).
- WP-017 ✅ — `gainWound`, `resolveEscapedBystanders` helpers exist.
- `data/cards/*.json` contains villain + henchman cards with `Escape:`
  and `Overrun:` ability text. Spot-check (2026-05-27): `Escape:`
  appears on >100 cards across all 40 sets; `Overrun:` appears on
  scheme cards (rare; the v1 vocabulary handles the villain-card
  subset only — scheme `Overrun:` may safely no-op until a future
  scheme-text WP).
- **Drafting baseline:** `origin/main @ 0e2558f` (2026-05-27).

---

## Context (Read First)

- **WP-185** — full WP body; this WP reuses every primitive WP-185
  introduces. Do not duplicate or re-derive any locked value.
- `docs/ai/ARCHITECTURE.md §Section 4 — boardgame.io Runtime Model`
  (Move Validation Contract, Canonical Reveal → Fight → Side-Effect
  Ordering) — moves never throw; rule effects observed after physical
  state mutation.
- `docs/ai/ARCHITECTURE.md §Section 1 — Layer Boundary (Authoritative)`
  — Game Engine layer; no registry runtime import.
- `docs/ai/REFERENCE/00.6-code-style.md` — full English names; JSDoc;
  explicit `// why:` comments; no `.reduce()` in zone/effect application.
- `docs/ai/DECISIONS.md` — scan D-18501..D-18504 (the WP-185 lock set);
  D-2403 (effect-type gap safe-skip).
- `.claude/rules/architecture.md` + `.claude/rules/code-style.md` +
  `.claude/skills/legendary-game-engine/SKILL.md`.
- `packages/game-engine/src/rules/villainAbility.types.ts`
  (WP-185 output) — the union being extended.
- `packages/game-engine/src/setup/villainAbility.setup.ts`
  (WP-185 output) — the parser being extended.
- `packages/game-engine/src/villain/villainEffects.execute.ts`
  (WP-185 output) — the executor; this WP adds **no new effect
  keywords**, only a new timing branch.
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts`
  — the escape branch (`pushResult.escapedCard !== null`, lines
  153-201 in pre-WP-185 baseline; lines may shift after WP-185 lands
  but the structural location is the escape branch within the
  villain/henchman city-routing block).

---

## Context

WP-185 covers `Fight:` (defeated) and `Ambush:` (city entry) — the two
trigger sites that fire on the **active** villain card. Escape is the
third trigger in the canonical "Reveal → Fight → Side-Effect" ordering
(ARCHITECTURE.md §Canonical Reveal → Fight → Side-Effect Ordering):
when a villain is pushed off the escape edge during a new reveal, it
becomes an escape event. The existing code already handles the
mechanical consequences of escape:

- Increment `G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS]` by 1
- Append the escaped card to `G.escapedPile`
- Current player gains 1 wound (the generic escape-wound rule)
- Attached bystanders released to `G.piles.bystanders`

What's missing: the card-specific `Escape:` ability text. Example escape
texts from real data (2026-05-27 grep):

- `"Escape: Each player gains a Wound."`
- `"Escape: KO one of your Heroes."`
- `"Escape: Put the top card of the Hero Deck into the Escape Pile."`
- `"Escape: [keyword:Cyber-Mod][hc:strength]: Each player gains a Wound."`
- `"Overrun: [Some scheme-specific effect]"`

The WP-185 MVP effect vocabulary already covers the structured subset of
these. WP-186 adds **only the new timing label** (`'onEscape'`) plus a
new fire site (within the existing escape branch of
`villainDeck.reveal.ts`). No new effect keywords are introduced. No
parser changes beyond detecting the `Escape:` / `Overrun:` prefixes (the
same markup-extraction logic from WP-185 applies).

`Overrun:` is handled as a **synonym** of `Escape:` for v1: both prefixes
emit hooks with `timing: 'onEscape'`. This is a pragmatic v1 choice — the
real `Overrun:` text on scheme cards has additional semantics not
expressible in the MVP vocabulary, so it safely no-ops at the executor
anyway. A future scheme-text WP can introduce `'onOverrun'` as a distinct
timing if scheme-side handling needs to diverge.

---

## Scope (In)

- **Extend `VILLAIN_ABILITY_TIMINGS`** —
  `VillainAbilityTiming = 'onAmbush' | 'onFight' | 'onEscape'` and
  `VILLAIN_ABILITY_TIMINGS = ['onAmbush', 'onFight', 'onEscape']`.
  Bidirectional drift-detection test extended to cover the new entry.
- **Extend setup parser** —
  `villainAbility.setup.ts` detects ability lines starting with
  `Escape:` OR `Overrun:` (both emit hooks with
  `timing: 'onEscape'` — v1 synonym lock). Same `[icon:]` /
  `[keyword:]` markup extraction logic from WP-185.
- **New fire site** — `villainDeck.reveal.ts` escape branch (inside
  `if (pushResult.escapedCard !== null) { ... }`): after the existing
  bystander-release step, call
  `executeVillainAbilities(G, { ctx }, pushResult.escapedCard, 'onEscape')`.
  The existing generic escape-wound (current player gains 1 wound) is
  preserved; the new call layers card-specific Escape: effects on top.
- **No new effect keywords** — the executor (`villainEffects.execute.ts`)
  is unchanged. All MVP effects (`gainWoundEachPlayer`,
  `gainWoundCurrentPlayer`, `koHeroCurrentPlayer`,
  `heroDeckTopToEscape`, `captureBystander`) work as-is for the
  `onEscape` timing because they target G state that exists at the
  escape moment.
- **`captureBystander` semantics under `onEscape`** — the escape branch
  fires AFTER `resolveEscapedBystanders` has already released attached
  bystanders for the escaping card. If an Escape: text says
  `captureBystander`, the effect attaches one bystander from the supply
  to the **escaping card** (now in `G.escapedPile`). This is a v1
  scope choice: the captured bystander effectively follows the card
  out of the city. A future WP can refine this if printed cards
  require different semantics.
- **Unit tests** — drift-detection for the extended timing union;
  setup-parser tests for `Escape:` + `Overrun:` detection and
  `onEscape` emission; executor test for `onEscape` dispatch via
  direct call on mock G; fire-site integration test that escapes a
  villain with `Escape: Each player gains a Wound` and asserts the
  generic escape-wound plus the per-player ambush-style wound both
  apply.
- **STATUS.md entry**, **DECISIONS.md entries** (D-18601..D-18603),
  **WORK_INDEX.md flip to `[x]`**, **EC-213 flip to Done**.

## Out of Scope

- **`Fight:` and `Ambush:` effects** — WP-185 scope, already landed.
- **New effect keywords beyond the WP-185 MVP vocabulary** — adding a
  sixth keyword requires a separate vocabulary-expansion WP.
- **Distinct `'onOverrun'` timing label** — v1 lock: `Overrun:` is a
  synonym of `Escape:` (both emit `onEscape` hooks).
- **Scheme card `Overrun:` semantics** — scheme cards have richer
  Overrun behavior tied to scheme setup; out of scope for villain
  ability hooks.
- **Order-of-operations changes within the escape branch** — bystander
  release, escape-wound, escape-pile append, and counter increment
  ordering is preserved exactly. The new fire site is appended **after**
  the existing branch body.
- **Refining `captureBystander` semantics under escape** — v1 attaches
  to the escaped card (now in `G.escapedPile`); refinement deferred.
- **Mastermind escape / overrun text** — mastermind cards don't
  escape via the City; out of scope.
- **Interactive player choice** — same MVP discipline as WP-185;
  `koHeroCurrentPlayer` auto-resolution is deterministic.
- **Changes to `G.cardKeywords` or `BoardKeyword` union** — escape
  detection runs from ability-text prefix matching at setup, NOT
  from a new board keyword. No `escape` keyword is added to
  `BOARD_KEYWORDS`.
- **`PatternFilter.vue` / registry-viewer surfaces** — WP-184 territory.

---

## Files Expected to Change

1. `packages/game-engine/src/rules/villainAbility.types.ts` —
   **modified** — extend `VillainAbilityTiming` union to include
   `'onEscape'`; extend `VILLAIN_ABILITY_TIMINGS` canonical array to
   include `'onEscape'` (in canonical order:
   `['onAmbush', 'onFight', 'onEscape']`).
2. `packages/game-engine/src/setup/villainAbility.setup.ts` —
   **modified** — extend the prefix-detection switch to recognize
   `Escape:` and `Overrun:` (both emit hooks with
   `timing: 'onEscape'`). No new helpers; reuse existing
   markup-extraction logic.
3. `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
   **modified** — inside the existing
   `if (pushResult.escapedCard !== null) { ... }` block, append one
   line: `executeVillainAbilities(G, { ctx }, pushResult.escapedCard,
   'onEscape');` after the bystander-release step. No reordering of
   the existing branch body.
4. `packages/game-engine/src/rules/villainAbility.types.test.ts` —
   **modified** — drift-detection assertions extended to the
   three-entry timing array.
5. `packages/game-engine/src/setup/villainAbility.setup.test.ts` —
   **modified** — add tests for `Escape:` and `Overrun:` detection;
   confirm both emit `timing: 'onEscape'`; per-card and group-level
   shapes both covered.
6. `packages/game-engine/src/villain/villainEffects.execute.test.ts`
   — **modified** — add `onEscape` dispatch tests covering each MVP
   effect keyword via the new timing.
7. `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts`
   — **modified** — add an integration test: reveal a villain with
   `Escape:` text such that pushing into the City escapes a prior
   occupant; assert the prior occupant's Escape: effects fire AND
   the generic escape-wound + bystander release both still occur.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. **No diffs. No
  snippets. No "show only the changed section."** Output that omits
  unchanged sections is rejected.
- ESM only, Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- All randomness via `ctx.random.*`. **No `Math.random()`, no clocks,
  no I/O.**
- `G` is JSON-serializable.
- Moves never throw. Only `Game.setup()` may throw.
- No `@legendary-arena/registry` import from
  `packages/game-engine`.
- No `boardgame.io` import in pure helpers.

**Packet-specific:**

- This WP extends **only the timing union** —
  `VILLAIN_EFFECT_KEYWORDS` stays at 5 entries; no new effect
  keywords. Adding one is a vocabulary-expansion WP, not WP-186.
- `Overrun:` is a v1 **synonym** of `Escape:` — both prefixes emit
  hooks with `timing: 'onEscape'`. The parser MUST NOT introduce
  an `'onOverrun'` timing.
- The fire site call is **appended** within the existing escape
  branch body. The ordering of the pre-existing operations
  (counter increment → push to `G.escapedPile` → generic wound →
  bystander release) is preserved exactly. The new
  `executeVillainAbilities(..., 'onEscape')` call comes **after**
  `resolveEscapedBystanders`.
- The generic per-escape wound for the current player (WP-015
  legacy behavior) is **preserved**. The new card-specific
  Escape: effects layer on top — they do not replace the generic
  wound.
- `captureBystander` under `onEscape` attaches one bystander from
  the supply pile to the **escaped card** (now in
  `G.escapedPile`). This is intentional v1 behavior.
- Per-copy hook objects are freshly constructed for every
  card-instance ext_id (mirrors D-13502 / WP-185 §Non-Negotiable
  Constraints).
- The drift-detection test extension is mandatory — the
  three-entry array must match the three-member union bidirectionally.

**Session protocol:**

- If WP-185 is not landed (no `G.villainAbilityHooks` field, no
  `executeVillainAbilities` export), stop and report `BLOCKED:
  requires WP-185`.
- If during execution a real `Escape:` card text falls outside the
  MVP effect vocabulary, the executor safely no-ops AND the parser
  emits a hook with empty `effects: []`. Do NOT extend the
  vocabulary mid-session.
- If a printed card's `Overrun:` semantics differ materially from
  its `Escape:` cousin and require a distinct timing, the fix is
  a future scheme-text WP — not an inline amendment.

**Locked contract values:**

```typescript
export type VillainAbilityTiming = 'onAmbush' | 'onFight' | 'onEscape';

export const VILLAIN_ABILITY_TIMINGS: readonly VillainAbilityTiming[] = [
  'onAmbush',
  'onFight',
  'onEscape',
] as const;

// VILLAIN_EFFECT_KEYWORDS is UNCHANGED from WP-185 (5 entries).
// VillainAbilityHook interface shape is UNCHANGED.
```

Parser prefix detection (locked):

```typescript
// Prefix → timing map (case-sensitive; structured markup precedes any keyword body)
//   "Ambush:"  → 'onAmbush'   (WP-185)
//   "Fight:"   → 'onFight'    (WP-185)
//   "Escape:"  → 'onEscape'   (WP-186)
//   "Overrun:" → 'onEscape'   (WP-186 — v1 synonym)
```

---

## Acceptance Criteria

- [ ] `VillainAbilityTiming` and `VILLAIN_ABILITY_TIMINGS` are exact
  three-entry siblings — drift-detection test passes.
- [ ] `VILLAIN_EFFECT_KEYWORDS` count is unchanged at 5 entries (no
  new keywords introduced by this WP).
- [ ] `buildVillainAbilityHooks` detects `Escape:` ability lines and
  emits hooks with `timing: 'onEscape'`.
- [ ] `buildVillainAbilityHooks` detects `Overrun:` ability lines and
  emits hooks with `timing: 'onEscape'` (synonym lock).
- [ ] When a villain card with `Escape: Each player gains a Wound`
  text escapes the City during a reveal, every player's discard pile
  increments by 1 wound **in addition** to the existing generic
  escape-wound for the current player.
- [ ] When an `Escape:` card's effect text falls outside the MVP
  vocabulary, the executor no-ops silently — the generic escape
  behavior (counter increment, escape-pile push, generic wound,
  bystander release) is unchanged.
- [ ] The ordering of the pre-existing escape branch is preserved:
  counter increment → push to `G.escapedPile` → generic
  current-player wound → bystander release → **new** card-specific
  effects. (Asserted by integration test.)
- [ ] `villainDeck.reveal.ts` contains exactly one
  `executeVillainAbilities` call inside the escape branch (and the
  WP-185 Ambush call inside the City-entry branch — total two calls
  in this file after both WPs land).
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with
  the post-WP-185 baseline +N new tests.
- [ ] No `@legendary-arena/registry` or `boardgame.io` import in any
  modified file (verified by grep).
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Build & test the engine
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test

# Layer-boundary greps (must each return zero matches in modified files)
grep -n "@legendary-arena/registry" packages/game-engine/src/rules/villainAbility.types.ts
grep -n "@legendary-arena/registry" packages/game-engine/src/setup/villainAbility.setup.ts
grep -n "boardgame.io" packages/game-engine/src/rules/villainAbility.types.ts

# Confirm new timing entry
grep -n "'onEscape'" packages/game-engine/src/rules/villainAbility.types.ts

# Confirm Escape: and Overrun: prefix detection
grep -n "'Escape:'" packages/game-engine/src/setup/villainAbility.setup.ts
grep -n "'Overrun:'" packages/game-engine/src/setup/villainAbility.setup.ts

# Confirm new fire site (2 executeVillainAbilities calls in reveal.ts: one onAmbush, one onEscape)
grep -c "executeVillainAbilities" packages/game-engine/src/villainDeck/villainDeck.reveal.ts
# Expected: 2

# Confirm effect-keyword vocabulary unchanged (still 5 entries)
grep -c "VILLAIN_EFFECT_KEYWORDS" packages/game-engine/src/rules/villainAbility.types.ts
# Expected: 2 (one type declaration + one canonical array)

# Drift-detection test
pnpm --filter @legendary-arena/game-engine test --grep "VILLAIN_ABILITY_TIMINGS"

# Full monorepo build
pnpm -r build
```

Expected outputs: registry / boardgame.io greps return nothing; the
`'onEscape'` grep returns one or more matches; the prefix greps each
return one match; the `executeVillainAbilities` grep returns `2`; the
`VILLAIN_EFFECT_KEYWORDS` grep returns `2`; drift-detection test
passes.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` updated with `### WP-186 Executed` block —
  one paragraph summarizing the timing union extension, the new
  fire site, and the `Overrun:`/`Escape:` synonym lock.
- [ ] `docs/ai/DECISIONS.md` updated with **D-18601..D-18603**
  (proposed):
  - D-18601: `'onEscape'` added to `VILLAIN_ABILITY_TIMINGS` (third
    entry). Extends the WP-185 lock under D-18501.
  - D-18602: `Overrun:` is a v1 synonym of `Escape:` — both prefixes
    emit `timing: 'onEscape'` hooks. Rationale: real `Overrun:` text
    on scheme cards has additional semantics outside MVP scope;
    villain-card `Overrun:` text is rare and behaves identically.
  - D-18603: `captureBystander` under `onEscape` attaches to the
    escaped card (now in `G.escapedPile`). Rationale: the captured
    bystander effectively follows the card out of the city; future
    WP may refine.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-186 flipped
  to `[x]` with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-213
  flipped to `Done`.
- [ ] No files outside the 7-file `## Files Expected to Change`
  list were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §22 (Replay determinism), §10 (Card-data semantics).

**Conflict assertion:** No conflict. This WP extends WP-185's
faithfulness improvement to the third major villain-card trigger
(escape). MVP vocabulary scope is acknowledged in §Out of Scope.

**Non-Goal proximity check:** None of NG-1..NG-7 are crossed. Pure
engine correctness change.

**Determinism preservation:** All new code paths are deterministic.
The escape branch is already deterministic (no `ctx.random.*` calls
introduced or removed). The new `executeVillainAbilities` call reuses
the deterministic auto-resolution from WP-185 (`koHeroCurrentPlayer`
VP-ascending sort + ext_id lexical tie-break). No new randomness sites.

---

## Funding Surface Gate

N/A — engine-only WP; no §20.1 trigger surfaces touched.

---

## API Catalog Update

N/A — engine-only WP; no HTTP endpoints or
`apps/server/src/**` library functions touched.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites; WP-185 marked as hard-dep | ✅ |
| 3 | Context (Read First) is specific (file paths + sections) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract; 7 files (all engine + tests) | ✅ |
| 6 | Non-Negotiable Constraints section present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria are testable bullets | ✅ |
| 8 | Verification Steps are operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved | ✅ |
| 11 | Identity model N/A | N/A |
| 12 | Test rules: node:test only | ✅ |
| 13 | pnpm commands only; expected output shown | ✅ |
| 14 | Acceptance ≤ 12 binary items; specific filenames + counts | ✅ |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX / scope-bound | ✅ |
| 16 | Code style: full English names, JSDoc, no .reduce | ✅ |
| 17 | Vision Alignment present; clauses cited; determinism line included | ✅ |
| 18 | Prose-vs-grep: §Verification Steps grep targets are scoped to filenames | ✅ |
| 19 | Bridge-vs-HEAD staleness — commit-time discipline | N/A |
| 20 | Funding surface N/A with justification | ✅ |
| 21 | API catalog N/A with justification | ✅ |

---

*Drafted: 2026-05-27. Baseline `origin/main @ 0e2558f`. Paired with
WP-185. Hard-dep: WP-185 must land before WP-186 starts.*
