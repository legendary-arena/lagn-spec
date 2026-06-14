import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { convertLagnUpload } from './lagnLoadout';
import { parseLoadoutJson } from './parseLoadoutJson';

/**
 * Builds a minimally-valid LAGN Tier-1 document (WP-244). Entity ids use the
 * set-qualified form the Registry Viewer now exports (D-24018). Names are
 * present so the display-name path is exercised; a separate test covers the
 * id-fallback when names are absent.
 */
function buildValidLagn(
  override: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    lagn_version: '1.0.0',
    game_id: '11111111-1111-4111-8111-111111111111',
    variant: 'solo',
    player_count: 1,
    setup: {
      mastermind: { id: 'core/magneto', name: 'Magneto' },
      scheme: { id: 'core/midtown-bank-robbery', name: 'Midtown Bank Robbery' },
      villain_groups: [{ id: 'core/brotherhood', name: 'Brotherhood' }],
      henchmen_groups: [{ id: 'core/sentinel', name: 'Sentinel' }],
      heroes: [
        { id: 'core/spider-man', name: 'Spider-Man' },
        { id: 'core/black-widow', name: 'Black Widow' },
      ],
      bystanders_count: 1,
      wounds_count: 30,
      shield_officers_count: 5,
      sidekicks_count: 12,
    },
    ...override,
  };
}

describe('convertLagnUpload (D-24018)', () => {
  test('converts a valid LAGN file to a composition document with display names', () => {
    const result = convertLagnUpload(JSON.stringify(buildValidLagn()));
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') {
      return;
    }
    assert.deepEqual(result.displayNames, {
      mastermind: 'Magneto',
      scheme: 'Midtown Bank Robbery',
      villainGroups: ['Brotherhood'],
      henchmanGroups: ['Sentinel'],
      heroes: ['Spider-Man', 'Black Widow'],
    });
    const document = JSON.parse(result.documentJson);
    assert.deepEqual(document.composition, {
      schemeId: 'core/midtown-bank-robbery',
      mastermindId: 'core/magneto',
      villainGroupIds: ['core/brotherhood'],
      henchmanGroupIds: ['core/sentinel'],
      heroDeckIds: ['core/spider-man', 'core/black-widow'],
      bystandersCount: 1,
      woundsCount: 30,
      officersCount: 5,
      sidekicksCount: 12,
    });
    assert.equal(document.playerCount, 1);
  });

  test('the converted document passes parseLoadoutJson end to end', () => {
    const result = convertLagnUpload(JSON.stringify(buildValidLagn()));
    assert.equal(result.kind, 'ok');
    if (result.kind !== 'ok') {
      return;
    }
    const parsed = parseLoadoutJson(result.documentJson);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.composition.mastermindId, 'core/magneto');
      assert.equal(parsed.value.playerCount, 1);
    }
  });

  test('falls back to the id when an entity name is absent', () => {
    const lagn = buildValidLagn();
    (lagn.setup as Record<string, unknown>).mastermind = { id: 'core/loki' };
    const result = convertLagnUpload(JSON.stringify(lagn));
    assert.equal(result.kind, 'ok');
    if (result.kind === 'ok') {
      assert.equal(result.displayNames.mastermind, 'core/loki');
    }
  });

  test('returns not_lagn for a MATCH-SETUP composition document', () => {
    const matchSetup = {
      schemaVersion: '1.0',
      playerCount: 1,
      composition: { schemeId: 'core/midtown-bank-robbery' },
    };
    const result = convertLagnUpload(JSON.stringify(matchSetup));
    assert.equal(result.kind, 'not_lagn');
  });

  test('returns not_lagn for malformed JSON (MATCH-SETUP path owns invalid_json)', () => {
    const result = convertLagnUpload('{ not json');
    assert.equal(result.kind, 'not_lagn');
  });

  test('returns not_lagn when setup is absent (not recognized as a LAGN file)', () => {
    const lagn = buildValidLagn();
    delete lagn.setup;
    const result = convertLagnUpload(JSON.stringify(lagn));
    assert.equal(result.kind, 'not_lagn');
  });

  test('returns error when setup is present but not an object', () => {
    const result = convertLagnUpload(
      JSON.stringify({ lagn_version: '1.0.0', setup: 'nope' }),
    );
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.match(result.message, /setup/);
    }
  });

  test('returns error when a required entity array is empty', () => {
    const lagn = buildValidLagn();
    (lagn.setup as Record<string, unknown>).heroes = [];
    const result = convertLagnUpload(JSON.stringify(lagn));
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.match(result.message, /heroes/);
    }
  });

  test('returns error when the mastermind id is missing', () => {
    const lagn = buildValidLagn();
    (lagn.setup as Record<string, unknown>).mastermind = { name: 'No Id' };
    const result = convertLagnUpload(JSON.stringify(lagn));
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.match(result.message, /mastermind|scheme/);
    }
  });

  test('returns error when a count is negative or non-integer', () => {
    const lagn = buildValidLagn();
    (lagn.setup as Record<string, unknown>).wounds_count = -1;
    const result = convertLagnUpload(JSON.stringify(lagn));
    assert.equal(result.kind, 'error');
    if (result.kind === 'error') {
      assert.match(result.message, /count/);
    }
  });
});
