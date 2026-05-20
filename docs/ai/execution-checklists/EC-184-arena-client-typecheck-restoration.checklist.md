# EC-184 — Restore arena-client vue-tsc Green + CI Gate (Execution Checklist)

**Source:** docs/ai/work-packets/WP-166-arena-client-typecheck-restoration.md
**Layer:** Game Engine (public barrel) + Client (`apps/arena-client/`) + Build/CI (`.github/workflows/ci.yml`)

## Before Starting
- [ ] Re-verify HEAD against draft baseline `267ea0c`; record current HEAD.
- [ ] Reproduce: `pnpm --filter @legendary-arena/arena-client typecheck` shows ~40 `error TS` lines across four buckets (missing barrel exports / stale fixtures / exactOptionalPropertyTypes / PlayMobile null).
- [ ] EC-183 is merged (PlayDesktop spectator pattern; D-16303).
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/arena-client test` exits 0 (362 pass / 0 fail).

## Locked Values (do not re-derive)
- Six sub-types to re-export from the barrel: `UICardDisplay`, `UIHQCard`, `UIDisplayEntry`, `UIDecksState`, `UISharedPilesState`, `UIKoPileState`.
- `UIState` newly-required fields: `decks: UIDecksState`, `piles: UISharedPilesState`, `koPile: UIKoPileState`.
- `UISchemeState` requires `twistPile`; `UIMastermindState` requires `display`, `attachedBystanders`, `strikePile`.
- `UICardDisplay` = `{ extId: string; name: string; imageUrl: string; cost: number | null }`; `UIDisplayEntry`/`UIHQCard` = `{ extId: string; display: UICardDisplay }`.

## Guardrails
- Add ONLY the six type-only re-exports to the existing UI block in `index.ts`; no value export, no new file, no reorder.
- Do NOT modify `packages/game-engine/src/ui/uiState.types.ts` (locked contract; types already exist).
- Do NOT rename/add/remove any `UIState` field — fixtures rise to the type, never the reverse.
- Do NOT relax `exactOptionalPropertyTypes`; the OpponentPanel fix OMITS the optional keys.
- PlayMobile: gate ONLY the `TurnActionBar` on `viewer !== null` to match the `<main>` guard; do NOT ungate the board or restructure the page (mobile gets no rewind frame, D-16501; EC-183 scoped mobile out).
- Both runners stay green: `test` (tsx, 362) AND `typecheck` (vue-tsc, 0).
- No new npm dependency.

## Required `// why:` Comments
- `index.ts` barrel export: these six complete the WP-128 UI projection surface the client consumes (authored in WP-128, never published).
- `PlayMobile.vue` `TurnActionBar` guard: `viewer` is typed nullable; the turn-action bar needs an identified viewer (matches `<main>`); mobile produces no `viewer`-less play frame (D-16501) — type-safety, not the EC-183 board restructure.

## Files to Produce
- `packages/game-engine/src/index.ts` — **modified** — +6 type-only re-exports.
- `apps/arena-client/src/fixtures/uiState/mid-turn.json` + `endgame-win.json` + `endgame-loss.json` — **modified** — the three `UIState` fixtures raised to the full WP-128 shape. **(Reconciliation R1/R2:** the data lives in these `.json` files, not the `index.ts`/`typed.ts` wrappers the draft named — those are unchanged; and the full shape, not only `decks`/`piles`/`koPile`, was required: also `city.escapedPile` + `city.spaces[].display`, `mastermind.{display,attachedBystanders,strikePile}`, `scheme.twistPile`, `economy.{piercing,woundsDrawn}`. The baseline `vue-tsc` hid the deeper layers via short-circuit. Fixtures rose to the type; the type was untouched.)
- `apps/arena-client/src/components/hud/SharedScoreboard.test.ts` — **modified** — add `twistPile` + mastermind `display`/`attachedBystanders`/`strikePile`.
- `apps/arena-client/src/components/play/OpponentPanel.test.ts` — **modified** — omit the `undefined`-valued optional keys (~line 56).
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified** — guard `TurnActionBar` on `viewer !== null`.
- `.github/workflows/ci.yml` — **modified** — add `pnpm --filter @legendary-arena/arena-client typecheck`. **(Reconciliation:** landed as its own `typecheck-arena-client` job — the §F "step or job" allowance — running `pnpm -r build` first, because arena-client resolves game-engine/preplan via built `dist/*.d.ts` that `build-viewer` doesn't compile.)

## After Completing
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0 (362 pass / 0 fail).
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0.
- [ ] `git diff` shows `uiState.types.ts` untouched and `exactOptionalPropertyTypes` unchanged.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-16502 landed.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-166 checked off; this EC row flipped to Done.

## Common Failure Smells
- Still red after the barrel edit → a sub-type name typo, or it was added outside the `from './ui/uiState.types.js'` block.
- Fixture errors persist → `decks`/`piles`/`koPile` added to only one of `index.ts` / `typed.ts`.
- New `vue-tsc` errors in PlayMobile → footer or slot was re-gated instead of just `TurnActionBar`, or the board was ungated (out of scope).
- Test count drifts off 362 → a fixture edit changed values an existing test asserts on (refresh shape only, not values).
