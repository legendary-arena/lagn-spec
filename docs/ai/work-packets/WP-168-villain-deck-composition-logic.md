# WP-168 — Villain Deck Composition Logic (Engine)

**Status:** Ready for execution — WP-167 landed 2026-05-20; D-16801/D-16802 recorded (Accepted, effective on WP-168 execution)
**Primary Layer:** Game Engine / Implementation
**Dependencies:** WP-167 (registry data + schema). Supersedes D-1413 (and the count *application* in D-1411 / D-1412).

---

## Session Context

WP-014B built `buildVillainDeck` and locked its composition under D-1410..D-1413:
henchmen and scheme twists are virtual instanced cards; villain cards are pushed
once each from their registry `FlatCard` key; scheme-twist count is a hardcoded
`8`; villain-deck bystanders equal `numPlayers`; and "mastermind strikes" are
the mastermind's non-tactic cards. WP-167 added registry data so twist and
bystander counts can come from the scheme and villains can declare copy counts;
this packet rewires `buildVillainDeck` to consume that data and to add
tabletop-accurate generic Master Strikes.

---

## Goal

After this session, `buildVillainDeck` produces a tabletop-accurate villain deck:
each villain card is instanced `copies` times (from WP-167 data, default 1); the
scheme-twist count comes from the scheme's `villainDeckTwistCount` (fallback 8);
the villain-deck bystander count comes from the scheme's
`villainDeckBystanderCount` (fallback `numPlayers`); and a fixed number of
**generic** Master Strikes (`MASTER_STRIKE_COUNT = 5`) are added as virtual
instanced cards. The count of 5 matches the standard Marvel Legendary core-game
rule (add 5 Master Strikes to the Villain Deck). The mastermind's own cards are
no longer pushed into the villain deck. For the "watch bot play" loadout (Midtown Bank Robbery / Magneto /
Brotherhood / Hand Ninjas) the deck grows from 24 cards to the correct total
(8 twists + 12 bystanders + 5 Master Strikes + Brotherhood copies + 10 Hand Ninjas).

---

## Assumes

- WP-167 complete. Specifically:
  - `VillainCardSchema` exposes optional `copies` (integer ≥ 1).
  - `SchemeSchema` exposes optional `villainDeckTwistCount` and
    `villainDeckBystanderCount`.
  - `data/cards/core.json` Brotherhood villains carry `copies`; Midtown Bank
    Robbery carries `villainDeckTwistCount: 8`, `villainDeckBystanderCount: 12`.
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` exports
  `buildVillainDeck`, `VillainDeckRegistryReader`, `VillainDeckFlatCard`,
  `extractVillainGroupSlug`, `isVillainDeckRegistryReader` (WP-014B, WP-113).
- `packages/game-engine/src/villainDeck/villainDeck.types.ts` exports
  `RevealedCardType` including `'mastermind-strike'`.
- `packages/game-engine/src/test/mockCtx.ts` exports `makeMockCtx`.
- `pnpm --filter @legendary-arena/game-engine build` and `test` exit 0.
- `docs/ai/DECISIONS.md` already records D-16801 and D-16802, both **Accepted**
  (SPEC — drafted alongside WP-168; status reads "effective on WP-168
  execution"). This packet only flips that conditional status to effective; it
  does **not** re-record the decisions.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — Game Engine layer:
  the engine decides outcomes and derives counts deterministically. Read the
  determinism principle — all ordering must be reproducible from setup + seed.
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — read entirely.
  This packet rewrites sections 1 (villains), 3 (scheme twists), 4 (bystanders),
  and 5 (mastermind strikes) of `buildVillainDeck`, and adds a Master Strikes
  section. The lexical sort + `shuffleDeck` tail (sections 6–7) must be preserved.
- `packages/game-engine/src/villainDeck/villainDeck.types.ts` — confirm
  `RevealedCardType` already contains `'mastermind-strike'`; this packet reuses
  it for generic Master Strikes (no new type, no drift-array change).
- `docs/ai/DECISIONS.md` — read D-1410..D-1413 (the conventions being amended)
  and the new D-16701 / D-16702 (WP-167).
- `docs/ai/REFERENCE/00.2-data-requirements.md §1.4, §1.5` — the `copies`,
  `villainDeckTwistCount`, `villainDeckBystanderCount` fields added by WP-167.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6
  (`// why:`), Rule 7 (no `.reduce()` with branching), Rule 8 (no dynamic
  property access), Rule 14 (field names match contract).

