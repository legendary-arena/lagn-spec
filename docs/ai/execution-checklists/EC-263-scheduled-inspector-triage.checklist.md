# EC-263 — Scheduled Inspector Triage (Execution Checklist)

**Source:** docs/ai/work-packets/WP-231-scheduled-inspector-triage.md
**Layer:** Server (`apps/server/src/inspection/` new + `apps/server/src/sweep/` additive) + Migration (`data/migrations/019_*`) + CI tooling (`scripts/inspection-*`, `.github/workflows/inspection-nightly.yml`)

> Use locked values from WP-231 verbatim. EC-263 is the operational order +
> gates + failure smells; if EC-263 and WP-231 conflict, WP-231 wins.

---

## Before Starting
- [ ] **WP-209 + WP-210 + WP-230 landed.** Verify the sweep server exists:
  `grep -n "registerSweepRoutes" apps/server/src/sweep/sweep.routes.ts` returns ≥ 1.
- [ ] **Sweep table has `manifest_blob`:**
  `grep -n "manifest_blob" data/migrations/018_create_sweep_runs.sql` returns ≥ 1.
- [ ] **Auth/no-store carry-forward present:** `analytics.routes.ts` shows the
  `Cache-Control` no-store first-statement + `SessionValidationErrorCode` collapse.
- [ ] **agent-inspector skill present:** `.claude/skills/agent-inspector/SKILL.md`
  defines P0/P1/P2 + the "any P0/P1 → FAIL" verdict rule.
- [ ] Read WP-231 §Goal, §Locked Type Contracts, §Non-Negotiable Constraints, §Acceptance Criteria, §Scope (In/Out).
- [ ] `pnpm --filter @legendary-arena/server test` + `pnpm -r build` exit 0 (anchor baseline).

## Locked Values (verbatim from WP-231 — do not re-derive)
- **inspection_reports columns (9, exact order):** `report_id` (PK text), `sweep_run_id`, `submitted_at` (DEFAULT now()), `generated_at`, `verdict` (CHECK PASS|FAIL), `p0_count`/`p1_count`/`p2_count` (CHECK ≥ 0), `findings` (jsonb). Index `inspection_reports_submitted_at_desc_idx (submitted_at DESC)`.
- **URLs:** `POST /api/inspection/reports`, `GET /api/inspection/latest`, `GET /api/sweep/runs/latest` (all literal).
- **Tokens:** `X-Inspection-Token` ↔ `INSPECTION_SUBMIT_TOKEN`; `X-Sweep-Token` reused for the sweep-read.
- **Server is sole authority for derived fields (D-23101):** the server recomputes `verdict` via `deriveVerdict(findings)` (FAIL iff any P0/P1, else PASS) AND `p0/p1/p2` counts from `findings` at insert; any client-supplied `verdict`/`*_count` are IGNORED — not trusted, not compared, not stored; **no 400 on disagreement**, the server silently corrects. The ONLY verdict comparison in the system is the submit script's fail-fast gate (exit 3).
- **`InspectionReportPayload`:** `{ reportId, sweepRunId, generatedAt, verdict, findings[] }`; `InspectionFinding = { severity:'P0'|'P1'|'P2', anomalyClass:string, cellId:string|null, description:string, route:'Builder'|'Architect' }`.
- **Status domains:** POST inspection `{201,400,401,409,413,500}`; GET inspection `{200,401,500}`; GET sweep-read `{200,401,500}`.
- **Recent cap:** 30, `ORDER BY submitted_at DESC LIMIT 30`. **Body cap:** 5 MB. **findings cap:** 500 (bounds runaway LLM output + Postgres row size + dashboard render perf).
- **Triage model:** `claude-sonnet-4-6`. **Workflow:** `Inspection Nightly`, `on: workflow_run["Sweep Nightly"] + workflow_dispatch`, success-guarded.
- **reportId form:** `<sweepRunId>-<generatedAtIsoCompact>` — `sweepRunId` already embeds the sweep timestamp (WP-209), so the id legitimately has two time parts (sweep + triage); re-triage of the same sweep → new `generatedAt` → new id → distinct row (no 409).
- **Shared-secret helper:** one `validateSharedSecret(headerValue, envToken)` in `apps/server/src/auth/validateSharedSecret.ts` (length pre-check + `timingSafeEqual`); the sweep POST (refactored, behavior-preserving), the new sweep-read, and the inspection POST all call it — no inline check in any route file.
- **Strict JSON:** the triage prompt demands JSON-only (no prose/markdown); `inspection-submit.mjs` uses a bare `JSON.parse` (no fence-stripping) — fenced/non-JSON → exit 2.
- **Blob required:** `GET /api/sweep/runs/latest` may return `manifestBlob: null`; `inspection-fetch.mjs` treats a null `run` OR a null `manifestBlob` as exit 3 (forensic blob is required triage input).
- **Script exit codes —** `inspection-fetch.mjs`: 0 ok / 1 missing env / 2 request-fail (non-2xx) / 3 no triageable input (null run or null blob). `inspection-submit.mjs`: 0 ok / 1 missing env / 2 invalid-JSON-or-shape / 3 verdict mismatch / 4 POST non-2xx (incl. 409). Non-zero → `inspection-work/` preserved; cleanup only on 201.
- **CI semantics:** no auto-retry within a run; on failure upload `inspection-work/` via `actions/upload-artifact@v4` (`if: failure()`); re-triage across runs is allowed (distinct reportId); 409 = hard failure (exit 4), never swallowed.

