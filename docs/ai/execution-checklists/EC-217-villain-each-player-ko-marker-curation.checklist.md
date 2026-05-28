# EC-217 — Villain Each-Player-KO Effect-Marker Curation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-190-villain-each-player-ko-marker-curation.md
**Layer:** Card-data tooling (`scripts/convert-cards/`, `data/cards/`) — no engine/registry/server code

## Before Starting
- [ ] **WP-189 landed** ⛔ HARD BLOCKER — `koHeroEachPlayer` exists in the engine vocabulary. Verify `grep -n "koHeroEachPlayer" packages/game-engine/src/rules/villainAbility.types.ts` shows it in BOTH the union and `VILLAIN_EFFECT_KEYWORDS`. If not, **STOP and report `BLOCKED: WP-189`** (the overlay's local copy would drift; the marker would reference a non-existent keyword).
- [ ] **WP-187 landed** ✅ — `apply-effect-markers.mjs` + `villain-effect-markers.json` exist (EC-214 @ c08a297)
- [ ] **WP-188 landed** ✅ — `SUPPORTED_TIMINGS` includes `escape`/`overrun` so escape each-player-KO lines can be matched (EC-215)
- [ ] Read WP-187 + WP-188 — same script, same map, same curation discipline; WP-190 adds one keyword + its lines
- [ ] Read `scripts/convert-cards/apply-effect-markers.mjs` — `VILLAIN_EFFECT_KEYWORDS` (line 63, local copy to extend), `PROPOSE_HEURISTICS` (line 504, add each-player-KO heuristic), `validateAndOrderKeywords` (validates against the local copy)
- [ ] `pnpm -r build` exits 0 (baseline)

## Locked Values (do not re-derive)
- Overlay local `VILLAIN_EFFECT_KEYWORDS` goes **5 → 6**: append `'koHeroEachPlayer'` at **position 6**, byte-matching WP-189's engine array `['gainWoundEachPlayer','gainWoundCurrentPlayer','koHeroCurrentPlayer','heroDeckTopToEscape','captureBystander','koHeroEachPlayer']`.
- Marker token `[effect:koHeroEachPlayer]`, appended trailing, per-keyword idempotent — unchanged append mechanics from WP-187.
- Curation discipline: mark ONLY "each player KOs **one / a** Hero" — unconditional, magnitude 1, unfiltered. Magnitude>1 / filtered (cost, non-grey, `[team]`) / conditional / `… or …` choice variants stay `_unassigned`.
- **Each-player ≠ current-player.** "each player KOs …" → `koHeroEachPlayer`; "KO one of **your** Heroes" → `koHeroCurrentPlayer` (WP-187, do NOT re-mark).
- ~11 curatable lines across `Ambush:` / `Fight:` / `Escape:` (villain per-card + henchman group-level). Master Strike each-player-KO is the WP-024 mastermind-strike system — out of scope (`SUPPORTED_TIMINGS` does not include master-strike; do not add it).
- Promote the now-curated rows OUT of WP-187/188 `_unassigned`; keep the deferred magnitude>1/filtered/choice rows IN `_unassigned`.

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
- [ ] At least one `Escape:` and one `Ambush:`/`Fight:` each-player-KO line carry `[effect:koHeroEachPlayer]`
- [ ] `grep -rc "\[effect:" data/cards/` ≥ WP-187/188 baseline + the new koHeroEachPlayer count (WP-187/188 markers preserved)
- [ ] No magnitude>1/filtered/conditional each-player-KO line marked; those remain in `_unassigned`
- [ ] No `koHeroCurrentPlayer` line re-marked or converted
- [ ] `node scripts/convert-cards/apply-effect-markers.mjs --propose | grep koHeroEachPlayer` returns rows
- [ ] `pnpm -r build` exits 0
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-19001..D-19002; `WORK_INDEX.md` WP-190 `[x]`; `EC_INDEX.md` EC-217 Done

## Common Failure Smells
- Adding `discardCardEachPlayer` or any keyword besides `koHeroEachPlayer` → KO-only scope violation
- Local array out of sync with WP-189's engine array (wrong order / wrong position) → drift; the loud-fail won't catch ordering, so verify position 6 by eye
- Marking "each player KOs **two**" / "a Hero that costs ≥ X" / "a non-grey Hero" / "… or gains a Wound" → curation-discipline violation; defer to `_unassigned`
- Converting a `koHeroCurrentPlayer` ("KO one of your Heroes") line to `koHeroEachPlayer` → semantics FAIL; each-player ≠ current-player
- Second apply run shows a diff → idempotency broken
- WP-187/188 markers disappear or duplicate → run must be additive-only
- Adding `master-strike` to `SUPPORTED_TIMINGS` to catch Master Strike each-player-KO lines → out-of-scope FAIL (that's the WP-024 system)
- Editing `isTimingLine` / append logic → unnecessary; only the local array + a propose heuristic change
- Leaving now-curated lines in `_unassigned` (stale) or removing still-deferred rows (lost documentation) → `_unassigned` must reflect post-curation reality
