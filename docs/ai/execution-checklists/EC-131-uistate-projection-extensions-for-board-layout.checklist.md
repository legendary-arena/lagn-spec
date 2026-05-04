# EC-131 — UIState Projection Extensions for Board Layout (Execution Checklist)

**Source:** docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md
**Layer:** Game Engine — UI projection (`packages/game-engine/src/ui/`)

**Execution Authority:**
This EC is the authoritative execution checklist for WP-128.
Implementation must satisfy every clause exactly.
Failure to satisfy any item below is a failed execution of WP-128.

---

## §0 — Pre-Flight

- [ ] WP-028 contract files present and unchanged at HEAD: `packages/game-engine/src/ui/uiState.types.ts`, `uiState.build.ts`, `uiState.filter.ts`, `uiState.types.drift.test.ts`. Verified by `git ls-tree HEAD`.
- [ ] WP-089 wiring present: `LegendaryGame.playerView` references `buildPlayerView` in `game.ts`. Verified by `Select-String`.
- [ ] WP-111 fields (`G.cardDisplayData`, `UICardDisplay`, `UIHQCard`) present in `uiState.types.ts`.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 with baseline `604/132/0` on `main` HEAD.
- [ ] `docs/ai/DESIGN-BOARD-LAYOUT.md` present at the wireframe SPEC commit (`277bcca` or later); §4 `Pending` rows enumerated.
- [ ] Five executor decisions (D-DEC-1..D-DEC-5 per WP-128 §Decision Points) locked in writing at the start of the session before writing any production file.

## §1 — Scope Lock + File Allowlist

Six production / reference files (one of which is conditional on the 01.5 cascade) plus four governance ledgers in the same commit.

- `packages/game-engine/src/ui/uiState.types.ts` — **modified**
- `packages/game-engine/src/ui/uiState.build.ts` — **modified**
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified**
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified**
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified**
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified**
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified ONLY IF** `01.5` cascade fires (replay-hash literal updates); skip if hashes match pre/post projection
- Plus governance: `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`

`git diff --name-only` lists 10 or 11 files at session close (6 production + 4 governance, +1 if `01.5` cascade fires).

## §2 — Locked Values (do not re-derive)

- New `UIState` top-level fields: `decks: UIDecksState`, `piles: UISharedPilesState`, `koPile: UIKoPileState`. All three are required (not optional).
- New `UIPlayerState` optional fields: `inPlayCards?`, `inPlayDisplay?`, `discardTopCard?`, `victoryCards?`, `victoryVp?`. All five are optional and redacted by `filterUIStateForAudience` per the audience matrix below.
- New required fields on existing types: `mastermind.attachedBystanders`, `mastermind.strikePile`, `scheme.twistPile`, `city.escapedPile`, `economy.piercing`, `economy.woundsDrawn`. All required (not optional) — the engine always projects them; counts may be `0` and arrays may be `[]` but the field is present.
- Audience filter matrix:
  - `inPlayCards` / `inPlayDisplay`: redacted for `audience !== ownPlayerId` AND for `'spectator'`.
  - `discardTopCard` / `victoryCards` / `victoryVp`: NOT redacted (public).
  - All shared-board fields (mastermind / scheme / city / decks / piles / koPile): NOT redacted (public).
- Aliasing-defense pattern: per-entry shallow copies via `{ ...entry }` mirroring WP-111 D-11105.
- New display-bearing entry shape (used by `victoryCards`, `strikePile`, `twistPile`, `escapedPile`, `koPile.cards`, `koPile.topCard`, `discardTopCard`, `attachedBystanders`): `{ extId: string; display: UICardDisplay }`. Defined once as a shared type alias (e.g., `UIDisplayEntry`) — not redeclared at every consumer site.
- 01.5 IS INVOKED. Replay-hash literal updates in `replay.execute.test.ts` are permitted as 01.5-cascade allowlist additions if (and only if) the new fields cause `computeStateHash` to produce different hashes for existing fixtures.

## §3 — Guardrails

- No new `G` fields. The packet projects existing `G` state. If a needed `G` field is missing, STOP and surface — that's a separate WP.
- No `Math.random()` / `Date.now()` / network / filesystem / `boardgame.io` import in `uiState.{types,build,filter}.ts`.
- No `.reduce()` for branching projection logic — use `for...of` per `00.6` Rule 8.
- No registry runtime imports in projection files. Display data flows through `G.cardDisplayData` (a setup-time-only resolved cache per WP-111).
- Composition counters (S.H.I.E.L.D. Level / HYDRA Level / Bystanders rescued / etc.) are NOT projected by this packet — explicitly out of scope.
- Audience filter mutations ONLY redact (set fields to `undefined` or omit per `exactOptionalPropertyTypes` discipline) — never modify or transform projected values.

## §4 — Required `// why:` Comments

