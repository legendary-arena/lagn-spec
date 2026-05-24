# EC-190 — Villain-Deck Display Data Coverage (Execution Checklist)

**Source:** docs/ai/work-packets/WP-172-villain-deck-display-data-coverage.md
**Layer:** Game Engine / Setup

## Before Starting
- [ ] WP-167 ✅ (registry villain `copies` + scheme counts); WP-168 ✅ (engine villain-deck composition); WP-111 / EC-118 ✅ (`G.cardDisplayData`).
- [ ] `packages/game-engine/src/villainDeck/villainDeck.setup.ts` exports `buildVillainDeck` and emits the five WP-168 ext_id grammars (villain copies, henchmen, scheme-twists, villain-deck bystanders, master-strikes).
- [ ] `packages/game-engine/src/setup/buildCardDisplayData.ts` exports `buildCardDisplayData` (2-arg signature today: `registry, matchConfig`).
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (WP-168 baseline 755 / 0 fail).

## Locked Values (do not re-derive)
- `MASTER_STRIKE_COUNT = 5` (D-16801) — inline literal `5`, mirrors `villainDeck.setup.ts:130`.
- `SCHEME_TWIST_COUNT = 8` fallback (D-1411 / D-16702) — inline literal `8`, mirrors `villainDeck.setup.ts:124`.
- Bystander count fallback: `numPlayers` (D-1412) — passed in via the new 3rd parameter, mirrors `context.ctx.numPlayers` in `villainDeck.setup.ts:262`.
- Ext_id grammars (byte-identical to `villainDeck.setup.ts`):
  - `${setAbbr}-villain-${groupSlug}-${cardSlug}-${String(copyIndex).padStart(2, '0')}` for `copyIndex in [0, copies)`, `copies = villainCard.copies ?? 1`.
  - `master-strike-${String(strikeIndex).padStart(2, '0')}` for `strikeIndex in [0, 5)`.
  - `scheme-twist-${schemeSlug}-${String(twistIndex).padStart(2, '0')}` for `twistIndex in [0, scheme.villainDeckTwistCount ?? 8)`.
  - `bystander-villain-deck-${String(bystanderIndex).padStart(2, '0')}` for `bystanderIndex in [0, scheme.villainDeckBystanderCount ?? numPlayers)`.
- **Tiered display resolution per D-17201** (empirically: only 5/40 sets carry `mastermind-strike`, only 4/40 carry `scheme-twist`, several sets lack a `slug === 'bystander'` entry):
  - **Master Strike** — tier-1 mastermind set's `other[]` `cardType === 'mastermind-strike'` first entry; tier-2 `core` set's same entry; tier-3 literal `{ name: 'Master Strike', imageUrl: '' }`.
  - **Scheme Twist** — name is always literal `'Scheme Twist'`; imageUrl: tier-1 scheme set's `other[]` `cardType === 'scheme-twist'` first entry; tier-2 `core` set's same; tier-3 `''`.
  - **Bystander** (no cross-set fallback — identity is per-scheme): tier-1 scheme set's `bystanders[]` entry where `slug === 'bystander'` regardless of position; tier-2 `bystanders[0]` (acknowledged-imperfect named-character); tier-3 literal `{ name: 'Bystander', imageUrl: '' }`.
- All four new entry types carry `cost: null` (no printed cost on the physical card).
- `UICardDisplay` shape: `{ extId: string; name: string; imageUrl: string; cost: number | null }`.
- New signature: `buildCardDisplayData(registry, matchConfig, numPlayers)` — call site updated in `buildInitialGameState.ts` only.

