# WP-137 — Hero Card-Instance ext_id Distinctness + Data-Driven cardCounts

**Status:** Ready (drafted 2026-05-06; not yet executed)
**Primary Layer:** Game Engine / Implementation (with Registry schema additive change)
**Dependencies:** WP-005A (`MatchSetupConfig` field lock), WP-018 (`buildCardStats` sibling-snapshot pattern), WP-111 (`buildCardDisplayData` sibling-snapshot pattern), WP-113 (qualified-ID alignment + replay-hash regression guard), WP-135 (rarity-map locked under D-13501; ext_id format locked under D-13502)

**Supersedes:** the deferred placeholder at `docs/ai/work-packets/WORK_INDEX.md` Phase 7 — *"(deferred placeholder) Extend D-13501 hero rarity → copy-count map to AMWP-class sets"* — recorded 2026-05-04 by WP-135 pre-flight PS-2. WP-137 closes that placeholder by promoting the registry's per-hero `cardCounts` field to authoritative when present, with the rarity map continuing as fallback. The placeholder row is replaced by a back-reference to this WP at execution time.

---

## PS-5 (Mid-Execution Amendment, 2026-05-06)

Pre-flight §6 test allowlist was incomplete. Two integration-level test files contain literal assertions of the WP-135 `<setAbbr>/<heroSlug>/<cardSlug>` ext_id grammar and require cascade updates following D-13702 (`#<copyIndex>` suffix). Changes are mechanical-only — literal-string updates and expected-deck array regeneration; no logic, helpers, matchers, or new tests introduced. Authorized by user 2026-05-06 mid-execution.

**Allowlist additions (under §Files Expected to Change → Modified — tests):**

- `packages/game-engine/src/setup/buildInitialGameState.loadout.test.ts`
- `packages/game-engine/src/setup/buildInitialGameState.determinism.test.ts`

**Strict transformation rule** (applies to PS-5 files AND existing assertions in already-allowlisted test files whose grammar literals need updating):

- Allowed: replace `<set>/<hero>/<card>` with `<set>/<hero>/<card>#<copyIndex>` in expected literals; regenerate hard-coded expected deck arrays preserving order with the only difference being `#copyIndex` suffixes; update object keys in `G.cardStats` / `G.cardDisplayData` lookups.
- Not allowed: logic changes, new tests, restructured assertions, new helpers, widened matchers.
- Determinism test: only difference is `#copyIndex` suffix; ordering unchanged; copy indices match generation order. Any divergence beyond suffix → STOP and escalate.

**Versioning test fix (Category A note):** the existing `migrateArtifact throws... when no migration path is registered` test used `1.0.0 → 1.1.0` as its no-path fixture. WP-137 now registers exactly that key. Fixture changes to a non-existent path (`1.1.0 → 1.2.0`); test intent unchanged.

**Total file count after PS-5:** 21 base files (was 19) + 1 if 01.5 cascade fires.

---

## Session Context

WP-135 locked the hero deck reservoir construction (`buildHeroDeck`), the rarity → copy-count map (D-13501; 5/3/3/3 across `'Common 1' | 'Common 2' | 'Uncommon' | 'Rare'`), and the hero card-instance ext_id format `<setAbbr>/<heroSlug>/<cardSlug>` (D-13502). Two compounding bugs surfaced together: (1) every copy of a hero card receives the same ext_id string, so the post-setup `checkNoCardInMultipleZones` invariant ([gameRules.checks.ts:110](packages/game-engine/src/invariants/gameRules.checks.ts:110)) trips RNG-dependently when the deck shuffle deals duplicate copies into distinct visible zones; and (2) the card data conversion pipeline shipped every hero with `cardCounts: null` because of a path bug (the script was reading the wrong directory, silently returning an empty map), masking the fact that AMWP-class sets need data-driven copy counts (3/3/3/2/2/1) rather than the rarity-map default. Bug (2) was fixed on 2026-05-06 by migrating the conversion pipeline in-repo to `scripts/convert-cards/` (commit cdd37aa) and regenerating `data/cards/*.json`; cardCounts are now populated for the 36 npm-derived sets via `convert-cards-v15.mjs` and for the 4 outlier sets (`2099`, `amwp`, `wpnx`, `wtif`) via the companion `apply-card-counts.mjs`. WP-137 fixes the remaining in-engine consumers; the regenerated card data is a precondition asserted in `## Assumes`.

---

## Goal

After this packet, every hero card-instance ext_id emitted at setup is unique within a match, satisfying the `checkNoCardInMultipleZones` invariant deterministically across all RNG seeds and all 40 sets. The copy-index suffix (`#N`, decimal, zero-indexed) is appended exactly once at the canonical reservoir-construction site, and is fanned out into every ext_id-keyed sibling-snapshot map (`G.cardStats`, `G.cardDisplayData`) so per-copy display, cost, attack, and recruit lookups resolve identically across all copies. The registry's per-hero `cardCounts` field becomes the authoritative source of copy counts when populated; the locked rarity map (D-13501) remains the fallback for sets without patch data. The Option A loud-fail at the rarity map throw site is lifted because the surface is no longer rarity-driven when `cardCounts` is present; cross-set sets (AMWP, 2099) become playable end-to-end without throwing.

---

## Assumes

> List only the specific prior work Claude must verify before writing a single
> line. Reference exact exported names and file paths where possible.

- WP-135 complete. Specifically:
  - `packages/game-engine/src/setup/buildHeroDeck.ts` exports `buildHeroDeck`, `buildHeroDeckCards`, `shuffleHeroDeck`, and `RegistryReader` (WP-135)
  - `packages/game-engine/src/setup/buildHeroDeck.ts` declares `RARITY_COPY_COUNT` and `SUPPORTED_RARITY_LABELS` per D-13501 (WP-135)
  - `G.heroDeck: CardExtId[]` and `fillHqFromDeck` exist (WP-135)
- WP-018 complete. Specifically:
  - `packages/game-engine/src/economy/economy.logic.ts` builds `G.cardStats` keyed by `CardExtId` (WP-018)
  - The hero-card branch builds `stats[extId]` at the line currently numbered 251 (WP-018)
- WP-111 complete. Specifically:
  - `packages/game-engine/src/setup/buildCardDisplayData.ts` builds `G.cardDisplayData` keyed by `CardExtId` (WP-111)
  - The hero-card branch builds the entry at the line currently numbered 327 (WP-111)
- WP-113 complete. Specifically:
  - The replay-hash regression guard exists; the canonical `PRE_WP080_HASH` literal lives in the engine test suite (WP-113)
