# WP-191 — Card ext_id Grammar Reconciliation: Conform Lookup Tables to Zone Instance IDs (Engine)

## Goal

Make every per-card lookup table in `G` (`cardStats`, `cardKeywords`,
`villainAbilityHooks`, `heroAbilityHooks`) keyed by the **exact instance
ext_id the card carries in `G` zones**, so that villain `Fight:` / `Ambush:`
effects, villain `fightCost`, and hero ability effects actually resolve
end-to-end in real games. Today there is a grammar split (recorded in
D-18508): villain deck/city cards are copy-indexed
(`core-villain-brotherhood-magneto-00`) while `cardStats` / `cardKeywords` /
`villainAbilityHooks` key villains by the definition id
(`core-villain-brotherhood-magneto`); and hero zone instances are slash-format
(`core/black-widow/strike#0`) while `heroAbilityHooks` key by the dash-format
registry FlatCard key (`core-hero-black-widow-{slot}`). Both mismatches make
the runtime `G.cardStats[cardId]` / `getVillainHooksForCard(...)` /
`getHooksForCard(...)` lookups **miss**: villain `fightCost` defaults to `0`,
villain `hasAmbush` is always false, villain `onFight` / `onAmbush` hooks never
fire, and hero abilities never fire. Henchmen already work because both sides
are copy-indexed. This WP conforms the four lookup builders to emit the
instance grammar (fanning out per copy, exactly as henchmen already do), so the
existing fire sites — which already pass instance ext_ids — start hitting. No
fire-site code changes; the entire fix lives in the setup-time builders.

> **Why this is a prerequisite, not a nice-to-have.** WP-185 (✅ landed) wired
> the villain Fight/Ambush executor and keyed its hooks by the **definition**
> ext_id deliberately, to stay gate-consistent with `buildCardKeywords` and
> `buildCardStats` (D-18507) and satisfy the unit/gate tests — but flagged
> (D-18508) that this never resolves end-to-end in real games. WP-186 (Escape
> + Overrun) and WP-189 (`koHeroEachPlayer`) extend the **same** hook table and
> inherit the same broken keying. Until this reconciliation lands, every
> villain-effect WP ships a unit-green / runtime-dead result. This WP closes
> D-18508 and makes WP-185's (and future WP-186/189's) villain effects fire in
> actual matches.

---

## Terminology (three identities, one source of truth)

- **Zone instance CardExtId** — authoritative at runtime; the id a card carries
  in `G` zones (deck, city, hand, discard, …). Copy-indexed for
  villains/henchmen, slash-format for heroes.
- **Definition id / registry FlatCard key** — the registry's display identity
  (`{abbr}-villain-{group}-{card}`, `{abbr}-hero-{hero}-{slot}`); used by the
  registry package and `apps/registry-viewer` only. **Not** an engine runtime
  lookup key.
- **Lookup-table key** — the setup-time artifact under which `cardStats`,
  `cardKeywords`, `villainAbilityHooks`, and `heroAbilityHooks` store per-card
  data. After this WP it **must equal the zone instance CardExtId** (D-18704).

---

## Assumes

- **WP-185 ✅ (2026-05-28, EC-212)** — `VillainAbilityHook` table,
  `buildVillainAbilityHooks`, `executeVillainAbilities`, and the Fight/Ambush
  fire sites landed. This WP changes the **keys** `buildVillainAbilityHooks`
  emits (definition → copy-indexed instance); it does not change the executor,
  the fire sites, or the effect vocabulary.
- **WP-014B ✅** — `buildVillainDeck` (`villainDeck/villainDeck.setup.ts`)
  established the copy-indexed villain/henchman zone-instance grammar
  (`{setAbbr}-villain-{group}-{card}-NN`, `henchman-{group}-NN`) and
  `G.villainDeckCardTypes`. This WP makes that grammar the single source of
  truth that the lookup builders conform to.
- **WP-167 ✅ (D-16701 / D-16802)** — villain card `copies` field; per-copy
  villain instance ext_ids for replay attributability. `readVillainCopyCount`
  is the canonical copy-count resolver (currently private in
  `villainDeck.setup.ts`).
- **WP-018 ✅** — `buildCardStats` (`economy/economy.logic.ts`) and the
  `CardStatEntry` shape (`attack`/`recruit`/`cost`/`fightCost`).
- **WP-025 ✅** — `buildCardKeywords` (`setup/buildCardKeywords.ts`),
  `G.cardKeywords`, `hasAmbush`, `detectAmbush`.
- **WP-021 / WP-022 ✅** — `HeroAbilityHook`, `buildHeroAbilityHooks`
  (`setup/heroAbility.setup.ts`), `executeHeroEffects`, `getHooksForCard`.
- **WP-135 / WP-137 / WP-138 ✅ (D-13501 / D-13502 / D-13701 / D-13702 /
  D-14101 / D-14102)** — hero card-instance slash grammar
  (`{setAbbr}/{heroSlug}/{cardSlug}#{copyIndex}`), `physicalCards[].count`,
  canonical face = `sides[0]`, and `resolveHeroCardCopyCount` (already exported
  from `buildHeroDeck.ts`). **D-13702 RS-4 lock** is the governing precedent:
  the copy-count resolver is **imported, not duplicated**, across builders to
  prevent silent lookup-miss drift — this WP applies the same lock to villain
  copy-count / instance-id emission.
- `packages/registry/src/shared.ts` `flattenSet()` generates the dash-format
  FlatCard `key` (`{abbr}-hero-{hero.slug}-{card.slot}`,
  `{abbr}-villain-{group.slug}-{card.slug}`). This is the **registry's display
  identity** and is **NOT changed** by this WP — only the engine's runtime
  lookup-table keys change.
