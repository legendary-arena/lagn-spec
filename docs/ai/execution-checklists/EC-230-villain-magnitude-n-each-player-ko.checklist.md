# EC-230 — Villain Magnitude-N Each-Player Hero KO (Execution Checklist)

**Source:** docs/ai/work-packets/WP-202-villain-magnitude-n-each-player-ko.md
**Layer:** Cross-cutting — Game Engine (`packages/game-engine/src/`) + Card-data tooling (`scripts/convert-cards/`, `data/cards/`)

> **Use the locked values, constraints, and rationale from WP-202
> verbatim. EC-230 is the operational order + gates + failure smells; it
> does NOT supersede the WP. If EC-230 and WP-202 conflict on
> requirements, WP-202 wins.**

## Execution Order (Locked)

1. **Sub-task A — Engine half**
   - types (`villainAbility.types.ts`)
   - executor (`villainEffects.execute.ts`)
   - tests (`villainAbility.types.test.ts` + `villainEffects.execute.test.ts`)
   - engine build/test gates pass
2. **Sub-task B — Data half**
   - overlay local array (`apply-effect-markers.mjs`)
   - propose heuristic (same file)
   - marker map (`villain-effect-markers.json`)
   - `data/cards/*.json` regeneration (bounded to `core.json` + `msp1.json`)
   - idempotency + exact-count + bounded-diff gates pass

**Sub-task B MUST NOT begin until Sub-task A is merged or otherwise
present on the working baseline** — else the overlay's local
seven-keyword copy points at a non-existent engine keyword and the
script loud-fails on first apply. Either sub-task MAY be its own session
per `.claude/CLAUDE.md` One-Packet-per-Session rule if scheduling
pressure makes a single execution risky (treat as two ECs sharing one WP).

## Before Starting

- [ ] **WP-185 landed** ✅ — executor + `koHeroCurrentPlayer` resolver exist. **HARD-STOP if missing → `BLOCKED: WP-185`.**
- [ ] **WP-187 landed** ✅ — `apply-effect-markers.mjs` + `villain-effect-markers.json` exist.
- [ ] **WP-188 landed** ✅ — `SUPPORTED_TIMINGS` includes `escape`/`overrun`; WP-188 authored the `_unassigned` rows under `reason: "no-vocabulary-keyword"` (D-18802) that this WP partially resolves.
- [ ] **WP-189 landed** ✅ — `koHeroEachPlayer` at position 6 (index 5); shared `koOneHeroForPlayer(G, playerId)` resolver exists; lexical player iteration locked (D-18902). Verify: `grep -n "koHeroEachPlayer\|koOneHeroForPlayer" packages/game-engine/src/rules/villainAbility.types.ts packages/game-engine/src/villain/villainEffects.execute.ts`. **HARD-STOP if missing → `BLOCKED: WP-189`.**
- [ ] **WP-190 landed** ✅ — overlay's local `VILLAIN_EFFECT_KEYWORDS` has `koHeroEachPlayer` at position 6 (index 5) per hand-sync D-19002. Verify: `grep -n "koHeroEachPlayer" scripts/convert-cards/apply-effect-markers.mjs`. **HARD-STOP if missing → `BLOCKED: WP-190`.**
- [ ] **WP-191 landed** ✅ — villain ability hooks key by copy-indexed instance ext_id so the new markers fire end-to-end.
- [ ] Read WP-202 §Audit-scope clarification, §Goal, §Non-Negotiable Constraints, and §Acceptance Criteria — those sections are authoritative and govern execution.
- [ ] Read WP-189 + WP-190 — same shared-resolver discipline, same hand-sync convention, same EXACT CURATION COUNT IS FIXED pattern carry forward; do NOT re-derive their locked values.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0; `pnpm --filter @legendary-arena/game-engine test` exits 0; `pnpm -r build` exits 0 (baseline).

## Locked Values (verbatim from WP-202)

> The locked contract values, locked overlay-script local copy, and
> closed-union-per-magnitude governance clause live in
> WP-202 §Non-Negotiable Constraints → Locked contract values. Do NOT
> re-derive or paraphrase here. The condensed summary below is for
> session orientation only.

