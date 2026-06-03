# WP-202 — Villain Effect Vocabulary Expansion: Magnitude-N Each-Player-KO (Engine + Data)

## Goal

Add one new villain-effect keyword — `koHeroEachPlayerMag2` — so the engine
and card-data tooling can represent and execute the printed Escape text
`"Each player KOs two of their Heroes."` without widening the marker
grammar or dispatch contract.

This WP extends the existing WP-189 / WP-190 each-player-KO pattern by:

1. appending `koHeroEachPlayerMag2` to the closed `VillainEffectKeyword`
   vocabulary at position 7,
2. adding an executor branch that loops exactly 2 times per player and
   delegates each iteration to the existing shared
   `koOneHeroForPlayer(G, playerId)` resolver, and
3. curating the two unconditional unfiltered Destroyer Escape lines in
   the 40-set corpus with `[effect:koHeroEachPlayerMag2]`.

**Invariant:** after execution, the total corpus-wide occurrence count of
`[effect:koHeroEachPlayerMag2]` in `data/cards/` MUST equal exactly **2**
— one on `core/enemies-of-asgard/destroyer` and one on
`msp1/enemies-of-asgard/destroyer`. Verified by
`grep -r "\[effect:koHeroEachPlayerMag2\]" data/cards/ | wc -l` = 2.

> **Terminology convention.** This WP uses the canonical noun phrase
> **"magnitude-2 each-player hero KO"** for the shape being introduced.
> **Position N** uses 1-based human-facing indexing (the new keyword is
> at "position 7"); **index N** uses 0-based code-facing indexing (the
> drift test asserts `VILLAIN_EFFECT_KEYWORDS[6] === 'koHeroEachPlayerMag2'`).
> The conversion is `index === position - 1`.

---

## Assumes

- **WP-185 ✅ (hard-dep — engine infrastructure).** `VillainEffectKeyword`
  union, `VILLAIN_EFFECT_KEYWORDS` canonical array, executor's per-keyword
  dispatch, and the shared `koOneHeroForPlayer(G, playerId)` resolver all
  exist. Landed.
- **WP-187 ✅ (hard-dep — overlay script).** `apply-effect-markers.mjs` +
  `villain-effect-markers.json` + the local `VILLAIN_EFFECT_KEYWORDS` copy +
  the `--propose` heuristic table all exist. Landed.
- **WP-188 ✅ (hard-dep — escape timing support).** `SUPPORTED_TIMINGS`
  already includes `escape`/`overrun` so the two magnitude-2 Escape lines
  can be matched. Landed. Also authored the `_unassigned` rows under
  `reason: "no-vocabulary-keyword"` (D-18802) that this WP partially
  resolves.
- **WP-189 ✅ (hard-dep — `koHeroEachPlayer` engine keyword + shared
  resolver).** The shared `koOneHeroForPlayer(G, playerId)` resolver this
  WP iterates is the one WP-189 introduced/repurposed; the
  append-only-position-N pattern this WP extends is the one WP-189 locked
  (D-18901). Landed at `bf61d82`.