## Guardrails
- **anomalyClass is opaque (no engine union).** `inspection.types.ts` MUST NOT import `SweepAnomalyClass`; `anomalyClass` is plain `string`. `grep SweepAnomalyClass apps/server/src/inspection/` = 0.
- **Server is sole authority for ALL derived fields (D-23101).** The LLM proposes `findings`; the server recomputes `verdict` AND `p0/p1/p2` counts and stores those, IGNORING any client-supplied derived values (not compared, **no 400**). Findings are never validated for content — only shape. The submit-script verdict check (exit 3) is the fail-fast gate, not server validation.
- **LLM findings are nondeterministic (D-23102).** No test asserts finding content or re-run stability. The carve-out is explicit: this meta-surface touches no game/replay/scoring determinism.
- **Shared-secret auth via the single `validateSharedSecret` helper** (length pre-check → `timingSafeEqual`) for `X-Inspection-Token` (inspection POST) and `X-Sweep-Token` (sweep-read AND the refactored sweep POST). No route file calls `timingSafeEqual` directly; length-mismatch → 401 before `timingSafeEqual`, before any DB I/O.
- **Explicit INSERT column list** (no positional). `submitted_at` omitted (DEFAULT now()).
- **`Cache-Control: no-store` first statement** in every new handler body (D-11504).
- **GET endpoints ignore query params** (no reject) in v1.
- **Strict JSON boundary.** The triage prompt emits JSON-only; `inspection-submit.mjs` parses with a bare `JSON.parse` (no fence-stripping / regex recovery) — fenced/non-JSON → exit 2.
- **CI: no auto-retry; 409 is a hard failure.** A duplicate `reportId` → 409 → exit 4 → workflow fails, never swallowed; re-triage across runs is fine (distinct reportId); on failure `inspection-work/` uploads as an artifact.
- **Sweep extension is additive + behavior-preserving.** `GET /api/sweep/latest` stays byte-unchanged; the new `GET /api/sweep/runs/latest` + `fetchLatestSweepRunWithBlob` are added; the existing `POST /api/sweep/runs` changes ONLY by routing its token check through `validateSharedSecret` (behavior identical — WP-209 sweep route tests stay green).
- **No new npm deps; no `apps/dashboard/**` edits.** Headless agent runs via `anthropics/claude-code-action`.
- **Submit script preserves `inspection-work/` on every non-zero exit; `rm -rf` only on POST success.**
- **Full file contents** for every modified file — diffs/snippets forbidden.

