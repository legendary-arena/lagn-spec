# EC-280 — Optional-KO-then-Reward UX (Execution Checklist)

**Source:** docs/ai/work-packets/WP-249-optional-ko-reward-ux.md
**Layer:** Game Engine UIState projection (`ui/uiState.types.ts`,
`ui/uiState.build.ts`, `ui/uiState.filter.ts` + their tests) + arena-client
(`components/play/OptionalKoRewardPrompt.vue` NEW + test NEW,
`components/play/uiMoveName.types.ts`, `composables/useTurnActions.ts`,
`components/play/TurnActionBar.vue`, `pages/PlayDesktop.vue`, `pages/PlayMobile.vue`)
**Paired:** WP-248 / EC-279 (engine) — **co-release locked**.

> Use locked values from WP-249 verbatim. EC-280 is the operational order + gates
> + failure smells; on a design-intent conflict, WP-249 wins. EC-280 intentionally
> duplicates WP-249's locked values for execution binding — WP-249 is the single
> source of truth for design intent; a change to a locked value MUST be applied to
> BOTH documents to keep parity.

## Execution Mode — STRICT EC BINDING (no-interpretation)
- **EC-280 binds execution correctness; WP-249 binds design intent.** On an
  execution-detail conflict the EC wins; on design intent WP-249 wins.
- **Ambiguity → STOP, do not interpret** — especially where the WP-243 UX shapes
  (projection type, redaction site, prompt structure, gating predicate, move
  union) differ from what this EC assumes. Mirror WP-243; do not invent.
- PASS = union of WP-249 `## Acceptance Criteria` (binary; ALL) + this EC's
  After-Completing gates. Any FALSE = failed execution.

## Before Starting
- [ ] **WP-248 / EC-279 landed or co-releasing** — `G.pendingOptionalKoReward(s)`
  + `PendingOptionalKoReward` + `resolveOptionalKoReward` exist. This packet
  PROJECTS + SUBMITS only; it adds no engine gameplay.
- [ ] **WP-243 landed** — the KO-hero UX template: `UIPendingKoHeroChoice`
  (`ui/uiState.types.ts`), its projection (`ui/uiState.build.ts`), chooser-only
  redaction (`ui/uiState.filter.ts`, D-24011); `PendingKoHeroChoicePrompt.vue`,
  `uiMoveName.types.ts`, `useTurnActions.ts` (`hasPendingKoChoice`),
  `TurnActionBar.vue`, `PlayDesktop.vue`, `PlayMobile.vue`. **Read each; mirror it.**
- [ ] engine `test`, arena-client `test`, arena-client `typecheck` (vue-tsc) exit 0
  (anchor counts).

## Locked Values (verbatim from WP-249 — do not re-derive)
- **Projection type:** `UIPendingOptionalKoReward` (`ui/uiState.types.ts`) — front
  entry `{ rewardLabel: string; eligibleHand: UICardDisplay[]; eligibleDiscard:
  UICardDisplay[] }`, mirroring `UIPendingKoHeroChoice`; reuse the existing
  card-display sub-type.
- **Projection:** front `pendingOptionalKoReward`, eligible hand+discard
  recomputed fresh with defensive copies (no aliasing of `G` arrays), in current
  zone + index order — NO pre-filter / NO reorder (the round-trip rule).
- **Reward-label derivation:** `rewardLabel` is computed in `uiState.build.ts` by a
  SINGLE deterministic mapping keyed by WP-248's `rewardType` (`rescue`/`draw`/
  `attack`/`recruit`, D-24019 — deferred to, NOT re-declared) + magnitude. Defined
  ONCE; no ad-hoc/per-card strings. Default: `rescue`→"Rescue a Bystander";
  `draw`→"Draw a card" (`"Draw N cards"` if magnitude > 1); `attack`→"+N Attack";
  `recruit`→"+N Recruit"; unseeded → safe generic fallback (cannot occur).
- **Redaction:** chooser-only (D-24011 analog) — the pending choice + eligible
  hand/discard are stripped for non-choosers + spectators.
- **Move name:** `'resolveOptionalKoReward'` added to `UiMoveName`.
- **Component:** `apps/arena-client/src/components/play/OptionalKoRewardPrompt.vue`
  — non-dismissible; selectable hand+discard list (zone-labeled) + Decline;
  submits `resolveOptionalKoReward({zone,cardId})` or `({decline:true})`.
- **Gating:** `hasPendingOptionalKoReward` (mirror `hasPendingKoChoice`) disables
  End Turn + Pass Priority.