## Guardrails
- `buildCardDisplayData.ts` must NOT import `@legendary-arena/registry` or `boardgame.io`. Extend the local structural `CardDisplayDataRegistryReader` interface only.
- `villainDeck.setup.ts` must NOT be modified — locked WP-168 contract.
- `uiState.build.ts` must NOT be modified — placeholder behavior unchanged; only the upstream map is fixed.
- The base FlatCard-keyed villain entry is KEPT alongside the new per-copy entries (defensive alias; mirrors the hero base+per-copy dual-emission pattern already in the file at lines 332–421).
- Per-copy entries use fresh object literals — no aliasing (mirrors WP-028 D-2802 / WP-135 D-13502 / D-14102 aliasing-prevention precedent in the same file).
- Read `setData.other[]` and `setData.bystanders[]` defensively — both are `z.array(z.unknown())` in `SetDataSchema`; iterate, type-check `typeof entry === 'object'`, then read `cardType` / `name` / `imageUrl` with `typeof === 'string'` guards.
- Soft-skip when a parse / lookup fails (`parseQualifiedIdForSetup` returns `null`, `registry.getSet` returns `undefined`, scheme not found) — mirrors the existing section-1 / section-3 / section-4 behavior. No throws.
- No `.reduce()` with branching. Use explicit `for...of` loops with descriptive variable names (code-style Rule §7, §16.2, §16.3).
- No abbreviations: `copyIndex` not `i`, `strikeIndex` not `s`, `twistIndex` not `t`, `bystanderIndex` not `b`, `mastermindSetData` not `msd`.
- Inline literals `5`, `8`, `'00'`, `2` (padStart width), and the `'Master Strike'` / `'Scheme Twist'` strings — do not extract helpers for two-call-site duplication (code-style Rule §16.1).

## Required `// why:` Comments
- Per-copy villain fan-out loop: name D-16802 and the symptom it fixes (UIState `resolveDisplay` falling through to `UNKNOWN_DISPLAY_PLACEHOLDER` for city-revealed villains).
- Master Strike section: name D-16801 and that the literal `5` mirrors `villainDeck.setup.ts:130` verbatim per RS-1.
- Master Strike tier-2 site: name D-17201 and cite the empirical 5/40-sets data scarcity that motivates the `core`-set cross-set fallback.
- Scheme Twist section: name D-16702 and D-1411 for the count source + fallback.
- Scheme Twist tier-2 site: name D-17201 and cite the 4/40-sets scarcity.
- Bystander section: name D-1412 for the `numPlayers` fallback source.
- Bystander tier-1 site: explain why slug-match beats positional fallback (msp1 / vill / wtif carry the generic entry mixed with named characters; a `bystanders[0]` lookup would silently mis-render).
- Bystander tier-2 site: list `cvwr` / `ssw2` / `xmen` / `dstr` by name as the known-imperfect real-data cases the tier exists to catch.
- New `numPlayers` parameter declaration: use the verbatim two-domain bulleted format from WP §Out of Scope:
  - "DO NOT replace `numPlayers` usage with `matchConfig.bystandersCount`. These represent different domains:"
  - "  - `numPlayers` → virtual villain-deck bystanders (D-1412, setup-time composition)"
  - "  - `matchConfig.bystandersCount` → shared rescue-pile supply in `G.sharedPiles.bystanders`"
  - "Conflating them will silently break villain-deck composition correctness."
  - Plus a reference: "Mirrors `context.ctx.numPlayers` read in `villainDeck.setup.ts:262`."
- Cross-builder superset invariant test: explain that this test would have caught the original WP-168-introduced gap.

