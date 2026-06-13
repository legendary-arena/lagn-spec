# EC-278 — Count-Scaled Hero Attack Framework (Execution Checklist)

**Source:** docs/ai/work-packets/WP-247-hero-count-scaled-attack.md
**Layer:** Game Engine (`rules/heroKeywords.ts`, `rules/heroCountSource.ts` NEW,
`hero/heroCountSource.resolve.ts` NEW + test NEW, `rules/heroAbility.types.ts`,
`setup/heroAbility.setup.ts`, `hero/heroEffects.execute.ts` + 2 test files) + card-data
tooling (`apply-hero-ability-markers.mjs`, `inputs/hero-ability-markers.json`,
`data/cards/core.json`)

> Use locked values from WP-247 verbatim. EC-278 is the operational order + gates +
> failure smells; if EC-278 and WP-247 conflict, WP-247 wins.

## Before Starting
- [ ] **WP-022 landed** — `executeHeroEffects` switch + `MVP_KEYWORDS` +
  `isValidMagnitude` + the `attack` case (`addResources(..., m, 0)`).
- [ ] **WP-021/216 landed** — closed `HERO_KEYWORDS` + parity drift test;
  `KEYWORD_PATTERN`/`ICON_MAGNITUDE_PATTERN` parser; `VALID_TOKEN_PATTERN` +
  `assertValidToken`.
- [ ] `BYSTANDER_EXT_ID = 'pile-bystander'` (`setup/pilesInit.ts`); villain-deck
  bystanders `bystander-villain-deck-NN`.
- [ ] Read WP-247 §Goal, §Non-Negotiable Constraints, §Acceptance Criteria.
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 (anchor count).

## Locked Values (verbatim from WP-247 — do not re-derive)
- **Keyword:** `'attack-per-count'` — ONE keyword for the whole "+N attack for each X"
  family; appended to the `HeroKeyword` union AND `HERO_KEYWORDS` array, before `'conditional'`.
- **Count source (seed):** `'victory-bystanders'` — `HeroCountSource` union +
  `HERO_COUNT_SOURCES` array (new `rules/heroCountSource.ts`, mirrors `heroKeywords.ts`).
- **Descriptor:** `HeroEffectDescriptor` gains `countSource?: HeroCountSource`.
- **Resolver:** `resolveCountSource(G, playerID, source): number` — pure, total
  (unknown → `0`); `victory-bystanders` counts `playerZones[playerID].victory` entries
  where `extId === BYSTANDER_EXT_ID` OR `extId.startsWith('bystander-villain-deck-')`.
- **Executor grant:** `G.turnEconomy = addResources(G.turnEconomy, magnitude * count, 0)`;
  `magnitude` = per-unit rate; `count = resolveCountSource(...)`.
- **Icon-suppression:** when an `attack-per-count` effect is on the line, drop `'attack'`
  from keywords AND its `magnitudes` entry before the effect-builder.
- **Marker token:** `[keyword:attack-per-count:<countSource>:<perUnit>]`,
  `countSource` ∈ `HERO_COUNT_SOURCES`, `perUnit` ≥ 1. Covert Operation:
  `core`/`black-widow`/`covert-operation`/abilityIndex 0/`[keyword:attack-per-count:victory-bystanders:1]`.
- **Token regex addition:** `^\[keyword:attack-per-count:[a-z][a-z-]*:[1-9]\d*\]$`.
- **Timing:** `onPlay`.

## Guardrails

> **Inherit all WP-247 §Non-Negotiable Constraints verbatim** (full files, ESM/Node 22,
> no `Math.random`, no `.reduce()` in effect/resolver logic, 00.6). EC-278 lists only the
> execution-critical contracts + greps + failure detection.

- **Parameterized, not per-card (HARD).** Exactly ONE count-scaled-attack keyword; the
  "for each X" lives in `countSource` + the resolver. Do NOT add a per-card/per-source keyword.