- All replay/snapshot determinism oracles
  (`replay/replay.execute.test.ts` `PRE_WP080_HASH`,
  `replay/replayFixtures.test.ts` `sentinel-core-doom-2p` `finalStateHash`,
  `snapshot/snapshot.create.test.ts`) run against **empty/narrow mock
  registries** — no set-specific villain/hero cards enter zones or lookup
  tables, so this grammar change is invisible to them. **No existing oracle
  re-pins** (verified at scoping; consistent with the D-18508 re-pin note,
  which was for an additive whole-`G` field, not card content).
- **Drafting baseline:** `origin/main @ 845d876` (2026-05-28).

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — Game Engine
  layer; no registry runtime import; setup feeds data once.
- `docs/ai/ARCHITECTURE.md §Card Data Flow: Registry into Game Engine` —
  registry → engine at setup time only; engine never queries registry at
  runtime.
- `docs/ai/ARCHITECTURE.md §Zone & Pile Structure` — zones store CardExtId
  strings only; zones are the runtime source of truth for card identity.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — `CardExtId` type alias;
  `ext_id` naming; `copies` on villain cards; `physicalCards` / `sides` /
  `slot` / `slug` on hero cards.
- `docs/ai/REFERENCE/00.6-code-style.md` — no `.reduce()` in zone/effect
  application; full English names; JSDoc on every function; `// why:` comments.
- `docs/ai/DECISIONS.md` — scan **D-16802** (per-copy villain instance ext_ids
  for attributability — zones stay instance-keyed; do not collapse to
  definition), **D-13502** (per-copy fresh object literals; no aliasing),
  **D-13702 / RS-4** (import-not-duplicate copy-count resolver — the precedent
  this WP follows for villains), **D-14101 / D-14102** (canonical face =
  `sides[0]`; per-copy fan-out via `physicalCards[].count`), **D-18507**
  (gate-consistency reasoning: hook creation and `hasAmbush` gating must agree
  on card identity — preserved here at the instance grammar), **D-18508** (the
  flag this WP closes).
- `.claude/rules/architecture.md §Core Invariants` + `§Layer Boundary` —
  determinism; `G` runtime-only; zone contents are CardExtId strings.
- `.claude/skills/legendary-game-engine/SKILL.md` — Engine layer enforcement
  (loads on demand during engine WP execution).
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — **canonical
  villain/henchman instance-id emitter site.** Section 1 builds villain
  instances `{setAbbr}-villain-{group}-{card}-NN` via `readVillainCopyCount`;
  this WP exports that emission as a shared function.
- `packages/game-engine/src/setup/buildHeroDeck.ts` — **canonical hero
  instance-id emitter site.** Builds `{setAbbr}/{heroSlug}/{cardSlug}#{copy}`
  from `physicalCards[]` (canonical face `sides[0]`) with the
  `resolveHeroCardCopyCount` fallback; this WP exports that emission as a
  shared function.
- `packages/game-engine/src/economy/economy.logic.ts` — `buildCardStats`.
  Villain section (§2) keys by the definition FlatCard key (the bug); hero §1b
  already keys by the slash instance (works). §1 emits dead dash-format hero
  rows (never read; explicitly **out of scope** to remove here).
- `packages/game-engine/src/setup/buildCardKeywords.ts` — villain keyword
  emission keys by definition (the bug); henchmen are not keyworded.
- `packages/game-engine/src/setup/villainAbility.setup.ts` — villain hooks key
  by definition (the bug); henchman hooks already fan out copy-indexed (works,
  unchanged).
- `packages/game-engine/src/setup/heroAbility.setup.ts` — hero hooks key by the
  dash-format FlatCard `card.key` (the bug); must emit the slash instance id
  instead, resolving abilities from the canonical face.
- **Fire sites (read to confirm they need NO change):**
  `packages/game-engine/src/moves/fightVillain.ts` (`fightCost`,
  `executeVillainAbilities(..., 'onFight')`),
  `packages/game-engine/src/villainDeck/villainDeck.reveal.ts`
  (`hasAmbush` gate + `executeVillainAbilities(..., 'onAmbush')`),
  `packages/game-engine/src/moves/coreMoves.impl.ts`
  (`executeHeroEffects(..., args.cardId)`). All three already pass the
  zone-instance ext_id; once the lookup tables are conformed, they hit
  unchanged.

---

## Problem Statement (Grammar Split)

The engine identifies a card three different ways and never reconciled them:

1. **In `G` zones** (deck, city, hand, discard, …) a card carries its
   **instance** ext_id — copy-indexed for villains/henchmen
   (`core-villain-brotherhood-magneto-00`) and slash-format for heroes
   (`core/black-widow/strike#0`). This is deliberate: per-copy ids keep escapes
   and KOs attributable across replays (D-16802).
2. **In the per-card lookup tables** built at setup, villains and heroes are
   keyed by their **definition** identity — the registry FlatCard key
   (`core-villain-brotherhood-magneto`, `core-hero-black-widow-{slot}`).
3. **At runtime**, moves look up by the **zone** id: `G.cardStats[cardId]`,
   `getVillainHooksForCard(hooks, cardId, timing)`, `getHooksForCard(hooks,
   cardId)`, `hasAmbush(cardId, G.cardKeywords)`. Because the keys are
   definition-form and `cardId` is instance-form, every villain and hero lookup
   **misses**.