- **Mounts:** `PlayDesktop.vue` + `PlayMobile.vue`.

## Guardrails
- **No engine gameplay change (HARD).** Engine `git diff` is limited to the three
  `ui/` projection files + their tests. NO move/rule/`G`-mutation file touched —
  if one needs touching, the engine contract (WP-248) is wrong; STOP.
- **Chooser-only redaction (HARD, D-24011 analog).** A filter test MUST prove a
  non-chooser / spectator UIState contains NO `pendingOptionalKoReward` and NO
  leaked hand/discard contents.
- **Fixture backfill (HARD — WP-166/207/227 recurrence).** The new UIState field
  breaks arena-client `vue-tsc` unless the client's UIState fixtures are
  backfilled in THIS packet. Backfill them; `vue-tsc` MUST exit 0.
- **Move-union drift.** Update the `UiMoveName` drift assertion (if one exists)
  for the +1 entry.
- **Non-dismissible prompt.** The component cannot be closed while pending; the
  only exits are a KO selection or Decline.
- **Eligible-list round-trip (HARD).** `eligibleHand`/`eligibleDiscard` mirror
  `G.playerZones[pid].hand`/`.discard` in current zone + index order, no
  pre-filter/reorder, so a client `{zone,cardId}` selection is always one the
  engine resolve accepts. A reordered/filtered list = the client can submit a
  card the engine rejects → a no-op the player reads as a broken prompt.
- **Reward-label single mapping (HARD).** Exactly one `rewardType`+magnitude →
  label mapping in `uiState.build.ts`; no per-card or inline label strings (drift
  vector across the future sweep WP).
- **At most one pending prompt.** The client renders only the one projected
  pending choice; do NOT add client-side precedence between pending types — WP-248's
  block-all guard already guarantees at most one is non-empty.
- **No double-submit.** The prompt disables its controls after a submit until the
  projection clears. (A stale resubmit is engine-no-op'd, but don't fire twice.)
- **Projection purity + serializable.** Spread-copy mutable `G` arrays;
  `JSON.stringify(UIState)` succeeds.

## Required `// why:` Comments
- `uiState.types.ts` / `build.ts` — `// why: D-24020` on the type + projection;
  `// why:` single deterministic mapping on the `rewardType`→`rewardLabel` block.
- `uiState.filter.ts` — `// why: D-24020 — hand/discard are private to the chooser`.
- `OptionalKoRewardPrompt.vue` — `// why:` non-dismissible until resolved.
- `useTurnActions.ts` — `// why:` block turn-end while a choice is pending.

