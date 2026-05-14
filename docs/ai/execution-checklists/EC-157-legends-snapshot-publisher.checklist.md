# EC-157: Legends Snapshot Publisher

## Work Packet
WP-142 — Legends Snapshot Publisher

## Status
Done (2026-05-14)

## Scope
Server (`apps/server/src/legends/`)

## Summary
Background publisher writing public JSON leaderboard snapshots to
Cloudflare R2 on a 5-minute cadence. Executed from session prompt
`session-wp142-legends-snapshot-publisher.md` (the session prompt
served as the execution contract; no separate EC was authored pre-execution).

## Locked Values (from session prompt)
- Cadence: 300_000 ms (5 min) via LEGENDS_PUBLISHER_INTERVAL_MS
- Kill switch: LEGENDS_PUBLISHER_ENABLED=true to enable (default off)
- AbortSignal.timeout(10_000) per PUT
- Manifest-last write pattern (D-14204)
- Archive once per UTC day
- Health state replaced atomically
- runId format: <ISO>-<4-char-hex>
- GLOBAL_TOP_QUERY_LIMIT = 500
- SCENARIO_QUERY_LIMIT = 100

## Files (8 new + 5 modified)
- apps/server/src/legends/legends.types.ts (new)
- apps/server/src/legends/legends.logic.ts (new)
- apps/server/src/legends/legends.publisher.ts (new)
- apps/server/src/legends/legends.scheduler.ts (new)
- apps/server/src/legends/legends.routes.ts (new)
- apps/server/src/legends/legends.logic.test.ts (new)
- apps/server/src/legends/legends.publisher.test.ts (new)
- apps/server/src/legends/legends.scheduler.test.ts (new)
- apps/server/src/index.mjs (modified)
- apps/server/src/server.mjs (modified)
- apps/server/package.json (modified)
- render.yaml (modified)
- docs/ai/REFERENCE/api-endpoints.md (modified)

## Verification Gates
- [x] pnpm -r build exits 0
- [x] pnpm --filter @legendary-arena/server test — 289/223/0/66
- [x] Zero `boardgame.io` matches in legends/
- [x] Zero `Math.random` matches in legends/
- [x] `legends/v1/` present in publisher
- [x] `/health/legends-publisher` present in routes