## Required `// why:` Comments
- `inspection.routes.ts` — `// why:` `verdict` + `p0/p1/p2` counts are recomputed server-side and any client-supplied values are ignored (never compared, no 400), so the durable derived fields stay authoritative even though the LLM-proposed findings are not (D-23101 + D-23102).
- `apps/server/src/auth/validateSharedSecret.ts` — `// why:` the `Buffer.byteLength` length pre-check runs before `timingSafeEqual` (Node throws `RangeError` on unequal-length buffers); centralizing here gives sweep + inspection (+ future agents) one shared-secret bug surface.
- `scripts/inspection-submit.mjs` (parse) — `// why:` the agent output is parsed with a bare `JSON.parse` (no fence-stripping/regex recovery) so a non-strict-JSON agent fails loudly at the boundary (exit 2) instead of via brittle recovery hacks.
- `inspection.types.ts` — `// why:` `anomalyClass` is a plain string (not the engine `SweepAnomalyClass` union) to keep the inspection surface free of an engine import; the triage prompt is the only place the class names appear (D-23103 opacity carry-forward of D-20703).
- `sweep.routes.ts` (new read handler) — `// why:` shared-secret `X-Sweep-Token` read realizes the WP-209-deferred blob endpoint for the CI triage consumer only; it is not the operator dashboard read path (that stays `GET /api/sweep/latest`, session-gated).
- `scripts/inspection-submit.mjs` — `// why:` `inspection-work/` is preserved on every failure path so a failed nightly triage can be re-submitted from the persisted agent output without re-running the agent.

## Files to Produce
- `data/migrations/019_create_inspection_reports.sql` — new (table + index).
- `apps/server/src/inspection/inspection.types.ts` — new (payload/row/envelope + severity/route unions + canonical arrays).
- `apps/server/src/inspection/inspection.logic.ts` — new (`insertInspectionReport`, `fetchLatestInspectionReport`, `fetchRecentInspectionReports`, `deriveVerdict`).
- `apps/server/src/inspection/inspection.logic.test.ts` — new (≥ 6).
- `apps/server/src/inspection/inspection.routes.ts` — new (POST + GET + `registerInspectionRoutes`).
- `apps/server/src/inspection/inspection.routes.test.ts` — new (≥ 12).
- `apps/server/src/auth/validateSharedSecret.ts` — new (length pre-check + `timingSafeEqual`).
- `apps/server/src/auth/validateSharedSecret.test.ts` — new (≥ 4).
- `apps/server/src/sweep/sweep.logic.ts` — modified (`fetchLatestSweepRunWithBlob`).
- `apps/server/src/sweep/sweep.routes.ts` — modified (`GET /api/sweep/runs/latest`; refactor existing POST token check to `validateSharedSecret`, behavior-preserving).
- `apps/server/src/sweep/sweep.routes.test.ts` — modified (≥ 3 net-new; existing POST tests stay green).
- `apps/server/src/server.mjs` — modified (register inspection routes + `INSPECTION_SUBMIT_TOKEN` guard).
- `scripts/inspection-fetch.mjs` — new (fetch sweep run+blob → input file; exports `isTriageableSweepInput`).
- `scripts/inspection-triage-prompt.md` — new (headless-agent triage prompt; strict-JSON).
- `scripts/inspection-submit.mjs` — new (bare-`JSON.parse` validate → POST → cleanup).
- `scripts/inspection-submit.test.ts` — new (≥ 6; both scripts' pure helpers + exit-code mapping).
- `package.json` — modified (2 root scripts).
- `.github/workflows/inspection-nightly.yml` — new.
- `render.yaml` — modified (`INSPECTION_SUBMIT_TOKEN` `sync: false`).
- `.env.example` — modified.
- `docs/ai/REFERENCE/api-endpoints.md` — modified (3 rows, D-11804).
- `docs/ai/DECISIONS.md` — modified (D-23101..D-23103 Active).
- `docs/ai/STATUS.md` — modified.
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-231 `[x]`).
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-263 → Done).

