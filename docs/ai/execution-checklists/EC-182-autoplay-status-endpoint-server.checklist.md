# EC-182 — Autoplay Status Endpoint (Server) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-165-autoplay-status-endpoint-server.md
**Layer:** Server (`apps/server/src/autoplay/`)

## Before Starting
- [ ] WP-163 / EC-180 is `Done`; `autoplay.mjs` exports `buildResponse` and has `getController` + `handlePlaybackRequest` + `autoplayControllers`
- [ ] `git rev-parse origin/main` matches local `main` HEAD; record it
- [ ] `pnpm -r build` exits 0 (builds the game-engine dep; the server has no build script)
- [ ] `pnpm --filter @legendary-arena/server test` runs (pre-existing `join-match.test.ts` fail may persist; not blocking)

## Locked Values (do not re-derive)
- Route: `GET /api/match/autoplay/:matchId/status` — bodyless, no `koaBody()`
- Handler reuses `handlePlaybackRequest(koaContext, (controller) => { koaContext.body = buildResponse(controller); })`
- `200` envelope: `{ ok: true, paused, historyLength, cursor, mode }` — NO `uiState` (status is metadata only)
- `404` envelope: the not-found shape `handlePlaybackRequest` already returns (`{ ok: false, paused: false, historyLength: 0, cursor: -1, mode: 'live', error }`)
- `mode` read only from `controller.getMode()` (D-16304)
- API catalog row: `Status: Wired`, `Auth: guest` (D-11804)

## Guardrails
- The status handler is strictly READ-ONLY — it never calls `pause`/`resume`/`step*`/`restart`/`goToEnd`/`pushState`
- Reuse WP-163's `getController` / `buildResponse` / `handlePlaybackRequest` — do NOT duplicate the 404/500 logic
- The route is `GET`, not `POST`; no `koaBody()`; no request body consumed
- No new controller state, no persistence, no `uiState` on the status response
- The six POST control routes are NOT modified (WP-163 surface unchanged)
- Controller-not-found (incl. a torn-down post-game controller, D-16308) → `404`, never a fabricated envelope

## Required `// why:` Comments
- `handleAutoplayStatusRequest` — read-only status probe; reuses the POST handlers' 404/500 wrapper but performs no mutation (D-16501)

## Files to Produce
- `apps/server/src/autoplay/autoplay.mjs` — **modified** — export `handleAutoplayStatusRequest`; register `router.get('/api/match/autoplay/:matchId/status', …)`
- `apps/server/src/autoplay/autoplayStatus.test.ts` — **new** — `200` envelope (no `uiState`); `404` on unknown matchId; no-mutation invariant (cursor/paused unchanged across a status call)
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — one new whole row (D-11804), `Wired` / `guest`
- `docs/ai/DECISIONS.md` — **modified** — flip D-16501 Drafted → Active
- `docs/ai/STATUS.md` / `docs/ai/work-packets/WORK_INDEX.md` / `docs/ai/execution-checklists/EC_INDEX.md` / `docs/05-ROADMAP-MINDMAP.md` — **modified** — close WP-165 / EC-182

## After Completing
- [ ] `pnpm -r build` exits 0; `autoplayStatus.test.ts` passes
- [ ] `rg "router\.get\('/api/match/autoplay/:matchId/status'" apps/server/src/autoplay/autoplay.mjs` → exactly 1
- [ ] `rg -c "router\.post\('/api/match/autoplay/:matchId/" apps/server/src/autoplay/autoplay.mjs` → 6 (WP-163 unchanged)
- [ ] `api-endpoints.md` has the new GET row, `Wired` / `guest`
- [ ] D-16501 Active; STATUS / WORK_INDEX (WP-165) / EC_INDEX (EC-182) / ROADMAP-MINDMAP updated
- [ ] Commit prefix `EC-182:` (staged file under `apps/server/`)

## Common Failure Smells
- Status call changes cursor/paused → handler is not read-only (called a mutating method)
- `404` returns a fabricated `paused:true`/non-zero envelope → not reusing `handlePlaybackRequest`'s not-found shape
- `uiState` present on a status response → status must be metadata only
- POST count drifts from 6 → a control route was accidentally touched