## Files to Produce
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — **modified** — villain per-copy fan-out + 3 new sections (Master Strike / Scheme Twist / Villain-Deck Bystander) + `numPlayers` 3rd parameter.
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` — **modified** — fixture extensions + ~10–15 new tests including the cross-builder superset invariant.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — pass `ctx.numPlayers` as the new 3rd arg (1-line call-site update).
- `docs/ai/STATUS.md` — **modified** — placeholder no longer surfaces for villain-deck reveals.
- `docs/ai/DECISIONS.md` — **modified** — append D-17201.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — append WP-172 entry.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — append EC-190 entry.

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (≥ 755 + new tests, 0 fail).
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "@legendary-arena/registry"` returns zero matches.
- [ ] `Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "boardgame.io"` returns zero matches.
- [ ] `git diff --name-only` lists exactly the seven files in `## Files to Produce`.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` updated — D-17201 appended (display-data coverage for the four villain-deck ext_id grammars; regression-guard test cross-checks builder output against display-map keys).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-172 checked off with today's date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-190 appended.

## Common Failure Smells
- "Tests pass but the popup still says `<unknown>` in the browser" — means the per-copy fan-out matched the test fixture's grammar but not the real `villainDeck.setup.ts` grammar. Re-verify grammar byte-identity against `villainDeck.setup.ts:203` (villain), `:247` (scheme-twist), `:266` (bystander), `:279` (master-strike).
- "Test asserts `master-strike-0` is missing" — padding-width drift; the WP-168 grammar uses `padStart(2, '0')`, NOT `String(strikeIndex)`. All four grammars are zero-padded to two digits.
- "Cross-builder superset test fails with the magneto base key missing" — accidentally removed the base FlatCard-keyed villain entry while adding per-copy entries. The base entry is a defensive alias and must stay (mirrors the hero section).
- "Per-copy mutation test fails" — accidentally reused one `{...display}` object across copies. Build a fresh per-copy literal `{ extId, name, imageUrl, cost }` inside the loop, not outside it.
- "`buildInitialGameState` test fails with `numPlayers is undefined`" — forgot to pass `ctx.numPlayers` as the new 3rd arg; OR the test's mock `ctx` doesn't carry `numPlayers`. The latter is unlikely (existing tests already exercise `ctx.numPlayers` elsewhere); confirm the call-site update first.
- "Master Strike / Scheme Twist tile renders broken-image in production for 34+ sets" — the tier-2 `core`-set fallback never wired up; the tier-3 literal `imageUrl: ''` is firing as the common case. Re-verify the tier-2 site calls `registry.getSet('core')` independently of the per-mastermind / per-scheme resolution. Only 5/40 sets carry `mastermind-strike` and only 4/40 carry `scheme-twist` in `other[]`, so tier-2 is the load-bearing path for the vast majority of matches.
- "Villain-deck bystander tile renders as 'Comic Shop Keeper' / 'Aspiring Hero' / 'Alligator Trapper' (not 'Bystander')" — NOT a bug. cvwr, ssw2, and xmen are the known sets whose `bystanders[]` array contains only named characters with no `slug === 'bystander'` entry. The two-tier lookup correctly falls through to tier-2 `bystanders[0]`. Fix is upstream registry-data backfill (out of scope per WP §Out of Scope), not engine logic.
- "Villain-deck bystander tile renders empty for `dstr` matches" — `dstr` has `bystanders: []`. The literal `{ name: 'Bystander', imageUrl: '' }` tier-3 fallback fires; broken-image tile is expected until upstream data is backfilled.
- "Test asserts Set B's bystander = 'Comic Shop Keeper' but got 'Test Bystander B'" — the tier-1 slug-match correctly beat the tier-2 positional fallback. Re-read the test: Set B fixture deliberately places the generic-slug entry at index 1 to prove this. The assertion should expect 'Test Bystander B' / `b-generic.webp`, NOT 'Comic Shop Keeper' / `b.webp`.
- "Reviewer asks 'why not just use matchConfig.bystandersCount?'" — `MatchSetupConfig.bystandersCount` sizes the rescue-pile supply in `G.sharedPiles.bystanders` (a different concept). The villain-deck bystander count comes from the scheme or `numPlayers`. The `// why:` on the new `numPlayers` parameter must use the two-domain bulleted format verbatim; if a reviewer is asking, the comment is missing or the bulleted structure was paraphrased away.
- "Malformed `other[]` entry crashes setup or silently drops Master Strikes" — defensive `typeof` guards missing. The defensive parsing test fixture deliberately includes `null`, primitive values, and objects with missing `cardType` / `imageUrl` fields; if `typeof entry === 'object' && entry !== null` is not the first gate, those entries will throw on property access. Re-check the iteration guard before the `cardType` comparison.
- "Display-Coverage Invariant (D-17201) failure points at a villain ext_id" — the per-copy fan-out emitted `copies` entries with one grammar but `buildVillainDeck` emits `copies` entries with a different padding / separator. The cross-builder test caught it; fix is to make the per-copy loop's ext_id template literal byte-identical to `villainDeck.setup.ts:203`. The grammar-identity assertion (WP §Acceptance) is proven indirectly by this superset test — no separate string-compare exists, so this is the only signal you'll get.
