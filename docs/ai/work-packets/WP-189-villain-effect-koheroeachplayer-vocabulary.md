# WP-189 — Villain Effect Vocabulary Expansion: `koHeroEachPlayer` (Engine)

## Goal

Add a single sixth keyword — `koHeroEachPlayer` — to the villain-effect
vocabulary and its executor, so that the dominant blocked escape/ambush
pattern ("Each player KOs one of their Heroes") can execute. Today the
WP-185 MVP vocabulary is current-player-biased: it has `koHeroCurrentPlayer`
but no each-player KO keyword, so the ~11 unconditional "each player KOs one
Hero" lines across Ambush / Fight / Escape are inexpressible and were
deferred to `_unassigned` (D-18802). This WP adds the engine half of closing
that gap: the keyword in `VillainEffectKeyword` + `VILLAIN_EFFECT_KEYWORDS`,
and a `koHeroEachPlayer` dispatch branch in the executor that mirrors
`koHeroCurrentPlayer` applied to every player in deterministic order. The
data half — curating the lines with `[effect:koHeroEachPlayer]` markers — is
WP-190; without it this keyword has nothing to read. Together WP-189 + WP-190
make WP-186's escape pipeline materially active on real cards.

> **Incremental-expansion governance clause (locked).** Each-player
> vocabulary is expanded incrementally, keyword-by-keyword, only where
> unconditional, magnitude-1 patterns are present in the current dataset.
> Conditional and filtered each-player effects (cost-gated, class-gated,
> "or gains a Wound", magnitude>1, compound clauses) remain out of scope for
> the MVP. This WP adds exactly one keyword (`koHeroEachPlayer`) and no
> machinery beyond a dispatch branch.

---

## Assumes

- **WP-185 ✅ (hard-dep — engine infrastructure).** The villain-ability
  hook table (`G.villainAbilityHooks`), the executor
  (`villain/villainEffects.execute.ts`) with its per-keyword dispatch and
  the `koHeroCurrentPlayer` auto-resolution helper, and the
  `VillainEffectKeyword` union + `VILLAIN_EFFECT_KEYWORDS` canonical array
  (5 entries) must be landed. This WP extends the union/array to 6 and adds
  one executor branch. **If WP-185 has not executed, stop and report
  `BLOCKED: WP-185`.**
- WP-009A / WP-009B / WP-017 ✅ — `koCard` and the zone helpers the
  executor calls exist.
- The `koHeroCurrentPlayer` deterministic auto-resolution (zone-priority
  discard→hand, then ext_id lexical; D-18503) is the reusable per-player
  primitive `koHeroEachPlayer` iterates. WP-189 reuses it; it does not
  re-derive a VP-based or interactive resolution.
- **WP-190 (downstream data — NOT a dependency).** WP-190 authors the
  `[effect:koHeroEachPlayer]` markers this keyword reads. WP-189 does not
  consume WP-190; WP-189 adds the keyword + executor branch and is
  independently testable with synthetic hooks. The keyword is inert on
  real cards until WP-190 lands.
- **Drafting baseline:** `origin/main @ cc29447` (2026-05-28).

---

## Context (Read First)

- **WP-185** (re-specced, enrichment-first) — the WP that introduced the
  5-keyword vocabulary, the executor, and the `koHeroCurrentPlayer`
  resolution this WP reuses per-player. Do not re-derive its locked values.
- **WP-190** — the paired data WP that curates the each-player-KO lines.
  WP-189 (engine keyword) + WP-190 (data markers) are the engine/data pair,
  mirroring WP-185↔WP-187 and WP-186↔WP-188.
- `docs/ai/ARCHITECTURE.md §Section 4 — boardgame.io Runtime Model`
  (Move Validation Contract, Rule Execution Pipeline) — moves never throw;
  effects mutate G via helpers, deterministically.
- `docs/ai/ARCHITECTURE.md §Section 1 — Layer Boundary (Authoritative)`
  — Game Engine layer; no registry runtime import.
- `docs/ai/REFERENCE/00.6-code-style.md` — no `.reduce()` in effect
  application; full English names; JSDoc; explicit `// why:` comments.