The misses are silent (each lookup has a `?? 0` / empty-array / `=== false`
fallback), so the bug never throws — it just makes villain combat free
(`fightCost` 0), suppresses every villain Ambush, and makes every villain and
hero ability dead text. Henchmen are the control group: both their zone ids and
all their lookup keys are copy-indexed (`henchman-{group}-NN`), so henchman
`Fight:` effects fire end-to-end — which is exactly why WP-185's motivating
"henchman Fight: KO a hero" case worked while the villain cases did not.

The bug is invisible to the test suite because the integration tests
hand-build `G` with self-consistent ids (the test author picks both the city
card id and the lookup-table key), so no test ever wired `buildVillainDeck` +
`buildCardStats` + `buildCardKeywords` + `buildVillainAbilityHooks` together
against a real registry and then played a fight or a reveal. This WP adds that
missing end-to-end coverage.

**Approach (locked by review, 2026-05-28): conform lookups to instances.**
Every per-card lookup table is keyed by the exact instance ext_id in `G` zones.
Zones remain the single source of truth (D-16802 preserved). The lookup
builders fan out one entry per copy — exactly the pattern henchmen already use
and that already works. The alternative (normalize the instance id back to a
definition id at each fire site) was rejected: for heroes the zone id
(`{set}/{heroSlug}/{cardSlug}#{copy}`, slug-based) and the hook key
(`{set}-hero-{heroSlug}-{slot}`, slot-based) differ in two independent ways
(slug-vs-slot and slash-vs-dash), so a fire-site normalizer would need a
registry-derived slug↔slot map stored in `G` — a new per-instance table — which
is nearly as much state as conforming the lookups, while leaving two grammars
in the codebase forever.

To prevent this exact bug class from recurring, the instance-id emission is
**centralized**: one exported emitter per card class (villain, hero) is the
sole producer of instance ext_ids, consumed by both the deck builder and every
lookup builder (import-not-duplicate, per the D-13702 RS-4 lock). After this
WP, a lookup builder cannot drift from the deck builder because they call the
same function.

---

## Scope (In)

- **Canonical keying invariant (D-18704, proposed):** every per-card lookup
  table — `G.cardStats`, `G.cardKeywords`, `G.villainAbilityHooks`,
  `G.heroAbilityHooks` — is keyed by the **exact instance ext_id** that the
  card carries in `G` zones. Lookup builders fan out one entry per copy
  instance; no lookup table is keyed by a definition id. Zones are the single
  source of truth (D-16802 preserved — zone grammar is unchanged).
- **Shared villain instance-id emitter** — export
  `villainCardInstanceExtIds(setAbbr, groupSlug, cardSlug, card)` and
  `readVillainCopyCount(card)` from `villainDeck.setup.ts`. The function returns
  the copy-indexed instance ext_ids
  `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` (NN zero-padded 2-digit,
  `00..copies-1`). `buildVillainDeck`'s existing section-1 inner loop is
  refactored to call it. **Deck output (post-sort, post-shuffle) must be
  byte-identical** — pure extraction, no behavior change. The emitter returns
  ids in copyIndex-ascending order, performs **no sorting**, and is a pure
  function (safe to call repeatedly); consumers use the returned array order.
- **Shared hero instance-id emitter** — export
  `heroCardInstanceExtIds(setAbbr, heroSlug, heroEntry)` from
  `buildHeroDeck.ts`. The function returns the slash-format instance ext_ids
  `{setAbbr}/{heroSlug}/{cardSlug}#{copyIndex}` for the canonical face
  (`physicalCards[].sides[0]`, with the `resolveHeroCardCopyCount` fallback when
  `physicalCards` is absent — the exact algorithm `buildHeroDeck` and
  `buildCardStats §1b` already use). `buildHeroDeck`'s instance loop is
  refactored to call it. **Deck output must be byte-identical.** The emitter
  returns ids in copyIndex-ascending order, performs **no sorting**, and is a
  pure function (safe to call repeatedly); consumers use the returned array
  order.
- **`buildCardStats` villain conformance (§2)** — emit one
  `CardStatEntry` (`attack:0, recruit:0, cost:0, fightCost:<vAttack>`) per
  villain **instance** ext_id from `villainCardInstanceExtIds`, instead of one
  per definition FlatCard key. Henchman section (§3) is unchanged (already
  copy-indexed). Hero §1b is refactored to source its instance ids from
  `heroCardInstanceExtIds` — **output byte-identical** (heroes already work;
  this only removes the duplicated physicalCards walk so §1b and
  `heroAbilityHooks` provably share the emitter).
- **`buildCardKeywords` villain conformance** — when a villain card has the
  `ambush` keyword, emit the keyword array under each villain **instance**
  ext_id from `villainCardInstanceExtIds`, instead of under the single
  definition key. Henchmen remain unkeyworded (D-2302 safe-skip, unchanged).
- **`buildVillainAbilityHooks` villain conformance** — emit one hook per
  (villain **instance** ext_id × matched ability line), fanning out via
  `villainCardInstanceExtIds`, instead of one per definition id. Henchman
  fan-out (already copy-indexed `henchman-{group}-NN`) is unchanged. Stable
  total emission order is preserved: (1) `cardId` lexical ascending,
  (2) `timing` per `VILLAIN_ABILITY_TIMINGS`, (3) ability-line index.
- **`buildHeroAbilityHooks` hero conformance** — emit hooks keyed by the
  slash-format hero **instance** ext_id from `heroCardInstanceExtIds`
  (canonical face), resolving each instance's ability text from the canonical
  face card entry (the `cards[]` entry whose `slug === sides[0]`). One hook per
  (hero instance × ability line), one freshly-constructed hook per instance (no
  aliasing across copies, D-13502). The dash/slot FlatCard `key` is no longer
  used as a runtime lookup key (D-18705, proposed). If the canonical face
  (`sides[0]`) cannot be resolved to a `cards[]` entry, the builder emits **no
  hook** for that instance (safe-skip, no throw), mirroring the deck builder.
