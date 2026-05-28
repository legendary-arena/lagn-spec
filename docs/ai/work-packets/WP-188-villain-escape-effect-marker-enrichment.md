# WP-188 — Villain & Henchman Escape/Overrun Effect-Marker Enrichment (Card Data)

## Goal

Extend the card-data effect-marker enrichment to the `Escape:` / `Overrun:`
ability lines so the unambiguous subset carries a structured
`[effect:<VillainEffectKeyword>]` marker. This is the upstream data
prerequisite that lets WP-186's engine parser detect and execute escape
effects — exactly as WP-187 was the upstream prerequisite for WP-185's
Fight/Ambush effects. WP-188 reuses WP-187's overlay script
(`apply-effect-markers.mjs`) and curated map
(`villain-effect-markers.json`); the only script change is widening the
`SUPPORTED_TIMINGS` gate to admit `escape` / `overrun`, plus adding the
curated escape/overrun entries to the map. After WP-188, a line like
`Escape: Each player gains a Wound.` carries `[effect:gainWoundEachPlayer]`
and becomes engine-readable by WP-186.

> **Yield is small and lopsided — read this before scoping.** Verified
> across all 40 sets (2026-05-28): escape effects are overwhelmingly
> *each-player* effects ("Each player KOs one of their Heroes" — 9 lines),
> but the WP-185 MVP vocabulary is *current-player*-biased and has no
> each-player KO keyword. So the dominant escape KO pattern is **not**
> curatable in v1 and goes to `_unassigned` pending a future
> `koHeroEachPlayer` vocabulary expansion. The genuinely curatable escape
> subset is dominated by **`gainWoundEachPlayer`** (~17 "each player gains
> a Wound" escape lines, of which the unconditional/non-compound ones
> qualify) — which is notable because that keyword has **zero** data under
> WP-187 (no unconditional wound lines exist on Ambush/Fight). WP-188 is
> therefore what finally gives `gainWoundEachPlayer` something to fire on.

---

## Assumes

- **WP-187 ✅ (hard-dep — the overlay it extends).** Landed 2026-05-28
  (EC-214 @ c08a297). `scripts/convert-cards/apply-effect-markers.mjs`
  and `scripts/convert-cards/inputs/villain-effect-markers.json` exist
  on `main`; the script already detects timing lines generically via
  `isTimingLine(line, timing)` and reads timing entries generically via
  `collectTimingEdits(...)`. The **only** thing stopping escape/overrun
  curation today is the `SUPPORTED_TIMINGS = ['ambush', 'fight']` gate
  (line 75) which loud-fails on any other timing key.
- **WP-185 vocabulary lock (spec dependency, not code).** The marker
  vocabulary is exactly the five strings locked in
  `WP-185 §Non-Negotiable Constraints` / `EC-212 §Locked Values`:
  `gainWoundEachPlayer | gainWoundCurrentPlayer | koHeroCurrentPlayer |
  heroDeckTopToEscape | captureBystander`. WP-188 adds **no** new
  keyword. The script's local `VILLAIN_EFFECT_KEYWORDS` copy (line 63)
  is unchanged.
- **WP-186 (downstream consumer — NOT a dependency).** WP-186's engine
  parser reads the markers WP-188 authors; WP-188 does not consume any
  WP-186 code. WP-188 is upstream of WP-186, exactly as WP-187 is
  upstream of WP-185.
- **Card-generation pipeline shape (verified 2026-05-28).**
  `data/cards/*.json` (40 sets, tracked in git) carries `Escape:`
  ability lines on >100 cards and `Overrun:` on a small number; the
  overlay's anchored surgical text replacement keeps diffs bounded to
  the curated lines.
- **Data finding (verified 2026-05-28).** `grep -rn "Escape:.*\[effect:"
  data/cards/` returns zero matches today — no escape line carries an
  effect marker. WP-188 closes that gap for the curatable subset.
- **Drafting baseline:** `origin/main @ cc29447` (2026-05-28).

---

## Context (Read First)

- `docs/ai/work-packets/WP-187-villain-effect-marker-enrichment.md` —
  **the parent WP.** WP-188 is a direct continuation: same script, same
  map, same curation discipline, extended to two more timing prefixes.
  Do not re-derive its locked values.
