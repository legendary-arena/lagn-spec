# WP-192 — Hanko JWKS Refresh Interval Parsing Guard (Server)

## Goal

Harden `apps/server/src/server.mjs`'s `tryConstructHankoVerifier()` so that
a malformed `HANKO_JWKS_REFRESH_INTERVAL_MS` env value (typo, empty
string, non-numeric suffix, `Infinity`, etc.) falls back cleanly to the
WP-131 / D-12603 default (300 000 ms) instead of propagating as `NaN`
into `setInterval(..., NaN)` — which the WHATWG timers spec coerces to
1 ms, hammering Hanko's JWKS endpoint several hundred times per second.
Replaces the existing single-step `Number(refreshIntervalRaw)` parse
with a two-step parse + `Number.isFinite()` guard that collapses every
malformed shape to `undefined` so the verifier factory's default-
substitution branch fires.

> **Out-of-WP origin (transparency).** This guard was first drafted
> during WP-176's execution session (2026-05-24) when a production
> deploy log surfaced `refresh=NaNms` after the env var was set to a
> non-numeric value. The fix was out of WP-176's scope (admin-billing
> auth cutover) and was parked as a stash with the note "ride along
> with next server.mjs touch that has an EC prefix." Seven days later
> no server.mjs WP has absorbed it; minting WP-192 lands the fix
> under proper EC governance rather than leaving the silent prod risk
> parked indefinitely. Single-file, single-seam scope.

---

## Assumes

- **WP-131 ✅ (hard-dep — the Hanko verifier startup guard).** Landed
  2026-05-04. `tryConstructHankoVerifier()` exists at
  `apps/server/src/server.mjs` with the dev/prod env-completeness gate
  + D-12603 default-substitution semantics (factory checks
  `jwksRefreshIntervalMs === undefined` to apply the 300 000 ms
  default; a real `Number`, including `NaN`, bypasses that branch).
- **WP-126 ✅ (Hanko session verifier factory).** Landed before WP-131;
  `createHankoSessionVerifier({ jwksRefreshIntervalMs })` consumes the
  parsed value as-is. Out of scope for this WP — factory behavior is
  unchanged; the guard sits upstream at the env-parse boundary.
- **`pnpm --filter @legendary-arena/server test` exits 0 on baseline.**
  Verified on `main @ a991d87` (server tests 400 pass / 0 fail / 66
  skipped — the skipped are db-dependent and unrelated).
- **Drafting baseline:** `origin/main @ a991d87` (2026-05-31).

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Server Layer` — the server layer's role is
  wiring + startup; the verifier construction site is per WP-131's
  `pool = createPool()` invariant (single construction per call).
- `.claude/rules/architecture.md §Server Layer (Wiring Only)` — server
  may handle process lifecycle and env reads; this WP stays inside
  that envelope (no engine, no registry, no game logic).
- `.claude/rules/code-style.md` — `// why:` comments mandatory on
  non-obvious env-parsing decisions; full-sentence error context; no
  abbreviations.
- `apps/server/src/server.mjs` — `tryConstructHankoVerifier()` is the
  ONLY file changed. The current parse is at lines 224-234 (verified
  on `main @ a991d87`; if `main` moves before execution, re-verify
  with `grep -n "refreshIntervalRaw\|jwksRefreshIntervalMs" apps/server/src/server.mjs`).
- `apps/server/src/server.mjs.test.ts` — the existing
  `startup guard (WP-131)` describe block (lines 100-174) covers the
  prod-fatal + dev fail-closed paths but does NOT exercise the
  `envComplete=true` malformed-refresh-interval path. Test addition is
  out of scope for this WP (the existing tests would require a refactor
  to stub `createHankoSessionVerifier` or extract the parse into a pure
  helper — both expand scope beyond the surgical guard). The // why:
  comment + production log evidence carry the contract; a follow-up
  WP can extract a pure helper + unit tests if the gap matters.
- `docs/ai/DECISIONS.md §D-12603` — the default-substitution semantics
  this WP defends.
- WP-131 / EC-131 — the WP that established the construction site this
  WP hardens.

---

## Why now

The parked stash is 7 days old (created 2026-05-24 during WP-176's
execution session). No server.mjs WP has absorbed it in that window,
and the ride-along convention assumes a near-term touch. Production
already surfaced the failure mode once (the `refresh=NaNms` log line
that motivated the original fix); a second occurrence would mean
hundreds of requests per second to Hanko's JWKS endpoint between
deploy and rollback. Landing the guard now under WP-192 / EC-219
converts a parked-and-silent-risk into a shipped-and-traced fix.

---

## Scope (In)