- **Gate-consistency preserved (D-18507) at the instance grammar** — both the
  `onAmbush` hook key and the `hasAmbush` gate now resolve on the same
  copy-indexed instance id, so they still agree. The gate-consistency test is
  updated to assert agreement at the instance grammar.
- **New end-to-end + invariant test** — drive `buildInitialGameState` with a
  populated mock registry (a villain group with `copies > 1`, `vAttack`, an
  `Ambush:` line carrying `[effect:captureBystander]`, and a `Fight:` line; a
  hero deck with `physicalCards` + an ability line) and assert: (a) every
  cardId in `G.villainDeck.deck` / `G.city` has a `G.cardStats[cardId]` entry
  and (if applicable) a reachable `cardKeywords` / `villainAbilityHooks` entry;
  (b) every cardId emitted into a player hand/deck has a reachable
  `heroAbilityHooks` entry when its card text has one; (c) playing through a
  fight spends the villain's `fightCost`, an Ambush reveal fires its effect, and
  a hero play fires its ability. Plus a **reconciliation invariant** assertion:
  every `cardStats` / `cardKeywords` / `villainAbilityHooks` / `heroAbilityHooks`
  key is a valid instance key per the Invariant-check definitions (regression
  guard against re-introducing a definition/dash-keyed table). The test **MUST
  NOT** hand-author any lookup-table key — it obtains them solely via
  `buildInitialGameState` and asserts hits using ids that originated in `G`
  deck / city / hand zones, so a "self-consistent fake" cannot pass while still
  broken.
- **Updated unit tests** — `economy.logic.test.ts` (villain stat keys now
  copy-indexed; hero §1b byte-identical), `villainAbility.setup.test.ts`
  (villain hook ids copy-indexed; gate-consistency at instance grammar;
  henchman unchanged), `rules/heroAbility.setup.test.ts` (hero hook ids
  slash-format), `villainDeck/villainDeck.setup.test.ts` and
  `setup/buildHeroDeck.test.ts` (deck output byte-identical + new emitter
  export behavior), `ui/uiState.types.drift.test.ts` and
  `ui/uiState.build.test.ts` (literal villain/hero ids updated to the instance
  grammar).
- **Governance** — STATUS.md entry, DECISIONS.md D-18704..D-18708 (closes
  D-18508), WORK_INDEX.md flip to `[x]`, EC-218 flip to Done.

## Out of Scope

- **Changing the zone-instance grammar.** Zones keep their per-copy instance
  ext_ids (D-16802). This WP conforms lookups **to** the zones, never the
  reverse.
- **Changing the registry FlatCard `key`** (`packages/registry/src/shared.ts`).
  The dash/slot FlatCard key stays as the registry's display identity; the
  registry package and `apps/registry-viewer` are untouched. Their tests
  (e.g. `registry-viewer/src/registry/shared.test.ts`) MUST NOT change.
- **Removing the dead dash-format hero rows in `buildCardStats §1`.** Those
  rows (`core-hero-{slug}-{slot}`) are never read at runtime (no zone id matches
  them); they are harmless dead state and removing them is a separate cleanup
  WP. This WP leaves §1 exactly as-is and changes only §1b's internal sourcing
  (byte-identical output).
- **Henchman keying.** Henchman zone ids and all henchman lookup keys are
  already copy-indexed and consistent; the henchman code paths in all four
  builders are untouched (regression-guarded, not modified).
- **`cardTraits`, `villainDeckCardTypes`, `cardDisplayData`,
  `attachedBystanders` keying.** These are already keyed by the zone instance id
  (emitted in the same loop as the zone instances, or written by instance id at
  runtime). They are not modified (regression-guarded).
- **New effect vocabulary, interactive targeting, or new timings.** `'onEscape'`
  (WP-186) and `koHeroEachPlayer` (WP-189) are not added here. The MVP villain
  vocabulary stays at the five WP-185 keywords; this WP changes only the keys
  under which hooks are stored.
- **Mastermind / scheme / Master Strike keying.** Masterminds, schemes, and
  generic Master Strikes are out of scope; their fight semantics live elsewhere
  (`fightMastermind.ts`) and are not part of this reconciliation.

---

## Files Expected to Change

1. `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — **modified** —
   export `villainCardInstanceExtIds(setAbbr, groupSlug, cardSlug, card)` and
   `readVillainCopyCount(card)`; refactor `buildVillainDeck` section 1 to call
   the emitter. Deck output byte-identical.
2. `packages/game-engine/src/setup/buildHeroDeck.ts` — **modified** — export
   `heroCardInstanceExtIds(setAbbr, heroSlug, heroEntry)`; refactor the hero
   instance loop to call it. Deck output byte-identical.
3. `packages/game-engine/src/economy/economy.logic.ts` — **modified** —
   villain §2 fans out per copy via `villainCardInstanceExtIds`; hero §1b
   sources instance ids via `heroCardInstanceExtIds` (byte-identical output).
   §1 dead dash rows untouched. §3 henchman untouched.
4. `packages/game-engine/src/setup/buildCardKeywords.ts` — **modified** —
   villain keyword emission fans out per copy via `villainCardInstanceExtIds`.
   Henchman path untouched.
5. `packages/game-engine/src/setup/villainAbility.setup.ts` — **modified** —
   villain hook emission fans out per copy via `villainCardInstanceExtIds`.
   Henchman fan-out and emission ordering untouched.
6. `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — hero
   hooks emit slash-format instance ids via `heroCardInstanceExtIds`, abilities
   resolved from the canonical face (`sides[0]`).
