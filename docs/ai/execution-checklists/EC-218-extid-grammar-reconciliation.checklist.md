# EC-218 — Card ext_id Grammar Reconciliation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-191-extid-grammar-reconciliation.md
**Layer:** Game Engine (`packages/game-engine/src/`)

## Before Starting
- [ ] WP-185 complete ✅ (2026-05-28, EC-212) — `VillainAbilityHook` table, `buildVillainAbilityHooks`, `executeVillainAbilities`, Fight/Ambush fire sites. **This WP changes the keys those hooks are stored under; it does NOT touch the executor, the fire sites, or the vocabulary.**
- [ ] WP-014B complete ✅ (`buildVillainDeck`; copy-indexed villain/henchman zone grammar)
- [ ] WP-167 complete ✅ (villain `copies`; per-copy instance ids, D-16802) — confirm `readVillainCopyCount` exists in `villainDeck.setup.ts`; if not, **STOP and report `BLOCKED`**
- [ ] WP-135/137/138 complete ✅ (hero slash instance grammar; `physicalCards[].count`; canonical face `sides[0]`, D-14101/14102) — confirm `resolveHeroCardCopyCount` is exported from `buildHeroDeck.ts`; if not, **STOP and report `BLOCKED`**
- [ ] WP-018 ✅ (`buildCardStats`), WP-025 ✅ (`buildCardKeywords`, `hasAmbush`), WP-021/022 ✅ (`buildHeroAbilityHooks`, `getHooksForCard`)
- [ ] Read `packages/game-engine/src/villainDeck/villainDeck.setup.ts` (villain instance-id emitter site)
- [ ] Read `packages/game-engine/src/setup/buildHeroDeck.ts` (hero instance-id emitter site)
- [ ] Read `packages/game-engine/src/economy/economy.logic.ts` (villain §2 bug; hero §1b working; §1 dead rows)
- [ ] Read `packages/game-engine/src/setup/buildCardKeywords.ts` + `setup/villainAbility.setup.ts` + `setup/heroAbility.setup.ts` (the three keyed-by-definition/dash builders)
- [ ] Read `packages/game-engine/src/moves/fightVillain.ts`, `villainDeck/villainDeck.reveal.ts`, `moves/coreMoves.impl.ts` — **confirm they pass the zone-instance id today; they MUST stay byte-identical**
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (record baseline test count)

## Locked Values (do not re-derive)
- **Keying invariant:** every key in `G.cardStats`, `G.cardKeywords`, `G.villainAbilityHooks`, `G.heroAbilityHooks` MUST equal an instance ext_id that can appear in a `G` zone. No definition keys, no hero dash/slot keys.
- Villain instance ext_id: `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` — NN zero-padded 2-digit, `00..copies-1` (`copies` via `readVillainCopyCount`, default 1)
- Henchman instance ext_id: `henchman-{groupSlug}-{NN}` (`00..09`) — **unchanged; do not touch**
- Hero instance ext_id: `{setAbbr}/{heroSlug}/{cardSlug}#{copyIndex}` — `cardSlug` = canonical face = `physicalCards[].sides[0]`; `copyIndex` = `0..count-1`; fallback to `resolveHeroCardCopyCount` when `physicalCards` absent
- Single emitter home — villain: `villainCardInstanceExtIds(setAbbr, groupSlug, cardSlug, card)` + `readVillainCopyCount(card)` exported from `villainDeck.setup.ts`
- Single emitter home — hero: `heroCardInstanceExtIds(setAbbr, heroSlug, heroEntry)` exported from `buildHeroDeck.ts`
- `buildVillainDeck` / `buildHeroDeck` shuffled deck output = **byte-identical** (pure extraction)
- `buildCardStats §1b` hero stat keys/values = **byte-identical** (only the id source changes)
- `buildCardStats §1` dead dash hero rows = **left in place** (out of scope, D-18707)
- Villain hook emission order = unchanged: (1) cardId lexical asc, (2) timing per `VILLAIN_ABILITY_TIMINGS`, (3) ability-line index
- Hero hook ability text resolved from the canonical-face `cards[]` entry (`slug === sides[0]`), D-18705
- `VILLAIN_EFFECT_KEYWORDS` / `VILLAIN_ABILITY_TIMINGS` = **unchanged** (no `onEscape`, no `koHeroEachPlayer`)
- Fire sites (`fightVillain.ts`, `villainDeck.reveal.ts`, `coreMoves.impl.ts`) = **byte-identical pre/post**
- Registry FlatCard key (`packages/registry/src/shared.ts`) = **unchanged**; registry + registry-viewer = **untouched**

