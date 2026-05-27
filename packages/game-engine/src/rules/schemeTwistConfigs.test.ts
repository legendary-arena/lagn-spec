/**
 * Drift tests for scheme twist config registry (WP-182 / EC-209).
 *
 * A: Every config's resolverId exists in SCHEME_TWIST_RESOLVERS.
 * B: Every config map key equals its config.schemeId.
 *
 * No boardgame.io imports. Uses node:test and node:assert only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEME_TWIST_CONFIGS } from './schemeTwistConfigs.js';
import { SCHEME_TWIST_RESOLVERS } from './schemeTwistResolvers.js';

describe('SCHEME_TWIST_CONFIGS drift tests', () => {
  it('drift test A: every resolverId in configs exists in the resolver registry', () => {
    for (const [mapKey, config] of SCHEME_TWIST_CONFIGS) {
      assert.ok(
        SCHEME_TWIST_RESOLVERS[config.resolverId] !== undefined,
        `Config "${mapKey}" references resolverId "${config.resolverId}" which does not exist in SCHEME_TWIST_RESOLVERS.`,
      );
    }
  });

  it('drift test B: every config map key equals its config.schemeId', () => {
    for (const [mapKey, config] of SCHEME_TWIST_CONFIGS) {
      assert.equal(
        mapKey,
        config.schemeId,
        `Map key "${mapKey}" does not match config.schemeId "${config.schemeId}".`,
      );
    }
  });

  it('config registry is non-empty', () => {
    assert.ok(SCHEME_TWIST_CONFIGS.size > 0, 'SCHEME_TWIST_CONFIGS must have at least one entry');
  });
});