- `scripts/convert-cards/apply-effect-markers.mjs` — **the file being
  extended.** Key sites: `SUPPORTED_TIMINGS` (line 75, the gate to
  widen); `isTimingLine` (line 134, already timing-generic);
  `collectTimingEdits` (line 349, loud-fails on unsupported timing);
  `PROPOSE_HEURISTICS` (line 504, already covers the relevant patterns);
  `collectProposeRowsForAbilities` (line 559, iterates
  `SUPPORTED_TIMINGS` so `--propose` extends automatically).
- `scripts/convert-cards/inputs/villain-effect-markers.json` — **the map
  being extended.** WP-188 adds `escape?` / `overrun?` keys alongside the
  existing `ambush?` / `fight?` keys on curated entries, and extends the
  `_unassigned` block.
- `docs/ai/work-packets/WP-186-villain-escape-and-overrun-effects.md` —
  the downstream consumer; its parser detects `Escape:` / `Overrun:`
  prefixes → `onEscape` timing and reads the markers WP-188 authors.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — `abilities: string[]`
  shape and canonical field names.
- `.claude/rules/architecture.md §Layer Boundary` — data-preparation
  tooling upstream of the Registry layer; touches no
  engine/registry-runtime/server code.

---

## Context

WP-187 enriched `Ambush:` / `Fight:` lines and explicitly deferred
`Escape:` / `Overrun:` to "a WP-186 follow-on against the same map shape"
(WP-187 §Out of Scope). WP-188 is that follow-on. The overlay mechanism
WP-187 built is already timing-agnostic — `isTimingLine` matches any
`<timing>:` prefix, `collectTimingEdits` reads any timing key — and was
deliberately gated to `['ambush', 'fight']` so an escape entry could not
land silently before WP-186 existed. WP-188 widens that gate.

**Why the curatable yield is small.** A `--propose` scan of escape lines
(2026-05-28) shows the dominant escape effect is *each-player* — "Each
player KOs one of their Heroes" (9 lines), "Each player discards…", "Each
player KOs two…". The WP-185 MVP vocabulary models *current-player*
effects (`koHeroCurrentPlayer`) and one each-player wound
(`gainWoundEachPlayer`); it has **no each-player KO keyword**. So:

- **Curatable in v1:** `Escape: Each player gains a Wound.` (and the
  handful of compound lines whose wound clause is genuinely
  unconditional) → `gainWoundEachPlayer`. This is the bulk of WP-188's
  real output, and it is the first data this keyword ever gets.
- **Deferred to `_unassigned`:** every "Each player KOs …" line (no
  vocabulary keyword), every magnitude>1 / conditional / `… or …` /
  "(After the normal Escape KO) …" compound line. The each-player-KO
  cluster is documented as the motivating candidate for a future
  `koHeroEachPlayer` vocabulary expansion (a WP-185-side WP, not this
  one).

The engine still reads only reviewed, structured markers; the offline
`--propose` bootstrap may over-capture because its output is committed
and human-reviewed before anything lands.

---

## Scope (In)

- **Script gate widening** — `apply-effect-markers.mjs`:
  `SUPPORTED_TIMINGS = ['ambush', 'fight']` → `['ambush', 'fight',
  'escape', 'overrun']`. This is the single behavioral change. The
  `// why:` comment on that const (currently states Escape/Overrun is a
  "WP-186 follow-on") is updated to record that WP-188 is that follow-on
  and that all four timings are now curatable; `escape` and `overrun`
  are **distinct map keys** even though WP-186's engine parser collapses
  both prefixes to the single `onEscape` timing (the script matches by
  line prefix; the engine collapses the timing).
- **Module docstring + JSDoc touch-ups** — the header docstring and the
  JSDoc on `isTimingLine` / `findSingleTimingLineIndex` /
  `collectTimingEdits` say "Ambush/Fight" or `("ambush" | "fight")`;
  widen those to name all four timings so the prose matches the widened
  gate. No logic change in those functions — they are already generic.
- **Curated escape/overrun entries** — extend
  `villain-effect-markers.json`: add `escape?: VillainEffectKeyword[]`
  and/or `overrun?: VillainEffectKeyword[]` keys to the curated entries
  for the unambiguous escape subset (dominated by
  `gainWoundEachPlayer`). Use `node apply-effect-markers.mjs --propose`
  to bootstrap candidates, then human-review each against the v1
  curation discipline (below) before adding it to the map.
- **Extend `_unassigned`** — every each-player-KO escape line, every
  magnitude>1 / conditional / compound escape line surfaced by
  `--propose` is recorded as a structured `_unassigned` row
  (`{ set, group, card?, timing, text, reason }`) with `reason` ∈ the
  WP-187 set plus the existing `multi-line`. The each-player-KO cluster
  uses `reason: "no-vocabulary-keyword"` (a value WP-187's `_unassigned`
  already permits under `other`; this WP names it explicitly) and is
  cross-referenced in D-18802 as the future-expansion motivator.
