# WP-140 — Physical Card Phase 1b: Per-Set Patch Curation Across Remaining Split-Side Heroes

**Status:** Draft (drafted 2026-05-08; not yet executed; lint gate not yet
invoked — execution requires `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`
pass).
**Primary Layer:** Tooling (`scripts/convert-cards/inputs/patches/`) +
Registry data (`data/cards/*.json` regenerated).
**Dependencies:** WP-138 (Phase 1a — Done 2026-05-08; commit `763f84b`).
This WP consumes the 262-entry audit-warning worklist surfaced by
WP-138 Phase 1a's convert run.

**Supersedes:** none. Continues the locked Phase 1a → 1b → 2 → 3 sequence
defined by WP-138 §Migration Phasing.

---

## Session Context

WP-138 Phase 1a established the `PhysicalCard` registry abstraction and
landed the canonical reference patch for `bkwd / falcon-winter-soldier`
(3 split + 1 solo physicalCards summing to 14 deck instances). Solo
heroes auto-migrated to `physicalCards[]` via the convert-script's
solo-auto-path (D-13803 uniform model — one single-side physicalCard per
`cards[]` entry). Un-curated split-side heroes also fell through to
solo-auto-path under Phase 1a — **structurally valid** but
**semantically wrong**: deck size still over-counts because
`physicalCards[]` mirrors `cards[]` 1:1 instead of grouping the two
faces of each dual-faced card.

The convert-script emitted **262 audit warnings** during the Phase 1a
run: every paired-equal `cardCounts` pattern (two cards in the same
hero with matching count) lacking an explicit `physicalCards[]`
declaration. Each warning names the set, hero slug, count value, candidate
card names, and the patch file to edit. This worklist is the input to
Phase 1b.

The 262 candidates are not all true split pairs. Some are **independent
cards** whose count happens to match by coincidence (e.g., a hero whose
Common 1 and Common 2 both have count 5 in the source data, yet print on
two separate physical cards rather than two faces of one). Phase 1b must
distinguish:

- **True split pairs** — two cards printing on the front and back of one
  physical artifact (the Falcon/Winter Soldier pattern from WP-138's
  reference patch). Get an explicit `physicalCards[]` block in the
  set's patch file declaring the pair with `count` matching the
  per-side `cardCounts`.
- **False positives** — two independent cards whose count matches by
  coincidence. Get a declarative `_skipPair` annotation in the patch
  suppressing the warning so it does not block CI under
  `--strict` mode.

After Phase 1b lands every per-set patch (or `_skipPair` annotation),
`node scripts/convert-cards/convert-cards-v15.mjs --strict` exits 0 —
CI green-state restored. This is the precondition Phase 2 (WP-141)
needs to migrate engine + viewer consumers to read `physicalCards[]`
as authoritative deck composition without silently mis-tallying split
heroes.

### Worklist Freeze (mandatory)

At execution-session start, before any patch authoring:

1. Run the convert script and capture the audit-warning surface to a
   frozen worklist artifact:

   ```
   node scripts/convert-cards/convert-cards-v15.mjs 2>&1 \
     | grep -E "^  - Set" > docs/ai/session-context/wp-140-worklist.txt
   ```

2. Commit `wp-140-worklist.txt` as a session artifact under
   `docs/ai/session-context/` (per `.claude/rules/work-packets.md`
   §Invocation Artifacts — session-context files are committed).

3. All subsequent curation MUST be performed against this frozen file.
   The convert script MUST NOT emit any new warnings (relative to the
   frozen snapshot) at any intermediate point during execution; new
   warnings indicate either patch-authoring drift or upstream input
   change and must be investigated before continuing.

4. The frozen worklist is the audit surface that pairs with the
   per-hero resolution log (§Acceptance Criteria → Completeness Gate
   below).

5. **Worklist freeze integrity (byte-identity check).** Until the
   first patch is authored, re-running the convert command in step 1
   MUST produce output that is byte-identical to `wp-140-worklist.txt`.
   Any deviation (added, removed, or reordered lines) signals upstream
   input drift — `inputs/cards/*.js`, the convert script itself, or
   the apply-card-counts pipeline changed mid-session — and BLOCKS
   execution until the cause is identified and the worklist is either
   re-frozen or the upstream change reverted. After patch authoring
   begins, the byte-identity invariant relaxes (added warnings caused
   by the executor's own patch edits are expected); the no-new-warnings
   rule in step 3 takes over.

---

## Goal

After this packet:

1. Every paired-equal `cardCounts` pattern in the WP-138 audit-warning
   surface is **resolved** — either by an explicit `physicalCards[]`
   block declaring the split pair, or by a `_skipPair` annotation
   declaring the false positive.
2. The convert script exits 0 under `--strict` mode with **zero
   emitted audit warnings** for paired-equal patterns.
3. All 40 `data/cards/*.json` regenerated. Every previously-un-curated
   split hero now has correctly-grouped `physicalCards[]` entries
   (deck size matches the printed physical deck for that hero).
4. The `_skipPair` annotation grammar is locked at **D-13901**; the
   convert script reads the annotation and downgrades matching
   warnings from "candidate" to "explicitly skipped."
5. Engine + viewer source UNTOUCHED (Phase 2 boundary preserved).
6. Registry source UNTOUCHED (Phase 1a schema is the contract; Phase
   1b only authors data within it).

The Wolfsbane Night Vision / Wolf Out diagnostic that motivated the v16
cardSlug rename — and indirectly WP-138 — is **still not end-to-end
resolved** after Phase 1b lands; that requires Phase 2 (consumer
migration) and Phase 3 (R2 image rename). Phase 1b delivers the
correctly-grouped data; Phase 2 will start reading it.

---

## Assumes

- WP-138 (Phase 1a) executed and merged. `WORK_INDEX.md` shows
  `[x] WP-138 — ... Phase 1a — Done 2026-05-08 (Commit A 763f84b)`.
- All 40 `data/cards/*.json` carry populated `physicalCards[]` from
  WP-138's convert run (solo-auto-path for un-curated split heroes;
  reference grouping for `bkwd / falcon-winter-soldier`).