- **WP-190 ✅ (hard-dep — overlay script's local six-keyword array).**
  Position 6 already carries `koHeroEachPlayer`; this WP appends position
  7. The hand-sync convention (D-19002) is the load-bearing guardrail.
  Landed.
- **WP-191 ✅ (hard-dep — ext_id grammar reconciliation).** Villain
  ability hooks key by the copy-indexed instance ext_id, so the new
  magnitude-2 markers on `core/destroyer` + `msp1/destroyer` actually
  fire end-to-end. Landed.
- **Data finding (verified empirically 2026-06-02 via
  `grep -rhE "Each player KOs (two|three|four|five) [^.]+\." data/cards/ |
  sort -u`).** The closed list of magnitude>1 each-player hero KO lines in the
  40-set corpus is:
  - `"Ambush: Each player KOs two Heroes from their discard pile."`
    (`core/brotherhood/juggernaut`) — magnitude-2 BUT source-filtered to
    discard. **Out of scope** (filtered).
  - `"Escape: Each player KOs two Henchmen from their Victory Pile or
    gains a Wound."` (`2099/false-aesir-of-alchemax/hela-2099`) —
    magnitude-2 BUT targets Henchmen not Heroes AND a choice clause AND
    a victory-pile source. **Out of scope** (wrong target + choice +
    filtered).
  - `"Escape: Each player KOs two Heroes from their hand."`
    (`core/brotherhood/juggernaut`) — magnitude-2 BUT source-filtered to
    hand. **Out of scope** (filtered).
  - `"Escape: Each player KOs two of their Heroes."`
    (`core/enemies-of-asgard/destroyer`) — **CURATABLE** ✅ clean
    magnitude-2 each-player hero KO, no source/class/team filter,
    no choice, no compound clause.
  - `"Escape: Each player KOs two of their Heroes."`
    (`msp1/enemies-of-asgard/destroyer`) — **CURATABLE** ✅ same shape.

  **Net curatable yield: 2 Escape markers across 2 cards across 2 sets.**
  No N≥3 line exists in the corpus. The other three rows stay in
  `_unassigned` (they need predicate machinery — source-gate, target-gate,
  choice-resolution — that the MVP defers).
- **Audit-scope clarification (read before §Why now).** This WP references
  two related but **distinct** audit sets, and conflating them is the
  most likely execution misread:
  1. **The D-18802 Escape-side `no-vocabulary-keyword` ledger (6 rows).**
     WP-188 recorded these exhaustively; WP-190 audited and promoted
     0 of 6 (Fight-side only). WP-202 promotes **2 of 6** (the two
     Destroyer Escape rows) and leaves the other 4 deferred
     (`hela-2099`, `juggernaut`, `bullseye`, `ultimaton-weapon-xv` —
     each blocked by an additional qualifier the MVP defers).
  2. **The corpus-wide magnitude>1 each-player hero KO scan.** This is the
     wider grep across all 40 sets for any timing prefix; it surfaces
     out-of-scope non-Escape rows such as `core/brotherhood/juggernaut`'s
     **Ambush** line (`"Ambush: Each player KOs two Heroes from their
     discard pile."`). The corpus scan informs the closed-union
     choice (no N≥3 lines exist) and pins zero Ambush/Fight/Overrun
     yield in §Acceptance Criteria, but it is NOT part of the 2-of-6
     Escape-ledger accounting. The Juggernaut Ambush row is
     source-filtered ("from their discard pile"); it is out of scope
     and stays in `_unassigned` under its existing `reason:
     "magnitude>1"` tag (WP-188 §_unassigned), not under the D-18802
     `no-vocabulary-keyword` ledger.

  When the WP / EC body says "2 of 6 promoted" it always means the
  D-18802 Escape ledger. When it says "zero Ambush/Fight/Overrun
  yield" it always means the corpus-wide scan.
- **Drafting baseline:** `origin/main @ b9d05d3` (2026-06-02).

---

## Context (Read First)

> **Line-number references are advisory at drafting time and are NOT
> normative.** Path + symbol name + grep anchor govern execution. If
> `main` has moved between draft and execute, re-verify with the grep
> commands embedded in the bullets below; do not patch by line number.


- **WP-189** (`docs/ai/work-packets/WP-189-villain-effect-koheroeachplayer-vocabulary.md`)
  — the engine half of `koHeroEachPlayer`; this WP extends the same union +
  canonical array + executor and follows the same shared-resolver +
  player-iteration discipline (D-18901, D-18902). Do not re-derive its
  locked values.
- **WP-190** (`docs/ai/work-packets/WP-190-villain-each-player-ko-marker-curation.md`)
  — the data half of `koHeroEachPlayer`; this WP follows the same overlay
  script + map + EXACT CURATION COUNT IS FIXED invariant + each-player ≠
  current-player hard separation (D-19001, D-19002).
- **WP-188** (`docs/ai/work-packets/WP-188-villain-escape-effect-marker-enrichment.md`)
  — recorded the `_unassigned` rows this WP partially promotes. D-18802 is
  the cross-WP audit anchor referenced here.
- `packages/game-engine/src/rules/villainAbility.types.ts` — `VillainEffectKeyword`
  union (6 entries) + `VILLAIN_EFFECT_KEYWORDS` canonical array (6 entries);
  the `// why:` comment above the array records the
  incremental-expansion governance clause (D-18901) that this WP further
  extends.
- `packages/game-engine/src/villain/villainEffects.execute.ts` — executor;
  the `koHeroEachPlayer` dispatch case (lines 163-186 on `main @ b9d05d3`)
  iterates `Object.keys(G.playerZones).sort()` and delegates each KO to
  `koOneHeroForPlayer(G, playerId)`. The new `koHeroEachPlayerMag2` case
  wraps that same iteration in an N=2 inner loop.
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — the
  shared-resolver parity + determinism test patterns; the new case follows
  the same shape.
- `scripts/convert-cards/apply-effect-markers.mjs` — overlay script.
  Key sites (line numbers verified against `main @ b9d05d3`):
  `VILLAIN_EFFECT_KEYWORDS` (line 71, local copy — append at position 7);
  `SUPPORTED_TIMINGS` (line 88, already includes escape — no change);
  `PROPOSE_HEURISTICS` (line 523, append a magnitude-2 heuristic).
  Re-verify at execution time:
  `grep -n "VILLAIN_EFFECT_KEYWORDS\|PROPOSE_HEURISTICS\|SUPPORTED_TIMINGS"
  scripts/convert-cards/apply-effect-markers.mjs`.
- `scripts/convert-cards/inputs/villain-effect-markers.json` — the
  curated marker map; add `escape: ["koHeroEachPlayerMag2"]` entries on
  the two Destroyer villains and remove their rows from `_unassigned`.
- `docs/ai/DECISIONS.md` — read **D-18501** (executor + 5-keyword lock,
  superseded by D-18901), **D-18503** (per-player KO resolution discipline
  this WP inherits unchanged), **D-18802** (the cross-WP audit anchor this
  WP partially resolves), **D-18901** (incremental-expansion governance
  clause this WP further extends), **D-18902** (shared-resolver +
  mutation-location lock + lexical player iteration), **D-19001**
  (EXACT CURATION COUNT IS FIXED invariant pattern + each-player ≠
  current-player hard separation), **D-19002** (overlay's local array is
  hand-synced; drift loud-fails).
- `docs/ai/ARCHITECTURE.md §Section 4 — boardgame.io Runtime Model` (Move
  Validation Contract, Rule Execution Pipeline) — moves never throw;
  effects mutate G via helpers, deterministically.
- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — Game Engine
  layer for the engine half; data-tooling upstream of the Registry layer
  for the data half.
- `docs/ai/REFERENCE/00.6-code-style.md` — no `.reduce()` in effect
  application; full English names; JSDoc; explicit `// why:` comments.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — `abilities: string[]`
  shape and canonical field names.
- `.claude/rules/architecture.md` + `.claude/rules/code-style.md` +
  `.claude/skills/legendary-game-engine/SKILL.md`.

---

## Why now

WP-189 / WP-190 closed the magnitude-1 unconditional unfiltered
each-player hero KO gap (4 Fight markers). The remaining D-18802
Escape-side deferral contains two clean unconditional unfiltered
Destroyer lines that are still inexpressible under the current
vocabulary:

- `core/enemies-of-asgard/destroyer`
- `msp1/enemies-of-asgard/destroyer`

Both print exactly:

`"Escape: Each player KOs two of their Heroes."`

These lines require no source predicate, no target predicate, no class
filter, and no choice machinery. They are therefore the smallest safe
next expansion: a single append-only keyword plus a literal-2 executor
loop that reuses the existing shared resolver. The other 4 D-18802
Escape rows + the corpus-wide Juggernaut Ambush row stay deferred —
each has an additional qualifier (source-filter, wrong target, choice,
class/stat-filter) the MVP defers. Parameterized markers
(`[effect:koHeroEachPlayer:N]`) are rejected for v1 (see §Out of Scope
+ D-20201): the regex shape change has a larger blast radius (parser +
dispatch contract + map shape + overlay validator + every drift test),
and the corpus shows only N=2 — so the closed-union approach
degenerates to exactly one new keyword for the v1 dataset.

---

## Scope (In)

### Engine half (mirrors WP-189 shape)

- **Extend `VillainEffectKeyword` union** — add `'koHeroEachPlayerMag2'` as
  the seventh member.
- **Extend `VILLAIN_EFFECT_KEYWORDS` canonical array** — append
  `'koHeroEachPlayerMag2'` at position 7 (end). The existing six entries
  and their order are byte-identical (WP-187/188/190's executed markers and
  the overlay script's hardcoded copy depend on positions 1-6 being
  unchanged). The drift-detection test extends to the seven-entry array ↔
  union bidirectional plus the append-only-invariant guard pinning
  positions 0-5 byte-identical to the post-WP-189 array.
- **Add the `koHeroEachPlayerMag2` executor branch** —
  `villain/villainEffects.execute.ts`: a new dispatch case in
  `applyVillainEffect`'s `switch (effect)` block that derives the player
  iteration from `Object.keys(G.playerZones).sort()` (identical to the
  `koHeroEachPlayer` branch) and runs an **inner loop of exactly 2
  iterations per player**, each delegating to the shared
  `koOneHeroForPlayer(G, playerId)` resolver. The branch body is a thin
  nested loop — the shared resolver owns target selection AND the `koCard`
  mutation. Returns `true` so WP-200's `appliedEffects[]` accumulator
  captures the keyword.
- **MANDATORY shared-resolver reuse — no duplicated logic.** Both the
  existing `koHeroCurrentPlayer` and `koHeroEachPlayer` branches and the
  new `koHeroEachPlayerMag2` branch MUST call the same
  `koOneHeroForPlayer(G, playerId)` resolver. A duplicated copy of the KO
  resolution logic in the magnitude-2 branch is **FAIL** (00.6 §16.1;
  D-18902 mutation-location lock extends to this branch). The resolver
  signature does not change.
- **Magnitude is a literal `2`, not a parameter** — the inner loop bound
  is the literal numeral `2` with a `// why:` citing D-20201 (the
  closed-union-per-magnitude decision). No `N: number` parameter, no
  config, no constant — keeping it literal makes future magnitude-3
  expansion a trivial copy-paste-and-edit of the entire case body, which
  is what the closed-union pattern is for. The branch's `// why:` MUST
  include a forward-looking extension-seam line (per EC-230 §Required
  `// why:` Comments) so the pattern is discoverable by code search
  without requiring a DECISIONS round-trip — e.g., *"Future magnitude-N
  expansion: copy this case body, rename to MagN, change literal `2` to
  N, append at next position; no parser/dispatch change per D-20201."*
- **Per-player KO semantics (locked, inherited from D-18503 + D-18902):**
  each iteration of the inner loop selects the next eligible hero from
  the player's zones via the shared resolver (discard before hand,
  `ext_id` lexical tie-break, silent no-op for zero eligible heroes).
  Two iterations on a player with only 1 eligible hero KO exactly one
  hero (the second iteration silent no-ops); two iterations on a player
  with zero eligible heroes silently no-op both times. Not VP-based.
  Not interactive.
