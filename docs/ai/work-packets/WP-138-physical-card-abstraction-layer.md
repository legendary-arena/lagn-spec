# WP-138 — Physical Card Abstraction Layer (Split-Side Hero Cards)

**Status:** Draft (drafted 2026-05-07; not yet executed; lint gate not yet
invoked — execution requires `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` pass).
**Rescoped 2026-05-07** per pre-flight PS-3 to **Phase 1a only** —
schema + tooling + solo auto-path + audit warnings + drift validation +
ONE canonical reference patch (bkwd / falcon-winter-soldier). Phase 1b
(per-set patch curation across the remaining ~24 split-side heroes),
Phase 2 (engine + viewer consumer migration), and Phase 3 (`cards[].imageUrl`
removal + R2 cleanup) are deferred to follow-up Work Packets to be
drafted after WP-138 lands. The migration phases remain documented
below as the locked sequence; only Phase 1a is executable under this
packet.
**Primary Layer:** Registry (schema) + Tooling (`scripts/convert-cards/`).
**Dependencies:** WP-003 (registry verification + immutable files lock),
WP-082 / WP-083 (registry schema + fetch-time validation), WP-135 (hero
rarity → copy-count map under D-13501; hero card-instance ext_id format
`<setAbbr>/<heroSlug>/<cardSlug>` under D-13502), **WP-137 (must execute
first per `.claude/rules/work-packets.md §Dependency Discipline` — its
`cardCounts` authoritative-when-present surface is the field WP-138
re-positions as a derived view of `physicalCards[]`)**.

**Supersedes:** none. Establishes a new first-class abstraction.

---

## Session Context

The card data model currently treats every gameplay-distinct card "side" as
a top-level entry in `hero.cards[]` with its own `slug`, `cost`, `hc`,
`abilities`, and `imageUrl`. For solo heroes (Wolfsbane, Spider-Man, the
overwhelming majority) this is correct — each card in the deck is a single
physical artifact with one face. For **split-side heroes** (Falcon & Winter
Soldier in `bkwd`, the entire MS-GotG hero roster in `mgtg`, several heroes
in `msis` / `msmc` / `msp1` / `wpnx` / `wwhk` / `xmen`), the model is
broken: a single physical card with two faces (e.g., Attune / Atone) is
represented as two top-level `cards[]` entries pointing at two image files.
The `cardCounts` field carries `{"Attune": 5, "Atone": 5}` — but those 5
are not 10 cards in the deck. They are **5 dual-faced cards**. The current
data structure has no concept of "physical card" distinct from "card side."

The defect surfaces in three places at once:

1. **Image migration** (2026-05-07 v16 cardSlug rename): `renamed-v16/` left
   44 files unmatched; the bulk of the unmatched set is split-side hero
   files where the old `{cost}{rarity}{slot}` encoding was created before
   the JSON treated each side as a separate card. There is no clean v16
   filename for a single dual-face image — Option A ("duplicate one image
   under both side slugs") inflates apparent deck size to a viewer counting
   files; Option B ("combined name `slugA-slugB.webp`") has no place in the
   schema for a single imageUrl shared by two card entries.
2. **Engine deck composition (post-WP-137)**: `cardCounts` is now
   authoritative for copy counts. For Falcon / Winter Soldier the deck
   reservoir would compute `5 + 5 + 5 + 5 + 3 + 3 + 1 = 27` card-instances
   from the per-side counts. The physical deck is **14 cards**. Future
   replay / hand-zone / shuffle invariants depending on physical-card
   identity will silently mis-tally.
3. **Replay & audit identity**: A replay record `{ cardId, sidePlayed }`
   cannot be expressed against a model where the "card" is the side.

Industry baseline (Scryfall card data API, generic deck-engine designs,
Tabletop Simulator's state-flip pattern) all converge on the same
abstraction: **one card object per physical card; multiple faces are a
sub-collection on that object.** The Legendary Arena data model has been
"sides as cards" since the registry was first stood up; this packet
introduces the missing abstraction without rewriting downstream consumers
that already read per-side fields.

---

## Goal (Phase 1a only)

After this packet:

1. The registry schema declares a new `PhysicalCard` type. Every hero's
   data carries a `physicalCards: PhysicalCard[]` collection in addition
   to the existing `cards[]` array. Solo heroes have one `physicalCards`
   entry per `cards[]` entry (single-side, uniform model). Split-side
   heroes have one `physicalCards` entry per dual-faced card, with
   `sides[]` listing two card slugs — but **only** when an explicit
   pair metadata block lands in a patch file. Split-side heroes
   without a curated patch fall through to the **solo auto-path**:
   one single-side `physicalCards` entry per `cards[]` entry. This
   produces structurally-correct (`cards[].slug` resolves) but
   semantically-wrong output for split heroes (deck size still
   over-counts because physicalCards mirrors cards 1:1 instead of
   grouping faces) — that wrongness is **non-blocking under Phase 1a**
   because no consumer reads `physicalCards[]` as authoritative yet.
2. The card data conversion pipeline emits the new structure for all
   40 sets. Audit warnings flag every paired-equal `cardCounts`
   pattern that lacks an explicit `physicalCards` declaration, so
   curators in the follow-up Phase 1b WP know which heroes need
   patch authorship.
3. The image filename convention for split cards is locked at
   `{setAbbr}-hr-{heroSlug}-{slugA}-{slugB}.webp` where `slugA` and
   `slugB` are the two side slugs sorted lexicographically per
   D-13802. For solo cards the convention stays:
   `{setAbbr}-hr-{heroSlug}-{cardSlug}.webp`. The convert-script
   emits these URLs from `PhysicalCardSchema`; image-file movement on
   R2 to match the new names is **out of scope for Phase 1a** and
   handled by a follow-up WP.
4. A runtime-only `sideToPhysicalCard: ReadonlyMap<string, PhysicalCard>`
   index keyed by `<heroSlug>/<sideSlug>` is exposed by the registry
   via `CardRegistry.getPhysicalCardForSide(heroSlug, sideSlug)`. The
   map is computed at registry load and never persisted (D-13806).
5. **One canonical reference patch lands**: `bkwd / falcon-winter-soldier`
   gets an explicit `physicalCards[]` block declaring its 3 split
   pairs (Attune/Atone, Relocate/Reload, New Wings/New Plan) plus
   the 1 solo (Captain America's Legacy). This validates the patch
   format end-to-end and gives the follow-up Phase 1b WP a working
   template to clone for the remaining ~24 split-side heroes.
6. **Drift validation** runs at registry load: for every hero with
   `cardCounts` populated, the sum of `physicalCards[].count` for
   physical cards listing each side must equal `cardCounts[sideName]`.
   Drift fails load with a full-sentence error.
7. **`HeroCardSchema.imageUrl` stays in the schema** during Phase 1a.
   No consumer migration; no removal. Existing engine + viewer code
   continues to read `cards[].imageUrl` unchanged.

The split-side filename ambiguity that motivated this WP — what to do
with `bkwd-hr-falcon-winter-soldier-4c2.webp` — has a deterministic
answer **for the falcon-winter-soldier case** at the end of Phase 1a:
its `physicalCards[]` block declares the pairing; its computed
imageUrl is `bkwd-hr-falcon-winter-soldier-relocate-reload.webp`. The
remaining ~24 split-side heroes carry the *same* ambiguity until
their respective Phase 1b patches land.

### Deferred to follow-up Work Packets (out of WP-138 scope)

- **Phase 1b** — per-set patch curation across the remaining ~24
  split-side heroes (`bkwd` other splits, `mgtg`, `msis`, `msmc`,
  `msp1`, `wpnx`, `wwhk`, `xmen`). High-touch curation work; multiple
  sessions plausible.
- **Phase 2** — engine consumer migration (`buildHeroDeck.ts` reads
  `physicalCards[].count`; `buildCardDisplayData.ts` reads
  `physicalCards[].imageUrl`) and viewer migration in
  `apps/registry-viewer/src/`. Hard-depends on Phase 1b
  (engine cannot trust `physicalCards[]` until every split hero is
  curated).
- **Phase 3** — `HeroCardSchema.imageUrl` removal and R2 image
  migration (rename or delete legacy per-side hero card image
  files). Hard-depends on Phase 2's grep gate.

These are sequenced by hard dependency. Each follow-up WP is drafted
after its predecessor lands; numbers are not pre-claimed.

---

## Assumes

- WP-003 complete. Registry package is the single data input layer; no
  schema reinterpretation in engine or server code.
- WP-082 / WP-083 complete. Registry schemas validated at fetch-time
  boundaries.
- WP-135 complete. `RARITY_COPY_COUNT` map and ext_id format
  `<setAbbr>/<heroSlug>/<cardSlug>` are locked under D-13501 / D-13502.
- WP-137 complete. `cardCounts` is the authoritative per-side count source
  when populated; rarity map is fallback only.
- `data/cards/*.json` for all 40 sets exists and is current as of the
  v16 cardSlug regeneration (commit reachable from `HEAD` via
  `git log --oneline -- data/cards/ scripts/convert-cards/` showing the
  v16 conversion).
- `scripts/convert-cards/convert-cards-v15.mjs` v16 changes are committed
  (heroImageUrl signature `(setAbbr, heroSlug, cardSlug)`; no cost-rarity
  encoding in URL builder).
- `pnpm --filter @legendary-arena/registry test` exits 0.
- `pnpm --filter @legendary-arena/game-engine test` exits 0.
- `docs/ai/DECISIONS.md` exists and the most recent decision is D-13601
  before this WP appends D-13801..D-13806.

If any of the above is false this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — registry
  schema changes belong to the registry layer; engine consumes the
  registry's read-only output. No engine import into registry.
- `docs/ai/ARCHITECTURE.md §Zone & Pile Structure` — zones store
  `CardExtId` strings only. The new physical-card abstraction does not
  change this; physical-card identity is encoded in the ext_id grammar
  (D-13804 below).
- `docs/ai/DECISIONS.md` — scan D-10014 (qualified-ID grammar
  `<setAbbr>/<slug>`), D-13501 / D-13502 (WP-135 hero deck reservoir +
  ext_id format), D-13701 (WP-137 cardCounts authoritative).
- `.claude/rules/registry.md §Schema Authority` — `schema.ts` is locked;
  modification requires DECISIONS entry. This WP justifies the change via
  D-13801..D-13806.
- `.claude/rules/code-style.md §Drift Detection` — when adding a new
  schema concept, add a canonical readonly array (or equivalent invariant)
  and a drift-detection test pairing the type with the array.
- `.claude/rules/persistence.md §Class 1 Runtime State` — read for
  context on the runtime-state never-persist principle. Note: the
  `sideToPhysicalCard` Map is **registry-internal cache, not literal
  Class 1 `G`-state** (Class 1 enumerates `G`, `ctx`, etc.). The
  never-persist constraint applies by the same principle — derived
  indexes from immutable input are not state — not by literal Class 1
  classification (D-13806 carries the explicit framing).
- `packages/registry/src/schema.ts` — read end-to-end; understand the
  current `HeroSchema` and `HeroCardSchema` shapes before extending.
- `packages/registry/src/impl/localRegistry.ts` and `httpRegistry.ts` —
  both loaders must populate `physicalCards` from the validated input
  data and compute the runtime `sideToPhysicalCard` index.
- `scripts/convert-cards/convert-cards-v15.mjs` — the URL builder
  (`heroImageUrl`) and the patch merge / append logic (`applyPatch`)
  need to be extended to emit physicalCards.
- The Scryfall card data model (`card_faces` array on a single card) is
  the industry reference; not a normative dependency, just orientation.

---

## Non-Negotiable Constraints

1. **`schema.ts` is governed.** Per `.claude/rules/registry.md`, this
   file's modification requires this WP + D-13801..D-13806 in the same
   commit set. Inline `// why:` comments mark each new field with its
   D-decision anchor.
2. **`cards[].imageUrl` removal is a breaking change — deferred to a
   Phase 3 follow-up WP, not this packet.** Phase 1a leaves
   `HeroCardSchema.imageUrl` in place; consumers (engine, registry-viewer,
   arena-client) continue to read `card.imageUrl` unchanged. The future
   Phase 2 WP migrates those consumers to `physicalCards[].imageUrl` via
   the runtime index `getPhysicalCardForSide`; the future Phase 3 WP
   removes the field from the schema once Phase 2's grep gate clears.
   This forward-binding contract is locked here so the future WPs
   inherit it without re-design.
3. **No engine logic in the registry.** The runtime `sideToPhysicalCard`
   Map is built by iterating loaded data and exposed read-only — not
   by interpreting gameplay rules.
4. **Deck composition is derived only from `physicalCards[]`** (D-13801).
   Engine code summing per-side counts to compute deck size is a bug.
   Drift detection: a registry validation rule asserts `sum(physicalCards
   for hero where sides includes sideSlug) === cardCounts[sideName]`
   for every hero with `cardCounts` populated.
5. **Patches are the only authoritative source for split-pair declarations**
   (D-13805). The converter does not auto-detect pairs from `cardCounts`
   patterns. Heuristic detection (paired equal counts) is permitted only
   as a *warning* during conversion to surface candidates; it must never
   silently emit physicalCards groupings without explicit patch metadata.
6. **Solo heroes use single-side `physicalCards` entries** (D-13803). No
   special-casing in consumer code: every hero has `physicalCards[]`.
7. **`physicalCard.imageUrl` is computed deterministically from the
   sorted side slugs** (D-13802). The convert script's URL builder takes
   a `PhysicalCard` (or its `sides[]` array) and produces a stable URL.
   Two sides resolve to the same URL regardless of declaration order.
8. **No orphan sides.** Every entry in `physicalCard.sides[]` MUST
   correspond to an existing `cards[].slug` *under the same hero*.
   A `physicalCards` declaration that references a non-existent
   side slug fails registry validation at load with a full-sentence
   error naming the hero, the offending physicalCard `id`, and the
   missing slug. This complements the inverse rule already locked in
   D-13806 (every `cards[].slug` resolves via `sideToPhysicalCard`):
   together they ensure exact bijection between sides and the
   physicalCards that own them.
9. **No duplicate side membership within a hero.** A side slug MUST
   NOT appear in more than one `physicalCard` within the same hero.
   Duplicate membership fails registry validation at load. This
   prevents accidental double-counting in deck composition (a side
   listed in two physicalCards of count 5 each would imply 10 deck
   instances reference the same gameplay-side, which is meaningless)
   and ambiguous identity resolution in the runtime
   `sideToPhysicalCard` index (the reverse map's value would not be
   well-defined). Cross-hero side slug reuse is permitted and
   handled by the namespaced index keying (Scope D).

---

## Debuggability & Diagnostics

- The convert script emits a per-hero summary line when split-pair
  metadata is applied: `📎 Pair: hero=<slug> sides=[<a>,<b>] count=<N>`.
- The registry validator emits a warning (not failure) when a hero has
  `cardCounts` paired-equal counts but no matching `physicalCards`
  declaration — surfacing candidates for patch curation without blocking.
- The `sideToPhysicalCard` index, after construction, asserts that every
  side slug in every hero's `cards[]` resolves; an unresolved side fails
  registry load with a full-sentence error naming the hero, side slug,
  and the suggested patch fix.

---

## Scope (In)

### A) Registry schema additions (`packages/registry/src/schema.ts`)

- Add `PhysicalCardSchema` with fields:
  - `id: string` (locally unique within hero; format `p1`, `p2`, ...).
    **ID assignment is deterministic and stable across re-conversions of
    identical input data**, anchored on declaration order: for split heroes
    the IDs follow the patch's `physicalCards[]` declaration order (first
    declared = `p1`); for solo heroes the IDs follow the hero's `cards[]`
    array order (first card = `p1`). Re-running `convert-cards-v15.mjs`
    against unchanged inputs MUST produce byte-identical IDs. Stability
    is load-bearing for replay integrity, diff review, and CI
    reproducibility — non-deterministic IDs would break audit trails
    that pin against `physicalCard.id` values.
  - `count: number` (positive integer)
  - `imageUrl: string` (computed by convert script per D-13802)
  - `sides: readonly string[]` — the validator enforces
    `1 <= sides.length <= 2` at the current invariant. The TypeScript
    type is the array form (not a tuple union) so that a future relaxation
    to triple-face cards (3+ modes, exists in some games) requires only
    a length-check change in Zod, not a type-system migration across
    every consumer. The `<= 2` ceiling is locked for this WP; raising
    it is a separate decision that requires its own DECISIONS entry.
- Extend `HeroSchema` with `physicalCards: PhysicalCard[]` (required;
  non-empty when `cards[]` is non-empty).
- Mark `HeroCardSchema.imageUrl` as deprecated; the field is removed in a
  follow-up commit after all consumers migrate (transition window
  acceptable within this WP).
- Add canonical readonly array `PHYSICAL_CARD_ID_PREFIX = 'p'` and a
  drift-detection test asserting all generated IDs match `^p\d+$`.

### B) Convert script extension (`scripts/convert-cards/convert-cards-v15.mjs`)

- After per-hero card array construction, build `physicalCards[]`:
  - Solo path: every card becomes a single-side physicalCard with
    `count` from the per-side `cardCounts` value (or rarity-map fallback
    per WP-137 D-13501).
  - Split path: read patch's `hero.physicalCards[]` declarations
    (D-13805 patch format) and group cards accordingly.
- Update `heroImageUrl(setAbbr, heroSlug, sides)` signature to accept
  the `sides` array; emit:
  - One side: `{setAbbr}-hr-{heroSlug}-{sides[0]}.webp`
  - Two sides: `{setAbbr}-hr-{heroSlug}-{sortedA}-{sortedB}.webp`
- Drop `imageUrl` emission from individual `cards[]` entries (per
  D-13802 the imageUrl lives on the physicalCard).
- Validate `cardCounts` against physicalCards counts and fail
  conversion with a full-sentence error on drift.
- Add a `--strict` CLI flag (and a `LEGENDARY_CONVERT_STRICT=1` env var
  shorthand). Without `--strict`, paired-equal `cardCounts` patterns
  that lack an explicit `physicalCards` declaration emit a *warning*
  to stderr (developer-iteration mode). With `--strict`, the same
  patterns fail conversion with exit code non-zero (CI mode). CI runs
  invoke `--strict`; local dev iteration may run without it. This
  closes the silent-regression hole where missing patches accumulate
  unnoticed (per the executive review §⚠️4 hardening).

### C) Patch format documentation + ONE canonical reference patch

- Add a per-hero `physicalCards: [{ id, count, sides }]` block to the
  patch schema. The converter consumes this for split-side declaration;
  absence falls through to the solo auto-path.
- Document the format in `scripts/convert-cards/inputs/patches/README.md`
  (new section for v17 `physicalCards`). Format documentation includes:
  field semantics, ID assignment determinism rule (patch declaration
  order), worked example using falcon-winter-soldier, and the
  drift-validation contract (`sum(physicalCards counts) must equal
  cardCounts per side`).
- **Curate exactly one reference patch**:
  `scripts/convert-cards/inputs/patches/bkwd.patch.json` — add the
  `physicalCards[]` block to `falcon-winter-soldier`:
  ```
  physicalCards: [
    { id: "p1", count: 5, sides: ["attune", "atone"] },
    { id: "p2", count: 5, sides: ["relocate", "reload"] },
    { id: "p3", count: 3, sides: ["new-wings", "new-plan"] },
    { id: "p4", count: 1, sides: ["captain-americas-legacy"] }
  ]
  ```
  This validates the patch format end-to-end and exercises the
  convert-script's split-pair URL builder, the loader's runtime index
  build, and the drift validator against a real hero with both split
  and solo cards.
- **Bulk patch curation across the remaining ~24 split-side heroes is
  out of scope for Phase 1a** and deferred to a follow-up Phase 1b WP.
  The audit-warning surface delivered in §B will list every
  paired-equal `cardCounts` candidate so the Phase 1b WP starts with
  a complete worklist.

### D) Loader updates (`packages/registry/src/impl/`)

- `localRegistry.ts` and `httpRegistry.ts` both:
  - Validate `physicalCards` per `PhysicalCardSchema`.
  - Build runtime `sideToPhysicalCard: ReadonlyMap<string, PhysicalCard>`
    keyed by the **namespaced compound key** `<heroSlug>/<sideSlug>`. The
    namespacing is required, not cosmetic: global uniqueness of `cardSlug`
    across heroes is **not assumed** (a card slug like `night-vision` is
    free to appear under multiple heroes in different sets, and the data
    model must accommodate that without collision). Implementations MUST
    NOT key the index on `sideSlug` alone.
  - Expose the index on `CardRegistry` as a read-only method
    `getPhysicalCardForSide(heroSlug, sideSlug): PhysicalCard | undefined`.

### E) Engine consumer migration — DEFERRED to Phase 2 follow-up WP

**Out of scope for Phase 1a.** Migrating engine sites that read
`card.imageUrl` (`buildCardDisplayData.ts` per WP-111 / WP-137,
`buildHeroDeck.ts` per WP-135) and computing the deck reservoir from
`physicalCards[]` count rather than summed-side `cardCounts` is the
substance of the future Phase 2 WP. That WP also resolves the open
engine-mechanism question: how `G.heroDeck: CardExtId[]` represents
split-side instances (single side ext_id standing in for the physical
card; both side ext_ids with a flip-tracking adjunct; or a new
`physicalInstanceId` channel parallel to the ext_id per D-13804's
deferred future-WP path). The Phase 1a registry layer does not
constrain that choice; it provides the lookup primitives the future
WP consumes.

The locked deck-reservoir semantics for the future WP (recorded here
as a forward-binding contract D-13801 already protects):

- For each `physicalCard` with count `N`: exactly `N` instances exist
  in the deck.
- Each instance exposes one active side at draw / play time. Solo
  physicalCards (`sides.length === 1`) have a fixed side; split
  physicalCards (`sides.length === 2`) let the player choose at play.
- Per-side ext_ids remain unchanged per D-13502 (preserved by D-13804);
  they identify selectable faces, not deck slots.
- Falcon-Winter-Soldier sanity check (when Phase 2 lands): 3 split +
  1 solo = 4 physicalCards summing to 14 instances (Attune/Atone 5 +
  Relocate/Reload 5 + New Wings/New Plan 3 + Captain America's
  Legacy 1); per-side `cardCounts` sum 27 is the derived view.

### F) UI consumer migration — DEFERRED to Phase 2 follow-up WP

**Out of scope for Phase 1a.** Migrating
`apps/registry-viewer/src/` card-rendering components to fetch images
via the runtime index lands with the engine migration in the same
Phase 2 WP (or a sibling WP if the viewer migration is split off).

### G) R2 image migration — DEFERRED to Phase 3 follow-up WP

**Out of scope for Phase 1a.** Renaming split-pair files on R2 to the
combined-name pattern (and removing legacy per-side hero card image
files after consumers migrate) is Phase 3. The 44 unmatched files
from the 2026-05-07 v16 migration remain unmatched at the end of
Phase 1a; they are addressed when Phase 1b lands their owning heroes'
pair declarations and Phase 3 runs the rename pass.

### H) Tests (Phase 1a only — locked count: +7 in `packages/registry/src/registry.smoke.test.ts`)

The registry baseline at execution time is the post-WP-137 baseline
(established when WP-137 lands). WP-138 Phase 1a adds **exactly 7
test cases** to the registry smoke-test file, all in a single new
`describe('physicalCards (WP-138 Phase 1a)')` block:

1. Schema validation — `physicalCards.sides[]` length 0 fails.
2. Schema validation — `physicalCards.sides[]` length 3 fails.
3. Schema validation — `physicalCards.id` non-conforming format
   (e.g., `q1`, `physical-card-1`) fails.
4. Drift detection — `sum(physicalCards where sides includes sideName)
   .count === cardCounts[sideName]` mismatch fails load with
   full-sentence error naming the hero and the mismatched count.
5. Orphan-side rejection (constraint 8) — a `physicalCards[]` entry
   referencing a non-existent `cards[].slug` under the same hero
   fails load with a full-sentence error naming the hero and the
   missing slug.
6. Duplicate-membership rejection (constraint 9) — a side slug
   appearing in two `physicalCards` within the same hero fails load
   with a full-sentence error naming the hero and both
   physicalCard `id`s.
7. Falcon-Winter-Soldier reference fixture — `bkwd / falcon-winter-soldier`
   has `physicalCards.length === 4` (3 split + 1 solo) and
   `sum(physicalCards[].count) === 14`. Validates the Phase 1a
   curated reference patch end-to-end.

No engine-side tests are added by Phase 1a (engine consumer
migration is the Phase 2 WP's responsibility). No
arena-client-side tests are added (UI migration is also Phase 2).

The baseline shift target: `(P + 7) / (S + 1) / 0` where `P` and
`S` are post-WP-137 registry test pass count and suite count; the
`+1 suite` is the new `physicalCards (WP-138 Phase 1a)` describe
block.

---

## Migration Phasing (Locked Sequence)

The schema change `HeroCardSchema.imageUrl` removal is breaking. To
prevent runtime crashes and viewer breakage during execution, the
landing splits into three explicit phases, completed in order across
multiple WPs. **EC-141 (this packet's checklist) enforces only the
Phase 1a boundary.** Phase 1b / 2 / 3 boundaries are enforced by the
checklists of their respective follow-up WPs, drafted after each
predecessor lands.

### Phase 1 — Additive (dual-read, no removal)

- Add `PhysicalCardSchema` and `HeroSchema.physicalCards`.
- Convert script populates `physicalCards[]` for all 40 sets (solo
  auto-path + curated split-pair patches).
- `HeroCardSchema.imageUrl` **stays** in the schema during this phase.
  Existing consumers continue to read `card.imageUrl`; nothing breaks.
- Loader builds and exposes `getPhysicalCardForSide(...)` runtime index.
- Drift validation (cardCounts vs physicalCards counts) is enabled.
- Acceptance: every hero in every set has populated `physicalCards[]`;
  registry build green; engine + viewer pass tests unchanged.

### Phase 2 — Migrate consumers

- Engine (`packages/game-engine/`): every site reading `card.imageUrl`
  switches to `getPhysicalCardForSide(...).imageUrl`. `buildHeroDeck.ts`
  computes deck reservoir from `physicalCards[].count`.
- Registry-viewer (`apps/registry-viewer/src/`): card-rendering
  components fetch image via the runtime index.
- Tests added to confirm each consumer's lookup resolves correctly for
  solo and split heroes (Wolfsbane and Falcon-Winter-Soldier fixtures).
- Acceptance: `grep -rn 'card\.imageUrl' packages/game-engine/src/
  apps/registry-viewer/src/` returns zero matches outside test
  fixtures. Engine + viewer test suites green.

### Phase 3 — Remove (schema enforces)

- Convert script ceases emitting `imageUrl` on `cards[]` entries.
- `HeroCardSchema.imageUrl` removed from the Zod schema.
- Final regeneration of all `data/cards/*.json`.
- R2 image migration: split-pair files renamed to combined-name pattern;
  legacy per-side image files for split heroes deleted from R2 in a
  separate cleanup pass after the new files are verified.
- Acceptance: `data/cards/*.json` contains zero `"imageUrl"` keys under
  any `cards[]` entry; schema rejects any input that does. R2 holds
  exactly one image per physicalCard.

**Why phased rather than atomic:** an atomic change requires every
consumer's migration to land in the same commit as the schema change.
A failed migration somewhere in the consumer set would block the
schema landing entirely. Phased landing lets Phase 1 ship as a
non-breaking additive change, exposes the new surface to the team,
and lets Phase 2 land per-consumer with its own review cycle. Phase 3
is the cleanup — by the time it runs, every consumer is already on
the new surface.

---

## Out of Scope

**Deferred to Phase 1b follow-up WP:**

- Per-set patch curation across the remaining ~24 split-side heroes
  identified in the renamed-v16 unmatched set (`bkwd` other splits not
  in the canonical reference patch; `mgtg`, `msis`, `msmc`, `msp1`,
  `wpnx`, `wwhk`, `xmen`).
- Audit-pass triage across all 40 sets to surface candidates not in the
  named worklist (the convert script's audit warnings produce this list
  during Phase 1a; Phase 1b consumes it).

**Deferred to Phase 2 follow-up WP:**

- Engine consumer migration in `packages/game-engine/src/setup/`
  (`buildHeroDeck.ts`, `buildCardDisplayData.ts`).
- The engine-side mechanism for representing split-side instances in
  `G.heroDeck: CardExtId[]` (single side ext_id stand-in vs both-sides
  with flip-tracking adjunct vs new `physicalInstanceId` channel — open
  design question per D-13804 deferred path).
- Registry-viewer image-lookup migration in `apps/registry-viewer/src/`.
- Replay-hash regression cascade if `computeStateHash` inputs shift
  when the engine reads `physicalCards[]`.

**Deferred to Phase 3 follow-up WP:**

- `HeroCardSchema.imageUrl` removal from the schema.
- R2 image migration (rename split-pair files to combined-name
  pattern; delete legacy per-side hero card image files).
- Final regeneration of `data/cards/*.json` without per-side imageUrl.

**Out of scope at the WP-138 packet level (no follow-up WP planned):**

- Restructuring `cards[]` to `cards.sides[]` (Option 3 from the design
  evaluation). This packet adopts Option 2 (parallel collections); a
  future WP may consolidate if downstream patterns warrant.
- Replay-record schema changes capturing `{ cardId, sidePlayed }`. This
  packet enables the model; the replay system updates are a separate WP.
- Anti-cheat / integrity work on physical-card identity (Phase 9 surface
  per WP-107 placeholder).
- AMWP-class or extended-uncommon hero deck patterns (covered by D-13501
  fallback path; WP-138 is orthogonal).
- Image asset content audits (the bytes inside the .webp files). This
  packet renames; it does not validate that artwork matches card data.

---

## Files Expected to Change (Phase 1a only)

**Production / data** (registry layer + tooling — no engine, no app):

- `packages/registry/src/schema.ts` — additions; `PhysicalCardSchema`
  + `HeroSchema.physicalCards`; D-13801..D-13806 anchored via `// why:`
  comments. `HeroCardSchema.imageUrl` is **not removed** under Phase 1a.
- `packages/registry/src/impl/localRegistry.ts` — validate
  `physicalCards`, build runtime `sideToPhysicalCard` index, expose
  `getPhysicalCardForSide`.
- `packages/registry/src/impl/httpRegistry.ts` — same.
- `packages/registry/src/index.ts` — export `PhysicalCard` type and
  `getPhysicalCardForSide` method on `CardRegistry`.
- `packages/registry/src/registry.smoke.test.ts` — exactly 7 new tests
  in one new `describe` block per §H.
- `scripts/convert-cards/convert-cards-v15.mjs` — `heroImageUrl(sides)`
  signature; `--strict` flag handler; drift validation;
  audit-warning surface for paired-equal `cardCounts` patterns
  lacking explicit `physicalCards` declarations.
- `scripts/convert-cards/inputs/patches/bkwd.patch.json` — add
  `physicalCards[]` block to `falcon-winter-soldier` only (the
  canonical reference patch). No other patch files touched in Phase 1a.
- `scripts/convert-cards/inputs/patches/README.md` — v17 format docs.
- `data/cards/*.json` — regenerated; all 40 sets gain `physicalCards[]`
  via solo auto-path; bkwd's `falcon-winter-soldier` reflects the
  reference patch's grouping.

**Governance ledgers**:

- `docs/ai/DECISIONS.md` — D-13801..D-13806 appended (already drafted
  2026-05-07; preserved at execution).
- `docs/ai/work-packets/WORK_INDEX.md` — WP-138 row Draft → Done on
  completion.
- `docs/ai/execution-checklists/EC_INDEX.md` — EC-141 row Draft → Done
  on completion.
- `docs/ai/STATUS.md` — session-close block prepended.

**Explicitly NOT modified under Phase 1a** (deferred to follow-up WPs):

- `packages/game-engine/src/setup/buildCardDisplayData.ts`
- `packages/game-engine/src/setup/buildHeroDeck.ts`
- Any engine test files reading `card.imageUrl`
- `apps/registry-viewer/src/**`
- `scripts/convert-cards/migrate-renamed-to-v16.mjs`
- The 24 non-bkwd patch files for split-side heroes
- `docs/ai/REFERENCE/api-endpoints.md` — no expected change (no HTTP
  surface added or modified, per D-11804 obligation gate).

---

## Acceptance Criteria (Phase 1a only)

### Registry schema

- `PhysicalCardSchema` exists with required fields: `id`, `count`,
  `imageUrl`, `sides`.
- `HeroSchema.physicalCards` is required and non-empty when `cards[]`
  is non-empty.
- `HeroCardSchema.imageUrl` **stays present** under Phase 1a (removal
  is deferred to Phase 3 follow-up WP).

### Convert pipeline

- `pnpm registry:build` exits 0.
- Running `node scripts/convert-cards/convert-cards-v15.mjs` (without
  `--strict`) produces:
  - Every hero in every set has `physicalCards[]` populated.
  - For solo heroes (no patch with `physicalCards[]`):
    `physicalCards.length === cards.length` and every physicalCard
    has `sides.length === 1`.
  - For `bkwd / falcon-winter-soldier` (the canonical reference patch):
    `physicalCards.length === 4` with 3 split entries (`sides.length === 2`)
    and 1 solo entry (`sides.length === 1`); `physicalCards[].count`
    sum === 14.
  - For all other split-side heroes (no patch yet): convert script
    emits **WARNING** lines listing the candidate paired-equal
    `cardCounts` patterns. Warnings are non-fatal without `--strict`.
- Running with `--strict` (`LEGENDARY_CONVERT_STRICT=1`) **fails**
  with non-zero exit while audit warnings are present. This is the
  expected CI behavior at Phase 1a; CI invocations remain green
  again only after Phase 1b lands all per-set patches.
- Drift validation passes for solo heroes and for the bkwd reference
  patch (`sum(physicalCards counts) === cardCounts per side`).

### Image filenames

- Solo physicalCards: `imageUrl` ends in `-{sideSlug}.webp`.
- Split physicalCards (bkwd reference patch): `imageUrl` ends in
  `-{sortedA}-{sortedB}.webp`, identical regardless of `sides[]`
  declaration order in the patch.

### Drift detection

- A registry test fails loudly when a hero has `cardCounts` populated
  and `physicalCards` counts don't sum to the per-side count.
- A registry test fails loudly when any `cards[].slug` is unresolved
  by `sideToPhysicalCard`.
- A registry test fails loudly on orphan-side membership
  (constraint 8).
- A registry test fails loudly on duplicate-side membership
  (constraint 9).

### Scope enforcement

- Only files listed in `## Files Expected to Change (Phase 1a only)`
  are modified. **No engine source files. No registry-viewer source
  files.** `git diff packages/game-engine/`,
  `git diff apps/registry-viewer/` both empty post-execution.
- `grep -rn 'card\.imageUrl' packages/game-engine/src/ apps/registry-viewer/src/`
  returns the *same* match count as before execution (Phase 2 hasn't
  migrated consumers yet).
- No `Math.random()` introduced.
- No `boardgame.io` import added to pure helpers.

---

## Verification Steps (Phase 1a)

```
# Step 1 — registry build
pnpm --filter @legendary-arena/registry build
# Expected: exits 0

# Step 2 — registry tests (post-WP-137 baseline + 7 new tests + 1 new suite)
pnpm --filter @legendary-arena/registry test
# Expected: TAP — all tests passing; new `physicalCards (WP-138 Phase 1a)`
# describe block contributes exactly 7 passing tests.

# Step 3 — engine build & test stay UNCHANGED (no engine source touched)
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; baseline counts UNCHANGED from pre-WP-138 (post-WP-137).
# This is the proof that Phase 1a did not migrate engine consumers.

# Step 4 — convert pipeline (non-strict; warnings expected)
node scripts/convert-cards/convert-cards-v15.mjs
node scripts/convert-cards/apply-card-counts.mjs
# Expected: zero errors; warnings on paired-equal cardCounts patterns
# without explicit physicalCards declarations (every split hero except
# bkwd/falcon-winter-soldier).

# Step 5 — confirm engine consumer migration did NOT happen
git diff --stat packages/game-engine/ apps/registry-viewer/
# Expected: empty.

# Step 6 — confirm card.imageUrl read sites are UNCHANGED (Phase 2 hasn't run)
grep -c 'card\.imageUrl' packages/game-engine/src/ apps/registry-viewer/src/ -r | head
# Expected: same counts as pre-execution (this is a sanity gate, not a migration).

# Step 7 — confirm Spider-Man (solo) and Falcon/Winter Soldier (reference patch) shapes
node -e "const r = require('./data/cards/core.json'); const h = r.heroes.find(x=>x.slug==='spider-man'); console.log(h.physicalCards.length, h.cards.length);"
# Expected: 4 4   (solo: physicalCards.length === cards.length)

node -e "const r = require('./data/cards/bkwd.json'); const h = r.heroes.find(x=>x.slug==='falcon-winter-soldier'); console.log(h.physicalCards.length, h.cards.length, h.physicalCards.reduce((a,c)=>a+c.count,0));"
# Expected: 4 7 14   (split reference: 4 physical cards, 7 sides, deck size 14)

# Step 8 — confirm a non-curated split hero falls through to solo-auto-path
node -e "const r = require('./data/cards/mgtg.json'); const h = r.heroes.find(x=>x.slug==='gamora'); console.log(h.physicalCards.length, h.cards.length, h.physicalCards.every(p=>p.sides.length===1));"
# Expected: <N> <N> true  where N is the cards count — every physicalCard
# is solo-shaped because no patch has been authored yet (this is the
# Phase 1b worklist; expected non-blocking under Phase 1a).
```

---

## Definition of Done (Phase 1a)

1. WP-138 row in `WORK_INDEX.md` flipped to **Done** with the executing
   commit hash, and clearly marked "Phase 1a — Phase 1b/2/3 to follow".
2. EC-141 row in `EC_INDEX.md` flipped to **Done**.
3. D-13801..D-13806 appended to `docs/ai/DECISIONS.md` in numeric order
   (preserved from draft pass; anchored from `// why:` comments at
   their schema definition sites).
4. All 40 `data/cards/*.json` regenerated; every hero has populated
   `physicalCards[]` (solo-auto-path for un-curated split heroes;
   reference grouping for `bkwd/falcon-winter-soldier`).
5. Registry baseline shifts by exactly +7 tests and +1 suite (no
   engine, no viewer baseline change).
6. **Engine + viewer source UNCHANGED** — confirmed by `git diff --stat`.
7. The 44 unmatched files from the v16 image migration **remain
   unmatched** (R2 image migration is Phase 3). The Wolfsbane Night
   Vision / Wolf Out diagnostic that motivated this WP is **not yet
   resolved end-to-end** under Phase 1a — it requires the Phase 2
   consumer migration (engine + viewer reading from `physicalCards[].imageUrl`)
   plus Phase 3 R2 file rename. Phase 1a delivers the data primitive.
8. Lint gate (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) passed
   at this packet's execution-session start.

---

## Vision Alignment

> Vision §1, §2, §10 (Card content semantics), §10a (Registry Viewer
> surfaces), §3 (Determinism, Fairness, Replay Faithfulness), §22
> (Replays must verify). NG-1..7 not crossed.

- **Vision clauses touched:** §1, §2, §10 (the WP changes the
  registry's data shape for hero cards — physical-card abstraction
  alongside per-side gameplay entries); §10a (the registry-viewer's
  card-rendering paths migrate to the runtime physicalCard index
  during Phase 2; the viewer is the canonical public consumer at
  `cards.barefootbetters.com`); §3 (deck size correctness for
  split-side heroes — the previous sum-per-side cardCounts approach
  silently produced wrong deck reservoirs of 27 instead of 14 for
  Falcon/Winter Soldier; this WP makes the deck primitive
  authoritative); §22 (replay faithfulness preserved by D-13804's
  explicit lock that per-side ext_id grammar from D-13502 is
  unchanged — the per-copy `#<copyIndex>` suffix from WP-137's
  D-13702 layers on top, not under, this WP's physicalCard surface).
- **Conflict assertion:** No conflict — this WP preserves all touched
  clauses. Determinism is strengthened (split-hero deck sizes were
  silently wrong; this WP fixes them by making the deck primitive
  authoritative). Replay faithfulness is preserved across the engine
  change because the per-side ext_id grammar is unchanged; per-copy
  ext_id distinctness landing in WP-137 fans out per-side in lockstep.
  Card data shape extends additively (`physicalCards` is required when
  `cards[]` is non-empty, but solo heroes auto-migrate via the
  convert-script's solo-auto-path so existing data never lacks
  `physicalCards`).
- **Non-Goal proximity check:** None of NG-1..7 are crossed. This WP is
  a registry data-model fix and a tooling extension; it introduces no
  monetization, paid surface, persuasive copy, competitive-ranking
  surface, or social/social-graph affordance. The image migration on
  R2 is asset republishing, not a content-addition surface.
- **Determinism preservation:** Confirmed. The convert script's
  physicalCard ID assignment is locked deterministic (patch declaration
  order for split heroes, `cards[]` array order for solo heroes;
  re-conversions of unchanged input produce byte-identical IDs). The
  `sideToPhysicalCard` runtime index is rebuilt from immutable inputs
  at registry load with no hidden state. The split-pair filename sort
  is locked to ASCII / UTF-16 code-unit ordering per D-13802 — no
  locale-dependent collation. The Phase 2 deck-reservoir change for
  split heroes (when that future WP lands) will run through the
  WP-135 / WP-137 cascade procedure, with the
  `replay.execute.test.ts:PRE_WP080_HASH` literal regenerated in
  lockstep if `computeStateHash` inputs shift.

---

## Funding Surface Gate

N/A — this WP touches no funding affordance, no global navigation, no
profile / account funding attribution surface, no tournament-funding
channel integration, and no user-visible copy referencing donate /
support / tournament-funding. The artifact is a registry-layer schema
addition + tooling extension; no UI surface is added or modified by
this packet. The downstream Phase 2 viewer migration (when that
future WP lands) is a card-rendering path change and likewise carries
no funding-adjacent surface.

---

## API Catalog Update

N/A per D-11804 — this WP touches no `apps/server` HTTP endpoint,
registers no new route via `register*Routes(...)`, modifies no
existing endpoint's URL / method / request shape / response shape /
status codes / auth posture, removes no endpoint, and adds no
`apps/server/src/**` library function recorded in the catalog as
`Library-only`. The change is confined to `packages/registry`,
`scripts/convert-cards/`, and (in future WPs) `packages/game-engine`
and `apps/registry-viewer`. The catalog file
`docs/ai/REFERENCE/api-endpoints.md` is not modified.

---

## Notes on the Lint Gate

This document is a **draft**. Per `.claude/CLAUDE.md §Lint Gate`, executing
WP-138 — committing the schema change, regenerating data, and migrating
consumers — requires the Prompt Lint Gate to be satisfied first. The
lint gate is not invoked at draft-time; it is invoked at session start by
the executing session. If any lint item cannot be satisfied at execution,
that session must STOP and re-scope this WP rather than proceed.
