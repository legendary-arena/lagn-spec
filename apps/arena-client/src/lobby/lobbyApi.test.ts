import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createMatch, joinMatch, listMatches, serverUrl } from './lobbyApi';
import type { LobbyMatchSummary } from './lobbyApi';
import type { MatchSetupConfig } from '@legendary-arena/game-engine';
import { parseLoadoutJson } from './parseLoadoutJson';

// WP-254 (D-24025): qualified <setAbbr>/<slug> ext_ids. The
// parseLoadoutJson + createMatch block below routes this through the new lobby
// guard, which rejects bare slugs; migrating the VALUES keeps every assertion
// (here and in the WP-090 createMatch/listMatches block, which round-trips the
// same constant) byte-identical.
const SAMPLE_CONFIG: MatchSetupConfig = {
  schemeId: 'core/midtown-bank-robbery',
  mastermindId: 'core/magneto',
  villainGroupIds: ['core/brotherhood'],
  henchmanGroupIds: ['core/hand-ninjas'],
  heroDeckIds: [
    'core/spider-man',
    'core/hulk',
    'core/wolverine',
    'core/black-widow',
  ],
  bystandersCount: 1,
  woundsCount: 30,
  officersCount: 5,
  sidekicksCount: 12,
};

interface StubbedCall {
  url: string;
  init: RequestInit | undefined;
}

let originalFetch: typeof globalThis.fetch | undefined;
let calls: StubbedCall[];

function installFetchStub(
  responder: (url: string, init: RequestInit | undefined) => Response,
): void {
  calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    return responder(url, init);
  }) as typeof globalThis.fetch;
}