7. `packages/game-engine/src/villainDeck/villainDeck.setup.test.ts` —
   **modified** — assert deck output byte-identical; cover the
   `villainCardInstanceExtIds` / `readVillainCopyCount` exports.
8. `packages/game-engine/src/setup/buildHeroDeck.test.ts` — **modified** —
   assert deck output byte-identical; cover the `heroCardInstanceExtIds` export.
9. `packages/game-engine/src/economy/economy.logic.test.ts` — **modified** —
   villain stat keys are copy-indexed instance ids; hero §1b output unchanged.
10. `packages/game-engine/src/setup/villainAbility.setup.test.ts` —
    **modified** — villain hook ids copy-indexed; gate-consistency asserted at
    the instance grammar; henchman cases unchanged.
11. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** —
    hero hook ids are slash-format instance ids.
12. `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** —
    literal villain/hero ext_id fixtures updated to the instance grammar. (These
    tests embed literal `CardExtId` strings to validate UI-state derivations, so
    they must track the engine's zone-instance grammar.)
13. `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** —
    literal villain/hero ext_id fixtures updated to the instance grammar (same
    reason as item 12).
14. `packages/game-engine/src/setup/extIdReconciliation.e2e.test.ts` —
    **new** — end-to-end resolution test + reconciliation-invariant guard
    (drives `buildInitialGameState` with a populated mock registry; asserts
    villain `fightCost` / Ambush / Fight and hero ability resolve, and that no
    lookup key is a definition/dash form).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**

- Full file contents for every new or modified file. **No diffs. No snippets.
  No "show only the changed section."** Output that omits unchanged sections is
  rejected.
- ESM only, Node v22+.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — no
  abbreviations, no nested ternaries, no `.reduce()` in zone/effect application,
  every function has JSDoc, every non-obvious decision has a `// why:` comment.
- All randomness via `ctx.random.*`. **No `Math.random()`. No clocks. No
  filesystem / network / env access from moves or effects.** (See D-3701 for the
  full forbidden-surface list.)
- `G` is JSON-serializable: no functions, classes, Maps, or Sets in
  `G.cardStats`, `G.cardKeywords`, `G.villainAbilityHooks`,
  `G.heroAbilityHooks`, or their descendants.
- Moves never throw. Only `Game.setup()` may throw. The lookup builders are
  setup-time; they soft-skip malformed data (validator is the authoritative
  reporter) and never throw.
- No `@legendary-arena/registry` import from `packages/game-engine`. The
  setup-time registry readers stay local structural interfaces (existing
  pattern).
- No `boardgame.io` import in pure helpers (the emitters and the four builders).

**Packet-specific:**

- **The keying invariant is the contract:** after this WP, every key in
  `G.cardStats`, `G.cardKeywords`, `G.villainAbilityHooks`, and
  `G.heroAbilityHooks` MUST equal an instance ext_id that can appear in a `G`
  zone. No key may be a villain-definition form
  (`{set}-villain-{group}-{card}` with no `-NN`) or a hero dash/slot form
  (`{set}-hero-{slug}-{slot}`). The reconciliation-invariant test enforces this.
- **Import-not-duplicate (D-13702 RS-4 lock):** villain copy-count / instance-id
  emission has exactly one home (`villainCardInstanceExtIds` /
  `readVillainCopyCount` in `villainDeck.setup.ts`) and hero instance-id
  emission has exactly one home (`heroCardInstanceExtIds` in `buildHeroDeck.ts`).
  The lookup builders **import** these; they MUST NOT re-implement copy-count
  resolution or the id-format string locally.
- **Emitters are leaf utilities (no cycles):** the emitter-hosting modules
  (`villainDeck.setup.ts`, `buildHeroDeck.ts`) MUST NOT import from the lookup
  builders that consume them (`economy.logic.ts`, `buildCardKeywords.ts`,
  `villainAbility.setup.ts`, `heroAbility.setup.ts`). The dependency is
  one-directional: lookups → emitters.
- **Byte-identical zone output:** the refactor of `buildVillainDeck` and
  `buildHeroDeck` to call the shared emitters MUST produce byte-identical
  shuffled deck output (same ids, same pre-sort order). This is pure
  extraction — verified by the deck-builder tests retaining their existing
  expected outputs.
- **Byte-identical hero `cardStats §1b` output:** sourcing §1b's instance ids
  from `heroCardInstanceExtIds` MUST NOT change the hero stat keys or values.
  Heroes already resolve correctly; this only de-duplicates the walk.
- **Fire sites are not modified.** `fightVillain.ts`,
  `villainDeck.reveal.ts`, and `coreMoves.impl.ts` MUST be byte-identical
  before and after this WP. The fix is entirely in the setup-time builders.
- **Henchman paths untouched.** The henchman branches in all four builders MUST
  be byte-identical before and after, and a regression test must confirm
  henchman keys remain copy-indexed (`henchman-{group}-NN`).
- **`cardTraits` / `villainDeckCardTypes` / `cardDisplayData` /
  `attachedBystanders` are not touched** — already instance-keyed; modifying
  their builders is out of scope and a scope-creep FAIL.
- **No vocabulary / timing changes.** `VILLAIN_EFFECT_KEYWORDS` and
  `VILLAIN_ABILITY_TIMINGS` are unchanged. No `'onEscape'`, no
  `koHeroEachPlayer`.