## Guardrails
- No `@legendary-arena/registry` import in `economy.logic.ts`, `buildCardKeywords.ts`, `villainAbility.setup.ts`, `heroAbility.setup.ts`, or the emitter files (local structural readers stay)
- No `boardgame.io` import in `villainDeck.setup.ts`, `buildHeroDeck.ts`, or any of the four builders (pure helpers)
- **Import-not-duplicate (D-13702 RS-4):** lookup builders import `villainCardInstanceExtIds` / `heroCardInstanceExtIds`; MUST NOT re-implement copy-count resolution or the id-format string locally
- No `.reduce()` for multi-step branching; `for...of` with descriptive loop variables
- Per-copy fan-out emits a freshly-constructed entry per instance ext_id (no aliasing across copies, D-13502)
- Builders soft-skip malformed data (no throws — setup-time builders mirror the deck builder's soft-skip; the validator is the authoritative reporter)
- `G.*` lookup tables stay JSON-serializable (no functions, Maps, Sets, classes)
- Henchman branches in all four builders MUST be byte-identical pre/post (regression-guarded)
- `cardTraits` / `villainDeckCardTypes` / `cardDisplayData` / `attachedBystanders` builders MUST NOT be modified (already instance-keyed; out of scope)
- Gate-consistency (D-18507) preserved at the instance grammar: an `onAmbush` hook's copy-indexed `cardId` must satisfy `hasAmbush(cardId, G.cardKeywords ?? {})`
- Hero hooks key by the canonical-face slash instance id; ability text on a non-canonical face is safe-skip (out of scope)

## Required `// why:` Comments
- `villainCardInstanceExtIds` export: why villain lookups fan out per copy to match the zone instance grammar (D-18704; henchman precedent; D-16802 per-copy attributability)
- `readVillainCopyCount` export + each villain lookup-builder call site: why the resolver is imported from one home, not duplicated (D-13702 RS-4 — divergence causes silent lookup misses)
- `heroCardInstanceExtIds` export: why hero hooks/stats key by the canonical-face slash instance id and not the dash/slot FlatCard key (D-18705 — resolves the slug-vs-slot + slash-vs-dash seam; matches zone + cardStats §1b)
- `buildCardStats §2` villain fan-out: why one stat row per copy instance (was per definition → runtime miss → fightCost 0; D-18704)
- `buildCardStats §1b` change: why sourcing instance ids from the shared emitter is byte-identical (de-dup of the physicalCards walk; no behavior change)
- `buildCardKeywords` villain fan-out: why the `ambush` keyword is emitted under each instance id (was per definition → `hasAmbush` always false at the copy-indexed city id)
- `villainAbility.setup.ts` villain fan-out: why villain hooks now key copy-indexed like henchman hooks (was per definition → `getVillainHooksForCard` miss; D-18704)
- `heroAbility.setup.ts` change: why hooks key by the slash instance id and resolve abilities from `sides[0]` (D-18705; matches `getHooksForCard(args.cardId)` at the play site)
- e2e/invariant test: why failure means a per-card lookup table re-introduced a definition/dash key (regression guard for the whole bug class)

## Files to Produce
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — **modified** — export `villainCardInstanceExtIds` + `readVillainCopyCount`; refactor `buildVillainDeck` section 1 to call the emitter; deck output byte-identical
- `packages/game-engine/src/setup/buildHeroDeck.ts` — **modified** — export `heroCardInstanceExtIds`; refactor the hero instance loop to call it; deck output byte-identical
- `packages/game-engine/src/economy/economy.logic.ts` — **modified** — §2 villain fan-out via `villainCardInstanceExtIds`; §1b sources via `heroCardInstanceExtIds` (byte-identical); §1 + §3 untouched
- `packages/game-engine/src/setup/buildCardKeywords.ts` — **modified** — villain keyword fan-out via `villainCardInstanceExtIds`; henchman path untouched
- `packages/game-engine/src/setup/villainAbility.setup.ts` — **modified** — villain hook fan-out via `villainCardInstanceExtIds`; henchman fan-out + ordering untouched
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — hero hooks via `heroCardInstanceExtIds`, abilities from canonical face `sides[0]`
- `packages/game-engine/src/villainDeck/villainDeck.setup.test.ts` — **modified** — deck output byte-identical; emitter export coverage
- `packages/game-engine/src/setup/buildHeroDeck.test.ts` — **modified** — deck output byte-identical; emitter export coverage
- `packages/game-engine/src/economy/economy.logic.test.ts` — **modified** — villain stat keys copy-indexed; hero §1b unchanged
- `packages/game-engine/src/setup/villainAbility.setup.test.ts` — **modified** — villain hook ids copy-indexed; gate-consistency at instance grammar; henchman unchanged
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — hero hook ids slash-format
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — literal villain/hero ids → instance grammar
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — literal villain/hero ids → instance grammar
- `packages/game-engine/src/setup/extIdReconciliation.e2e.test.ts` — **new** — end-to-end resolution (fightCost/Ambush/Fight/hero ability fire) + reconciliation-invariant guard (no definition/dash key), driven by `buildInitialGameState` on a populated mock registry

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline + N new; **no oracle re-pin**)
- [ ] `pnpm -r build` exits 0
- [ ] Grep: exactly one `export function villainCardInstanceExtIds` and one `export function heroCardInstanceExtIds` (single emitter home each)
- [ ] Grep: `villainCardInstanceExtIds` used in `economy.logic.ts`, `buildCardKeywords.ts`, `villainAbility.setup.ts`; `heroCardInstanceExtIds` used in `economy.logic.ts` + `heroAbility.setup.ts`
- [ ] `git diff --stat` shows zero change to `fightVillain.ts`, `villainDeck.reveal.ts`, `coreMoves.impl.ts`, `packages/registry/src/shared.ts`
- [ ] Grep: zero `@legendary-arena/registry` in the four builders + emitter files; zero `boardgame.io` in the emitter files
- [ ] e2e test asserts villain `fightCost` is spent (non-zero), villain Ambush + Fight effects fire, and a hero ability fires — all via `buildInitialGameState` on a populated registry
- [ ] e2e test asserts the reconciliation invariant: no `cardStats`/`cardKeywords`/`villainAbilityHooks`/`heroAbilityHooks` key is a villain-definition or hero-dash form
- [ ] Henchman regression guard: henchman keys remain `henchman-{group}-NN` in `cardStats` + `villainAbilityHooks`
- [ ] `PRE_WP080_HASH` and `sentinel-core-doom-2p` `finalStateHash` tests pass with their existing pinned values (no edit)
- [ ] `docs/ai/STATUS.md` updated with `### WP-191 Executed` block
- [ ] `docs/ai/DECISIONS.md` updated with D-18704..D-18708 (closes D-18508)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row for WP-191 flipped to `[x]` with completion date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` row for EC-218 flipped to `Done`

## Common Failure Smells
- Collapsing villain zone ids to the definition form "so the lookups match" → **inverts the fix** and breaks D-16802 per-copy attributability; conform lookups TO zones, never the reverse
- Re-implementing `readVillainCopyCount` or the id-format string inside a lookup builder instead of importing the emitter → D-13702 RS-4 violation; the drift it causes is the exact bug being fixed
- Deck-builder refactor changes shuffled deck output → not a pure extraction; reconcile to byte-identical, do NOT re-pin the deck fixtures
- Editing a fire site (`fightVillain.ts` / `villainDeck.reveal.ts` / `coreMoves.impl.ts`) → unnecessary and scope-creep; the fix is builder-only, fire sites already pass the instance id
- Touching `packages/registry/src/shared.ts` or any registry-viewer file → out of scope; the FlatCard key is the registry's display identity, not an engine runtime key
- Removing the dead dash hero rows in `cardStats §1` → out of scope (D-18707); changes `G` content and uiState fixtures for no correctness gain
- Modifying henchman branches or `cardTraits`/`villainDeckCardTypes`/`cardDisplayData`/`attachedBystanders` builders → already consistent; scope-creep
- Adding `onEscape` / `koHeroEachPlayer` "while in here" → WP-186 / WP-189 own those; vocabulary + timings are frozen in this WP
- Hero hooks keyed by `card.slug` without going through `sides[0]` canonical face → drifts from the zone id for double-sided cards; resolve via `heroCardInstanceExtIds`
- e2e test driven by an empty/narrow mock registry → proves nothing (the bug only appears with real cards); the test MUST populate villains-with-copies + a hero deck with `physicalCards` + ability lines
- Re-pinning `PRE_WP080_HASH` / `sentinel-core-doom-2p` → those oracles are empty-registry and MUST NOT change; a diff there means real cards leaked into the oracle path (investigate, don't re-pin)
- Gate-consistency test left asserting definition-form ids → must assert at the copy-indexed instance grammar now
