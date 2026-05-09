# WP-141 — Physical Card Phase 2: Engine + Viewer Consumer Migration

**Status:** Draft (drafted 2026-05-08; not yet executed; lint gate not yet
invoked — execution requires `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`
pass).
**Primary Layer:** Game Engine (`packages/game-engine/src/setup/`,
`packages/game-engine/src/economy/`) + Registry Viewer
(`apps/registry-viewer/src/`).
**Dependencies:** WP-138 (Phase 1a — Done 2026-05-08; commit `763f84b`),
**WP-140 (Phase 1b — must land first; engine cannot trust `physicalCards[]`
for split heroes until every split hero is curated and `--strict` exits 0)**.

**Supersedes:** none. Continues the locked Phase 1a → 1b → 2 → 3 sequence
defined by WP-138 §Migration Phasing.

---

## Session Context

WP-138 Phase 1a (commit `763f84b`) established `PhysicalCard` as the
authoritative deck-composition primitive (D-13801) without migrating
any consumer. WP-140 Phase 1b will land patches for every remaining
split-side hero, making `physicalCards[]` semantically correct
end-to-end. WP-141 Phase 2 is the consumer-migration boundary — engine
and viewer code switch from reading per-side `cards[].imageUrl` and
summed-side `cardCounts` to reading the new `physicalCards[]` primitive
via the runtime `getPhysicalCardForSide(heroSlug, sideSlug)` lookup
(D-13806).

The defect WP-138 Phase 1a left visible: deck size for split-side
heroes is still wrong at the engine layer. Falcon/Winter Soldier's
`buildHeroDeck` reservoir computes `5 + 5 + 5 + 5 + 3 + 3 + 1 = 27`
card-instances from per-side `cardCounts` (via the WP-137
`resolveHeroCardCopyCount` fan-out). The physical deck is **14 cards**.
WP-141 fixes this by switching the deck-reservoir math source from
`cardCounts` to `physicalCards[].count`.

The WP also resolves the open D-13804 design question: how
`G.heroDeck: CardExtId[]` represents split-side instances. Three
candidates from the WP-138 §Out of Scope deferral list:

- **(A)** Single side ext_id stand-in per physical card slot. Look up
  the owning physicalCard via `getPhysicalCardForSide()` at projection
  time. Defer "which side was played" to move-time data.
- **(B)** Both side ext_ids stored together with a flip-tracking
  adjunct in `G` (analogous to `G.cardStats` / `G.cardDisplayData`
  sibling-snapshots).
- **(C)** New `physicalInstanceId` channel parallel to per-side ext_id;
  `G.heroDeck` carries `instanceId` values; per-side ext_id resolves
  to a side at play time.

The WP-141 lock is **(A)** under D-13807. Reasoning:

1. Per-side ext_id grammar (D-13502, preserved by D-13804) is already
   the canonical game-record identifier — no new channel needed.
2. `CardExtId = string` alias rule preserved verbatim.
3. Layer boundary respected (physical-card identity is registry data,
   not engine state).
4. Options B and C duplicate ext_id information without advancing the
   replay-record contract — better deferred to whichever future WP
   migrates replay records to `{ cardId, sidePlayed }` schema (out of
   scope for WP-141 per WP-138 §Out of Scope).

The replay-hash regeneration cascade fires at execution. `G.heroDeck`
length and content shift for split heroes (e.g., Falcon/Winter Soldier
27 → 14 ext_ids); `computeStateHash` inputs change. Per WP-135 / WP-137
cascade template, the literal `PRE_WP080_HASH = '2baeecc3'` at
`packages/game-engine/src/replay/replay.execute.test.ts:54` requires
regeneration. **01.5 IS INVOKED** at execution per
`docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md` — this WP changes
runtime-visible structure (`G.heroDeck` content for split heroes) and
requires minimal wiring edits to existing tests that assert on deck
contents.

After WP-141 lands, `HeroCardSchema.imageUrl` becomes orphaned (no
production reader) — the precondition Phase 3 (WP-142) needs to
remove the field cleanly.

---

## Goal

After this packet:

1. Every engine site reading `card.imageUrl` switches to
   `getPhysicalCardForSide(heroSlug, sideSlug).imageUrl`. The
   `grep -rn 'card\.imageUrl' packages/game-engine/src/` acceptance
   gate returns zero matches outside test fixtures.