- **Hero hooks key by the canonical-face slash instance id (D-18705):** the
  hook's `cardId` is `{setAbbr}/{heroSlug}/{sides[0]}#{copyIndex}` and its
  ability text is resolved from the `cards[]` entry whose `slug === sides[0]`.
  Ability text on a non-canonical face is out of scope (safe-skip; documented).

**Session protocol:**

- If any `## Assumes` item is false at session start (e.g. `readVillainCopyCount`
  is not where stated, or `resolveHeroCardCopyCount` is not exported), stop and
  report `BLOCKED:` with the specific gap. Do not work around.
- If the deck-builder refactor changes shuffled deck output for any fixture,
  stop — the extraction is not pure. Reconcile to byte-identical before
  proceeding; do not re-pin the deck fixtures.
- If conforming a lookup builder surfaces a real card whose data cannot produce
  a consistent instance id (e.g. a hero physical card with an empty
  `sides[]`), the builder soft-skips that card (no hook / no stat row) exactly
  as the deck builder does — do not throw, do not invent an id.

**Locked contract values:**

```
Villain instance ext_id:   {setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}
                           NN = zero-padded 2-digit copy index, 00..copies-1
Henchman instance ext_id:  henchman-{groupSlug}-{NN}            (unchanged)
Hero instance ext_id:      {setAbbr}/{heroSlug}/{cardSlug}#{copyIndex}
                           cardSlug = canonical face = physicalCards[].sides[0]
                           copyIndex = 0..count-1
```

**Invariant-check definitions (enforced in `extIdReconciliation.e2e.test.ts`).**
Defined by suffix/substring **structure**, not segment count — villain group
and card slugs contain hyphens, so a segment-count check would misclassify:

- **Villain instance key (valid):** contains `-villain-` AND ends with two
  digits (matches `/-\d\d$/`).
- **Villain definition key (FORBIDDEN):** contains `-villain-` AND does NOT end
  with `-\d\d`.
- **Hero dash/slot key (FORBIDDEN):** contains `-hero-`.
- **Hero instance key (valid):** contains both `/` and `#` (slash-format
  `{set}/{heroSlug}/{cardSlug}#{copyIndex}`).
- **Henchman key (valid, unchanged):** `henchman-{group}-{NN}` (ends `-\d\d`).

---

## Acceptance Criteria

- [ ] `villainCardInstanceExtIds` and `readVillainCopyCount` are exported from
  `villainDeck.setup.ts`; `heroCardInstanceExtIds` is exported from
  `buildHeroDeck.ts`; the three villain lookup builders import
  `villainCardInstanceExtIds` and `heroAbility.setup.ts` + `economy.logic.ts §1b`
  import `heroCardInstanceExtIds` (no local re-implementation of copy-count or
  id format — grep confirms a single emitter home per class).
- [ ] `buildVillainDeck` and `buildHeroDeck` produce byte-identical shuffled
  deck output for every existing fixture (deck-builder tests pass with their
  current expected values, unmodified).
- [ ] After `buildInitialGameState` with a populated registry, **every** cardId
  in `G.villainDeck.deck` and `G.city` that is a villain has a
  `G.cardStats[cardId]` entry whose `fightCost` equals the card's parsed
  `vAttack` (no `0` default from a miss).
- [ ] A villain whose `Ambush:` line carries `[effect:captureBystander]`
  attaches a bystander when revealed into the City —
  `hasAmbush(cardId, G.cardKeywords)` is `true` for the copy-indexed city id and
  `executeVillainAbilities(..., 'onAmbush')` fires.
- [ ] Fighting a villain whose `Fight:` line carries
  `[effect:koHeroCurrentPlayer]` produces exactly one KO (the effect fires
  through the now-hitting `getVillainHooksForCard` lookup on the copy-indexed
  id).
- [ ] Playing a hero whose ability line carries an MVP keyword fires
  `executeHeroEffects` — `getHooksForCard(G.heroAbilityHooks, cardId)` returns
  the hook for the slash-format played-card id; **and** for every hero `cardId`
  reachable in a player hand/deck whose canonical face carries an MVP-keyword
  ability line, `getHooksForCard` returns at least one hook (hooks are built
  under the right ids, not merely built).
- [ ] **Reconciliation invariant:** every key in `G.cardStats`,
  `G.cardKeywords`, `G.villainAbilityHooks`, and `G.heroAbilityHooks` is a valid
  instance key per the **Invariant-check definitions** (villain ends with
  `-\d\d`; hero contains `/` and `#`; no key contains `-hero-` or is a
  `-villain-` key lacking the `-\d\d` suffix). The e2e test asserts this over a
  populated registry and **MUST NOT hand-author any lookup-table key** — it
  obtains every key via `buildInitialGameState` and asserts hits using ids that
  originated in `G` deck/city/hand zones.
- [ ] Henchman keys remain copy-indexed (`henchman-{group}-NN`) in `cardStats`
  and `villainAbilityHooks` — henchman regression guard passes.
- [ ] Gate-consistency holds at the instance grammar: every villain instance
  that produces an `onAmbush` hook also satisfies
  `hasAmbush(cardId, G.cardKeywords ?? {}) === true`. (One-directional **by
  design** — `hasAmbush` is a broader fast pre-check keyed on the `Ambush`
  prefix while hook emission requires the `Ambush:` colon, D-18507; the reverse
  direction would fail on `Ambush`-without-colon cards and is out of scope.)
- [ ] `fightVillain.ts`, `villainDeck.reveal.ts`, and `coreMoves.impl.ts` are
  byte-identical pre/post (the fire sites are not modified).
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with the
  pre-WP baseline + new tests; no replay/snapshot oracle (`PRE_WP080_HASH`,
  `sentinel-core-doom-2p` `finalStateHash`) is re-pinned.
