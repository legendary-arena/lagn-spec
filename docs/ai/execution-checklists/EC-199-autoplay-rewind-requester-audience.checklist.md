# EC-199 — Autoplay Rewind Requester Audience (Execution Checklist)

**Source:** docs/ai/work-packets/WP-177-autoplay-rewind-requester-audience.md
**Layer:** Server

## Before Starting
- [ ] WP-163 complete — `autoplay.mjs` has six POST endpoints + `rewindUIState`
- [ ] WP-164 complete — client calls bodyless POSTs (will gain headers in paired WP)
- [ ] WP-165 complete — status endpoint exists, stays `Auth: guest`, no `uiState`
- [ ] `filterUIStateForAudience` accepts `{ kind: 'player', playerId }` (verify in `uiState.filter.ts`)
- [ ] `auth.authenticateCredentials({ playerID, credentials, metadata })` available (boardgame.io Auth class)
- [ ] `pnpm -r build` exits 0
- [ ] Server test baseline: 453 pass, 1 pre-existing fail, 66 skipped

## Locked Values (do not re-derive)
- Header names: `X-Player-ID`, `X-Credentials`
- Default audience: `{ kind: 'spectator' }` (no headers or invalid)
- Player audience: `{ kind: 'player', playerId: <validated playerID> }`
- `rewindUIState(snapshot, audience)` — `audience` param defaults to `{ kind: 'spectator' }`
- Decision: D-17701 (scopes D-16303)
- Three rewind call sites: step-forward cursor (~line 311), step-back (~line 326), restart (~line 338)
- Untouched endpoints: pause, resume, go-to-end, status

## Guardrails
- `playbackController.mjs` must NOT be modified (byte-identical pre/post)
- Status endpoint must NOT be modified (D-16501; metadata-only, no `uiState`)
- pause / resume / go-to-end must NOT be modified (no `uiState`, no audience needed)
- Live broadcast path (`transport.pubSub.publish`) must NOT be modified
- Invalid or missing credentials MUST fall back to `{ kind: 'spectator' }` — never reject the request
- No new npm dependencies
- No engine changes — `filterUIStateForAudience` is consumed as-is
- Test file must NOT import from `boardgame.io`

## Required `// why:` Comments
- `resolveRequesterAudience` spectator fallback: `// why: D-17701 — safe-by-default; absent or invalid identity yields the same spectator view D-16303 mandated`
- `rewindUIState` audience parameter: `// why: D-17701 — scopes D-16303; audience defaults to spectator for back-compat`
- Each rewind call site's `resolveRequesterAudience` call: `// why: D-17701`

## Files to Produce
- `apps/server/src/autoplay/autoplay.mjs` — **modified** — `resolveRequesterAudience` + parameterized `rewindUIState` + threaded audience at 3 sites
- `apps/server/src/autoplay/rewindAudience.test.ts` — **new** — 6+ tests
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — 3 rows updated (§21)
- `docs/ai/DECISIONS.md` — **modified** — D-17701 landed; D-16303 scoped
- `docs/ai/STATUS.md` — **modified**
- `docs/ai/work-packets/WORK_INDEX.md` — **modified**

## After Completing
- [ ] `pnpm -r build` exits 0
- [ ] Server tests pass (baseline +N new, 0 new failures)
- [ ] `playbackController.mjs` byte-identical (`git diff` empty)
- [ ] Status endpoint byte-identical
- [ ] pause / resume / go-to-end byte-identical
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated (D-17701 landed; D-16303 status scoped)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` checked off with date

## Common Failure Smells
- `rewindUIState` called without `audience` parameter — means a call site was missed; check all three rewind endpoints
- Test imports `boardgame.io` — use the `Auth` instance from context, not a direct framework import
- Request rejected (non-200) on missing headers — MUST fall back to spectator, never reject
- `playbackController.mjs` shows up in `git diff` — the controller has no audience concern; revert