- `scripts/convert-cards/convert-cards-v15.mjs` v17 patch format
  (`hero.physicalCards[]` declaration block) is committed and
  consumed correctly. The `--strict` flag exits non-zero when
  audit warnings remain.
- `scripts/convert-cards/inputs/patches/README.md` (committed under
  WP-138 Commit A `763f84b`) documents the v17 `physicalCards[]`
  block format with the falcon-winter-soldier worked example.
- `pnpm --filter @legendary-arena/registry test` exits 0 with the
  WP-138 Phase 1a baseline `39 / 4 / 0`.
- `pnpm --filter @legendary-arena/game-engine test` exits 0 with the
  WP-138 Phase 1a baseline `698 / 150 / 0`.
- `docs/ai/DECISIONS.md` most recent decision is D-13806 (the last of
  WP-138's six) before this WP appends D-13901.

If any of the above is false this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/work-packets/WP-138-physical-card-abstraction-layer.md`
  §Migration Phasing — defines Phase 1b boundary; §H test-count lock
  is Phase 1a only; this WP adds zero registry tests.
- `scripts/convert-cards/inputs/patches/README.md` — v17 patch format
  reference; the falcon-winter-soldier worked example is the
  authoring template.
- `scripts/convert-cards/convert-cards-v15.mjs` — `buildPhysicalCards`
  function consumes `patch.heroes[].physicalCards[]` and emits
  warnings for un-curated paired-equal patterns. Read end-to-end
  before adding `_skipPair` parsing.
- `docs/ai/DECISIONS.md` — D-13801 (physicalCards authoritative),
  D-13802 (sort lock), D-13803 (uniform model), D-13805 (patches
  exclusively authoritative for split-pair declarations) — all locked
  by WP-138 and inherited by this WP.
- `.claude/rules/registry.md §Schema Authority` — the schema is NOT
  modified by this WP; this rule is a guard against scope creep.
- `.claude/rules/code-style.md` — applies to convert-script
  modifications (the `_skipPair` parsing addition).
- `docs/ai/REFERENCE/00.2-data-requirements.md` — canonical field
  names. `physicalCards[].id`, `count`, `imageUrl`, `sides[]`
  unchanged from WP-138.
- The 262-entry audit-warning output from WP-138 Phase 1a's convert
  run — the worklist input. Reproducible via
  `node scripts/convert-cards/convert-cards-v15.mjs 2>&1 | grep -E "^  - Set"`.

---

## Non-Negotiable Constraints

### Engine-wide (always apply — do not remove)

- Full file contents required for every new or modified file. No
  diffs, snippets, or "show only the changed section" output.
- ESM only; Node v22+ (`fetch` and `--env-file` are built-ins).
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`. No
  abbreviations; no `.reduce()` for multi-step logic; full-sentence
  error messages; descriptive loop variables.
- Determinism preserved. The convert script's outputs must be
  byte-identical across re-runs of identical input data. The
  `_skipPair` annotation must not introduce any non-deterministic
  emission.
- Layer-boundary preserved per `.claude/rules/architecture.md` —
  no engine, viewer, server, or schema modification under this WP.

### Packet-specific

- **Schema NOT modified.** `packages/registry/src/schema.ts` is not in
  scope. The `physicalCards[]` schema and `HeroSchema.superRefine`
  invariants from WP-138 are the contract; Phase 1b authors data
  within that contract.
- **Engine + viewer source NOT touched.** `packages/game-engine/`,
  `apps/registry-viewer/`, `apps/arena-client/`, `apps/server/` —
  all untouched. Verified via `git diff --stat` post-execution.
- **Patch authoring is per-set; no cross-set inference.** Each
  `physicalCards[]` declaration is curated against the printed
  card list for that specific hero. Auto-detection from heuristics
  remains forbidden by D-13805.
- **`_skipPair` annotation is the only false-positive escape hatch.**
  No silent suppression; every warning must produce either an
  explicit `physicalCards[]` block OR an explicit `_skipPair` entry.
  `_skipPair` explicitly asserts that an equal-`cardCounts` coincidence
  is NOT a physical pairing; encoding the assertion in the patch keeps
  negative knowledge co-located with the data it qualifies, instead of
  living as tribal memory in the convert script or executor's head.
- **No other annotations introduced.** This WP locks `_skipPair` only;
  any future annotation grammar (e.g., for triple-face cards if D-13802
  ceiling is ever raised) is a separate WP.
- **Drift validation continues to fire.** WP-138's `HeroSchema.superRefine`
  enforces the `sum(physicalCards counts) === cardCounts[sideName]`
  contract; every WP-140 `physicalCards[]` declaration must respect it.
- **Paired-equal candidate cluster (definition).** A "cluster" is the
  maximal set of two or more `cards[]` entries under the same hero
  that share the same `cardCounts` value AND that the convert script
  surfaces as candidate split-pair combinations. Clusters are
  identified BEFORE `_skipPair` filtering (deterministic execution
  order step 5 in §Scope B) and are treated as **atomic** for
  resolution purposes: the no-partial-resolution rule and the cluster
  coverage rule below both operate at cluster granularity, not at
  individual-pair granularity.
- **Cluster coverage rule (machine-enforced).** For each paired-equal
  candidate cluster, every member slug MUST appear in **exactly one**
  of: a `physicalCards[].sides` entry OR a `_skipPair` entry. Coverage
  is evaluated over the union of all `physicalCards[].sides` and all
  `_skipPair[]` entries for the hero. Any cluster member not covered
  by either structure fails conversion (full-sentence error naming the
  hero, the cluster's `cardCounts` value, and the uncovered slug).
  - For clusters of size = 2: one `physicalCards[]` block declaring
    the pair, OR one `_skipPair` entry. Either route fully covers the
    cluster.
  - For clusters of size > 2: the executor MAY split coverage across
    multiple disjoint `physicalCards[].sides` pairs, multiple
    `_skipPair` entries, or a mix — provided every cluster member is
    covered exactly once. (Worked example: 4 cards with `cardCounts =
    2` may resolve as 2 split pairs, OR 2 `_skipPair` entries covering
    every pair relationship, OR 1 split pair + 1 `_skipPair` entry —
    so long as all 4 slugs are accounted for under the cluster.)
- **No partial hero resolution.** Restated as the per-hero corollary
  of the cluster coverage rule: a hero with at least one cluster member
  resolved AND at least one cluster member uncovered fails conversion.
  Mixed states are rejected.
- **Slug mutual exclusion.** A given `cards[].slug` under a hero
  appears in `physicalCards[].sides` OR `_skipPair`, never both
  (consequence of the "exactly one" coverage rule). Within
  `_skipPair[]`, the same slug may participate in multiple pairs
  only if the pairs are structurally disjoint (no duplicate unordered
  2-set across entries); duplicate entries fail conversion.
- **`_skipPair` idempotency (output-shape invariant).** `_skipPair`
  affects audit-warning emission ONLY. It MUST NOT modify
  `physicalCards[]` synthesis output. Specifically, `_skipPair` does
  not influence `physicalCards[]` array structure, `physicalCard.id`
  generation, `physicalCard.count` values, or `imageUrl` derivation.
  Any output difference in `data/cards/*.json` between a run with
  `_skipPair` populated and the same run with the annotation removed
  (other than the warning suppression itself) is a conversion failure
  — prevents future scope creep where `_skipPair` accrues "smart skip"
  behaviour.

### Session protocol

- If a candidate's resolution is unclear (e.g., the upstream npm data
  doesn't make it obvious whether two equal-count cards are split-side
  faces or independent), **STOP** and record the candidate in the
  execution summary using the structured form:

  ```
  UNRESOLVED — NEED SOURCE VERIFICATION
    set:        <setAbbr>
    hero:       <heroSlug>
    candidate:  [<slugA>, <slugB>]
    reason:     <one-line cause: e.g. "no printed deck reference available">
  ```

  Do not guess. Do not author either a `physicalCards[]` block or a
  `_skipPair` entry on heuristic alone. The unresolved cluster blocks
  Phase 1b completion until source verification arrives.

### Locked contract values (inherited from WP-138)

- Solo physicalCard: `{setAbbr}-hr-{heroSlug}-{cardSlug}.webp`
- Split physicalCard: `{setAbbr}-hr-{heroSlug}-{sortedA}-{sortedB}.webp`
  (UTF-16 code-unit sort per D-13802; see D-13802 for the full
  forbidden list of locale-aware comparison APIs)
- `physicalCard.id` format: `^p\d+$`; deterministic + stable
  (declaration order in patch).
- `physicalCard.count`: positive integer; sum across sides matches
  `cardCounts[sideName]` per D-13801.
- `physicalCard.sides`: `1 <= length <= 2` invariant locked by
  WP-138 schema; this WP only emits 2-element sides arrays for
  curated split pairs.

---

## Scope (In)

### A) `_skipPair` annotation grammar (D-13901 to be locked at execution)

Patch file extension — per-hero optional `_skipPair[]` array
listing pairs of card slugs that share a coincidental matching
`cardCounts` value but are NOT split-side faces. Format:

```jsonc
{
  "_op": "merge",
  "slug": "example-hero",
  "_skipPair": [
    ["card-a-slug", "card-b-slug"],
    ["card-c-slug", "card-d-slug"]
  ],
  "cards": [ /* ... */ ]
}
```

Each entry is a 2-element array of card slugs. The convert script
reads `_skipPair` after applying the patch and downgrades any matching
audit warning from "candidate paired-equal pattern" to "skipped (false
positive)." Skipped pairs do NOT emit a warning under `--strict`.

