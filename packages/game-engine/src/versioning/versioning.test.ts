import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type {
  EngineVersion,
  VersionedArtifact,
} from './versioning.types.js';
import {
  CURRENT_DATA_VERSION,
  checkCompatibility,
  getCurrentEngineVersion,
} from './versioning.check.js';
import {
  migrateArtifact,
  migrationRegistry,
  migrateHeroExtIdsForCopyIndex,
} from './versioning.migrate.js';
import { stampArtifact } from './versioning.stamp.js';

describe('versioning (WP-034)', () => {
  // Test 1 — same version: compatible
  test('checkCompatibility returns compatible when artifact and current versions are identical', () => {
    const current = getCurrentEngineVersion();
    const artifactVersion: EngineVersion = {
      major: current.major,
      minor: current.minor,
      patch: current.patch,
    };

    const result = checkCompatibility(artifactVersion, current);

    assert.equal(result.status, 'compatible');
    assert.equal(
      result.message,
      `Artifact engine version ${current.major}.${current.minor}.${current.patch} is compatible with current engine version ${current.major}.${current.minor}.${current.patch}.`,
    );
    assert.equal(result.migrations, undefined);
  });

  // Test 2 — same major, lower minor: compatible
  test('checkCompatibility returns compatible when artifact has same major and lower minor than current', () => {
    const current: EngineVersion = { major: 2, minor: 5, patch: 0 };
    const artifactVersion: EngineVersion = { major: 2, minor: 3, patch: 7 };

    const result = checkCompatibility(artifactVersion, current);

    assert.equal(result.status, 'compatible');
    assert.match(result.message, /^Artifact engine version 2\.3\.7 is compatible with current engine version 2\.5\.0\.$/);
  });

  // Test 3 — same major, higher minor with migration: migratable
  test('checkCompatibility returns incompatible when artifact has same major and higher minor with no migration registered (MVP empty registry)', () => {
    // why: MVP migrationRegistry is Object.freeze({}), so ANY higher-minor
    // artifact gets `incompatible` rather than `migratable`. This test
    // documents the MVP behavior and locks the empty-registry contract.
    // A future migration entry would flip a higher-minor artifact to
    // `migratable`; that case is covered by Test 7 below where we
    // exercise the migration path via migrateArtifact directly.
    const current: EngineVersion = { major: 2, minor: 3, patch: 0 };
    const artifactVersion: EngineVersion = { major: 2, minor: 5, patch: 0 };

    const result = checkCompatibility(artifactVersion, current);

    assert.equal(result.status, 'incompatible');
    assert.match(
      result.message,
      /^Artifact engine version 2\.5\.0 is newer than current engine version 2\.3\.0 and no migration path is registered; refusing to load\.$/,
    );
    assert.equal(result.migrations, undefined);
  });

  // Test 4 — different major: incompatible
  test('checkCompatibility returns incompatible when artifact differs from current in major version', () => {
    const current: EngineVersion = { major: 2, minor: 0, patch: 0 };
    const artifactVersion: EngineVersion = { major: 1, minor: 9, patch: 9 };

    const result = checkCompatibility(artifactVersion, current);

    assert.equal(result.status, 'incompatible');
    assert.match(
      result.message,
      /^Artifact engine version 1\.9\.9 differs in major version from current engine version 2\.0\.0; major-version changes are breaking and require an explicit migration path which is not present\.$/,
    );
  });

  // Test 5 — missing version stamp: rejected (fail loud per D-0802)
  test('checkCompatibility returns incompatible when artifact version stamp is missing or unparseable', () => {
    const current = getCurrentEngineVersion();
    const expectedMessage =
      'Artifact is missing a valid engineVersion stamp; cannot determine compatibility.';

    assert.equal(checkCompatibility(null, current).status, 'incompatible');
    assert.equal(checkCompatibility(null, current).message, expectedMessage);
    assert.equal(checkCompatibility(undefined, current).status, 'incompatible');
    assert.equal(checkCompatibility(undefined, current).message, expectedMessage);
    // Non-object — the function's parameter type accepts only `EngineVersion |
    // null | undefined`, so cast through `unknown` to exercise the runtime
    // guard against a malformed save-file deserialization.
    assert.equal(
      checkCompatibility(
        'v1.0.0' as unknown as EngineVersion,
        current,
      ).status,
      'incompatible',
    );
    // Object missing fields
    assert.equal(
      checkCompatibility(
        { major: 1, minor: 0 } as unknown as EngineVersion,
        current,
      ).status,
      'incompatible',
    );
  });

  // Test 6 — stampArtifact embeds correct engine version, data version, ISO timestamp, and contentVersion handling
  test('stampArtifact embeds engine version, data version, ISO 8601 savedAt, and respects optional contentVersion', () => {
    const payload = { foo: 'bar', n: 42 };

    const stamped = stampArtifact(payload);

    const current = getCurrentEngineVersion();
    assert.deepStrictEqual(stamped.engineVersion, current);
    assert.deepStrictEqual(stamped.dataVersion, CURRENT_DATA_VERSION);
    assert.equal(stamped.payload, payload);

    // contentVersion must be OMITTED (not undefined) when not supplied —
    // D-2902 / exactOptionalPropertyTypes contract.
    assert.equal(
      'contentVersion' in stamped,
      false,
      'contentVersion must be OMITTED when not supplied',
    );

    // savedAt parses as a valid ISO 8601 UTC string. We deliberately
    // do NOT compare against a wall-clock reading captured in the test —
    // P6-43 paraphrase discipline keeps the static wall-clock helper
    // out of the versioning subtree even in tests; the structural ISO
    // format check plus a successful parse round-trip are sufficient
    // proof that stampArtifact emitted a real timestamp string.
    assert.match(
      stamped.savedAt,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    const parsedMillis = Date.parse(stamped.savedAt);
    assert.ok(!Number.isNaN(parsedMillis), 'savedAt must parse as ISO 8601');
    // Sanity bound: the stamp is within the current decade (this test
    // file ships in a 2020s codebase; a stamp before 2020 or beyond
    // 2099 would indicate a stub/placeholder leak).
    assert.ok(parsedMillis > Date.parse('2020-01-01T00:00:00.000Z'));
    assert.ok(parsedMillis < Date.parse('2099-12-31T23:59:59.999Z'));

    // Supplying contentVersion populates the field (spread-copied).
    const withContent = stampArtifact(payload, { version: 7 });
    assert.deepStrictEqual(withContent.contentVersion, { version: 7 });
  });

  // Test 7 — migrateArtifact applies forward-only migration
  test('migrateArtifact returns a spread-copied artifact when source equals target (no-op migration)', () => {
    // The MVP migrationRegistry is empty, so the only forward-migrate
    // path that does not throw is the same-version case. This test
    // covers (a) the no-op return and (b) the no-mutation guarantee
    // (D-2802 aliasing prevention).
    const sourceVersion = getCurrentEngineVersion();
    const original: VersionedArtifact<{ value: number }> = {
      engineVersion: sourceVersion,
      dataVersion: { ...CURRENT_DATA_VERSION },
      payload: { value: 99 },
      savedAt: '2026-04-19T00:00:00.000Z',
    };

    const migrated = migrateArtifact(original, sourceVersion);

    // Result equals input by content
    assert.deepStrictEqual(migrated, original);
    // But is a different object (spread-copy guarantee)
    assert.notStrictEqual(migrated, original);
    assert.notStrictEqual(migrated.engineVersion, original.engineVersion);
    assert.notStrictEqual(migrated.dataVersion, original.dataVersion);
    // Payload is shared by reference (the spread-copy contract is on the
    // wrapper, not on T — payload mutation is the caller's responsibility
    // and is documented in stampArtifact's // why: comment).
    assert.strictEqual(migrated.payload, original.payload);
  });

  // Test 8 — migrateArtifact with no migration path: throws
  // why: WP-137 PS-5 fixture update — the original 1.0.0 → 1.1.0 fixture
  // is now a registered migration path (`migrateHeroExtIdsForCopyIndex`).
  // Fixture moves to 1.1.0 → 1.2.0 (still no path registered) so the
  // test continues to exercise the no-path-throws behavior with the
  // same intent and locked message template.
  test('migrateArtifact throws Error with the locked template when no migration path is registered', () => {
    const sourceVersion: EngineVersion = { major: 1, minor: 1, patch: 0 };
    const targetVersion: EngineVersion = { major: 1, minor: 2, patch: 0 };
    const artifact: VersionedArtifact<{ x: number }> = {
      engineVersion: sourceVersion,
      dataVersion: { ...CURRENT_DATA_VERSION },
      payload: { x: 5 },
      savedAt: '2026-04-19T12:00:00.000Z',
    };

    assert.throws(
      () => migrateArtifact(artifact, targetVersion),
      {
        name: 'Error',
        message:
          'No migration path from engine version 1.1.0 to engine version 1.2.0; cannot migrate artifact saved at 2026-04-19T12:00:00.000Z.',
      },
    );
  });

  // Test 9 — All version types JSON-serializable (stringify roundtrip)
  test('VersionedArtifact survives JSON.stringify + JSON.parse with structural equality', () => {
    const stamped = stampArtifact({ name: 'replay', moves: 12 }, { version: 3 });
    const roundtripped = JSON.parse(JSON.stringify(stamped));

    assert.deepStrictEqual(roundtripped, stamped);
    // Specifically: engineVersion, dataVersion, contentVersion, payload, and
    // savedAt all survive. No Date objects, Maps, Sets, functions, or class
    // instances leaked into the serialized output.
    assert.equal(typeof roundtripped.savedAt, 'string');
    assert.equal(typeof roundtripped.engineVersion.major, 'number');
    assert.equal(typeof roundtripped.dataVersion.version, 'number');
    assert.equal(typeof roundtripped.contentVersion.version, 'number');
  });

  // why: WP-137 — first migration registered. Tests appended inside the
  // existing describe() block for suite delta +0 (per RS-3).
  test('WP-137: migrationRegistry contains the 1.0.0->1.1.0 entry pointing to migrateHeroExtIdsForCopyIndex', () => {
    assert.equal(
      migrationRegistry['1.0.0->1.1.0'],
      migrateHeroExtIdsForCopyIndex,
      `migrationRegistry['1.0.0->1.1.0'] must point to migrateHeroExtIdsForCopyIndex`,
    );
  });

  test('WP-137: migrateHeroExtIdsForCopyIndex rewrites bare hero card-instance ext_ids by appending #0', () => {
    const legacyPayload = {
      seed: 'replay-001',
      setupConfig: {
        schemeId: 'core/the-scheme',
        mastermindId: 'core/the-mastermind',
        villainGroupIds: ['core/villain-group'],
        henchmanGroupIds: ['core/henchman-group'],
        heroDeckIds: ['core/black-widow'],
        bystandersCount: 30,
        woundsCount: 30,
        officersCount: 30,
        sidekicksCount: 0,
      },
      playerOrder: ['0', '1'],
      moves: [
        {
          playerId: '0',
          moveName: 'recruitHero',
          args: { heroExtId: 'core/black-widow/mission-accomplished' },
        },
        {
          playerId: '1',
          moveName: 'playCard',
          args: { cardId: 'core/spider-man/web-shooter' },
        },
      ],
    };

    const migrated = migrateHeroExtIdsForCopyIndex(legacyPayload) as typeof legacyPayload;

    assert.equal(
      (migrated.moves[0]!.args as { heroExtId: string }).heroExtId,
      'core/black-widow/mission-accomplished#0',
      'Bare hero ext_id in move args must be rewritten with #0 suffix',
    );
    assert.equal(
      (migrated.moves[1]!.args as { cardId: string }).cardId,
      'core/spider-man/web-shooter#0',
      'Bare hero ext_id in nested args must be rewritten with #0 suffix',
    );
  });

  test('WP-137: migrateHeroExtIdsForCopyIndex leaves villain / mastermind / henchman / scheme ext_ids untouched', () => {
    // Hyphen-form ext_ids carry no `/` separators and must not be
    // touched by the migration's three-predicate matcher.
    const legacyPayload = {
      seed: 'replay-002',
      setupConfig: {
        schemeId: 'core/scheme',
        mastermindId: 'core/mm',
        villainGroupIds: [],
        henchmanGroupIds: [],
        heroDeckIds: [],
        bystandersCount: 0,
        woundsCount: 0,
        officersCount: 0,
        sidekicksCount: 0,
      },
      playerOrder: ['0'],
      moves: [
        { playerId: '0', moveName: 'fightVillain', args: { villainId: 'core-villain-brotherhood-magneto' } },
        { playerId: '0', moveName: 'fightMastermind', args: { tacticId: 'core-mastermind-dr-doom-doom-base' } },
        { playerId: '0', moveName: 'fightHenchman', args: { henchmanId: 'henchman-doombot-legion-00' } },
        { playerId: '0', moveName: 'twist', args: { schemeId: 'core-scheme-twist-001' } },
      ],
    };

    const migrated = migrateHeroExtIdsForCopyIndex(legacyPayload) as typeof legacyPayload;

    assert.equal(
      (migrated.moves[0]!.args as { villainId: string }).villainId,
      'core-villain-brotherhood-magneto',
      'Hyphen-form villain ext_id must be untouched',
    );
    assert.equal(
      (migrated.moves[1]!.args as { tacticId: string }).tacticId,
      'core-mastermind-dr-doom-doom-base',
      'Hyphen-form mastermind ext_id must be untouched',
    );
    assert.equal(
      (migrated.moves[2]!.args as { henchmanId: string }).henchmanId,
      'henchman-doombot-legion-00',
      'Hyphen-form henchman ext_id must be untouched',
    );
    assert.equal(
      (migrated.moves[3]!.args as { schemeId: string }).schemeId,
      'core-scheme-twist-001',
      'Hyphen-form scheme ext_id must be untouched',
    );
  });

  test('WP-137: migrateHeroExtIdsForCopyIndex returns input unchanged when payload is not ReplayInput-shaped', () => {
    // Per the locked contract: returns `payload` unchanged (no copy)
    // when the payload doesn't satisfy the ReplayInput-shape guard.
    assert.equal(migrateHeroExtIdsForCopyIndex(null), null, 'null payload returned unchanged');
    assert.equal(migrateHeroExtIdsForCopyIndex(undefined), undefined, 'undefined payload returned unchanged');
    assert.equal(migrateHeroExtIdsForCopyIndex(42), 42, 'primitive payload returned unchanged');
    assert.equal(migrateHeroExtIdsForCopyIndex('not a payload'), 'not a payload', 'string payload returned unchanged');
    const noMoves = { seed: 'x' };
    assert.equal(migrateHeroExtIdsForCopyIndex(noMoves), noMoves, 'object without moves array returned unchanged');
  });

  test('WP-137: migrateHeroExtIdsForCopyIndex never throws on malformed payloads', () => {
    // Locked contract: MigrationFn is pure-transform; throw surface is
    // owned by migrateArtifact (the load-boundary exception).
    assert.doesNotThrow(() => migrateHeroExtIdsForCopyIndex(null));
    assert.doesNotThrow(() => migrateHeroExtIdsForCopyIndex(undefined));
    assert.doesNotThrow(() => migrateHeroExtIdsForCopyIndex({ moves: [null] }));
    assert.doesNotThrow(() => migrateHeroExtIdsForCopyIndex({ moves: 'not-an-array' }));
    assert.doesNotThrow(() => migrateHeroExtIdsForCopyIndex({ moves: [{ args: { x: { y: { z: 'core/a/b' } } } }] }));
  });

  test('WP-137: migrateHeroExtIdsForCopyIndex returns a new payload reference (no aliasing with input)', () => {
    // WP-028 D-2802 aliasing prevention extended to load-boundary
    // wrappers. Mutating the returned payload must not mutate the input.
    const original = {
      seed: 'replay-003',
      moves: [
        { playerId: '0', moveName: 'foo', args: { heroExtId: 'core/black-widow/mission-accomplished' } },
      ],
    };
    const migrated = migrateHeroExtIdsForCopyIndex(original) as typeof original;
    assert.notEqual(migrated, original, 'Returned payload must be a new object reference');
    assert.notEqual(migrated.moves, original.moves, 'Returned moves must be a new array reference');
    assert.notEqual(migrated.moves[0], original.moves[0], 'Returned move must be a new object reference');
    assert.equal(
      (original.moves[0]!.args as { heroExtId: string }).heroExtId,
      'core/black-widow/mission-accomplished',
      'Original input must be unchanged after migration',
    );
  });
});