- The card data conversion pipeline is in-repo at `scripts/convert-cards/` and Phase A (data regeneration) has landed. Specifically:
  - Commit `cdd37aa` (or a later commit whose effect supersedes it) is reachable from `HEAD` — verify with `git log --oneline | Select-String cdd37aa`
  - `scripts/convert-cards/convert-cards-v15.mjs` exists and processes the 36 sets the `@master-strike/data` npm package ships
  - `scripts/convert-cards/apply-card-counts.mjs` exists and processes the 4 outlier sets (`2099`, `amwp`, `wpnx`, `wtif`) the npm package never shipped
  - `data/cards/2099.json` heroes show `cardCounts` populated for the 5/5/3/1 case (e.g., `spider-man-2099` = `{"Retractable Talons":5,"Venomous Fangs":5,"Spider-Silk Webbing":3,"Spider-Sense Telepathy":1}`), not `null` — this is the apply-card-counts.mjs path
  - `data/cards/amwp.json` heroes show `cardCounts` populated for the 3/3/3/2/2/1 case (e.g., `scott-lang-cat-burglar`)
  - `data/cards/core.json` shows `cardCounts` populated for at least one hero with explicit non-null patch entries (e.g., `captain-america`) — this is the convert-cards-v15.mjs path
  - The card data layer is a prerequisite, not a deliverable of WP-137. If any of the above checks fail, this packet is **BLOCKED**: re-run the relevant pipeline script (the main converter for npm-derived sets, the companion for outliers) before proceeding. Do not attempt to work around missing cardCounts in engine code.
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0 (WP-135 baseline `679/148/0` per `WORK_INDEX.md`)
- `pnpm --filter @legendary-arena/registry test` exits 0
- `docs/ai/DECISIONS.md` exists and the most-recent decision is D-13601 (WP-136)
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

> Every reference is local. No external URLs. ARCHITECTURE.md is always first.

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms that
  registry schema changes belong to the registry layer, engine fan-out
  belongs to the engine layer, and neither may import from the other's
  runtime code.
- `docs/ai/ARCHITECTURE.md §Persistence Boundaries` — confirms that fanning
  out per-copy entries in `G.cardStats` and `G.cardDisplayData` does not
  cross the snapshot-counts-only boundary (those maps are runtime, not
  snapshot data).
- `docs/ai/REFERENCE/00.2-data-requirements.md §8.1 Match Configuration` —
  read the locked `MatchSetupConfig` field set (`schemeId`, `mastermindId`,
  `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`, `bystandersCount`,
  `woundsCount`, `officersCount`, `sidekicksCount`). This packet does not
  modify any composition field; it modifies the per-card ext_ids derived
  from `heroDeckIds`.
- `docs/ai/DECISIONS.md` — scan D-10014 (qualified-ID grammar `<setAbbr>/<slug>`),
  D-13501 (rarity → copy-count map + Option A loud-fail), D-13502 (hero
  card-instance ext_id format `<setAbbr>/<heroSlug>/<cardSlug>`). D-13701,
  D-13702, D-13703 land in this packet.
- `packages/game-engine/src/setup/buildHeroDeck.ts` — read entirely before
  modifying. Contains the locked rarity map, the qualified-ID parser, the
  `RegistryReader` interface, the registry walk, and the loud-fail throw
  site.
- `packages/game-engine/src/economy/economy.logic.ts` — read the hero-card
  branch of `buildCardStats` (currently lines ~232–260) before modifying.
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — read the
  hero-card branch (currently lines ~300–340) before modifying.
- `packages/registry/src/schema.ts` — read the comment block above
  `HeroCardSchema` and `HeroSchema`. The schema is permissive by design;
  the `cardCounts` extension is additive, optional, nullable.
- `.claude/rules/architecture.md §Layer Boundary` — registry-vs-engine
  import direction is enforced.
- `.claude/rules/game-engine.md §Throwing Convention` — only `Game.setup()`
  may throw; that surface is preserved (only the rarity-driven trigger
  condition softens).
- `.claude/rules/registry.md §Schema Authority` — `schema.ts` modifications
  require a `DECISIONS.md` entry; D-13701 covers the `cardCounts` addition.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6
  (`// why:` comments), Rule 14 (field names match data contract).
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` §Non-Negotiable
  Constraints — no `Math.random()`, full file contents only, ESM only.
- `docs/ai/work-packets/WP-135-hq-population-and-hero-deck-reservoir.md` —
  context for the rarity map and ext_id format that this WP extends.
- `docs/ai/work-packets/WP-113-engine-server-registry-wiring-and-validator-alignment.md`
  §6 — "import or duplicate locally" precedent that informs the
  `parseQualifiedIdForSetup` duplication pattern this packet preserves.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Persistence Boundaries
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- `buildHeroDeckCards` is the canonical definition site for hero
  card-instance ext_id grammar and the only site that emits the
  reservoir flat array. Build-time fan-out builders (`buildCardStats`,
  `buildCardDisplayData`) may mirror the canonical `#<copyIndex>`
  suffixing solely to populate ext_id-keyed sibling-snapshot maps so
  that `Game.setup()` produces parallel keys. **No runtime consumer**
  (move handlers, projection builders, replay verifiers, UI, etc.) may
  synthesize hero card-instance ext_ids or strip the suffix to look up
  shared data — runtime consumers always do straight lookups by full
  ext_id.
- The suffix grammar is `#<decimal>`, zero-indexed, contiguous, deterministic
  by emit order. No spaces, no leading zeros (`#0`, `#1`, …, `#13`).
- `parseQualifiedIdForSetup` continues to reject inputs containing `/` more
  than once. The `#` separator does not appear inside `MatchSetupConfig`
  field values — it is internal to setup-derived ext_ids only.
- Hero card-instance ext_ids MUST NOT be embedded unencoded in URLs.
  The `#` character is the URL fragment delimiter; an ext_id like
  `core/captain-america/perfect-teamwork#3` placed raw into a URL is
  truncated at the `#` by every browser, leaving the fragment client-only
  and unrecoverable server-side. If an ext_id ever has to traverse a
  URL (query string, path segment, etc.) it must be percent-encoded
  (`#` → `%23`). This is a forward-safety guardrail; the current code
  paths use JSON over WebSocket and have no per-card ext_ids in URLs.
- `RARITY_COPY_COUNT` (the locked D-13501 map) remains in the file as the
  documented fallback when `cardCounts` is absent or malformed. The map
  values do not change.
- The name-keyed `cardCounts` resolution + rarity-map fallback logic
  MUST be expressed identically across all three sites
  (`buildHeroDeckCards` in `buildHeroDeck.ts`, the hero branch of
  `buildCardStats` in `economy.logic.ts`, and the hero branch of
  `buildCardDisplayData` in `buildCardDisplayData.ts`). **Locked author
  choice (RS-4 resolution):** a single shared helper `resolveHeroCardCopyCount`
  is defined as a **named non-default export** in
  `packages/game-engine/src/setup/buildHeroDeck.ts` and imported by the
  other two sites within the same package (no layer issue — all three
  files are in `packages/game-engine/src/`). The helper signature is:
  `resolveHeroCardCopyCount(card: { name?: string; rarityLabel: string }, nameLookup: Map<string, number>): number | null`
  — returns the resolved positive integer copy count, or `null` when
  both sources fail (the caller in `buildHeroDeckCards` throws on
  `null`; the callers in `buildCardStats` / `buildCardDisplayData`
  treat `null` as "fall through silently" since their throw surface is
  reserved for `Game.setup()` proper). The per-hero `nameLookup: Map<string, number>`
  is built once at the top of each hero loop in each of the three
  sites by a sibling helper `buildCardCountsNameLookup(cardCounts: unknown): Map<string, number>`
  also exported from `buildHeroDeck.ts`. The shared-helper choice is
  preferred over byte-for-byte duplication because (a) patch locality
  is improved (a future bug fix in count resolution touches one file,
  not three), (b) it reuses the established `RegistryReader` /
  `parseQualifiedIdForSetup` precedent of cross-file imports inside
  the engine package, (c) the grep gate becomes a positive assertion
  ("each of the three sites imports `resolveHeroCardCopyCount`")
  rather than a divergence-detection assertion. The 100-seed
  regression test catches gross divergence; the grep gate enforces
  the import-from-canonical pattern.