- New keyword: **`koHeroEachPlayerMag2`** at position 7 (index 6); vocabulary 6 → 7.
- Magnitude bound: **literal `2`** inner-loop iterations per player; NOT parameterized.
- Player iteration: `Object.keys(G.playerZones).sort()` (lexical ascending; D-18902).
- Shared resolver: `koOneHeroForPlayer(G, playerId)` — three call sites total (`koHeroCurrentPlayer` + `koHeroEachPlayer` + `koHeroEachPlayerMag2`).
- Per-player semantics: discard → hand, `ext_id` lexical, silent no-op for zero eligible heroes (per iteration). NOT VP. NOT interactive.
- Curatable yield: **2 markers, both Escape, both Destroyer** — `villains/core/enemies-of-asgard/destroyer` + `villains/msp1/enemies-of-asgard/destroyer`. Zero Ambush/Fight/Overrun.
- EXACT CURATION COUNT = 2 invariant; `grep -r "\[effect:koHeroEachPlayerMag2\]" data/cards/ | wc -l` MUST = 2.
- 4 deferred D-18802 Escape rows stay in `_unassigned`: `hela-2099` (target+choice), `juggernaut` Escape (source-filter), `bullseye` (stat-filter), `ultimaton-weapon-xv` (class-filter). Their `reason` tag stays byte-identical. WP-202 does NOT re-tag.

## Guardrails

### Semantic (the lines you must not cross)

- **Each-player ≠ current-player conversion = semantic-corruption FAIL** (extends D-19001).
- **Magnitude IS literal `2`** — no parameter, no constant, no `N` (D-20201). Future N≥3 is a separate WP that copy-paste-edits the case body.
- **Shared-resolver reuse is mandatory** (D-18902 extends here) — any duplicated KO resolution logic outside `koOneHeroForPlayer` is FAIL.
- Source-filtered, target-filtered, class-filtered, and choice each-player hero KO variants stay in `_unassigned`. Do NOT force them onto `koHeroEachPlayerMag2`.
- Do NOT change `koHeroEachPlayer` or `koHeroCurrentPlayer` semantics — both unchanged; this WP reuses, it does not modify.
- Do NOT add a VP-based or interactive resolution.
- Do NOT add any keyword other than `koHeroEachPlayerMag2`.

### Execution (the things you must not touch)

- **EXACT CURATION COUNT = 2** (hard invariant; close-out `wc -l` gate).
- Touch ONLY `apply-effect-markers.mjs` + `villain-effect-markers.json` on the data side — no other converter, no engine file outside the 4 listed in §Files to Produce.
- Local seven-keyword array (overlay script) is a hand-kept copy (no import from `packages/` into a `.mjs`); loud-fails on drift — do NOT auto-sync.
- Do NOT reorder the first six keywords; append `koHeroEachPlayerMag2` at position 7 (index 6) only.
- Do NOT alter `isTimingLine`, `SUPPORTED_TIMINGS`, the append logic, or the loud-fail behavior — only the local array + a propose heuristic change.
- Overlay stays idempotent (second run = zero diff) and loud-fail (unknown keyword / missing entity / zero-or-multiple match).
- WP-187/188/190 markers untouched; re-run is additive-only.
- `G.villainAbilityHooks` / `G` stays JSON-serializable.
- Drift-detection test MUST be updated from six to seven entries + append-only-invariant guard MUST pin indices 0-5 byte-identical; do NOT leave it asserting six.
- No randomness, no clocks, no network.

## Required `// why:` Comments