#### `_skipPair` matching contract (D-13901 — normative)

The following rules are part of D-13901 and are enforced by the
convert script under §B below. They exist to remove every
implementation-detail ambiguity from the annotation:

- **Unordered 2-set semantics.** Each entry is treated as an unordered
  pair: `["a","b"]` matches the same audit candidate as `["b","a"]`.
- **Exact slug equality.** Matching is performed against literal
  `cards[].slug` strings. No case folding, Unicode normalization,
  whitespace stripping, or locale-aware comparison.
- **Length lock.** Each entry MUST have exactly 2 elements. Length-1
  or length-3+ entries fail conversion (full-sentence error naming
  the hero and the offending entry).
- **No duplicate entries.** Within a hero's `_skipPair[]`, no two
  entries may be the same unordered 2-set. Duplicate entries fail
  conversion (full-sentence error).
- **Existing-slug requirement.** Every slug in `_skipPair[]` must
  resolve to an existing `cards[].slug` under the same hero. Unknown
  slugs fail conversion with a full-sentence error naming the hero
  and the missing slug — same posture as orphan-side rejection in
  WP-138 §8.
- **Mutual exclusion with `physicalCards[]`.** A slug declared inside
  any `physicalCards[].sides` entry for the hero MUST NOT also appear
  in any `_skipPair` entry for the same hero. Violation fails
  conversion. (Restated from §Packet-specific constraints for
  proximity to the grammar definition.)

