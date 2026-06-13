# WP-247 — Count-Scaled Hero Attack Framework (`attack-per-count`)

> **Status:** DRAFT — pending review (do not execute until reviewed per
> `.claude/rules/work-packets.md` Review Gate).
> **Reserves:** D-24016.
> **Paired EC:** EC-278.
> **Depends on:** WP-021, WP-022, WP-216, WP-219 (all landed).

---

## Session Context

> WP-021/022 locked the data-only `HeroAbilityHook` / `HeroEffectDescriptor` contract
> and the `executeHeroEffects` `onPlay` switch dispatch; WP-216/224/225 established
> that hero abilities are wired as **data markers applied in corpus sweeps** (one WP
> marks every card of a class across all 40 sets), and that the engine holds a
> **bounded, parameterized** executor set; WP-219 (D-21505/D-21901) added
> icon-adjacent magnitude extraction and the precedent that an explicit keyword
> subsumes a printed attack icon. This packet builds the **general** count-scaled
> attack mechanism on top of all of them.

---

## Goal

After this session, "+N Attack for each <thing>" hero abilities are executable
through a SINGLE general mechanism rather than a keyword per card. Concretely: a new
`attack-per-count` `HeroKeyword`; a new closed, drift-controlled `HeroCountSource`
enum + canonical array (`rules/heroCountSource.ts`); a pure resolver
`resolveCountSource(G, playerID, source): number` (`hero/heroCountSource.resolve.ts`)
that returns the count for any source; `HeroEffectDescriptor` gains an optional
`countSource`; the setup parser reads the marker token
`[keyword:attack-per-count:<source>:<perUnit>]` and suppresses the printed attack
icon on that line; and the executor grants `perUnit × resolveCountSource(...)` attack
`onPlay`. The mechanism is seeded with the `victory-bystanders` source, and Black
Widow's **Covert Operation** is marked — fixing the reported bug (match `gcsklv5Lcxq`,
8 bystanders in victory, no scaling attack).

**Why general, not per-card.** The card data has **417** "for each" ability lines.
A keyword per card-variant would need hundreds of keywords + WPs. Instead, the family
is one parameterized effect (`attack-per-count` + a `countSource` field); each new
count-source is **one `HeroCountSource` enum entry + one resolver branch + a drift
test** (engine), and each new card is **a data marker**. Marking the whole corpus is
then a single follow-up **sweep** WP (the WP-225 pattern), not per-card work.

---

## Assumes

> **Drafting baseline (01.0a Step 2):** drafted against `origin/main` at `357fecd9`
> (2026-06-13). Supersession check (slug grep `--all`, file scan, `gh pr list`)
> returned no collision — no count-scaled hero-attack mechanism exists.

- **WP-022 complete.** `hero/heroEffects.execute.ts` exports
  `executeHeroEffects(G, ctx, playerID, cardId)`, dispatches per `effect.type` via a
  `switch`, gates on `MVP_KEYWORDS` + `isValidMagnitude`, and the `attack` case does
  `G.turnEconomy = addResources(G.turnEconomy, magnitude, 0)`.
- **WP-021 complete.** `HeroKeyword`/`HERO_KEYWORDS`
  (`rules/heroKeywords.ts`) are a closed union + array with a parity drift test in
  `rules/heroAbility.setup.test.ts`; `HeroEffectDescriptor` is
  `{ type: HeroKeyword; magnitude?: number }` (`rules/heroAbility.types.ts`).
- **WP-216 complete.** `setup/heroAbility.setup.ts` parses `[keyword:X(:N)?]` tokens
  (`KEYWORD_PATTERN`) and icon-adjacent magnitudes (`ICON_MAGNITUDE_PATTERN`);
  `[icon:attack]` maps to the `attack` keyword (`ICON_TO_KEYWORD`).
  `apply-hero-ability-markers.mjs` validates `markupToken` against
  `VALID_TOKEN_PATTERN` and **loud-fails** on an unknown form (its message says a new
  form needs a DECISIONS entry + validation update first — this packet is that).
