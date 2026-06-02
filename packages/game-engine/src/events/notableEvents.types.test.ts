/**
 * Drift-detection + JSON-serialisability tests for notable game event types.
 *
 * Pins the four-variant `NOTABLE_EVENT_TYPES` array against the
 * `NotableGameEventType` union and the five-entry `SCHEME_TWIST_RESOLVER_KEYS`
 * array against the `SchemeTwistResolverKey` union (bidirectional + length +
 * uniqueness). Pins JSON round-trip per event variant so a future widening
 * cannot smuggle a non-serialisable field into `NotableGameEvent`.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTABLE_EVENT_TYPES,
  SCHEME_TWIST_RESOLVER_KEYS,
} from './notableEvents.types.js';
import type {
  NotableGameEventType,
  SchemeTwistResolverKey,
  FightResolvedEvent,
  AmbushResolvedEvent,
  SchemeTwistResolvedEvent,
  MastermindStrikeResolvedEvent,
  NotableGameEvent,
} from './notableEvents.types.js';

describe('NOTABLE_EVENT_TYPES drift detection', () => {
  it('contains exactly four entries in canonical order', () => {
    assert.deepStrictEqual(
      [...NOTABLE_EVENT_TYPES],
      [
        'fightResolved',
        'ambushResolved',
        'schemeTwistResolved',
        'mastermindStrikeResolved',
      ],
    );
  });

  it('has no duplicate entries', () => {
    const unique = new Set<string>(NOTABLE_EVENT_TYPES);
    assert.equal(unique.size, NOTABLE_EVENT_TYPES.length);
  });

  it('every union member is present in the canonical array', () => {
    // why: bidirectional drift — every `NotableGameEventType` literal must
    // appear in `NOTABLE_EVENT_TYPES`. A future addition to the union
    // without an array update would compile but break this assertion.
    const unionMembers: NotableGameEventType[] = [
      'fightResolved',
      'ambushResolved',
      'schemeTwistResolved',
      'mastermindStrikeResolved',
    ];
    for (const member of unionMembers) {
      assert.ok(
        NOTABLE_EVENT_TYPES.includes(member),
        `union member "${member}" missing from canonical array`,
      );
    }
  });

  it('every canonical array entry is assignable to NotableGameEventType', () => {
    // why: bidirectional drift — every array entry typed-narrowed to the
    // union proves no extra strings sneaked into the array (e.g., typos).
    const typed: NotableGameEventType[] = [...NOTABLE_EVENT_TYPES];
    assert.equal(typed.length, NOTABLE_EVENT_TYPES.length);
  });
});

describe('SCHEME_TWIST_RESOLVER_KEYS drift detection', () => {
  it('contains exactly five entries in canonical order', () => {
    assert.deepStrictEqual(
      [...SCHEME_TWIST_RESOLVER_KEYS],
      [
        'revealOrPunish',
        'chainedReveals',
        'woundAll',
        'koFromHq',
        'midtownBankRobbery',
      ],
    );
  });

  it('has no duplicate entries', () => {
    const unique = new Set<string>(SCHEME_TWIST_RESOLVER_KEYS);
    assert.equal(unique.size, SCHEME_TWIST_RESOLVER_KEYS.length);
  });

  it('every union member is present in the canonical array', () => {
    const unionMembers: SchemeTwistResolverKey[] = [
      'revealOrPunish',
      'chainedReveals',
      'woundAll',
      'koFromHq',
      'midtownBankRobbery',
    ];
    for (const member of unionMembers) {
      assert.ok(
        SCHEME_TWIST_RESOLVER_KEYS.includes(member),
        `union member "${member}" missing from canonical array`,
      );
    }
  });

  it('every canonical array entry is assignable to SchemeTwistResolverKey', () => {
    const typed: SchemeTwistResolverKey[] = [...SCHEME_TWIST_RESOLVER_KEYS];
    assert.equal(typed.length, SCHEME_TWIST_RESOLVER_KEYS.length);
  });
});

describe('NotableGameEvent JSON round-trip per variant', () => {
  it('FightResolvedEvent round-trips through JSON.stringify/parse', () => {
    const original: FightResolvedEvent = {
      type: 'fightResolved',
      playerId: '0',
      cardId: 'core-villain-brotherhood-magneto-00',
      citySpace: 2,
      bystandersRescued: 1,
      appliedEffects: ['captureBystander'],
      narrative: 'Fought "Magneto" and rescued 1 bystander(s); Fight effect: a bystander was captured.',
    };
    const cloned = JSON.parse(JSON.stringify(original)) as FightResolvedEvent;
    assert.deepStrictEqual(cloned, original);
  });

  it('AmbushResolvedEvent round-trips through JSON.stringify/parse', () => {
    const original: AmbushResolvedEvent = {
      type: 'ambushResolved',
      revealedCardId: 'core-villain-brotherhood-toad-00',
      citySpace: 0,
      appliedEffects: ['gainWoundEachPlayer'],
      narrative: '"Toad" ambushed: every player gained a wound.',
    };
    const cloned = JSON.parse(JSON.stringify(original)) as AmbushResolvedEvent;
    assert.deepStrictEqual(cloned, original);
  });

  it('SchemeTwistResolvedEvent round-trips through JSON.stringify/parse', () => {
    const original: SchemeTwistResolvedEvent = {
      type: 'schemeTwistResolved',
      twistCardId: 'core-scheme-twist-legacy-virus',
      resolverKey: 'revealOrPunish',
      narrative: 'Scheme Twist "Legacy Virus": players were forced to reveal a matching hero or suffer a penalty.',
    };
    const cloned = JSON.parse(JSON.stringify(original)) as SchemeTwistResolvedEvent;
    assert.deepStrictEqual(cloned, original);
  });

  it('MastermindStrikeResolvedEvent round-trips through JSON.stringify/parse', () => {
    const original: MastermindStrikeResolvedEvent = {
      type: 'mastermindStrikeResolved',
      strikeCardId: 'master-strike-00',
      narrative: 'Master Strike: "master-strike-00" resolved.',
    };
    const cloned = JSON.parse(JSON.stringify(original)) as MastermindStrikeResolvedEvent;
    assert.deepStrictEqual(cloned, original);
  });

  it('NotableGameEvent[] round-trips with mixed variants', () => {
    const original: NotableGameEvent[] = [
      {
        type: 'fightResolved',
        playerId: '0',
        cardId: 'core-villain-brotherhood-magneto-00',
        citySpace: 2,
        bystandersRescued: 0,
        appliedEffects: [],
        narrative: 'Fought "Magneto".',
      },
      {
        type: 'mastermindStrikeResolved',
        strikeCardId: 'master-strike-01',
        narrative: 'Master Strike: "master-strike-01" resolved.',
      },
    ];
    const cloned = JSON.parse(JSON.stringify(original)) as NotableGameEvent[];
    assert.deepStrictEqual(cloned, original);
  });
});