- **Unit tests** — drift-detection updated to the seven-entry array ↔
  union; new executor tests for `koHeroEachPlayerMag2` covering:
  - **multi-player magnitude-2 KO** — two-player and three-player mock
    `G`: each player with ≥2 eligible heroes loses exactly 2 heroes;
    selection order obeys discard-then-hand priority and ext_id lexical
    within each zone;
  - **partial-eligibility per player** — a player with exactly 1 eligible
    hero loses exactly 1 (the second inner iteration silent no-ops); a
    player with zero eligible heroes loses 0 (both iterations silent
    no-op); a player with 3+ eligible heroes loses exactly 2 (the third
    is not touched);
  - **mixed eligibility across players** — one player loses 2, another
    loses 1, another loses 0 — all in the same dispatch, by deterministic
    rule;
  - **shared-resolver enforcement (behavioral)** — given a single-player
    `G` with ≥2 eligible heroes, dispatching `koHeroEachPlayerMag2`
    produces post-state equal (by deep equality across `G.ko`, every
    player zone, `G.attachedBystanders`, `G.messages`) to dispatching
    `koHeroEachPlayer` twice in sequence against fresh copies of the
    same `G`. This is the load-bearing parity guard;
  - **determinism (audit-exact)** — two dispatches against identical
    `G` produce identical per-player KO target `ext_id`s, identical
    `G.ko` mutation order, identical `G.messages` sequence (deep
    equality);
  - **non-regression** — `koHeroEachPlayer` (magnitude-1) regression
    test still passes byte-identical; `koHeroCurrentPlayer` regression
    test unchanged.

### Data half (mirrors WP-190 shape)

- **Extend the overlay's local keyword copy** —
  `apply-effect-markers.mjs`: append `'koHeroEachPlayerMag2'` to the local
  `VILLAIN_EFFECT_KEYWORDS` array (6 → 7), at position 7 to match the
  engine array byte-for-byte. Update the existing `// why:` to record the
  seventh keyword + cite D-20202 (the new hand-sync clause for position
  7).
- **Add a `--propose` heuristic** — append a `koHeroEachPlayerMag2`
  heuristic to `PROPOSE_HEURISTICS` keyed on the magnitude-2 each-player
  hero KO phrase (e.g. `/each\s+player[^.]*\bKOs?\s+two\s+[^.]*\bhero/i`).
  **`--propose` is advisory only. Committed curation is driven by the
  reviewed marker map, and WP-202 authorizes only the exact printed line
  `"Escape: Each player KOs two of their Heroes."` on the two Destroyer
  entries — no other line, no fuzzy acceptance, regardless of what
  `--propose` surfaces.** Any candidate beyond those two cards is
  out-of-scope by definition for this WP.
- **Mark the two unconditional unfiltered magnitude-2 Escape lines** —
  extend `villain-effect-markers.json`: add
  `escape: ["koHeroEachPlayerMag2"]` to the villain entries:
  - `villains/core/enemies-of-asgard/destroyer`
  - `villains/msp1/enemies-of-asgard/destroyer`

  Both villain cards' printed text is exactly `"Escape: Each player KOs
  two of their Heroes."`. Remove these two rows from `_unassigned` (they
  carry `reason: "no-vocabulary-keyword"` today; both are listed
  exhaustively in D-18802's verification block). The other four
  `no-vocabulary-keyword` rows (`hela-2099`, `juggernaut`, `bullseye`,
  `ultimaton-weapon-xv`) STAY in `_unassigned` — each has an additional
  qualifier (source-filter / wrong target / choice / class-filter) that
  WP-202 cannot express.
- **Re-run the overlay** — `data/cards/core.json` + `data/cards/msp1.json`
  gain `[effect:koHeroEachPlayerMag2]` on the matched Escape line; diff
  bounded to exactly 2 files, +1/-1 each; idempotent (second run = zero
  diff). WP-187/188/190 markers are untouched.
- **`_unassigned` post-curation hygiene** — append **exactly one** new
  `_notes` paragraph to the JSON top-level `_notes` array. The paragraph
  MUST state, in this order:
  - WP-202 promoted **2 of the 6** D-18802 Escape-side
    `no-vocabulary-keyword` rows.
  - The promoted rows are the two Destroyer Escape lines:
    `villains/core/enemies-of-asgard/destroyer` +
    `villains/msp1/enemies-of-asgard/destroyer`.
  - **4 rows remain deferred** under the same `reason:
    "no-vocabulary-keyword"` tag (WP-188 cross-WP audit anchor
    D-18802 preserved verbatim — no re-tagging).
  - The 4 remaining blockers, named explicitly:
    - `2099/false-aesir-of-alchemax/hela-2099` — wrong target
      (Henchmen not Heroes) + choice ("or gains a Wound") +
      filtered source (Victory Pile).
    - `core/brotherhood/juggernaut` (Escape) — filtered source
      ("from their hand").
    - `cvwr/csa-special-marshals/bullseye` — stat/class filter
      ("printed [icon:attack] of 2 or more").
    - `wpnx/weapon-plus/ultimaton-weapon-xv` — class filter
      ("non-grey Heroes").
  - Substantive re-tagging is deferred to a future
    predicate-machinery WP.

  Only the two newly-curated Destroyer rows are removed from
  `_unassigned`; the other 4 rows + their `reason` tag stay byte-identical.

