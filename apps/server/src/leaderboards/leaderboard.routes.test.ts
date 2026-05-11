/**
 * Tests for the public leaderboard HTTP routes (WP-115).
 *
 * Eight tests inside one `describe('leaderboard routes (WP-115)', …)`
 * block per WP-115 §C / EC-119 §Files to Produce. All tests are
 * logic-pure: a fake `LeaderboardLogic` is passed via the optional
 * 4th parameter of `registerLeaderboardRoutes` (the test-only
 * injection seam introduced in WP-115 v1.1 reviewer Patch 3),
 * removing any need to mock WP-054's SQL row shapes. Mock router
 * captures registered handlers; mock `koaContext` mirrors the
 * locally-declared `KoaLeaderboardContext` shape verbatim plus
 * test-only `headerCalls` / `callOrder` arrays for the Cache-Control
 * discipline assertion in test #8.
 *
 * No `boardgame.io` import. No real `pg.Pool` connection. No HTTP
 * listener. The `database` parameter is passed through as a sentinel
 * since the fake `LeaderboardLogic` never uses it; `parGate` is a
 * fake whose `checkParPublished` is a sentinel function (the
 * deps-injection assertion is implicit in test #4 — handler 2
 * forwards the bound function to the fake's `getScenarioLeaderboard`
 * via the `deps.checkParPublished` reference).
 *
 * Authority: WP-115 §Scope (In) §E; EC-119 §Files to Produce + §After
 * Completing (Test #5 covers eight sub-assertions per Patches 4 / 5;
 * Test #8 asserts Cache-Control on at least one error path per
 * Patch 8).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';

import { registerLeaderboardRoutes } from './leaderboard.routes.js';
import type { LeaderboardLogic } from './leaderboard.routes.js';
import type {
  GlobalTopLeaderboard,
  PublicLeaderboardEntry,
  ScenarioLeaderboard,
  ThemeLeaderboard,
} from './leaderboard.types.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

type RegisteredHandler = (koaContext: MockKoaContext) => Promise<void> | void;

interface RegisteredRoute {
  readonly path: string;
  readonly handler: RegisteredHandler;
}

interface MockKoaContext {
  params: { scenarioKey?: string; replayHash?: string; themeId?: string };
  query: Record<string, string | string[] | undefined>;
  status: number;
  body: unknown;
  set(field: string, value: string): void;
  // Test-only fields capturing observed `set()` calls + ordering.
  // The handler under test only sees the public Koa surface
  // (`params`, `query`, `status`, `body`, `set`); these extra
  // fields exist only for the test harness and are visible to
  // the test code via the typed `MockKoaContext`.
  readonly headerCalls: { field: string; value: string }[];
  readonly callOrder: string[];
}

/**
 * Minimal mock Koa router. Captures `(path, handler)` pairs in the
 * order they were registered; returns the `RegisteredRoute[]` to
 * the caller so individual tests can invoke each handler against a
 * hand-built `MockKoaContext`.
 */
function makeMockRouter(): {
  router: { get: (path: string, handler: RegisteredHandler) => void };
  routes: RegisteredRoute[];
} {
  const routes: RegisteredRoute[] = [];
  const router = {
    get(path: string, handler: RegisteredHandler): void {
      routes.push({ path, handler });
    },
  };
  return { router, routes };
}

/**
 * Builds a fresh `MockKoaContext`. Each handler invocation gets its
 * own context so observed `set()` calls + status + body are
 * isolated per-call. The `proxiedContext` exposes property setters
 * for `status` / `body` that record write ordering into `callOrder`
 * — this lets test #8 assert that `set('Cache-Control', ...)`
 * precedes every status / body assignment in every handler.
 */
