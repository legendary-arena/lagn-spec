# EC-292 — Autoplay Bot-Loop Crash Surfacing + Defensive Stage Progress (Execution Checklist)

**Source:** docs/ai/work-packets/WP-261-autoplay-bot-loop-crash-surfacing.md
**Layer:** Server (`apps/server/src/autoplay/`) — wiring only

## Before Starting
- [ ] `git rev-parse origin/main` recorded; branch off current `main`
- [ ] WP-163/EC-180, WP-165/EC-182, WP-200/EC-200 are Done (envelope + review window exist)
- [ ] `autoplay.mjs` `withRegisteredController` (≈452–466), `recordAndPace` (≈482–496), `runBotMatchLoop` (≈519–717), `buildResponse` (≈79–93) read and unchanged on `main`
- [ ] `getLegalMoves` parked-choice short-circuit confirmed in `ai.legalMoves.ts` (returns EXACTLY `[resolveKoHeroChoice]` / `[resolveOptionalKoReward]`)
- [ ] WP-261 §Pre-Flight = READY; §Copilot = PASS
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` runs (pre-existing `join-match.test.ts` fail may persist per WP-159 — not blocking)

## Locked Values (do not re-derive)
- Review window = `5 * 60 * 1000` ms (reuse the existing game-over constant; do NOT introduce a second literal)
- Envelope keys after WP-261: `{ ok, paused, historyLength, cursor, mode, speedMode, gameOver, aborted, uiState?, error?, abortReason? }`
- `aborted: boolean` ALWAYS present in `buildResponse`; `abortReason?: string` present ONLY when `aborted === true`
- `markAborted(reason)` sets `isAborted=true` + `abortReason=reason` + `isPaused=true`; NEVER sets `isGameOver`
- Abort reason strings are FULL SENTENCES (code-style rule): error / vanished-match / stage-did-not-advance variants
- New module `botLoopProgress.mjs` — pure: no `boardgame.io`, no `Math.random()`, no I/O, no `G` mutation
- API catalog rows: `Status: Wired`, `Auth: guest` UNCHANGED — only the response-schema column gains the fields

## Guardrails
- `botLoopProgress.mjs` MUST NOT import `boardgame.io`; helpers are deterministic + side-effect-free
- Controller flags are Class-1 runtime state (D-16306) — no DB / Redis / file / log write of `aborted`/`abortReason`
- `withRegisteredController` catch path: `markAborted(...)` + deferred-delete (5 min), then re-throw — do NOT keep the immediate `delete` (D-24037 refines the error half of D-16308; eventual removal preserved)
- Normal-exit path marks game-over ONLY `if (!controller.isAborted())` — never overwrite a loop-detected abort with `gameOver`
- ALL stages (start, **main**, cleanup) drain a parked choice via `getLegalMoves` before/instead of their hardcoded move — main's spend filter must no longer silently drop `resolve*` moves (D-24038)
- Every stage-advancing dispatch is followed by a `_stateID` progress check; no-progress → `markAborted` + break, NEVER re-dispatch to `maxTurns`
- Server stays wiring-only — no `G` mutation, no rule logic; reading `currentStage`/`_stateID` for routing is the existing pattern
- Engine is untouched (`packages/**` diff empty)

## Required `// why:` Comments
- `playbackController.mjs::markAborted` — abort ≠ game-over; distinct terminal flag, pauses for scrub consistency (D-24037)
- `autoplay.mjs::withRegisteredController` catch — D-24037: no silent immediate delete; defer + flag, parity with the normal review window; refines D-16308 error half
- `autoplay.mjs::withRegisteredController` normal exit — `markGameOver` guarded by `!isAborted()` so a loop-detected stall is preserved
- `autoplay.mjs` loop drain site — D-24038: parked choice resolved in ALL stages via `getLegalMoves`, not just main
- `autoplay.mjs` progress-assert site(s) — no-progress aborts rather than spinning to `maxTurns`

## Files to Produce
- `apps/server/src/autoplay/playbackController.mjs` — **modified** — `markAborted` + `isAborted`/`getAbortReason`
- `apps/server/src/autoplay/playbackController.test.ts` — **modified** — abort state-machine (aborted≠gameOver, terminal, paused)
- `apps/server/src/autoplay/botLoopProgress.mjs` — **new** — `findPendingChoiceMove`, `hasProgressed`, stall-message builder
- `apps/server/src/autoplay/botLoopProgress.test.ts` — **new** — pure-helper unit tests
- `apps/server/src/autoplay/autoplay.mjs` — **modified** — abort exit path, `buildResponse` fields, loop drain + progress assert
- `apps/server/src/autoplay/autoplayStatus.test.ts` — **modified** — `aborted`/`abortReason` envelope assertions
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — whole-row update, autoplay status + 6 control rows (D-11804)
- `docs/ai/DECISIONS.md` — **modified** — D-24037 + D-24038 Drafted → Active
- `docs/ai/STATUS.md` — **modified** — autoplay reliability note
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-261
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-292 Done
- `docs/ai/05-ROADMAP-MINDMAP.md` — **modified** — add the `WP-261 ✅` node + `node scripts/roadmap-counts.mjs --write` (D-24002; prevents the known finished-WP orphan-drift where ECs omit the mindmap)

## After Completing
- [ ] `pnpm -r build` 0; the three autoplay suites green
- [ ] `rg "boardgame\.io" apps/server/src/autoplay/botLoopProgress.mjs` → zero
- [ ] `rg "markAborted" apps/server/src/autoplay/autoplay.mjs` → catch path + stall site(s)
- [ ] `rg "5 \* 60 \* 1000" apps/server/src/autoplay/autoplay.mjs` → the literal appears at most where it already did (single constant reused, not duplicated per exit path)
- [ ] `git diff --name-only` shows NO `packages/**`
- [ ] `api-endpoints.md` rows carry the fields; `Status`/`Auth` unchanged; `00.3 §21` passes
- [ ] D-24037 + D-24038 Active; STATUS.md updated; WORK_INDEX WP-261 checked; EC_INDEX EC-292 Done
- [ ] `05-ROADMAP-MINDMAP.md` WP-261 node added + `roadmap-counts.mjs --check` passes (no orphan)
- [ ] Commit prefix `EC-292:` (staged `apps/` code); `SPEC:` governance close
- [ ] D-24026 live-verification recorded **N/A** (no client surface; observable change is an API field — WP-262 carries the live banner)

## Common Failure Smells
- Client still 404s on a dead match → error exit still deletes immediately instead of deferring
- Natural game over now reports `aborted: true` → normal-exit `markGameOver` not guarded by `!isAborted()`, or a clean break path mislabels
- Bot match still spins ~10 min on a KO-hero ambush → a stage (esp. main) still filters out the `resolve*` short-circuit
- `aborted` missing on the status body → handler bypassed `buildResponse()`
- `botLoopProgress.test.ts` pulls boardgame.io into its import graph → helper not actually pure (move it out of `autoplay.mjs`)