- The Option A loud-fail throw at the rarity-map miss site is **lifted**
  only for the case where per-card `cardCounts` supplies the count
  authoritatively. If `cardCounts` is present but the specific card
  display name is missing from it (or the value is non-positive /
  non-integer / non-number) AND the rarityLabel is also unrecognized,
  the throw remains.
- `packages/registry/src/schema.ts` is a locked contract per
  `.claude/rules/registry.md §Schema Authority`. The only permitted change
  is the additive optional `cardCounts` field on `HeroSchema`. No other
  field is renamed, removed, narrowed, or widened.
- No file under `packages/preplan/**` is modified. Preplan does not
  duplicate hero deck reservoir construction (verified during pre-flight);
  if execution discovers a parallel implementation, STOP and add a
  follow-up WP rather than fan out.
- Replay schema version is bumped exactly once, in
  `packages/game-engine/src/versioning/versioning.types.ts`. The migration
  function in `versioning.migrate.ts` rewrites legacy ext_ids by appending
  `#0` to bare hero card-instance entries; legacy replays are documented as
  expected to fail re-verification because the shuffle order shifts.
- Every `ctx.events.setPhase()` and `ctx.events.endTurn()` call site
  remains untouched — this packet does not modify turn or phase flow.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the
  human before proceeding — never guess or invent field names, type
  shapes, or file paths.
- If pre-flight discovers that the card data regeneration has not landed
  (i.e., `data/cards/2099.json` heroes still show `cardCounts: null`, or
  `data/cards/core.json/captain-america.cardCounts` is `null` despite the
  upstream patch having values), STOP and report BLOCKED on the
  `## Assumes` precondition. Do not attempt to work around missing data
  in engine code. Remediation is to re-run the in-repo pipeline:
  `node scripts/convert-cards/convert-cards-v15.mjs` for the 36
  npm-derived sets, then `node scripts/convert-cards/apply-card-counts.mjs`
  for the 4 outlier sets — both run from the repo root. WP-137 itself
  must not modify any file under `scripts/convert-cards/` or `data/cards/`.
- If pre-flight discovers a `#`-using ext_id elsewhere in the codebase
  (e.g., URL anchors, route fragments, fixture filenames) that could
  collide with the new copy-index syntax, STOP and propose an alternative
  separator before continuing.

**Locked contract values:**

- **MatchSetupConfig fields** (unchanged by this WP):
  `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`,
  `sidekicksCount`

- **Phase names** (unchanged): `'lobby'` | `'setup'` | `'play'` | `'end'`

- **TurnStage values** (unchanged): `'start'` | `'main'` | `'cleanup'`

- **PlayerZones keys** (unchanged):
  `deck` | `hand` | `discard` | `inPlay` | `victory`

- **GlobalPiles keys** (unchanged):
  `bystanders` | `wounds` | `officers` | `sidekicks`

- **Hero card-instance ext_id format (post-WP-137):**
  `<setAbbr>/<heroSlug>/<cardSlug>#<copyIndex>` (D-13502 extended by D-13702)

- **Copy-index suffix grammar:** `#<decimal>`, zero-indexed, no leading
  zeros, contiguous from `#0` to `#(N-1)` where N is the copy count
  for the (hero, card) pair

- **`RARITY_COPY_COUNT` map values** (unchanged from D-13501; fallback only):
  `{ 'Common 1': 5, 'Common 2': 3, 'Uncommon': 3, 'Rare': 3 }`

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection.

- The unshuffled flat array produced by `buildHeroDeckCards` is fully
  determined by `(heroDeckIds, registry)` — no RNG involvement before
  shuffle. Asserting `Set.size === Array.length` on the output of
  `buildHeroDeckCards` is sufficient to detect the WP-137 bug regression
  before any RNG runs.
- The replay-hash regression guard from WP-113 is the canary for the
  fan-out: if `G.cardStats` or `G.cardDisplayData` keys diverge from the
  flat reservoir, `computeStateHash` shifts and the canonical hash
  literal mismatches. The guard fails loudly.
- `JSON.stringify(G)` succeeds after every state-mutating operation and
  the post-setup invariant `checkNoCardInMultipleZones` passes
  deterministically across at least 100 distinct RNG seeds.
- A new `// why:` comment at the rarity-map fallback site cites D-13701
  (`cardCounts` precedence) and D-13501 (rarity-map fallback) so future
  readers understand why both branches exist.
- **Multiset invariant for post-mortem debugging:** for any hero in the
  reservoir, the multiset of base ext_ids (each `<setAbbr>/<heroSlug>/<cardSlug>#<copyIndex>`
  with the `#<copyIndex>` suffix stripped) equals the resolved copy
  counts produced by the count-resolution helper for that hero. A
  reservoir built from `cardCounts: { "Avengers Assemble!": 5,
  "Perfect Teamwork": 3 }` against a hero whose `cards[]` contains
  matching name → slug pairs `{ "Avengers Assemble!" → "avengers-assemble" }`
  and `{ "Perfect Teamwork" → "perfect-teamwork" }` must produce
  exactly 5 occurrences of `<...>/avengers-assemble` and exactly 3
  occurrences of `<...>/perfect-teamwork` (each with distinct `#N`
  suffixes). This invariant is the single most useful diagnostic for
  silent count-resolution drift between the three sites and for
  detecting orphan-key handling regressions.

---

## Scope (In)

> File count is intentionally bundled. The fan-out sites are tightly coupled:
> `G.cardStats` and `G.cardDisplayData` must share the exact ext_id key set
> emitted by `buildHeroDeckCards`, otherwise consumers that look up display
> or cost data for a card-instance pulled from the deck silently miss. A
> split would either land the engine in a broken state between sub-WPs or
> require contract-only and implementation-only halves with extra
> coordination cost; the bug-fix nature of the change makes the bundled
> form lower-risk than the split form.

### A) `buildHeroDeckCards` — emit per-copy distinct ext_ids; honour `cardCounts` when present