- `docs/ai/REFERENCE/00.6-code-style.md §Drift Detection` —
  `RULE_EFFECT_TYPES`-style canonical-array discipline; the same applies to
  `VILLAIN_EFFECT_KEYWORDS`: never change the union without the array and
  vice versa.
- `docs/ai/DECISIONS.md` — scan D-18501..D-18506 (WP-185 lock set, incl.
  the 5-keyword vocabulary + D-18503 zone-priority KO resolution),
  D-18802 (the each-player-KO deferral this WP supersedes).
- `.claude/rules/architecture.md` + `.claude/rules/code-style.md` +
  `.claude/skills/legendary-game-engine/SKILL.md`.
- `packages/game-engine/src/rules/villainAbility.types.ts` (WP-185 output)
  — the union + canonical array being extended.
- `packages/game-engine/src/villain/villainEffects.execute.ts` (WP-185
  output) — the executor; the `koHeroCurrentPlayer` branch + its
  auto-resolution helper are the model the new branch reuses per-player.

---

## Context

WP-185 deliberately locked the v1 vocabulary to five keywords and biased it
toward current-player effects, because Ambush/Fight effects predominantly
target the current player. WP-186 + WP-188 then surfaced that escape effects
are predominantly *each-player* — the single largest execution-coverage gap
is "Each player KOs one of their Heroes." WP-188 measured 9 such escape lines
(plus matching Ambush/Fight lines, ~11 unconditional magnitude-1 total) and
deferred them all to `_unassigned` with `reason: "no-vocabulary-keyword"`
(D-18802), because no keyword could express them.

`koHeroEachPlayer` is the minimal, clean closure of that gap. It is the
conceptual twin of the existing `koHeroCurrentPlayer`: same per-player
resolution, applied to every player instead of just the current one. It
introduces no conditional logic, no filtering, no magnitude parameter, and
no interactive-choice machinery — each player's KO is auto-resolved by the
same deterministic helper `koHeroCurrentPlayer` already uses. It is a
dispatch branch, not new machinery.

This WP is the **engine** half. The **data** half (WP-190) curates the
deferred lines with `[effect:koHeroEachPlayer]` markers and teaches the
overlay script the sixth keyword. Neither half is useful alone:
WP-189 without WP-190 is an unread keyword; WP-190 without WP-189 would
loud-fail (the marker validates against the engine vocabulary). The two
land as a pair.

---

## Scope (In)

- **Extend `VillainEffectKeyword` union** — add `'koHeroEachPlayer'` as the
  sixth member.
- **Extend `VILLAIN_EFFECT_KEYWORDS` canonical array** — append
  `'koHeroEachPlayer'` at position 6 (end). The existing five keep their
  positions and order (WP-187's executed markers and the overlay script's
  hardcoded copy depend on the first five being unchanged). Bidirectional
  drift-detection test updated to the six-entry array.
- **Add the `koHeroEachPlayer` executor branch** —
  `villain/villainEffects.execute.ts`: a new dispatch case that iterates
  every player in `G.playerZones` in **ascending player-ID order** and, for
  each, KOs exactly one hero from that player's own zones via the **same
  deterministic auto-resolution `koHeroCurrentPlayer` uses** (discard before
  hand; ext_id lexical tie-break; silent no-op for a player with no hero in
  either zone). Extract the existing per-player KO logic into a shared
  helper if `koHeroCurrentPlayer` does not already expose one, so the two
  branches call identical resolution (no duplicated resolution logic).
- **Semantics (locked):** for each player, KO **exactly one** hero,
  unconditional, no filter, deterministic. `koHeroCurrentPlayer` is
  unchanged and continues to target only the current player.
- **Incremental-expansion governance clause** — recorded verbatim-level in
  §Non-Negotiable Constraints and as D-18901.
- **Unit tests** — drift-detection for the six-entry array ↔ union;
  executor tests for `koHeroEachPlayer` (two-player and three-player mock G:
  each player loses exactly one hero by the deterministic rule; a player
  with no hero is skipped silently; current player is not special-cased);
  a determinism test (same mock G + same dispatch → identical KO targets
  and identical `G.messages` order across two runs).