---

## Vision Alignment

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. Clause numbers
reference `docs/01-VISION.md`. Triggered by §17.1 "Determinism guarantees or
RNG sourcing" and "Card data, card images, or content semantics."

**Vision clauses touched:** §1 (Rules Authenticity — produces the exact
Legendary villain-deck composition: scheme-driven twists and bystanders,
per-villain copies, and 5 generic Master Strikes), §3 (Player Trust & Fairness —
the seeded, reproducible shuffle is preserved; no hidden modifiers), §8
(Deterministic Game Engine — identical setup config plus identical seed produce
identical decks), §10 (Content as Data — counts now flow from registry data
instead of engine constants), §14 (Explicit Decisions, No Silent Drift —
D-16801 and D-16802 explicitly supersede D-1413's "non-tactic mastermind card =
strike" rule), §18 (Replayability & Spectation — deck composition is part of
the replayable game state), §22 (Deterministic & Reproducible Evaluation — deck
composition feeds replay verification).

**Conflict assertion:** No conflict: this WP preserves all touched clauses. It
advances §1 authenticity (correct composition) and §10 (data-driven counts)
without weakening §3/§8 determinism.

**Non-Goal proximity (NG-1..7):** This packet changes engine setup logic only.
It introduces no user-facing, paid, persuasive, or competitive surface; no card
is gated, sold, or varied by ownership or payer status. None of NG-1 through
NG-7 are crossed.

**Determinism preservation (§3, §8, §22):** The lexical pre-shuffle sort and the
`ctx.random.Shuffle`-based `shuffleDeck(...)` call are preserved unchanged.
Villain-copy instancing, scheme-driven counts, and generic Master Strikes are
all deterministic functions of setup config plus registry data — no wall-clock
reads, no `Math.random()` (enforced by the Verification Steps grep). Identical
setup config plus identical seed therefore produce a bit-identical villain deck,
so replays and replay verification remain faithful. The golden composition test
locks the per-type counts so any future replay-breaking change is caught.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — `buildVillainDeck` runs at
  setup time and may surface malformed-data errors, but moves never throw
- Never persist `G`, `ctx`, or any runtime state
- `G` must be JSON-serializable at all times — villain-deck entries are
  `CardExtId` strings only, never objects
- ESM only, Node v22+; `node:` prefix on built-in imports
- Test files use `.test.ts` — never `.test.mjs`
- No database, network, or filesystem access in `buildVillainDeck` or its helpers
- `villainDeck.setup.ts` must not import `boardgame.io` or
  `@legendary-arena/registry` (structural `VillainDeckRegistryReader` only)
- Full file contents for every new or modified file — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- All zone entries remain `CardExtId` strings (`G.villainDeck.deck`).
- `MASTER_STRIKE_COUNT = 5` is a named game-engine constant with a `// why:`
  comment citing the standard Legendary rule and D-16801.
- Master Strikes are **generic** virtual instanced cards — they carry no
  mastermind identity in their ext_id. Master Strike *effect resolution* (which
  reads the active mastermind) is **not** in this packet's scope.
- The non-tactic mastermind cards are **no longer** added to the villain deck.
- No `.reduce()` in deck assembly — use explicit `for` / `for...of` loops.
- The lexical pre-shuffle sort and `shuffleDeck(...)` call must be preserved so
  replays stay deterministic.