- **`packages/game-engine/src/setup/buildHeroDeck.ts`** — modified:
  - Add an optional `cardCounts: Record<string, number> | null | undefined`
    read off the hero entry (the same hero-level field the registry
    surfaces from the patch). The field is keyed by card display **name**
    (e.g., `"Retractable Talons": 5`, `"Avengers Assemble!": 5`),
    matching the upstream patch shape — it is **NOT** keyed by `slug`.
    The engine handles the name-vs-slug asymmetry by building a per-hero
    `name → count` lookup from `cardCounts` once at the top of the hero
    loop (when `cardCounts` is present and non-null), then resolving each
    card's count via `nameLookup.get(card.name)`. A **valid `cardCounts`
    entry** is defined narrowly as a value satisfying ALL three predicates:
    (1) `typeof value === 'number'`, (2) `Number.isInteger(value) === true`,
    (3) `value >= 1`. Any value failing any predicate (`0`, negative,
    non-integer float, `NaN`, string, object, etc.) is treated as
    invalid and falls through to the rarity-map branch on
    `card.rarityLabel`. The emitted ext_id grammar
    `<setAbbr>/<heroSlug>/<cardSlug>#<copyIndex>` continues to use
    `slug` — only the count resolution is name-keyed. This keeps
    consumer-side ext_id lookups slug-driven and isolates the
    name-vs-slug normalization to a single seam at the count-resolution
    site.
  - **Optional `card.name` handling (RS-2 resolution).** `HeroCardSchema.name`
    is `optional()` per `packages/registry/src/schema.ts:65`. When `card.name`
    is `undefined` (some sets — e.g., `anni` — ship cards with only `slug`
    and `imageUrl`), `nameLookup.get(card.name)` evaluates to
    `nameLookup.get(undefined)` which yields `undefined` and falls through
    to the rarity-map branch on `card.rarityLabel`. This is correct by
    construction (the missing-card-name fallback case covers it) and is
    documented here so future maintainers do not change the predicate.
    No separate test is added because the missing-card-name fallback test
    in §G already exercises this code path.
  - Per-card emission order remains `cards[]` order × per-copy emit
    order (`#0` then `#1` then ... then `#(N-1)`) regardless of which
    branch (`cardCounts` vs rarity-map) supplied the count `N`.
    Switching a single card between the two branches must not change
    its relative position in the reservoir, only the number of copies
    emitted. This preserves the WP-113 replay-hash regression guard's
    determinism property across mixed-source loadouts (some cards
    counted from `cardCounts`, others from the rarity map within the
    same hero).
  - In the copy loop, append the suffix `#${copyIndex}` (template literal,
    no leading zero) to the ext_id once per copy. The base form
    `<setAbbr>/<heroSlug>/<cardSlug>` is preserved as the prefix, satisfying
    D-13502 grammar with the additive D-13702 suffix.
  - Add `// why:` comment at the `cardCounts`-vs-rarity-map fork citing
    D-13701 (cardCounts authoritative when present), D-13501 (rarity-map
    fallback), and the deferred-placeholder closure recorded by D-13703.
  - Add `// why:` comment at the suffix append site citing D-13702 (suffix
    grammar) and the `Set.size === Array.length` invariant tested in (D).
  - The Option A loud-fail throw remains only when **both** copy-count
    sources fail for a given card: the per-hero `nameLookup.get(card.name)`
    derived from `cardCounts` does not yield a positive integer **AND**
    `RARITY_COPY_COUNT[card.rarityLabel]` is absent. The error message
    enumerates both attempted sources (the missing card display name and
    the unrecognized rarity label) so the operator can fix the patch
    file or extend the rarity map as appropriate.
  - `parseQualifiedIdForSetup` is unchanged. The `RegistryReader` interface
    is unchanged. The `RARITY_COPY_COUNT` and `SUPPORTED_RARITY_LABELS`
    constants are unchanged.

### B) `G.cardStats` fan-out — one entry per copy with identical values

- **`packages/game-engine/src/economy/economy.logic.ts`** — modified:
  - In the hero-card branch of `buildCardStats` (currently around line 251),
    apply the same name-keyed `cardCounts` lookup with rarity-map fallback
    that `buildHeroDeckCards` uses (build a per-hero `name → count`
    lookup once at the top of the hero loop; resolve each card via
    `nameLookup.get(card.name)`; fall back to `RARITY_COPY_COUNT[card.rarityLabel]`
    on miss). The resolution logic must produce identical copy counts to
    `buildHeroDeckCards` for any given (hero, card) pair, otherwise the
    fan-out keys diverge from the reservoir keys. For each card, emit one
    `stats[extId#i]` entry per copy with identical `attack`, `recruit`,
    `cost`, `fightCost: 0`. Suffix grammar is identical to (A).
  - Add `// why:` comment citing D-13702 (key fan-out) and the consumer
    requirement that all copies resolve to the same numeric values.
  - The villain and henchman branches are unchanged. Henchman virtual-copy
    ext_ids (`henchman-{groupSlug}-{NN}`) already use a distinct
    pre-existing per-copy form and do not adopt the `#N` suffix.

### C) `G.cardDisplayData` fan-out — one entry per copy with identical display payload

- **`packages/game-engine/src/setup/buildCardDisplayData.ts`** — modified:
  - In the hero-card branch (currently around line 327), apply the same
    name-keyed-lookup-with-rarity-fallback pattern as (B) so the resolved
    copy count matches `buildHeroDeckCards` exactly. Copy the resolved
    display payload (`name`, `imageUrl`, etc.) once per copy.
  - Add `// why:` comment citing D-13702 and noting that the count
    resolution mirrors (A) and (B) — divergence between the three sites
    causes silent display-data lookup misses for some copies.

### D) Registry schema — additive optional `cardCounts` field on `HeroSchema`

- **`packages/registry/src/schema.ts`** — modified:
  - On `HeroSchema`, add `cardCounts: z.record(z.string(), z.number().int().min(1)).nullable().optional()`.
  - The field is at the hero level (not inside `HeroCardSchema`) because
    the upstream patch is keyed `cardName → count`, where `cardName`
    matches the per-card `name` (NOT `slug`). Document this in the
    schema comment block above `HeroSchema` with one explicit sentence:
    *"`cardCounts` keys are card display names from the upstream
    dataset; the engine resolves them against `cards[].name` and emits
    ext_ids using `cards[].slug`."* This makes the name-vs-slug
    asymmetry visible at the schema authority surface so future
    contributors don't reinvent the wrong key lookup in another
    consumer. The engine's lookup site lives in `buildHeroDeck.ts` and
    is mirrored byte-for-byte in `economy.logic.ts` and
    `buildCardDisplayData.ts` per Scope (B) and (C).
  - Add a `// why:` comment citing D-13701 (cardCounts authoritative; data
    contract update) and the `.claude/rules/registry.md §Schema Authority`
    requirement for a DECISIONS.md entry on schema changes.

### E) Versioning bump + replay artifact migration

> **PS-1 + PS-2 resolution (2026-05-06 pre-flight):** WP-137 §E originally
> named `versioning.types.ts` as the bump site, but that file is type-only
> (no exported constants). The actual constants live in
> `versioning.check.ts`. The original §E also under-specified the migration
> shape; the existing framework keys migrations on **engine-version triples**
> via `migrationRegistry: Readonly<Record<MigrationKey, MigrationFn>>`
> (see `packages/game-engine/src/versioning/versioning.migrate.ts:28`).
> §E now names the exact files, axes, and migration key.

- **`packages/game-engine/package.json`** — modified:
  - Bump `"version": "1.0.0"` → `"version": "1.1.0"`. The engine-version
    constant in `versioning.check.ts` and `package.json:version` are kept
    in lockstep per the comment block at `versioning.check.ts:22–28`.

- **`packages/game-engine/src/versioning/versioning.check.ts`** — modified:
  - Bump `CURRENT_ENGINE_VERSION_VALUE` from `{ major: 1, minor: 0, patch: 0 }`
    to `{ major: 1, minor: 1, patch: 0 }`. This is the **engine axis** bump
    per D-0801 — engine reducer behavior changed (hero card-instance ext_id
    grammar gained the `#<copyIndex>` suffix; `G.cardStats` and
    `G.cardDisplayData` key sets fan out per copy).
  - Bump `CURRENT_DATA_VERSION` from `{ version: 1 }` to `{ version: 2 }`.
    This is the **data axis** bump per D-0801 — the wire shape of
    `ReplayInput` changes (hero ext_ids inside `ReplayMove.args` gain
    `#N` suffixes).
  - Add a `// why:` comment at each bump citing D-13702 (suffix grammar)
    and D-13701 (data-driven cardCounts). The two bumps occur together
    because the WP-137 surface change is simultaneously a behavior
    change (engine axis) and a wire-shape change (data axis).