- **Two drift contracts (HARD).** Keyword in BOTH `HeroKeyword` union + array; source in
  BOTH `HeroCountSource` union + `HERO_COUNT_SOURCES`. Both parity drift tests pass.
- **Icon-suppression (HARD).** Without dropping the icon-derived `attack` on the marked
  line, Covert Operation grants `N` flat + `N×count` = double-count. The parse test MUST
  prove the marked line → keywords EXCLUDE `attack`, single `attack-per-count` effect.
- **Count spans both bystander forms; excludes non-bystander VP cards (HARD).**
- **Resolver pure + total.** No `@legendary-arena/registry` import; unknown source → `0`;
  imports only `BYSTANDER_EXT_ID`. The `attack-per-count` effect with missing/invalid
  `countSource` is a skipped no-op.
- **Effects never throw; `G` JSON-serializable.** Guard `playerZones` + `G.turnEconomy`.
- **Card data REGENERATED, not hand-edited.** Run the apply script; confirm ONLY the
  covert-operation line in `core.json` changed.
- **Seed ONLY `victory-bystanders` + mark ONLY covert-operation.** Other sources/cards =
  follow-up WPs.

## Required `// why:` Comments
- `heroKeywords.ts` + `heroCountSource.ts` — `// why: D-24016` on the new entries.
- `heroAbility.setup.ts` — `// why:` the count-scaled keyword subsumes the printed attack
  icon (D-24016; mirrors D-21901).
- `heroEffects.execute.ts` — `// why:` magnitude is the per-unit rate; the source resolves
  the count.
- `heroCountSource.resolve.ts` — `// why:` victory-bystanders counts both ext_id forms
  (`pile-bystander` + `bystander-villain-deck-NN`).
- `apply-hero-ability-markers.mjs` — `// why: D-24016` on the token-form addition.

## Files to Produce
- `packages/game-engine/src/rules/heroKeywords.ts` — **modified** — keyword.
- `packages/game-engine/src/rules/heroCountSource.ts` — **new** — `HeroCountSource` enum + array.
- `packages/game-engine/src/hero/heroCountSource.resolve.ts` — **new** — pure resolver.
- `packages/game-engine/src/hero/heroCountSource.resolve.test.ts` — **new** — resolver + drift.
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `countSource?` field.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — count-token parse + icon-suppression.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — MVP set + case.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — executor tests.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — drift + parse-suppression.
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** — token validation.
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — marker entry.
- `data/cards/core.json` — **modified** — regenerated covert-operation line.
- `docs/ai/STATUS.md` — **modified** — `### WP-247 / EC-278 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-24016 Reserved → Active (byte-identical to §Verbatim Block).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-247 `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-278 Pending → Done.

**Total: 16 files** (12 source/data + 4 governance), per WP-247 §Files Expected to Change.

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0; net-new drift
  (keyword + source) + resolver (N/0/mixed/excluded/unknown) + executor (m×N / no-op) +
  parse-suppression cases; no regress.
- [ ] Drift greps: `grep -c "attack-per-count" .../heroKeywords.ts` = 2;
  `grep -c "victory-bystanders" .../heroCountSource.ts` = 2.
- [ ] Re-run `node scripts/convert-cards/apply-hero-ability-markers.mjs`; `git diff --stat
  data/cards/core.json` shows ONLY the covert-operation line.
- [ ] Registry-boundary grep on `heroCountSource.resolve.ts` + `heroEffects.execute.ts` = 0.
- [ ] Parse-suppression test asserts the marked line → `attack-per-count` effect with
  `countSource`/`magnitude`, NO `attack` keyword.
- [ ] `git diff --name-only` = exactly the 16 files.
- [ ] STATUS updated; DECISIONS D-24016 Active byte-identical; WORK_INDEX WP-247 `[x]`;
  EC_INDEX EC-278 → Done.