- **Bystander ext_id grammar:** `BYSTANDER_EXT_ID = 'pile-bystander'`
  (`setup/pilesInit.ts:22`) + `bystander-villain-deck-NN` (`villainDeck.setup.ts:271`).
  The victory pile may hold both (confirmed in the live snapshot).
- `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` + §Rule Execution
  Pipeline — hero-effect execution is Game Engine; no registry import in
  effect/resolver files.
- `packages/game-engine/src/rules/heroKeywords.ts` — closed union + array pattern the
  new keyword follows; the **new** `HeroCountSource` enum file mirrors this exact
  pattern (union + canonical array + drift test).
- `packages/game-engine/src/setup/heroAbility.setup.ts` — read `parseAbilityText`
  Steps 1–5. The count token (3 segments) needs a NEW regex — `KEYWORD_PATTERN`
  only captures `keyword(:N)?`. The new keyword must SUPPRESS the icon-derived
  `attack` on the same line (Step 3 maps `[icon:attack]` → `attack`; Step 2b maps
  `+1[icon:attack]` → magnitude 1).
- `packages/game-engine/src/hero/heroEffects.execute.ts` — `MVP_KEYWORDS`, the
  magnitude gate, the `attack` case; the new case resolves a count then grants
  `magnitude × count`.
- `packages/game-engine/src/setup/pilesInit.ts` — `BYSTANDER_EXT_ID`.
- `packages/game-engine/src/types.ts` — `LegendaryGameState` (the resolver reads
  `playerZones[].victory`; confirm the field path).
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — `VALID_TOKEN_PATTERN` +
  `assertValidToken` message; both gain the 3-segment token form.
- `scripts/convert-cards/inputs/hero-ability-markers.json` — add one `core` entry.
- `data/cards/core.json` — regenerated (do not hand-edit).
- `docs/ai/DECISIONS.md` — scan D-21505 (icon magnitude), D-21601 (token-form closed
  set), D-21901 (reveal-cost-attack icon subsumption) before reserving D-24016.
- `.claude/rules/code-style.md` + `00.6` + `.claude/skills/legendary-game-engine/SKILL.md`.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Full file contents for every new/modified file. Diffs/snippets forbidden.
- No `Math.random()`; effects never throw; `G` stays JSON-serializable.
- ESM only, Node v22+; `node:` prefix; test files `.test.ts`; no `.reduce()` in
  effect/resolver logic — use `for...of`.
- Human-style code per `00.6` (explicit control flow, descriptive names, JSDoc,
  `// why:` on non-obvious decisions, full-sentence error messages).

**Packet-specific:**
- **Two drift contracts.** `attack-per-count` updates BOTH the `HeroKeyword` union
  and `HERO_KEYWORDS` array; `victory-bystanders` updates BOTH the `HeroCountSource`
  union and `HERO_COUNT_SOURCES` array. Each has a parity drift test.
- **Parameterized, not per-card.** There is exactly ONE count-scaled-attack keyword
  (`attack-per-count`); the "for each X" variation lives entirely in the
  `countSource` field + the resolver dispatch. Never add a per-card or per-source
  keyword.
- **`countSource` descriptor field.** `HeroEffectDescriptor` gains
  `countSource?: HeroCountSource`. The `attack-per-count` effect MUST carry a valid
  `countSource`; a descriptor with that type but no/invalid `countSource` is a
  skipped no-op (mirrors the magnitude gate).
- **Magnitude semantics:** `magnitude` is the **per-unit rate** (Covert Operation =
  `1`); non-negative integer; grant = `magnitude × resolveCountSource(...)`.
- **Resolver is pure + total.** `resolveCountSource(G, playerID, source)` returns a
  non-negative integer for every `HeroCountSource`; an unknown source returns `0`
  (defensive — the union is closed). No registry import; classification by ext_id
  string / `G` reads only.
- **`victory-bystanders` count (locked):** entries in
  `G.playerZones[playerID].victory` where `extId === BYSTANDER_EXT_ID` OR
  `extId.startsWith('bystander-villain-deck-')`. Both forms count; villain/henchman/
  tactic VP cards do NOT.