### Governance

- **STATUS.md entry**, **DECISIONS.md entries** (D-20201..D-20203),
  **WORK_INDEX.md flip to `[x]`**, **EC-230 flip to Done**.

## Out of Scope

- **Parameterized markers (`[effect:koHeroEachPlayer:N]` or
  `[effect:koHeroEachPlayer:2]`).** Rejected for v1 — see D-20201
  rationale. The regex shape change has a larger blast radius: parser
  (`EFFECT_MARKER_PATTERN` would need a colon-split), executor dispatch
  contract (`effect` is currently a `VillainEffectKeyword` string —
  parameterized markers would force a struct shape `{ keyword, args }`),
  overlay validator, every drift test. The data shows only N=2 in the
  corpus; a closed-union add at position 7 is the smaller change.
- **`koHeroEachPlayerMag3` or higher.** No N≥3 each-player-KO line exists
  in the 40-set corpus (verified empirically 2026-06-02). The
  append-at-position-N pattern remains available if a future card ever
  needs it; this WP does not pre-add unused keywords.
- **Source-filtered each-player-KO** — "Each player KOs two Heroes from
  their hand" (Juggernaut Escape), "Each player KOs two Heroes from
  their discard pile" (Juggernaut Ambush). These need a source-gate
  predicate the MVP defers. They stay in `_unassigned`.
- **Target-filtered or wrong-target each-player-KO** —
  - `"Each player KOs two Henchmen from their Victory Pile or gains a
    Wound."` (Hela-2099) — targets Henchmen not Heroes, victory-pile
    source, plus a choice clause. Out of scope.
  - `"Each player KOs one of their Heroes that has printed [icon:attack]
    of 2 or more."` (Bullseye Escape) — class/stat-filter. Out of scope.
  - `"Each player KOs one of their non-grey Heroes."`
    (Ultimaton-Weapon-XV Escape) — class-filter. Out of scope.

  All four stay in `_unassigned`.
- **Conditional or-clauses** ("reveals X-Men Hero or gains a Wound" —
  Sabretooth shape; "or gains a Wound" choice clauses generally). Need
  choice-resolution machinery the MVP defers. Separate future WP.
- **Mystique-style "becomes a Scheme Twist" redirect.** Orthogonal
  mechanic (redirect, not KO). Separate future WP.