function restoreFetch(): void {
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

describe('lobbyApi (WP-090)', () => {
  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    restoreFetch();
  });

  test('createMatch POSTs { numPlayers, setupData } to /games/legendary-arena/create and returns matchID', async () => {
    installFetchStub(() => jsonResponse(200, { matchID: 'match-abc' }));
    const result = await createMatch(SAMPLE_CONFIG, 2);

    assert.equal(result.matchID, 'match-abc');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${serverUrl}/games/legendary-arena/create`);
    assert.equal(calls[0]!.init?.method, 'POST');

    const bodyText = String(calls[0]!.init?.body);
    const parsed = JSON.parse(bodyText) as {
      numPlayers: number;
      setupData: MatchSetupConfig;
    };
    assert.equal(parsed.numPlayers, 2);
    assert.deepEqual(parsed.setupData, SAMPLE_CONFIG);
  });

  test('listMatches parses raw response and normalizes player ids to strings, open seats as name-less', async () => {
    installFetchStub(() =>
      jsonResponse(200, {
        matches: [
          {
            gameName: 'legendary-arena',
            unlisted: false,
            players: [
              { id: 0, name: 'Alice' },
              { id: 1 },
            ],
            setupData: SAMPLE_CONFIG,
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
            matchID: 'match-1',
          },
          {
            gameName: 'legendary-arena',
            unlisted: false,
            players: [{ id: 0 }, { id: 1 }],
            matchID: 'match-2',
            gameover: { winner: '0' },
          },
        ],
      }),
    );

    const summaries: LobbyMatchSummary[] = await listMatches();

    assert.equal(calls[0]!.url, `${serverUrl}/games/legendary-arena`);
    assert.equal(summaries.length, 2);

    assert.equal(summaries[0]!.matchID, 'match-1');
    assert.equal(summaries[0]!.players.length, 2);
    assert.deepEqual(summaries[0]!.players[0], { id: '0', name: 'Alice' });
    // why: an open seat arrives with no `name` key. The mapping must not
    // fabricate a `name: undefined` property either — exact-shape assertion.
    assert.deepEqual(summaries[0]!.players[1], { id: '1' });
    assert.deepEqual(summaries[0]!.setupData, SAMPLE_CONFIG);
    assert.equal(summaries[0]!.gameover, null);

    assert.equal(summaries[1]!.matchID, 'match-2');
    assert.equal(summaries[1]!.setupData, null);
    assert.deepEqual(summaries[1]!.gameover, { winner: '0' });
  });

  test('joinMatch POSTs { playerID, playerName } and returns playerCredentials', async () => {
    installFetchStub(() =>
      jsonResponse(200, {
        playerID: '0',
        playerCredentials: 'secret-xyz',
      }),
    );

    const result = await joinMatch('match-abc', '0', 'Tester');
    assert.equal(result.playerCredentials, 'secret-xyz');
    assert.equal(
      calls[0]!.url,
      `${serverUrl}/games/legendary-arena/match-abc/join`,
    );
    assert.equal(calls[0]!.init?.method, 'POST');

    const parsed = JSON.parse(String(calls[0]!.init?.body)) as {
      playerID: string;
      playerName: string;
    };
    assert.equal(parsed.playerID, '0');
    assert.equal(parsed.playerName, 'Tester');
  });

  test('each helper throws a full-sentence Error on HTTP 500 including endpoint and status', async () => {
    installFetchStub(() => textResponse(500, 'internal boom'));

    await assert.rejects(
      () => createMatch(SAMPLE_CONFIG, 2),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Failed to create match/);
        assert.match(error.message, /HTTP 500/);
        assert.match(error.message, /\/games\/legendary-arena\/create/);
        return true;
      },
    );

    await assert.rejects(
      () => listMatches(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Failed to list matches/);
        assert.match(error.message, /HTTP 500/);
        return true;
      },
    );

    await assert.rejects(
      () => joinMatch('match-abc', '0', 'Tester'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Failed to join match match-abc/);
        assert.match(error.message, /HTTP 500/);
        return true;
      },
    );
  });
});

// why: WP-092 scope-guard regression. Verifies the end-to-end shape mapping
// produced by composing parseLoadoutJson + createMatch — specifically that
// a valid MATCH-SETUP JSON document round-trips through the parser and into
// a wire body of `{ numPlayers: <envelope.playerCount>, setupData:
// <composition> }`, with envelope-only fields (setupId, createdAt, seed,
// themeId, expansions, schemaVersion, heroSelectionMode) dropped on
// submission per D-9201 (envelope archival is a future server-side WP).
// Pre-existing WP-090 tests above are unmodified.
describe('parseLoadoutJson + createMatch (WP-092)', () => {
  beforeEach(() => {
    calls = [];
  });

  afterEach(() => {
    restoreFetch();
  });

  test('valid loadout JSON parses and createMatch posts only { numPlayers, setupData: composition } — envelope extras are dropped', async () => {
    const loadoutJson = JSON.stringify({
      schemaVersion: '1.0',
      setupId: 'setup-xyz',
      createdAt: '2026-04-24T00:00:00Z',
      createdBy: 'tester',
      seed: 12345,
      themeId: 'theme-default',
      expansions: ['core'],
      playerCount: 2,
      heroSelectionMode: 'GROUP_STANDARD',
      composition: SAMPLE_CONFIG,
    });

    const parsed = parseLoadoutJson(loadoutJson);
    assert.equal(parsed.ok, true);
    if (parsed.ok !== true) {
      return;
    }
    assert.equal(parsed.value.playerCount, 2);
    assert.equal(parsed.value.heroSelectionMode, 'GROUP_STANDARD');
    assert.deepEqual(parsed.value.composition, SAMPLE_CONFIG);

    installFetchStub(() => jsonResponse(200, { matchID: 'match-from-json' }));
    const created = await createMatch(
      parsed.value.composition,
      parsed.value.playerCount,
    );

    assert.equal(created.matchID, 'match-from-json');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, `${serverUrl}/games/legendary-arena/create`);
    assert.equal(calls[0]!.init?.method, 'POST');

    const bodyText = String(calls[0]!.init?.body);
    const wireBody = JSON.parse(bodyText) as Record<string, unknown>;

    // Wire body shape lock: exactly two top-level keys.
    assert.deepEqual(Object.keys(wireBody).sort(), [
      'numPlayers',
      'setupData',
    ]);
    assert.equal(wireBody['numPlayers'], 2);
    assert.deepEqual(wireBody['setupData'], SAMPLE_CONFIG);

    // Envelope-only fields must NOT appear in the wire body.
    const droppedFields = [
      'schemaVersion',
      'setupId',
      'createdAt',
      'createdBy',
      'seed',
      'themeId',
      'expansions',
      'heroSelectionMode',
      'playerCount',
      'composition',
    ];
    for (const droppedField of droppedFields) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(wireBody, droppedField),
        false,
        `wire body must not include envelope field "${droppedField}"`,
      );
    }
  });

  test('valid loadout JSON with absent heroSelectionMode submits unchanged (default normalization happens in parser, never on the wire)', async () => {
    const loadoutJson = JSON.stringify({
      schemaVersion: '1.0',
      playerCount: 3,
      composition: SAMPLE_CONFIG,
    });

    const parsed = parseLoadoutJson(loadoutJson);
    assert.equal(parsed.ok, true);
    if (parsed.ok !== true) {
      return;
    }
    assert.equal(parsed.value.heroSelectionMode, 'GROUP_STANDARD');

    installFetchStub(() => jsonResponse(200, { matchID: 'match-default-mode' }));
    const created = await createMatch(
      parsed.value.composition,
      parsed.value.playerCount,
    );

    assert.equal(created.matchID, 'match-default-mode');
    const bodyText = String(calls[0]!.init?.body);
    const wireBody = JSON.parse(bodyText) as {
      numPlayers: number;
      setupData: MatchSetupConfig;
    };
    assert.equal(wireBody.numPlayers, 3);
    assert.deepEqual(wireBody.setupData, SAMPLE_CONFIG);
  });
});
