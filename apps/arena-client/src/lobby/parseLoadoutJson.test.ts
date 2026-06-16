import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseLoadoutJson,
  renderUnsupportedModeMessage,
  UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE,
} from './parseLoadoutJson';

interface ValidCompositionFixture {
  schemeId: string;
  mastermindId: string;
  villainGroupIds: string[];
  henchmanGroupIds: string[];
  heroDeckIds: string[];
  bystandersCount: number;
  woundsCount: number;
  officersCount: number;
  sidekicksCount: number;
}

// WP-254 (D-24025): the lobby qualified-form guard rejects bare-slug ids, so
// these fixtures use set-qualified <setAbbr>/<slug> ext_ids (the form a real
// post-D-24018 Registry Viewer export produces). Migrating the VALUES leaves
// every WP-092 assertion below byte-identical; the grammar guard is satisfied.
const VALID_COMPOSITION: ValidCompositionFixture = {
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

function buildValidDocument(
  override: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    playerCount: 2,
    heroSelectionMode: 'GROUP_STANDARD',
    composition: { ...VALID_COMPOSITION },
    ...override,
  };
}

describe('parseLoadoutJson (WP-092)', () => {
  test('returns ok for a valid minimal document and round-trips composition fields', () => {
    const json = JSON.stringify(buildValidDocument());
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, true);
    if (result.ok !== true) {
      return;
    }
    assert.deepEqual(result.value.composition, VALID_COMPOSITION);
    assert.equal(result.value.playerCount, 2);
    assert.equal(result.value.heroSelectionMode, 'GROUP_STANDARD');
  });

  test('returns ok for a document with multiple entries per array', () => {
    const json = JSON.stringify(
      buildValidDocument({
        composition: {
          ...VALID_COMPOSITION,
          villainGroupIds: ['core/villains-a', 'core/villains-b', 'core/villains-c'],
          henchmanGroupIds: ['core/henchmen-a', 'core/henchmen-b'],
          heroDeckIds: [
            'core/hero-1',
            'core/hero-2',
            'core/hero-3',
            'core/hero-4',
            'core/hero-5',
          ],
        },
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, true);
    if (result.ok !== true) {
      return;
    }
    assert.equal(result.value.composition.villainGroupIds.length, 3);
    assert.equal(result.value.composition.heroDeckIds.length, 5);
  });

  test('is permissive on extra envelope fields and drops them from output', () => {
    const json = JSON.stringify(
      buildValidDocument({
        setupId: 'setup-abc',
        createdAt: '2026-04-24T00:00:00Z',
        createdBy: 'tester',
        seed: 12345,
        themeId: 'theme-default',
        expansions: ['core', 'darkcity'],
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, true);
    if (result.ok !== true) {
      return;
    }
    assert.deepEqual(result.value.composition, VALID_COMPOSITION);
    assert.equal(result.value.playerCount, 2);
    assert.equal(result.value.heroSelectionMode, 'GROUP_STANDARD');
    // The output ParsedLoadout has exactly three top-level keys; the
    // envelope extras must not leak through.
    const topKeys = Object.keys(result.value).sort();
    assert.deepEqual(topKeys, [
      'composition',
      'heroSelectionMode',
      'playerCount',
    ]);
  });

  test('returns ok with explicit "GROUP_STANDARD" heroSelectionMode', () => {
    const json = JSON.stringify(
      buildValidDocument({ heroSelectionMode: 'GROUP_STANDARD' }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, true);
    if (result.ok !== true) {
      return;
    }
    assert.equal(result.value.heroSelectionMode, 'GROUP_STANDARD');
  });

  test('materializes "GROUP_STANDARD" when heroSelectionMode is absent (single-site default normalization)', () => {
    const document = buildValidDocument();
    delete document['heroSelectionMode'];
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, true);
    if (result.ok !== true) {
      return;
    }
    assert.equal(result.value.heroSelectionMode, 'GROUP_STANDARD');
  });

  test('returns invalid_json for malformed JSON input', () => {
    const result = parseLoadoutJson('{ not valid json');

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'invalid_json');
    assert.match(result.error.message, /JSON\.parse reported:/);
    assert.match(result.error.message, /Registry Viewer loadout builder/);
    assert.strictEqual(result.error.field, undefined);
  });

  test('returns not_object when the root is an array', () => {
    const result = parseLoadoutJson('[]');

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'not_object');
    assert.strictEqual(result.error.field, undefined);
    assert.match(result.error.message, /must be a JSON object at its root/);
  });

  test('returns not_object when the root is a number', () => {
    const result = parseLoadoutJson('42');

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'not_object');
    assert.strictEqual(result.error.field, undefined);
  });

  test('returns not_object when the root is null', () => {
    const result = parseLoadoutJson('null');

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'not_object');
    assert.strictEqual(result.error.field, undefined);
  });

  test('returns missing_composition when the composition key is absent', () => {
    const document = buildValidDocument();
    delete (document as Record<string, unknown>)['composition'];
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'missing_composition');
    assert.strictEqual(result.error.field, undefined);
    assert.match(result.error.message, /composition.*is mandatory/);
  });

  test('returns composition_not_object when composition is null', () => {
    const result = parseLoadoutJson(
      JSON.stringify({ ...buildValidDocument(), composition: null }),
    );

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'composition_not_object');
    assert.strictEqual(result.error.field, undefined);
  });

  test('returns composition_not_object when composition is a string', () => {
    const result = parseLoadoutJson(
      JSON.stringify({ ...buildValidDocument(), composition: 'oops' }),
    );

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'composition_not_object');
    assert.strictEqual(result.error.field, undefined);
  });

  test('returns missing_field with dot-path field for each absent composition field', () => {
    const fields: Array<keyof ValidCompositionFixture> = [
      'schemeId',
      'mastermindId',
      'villainGroupIds',
      'henchmanGroupIds',
      'heroDeckIds',
      'bystandersCount',
      'woundsCount',
      'officersCount',
      'sidekicksCount',
    ];
    for (const fieldName of fields) {
      const composition: Record<string, unknown> = { ...VALID_COMPOSITION };
      delete composition[fieldName];
      const document = { ...buildValidDocument(), composition };
      const result = parseLoadoutJson(JSON.stringify(document));

      assert.equal(result.ok, false, `expected ok=false for missing ${fieldName}`);
      if (result.ok !== false) {
        return;
      }
      assert.equal(result.error.code, 'missing_field');
      assert.strictEqual(result.error.field, `composition.${fieldName}`);
      assert.match(result.error.message, /Re-export the document/);
    }
  });

  test('returns wrong_type with dot-path field when schemeId is a number', () => {
    const document = {
      ...buildValidDocument(),
      composition: { ...VALID_COMPOSITION, schemeId: 42 },
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'wrong_type');
    assert.strictEqual(result.error.field, 'composition.schemeId');
    assert.match(result.error.message, /must be a string ext_id/);
  });

  test('returns wrong_type when bystandersCount is a string', () => {
    const document = {
      ...buildValidDocument(),
      composition: { ...VALID_COMPOSITION, bystandersCount: 'one' },
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'wrong_type');
    assert.strictEqual(result.error.field, 'composition.bystandersCount');
    assert.match(result.error.message, /must be a non-negative integer/);
  });

  test('returns wrong_type when villainGroupIds is not an array', () => {
    const document = {
      ...buildValidDocument(),
      composition: { ...VALID_COMPOSITION, villainGroupIds: 'villains-x' },
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'wrong_type');
    assert.strictEqual(result.error.field, 'composition.villainGroupIds');
    assert.match(
      result.error.message,
      /must be an array of non-empty string ext_ids/,
    );
  });

  test('returns wrong_type when heroDeckIds contains a non-string entry', () => {
    const document = {
      ...buildValidDocument(),
      composition: {
        ...VALID_COMPOSITION,
        heroDeckIds: ['hero-spider-man', 99, 'hero-wolverine', 'hero-storm'],
      },
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'wrong_type');
    assert.strictEqual(result.error.field, 'composition.heroDeckIds');
  });

  test('returns wrong_type when bystandersCount is 3.5 (non-integer)', () => {
    const document = {
      ...buildValidDocument(),
      composition: { ...VALID_COMPOSITION, bystandersCount: 3.5 },
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'wrong_type');
    assert.strictEqual(result.error.field, 'composition.bystandersCount');
  });

  test('returns wrong_type when bystandersCount is -1 (negative)', () => {
    const document = {
      ...buildValidDocument(),
      composition: { ...VALID_COMPOSITION, bystandersCount: -1 },
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'wrong_type');
    assert.strictEqual(result.error.field, 'composition.bystandersCount');
  });

  test('returns missing_player_count when playerCount is absent', () => {
    const document = buildValidDocument();
    delete (document as Record<string, unknown>)['playerCount'];
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'missing_player_count');
    assert.strictEqual(result.error.field, 'playerCount');
    assert.match(result.error.message, /1\.\.5/);
  });

  test('returns missing_player_count when playerCount is not an integer', () => {
    const document = { ...buildValidDocument(), playerCount: 2.5 };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'missing_player_count');
    assert.strictEqual(result.error.field, 'playerCount');
  });

  test('returns player_count_out_of_range when playerCount is 0', () => {
    const document = { ...buildValidDocument(), playerCount: 0 };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'player_count_out_of_range');
    assert.strictEqual(result.error.field, 'playerCount');
    assert.match(result.error.message, /Received 0/);
  });

  test('returns player_count_out_of_range when playerCount is 6', () => {
    const document = { ...buildValidDocument(), playerCount: 6 };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'player_count_out_of_range');
    assert.strictEqual(result.error.field, 'playerCount');
    assert.match(result.error.message, /Received 6/);
  });

  test('rejects heroSelectionMode "HERO_DRAFT" with byte-for-byte WP-093 message', () => {
    const document = { ...buildValidDocument(), heroSelectionMode: 'HERO_DRAFT' };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unsupported_hero_selection_mode');
    assert.strictEqual(result.error.field, 'heroSelectionMode');
    assert.strictEqual(
      result.error.message,
      renderUnsupportedModeMessage('HERO_DRAFT'),
    );
  });

  test('rejects heroSelectionMode "MADE_UP" with byte-for-byte WP-093 message', () => {
    const document = { ...buildValidDocument(), heroSelectionMode: 'MADE_UP' };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unsupported_hero_selection_mode');
    assert.strictEqual(result.error.field, 'heroSelectionMode');
    assert.strictEqual(
      result.error.message,
      renderUnsupportedModeMessage('MADE_UP'),
    );
  });

  test('rejects numeric heroSelectionMode 42 with byte-for-byte WP-093 message', () => {
    const document = { ...buildValidDocument(), heroSelectionMode: 42 };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unsupported_hero_selection_mode');
    assert.strictEqual(result.error.field, 'heroSelectionMode');
    assert.strictEqual(
      result.error.message,
      renderUnsupportedModeMessage(42),
    );
  });

  test('renderUnsupportedModeMessage substitutes <value> exactly once and never paraphrases', () => {
    const rendered = renderUnsupportedModeMessage('HERO_DRAFT');
    assert.strictEqual(
      rendered,
      UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE.replace('<value>', 'HERO_DRAFT'),
    );
    // The template's reserved-future note still mentions HERO_DRAFT once
    // (verbatim from D-9301); the rendered message therefore mentions the
    // bad value plus the unchanged note. No paraphrasing of the template.
    assert.match(rendered, /heroSelectionMode is HERO_DRAFT/);
    assert.match(
      rendered,
      /HERO_DRAFT is reserved for a future release and is not yet implemented/,
    );
  });

  test('compound failure: HERO_DRAFT alongside ignored envelope extras still surfaces exactly one unsupported_hero_selection_mode error byte-identically', () => {
    // Mirror of WP-091 test #7 / L11 precedent (single-template-constant
    // discipline). Even though WP-092 is hand-rolled and stops at the
    // first failure, the discipline carries over: a document with bad
    // rule mode plus other envelope fields the parser permissively
    // ignores must surface the locked WP-093 message verbatim, not a
    // composite or paraphrased message.
    const document = {
      ...buildValidDocument({
        heroSelectionMode: 'HERO_DRAFT',
        setupId: 'setup-99',
        createdAt: '2026-04-24T00:00:00Z',
        seed: 7,
        themeId: 'theme-default',
        expansions: ['core'],
      }),
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unsupported_hero_selection_mode');
    assert.strictEqual(result.error.field, 'heroSelectionMode');
    assert.strictEqual(
      result.error.message,
      renderUnsupportedModeMessage('HERO_DRAFT'),
    );
  });

  test('compound failure: HERO_DRAFT plus playerCount=99 surfaces playerCount error per documented order (single-error parser)', () => {
    // The parser checks playerCount before heroSelectionMode (WP-092
    // §Scope A bullet 5 steps 6→7→8). When both are bad, the first
    // failure wins. This documents the locked order; the
    // `unsupported_hero_selection_mode` path is exercised by the prior
    // tests where playerCount is valid.
    const document = {
      ...buildValidDocument({
        playerCount: 99,
        heroSelectionMode: 'HERO_DRAFT',
      }),
    };
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'player_count_out_of_range');
  });

  test('never throws on arbitrary garbage input', () => {
    const garbageInputs: string[] = [
      '',
      '[',
      ']',
      '{',
      '}',
      'null',
      '"a string"',
      'true',
      'false',
      '\\',
      '\u0000',
      '   ',
      '{"composition": {"schemeId": {"nested": "object"}}}',
      JSON.stringify({ composition: { schemeId: ['a'] } }),
    ];
    // Plus a 100KB random-ish string (parser must remain pure).
    let large = '';
    for (let i = 0; i < 100000; i = i + 1) {
      large = `${large}x`;
    }
    garbageInputs.push(large);
    garbageInputs.push(`"${large}"`);

    for (const input of garbageInputs) {
      const result = parseLoadoutJson(input);
      assert.equal(
        result.ok,
        false,
        `expected ok=false for input length ${input.length}`,
      );
    }
  });
});