- **Regenerated data** — re-run `apply-effect-markers.mjs`; the
  `data/cards/*.json` set files containing curated escape lines gain
  `[effect:]` markers on those lines. Diff bounded to curated lines.
  Idempotent: a second run produces a zero-line diff.
- **v1 curation discipline (locked — identical to WP-187):** a line is
  marked **only** when it reduces to exactly one application of a single
  MVP keyword with WP-185's exact semantics — unconditional (no `may`,
  no `If …`, no `… or …` choice, no "(After the normal Escape KO)"
  compound), magnitude 1, single-target matching WP-185. When in doubt,
  leave unmarked (WP-186 safe-skips → `effects: []`).
- **Governance** — `STATUS.md` entry, `DECISIONS.md` D-18801..D-18803,
  `WORK_INDEX.md` flip to `[x]` + WP-186 row Hard-deps updated to
  include WP-188, `EC_INDEX.md` EC-215 → Done.

## Out of Scope

- **Engine parsing / execution** — entirely WP-186. WP-188 produces data
  only; it adds no engine, registry, or server code.
- **Expanding the five-keyword vocabulary** — locked by WP-185. The
  each-player-KO escape cluster motivates a future `koHeroEachPlayer`
  (or similar) keyword, but adding it is a WP-185-side vocabulary WP with
  its own `DECISIONS.md` entry, NOT this WP. WP-188 leaves those lines
  in `_unassigned`.
- **`Ambush:` / `Fight:` curation** — WP-187 scope, already landed. WP-188
  must not touch existing `ambush` / `fight` map entries or re-mark their
  lines (idempotency guarantees a re-run leaves them untouched).
- **Magnitude>1 / conditional / multi-target / compound escape lines** —
  out of v1 MVP; documented in `_unassigned`.
- **Modifying `apply-card-counts.mjs`, `convert-cards-v15.mjs`, or any
  other existing converter** — WP-188 touches only
  `apply-effect-markers.mjs` (the WP-187 sibling) and its input map.
- **Scheme-card `Overrun:` semantics** — scheme overrun has richer
  setup-tied behavior; WP-188 curates only villain/henchman
  `Overrun:` lines that reduce to an MVP keyword (likely few or none).
- **Changing the engine's generic per-escape behavior** (WP-015 wound)
  — that is engine behavior owned by WP-186, not card data.
- **Image/asset, schema, or registry-runtime changes** — none.

---

## Files Expected to Change

1. `scripts/convert-cards/apply-effect-markers.mjs` — **modified** —
   widen `SUPPORTED_TIMINGS` to `['ambush', 'fight', 'escape',
   'overrun']`; update its `// why:` comment; widen the module-header
   docstring + the three JSDoc blocks that name only "ambush/fight" to
   name all four timings. No logic change to the (already-generic)
   matching functions.
2. `scripts/convert-cards/inputs/villain-effect-markers.json` —
   **modified** — add curated `escape?` / `overrun?` entries for the
   unambiguous subset; extend the `_unassigned` array with the
   each-player-KO cluster (`reason: "no-vocabulary-keyword"`) and any
   conditional/compound escape lines.
3. `data/cards/*.json` — **modified** — set files containing curated
   escape/overrun lines gain `[effect:]` markers on those lines; diff
   bounded to curated lines.
4. `docs/ai/STATUS.md` — **modified** — `### WP-188 Executed` block.
5. `docs/ai/DECISIONS.md` — **modified** — D-18801..D-18803.
6. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-188 row to
   `[x]`; WP-186 row Hard-deps updated to include WP-188.
7. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-215
   row to Done.

No engine/registry/server/test-package files change — this is a
data-tooling WP. Per the established convention for these ops scripts
(`apply-card-counts.mjs` and `apply-effect-markers.mjs` have no
`.test.ts`), correctness is enforced by loud-fail + idempotency + the
verification greps below.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**

- ESM only, Node v22+. Full file contents for the modified script; no
  diffs/snippets.
- Human-style code per `00.6-code-style.md` — full English names, JSDoc
  on every function, `// why:` on non-obvious decisions.
- No randomness, no clocks, no network in the overlay — it is a
  deterministic pure-IO transform over local files.

**Packet-specific:**