- **STATUS.md entry**, **DECISIONS.md entries** (D-18901..D-18902),
  **WORK_INDEX.md flip to `[x]`**, **EC-216 flip to Done**.

## Out of Scope

- **Authoring the `[effect:koHeroEachPlayer]` markers** — that is WP-190
  (data). WP-189 only adds the keyword and its execution; it edits no card
  data and no overlay script.
- **`discardCardEachPlayer` or any discard each-player keyword** — the
  discard family is overwhelmingly conditional/filtered (73 lines, ~90%
  cost-/class-/choice-gated) and violates the unconditional-magnitude-1
  discipline. Explicitly deferred.
- **Filtered / conditional each-player KO** — "each player KOs a Hero that
  costs ≥ X", "a non-grey Hero", "a [team] Hero", "or gains a Wound". These
  need predicate machinery the MVP defers; they stay in WP-190's
  `_unassigned`.
- **Magnitude variants** — "each player KOs **two** Heroes". No `N`
  parameter is introduced; magnitude>1 lines stay unmarked.
- **Compound clauses** — "each player KOs a Hero **and** …". Out of scope.
- **Interactive player choice** — auto-resolution only, same MVP discipline
  and deterministic rule as `koHeroCurrentPlayer` (D-18503). Interactive
  targeting is a future UI/server WP.
- **Reordering the existing five keywords** — `koHeroEachPlayer` appends at
  position 6; positions 1–5 are unchanged.
- **Changing `koHeroCurrentPlayer` semantics** — it stays current-player
  only; this WP only *reuses* its resolution helper.
- **Master Strike / Twist each-player text** — those run through the
  mastermind-strike system (WP-024 / `onMastermindStrikeRevealed`), not the
  villain-ability hooks; out of scope.
- **`VILLAIN_ABILITY_TIMINGS`** — untouched (this is an effect-keyword
  expansion, not a timing expansion).
- **Card-data, overlay-script, registry-viewer surfaces** — none.

---

## Files Expected to Change

1. `packages/game-engine/src/rules/villainAbility.types.ts` — **modified**
   — add `'koHeroEachPlayer'` to the `VillainEffectKeyword` union; append it
   at position 6 of `VILLAIN_EFFECT_KEYWORDS`; update the array's `// why:`
   comment to record the incremental-expansion clause (D-18901).
2. `packages/game-engine/src/villain/villainEffects.execute.ts` —
   **modified** — add the `koHeroEachPlayer` dispatch branch; extract /
   reuse the shared per-player KO resolution helper so it and
   `koHeroCurrentPlayer` resolve identically. No change to the other four
   effect branches.
3. `packages/game-engine/src/rules/villainAbility.types.test.ts` —
   **modified** — drift-detection assertions updated to the six-entry array
   ↔ union.
4. `packages/game-engine/src/villain/villainEffects.execute.test.ts` —
   **modified** — add `koHeroEachPlayer` executor tests (multi-player KO,
   no-hero skip, determinism) and a test that `koHeroCurrentPlayer` is
   unaffected.

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
  I/O.** (This effect uses no randomness — auto-resolution is a sort, not a
  draw.)
- `G` is JSON-serializable.
- Moves never throw. The executor returns `void` and silently no-ops on a
  player with no eligible hero.
- No `@legendary-arena/registry` import; no `boardgame.io` import in pure
  helpers.

**Packet-specific:**

- Exactly **one** new keyword: `koHeroEachPlayer`. The vocabulary goes
  5 → 6 entries. Adding any other keyword (discard, filtered, magnitude) is
  out of scope and a separate WP.
- `VILLAIN_EFFECT_KEYWORDS` append position is **6 (end)**; the first five
  entries and their order are unchanged.
- `koHeroEachPlayer` iterates players in **ascending player-ID order** and
  KOs **exactly one** hero per player via the **same** deterministic
  resolution as `koHeroCurrentPlayer` (discard before hand; ext_id lexical;
  silent no-op when a player has no hero). It must call a **shared** helper,
  not a second copy of the resolution logic.