- [ ] `pnpm -r build` exits 0; `apps/registry-viewer` and `packages/registry`
  are unmodified (grep confirms no change to `packages/registry/src/shared.ts`).

---

## Verification Steps

```pwsh
# Build & test the engine
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test

# Single-emitter-home greps (each must return exactly one definition site)
grep -rn "export function villainCardInstanceExtIds" packages/game-engine/src/
grep -rn "export function heroCardInstanceExtIds" packages/game-engine/src/

# Lookup builders import the emitters (must each return a match)
grep -n "villainCardInstanceExtIds" packages/game-engine/src/economy/economy.logic.ts
grep -n "villainCardInstanceExtIds" packages/game-engine/src/setup/buildCardKeywords.ts
grep -n "villainCardInstanceExtIds" packages/game-engine/src/setup/villainAbility.setup.ts
grep -n "heroCardInstanceExtIds" packages/game-engine/src/setup/heroAbility.setup.ts

# Hero slash-id construction lives ONLY in the emitter (heroes have no inline
# construction exception). These must return zero — the consumers iterate the
# emitter's output, they do not build the slash id locally:
grep -nF '}/${' packages/game-engine/src/setup/heroAbility.setup.ts packages/game-engine/src/economy/economy.logic.ts
grep -nF '}#${' packages/game-engine/src/setup/heroAbility.setup.ts packages/game-engine/src/economy/economy.logic.ts
# (No equivalent blanket villain `-villain-...-NN` grep: henchman paths
# legitimately construct copy-indexed ids inline, so it would false-positive.
# The reconciliation-invariant TEST is the authoritative villain-key guard.)

# Fire sites unchanged (must return zero diff against HEAD before the commit)
git diff --stat -- packages/game-engine/src/moves/fightVillain.ts packages/game-engine/src/villainDeck/villainDeck.reveal.ts packages/game-engine/src/moves/coreMoves.impl.ts

# Registry untouched (must return zero diff)
git diff --stat -- packages/registry/src/shared.ts

# Layer-boundary greps (must each return zero matches)
grep -rn "@legendary-arena/registry" packages/game-engine/src/setup/heroAbility.setup.ts packages/game-engine/src/setup/villainAbility.setup.ts packages/game-engine/src/setup/buildCardKeywords.ts
grep -rn "boardgame.io" packages/game-engine/src/villainDeck/villainDeck.setup.ts packages/game-engine/src/setup/buildHeroDeck.ts

# Reconciliation-invariant + e2e test passes
pnpm --filter @legendary-arena/game-engine test --grep "reconciliation"

# Replay/snapshot oracles must pass WITHOUT re-pinning
pnpm --filter @legendary-arena/game-engine test --grep "PRE_WP080_HASH"
pnpm --filter @legendary-arena/game-engine test --grep "sentinel-core-doom-2p"

# Full monorepo build
pnpm -r build
```

Expected outputs: each emitter `grep` returns exactly one definition site;
each lookup-builder `grep` returns at least one import/use; the fire-site and
`shared.ts` `git diff --stat` return nothing; the layer-boundary greps return
nothing; the hero slash-id construction greps return nothing (construction
lives only in the emitter); the reconciliation/e2e tests pass; the two oracle
greps pass with the existing pinned hashes unchanged.

---

## Definition of Done

- [ ] All Acceptance Criteria items pass.
- [ ] `docs/ai/STATUS.md` updated with a `### WP-191 Executed` block (dated;
  summarizing the four builders conformed, the two shared emitters, the
  fire-sites-unchanged result, and the end-to-end coverage added).
- [ ] `docs/ai/DECISIONS.md` updated with **D-18704..D-18708** (proposed):
  - D-18704: Canonical keying invariant — every per-card lookup table is keyed
    by the exact instance ext_id in `G` zones; lookup builders fan out per copy;
    zones remain the source of truth (D-16802 preserved). Supersedes the
    villain-by-definition keying WP-185 used for gate-consistency (D-18507
    reasoning preserved — gate-consistency now holds at the instance grammar).
    Closes D-18508.
  - D-18705: Hero ability hooks key by the canonical-face slash instance id
    (`{set}/{heroSlug}/{sides[0]}#{copy}`), abilities resolved from `sides[0]`;
    the dash/slot FlatCard `key` is the registry's display identity and is no
    longer an engine runtime lookup key. Resolves the slot-vs-slug seam.
  - D-18706: Instance-id emission is centralized — one exported emitter per card
    class (`villainCardInstanceExtIds`, `heroCardInstanceExtIds`) consumed by the
    deck builder and all lookup builders (import-not-duplicate, per the D-13702
    RS-4 precedent), preventing copy-count / id-format drift across sites.
  - D-18707: The dead dash-format hero rows in `buildCardStats §1` are left in
    place (never read at runtime); their removal is a separate cleanup, out of
    this WP's scope.
  - D-18708: No replay/snapshot oracle re-pins — all existing oracles run
    empty-registry; the new end-to-end test asserts behavior and the keying
    invariant, not a whole-`G` hash.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-191 flipped to `[x]` with
  completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-218 flipped to
  `Done`.
- [ ] No files outside the 14-file `## Files Expected to Change` list were
  modified (in particular: no fire-site file, no registry file, no
  registry-viewer file, no `cardTraits` / `villainDeckCardTypes` /
  `cardDisplayData` / `attachedBystanders` builder).

---

## Vision Alignment