// WP-254 (D-24025): renderUnqualifiedExtIdMessage is module-private, so the
// expected message is rebuilt here from the same template and asserted in full
// (strictEqual, never substring / .includes).
function expectedUnqualifiedExtIdMessage(field: string, value: string): string {
  return `The loadout field "${field}" value "${value}" is not a set-qualified ext_id of the form "<setAbbr>/<slug>" (for example, "core/black-widow"). This usually means the loadout was exported before the qualified-ext_id fix; re-export it from the Registry Viewer loadout builder at cards.barefootbetters.com.`;
}

describe('parseLoadoutJson qualified-form guard (WP-254)', () => {
  test('rejects a flat-card-key schemeId with the full unqualified_ext_id message', () => {
    const json = JSON.stringify(
      buildValidDocument({
        composition: {
          ...VALID_COMPOSITION,
          schemeId: 'core-scheme-midtown-bank-robbery',
        },
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unqualified_ext_id');
    assert.strictEqual(result.error.field, 'composition.schemeId');
    assert.strictEqual(
      result.error.message,
      expectedUnqualifiedExtIdMessage(
        'composition.schemeId',
        'core-scheme-midtown-bank-robbery',
      ),
    );
  });

  test('rejects a bare-slug mastermindId', () => {
    const json = JSON.stringify(
      buildValidDocument({
        composition: { ...VALID_COMPOSITION, mastermindId: 'magneto' },
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unqualified_ext_id');
    assert.strictEqual(result.error.field, 'composition.mastermindId');
    assert.strictEqual(
      result.error.message,
      expectedUnqualifiedExtIdMessage('composition.mastermindId', 'magneto'),
    );
  });

  test('rejects a flat-key heroDeckIds entry with bracket-notation field at its index', () => {
    const json = JSON.stringify(
      buildValidDocument({
        composition: {
          ...VALID_COMPOSITION,
          heroDeckIds: [
            'core/spider-man',
            'core/hulk',
            'hero-wolverine',
            'core/black-widow',
          ],
        },
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unqualified_ext_id');
    assert.strictEqual(result.error.field, 'composition.heroDeckIds[2]');
    assert.strictEqual(
      result.error.message,
      expectedUnqualifiedExtIdMessage(
        'composition.heroDeckIds[2]',
        'hero-wolverine',
      ),
    );
  });

  test('rejects each edge-envelope failure (empty setAbbr, empty slug, multiple slashes, surrounding whitespace)', () => {
    const badValues = [
      '/black-widow',
      'core/',
      'core/x/y',
      ' core/x',
      'core/x ',
    ];
    for (const badValue of badValues) {
      const json = JSON.stringify(
        buildValidDocument({
          composition: { ...VALID_COMPOSITION, schemeId: badValue },
        }),
      );
      const result = parseLoadoutJson(json);

      assert.equal(
        result.ok,
        false,
        `expected ok=false for schemeId "${badValue}"`,
      );
      if (result.ok !== false) {
        return;
      }
      assert.equal(result.error.code, 'unqualified_ext_id');
      assert.strictEqual(result.error.field, 'composition.schemeId');
      assert.strictEqual(
        result.error.message,
        expectedUnqualifiedExtIdMessage('composition.schemeId', badValue),
      );
    }
  });

  test('accepts a fully-qualified document (no false rejection of engine-valid ids)', () => {
    const json = JSON.stringify(
      buildValidDocument({
        composition: {
          schemeId: 'core/midtown-bank-robbery',
          mastermindId: 'core/magneto',
          villainGroupIds: ['core/skrulls'],
          henchmanGroupIds: ['core/sentinel'],
          heroDeckIds: ['core/thor', 'core/black-widow'],
          bystandersCount: 1,
          woundsCount: 30,
          officersCount: 5,
          sidekicksCount: 12,
        },
        playerCount: 2,
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, true);
  });

  test('regression: an unrelated WP-092 failure still returns its original code (the new pass is additive)', () => {
    const document = buildValidDocument();
    delete (document['composition'] as Record<string, unknown>)['schemeId'];
    const result = parseLoadoutJson(JSON.stringify(document));

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'missing_field');
    assert.strictEqual(result.error.field, 'composition.schemeId');
  });

  test('type-precedence: a non-string schemeId returns wrong_type, never unqualified_ext_id', () => {
    const json = JSON.stringify(
      buildValidDocument({
        composition: { ...VALID_COMPOSITION, schemeId: 42 },
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'wrong_type');
    assert.strictEqual(result.error.field, 'composition.schemeId');
  });

  test('cross-field first-offender: villainGroupIds[1] is reported before heroDeckIds[0]', () => {
    const json = JSON.stringify(
      buildValidDocument({
        composition: {
          ...VALID_COMPOSITION,
          villainGroupIds: ['core/brotherhood', 'villains-bad'],
          heroDeckIds: ['hero-bad', 'core/hulk'],
        },
      }),
    );
    const result = parseLoadoutJson(json);

    assert.equal(result.ok, false);
    if (result.ok !== false) {
      return;
    }
    assert.equal(result.error.code, 'unqualified_ext_id');
    assert.strictEqual(result.error.field, 'composition.villainGroupIds[1]');
  });
});
