# WP-190 — Villain Each-Player-KO Effect-Marker Curation (Card Data)

## Goal

Curate the unconditional, magnitude-1, unfiltered "Each player KOs one of
their Heroes" ability lines on the `Fight:` timing with the
`[effect:koHeroEachPlayer]` marker, and teach the overlay script the sixth
keyword. This is the **data** half of the `koHeroEachPlayer` expansion —
WP-189 adds the engine keyword + executor (landed 2026-05-31 at
[`bf61d82`](https://github.com/barefootbetters/legendary-arena/pull/165));
WP-190 authors the markers WP-189 reads. Before this WP, the curatable
candidates sit in WP-187's `_unassigned` block (the `Fight:` lines were
marked by WP-187 with reasons other than `no-vocabulary-keyword`; the
escape cluster was marked by WP-188 with `reason: "no-vocabulary-keyword"`,
D-18802). After WP-190, the four curatable `Fight:` lines carry
`[effect:koHeroEachPlayer]` and WP-185's Fight pipeline executes them on
real cards.

> **KO-only, unconditional, magnitude-1, unfiltered — same discipline as
> WP-187/188.** This WP marks ONLY "each player KOs **one / a** Hero"-shaped
> lines on the `Fight:` timing. It does NOT mark: "each player KOs **two**
> Heroes" (magnitude>1), "each player KOs a Hero **that costs ≥ X /
> non-grey / [team]**" (filtered), "… **or** gains a Wound" (choice),
> compound clauses ("KO a Hero **and** …"), or any discard each-player
> line. Those stay in `_unassigned`. No new keyword beyond
> `koHeroEachPlayer`.

> **Scope-reality reckoning (verified by empirical grep against the
> 40-set corpus on 2026-05-31; see §Files Expected to Change for the
> exact card list).** The Ambush side has zero curatable lines — the
> only Ambush each-player-KO line in the corpus is magnitude>1. The
> Escape side has zero curatable lines — all six Escape each-player-KO
> lines (recorded exhaustively in WP-188's `_unassigned` block under
> `reason: "no-vocabulary-keyword"`) are magnitude>1, filtered, or
> compound. The Fight side has **four** curatable lines — the exact
> `"Fight: Each player KOs one of their Heroes."` shape across the
> villains `amwp/avengers-vs-x-men/...`, `core/enemies-of-asgard/...`,
> `msis/.../...`, `wtif/.../...`. Net WP-190 curatable yield: **4
> markers across 4 cards across 4 sets, all on the Fight timing.** The
> earlier draft estimate (`~11 lines across Ambush / Fight / Escape`,
> drafted 2026-05-28 against baseline `cc29447` before WP-188's
> exhaustive Escape audit) was speculative; this WP supersedes it with
> the empirical count. The smaller yield does not invalidate the WP —
> the four Fight-side cards' printed text now executes correctly via
> WP-185's existing onFight fire site, and the engine keyword exists
> for any future curation. The zero-Escape outcome mirrors WP-188's
> "zero overrun curated — a valid v1 outcome" framing.

---

## Assumes

- **WP-189 ✅ (hard-dep — the engine keyword).** Landed 2026-05-31 at
  `bf61d82` (PR #165). `koHeroEachPlayer` is present at position 6 of
  `VILLAIN_EFFECT_KEYWORDS` and the `VillainEffectKeyword` union — verify
  with `grep -n "koHeroEachPlayer" packages/game-engine/src/rules/villainAbility.types.ts`
  (expect matches in both the union and the canonical array). The overlay
  script's local six-keyword copy must mirror the engine ordering
  byte-for-byte at positions 0-5.
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
- **Data finding (verified empirically 2026-05-31; supersedes the 2026-05-28
  speculative `~11` estimate).** `grep -rhE "(Ambush|Fight|Escape): Each
  player KOs[^.]+\." data/cards/ | sort -u` returns the closed list:
  - **Ambush (1 unique line, 0 curatable):** `"Ambush: Each player KOs
    two Heroes from their discard pile."` — magnitude>1, deferred.
  - **Fight (4 unique lines, 1 curatable shape × 4 cards):**
    - `"Fight: Each player KOs one of their Heroes."` — **CURATABLE × 4
      cards** (one each in `amwp.json`, `core.json`, `msis.json`,
      `wtif.json`).
    - `"Fight: Each player KOs one of their [hc:tech] or [team:inhumans]
      Heroes or gains a Wound."` — filtered + choice, deferred.
    - `"Fight: Each player KOs one of their grey Heroes."` — filtered
      (class predicate), deferred.
  - **Escape (6 unique lines, 0 curatable; exhaustively recorded in
    WP-188's `_unassigned` block):** `hela-2099` ("two Henchmen … or
    gains a Wound" — magnitude+choice), `juggernaut` ("two Heroes" —
    magnitude>1), `core/destroyer` + `msp1/destroyer` ("two of their
    Heroes" — magnitude>1), `bullseye` ("printed attack of 2 or more" —
    filtered), `ultimaton-weapon-xv` ("non-grey Heroes" — filtered),
    plus the compound `nightmare` (`"... Nightmare moves to the
    Mastermind space."`).

  **Net curatable yield: 4 Fight markers across 4 cards across 4 sets.**
  Ambush yield: 0. Escape yield: 0. `grep -rn "koHeroEachPlayer"
  data/cards/` returns zero today (no marker authored yet).
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
  Key sites (line numbers verified against `main @ bf61d82`, the
  post-WP-189 baseline): `VILLAIN_EFFECT_KEYWORDS` (line 66, local copy
  → append the 6th); `validateAndOrderKeywords` (line 212, validates
  against that copy); `PROPOSE_HEURISTICS` (line 517 — add an
  each-player-KO heuristic); `isTimingLine` (line 144) /
  `collectTimingEdits` (already generic). The earlier draft cited
  lines 63 and 504; WP-188's inline JSDoc widening shifted those
  references by 3 and 13 lines respectively. The updated lines above
  are accurate at execution time; if a future WP further widens the
  script before WP-190 executes, re-verify with
  `grep -n "VILLAIN_EFFECT_KEYWORDS\|PROPOSE_HEURISTICS" scripts/convert-cards/apply-effect-markers.mjs`
  and update inline.
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

WP-189 adds the `koHeroEachPlayer` engine keyword + executor branch
(landed 2026-05-31 at `bf61d82`), but on its own it reads nothing — the
card data carries no `[effect:koHeroEachPlayer]` markers. WP-190 authors
them, completing the engine/data pair (mirroring WP-185↔WP-187 and
WP-186↔WP-188).

**The each-player-KO Fight-side gap is real but small.** The empirical
audit (§Assumes Data finding) confirms exactly four cards carry the
unconditional magnitude-1 unfiltered shape — all on the Fight timing,
all with identical printed text `"Fight: Each player KOs one of their
Heroes."` (in `amwp`, `core`, `msis`, `wtif`). WP-190 promotes those
four lines — the unconditional, magnitude-1, unfiltered ones — from
WP-187's `_unassigned` to curated, and leaves the rest of the
each-player-KO clusters deferred. The Ambush and Escape sides have
**zero** curatable lines under this discipline: the only Ambush
each-player-KO line is magnitude>1, and all six Escape each-player-KO
lines are magnitude>1 / filtered / compound (the filtered and
magnitude>1 predicates would need engine machinery the MVP does not
have). The zero-yield on Ambush + Escape mirrors WP-188's "zero
overrun curated — a valid v1 outcome" finding: it is a disciplined
deferral, not a WP failure.

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
- **Curate the four unconditional magnitude-1 unfiltered Fight-side
  each-player-KO lines** — extend `villain-effect-markers.json`: add
  `koHeroEachPlayer` to the `fight` timing entry on the four villain cards
  whose printed text is exactly `"Fight: Each player KOs one of their
  Heroes."` (one card in each of `amwp`, `core`, `msis`, `wtif`). Promote
  these rows out of WP-187's `_unassigned` if they were recorded there;
  the still-deferred magnitude>1 / filtered / compound / choice
  each-player-KO lines remain documented in `_unassigned`. **No Ambush
  or Escape entries are curated** — both timings have zero curatable
  lines under the v1 discipline (§Assumes Data finding); this is a
  disciplined deferral, not an oversight.
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
   — add `koHeroEachPlayer` to the `fight` timing entry on each of the four
   curatable villain cards (one in `amwp`, one in `core`, one in `msis`,
   one in `wtif`). Promote those rows out of `_unassigned` if recorded
   there. Retain the deferred each-player-KO rows in `_unassigned` (the
   six Escape rows + the magnitude>1 Ambush row + the filtered Fight rows
   + the compound rows); see §`_unassigned` post-curation hygiene below.
3. `data/cards/*.json` — **modified, bounded to exactly four files**:
   `data/cards/amwp.json`, `data/cards/core.json`, `data/cards/msis.json`,
   `data/cards/wtif.json`. Each gains one `[effect:koHeroEachPlayer]`
   appended trailing to its `"Fight: Each player KOs one of their
   Heroes."` line — total **4 insertions / 4 deletions** under the
   surgical anchored replacement model (per the WP-187/188 precedent).
   Any other `data/cards/*.json` file with a `git diff` after the apply
   run is a FAIL — investigate, do not commit. The other 36 sets are
   untouched.
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

**`_unassigned` post-curation hygiene (locked — minimal-churn convention):**

WP-188 recorded six Escape each-player-KO rows in `_unassigned` under
`reason: "no-vocabulary-keyword"`, with prose declaring these rows are
EXHAUSTIVE across the 40 sets and that "WP-190 reads exactly these rows
to promote the unconditional magnitude-1 subset". WP-190's empirical
audit (2026-05-31) confirms ALL six are non-curatable under the v1
discipline (5 are magnitude>1, 1 is filtered, 1 is compound — counts
overlap because `hela-2099` is both magnitude>1 and choice; `nightmare`
is filtered AND compound). So WP-190 promotes ZERO of those six rows.
The `no-vocabulary-keyword` tag becomes mildly stale (a keyword now
exists, the rows are out-of-discipline for a different reason), but
re-tagging would (a) churn the JSON unnecessarily, (b) lose the
cross-WP contract anchor that WP-188 established for future audit
traceability, and (c) require deciding between multiple substantively-
accurate tags (`magnitude>1` vs `conditional` for the choice rows;
`other` for compound). **Convention:** retain the WP-188 `_unassigned`
rows verbatim with their `no-vocabulary-keyword` reason; add a single
`_notes` paragraph (in the JSON top-level `_notes` array) that records
WP-190's audit outcome: "WP-190 promoted 0 of 6 rows — all are
non-curatable under the v1 unconditional-magnitude-1-unfiltered
discipline (5 magnitude>1, 1 filtered, 1 compound; counts overlap).
The `no-vocabulary-keyword` tag is preserved for cross-WP audit
traceability; substantive re-tagging deferred to a future predicate-
machinery WP that would actually be able to express these patterns."

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
- [ ] **Exactly four `Fight: Each player KOs one of their Heroes.` lines
  carry `[effect:koHeroEachPlayer]`** — one each in `amwp.json`,
  `core.json`, `msis.json`, `wtif.json`. Verified by
  `grep -rcE '"Fight: Each player KOs one of their Heroes\.\s*\[effect:koHeroEachPlayer\]"' data/cards/`
  returning total = 4.
- [ ] **No `Ambush:` or `Escape:` line carries `[effect:koHeroEachPlayer]`.**
  Both timings have zero curatable lines under the v1 discipline (the
  Ambush each-player-KO line is magnitude>1; all six Escape each-player-KO
  lines are magnitude>1 / filtered / compound). Verified by
  `grep -rcE '"(Ambush|Escape):[^"]*\[effect:koHeroEachPlayer\]"' data/cards/`
  returning total = 0.
- [ ] No magnitude>1 / filtered / conditional / choice / compound
  each-player-KO line is marked; those remain in `_unassigned` with their
  documented reason (`magnitude>1`, `conditional`, `other`, or
  `no-vocabulary-keyword` per the per-row classification — see §`_unassigned`
  post-curation hygiene).
- [ ] No `koHeroCurrentPlayer` line was re-marked or converted; WP-187/188
  markers are intact (`grep -rc "\[effect:" data/cards/` = WP-187/188
  baseline + 4 new `koHeroEachPlayer` markers).
- [ ] The four newly-curated Fight rows are promoted out of `_unassigned`
  (if they were recorded there with their pre-WP-189 deferral reason); the
  still-deferred each-player-KO rows (Ambush magnitude>1; Escape × 6
  magnitude>1 / filtered / compound; Fight filtered + choice) remain in
  `_unassigned`. WP-188's `_unassigned` block referencing the Escape rows
  under `reason: "no-vocabulary-keyword"` is retained verbatim with a
  clarifying note (see §`_unassigned` post-curation hygiene); WP-190 does
  NOT re-tag those rows.
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

# koHeroEachPlayer present on exactly four Fight lines, zero Ambush, zero Escape
grep -rcE '"Fight: Each player KOs one of their Heroes\.\s*\[effect:koHeroEachPlayer\]"' data/cards/
# Expected: total across files = 4 (one each in amwp / core / msis / wtif)
grep -rcE '"(Ambush|Escape):[^"]*\[effect:koHeroEachPlayer\]"' data/cards/
# Expected: total = 0 (Ambush and Escape sides have zero curatable lines per the v1 discipline)

# Diff is bounded to exactly four files
git diff --stat data/cards/
# Expected: amwp.json, core.json, msis.json, wtif.json — each +1/-1; no other set

# WP-187/188 markers preserved (counts only grew by 4)
grep -rc "\[effect:" data/cards/ | tail

# Propose surfaces each-player-KO distinctly
node scripts/convert-cards/apply-effect-markers.mjs --propose | grep koHeroEachPlayer | head

# Full monorepo build (data-only change)
pnpm -r build
```

Expected: WP-189 keyword present; the `uniq -c` output lists exactly the
six locked keywords; the second apply run shows no `data/cards/` diff;
exactly four `Fight:` lines carry `[effect:koHeroEachPlayer]` (one per
set: `amwp`, `core`, `msis`, `wtif`); zero `Ambush:` or `Escape:` lines
are marked; `git diff --stat data/cards/` shows exactly four files
modified with `+1/-1` each; `--propose` prints each-player-KO rows;
`pnpm -r build` exits 0.

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-190 Executed` block (the 6th
  keyword in the overlay, curated each-player-KO line count = **4 Fight
  markers** across 4 sets, zero Ambush curated, zero Escape curated, the
  explicit Escape-yield-zero acknowledgment mirroring WP-188's "zero
  overrun curated — a valid v1 outcome" framing, the cross-WP
  `_unassigned` ledger state).
- [ ] `docs/ai/DECISIONS.md` has D-19001..D-19002 (proposed):
  - D-19001: each-player-KO curation marks only unconditional magnitude-1
    unfiltered lines with `koHeroEachPlayer`; magnitude>1 / filtered /
    conditional / choice / compound variants stay `_unassigned` (extends
    the WP-187 curation discipline). Resolves the **Fight-side**
    unconditional portion of D-18802's deferral (4 cards across 4 sets).
    The **Ambush-side and Escape-side** of D-18802 remain deferred — the
    Ambush each-player-KO line is magnitude>1, all six Escape
    each-player-KO lines are magnitude>1 / filtered / compound under the
    v1 discipline. Predicate machinery (cost-gate, class-gate,
    magnitude-N) for the filtered / magnitude>1 subset is a future WP;
    until then those rows stay in `_unassigned`.
  - D-19002: the overlay's local six-keyword array is hand-kept in sync
    with WP-189's engine `VILLAIN_EFFECT_KEYWORDS`; drift loud-fails (no
    import from `packages/` into a `.mjs` ops script). The first-five
    positions are byte-identical to WP-185's array (preserved by WP-189);
    `koHeroEachPlayer` is appended at position 6.
- [ ] `WORK_INDEX.md`: WP-190 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-217 row Done.
- [ ] No files outside the §Files Expected to Change list were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §10 (Card-data semantics).

**Conflict assertion:** No conflict. WP-190 is a data-fidelity enrichment
that lets the engine (via WP-189 + WP-185) honor the printed `Fight: Each
player KOs one of their Heroes.` text on four villain cards. Curation is
conservative; it never invents mechanics and explicitly defers the
magnitude>1 / filtered / compound remainder (including the entire
Ambush-side and Escape-side each-player-KO clusters — both at zero
curatable lines under the v1 discipline; this mirrors WP-188's "zero
overrun curated — a valid v1 outcome" disciplined-deferral framing).

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
| 5 | Files Expected to Change matches contract | ✅ (7 numbered items: 1 modified script + 1 modified map + bounded 4-file `data/cards/*.json` regen + 4 governance; the data-regen item enumerates the exact four sets `amwp`/`core`/`msis`/`wtif` per the 2026-05-31 SPEC hardening reconciling the WP body to the empirical yield) |
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
`koHeroEachPlayer` expansion; paired with WP-189 (engine keyword).
Hard-deps: WP-189 ✅ (landed 2026-05-31 at `bf61d82`) + WP-187 ✅ +
WP-188 ✅. Completes the Fight-side unconditional-subset resolution of
D-18802's deferral. Hardened 2026-05-31 (docs-only SPEC pass, no code
touched): empirical-yield reconciliation per the WP-190 pre-flight (PS-1
from `preflight-wp190-*.md`) — replaced the speculative "~11 lines across
A/F/E" estimate with the empirical 4 Fight + 0 Ambush + 0 Escape audit;
explicit Escape-yield-zero acknowledgment (mirrors WP-188's "zero overrun
curated — a valid v1 outcome" framing); replaced the unsatisfiable
"at least one Escape line marked" AC with the satisfiable "exactly 4
Fight lines marked + zero Ambush + zero Escape" formulation; reworded
DoD D-19001 to acknowledge the Ambush + Escape deferral explicitly;
enumerated the exact four target sets `amwp`/`core`/`msis`/`wtif` in
§Files Expected to Change. Line-number drift (PS-3) corrected: 63→66
for `VILLAIN_EFFECT_KEYWORDS`, 504→517 for `PROPOSE_HEURISTICS` (drift
introduced by WP-188's inline JSDoc widening). `_unassigned` post-
curation hygiene (PS-4): retain WP-188's six Escape rows verbatim under
`reason: "no-vocabulary-keyword"` (preserves cross-WP audit anchor),
add a single clarifying `_notes` paragraph rather than substantive
re-tagging churn. EC-217 mirrors all of the above.*
