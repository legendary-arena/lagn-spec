# EC-215 — Villain Escape/Overrun Effect-Marker Enrichment (Execution Checklist)

**Source:** docs/ai/work-packets/WP-188-villain-escape-effect-marker-enrichment.md
**Layer:** Card-data tooling (`scripts/convert-cards/`, `data/cards/`) — no engine/registry/server code

## Before Starting
- [ ] **WP-187 landed** ✅ — `scripts/convert-cards/apply-effect-markers.mjs` + `inputs/villain-effect-markers.json` exist on `main` (EC-214 @ c08a297). Verify `grep -rc "\[effect:" data/cards/` returns the WP-187 baseline (76 markers across 31 sets).
- [ ] Read WP-187 + EC-214 — WP-188 is a direct continuation; same script, same map, same curation discipline
- [ ] Read `scripts/convert-cards/apply-effect-markers.mjs` end-to-end — note `SUPPORTED_TIMINGS` (line 75), `isTimingLine` (line 134, generic), `collectTimingEdits` (line 349, loud-fails on unsupported timing), `PROPOSE_HEURISTICS` (line 504)
- [ ] Run `node scripts/convert-cards/apply-effect-markers.mjs --propose | grep -E "escape|overrun"` is currently EMPTY (escape not yet scanned) — confirms the gate is closed pre-WP-188
- [ ] `pnpm -r build` exits 0 (baseline)