function makeMockContext(
  params: { scenarioKey?: string; replayHash?: string; themeId?: string } = {},
  query: Record<string, string | string[] | undefined> = {},
): MockKoaContext {
  const headerCalls: { field: string; value: string }[] = [];
  const callOrder: string[] = [];
  let statusValue = 0;
  let bodyValue: unknown = undefined;
  const proxied: MockKoaContext = {
    params,
    query,
    get status(): number {
      return statusValue;
    },
    set status(value: number) {
      statusValue = value;
      callOrder.push('status');
    },
    get body(): unknown {
      return bodyValue;
    },
    set body(value: unknown) {
      bodyValue = value;
      callOrder.push('body');
    },
    set(field: string, value: string): void {
      headerCalls.push({ field, value });
      callOrder.push(`set:${field}`);
    },
    headerCalls,
    callOrder,
  };
  return proxied;
}

/**
 * Sentinel `Pool` — the fake `LeaderboardLogic` never uses it, but
 * the production handler signature requires a `Pool` value. Cast
 * via `unknown` keeps the test free of `pg` runtime imports.
 */
const SENTINEL_DATABASE = {} as unknown as Pool;

/**
 * Sentinel `parGate` whose `checkParPublished` returns `null`. The
 * fake `getScenarioLeaderboard` does not consult it; tests assert
 * the deps wiring by checking the handler forwarded the bound
 * function in its 3rd argument.
 */
const SENTINEL_PAR_GATE = {
  checkParPublished: (_scenarioKey: string) => null,
} as const;

// why: SENTINEL_PAR_GATE_WITH_THEME carries both deps for the new
// theme + global routes (WP-150 / D-15002). The reference identity
// is asserted by test 11 (deps wiring) — production wiring binds
// both functions; tests must mirror that.
const SENTINEL_GET_SCENARIO_KEYS_FOR_THEME = (
  _themeId: string,
): readonly string[] | null => null;
const SENTINEL_PAR_GATE_WITH_THEME = {
  checkParPublished: (_scenarioKey: string) => null,
  getScenarioKeysForTheme: SENTINEL_GET_SCENARIO_KEYS_FOR_THEME,
} as const;

const SAMPLE_ENTRY: PublicLeaderboardEntry = {
  rank: 1,
  replayHash: 'replay-abc',
  playerDisplayName: 'Alice',
  scenarioKey: 'core/midnight-attack',
  finalScore: 42,
  rawScore: 100,
  parVersion: 'v1',
  scoringConfigVersion: 1,
  createdAt: '2026-05-01T00:00:00.000Z',
};

const SAMPLE_LEADERBOARD: ScenarioLeaderboard = {
  scenarioKey: 'core/midnight-attack',
  entries: [SAMPLE_ENTRY],
  totalEligibleEntries: 1,
};

const EMPTY_LEADERBOARD: ScenarioLeaderboard = {
  scenarioKey: 'core/midnight-attack',
  entries: [],
  totalEligibleEntries: 0,
};

const SAMPLE_THEME_LEADERBOARD: ThemeLeaderboard = {
  themeId: 'dark-reign',
  entries: [SAMPLE_ENTRY],
  totalEligibleEntries: 1,
};

const EMPTY_THEME_LEADERBOARD: ThemeLeaderboard = {
  themeId: 'dark-reign',
  entries: [],
  totalEligibleEntries: 0,
};

const SAMPLE_GLOBAL_LEADERBOARD: GlobalTopLeaderboard = {
  entries: [SAMPLE_ENTRY],
  totalEligibleEntries: 1,
};

const EMPTY_GLOBAL_LEADERBOARD: GlobalTopLeaderboard = {
  entries: [],
  totalEligibleEntries: 0,
};

type ParGateCheck = (scenarioKey: string) => unknown;

interface FakeCalls {
  listScenarioKeys: number;
  getScenarioLeaderboard: number;
  getPublicScoreByReplayHash: number;
  getThemeLeaderboard: number;
  getGlobalTopLeaderboard: number;
  lastDepsCheckParPublished: ParGateCheck | null;
  lastDepsGetScenarioKeysForTheme:
    | ((themeId: string) => readonly string[] | null)
    | null;
  lastThemeIdRequested: string | null;
}