- `koHeroCurrentPlayer` is **unchanged** — still current-player only.
- The incremental-expansion governance clause (below) is recorded as
  D-18901 and as a `// why:` on the canonical array.
- No interactive choice; no VP-based resolution (per-card hero VP is not in
  engine runtime state — D-18503).
- This WP edits **no card data** and **no overlay script** — the markers are
  WP-190's job.

**Session protocol:**

- If WP-185 has not executed (no `VILLAIN_EFFECT_KEYWORDS`, no executor),
  stop and report `BLOCKED: WP-185`.
- If a real card needs filtered / magnitude>1 / discard each-player
  semantics, it stays out of scope — do NOT widen the keyword's meaning or
  add a second keyword mid-session.

**Locked contract values:**

```typescript
export type VillainEffectKeyword =
  | 'gainWoundEachPlayer'
  | 'gainWoundCurrentPlayer'
  | 'koHeroCurrentPlayer'
  | 'heroDeckTopToEscape'
  | 'captureBystander'
  | 'koHeroEachPlayer'; // WP-189 — appended at position 6

export const VILLAIN_EFFECT_KEYWORDS: readonly VillainEffectKeyword[] = [
  'gainWoundEachPlayer',
  'gainWoundCurrentPlayer',
  'koHeroCurrentPlayer',
  'heroDeckTopToEscape',
  'captureBystander',
  'koHeroEachPlayer',
] as const;
```

**Incremental-expansion governance clause (locked — D-18901):**

> Each-player vocabulary is expanded incrementally, keyword-by-keyword, only
> where unconditional, magnitude-1 patterns are present in the current
> dataset. Conditional and filtered each-player effects remain out of scope
> for the MVP.

---

## Acceptance Criteria

- [ ] `VillainEffectKeyword` union has exactly six members; `'koHeroEachPlayer'`
  is the sixth.
- [ ] `VILLAIN_EFFECT_KEYWORDS` has exactly six entries with
  `'koHeroEachPlayer'` at index 5 (position 6); the first five entries and
  their order are byte-identical to the WP-185 array.
- [ ] Drift-detection test asserts the six-entry array ↔ union bidirectional
  equality and passes.
- [ ] Dispatching `koHeroEachPlayer` on a two-player mock G KOs exactly one
  hero from **each** player's zones (discard before hand, ext_id lexical),
  leaving no player un-targeted.
- [ ] A player with no hero in discard or hand is skipped silently (no
  throw, no spurious KO, no message claiming a KO).
- [ ] `koHeroEachPlayer` and `koHeroCurrentPlayer` call the **same** shared
  per-player resolution helper (no duplicated resolution logic) — verified
  by inspection / a test asserting identical single-player behavior.
- [ ] `koHeroCurrentPlayer` behavior is unchanged (regression test still
  targets only the current player).
- [ ] Determinism: two dispatches against an identical mock G produce
  identical KO targets and identical `G.messages` ordering.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with the
  pre-WP baseline +N new tests.
- [ ] No `@legendary-arena/registry` or `boardgame.io` import added to any
  modified file.
- [ ] No card-data file and no overlay script is modified by this WP
  (`git diff --stat data/ scripts/` is empty).
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Build & test the engine
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test

# Vocabulary is exactly six entries, koHeroEachPlayer last
grep -n "koHeroEachPlayer" packages/game-engine/src/rules/villainAbility.types.ts
grep -c "'koHeroEachPlayer'\|'gainWoundEachPlayer'\|'gainWoundCurrentPlayer'\|'koHeroCurrentPlayer'\|'heroDeckTopToEscape'\|'captureBystander'" packages/game-engine/src/rules/villainAbility.types.ts
# Expected: the canonical array + union list six keyword strings

# Executor has a koHeroEachPlayer branch reusing the shared resolver
grep -n "koHeroEachPlayer" packages/game-engine/src/villain/villainEffects.execute.ts

# Layer-boundary greps (zero matches)
grep -n "@legendary-arena/registry" packages/game-engine/src/villain/villainEffects.execute.ts
grep -n "boardgame.io" packages/game-engine/src/rules/villainAbility.types.ts

# This WP touches NO data and NO overlay script
git diff --stat data/ scripts/
# Expected: empty