## Locked Values (do not re-derive)
- `SUPPORTED_TIMINGS = ['ambush', 'fight', 'escape', 'overrun']` — **four lowercase strings, this order**. The only behavioral line change in the script.
- Marker vocabulary UNCHANGED — five locked strings: `gainWoundEachPlayer | gainWoundCurrentPlayer | koHeroCurrentPlayer | heroDeckTopToEscape | captureBystander`. WP-188 adds NO keyword; the script's local `VILLAIN_EFFECT_KEYWORDS` array (line 63) is untouched.
- `escape` and `overrun` are **distinct map keys** (the script matches by line prefix). WP-186's engine parser collapses both prefixes to a single `onEscape` timing — that collapse is WP-186's concern, NOT the script's.
- Match predicate UNCHANGED: `line.trimStart().toLowerCase().startsWith(\`${timing}:\`)`. Do NOT alter `isTimingLine`.
- Marker token format UNCHANGED: `[effect:<keyword>]`, appended at END of line (original text → existing markup → effect tokens in `VILLAIN_EFFECT_KEYWORDS` order). Per-keyword idempotent.
- v1 curation discipline IDENTICAL to WP-187: mark only unconditional, magnitude-1, single-target lines reducing to exactly one MVP keyword. No `may` / `If …` / `… or …` / "(After the normal Escape KO)" compound.
- **Each-player-KO escape lines are NOT curatable in v1** — "Each player KOs one of their Heroes" ≠ `koHeroCurrentPlayer` (current-player ≠ each-player). These go to `_unassigned` with `reason: "no-vocabulary-keyword"`. Do NOT force them onto `koHeroCurrentPlayer`.
- Curatable escape subset is dominated by `gainWoundEachPlayer` (unconditional "Escape: Each player gains a Wound." lines) — this keyword has ZERO data under WP-187; WP-188 is its first source.
- Multi-`Escape:`-line cards (if any) loud-fail and go to `_unassigned` reason `multi-line` (same as WP-187's multi-`Fight:` cards).

## Guardrails
- Touch ONLY `apply-effect-markers.mjs` (the WP-187 sibling) and `villain-effect-markers.json` — no other converter, no engine/registry/server code
- Do NOT change `apply-card-counts.mjs` or `convert-cards-v15.mjs`
- Do NOT re-mark existing `ambush` / `fight` lines — idempotency guarantees a re-run leaves them untouched; the WP-187 76-marker baseline must be preserved
- Do NOT add a sixth keyword — the each-player-KO gap is deferred, not filled
- Do NOT alter `isTimingLine` or the append logic — widening `SUPPORTED_TIMINGS` is sufficient because the matching code is already generic
- Overlay stays loud-fail (unknown keyword / missing entity / zero-or-multiple timing match) and idempotent per-keyword
- `_unassigned` stays a structured array (`{ set, group, card?, timing, text, reason }`), diffable, not free prose
- No randomness, no clocks, no network — deterministic pure-IO transform

## Required `// why:` Comments
- `SUPPORTED_TIMINGS` declaration: update the existing `// why:` comment — it currently states Escape/Overrun is a "WP-186 follow-on"; rewrite to record that WP-188 IS that follow-on, all four timings are now curatable, and `escape`/`overrun` are distinct prefix-matched map keys that WP-186 collapses to `onEscape` in the engine
- Any new `_unassigned` rows with `reason: "no-vocabulary-keyword"`: the map's `_notes` (or a header comment) explains this names the each-player-KO cluster deferred to a future `koHeroEachPlayer` vocabulary expansion (cross-ref D-18802)

## Files to Produce
- `scripts/convert-cards/apply-effect-markers.mjs` — **modified** — widen `SUPPORTED_TIMINGS` to four entries; update its `// why:`; widen the module-header docstring + JSDoc on `isTimingLine` / `findSingleTimingLineIndex` / `collectTimingEdits` to name all four timings (prose only — no logic change)
- `scripts/convert-cards/inputs/villain-effect-markers.json` — **modified** — add curated `escape?` / `overrun?` entries for the unambiguous subset (dominated by `gainWoundEachPlayer`); extend `_unassigned` with the each-player-KO cluster + conditional/compound escape lines
- `data/cards/*.json` — **modified** — set files with curated escape/overrun lines gain `[effect:]` markers; diff bounded to curated lines
- `docs/ai/STATUS.md` — **modified** — `### WP-188 Executed` block
- `docs/ai/DECISIONS.md` — **modified** — D-18801..D-18803
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-188 row `[x]`; WP-186 row Hard-deps += WP-188
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-215 row Done

## After Completing
- [ ] `node scripts/convert-cards/apply-effect-markers.mjs` runs clean; a second run yields zero `data/cards/` diff (idempotency)
- [ ] `grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort -u` lists only the five locked keywords
- [ ] At least one `Escape: Each player gains a Wound.` line carries `[effect:gainWoundEachPlayer]`
- [ ] `grep -rc "\[effect:" data/cards/` ≥ 76 (WP-187 markers preserved, escape markers added on top)
- [ ] `node scripts/convert-cards/apply-effect-markers.mjs --propose | grep -E "escape|overrun"` now returns rows
- [ ] No each-player-KO line marked `koHeroCurrentPlayer`; cluster in `_unassigned` reason `no-vocabulary-keyword`
- [ ] `pnpm -r build` exits 0
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-18801..D-18803; `WORK_INDEX.md` WP-188 `[x]` + WP-186 Hard-deps; `EC_INDEX.md` EC-215 Done

## Common Failure Smells
- Forcing "Each player KOs one of their Heroes" onto `koHeroCurrentPlayer` → semantics FAIL (current-player ≠ each-player); it belongs in `_unassigned`
- Adding a sixth keyword (`koHeroEachPlayer`) to satisfy the escape cluster → vocabulary-lock violation; that is a separate WP-185-side WP
- Editing `isTimingLine` or the append logic → unnecessary; the matching code is already generic, only the gate needs widening
- Re-running reformats unrelated set sections → the anchored surgical replacement must touch only the matched line; a full `JSON.stringify` rewrite is the WP-187 anti-pattern already avoided
- Second apply run shows a diff → idempotency broken (per-keyword presence guard must hold for the new timings too)
- WP-187's ambush/fight markers disappear or duplicate → the run must be additive-only over the existing 76 markers
- Marking a conditional escape line (`[keyword:Cyber-Mod]`, `[keyword:Fortify]`, "When a Master Strike…", "(After the normal Escape KO)") → curation-discipline FAIL; leave unmarked in `_unassigned`
- Leaving the `SUPPORTED_TIMINGS` `// why:` comment claiming Escape is "a WP-186 follow-on" after WP-188 lands → stale-comment FAIL; WP-188 IS the follow-on