- **Icon-suppression (locked):** when an `attack-per-count` effect is parsed on a
  line, drop the plain `attack` keyword + its magnitude for that line so the printed
  "+N[icon:attack]" does not also emit a flat `attack` effect (double-count). Mirrors
  D-21901.
- **Marker token form:** `[keyword:attack-per-count:<countSource>:<perUnit>]`,
  `countSource` ∈ `HERO_COUNT_SOURCES` (lowercase hyphen slug), `perUnit` ≥ 1. Added
  to `VALID_TOKEN_PATTERN` + the `assertValidToken` message.
- **Seed scope:** seed `HERO_COUNT_SOURCES` with `victory-bystanders` ONLY, and mark
  ONLY `core/black-widow/covert-operation`. New sources + the rest of the corpus are
  follow-up WPs (see Out of Scope).
- **Timing:** `onPlay`.

**Session protocol:** if the parser's count-token site, the icon-suppression point,
or the bystander ext_id grammar conflicts with the actual files, **stop and ask**.

**Locked Contract Values:**
- Keyword: `'attack-per-count'` (union + array, before `'conditional'`).
- Count source: `'victory-bystanders'` (`HeroCountSource` union + `HERO_COUNT_SOURCES`).
- `BYSTANDER_EXT_ID = 'pile-bystander'`; villain-deck prefix `'bystander-villain-deck-'`.
- Covert Operation marker: `setAbbr: 'core'`, `heroSlug: 'black-widow'`,
  `cardSlug: 'covert-operation'`, `abilityIndex: 0`,
  `markupToken: '[keyword:attack-per-count:victory-bystanders:1]'`.
- Executor grant: `G.turnEconomy = addResources(G.turnEconomy, magnitude * count, 0)`.

---

## Debuggability & Diagnostics

- Deterministic: grant is `magnitude × count`, pure over `G` at play time — no RNG/clock.
- Observable: the attack delta projects to `UIState.economy.attack`; a `G.messages`
  line SHOULD record the source + count + grant for replay inspection.
- JSON-serializable after execution; no new `G` field.

---

## Scope (In)

### A) `rules/heroKeywords.ts` — modified
- Add `'attack-per-count'` to the `HeroKeyword` union + `HERO_KEYWORDS` array (before
  `'conditional'`), `// why: D-24016`.

### B) `rules/heroCountSource.ts` — **new**
- Export the closed `HeroCountSource` union (`'victory-bystanders'`) and the
  `HERO_COUNT_SOURCES` canonical readonly array (single source of truth), mirroring
  `heroKeywords.ts`. JSDoc states new sources require a DECISIONS entry + both
  union/array updated + a resolver branch.

### C) `hero/heroCountSource.resolve.ts` — **new**
- `resolveCountSource(G, playerID, source): number` — pure dispatch over
  `HeroCountSource`. The `victory-bystanders` branch counts the player's victory-pile
  bystanders (inline predicate per the locked constraint). Unknown source → `0`
  (defensive). No registry import; imports `BYSTANDER_EXT_ID` only.

### D) `rules/heroAbility.types.ts` — modified
- Add `countSource?: HeroCountSource` to `HeroEffectDescriptor` (import the type).

### E) `setup/heroAbility.setup.ts` — modified
- Add a count-token regex `\[keyword:attack-per-count:([a-z][a-z-]*):(\d+)\]` and a
  parse block emitting `{ type: 'attack-per-count', countSource, magnitude: perUnit }`
  when `countSource ∈ HERO_COUNT_SOURCES`.
- Add the icon-suppression rule: when an `attack-per-count` effect/keyword is present
  on the line, drop `'attack'` from `uniqueKeywords` + its `magnitudes` entry.
  `// why:` the count-scaled keyword subsumes the printed attack icon (D-24016).

### F) `hero/heroEffects.execute.ts` — modified
- Add `'attack-per-count'` to `MVP_KEYWORDS`; add a `switch` case: guard
  `playerZones` + `G.turnEconomy` + a valid `countSource`; `count = resolveCountSource(
  G, playerID, effect.countSource)`; grant `magnitude × count` via `addResources`;
  append a `G.messages` line. `// why:` magnitude is the per-unit rate; the source
  resolves the count.

