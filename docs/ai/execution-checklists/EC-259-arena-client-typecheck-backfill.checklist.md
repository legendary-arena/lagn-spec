# EC-259 — Arena Client Typecheck Restoration (Execution Checklist)

**Source:** docs/ai/work-packets/WP-227-arena-client-typecheck-backfill.md
**Layer:** Client (`apps/arena-client/**`) only. Engine/registry/server/viewer zero-diff.

## Before Starting

- [ ] Read WP-227 in full, plus WP-207a/WP-207b (the backfill precedent).
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits **2** at baseline
      with 19 errors across 14 files (capture the list — it is the work-list).
- [ ] `pnpm --filter @legendary-arena/arena-client test` passes at baseline.
- [ ] `git diff --name-only` is empty (clean baseline; pre-existing untracked
      dashboard/WP-226 files may be present and are NOT in scope).
- [ ] Confirm the engine contracts are present and unchanged (read-only):
      `villainAttachedHeroes` (required), `attachedHeroes`/`fightCost` (required),
      `pendingHeroChoice?` (optional) in `packages/game-engine/src/ui/uiState.types.ts`.

## Locked Values (do not re-derive)

- **`UIState.villainAttachedHeroes`** backfill value: `{}` (empty record).
- **`UICityCard.attachedHeroes`** backfill value: `[]` (empty array).
- **`UICityCard.fightCost`** backfill value: `0` (assertion-neutral — no test reads it).
- **`pendingHeroChoice` prop fix:** `PropType<UIPendingHeroChoice>` →
  `PropType<UIPendingHeroChoice | undefined>` in `PendingHeroChoicePrompt.vue`;
  keep `required: false` + `default: undefined`. Type-only; no template/logic change.
- **JSON city-card counts:** `mid-turn.json` = 3, `endgame-win.json` = 0,
  `endgame-loss.json` = 5 (each non-null card gets both fields).
- **Read-only files (errors auto-clear / auto-fixed):** `fixtures/uiState/index.ts`,
  `fixtures/uiState/typed.ts` (downstream of JSON); `PendingHeroChoicePrompt.test.ts`
  (the prop widening validates its `undefined` mount).
- **No DECISIONS.md entry** — mechanical backfill of existing contracts (WP-207b precedent).
- **Commit prefix:** `EC-259:` (source under `apps/`; SPEC:/INFRA: do not apply).

## Order of Operations

1. Widen the `pendingHeroChoice` `PropType` in `PendingHeroChoicePrompt.vue`.
2. Backfill the 3 JSON fixtures: top-level `villainAttachedHeroes: {}` + the two
   city-card fields on each non-null card (3 + 0 + 5).
3. Backfill the 9 inline-`UIState` / inline-`UICityCard` test files (drive off the
   `vue-tsc` error list — each reported line is a literal missing a field).
4. Re-run `typecheck` until exit 0; then run `test` until green.
5. Governance close (STATUS, WORK_INDEX, EC_INDEX).

## Guardrails

- **Engine types + `index.ts`/`typed.ts` + `PendingHeroChoicePrompt.test.ts` are
  read-only.** Editing them masks the real fix or expands scope.
- **Additive only** — never reorder/reformat/remove an existing member; JSON stays valid.
- **Field names exact** — `villainAttachedHeroes`, `attachedHeroes`, `fightCost`.
- **Type-only component change** — do not touch the `PendingHeroChoicePrompt` template/`setup()`.
- **Behavior-neutral** — if a `vitest` assertion breaks on a backfilled value, fix
  that single assertion in-place; if it cannot be resolved that way → STOP (Hard Stop 4).
- **Wider-field guard** — if `typecheck` surfaces a NEW missing required member after
  the backfill → STOP (Hard Stop 3); scope is wider than this WP.
- Only the 16 files in §Files to Produce may change — `git status --porcelain` enforces this.

## Files to Produce

- `apps/arena-client/src/components/play/PendingHeroChoicePrompt.vue` — **modified** — prop PropType widened
- `apps/arena-client/src/fixtures/uiState/{mid-turn,endgame-win,endgame-loss}.json` — **modified** — `villainAttachedHeroes` + per-card fields
- `apps/arena-client/src/components/AutoplayControls.test.ts` — **modified**
- `apps/arena-client/src/components/play/CityRow.test.ts` — **modified**
- `apps/arena-client/src/components/play/TopHudBar.test.ts` — **modified**
- `apps/arena-client/src/composables/useCityRow.test.ts` — **modified**
- `apps/arena-client/src/pages/PlayDesktop.test.ts` — **modified**
- `apps/arena-client/src/pages/PlayMobile.test.ts` — **modified**
- `apps/arena-client/src/preplan/mutationDetector.test.ts` — **modified** — both literals
- `apps/arena-client/src/preplan/mutationMiddleware.test.ts` — **modified**
- `apps/arena-client/src/services/autoplayPlayback.test.ts` — **modified**
- `docs/ai/STATUS.md` — **modified** — WP-227 Done entry
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-227 Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-259 Ready → Done

## After Completing

- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0.
- [ ] `pnpm --filter @legendary-arena/arena-client test` passes (no new failures).
- [ ] All 3 JSON fixtures: `villainAttachedHeroes === {}`; every city card has
      `attachedHeroes: []` + `fightCost: 0`; each parses as valid JSON.
- [ ] `index.ts` / `typed.ts` byte-identical to baseline (`git diff` empty).
- [ ] `PendingHeroChoicePrompt.vue` prop type is `PropType<UIPendingHeroChoice | undefined>`.
- [ ] `git diff --name-only packages/ apps/registry-viewer apps/server` empty.
- [ ] `git status --porcelain` lists only the 16 in-scope paths.
- [ ] STATUS.md updated; WORK_INDEX WP-227 Done; EC_INDEX EC-259 Done.

## Common Failure Smells

- Typecheck still red after the JSON edit → a city card was missed, or the
  top-level `villainAttachedHeroes` was added but the nested city cards still
  lack fields (TS reports the top-level miss first, the nested miss second).
- `index.ts`/`typed.ts` show in `git diff` → they were edited instead of the JSON;
  revert them, fix the JSON.
- New missing-required-member error after backfill → a third engine field drifted;
  STOP (Hard Stop 3), do not guess.
- `vitest` red after backfill → a render/snapshot assertion picked up `fightCost: 0`;
  update that one assertion in-place, or STOP if it implies a behavior change.
- `git diff packages/` non-empty → an engine type was edited; revert (contract is read-only).