## Commit Discipline (`.githooks/commit-msg` — enforced)
- Code path → prefix `EC-278:` (`SPEC:` rejected for code, D-20801). ≥ 12 chars after prefix.
- Avoid forbidden subject words (`WIP`, `fix stuff`, `misc`, `tmp`, `updates`, `changes`, `debug`).
- Co-staging `EC_INDEX.md` under `EC-278:` triggers a non-blocking Rule 6 warning — proceed.
- The drafting commit `SPEC: draft WP-247 + EC-278 [D-24016]` is docs-only — `SPEC:` valid there.

## Common Failure Smells
- Covert Operation grants `N` flat + `N×count` → icon-suppression not applied.
- A per-card or per-source keyword was added instead of the parameterized `countSource` →
  defeats the whole point (the family must scale by enum entries + data markers, not keywords).
- Keyword/source in union but not array (or vice versa) → a drift test fails.
- Count misses `bystander-villain-deck-NN` (only `pile-bystander`) → undercount (the live
  repro had villain-deck bystanders).
- `data/cards/core.json` hand-edited / apply run touches more than the covert-operation line.
- A registry import in the resolver or executor → layer-boundary HARD FAIL.
- The 3-segment token not added to `VALID_TOKEN_PATTERN` → apply script loud-fails.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> The D-24016 entry lands in `docs/ai/DECISIONS.md` at draft time as `Reserved (proposed)`
> and flips to `Active` at execution close, byte-identical to the block below. Status is
> the only field that changes.

**D-24016: Count-Scaled Hero Attack Framework — `attack-per-count` Keyword + `HeroCountSource` Resolver**

Count-scaled "+N Attack for each X" hero abilities are handled by a SINGLE parameterized
mechanism, not a keyword per card. A new closed-union hero keyword `attack-per-count` grants
attack equal to `magnitude × resolveCountSource(G, playerID, countSource)` when the hero card
is played (`onPlay`), where `magnitude` is the per-unit rate (Black Widow's Covert Operation =
`1`, a non-negative integer under the standard gate) and `countSource` is a value of a new
closed, drift-controlled `HeroCountSource` enum carried on the `HeroEffectDescriptor`
(`countSource?: HeroCountSource`). `resolveCountSource` is a pure, total resolver (unknown
source → `0`; no registry import — classification by ext_id string / `G` reads only). The
enum is SEEDED with `victory-bystanders`, which counts the player's victory-pile bystanders
across BOTH ext_id forms (`BYSTANDER_EXT_ID = 'pile-bystander'` and `bystander-villain-deck-NN`)
and excludes villain/henchman/tactic VP cards. The marker token grammar is
`[keyword:attack-per-count:<countSource>:<perUnit>]` (added to
`apply-hero-ability-markers.mjs`'s `VALID_TOKEN_PATTERN`); only
`core/black-widow/covert-operation` is marked in this packet. Because the printed text
carries "+N[icon:attack]", the setup parser would otherwise also emit a flat `attack` effect;
to prevent a double-count, the parser SUPPRESSES the `attack` keyword + its magnitude on any
line that also carries an `attack-per-count` effect — the explicit count-scaled keyword
subsumes the attack icon (mirrors the D-21901 reveal-cost-attack precedent).

**Extension recipe (the point of this decision):** a NEW "+N attack for each X" card needs
(1) IF X is a new source: one `HeroCountSource` enum + array entry + one `resolveCountSource`
branch + a drift test (engine, governed by a fresh DECISIONS sub-entry); (2) a data marker.
Marking the whole corpus is a single follow-up **sweep** WP (the WP-225 pattern), never
per-card WPs. Deferred: per-turn count-sources (need a played/drawn-this-turn ledger),
filtered/fractional/negative counts, `recruit-per-count`/draw/rescue scaling. Determinism
preserved (pure function of `G` at play time; no RNG/clock); re-pin the replay sentinel only
if it diverges (no fixture plays Covert Operation).

**Packet:** WP-247 (EC-278).
**Drafted:** 2026-06-13 (reserved). **Landed:** TBD (execution close — flips to Active).
**Status:** Reserved (proposed)
