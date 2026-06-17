# WP-258 — Hollow Effects on the Arena-Client Diagnostics Surface (Projection + Debug Panel; Reporting Loop, Surface 1 of 3)

**Status:** Draft — pending review. Pre-flight READY (gates below).
**Primary Layer:** Game Engine (UIState projection: `packages/game-engine/src/ui/**` + barrel) **+** Arena Client (`apps/arena-client/src/**`). Two layers, one WP — the standard engine-projects / client-renders pattern (WP-243 precedent).
**User-Visible Surface:** `play.legendary-arena.com` — a small in-client debug panel listing the hollow effects observed in the current match, plus the structured records riding the **Download-diagnostics** export. (D-24026 live-verification applies.)
**Dependencies:** WP-257 ✅ (the engine `G.diagnostics.hollowEffects` channel + `HollowEffectRecord` this projects). WP-128 ✅ / D-12803 (the `victoryCards` public-projection precedent the filter posture follows). WP-228 / EC-260 ✅ (the Download-diagnostics export that already serializes the full `UIState` snapshot — the records ride it with no diagnostics-module change). The `DESIGN-HOLLOW-EFFECT-DETECTION.md §6.1` "fastest path via the existing Download-diagnostics export" guidance.

---

## Session Context

WP-257 made the engine **emit** the hollow-effect signal (`G.diagnostics.hollowEffects` + a `G.messages` line). The `G.messages` line already reaches the client as a text line in `UIState.log`, but it is unstructured — an operator must read free text to spot a hollow ability. This packet adds the **structured** surface (the reporting loop's first of three consumers, `DESIGN-HOLLOW-EFFECT-DETECTION.md §6`): project the typed records to `UIState`, render them in a compact in-client debug panel, and let them ride the Download-diagnostics export (so a downloaded diagnostics file carries machine-readable hollow records, not just log prose).

Scope was set with the operator (2026-06-17): the **arena-client diagnostics surface**, NOT the dashboard `/debug` page — the dashboard has no match-telemetry ingestion (it reads `/api/dash/*` + build-time data; no server endpoint receives match hollow-effect data), so a live dashboard surface is a separate multi-layer telemetry+persistence pipeline deferred to a later packet. This WP is the cheap, self-contained path the design doc favored.

**Two-layer single-WP rationale (01.0a Step 3):** the engine UIState projection and the client panel are the two halves of one feature (engine projects, client renders) — the WP-243 precedent for exactly this. No new contract crosses the boundary beyond the additive `UIState` field + its barrel export.

---

## Non-Negotiable Constraints

**Engine (game-engine):** `UIState` additive only; the new field is **optional** (`hollowEffects?`) so existing client fixtures need no backfill (the WP-166/207/227 recurrence). The projection is read-only over `G` (`buildUIState` never mutates `G`); deterministic; JSON-serializable. No new gameplay logic. The records are **public** (not hidden info) — they pass through the audience filter unchanged for every audience (the `victoryCards`/`piles`/`log` public-projection posture, D-12803).

**Arena-client:** additive — a new presentational component + one mount point; no engine/registry/server import beyond the `@legendary-arena/game-engine` type barrel; the diagnostics module is **NOT** touched (the export already serializes the full `UIState` snapshot, so the records ride it automatically). `vue-tsc --noEmit` must stay green (the recurrence gate); a client-imported engine type (`HollowEffectRecord`) requires the engine barrel (`index.ts`) re-export (the WP-166/D-16502 barrel-publish gap).

**No new DECISIONS** — this projects the D-24034 channel via the established UIState-projection pattern; the public-pass-through filter posture follows D-12803. No new architectural decision is locked.

---

## Scope (In)

### A) Engine — UIState projection of the channel
- `ui/uiState.types.ts` — add `hollowEffects?: HollowEffectRecord[]` to `UIState` (import the type from `../diagnostics/hollowEffect.types.js`).
- `ui/uiState.build.ts` — in `buildUIState`, project `G.diagnostics?.hollowEffects` onto `uiState.hollowEffects` when present (read-only; absent channel ⇒ field omitted, mirroring the optional-field posture). No mutation of `G`.
- `ui/uiState.filter.ts` — pass `hollowEffects` through **unchanged for every audience** (own-player and others), a shallow array copy mirroring `log`/`piles` (D-12803 public-knowledge posture — hollow records name cards/mechanics, never hidden state).
- `index.ts` (engine barrel) — re-export `HollowEffectRecord` (and `EffectExecutionReason` if the panel renders the reason) so the arena-client can import the type (the D-16502 barrel-publish requirement).

### B) Arena-client — the debug panel
- A new presentational component (e.g. `components/play/HollowEffectsPanel.vue`) that reads `useUiStateStore().snapshot?.hollowEffects` and renders a compact table — `cardType`, `mechanic`, `timing`, `reason`, `turn` — shown only when ≥1 record exists (`v-if`); an explicit empty/absent state is a no-render. Mirrors the `GameLogPanel.vue` store-read pattern + the `DiagnosticExportButton.vue` unobtrusive-placement idiom.
- One mount point on the play surface (the existing play page/HUD — the minimal edit to surface the panel; the diagnostics button's neighborhood is the natural home).

### C) The export rides it for free
- No `diagnostics/diagnostics.ts` / `DiagnosticExportButton.vue` change: `buildDiagnosticReport` already serializes `uiStateSnapshot = useUiStateStore().snapshot` (the full `UIState`), so once `hollowEffects` is on `UIState` the structured records appear in every downloaded diagnostics file automatically. A test asserts the snapshot carries `hollowEffects`.

### D) Tests
- Engine: `ui/uiState.build.test.ts` — a `G` with `diagnostics.hollowEffects` projects onto `UIState.hollowEffects`; an absent channel omits the field. `ui/uiState.filter.test.ts` — `hollowEffects` passes through unchanged for own-player AND other audiences (public).
- Arena-client: `HollowEffectsPanel.test.ts` — renders a row per record; renders nothing when the snapshot has no/empty `hollowEffects`. (`vue-tsc` green.)

---

## Out of Scope
- **The dashboard `/debug` page + any server telemetry/persistence pipeline** — deferred (no match-telemetry ingestion exists; a live dashboard surface is a later multi-layer packet).
- **WP-259 (`/coverage` runtime overlay) and WP-260 (architect-lane intake)** — the other two reporting consumers.
- **Changing the engine detector / the `G.diagnostics` channel / `HollowEffectRecord` shape** (WP-257 contract) — this WP only projects and renders it.
- **The diagnostics module (`diagnostics.ts` / `DiagnosticExportButton.vue`)** — untouched; the export carries the records via the existing `uiStateSnapshot` serialization.
- **Dedup / aggregation / severity beyond what the engine channel already provides** — the panel renders the capped list as-is.
- **`G` mutation, new moves, new gameplay** — projection + render only.

---

## Files Expected to Change
- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — `hollowEffects?: HollowEffectRecord[]` on `UIState`.
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — project `G.diagnostics?.hollowEffects`.
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — public pass-through (both audiences).
- `packages/game-engine/src/index.ts` — **modified (barrel)** — re-export `HollowEffectRecord` (+ `EffectExecutionReason` if rendered).
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — projection test.
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified** — public pass-through test.
- `apps/arena-client/src/components/play/HollowEffectsPanel.vue` — **new** — the debug panel.
- `apps/arena-client/src/components/play/HollowEffectsPanel.test.ts` — **new** — render + empty-state test.
- `apps/arena-client/src/pages/PlayDesktop.vue` (and/or `PlayMobile.vue`) — **modified** — mount the panel (the minimal mount edit; final file confirmed at execution per 01.5 runtime-wiring).

Governance at close: `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md` (WP-258 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-289 Done), `docs/05-ROADMAP-MINDMAP.md` (WP-258 node). **No `DECISIONS.md` entry** (no new decision).

No other files modified. `data/cards/**` byte-unchanged.

---

## Acceptance Criteria

### A) Projection (engine)
- [ ] `UIState.hollowEffects?` is an optional additive field; a `G` carrying `diagnostics.hollowEffects` projects the records onto it; a `G` with no `diagnostics` channel omits the field (no crash, no empty-array injection that would dirty fixtures).
- [ ] `buildUIState` does not mutate `G` (read-only projection); deterministic.
- [ ] `HollowEffectRecord` is re-exported from the engine barrel (`index.ts`).

### B) Filter posture (public)
- [ ] `hollowEffects` passes through the audience filter **unchanged for every audience** (own-player and others) — it is public diagnostic data, not hidden info (D-12803 posture). A filter test asserts both audiences see identical records.

### C) Arena-client panel + export
- [ ] The panel renders one row per record (`cardType`, `mechanic`, `timing`, `reason`, `turn`) and renders nothing when there are no records.
- [ ] The Download-diagnostics export carries the structured `hollowEffects` (a test asserts the snapshot the export serializes includes them) — no diagnostics-module change.
- [ ] `apps/arena-client` `vue-tsc --noEmit` is green (no client fixture backfill needed — the field is optional).

### D) Boundaries / determinism
- [ ] No engine `G` mutation; no new move/rule; `data/cards/**` byte-unchanged.
- [ ] Sentinel/replay `finalStateHash` unchanged (projection is read-only; the channel stays empty in `EMPTY_REGISTRY` fixtures).
- [ ] `git diff --name-only` shows only Files Expected to Change + governance.

---

## Verification Steps

```pwsh
pnpm -r build                                          # exits 0
pnpm --filter @legendary-arena/game-engine test        # all pass, 0 fail
pnpm --filter @legendary-arena/arena-client test       # all pass, 0 fail
pnpm --filter @legendary-arena/arena-client typecheck  # vue-tsc --noEmit, 0 errors
git diff --name-only -- data/cards/                     # empty
```
Live (D-24026, post-deploy): on play.legendary-arena.com, play a card that declares an unhandled ability (or one whose handler is unreachable) and confirm the hollow-effects panel lists it; download diagnostics and confirm the JSON's `uiStateSnapshot.hollowEffects` carries the structured record.

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6 (structure/constraints/prereqs/context/output/naming):** PASS — 00.1 order; canonical names; ~9 files across engine+client (the WP-243 two-layer projection precedent), additive.
- **§7 deps:** PASS — no new npm deps.
- **§8 architecture:** PASS — engine projects read-only to UIState; client renders; the engine barrel re-export is the only cross-layer type seam; no UI→engine runtime reach; no server. Filter posture public (D-12803).
- **§9 Windows / §10 env / §11 auth:** N/A.
- **§12 test quality:** PASS — engine projection + public-pass-through tests; client render + empty-state test; `node:test`; no `boardgame.io`.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands incl. `arena-client typecheck` (the recurrence gate); binary criteria; DoD + D-24026 live-verify.
- **§16 code style:** PASS — presentational component, full English words, optional-field projection, `// why:` on the public-filter posture + the optional-field-no-backfill rationale + the barrel re-export.
- **§17 Vision:** Triggered (touches the UIState projection surface). **Determinism preserved:** read-only projection; `finalStateHash` unchanged; channel public (no hidden-info leak). Advances product quality (hollow abilities become a scannable operator surface). No Vision conflict.
- **§18 prose-vs-grep:** PASS — no count-bounded grep gate on a policed literal.
- **§19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A (no HTTP endpoint / `apps/server` library surface; no funding/identity surface).

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (2026-06-17, baseline `7bb811d2`).** **Dependencies on `main`:** WP-257 (the `G.diagnostics.hollowEffects` channel + `HollowEffectRecord`), WP-128/D-12803 (public-projection precedent), WP-228 (the diagnostics export serializing the full `UIState`). **Contract fidelity verified against source:** `UIState` (`uiState.types.ts:43`) carries public `log`/`piles` projected by `buildUIState` and passed through `uiState.filter.ts` (`piles`/`log` shallow-copy precedent at lines 429/443); the engine barrel (`index.ts`) re-exports UI types (`UIDisplayEntry`/`UISharedPilesState`) — `HollowEffectRecord` joins them; the diagnostics export (`DiagnosticExportButton.vue`) serializes `useUiStateStore().snapshot` so the records ride it with no diagnostics change; `GameLogPanel.vue` is the store-read panel precedent. **Recurrence traps pre-cleared (the WP-166/207/227 + D-16502 history):** the field is **optional** (no client fixture backfill) and the barrel re-export is **in the allowlist up front**. **Empirical Scaffold (`01.4 §Validation-Tightening`): N/A** — purely additive projection + render; no input path tightened, no previously-valid fixture rejected. **Risks resolved:** (1) client vue-tsc breakage from a required field → field is optional (none); (2) barrel-publish gap → `index.ts` in the allowlist; (3) filter leak of hidden info → records are public card/mechanic data, pass-through per D-12803, asserted by a both-audiences filter test. Architectural-boundary confidence high (engine projects, client renders; the dashboard/server path is explicitly OUT).
- **Copilot (`01.7`): PASS / CONFIRM (2026-06-17).** 30-issue lens. **Cat-1 (Boundaries):** engine→client projection only; no UI→engine runtime import; dashboard/server OUT. **Cat-2 (Determinism):** read-only projection; `finalStateHash` unchanged. **Cat-4 (Type Safety):** optional additive `UIState` field + barrel re-export (the two recurrence traps pre-cleared). **Cat-5 (Persistence):** projects the runtime-only channel; nothing persisted. **Cat-8 (Extensibility):** the panel is the first of three consumers; WP-259/260 read the same channel without re-touching the engine. No RISK rising to a scope change → CONFIRM.

> **Drafting status (per 01.0a):** Steps 4–5 complete (WP + EC-289; pre-flight READY; copilot CONFIRM; lint 21/21). Step 6 (session prompt) + Step 7 (SPEC commit/PR/merge/cleanup) follow.

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` 0; engine `test` 0; arena-client `test` 0; arena-client `typecheck` 0
- [ ] `data/cards/**` byte-unchanged; `finalStateHash` unchanged; no engine `G` mutation
- [ ] `UIState.hollowEffects?` optional; `HollowEffectRecord` barrel-exported; no client fixture backfill needed
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/STATUS.md` updated; **D-24026 live-verified** on play.legendary-arena.com (panel shows a hollow effect; diagnostics JSON carries the structured records)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-258 ✅; `docs/ai/execution-checklists/EC_INDEX.md` EC-289 Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-258 node added; `node scripts/roadmap-counts.mjs --check` passes