- **`packages/game-engine/src/versioning/versioning.migrate.ts`** — modified:
  - Define a new exported pure function
    `migrateHeroExtIdsForCopyIndex(payload: unknown): unknown` that:
    1. Returns `payload` unchanged when it is not a plain object or
       does not satisfy a minimal `ReplayInput`-shaped guard
       (`typeof payload === 'object' && payload !== null && Array.isArray((payload as { moves?: unknown }).moves)`).
       The migration is best-effort: unknown payload shapes pass through
       untouched rather than throwing.
    2. Walks `(payload as ReplayInput).moves[]`. For each move's `args`
       (which is `unknown` per `ReplayMove.args`), recursively walks
       string fields and rewrites any string that satisfies ALL of the
       following grammar predicates:
       - contains exactly two `/` separators
       - contains no `#` character
       - matches the regex `^[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-]+$` against
         the full string
       — by appending `#0`. This narrow matcher prevents accidental
       mutation of villain / mastermind / henchman / scheme ext_ids
       (which use the registry's hyphen-form `FlatCard.key` grammar
       `setAbbr-cardType-groupSlug-cardSlug`, structurally
       distinguishable by the absence of `/` separators), prevents
       mutation of partial paths or arbitrary user-supplied strings that
       happen to contain slashes, and is forward-safe against future
       ext_id grammars that may use additional `/` segments.
    3. Returns a **new** payload object with the same top-level fields
       but a rewritten `moves` array. Per WP-028 D-2802 aliasing
       prevention, the migration must not return a reference that
       shares structure with the input.
    4. The recursion strategy for `args` (which is `unknown`): for each
       arg, check `typeof arg === 'string'` and apply the rewrite; for
       `Array.isArray(arg)` recurse into each element; for plain objects
       (`arg !== null && typeof arg === 'object'`) recurse into each
       value. Numbers, booleans, null, and undefined pass through
       unchanged. The recursion is bounded by the args' actual depth;
       no max-depth guard is added (move args are author-controlled
       structures of bounded depth in practice).
  - Replace the empty registry literal (`Object.freeze({})` at line 28)
    with:
    ```ts
    export const migrationRegistry: Readonly<Record<MigrationKey, MigrationFn>> =
      Object.freeze({
        '1.0.0->1.1.0': migrateHeroExtIdsForCopyIndex,
      });
    ```
    The key format `'1.0.0->1.1.0'` matches `buildMigrationKey` in
    `versioning.check.ts:73–78` and `versioning.migrate.ts:99–104`.
  - Add a `// why:` comment above the migration function stating the
    contract verbatim:
    *"This migration is best-effort schema compatibility only — it
    prevents `#`-absent crashes in legacy ext_ids by appending `#0`.
    It does NOT guarantee semantic equivalence: pre-WP-137 replays are
    expected to fail re-verification because shuffle order shifts
    under the new copy-index convention (the reservoir flat-array
    composition changes when copy counts change between
    `cardCounts`-authoritative and rarity-map-fallback branches).
    Operators inspecting old replays should treat pre-WP-137 fixtures
    as historical artifacts."*
  - The migration may NOT throw — if the payload shape is unexpected,
    return it unchanged. `migrateArtifact<T>` (the existing public API)
    is the throw surface; this `MigrationFn` is a pure transformer per
    its existing type contract `(payload: unknown) => unknown`.

### F) Replay producer fixture regeneration

- **`apps/replay-producer/samples/three-turn-sample.inputs.json`** —
  modified: regenerated by re-running the replay producer against the
  post-WP-137 engine. The new fixture's hero card-instance ext_ids carry
  `#N` suffixes.

### G) Tests

Add `node:test` tests:

- **`packages/game-engine/src/setup/buildHeroDeck.test.ts`** — modified:
  - Add: `buildHeroDeckCards` output has unique ext_ids
    (`new Set(out).size === out.length`).
  - Add: when a hero entry's `cardCounts` is populated **and** every
    key in `cardCounts` matches some `card.name` in that hero's `cards[]`
    (i.e., no orphan keys), the resolved hero contribution to the
    reservoir length equals `Object.values(cardCounts).reduce((a, b) => a + b, 0)`
    (sum is one of the few permitted reductions per `.claude/rules/code-style.md`
    — single-step accumulation with no branching).
  - Add: when `cardCounts` is absent or `null`, the rarity-map fallback
    yields 14 cards per hero across the four-label set.
  - Add: when `cardCounts` contains an **orphan entry** whose key is a
    card display name not present in any of the hero's `cards[].name`
    values (e.g., a typo in the upstream patch), the orphan entry is
    silently ignored — does not throw, does not change the emitted
    reservoir length, and does not appear as an ext_id in the output.
  - Add: when `cardCounts` is present but is **missing** a particular
    card's `name` (or has a non-positive / non-integer value at that
    key), that specific card falls through to the rarity-map branch on
    its `rarityLabel`, exactly as if `cardCounts` had no usable entry
    for it. Other cards in the same hero whose names ARE in `cardCounts`
    use the data-driven count.
  - Add: a hero card for which **both** sources fail — the
    `nameLookup.get(card.name)` does not yield a positive integer
    **AND** `card.rarityLabel` is not a key of `RARITY_COPY_COUNT` —
    causes `Game.setup()` to throw with a full-sentence error citing
    both attempted paths (the missing card name and the unrecognized
    rarity label).
  - Add: drift test — RARITY_COPY_COUNT keys still equal
    `SUPPORTED_RARITY_LABELS` exactly.
- **`packages/game-engine/src/economy/economy.logic.test.ts`** — modified:
  - Add: `G.cardStats` keys form a superset of the hero deck reservoir
    ext_ids; per-copy keys carry identical numeric values.
- **`packages/game-engine/src/setup/buildCardDisplayData.test.ts`** —
  modified:
  - Add: per-copy keys carry identical display payloads.
- **`packages/game-engine/src/invariants/gameRules.checks.test.ts`** —
  modified:
  - Add: integration test running `Game.setup()` 100 times across distinct
    RNG seeds with a hero loadout that pre-WP-137 was known to trip
    `checkNoCardInMultipleZones`. All 100 setups pass. `// why:` comment
    cites D-13702 and identifies the regression class (RNG-dependent
    duplicate-ext_id-in-distinct-visible-zones).
  - The integration test must run under `node:test` only; no
    `boardgame.io/testing` import. Use `makeMockCtx` from
    `src/test/mockCtx.ts`.

---

## Known Data Anomaly (RS-1)

> **Pre-flight 2026-05-06 surfaced a content-data discrepancy that
> WP-137 will silently bake in if executed as drafted. Documented here
> so the bake-in is intentional and traceable, not silent.**

`data/cards/core.json/captain-america.cardCounts` is generated as
`{"Avengers Assemble!":3,"Perfect Teamwork":4,"Diving Block":6,"A Day Unlike Any Other":7}`
(sum **20**), but the apparent source of truth at
`scripts/convert-cards/inputs/hero-card-counts.json` `core.captain-america`
is `{"Avengers Assemble!":5,"Perfect Teamwork":5,"Diving Block":3,"A Day Unlike Any Other":1}`
(sum **14** — the canonical Marvel Legendary tabletop value). The
generated values do not match the source — the conversion pipeline
(`scripts/convert-cards/convert-cards-v15.mjs`) is producing different
cardCounts for `core/captain-america` than its input declares.