**Vision clauses touched:** §1 (Tabletop faithfulness), §2 (Mechanical
fidelity), §10 (Card-data semantics), §22 (Replay determinism).

**Conflict assertion:** No conflict: this WP preserves all touched clauses. It
makes the engine resolve villain `Fight:` / `Ambush:` effects, villain
`fightCost`, and hero abilities that were silently dead — strictly more
faithful to the printed cards. No mechanic is invented; the effect vocabulary
is unchanged.

**Non-Goal proximity check:** None of NG-1..NG-7 are crossed. This is a pure
engine-correctness change — no PvP framing, no monetization surface, no
scoring/leaderboard change, no UI gating.

**Determinism preservation:** The change is deterministic and replay-faithful
(Vision §22). It introduces no `ctx.random.*` site. Zone contents and shuffle
order are unchanged (the deck builders' output is byte-identical); only the
derived setup-time lookup tables' **keys** change, deterministically, from the
definition/dash grammar to the per-copy instance grammar. Given identical
setup + moves, the game still replays identically. No existing determinism
oracle re-pins (all run empty-registry); the new end-to-end test asserts
behavior and the keying invariant rather than a whole-`G` hash.

---

## Funding Surface Gate

N/A — engine-only correctness WP; no §20.1 trigger surface is touched: no
global-navigation funding affordance, no registry-viewer funding affordance, no
profile funding attribution, no tournament funding-channel integration, and no
user-visible funding copy. The change is confined to setup-time engine lookup
builders and their tests.

---

## API Catalog Update

N/A — engine-only WP; no HTTP endpoint in `apps/server` is added, modified,
removed, or status-changed, and no `apps/server/src/**` library function
recorded in the catalog as `Library-only` is touched. The change is confined to
`packages/game-engine/src/**`.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ |
| 2 | Assumes lists all prerequisites with status (WP-185/014B/167/018/025/021/022/135/137/138 ✅; registry FlatCard source noted) | ✅ |
| 3 | Context (Read First) is specific (file paths + D-entries) | ✅ |
| 4 | Scope (In) / Out of Scope present and closed (≥2 explicit exclusions) | ✅ |
| 5 | Files Expected to Change matches contract; 14 files (6 builders + 7 tests + 1 new e2e) — over the ~8 soft cap, justified below | ✅ (see note) |
| 6 | Non-Negotiable Constraints present; cites 00.6; forbids diffs/snippets | ✅ |
| 7 | Acceptance Criteria are testable bullets (12 items) | ✅ |
| 8 | Verification Steps operator-runnable; greps + git-diff gates exact | ✅ |
| 9 | Definition of Done has binary gates incl. STATUS/DECISIONS/WORK_INDEX/scope-bound | ✅ |
| 10 | Layer boundary preserved — no registry/boardgame.io imports in builders; registry package untouched | ✅ |
| 11 | Identity model N/A — no auth surface | N/A |
| 12 | Test rules: node:test only; no boardgame.io/testing; e2e uses mock registry, no network/DB | ✅ |
| 13 | pnpm commands only; expected output shown | ✅ |
| 14 | Acceptance criteria objective + scope-aligned (§14); specific filenames + token/grammar greps | ✅ |
| 15 | Definition of Done includes STATUS / DECISIONS / WORK_INDEX / scope-bound | ✅ |
| 16 | Code style: full English names, JSDoc, no `.reduce()` in effect application, no premature abstraction (shared emitters used ≥3×) | ✅ |
| 17 | Vision Alignment present; clauses §1/§2/§10/§22; determinism line included | ✅ |
| 18 | Prose-vs-grep: forbidden-token discussion cites D-3701; greps scoped to filenames | ✅ |
| 19 | Bridge-vs-HEAD staleness rule — commit-time discipline | N/A |
| 20 | Funding surface N/A with explicit justification (names why no trigger) | ✅ |
| 21 | API catalog N/A with explicit justification (names why no trigger) | ✅ |

> **§5 file-count note:** 14 files exceeds the ~8-file soft cap in
> `00.1`. The count is test-dominated (7 of 14 are tests) and the scope —
> villain **and** hero reconciliation in one WP — was chosen at review
> (2026-05-28) because both are the same root cause (zone-instance grammar ≠
> lookup-key grammar) and share the same shared-emitter mechanism. Splitting
> villain from hero would leave an intermediate state where one class is
> conformed and the other is not, and would require two end-to-end test passes.
> Each builder and its unit test must move together to keep the suite green, so
> the builder/test pairs are not independently splittable. WP-185 (10–14 files)
> is the local precedent for a single coherent engine change of this size.

---

*Drafted: 2026-05-28 (baseline `origin/main @ 845d876`). Closes the
ext_id-grammar gap recorded in D-18508 during WP-185 execution. Approach
(conform lookups to instances) and scope (villain + hero together) locked by
review on 2026-05-28. Prerequisite for WP-186 / WP-189 villain effects to
resolve end-to-end (both extend WP-185's hook table and inherit its keying).*

*Revised 2026-05-28 (review-hardening pass): added a Terminology block; renamed
the second "Context" → "Problem Statement (Grammar Split)"; added
machine-checkable Invariant-check definitions (suffix-based, not segment-count,
since slugs contain hyphens); added emitter "no-sorting / pure" and
"leaf-utility / no-cycle" constraints; added the hero canonical-face safe-skip
rule and a hero-hook setup-coverage acceptance criterion; hardened the e2e test
to forbid hand-authored lookup keys; annotated gate-consistency as
one-directional by design (declined a "gate ⇒ hook" assertion that would fail
on `Ambush`-without-colon cards); added a hero slash-id construction grep guard.
File count unchanged (no new files).*
