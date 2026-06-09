# EC-259 — Arena Client Typecheck Restoration (Execution Checklist)

**Source:** docs/ai/work-packets/WP-227-arena-client-typecheck-backfill.md
**Layer:** Client (`apps/arena-client/**`) only. Engine/registry/server/viewer zero-diff.

## Before Starting

- [ ] Read WP-227 in full, plus WP-207a/WP-207b (the backfill precedent).
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits **2** at baseline
      with three classes: (a) `UIState` missing `villainAttachedHeroes`, (b) `UICityCard`
      missing `attachedHeroes`/`fightCost`, (c) `pendingHeroChoice` `exactOptionalPropertyTypes`.
      Capture the full list (the work-list). **Classes + affected files are authoritative;**
      totals (≈19/14) + line numbers are advisory — not, on their own, a STOP.
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
  `PropType<UIPendingHeroChoice | undefined>` in `PendingHeroChoicePrompt.vue` —
  exactly `| undefined` (accepts `undefined`, **NOT** `null`); keep `required: false`
  + `default: undefined`; type-only, no template/logic change.
- **JSON structural lock:** `villainAttachedHeroes` exactly once, top-level, never
  nested; `attachedHeroes` + `fightCost` on every **non-null city card** — defined
  executably as each **truthy** element of `(o.city && o.city.spaces) || []` — at the
  card's own object level (alongside `extId`/`type`/`keywords`/`display`), never
  nested. Per-file card counts: `mid-turn`=3, `endgame-win`=0, `endgame-loss`=5.
  Append at the end; valid JSON, **no trailing comma**; key order unchanged; no field
  added twice (idempotent end state).
- **Read-only (auto-clear/auto-fixed):** `fixtures/uiState/index.ts` + `typed.ts`
  (downstream of JSON); `PendingHeroChoicePrompt.test.ts` (prop widening validates its `undefined` mount).
- **No DECISIONS.md entry** — mechanical backfill of existing contracts (WP-207b precedent).
- **Commit prefix:** `EC-259:` (source under `apps/`; SPEC:/INFRA: do not apply).

## Order of Operations

1. Widen the `pendingHeroChoice` `PropType` in `PendingHeroChoicePrompt.vue`.
2. Backfill the 3 JSON fixtures: top-level `villainAttachedHeroes: {}` + the two
   city-card fields on each non-null card (3 + 0 + 5).
3. Backfill the 9 inline-`UIState` / inline-`UICityCard` test files (drive off the
   `vue-tsc` error list — each reported line is a literal missing a field).
4. **Error-driven loop — repeat until green:** run `typecheck`; edit **only** the
   file(s)/field named in the reported errors (no speculative edits to unnamed files).
   Exit only at `typecheck` exit 0 (zero errors — a lower nonzero count is not done).
5. Run `test` until green (the additive backfill must not change runtime behavior).
6. Governance close (STATUS, WORK_INDEX, EC_INDEX).

## Guardrails

- **Engine types + `index.ts`/`typed.ts` + `PendingHeroChoicePrompt.test.ts` are
  read-only — REVERT on sight.** If `git diff` shows a change to `index.ts` or
  `typed.ts` (or any engine type / the prompt test), `git checkout -- <file>`
  immediately before proceeding — editing them masks the real fix or expands scope.
- **Failure isolation** — edit **only** the file that owns a reported error line.
  No repo-wide search/replace; no speculative edits to files not named by the
  current `typecheck` output.
- **Additive only** — never reorder/reformat/remove an existing member or key order;
  append at the end; JSON stays valid (no trailing comma after the final member).
- **No formatter churn** — if a save introduces non-functional reformatting, revert
  the file and re-apply only the minimal additive edit.
- **Field names exact** — `villainAttachedHeroes`, `attachedHeroes`, `fightCost`.
- **Type-only component change** — do not touch the `PendingHeroChoicePrompt`
  template/`setup()`; the widened type accepts `undefined`, not `null`.
- **`vitest` assertion rule** — *allowed:* update a literal expected value that
  changed only because a backfilled field is now present. *Forbidden:* changing test
  logic, adding/removing assertions, or altering test structure. If a break needs
  more than a literal-value update → STOP (Hard Stop 4).
- **Scope-violation guard (binary)** — if `typecheck` surfaces ANY error whose
  message does not reference `villainAttachedHeroes` / `attachedHeroes` / `fightCost`
  / `pendingHeroChoice` → STOP (Hard Stop 3); the drift is wider than this WP.
- **Commit boundary is a hard STOP** — if `git status --porcelain` / `git diff
  --name-only` lists any path outside the 16-file allowlist, STOP; do not stage a
  partial commit. (Pre-existing untracked dashboard/WP-226 files stay unstaged.)

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

- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 — **zero**
      errors (a reduced-but-nonzero count is NOT done).
- [ ] `pnpm --filter @legendary-arena/arena-client test` passes (no new failures).
- [ ] All 3 JSON fixtures: exactly one top-level `villainAttachedHeroes === {}` (not
      nested, not duplicated); every non-null city card has `attachedHeroes: []` +
      `fightCost: 0` at the card's own level; each file parses as valid JSON.
- [ ] Idempotence: re-applying the edits is a no-op and `typecheck` stays exit 0; no
      object has a duplicated `villainAttachedHeroes`/`attachedHeroes`/`fightCost`.
- [ ] `index.ts` / `typed.ts` byte-identical to baseline (`git diff` empty).
- [ ] `PendingHeroChoicePrompt.vue` prop type is `PropType<UIPendingHeroChoice | undefined>`.
- [ ] `git diff --name-only packages/ apps/registry-viewer apps/server` empty.
- [ ] `git status --porcelain` lists only the 16 in-scope paths.
- [ ] STATUS.md updated; WORK_INDEX WP-227 Done; EC_INDEX EC-259 Done.

## Common Failure Smells

- Typecheck still red after the JSON edit → a city card was missed, or the top-level
  `villainAttachedHeroes` was added but the nested city cards still lack fields (TS
  reports the top-level miss first, the nested miss second).
- New error not referencing the four fields after backfill → a wider drift; STOP
  (Hard Stop 3), do not guess. (`index.ts`/`typed.ts` or `packages/` in `git diff`
  → revert per the read-only Guardrail; the JSON is the real fix.)
- `vitest` red after backfill → a render/snapshot assertion picked up `fightCost: 0`;
  update that one literal in-place, or STOP if it implies a behavior change.