### B) Convert-script extension (`scripts/convert-cards/convert-cards-v15.mjs`)

- Read `patch.heroes[].physicalCards[]` and `patch.heroes[]._skipPair[]`.
- After per-hero `physicalCards[]` synthesis (the existing
  `buildPhysicalCards` function), filter audit warnings by
  `_skipPair`: if a candidate pair `(cardName_X, cardName_Y)` matches
  any `[slug_X, slug_Y]` entry in `_skipPair[]` (slug match against
  `cards[].slug`, unordered 2-set semantics per §A), drop the warning.
- Validate `_skipPair[]` per the §A matching contract before filtering:
  length lock, no-duplicate, existing-slug, and mutual-exclusion-with-
  `physicalCards[]` checks all run as hard failures. Any violation
  fails conversion before any warning suppression occurs.
- Enforce no-partial-resolution per §Packet-specific constraints: a
  hero with at least one resolved candidate (via `physicalCards[]` or
  `_skipPair`) and at least one unresolved candidate fails conversion.
- Emit a per-hero summary line when `_skipPair` is consumed:
  `📎 SkipPair: hero=<slug> pairs=<N> slugs=[(a,b),(c,d)]` so the
  convert log records the false-positive declarations explicitly,
  with the slug pairs inline for forensic audit (no need to re-open
  the patch file to confirm what was suppressed).
- Log line ordering MUST be deterministic to prevent noisy diffs
  across re-runs:
  - Within each pair, slugs are sorted by UTF-16 code-unit ordering
    (the same posture as D-13802's split-pair filename sort — no
    `localeCompare` without explicit `'en'` locale).
  - Across pairs in the `slugs=[...]` list, the unordered 2-sets are
    sorted by first element, then by second element (UTF-16
    code-unit ordering). This applies to the log-emission ordering
    only; it does NOT change the `_skipPair[]` literal ordering in
    the patch file (which the executor controls).

#### Deterministic execution order (per hero)

The `_skipPair` interaction with the existing audit-warning pipeline
is fully ordered to remove any implementation-detail ambiguity:

1. Load patch (`patch.heroes[N]`).
2. Validate `_skipPair[]` shape per §A matching contract.
3. Build `physicalCards[]` via existing `buildPhysicalCards` synthesis.
4. Validate slug mutual exclusion (`physicalCards[].sides` ∩
   `_skipPair[]` flat-slugs === ∅).
5. Identify the per-hero set of paired-equal candidate clusters.
6. Apply `_skipPair` filtering (drop matched candidates).
7. Validate no-partial-resolution (every cluster fully resolved or
   the hero fails conversion).
8. Emit remaining audit warnings (un-resolved candidates).
9. Apply `--strict` failure condition (any remaining warning → exit 1).

### C) Per-set patch curation (the worklist)

Iterate the 262-entry audit-warning worklist from WP-138 Phase 1a's
convert run. For each paired-equal candidate cluster (canonical
name per §Non-Negotiable Constraints — the maximal set of `cards[]`
under a hero sharing the same `cardCounts` value, surfaced by the
convert script as candidate split-pair combinations), the executor
makes one of two authoring choices per cluster member:

- **True split pair**: add a `physicalCards[]` block to the patch
  file with one or more 2-element `sides[]` entries grouping the
  faces. Counts must match per-side `cardCounts` per D-13801.
- **False positive**: add the pair's slugs to a `_skipPair[]` entry
  in the patch file.

Per-set scope (estimated from the worklist; final list determined at
execution by the actual convert-run output):

- `bkwd` — heroes other than `falcon-winter-soldier` (the Phase 1a
  reference). Approximate count: 0–2 (most bkwd heroes are solo).
- `mgtg` — entire MS-GotG hero roster is split-side per the WP-138
  scope analysis. Approximate count: 5–7 heroes.
- `msis` — partial split coverage. Approximate count: 3–5 heroes.
- `msmc` — partial split coverage. Approximate count: 1–3 heroes.
- `msp1` — partial split coverage. Approximate count: 2–4 heroes.
- `wpnx` — partial split coverage. Approximate count: 1–3 heroes.
- `wwhk` — partial split coverage. Approximate count: 1–3 heroes.
- `xmen` — partial split coverage. Approximate count: 2–4 heroes.

Plus several non-split sets (`3dtc`, `anni`, `antm`, `bkpt`, etc.)
that emit warnings for false-positive paired-equal patterns —
resolved exclusively via `_skipPair`.

The exact per-set scope is recorded in the execution session's pre-flight
when the executor runs the WP-138 convert script and freezes the worklist.

### D) Regenerated `data/cards/*.json` (40 files)

Re-running `node scripts/convert-cards/convert-cards-v15.mjs` after
patch authoring produces correctly-grouped `physicalCards[]` for every
previously-un-curated split hero. Solo heroes are unchanged from
WP-138. The 4 outlier sets (2099, amwp, wpnx, wtif) processed by
`apply-card-counts.mjs` continue to use solo-auto-path under Phase 1b
unless the executor explicitly extends that script too — but the
outliers are largely solo-hero territory and likely need few or zero
split-pair declarations.

### E) Per-set patch authoring discipline

Each `physicalCards[]` block declaration cross-references three
sources to authorize the grouping:

1. The printed card list for the hero (Marvel-published source —
   playtest verification or printed rules).
2. The upstream npm-derived `inputs/cards/*.js` (the source data the
   convert script consumes; per-side gameplay attributes live there).
3. The existing R2 image filename pattern (the v16 cardSlug rename
   surface; split-pair files from before the rename are the visual
   confirmation that two side slugs share one image).

Where source 1 is unavailable, the executor MUST stop and document
the gap. Pair declarations cannot be authored on heuristic alone per
D-13805.

**Forbidden inference signals (explicit enumeration of D-13805's
"heuristic alone").** The following signals MUST NOT, in isolation,
justify a `physicalCards[]` pair declaration:

- Card name similarity (shared prefix, shared keyword, alphabetical
  adjacency).
- Card type or subtype similarity (two Common-class cards, two
  Strength-themed cards, etc.).