# Drift-detection test
pnpm --filter @legendary-arena/game-engine test --grep "VILLAIN_EFFECT_KEYWORDS"

# Full monorepo build
pnpm -r build
```

Expected outputs: `koHeroEachPlayer` present in the types file (union +
array) and the executor; the registry / boardgame.io greps return nothing;
`git diff --stat data/ scripts/` is empty; the drift-detection test passes;
`pnpm -r build` exits 0.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` updated with a `### WP-189 Executed` block (the
  6th keyword, the shared-resolver reuse, the each-player iteration order,
  the note that it is inert until WP-190 authors markers).
- [ ] `docs/ai/DECISIONS.md` updated with **D-18901..D-18902** (proposed):
  - D-18901: each-player vocabulary expands incrementally, keyword-by-keyword,
    only for unconditional magnitude-1 patterns present in the dataset;
    conditional/filtered each-player effects stay out of MVP. Supersedes the
    "vocabulary locked at 5" framing of the WP-185 draft for the
    `koHeroEachPlayer` addition; D-18802's deferral is resolved for the
    unconditional subset (the conditional remainder stays deferred).
  - D-18902: `koHeroEachPlayer` reuses `koHeroCurrentPlayer`'s deterministic
    per-player resolution (discard→hand, ext_id lexical; D-18503) applied
    over players in ascending player-ID order; no interactive choice, no VP.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-189 flipped to `[x]`
  with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-216 flipped to
  `Done`.
- [ ] No files outside the 4-file `## Files Expected to Change` list were
  modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §22 (Replay determinism), §10 (Card-data semantics).

**Conflict assertion:** No conflict. This WP makes the engine honor the
printed "each player KOs a Hero" text — the single largest unhandled
villain-effect pattern. The incremental-expansion clause (D-18901) keeps the
vocabulary disciplined and prevents speculative surface area.

**Non-Goal proximity check:** None of NG-1..NG-7 are crossed. Pure engine
correctness change; no PvP framing, monetization, or scoring surface.

**Determinism preservation:** `koHeroEachPlayer` is deterministic — it
iterates players in ascending player-ID order and resolves each player's KO
by the existing discard→hand, ext_id-lexical sort (no `ctx.random.*`, no VP,
no clock). Same seed + same moves = same KO targets and same `G.messages`
order every replay.

---

## Funding Surface Gate

N/A — engine-only WP; no §20.1 trigger surfaces touched (no navigation
funding affordance, no registry-viewer surface, no profile attribution, no
user-visible donate copy).

---

## API Catalog Update

N/A — engine-only WP; no HTTP endpoints or `apps/server/src/**` library
functions added/modified/removed.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites; WP-185 hard-dep; WP-190 downstream | ✅ |
| 3 | Context (Read First) is specific (file paths + sections) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract; 4 files (engine + tests) | ✅ |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria are testable bullets | ✅ |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — engine only; no registry/boardgame.io in pure helpers | ✅ |
| 11 | Identity model N/A | N/A |
| 12 | Test rules: node:test only, makeMockCtx, no boardgame.io/testing | ✅ |
| 13 | pnpm commands only; expected output shown | ✅ |
| 14 | Acceptance ≤ 13 binary items; specific filenames + token greps | ✅ |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX / scope-bound | ✅ |
| 16 | Code style: full English names, JSDoc, shared helper (no dup), no .reduce | ✅ |
| 17 | Vision Alignment present; clauses §1/§2/§10/§22; determinism line included | ✅ |
| 18 | Prose-vs-grep: §Verification greps scoped to filenames/tokens, not raw forbidden tokens | ✅ |
| 19 | Bridge-vs-HEAD staleness — commit-time discipline | N/A |
| 20 | Funding surface N/A with justification | ✅ |
| 21 | API catalog N/A with justification | ✅ |

---

*Drafted: 2026-05-28. Baseline `origin/main @ cc29447`. Engine half of the
`koHeroEachPlayer` expansion; paired with WP-190 (data markers). Hard-dep:
WP-185. Supersedes the unconditional portion of D-18802's deferral.*