Survey of all sets at WP-137 draft time:

- `data/cards/2099.json` (5 of 5 heroes populated): all sums equal 14.
- `data/cards/amwp.json` (8 of 8 heroes populated): all sums equal 14.
- `data/cards/core.json` (3 of 15 heroes populated): captain-america
  sum 20 (anomalous); nick-fury sum 14; spider-man sum 14. The other
  12 core heroes have `cardCounts: null` and use the rarity-map
  fallback (sum 14).

After WP-137 lands, captain-america's hero deck contribution becomes
20 cards. This diverges from the canonical 14-cards-per-hero rule and
from the upstream input data. The fix surface (data layer + pipeline)
is explicitly out-of-scope for WP-137 per `## Out of Scope` —
`scripts/convert-cards/**` and `data/cards/**` cannot be modified by
this packet.

**Acceptance:** WP-137 ships with the pipeline drift baked in. A
separate follow-up data-layer task (recorded as a `mcp__ccd_session__spawn_task`
chip at pre-flight time, 2026-05-06) is responsible for investigating
why `convert-cards-v15.mjs` produces values that don't match
`hero-card-counts.json` and re-running the pipeline to regenerate
`data/cards/*.json` with corrected values. After that follow-up lands,
captain-america's reservoir contribution will return to 14 with no
WP-137 code change required (the engine reads whatever the data layer
provides). Until then, captain-america loadouts will play with a
20-card hero deck.

**Why ship anyway:** the captain-america anomaly does not block the
WP-137 bug-fix surface (per-copy ext_id distinctness +
`checkNoCardInMultipleZones` invariant compliance). Ten of fifteen
core heroes ship correct values; all 2099 and amwp heroes ship correct
values. Holding WP-137 for a data-layer fix would block the 100-seed
RNG-dependent invariant violation from being resolved across all
sets, which is the higher-priority bug. Captain-america-specific play
correctness can wait for the data-layer follow-up.

---

## Out of Scope

- No modification of `MatchSetupConfig` shape, `MatchSnapshot` shape, or any
  composition-block field. Per-card ext_ids never appear in setup
  composition; counts in snapshots are unaffected by per-copy fan-out.
- No modification of villain, henchman, mastermind, scheme, or bystander
  ext_ids. Those formats stay as locked under their respective WPs.
- No modification of files under `packages/preplan/**`. Preplan reads
  engine state via host-app projections per
  `.claude/rules/architecture.md §Pre-Planning Layer`; it does not
  duplicate hero deck reservoir construction (verified at draft time;
  re-verify during pre-flight).
- No modification of `apps/server/**`. The server is a wiring layer and
  has no per-card-instance ext_id concerns.
- No modification of `apps/arena-client/**`. UI consumers look up display
  data by full ext_id; the fan-out in (B) and (C) makes per-copy lookups
  resolve identically without UI changes.
- No modification of `apps/registry-viewer/**`. Viewer surfaces the
  hero-level data, not per-card-instance ext_ids.
- No modification of `scripts/convert-cards/**` or `data/cards/**`.
  The card-data conversion pipeline lives in-repo as of commit `cdd37aa`
  (2026-05-06); the upstream `bbcode/modern-master-strike` repo is no
  longer part of this repo's pipeline. The converter path fix is a
  precondition asserted in `## Assumes` (RS-6 resolution).
- No grep-audit of every place in the codebase that uses `#` characters.
  A targeted check during pre-flight (Verification Step 5 below) is
  sufficient; a comprehensive `#`-character audit is out of scope.
- No unification of hero ext_id grammar (slash form) with villain /
  mastermind / henchman ext_id grammar (hyphen form). That divergence
  predates WP-137 and is not in scope here. If unification is desired
  later, file a separate WP.
- No `RARITY_COPY_COUNT` map extension to AMWP-class rarity labels
  (`'Common 3'`, `'Uncommon 2'`, etc.). Once `cardCounts` populates from
  the upstream patch, the rarity-map fallback is no longer the load-bearing
  path for those sets, so extension is unnecessary. If a set is
  later added that has neither `cardCounts` data nor a mapped rarity
  label, that is a content-drift bug to surface via the loud-fail throw
  and address in its own WP.
- No refactor or cleanup unrelated to the per-copy distinctness fix.

---

## Files Expected to Change

> Complete list. Every file is either `**new**` or `**modified**`. No other files may be modified.

- `packages/game-engine/src/setup/buildHeroDeck.ts` — **modified** — append `#N` copy index; honour `cardCounts` from hero entry; soften loud-fail to require both fallbacks missing
- `packages/game-engine/src/setup/buildHeroDeck.test.ts` — **modified** — distinctness invariant; cardCounts authority; rarity fallback; missing-both throw; drift test
- `packages/game-engine/src/economy/economy.logic.ts` — **modified** — fan out hero `stats[extId]` to one entry per copy
- `packages/game-engine/src/economy/economy.logic.test.ts` — **modified** — assert per-copy parity of `G.cardStats`
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — **modified** — fan out hero `displayData[extId]` to one entry per copy
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` — **modified** — assert per-copy parity of `G.cardDisplayData`
- `packages/game-engine/src/invariants/gameRules.checks.test.ts` — **modified** — 100-seed regression test for `checkNoCardInMultipleZones` post-setup
- `packages/game-engine/package.json` — **modified** — bump `"version"` from `"1.0.0"` to `"1.1.0"` (engine-axis bump in lockstep with `versioning.check.ts:CURRENT_ENGINE_VERSION_VALUE`)
- `packages/game-engine/src/versioning/versioning.check.ts` — **modified** — bump `CURRENT_ENGINE_VERSION_VALUE` to `{1,1,0}` and `CURRENT_DATA_VERSION` to `{version:2}` (PS-1 resolution: this file owns the constants, not `versioning.types.ts`)
- `packages/game-engine/src/versioning/versioning.migrate.ts` — **modified** — define `migrateHeroExtIdsForCopyIndex` and register at key `'1.0.0->1.1.0'` (PS-2 resolution: registered MigrationFn replacing the empty frozen registry)
- `packages/game-engine/src/versioning/versioning.test.ts` — **modified** — assert `migrationRegistry['1.0.0->1.1.0']` is registered and that `migrateHeroExtIdsForCopyIndex` rewrites bare hero ext_ids to `#0`-suffixed form while leaving villain/mastermind/henchman/scheme ext_ids untouched
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** — cascade per WP-128 D-12807 / WP-135 cascade template: capture pre-edit `PRE_WP080_HASH` (`'2baeecc3'`), run engine test post-edit, update literal **iff** hash diverges; record pre/post pair in §Verification Steps Step 7. **01.5 IS INVOKED** as a conditional cascade — the per-copy fan-out in `G.cardStats` and `G.cardDisplayData` changes `computeStateHash` inputs; literal regeneration is value-only under the cascade, no logic change. (PS-3 resolution.)
- `packages/registry/src/schema.ts` — **modified** — additive optional `cardCounts: Record<string, number>` on `HeroSchema`
- `packages/registry/src/registry.smoke.test.ts` — **modified** — assert `cardCounts` populates for at least one set with patch data and remains absent (or `null`) for at least one set without
- `apps/replay-producer/samples/three-turn-sample.inputs.json` — **modified** — regenerate after engine change; new ext_ids carry `#N`
- `docs/ai/STATUS.md` — **modified** — record WP-137 completion + capability delta (cross-set hero loadouts now playable)
- `docs/ai/DECISIONS.md` — **modified** — D-13701, D-13702, D-13703 inserted in numeric order
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-137 with completion date; replace the deferred placeholder row with a back-reference