- **Filtered KOs by VP/cost** ("KO the Hero with the highest VP", "KO a
  Hero costing 3 or less"). Need predicate machinery + runtime card-stat
  reads. Separate future WP.
- **Magnitude variants of `koHeroCurrentPlayer`** ("KO two of your
  Heroes"). Out of scope — this WP closes the each-player magnitude-2
  gap only; current-player magnitude variants are a separate future WP.
- **Master Strike magnitude-2 lines** ("Master Strike: Each player KOs
  two non-grey Hero from their discard pile"). Run through the
  mastermind-strike system (WP-024), not the villain-ability hooks;
  `SUPPORTED_TIMINGS` does not include master-strike and this WP does not
  add it.
- **Modifying `apply-card-counts.mjs`, `convert-cards-v15.mjs`, or any
  other converter** — WP-202 touches only `apply-effect-markers.mjs` +
  its map.
- **Reordering the existing six keywords** — `koHeroEachPlayerMag2`
  appends at position 7; positions 1-6 are unchanged.
- **Changing `koHeroEachPlayer` or `koHeroCurrentPlayer` semantics** —
  both unchanged; this WP only reuses their shared resolver.

---

## Files Expected to Change

### Engine half (4 files)

1. `packages/game-engine/src/rules/villainAbility.types.ts` — **modified**
   — add `'koHeroEachPlayerMag2'` to the `VillainEffectKeyword` union;
   append it at position 7 of `VILLAIN_EFFECT_KEYWORDS`; update the
   array's `// why:` comment to record the magnitude-2 extension of the
   incremental-expansion governance clause (D-20201).
2. `packages/game-engine/src/villain/villainEffects.execute.ts` —
   **modified** — add the `koHeroEachPlayerMag2` dispatch branch in
   `applyVillainEffect`'s switch. The branch derives the player iteration
   from `Object.keys(G.playerZones).sort()` and runs an inner loop of
   literal `2` iterations per player, each calling
   `koOneHeroForPlayer(G, playerId)`. No change to the other six effect
   branches; no change to the shared resolver itself.
3. `packages/game-engine/src/rules/villainAbility.types.test.ts` —
   **modified** — drift-detection assertions updated to the seven-entry
   array ↔ union; append-only-invariant guard updated to pin positions
   0-5 byte-identical to the post-WP-189 array.
4. `packages/game-engine/src/villain/villainEffects.execute.test.ts` —
   **modified** — add `koHeroEachPlayerMag2` executor tests per §Scope
   (In). Existing `koHeroEachPlayer` + `koHeroCurrentPlayer` tests are
   unchanged.

### Data half (4 source files + governance)

5. `scripts/convert-cards/apply-effect-markers.mjs` — **modified** —
   append `'koHeroEachPlayerMag2'` to the local `VILLAIN_EFFECT_KEYWORDS`
   array (position 7); update its `// why:` to cite D-20202; add the
   `koHeroEachPlayerMag2` `--propose` heuristic. No change to
   `SUPPORTED_TIMINGS` (already includes `escape`); no change to the
   matching / append / loud-fail logic.
6. `scripts/convert-cards/inputs/villain-effect-markers.json` —
   **modified** — add `escape: ["koHeroEachPlayerMag2"]` to the villain
   entries `villains/core/enemies-of-asgard/destroyer` and
   `villains/msp1/enemies-of-asgard/destroyer`. Remove the two Destroyer
   `_unassigned` rows. Retain the other four `no-vocabulary-keyword` rows
   verbatim (hygiene per §Scope). Append a single `_notes` paragraph
   recording the 2-of-6 audit outcome.
7. `data/cards/core.json` — **modified, bounded to one line** — Destroyer
   villain's `"Escape: Each player KOs two of their Heroes."` line gains
   trailing ` [effect:koHeroEachPlayerMag2]`. +1/-1.
8. `data/cards/msp1.json` — **modified, bounded to one line** — same
   shape on the msp1 Destroyer. +1/-1.

   Any `data/cards/*.json` file outside `core.json` + `msp1.json` showing
   a diff is a **HARD FAIL — STOP, investigate, and do not commit.** The
   other 38 sets are untouched.

### Governance (4 files)

9. `docs/ai/STATUS.md` — **modified** — add `### WP-202 Executed` block
   per Definition of Done.
10. `docs/ai/DECISIONS.md` — **modified** — add D-20201..D-20203 per
    Definition of Done.
11. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — flip WP-202 row
    to `[x]` with completion date.
12. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip
    EC-230 row to `Done`.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. **No diffs. No
  snippets.** Output that omits unchanged sections is rejected.
- ESM only, Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — full English
  names, JSDoc on every function, `// why:` on non-obvious decisions, no
  `.reduce()` in effect application, explicit `for...of`.
- All randomness via `ctx.random.*`. **No `Math.random()`, no clocks, no
  I/O.** (This effect uses no randomness — magnitude-2 is a literal loop
  bound, not a draw.)
- `G` is JSON-serializable.
- Moves never throw. The executor returns `void` from individual effects
  and silently no-ops on a player with no eligible hero (per-iteration).
- No `@legendary-arena/registry` import; no `boardgame.io` import in pure
  helpers.
- The overlay is deterministic pure-IO over local files — no randomness,
  no clocks, no network.

**Packet-specific:**

- **EXACT CURATION COUNT IS FIXED — invariant.** Total
  `[effect:koHeroEachPlayerMag2]` occurrences across `data/cards/` after
  execution MUST equal exactly **2** — one each on the
  `"Escape: Each player KOs two of their Heroes."` line in `core.json`
  (Destroyer) and `msp1.json` (Destroyer). Any deviation (≠ 2) is a FAIL.
  Verified by `grep -r "\[effect:koHeroEachPlayerMag2\]" data/cards/ |
  wc -l` = 2.
- **One new keyword, append-only at position 7.** Vocabulary goes
  6 → 7 entries; `'koHeroEachPlayerMag2'` is appended at position 7
  (index 6); positions 1-6 (indices 0-5) stay byte-identical to the
  post-WP-189 array. Adding any other keyword (magnitude-3+,
  source-filtered, target-filtered, choice, parameterized) is a
  separate WP.
- **Magnitude is closed into the keyword, not parameterized at runtime
  (D-20201).** `koHeroEachPlayerMag2` executes with a literal inner-loop
  bound of `2`. No `N` parameter, lookup table, config, or parser
  argument is introduced. Future N≥3 expansion (if a card ever needs
  it) is a copy-paste-and-edit of the case body, not a parser/regex/
  dispatch-contract change.
- **Shared-resolver reuse is mandatory (D-18902 extends here).**
  `koHeroCurrentPlayer`, `koHeroEachPlayer`, and
  `koHeroEachPlayerMag2` MUST all delegate KO target selection AND KO
  mutation to the single shared `koOneHeroForPlayer(G, playerId)`
  resolver. Any duplicated resolution logic outside that resolver is a
  FAIL. Callers MUST NOT post-process or modify the resolver's output.
  Magnitude-2 ≡ magnitude-1-twice parity is pinned by the behavioral
  test under §Acceptance Criteria.
- **Player iteration is lexical-sorted (D-18902 inherited).** The
  `koHeroEachPlayerMag2` branch derives iteration order from
  `Object.keys(G.playerZones).sort()` (default string compare; no
  `Number()` conversion, no insertion-order reliance) — identical to
  the `koHeroEachPlayer` branch.
- **Per-player per-iteration semantics inherit D-18503 + D-18902
  unchanged** — discard before hand; `ext_id` lexical tie-break over
  non-wound cards; silent no-op for a player with zero eligible heroes
  (per iteration). NOT VP-based. NOT interactive.
- `koHeroCurrentPlayer` and `koHeroEachPlayer` are **behaviorally
  unchanged**.
- **Each-player ≠ current-player (semantic-corruption FAIL — extends
  D-19001).** `"each player KOs two …"` → `koHeroEachPlayerMag2` (this
  WP). `"KO two of your Heroes"` → not a magnitude variant of any
  current keyword (out of scope). Any conversion between these
  semantics is a **semantic corruption FAIL** — stop, do not commit.
- **Filtered / target-mismatched / choice variants stay in
  `_unassigned`.** Do NOT force `hela-2099` (target+choice),
  `juggernaut` (source-filter, both Ambush and Escape lines),
  `bullseye` (stat-filter), or `ultimaton-weapon-xv` (class-filter)
  onto `koHeroEachPlayerMag2`. Each requires predicate machinery the
  MVP defers; they remain under their existing `reason` tags.
- The overlay stays **idempotent per-keyword** and **loud-fails** on
  unknown keyword / missing entity / zero-or-multiple matching timing
  lines — unchanged from WP-187/188/190.
- WP-187/188/190 markers are **untouched**; a re-run is additive-only.
- WP-202 modifies **no** converter other than `apply-effect-markers.mjs`,
  and **no** engine file other than the four listed in §Files Expected
  to Change.

**Session protocol:**

- If WP-189 has not executed (no `koHeroEachPlayer` in the engine
  vocabulary, no shared `koOneHeroForPlayer` resolver), stop and report
  `BLOCKED: WP-189`.
- If WP-190 has not executed (no `koHeroEachPlayer` in the overlay's
  local array, no position-6 marker), stop and report `BLOCKED: WP-190`
  — the local array would skip from 5 → 7 and the
  append-only-position-N pattern would break.
- If a `--propose` magnitude-2 candidate has a source-filter, target
  qualifier, class-filter, or choice clause, leave it in `_unassigned`.
  Do not guess; do not stretch it onto `koHeroEachPlayerMag2`.
- If a real card needs magnitude-3 each-player-KO semantics (none exist
  in the corpus today), that is out of scope for WP-202 — stop and draft
  a follow-up WP. Do not pre-add `koHeroEachPlayerMag3` speculatively.

**Locked contract values:**

```typescript
export type VillainEffectKeyword =
  | 'gainWoundEachPlayer'
  | 'gainWoundCurrentPlayer'
  | 'koHeroCurrentPlayer'
  | 'heroDeckTopToEscape'
  | 'captureBystander'
  | 'koHeroEachPlayer'
  | 'koHeroEachPlayerMag2'; // WP-202 — appended at position 7

export const VILLAIN_EFFECT_KEYWORDS: readonly VillainEffectKeyword[] = [
  'gainWoundEachPlayer',
  'gainWoundCurrentPlayer',
  'koHeroCurrentPlayer',
  'heroDeckTopToEscape',
  'captureBystander',
  'koHeroEachPlayer',
  'koHeroEachPlayerMag2',
] as const;
```

**Locked overlay-script local copy (mirrors engine — D-20202):**

```javascript
const VILLAIN_EFFECT_KEYWORDS = [
  'gainWoundEachPlayer',
  'gainWoundCurrentPlayer',
  'koHeroCurrentPlayer',
  'heroDeckTopToEscape',
  'captureBystander',
  'koHeroEachPlayer',
  'koHeroEachPlayerMag2',
];
```

**Closed-union-per-magnitude governance clause (locked — D-20201):**

> Each magnitude variant of an each-player-KO effect is its own
> closed-union keyword appended at position N
> (`koHeroEachPlayerMag2`, `koHeroEachPlayerMag3` if ever needed).
> Parameterized markers (`[effect:koHeroEachPlayer:N]`) are rejected for
> the MVP. The N-iteration executor branch is literal-loop-bound; future
> magnitude expansion is a copy-paste-and-edit of the case body, not a
> parser/regex/dispatch-contract change.

---

## Acceptance Criteria

### Vocabulary / Dispatch

- [ ] `VillainEffectKeyword` union has exactly 7 members and
  `'koHeroEachPlayerMag2'` is the seventh.
- [ ] `VILLAIN_EFFECT_KEYWORDS` has exactly 7 entries with
  `'koHeroEachPlayerMag2'` at index 6 (position 7); indices 0-5 are
  byte-identical to the post-WP-189 array.
- [ ] Drift-detection test asserts seven-entry array ↔ union
  bidirectional equality plus the append-only-invariant guard pinning
  indices 0-5.
- [ ] The overlay's local `VILLAIN_EFFECT_KEYWORDS` (in
  `apply-effect-markers.mjs`) has exactly 7 entries and matches the
  engine array byte-for-byte.

### Behavior / Determinism

- [ ] `koHeroEachPlayerMag2` applies exactly two per-player iterations
  using the existing shared `koOneHeroForPlayer(G, playerId)` resolver.
- [ ] A player with 2+ eligible heroes loses exactly 2 (selected by the
  locked rule: discard before hand; `ext_id` lexical tie-break;
  per-iteration).
- [ ] A player with exactly 1 eligible hero loses exactly 1 (the second
  inner iteration silent no-ops).
- [ ] A player with 0 eligible heroes loses 0 (both iterations silent
  no-op).
- [ ] **Single-player parity (load-bearing).**
  `koHeroEachPlayerMag2(G)` ≡ `koHeroEachPlayer(koHeroEachPlayer(G))`
  by deep equality across `G.ko`, every player zone (`hand`, `discard`,
  `inPlay`, `victory`, `deck`), `G.attachedBystanders`, and `G.messages`.
- [ ] **Determinism (audit-exact).** Given an identical input `G`, two
  executions of `koHeroEachPlayerMag2` MUST produce identical per-player
  KO target `ext_id`s, identical `G.ko` mutation order, and identical
  `G.messages` sequence (deep equality).
- [ ] `koHeroEachPlayer` (magnitude-1) regression test still passes
  byte-identical; `koHeroCurrentPlayer` regression test unchanged.

### Data Curation

- [ ] **Exactly 2** `data/cards/` lines carry
  `[effect:koHeroEachPlayerMag2]`, both on the printed text
  `"Escape: Each player KOs two of their Heroes."` in `core.json`
  (Destroyer) and `msp1.json` (Destroyer). Verified by
  `grep -rcE '"Escape: Each player KOs two of their Heroes\.\s*\[effect:koHeroEachPlayerMag2\]"' data/cards/`
  returning total = 2 **and**
  `grep -r "\[effect:koHeroEachPlayerMag2\]" data/cards/ | wc -l` = 2.
- [ ] No `Ambush:` / `Fight:` / `Overrun:` line carries
  `[effect:koHeroEachPlayerMag2]`. Verified by
  `grep -rcE '"(Ambush|Fight|Overrun):[^"]*\[effect:koHeroEachPlayerMag2\]"' data/cards/`
  returning total = 0.
- [ ] `grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort -u` lists exactly
  the seven locked keywords (no typo / unknown value).
- [ ] The four D-18802 Escape rows that WP-202 does NOT promote
  (`hela-2099`, `juggernaut` Escape, `bullseye`, `ultimaton-weapon-xv`)
  remain in `_unassigned` byte-identical — their `reason` tag, text,
  and set/group/card keys are unchanged.
- [ ] The two newly-curated Destroyer rows are removed from
  `_unassigned`; exactly one new `_notes` paragraph is appended with
  the required content listed in §Scope (In) → `_unassigned`
  post-curation hygiene.

### Build / Idempotency

- [ ] A second run of `apply-effect-markers.mjs` produces a zero-line
  `git diff` (idempotency across all seven keywords + four timings).
- [ ] `git diff --stat data/cards/` shows exactly two modified files:
  `core.json` and `msp1.json`, each with `+1/-1`. Any other
  `data/cards/*.json` file showing a diff is a **HARD FAIL.**
- [ ] WP-187/188/190 markers are intact (`grep -rc "\[effect:" data/cards/`
  = WP-187/188/190 baseline + 2 new `koHeroEachPlayerMag2` markers).
- [ ] `--propose` surfaces magnitude-2 each-player hero KO candidates
  with `koHeroEachPlayerMag2` in the proposed-keywords column (writes
  nothing).
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline
  + **exactly 7** new tests in `villainEffects.execute.test.ts`, matching
  WP-189's precedent for the analogous engine half: 1 multi-player
  magnitude-2 + 1 partial-eligibility-per-player + 1 mixed-eligibility +
  1 single-player magnitude-2 ≡ magnitude-1-twice parity + 1 determinism
  + 1 `koHeroEachPlayer` non-regression + 1 `koHeroCurrentPlayer`
  non-regression).
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Confirm WP-189 landed (shared resolver + position-6 keyword) — else BLOCKED
grep -n "koHeroEachPlayer\|koOneHeroForPlayer" packages/game-engine/src/rules/villainAbility.types.ts packages/game-engine/src/villain/villainEffects.execute.ts
# Expected: union + canonical array list koHeroEachPlayer at position 6;
# executor has the shared resolver + a koHeroEachPlayer dispatch case.

# Confirm WP-190 landed (overlay local-copy already has 6 keywords) — else BLOCKED
grep -n "koHeroEachPlayer" scripts/convert-cards/apply-effect-markers.mjs
# Expected: local VILLAIN_EFFECT_KEYWORDS array lists koHeroEachPlayer at position 6.

# Engine: build + test
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test

# Vocabulary is exactly seven entries, koHeroEachPlayerMag2 last
grep -n "koHeroEachPlayerMag2" packages/game-engine/src/rules/villainAbility.types.ts
grep -c "'koHeroEachPlayerMag2'\|'koHeroEachPlayer'\|'gainWoundEachPlayer'\|'gainWoundCurrentPlayer'\|'koHeroCurrentPlayer'\|'heroDeckTopToEscape'\|'captureBystander'" packages/game-engine/src/rules/villainAbility.types.ts
# Expected: canonical array + union list seven keyword strings.

# Executor has the koHeroEachPlayerMag2 branch reusing the shared resolver
grep -n "koHeroEachPlayerMag2\|koOneHeroForPlayer" packages/game-engine/src/villain/villainEffects.execute.ts

# Shared-resolver structural grep: the koOneHeroForPlayer resolver MUST have
# exactly 4 matches post-execution — 1 function declaration line
# (`function koOneHeroForPlayer(` matches the regex) + 1 call inside
# koHeroCurrentPlayer + 1 call inside koHeroEachPlayer + 1 NEW call inside
# koHeroEachPlayerMag2's inner loop. Baseline pre-WP-202 is 3 matches;
# load-bearing invariant is delta = +1.
grep -cE "koOneHeroForPlayer\(" packages/game-engine/src/villain/villainEffects.execute.ts
# Expected post-execution: 4. If the count is not 4, the resolver is either
# duplicated, mis-named, or not wired into the new branch.

# Negative grep: the koHeroEachPlayerMag2 branch must NOT contain its own
# discard/hand zone search — that would mean the per-player resolution was
# duplicated instead of delegated.
grep -nE "selectKoHeroTarget|moveCardFromZone" packages/game-engine/src/villain/villainEffects.execute.ts
# Expected: matches only inside the shared resolver, never inside the
# koHeroEachPlayerMag2 case body (audit surrounding context to confirm).

# Apply the overlay (now including koHeroEachPlayerMag2) and confirm a clean re-run
node scripts/convert-cards/apply-effect-markers.mjs
node scripts/convert-cards/apply-effect-markers.mjs
git diff --stat data/cards/   # expected: no changes on the second run

# Markers landed and vocabulary-clean (exactly the 7 locked strings)
grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort | uniq -c

# koHeroEachPlayerMag2 present on exactly two Escape lines, zero on other timings
grep -rcE '"Escape: Each player KOs two of their Heroes\.\s*\[effect:koHeroEachPlayerMag2\]"' data/cards/
# Expected: total across files = 2 (one each in core / msp1)
grep -rcE '"(Ambush|Fight|Overrun):[^"]*\[effect:koHeroEachPlayerMag2\]"' data/cards/
# Expected: total = 0

# Global marker-count invariant
grep -r "\[effect:koHeroEachPlayerMag2\]" data/cards/ | wc -l
# Expected: 2

# Diff is bounded to exactly two files
git diff --stat data/cards/
# Expected: core.json, msp1.json — each +1/-1; no other set

# WP-187/188/190 markers preserved (counts only grew by 2)
grep -rc "\[effect:" data/cards/ | tail

# Propose surfaces magnitude-2 each-player hero KO distinctly
node scripts/convert-cards/apply-effect-markers.mjs --propose | grep koHeroEachPlayerMag2 | head

# Layer-boundary greps (zero matches)
grep -n "@legendary-arena/registry" packages/game-engine/src/villain/villainEffects.execute.ts
grep -n "boardgame.io" packages/game-engine/src/rules/villainAbility.types.ts

# Full monorepo build
pnpm -r build
```

Expected outputs: WP-189 + WP-190 prerequisites present; the `uniq -c`
output lists exactly the seven locked keywords; the second apply run
shows no `data/cards/` diff; exactly two `Escape:` lines carry
`[effect:koHeroEachPlayerMag2]` (one per set: `core`, `msp1`); zero
`Ambush:` / `Fight:` / `Overrun:` lines are marked;
`git diff --stat data/cards/` shows exactly two files modified with
`+1/-1` each; the structural resolver-call grep returns 3; the negative
duplicated-zone-search grep returns matches only inside the shared
resolver; `--propose` prints magnitude-2 each-player hero KO rows; the
registry / boardgame.io greps return nothing; `pnpm -r build` exits 0.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-202 Executed` block (the 7th
  keyword in vocabulary + overlay, the magnitude-N executor branch
  delegating to the shared resolver, curated magnitude-2 line count = 2
  Escape markers across 2 sets, the explicit Ambush/Fight/Overrun
  zero-yield acknowledgment, the `_unassigned` ledger state — 2 of 6
  `no-vocabulary-keyword` rows promoted, 4 remain deferred with named
  blockers).
- [ ] `docs/ai/DECISIONS.md` has D-20201..D-20203 (proposed):
  - **D-20201** — Magnitude-N each-player-KO uses closed-union-per-magnitude
    keywords appended at position N (`koHeroEachPlayerMag2`, etc.);
    parameterized markers (`[effect:koHeroEachPlayer:N]`) are rejected
    for v1. Rationale: the parser regex + executor dispatch contract +
    overlay validator + drift tests would all need to change for
    parameterization; the closed-union approach extends the WP-189
    append-only pattern with no parser change, and the corpus shows only
    N=2 in v1 so the closed-union degenerates to a single new keyword.
    Supersedes the implicit "vocabulary locked at 6" framing of D-18901
    for the magnitude-2 addition; D-18802's deferral is further resolved
    for the unconditional unfiltered magnitude-2 subset. The
    source-filtered (Juggernaut), target-mismatched + choice (Hela-2099),
    and class-filtered (Bullseye, Ultimaton-Weapon-XV) remainder stays
    deferred under D-18802 pending future predicate-machinery WPs.
  - **D-20202** — Overlay's local seven-keyword array is hand-synced to
    the engine `VILLAIN_EFFECT_KEYWORDS`; drift loud-fails. Extends
    D-19002's hand-sync convention to position 7. The first six
    positions are byte-identical to the post-WP-189 array (preserved by
    WP-190); `koHeroEachPlayerMag2` is appended at position 7. No import
    from `packages/` into a `.mjs` ops script.
  - **D-20203** — Magnitude-2 curation marks ONLY unconditional
    unfiltered "each player KOs two of their Heroes" lines with
    `koHeroEachPlayerMag2`; magnitude>2 / source-filtered (from
    hand / from discard / from victory) / target-mismatched (Henchmen
    not Heroes) / class-filtered (non-grey, costing-X) / choice ("or
    gains a Wound") variants stay `_unassigned`. The EXACT CURATION
    COUNT = 2 invariant pins the curation discipline at execution
    close. Each-player ≠ current-player remains a hard separation
    (extends D-19001 hard-separation rule to the magnitude-N branch).
- [ ] `WORK_INDEX.md`: WP-202 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-230 row Done.
- [ ] No **source** file outside the 12-file §Files Expected to Change
  list was modified. If toolchain-generated metadata (lockfiles, generated
  type rollups, IDE caches) changes incidentally, review and revert
  unless explicitly required by this WP.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §10 (Card-data semantics), §22 (Replay determinism).

**Conflict assertion:** No conflict. WP-202 makes the engine honor the
printed `"Escape: Each player KOs two of their Heroes."` text on two
Destroyer villain cards — a small but mechanically faithful expansion of
the each-player-KO vocabulary. The closed-union-per-magnitude approach
(D-20201) keeps the vocabulary disciplined and prevents speculative
surface area. The curation discipline (D-20203) keeps the data
conservative; it never invents mechanics and explicitly defers the
filtered / target-mismatched / choice remainder.

**Non-Goal proximity check:** None of NG-1..NG-7 are crossed. No
monetization, identity, or competitive surface; engine + card-data only.

**Determinism preservation:** The magnitude-N executor branch is
deterministic — it iterates `Object.keys(G.playerZones).sort()` lexical
ascending (no `ctx.random.*`, no clocks), runs a literal 2-iteration
inner loop per player, and delegates each KO to the shared resolver
which applies the discard→hand, `ext_id`-lexical rule (D-18503; no
VP, no registry read). Same seed + same moves = same KO targets and
same `G.messages` order every replay; the load-bearing parity is
enforced by the magnitude-2 ≡ magnitude-1-twice test on a single-player
`G`. The overlay is a deterministic pure-IO transform; identical map +
identical card data → byte-identical output.

---

## Funding Surface Gate

N/A — engine + card-data tooling WP; no §20.1 trigger surfaces (no
navigation funding affordance, no registry-viewer surface, no profile
attribution, no user-visible donate copy).

---

## API Catalog Update

N/A — no HTTP endpoints or `apps/server/src/**` library functions
added/modified/removed.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ (engine + data pair that closes the magnitude-2 unconditional unfiltered each-player-KO subset of D-18802) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-185/187/188/189/190/191 hard-deps; empirical 2-card yield + closed N=2 corpus finding) |
| 3 | Context (Read First) specific (paths + line numbers + precedents) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract | ✅ (12 numbered items: 4 engine + 2 data-tooling + 2 bounded `data/cards/*.json` regen + 4 governance) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria testable | ✅ |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — engine layer + data-tooling upstream of registry; no server/registry-runtime code | ✅ |
| 11 | Identity model N/A | N/A |
| 12 | Test rules — `node:test` only, drift-detection + executor parity + determinism; no `.test.ts` for ops scripts (per ops-script convention; loud-fail + idempotency are the guardrails) | ✅ |
| 13 | pnpm/node commands only; expected output shown | ✅ |
| 14 | Acceptance criteria binary + specific | ✅ (Slightly above the 6-12 heuristic count because build, idempotency, exact-corpus curation, and engine-vs-data each require separate binary gates; the four-heading grouping — Vocabulary/Dispatch, Behavior/Determinism, Data Curation, Build/Idempotency — keeps the list scannable.) |
| 15 | Definition of Done includes STATUS/DECISIONS/WORK_INDEX/scope-bound | ✅ |
| 16 | Code style: full names, JSDoc, no clever parsing in committed output | ✅ |
| 17 | Vision Alignment present; clauses §1/§2/§10/§22; determinism line included | ✅ |
| 18 | Prose-vs-grep: verification greps scoped to `data/cards/` + token, not raw NL | ✅ (literal-string-scoped greps reference governance decisions D-18901 / D-18902 / D-18503 / D-19001 / D-19002 instead of enumerating forbidden tokens verbatim — no false positives) |
| 19 | Bridge-vs-HEAD staleness — commit-time discipline | N/A |
| 20 | Funding surface N/A with justification | ✅ (engine + card-data tooling; no funding-channel-adjacent surface; per §Funding Surface Gate) |
| 21 | API catalog N/A with justification | ✅ (no HTTP endpoints touched, no `apps/server/src/**` library functions added or modified; per §API Catalog Update) |

---

*Drafted: 2026-06-02. Baseline `origin/main @ b9d05d3`. Engine + data
pair (mirrors WP-189/WP-190 dual-half pattern) closing the magnitude-2
unconditional unfiltered subset of D-18802's `no-vocabulary-keyword`
deferral. Hard-deps: WP-185 ✅, WP-187 ✅, WP-188 ✅, WP-189 ✅
(`bf61d82`), WP-190 ✅, WP-191 ✅ — all landed. Empirical yield: 2
Escape markers across 2 cards across 2 sets (both Destroyer villains in
`core` + `msp1`); zero Ambush/Fight/Overrun; zero N≥3 lines in corpus.
Closed-union-per-magnitude approach (single new keyword
`koHeroEachPlayerMag2` at position 7) chosen over parameterized markers
to preserve WP-185/WP-189 drift-detection discipline and minimize blast
radius. Reserves D-20201..D-20203.*

*Tightened 2026-06-02 (docs-only, no code touched): added §Assumes
audit-scope clarifier (D-18802 Escape 2-of-6 ledger vs corpus-wide
magnitude>1 scan are distinct universes; Juggernaut Ambush is NOT part
of the 2-of-6 accounting); compressed §Goal + §Why now (removed
historical-chain prose); grouped §Acceptance Criteria into four
headings (Vocabulary/Dispatch, Behavior/Determinism, Data Curation,
Build/Idempotency); sharpened the exact-match-vs-heuristic boundary in
the data-half §Scope (`--propose` is advisory only; WP-202 authorizes
only the two Destroyer entries regardless of `--propose` surfacing);
made the `_unassigned` `_notes` paragraph content explicit (4
deferred-row blockers named verbatim); compressed §Non-Negotiable
Constraints (de-duplicated "magnitude is literal 2" + "shared-resolver
reuse" rules); added a position-vs-index convention note (1-based
position for human prose, 0-based index for code assertions); added a
line-numbers-are-advisory disclaimer to §Context (Read First); softened
the §DoD "no files outside" gate to scope it to source files; tightened
the §Lint Gate row #14 wording to acknowledge the 6-12 heuristic
exceeded with justification. EC-230 mirrors with the same compression
+ a formal §Execution Order (Locked) block + renamed §Pre-Commit
Failure Smells.*