- `VILLAIN_EFFECT_KEYWORDS` canonical array (engine): extend the existing `// why:` to cite **D-20201** — magnitude-N each-player hero KO uses closed-union-per-magnitude keywords appended at position N; parameterized markers (`[effect:koHeroEachPlayer:N]`) rejected for v1; the append-only-position-N pattern (D-18901) extends to position 7.
- `villainEffects.execute.ts` `koHeroEachPlayerMag2` branch: cite **D-18902** (lexical player iteration + shared-resolver mutation-location lock), **D-20201** (literal-2 inner loop is intentional, NOT a parameter — future N≥3 is copy-paste-edit), **D-18503** (per-player auto-resolution, not interactive, not VP-based). Additionally include a **forward-looking extension-seam line** so the closed-union-per-magnitude pattern is discoverable by code search: *"Future magnitude-N expansion (e.g., `koHeroEachPlayerMag3`): copy this entire case body, rename to `MagN`, change the literal `2` to `N`, append the new keyword at the next position in `VILLAIN_EFFECT_KEYWORDS`. No parser/regex/dispatch contract change — closed-union-per-magnitude (D-20201) is the seam, and the inner-loop bound is intentionally literal (not extracted to a helper) because parameterization would re-introduce the shape D-20201 rejects."*
- `VILLAIN_EFFECT_KEYWORDS` local array (overlay script): update the existing `// why:` (cites D-19002 hand-sync at position 6) to cite **D-20202** — seventh keyword `koHeroEachPlayerMag2` is also hand-synced; indices 0-5 remain byte-identical to the post-WP-190 array.
- New `koHeroEachPlayerMag2` `PROPOSE_HEURISTICS` entry: why a magnitude-2 specific pattern disambiguates from `koHeroEachPlayer`'s existing heuristic (which matches BOTH "one" AND "two"). **`--propose` is advisory only; final curation is EXACT TEXT MATCH on `"Escape: Each player KOs two of their Heroes."`** — no fuzzy acceptance regardless of `--propose` output.

## Files to Produce

### Sub-task A — Engine half (4 files)

- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — add `'koHeroEachPlayerMag2'` to the union; append at position 7 (index 6) of `VILLAIN_EFFECT_KEYWORDS`; update the array `// why:` with the D-20201 clause.
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — add the `koHeroEachPlayerMag2` dispatch branch (player iteration sort + literal-2 inner loop + shared resolver delegation); no change to the other six branches; no change to the shared resolver itself.
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **modified** — drift-detection updated to seven-entry array ↔ union; append-only-invariant guard updated to pin indices 0-5 byte-identical.
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — add `koHeroEachPlayerMag2` tests per WP-202 §Scope (In) → Engine half → Unit tests + §Acceptance Criteria → Behavior / Determinism.

### Sub-task B — Data half (4 source files)

- `scripts/convert-cards/apply-effect-markers.mjs` — **modified** — append `'koHeroEachPlayerMag2'` to local `VILLAIN_EFFECT_KEYWORDS` (position 7); update its `// why:` (cite D-20202); add the `koHeroEachPlayerMag2` propose heuristic. No matching/append/loud-fail logic change. **`SUPPORTED_TIMINGS` UNCHANGED** (already includes `escape` per WP-188).
- `scripts/convert-cards/inputs/villain-effect-markers.json` — **modified** — add `escape: ["koHeroEachPlayerMag2"]` to villain entries `villains/core/enemies-of-asgard/destroyer` and `villains/msp1/enemies-of-asgard/destroyer`. Remove those two rows from `_unassigned`. Retain the other 4 `no-vocabulary-keyword` rows verbatim. Append exactly one new `_notes` paragraph with the content listed in WP-202 §Scope (In) → `_unassigned` post-curation hygiene.
- `data/cards/core.json` — **modified, bounded to one line** — Destroyer villain `"Escape: Each player KOs two of their Heroes."` line gains trailing ` [effect:koHeroEachPlayerMag2]`. +1/-1.
- `data/cards/msp1.json` — **modified, bounded to one line** — same shape on the msp1 Destroyer. +1/-1.

### Governance (4 files)

- `docs/ai/STATUS.md` — **modified** — `### WP-202 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-20201..D-20203.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-202 row `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-230 row Done.

## After Completing