2. `buildHeroDeck.ts` computes the deck reservoir from
   `physicalCards[].count` (sum across the hero's physicalCards),
   not from per-side `cardCounts` summed via
   `resolveHeroCardCopyCount`. The WP-137 helper continues to exist
   for per-card copy counts within a single physicalCard but is no
   longer the deck-reservoir source.
3. Split-hero deck size is structurally correct end-to-end.
   Falcon/Winter Soldier reservoir = 14 ext_ids (was 27). Solo heroes
   are unchanged (count of per-side ext_ids === count of physicalCards
   under the D-13803 uniform model).
4. Every viewer site reading per-side `card.imageUrl` switches to
   `getPhysicalCardForSide()` lookup at registry-projection time.
   The `grep -rn 'card\.imageUrl' apps/registry-viewer/src/`
   acceptance gate returns zero matches outside test fixtures.
5. **D-13807 locked**: `G.heroDeck` split-side instances use Option A
   (single-side ext_id stand-in); per-side ext_id grammar D-13502
   unchanged.
6. **D-13808 locked**: Deck-size arithmetic source switches to
   `physicalCards[].count`. The three former fan-out sites
   (`buildHeroDeck.ts`, `economy.logic.ts:buildCardStats`,
   `buildCardDisplayData.ts`) read `physicalCards[]` instead of
   summing per-side `cardCounts`.
7. **D-13810 locked**: Viewer imageUrl lookup pattern uses
   `getPhysicalCardForSide()` at projection time in
   `apps/registry-viewer/src/registry/shared.ts`; per-side
   `card.imageUrl` reads removed.
8. The replay-hash regeneration cascade is captured: pre-edit
   `PRE_WP080_HASH` recorded; post-edit value installed; literal
   updated in lockstep. The WP-138 §3 determinism preservation
   posture for split heroes is now end-to-end functional.
9. `HeroCardSchema.imageUrl` STAYS in the schema under Phase 2 (Phase
   3 / WP-142 removes it after this WP's grep gate clears).

---

## Assumes

- WP-138 (Phase 1a) executed and merged at commit `763f84b`.
- **WP-140 (Phase 1b) executed and merged.** `WORK_INDEX.md` shows
  `[x] WP-140 — Physical Card Phase 1b — Done <date> (commit <hash>).`
  `node scripts/convert-cards/convert-cards-v15.mjs --strict` exits 0.
  Every split-side hero across all 40 sets has correctly-grouped
  `physicalCards[]` entries.
- All 40 `data/cards/*.json` carry semantically-correct
  `physicalCards[]` (no solo-auto-path output for split heroes).
- `pnpm --filter @legendary-arena/registry test` exits 0 with the
  WP-138 baseline `39 / 4 / 0` UNCHANGED.
- `pnpm --filter @legendary-arena/game-engine test` exits 0 with the
  WP-138 baseline `698 / 150 / 0` UNCHANGED.
- `docs/ai/DECISIONS.md` most recent decision is at minimum D-13901
  (WP-140's `_skipPair` annotation grammar) before this WP appends
  D-13807 / D-13808 / D-13810. (Numbering is non-contiguous because
  WP-140 lands D-139xx-class entries between WP-138's D-13801..D-13806
  and this WP's D-13807..D-13810 — the gap is acceptable per
  the project's locked DECISIONS append-only convention.)

If any of the above is false this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/work-packets/WP-138-physical-card-abstraction-layer.md`
  §Migration Phasing — Phase 2 boundary contract.
- `docs/ai/work-packets/WP-140-physical-card-phase-1b-patch-curation.md`
  — `_skipPair` annotation grammar; full split-hero coverage
  precondition.
- `docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md` — invoked at
  execution; minimal-wiring edits to existing tests asserting on
  `G.heroDeck` deck-size literals are permitted.
- `docs/ai/DECISIONS.md` — D-13501 (rarity → copy-count map; fallback
  preserved), D-13502 (per-side ext_id grammar; preserved by D-13804),
  D-13701 (cardCounts authoritative when populated; this WP shifts
  D-13701's role to derived view), D-13702 (per-copy `#<copyIndex>`
  suffix; preserved at execution), D-13801..D-13806 (WP-138 contract).
- `packages/registry/src/schema.ts` — `HeroSchema.physicalCards`,
  `PhysicalCardSchema`, `HeroSchema.superRefine` invariants. Read
  end-to-end before consumer migration.
- `packages/registry/src/impl/{localRegistry,httpRegistry}.ts` — the
  `sideToPhysicalCard` runtime cache (D-13806) and the
  `getPhysicalCardForSide(heroSlug, sideSlug)` lookup. Read
  end-to-end before invoking from the engine.
- `packages/game-engine/src/setup/buildHeroDeck.ts` — current
  reservoir math. Read end-to-end. The `resolveHeroCardCopyCount`
  helper exported from this file is consumed by two siblings; the
  deck-reservoir loop is the migration target.
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — two
  production read sites for `card.imageUrl`. Read end-to-end.
- `packages/game-engine/src/economy/economy.logic.ts` —
  `buildCardStats` consumes `resolveHeroCardCopyCount`. Read end-to-end.
- `packages/game-engine/src/replay/replay.execute.test.ts:54` — the
  `PRE_WP080_HASH = '2baeecc3'` literal regenerated under this WP.
- `apps/registry-viewer/src/registry/shared.ts` — 9 production read
  sites for per-side `card.imageUrl` across henchman / mastermind /
  scheme / villain / sidekick projection branches.
- `apps/registry-viewer/src/components/CardDetail.vue` and
  `CardGrid.vue` — Vue components reading per-side `card.imageUrl`.

---

## Non-Negotiable Constraints

### Engine-wide (always apply — do not remove)

- Full file contents required for every new or modified file. No
  diffs, snippets, or "show only the changed section" output.
- ESM only; Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- Determinism non-negotiable. All randomness via `ctx.random.*`; no
  `Math.random()`, `Date.now()`, wall-clock reads, filesystem, network,
  or environment access in moves, phases, or effects.
- Zone storage rule preserved: `G.heroDeck` and every other zone
  stores `CardExtId` strings only. The single-side ext_id stand-in
  per D-13807 keeps this rule literal.
- Layer-boundary preserved per `.claude/rules/architecture.md`.
- No `.reduce()` for multi-step branching logic in zone operations or
  effect application.
- `// why:` comments required at every `ctx.events.setPhase()` or
  `ctx.events.endTurn()` call (none expected to be added by this WP;
  this is a guard).

### Packet-specific

- **Per-side ext_id grammar D-13502 unchanged.** `<setAbbr>/<heroSlug>/<cardSlug>`
  plus the `#<copyIndex>` suffix from WP-137 D-13702 is the canonical
  identifier. WP-141 does NOT introduce a `physicalInstanceId` channel.
- **Single-side ext_id stand-in per D-13807** (the new decision locked
  at execution). `G.heroDeck` carries one ext_id per physicalCard
  instance; for split heroes that ext_id corresponds to one of the two
  faces (canonically the first side per D-13807's tie-breaker rule —
  to be explicitly locked at execution; recommendation: alphabetical
  side-slug ordering or `physicalCard.sides[0]` order).
- **Deck-size arithmetic source switches to `physicalCards[].count`
  (D-13808).** The three former fan-out sites read `physicalCards[]`.
  `resolveHeroCardCopyCount` continues to exist for per-card copy
  counts within a single physicalCard (the rarity-fallback path) but
  is no longer the deck-reservoir source.
- **`HeroCardSchema.imageUrl` STAYS in the schema.** Phase 3 (WP-142)
  removes it; this WP only stops reading it.
- **No new exports beyond what the migration requires.** No
  speculative helpers; no abstractions for hypothetical future use.
- **No engine-side cache of physical-card lookups.** The registry's
  `sideToPhysicalCard` cache (D-13806) is the sole lookup path.
  Caching at the engine layer would create a parallel state surface.
- **Move logic NOT changed.** The split-side hero's "which face is
  played" decision is move-time data and is out of scope for this WP
  per WP-138 §Out of Scope (deferred to a future WP that adopts
  `{ cardId, sidePlayed }` replay records). Phase 2 ships with
  whatever face the single-side ext_id stand-in encodes; the
  player-choice surface lands later.

### Session protocol

- If the replay-hash literal does not regenerate cleanly (e.g., the
  WP-135 / WP-137 cascade procedure produces a hash that does not
  match across runs), STOP and document the failure mode. Do not
  force-fit.
- If a viewer site fails to resolve `getPhysicalCardForSide()` for a
  hero in test fixtures, STOP and verify Phase 1b coverage for that
  hero before proceeding.

### Locked contract values

- D-13807 (to be locked at execution): `G.heroDeck` split-hero
  representation = single-side ext_id stand-in (Option A from D-13804
  three-option deferral); recommendation: use `physicalCard.sides[0]`
  (declaration order) as the canonical face. Tie-breaker rule frozen at
  execution session start.
- D-13808 (to be locked at execution): Deck-size arithmetic source
  = `physicalCards[].count`. The three fan-out sites
  (`buildHeroDeck.ts`, `economy.logic.ts:buildCardStats`,
  `buildCardDisplayData.ts`) read `physicalCards[]`.
- D-13810 (to be locked at execution): Viewer imageUrl lookup pattern
  = `getPhysicalCardForSide()` at projection time in
  `apps/registry-viewer/src/registry/shared.ts`. Per-side
  `card.imageUrl` reads removed; the schema field stays (Phase 3
  removes it).

---

## Scope (In)

### A) Engine: `buildHeroDeck.ts` deck-reservoir migration

- Replace the per-side `cardCounts` summation loop with a per-physicalCard
  `physicalCards[].count` summation loop.
- For each physicalCard: emit `count` ext_ids using
  `physicalCard.sides[0]` as the canonical face slug per D-13807;
  attach the `#<copyIndex>` suffix per D-13702 (preserved).
- `resolveHeroCardCopyCount` continues to exist for per-card copy
  count fallback (rarity → count map per D-13501) — but is no longer
  the deck-reservoir source. The exported helper signature remains
  unchanged for backward compatibility with `economy.logic.ts` and
  `buildCardDisplayData.ts` consumers.
- Per-hero invariant test: `G.heroDeck.filter(extId =>
  extId.startsWith(\`<setAbbr>/<heroSlug>/\`)).length ===
  sum(physicalCards[].count)` for every hero in the seeded fixture.

### B) Engine: `buildCardDisplayData.ts` imageUrl migration

- The 2 production read sites for `card.imageUrl` switch to
  `getPhysicalCardForSide(heroSlug, card.slug).imageUrl`.
- Fallback path (`typeof card.imageUrl === 'string' ? ... : ''`)
  removed — `getPhysicalCardForSide()` returns `undefined` for orphan
  resolution; treat that as a registry data integrity error and emit
  a deterministic full-sentence warning to `console.warn` (NOT a
  throw; warnings only per the registry's existing health-report
  convention). The fallback returns the empty string for the missing
  case, identical to the prior behavior.
- The per-side fan-out via `resolveHeroCardCopyCount` continues
  (per-card copy count is unchanged); only the imageUrl lookup
  surface changes.

### C) Engine: `economy.logic.ts:buildCardStats` deck-size source

- Hero card stats summation switches from per-side `cardCounts` math
  to `physicalCards[].count` math.
- The per-card-copy fan-out (each physicalCard's `count` becomes that
  many `cardStats` entries with `#<copyIndex>` suffix per D-13702)
  preserves the WP-137 invariant that `G.cardStats` carries one entry
  per deck instance.

### D) Engine: replay-hash regeneration cascade

- Capture pre-edit `PRE_WP080_HASH` value via a one-line console
  print added temporarily to `replay.execute.test.ts` (recorded in
  the post-mortem; reverted in the same commit).
- Run engine tests; capture the post-edit hash from the failure
  message.
- Update the literal at line 54 to the post-edit hash. Add a `// why:`
  comment citing D-13807 + D-13808 + WP-141 commit hash.
- Confirm the test passes.
- Pre/post pair recorded in WP §Verification Steps Step 7 (this WP)
  and in the 01.6 post-mortem § Replay-Hash Cascade.

### E) Viewer: `apps/registry-viewer/src/registry/shared.ts` migration

- The 9 production read sites for `card.imageUrl` (across henchman,
  mastermind, scheme, villain, sidekick projection branches) switch
  to `getPhysicalCardForSide(heroSlug, card.slug).imageUrl`.
- The viewer-side projection has access to the registry's
  `getPhysicalCardForSide` via the existing `CardRegistry` injection
  point (no new prop required; it's a method on the registry the
  viewer already consumes per WP-082 / WP-083).

### F) Viewer: `CardDetail.vue` + `CardGrid.vue` migration

- The two Vue components reading `card.imageUrl` switch to consuming
  the projected `physicalCardImageUrl` field added to the projection
  output by `shared.ts` — keeps the Vue components ignorant of the
  registry lookup surface.
- Component-level test fixtures updated to provide the projection's
  new field rather than the per-side `card.imageUrl` field. The
  fixtures' raw card-side data continues to carry `imageUrl` (the
  field still exists in `HeroCardSchema` until Phase 3) — only the
  consumption pattern changes.

### G) D-13807 / D-13808 / D-13810 locked at execution

- D-13807: single-side ext_id stand-in; `physicalCard.sides[0]` (or
  alphabetically-first side slug — locked at session start) is the
  canonical face. Per-side ext_id grammar D-13502 unchanged.
- D-13808: deck-size arithmetic source = `physicalCards[].count`.
- D-13810: viewer imageUrl lookup pattern = `getPhysicalCardForSide()`
  at projection time.

### H) Tests

Engine baseline shift target (locked at session start; estimated):

- **+5 to +8 tests** in `packages/game-engine/src/setup/buildHeroDeck.test.ts`:
  - Falcon/Winter Soldier deck-size assertion (14 ext_ids, was 27).
  - Spider-Man (solo reference) deck-size assertion (unchanged).
  - At least one mgtg split-hero (e.g., Star-Lord) deck-size assertion.
  - `physicalCards[].count` reservoir invariant for every hero in a
    sample multi-hero loadout.
  - Deck contents resolve via `getPhysicalCardForSide()` for both solo
    and split heroes.

- **+2 to +4 tests** in `packages/game-engine/src/setup/buildCardDisplayData.test.ts`:
  - imageUrl resolution via the runtime index for solo and split heroes.
  - Orphan-side behavior (deterministic warning, empty-string
    fallback).

- **+2 tests** in `packages/game-engine/src/economy/economy.logic.test.ts`:
  - `buildCardStats` deck-size for a split hero matches
    `physicalCards[].count` sum.
  - `cardStats` entry count matches `G.heroDeck.length` for the split
    hero.

- **0 to +2 tests** for replay-hash regeneration (existing
  `replay.execute.test.ts` literal update may suffice; new test
  warranted only if the cascade procedure surfaces an asymmetry).

- **+1 to +3 viewer tests** in
  `apps/registry-viewer/src/registry/shared.test.ts` (or component
  test surfaces): per-side imageUrl resolution via the runtime index.

Total engine baseline shift: `698 / 150 / 0` → projected
`710-718 / 151-153 / 0` (+12-20 tests / +1-3 suites — exact at session
freeze).

Registry baseline `39 / 4 / 0` UNCHANGED (no schema change).

---

## Out of Scope

**Deferred to Phase 3 follow-up WP-142:**

- `HeroCardSchema.imageUrl` removal from the schema.
- R2 image rename pass (split-pair files renamed; legacy per-side
  files deleted).
- Final regeneration of `data/cards/*.json` without per-side
  `imageUrl`.

**Out of scope at the WP-141 packet level (no follow-up WP planned):**

- `physicalInstanceId` ext_id channel (D-13804 explicitly defers).
- Replay-record `{ cardId, sidePlayed }` schema extensions (separate
  WP).
- Move logic for the player's "which side to play" decision
  (deferred to whichever future WP adopts `{ sidePlayed }` replay
  records).
- Triple-face card support (D-13802 ceiling lock requires a separate
  DECISIONS entry).
- Engine-side caching of `getPhysicalCardForSide()` results (would
  create a parallel state surface; registry cache is canonical per
  D-13806).
- Refactoring `resolveHeroCardCopyCount` (the helper continues to
  exist for the rarity-fallback path; no signature change).

---

## Files Expected to Change

**Production**:

- `packages/game-engine/src/setup/buildHeroDeck.ts` — modified —
  deck-reservoir loop reads `physicalCards[].count`; ext_id emission
  uses `physicalCard.sides[0]` per D-13807.
- `packages/game-engine/src/setup/buildHeroDeck.test.ts` — modified —
  +5 to +8 new assertions for split-hero deck size.
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — modified
  — 2 read-site migrations to `getPhysicalCardForSide()`.
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` —
  modified — +2 to +4 new assertions for imageUrl resolution.
- `packages/game-engine/src/economy/economy.logic.ts` — modified —
  `buildCardStats` deck-size source switches.
- `packages/game-engine/src/economy/economy.logic.test.ts` — modified
  — +2 new assertions for split-hero `cardStats` count.
- `packages/game-engine/src/replay/replay.execute.test.ts` — modified
  — `PRE_WP080_HASH` literal regenerated per the cascade procedure.
- `apps/registry-viewer/src/registry/shared.ts` — modified — 9
  read-site migrations to `getPhysicalCardForSide()`.
- `apps/registry-viewer/src/registry/shared.test.ts` — modified —
  +1 to +3 new assertions.
- `apps/registry-viewer/src/components/CardDetail.vue` — modified —
  consume projected `physicalCardImageUrl`.
- `apps/registry-viewer/src/components/CardGrid.vue` — modified —
  consume projected `physicalCardImageUrl`.

**Governance ledgers**:

- `docs/ai/DECISIONS.md` — D-13807 / D-13808 / D-13810 appended at
  execution.
- `docs/ai/work-packets/WORK_INDEX.md` — WP-141 row Draft → Done on
  completion.
- `docs/ai/execution-checklists/EC_INDEX.md` — corresponding EC slot
  (claimed at execution) Draft → Done.
- `docs/ai/STATUS.md` — session-close block prepended.

**Explicitly NOT modified** (Phase 3 / out-of-scope surfaces):

- `packages/registry/src/schema.ts` — schema field `HeroCardSchema.imageUrl`
  preserved under Phase 2.
- `packages/registry/src/impl/{localRegistry,httpRegistry}.ts` — already
  consumed; no further change.
- `packages/registry/src/registry.smoke.test.ts` — no new registry tests.
- `scripts/convert-cards/**` — Phase 1b territory; no further data
  regeneration required (Phase 1b output is the input here).
- `data/cards/*.json` — Phase 1b output is consumed as-is.
- `docs/ai/REFERENCE/api-endpoints.md` — no HTTP surface added or
  modified.

---

## Acceptance Criteria

### Acceptance gate (per WP-138 §Migration Phasing)

- `grep -rn 'card\.imageUrl' packages/game-engine/src/`
  returns **zero matches outside test fixtures**.
- `grep -rn 'card\.imageUrl' apps/registry-viewer/src/`
  returns **zero matches outside test fixtures**.

### Engine deck reservoir

- For Falcon/Winter Soldier (`bkwd / falcon-winter-soldier`):
  `G.heroDeck.filter(...).length === 14` (was 27).
- For Spider-Man (`core / spider-man`, solo reference):
  `G.heroDeck.filter(...).length` matches the existing solo-hero
  baseline (unchanged across this WP).
- For at least one mgtg split-hero (curated by WP-140):
  `G.heroDeck.filter(...).length` matches that hero's
  `sum(physicalCards[].count)`.
- The single-side ext_id stand-in per D-13807 is consistent: every
  ext_id in `G.heroDeck` corresponds to a physicalCard's first side
  slug; no ext_id corresponds to the second side of a split pair.

### Engine imageUrl migration

- `buildCardDisplayData` produces `imageUrl` values matching
  `getPhysicalCardForSide(heroSlug, card.slug).imageUrl` for every
  hero card in the seeded fixture.
- Orphan resolution (a card slug that does not resolve in the
  registry) emits a deterministic full-sentence `console.warn` and
  returns the empty string — no throw.

### Viewer imageUrl migration

- Every projection branch in `shared.ts` (9 sites) consumes
  `getPhysicalCardForSide()` for hero card image resolution.
- `CardDetail.vue` and `CardGrid.vue` read the projected
  `physicalCardImageUrl` field; no per-side `card.imageUrl` reference
  survives in either component.

### Replay-hash regeneration

- `PRE_WP080_HASH` literal at `replay.execute.test.ts:54` updated
  exactly once. Pre/post pair recorded in the 01.6 post-mortem.
- Engine tests pass.

### Test counts

- Engine baseline shifts by `+12 to +20 tests / +1 to +3 suites`
  (locked exactly at session start).
- Registry baseline `39 / 4 / 0` UNCHANGED.
- Viewer test surface tracked separately (project's existing viewer
  test runner; baseline shift recorded in the post-mortem).

### Scope enforcement

- `git diff --stat packages/registry/src/` empty.
- `git diff --stat scripts/convert-cards/` empty.
- `git diff --stat data/cards/` empty.
- No `Math.random()` or `Date.now()` introduced.
- No new exports beyond what the migration requires.

---

## Verification Steps

```
# Step 1 — registry build (sanity; no schema change)
pnpm --filter @legendary-arena/registry build
# Expected: exits 0

# Step 2 — registry tests UNCHANGED
pnpm --filter @legendary-arena/registry test
# Expected: 39 / 4 / 0; matches WP-138 Phase 1a baseline exactly.

# Step 3 — engine build green
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0

# Step 4 — engine tests green at projected baseline
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP green at 698 + N / 150 + S / 0 where N = 12-20 and
# S = 1-3 (exact at session start). All assertions pass.

# Step 5 — engine grep gate clears
grep -rn 'card\.imageUrl' packages/game-engine/src/
# Expected: matches inside test fixtures only (zero production reads).

# Step 6 — viewer grep gate clears
grep -rn 'card\.imageUrl' apps/registry-viewer/src/
# Expected: matches inside test fixtures only (zero production reads).

# Step 7 — replay-hash cascade pre/post pair
# Pre-edit: capture via temporary console print in replay.execute.test.ts
# Post-edit: read from the test failure message after migration
# Both values recorded in 01.6 post-mortem; literal updated in lockstep.
node -e "
  const { execSync } = require('child_process');
  // Pre-edit: run before any engine source modification
  // Post-edit: run after migration; the test failure message reveals the new hash
"
# Expected: pre-edit hash = '2baeecc3' (the WP-137 cascade value);
# post-edit hash = <new value>; literal updated to <new value>; test passes.

# Step 8 — split-hero deck size verification (Falcon/Winter Soldier)
node -e "
  const { createRegistryFromLocalFiles } = require('@legendary-arena/registry');
  const { buildInitialGameState } = require('@legendary-arena/game-engine');
  // Construct a minimal fixture loadout including bkwd/falcon-winter-soldier
  // Assert: G.heroDeck filtered to falcon-winter-soldier ext_ids has length 14
"
# Expected: deck-size === 14 (was 27 pre-WP-141).

# Step 9 — Spider-Man solo reference unchanged
# Same fixture pattern with core/spider-man
# Expected: deck-size matches the pre-WP-141 solo baseline exactly.

# Step 10 — viewer test surface
pnpm --filter @legendary-arena/registry-viewer test
# Expected: green; baseline shift recorded.

# Step 11 — scope-clean
git diff --stat packages/registry/src/ scripts/convert-cards/ data/cards/
# Expected: empty.

# Step 12 — D-13807 / D-13808 / D-13810 cited in source
grep -c "D-1380[78]\|D-13810" packages/game-engine/src/ -r
# Expected: at least 6 (one per decision; multiple anchors per
# decision are fine).
```

---

## Definition of Done (Phase 2)

1. WP-141 row in `WORK_INDEX.md` flipped to **Done** with the
   executing commit hash.
2. EC slot row in `EC_INDEX.md` flipped to **Done** (slot claimed at
   execution).
3. **D-13807 / D-13808 / D-13810 appended** to
   `docs/ai/DECISIONS.md` in numeric order (D-13901 from WP-140
   precedes them; the gap is acceptable per the project's locked
   append-only convention).
4. Acceptance grep gates clear:
   `grep -rn 'card\.imageUrl' packages/game-engine/src/ apps/registry-viewer/src/`
   returns zero matches outside test fixtures.
5. Engine baseline shifts by `+12 to +20 tests / +1 to +3 suites`
   (exact lock at session start).
6. **Registry baseline UNCHANGED** at `39 / 4 / 0`.
7. **Schema UNTOUCHED** — `packages/registry/src/schema.ts` not in
   diff. `HeroCardSchema.imageUrl` preserved (Phase 3 removes it).
8. Replay-hash literal regenerated; pre/post pair recorded in the
   01.6 post-mortem.
9. Falcon/Winter Soldier deck size = 14 ext_ids end-to-end (the
   originally-motivating defect from WP-138's session context is now
   structurally and functionally fixed).
10. **STATUS.md updated** with the Phase 2 execution summary.
11. 01.6 post-mortem authored (mandatory per WP §Definition of Done
    item 11 — open D-13804 design question resolved at execution;
    replay-hash cascade fires; consumer-migration boundary pattern
    locked for Phase 3 — three triggers).
12. Lint gate passed at this packet's execution-session start.

---

## Vision Alignment

> Vision §1, §2, §3 (Determinism, Fairness, Replay Faithfulness),
> §10 (Card content semantics), §10a (Registry Viewer surfaces), §22
> (Replays must verify). NG-1..7 not crossed.

- **Vision clauses touched:** §1, §2, §10 — engine and viewer
  consumer surfaces switch to the physicalCard primitive; card content
  semantics are read end-to-end from the authoritative deck-composition
  source. §10a — the registry-viewer's card-rendering paths
  (`cards.barefootbetters.com`) consume the runtime index. §3 —
  determinism strengthened: split-hero deck size is now correct
  (Falcon/Winter Soldier 14, not 27); replay determinism is preserved
  via the per-side ext_id grammar lock (D-13502, preserved by D-13804).
  §22 — replay faithfulness preserved across the engine consumer
  migration: the per-side ext_id grammar from D-13502 is unchanged;
  per-copy `#<copyIndex>` suffix from WP-137 D-13702 layers on top
  of the new physicalCard read pattern, not under it. The
  replay-hash cascade regenerates the `PRE_WP080_HASH` literal in
  lockstep, preserving replay regression-guard coverage.
- **Conflict assertion:** No conflict — this WP preserves all touched
  clauses. Determinism is strengthened; replay faithfulness is
  preserved with the locked cascade procedure; card content semantics
  are now structurally correct end-to-end.
- **Non-Goal proximity check:** None of NG-1..7 are crossed. This WP
  is an engine + viewer consumer migration; no monetization, paid
  surface, persuasive copy, competitive-ranking surface, or
  social/social-graph affordance.
- **Determinism preservation:** Confirmed. The single-side ext_id
  stand-in per D-13807 uses `physicalCard.sides[0]` (declaration
  order — locked deterministic across re-runs of identical input data
  per WP-138 ID determinism rule). The `getPhysicalCardForSide()`
  lookup is deterministic (Map lookup against immutable input). The
  replay-hash regeneration follows the WP-135 / WP-137 cascade
  template; the literal is updated in lockstep with the engine
  consumer change. All consumers continue to receive byte-identical
  output across re-runs of identical setup + moves.

---

## Funding Surface Gate

N/A — this WP touches no funding affordance, no global navigation, no
profile / account funding attribution surface, no tournament-funding
channel integration, and no user-visible copy referencing donate /
support / tournament-funding. The artifact is a registry-consumer
migration; no funding-related UI surface is added or modified by this
packet. The viewer changes are card-rendering paths, not funding
surfaces.

---

## API Catalog Update

N/A per D-11804 — this WP touches no `apps/server` HTTP endpoint,
registers no new route, modifies no existing endpoint, removes no
endpoint, and adds no `apps/server/src/**` library function. The
change is confined to `packages/game-engine` and
`apps/registry-viewer`. The catalog file
`docs/ai/REFERENCE/api-endpoints.md` is not modified.

---

## Notes on the Lint Gate

This document is a **draft**. Per `.claude/CLAUDE.md §Lint Gate`,
executing WP-141 — landing the engine + viewer consumer migration,
locking D-13807 / D-13808 / D-13810, regenerating the replay-hash
literal — requires the Prompt Lint Gate
(`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) to be satisfied
first. The lint gate is not invoked at draft-time; it is invoked at
session start by the executing session.

§17 Vision Alignment present with clause numbers + determinism
preservation line. §20 Funding Gate N/A with one-line justification.
§21 API Catalog N/A with one-line justification. §1 structural
sections all present. §2 Non-Negotiable Constraints block carries
Engine-wide + Packet-specific + Session protocol + Locked contract
values. §5 Files Expected to Change lists every file to be created or
modified (the engine + viewer surfaces are explicit; the test-count
delta exact lock happens at execution session start once the executor
freezes the test matrix). §13 Verification Steps include exact
commands with expected output.

01.5 Runtime Wiring Allowance is invoked by this WP per
`docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md` §When to Include
This Clause — the WP changes runtime-visible structure (`G.heroDeck`
content for split heroes shifts from per-side ext_ids to single-side
stand-ins). Minimal wiring edits to existing tests asserting on
`G.heroDeck` deck-size literals are permitted.

If any lint item cannot be satisfied at execution, that session must
STOP and re-scope this WP rather than proceed.
