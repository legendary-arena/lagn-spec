# WP-186 — Villain & Henchman Escape + Overrun Effects (Engine)

## Goal

Extend WP-185's villain-ability hook infrastructure to execute card-text-driven
`Escape:` and `Overrun:` effects when a villain or henchman escapes the City
(pushed off the escape edge during a reveal). After this WP, a villain whose
escape line reads `Escape: Each player gains a Wound.` (carrying the
`[effect:gainWoundEachPlayer]` marker authored by WP-188) will wound every
player when it escapes — on top of the existing generic per-escape penalty.
Today the engine only increments the escape counter, moves the card to
`G.escapedPile`, releases attached bystanders, and applies the generic
per-escape wound to the current player; the card's own `Escape:` text does
nothing. This WP adds a single `executeVillainAbilities(..., 'onEscape')`
call in the existing escape branch of `villainDeck.reveal.ts` and teaches
WP-185's setup parser to detect `Escape:` / `Overrun:` prefixes.

> **Detection model (read this first — same as WP-185).** WP-185 was
> re-specced to read structured `[effect:<VillainEffectKeyword>]` markers
> (authored by data-enrichment WPs), NOT to parse `[icon:]` / `[keyword:]`
> markup or free-text English. WP-186 inherits that model unchanged: its
> only parser change is detecting the `Escape:` / `Overrun:` line prefix →
> `onEscape` timing; the `[effect:]` marker reading is already generic in
> WP-185's parser. The escape markers themselves are authored by **WP-188**
> (the Escape/Overrun sibling of WP-187). **WP-186 is BLOCKED until WP-188
> lands** — without the markers every escape hook carries `effects: []` and
> the WP ships dead. Verify with `grep -rnE "(Escape|Overrun):.*\[effect:" data/cards/`.

> **Scope reality — the curatable escape subset is small.** Escape effects
> are overwhelmingly *each-player* ("Each player KOs one of their Heroes"),
> but the WP-185 MVP vocabulary is *current-player*-biased and has no
> each-player KO keyword (D-18802). So in v1 the dominant escape KO pattern
> stays unmarked (WP-188 `_unassigned`) and WP-186 safe-skips it. The escape
> effects that actually fire in v1 are dominated by `gainWoundEachPlayer`
> (unconditional "Escape: Each player gains a Wound." lines) — which is the
> first real data that keyword ever gets. WP-186 wires the full pipeline;
> broad escape coverage waits on a future `koHeroEachPlayer` vocabulary
> expansion.

---

## Assumes

- **WP-185 ✅ (hard-dep — engine infrastructure).** Villain ability hook
  table (`G.villainAbilityHooks`), setup-time parser
  (`buildVillainAbilityHooks`), executor (`executeVillainAbilities`), the
  five-keyword MVP vocabulary, and the `VILLAIN_ABILITY_TIMINGS` /
  `VILLAIN_EFFECT_KEYWORDS` canonical arrays must all be landed before
  WP-186 starts. This WP **extends** the timing union — it does not
  redefine the effect-keyword vocabulary.
- **WP-188 ✅ (hard-dep — escape effect markers).** Card-data enrichment
  that authors `[effect:<VillainEffectKeyword>]` markers on the curatable
  `Escape:` / `Overrun:` ability lines (EC-215). Without it every escape
  hook carries `effects: []` (nothing fires). WP-186 must not execute
  until `grep -rnE "(Escape|Overrun):.*\[effect:" data/cards/` returns matches; if
  not, stop and report `BLOCKED: WP-188`.
- WP-009A / WP-009B / WP-014A / WP-014B / WP-015 ✅ — escape pipeline
  exists; `villainDeck.reveal.ts` handles the
  `pushResult.escapedCard !== null` branch (counter increment, escape-pile
  push, generic current-player wound, attached-bystander release).