**Total: 25 files** (13 new + 7 modified source + 5 governance).

## After Completing
- [ ] `pnpm --filter @legendary-arena/server test` exits 0; ≥ 25 net-new cases; no prior test regresses (incl. WP-209 sweep route tests, green through the helper refactor).
- [ ] `pnpm --filter @legendary-arena/server typecheck` exits 0 (the server package type-checks via its build; run it explicitly if a standalone `typecheck` script exists).
- [ ] `pnpm -r build` exits 0.
- [ ] anomalyClass opacity: `grep -n "SweepAnomalyClass" apps/server/src/inspection/inspection.types.ts` returns 0.
- [ ] Centralized secret check: `grep -n "timingSafeEqual" apps/server/src/auth/validateSharedSecret.ts` ≥ 1; `grep -rn "timingSafeEqual" apps/server/src/inspection/inspection.routes.ts apps/server/src/sweep/sweep.routes.ts` returns 0 (routes call `validateSharedSecret`).
- [ ] Derived-field authority: a test submits a wrong client `verdict` + wrong `*_count` and asserts the STORED values are server-recomputed (row inserted, no 400).
- [ ] Strict JSON: a test feeds markdown-fenced JSON to `inspection-submit.mjs` and asserts exit 2 (bare `JSON.parse`, no recovery).
- [ ] Blob required: tests stub `run: null` and `manifestBlob: null` and assert `inspection-fetch.mjs` exit 3.
- [ ] Explicit INSERT: `grep -n "INSERT INTO legendary.inspection_reports (report_id" apps/server/src/inspection/inspection.logic.ts` ≥ 1; positional `INSERT INTO legendary.inspection_reports VALUES` = 0.
- [ ] no-store gate: `Cache-Control.*no-store` across `inspection.routes.ts` + the new `sweep.routes.ts` handler ≥ 6.
- [ ] Catalog: 3 rows for the new endpoints in `api-endpoints.md`, Status/Auth in their closed sets.
- [ ] No dashboard edits: `git diff --name-only apps/dashboard/` empty. No new npm deps in `package.json` diffs.
- [ ] Scope: `git diff --name-only` lists only the 25 `## Files to Produce` paths.
- [ ] `STATUS.md`, `DECISIONS.md` (D-23101..03 Active), `WORK_INDEX.md` (WP-231 `[x]`), `EC_INDEX.md` (EC-263 Done) updated.

## Common Failure Smells
- `SweepAnomalyClass` imported into the inspection surface → opacity violation (D-23103 / D-20703 class).
- Server stores the client's `verdict` or `*_count` instead of recomputing → dual-source-of-truth; D-23101 requires server-recompute + ignore.
- Server returns **400 on a verdict/count mismatch** → wrong model. The server ignores client-derived values and silently recomputes (no compare, no 400); the only verdict comparison is the submit script's exit-3 gate.
- A test asserts specific finding text/counts → couples the suite to nondeterministic LLM output; assert shape + server-recomputed values only.
- Inline `timingSafeEqual` / `===` in a route file instead of calling `validateSharedSecret` → duplication + drift surface; or `timingSafeEqual` without the length pre-check → `RangeError`.
- The existing sweep `POST`/`GET /api/sweep/latest` changing BEHAVIOR (not just the token-check refactor) → non-additive change to a WP-209 surface; only the helper extraction is permitted.
- `inspection-submit.mjs` stripping markdown fences / regex-extracting JSON → brittle recovery; use a bare `JSON.parse` and fail with exit 2.
- `inspection-fetch.mjs` succeeding with a null `run` or null `manifestBlob` → must exit 3 (forensic blob required).
- A 409 treated as success, or the workflow auto-retrying within a run → 409 is a hard failure (exit 4); duplicate submission is a signal, not a no-op.
- `inspection-work/` deleted on a failure path → forensic re-run impossible.
- A new npm dependency added for the agent → use the `anthropics/claude-code-action` GitHub Action instead.
- Any `apps/dashboard/**` edit → out of scope (deferred to the paired follow-up WP).

