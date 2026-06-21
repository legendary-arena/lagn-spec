# WP-249 — Optional-KO-then-Reward UX (Projection + Client Prompt)

> **Status:** DRAFT — pending review (do not execute until reviewed per
> `.claude/rules/work-packets.md` Review Gate).
> **Reserves:** D-24020.
> **Paired WP:** WP-248 (engine framework) — **co-release locked** (this UX is
> inert without WP-248's `pendingOptionalKoReward` state + `resolveOptionalKoReward`
> move; WP-248 has no human-facing choice surface without this packet).
> **Paired EC:** EC-280.
> **Depends on:** WP-248 (engine) ✅ **landed 2026-06-14 (commit `1fe28c15`, PR #317)**,
> WP-243 (KO-hero UX precedent), WP-128 (UIState board projections), WP-061
> (arena-client). The co-release lock still binds the other direction: WP-249 must
> not merge to a player-visible release before WP-248 — which is satisfied (WP-248
> is already on `main`).

---

## Session Context

> WP-243 built the player-facing choice surface for the villain KO-a-Hero choice:
> the engine projects `pendingKoHeroChoice` into UIState (front-of-queue, eligible
> targets recomputed fresh, redacted for non-choosers per D-24011); the
> arena-client renders `PendingKoHeroChoicePrompt.vue`, adds the move to the
> `UiMoveName` union, and gates End Turn / Pass Priority via `hasPendingKoChoice`.
> This packet builds the **identical surface** for WP-248's `optional-ko-reward`
> choice — reusing the WP-243 shapes, not inventing new ones.

---

## Goal

After this session, when a player plays a card with WP-248's `optional-ko-reward`
effect (e.g., Black Widow's **Dangerous Rescue**), the arena-client renders a
non-dismissible prompt letting the player **pick a card from their hand or
discard to KO (→ reward), or Decline** — and End Turn / Pass Priority are
disabled until the choice resolves. The engine projects the pending choice
(chooser-only) and the eligible hand/discard cards; the client submits
`resolveOptionalKoReward`.

**Decline is a first-class outcome** — an explicit button submitting
`{decline:true}`, not the absence of action. The reward label shown in the prompt
is DERIVED deterministically from WP-248's `rewardType` + magnitude via a single
mapping (§Locked Contract Values), never an ad-hoc per-card string.

---

## Assumes

> **Drafting baseline (01.0a Step 2):** drafted against `origin/main` alongside
> WP-248 (engine). Supersession check returned no collision. D-24018 reserved on
> the in-flight `#314` branch; D-24019 reserved by WP-248; this packet reserves
> **D-24020**.

- **WP-248 complete.** ✅ Landed on `main` 2026-06-14 (commit `1fe28c15`, PR #317):
  `G.pendingOptionalKoRewards` FIFO + `PendingOptionalKoReward` shape
  (`{ playerID, rewardType, rewardMagnitude, sourceCardId }`) +
  `resolveOptionalKoReward` move + `hasPendingOptionalKoReward` + the reward
  dispatch all exist. **This UX packet does not change engine gameplay.**
- **WP-243 complete.** The KO-hero UX exists and is the structural template:
  `ui/uiState.types.ts` (`UIPendingKoHeroChoice`), `ui/uiState.build.ts`
  (projection), `ui/uiState.filter.ts` (chooser-only redaction, D-24011);
  `components/play/PendingKoHeroChoicePrompt.vue`, `components/play/uiMoveName.types.ts`
  (`UiMoveName` union), `composables/useTurnActions.ts` (`hasPendingKoChoice`
  gating), `components/play/TurnActionBar.vue`, `pages/PlayDesktop.vue`,
  `pages/PlayMobile.vue`.
- arena-client `typecheck` (vue-tsc) + `test` green; engine `test` green.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary` — engine UIState is the Runtime-Safe
  surface arena-client consumes; the client submits **intent** (the move), never
  outcomes; redaction lives in the engine filter, not the client.
- The WP-243 files listed in §Assumes — **read each and mirror its shape** for the
  `optional-ko-reward` analog. Do not invent a new projection/redaction/prompt
  pattern.
- `packages/game-engine/src/ui/uiState.filter.ts` — the D-24011 chooser-only
  redaction (the pending choice + the owner's hand/discard must not leak to
  other players / spectators).
- `apps/arena-client/src/components/play/PendingKoHeroChoicePrompt.vue` — the
  prompt UX precedent (non-dismissible selectable card list + submit).
- `.claude/rules/code-style.md` + `00.6`. (No `.claude/skills/legendary-game-engine`
  authority here for the client; the engine projection half still obeys it.)

---

## Non-Negotiable Constraints

**Engine-wide (projection half):**
- Full file contents. No `Math.random()` in the engine projection; UIState stays
  JSON-serializable; projections are pure over `G` (no mutation, spread-copy
  mutable `G` arrays per the D-WP-028 aliasing precedent).
- The projection recomputes the eligible hand/discard set **fresh** from current
  `G` (no snapshot), mirroring WP-243.

**Client half:**
- ESM, Vue SFC; `vue-tsc` clean; tests via the project's arena-client harness;
  no `boardgame.io` import in components (the client transport handles moves).
  Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (named imports, no
  `.reduce()` in projection/redaction logic, small functions) — applies to BOTH
  the engine projection half and the Vue client half.
- The prompt is **non-dismissible** while the choice is pending (mirrors
  `PendingKoHeroChoicePrompt`); the only exits are selecting a card to KO or
  pressing **Decline**.

**Packet-specific:**
- **No engine gameplay change.** This packet only PROJECTS WP-248's existing state
  and SUBMITS the existing move. It must not add/alter any move, rule, or `G`
  mutation. (`git diff` must show no change to WP-248's engine logic files beyond
  the three `ui/` projection files.)
- **Chooser-only redaction (HARD, D-24011 analog).** `pendingOptionalKoReward`
  and the projected eligible hand/discard cards are visible ONLY to the choosing
  player; redacted for every other player and spectators (hand/discard contents
  are private).
- **Move-union addition.** `resolveOptionalKoReward` added to the `UiMoveName`
  union (the count grows by 1; update the drift assertion if one exists).
- **Turn-action gating.** While a `pendingOptionalKoReward` exists for the active
  player, End Turn + Pass Priority are disabled (extend `hasPendingKoChoice`
  pattern — a parallel `hasPendingOptionalKoReward`, or a combined predicate).
- **At most one pending prompt (relies on WP-248's block-all guard).** WP-248's
  distributed block-all guard guarantees at most ONE of `pendingOptionalKoReward`
  / `pendingKoHeroChoice` / `pendingHeroChoice` is non-empty at a time, so the
  client never arbitrates between simultaneous prompts — render exactly the one
  projected pending choice. Do NOT add client-side precedence logic (that
  invariant is the engine's job, not the UX's).
- **Eligible-list round-trip (HARD).** The projected `eligibleHand` /
  `eligibleDiscard` are derived directly from `G.playerZones[pid].hand` / `.discard`
  in current zone + index order, with NO pre-filtering and NO reordering, so the
  client's `{zone,cardId}` submission maps unambiguously to a card the engine
  resolve will accept. The engine re-validates against current `G`; the projection
  must not diverge from it.
- **Both layouts.** Mount the prompt in `PlayDesktop.vue` AND `PlayMobile.vue`,
  gated on the projected pending choice (mirrors WP-243).

**Locked Contract Values:**
- Projection type: `UIPendingOptionalKoReward` (in `ui/uiState.types.ts`) — front
  entry: `{ playerID: string; rewardLabel: string; eligibleHand:
  UIEligibleKoHeroCard[]; eligibleDiscard: UIEligibleKoHeroCard[] }`, mirroring
  `UIPendingKoHeroChoice`. **`playerID` is REQUIRED** — `uiState.filter.ts` keys
  the chooser-only redaction on it (`audience.playerId === ...playerID`), exactly
  as the KO-hero filter does; omitting it makes the redaction unable to identify
  the chooser (pre-flight finding, 2026-06-14). **Eligible entries REUSE the
  existing `UIEligibleKoHeroCard` sub-type** (`{ zone, cardId, display }`) — NOT a
  bare `UICardDisplay[]`. Each entry MUST carry its instance `cardId` separately
  from `display`, because `UICardDisplay.extId` is the display-lookup id and is not
  guaranteed equal to the zone instance id the engine resolve matches; the KO-hero
  prompt submits `entry.cardId` for exactly this reason (round-trip rule, pre-flight
  finding 2026-06-14). Entries in `eligibleHand` carry `zone:"hand"`, in
  `eligibleDiscard` `zone:"discard"`. `eligibleHand` / `eligibleDiscard` are fresh,
  index-ordered, defensively-copied projections of the current hand/discard (no
  snapshot, no aliasing of `G` arrays, no pre-filter/reorder — the round-trip rule).
- Reward-label derivation (LOCKED): `rewardLabel` is computed in `uiState.build.ts`
  by a SINGLE deterministic mapping keyed by WP-248's `rewardType` (the seeded set
  `rescue`/`draw`/`attack`/`recruit`, D-24019 — deferred to, not re-declared) +
  the reward magnitude. Defined ONCE; never an ad-hoc or per-card string. Default
  copy (adjustable, but it must stay a single mapping): `rescue` → "Rescue a
  Bystander"; `draw` → "Draw a card" (`"Draw N cards"` when magnitude > 1);
  `attack` → "+N Attack"; `recruit` → "+N Recruit". An unseeded `rewardType`
  (cannot occur — WP-248 filters at parse) → a safe generic fallback label, never
  a crash.
- Move name: `'resolveOptionalKoReward'` added to `UiMoveName`.
- Component: `apps/arena-client/src/components/play/OptionalKoRewardPrompt.vue`.

---

## Scope (In)

### A) `packages/game-engine/src/ui/uiState.types.ts` — modified
- Add `UIPendingOptionalKoReward` (`{ playerID, rewardLabel, eligibleHand,
  eligibleDiscard }`, eligible entries reusing `UIEligibleKoHeroCard`) + the
  optional `pendingOptionalKoReward?` field on the projected UIState (mirrors
  `UIPendingKoHeroChoice` / its `pendingKoHeroChoice?` field). `// why: D-24020`.

### B) `packages/game-engine/src/ui/uiState.build.ts` — modified
- Project the front `pendingOptionalKoReward`: the derived `rewardLabel` (the single
  deterministic `rewardType` + magnitude mapping — §Locked Contract Values), plus
  `eligibleHand` + `eligibleDiscard` built directly from `G.playerZones[pid].hand` /
  `.discard` in current zone + index order (recomputed fresh, defensive copies, NO
  pre-filter / NO reorder so the client `{zone,cardId}` round-trips to the engine
  resolve). `// why: D-24020`.

### C) `packages/game-engine/src/ui/uiState.filter.ts` — modified
- Redact `pendingOptionalKoReward` (and the eligible hand/discard) for everyone
  except the chooser — keyed on `pendingOptionalKoReward.playerID` vs
  `audience.playerId`, exactly as the KO-hero redaction keys on
  `pendingKoHeroChoice.playerID` (D-24011 analog). `// why: D-24020 — hand/discard
  are private to the chooser`.

### D) `apps/arena-client/src/components/play/OptionalKoRewardPrompt.vue` — **new**
- Non-dismissible prompt: selectable list of eligible hand + discard cards (zone
  labeled, in projection order) + a **Decline** button; submits
  `resolveOptionalKoReward({zone,cardId})` or `({decline:true})`. After a submit,
  the prompt disables its controls until the projection clears (guards a
  double-submit); a stale resubmit is harmless anyway (the engine resolve no-ops
  it per WP-248 front-only validation), but the client must not fire it twice.

### E) `apps/arena-client/src/components/play/uiMoveName.types.ts` — modified
- Add `'resolveOptionalKoReward'` to `UiMoveName` (+ drift assertion if present).

### F) `apps/arena-client/src/composables/useTurnActions.ts` — modified
- Add `hasPendingOptionalKoReward` (mirror `hasPendingKoChoice`) gating End Turn /
  Pass Priority.

### G) `apps/arena-client/src/components/play/TurnActionBar.vue` — modified
- Disable End Turn / Pass Priority while a pending optional-ko-reward exists.

### H) `apps/arena-client/src/pages/PlayDesktop.vue` + `PlayMobile.vue` — modified
- Mount `OptionalKoRewardPrompt`, gated on the projected pending choice.

### I) Tests
- `ui/uiState.build.test.ts` + `ui/uiState.filter.test.ts` — **modified**:
  projection populates for the chooser (incl. the derived `rewardLabel` for each
  seeded `rewardType`, and `eligibleHand`/`eligibleDiscard` preserving zone + index
  order); redacted for non-choosers/spectators.
- `components/play/OptionalKoRewardPrompt.test.ts` — **new**: renders eligible
  cards (in projection order); KO-select submits `{zone,cardId}`; Decline submits
  `{decline:true}`; non-dismissible; a second submit attempt does not fire a second
  move (controls disabled after submit).
- Turn-action gating test — **modified**: End Turn disabled while pending.

---

## Out of Scope

- **Engine gameplay** (the move, state, reward dispatch, guards, bot) — that is
  WP-248. This packet is projection + client only.
- **The rest of the family / other rewards** — follow-ups (see WP-248).
- **Any registry, server, preplan change.**

---

## Files Expected to Change

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
- `docs/ai/DECISIONS.md` — **modified** — D-24020 Reserved → Active.
- `docs/ai/STATUS.md` — **modified**.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-249 `[x]`.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-280 → Done.

**Total: ~16 files** (12 source/test + 4 governance). Exact count + the precise
gating-test file pinned in EC-280 at pre-flight against the live WP-243 surface.
The arena-client UIState-fixture-backfill recurrence (engine UIState field adds
break `vue-tsc` — WP-166/207/227) applies: **backfill arena-client fixtures in
this same packet** so CI stays green.

---

## Vision Alignment

**Vision clauses touched:** §1 (faithful card behavior — the player gets the
choice the card grants), §2 (card data). **No conflict.** Non-Goals NG-1..7: none
crossed (a gameplay-fidelity UX, not a paid/competitive/persuasive surface).

## Funding Surface Gate

**N/A — justified.** No funding affordance, copy, or channel.

## API Catalog (§21)

**N/A — justified.** No HTTP endpoint or `apps/server/src/**` library function;
engine UIState projection + arena-client only.

---

## Acceptance Criteria

> **Binary — PASS requires ALL TRUE. Any single FALSE = STOP.**

1. `UIPendingOptionalKoReward` projected for the **chooser**: carries `playerID`
   (the redaction key) + a `rewardLabel` derived by the single deterministic
   `rewardType` + magnitude mapping (§Locked Contract Values — no ad-hoc/per-card
   strings) + `eligibleHand`/`eligibleDiscard` as `UIEligibleKoHeroCard[]` (each
   entry carrying `zone`, the instance `cardId`, and `display`) in current zone +
   index order (fresh, defensive copies, no pre-filter/reorder); the field is
   absent/empty when no choice is pending.
2. The projection is **redacted** for non-choosers and spectators (no
   hand/discard leak) — proven by a filter test.
3. `resolveOptionalKoReward` is in the `UiMoveName` union (+ drift assertion if
   one exists).
4. `OptionalKoRewardPrompt.vue` renders the eligible hand+discard cards
   (zone-labeled, in projection order) + a Decline button; selecting a card submits
   `resolveOptionalKoReward({zone,cardId})` for a card the engine resolve accepts
   (round-trip), Decline submits `{decline:true}`; the prompt is non-dismissible
   while pending and disables its controls after a submit (no double-submit).
5. End Turn + Pass Priority are disabled while a pending optional-ko-reward exists.
6. The prompt is mounted in BOTH `PlayDesktop.vue` and `PlayMobile.vue`.
7. **No engine gameplay change** — `git diff` shows engine changes ONLY in the
   three `ui/` projection files (+ their tests); no move/rule/`G`-mutation file
   touched.
8. engine `test` + arena-client `test` + arena-client `typecheck` (vue-tsc) exit 0;
   net-new projection/redaction/component/gating cases; no regress;
   `JSON.stringify(UIState)` succeeds.
9. `git diff --name-only` lists exactly the `## Files Expected to Change` set
   (final count pinned in EC-280).

---

## Verification Steps

```bash
# Baseline (record counts; AC deltas are relative)
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; record engine pass count as ENGINE_BASELINE
pnpm --filter @legendary-arena/arena-client test
# Expected: exits 0; record arena-client pass count as CLIENT_BASELINE

# After projection + client changes:
pnpm --filter @legendary-arena/game-engine build
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; pass count ≥ ENGINE_BASELINE + net-new projection (chooser
# populated; rewardLabel per seeded rewardType; eligible lists zone+index order)
# + redaction (non-chooser empty) cases; no pre-existing test regresses

pnpm --filter @legendary-arena/arena-client test
# Expected: exits 0; pass count ≥ CLIENT_BASELINE + net-new component
# (KO-select / Decline / non-dismissible / no double-submit) + gating cases

# vue-tsc gate (the WP-166/207/227 fixture-backfill recurrence)
pnpm --filter @legendary-arena/arena-client typecheck
# Expected: exits 0 (arena-client UIState fixtures backfilled for the new field)

# No-engine-gameplay gate: engine diff limited to the 3 ui/ files + their 2 tests
git diff --name-only -- packages/game-engine
# Expected: ONLY ui/uiState.types.ts, ui/uiState.build.ts, ui/uiState.filter.ts,
# ui/uiState.build.test.ts, ui/uiState.filter.test.ts — nothing else

# Move-union addition
grep -c "resolveOptionalKoReward" apps/arena-client/src/components/play/uiMoveName.types.ts
# Expected: ≥1 (+ the UiMoveName drift assertion updated if one exists)

# Chooser-only redaction is proven by a filter test, NOT a grep:
# uiState.filter.test.ts asserts a non-chooser / spectator UIState has no
# pendingOptionalKoReward and no leaked hand/discard contents.

# Scope lock + serializable
git diff --name-only
# Expected: exactly the ~16 files in §Files Expected to Change (count pinned in EC-280)
pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria (1–9) pass.
- [ ] engine + arena-client `test` + arena-client `typecheck` exit 0.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/DECISIONS.md` D-24020 Reserved → Active (byte-identical to the
      EC-280 §Verbatim Block).
- [ ] `WORK_INDEX.md` WP-249 `[x]`; `EC_INDEX.md` EC-280 → Done.
- [ ] Co-released with WP-248 (not merged as a dangling UX without the engine).
- [ ] No files outside `## Files Expected to Change` modified.

---

## Pre-Flight & Copilot Verdicts (01.0a Step 5)

Gate order (pre-flight → copilot → lint), run in this drafting session against
`origin/main`:

- **Pre-flight (01.4): READY TO EXECUTE** (2026-06-13). Class: UI projection +
  client (no engine gameplay). The WP-243 UX surface was verified live:
  `ui/uiState.{types,build,filter}.ts`, `components/play/PendingKoHeroChoicePrompt.vue`,
  `components/play/uiMoveName.types.ts`, `composables/useTurnActions.ts`,
  `components/play/TurnActionBar.vue`, `pages/PlayDesktop.vue` + `PlayMobile.vue`.
  Deps WP-243/128/061 ✅; WP-248 is co-release (must land together).
- **Copilot check (01.7): PASS** (2026-06-13). The three risks are locked with
  HARD gates in EC-280: chooser-only redaction (filter test, no hand/discard
  leak), the arena-client fixture backfill (`vue-tsc` green — the WP-166/207/227
  recurrence), and the no-engine-gameplay grep (engine diff = 3 `ui/` files +
  tests). No RISK/BLOCK.
- **Lint gate (00.3): PASS** (2026-06-13). §1 structure; §2 constraints
  (no-engine-change, chooser-only redaction, fixture backfill, non-dismissible);
  §5 ~16-file count justified; §8 boundaries (engine UIState + client only); §17
  Vision; §20 Funding N/A; §21 API N/A — satisfied or reasoned-N/A. No Final-Gate
  FAIL.
- **Hardening pass (2026-06-14):** added the `rewardLabel` single-mapping
  derivation lock, the eligible-list round-trip rule (no pre-filter/reorder), the
  at-most-one-prompt note (defers to WP-248's block-all guard), decline-as-
  first-class, and the double-submit guard. No new files (mapping lives in
  `uiState.build.ts`, the guard in the component) — count unchanged.
- **Pre-flight RE-RUN (2026-06-14, post-WP-248-merge): READY TO EXECUTE.** Per
  01.0a Step 5 the prior verdict went stale when WP-248 landed (`1fe28c15`); re-run
  against the post-merge `main`. WP-248's engine surface verified live
  (`G.pendingOptionalKoRewards`, `PendingOptionalKoReward {playerID, rewardType,
  rewardMagnitude, sourceCardId}`, `resolveOptionalKoReward`,
  `hasPendingOptionalKoReward`). The WP-243 reuse surface verified live:
  `UIPendingKoHeroChoice` + `UIEligibleKoHeroCard {zone, cardId, display}`
  (`uiState.types.ts:489/476`), the front-of-queue projection
  (`uiState.build.ts:695`), the chooser-only redaction keyed on `.playerID`
  (`uiState.filter.ts:463-488`), `PendingKoHeroChoicePrompt.vue` (submits
  `entry.cardId`), `uiMoveName.types.ts` (`UiMoveName` — a type-only union, NO
  runtime drift-count assertion: just append the name), and
  `useTurnActions.ts` (`hasPendingKoChoice` boolean param blocking
  `canEndTurn`/`canPassPriority` at ANY stage — add a parallel
  `hasPendingOptionalKoReward` param). **Two shape defects found and FIXED in this
  commit:** (1) the projection type omitted `playerID`, which the redaction filter
  keys on — added; (2) `eligibleHand`/`eligibleDiscard` were typed bare
  `UICardDisplay[]`, which carry only the display-lookup `extId`, not the zone
  instance `cardId` the engine resolve matches — retyped to reuse
  `UIEligibleKoHeroCard` (`{zone, cardId, display}`) so the client's `{zone,cardId}`
  submission round-trips, mirroring the KO-hero prompt's `entry.cardId` submit. No
  file-count change (the type + reuse live in `uiState.types.ts`, already in the
  allowlist). EC-280 §Locked Values updated in parallel (parity lock).
- **Copilot (01.7) + Lint (00.3) RE-AFFIRMED PASS (2026-06-14, post-fix):** per the
  Step 5 re-run rule, both gates re-ran after the shape fix. The fix only
  strengthens the two load-bearing copilot risks (chooser-only redaction now has a
  concrete key; round-trip now structurally guaranteed) and adds no scope, files,
  contract surface, or new risk. Lint structure unchanged — all 21 sections remain
  PASS / reasoned-N/A. No RISK/BLOCK; no Final-Gate FAIL.

---

## Lint Gate Self-Review

**Verdict: PASS** (added 2026-06-14). The original draft and the 2026-06-14
hardening pass left three structural gaps — a missing `## Verification Steps`
section (§1), a `## Non-Negotiable Constraints` block that cited
`00.6-code-style.md` only in §Context rather than in-block (§2), and a missing
`## Lint Gate Self-Review` (this section) — the same class the WP-248 preflight
caught and fixed for its twin. All three are fixed in this commit.

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Structure | PASS | Goal, Assumes, Context, Scope (In), Out of Scope, Files, Non-Negotiable Constraints, Acceptance Criteria, Verification Steps, Definition of Done all present and non-empty; Out of Scope lists explicit exclusions |
| §2 | Constraints | PASS | Engine-projection-half + client-half + packet-specific + locked contract values; "Full file contents" forbids diffs/snippets; cites `00.6-code-style.md` in the Client-half block |
| §3 | Prerequisites | PASS | WP-248 (engine, co-release) + WP-243/128/061 with the exact WP-243 surface files enumerated |
| §4 | Context | PASS | ARCHITECTURE §Layer Boundary, the WP-243 files to mirror, `uiState.filter.ts` D-24011, code-style |
| §5 | Output Completeness | PASS | ~16 files (12 source/test + 4 governance), each listed; count pinned in EC-280 at pre-flight |
| §6 | Naming | PASS | `UIPendingOptionalKoReward`, `resolveOptionalKoReward`, `hasPendingOptionalKoReward`, `rewardLabel`, `OptionalKoRewardPrompt` consistent |
| §7 | Dependencies | PASS | No new npm deps; reuses the WP-243 UX shapes + the existing card-display sub-type |
| §8 | Architectural Boundaries | PASS | Engine UIState projection (runtime-safe surface) + arena-client only; NO engine gameplay change; client submits intent; redaction in the engine filter; no registry runtime import; no `boardgame.io` in components |
| §9 | Windows | N/A | No shell-specific paths |
| §10 | Env Vars | N/A | None touched |
| §11 | Auth | N/A | Privacy redaction is a projection concern, not an auth surface |
| §12 | Test Quality | PASS | `node:test` for the engine projection; arena-client harness (vue-sfc-loader) for the component; projection / redaction / component / gating cases; vue-tsc gate |
| §13 | Verification | PASS | Exact `pnpm` / `grep` commands; the no-engine-gameplay diff gate + the vue-tsc gate; redaction proven by a filter test |
| §14 | Acceptance Criteria | PASS | 9 binary, observable items |
| §15 | Definition of Done | PASS | engine + arena-client `test` + `typecheck`; STATUS / DECISIONS / WORK_INDEX / EC_INDEX; co-release lock; scope-boundary check |
| §16 | Code Style | PASS | `// why:` on type / projection / filter / component / gating; named imports; cites `00.6-code-style.md` |
| §17 | Vision Alignment | PASS (block present) | §1/§2 cited; gameplay-fidelity UX; NG-1..7 none crossed |
| §18 | Prose-vs-Grep | PASS | The move-union grep targets a source file (`uiMoveName.types.ts`); redaction is proven by a filter test, not a markdown grep |
| §19 | Bridge-vs-HEAD | N/A | Not a repo-state-summarizing artifact |
| §20 | Funding Surface | N/A | Gameplay-fidelity UX; no funding copy or paid surface (§Funding Surface Gate) |
| §21 | API Catalog | N/A | UIState projection + arena-client only; no `apps/server` HTTP endpoint or `Library-only` function (§API Catalog) |