- The marker token is exactly `[effect:<VillainEffectKeyword>]` where
  `<VillainEffectKeyword>` ∈ the five locked strings. WP-188 adds **no**
  new keyword; the script's local `VILLAIN_EFFECT_KEYWORDS` array is
  unchanged.
- `SUPPORTED_TIMINGS` becomes exactly `['ambush', 'fight', 'escape',
  'overrun']` — these four lowercase strings, this order. `escape` and
  `overrun` are distinct map keys; the engine-side collapse of both to
  `onEscape` is WP-186's concern, not the script's.
- The overlay stays **idempotent per-keyword** and **loud-fails** on
  unknown keyword / missing entity / zero-or-multiple matching timing
  lines — unchanged from WP-187. Escape cards with two `Escape:` lines
  (if any) loud-fail and go to `_unassigned` reason `multi-line`, same
  as the WP-187 multi-`Fight:` cards.
- **Match predicate unchanged** — `line.trimStart().toLowerCase()
  .startsWith(\`${timing}:\`)`. WP-188 must not alter `isTimingLine`;
  widening `SUPPORTED_TIMINGS` is sufficient because the predicate is
  already generic. Producer (script) and consumer (WP-186 parser) MUST
  agree on the predicate.
- **Append-only, canonical order** — markers trail the line (original
  text → existing markup → `[effect:]` tokens in
  `VILLAIN_EFFECT_KEYWORDS` order). No mid-text insert, no reflow, no
  text rewrite. Unchanged from WP-187.
- v1 curation marks only unconditional, magnitude-1, single-target
  escape lines (see Scope discipline). The each-player-KO cluster is
  **not** curatable in v1 and MUST go to `_unassigned`, not be forced
  onto `koHeroCurrentPlayer` (wrong semantics — current-player ≠
  each-player).
- WP-188 adds **no** engine/registry/server code and modifies **no**
  existing converter other than `apply-effect-markers.mjs`.

**Session protocol:**

- If a `--propose` escape candidate's semantics are ambiguous, leave it
  unmarked and record it in `_unassigned`. Do not guess. Do not stretch
  an each-player line onto a current-player keyword.
- If a real escape line needs the each-player-KO keyword, that is out of
  scope — record it `no-vocabulary-keyword` in `_unassigned`; the
  vocabulary expansion is a WP-185-side future WP.

**Locked marker vocabulary (mirrors WP-185 — do not re-derive):**

```
gainWoundEachPlayer
gainWoundCurrentPlayer
koHeroCurrentPlayer
heroDeckTopToEscape
captureBystander
```

**Locked timing gate (after WP-188):**

```
SUPPORTED_TIMINGS = ['ambush', 'fight', 'escape', 'overrun']
```

---

## Acceptance Criteria

- [ ] `apply-effect-markers.mjs` `SUPPORTED_TIMINGS` is exactly
  `['ambush', 'fight', 'escape', 'overrun']`; its `// why:` comment
  records WP-188 as the Escape/Overrun follow-on.
- [ ] An `escape` (or `overrun`) entry in `villain-effect-markers.json`
  no longer loud-fails the "unsupported timing" guard; apply-mode injects
  the marker onto the matched `Escape:` / `Overrun:` line.
- [ ] A re-run of `apply-effect-markers.mjs` produces a zero-line
  `git diff` (idempotency preserved across all four timings).
- [ ] `apply-effect-markers.mjs --propose` now lists `escape` / `overrun`
  candidate rows alongside ambush/fight (writes nothing).
- [ ] Existing `ambush` / `fight` markers from WP-187 are untouched
  (`grep -rc "\[effect:" data/cards/` ≥ the WP-187 baseline of 76, with
  the new escape markers added on top).
- [ ] `grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort -u` lists **only**
  the five locked keywords (no typo / unknown value introduced).
- [ ] At least one `Escape: Each player gains a Wound.` line carries
  `[effect:gainWoundEachPlayer]` after apply (spot-check the curatable
  subset).
- [ ] No each-player-KO escape line was marked `koHeroCurrentPlayer`;
  the each-player-KO cluster appears in `_unassigned` with
  `reason: "no-vocabulary-keyword"`.
- [ ] No magnitude>1 / conditional / compound escape line was marked
  (verified against `_unassigned`).
- [ ] `pnpm -r build` exits 0 (data-only change must not break builds).

---

## Verification Steps