- **Preserve the exported helpers `extractVillainGroupSlug` and
  `listHenchmanGroupSlugsInSet` (and the `VillainDeckFlatCard` type).**
  `matchSetup.validate.ts` imports them (WP-113 / D-10014 single-source
  decoders) and is **outside** this packet's allowlist. The section-1 rewrite
  stops *calling* `extractVillainGroupSlug` for deck assembly but MUST NOT
  delete the export — removing it breaks the validator build with no
  authorized fix. Only the now-dead **internal** helpers
  (`filterVillainCardsByGroupSlug`, `filterFlatCardsByType`) may be removed.
- **§18 prose-vs-grep discipline.** Verification Steps 3–5 grep this file for
  `boardgame.io`, `Math.random`, and `.reduce(` and expect **no output**, so a
  *comment* containing any of those literal tokens is a false-positive drift
  (precedent WP-037 / `00.3 §18.4`). The current file already trips this — line
  14 (`No .reduce().`) and line 278 (`boardgame.io's PRNG`). On rewrite, phrase
  the module-header JSDoc and inline comments by citing the governing rule
  (e.g. "no array-reduce in deck assembly per `00.6` Rule 7", "seeded by the
  framework PRNG via `ctx.random`") instead of writing the tokens verbatim.

**Session protocol:**
- If the villain-copy ext_id format or any count source is unclear, stop and ask
  before proceeding — never guess an ext_id grammar or a count.

**Locked contract values (relevant subset):**
- **RevealedCardType values:** `'villain' | 'henchman' | 'bystander' |
  'scheme-twist' | 'mastermind-strike'` — unchanged; generic Master Strikes
  reuse `'mastermind-strike'`.
- **Index base for every `-{NN}` ext_id suffix:** **zero-based**, two-digit,
  zero-padded (`00`, `01`, …), produced by `String(index).padStart(2, '0')` with
  `index` starting at `0`. This is the convention the existing henchman /
  scheme-twist / bystander instancing already uses in `villainDeck.setup.ts`;
  villain copies and Master Strikes MUST use the identical base so every
  instanced ext_id in one deck shares one grammar. (D-16802's "zero-padded to
  two digits, consistent with the henchman / scheme-twist conventions" already
  implies this; it is made explicit here so the executor never re-derives it.)
- **Existing ext_id conventions:** henchman `henchman-{groupSlug}-{NN}`; scheme
  twist `scheme-twist-{schemeSlug}-{NN}`; villain-deck bystander
  `bystander-villain-deck-{NN}`; mastermind card
  `{setAbbr}-mastermind-{mastermindSlug}-{cardSlug}`.

---

## Debuggability & Diagnostics

- The villain deck must be fully reproducible from identical setup config +
  identical RNG seed: same `copies`, same scheme counts ⇒ identical pre-shuffle
  sequence ⇒ identical shuffled deck.
- A golden composition test (see Scope C) asserts exact per-type counts **and
  the total deck size** for the Midtown loadout so any future change to the
  assembly algorithm is caught.
- The fallback behavior (default `8` twists / `numPlayers` bystanders when a
  scheme omits the field) is locked by the fallback tests in Scope C. Emitting a
  `G.messages` diagnostic when a fallback drives the count is **deferred** — see
  Out of Scope for the rationale.

---

## Scope (In)

### A) `buildVillainDeck` — `src/villainDeck/villainDeck.setup.ts` (modified)

1. **Villain copies (section 1 rewrite).** For each villain card matched to a
   selected group, read `copies` from the set data for that card (default 1 when
   absent). Push that many instanced ext_ids:
   `{setAbbr}-villain-{groupSlug}-{cardSlug}-{copyIndex}` with `copyIndex`
   **zero-based** and zero-padded to two digits (`00`..`copies-1`, identical to
   the henchman loop's base). Each instance gets `cardTypes[extId] = 'villain'`.
   - Add a `// why:` comment: copies are instanced (not duplicate keys) so each
     villain card moves independently and escapes/KOs stay attributable (D-16802,
     mirroring the D-1410 henchman rationale).
   - Reading `copies` requires per-set card data (the `FlatCard` key carries no
     copy count), so resolve villain cards through `getSet(setAbbr)` like the
     henchman/scheme/mastermind helpers, not through `listCards()` alone. This
     means extending the local `SetDataSubset` structural interface to include
     `villains` (each group `{ slug, cards: { slug, copies? }[] }`); the current
     interface only declares `henchmen / masterminds / schemes`. Use the local
     structural type — do **not** import registry types.

2. **Scheme twist count (section 3 rewrite).** Resolve the scheme's
   `villainDeckTwistCount` from set data; if absent, fall back to
   `SCHEME_TWIST_COUNT = 8`. Generate `scheme-twist-{schemeSlug}-{NN}` for that
   many twists (unchanged ext_id format).

3. **Bystander count (section 4 rewrite).** Resolve the scheme's
   `villainDeckBystanderCount`; if absent, fall back to `context.ctx.numPlayers`.
   Generate `bystander-villain-deck-{NN}` for that many bystanders (unchanged
   ext_id format).

4. **Master Strikes (new section).** Add `MASTER_STRIKE_COUNT = 5` generic
   virtual instanced cards with ext_id `master-strike-{NN}` (**zero-based**,
   zero-padded: `00`..`04`) and `cardTypes[extId] = 'mastermind-strike'`.

5. **Remove mastermind-card inclusion (section 5 deletion).** Delete the logic
   that pushed non-tactic mastermind cards into the villain deck. The mastermind
   card and its tactics are not villain-deck cards (D-16801).

6. Preserve the lexical sort and `shuffleDeck(...)` tail unchanged.

### B) Helpers (same file, modified/new)
- A small helper to read a villain card's `copies` from set data, returning 1
  when absent. JSDoc + `// why:` for the default.
- Helpers to read `villainDeckTwistCount` / `villainDeckBystanderCount` from a
  scheme record, returning `null` when absent so the caller applies the default.
- Each helper ≤ 30 lines, descriptive names, no `.reduce()` with branching.

### C) Tests — `src/villainDeck/villainDeck.setup.test.ts` (modified)
**Replace** the existing `'mastermind strikes: only non-tactic cards included'`
case — it asserts the mastermind card IS in the deck (`strikeCards.length === 2`,
including `test-mastermind-test-mm-main` / `-epic`), which D-16801 removes. The
"keep existing cases green" instruction below does **not** apply to that one
case; it is superseded by the new "No mastermind card in deck" assertion. All
other existing cases stay green. Add `node:test` cases (keep existing cases green):
- **Golden composition (Midtown loadout).** With a mock registry mirroring
  `core.json` (Brotherhood copies, Midtown twist=8 / bystander=12, Hand Ninjas,
  Magneto) and `numPlayers: 2`, assert exact counts by `RevealedCardType`:
  `scheme-twist` = 8, `bystander` = 12, `mastermind-strike` = 5, `henchman` = 10,
  and `villain` = sum of Brotherhood `copies` (= 8, i.e. 4 villains × `copies: 2`).
  Also assert the total directly: `deck.length === 43` (fast whole-deck failure
  mode alongside the per-type counts). Add a `// why:` comment: failure means a
  replay-breaking change to deck composition.
- **Twist fallback.** A scheme with no `villainDeckTwistCount` yields 8 twists.
- **Bystander fallback.** A scheme with no `villainDeckBystanderCount` yields
  `numPlayers` bystanders.
- **Copies default.** A villain card with no `copies` yields exactly 1 instance.
- **No mastermind card in deck.** No deck entry matches
  `{setAbbr}-mastermind-{mastermindSlug}-...`; additionally, every entry typed
  `'mastermind-strike'` has a `master-strike-` prefix (proves the removed
  mastermind-card branch cannot reappear under the same type via a different
  ext_id).
- **Determinism.** Two builds with the **same fixed RNG seed** (identical
  `makeMockCtx`) produce identical decks.
- `JSON.stringify(state)` succeeds. Uses `makeMockCtx`; no `boardgame.io` import.

---

## Out of Scope

- No registry schema or `data/cards/*.json` changes — that is WP-167.
- No Master Strike **effect resolution** (the reveal-time effect that reads the
  active mastermind) — only deck composition. Reveal/effect logic is the
  existing reveal pipeline / WP-153 destination piles.
- No mastermind-card or tactics-deck placement — where the mastermind card and
  its 4 tactics live is a separate concern (D-1413's inverse / WP-019 territory).
- No display-layer resolution of the new instanced villain ext_ids (stripping
  the `-{copyIndex}` suffix for card art) — flag as a follow-up to verify in
  arena-client / registry-viewer; do not change UI here.
- No `MatchSetupConfig` changes; no henchman copy-count changes (stays 10).
- **No fallback diagnostic message.** Emitting a `G.messages` note when a
  twist/bystander default applies is **deferred**. `buildVillainDeck` returns a
  pure `BuildVillainDeckResult` (`{ state, cardTypes }`) and has no `G`, and it
  intentionally follows the side-effect-free, validator-authoritative soft-skip
  model (it never narrates its own data gaps). Surfacing a fallback note would
  require a `BuildVillainDeckResult` shape change plus caller wiring to drain it
  into `G.messages` — outside this packet's composition scope. The fallback
  *behavior* (default `8` / `numPlayers`) is fully covered by the Scope C
  fallback tests; only the message is deferred to a future diagnostics WP.
- Refactors or cleanups beyond the sections listed in Scope (In).

---

## Files Expected to Change

- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — **modified** —
  copies instancing, scheme-driven twist/bystander counts, generic Master
  Strikes, remove mastermind-card inclusion.
- `packages/game-engine/src/villainDeck/villainDeck.setup.test.ts` — **modified** —
  golden composition + fallback + determinism cases.
- `docs/ai/DECISIONS.md` — **modified** — flip D-16801 / D-16802 status from
  "effective on WP-168 execution" to effective (status finalization only — they
  are already recorded and Accepted; do **not** re-record their bodies).
- `docs/ai/STATUS.md` — **modified** — record corrected villain-deck composition.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-168.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — flip EC-186 to Done.

**Dependency-driven cascade re-baselines (allowlist amended at execution, 2026-05-22):**

The villain-deck composition change is replay-affecting by design (see §Vision
Alignment §22). Two pre-existing replay regression guards pin the *old*
composition and therefore must be re-baselined as a strict cascade of this WP's
change. Both were absent from the original allowlist; added at execution time
with operator approval (the change reverts cleanly by undoing the composition
change, in the spirit of `01.5-runtime-wiring-allowance.md`):

- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified** —
  value-only update of the `PRE_WP080_HASH` byte-identity literal
  (`6228d103` → `35fbe2fc`). The empty mock registry now yields the 5
  data-independent generic Master Strikes, changing `G.villainDeck.deck`
  contents and the JSON-encoded state hash. No logic change to the test.
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
  — **modified** — regenerated via `scripts/record-game-fixture.mjs` (meta
  block unchanged; only the `expected` block re-recorded). The replay now
  reveals generic Master Strikes that increment `masterStrikeCount`
  (`outcome.counters: {} → {masterStrikeCount: 2}`) and the
  `finalStateHash` / per-turn snapshots shift accordingly — the correct new
  behavior under D-16801.

No other files may be modified.

---

## Acceptance Criteria

### Composition
- [ ] Each villain card is instanced `copies` times with ext_id
      `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}`; a card with no `copies`
      yields exactly one instance.
- [ ] Scheme-twist count equals the scheme's `villainDeckTwistCount`, falling
      back to `8` when absent.
- [ ] Villain-deck bystander count equals the scheme's
      `villainDeckBystanderCount`, falling back to `numPlayers` when absent.
- [ ] Exactly `MASTER_STRIKE_COUNT` (5) generic `master-strike-{NN}` cards are
      added, typed `'mastermind-strike'`.
- [ ] No mastermind card (`{setAbbr}-mastermind-...`) appears in the deck.

### Golden / determinism
- [ ] The Midtown golden test asserts `scheme-twist`=8, `bystander`=12,
      `mastermind-strike`=5, `henchman`=10, `villain`=8 (4 × `copies:2`), and
      `deck.length === 43` directly.
- [ ] Every `'mastermind-strike'`-typed entry has a `master-strike-` prefix (the
      removed mastermind-card branch cannot reappear under the same type).
- [ ] Two builds with identical mock ctx (same fixed seed) produce identical decks.
- [ ] `JSON.stringify(state)` succeeds.

### Boundaries
- [ ] No `boardgame.io` import in `villainDeck.setup.ts`
      (confirmed with `Select-String`).
- [ ] No `Math.random` in any modified file (confirmed with `Select-String`).
- [ ] No `.reduce(` in `villainDeck.setup.ts` (confirmed with `Select-String`).

### Tests / Scope
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0.
- [ ] Test uses `node:test` + `makeMockCtx`; no `boardgame.io` import.
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all tests
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — all tests passing, 0 failing

# Step 3 — confirm no boardgame.io import in the builder
Select-String -Path "packages\game-engine\src\villainDeck\villainDeck.setup.ts" -Pattern "boardgame.io"
# Expected: no output

# Step 4 — confirm no Math.random in the builder
Select-String -Path "packages\game-engine\src\villainDeck\villainDeck.setup.ts" -Pattern "Math.random"
# Expected: no output

# Step 5 — confirm no .reduce in the builder
Select-String -Path "packages\game-engine\src\villainDeck\villainDeck.setup.ts" -Pattern "\.reduce\("
# Expected: no output

# Step 6 — confirm the master strike constant exists
Select-String -Path "packages\game-engine\src\villainDeck\villainDeck.setup.ts" -Pattern "MASTER_STRIKE_COUNT"
# Expected: at least one match

# Step 7 — confirm no files outside scope changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Decisions (Already Recorded — Verify + Finalize Status)

These two decisions were **recorded and Accepted** in the WP-168 drafting SPEC
(status: "effective on WP-168 execution"). This packet does **not** re-record
them; it verifies they are present and flips their status to effective. Their
content is reproduced here for reference:

- **D-16801 — Master Strikes are generic virtual instanced cards; the
  mastermind card is not a villain-deck card.** The villain deck contains
  `MASTER_STRIKE_COUNT = 5` generic Master Strikes (ext_id `master-strike-{NN}`,
  type `'mastermind-strike'`), matching the standard Legendary rule. This
  supersedes D-1413's rule that the mastermind's non-tactic cards are shuffled
  into the villain deck as strikes. The mastermind card and its tactics are not
  villain-deck cards; their placement is governed elsewhere. Master Strike
  effect resolution (reading the active mastermind) is unchanged and out of
  this packet's scope.
- **D-16802 — Villain copies are virtual-instanced with a copy-index suffix.**
  A villain card with `copies: N` produces N ext_ids of the form
  `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}`. Distinct ext_ids preserve
  independent movement and replay attribution (same rationale as D-1410 for
  henchmen). Display resolution must strip the trailing `-{NN}` to find the base
  card; that UI follow-up is tracked separately.

---

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, run 2026-05-22 against
this WP. All 21 sections resolved:

- **§1 Structure** — PASS. All 10 required sections present and non-empty;
  `## Out of Scope` lists 7 explicit exclusions.
- **§2 Non-Negotiable Constraints** — PASS. Engine-wide + packet-specific +
  session protocol + locked values; full-file-contents required (diffs/snippets
  forbidden); cites `00.6-code-style.md`.
- **§3 Assumes** — PASS. Lists WP-167, the exact builder/types/mock exports, and
  the build/test + DECISIONS external state; blocking gate stated.
- **§4 Context** — PASS. Specific docs + sections: ARCHITECTURE §Layer Boundary,
  `00.2 §1.4/§1.5`, DECISIONS D-1410..13 / D-16701/2, `00.6` Rules 4/6/7/8/14.
- **§5 Files Expected to Change** — PASS. 6 files, each marked modified with a
  one-line change note; closed list ("No other files may be modified").
- **§6 Naming** — PASS. `copies` / `villainDeckTwistCount` /
  `villainDeckBystanderCount` / `ext_id` / setup-payload fields match `00.2`.
- **§7 Dependency Discipline** — PASS. Introduces no npm dependencies.
- **§8 Architectural Boundaries** — PASS. Setup-time builder; `ctx.random.*`
  only; `G` JSON-serializable (CardExtId strings); no registry/`boardgame.io`
  imports; lives in the correct `villainDeck/` engine path.
- **§9 Windows Compatibility** — PASS. Verification Steps are PowerShell
  (`Select-String`, `pwsh` fence).
- **§10 Env Var Hygiene** — N/A. WP touches no environment variables.
- **§11 Authentication** — N/A. WP touches no authentication surface.
- **§12 Test Quality** — PASS. `node:test` + `makeMockCtx` (reverse-shuffle); no
  `boardgame.io` import / network / DB; golden deterministic deck test with a
  `// why:` replay-breaking warning.
- **§13 Verification Commands** — PASS. Exact `pnpm` commands with expected
  output.
- **§14 Acceptance Criteria** — PASS. 15 binary, observable, specific items
  aligned to scope. (Count exceeds the 6–12 guideline because criteria are
  grouped Composition / Golden / Boundaries / Tests; not a FAIL — every item is
  binary and testable.)
- **§15 Definition of Done** — PASS. Includes acceptance, STATUS.md,
  DECISIONS.md, WORK_INDEX.md, and the no-out-of-scope-files check.
- **§16 Code Style** — PASS. Helpers ≤30 lines + JSDoc, no `.reduce()`,
  descriptive names, `// why:` on the non-obvious constants — all required by
  the constraints.
- **§17 Vision Alignment** — PASS. Triggered (RNG sourcing + card content); WP
  has the `## Vision Alignment` block citing §1/§3/§8/§10/§14/§18/§22, conflict
  assertion, NG-1..7 check, and the determinism-preservation line.
- **§18 Prose-vs-Grep** — **FIX applied.** Verification Steps 3 & 5 grep this
  file for `boardgame.io` / `.reduce(` expecting no output, but the current
  file's line-14 and line-278 comments contain those literal tokens (WP-037
  precedent). Added a packet-specific constraint requiring the rewritten
  comments to cite the rule instead of the verbatim tokens. Now PASS.
- **§19 Bridge-vs-HEAD Staleness** — N/A. Commit-time discipline, not a
  WP-lint gate; this WP is not a repo-state-summarizing artifact.
- **§20 Funding Surface Gate** — N/A. Engine setup logic only; no funding
  affordances, no user-visible copy, no funding channels referenced.
- **§21 API Catalog** — N/A. No HTTP endpoint added/modified/removed and no
  `apps/server/src/**` library function changed; engine-only change.

**Verdict:** all 21 sections PASS or justified N/A after the §18 fix.

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] No `boardgame.io` import, no `Math.random`, no `.reduce(` in
      `villainDeck.setup.ts` (confirmed with `Select-String`)
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — villain deck now composes from scheme
      metadata + villain copies + generic Master Strikes
- [ ] `docs/ai/DECISIONS.md` — D-16801 / D-16802 status finalized to effective
      (status flip only; bodies not re-recorded)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-168 checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-186 flipped to Done