### G) `scripts/convert-cards/apply-hero-ability-markers.mjs` — modified
- Add `^\[keyword:attack-per-count:[a-z][a-z-]*:[1-9]\d*\]$` to `VALID_TOKEN_PATTERN`
  + the new form to the `assertValidToken` message. `// why: D-24016`.

### H) `scripts/convert-cards/inputs/hero-ability-markers.json` — modified
- Add the `core` covert-operation entry (locked marker values).

### I) `data/cards/core.json` — modified (regenerated)
- Run `node scripts/convert-cards/apply-hero-ability-markers.mjs`; the
  covert-operation line gains the token. No other line in any card file changes.

### J) Tests
- `hero/heroCountSource.resolve.test.ts` — **new**: `HERO_COUNT_SOURCES` drift parity;
  `victory-bystanders` resolver — N bystanders (mixed `pile-bystander` +
  `bystander-villain-deck-NN`) → N; 0 → 0; villain/henchman/tactic VP cards excluded;
  unknown source → 0.
- `hero/heroEffects.execute.test.ts` — **modified**: `attack-per-count` /
  `victory-bystanders` / magnitude `m` + N bystanders → `+m×N` attack; missing/invalid
  `countSource` → no-op; `JSON.stringify(G)` succeeds.
- `rules/heroAbility.setup.test.ts` — **modified**: `HERO_KEYWORDS` drift (+1); parsing
  the marked covert-operation line yields an `attack-per-count` effect with
  `countSource: 'victory-bystanders'`, `magnitude: 1`, and **no** `attack` keyword
  (icon-suppression proven).

---

## Out of Scope