```pwsh
# Apply the overlay (now including escape/overrun) and confirm a clean re-run
node scripts/convert-cards/apply-effect-markers.mjs
node scripts/convert-cards/apply-effect-markers.mjs
git diff --stat data/cards/   # expected: no changes on the second run

# All markers are vocabulary-clean (only the 5 locked strings)
grep -rhoE "\[effect:[^]]+\]" data/cards/ | sort | uniq -c

# Escape markers landed (gainWoundEachPlayer now has data — zero under WP-187)
grep -rhoE '"Escape:[^"]*\[effect:[a-zA-Z]+\]"' data/cards/ | head

# WP-187 markers preserved (ambush/fight still present)
grep -rc "\[effect:" data/cards/ | tail

# Propose mode now scans escape/overrun and writes nothing
node scripts/convert-cards/apply-effect-markers.mjs --propose | grep -E "escape|overrun" | head

# Loud-fail behaviors still hold (scratch-test a bogus keyword / missing card)

# Full monorepo build (data-only change)
pnpm -r build
```

Expected: the `uniq -c` output lists only the five locked keywords; the
second apply run shows no `data/cards/` diff; at least one `Escape:` line
carries `[effect:gainWoundEachPlayer]`; `--propose` prints escape/overrun
rows and leaves the tree clean; `pnpm -r build` exits 0.

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-188 Executed` block (gate
  widening, curated escape-line count, per-keyword counts, sets touched,
  `_unassigned` each-player-KO count).
- [ ] `docs/ai/DECISIONS.md` has D-18801..D-18803 (proposed):
  - D-18801: Escape/Overrun enrichment is the same `[effect:]` overlay
    as WP-187, gated open by widening `SUPPORTED_TIMINGS`; `escape` and
    `overrun` are distinct map keys (script matches by prefix) that
    WP-186 collapses to `onEscape`.
  - D-18802: the dominant escape effect ("each player KOs a Hero") is
    deferred to `_unassigned` (`reason: "no-vocabulary-keyword"`) because
    the MVP vocabulary has no each-player KO keyword; this cluster is the
    motivating candidate for a future WP-185-side `koHeroEachPlayer`
    vocabulary expansion.
  - D-18803: WP-188 finally gives `gainWoundEachPlayer` data (zero under
    WP-187, which found no unconditional wound lines on Ambush/Fight);
    escape "each player gains a Wound" lines are its first real source.
- [ ] `WORK_INDEX.md`: WP-188 row `[x]` with date; WP-186 row Hard-deps
  updated to include WP-188.
- [ ] `EC_INDEX.md`: EC-215 row Done.
- [ ] No files outside the §Files Expected to Change list were modified.

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §10 (Card-data semantics).

**Conflict assertion:** No conflict. WP-188 is a data-fidelity
enrichment that lets the engine (via WP-186) honor printed escape text
for the curatable subset. Curation is conservative; it never invents
mechanics and explicitly defers the each-player-KO pattern rather than
mis-mapping it.

**Non-Goal proximity check:** None of NG-1..NG-7 crossed. No
monetization, identity, or competitive surface; data-prep only.

**Determinism preservation:** The overlay is a deterministic pure-IO
transform; identical input map + identical card data → byte-identical
output. No `ctx.random`, no clocks. The enriched data is consumed
deterministically by the engine at setup time.

---

## Funding Surface Gate

N/A — card-data tooling WP; no §20.1 trigger surfaces (no navigation
funding affordance, no registry-viewer surface, no profile attribution,
no user-visible donate copy).

---

## API Catalog Update

N/A — no HTTP endpoints or `apps/server/src/**` library functions
added/modified/removed.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ (data prerequisite that unblocks WP-186's escape behavior) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-187 ✅ hard-dep; WP-185 vocab spec dep; WP-186 downstream) |
| 3 | Context (Read First) specific (paths + line numbers + precedents) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed | ✅ |
| 5 | Files Expected to Change matches contract | ✅ (1 modified script + 1 modified map + data regen + governance) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ |
| 7 | Acceptance Criteria testable | ✅ |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ |
| 9 | Definition of Done has binary gates | ✅ |
| 10 | Layer boundary preserved — data-tooling only, no engine/registry/server code | ✅ |
| 11 | Identity model N/A | N/A |
| 12 | Test rules — no `.test.ts`; matches ops-script convention (apply-effect-markers has none); loud-fail+idempotency are the guardrails | ✅ (justified) |
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

*Drafted: 2026-05-28. Baseline `origin/main @ cc29447`. Continuation of
WP-187 (same overlay + map). Upstream prerequisite for WP-186
(Escape/Overrun effect execution).*
