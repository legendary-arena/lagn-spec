# WP-190 — Villain Each-Player-KO Effect-Marker Curation (Card Data)

## Goal

Curate the unconditional, magnitude-1 "Each player KOs one of their Heroes"
ability lines across `Ambush:` / `Fight:` / `Escape:` villain and henchman
cards with the `[effect:koHeroEachPlayer]` marker, and teach the overlay
script the sixth keyword. This is the **data** half of the
`koHeroEachPlayer` expansion — WP-189 adds the engine keyword + executor;
WP-190 authors the markers WP-189 reads. Before this WP these ~11 lines sit
in WP-187's and WP-188's `_unassigned` blocks (`reason:
"no-vocabulary-keyword"`, D-18802) because no keyword could express them.
After WP-190 they carry `[effect:koHeroEachPlayer]` and WP-186's escape
pipeline (plus WP-185's Ambush/Fight pipeline) executes them on real cards.

> **KO-only, unconditional, magnitude-1 — same discipline as WP-187/188.**
> This WP marks ONLY "each player KOs one Hero"-shaped lines. It does NOT
> mark: "each player KOs **two** Heroes" (magnitude>1), "each player KOs a
> Hero **that costs ≥ X / non-grey / [team]**" (filtered), "… **or** gains a
> Wound" (choice), or any discard each-player line. Those stay in
> `_unassigned`. No new keyword beyond `koHeroEachPlayer`.

---

## Assumes

- **WP-189 ✅ (hard-dep — the engine keyword).** `koHeroEachPlayer` must
  exist in `VillainEffectKeyword` / `VILLAIN_EFFECT_KEYWORDS` before the
  overlay's local copy can include it and before any marker referencing it
  is valid. **If WP-189 has not landed, stop and report `BLOCKED: WP-189`.**
- **WP-187 ✅ (hard-dep — the overlay it extends).** Landed 2026-05-28
  (EC-214 @ c08a297). `apply-effect-markers.mjs` + `villain-effect-markers.json`
  exist; the script's `collectTimingEdits` reads timing entries generically
  and validates keywords against its local `VILLAIN_EFFECT_KEYWORDS` copy
  (which WP-190 extends 5 → 6).
- **WP-188 ✅ (hard-dep — escape timing support).** WP-188 widened
  `SUPPORTED_TIMINGS` to include `escape` / `overrun`, so the escape
  each-player-KO lines can be matched. Without it the escape subset would
  loud-fail the unsupported-timing guard. (The Ambush/Fight each-player-KO
  lines need only WP-187.)
- **WP-185 vocabulary lock (spec dependency).** The six-keyword vocabulary
  is the source of truth; the overlay's local array is a hand-kept copy
  that loud-fails on drift.
- **Card-generation pipeline shape (verified 2026-05-28).** The overlay's
  anchored surgical text replacement keeps `data/cards/*.json` diffs bounded
  to the curated lines.
- **Data finding (verified 2026-05-28).** ~11 unconditional magnitude-1
  "each player KOs one/a Hero" lines exist across Ambush / Fight / Escape
  (31 each-player-KO lines total; the other ~20 are magnitude>1 / conditional
  / filtered and stay deferred). `grep -rn "koHeroEachPlayer" data/cards/`
  returns zero today.
- **Drafting baseline:** `origin/main @ cc29447` (2026-05-28).

---

## Context (Read First)

- **WP-189** — the engine keyword + executor this WP feeds. Its
  `koHeroEachPlayer` semantics (each player KOs exactly one hero,
  unconditional, deterministic) define what counts as a curatable line.
- **WP-187** — the parent overlay WP; same script, same map, same curation
  discipline. WP-190 is a continuation that adds one keyword + its lines.
- **WP-188** — the escape sibling; widened `SUPPORTED_TIMINGS`. WP-190's
  escape each-player-KO entries ride on that.
- `scripts/convert-cards/apply-effect-markers.mjs` — the file extended.
  Key sites: `VILLAIN_EFFECT_KEYWORDS` (line 63, local copy → append the
  6th); `validateAndOrderKeywords` (validates against that copy);
  `PROPOSE_HEURISTICS` (line 504 — add an each-player-KO heuristic);
  `isTimingLine` / `collectTimingEdits` (already generic).
- `scripts/convert-cards/inputs/villain-effect-markers.json` — the map;
  add `koHeroEachPlayer` entries and promote the each-player-KO rows out of
  `_unassigned`.
- `docs/ai/work-packets/WP-186-villain-escape-and-overrun-effects.md` /
  `WP-185-...` — the downstream engine consumers whose pipelines fire on
  these markers.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — `abilities: string[]`
  shape and canonical field names.
- `.claude/rules/architecture.md §Layer Boundary` — data-preparation
  tooling upstream of the Registry layer; no engine/registry-runtime/server
  code.

---

## Context

WP-189 adds the `koHeroEachPlayer` engine keyword + executor branch, but on
its own it reads nothing — the card data carries no `[effect:koHeroEachPlayer]`
markers. WP-190 authors them, completing the engine/data pair (mirroring
WP-185↔WP-187 and WP-186↔WP-188).

The each-player-KO pattern is the single largest execution-coverage gap the
escape work surfaced. WP-188 measured 9 escape lines of the form "Each player
KOs one of their (non-grey) Heroes" and deferred them all; matching Ambush /
Fight lines bring the unconditional magnitude-1 total to ~11. WP-190 promotes
exactly those — the unconditional, magnitude-1, unfiltered ones — from
`_unassigned` to curated, and leaves the magnitude>1 / filtered / choice
variants deferred (they need machinery the MVP does not have).

The overlay mechanism is already curation-ready: `collectTimingEdits` reads
any timing entry and validates each keyword against the local
`VILLAIN_EFFECT_KEYWORDS` copy. WP-190's two mechanical changes are (1) append
`koHeroEachPlayer` to that local copy (keeping it in sync with WP-189's
engine array) and (2) add a `--propose` heuristic so the each-player-KO
pattern is surfaced distinctly from the current-player `koHeroCurrentPlayer`
heuristic (which over-captures each-player lines). The committed map remains
human-reviewed; `--propose` only bootstraps.

---

## Scope (In)

- **Extend the overlay's local keyword copy** — `apply-effect-markers.mjs`:
  append `'koHeroEachPlayer'` to the local `VILLAIN_EFFECT_KEYWORDS` array
  (5 → 6), at position 6 to match WP-189's engine array exactly. Update the
  `// why:` comment that states the array MUST equal WP-185's vocabulary to
  note WP-189's sixth keyword.
- **Add a `--propose` heuristic** — append a `koHeroEachPlayer` heuristic to
  `PROPOSE_HEURISTICS` keyed on the each-player-KO phrase (e.g.
  `/each\s+player[^.]*\bKO[^.]*\bhero/i`) so the dry-run distinguishes
  each-player-KO candidates from the current-player `koHeroCurrentPlayer`
  heuristic (which also matches "KO … hero"). Human review remains
  authoritative; a line that says "each player" is curated as
  `koHeroEachPlayer`, not `koHeroCurrentPlayer`.
- **Curate the unconditional magnitude-1 each-player-KO lines** — extend
  `villain-effect-markers.json`: add `koHeroEachPlayer` to the relevant
  `ambush` / `fight` / `escape` timing entries for the ~11 curatable lines
  (villain per-card and henchman group-level). Promote these rows out of
  WP-187's / WP-188's `_unassigned` (the `_unassigned` entries for the now-
  curated lines are removed; the still-deferred magnitude>1 / filtered /
  choice each-player-KO lines remain documented in `_unassigned`).
- **Re-run the overlay** — `data/cards/*.json` lines gain
  `[effect:koHeroEachPlayer]`; diff bounded to curated lines; idempotent
  (second run = zero diff). WP-187/188 markers are untouched.
- **v1 curation discipline (locked — identical to WP-187/188):** mark a line
  ONLY when it is "each player KOs **one / a** Hero" — unconditional (no
  `may`, no `If …`, no `… or …`), magnitude 1 ("KO **two**" defers),
  unfiltered (no cost/class/team predicate). When in doubt, leave unmarked.
- **Governance** — `STATUS.md` entry, `DECISIONS.md` D-19001..D-19002,
  `WORK_INDEX.md` flip to `[x]`, `EC_INDEX.md` EC-217 → Done.

## Out of Scope

- **Engine keyword / executor** — WP-189. WP-190 adds no engine code.
- **Any keyword other than `koHeroEachPlayer`** — no discard, no filtered,
  no magnitude variant. The local array goes to exactly 6.
- **Magnitude>1 each-player KO** ("KO two of their Heroes") — stays
  `_unassigned`.
- **Filtered / conditional each-player KO** (cost-gated, non-grey,
  `[team]`-scoped, "or gains a Wound") — stays `_unassigned`; needs predicate
  machinery the MVP defers.
- **Each-player discard** — out of scope entirely (separate future WP if
  ever; mostly conditional).
- **Master Strike each-player-KO lines** — those run through the
  mastermind-strike system (WP-024), not the villain-ability hooks;
  `SUPPORTED_TIMINGS` does not include master-strike and this WP does not
  add it.
- **Re-marking or altering WP-187/188 lines** — idempotency guarantees the
  existing ambush/fight/escape `gainWound` + ko + bystander markers are
  untouched.
- **Modifying `apply-card-counts.mjs`, `convert-cards-v15.mjs`, or any other
  converter** — WP-190 touches only `apply-effect-markers.mjs` + its map.
- **Engine, registry-runtime, server, schema, or registry-viewer changes** —
  none.

---

## Files Expected to Change

1. `scripts/convert-cards/apply-effect-markers.mjs` — **modified** — append
   `'koHeroEachPlayer'` to the local `VILLAIN_EFFECT_KEYWORDS` array
   (position 6); update its `// why:`; add the `koHeroEachPlayer`
   `--propose` heuristic. No change to the matching / append / loud-fail
   logic.
2. `scripts/convert-cards/inputs/villain-effect-markers.json` — **modified**
   — add `koHeroEachPlayer` to the ~11 curatable timing entries; remove the
   now-curated rows from `_unassigned`; keep the deferred magnitude>1 /
   filtered / choice each-player-KO rows documented in `_unassigned`.
3. `data/cards/*.json` — **modified** — set files containing the curated
   lines gain `[effect:koHeroEachPlayer]`; diff bounded to curated lines.
4. `docs/ai/STATUS.md` — **modified** — `### WP-190 Executed` block.
5. `docs/ai/DECISIONS.md` — **modified** — D-19001..D-19002.
6. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-190 row to
   `[x]`.
7. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-217 row
   to Done.

No engine/registry/server/test-package files change — data-tooling WP. Per
the ops-script convention (`apply-card-counts.mjs` / `apply-effect-markers.mjs`
have no `.test.ts`), correctness is enforced by loud-fail + idempotency +
the verification greps below.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**

- ESM only, Node v22+. Full file contents for the modified script; no
  diffs/snippets.
- Human-style code per `00.6-code-style.md` — full English names, JSDoc on
  every function, `// why:` on non-obvious decisions.
- No randomness, no clocks, no network in the overlay — deterministic
  pure-IO transform.

**Packet-specific:**

- Exactly **one** keyword added to the overlay's local array:
  `koHeroEachPlayer`, appended at **position 6** to match WP-189's engine
  array byte-for-byte. The local array is a hand-kept copy with no import
  from `packages/`; it loud-fails on any value outside the six.
- The marker token is `[effect:koHeroEachPlayer]`, appended trailing (after
  text + existing markup), per-keyword idempotent — unchanged append
  mechanics from WP-187.
- **Curation discipline (locked):** mark ONLY "each player KOs one / a Hero"
  lines — unconditional, magnitude 1, unfiltered. Magnitude>1, filtered,
  conditional, and choice variants stay in `_unassigned` (do not force them
  onto `koHeroEachPlayer`).
- **Each-player ≠ current-player.** A line that says "each player KOs …" is
  `koHeroEachPlayer`; a line that says "KO one of **your** Heroes" is
  `koHeroCurrentPlayer` (WP-187). Do not conflate them; do not re-mark
  existing `koHeroCurrentPlayer` lines.
- The overlay stays **idempotent** and **loud-fails** on unknown keyword /
  missing entity / zero-or-multiple timing match — unchanged from WP-187/188.
- WP-187/188 markers (ambush/fight/escape `gainWound` + ko + bystander) are
  **untouched**; a re-run is additive-only over them.
- WP-190 adds **no** engine/registry/server code and modifies **no** converter
  other than `apply-effect-markers.mjs`.

**Session protocol:**

- If WP-189 has not landed (no `koHeroEachPlayer` in the engine vocabulary),
  stop and report `BLOCKED: WP-189` — the local array would drift from the
  engine and the marker would reference a non-existent keyword.
- If a `--propose` each-player-KO candidate is magnitude>1 / filtered /
  conditional, leave it in `_unassigned`. Do not guess; do not stretch it
  onto `koHeroEachPlayer`.

**Locked marker vocabulary (mirrors WP-189 — six entries, do not re-derive):**

```
gainWoundEachPlayer
gainWoundCurrentPlayer
koHeroCurrentPlayer
heroDeckTopToEscape
captureBystander
koHeroEachPlayer
```

---

## Acceptance Criteria

- [ ] `apply-effect-markers.mjs` local `VILLAIN_EFFECT_KEYWORDS` has exactly
  six entries with `'koHeroEachPlayer'` at position 6, matching WP-189's
  engine array.
- [ ] A `koHeroEachPlayer` entry in `villain-effect-markers.json` injects
  `[effect:koHeroEachPlayer]` onto its matched line in apply mode.
- [ ] A re-run of `apply-effect-markers.mjs` produces a zero-line
  `git diff` (idempotency across all six keywords + four timings).
- [ ] `--propose` surfaces each-player-KO candidates with `koHeroEachPlayer`
  in the proposed-keywords column (writes nothing).
- [ ] `grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort -u` lists exactly
  the six locked keywords (no typo / unknown value).
- [ ] At least one `Escape: Each player KOs one of their … Heroes` line and
  one `Ambush:`/`Fight:` each-player-KO line carry
  `[effect:koHeroEachPlayer]`.
- [ ] No magnitude>1 / filtered / conditional / choice each-player-KO line is
  marked; those remain in `_unassigned` with a documented reason.
- [ ] No `koHeroCurrentPlayer` line was re-marked or converted; WP-187/188
  markers are intact (`grep -rc "\[effect:" data/cards/` ≥ WP-187/188
  baseline + the new koHeroEachPlayer count).
- [ ] The now-curated rows are removed from `_unassigned`; the still-deferred
  each-player-KO rows remain.
- [ ] `pnpm -r build` exits 0 (data-only change).

---

## Verification Steps

```pwsh
# Confirm WP-189 landed (engine keyword exists) — else BLOCKED
grep -n "koHeroEachPlayer" packages/game-engine/src/rules/villainAbility.types.ts
# Expected: union + canonical array both list it

# Apply the overlay (now including koHeroEachPlayer) and confirm a clean re-run
node scripts/convert-cards/apply-effect-markers.mjs
node scripts/convert-cards/apply-effect-markers.mjs
git diff --stat data/cards/   # expected: no changes on the second run

# Markers landed and vocabulary-clean (exactly the 6 locked strings)
grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort | uniq -c

# koHeroEachPlayer now present on each-player-KO lines
grep -rhoE '"(Ambush|Fight|Escape):[^"]*\[effect:koHeroEachPlayer\]"' data/cards/ | head

# WP-187/188 markers preserved (counts only grew)
grep -rc "\[effect:" data/cards/ | tail

# Propose surfaces each-player-KO distinctly
node scripts/convert-cards/apply-effect-markers.mjs --propose | grep koHeroEachPlayer | head

# Full monorepo build (data-only change)
pnpm -r build
```

Expected: WP-189 keyword present; the `uniq -c` output lists exactly the six
locked keywords; the second apply run shows no `data/cards/` diff; at least
one each-player-KO line carries `[effect:koHeroEachPlayer]`; `--propose`
prints each-player-KO rows; `pnpm -r build` exits 0.

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-190 Executed` block (the 6th keyword
  in the overlay, curated each-player-KO line count by timing, sets touched,
  remaining-`_unassigned` count).
- [ ] `docs/ai/DECISIONS.md` has D-19001..D-19002 (proposed):
  - D-19001: each-player-KO curation marks only unconditional magnitude-1
    unfiltered lines with `koHeroEachPlayer`; magnitude>1 / filtered /
    conditional / choice variants stay `_unassigned` (extends the WP-187
    curation discipline; resolves the unconditional portion of D-18802).
  - D-19002: the overlay's local six-keyword array is hand-kept in sync with
    WP-189's engine `VILLAIN_EFFECT_KEYWORDS`; drift loud-fails (no import
    from `packages/` into a `.mjs` ops script).
- [ ] `WORK_INDEX.md`: WP-190 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-217 row Done.
- [ ] No files outside the §Files Expected to Change list were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §10 (Card-data semantics).

**Conflict assertion:** No conflict. WP-190 is a data-fidelity enrichment
that lets the engine (via WP-189 + WP-185/186) honor the printed "each player
KOs a Hero" text. Curation is conservative; it never invents mechanics and
explicitly defers the magnitude>1 / filtered remainder.

**Non-Goal proximity check:** None of NG-1..NG-7 crossed. No monetization,
identity, or competitive surface; data-prep only.

**Determinism preservation:** The overlay is a deterministic pure-IO
transform; identical map + identical card data → byte-identical output. No
`ctx.random`, no clocks. The enriched data is consumed deterministically by
the engine at setup time.

---

## Funding Surface Gate

N/A — card-data tooling WP; no §20.1 trigger surfaces (no navigation funding
affordance, no registry-viewer surface, no profile attribution, no
user-visible donate copy).

---

## API Catalog Update

N/A — no HTTP endpoints or `apps/server/src/**` library functions
added/modified/removed.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ (data half that makes koHeroEachPlayer fire on real cards) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-189 + WP-187 + WP-188 hard-deps; WP-185 spec dep) |
| 3 | Context (Read First) specific (paths + line numbers + precedents) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract | ✅ (1 modified script + 1 modified map + data regen + governance) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria testable | ✅ |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — data-tooling only, no engine/registry/server code | ✅ |
| 11 | Identity model N/A | N/A |
| 12 | Test rules — no `.test.ts`; ops-script convention; loud-fail+idempotency are the guardrails | ✅ (justified) |
| 13 | pnpm/node commands only; expected output shown | ✅ |
| 14 | Acceptance ≤ ~13 binary items; specific tokens/greps | ✅ |
| 15 | Definition of Done includes STATUS/DECISIONS/WORK_INDEX/scope-bound | ✅ |
| 16 | Code style: full names, JSDoc, no clever parsing in committed output | ✅ |
| 17 | Vision Alignment present; clauses §1/§2/§10 | ✅ |
| 18 | Prose-vs-grep: verification greps scoped to `data/cards/` + token, not raw NL | ✅ |
| 19 | Bridge-vs-HEAD staleness — commit-time discipline | N/A |
| 20 | Funding surface N/A with justification | ✅ |
| 21 | API catalog N/A with justification | ✅ |

---

*Drafted: 2026-05-28. Baseline `origin/main @ cc29447`. Data half of the
`koHeroEachPlayer` expansion; paired with WP-189 (engine keyword). Hard-deps:
WP-189 + WP-187 + WP-188. Completes the unconditional-subset resolution of
D-18802's deferral.*