## Files to Produce
- `packages/game-engine/src/ui/uiState.types.ts` — **modified**.
- `packages/game-engine/src/ui/uiState.build.ts` — **modified**.
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified**.
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified**.
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified**.
- `apps/arena-client/src/components/play/OptionalKoRewardPrompt.vue` — **new**.
- `apps/arena-client/src/components/play/OptionalKoRewardPrompt.test.ts` — **new**.
- `apps/arena-client/src/components/play/uiMoveName.types.ts` — **modified**.
- `apps/arena-client/src/composables/useTurnActions.ts` — **modified**.
- `apps/arena-client/src/components/play/TurnActionBar.vue` — **modified**.
- `apps/arena-client/src/pages/PlayDesktop.vue` — **modified**.
- `apps/arena-client/src/pages/PlayMobile.vue` — **modified**.
- `docs/ai/STATUS.md` — **modified**.
- `docs/ai/DECISIONS.md` — **modified** — D-24020 Reserved → Active.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-249 `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-280 Pending → Done.

**Total: 16 files** (12 source/test + 4 governance). **Pre-flight pin:** if the
turn-action gating lives in `TurnActionBar.vue` alone (no `useTurnActions.ts`
change) or needs an additional fixture file, adjust the count at pre-flight and
update AC #9 before executing. No other flex.

## After Completing
- [ ] engine `test` + arena-client `test` + arena-client `typecheck` (vue-tsc)
  exit 0; net-new projection (chooser populated; `rewardLabel` per seeded
  `rewardType`; eligible lists in zone + index order) + redaction (non-chooser
  empty) + component (KO-select / Decline / non-dismissible / no double-submit) +
  gating (End Turn disabled) cases; no regress.
- [ ] **No-engine-gameplay grep (HARD).** `git diff --name-only -- packages/game-engine`
  lists ONLY the 3 `ui/` files + their 2 tests — nothing else.
- [ ] **Redaction assertion (HARD).** Filter test: a non-chooser/spectator UIState
  has no `pendingOptionalKoReward` and no leaked hand/discard.
- [ ] **vue-tsc green (HARD).** arena-client fixtures backfilled for the new field.
- [ ] `git diff --name-only` = exactly the 16 files (or per the pre-flight pin).
- [ ] STATUS updated; DECISIONS D-24020 Active byte-identical; WORK_INDEX WP-249
  `[x]`; EC_INDEX EC-280 → Done.

## Completion Output (MANDATORY — emit at session close)
1. **TEST** — engine + arena-client `test` pass/fail (baseline → final);
   arena-client `vue-tsc` exit; net-new case names.
2. **REDACTION** — non-chooser/spectator UIState confirmed free of the pending
   choice + hand/discard (test name).
3. **DIFF** — `git diff --name-only` (= the 16-file allowlist);
   `git diff --name-only -- packages/game-engine` = only the 3 `ui/` files + 2 tests.
4. **GOVERNANCE** — STATUS updated; D-24020 → Active; WORK_INDEX WP-249 → `[x]`;
   EC_INDEX EC-280 → Done; **co-release with WP-248 confirmed**.

## Commit Discipline (`.githooks/commit-msg` — enforced)
- Code path (engine `ui/` + arena-client) → prefix `EC-280:`. ≥ 12 chars after prefix.
- Governance close → `SPEC:` (two-commit topology).
- Avoid forbidden subject words.

## Common Failure Smells
- The pending choice / hand / discard leaking to non-choosers → privacy break
  (D-24011 analog); the redaction is the load-bearing gate.
- arena-client `vue-tsc` red because the UIState fixtures were not backfilled
  (the WP-166/207/227 recurrence) → ships red CI to main.
- Touching an engine move/rule file → scope creep into WP-248's contract.
- The prompt dismissible while pending → the player can skip the choice +
  soft-lock turn-end.
- `eligibleHand`/`eligibleDiscard` filtered or reordered vs the live zones → the
  client submits a `{zone,cardId}` the engine rejects; the prompt looks broken.
- Per-card or inline reward-label strings instead of the single mapping → label
  drift the moment the sweep WP marks more cards.
- The prompt fires `resolveOptionalKoReward` twice (no post-submit disable) →
  harmless (engine no-ops the stale one) but reads as a flicker / wasted move.
- Client-side precedence logic between pending-choice types → reinvents the
  engine's block-all invariant in the wrong layer.
- The move-union drift assertion not updated → drift test fails.

## DECISIONS.md Verbatim Block (PS-1 Transcription)

> The D-24020 entry lands in `docs/ai/DECISIONS.md` at draft time as `Reserved
> (proposed)` and flips to `Active` at execution close, byte-identical to the
> block below. Status is the only field that changes.

**D-24020: Optional-KO-then-Reward UX — Chooser-Only Projection + Client Prompt**

The player-facing surface for WP-248's `optional-ko-reward` choice (D-24019) is a
chooser-only UIState projection + an arena-client prompt, mirroring the WP-243
KO-hero UX. The engine projects a `UIPendingOptionalKoReward` (the front pending
choice: a reward label + the eligible hand and discard cards with display data,
recomputed fresh with defensive copies) into UIState; `uiState.filter.ts` redacts
it — and the underlying hand/discard contents — for every player except the
chooser and for spectators (the D-24011 hand-privacy rule). The arena-client adds
`resolveOptionalKoReward` to the `UiMoveName` union, renders a non-dismissible
`OptionalKoRewardPrompt.vue` (a zone-labeled selectable list of eligible
hand/discard cards plus a Decline button, submitting
`resolveOptionalKoReward({zone,cardId})` or `({decline:true})`), mounts it in both
`PlayDesktop.vue` and `PlayMobile.vue`, and disables End Turn / Pass Priority
while the choice is pending (`hasPendingOptionalKoReward`, mirroring
`hasPendingKoChoice`). This packet changes NO engine gameplay — it only projects
existing state and submits the existing move; the arena-client UIState fixtures
are backfilled in the same packet so `vue-tsc` stays green (the WP-166/207/227
recurrence). Co-release-locked with WP-248 (the prompt is inert without the engine
state + move; the engine has no human choice surface without this packet).

**Packet:** WP-249 (EC-280). Co-release: WP-248 (EC-279).
**Drafted:** 2026-06-13 (reserved). **Landed:** TBD (execution close — flips to Active).
**Status:** Reserved (proposed)