- **Per-turn count-sources** ("for each Avenger you played this turn", "for each extra
  card you drew") — these need a "played/drawn this turn" ledger the engine does not
  track yet. Separate follow-up WP (WP-B). The `resolveCountSource` signature already
  accommodates them.
- **The full card corpus.** ONLY `covert-operation` is marked here. Marking all "+N
  attack for each X" lines across the 40 sets is a single follow-up **sweep** WP
  (WP-C, the WP-225 pattern) — NOT per-card WPs.
- **Filtered / fractional / negative counts** ("for each `[hc:strength]` card in the
  Escape Pile", "+1/2 for each Hero in the KO pile", "Goblin 2099 gets −1 …") — magnitude
  is a non-negative integer; filtered/fractional/negative sources are later WPs.
- **`recruit-per-count`** and draw/rescue count-scaling — a trivial sibling once this
  ships, but a separate keyword + WP.
- **Any registry, server, client, preplan, or other-app change.** No UIState shape
  change (the bonus surfaces via the existing `economy.attack` projection).
- **Refactors / "while I'm here" cleanups** beyond the listed files.

---

## Files Expected to Change

- `packages/game-engine/src/rules/heroKeywords.ts` — **modified** — keyword.
- `packages/game-engine/src/rules/heroCountSource.ts` — **new** — `HeroCountSource` enum + array.
- `packages/game-engine/src/hero/heroCountSource.resolve.ts` — **new** — pure resolver.
- `packages/game-engine/src/hero/heroCountSource.resolve.test.ts` — **new** — resolver + drift tests.
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `countSource?` field.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — count-token parse + icon-suppression.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — MVP set + executor case.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — executor tests.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — keyword drift + parse-suppression.
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** — token-form validation.
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — covert-operation marker.
- `data/cards/core.json` — **modified** — regenerated covert-operation line.
- `docs/ai/DECISIONS.md` — **modified** — D-24016 Reserved → Active.
- `docs/ai/STATUS.md` — **modified** — what changed.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-247 checked off.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-278 Pending → Done.

**Total: 16 files** (12 source/data + 4 governance). Over the lint §5 ~8 guideline,
justified inline: this is a foundational, extensible framework (a NEW closed enum with
its own drift test + a resolver sub-system), not a one-off keyword, and the minimal
end-to-end vertical slice (framework → one source → one marked card → tests) cannot be
split without shipping an untestable half-framework. It is explicitly the LAST
multi-file engine WP for this family — subsequent sources are enum entries and
subsequent cards are a single data sweep.

---

## Vision Alignment

**Vision clauses touched:** §1 (faithful card behavior), §2 (card data), §22
(determinism). **No conflict.**

- **Content fidelity (§1, §2):** makes a printed ability execute as written; invents
  no card text; the framework encodes the existing "+N Attack for each X" family.
- **Determinism (§22):** grant = `magnitude × count`, pure over `G` at play time; no
  RNG/clock; replay-faithful. Re-pin the sentinel/`PRE_WP080_HASH` ONLY if it diverges
  (WP-236 discipline); no fixture plays Covert Operation.
- **Non-Goal proximity (NG-1..7):** none crossed — a gameplay-correctness mechanism,
  not a paid/competitive/persuasive surface.

## Funding Surface Gate

**N/A — justified.** No funding affordance, copy, or channel added or referenced.

## API Catalog (§21)

**N/A — justified.** No HTTP endpoint or `apps/server/src/**` library function added,
modified, or removed; engine + card-data only.

---

## Lint Gate Self-Review

Run against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (§1–§21).
**Verdict: PASS** — all applicable sections satisfied; N/A sections carry a named
justification; no Final Gate FAIL (1–38) triggers.

- **§1 Structure** — PASS. All sections; `## Out of Scope` lists five exclusions.
- **§2 Constraints** — PASS. Engine-wide + packet-specific (two drift contracts,
  parameterized-not-per-card, countSource field, magnitude/resolver/count semantics,
  icon-suppression, token form, seed scope) + session protocol + locked values.
- **§3 Assumes** — PASS. WP-022/021/216/219 + bystander grammar + green baseline cited.
- **§4 Context** — PASS. ARCHITECTURE §Layer Boundary, the modified source files,
  types.ts, the script/data files, 00.2, DECISIONS (D-21505/21601/21901) cited.
- **§5 Files** — PASS. 16 files, each `new`/`modified`; over-8 justified inline
  (foundational framework; last multi-file engine WP for the family).
- **§6 Naming** — PASS. `attack-per-count`, `HeroCountSource`, `HERO_COUNT_SOURCES`,
  `resolveCountSource`, `BYSTANDER_EXT_ID`, `addResources` match the surface + 00.2.
- **§7 Dependency Discipline** — PASS. No new npm dependency; engine + Node script.
- **§8 Architectural Boundaries** — PASS. Game Engine + card-data tooling; no registry
  import in resolver/executor; determinism preserved; no persistence.
- **§9 Windows** — PASS. `pnpm --filter` + `node scripts/...` + `grep`/`git`.
- **§10 Env Vars** — N/A — justified. No env var introduced.
- **§11 Auth** — N/A — justified. No auth surface.
- **§12 Test Quality** — PASS. `node:test` + `makeMockCtx`; two drift parities +
  resolver (N/0/mixed/excluded/unknown) + executor + parse-suppression; no
  `boardgame.io` import; `JSON.stringify(G)`.
- **§13 Verification** — PASS. `pnpm --filter` build/test + two drift greps +
  apply-script targeted diff + registry grep + `git diff --name-only`.
- **§14 Acceptance Criteria** — PASS. Nine binary, file/symbol-specific checks.
- **§15 Definition of Done** — PASS. AC + STATUS + DECISIONS + WORK_INDEX + EC_INDEX +
  scope-boundary.
- **§16 Code Style** — PASS. Inline bystander predicate (first use; §16.1), `// why:`
  on suppression + per-unit magnitude + the resolver dispatch; small functions.
- **§17 Vision Alignment** — PASS. `## Vision Alignment` (§1/§2/§22 + NG + determinism).
- **§18 Prose-vs-Grep** — PASS. The drift greps target the keyword/source literals (the
  intended code tokens); no forbidden-token grep with adjacent verbatim prose.
- **§19 Bridge-vs-HEAD** — N/A — justified. Not a repo-state-summarizing artifact.
- **§20 Funding Gate** — PASS. Present, reasoned N/A.
- **§21 API Catalog** — PASS. Present, reasoned N/A (engine + data only).

---

## Pre-Flight & Copilot Verdicts (01.0a Step 5)

Gate order (pre-flight → copilot → lint), all run in this drafting session against the
**generalized** WP-247 + EC-278, baseline `origin/main` @ `357fecd9`:

- **Pre-flight (01.4): READY TO EXECUTE** (2026-06-13). Class: Behavior / State
  Mutation. Repo green (engine `test` 1255/0, `tsc` 0). Deps WP-021/022/216/219 ✅;
  the parameterized `countSource` + resolver + icon-suppression design points verified
  against source; scope locked to 16 files; risks resolved; no blocking PS. Scratchpad:
  `docs/ai/invocations/preflight-wp247.md`.
- **Copilot check (01.7): PASS → CONFIRM** (2026-06-13). All 30 issues PASS; #14
  (extension seams — the parameterized framework), #6 (icon-subsumption merge
  semantic), and #4 (two drift contracts) are explicitly locked with tests. No
  RISK/BLOCK. Scratchpad: `docs/ai/invocations/copilot-wp247.md`.
- **Lint gate (00.3): PASS** (see `## Lint Gate Self-Review` above).

---

## Acceptance Criteria

1. `HeroKeyword` union + `HERO_KEYWORDS` array each contain `'attack-per-count'`
   (same index); the parity drift test passes.
2. `HeroCountSource` union + `HERO_COUNT_SOURCES` array each contain
   `'victory-bystanders'`; a parity drift test asserts they match exactly.
3. `resolveCountSource(G, '0', 'victory-bystanders')` returns the number of victory-pile
   bystanders, counting BOTH `pile-bystander` and `bystander-villain-deck-NN` and
   EXCLUDING villain/henchman/tactic VP cards; an unknown source returns `0`.
4. Parsing the marked covert-operation line yields exactly one effect
   `{ type: 'attack-per-count', countSource: 'victory-bystanders', magnitude: 1 }` and
   keywords that EXCLUDE `attack` (icon-suppression proven).
5. `executeHeroEffects` with an `attack-per-count`/`victory-bystanders` hook (magnitude
   `m`) and N bystanders increases `G.turnEconomy.attack` by exactly `m × N`; 0 bystanders
   → 0; a descriptor with missing/invalid `countSource` is a no-op.
6. `apply-hero-ability-markers.mjs` accepts
   `[keyword:attack-per-count:victory-bystanders:N]` (N ≥ 1) and still loud-fails on a
   genuinely-unknown token form; re-running it appends the token to ONLY the
   covert-operation line in `core.json`.
7. `hero/heroCountSource.resolve.ts` imports no `@legendary-arena/registry`.
8. `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 with the net-new
   cases; no pre-existing test regresses; `JSON.stringify(G)` succeeds after execution.
9. `git diff --name-only` lists exactly the 16 files in `## Files Expected to Change`.

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0.

# Step 2 — tests
pnpm --filter @legendary-arena/game-engine test
# Expected: all pass, fail 0; net-new drift/resolver/executor/parse cases.

# Step 3 — keyword + source drift
Select-String -Path "packages\game-engine\src\rules\heroKeywords.ts" -Pattern "attack-per-count"
Select-String -Path "packages\game-engine\src\rules\heroCountSource.ts" -Pattern "victory-bystanders"
# Expected: two matches each (union + array).

# Step 4 — re-run marker apply (idempotent, targeted)
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff --stat data/cards/core.json
# Expected: only core.json, exactly one line (covert-operation) +token.

# Step 5 — resolver reads no registry
Select-String -Path "packages\game-engine\src\hero\heroCountSource.resolve.ts" -Pattern "@legendary-arena/registry"
# Expected: no output.

# Step 6 — scope
git diff --name-only
# Expected: exactly the 16 Files Expected to Change.
```

---

## Definition of Done

- [ ] All Acceptance Criteria (1–9) pass.
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0.
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs` re-run; only the
      covert-operation line in `core.json` changed.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` D-24016 flipped Reserved → Active, byte-identical to the
      EC-278 §DECISIONS.md Verbatim Block.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-247 checked off with the DoD summary line.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-278 flipped Pending → Done.
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] Paired EC-278 satisfied (locked values transcribed and checked).
