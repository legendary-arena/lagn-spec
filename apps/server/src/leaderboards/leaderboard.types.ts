/**
 * Public Leaderboard Types — Server Layer (WP-054)
 *
 * Durable contracts for the public, read-only leaderboard surface.
 * These types form the library API that the future request-handler
 * Work Packet will publish over HTTP. The current packet ships the
 * types and the read functions only — no HTTP transport, no
 * request-handling intermediary layer, no request throttling
 * (per the locked Lifecycle Prohibition; see EC-054 §Guardrails).
 *
 * This module belongs to the server layer only. It must not be
 * imported from `packages/game-engine/**`, `packages/registry/**`,
 * `packages/preplan/**`, `packages/vue-sfc-loader/**`,
 * `apps/arena-client/**`, `apps/replay-producer/**`, or
 * `apps/registry-viewer/**`. The owning account's identifier is
 * deliberately ABSENT from `PublicLeaderboardEntry` per D-5201
 * (server identity is `AccountId`; the engine identifier per D-8701
 * is a deliberately distinct type in a different layer and must
 * never be imported here).
 *
 * Authority: WP-054 §A; EC-054 §Locked Values; D-5201 (server
 * identity is `AccountId`); D-5306 Option A (`scoringConfig` flows
 * from PAR artifact; `ParGateHit` shape locked).
 */

import type { ScenarioScoringConfig } from '@legendary-arena/game-engine';

// why: type-only re-export so callers in this directory can reference
// the database alias without crossing the identity layer boundary
// explicitly. Mirrors WP-053 competition.types.ts:40 and WP-103
// replay.types.ts:43. The `export type { ... }` form is type-only by
// construction — TypeScript emits no runtime binding even when
// verbatimModuleSyntax is off — so no `pg` driver coupling is
// introduced via this surface.
export type { DatabaseClient } from '../identity/identity.types.js';

// why: parGate.mjs is JSDoc-typed (the .mjs file does not export
// TypeScript types). Re-stating the post-WP-053a return shape here
// keeps the deps interface strongly typed without crossing into the
// untyped module. Field order matches the JSDoc typedef in
// apps/server/src/par/parGate.mjs:32-47 verbatim. Non-exported by
// design — internal contract, not part of the public leaderboard
// surface.
interface ParGateHit {
  readonly parValue: number;
  readonly parVersion: string;
  readonly source: 'simulation' | 'seed';
  readonly scoringConfig: ScenarioScoringConfig;
}

// why: dependency injection seam — production callers pass the
// bound 1-arg form returned by `createParGate(...)`; tests pass
// inline stubs. Mirrors WP-053 `SubmissionDependencies` at
// apps/server/src/competition/competition.logic.ts:130. The future
// request-handler WP wires the real bound gate at server startup
// by extending `PRODUCTION_DEPENDENCIES`; until then the default
// fail-closes by returning `null` from `checkParPublished` per the
// Lifecycle Prohibition.
export interface LeaderboardDependencies {
  readonly checkParPublished: (scenarioKey: string) => ParGateHit | null;
}

// why: PublicLeaderboardEntry contains only derived, safe-to-expose
// fields. The seven never-expose fields from the WP-053
// CompetitiveScoreRecord 11-key set (per D-5201 / EC-054 §Locked
// Values §Never-expose fields) are excluded by construction:
// (i) the sequential bigserial primary key — a sequence-attack
// surface; (ii) the D-5201 server-identity correlation handle;
// (iii–v) the three identity-binding fields the account record
// carries (mail address + auth-provider tag + auth-provider's
// own subject id); (vi) the redundant audit-provenance hash that
// equals `replayHash` by construction; and (vii) the owner-only
// score-breakdown audit detail. Drift-detection test #9 enforces
// the locked 9-key set verbatim against `Object.keys(entry).sort()`.
// why: replayHash IS exposed because it is the cryptographic
// permalink key — unguessable, deterministic, and consistent with
// the visibility model (any replay whose hash is reachable here has
// already been opted into 'link' or 'public' visibility through
// `legendary.replay_ownership`). Cites the WP-052 UUID-v4
// enumeration-attack rationale at
// apps/server/src/identity/identity.types.ts:40 as precedent —
// sequential identifiers enable enumeration; cryptographic hashes
// do not.
export interface PublicLeaderboardEntry {
  readonly rank: number;
  readonly replayHash: string;
  readonly playerDisplayName: string;
  readonly scenarioKey: string;
  readonly finalScore: number;
  readonly rawScore: number;
  readonly parVersion: string;
  readonly scoringConfigVersion: number;
  readonly createdAt: string;
}

// why: totalEligibleEntries lets a UI render a "page X of Y" count
// without issuing a separate query. Computed using the SAME
// visibility, scenario, and PAR constraints as the paginated query
// — never an unfiltered `COUNT(*)` over the whole table.
// why: entries[] is marked `readonly` and is freshly constructed on
// every call (one fresh `PublicLeaderboardEntry` literal per query
// result row); no aliasing with an internal cache, request-scoped
// buffer, or query result row. Mirrors the
// apps/server/src/par/parGate.mjs:92-106 aliasing guard — returning
// a held reference would let callers mutate internal state through
// the projection.
export interface ScenarioLeaderboard {
  readonly scenarioKey: string;
  readonly entries: readonly PublicLeaderboardEntry[];
  readonly totalEligibleEntries: number;
}

// why: explicit `limit` and `offset` for deterministic pagination.
// Cursor-based pagination would carry hidden state across calls;
// offset pagination keeps every call stateless and lets the global
// `rank` (computed as `offset + i + 1`) stay correct without the
// caller threading a cursor.
export interface LeaderboardQueryOptions {
  readonly scenarioKey: string;
  readonly limit: number;
  readonly offset: number;
}
