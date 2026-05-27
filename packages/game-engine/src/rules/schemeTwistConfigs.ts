/**
 * Scheme twist configuration registry for the Legendary Arena game engine.
 *
 * Maps scheme ext_ids to their SchemeTwistConfig entries. The dispatcher
 * looks up the active scheme's config to route to the correct resolver.
 *
 * Core-set coverage (v1): 5 of 8 schemes. The remaining 3 require new
 * resolvers in future WPs:
 * - core/portals-to-the-dark-dimension (dark dimension pile)
 * - core/replace-earths-leaders-with-killbots (leader replacement)
 * - core/secret-invasion-of-the-skrull-shapeshifters (HQ-to-City hero
 *   conversion — verified twist text does not match reveal-or-punish)
 *
 * No boardgame.io imports. No registry imports.
 */

import type { SchemeTwistConfig } from './schemeTwistConfig.types.js';

/**
 * Scheme twist config entries keyed by scheme ext_id.
 */
export const SCHEME_TWIST_CONFIGS: Map<string, SchemeTwistConfig> = new Map([
  [
    'core/midtown-bank-robbery',
    {
      schemeId: 'core/midtown-bank-robbery',
      resolverId: 'midtown-bank-robbery',
      params: {},
    },
  ],
  [
    'core/legacy-virus-the',
    {
      schemeId: 'core/legacy-virus-the',
      resolverId: 'reveal-or-punish',
      params: {
        condition: { field: 'heroClass', value: 'tech' },
        penalty: 'gainWound',
      },
    },
  ],
  [
    'core/negative-zone-prison-breakout',
    {
      schemeId: 'core/negative-zone-prison-breakout',
      resolverId: 'chained-reveals',
      params: { revealCount: 2 },
    },
  ],
  [
    'core/unleash-the-power-of-the-cosmic-cube',
    {
      schemeId: 'core/unleash-the-power-of-the-cosmic-cube',
      resolverId: 'wound-all',
      params: { woundCount: 1 },
    },
  ],
  [
    'core/super-hero-civil-war',
    {
      schemeId: 'core/super-hero-civil-war',
      resolverId: 'ko-from-hq',
      params: { koCount: 2 },
    },
  ],
]);