No other files may be modified.

---

## Vision Alignment

> Vision §3 (Determinism, Fairness, Replay Faithfulness), §8 (RNG sourcing — `ctx.random.*` only), §22 (Replays must verify), §1, §2, §10 (Card content semantics), §10a (Registry Viewer surfaces). NG-1..7 not crossed.

- **Vision clauses touched:** §3, §8, §22, §1, §2, §10, §10a.
- **Conflict assertion:** No conflict — this WP preserves all touched clauses.
  Determinism is strengthened (the per-copy distinctness fix removes an
  RNG-dependent invariant violation that was previously tripping
  `checkNoCardInMultipleZones`); replay faithfulness is preserved across
  the engine change because the canonical replay-hash regression guard
  from WP-113 fails loudly on key-set divergence and is updated in
  lockstep; `ctx.random.*` remains the sole randomness source. Card data
  shape extends additively (hero-level `cardCounts: Record<string, number> | null`)
  with the registry schema modification governed by D-13701 per
  `.claude/rules/registry.md §Schema Authority`.
- **Non-Goal proximity check:** None of NG-1..7 are crossed. This WP is
  a determinism bug fix and a registry data-contract additive change;
  it introduces no monetization, paid surface, persuasive copy, or
  competitive-ranking surface.
- **Determinism preservation:** Confirmed. The single
  `ctx.random.Shuffle` call site in `shuffleHeroDeck` is unchanged; the
  reservoir flat-array construction order is unchanged (rarity-map
  iteration order × `cards[]` order × per-copy emit order); the
  copy-index suffix is appended deterministically by emit order so
  identical `(heroDeckIds, registry)` inputs produce identical output
  byte sequences. The replay-hash regression guard is the canary; it
  must continue to pass (or its golden literal is regenerated and the
  regeneration is documented in `## Verification Steps`).

---

## Funding Surface Gate

N/A — this WP touches no funding affordance, no global navigation, no
profile / account funding attribution surface, no tournament-funding
channel integration, and no user-visible copy referencing donate /
support / tournament-funding. Pure engine + registry-schema bug-fix WP;
no UI surface is added or modified.

---

## API Catalog Update

N/A — this WP touches no `apps/server` HTTP endpoint, registers no new
route via `register*Routes(...)`, modifies no existing endpoint's URL /
method / request shape / response shape / status codes / auth posture,
removes no endpoint, and adds no `apps/server/src/**` library function
recorded in the catalog as `Library-only`. The change is confined to
`packages/game-engine` and `packages/registry` plus a single
`apps/replay-producer` fixture regeneration.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### A) Distinctness invariant
- [ ] `buildHeroDeckCards` returns an array where `new Set(out).size === out.length` for every loadout in the test suite (drift test added in `buildHeroDeck.test.ts`)
- [ ] For any hero card where `nameLookup.get(card.name)` returns a value satisfying the "valid `cardCounts` entry" predicate (typeof number, integer, ≥1), NO throw path inside `buildHeroDeck.ts` is reachable for that card regardless of the value of `card.rarityLabel` — including unrecognized labels. Tested explicitly with a fixture hero whose `cardCounts` is fully populated and whose `rarityLabel` values are intentionally outside `SUPPORTED_RARITY_LABELS`.
- [ ] For any hero card where `RARITY_COPY_COUNT[card.rarityLabel]` resolves, NO throw path is reachable for that card regardless of `cardCounts` presence, absence, malformedness, or orphan-only state. Tested explicitly with a fixture hero that has `cardCounts: null` and standard rarity labels, and a second fixture with `cardCounts: { "Some Other Card": 5 }` (orphan only) and standard rarity labels.

### B) cardCounts authority
- [ ] `buildHeroDeckCards` invoked with a hero entry whose `cardCounts: { "Avengers Assemble!": 5, "Perfect Teamwork": 3 }` and whose `cards[]` contains entries `{ name: "Avengers Assemble!", slug: "avengers-assemble", ... }` and `{ name: "Perfect Teamwork", slug: "perfect-teamwork", ... }` produces ext_ids `<setAbbr>/<heroSlug>/avengers-assemble#0..#4` (5 entries) and `<setAbbr>/<heroSlug>/perfect-teamwork#0..#2` (3 entries), regardless of the cards' `rarityLabel` values — the count is sourced by the card's display **name**, the ext_id is built from the card's **slug**
- [ ] `buildHeroDeckCards` invoked with a hero whose registry entry has `cardCounts: null` falls back to the rarity-map and produces 14 cards per hero across the four-label set
- [ ] `buildHeroDeckCards` invoked with a hero whose `cardCounts` map references a card name not present in the hero's `cards[]` (e.g., a typo in the upstream patch) silently ignores the orphan entry rather than throwing — the same card without a `cardCounts` entry falls through to the rarity-map fallback as if `cardCounts` had not mentioned it at all

### C) Fan-out parity (reservoir coverage)
- [ ] Define **the post-setup hero card-instance ext_id set** as the union of `G.hq` (visible HQ slots; first 5 ext_ids) and `G.heroDeck` (remaining draw pile). Order is not asserted — only set membership. For every ext_id in this set, `G.cardStats[ext_id]` exists. Every group of per-copy sibling keys (the `#0..#(N-1)` entries for the same `(setAbbr, heroSlug, cardSlug)` triple) has identical `attack`, `recruit`, `cost`, and `fightCost: 0` values across the group. `Object.keys(G.cardStats)` may include additional ext_ids beyond the hero reservoir (villains, henchmen, masterminds) — that's fine; the test asserts hero-reservoir coverage, not equality.
- [ ] Using the same post-setup hero card-instance ext_id set defined above, for every ext_id in the set, `G.cardDisplayData[ext_id]` exists. Every group of per-copy sibling keys has identical `name` and `imageUrl` values across the group.

### D) Invariant regression test
- [ ] The new 100-seed integration test in `gameRules.checks.test.ts` runs `Game.setup()` 100 times and `checkNoCardInMultipleZones` passes on all 100 (pre-WP-137 the same loadout trips the invariant on at least 1 of 100 seeds)

### E) Schema additivity
- [ ] `HeroSchema.parse({ ...validHeroFromCorePatch })` succeeds (no `cardCounts` field)
- [ ] `HeroSchema.parse({ ...validHeroWith2099CardCounts })` succeeds and preserves the `cardCounts` field on the parsed object

### F) Versioning bump + replay artifact migration
- [ ] `packages/game-engine/package.json` `"version"` reads `"1.1.0"` (engine-axis bump in lockstep with `versioning.check.ts`)
- [ ] `packages/game-engine/src/versioning/versioning.check.ts` exports `CURRENT_ENGINE_VERSION_VALUE` as `{ major: 1, minor: 1, patch: 0 }` and `CURRENT_DATA_VERSION` as `{ version: 2 }`
- [ ] `packages/game-engine/src/versioning/versioning.migrate.ts` exports `migrateHeroExtIdsForCopyIndex(payload: unknown): unknown` and `migrationRegistry` contains exactly one entry at key `'1.0.0->1.1.0'` mapping to that function
- [ ] `migrateHeroExtIdsForCopyIndex`, applied to a legacy `ReplayInput`-shaped payload, rewrites every bare hero card-instance ext_id (matching `<setAbbr>/<heroSlug>/<cardSlug>` with no `#`) found inside `moves[].args` to `<...>#0` and leaves villain / mastermind / henchman / scheme ext_ids (which lack `/` separators) and partial paths untouched. Returns `payload` unchanged when the shape does not match `ReplayInput`'s minimal guard. Never throws.

