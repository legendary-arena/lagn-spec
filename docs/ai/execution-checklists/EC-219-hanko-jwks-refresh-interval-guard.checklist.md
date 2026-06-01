# EC-219 — Hanko JWKS Refresh Interval Parsing Guard (Execution Checklist)

**Source:** docs/ai/work-packets/WP-192-hanko-jwks-refresh-interval-guard.md
**Layer:** Server (`apps/server/src/server.mjs`)

## Before Starting
- [ ] **WP-131 landed** ✅ — `tryConstructHankoVerifier()` exists at `apps/server/src/server.mjs` with the dev/prod env-completeness gate + D-12603 default-substitution semantics. Verify: `grep -n "tryConstructHankoVerifier\|refreshIntervalRaw" apps/server/src/server.mjs` returns matches.
- [ ] **Baseline parse-site shape unchanged.** The current single-step parse is at approximately lines 224-234 (verified `main @ a991d87`). If line numbers have shifted, re-locate by `grep -n "Number(refreshIntervalRaw)" apps/server/src/server.mjs`; do NOT change the WP/EC bodies (separate SPEC if needed).
- [ ] `pnpm --filter @legendary-arena/server build` exits 0 (baseline).
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 at the **400 pass / 0 fail / 66 skipped** baseline.

## Locked Values (do not re-derive)
- Env var name: `HANKO_JWKS_REFRESH_INTERVAL_MS` (do not rename / deprecate / replace).
- D-12603 default-substitution semantics: factory checks `jwksRefreshIntervalMs === undefined` to apply 300 000 ms default; a real `Number` (including `NaN`) bypasses that branch. Unchanged by WP-192 — the guard sits upstream.
- Closed set of malformed shapes the guard MUST collapse to `undefined`: `{ undefined, '', 'typo', '123abc', 'Infinity', '-Infinity', 'NaN' }`. Any value `Number()`-parseable to a finite real number passes through unchanged.
- Production log evidence date: **2026-05-24** (cite verbatim in the rewritten `// why:` block).
- Test baseline: 400 pass / 0 fail / 66 skipped — must remain at this count post-execution (no new tests, no existing tests touched).

## Guardrails
- **Surgical, single-block edit.** Touch ONLY the parse block at approximately lines 224-234 of `apps/server/src/server.mjs`. Do NOT modify `envComplete`, the dev/prod-mode diagnostic paths, the masked-URL logging, the `refreshLogged` ternary, the `createHankoSessionVerifier` call shape, or any other part of `tryConstructHankoVerifier()`.
- **Behavior preservation for valid inputs (non-negotiable).** A numeric env value (e.g., `"60000"`) MUST produce the same `jwksRefreshIntervalMs = 60000`, same log line `refresh=60000ms`, same factory call as today. An unset env var MUST still produce `jwksRefreshIntervalMs = undefined` → `refresh=defaultms`.
- **No factory mutation.** `createHankoSessionVerifier` is called with the same three-key options object shape; the guard sits strictly upstream of the factory call.
- **No test additions, no test modifications.** Per WP §Out of Scope + D-19202, test coverage for the malformed-env path is deferred to a future WP (would require either stubbing the factory or extracting a pure helper — both out of scope here). Server test baseline (400/0/66) must remain byte-identical.
- **No file outside the 5-item allowlist.** Only `apps/server/src/server.mjs` under code paths; only `STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md` under governance.
- **Commit prefix discipline.** Implementation commit MUST use `EC-219:` prefix (Rule 5 of `.githooks/commit-msg` rejects `INFRA:` or `SPEC:` when `apps/` is staged — verified at draft time; this is precisely why WP-192 exists rather than a standalone INFRA commit).

## Required `// why:` Comments
- Above the new two-step parse block in `tryConstructHankoVerifier()`: cite the **D-12603** default-substitution mechanism, the **WHATWG** `setInterval(..., NaN)` → 1 ms coercion failure mode, the **2026-05-24** production deploy log evidence (`refresh=NaNms`), and the closed list of malformed shapes the guard collapses (`undefined`, empty string, non-numeric, `Infinity`, `-Infinity`, `NaN`). Rewrite the existing comment block in full; do NOT append.

## Files to Produce
- `apps/server/src/server.mjs` — **modified** — replace single-step `Number(...)` parse with two-step parse + `Number.isFinite` guard; rewrite `// why:` block per Required Comments above. Single function, single block, ~10 lines of source diff.
- `docs/ai/STATUS.md` — **modified** — `### WP-192 / EC-219 Executed` block.
- `docs/ai/DECISIONS.md` — **modified** — D-19201..D-19202.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-192 row `[x]` with date.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-219 row Done.

## After Completing
- [ ] `pnpm --filter @legendary-arena/server build` exits 0.
- [ ] `pnpm --filter @legendary-arena/server test` exits 0 at the same **400 / 0 / 66** baseline (no test count drift).
- [ ] `pnpm -r build` exits 0.
- [ ] `git diff --name-only -- apps/ packages/` returns ONLY `apps/server/src/server.mjs` (zero other source files).
- [ ] `grep -n "Number.isFinite\|parsedRefreshInterval" apps/server/src/server.mjs` returns the new guard binding.
- [ ] `grep -n "D-12603\|WHATWG\|2026-05-24" apps/server/src/server.mjs` returns the new `// why:` citations.
- [ ] `docs/ai/STATUS.md` updated; `docs/ai/DECISIONS.md` D-19201..D-19202 landed; `WORK_INDEX.md` WP-192 `[x]`; `EC_INDEX.md` EC-219 Done.

## Common Failure Smells
- Test count drifted from 400/0/66 → guardrail violation (a test was modified or added; revert).
- `git diff` shows other files under `apps/` → scope creep (only `server.mjs` is in-scope).
- The `refreshLogged` ternary on the log line was modified → out-of-scope edit (the WP rewrites only the parse block, not the logging).
- `// why:` comment is appended rather than rewritten → ambiguous citations; the EC requires a full rewrite citing D-12603 + WHATWG + 2026-05-24 + the closed shape list.
- Commit message uses `INFRA:` or `SPEC:` prefix → local commit-msg hook (Rule 5) rejects; use `EC-219:` for the implementation commit.
- A pure helper (`parseRefreshIntervalMs`) was extracted → scope creep into D-19202 territory (deferred follow-up); the guard MUST stay inline.