- Artistic or thematic pairing assumptions ("these two clearly belong
  together because the character has a transformation arc").
- `cardCounts` value coincidence alone — this is the warning
  signal, not a justification.

Only the three sources above (printed deck list, upstream npm data
that explicitly encodes a per-side relationship, or the existing R2
split-pair filename pattern) may justify a declaration. If none of
the three resolves the candidate, the cluster is `UNRESOLVED — NEED
SOURCE VERIFICATION` per §Session protocol.

### F) Tests (Phase 1b only — locked count: 0 new tests in `packages/registry/`)

This WP adds **zero registry tests**. The `HeroSchema.superRefine`
drift / orphan / duplicate-membership invariants from WP-138 already
catch every authoring error class. Phase 1b authoring discipline is
verified by:

- The convert script exiting 0 under `--strict` mode (the integration
  gate).
- The existing WP-138 registry tests passing against every regenerated
  set (drift / orphan / duplicate enforcement on real curated data).
- A new convert-script self-test for `_skipPair` annotation handling
  (one test added inline to the convert script's existing test
  surface, OR a new shell-level integration test if no convert-script
  test surface exists yet — executor decides at session start).

The registry baseline shift target: **`39 / 4 / 0` UNCHANGED** (no
schema test additions). The engine baseline shift target:
**`698 / 150 / 0` UNCHANGED** (no engine source touched).

---

## Out of Scope

**Deferred to Phase 2 follow-up WP-141:**

- Engine consumer migration (`buildHeroDeck.ts` reads
  `physicalCards[].count`; `buildCardDisplayData.ts` reads
  `physicalCards[].imageUrl`).
- Viewer consumer migration in `apps/registry-viewer/src/`.
- Replay-hash regeneration cascade (will fire when WP-141 changes
  `G.heroDeck` contents).
- The open D-13804 design question for `G.heroDeck` split-side
  representation (single-side ext_id stand-in vs. both-side + flip
  tracking vs. `physicalInstanceId` channel).

**Deferred to Phase 3 follow-up WP-142:**

- `HeroCardSchema.imageUrl` removal from the schema.
- R2 image rename pass (split-pair files renamed to combined-name
  pattern; legacy per-side files deleted).
- Final regeneration of `data/cards/*.json` without per-side `imageUrl`.

**Out of scope at the WP-140 packet level (no follow-up planned):**

- Schema modification of any kind (`packages/registry/src/schema.ts`
  unchanged).
- Engine, viewer, arena-client, or server source modification of any
  kind.
- Auto-detection of split pairs from `cardCounts` heuristics (D-13805
  forbids; this WP authors pairs explicitly via the v17 patch format).
- `physicalInstanceId` ext_id channel introduction (D-13804 defers).
- Replay-record schema extensions (separate WP).
- Triple-face card support (D-13802 ceiling lock requires a separate
  DECISIONS entry).

---

## Files Expected to Change

**Tooling**:

- `scripts/convert-cards/convert-cards-v15.mjs` — modified — add
  `_skipPair` annotation parsing per D-13901; filter audit warnings
  by `_skipPair`; emit `📎 SkipPair: hero=<slug> count=<N>` summary
  line.
- `scripts/convert-cards/inputs/patches/README.md` — modified — add
  v18 section documenting `_skipPair` annotation format with worked
  example.

**Per-set patches** (modified — explicit list determined at
execution session by the worklist):

- `scripts/convert-cards/inputs/patches/bkwd.patch.json` — modified
  if any non-falcon-winter-soldier split heroes surface
- `scripts/convert-cards/inputs/patches/mgtg.patch.json` — modified
- `scripts/convert-cards/inputs/patches/msis.patch.json` — modified
- `scripts/convert-cards/inputs/patches/msmc.patch.json` — modified
- `scripts/convert-cards/inputs/patches/msp1.patch.json` — modified
- `scripts/convert-cards/inputs/patches/wpnx.patch.json` — modified
- `scripts/convert-cards/inputs/patches/wwhk.patch.json` — modified
- `scripts/convert-cards/inputs/patches/xmen.patch.json` — modified
- Plus `_skipPair` additions to other sets' patches (`3dtc`, `anni`,
  `antm`, `bkpt`, `chmp`, `dead`, `dkcy`, etc.) where false positives
  surface — exact list determined at execution session.

**Regenerated data** (40 files):

- `data/cards/*.json` — regenerated via re-run of
  `convert-cards-v15.mjs` + `apply-card-counts.mjs` after patch
  authoring.

**Governance ledgers**:

- `docs/ai/DECISIONS.md` — D-13901 appended (`_skipPair` annotation
  grammar; matching contract per §Scope A).
- `docs/ai/work-packets/WORK_INDEX.md` — WP-140 row Draft → Done on
  completion.
- `docs/ai/execution-checklists/EC_INDEX.md` — corresponding EC slot
  (claimed at execution) Draft → Done.
- `docs/ai/STATUS.md` — session-close block prepended.

**Session artifact** (committed per `.claude/rules/work-packets.md`
§Invocation Artifacts):

- `docs/ai/session-context/wp-140-worklist.txt` — frozen audit-warning
  surface captured at session start (per §Session Context →
  Worklist Freeze).

**Explicitly NOT modified**:

- `packages/registry/src/schema.ts`
- `packages/registry/src/impl/{localRegistry,httpRegistry}.ts`
- `packages/registry/src/registry.smoke.test.ts`
- `packages/game-engine/**`
- `apps/registry-viewer/**`
- `apps/arena-client/**`
- `apps/server/**`
- `scripts/convert-cards/migrate-renamed-to-v16.mjs` (Phase 3
  scope)
- `docs/ai/REFERENCE/api-endpoints.md` — no expected change (no HTTP
  surface added or modified, per D-11804 obligation gate).

---

## Acceptance Criteria

### Convert pipeline

- `node scripts/convert-cards/convert-cards-v15.mjs` (without `--strict`)
  exits 0 with **zero remaining audit warnings** for un-curated split
  patterns. Every WP-138 Phase 1a candidate is now either resolved
  (declared `physicalCards[]`) or suppressed (`_skipPair` annotation).