- `uiState.types.ts` module-header JSDoc: cite WP-128 + the wireframe at `docs/ai/DESIGN-BOARD-LAYOUT.md §4` as the design input.
- `UIPlayerState.inPlayCards?` declaration site: cite the audience-filter redaction rule (D-DEC-3 reasoning).
- `UIPlayerState.victoryCards?` declaration site: cite the public-info posture (VP cards are public knowledge by design — VP is built from face-up resolved cards).
- `UIDecksState` module-header: cite "next-card identity NEVER projected" (per WP-014A determinism contract).
- `UIKoPileState` declaration site: cite the shared (not per-player) nature.
- `uiState.build.ts` aliasing-defense site: cite WP-111 D-11105 precedent.
- `uiState.filter.ts` redaction-rule site: cite D-DEC-3 + the audience matrix in §2 above.
- 01.5 cascade site (if fired) in `replay.execute.test.ts`: cite WP-128 + the specific hash literal updated.

## §5 — Verification Gates (run all; every item binary)

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; baseline `604/132/0` → `604+N/132+M/0` with N+M ∈ [12, 20].
- [ ] No new `G` field added: `git diff packages/game-engine/src/types.ts` returns empty.
- [ ] No `Math.random` / `Date.now` / `fetch(` / `require(` in projection files: `Select-String -Path "packages\game-engine\src\ui\uiState.build.ts","packages\game-engine\src\ui\uiState.filter.ts" -Pattern "Math\.random|Date\.now|fetch\(|require\("` returns no output.
- [ ] No `boardgame.io` import in projection / filter / types: `Select-String -Path "packages\game-engine\src\ui\uiState.build.ts","packages\game-engine\src\ui\uiState.filter.ts","packages\game-engine\src\ui\uiState.types.ts" -Pattern "from ['\"]boardgame\.io"` returns no output.
- [ ] No registry import in projection: `Select-String -Path "packages\game-engine\src\ui\" -Pattern "@legendary-arena/registry"` returns no output.
- [ ] Drift test pins every new field name: `Select-String -Path "packages\game-engine\src\ui\uiState.types.drift.test.ts" -Pattern "victoryCards|victoryVp|strikePile|twistPile|escapedPile|koPile|piercing|woundsDrawn|inPlayCards|discardTopCard|attachedBystanders"` returns at least 11 matches.
- [ ] No `UIAudience` extension: `git diff packages/game-engine/src/ui/uiAudience.types.ts` returns empty.
- [ ] Aliasing test fires: a test mutates a returned `victoryCards` entry and asserts the next `buildUIState` call returns un-corrupted shape.
- [ ] Filter test fires: opponent-audience `UIState` lacks `inPlayCards` + `inPlayDisplay`; spectator-audience lacks `handCards` + `handDisplay` + `inPlayCards` + `inPlayDisplay`; all three lack of fields verified by `=== undefined` assertions.
- [ ] JSON round-trip test passes for fully-populated `UIState`.
- [ ] If 01.5 cascade fired: `replay.execute.test.ts` updated literal carries `// why: WP-128 cascade per 01.5` comment.
- [ ] D-12801..D-12806 inserted in numeric order in DECISIONS.md.
- [ ] STATUS.md block at top of `## Current State`.
- [ ] WORK_INDEX.md WP-128 row checked off.
- [ ] EC_INDEX.md EC-131 row flipped Draft → Done.

## §6 — Commit Hygiene

- [ ] Commit prefix: `EC-131:`. Code under `packages/game-engine/src/ui/` is staged → SPEC: prefix forbidden per `01.3` Rule 5.
- [ ] Vision trailer: `Vision: §3, §11, §14, §15, NG-1, NG-3, NG-6` per `01.3` Vision Trailer convention.
- [ ] No `--no-verify`, no `--no-gpg-sign`.

## §7 — Post-Execution Checks

- [ ] All WP-128 §Acceptance Criteria pass.
- [ ] D-12801..D-12806 entries written into DECISIONS.md with executor's locked choices for D-DEC-1..D-DEC-5 + rationale + rejected alternatives.
- [ ] 01.6 post-mortem MANDATORY at `docs/ai/post-mortems/01.6-WP-128-uistate-projection-extensions.md` per Definition of Done — new long-lived projection surface (decks + piles + koPile + per-player victory contents).
- [ ] STATUS.md `### WP-128 / EC-131 Executed` block cites the new fields + the audience-filter matrix + the 01.5 cascade resolution.
- [ ] WORK_INDEX.md WP-128 row checked off with date + commit hash.
- [ ] EC_INDEX.md EC-131 row flipped `Draft` → `Done {YYYY-MM-DD}`.

## Common Failure Smells

- New `G` field accidentally introduced because the projection needs data not yet in `G` → STOP, file separate WP for the `G` extension.
- `inPlayCards` projected for opponents → audience-filter redaction missing; D-DEC-3 violated.
- `victoryCards` shape diverges from `{ extId, display }` → DRY violation; should use the `UIDisplayEntry` shared alias.
- Drift test still pins only old field set → drift test wasn't extended; will silently pass and let future regressions slip through.
- `Math.random()` introduced because someone tried to "randomize the top card display" → determinism violated.
- Registry runtime import added to projection file → layer-boundary violated; `G.cardDisplayData` is the authoritative display source per WP-111.
- 01.5 cascade fires but no `// why:` comment on the updated literal → attribution lost.
- Aliasing test omitted → future contributors mutate returned arrays without tripping the safety net.