- **Replace the env-parse logic** in `tryConstructHankoVerifier()`:
  - Current: single-step `Number(refreshIntervalRaw)` (line 231-234)
    which returns `NaN` for any non-numeric input.
  - New: two-step parse — first compute `parsedRefreshInterval`
    (`undefined` if the env var is unset, else `Number(...)`), then
    derive `jwksRefreshIntervalMs` via `Number.isFinite(...)` —
    `parsedRefreshInterval` when finite, `undefined` otherwise.
  - Behavior preservation: a valid numeric env value (e.g.,
    `"60000"`) produces the same `jwksRefreshIntervalMs = 60000` as
    today; an unset env var produces the same `undefined` as today;
    only malformed shapes (typo, empty string, `"123abc"`,
    `"Infinity"`, `"-Infinity"`, `"NaN"`) now collapse to
    `undefined` instead of `NaN`.
- **Rewrite the `// why:` comment** above the parse block to cite the
  D-12603 default-substitution mechanism, the WHATWG `setInterval(...,
  NaN)` → 1 ms coercion, the 2026-05-24 production log evidence, and
  the explicit list of malformed shapes the guard collapses.
- **Governance:** `STATUS.md` `### WP-192 Executed` block;
  `DECISIONS.md` D-19201..D-19202; `WORK_INDEX.md` flip to `[x]`;
  `EC_INDEX.md` EC-219 → Done.

---

## Out of Scope

- **Adding test coverage for the malformed-env path.** Would require
  either stubbing `createHankoSessionVerifier` (invasive module-level
  mocking) or extracting the parse into a pure helper (a code-shape
  refactor). Both expand scope beyond the surgical guard the parked
  stash represents. The `// why:` comment + the production log
  evidence carry the contract. If the gap matters, a follow-up WP
  can extract a pure helper + unit tests.
- **Changing `createHankoSessionVerifier`'s behavior** for `NaN`
  inputs. The factory is byte-identical pre/post — the guard sits
  upstream at the env-parse boundary so the factory never receives a
  `NaN`.
- **Modifying the `envComplete` gate, the dev/prod-mode diagnostic
  paths, the masked-URL log format, or any other part of
  `tryConstructHankoVerifier()`.** Surgical: only the parse block.
- **Touching any file other than `apps/server/src/server.mjs`** (and
  the four governance files). No client, no engine, no registry, no
  migration, no schema.
- **Adding a new env var, deprecating an existing one, or changing
  the `HANKO_JWKS_REFRESH_INTERVAL_MS` name/semantics.**

---

## Files Expected to Change

1. `apps/server/src/server.mjs` — **modified** — replace the
   single-step `Number(...)` parse in `tryConstructHankoVerifier()`
   with the two-step parse + `Number.isFinite` guard; rewrite the
   block's `// why:` comment to cite D-12603, the WHATWG 1 ms
   coercion, the 2026-05-24 production log, and the closed list of
   malformed shapes collapsed.
2. `docs/ai/STATUS.md` — **modified** — `### WP-192 / EC-219 Executed`
   block.
3. `docs/ai/DECISIONS.md` — **modified** — D-19201..D-19202.
4. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-192 row to
   `[x]`.
5. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-219
   row to Done.

No other files may be modified. No new test file added (see §Out of
Scope).

---

## Non-Negotiable Constraints

**Engine-wide / cross-cutting (always apply):**

- ESM only, Node v22+. `server.mjs` is the file; no new files added.
- No `Math.random()`, no clock reads, no network — pure synchronous
  env-parse logic.