/**
 * Builds a fresh `LeaderboardLogic` fake whose three methods return
 * canned results. The caller passes the per-method return values;
 * the fake records call counts and the last `deps.checkParPublished`
 * reference so tests can confirm the wiring without coupling to
 * WP-054's SQL row shape.
 */
function makeFakeLogic(
  config: {
    scenarioKeys?: string[];
    leaderboard?: ScenarioLeaderboard;
    entry?: PublicLeaderboardEntry | null;
    themeLeaderboard?: ThemeLeaderboard | null;
    globalLeaderboard?: GlobalTopLeaderboard;
    throwOnListScenarioKeys?: boolean;
    throwOnGetThemeLeaderboard?: boolean;
    throwOnGetGlobalTopLeaderboard?: boolean;
  } = {},
): { logic: LeaderboardLogic; calls: FakeCalls } {
  const calls: FakeCalls = {
    listScenarioKeys: 0,
    getScenarioLeaderboard: 0,
    getPublicScoreByReplayHash: 0,
    getThemeLeaderboard: 0,
    getGlobalTopLeaderboard: 0,
    lastDepsCheckParPublished: null,
    lastDepsGetScenarioKeysForTheme: null,
    lastThemeIdRequested: null,
  };
  const logic: LeaderboardLogic = {
    async listScenarioKeys(_database) {
      calls.listScenarioKeys = calls.listScenarioKeys + 1;
      if (config.throwOnListScenarioKeys === true) {
        throw new Error('simulated WP-054 failure');
      }
      return config.scenarioKeys ?? [];
    },
    async getScenarioLeaderboard(_options, _database, deps) {
      calls.getScenarioLeaderboard = calls.getScenarioLeaderboard + 1;
      calls.lastDepsCheckParPublished =
        deps === undefined
          ? null
          : (deps.checkParPublished as unknown as ParGateCheck);
      return config.leaderboard ?? EMPTY_LEADERBOARD;
    },
    async getPublicScoreByReplayHash(_replayHash, _database) {
      calls.getPublicScoreByReplayHash = calls.getPublicScoreByReplayHash + 1;
      return config.entry ?? null;
    },
    async getThemeLeaderboard(options, _database, deps) {
      calls.getThemeLeaderboard = calls.getThemeLeaderboard + 1;
      calls.lastThemeIdRequested = options.themeId;
      calls.lastDepsCheckParPublished =
        deps === undefined
          ? null
          : (deps.checkParPublished as unknown as ParGateCheck);
      calls.lastDepsGetScenarioKeysForTheme =
        deps === undefined || deps.getScenarioKeysForTheme === undefined
          ? null
          : deps.getScenarioKeysForTheme;
      if (config.throwOnGetThemeLeaderboard === true) {
        throw new Error('simulated theme-leaderboard failure');
      }
      return config.themeLeaderboard === undefined
        ? EMPTY_THEME_LEADERBOARD
        : config.themeLeaderboard;
    },
    async getGlobalTopLeaderboard(_options, _database, deps) {
      calls.getGlobalTopLeaderboard = calls.getGlobalTopLeaderboard + 1;
      calls.lastDepsCheckParPublished =
        deps === undefined
          ? null
          : (deps.checkParPublished as unknown as ParGateCheck);
      if (config.throwOnGetGlobalTopLeaderboard === true) {
        throw new Error('simulated global-top failure');
      }
      return config.globalLeaderboard ?? EMPTY_GLOBAL_LEADERBOARD;
    },
  };
  return { logic, calls };
}

// ---------------------------------------------------------------------------
// Tests — eight load-bearing tests inside one describe block
// ---------------------------------------------------------------------------

