import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSkinName, isSkinName, SKIN_NAMES, DEFAULT_SKIN_NAME } from './playmatSchema';
import { skinManifest, type SkinName } from './skinManifest';

describe('WP-130 prefs/playmatSchema', () => {
  test('SKIN_NAMES exactly equals Object.keys(skinManifest) (drift detection)', () => {
    const schemaKeys = SKIN_NAMES.slice().sort();
    const manifestKeys = (Object.keys(skinManifest) as SkinName[]).slice().sort();
    assert.deepEqual(
      schemaKeys,
      manifestKeys,
      'SkinName closed set drifted from skinManifest keys; re-derive SKIN_NAMES from Object.keys(skinManifest) per WP-130 §A canonical-source rule.',
    );
  });

  test('SKIN_NAMES contains the D-13003 locked bundled set', () => {
    const sorted = SKIN_NAMES.slice().sort();
    assert.deepEqual(sorted, ['classic', 'comic', 'minimal']);
  });

  test('DEFAULT_SKIN_NAME equals the WP-130 locked default value', () => {
    assert.equal(DEFAULT_SKIN_NAME, 'classic');
  });

  test('isSkinName accepts every name in the closed set', () => {
    for (const name of SKIN_NAMES) {
      assert.equal(isSkinName(name), true, `expected ${name} to narrow to SkinName`);
    }
  });

  test('isSkinName rejects unknown names, non-strings, and falsy values', () => {
    assert.equal(isSkinName('not-a-skin'), false);
    assert.equal(isSkinName(''), false);
    assert.equal(isSkinName(null), false);
    assert.equal(isSkinName(undefined), false);
    assert.equal(isSkinName(42), false);
    assert.equal(isSkinName({}), false);
    assert.equal(isSkinName(['classic']), false);
  });

  test('parseSkinName falls back to DEFAULT_SKIN_NAME for any rejected input', () => {
    const originalWarn = console.warn;
    let warnCount = 0;
    console.warn = () => {
      warnCount += 1;
    };
    try {
      assert.equal(parseSkinName('totally-unknown'), DEFAULT_SKIN_NAME);
      assert.equal(parseSkinName(null), DEFAULT_SKIN_NAME);
      assert.equal(parseSkinName(undefined), DEFAULT_SKIN_NAME);
      assert.equal(parseSkinName(123), DEFAULT_SKIN_NAME);
      assert.equal(warnCount, 4, 'expected one console.warn per rejected input');
    } finally {
      console.warn = originalWarn;
    }
  });

  test('parseSkinName returns the supplied value when it is in the closed set', () => {
    for (const name of SKIN_NAMES) {
      assert.equal(parseSkinName(name), name);
    }
  });
});