- WP-017 ✅ — `gainWound`, `resolveEscapedBystanders` helpers exist.
- **WP-191 ✅ (execution-time reconciler — DoD gate, especially §Files
  #7c).** Landed 2026-05-30 at `20de3ae`; D-18704..D-18708. Every per-card
  lookup table is now keyed by the zone-instance ext_id, so villain
  `onEscape` hook lookups resolve end-to-end on real cards. The WP-186
  fire-site wiring is structurally correct without WP-191 (and henchman
  escapes always fired), but the real-registry villain verification in
  §Files Expected to Change #7c and its matching Acceptance Criterion
  cannot pass unless WP-191 is present. Treat WP-191 as a **DoD gate**
  for this packet even though the `onEscape` fire-site addition itself
  does not re-derive or modify the grammar. The synthetic-hook tests
  remain authoritative for wiring; the real-registry test verifies
  consumption of the reconciled grammar.
- `data/cards/*.json` contains villain + henchman cards with `Escape:`
  (>100 cards across all 40 sets) and `Overrun:` (small number) ability
  text. After WP-188 the curatable subset carries `[effect:]` markers;
  the dominant each-player-KO lines stay marker-free (WP-188
  `_unassigned`) and WP-186 safe-skips them.
- **Drafting baseline:** `origin/main @ cc29447` (2026-05-28).
- **Execution baseline clarification:** actual execution must occur
  against a branch/HEAD that already includes WP-185, WP-188, and WP-191
  (all ✅ as of 2026-05-30).

---

## Context (Read First)

- **WP-185** (re-specced, enrichment-first) — full WP body; this WP reuses
  every primitive WP-185 introduces and the same `[effect:]` marker
  detection model. Do not duplicate or re-derive any locked value.
- **WP-188** — the upstream data WP that authors the escape `[effect:]`
  markers WP-186 reads. Its `_unassigned` block documents what WP-186
  safe-skips and why.
- **WP-187** — the Ambush/Fight sibling of WP-188; precedent for the
  marker model.
- `docs/ai/ARCHITECTURE.md §Section 4 — boardgame.io Runtime Model`
  (Move Validation Contract, Canonical Reveal → Fight → Side-Effect
  Ordering) — moves never throw; rule effects observed after physical
  state mutation.
- `docs/ai/ARCHITECTURE.md §Section 1 — Layer Boundary (Authoritative)`
  — Game Engine layer; no registry runtime import.
- `docs/ai/REFERENCE/00.6-code-style.md` — full English names; JSDoc;
  explicit `// why:` comments; no `.reduce()` in zone/effect application.
- `docs/ai/DECISIONS.md` — scan D-18501..D-18508 (the WP-185 lock set,
  incl. the `[effect:]` marker model, zone-priority KO resolution, D-18507
  reserving `'onEscape'`); **D-18508 (villain ext_id grammar gap) is now
  CLOSED by WP-191 (D-18704..D-18708)** — villain `onEscape` hook lookups
  resolve end-to-end on real cards. D-18701..D-18703 (WP-187 enrichment),
  D-18801..D-18803 (WP-188 escape enrichment), D-2403 (effect-type gap
  safe-skip).
- `.claude/rules/architecture.md` + `.claude/rules/code-style.md` +
  `.claude/skills/legendary-game-engine/SKILL.md`.
- `packages/game-engine/src/rules/villainAbility.types.ts`
  (WP-185 output) — the timing union being extended.
- `packages/game-engine/src/setup/villainAbility.setup.ts`
  (WP-185 output) — the parser being extended; reads `[effect:]` markers
  generically, detects timing from the line prefix.
- `packages/game-engine/src/villain/villainEffects.execute.ts`
  (WP-185 output) — the executor; this WP adds **no new effect keywords**
  and **no timing-specific branch** (it dispatches by hook lookup, not
  by timing).
- `packages/game-engine/src/villainDeck/villainDeck.reveal.ts`
  — the escape branch (`pushResult.escapedCard !== null`), the new fire
  site. Line numbers shift after WP-185 lands the Ambush call; the
  structural location is the escape branch inside the villain/henchman
  city-routing block.

---

## Context

WP-185 covers `Fight:` (defeated) and `Ambush:` (city entry) — the two
trigger sites that fire on the **active** revealed card. Escape is the
third trigger in the canonical "Reveal → Fight → Side-Effect" ordering
(ARCHITECTURE.md §Canonical Reveal → Fight → Side-Effect Ordering): when
a villain is pushed off the escape edge during a new reveal, it becomes
an escape event. The existing escape branch already handles the
mechanical consequences:

- Increment `G.counters[ENDGAME_CONDITIONS.ESCAPED_VILLAINS]` by 1
- Append the escaped card to `G.escapedPile`
- Current player gains 1 wound (the generic WP-015 escape-wound rule)
- Attached bystanders released to `G.piles.bystanders`

What's missing: the card-specific `Escape:` ability text. WP-186 adds the
new `onEscape` timing, teaches the parser to detect `Escape:` / `Overrun:`
prefixes, and fires `executeVillainAbilities(..., 'onEscape')` after the
existing branch body. The effect execution path is entirely WP-185's —
the same five-keyword executor, the same `[effect:]` markers (here
authored by WP-188 instead of WP-187).

**`Overrun:` is a v1 synonym of `Escape:`.** Both prefixes emit hooks with
`timing: 'onEscape'`. The engine collapses them at parse time; the data
overlay (WP-188) keeps `escape` and `overrun` as distinct map keys because
it matches by line prefix. Real `Overrun:` text on scheme cards has richer
setup-tied semantics outside the MVP vocabulary, so scheme overrun safely
no-ops; a future scheme-text WP can introduce a distinct `'onOverrun'`
timing if needed.

**What actually fires in v1.** Per WP-188's curation reality, the escape
effects that carry markers are dominated by `gainWoundEachPlayer`
(unconditional "Escape: Each player gains a Wound." lines). The dominant
each-player-KO escape pattern is **not** in the MVP vocabulary (D-18802),
so WP-188 leaves it unmarked and WP-186 safe-skips it (hook with
`effects: []`). WP-186 wires the complete `onEscape` pipeline; the
each-player-KO coverage arrives with a future `koHeroEachPlayer`
vocabulary expansion (a WP-185-side WP).

**End-to-end villain firing — D-18508 CLOSED by WP-191 ✅.** WP-186 was
originally drafted with a known limitation: villain deck/city/escaped-pile
card ext_ids were copy-indexed (`...-card-NN`) while `villainAbilityHooks`
(and `cardStats` / `cardKeywords`) keyed villains by the definition id
(`...-card`), so a real villain's `onEscape` hook lookup missed and the
effect did not resolve end-to-end. WP-191 reconciled the grammar (landed
2026-05-30 at `20de3ae`; D-18704..D-18708 close D-18508): every per-card
lookup table is now keyed by the zone-instance ext_id, fanning out per
copy the way henchmen already did. As a result **villain `onEscape`
effects now fire end-to-end on real cards** in addition to henchman
escapes (which always fired). WP-186 must consume this reconciliation: at
least one integration test exercises the path with a real villain card
from the registry, not just synthetic hooks keyed to the escaped instance
(see §Files Expected to Change #7c). The synthetic-hook unit/integration
tests still pass and prove the wiring; the real-registry test verifies
that the WP-191 reconciliation feeds the fire site correctly.

---

## Scope (In)

- **Extend `VILLAIN_ABILITY_TIMINGS`** —
  `VillainAbilityTiming = 'onAmbush' | 'onFight' | 'onEscape'` and
  `VILLAIN_ABILITY_TIMINGS = ['onAmbush', 'onFight', 'onEscape']`.
  Bidirectional drift-detection test extended to the new entry.
- **Extend setup parser (prefix detection only)** —
  `villainAbility.setup.ts` detects ability lines whose
  leading-whitespace-trimmed, lowercased form begins with `escape:` OR
  `overrun:` and assigns `timing: 'onEscape'` (v1 synonym lock). The
  `[effect:]` marker reading is **unchanged** — WP-185's parser already
  reads `[effect:<VillainEffectKeyword>]` markers generically off the
  matched line. WP-186 adds only the two new prefix→timing mappings;
  it does **not** add `[icon:]` / `[keyword:]` / free-text parsing.
- **New fire site** — `villainDeck.reveal.ts` escape branch (inside
  `if (pushResult.escapedCard !== null) { ... }`): after the existing
  bystander-release step, call
  `executeVillainAbilities(G, ctx, pushResult.escapedCard, 'onEscape')`.
  The generic per-escape current-player wound is **preserved**; the new
  call layers card-specific `Escape:` effects on top.
- **No new effect keywords; no timing-specific executor branch** — the
  executor (`villainEffects.execute.ts`) is **unchanged**. It dispatches
  by per-card hook lookup (`getVillainHooksForCard(cardId, timing)`), so
  the existing five-keyword execution path serves `onEscape` with no new
  code. The MVP effects (`gainWoundEachPlayer`, `gainWoundCurrentPlayer`,
  `koHeroCurrentPlayer`, `heroDeckTopToEscape`, `captureBystander`)
  target `G` state that exists at the escape moment.
- **`captureBystander` semantics under `onEscape`** — the escape branch
  fires AFTER `resolveEscapedBystanders` has released the escaping card's
  attached bystanders. If an `Escape:` line carries
  `[effect:captureBystander]` (rare), the effect attaches one bystander
  from the supply to the escaped card now in `G.escapedPile` (D-18603).
  v1 scope choice; the captured bystander follows the card out of the
  city.
- **Unit tests** — drift-detection for the three-entry timing union;
  setup-parser tests for `Escape:` + `Overrun:` prefix detection emitting
  `timing: 'onEscape'` (per-card and henchman group-level shapes; with
  and without an `[effect:]` marker); executor `onEscape` dispatch via
  direct call on a mock G (including a `captureBystander`-under-`onEscape`
  case asserting attachment to the escaped card per D-18603); a fire-site
  integration test that escapes a villain whose escape line carries
  `[effect:gainWoundEachPlayer]` and asserts every player gains a wound
  **in addition** to the generic current-player escape wound; and an
  escape-before-Ambush ordering integration test that pins `onEscape`
  resolving before the entering card's `onAmbush` via a non-commutative
  finite-wound-pool fixture (§Files Expected to Change #7b).
- **STATUS.md entry**, **DECISIONS.md entries** (D-18601..D-18603),
  **WORK_INDEX.md flip to `[x]`**, **EC-213 flip to Done**.

## Out of Scope

- **`Fight:` and `Ambush:` effects** — WP-185 scope.
- **Authoring the escape `[effect:]` markers** — that is WP-188 (the data
  enrichment). WP-186 only reads them.
- **New effect keywords beyond the WP-185 MVP vocabulary** — including
  the each-player-KO keyword the dominant escape pattern needs. Adding it
  is a WP-185-side vocabulary-expansion WP with its own `DECISIONS.md`
  entry, NOT WP-186. WP-186 safe-skips unmarked escape lines.
- **Reconciling the villain ext_id grammar gap (D-18508)** — done by
  WP-191 ✅ (D-18704..D-18708, landed at `20de3ae`). WP-186 consumes the
  reconciliation; it does NOT re-derive or modify the grammar. The
  reconciled lookup tables (keyed by zone-instance ext_id) are what the
  WP-186 escape fire site reads at runtime.
- **Distinct `'onOverrun'` timing label** — v1 lock: `Overrun:` is a
  synonym of `Escape:` (both emit `onEscape`).
- **Scheme card `Overrun:` semantics** — scheme cards have richer
  Overrun behavior tied to scheme setup; out of scope for villain
  ability hooks.
- **Order-of-operations changes within the escape branch** — counter
  increment, escape-pile append, generic wound, and bystander release
  ordering is preserved exactly. The new fire site is appended **after**
  the existing branch body.
- **Replacing the generic per-escape wound** — the WP-015 current-player
  escape wound stays; card-specific effects layer on top.
- **Refining `captureBystander` semantics under escape** — v1 attaches
  to the escaped card (D-18603); refinement deferred.
- **Mastermind escape / overrun text** — mastermind cards don't escape
  via the City; out of scope.
- **Interactive player choice** — same MVP discipline as WP-185;
  `koHeroCurrentPlayer` auto-resolution is deterministic (zone-priority
  discard→hand, then ext_id lexical — NOT VP-based).
- **Changes to `G.cardKeywords` or `BoardKeyword` union** — escape
  detection runs from the ability-text prefix at setup, not from a board
  keyword. No `escape` keyword is added to `BOARD_KEYWORDS`.
- **Changing `VILLAIN_EFFECT_KEYWORDS` or the executor's effect set** —
  unchanged at five keywords.
- **`PatternFilter.vue` / registry-viewer surfaces** — WP-184 territory.

---

## Files Expected to Change

1. `packages/game-engine/src/rules/villainAbility.types.ts` —
   **modified** — extend `VillainAbilityTiming` union and
   `VILLAIN_ABILITY_TIMINGS` canonical array to include `'onEscape'`
   (canonical order `['onAmbush', 'onFight', 'onEscape']`); update the
   `// why:` comment on the array.
2. `packages/game-engine/src/setup/villainAbility.setup.ts` —
   **modified** — extend prefix detection to recognize `Escape:` and
   `Overrun:` (both → `timing: 'onEscape'`). Reuse the existing
   `[effect:]` marker reader unchanged; add no new markup namespace.
3. `packages/game-engine/src/villainDeck/villainDeck.reveal.ts` —
   **modified** — inside the existing
   `if (pushResult.escapedCard !== null) { ... }` block, append one line:
   `executeVillainAbilities(G, ctx, pushResult.escapedCard,
   'onEscape');` after the bystander-release step. The second argument is
   the local `ctx` (= `context.ctx`, the `{ currentPlayer }` object),
   matching the WP-185 `onAmbush` call already at this fire site
   (`executeVillainAbilities(G, ctx, cardId, 'onAmbush')`) — **not** a
   wrapped `{ ctx }`; the executor reads `ctx.currentPlayer` directly, so
   wrapping it would resolve `currentPlayer` to `undefined`. No reordering
   of the existing branch body.
4. `packages/game-engine/src/rules/villainAbility.types.test.ts` —
   **modified** — drift-detection assertions extended to the three-entry
   timing array.
5. `packages/game-engine/src/setup/villainAbility.setup.test.ts` —
   **modified** — add tests for `Escape:` and `Overrun:` prefix detection
   emitting `timing: 'onEscape'`; per-card and group-level shapes;
   marker-present (effects populated) and marker-absent (effects empty,
   safe-skip) cases.
6. `packages/game-engine/src/villain/villainEffects.execute.test.ts`
   — **modified** — add `onEscape` dispatch tests covering the MVP effect
   keywords reachable via escape markers (esp. `gainWoundEachPlayer`).
   Include a `captureBystander`-under-`onEscape` test asserting the
   bystander attaches to the **escaped card** (`G.attachedBystanders`
   keyed by the escaped card's ext_id) — locking D-18603. The executor
   auto-awards a captured bystander only on `onFight`, so under
   `onEscape` it stays attached (follows the card out of the city).
7. `packages/game-engine/src/villainDeck/villainDeck.reveal.test.ts`
   — **modified** — add integration tests:
   (a) reveal a villain that pushes a prior occupant carrying an
   `[effect:gainWoundEachPlayer]` escape marker off the escape edge;
   assert the escaped card's effect fires (all players wounded) AND the
   generic current-player escape wound + bystander release + counter
   increment + escape-pile push all still occur in their existing order.
   (b) **Escape-before-Ambush ordering lock** — set up one reveal whose
   push both escapes a prior occupant carrying an `onEscape` marker AND
   brings in an entering card carrying an `onAmbush` marker, then prove
   `onEscape` resolves first. The executor pushes no per-effect
   `G.messages`, so message order cannot distinguish the two; instead
   contend a **finite wound pool** with an asymmetric pair — escaped card
   `[effect:gainWoundCurrentPlayer]`, entering card
   `[effect:gainWoundEachPlayer]`, with `G.piles.wounds` sized to exhaust
   partway. Escape-first produces a different per-player wound
   distribution than ambush-first, so the assertion FAILS if a future
   refactor moves the Ambush fire site before the escape branch. (Exact
   pool size / fixture is the executor's choice; the invariant is that the
   test must distinguish the two orderings.)
   (c) **Real-registry villain end-to-end (post-WP-191 consumption)** —
   build initial game state via `buildInitialGameState` against the real
   registry, pick a real villain card whose `Escape:` line carries
   `[effect:gainWoundEachPlayer]` (authored by WP-188), drive a reveal
   that pushes that villain off the escape edge, and assert every
   player's wound count increases. The villain is identified by its
   zone-instance ext_id (`{set}-villain-{group}-{card}-NN`) — same
   grammar WP-191 keys lookups by. This is the test that would FAIL
   under the old D-18508 grammar gap (the hook lookup would miss the
   copy-indexed id) and PASSES under WP-191's reconciliation; pair it
   with a henchman escape end-to-end test for symmetry. Existing
   synthetic-hook tests (#7a, #7b) remain authoritative for wiring; #7c
   verifies the WP-191 grammar reconciliation is consumed correctly.
8. `docs/ai/STATUS.md` — **modified** — `### WP-186 Executed` summary
   block (see Definition of Done for required content).
9. `docs/ai/DECISIONS.md` — **modified** — add D-18601..D-18603 (see
   Definition of Done for the locked text).
10. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — flip WP-186 row
    to `[x]` with completion date.
11. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip
    EC-213 row to `Done`.

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
- No `@legendary-arena/registry` import from `packages/game-engine`.
- No `boardgame.io` import in pure helpers.

**Packet-specific:**

- This WP extends **only the timing union** —
  `VILLAIN_EFFECT_KEYWORDS` stays at five entries; no new effect
  keywords, no executor effect branches. Adding a keyword (including the
  each-player-KO keyword the dominant escape pattern needs) is a
  WP-185-side vocabulary-expansion WP.
- The parser change is **prefix detection only**. WP-186 reads the same
  `[effect:<VillainEffectKeyword>]` markers WP-185 reads; it must NOT
  introduce `[icon:]` / `[keyword:]` / free-text effect parsing.
- `Overrun:` is a v1 **synonym** of `Escape:` — both prefixes emit
  `timing: 'onEscape'`. The parser MUST NOT introduce an `'onOverrun'`
  timing.
- The fire-site call is **appended** within the existing escape branch.
  The pre-existing ordering (counter increment → push to
  `G.escapedPile` → generic current-player wound → bystander release) is
  preserved exactly; the new `executeVillainAbilities(..., 'onEscape')`
  call comes **after** `resolveEscapedBystanders`.
- **Escape resolves before Ambush (cross-branch ordering lock).** Within
  a single reveal the escape branch (the `onEscape` fire site) runs
  **before** the city-entry Ambush block (the `onAmbush` fire site for
  the newly entering card) — matching the canonical Reveal → Fight →
  Side-Effect ordering (ARCHITECTURE.md §Canonical Reveal → Fight →
  Side-Effect Ordering). This holds today by sequential structure
  (escape branch precedes the `hasAmbush(...)` block in
  `performVillainReveal`); WP-186 must NOT reorder them, and the
  integration test (§Files #7b) pins it so a future refactor cannot
  silently invert it.
- The generic per-escape current-player wound (WP-015 legacy behavior) is
  **preserved**; card-specific `Escape:` effects layer on top, they do
  not replace it.
- `captureBystander` under `onEscape` attaches one bystander from the
  supply pile to the escaped card now in `G.escapedPile` (D-18603).
- Per-copy hook objects are freshly constructed for every card-instance
  ext_id (mirrors D-13502 / WP-185).
- The drift-detection test extension is mandatory — the three-entry array
  must match the three-member union bidirectionally.
- `koHeroCurrentPlayer` auto-resolution (if reached via an escape marker)
  is deterministic zone-priority (discard before hand), then ext_id
  lexical — **NOT VP-based** (per-card hero VP is not in engine runtime
  state). Inherited from WP-185 / D-18503; do not re-derive a VP sort.

**Session protocol:**

- If WP-185 is not landed (no `G.villainAbilityHooks` field, no
  `executeVillainAbilities` export), stop and report `BLOCKED: WP-185`.
- If WP-188 has not landed (`grep -rnE "(Escape|Overrun):.*\[effect:" data/cards/`
  returns nothing), stop and report `BLOCKED: WP-188` — executing against
  marker-free escape data wires a pipeline that fires on nothing.
- If a real `Escape:` line falls outside the MVP vocabulary (e.g. the
  each-player-KO pattern), it carries no marker (WP-188 `_unassigned`),
  the parser emits a hook with `effects: []`, and the executor
  safe-skips. Do NOT extend the vocabulary mid-session.
- If a printed `Overrun:` card needs distinct scheme semantics, that is a
  future scheme-text WP — not an inline amendment.
- If WP-191 is absent from the execution baseline, do not claim full
  Definition of Done for WP-186. The fire-site wiring and synthetic-hook
  tests (§Files #7a, #7b) may still be implementable, but the
  real-registry villain end-to-end verification in §Files Expected to
  Change #7c and its matching Acceptance Criterion cannot pass until the
  reconciled zone-instance ext_id lookup model is present. Stop and
  report `BLOCKED: WP-191` rather than ship a partial-coverage close.

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

Parser prefix → timing detection (locked; case-insensitive, leading
whitespace trimmed; effects come from `[effect:]` markers on the line,
NOT from the prefix):

```
"Ambush:"  → 'onAmbush'   (WP-185)
"Fight:"   → 'onFight'    (WP-185)
"Escape:"  → 'onEscape'   (WP-186)
"Overrun:" → 'onEscape'   (WP-186 — v1 synonym)
```

---

## Acceptance Criteria

- [ ] `VillainAbilityTiming` and `VILLAIN_ABILITY_TIMINGS` are exact
  three-entry siblings (`['onAmbush', 'onFight', 'onEscape']`) — the
  drift-detection test passes — and `VILLAIN_EFFECT_KEYWORDS` is unchanged
  at five entries (no new keyword introduced).
- [ ] `buildVillainAbilityHooks` detects both `Escape:` and `Overrun:`
  line prefixes and emits hooks with `timing: 'onEscape'` (v1 synonym
  lock); effects come only from the line's `[effect:]` markers (empty
  when none present).
- [ ] When a villain whose escape line carries
  `[effect:gainWoundEachPlayer]` escapes during a reveal, every player's
  discard increments by 1 wound **in addition** to the generic
  current-player escape wound (subject to wound-pile availability).
- [ ] An `Escape:` / `Overrun:` line with no `[effect:]` marker (e.g. an
  each-player-KO line left unmarked by WP-188) produces a hook with
  `effects: []` and the executor no-ops; the generic escape behavior is
  unchanged.
- [ ] **Ordering integrity (integration test), both clauses:** (a) the
  pre-existing escape branch internal order is preserved — counter
  increment → push to `G.escapedPile` → generic current-player wound →
  bystander release → **new** `onEscape` call; AND (b) when the same
  reveal both pushes a card off the escape edge AND the newly entering
  card carries an `onAmbush` effect, the escaped card's `onEscape`
  effects resolve **before** the entering card's `onAmbush` effects —
  proven by a deterministic non-commutative observable (see the
  integration-test entry, §Files Expected to Change #7).
- [ ] **End-to-end villain escape on a real card (post-WP-191
  reconciliation, §Files #7c):** an integration test that builds initial
  game state via `buildInitialGameState` against the real registry,
  escapes a real villain whose `Escape:` line carries
  `[effect:gainWoundEachPlayer]`, and asserts every player's wound count
  increases. This test would have FAILED under the D-18508 grammar gap
  and PASSES because WP-191 ✅ closed it (`20de3ae`); pair with a
  henchman end-to-end escape for symmetry.
- [ ] `villainDeck.reveal.ts` contains one
  `executeVillainAbilities(..., 'onEscape')` call in the escape branch
  and one `executeVillainAbilities(..., 'onAmbush')` call in the
  city-entry Ambush branch; no other `executeVillainAbilities` call is
  introduced by WP-186.
- [ ] The executor file `villainEffects.execute.ts` is **not** modified
  (no timing-specific branch added; dispatch is by hook lookup).
- [ ] `pnpm --filter @legendary-arena/game-engine build` and
  `pnpm --filter @legendary-arena/game-engine test` both exit 0
  (post-WP-185 baseline +N new tests).
- [ ] No `@legendary-arena/registry` or `boardgame.io` import in any
  modified file (verified by grep).
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Confirm WP-188 landed (escape/overrun markers exist) — else this WP is BLOCKED.
# The alternation matches BOTH prefixes so the gate does not falsely report
# "blocked" if WP-188 only marked Overrun: lines (or only Escape: lines).
grep -rnE "(Escape|Overrun):.*\[effect:" data/cards/ | head
# Expected: at least one match (e.g. an [effect:gainWoundEachPlayer] escape line)

# Build & test the engine
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test

# Layer-boundary greps (must each return zero matches in modified files)
grep -n "@legendary-arena/registry" packages/game-engine/src/rules/villainAbility.types.ts
grep -n "@legendary-arena/registry" packages/game-engine/src/setup/villainAbility.setup.ts
grep -n "boardgame.io" packages/game-engine/src/rules/villainAbility.types.ts

# New timing entry present
grep -n "'onEscape'" packages/game-engine/src/rules/villainAbility.types.ts

# Escape: and Overrun: prefix detection present in the parser
grep -n "escape:" packages/game-engine/src/setup/villainAbility.setup.ts
grep -n "overrun:" packages/game-engine/src/setup/villainAbility.setup.ts

# Two executeVillainAbilities calls in reveal.ts (one onAmbush, one onEscape)
grep -c "executeVillainAbilities" packages/game-engine/src/villainDeck/villainDeck.reveal.ts
# Expected: 2

# Executor file unchanged vs its WP-185 form (no timing-specific branch added)
git diff --stat packages/game-engine/src/villain/villainEffects.execute.ts
# Expected: no changes

# Effect-keyword vocabulary unchanged (still exactly five). The drift-detection
# test is authoritative for the count; this grep is a robustness sanity check that
# the canonical array declaration is present and intact — it matches the export
# line, not a raw substring count (which would be brittle: comments and the union
# type name shift the count).
grep -n "VILLAIN_EFFECT_KEYWORDS: readonly VillainEffectKeyword\[\] = \[" packages/game-engine/src/rules/villainAbility.types.ts
# Expected: 1 match (declaration unchanged)

# Drift-detection test
pnpm --filter @legendary-arena/game-engine test --grep "VILLAIN_ABILITY_TIMINGS"

# Full monorepo build
pnpm -r build
```

Expected outputs: the escape/overrun-marker grep returns matches (WP-188
landed); registry / boardgame.io greps return nothing; the `'onEscape'` grep
returns one or more matches; the prefix greps each return a match; the
`executeVillainAbilities` grep returns `2`; the executor-file diff is
empty; the `VILLAIN_EFFECT_KEYWORDS` declaration grep returns one match
(array intact); drift-detection test passes.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` updated with `### WP-186 Executed` block — one
  paragraph summarizing the timing-union extension, the new escape fire
  site, the `Overrun:`/`Escape:` synonym lock, the honest note that v1
  escape coverage is `gainWoundEachPlayer`-dominated (each-player-KO
  deferred per D-18802 pending WP-189 + WP-190), and the note that
  villain `onEscape` effects fire end-to-end on real cards (WP-191 ✅
  closed D-18508 at `20de3ae`; D-18704..D-18708) — verified by the
  Files #7c real-registry integration test.
- [ ] `docs/ai/DECISIONS.md` updated with **D-18601..D-18603** (proposed):
  - D-18601: `'onEscape'` added to `VILLAIN_ABILITY_TIMINGS` (third
    entry); extends the WP-185 lock under D-18501.
  - D-18602: `Overrun:` is a v1 synonym of `Escape:` — both prefixes emit
    `timing: 'onEscape'`. Rationale: real scheme `Overrun:` text has
    setup-tied semantics outside MVP scope; villain-card `Overrun:` text
    behaves like `Escape:`. Distinct `'onOverrun'` deferred.
  - D-18603: `captureBystander` under `onEscape` attaches to the escaped
    card (now in `G.escapedPile`), because the fire site runs after
    `resolveEscapedBystanders`. Future WP may refine.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-186 flipped to `[x]`
  with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-213 flipped to
  `Done`.
- [ ] No files outside the 11-file `## Files Expected to Change` list
  were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §22 (Replay determinism), §10 (Card-data semantics).

**Conflict assertion:** No conflict. This WP extends WP-185's faithfulness
improvement to the third major villain-card trigger (escape). The limited
v1 escape coverage (each-player-KO deferred) is acknowledged in §Context
and §Out of Scope — the WP does not claim full escape coverage.

**Non-Goal proximity check:** None of NG-1..NG-7 are crossed. Pure engine
correctness change.

**Determinism preservation:** All new code paths are deterministic. The
escape branch is already deterministic (no `ctx.random.*` introduced or
removed). The new `executeVillainAbilities` call reuses WP-185's
deterministic auto-resolution — `koHeroCurrentPlayer` (if reached) orders
by zone (discard→hand) then ext_id lexical, **not** by VP (per-card VP is
not in engine runtime state; D-18503). The escape-before-Ambush ordering
within a reveal is fixed by sequential structure and pinned by an
integration test (§Files #7b), so replay order cannot silently invert.
Same seed + same moves = same escape resolution every replay.

---

## Funding Surface Gate

N/A — engine-only WP; no §20.1 trigger surfaces touched.

---

## API Catalog Update

N/A — engine-only WP; no HTTP endpoints or `apps/server/src/**` library
functions touched.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites; WP-185 + WP-188 marked as hard-deps | ✅ |
| 3 | Context (Read First) is specific (file paths + sections) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract; 11 files (7 engine/tests + 4 governance/index) | ✅ |
| 6 | Non-Negotiable Constraints section present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria are testable bullets | ✅ |
| 8 | Verification Steps are operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved | ✅ |
| 11 | Identity model N/A | N/A |
| 12 | Test rules: node:test only | ✅ |
| 13 | pnpm commands only; expected output shown | ✅ |
| 14 | Acceptance 6–12 binary items (consolidated to 10); specific filenames + counts | ✅ |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX / scope-bound | ✅ |
| 16 | Code style: full English names, JSDoc, no .reduce | ✅ |
| 17 | Vision Alignment present; clauses cited; determinism line included (zone-priority KO, not VP) | ✅ |
| 18 | Prose-vs-grep: §Verification Steps grep targets are scoped to filenames | ✅ |
| 19 | Bridge-vs-HEAD staleness — commit-time discipline | N/A |
| 20 | Funding surface N/A with justification | ✅ |
| 21 | API catalog N/A with justification | ✅ |

---

*Reworked: 2026-05-28 to enrichment-first model (was: `[icon:]`/`[keyword:]`
markup extraction). Baseline `origin/main @ cc29447`. Hard-deps: WP-185
(engine infrastructure) + WP-188 (escape effect markers) — both ✅ as of
2026-05-30. Revised 2026-05-30 to reconcile against WP-191 ✅ (closes
D-18508 at `20de3ae`; D-18704..D-18708): villain `onEscape` now fires
end-to-end on real cards; added §Files #7c real-registry end-to-end test
+ matching AC to verify consumption of the reconciled grammar.
Revised 2026-05-30 (second pass): expanded §Files Expected to Change
from 7 to 11 (added STATUS/DECISIONS/WORK_INDEX/EC_INDEX entries to
resolve the prior contradiction with DoD's "No files outside" gate);
promoted WP-191 from "upstream reconciler" to **DoD gate** in §Assumes
+ §Session protocol (preserves the wiring-doesn't-strictly-depend
nuance but blocks false-green completion claims); added execution
baseline clarification; tightened the executeVillainAbilities AC.*