describe('leaderboard routes (WP-115)', () => {
  test('1 — registers exactly five GET handlers at the locked paths in the locked order', () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic();
    registerLeaderboardRoutes(router, SENTINEL_DATABASE, SENTINEL_PAR_GATE, logic);
    assert.equal(routes.length, 5);
    assert.equal(routes[0].path, '/api/leaderboards/scenarios');
    assert.equal(routes[1].path, '/api/leaderboards/scenarios/:scenarioKey');
    assert.equal(routes[2].path, '/api/leaderboards/scores/:replayHash');
    assert.equal(routes[3].path, '/api/leaderboards/themes/:themeId');
    assert.equal(routes[4].path, '/api/leaderboards/top');
  });

  test('2 — GET /api/leaderboards/scenarios returns 200 with non-empty scenarioKeys', async () => {
    const { router, routes } = makeMockRouter();
    const { logic, calls } = makeFakeLogic({
      scenarioKeys: ['core/midnight-attack', 'msp1/breakout'],
    });
    registerLeaderboardRoutes(router, SENTINEL_DATABASE, SENTINEL_PAR_GATE, logic);
    const koaContext = makeMockContext();
    await routes[0].handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepEqual(koaContext.body, {
      scenarioKeys: ['core/midnight-attack', 'msp1/breakout'],
    });
    assert.equal(calls.listScenarioKeys, 1);
  });

  test('3 — GET /api/leaderboards/scenarios returns 200 with empty scenarioKeys when none exist', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({ scenarioKeys: [] });
    registerLeaderboardRoutes(router, SENTINEL_DATABASE, SENTINEL_PAR_GATE, logic);
    const koaContext = makeMockContext();
    await routes[0].handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepEqual(koaContext.body, { scenarioKeys: [] });
  });

  test('4 — GET /api/leaderboards/scenarios/:scenarioKey returns 200 with the leaderboard and forwards the bound parGate', async () => {
    const { router, routes } = makeMockRouter();
    const { logic, calls } = makeFakeLogic({ leaderboard: SAMPLE_LEADERBOARD });
    registerLeaderboardRoutes(router, SENTINEL_DATABASE, SENTINEL_PAR_GATE, logic);
    const koaContext = makeMockContext(
      { scenarioKey: 'core/midnight-attack' },
      { limit: '10', offset: '0' },
    );
    await routes[1].handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepEqual(koaContext.body, SAMPLE_LEADERBOARD);
    assert.equal(calls.getScenarioLeaderboard, 1);
    // why: explicit deps injection is the load-bearing invariant —
    // handler 2 must forward the bound `parGate.checkParPublished`,
    // not the WP-054 PRODUCTION_DEPENDENCIES default. Asserting
    // identity confirms the wiring.
    assert.equal(
      calls.lastDepsCheckParPublished,
      SENTINEL_PAR_GATE.checkParPublished,
    );
  });

  test('5 — handler 2 + 3 reject malformed input with 400 + invalid_query envelope (8 sub-assertions per Patches 4 / 5)', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({ leaderboard: SAMPLE_LEADERBOARD });
    registerLeaderboardRoutes(router, SENTINEL_DATABASE, SENTINEL_PAR_GATE, logic);
    const handler2 = routes[1].handler;
    const handler3 = routes[2].handler;

    // Sub-assertion (a): non-integer limit → 400
    const ctxA = makeMockContext(
      { scenarioKey: 'core/midnight-attack' },
      { limit: 'banana' },
    );
    await handler2(ctxA);
    assert.equal(ctxA.status, 400);
    assert.equal((ctxA.body as { error: string }).error, 'invalid_query');
    assert.ok(typeof (ctxA.body as { message: string }).message === 'string');

    // Sub-assertion (b): limit=0 → 400 (below min 1)
    const ctxB = makeMockContext(
      { scenarioKey: 'core/midnight-attack' },
      { limit: '0' },
    );
    await handler2(ctxB);
    assert.equal(ctxB.status, 400);
    assert.equal((ctxB.body as { error: string }).error, 'invalid_query');

    // Sub-assertion (c): limit=101 → 400 (above max 100)
    const ctxC = makeMockContext(
      { scenarioKey: 'core/midnight-attack' },
      { limit: '101' },
    );
    await handler2(ctxC);
    assert.equal(ctxC.status, 400);
    assert.equal((ctxC.body as { error: string }).error, 'invalid_query');

    // Sub-assertion (d): negative offset → 400
    const ctxD = makeMockContext(
      { scenarioKey: 'core/midnight-attack' },
      { offset: '-1' },
    );
    await handler2(ctxD);
    assert.equal(ctxD.status, 400);
    assert.equal((ctxD.body as { error: string }).error, 'invalid_query');

    // Sub-assertion (e): offset=10001 → 400 (above max 10000)
    const ctxE = makeMockContext(
      { scenarioKey: 'core/midnight-attack' },
      { offset: '10001' },
    );
    await handler2(ctxE);
    assert.equal(ctxE.status, 400);
    assert.equal((ctxE.body as { error: string }).error, 'invalid_query');

    // Sub-assertion (f): array-valued limit (?limit=10&limit=20) → 400 (Patch 5)
    const ctxF = makeMockContext(
      { scenarioKey: 'core/midnight-attack' },
      { limit: ['10', '20'] },
    );
    await handler2(ctxF);
    assert.equal(ctxF.status, 400);
    assert.equal((ctxF.body as { error: string }).error, 'invalid_query');

    // Sub-assertion (g): missing :scenarioKey → 400 (Patch 4)
    const ctxG = makeMockContext({});
    await handler2(ctxG);
    assert.equal(ctxG.status, 400);
    assert.equal((ctxG.body as { error: string }).error, 'invalid_query');
    assert.equal(
      (ctxG.body as { message: string }).message,
      'Scenario key is required.',
    );

    // Sub-assertion (h): missing :replayHash → 400 (Patch 4, handler 3)
    const ctxH = makeMockContext({});
    await handler3(ctxH);
    assert.equal(ctxH.status, 400);
    assert.equal((ctxH.body as { error: string }).error, 'invalid_query');
    assert.equal(
      (ctxH.body as { message: string }).message,
      'Replay hash is required.',
    );
  });

  test('6 — handler 2 returns 200 with entries: [] on PAR-missing (fail-closed empty leaderboard, NOT 404)', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({ leaderboard: EMPTY_LEADERBOARD });
    registerLeaderboardRoutes(router, SENTINEL_DATABASE, SENTINEL_PAR_GATE, logic);
    const koaContext = makeMockContext({ scenarioKey: 'core/midnight-attack' });
    await routes[1].handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepEqual(koaContext.body, EMPTY_LEADERBOARD);
  });

  test('7 — handler 3 returns 200 on hit and 404 with score_not_found envelope on miss', async () => {
    // 7a — hit
    const hitRouter = makeMockRouter();
    const hitFake = makeFakeLogic({ entry: SAMPLE_ENTRY });
    registerLeaderboardRoutes(
      hitRouter.router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE,
      hitFake.logic,
    );
    const hitContext = makeMockContext({ replayHash: 'replay-abc' });
    await hitRouter.routes[2].handler(hitContext);
    assert.equal(hitContext.status, 200);
    assert.deepEqual(hitContext.body, SAMPLE_ENTRY);

    // 7b — miss (null) → 404 with locked envelope
    const missRouter = makeMockRouter();
    const missFake = makeFakeLogic({ entry: null });
    registerLeaderboardRoutes(
      missRouter.router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE,
      missFake.logic,
    );
    const missContext = makeMockContext({ replayHash: 'replay-missing' });
    await missRouter.routes[2].handler(missContext);
    assert.equal(missContext.status, 404);
    assert.deepEqual(missContext.body, { error: 'score_not_found' });
  });

  test('8 — Cache-Control: no-store is the FIRST statement in every handler (success + error paths) per Patch 8', async () => {
    // Success path on handler 1
    const successRouter = makeMockRouter();
    const successFake = makeFakeLogic({ scenarioKeys: ['core/midnight-attack'] });
    registerLeaderboardRoutes(
      successRouter.router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE,
      successFake.logic,
    );
    const successContext = makeMockContext();
    await successRouter.routes[0].handler(successContext);
    assert.equal(successContext.headerCalls.length, 1);
    assert.equal(successContext.headerCalls[0].field, 'Cache-Control');
    assert.equal(successContext.headerCalls[0].value, 'no-store');
    assert.equal(successContext.callOrder[0], 'set:Cache-Control');

    // Error path on handler 2 (400 from missing scenarioKey)
    const errorRouter = makeMockRouter();
    const errorFake = makeFakeLogic();
    registerLeaderboardRoutes(
      errorRouter.router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE,
      errorFake.logic,
    );
    const errorContext = makeMockContext({});
    await errorRouter.routes[1].handler(errorContext);
    assert.equal(errorContext.headerCalls.length, 1);
    assert.equal(errorContext.headerCalls[0].field, 'Cache-Control');
    assert.equal(errorContext.headerCalls[0].value, 'no-store');
    assert.equal(errorContext.callOrder[0], 'set:Cache-Control');
    assert.equal(errorContext.status, 400);

    // 500 path on handler 1 (simulated WP-054 throw → exception
    // path still leaves the header set per Patch 8)
    const throwRouter = makeMockRouter();
    const throwFake = makeFakeLogic({ throwOnListScenarioKeys: true });
    registerLeaderboardRoutes(
      throwRouter.router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE,
      throwFake.logic,
    );
    const throwContext = makeMockContext();
    await throwRouter.routes[0].handler(throwContext);
    assert.equal(throwContext.headerCalls.length, 1);
    assert.equal(throwContext.headerCalls[0].field, 'Cache-Control');
    assert.equal(throwContext.headerCalls[0].value, 'no-store');
    assert.equal(throwContext.callOrder[0], 'set:Cache-Control');
    assert.equal(throwContext.status, 500);
    assert.deepEqual(throwContext.body, { error: 'internal_error' });
  });

  test('9 — GET /api/leaderboards/themes/:themeId returns 200 with the theme leaderboard on hit', async () => {
    const { router, routes } = makeMockRouter();
    const { logic, calls } = makeFakeLogic({
      themeLeaderboard: SAMPLE_THEME_LEADERBOARD,
    });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );
    const koaContext = makeMockContext(
      { themeId: 'dark-reign' },
      { limit: '10', offset: '0' },
    );
    await routes[3].handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepEqual(koaContext.body, SAMPLE_THEME_LEADERBOARD);
    assert.equal(calls.getThemeLeaderboard, 1);
    assert.equal(calls.lastThemeIdRequested, 'dark-reign');
    // why: the load-bearing wiring assertion — both deps must reach
    // the logic call as the SAME references the wiring layer bound,
    // not the WP-054 PRODUCTION_DEPENDENCIES defaults.
    assert.equal(
      calls.lastDepsCheckParPublished,
      SENTINEL_PAR_GATE_WITH_THEME.checkParPublished,
    );
    assert.equal(
      calls.lastDepsGetScenarioKeysForTheme,
      SENTINEL_GET_SCENARIO_KEYS_FOR_THEME,
    );
  });

  test('10 — GET /api/leaderboards/themes/:themeId returns 404 theme_not_found on null logic return', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({ themeLeaderboard: null });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );
    const koaContext = makeMockContext({ themeId: 'no-such-theme' });
    await routes[3].handler(koaContext);
    assert.equal(koaContext.status, 404);
    assert.deepEqual(koaContext.body, { error: 'theme_not_found' });
  });

  test('11 — GET /api/leaderboards/themes/:themeId rejects missing path param + invalid pagination with 400 invalid_query', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({ themeLeaderboard: SAMPLE_THEME_LEADERBOARD });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );

    // (a) missing :themeId → 400
    const ctxMissing = makeMockContext({});
    await routes[3].handler(ctxMissing);
    assert.equal(ctxMissing.status, 400);
    assert.equal(
      (ctxMissing.body as { error: string }).error,
      'invalid_query',
    );
    assert.equal(
      (ctxMissing.body as { message: string }).message,
      'Theme id is required.',
    );

    // (b) limit=banana → 400
    const ctxBadLimit = makeMockContext(
      { themeId: 'dark-reign' },
      { limit: 'banana' },
    );
    await routes[3].handler(ctxBadLimit);
    assert.equal(ctxBadLimit.status, 400);
    assert.equal(
      (ctxBadLimit.body as { error: string }).error,
      'invalid_query',
    );

    // (c) offset=10001 → 400 (above max)
    const ctxBadOffset = makeMockContext(
      { themeId: 'dark-reign' },
      { offset: '10001' },
    );
    await routes[3].handler(ctxBadOffset);
    assert.equal(ctxBadOffset.status, 400);
    assert.equal(
      (ctxBadOffset.body as { error: string }).error,
      'invalid_query',
    );
  });

  test('12 — GET /api/leaderboards/themes/:themeId returns 500 internal_error on logic throw', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({ throwOnGetThemeLeaderboard: true });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );
    const koaContext = makeMockContext({ themeId: 'dark-reign' });
    await routes[3].handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepEqual(koaContext.body, { error: 'internal_error' });
    // Cache-Control still set despite throw (Patch 8 discipline).
    assert.equal(koaContext.headerCalls.length, 1);
    assert.equal(koaContext.headerCalls[0].field, 'Cache-Control');
    assert.equal(koaContext.headerCalls[0].value, 'no-store');
    assert.equal(koaContext.callOrder[0], 'set:Cache-Control');
  });

  test('13 — GET /api/leaderboards/top returns 200 with the global leaderboard on hit', async () => {
    const { router, routes } = makeMockRouter();
    const { logic, calls } = makeFakeLogic({
      globalLeaderboard: SAMPLE_GLOBAL_LEADERBOARD,
    });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );
    const koaContext = makeMockContext({}, { limit: '25', offset: '0' });
    await routes[4].handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepEqual(koaContext.body, SAMPLE_GLOBAL_LEADERBOARD);
    assert.equal(calls.getGlobalTopLeaderboard, 1);
    assert.equal(
      calls.lastDepsCheckParPublished,
      SENTINEL_PAR_GATE_WITH_THEME.checkParPublished,
    );
  });

  test('14 — GET /api/leaderboards/top returns 200 with empty entries when no PAR-published scenarios exist', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({
      globalLeaderboard: EMPTY_GLOBAL_LEADERBOARD,
    });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );
    const koaContext = makeMockContext();
    await routes[4].handler(koaContext);
    assert.equal(koaContext.status, 200);
    assert.deepEqual(koaContext.body, EMPTY_GLOBAL_LEADERBOARD);
  });

  test('15 — GET /api/leaderboards/top rejects invalid pagination with 400 invalid_query', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({
      globalLeaderboard: SAMPLE_GLOBAL_LEADERBOARD,
    });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );
    const koaContext = makeMockContext({}, { limit: '101' });
    await routes[4].handler(koaContext);
    assert.equal(koaContext.status, 400);
    assert.equal(
      (koaContext.body as { error: string }).error,
      'invalid_query',
    );
  });

  test('16 — GET /api/leaderboards/top returns 500 internal_error on logic throw with Cache-Control still set', async () => {
    const { router, routes } = makeMockRouter();
    const { logic } = makeFakeLogic({ throwOnGetGlobalTopLeaderboard: true });
    registerLeaderboardRoutes(
      router,
      SENTINEL_DATABASE,
      SENTINEL_PAR_GATE_WITH_THEME,
      logic,
    );
    const koaContext = makeMockContext();
    await routes[4].handler(koaContext);
    assert.equal(koaContext.status, 500);
    assert.deepEqual(koaContext.body, { error: 'internal_error' });
    assert.equal(koaContext.headerCalls.length, 1);
    assert.equal(koaContext.headerCalls[0].field, 'Cache-Control');
    assert.equal(koaContext.headerCalls[0].value, 'no-store');
    assert.equal(koaContext.callOrder[0], 'set:Cache-Control');
  });
});
