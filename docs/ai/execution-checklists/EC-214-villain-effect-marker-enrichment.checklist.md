# EC-214 — Villain & Henchman Effect-Marker Enrichment (Execution Checklist)

**Source:** docs/ai/work-packets/WP-187-villain-effect-marker-enrichment.md
**Layer:** Card-data tooling (`scripts/convert-cards/`, `data/cards/`) — no engine/registry/server code

## Before Starting
- [ ] Read WP-185 §Non-Negotiable Constraints — the five-keyword vocabulary + `[effect:]` token are locked there; this WP must emit exactly that
- [ ] Read `scripts/convert-cards/apply-card-counts.mjs` (overlay precedent: curated input → set files, loud-fail, idempotent, clean formatting)
- [ ] Read `scripts/convert-cards/inputs/villain-card-counts.json` (input-map shape precedent)
- [ ] Confirm `grep -rn "\[effect:" data/cards/` returns nothing (clean starting point)
- [ ] `pnpm -r build` exits 0 (baseline)

## Locked Values (do not re-derive)
- Marker token = `[effect:<VillainEffectKeyword>]`; value ∈ exactly five strings: `gainWoundEachPlayer | gainWoundCurrentPlayer | koHeroCurrentPlayer | heroDeckTopToEscape | captureBystander`
- Match predicate (= WP-185's detection): `line.trimStart()` begins with `<Timing>:` (case-insensitive); ephemeral, never alters the stored string except by the append
- Append order: original text → existing markup (order preserved) → `[effect:]` token(s) in `VILLAIN_EFFECT_KEYWORDS` order, at end of line. Append-only: no insert/reflow/punctuation-edit/reorder/rewrite
- Input map: `villains:{setAbbr:{groupSlug:{cardSlug:{ambush?,fight?}}}}` + `henchmen:{setAbbr:{groupSlug:{ambush?,fight?}}}` (henchman group-level); `_unassigned` is a structured array `{set,group,card?,timing,text,reason}`
- v1 curation marks ONLY unconditional + magnitude-1 + single-target lines (WP-185 semantics). Multi-line same-timing cards (2 known `Fight:`) cannot be disambiguated → loud-fail → `_unassigned` reason `multi-line`
- v1 timings = `Ambush:` + `Fight:` only; script handles `Escape:`/`Overrun:` generically but those are uncurated (WP-186 follow-on)
- Iterate sets → groups → cards lexicographically; output formatting = `JSON.stringify(..., null, 2)` (match apply-card-counts.mjs for clean diffs)

## Guardrails
- Overlay MUST be idempotent per-keyword (each `[effect:X]` at most once per line) — second run produces a zero-line `git diff data/cards/`
- Overlay MUST loud-fail (non-zero exit, descriptive message) on: unknown keyword; missing set/group/card; zero or >1 matching ability line for a timing key
- Overlay MUST validate every emitted keyword against a LOCAL hardcoded copy of the five strings (no import/auto-sync from engine TS) — never emit an unvalidated value
- `--propose` mode is read-only — writes nothing; prints one row per candidate `set | group | card | timing | text | proposedKeywords`, sorted lexicographically
- Conservatism over coverage: ambiguous candidate → leave unmarked, record in the map `_unassigned` block
- Add NO engine/registry/server code; modify NO existing converter script (`convert-cards-v15.mjs`, `apply-card-counts.mjs`)
- No randomness/clocks/network — deterministic pure-IO transform over local files

## Required `// why:` Comments
- Local five-keyword array in `apply-effect-markers.mjs`: why it MUST equal WP-185's `VILLAIN_EFFECT_KEYWORDS` (vocabulary lock; drift guard)
- Append-not-insert placement: why markers trail the line (keep human-readable text intact; mirror `[rule:Adapt]` trailing-marker convention)
- Loud-fail branches: why fail-loud over silent-skip (a silently-dropped marker = an effect the engine can never fire)
- `--propose` phrase-scan: why it is non-authoritative (offline build-time heuristic over-captures; the committed map is human-reviewed)

## Files to Produce
- `scripts/convert-cards/inputs/villain-effect-markers.json` — **new** — curated map (`villains` + `henchmen` + `_unassigned`)
- `scripts/convert-cards/apply-effect-markers.mjs` — **new** — apply (default) + `--propose` (dry-run); idempotent; loud-fail
- `data/cards/*.json` — **modified** — set files with injected `[effect:]` markers (diff bounded to curated lines)
- `docs/ai/STATUS.md` — `### WP-187 Executed` block
- `docs/ai/DECISIONS.md` — D-18701..D-18703
- `docs/ai/work-packets/WORK_INDEX.md` — WP-187 → `[x]`; WP-185 Hard-deps += WP-187
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-214 → Done

## After Completing
- [ ] `node scripts/convert-cards/apply-effect-markers.mjs` then re-run → second run has zero `data/cards/` diff (idempotency)
- [ ] `grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort -u` lists ONLY the five locked keywords
- [ ] Every marked line still starts with its `Ambush:` / `Fight:` prefix and keeps its readable text
- [ ] Loud-fail verified on a scratch input with a bogus keyword and a missing card
- [ ] `--propose` leaves the tree clean
- [ ] `pnpm -r build` exits 0
- [ ] STATUS / DECISIONS / WORK_INDEX (both rows) / EC_INDEX updated

## Common Failure Smells
- Injecting markers via blind phrase-match instead of the reviewed map → mis-marks "KO two" / "Each villain captures" / "or gains a Wound" (over-capture BUG)
- Marking a magnitude>1, conditional, or multi-target line → v1 scope violation; leave unmarked
- Marker substitutes or rewrites the readable text instead of appending → contract violation
- Overlay not idempotent (re-run dirties the diff) → missing already-present guard
- Silent skip on a missing card/keyword instead of loud-fail → an effect the engine can never fire
- Emitting a keyword outside the five (typo, plural) → validate against the local locked array
- Modifying `apply-card-counts.mjs` / `convert-cards-v15.mjs` → out of scope; add a sibling script
- Inserting a marker mid-text or before existing `[rule:]`/`[keyword:]` markup → breaks canonical append order + idempotency; effects append at end-of-line only
- Curating one of the two multi-`Fight:` cards instead of deferring it → ambiguous placement; loud-fail and record as `multi-line` in `_unassigned`
- Match predicate diverging from WP-185 (e.g. case-sensitive) → marker can land on a line the engine reads differently; keep predicates identical
- Curating `Escape:`/`Overrun:` lines → WP-186 follow-on, not this WP
