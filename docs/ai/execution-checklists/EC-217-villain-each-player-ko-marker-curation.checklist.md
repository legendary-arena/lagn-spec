# EC-217 — Villain Each-Player-KO Effect-Marker Curation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-190-villain-each-player-ko-marker-curation.md
**Layer:** Card-data tooling (`scripts/convert-cards/`, `data/cards/`) — no engine/registry/server code

## Before Starting
- [ ] **WP-189 landed** ✅ — landed 2026-05-31 at `bf61d82` (PR #165). `koHeroEachPlayer` exists in the engine vocabulary. Verify `grep -n "koHeroEachPlayer" packages/game-engine/src/rules/villainAbility.types.ts` shows it in BOTH the union and `VILLAIN_EFFECT_KEYWORDS`. If absent on the execution baseline, **STOP and report `BLOCKED: WP-189 not present on baseline`** (the overlay's local copy would drift; the marker would reference a non-existent keyword).
- [ ] **WP-187 landed** ✅ — `apply-effect-markers.mjs` + `villain-effect-markers.json` exist (EC-214 @ c08a297)
- [ ] **WP-188 landed** ✅ — `SUPPORTED_TIMINGS` includes `escape`/`overrun` so escape each-player-KO lines can be matched (EC-215)
- [ ] Read WP-187 + WP-188 — same script, same map, same curation discipline; WP-190 adds one keyword + its lines
- [ ] Read `scripts/convert-cards/apply-effect-markers.mjs` — `VILLAIN_EFFECT_KEYWORDS` (line 66 on `main @ bf61d82`, local copy to extend), `PROPOSE_HEURISTICS` (line 517, add each-player-KO heuristic), `validateAndOrderKeywords` (line 212, validates against the local copy). The earlier draft cited lines 63 and 504; WP-188's inline JSDoc widening shifted those references by 3 and 13 lines. Re-verify at execution time if `main` has moved further: `grep -n "VILLAIN_EFFECT_KEYWORDS\|PROPOSE_HEURISTICS" scripts/convert-cards/apply-effect-markers.mjs`.
- [ ] `pnpm -r build` exits 0 (baseline)

## Locked Values (do not re-derive)
- Overlay local `VILLAIN_EFFECT_KEYWORDS` goes **5 → 6**: append `'koHeroEachPlayer'` at **position 6**, byte-matching WP-189's engine array `['gainWoundEachPlayer','gainWoundCurrentPlayer','koHeroCurrentPlayer','heroDeckTopToEscape','captureBystander','koHeroEachPlayer']`.
- Marker token `[effect:koHeroEachPlayer]`, appended trailing, per-keyword idempotent — unchanged append mechanics from WP-187.
- Curation discipline: mark ONLY "each player KOs **one / a** Hero" — unconditional, magnitude 1, unfiltered. Magnitude>1 / filtered (cost, non-grey, `[team]`) / conditional / `… or …` choice variants stay `_unassigned`.
- **Each-player ≠ current-player.** "each player KOs …" → `koHeroEachPlayer`; "KO one of **your** Heroes" → `koHeroCurrentPlayer` (WP-187, do NOT re-mark).
- **Empirical curatable yield (verified 2026-05-31): 4 markers across 4 cards across 4 sets, ALL on the `Fight:` timing.** Exactly one card each in `amwp.json`, `core.json`, `msis.json`, `wtif.json` carries the curatable shape `"Fight: Each player KOs one of their Heroes."`. Ambush yield is **0** (the only Ambush each-player-KO line is magnitude>1). Escape yield is **0** (all 6 Escape each-player-KO lines are magnitude>1 / filtered / compound — exhaustively recorded in WP-188's `_unassigned`). Master Strike each-player-KO is the WP-024 mastermind-strike system — out of scope (`SUPPORTED_TIMINGS` does not include master-strike; do not add it). The earlier draft estimate (`~11 lines across A/F/E`) was speculative; this empirical count supersedes it.
- Promote the four curatable Fight rows OUT of WP-187's `_unassigned` if recorded there; the deferred each-player-KO rows (1 Ambush magnitude>1, 6 Escape, 2 Fight filtered/choice, plus any compound) STAY in `_unassigned`. **WP-188's six Escape rows under `reason: "no-vocabulary-keyword"` are retained verbatim** — WP-190 adds a `_notes` clarifying paragraph but does NOT re-tag (preserves the cross-WP audit anchor; see WP-190 §`_unassigned` post-curation hygiene).

## Guardrails
- Touch ONLY `apply-effect-markers.mjs` + `villain-effect-markers.json` — no other converter, no engine/registry/server code
- Local six-keyword array is a hand-kept copy (no import from `packages/` into a `.mjs`); it loud-fails on drift — do NOT auto-sync
- Do NOT add any keyword other than `koHeroEachPlayer` (no discard, filtered, magnitude)
- Do NOT re-mark or convert existing `koHeroCurrentPlayer` / `gainWound*` / `captureBystander` / `heroDeckTopToEscape` lines — additive-only over WP-187/188's markers
- Do NOT alter `isTimingLine`, the append logic, or the loud-fail behavior — only the local array + a propose heuristic change
- Overlay stays idempotent (second run = zero diff) and loud-fail (unknown keyword / missing entity / zero-or-multiple match)
- `_unassigned` stays a structured array; promoted rows removed, deferred rows retained with reason
- No randomness, no clocks, no network — deterministic pure-IO transform

## Required `// why:` Comments
- `VILLAIN_EFFECT_KEYWORDS` local array (script): update the existing `// why:` (it states the array MUST equal WP-185's vocabulary) to record WP-189's sixth keyword `koHeroEachPlayer` and that the array stays hand-synced to the engine
- New `koHeroEachPlayer` `PROPOSE_HEURISTICS` entry: why an each-player-specific pattern is needed (the existing `koHeroCurrentPlayer` heuristic `/\bKO\b[^.]*\bhero/i` over-captures "each player KOs …"; the each-player heuristic disambiguates for review; the committed map is human-reviewed and authoritative)

## Files to Produce
- `scripts/convert-cards/apply-effect-markers.mjs` — **modified** — append `'koHeroEachPlayer'` to local `VILLAIN_EFFECT_KEYWORDS` (position 6); update its `// why:`; add the `koHeroEachPlayer` propose heuristic. No matching/append/loud-fail logic change.
- `scripts/convert-cards/inputs/villain-effect-markers.json` — **modified** — add `koHeroEachPlayer` to the ~11 curatable ambush/fight/escape entries; remove the now-curated rows from `_unassigned`; retain the deferred magnitude>1/filtered/choice rows
- `data/cards/*.json` — **modified** — curated lines gain `[effect:koHeroEachPlayer]`; diff bounded to curated lines
- `docs/ai/STATUS.md` — **modified** — `### WP-190 Executed` block
- `docs/ai/DECISIONS.md` — **modified** — D-19001..D-19002
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-190 row `[x]`
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-217 row Done

## After Completing
- [ ] `node scripts/convert-cards/apply-effect-markers.mjs` runs clean; second run yields zero `data/cards/` diff (idempotency)
- [ ] `grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort -u` lists exactly the six locked keywords
- [ ] **Exactly 4 `Fight:` each-player-KO lines carry `[effect:koHeroEachPlayer]`** — one per set: `amwp`, `core`, `msis`, `wtif`. Verified by `grep -rcE '"Fight: Each player KOs one of their Heroes\.\s*\[effect:koHeroEachPlayer\]"' data/cards/` returning total = 4
- [ ] **No `Ambush:` or `Escape:` line carries `[effect:koHeroEachPlayer]`.** Verified by `grep -rcE '"(Ambush|Escape):[^"]*\[effect:koHeroEachPlayer\]"' data/cards/` returning total = 0 (Ambush + Escape have zero curatable lines under the v1 discipline)
- [ ] **`git diff --stat data/cards/` shows exactly four files modified** (`amwp.json`, `core.json`, `msis.json`, `wtif.json`), each with `+1/-1`. Any other set with a diff is a FAIL — investigate, do not commit
- [ ] `grep -rc "\[effect:" data/cards/` = WP-187/188 baseline + 4 (the new koHeroEachPlayer markers; WP-187/188 markers preserved byte-for-byte)
- [ ] No magnitude>1 / filtered / conditional / choice / compound each-player-KO line marked; those remain in `_unassigned`
- [ ] No `koHeroCurrentPlayer` line re-marked or converted
- [ ] **WP-188's `_unassigned` Escape rows under `reason: "no-vocabulary-keyword"` are retained verbatim** (no re-tagging); the new `_notes` clarifying paragraph is added at the top-level `_notes` array per WP-190's §`_unassigned` post-curation hygiene convention
- [ ] `node scripts/convert-cards/apply-effect-markers.mjs --propose | grep koHeroEachPlayer` returns rows
- [ ] `pnpm -r build` exits 0
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-19001..D-19002; `WORK_INDEX.md` WP-190 `[x]`; `EC_INDEX.md` EC-217 Done

## Common Failure Smells
- Adding `discardCardEachPlayer` or any keyword besides `koHeroEachPlayer` → KO-only scope violation
- Local array out of sync with WP-189's engine array (wrong order / wrong position) → drift; the loud-fail won't catch ordering, so verify position 6 by eye against `packages/game-engine/src/rules/villainAbility.types.ts`
- Marking "each player KOs **two**" / "a Hero that costs ≥ X" / "a non-grey Hero" / "… or gains a Wound" / a compound clause → curation-discipline violation; defer to `_unassigned`
- **Marking an Ambush or Escape each-player-KO line** → empirical FAIL: zero curatable lines exist on either timing under the v1 discipline. Any Ambush or Escape line carrying `[effect:koHeroEachPlayer]` is a curation error (e.g., misreading magnitude or filter); investigate, do not commit. Only the four Fight-side `"Fight: Each player KOs one of their Heroes."` lines are curatable
- **Marker count drifts from 4** (more or fewer Fight markers landed than the four expected sets) → audit which sets the markers landed in; only `amwp`, `core`, `msis`, `wtif` should be touched
- Converting a `koHeroCurrentPlayer` ("KO one of your Heroes") line to `koHeroEachPlayer` → semantics FAIL; each-player ≠ current-player
- **Re-tagging WP-188's `_unassigned` Escape rows** away from `reason: "no-vocabulary-keyword"` → breaks the cross-WP audit anchor WP-188 established (D-18802 references that reason); WP-190's convention is to retain them verbatim and add a clarifying `_notes` paragraph (see WP-190 §`_unassigned` post-curation hygiene)
- Second apply run shows a diff → idempotency broken
- WP-187/188 markers disappear or duplicate → run must be additive-only
- Adding `master-strike` to `SUPPORTED_TIMINGS` to catch Master Strike each-player-KO lines → out-of-scope FAIL (that's the WP-024 system)
- Editing `isTimingLine` / append logic → unnecessary; only the local array + a propose heuristic change
- Leaving now-curated Fight rows in `_unassigned` (stale) or removing still-deferred rows (lost documentation) → `_unassigned` must reflect post-curation reality
- Trusting WP-190's older "~11 lines" or "9 escape lines" estimates → those were drafted speculatively before WP-188's exhaustive Escape audit; the empirical count is 4 Fight + 0 Ambush + 0 Escape per the §Locked Values block