- `LEGENDARY_CONVERT_STRICT=1 node scripts/convert-cards/convert-cards-v15.mjs`
  exits **0** (CI green-state restored — this is the inverse of WP-138
  Phase 1a's expected `--strict` exit-1 posture).
- `node scripts/convert-cards/apply-card-counts.mjs` exits 0; the four
  outlier sets are unchanged from Phase 1a unless they had
  paired-equal candidates.

### Patch curation correctness

- Every previously-un-curated split-side hero now has a curated
  `physicalCards[]` block in its set's patch file. The grouping
  matches the printed physical deck (e.g., for a hero with 7 cards
  printing as 3 split pairs + 1 solo, the `physicalCards[]` length is 4).
- `physicalCards[].count` values sum per-side to match
  `cardCounts[sideName]` per D-13801. The convert-script's drift
  validation passes for every curated hero.
- Every `_skipPair` annotation references existing `cards[].slug`
  values under the hero (no orphan slugs).

### Completeness gate

- **Zero remaining paired-equal candidate clusters** across all heroes
  in all 40 sets. Every cluster surfaced by the WP-138 Phase 1a
  convert run is fully resolved.
- No hero contains a paired-equal candidate cluster without every
  member resolved via `physicalCards[]` grouping OR `_skipPair`
  annotation. The frozen
  worklist (`docs/ai/session-context/wp-140-worklist.txt`) is the
  authoritative cross-check: every line in the worklist maps 1:1 to
  either a `physicalCards[]` block declaration or a `_skipPair` entry
  in the executed commit.
- No hero is partially resolved (per §Packet-specific constraints —
  the convert script enforces this; this criterion restates the
  end-state expectation).
- No `UNRESOLVED — NEED SOURCE VERIFICATION` cluster remains in the
  execution summary at completion. If any does, the WP is BLOCKED
  and may not be marked Done.

### Drift / invariant compliance

- Registry tests pass: `pnpm --filter @legendary-arena/registry test`
  exits 0 with `39 / 4 / 0` UNCHANGED — every regenerated `data/cards/*.json`
  passes `HeroSchema.superRefine` (drift / orphan-side /
  duplicate-membership invariants from WP-138 §8 + §9 + drift).
- Engine tests pass: `pnpm --filter @legendary-arena/game-engine test`
  exits 0 with `698 / 150 / 0` UNCHANGED — engine source is not
  touched.

### Scope enforcement

- `git diff --stat packages/game-engine/ apps/registry-viewer/ apps/arena-client/ apps/server/ packages/registry/`
  empty post-execution. WP-140 is patches + tooling + data only.
- `git diff --stat scripts/convert-cards/migrate-renamed-to-v16.mjs`
  empty (Phase 3 scope respected).
- No `Math.random()` or `Date.now()` introduced anywhere.
- No new dependencies in `package.json`.

### Image filename invariants (inherited from WP-138)

- For every newly-curated split physicalCard, `imageUrl` is
  `{setAbbr}-hr-{heroSlug}-{sortedA}-{sortedB}.webp` (UTF-16 sort).
- Solo physicalCards continue to use
  `{setAbbr}-hr-{heroSlug}-{cardSlug}.webp` unchanged.

---

## Verification Steps

```
# Step 1 — registry build (sanity; no schema change)
pnpm --filter @legendary-arena/registry build
# Expected: exits 0

# Step 2 — registry tests UNCHANGED at WP-138 Phase 1a baseline
pnpm --filter @legendary-arena/registry test
# Expected: 39 / 4 / 0; matches post-WP-138 baseline exactly.
# Drift / orphan / duplicate invariants pass against every regenerated set.

# Step 3 — engine tests UNCHANGED (no engine source touched)
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test
# Expected: 698 / 150 / 0 UNCHANGED.

# Step 4 — convert pipeline exits 0 with zero remaining warnings
node scripts/convert-cards/convert-cards-v15.mjs
# Expected: zero audit warnings; per-hero `📎 Pair:` summary lines for
# every curated split hero; `📎 SkipPair: hero=<slug> pairs=<N>
# slugs=[(a,b),...]` summary lines for every false-positive declaration
# (slug pairs inline for forensic audit).

# Step 5 — strict mode exits 0 (CI green-state restored)
LEGENDARY_CONVERT_STRICT=1 node scripts/convert-cards/convert-cards-v15.mjs
# Expected: exit 0. This is the Phase 1b acceptance gate — the inverse
# of WP-138 Phase 1a's expected `--strict` exit-1 posture.

# Step 6 — apply-card-counts unchanged
node scripts/convert-cards/apply-card-counts.mjs
# Expected: exits 0; outlier sets pass through.

# Step 7 — confirm engine + viewer scope-clean
git diff --stat packages/game-engine/ apps/registry-viewer/ apps/arena-client/ apps/server/ packages/registry/
# Expected: empty.

# Step 8 — confirm migrate-renamed-to-v16.mjs untouched
git diff --stat scripts/convert-cards/migrate-renamed-to-v16.mjs
# Expected: empty.

# Step 9 — sample split-hero shape (e.g., mgtg/star-lord — replace with
# an actual curated hero from the worklist)
node -e "const r = require('./data/cards/mgtg.json'); const h = r.heroes.find(x => x.slug === 'star-lord'); console.log(h.physicalCards.length, h.cards.length, h.physicalCards.reduce((a, c) => a + c.count, 0));"
# Expected: physicalCards.length matches the printed deck (split + solo);
# cards.length matches the per-side count; sum count matches the printed
# deck size.

# Step 10 — _skipPair sample (e.g., 3dtc/howard-the-duck — replace with
# an actual annotated hero)
node -e "const r = require('./data/cards/3dtc.json'); const h = r.heroes.find(x => x.slug === 'howard-the-duck'); console.log(h.physicalCards.length, h.cards.length, h.physicalCards.every(p => p.sides.length === 1));"
# Expected: physicalCards.length === cards.length; every entry sides.length === 1
# (the false-positive hero remains solo-shaped after _skipPair suppresses
# the warning).

# Step 11 — unresolved-cluster sanity check (Completeness Gate)
grep -n "UNRESOLVED — NEED SOURCE VERIFICATION" docs/ai/STATUS.md docs/ai/session-context/wp-140-worklist.txt
# Expected: zero matches before marking WP complete. Any match BLOCKS
# the WP per §Acceptance Criteria → Completeness Gate.

# Step 12 — _skipPair idempotency sanity check (output-shape invariant)
# Pick one hero with a curated _skipPair entry. Temporarily remove the
# entry, re-run convert, and diff the resulting set's data file against
# the executed-state version. The ONLY difference should be the audit
# warning (re-)appearing in the convert log; the data/cards/<set>.json
# file itself MUST be byte-identical.
# Expected: empty diff under `git diff data/cards/<set>.json` after
# restoring the _skipPair entry.
```

---

## Definition of Done (Phase 1b)

1. WP-140 row in `WORK_INDEX.md` flipped to **Done** with the executing
   commit hash.
2. EC slot row in `EC_INDEX.md` flipped to **Done** (slot claimed at
   execution).
3. **D-13901 appended** to `docs/ai/DECISIONS.md` (the `_skipPair`
   annotation grammar — at draft time this is a placeholder; locked at
   execution session).
4. All 40 `data/cards/*.json` regenerated; every previously-un-curated
   split-side hero now has correctly-grouped `physicalCards[]`.
5. `--strict` mode exits 0 (Phase 1b acceptance gate; the inverse of
   WP-138 Phase 1a's expected `--strict` exit-1 posture).
6. **Engine + viewer + registry-source baselines UNCHANGED** —
   confirmed by `git diff --stat`.
7. **Schema UNTOUCHED** — `packages/registry/src/schema.ts` not in diff.
8. **STATUS.md updated** with the Phase 1b execution summary.
9. 01.6 post-mortem authored (mandatory per WP §Definition of Done item
   8 — high-touch curation across ~24 patches; first use of `_skipPair`
   annotation locks the false-positive escape-hatch grammar; Phase 1b
   completion unblocks Phase 2 — three triggers).
10. Lint gate (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) passed
    at this packet's execution-session start.

---

## Vision Alignment

> Vision §1, §2, §10 (Card content semantics), §3 (Determinism,
> Fairness, Replay Faithfulness). NG-1..7 not crossed.

- **Vision clauses touched:** §1, §2, §10 — every previously-un-curated
  split-side hero gains a correctly-grouped `physicalCards[]` block;
  card data semantics are now structurally correct end-to-end. §3 —
  determinism strengthened via the convert-script's `_skipPair`
  filtering being byte-deterministic across re-runs of identical
  input data.
- **Conflict assertion:** No conflict — this WP authors data within
  the WP-138 Phase 1a contract; no schema or engine change. All touched
  clauses preserved.
- **Non-Goal proximity check:** None of NG-1..7 crossed. This WP is
  registry data + tooling only; no monetization, paid surface,
  persuasive copy, competitive-ranking surface, or social/social-graph
  affordance.
- **Determinism preservation:** Confirmed. The `_skipPair` filtering
  is set-membership match against literal slug strings — no comparator,
  no locale, no ordering dependency. Re-runs against unchanged inputs
  produce byte-identical `data/cards/*.json` output. The 0/1 strict
  exit code is fully determined by patch authorship state.

---

## Funding Surface Gate

N/A — this WP touches no funding affordance, no global navigation, no
profile / account funding attribution surface, no tournament-funding
channel integration, and no user-visible copy referencing donate /
support / tournament-funding. The artifact is a per-set patch curation
data extension; no UI surface is added or modified by this packet.

---

## API Catalog Update

N/A per D-11804 — this WP touches no `apps/server` HTTP endpoint,
registers no new route, modifies no existing endpoint, removes no
endpoint, and adds no `apps/server/src/**` library function. The
change is confined to `scripts/convert-cards/` and `data/cards/`. The
catalog file `docs/ai/REFERENCE/api-endpoints.md` is not modified.

---

## Notes on the Lint Gate

This document is a **draft**. Per `.claude/CLAUDE.md §Lint Gate`,
executing WP-140 — landing the patch curation, the `_skipPair`
annotation grammar, and the regenerated data — requires the Prompt
Lint Gate (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) to be
satisfied first. The lint gate is not invoked at draft-time; it is
invoked at session start by the executing session.

§17 Vision Alignment present with clause numbers + determinism line.
§20 Funding Gate N/A with one-line justification. §21 API Catalog N/A
with one-line justification. §1 structural sections all present.
§2 Non-Negotiable Constraints block carries Engine-wide + Packet-specific
+ Session protocol + Locked contract values. §5 Files Expected to Change
lists every file to be created or modified (per-set patch list is
inherently variable; the v17 patch format and exact worklist are
frozen at execution session start). §13 Verification Steps include
exact commands with expected output.

If any lint item cannot be satisfied at execution, that session must
STOP and re-scope this WP rather than proceed.