- Human-style code per `00.6-code-style.md` — full English names
  (`parsedRefreshInterval`, `jwksRefreshIntervalMs`), `// why:` on the
  non-obvious decision (the `Number.isFinite` guard's rationale).

**Packet-specific:**

- **Single-file surgery.** Touch only the parse block at
  approximately lines 224-234 of `apps/server/src/server.mjs`. Do
  NOT modify `envComplete`, the diagnostic paths, the masked-URL
  logging, the `refreshLogged` ternary on line 256, or any other
  part of the function.
- **Behavior preservation invariant.** For any valid numeric env
  value (the existing happy path), the post-WP-192 code MUST produce
  byte-identical output: same `jwksRefreshIntervalMs`, same log
  line, same verifier construction call. The only observable
  difference is malformed env values now log
  `refresh=defaultms` instead of `refresh=NaNms`.
- **Closed-set malformed-shape collapse.** The `Number.isFinite`
  guard MUST collapse every member of the closed set
  `{ undefined, '', 'typo', '123abc', 'Infinity', '-Infinity',
  'NaN' }` to `jwksRefreshIntervalMs = undefined`. Verified by
  reading the `// why:` comment and tracing the two-step parse.
- **No factory mutation.** `createHankoSessionVerifier` is called
  with the same three-key options object shape as today; the guard
  sits strictly upstream of the factory call.
- **No env-var rename / removal.** `HANKO_JWKS_REFRESH_INTERVAL_MS`
  is the contract surface; this WP defends it, does not change it.

**Required `// why:` comment** (single location, rewritten in
full):

- Above the new two-step parse block in
  `tryConstructHankoVerifier()` — cite the D-12603 default-
  substitution mechanism, the WHATWG `setInterval(..., NaN)` →
  1 ms coercion failure mode, the 2026-05-24 production deploy log
  evidence (`refresh=NaNms` line), and the closed list of malformed
  shapes the guard collapses to `undefined`.

**Session protocol:**

- If the WP-131 contract has drifted on baseline (line numbers
  shifted, `tryConstructHankoVerifier` renamed, the factory's
  default-substitution semantics changed), **STOP and report**.
  Re-verify with `grep -n "tryConstructHankoVerifier\|refreshIntervalRaw\|jwksRefreshIntervalMs" apps/server/src/server.mjs`
  before editing.
- The local commit-msg hook (Rule 5) requires `EC-###:` prefix for
  `apps/` changes; the execution session's Commit A MUST use
  `EC-219:` (NOT `INFRA:` — Rule 5 will reject).

**01.5 runtime-wiring allowance:** ZERO. The guard is fully
contained in the existing function; no new wiring needed.

---

## Acceptance Criteria

- [ ] `apps/server/src/server.mjs` `tryConstructHankoVerifier()`
  parses `HANKO_JWKS_REFRESH_INTERVAL_MS` in two steps:
  `parsedRefreshInterval = refreshIntervalRaw === undefined ? undefined : Number(refreshIntervalRaw)`
  followed by
  `jwksRefreshIntervalMs = Number.isFinite(parsedRefreshInterval) ? parsedRefreshInterval : undefined`.
- [ ] The block's `// why:` comment cites D-12603, the WHATWG
  `setInterval(..., NaN)` → 1 ms coercion, the 2026-05-24
  production log evidence, and the closed list of malformed shapes
  the guard collapses.
- [ ] `envComplete`, the dev/prod diagnostic paths, the masked-URL
  logging, the `refreshLogged` ternary, the `createHankoSessionVerifier`
  call shape, and the rest of `tryConstructHankoVerifier()` are byte-
  identical pre/post (confirmed by inspecting the diff).
- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 (server
  tests pass at the existing 400/0/66 baseline; no new tests added,
  no existing tests modified).
- [ ] `pnpm -r build` exits 0.
- [ ] `git diff --stat` shows exactly one source file modified
  (`apps/server/src/server.mjs`) plus the four governance files.
- [ ] No other file under `apps/` or `packages/` is modified
  (confirmed by `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — confirm baseline parse site exists where expected
grep -n "refreshIntervalRaw\|jwksRefreshIntervalMs\|Number.isFinite" apps/server/src/server.mjs
# Expected (post-WP-192): both refreshIntervalRaw references, the parsedRefreshInterval
# binding, the jwksRefreshIntervalMs binding via Number.isFinite, and the
# refreshLogged ternary on the log line — all present.

# Step 2 — confirm no other apps/ or packages/ files changed
git diff --name-only -- apps/ packages/
# Expected: apps/server/src/server.mjs only.

# Step 3 — server build + tests
pnpm --filter @legendary-arena/server build
pnpm --filter @legendary-arena/server test
# Expected: build exits 0; tests pass at the 400/0/66 baseline (no new tests).

# Step 4 — full monorepo build
pnpm -r build
# Expected: exits 0.

# Step 5 — confirm the guard's // why: comment carries the required citations
grep -n "D-12603\|WHATWG\|2026-05-24\|Number.isFinite" apps/server/src/server.mjs
# Expected: all four anchors present in the rewritten // why: block.
```

---

## Definition of Done

- [ ] All Acceptance Criteria pass.
- [ ] `docs/ai/STATUS.md` has a `### WP-192 / EC-219 Executed` block
  (parse-site change; behavior preservation; closed-set malformed
  shapes collapsed; no test addition + rationale; baseline tests
  unchanged; build green).
- [ ] `docs/ai/DECISIONS.md` has D-19201..D-19202 landed:
  - D-19201: `HANKO_JWKS_REFRESH_INTERVAL_MS` parsing uses a two-step
    parse + `Number.isFinite` guard at the env-read boundary;
    malformed shapes collapse to `undefined` so the factory's D-12603
    default-substitution branch fires. Defends D-12603 from the
    `Number(...)` → `NaN` → `setInterval(..., NaN)` → WHATWG 1 ms
    coercion failure mode.
  - D-19202: Test coverage for the malformed-env path is deferred to
    a future WP that either (a) extracts the parse into a pure helper
    (`parseRefreshIntervalMs(rawValue): number | undefined`) and unit-
    tests it directly, or (b) refactors `tryConstructHankoVerifier`'s
    construction site to accept an injectable factory for end-to-end
    testing. WP-192 stays surgical (single-file, single-block) per
    the parked-stash convention.
- [ ] `WORK_INDEX.md`: WP-192 row `[x]` with date.
- [ ] `EC_INDEX.md`: EC-219 row Done.
- [ ] No files outside the §Files Expected to Change list were
  modified.

---

## Vision Alignment

**Vision clauses touched:** §22 (Replay determinism — startup
configuration honors operator intent verbatim; malformed config does
not silently mutate runtime behavior into a denial-of-service shape),
§24 (Operator trust — production logs surface meaningful values, not
`NaN`).

**Conflict assertion:** No conflict. WP-192 strengthens existing
contracts (D-12603 default-substitution; D-13104 origin-only masking
is untouched). The guard is defensive — it never weakens behavior for
valid inputs.

**Non-Goal proximity check:** None of NG-1..NG-7 crossed. No
monetization, identity, or competitive surface; server-startup
hardening only.

**Determinism preservation:** The parse is fully synchronous and
deterministic — same env input produces same parsed output every call.
No `Math.random`, no clock, no network. The guard makes the
construction site MORE deterministic (eliminates the `NaN`-shaped
hidden state that previously triggered WHATWG 1 ms coercion).

---

## Funding Surface Gate

N/A — server-startup auth hardening; no §20.1 trigger surfaces (no
navigation funding affordance, no registry-viewer surface, no profile
attribution, no user-visible donate copy).

---

## API Catalog Update

N/A — no HTTP endpoints or `apps/server/src/**` library functions
added/modified/removed. The change is internal to
`tryConstructHankoVerifier()`'s parse block; the function's signature,
return type, call sites, and external contract are byte-identical.

---

## Lint Gate Self-Review

| # | Item | Verdict |
|---|---|---|
| 1 | Goal is one paragraph, user-visible outcome | ✅ (production deploy no longer surfaces `refresh=NaNms` + 1ms JWKS hammering on malformed env) |
| 2 | Assumes lists prerequisites with status | ✅ (WP-131 ✅ hard-dep; WP-126 ✅ context; baseline test count verified on main @ a991d87) |
| 3 | Context (Read First) specific (paths + line numbers + precedents) | ✅ (server.mjs lines 224-234; ARCHITECTURE §Server Layer; .claude/rules; D-12603 reference) |
| 4 | Scope (In) / Out of Scope present and closed | ✅ (test-addition explicitly scoped out with rationale; single-file surgery) |
| 5 | Files Expected to Change matches contract | ✅ (5 items: 1 source + 4 governance; no test file) |
| 6 | Non-Negotiable Constraints present; cites 00.6 | ✅ (engine-wide + packet-specific + required // why: + session protocol) |
| 7 | Acceptance Criteria testable | ✅ (8 binary items; greppable artifacts) |
| 8 | Verification Steps operator-runnable; grep gates exact | ✅ (5 steps; expected outputs documented) |
| 9 | Definition of Done has binary gates | ✅ (DoD enumerates AC + governance files + D-numbers) |
| 10 | Layer boundary preserved — server-only, no engine/registry/UI | ✅ (apps/server only; layer rule cited in §Context) |
| 11 | Identity model N/A | N/A (no auth-token surface change) |
| 12 | Test rules — explicit decision on .test.ts | ✅ (test addition scoped out with rationale; D-19202 captures the deferral) |
| 13 | pnpm/node commands only; expected output shown | ✅ (pnpm --filter, pnpm -r build, grep) |
| 14 | Acceptance ≤ ~13 binary items; specific tokens/greps | ✅ (8 items; specific function/binding names) |
| 15 | Definition of Done includes STATUS/DECISIONS/WORK_INDEX/scope-bound | ✅ |
| 16 | Code style: full names, JSDoc, no clever parsing | ✅ (parsedRefreshInterval / jwksRefreshIntervalMs; explicit guard, not clever boolean tricks) |
| 17 | Vision Alignment present; clauses cited | ✅ (§22, §24; non-goal check; determinism explicit) |
| 18 | Prose-vs-grep: verification greps scoped to specific file + token | ✅ (greps target apps/server/src/server.mjs by file + named identifiers) |
| 19 | Bridge-vs-HEAD staleness — commit-time discipline | N/A (no contract bridge involved) |
| 20 | Funding surface N/A with justification | ✅ |
| 21 | API catalog N/A with justification | ✅ |

---

*Drafted: 2026-05-31. Baseline `origin/main @ a991d87`. Surgical
server-startup hardening parked during WP-176 execution session
(2026-05-24); landed under WP-192 governance after 7 days without a
ride-along host. Single-file, single-block change. Hard-dep: WP-131
✅. D-19201, D-19202 (proposed).*