### Sub-task A close

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline + **exactly 7 new tests** in `villainEffects.execute.test.ts` — matches WP-189 precedent; cases enumerated in WP-202 §Acceptance Criteria → Build / Idempotency).
- [ ] Grep: `koHeroEachPlayerMag2` present in `villainAbility.types.ts` (union + array) and `villainEffects.execute.ts` (one dispatch case).
- [ ] Grep: zero `@legendary-arena/registry` / `boardgame.io` matches in the modified engine files (pure-helper rule).
- [ ] **Shared-resolver structural grep.** `grep -cE "koOneHeroForPlayer\(" packages/game-engine/src/villain/villainEffects.execute.ts` returns exactly **4 matches** post-execution (1 function declaration line `function koOneHeroForPlayer(` + 1 call inside `koHeroCurrentPlayer` + 1 call inside `koHeroEachPlayer` + 1 NEW call inside `koHeroEachPlayerMag2`'s inner loop). Baseline pre-WP-202 returns 3 matches; the load-bearing invariant is **delta = +1**. ≠ 4 post-execution (or delta ≠ +1) = resolver duplicated, mis-named, or not wired into the new branch.
- [ ] **Negative grep — no duplicated zone search in the `koHeroEachPlayerMag2` branch.** `grep -nE "selectKoHeroTarget|moveCardFromZone" packages/game-engine/src/villain/villainEffects.execute.ts` returns matches ONLY inside the shared resolver, never inside the `koHeroEachPlayerMag2` case body (audit surrounding context to confirm). Matches inside the magnitude-2 case body = duplicated resolution = FAIL.
- [ ] **Magnitude-2 ≡ magnitude-1-twice parity test PASSES** — single-player `G` post-state deep-equal across `G.ko`, every player zone, `G.attachedBystanders`, `G.messages`.
- [ ] **Determinism test PASSES** — two dispatches against identical mock `G` produce identical KO target `ext_id`s, identical `G.ko` mutation order, identical `G.messages` sequence (deep equality).
- [ ] `koHeroEachPlayer` + `koHeroCurrentPlayer` regression tests pass unchanged.
- [ ] Drift-detection test passes on the seven-entry array; append-only-invariant guard pins indices 0-5 byte-identical.
- [ ] `git diff --stat data/ scripts/` is empty after Sub-task A (engine commit touches NO data or script files).

### Sub-task B close

- [ ] `node scripts/convert-cards/apply-effect-markers.mjs` runs clean; second run yields zero `data/cards/` diff (idempotency).
- [ ] `grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort -u` lists exactly the seven locked keywords.
- [ ] **Exactly 2 Escape magnitude-2 each-player hero KO lines carry `[effect:koHeroEachPlayerMag2]`** — one per set: `core`, `msp1`. Verified by `grep -rcE '"Escape: Each player KOs two of their Heroes\.\s*\[effect:koHeroEachPlayerMag2\]"' data/cards/` returning total = 2.
- [ ] **No `Ambush:` / `Fight:` / `Overrun:` line carries `[effect:koHeroEachPlayerMag2]`.** Verified by `grep -rcE '"(Ambush|Fight|Overrun):[^"]*\[effect:koHeroEachPlayerMag2\]"' data/cards/` returning total = 0.
- [ ] **`git diff --stat data/cards/` shows exactly two files modified** (`core.json`, `msp1.json`), each `+1/-1`. Any other `data/cards/*.json` showing a diff is a **HARD FAIL — STOP, investigate, do not commit.**
- [ ] **Global marker-count invariant.** `grep -r "\[effect:koHeroEachPlayerMag2\]" data/cards/ | wc -l` = 2.
- [ ] `grep -rc "\[effect:" data/cards/` = WP-187/188/190 baseline + 2 (the new `koHeroEachPlayerMag2` markers; WP-187/188/190 markers preserved byte-for-byte).
- [ ] No source-filtered / target-filtered / class-filtered / choice magnitude-2 each-player hero KO line marked; the 4 `no-vocabulary-keyword` rows for `hela-2099`, `juggernaut` Escape, `bullseye`, `ultimaton-weapon-xv` remain in `_unassigned` byte-identical (reason tag + text + set/group/card keys unchanged).
- [ ] Both newly-curated Destroyer rows removed from `_unassigned`; exactly one new `_notes` paragraph with the WP-202-specified content (4 blockers named verbatim) appended.
- [ ] `node scripts/convert-cards/apply-effect-markers.mjs --propose | grep koHeroEachPlayerMag2` returns rows.

### Cross-cutting close

- [ ] `pnpm -r build` exits 0.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-20201..D-20203; `WORK_INDEX.md` WP-202 `[x]`; `EC_INDEX.md` EC-230 Done.

## Pre-Commit Failure Smells (Must Review Before Commit)

- Adding a second keyword (`koHeroEachPlayerMag3` speculatively, a source-filtered variant, a parameterized variant) → magnitude-2-only scope violation.
- Duplicating the per-player KO resolution instead of sharing one helper → 00.6 §16.1 violation + D-18902 drift; the parity test will fail. **Surface tell:** the `selectKoHeroTarget` / `moveCardFromZone` negative grep returns matches inside the `koHeroEachPlayerMag2` case body. Resolver-call grep returns ≠ 4 post-execution (or delta from the pre-WP-202 baseline of 3 is ≠ +1).
- Caller post-processing the shared resolver's output (e.g., re-reading `G.ko` after each inner-iteration call to push a custom message, or aggregating targets before mutating) → D-18902 mutation-location violation. The magnitude-2 ≡ magnitude-1-twice parity test will fail on a single-player `G`.
- Parameterizing the magnitude (`for (let i = 0; i < N; i++)` where `N` comes from a `mag` field, an env constant, or a `MAGNITUDE_BY_KEYWORD` map) → D-20201 violation. The inner loop bound MUST be the literal numeral `2`.
- Iterating `Object.keys(G.playerZones)` without `.sort()` → D-18902 violation; replay-hash unstable if a future setup change reorders insertion.
- Sorting numerically (`Number(playerId)`) instead of lexically → D-18902 contract drift.
- Inserting `koHeroEachPlayerMag2` mid-array (shifting positions 0-5) → breaks WP-187/188/190's executed markers + the overlay script's hardcoded copy; must append at position 7 (index 6).
- `koHeroEachPlayerMag2` throwing when a player has fewer than 2 eligible heroes → move-contract violation; silent skip per iteration (a player with 1 eligible loses 1; a player with 0 loses 0).
- Forgetting to update the drift test from six to seven (and the append-only-invariant guard from indices 0-4 to indices 0-5) → test FAIL surfaces immediately.
- Changing `koHeroEachPlayer` or `koHeroCurrentPlayer` semantics while adding the magnitude-2 branch → regression; both must behave identically post-change.
- Marking an `Ambush:` / `Fight:` / `Overrun:` line with `[effect:koHeroEachPlayerMag2]` → empirical FAIL: zero curatable lines exist on those timings. Only the two Escape Destroyer lines are curatable.
- Marker count drifts from 2 → audit which sets the markers landed in; only `core.json` and `msp1.json` should be touched.
- Marking `core/juggernaut` Ambush ("Each player KOs two Heroes from their discard pile") or Escape ("from their hand") with `koHeroEachPlayerMag2` → source-filtered (the markers WP-202 introduces have NO source filter; the resolver's default discard→hand priority is not equivalent to "from hand only" or "from discard only"). Defer.
- Marking `2099/hela-2099` Escape ("Each player KOs two Henchmen from their Victory Pile or gains a Wound") → wrong target (Henchmen not Heroes) + choice clause + victory-pile source. Defer.
- Marking `cvwr/bullseye` ("Heroes that has printed [icon:attack] of 2 or more") or `wpnx/ultimaton-weapon-xv` ("non-grey Heroes") → stat/class filter; also magnitude-1 not magnitude-2. Defer.
- Converting a `koHeroCurrentPlayer` or `koHeroEachPlayer` line to `koHeroEachPlayerMag2` (or vice versa) → semantics FAIL; each-player ≠ current-player, magnitude-2 ≠ magnitude-1.
- Re-tagging WP-188's `_unassigned` rows away from `reason: "no-vocabulary-keyword"` → breaks the D-18802 cross-WP audit anchor; WP-202 promotes 2 rows (removes them) and leaves the OTHER 4 verbatim with a clarifying `_notes` paragraph.
- Second apply run shows a diff → idempotency broken.
- WP-187/188/190 markers disappear or duplicate → run must be additive-only.
- Adding `master-strike` to `SUPPORTED_TIMINGS` to catch Master Strike magnitude-2 lines → out-of-scope (WP-024 system).
- Editing `isTimingLine` / append logic / `SUPPORTED_TIMINGS` → unnecessary; only the local array + a propose heuristic change on the data side.
- Leaving now-curated Destroyer rows in `_unassigned` (stale) or removing still-deferred rows (lost documentation) → `_unassigned` must reflect post-curation reality (2 removed, 4 retained verbatim, 1 new `_notes` paragraph).
- **Conflating the two audit universes.** "2 of 6 promoted" applies ONLY to the D-18802 Escape ledger; "zero Ambush/Fight/Overrun yield" applies ONLY to the corpus-wide magnitude>1 scan. The Juggernaut Ambush row is NOT part of the 2-of-6 accounting — see WP-202 §Assumes → Audit-scope clarification.