### G) Replay-hash regression guard
- [ ] The WP-113 replay-hash regression guard either passes against the existing canonical hash literal, OR the literal is regenerated and the regeneration is documented in `## Verification Steps` Step 7 with the pre-WP-137 → post-WP-137 hash pair recorded

### H) Layer boundary preserved
- [ ] `packages/game-engine/src/setup/buildHeroDeck.ts` does not import from `@legendary-arena/registry` (confirmed with `Select-String`)
- [ ] `packages/registry/src/schema.ts` does not import from `@legendary-arena/game-engine` (confirmed with `Select-String`)

### Tests
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] No test file imports from `boardgame.io` or `boardgame.io/testing`
- [ ] Drift test: `RARITY_COPY_COUNT` keys exactly equal `SUPPORTED_RARITY_LABELS`

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

pnpm --filter @legendary-arena/registry build
# Expected: exits 0, no TypeScript errors

# Step 2 — full test run
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — all tests passing, 0 failing; baseline 679/148/0 plus N new tests

pnpm --filter @legendary-arena/registry test
# Expected: TAP output — all tests passing, 0 failing

# Step 3 — confirm the precondition: cardCounts populated across both pipeline paths
# Phase A (commit cdd37aa) has two entry points; Step 3a checks the
# convert-cards-v15.mjs path (npm-derived sets), Step 3b checks the
# apply-card-counts.mjs path (4 outlier sets). Both must show populated
# cardCounts before WP-137 can execute.

# Step 3a — npm-derived set (via convert-cards-v15.mjs)
node -e "const d = JSON.parse(require('node:fs').readFileSync('data/cards/core.json','utf8')); const cap = d.heroes.find(h => h.slug === 'captain-america'); console.log(JSON.stringify(cap.cardCounts))"
# Expected: a non-null object — NOT 'null'

# Step 3b — outlier set (via apply-card-counts.mjs)
node -e "const d = JSON.parse(require('node:fs').readFileSync('data/cards/2099.json','utf8')); console.log(JSON.stringify(d.heroes[0].cardCounts))"
# Expected: a non-null object such as {"Retractable Talons":5,"Venomous Fangs":5,"Spider-Silk Webbing":3,"Spider-Sense Telepathy":1} — NOT 'null'

# Step 3c — confirm Phase A commit is reachable from HEAD
git log --oneline | Select-String -SimpleMatch cdd37aa
# Expected: at least one matching line; absence means the in-repo pipeline migration has not landed and WP-137 is BLOCKED

# Step 4 — confirm no Math.random call-sites anywhere in the engine
# why: per 00.3 §18, this grep is function-call-scoped (open-paren after the
# token) so prose hits in JSDoc / comment blocks discussing the forbidden
# token (e.g., 'Never use Math.random()') do not surface as false positives.
# The full forbidden-token list lives in D-3701; this grep targets call-sites
# specifically, not prose.
Select-String -Path "packages\game-engine\src" -Pattern "Math\.random\s*\(" -Recurse
# Expected: no output

# Step 5 — confirm no '#'-using ext_id collision in the codebase
Select-String -Path "packages\game-engine\src", "packages\registry\src", "apps" -Pattern '#\d' -Recurse | Where-Object { $_.Line -match 'CardExtId|ext_id|extId' }
# Expected: only matches inside the WP-137 fan-out sites and tests; no collisions in unrelated route fragments, URL anchors, or fixture filenames

# Step 6 — confirm no boardgame.io import in pure helpers
# why: per 00.3 §18, this grep is import-scoped (`from '...'` enclosure) so
# prose hits in module-header JSDoc that already discusses 'No boardgame.io
# import' (authored under WP-135) do not surface as false positives. The full
# forbidden-import list lives in D-3701; this grep targets actual ESM import
# statements specifically, not prose.
Select-String -Path "packages\game-engine\src\setup\buildHeroDeck.ts", "packages\game-engine\src\economy\economy.logic.ts", "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "from\s+['""]boardgame\.io['""]"
# Expected: no output

# Step 7 — replay-hash regression guard
pnpm --filter @legendary-arena/game-engine test -- --test-name-pattern "replay.*hash"
# Expected: TAP output — passing. If the canonical hash literal had to be regenerated, the new hash pair (pre / post) is documented in this verification step at execution time.

# Step 8 — confirm no files outside scope were changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change

# Step 9 — confirm replay-producer fixture regenerated
node -e "const d = JSON.parse(require('node:fs').readFileSync('apps/replay-producer/samples/three-turn-sample.inputs.json','utf8')); const moves = JSON.stringify(d); if (!/\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+#\d/.test(moves)) { console.error('FAIL: fixture has no #N-suffixed hero ext_id'); process.exit(1); } console.log('ok')"
# Expected: 'ok'

# Step 9b — RS-5 resolution: confirm only the .inputs.json fixture was regenerated.
# The replay-producer samples directory contains three sibling files
# (three-turn-sample.cmd.txt, .inputs.json, .sequence.json). WP-137 allowlists only
# .inputs.json. If the producer regeneration touches the other two siblings,
# halt and either (a) extend the WP allowlist via mid-execution amendment if the
# changes are mechanical regenerations, or (b) revert the unintended files.
git diff --name-only apps/replay-producer/samples/
# Expected: exactly one line — apps/replay-producer/samples/three-turn-sample.inputs.json
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (all test files; baseline `679 / 148 / 0` → `(679 + N) / 150 / 0` with `N ≥ 8` new tests and suite delta `+2` per RS-3 — one new `describe()` in `buildHeroDeck.test.ts` for cardCounts resolution + one in `gameRules.checks.test.ts` for the 100-seed regression)
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] `data/cards/2099.json` heroes show populated `cardCounts` (the WP-137 precondition is held)
- [ ] No `Math.random` in any file under `packages/game-engine/src` (confirmed with `Select-String`)
- [ ] No `boardgame.io` import in `buildHeroDeck.ts`, `economy.logic.ts`, or `buildCardDisplayData.ts` (confirmed with `Select-String`)
- [ ] No `@legendary-arena/registry` import in `buildHeroDeck.ts` (confirmed with `Select-String`)
- [ ] WP-135 outputs (`buildHeroDeck.ts` `RegistryReader` interface, `RARITY_COPY_COUNT` map values, `SUPPORTED_RARITY_LABELS` array, `parseQualifiedIdForSetup`, `shuffleHeroDeck`, `buildHeroDeck` exports) preserve their existing surfaces — only the `buildHeroDeckCards` body changes (confirmed with `git diff`)
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — "WP-137 — Hero card-instance distinctness + data-driven cardCounts" entry recorded; capability delta documented (AMWP-class and 2099-class hero loadouts now playable end-to-end across all RNG seeds)
- [ ] `docs/ai/DECISIONS.md` updated — D-13701, D-13702, D-13703 inserted in numeric order with rationale and alternatives-rejected entries
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-137 checked off with today's date; the deferred placeholder row at Phase 7 is replaced with a one-line back-reference to WP-137