---

## DECISIONS.md Entries (D-23101..D-23103)

> Status flips from `Reserved (proposed)` at draft time to `Active` at
> landing (execution close); no other field changes.

### D-23101 — Inspection Reports: Storage Shape + Report Contract Lock

**Decision:**
`legendary.inspection_reports` stores one row per nightly Inspector triage:
9 columns (`report_id` PK, `sweep_run_id`, `submitted_at` DEFAULT now(),
`generated_at`, `verdict` CHECK PASS|FAIL, `p0_count`/`p1_count`/`p2_count`
CHECK ≥ 0, `findings` jsonb) + a `submitted_at DESC` BTREE index. The wire
contract is `InspectionReportPayload` (POST) / `InspectionReportSummary`
(GET), with `InspectionFinding = { severity, anomalyClass, cellId,
description, route }`. The count columns are denormalized from `findings` at
insert time for cheap dashboard reads. `GET /api/inspection/latest` returns
`{ data: { latest, recentReports } }` (latest by greatest `submitted_at`;
recent ≤ 30, `submitted_at DESC`) — the same object-envelope deviation
WP-209's `GET /api/sweep/latest` justified for serving two payloads in one
response.

The server is the sole authority for ALL derived fields: `verdict` and the
three count columns are recomputed from `findings` at insert time, and any
client-supplied derived values (`verdict`, `*_count`) are ignored — not
trusted, not compared, not stored, never a 400. The `report_id` form is
`<sweepRunId>-<generatedAtIsoCompact>` (the `sweepRunId` already embeds the
sweep timestamp), so a re-triage of the same sweep run yields a distinct
`report_id` and a distinct row rather than a 409.

**Packet:** WP-231 (EC-263).
**Drafted:** 2026-06-09 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)

### D-23102 — Inspector Triage Posture: Nondeterministic Findings, Server-Enforced Deterministic Verdict, Per-Run API Cost

**Decision:**
The nightly triage is performed by a headless Claude agent (model
`claude-sonnet-4-6`) running the `agent-inspector` P0/P1/P2 rubric against the
latest sweep run, invoked from `inspection-nightly.yml` via
`anthropics/claude-code-action`. The agent's **findings are
LLM-generated and intentionally nondeterministic** — an explicit, scoped
carve-out from the engine's determinism-first posture, permissible because
this is an internal QA *meta* surface that reasons about sweep outputs and
changes no game logic, RNG, scoring, or replay (Vision §22 is not engaged).
The one determinism-bearing output, the PASS/FAIL **verdict** (and the
`p0/p1/p2` counts), is recomputed server-side via `deriveVerdict(findings)`
(FAIL iff any P0/P1); the server ignores any client-supplied derived values
(never compares them, no 400 — D-23101) and stores the recomputed result, so
the durable verdict is reproducible from the stored findings. Tests validate report shape
and verdict consistency, never finding content. Each nightly run spends
Anthropic API tokens; cost is accepted for v1, and a deterministic-classifier
fallback is named as future work if cost or variance warrants.

**Packet:** WP-231 (EC-263).
**Drafted:** 2026-06-09 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)

### D-23103 — CI Sweep-Blob Read Endpoint (`GET /api/sweep/runs/latest`)

**Decision:**
WP-209 deferred a blob-retrieval endpoint until a consumer surfaced; the
Inspector triage is that consumer. `GET /api/sweep/runs/latest` is added to
the sweep module as an **additive** read returning the latest run including
its forensic `manifest_blob`, authenticated by the existing shared-secret
`X-Sweep-Token` (the CI trust boundary; no third secret). It is a CI-only
read path distinct from the operator dashboard's session-gated
`GET /api/sweep/latest`, which stays blob-free and byte-unchanged. The
inspection surface treats anomaly-class keys as opaque strings (no engine
`SweepAnomalyClass` import), carrying forward D-20703's dashboard-layer
opacity posture to the inspection layer.

**Packet:** WP-231 (EC-263).
**Drafted:** 2026-06-09 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)
