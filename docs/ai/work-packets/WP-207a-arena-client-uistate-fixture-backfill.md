# WP-207a — Arena Client `UIState.notableEvents` Fixture Backfill (JSON Fixtures)

**Status:** Ready
**Primary Layer:** Client (`apps/arena-client/src/fixtures/uiState/`)
**Dependencies:** WP-200, WP-201 (both landed; WP-200 added the engine-owned `UIState.notableEvents` required field, WP-201 wired the arena-client consumer — the committed JSON fixtures were never backfilled)

---

## Session Context

WP-200 added `notableEvents: NotableGameEvent[]` as a **required** field on the
engine-owned `UIState` type (`packages/game-engine/src/ui/uiState.types.ts`),
and WP-201 wired the arena-client consumer (`useNotableEventStream.ts`). The
three committed JSON fixtures under `apps/arena-client/src/fixtures/uiState/`
(`mid-turn.json`, `endgame-win.json`, `endgame-loss.json`) still carry the
pre-`notableEvents` shape. The typed-fixture layer (`typed.ts`) binds each JSON
to `UIState` via `satisfies`, so the missing field surfaces as a `vue-tsc`
error at each `satisfies` site — and propagates through `index.ts`, which
returns those typed consts. The result is a typecheck that has been red on
every `main` commit since the WP-201 merge (#193).

The fix is **in the JSON fixtures, not the `.ts` modules**: `index.ts` and
`typed.ts` are correct as written (their errors are downstream of the JSON).
This WP backfills the three JSON fixtures only; the test files that construct
inline `UIState` objects are scoped to the paired WP-207b.

---

## Goal

After this session, `mid-turn.json`, `endgame-win.json`, and `endgame-loss.json`
each carry a top-level `"notableEvents": []` member, so that
`<json> satisfies UIState` in `typed.ts` and the corresponding `return` sites in
`index.ts` type-check clean. `vue-tsc --noEmit` no longer reports the 6 errors at
`fixtures/uiState/index.ts:54,56,58` and `fixtures/uiState/typed.ts:18,19,20`.
The `.ts` fixture modules are not modified — the only change is the added JSON
member, defaulted to an empty array (the fixtures capture no notable events).

---

## Assumes

- WP-200 complete. Specifically:
  - `packages/game-engine/src/ui/uiState.types.ts` exports `UIState` with `notableEvents: NotableGameEvent[]` as a **required** field (verified: `uiState.types.ts:62`).
  - `NotableGameEvent` is engine-owned (`packages/game-engine/src/events/notableEvents.types.ts`) and re-exported from `@legendary-arena/game-engine`.
- WP-201 complete. Specifically:
  - `apps/arena-client/src/composables/useNotableEventStream.ts` consumes `UIState.notableEvents`.
  - `apps/arena-client/src/fixtures/uiState/typed.ts` imports the `UIState` type from `@legendary-arena/game-engine` and gates each JSON via `satisfies`.
- `pnpm --filter @legendary-arena/arena-client typecheck` currently exits 2 (FAILING) with the 6 fixture errors at the cited lines — verified during pre-flight. This WP moves the fixture errors to 0; full green requires the paired WP-207b (test files) + WP-208 (registry-viewer) to also land.
- `docs/ai/DECISIONS.md` and `docs/ai/ARCHITECTURE.md` exist.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms arena-client lives on the client side of the engine boundary; this packet touches client-only JSON fixtures and may not reach into engine package code. The `UIState` contract is engine-owned and read-only here.
- `apps/arena-client/src/fixtures/uiState/typed.ts` — read entirely. Each `export const X = Xjson satisfies UIState;` is the compile-time gate that fails today. **Do not modify this file** — it is correct; the JSON it imports is stale.
- `apps/arena-client/src/fixtures/uiState/index.ts` — read entirely. `loadUiStateFixture` dispatches by name and `return`s the typed consts from `typed.ts`. Its errors at lines 54/56/58 are propagated from the typed consts. **Do not modify this file.**
- `apps/arena-client/src/fixtures/uiState/mid-turn.json`, `endgame-win.json`, `endgame-loss.json` — the three files this WP edits. Read each to confirm it is a top-level JSON object with no existing `notableEvents` member.
- `packages/game-engine/src/ui/uiState.types.ts` — confirm `notableEvents: NotableGameEvent[]` is required (line 62) and that `[]` satisfies it.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 14 (field names match the data contract). The added member uses the canonical engine name `notableEvents`; no abbreviation or paraphrase.

---

## Scope (In)

- Add a top-level `"notableEvents": []` member to `apps/arena-client/src/fixtures/uiState/mid-turn.json`
- Add a top-level `"notableEvents": []` member to `apps/arena-client/src/fixtures/uiState/endgame-win.json`
- Add a top-level `"notableEvents": []` member to `apps/arena-client/src/fixtures/uiState/endgame-loss.json`
- Verify `pnpm --filter @legendary-arena/arena-client typecheck` no longer reports the 6 fixture errors at `index.ts:54,56,58` and `typed.ts:18,19,20` (other errors from WP-207b + WP-208 scope may remain)

## Out of Scope

- Modifying `index.ts` or `typed.ts` — both are correct; their errors are downstream of the JSON. Editing them would mask the real fix.
- Modifying any inline-`UIState` test file (WP-207b scope). The current typecheck flags `useNotableEventStream.test.ts`, `PlayMobile.test.ts`, `mutationDetector.test.ts`, `mutationMiddleware.test.ts`, and `autoplayPlayback.test.ts`; WP-207b holds the authoritative list.
- Modifying any file under `apps/registry-viewer/src/` (WP-208 scope — `Category` literal union extension in `devLog.ts`)
- Modifying the engine-owned `UIState` type definition (`packages/game-engine/src/ui/uiState.types.ts`) — the contract is correct; only the fixtures are stale
- Changing any existing member of the three JSON fixtures, or adding any member other than `notableEvents`
- Touching any engine, registry, server, or shared-tooling package code

---

## Files Expected to Change

- `apps/arena-client/src/fixtures/uiState/mid-turn.json` — modified (add top-level `"notableEvents": []`)
- `apps/arena-client/src/fixtures/uiState/endgame-win.json` — modified (add top-level `"notableEvents": []`)
- `apps/arena-client/src/fixtures/uiState/endgame-loss.json` — modified (add top-level `"notableEvents": []`)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (status update Ready → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (status update Ready → Done)

6 files total (3 source + 3 governance). No DECISIONS.md entry — this WP makes no new decisions; it is a mechanical backfill of an existing engine-owned contract.

---

## Contract

This WP conforms three JSON fixtures to an **existing, already-locked** contract; it introduces no new contract of its own.

- **Locked surface:** `UIState.notableEvents: NotableGameEvent[]` — a required, engine-owned field (`packages/game-engine/src/ui/uiState.types.ts:62`), introduced by WP-200 and consumed by WP-201. This WP does not define, widen, or narrow that field; it only backfills the literal default in the three stale JSON fixtures.
- **Value this WP locks for the fixtures:** the empty JSON array `[]` for the `notableEvents` member in each of the 3 files. The per-value lock (member name, default value, position) is enumerated under `## Non-Negotiable Constraints → Locked contract values`; that block is the authoritative per-value record and this section does not restate it.
- **Out of this contract:** the engine `UIState` type (read-only), the `NotableGameEvent` shape (engine-owned, WP-200), the `.ts` fixture modules (`index.ts` / `typed.ts`, correct as written), and the inline-`UIState` test-file sites (owned by WP-207b).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (N/A — this WP touches no randomness)
- Never throw inside boardgame.io move functions — N/A (no move functions touched)
- Never persist `G`, `ctx`, or any runtime state — N/A (no persistence touched)
- `G` must be JSON-serializable at all times — N/A (no `G` touched)
- ESM only, Node v22+ — N/A (this WP edits JSON data files, no module code)
- `node:` prefix on all Node.js built-in imports — N/A (no imports added)
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — the added member uses the canonical field name `notableEvents`
- Full file contents required for every modified file in the session output — no diffs, no snippets, no "show only the changed section"

**Packet-specific:**
- Edit JSON only — the three fixture data files. Do **not** modify `index.ts` or `typed.ts` (both correct; their errors are downstream of the JSON).
- Read-only on the engine `UIState` type definition — the contract is correct; do not modify it
- Read-only on all inline-`UIState` test files in scope of WP-207b — listed in `## Out of Scope`
- The `notableEvents` member uses the literal empty-array default `[]`; do not invoke any factory or populate sample events
- The member name is exactly `notableEvents` per WP-200 — no abbreviation, no paraphrase, no rename
- Change exactly one thing per JSON file: add the `"notableEvents"` member. Do not reorder, reformat, or alter any existing member. Each file must remain valid JSON (the member preceding `notableEvents` gains a trailing comma — verify the file still parses).
- No `// why:` comment is required (JSON has no comments); the WP-200 contract makes the empty default self-explanatory

**Session protocol:**
- See `## Hard Stop Conditions (Authoritative)` below — that block is the single source of truth for every STOP trigger in this packet.

**Locked contract values:**
- Member name: `notableEvents` (per WP-200; not `notable_events`, `events`, `gameEvents`)
- Default value: `[]` (literal empty JSON array; not `null`, a sample event list, or omission)
- Member position: appended as the last top-level member of each JSON object (JSON key order is insignificant; locked for diff consistency)

---

## Hard Stop Conditions (Authoritative)

This is the single authoritative list of STOP triggers for this packet. Every
other section that mentions stopping points here — do not restate triggers
elsewhere. If **any** of the following is observed, STOP immediately and report;
do not proceed:

- The engine `UIState` type reveals `notableEvents` is **not** a required field (a different fix already landed, or the contract differs from WP-200) — this WP is then unnecessary.
- The 6 typecheck errors are **not** at the reported locations — `index.ts` lines 54, 56, 58 and `typed.ts` lines 18, 19, 20.
- Any of the 3 JSON fixtures already carries a `notableEvents` member (the fix is partially applied — investigate before continuing).
- After adding `"notableEvents": []` to all three files, the typecheck surfaces a **different** missing required member on the same `satisfies`/return sites (WP-200/201 added a field beyond `notableEvents` that the fixtures also lack) — STOP and report; the scope is wider than this WP assumes.

Each trigger is a signal of drift between the CI report and actual code, or
between this packet and a fix that already landed. Stopping and reporting is
correct; guessing past a mismatch is not.

---

## Acceptance Criteria

Each criterion below is text-match or command-verifiable; none requires judgment.

1. `apps/arena-client/src/fixtures/uiState/mid-turn.json` contains exactly one `"notableEvents"` member, with value `[]`
2. `apps/arena-client/src/fixtures/uiState/endgame-win.json` contains exactly one `"notableEvents"` member, with value `[]`
3. `apps/arena-client/src/fixtures/uiState/endgame-loss.json` contains exactly one `"notableEvents"` member, with value `[]`
4. `pnpm --filter @legendary-arena/arena-client typecheck` no longer reports the 6 fixture errors at `index.ts:54,56,58` and `typed.ts:18,19,20` (other errors from WP-207b + WP-208 scope may remain unaddressed)
5. `index.ts` and `typed.ts` are byte-identical to their pre-session state (the fix is JSON-only; the `.ts` modules are not touched)
6. Each of the three JSON files still parses as valid JSON (no trailing-comma or bracket errors introduced)
7. No file outside `## Files Expected to Change` is modified — verified by `git status --porcelain` listing only the 3 JSON files + 3 governance files
8. `git diff apps/arena-client/src/fixtures/uiState/` shows additions only (one added `"notableEvents": []` member per JSON, plus the trailing comma on the preceding line; no other member reordered, reformatted, or removed)

---

## Verification Steps

Run each command in order. Each command must produce the expected output before proceeding.

```bash
# 1. Confirm exactly one notableEvents member per JSON fixture
for f in mid-turn endgame-win endgame-loss; do
  echo -n "$f.json: "; grep -c '"notableEvents"' apps/arena-client/src/fixtures/uiState/$f.json
done
# Expected: 1 for each file

# 2. Confirm each fixture still parses as valid JSON (and the member is an empty array)
for f in mid-turn endgame-win endgame-loss; do
  node -e "const o=require('./apps/arena-client/src/fixtures/uiState/$f.json'); if(!Array.isArray(o.notableEvents)||o.notableEvents.length!==0){process.exit(1)}"
  echo "$f.json: valid, notableEvents === []"
done
# Expected: each prints "valid, notableEvents === []" (non-zero exit = invalid JSON or wrong value)

# 3. Confirm the 6 fixture typecheck errors are gone
pnpm --filter @legendary-arena/arena-client typecheck 2>&1 | grep -E "fixtures/uiState/(index|typed)\.ts" | wc -l
# Expected: 0

# 4. Confirm the .ts fixture modules were not touched
git diff --name-only apps/arena-client/src/fixtures/uiState/index.ts apps/arena-client/src/fixtures/uiState/typed.ts | wc -l
# Expected: 0

# 5. Confirm working tree matches the expected file list.
#    `--porcelain` is the stable machine-readable form and reports staged,
#    unstaged, AND untracked changes — so an accidentally-staged out-of-scope
#    file cannot hide (a plain `git diff` would miss it).
git status --porcelain | wc -l
# Expected: 6 (3 source + 3 governance)

# 6. Confirm no unintended files modified (authoritative drift gate —
#    compare against the exact expected path set, not just a count).
git status --porcelain | awk '{print $2}' | sort
# Expected (exactly these 6 paths):
# apps/arena-client/src/fixtures/uiState/endgame-loss.json
# apps/arena-client/src/fixtures/uiState/endgame-win.json
# apps/arena-client/src/fixtures/uiState/mid-turn.json
# docs/ai/STATUS.md
# docs/ai/execution-checklists/EC_INDEX.md
# docs/ai/work-packets/WORK_INDEX.md
```

---

## Edit Pattern (Illustrative)

The only edit per file is appending one JSON member. Existing members are
neither reordered nor reformatted; the previous last member gains a trailing
comma:

```jsonc
// Before (tail of the object)
  "koPile": { "...": "..." }
}

// After
  "koPile": { "...": "..." },
  "notableEvents": []
}
```

(The preceding member shown is illustrative — match whatever each real fixture's
final member is; the only addition is the `"notableEvents": []` member and the
comma that keeps the JSON valid.)

---

## Definition of Done

- [ ] All 8 Acceptance Criteria pass
- [ ] No `## Hard Stop Conditions (Authoritative)` trigger was hit
- [ ] All 6 Verification Steps produce the expected output
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-207a + the 3 JSON backfills)
- [ ] `docs/ai/DECISIONS.md` NOT updated (this WP makes no new decisions; mechanical backfill of an existing contract)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped Ready → Done
- [ ] No files outside `## Files Expected to Change` were modified — verified by `git status --porcelain`
- [ ] Commit message uses `EC-238:` prefix per the commit hygiene gate (this is fixture data under `apps/` so SPEC: / INFRA: do not apply)

---

## Vision Alignment

**N/A.** This WP backfills the `notableEvents` member on three dev/test JSON fixtures. It touches no §17.1 trigger surface: no scoring, no replays, no player identity, no multiplayer sync, no determinism guarantees, no card data, no monetization, no live ops, no accessibility, no Registry Viewer public surface. The fixtures are dev-only consumers of an existing UI projection type; the field they backfill was already approved as part of WP-200 + WP-201 vision review.

---

## Funding Surface Gate

**N/A.** This WP touches no §20.1 trigger surface — no global navigation, no Registry Viewer funding affordances, no profile/account funding attribution, no tournament-funding-channel integration, no user-visible funding copy. The change is internal test-fixture maintenance with no UI surface.

---

## API Catalog Update

**N/A.** This WP touches no HTTP endpoint, no `apps/server/src/**` library function, no route registration, no catalog row. The change is client-side fixture data maintenance only.

---

## Lint Gate Self-Review

Run against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` (all 21 sections). Verdict: **PASS** — every applicable section satisfied; N/A sections justified below rather than silently omitted. Every claim below was verified against the actual source during pre-flight (engine `UIState` type, the two `.ts` fixture modules, the three JSON files, and a live `typecheck` run) — not against WP text alone.

- **§1 Structure** — PASS. All 10 required sections present and non-empty; `## Out of Scope` excludes more than two related surfaces (the `.ts` fixture modules, WP-207b test files, WP-208 registry-viewer, the engine `UIState` type).
- **§2 Non-Negotiable Constraints** — PASS. Engine-wide block requires full file contents and forbids diffs/snippets; Packet-specific, Session protocol (points to `## Hard Stop Conditions`), and Locked contract values subsections all present.
- **§3 Assumes** — PASS. Lists WP-200 + WP-201 with the **verified** engine paths (`uiState.types.ts:62`, `notableEvents.types.ts`) and the external state (typecheck exits 2 at the cited lines).
- **§4 Context (Read First)** — PASS. Specific files + sections cited, including the corrected engine-owned type path. 00.2 sub-check N/A — `notableEvents` is a WP-200 engine UI-projection field, not 00.2 card data or match-setup payload.
- **§5 Files Expected to Change** — PASS. All 6 files marked `modified` with one-line descriptions; bounded (< 8); the source set is the 3 JSON files (verified as the actual fix locus), not the `.ts` modules.
- **§6 Naming Consistency** — PASS. `notableEvents` matches the WP-200 canonical engine name; no 00.2 setup-payload fields touched.
- **§7 Dependency Discipline** — PASS. No new npm dependencies.
- **§8 Architectural Boundaries** — PASS. Client-only fixture-data edit; no engine/server/registry/DB reach; engine `UIState` contract treated as read-only.
- **§9 Windows Compatibility** — PASS (with note). Verification one-liners use POSIX `grep`/`wc`/`git`/`node`, run via the project's Bash tool per `.claude/CLAUDE.md` ("Bash is also available via the Bash tool for POSIX scripts"); no Unix-only filesystem paths.
- **§10 Environment Variable Hygiene** — N/A. No environment variables touched.
- **§11 Authentication Clarity** — N/A. No authentication surface.
- **§12 Test Quality** — N/A. Produces no tests; the inline-`UIState` test files are WP-207b scope.
- **§13 Commands and Verification** — PASS. `pnpm` used (never `npm run`); commands exact with expected output inline; the JSON-validity check uses `node` parse.
- **§14 Acceptance Criteria Quality** — PASS. 8 items, all binary, observable, and specific to named files / members; criterion 4 is self-guarding against a hidden second missing field (paired with the fourth Hard Stop trigger).
- **§15 Definition of Done** — PASS. Includes STATUS.md, the explicit DECISIONS.md no-update, WORK_INDEX.md, and the scope-boundary check.
- **§16 Code Style** — PASS. The only output is a `"notableEvents": []` JSON member — no abstraction, control flow, names, functions, imports, or error messages to flag.
- **§17 Vision Alignment** — PASS. `## Vision Alignment` present and marked N/A against the §17.1 trigger list with reasons.
- **§18 Prose-vs-Grep** — N/A. The verification greps target `"notableEvents"`, not a forbidden token (e.g. `Math.random`); no adjacent forbidden-token prose.
- **§19 Bridge-vs-HEAD** — N/A at lint time (commit-time discipline per the §19 note); applies when the executor authors the STATUS.md Done entry.
- **§20 Funding Surface Gate** — PASS. `## Funding Surface Gate` present, N/A with justification.
- **§21 API Catalog Update** — PASS. `## API Catalog Update` present, N/A with justification.
