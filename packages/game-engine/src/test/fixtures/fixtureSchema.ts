/**
 * Fixture file schema + validator for the complete-game regression harness
 * (WP-158).
 *
 * Defines the JSON shape of `*.replay.json` fixtures and the hand-written
 * structural validator. No Zod dependency — the validator is plain-TS so
 * the engine package's runtime dependency surface stays unchanged
 * (WP-158 §Non-Negotiable Constraints).
 *
 * No framework runtime import. No `@legendary-arena/registry` import. No
 * randomness, no wall-clock, no git access. Pure shape definitions plus
 * a deterministic validator that returns the validated `FixtureFile` or
 * throws a full-sentence error.
 */

import type { MatchSetupConfig } from '../../matchSetup.types.js';
import type { ReplayMove } from '../../replay/replay.types.js';
import type { MatchSnapshot } from '../../persistence/persistence.types.js';
import type { EndgameOutcome } from '../../endgame/endgame.types.js';

/**
 * Fixture metadata block. `version` is locked to `1` for the current schema;
 * future schema changes will bump this integer and the validator will reject
 * any value the harness does not recognise.
 *
 * `createdAt` is an operator-supplied ISO 8601 timestamp. `engineVersion`
 * is an operator-supplied opaque string (git short SHA or semver). Neither
 * field is read by `runFixture`; both are preserved in the fixture file for
 * audit and human review of fixture provenance.
 */
export interface FixtureMeta {
  readonly version: 1;
  readonly createdAt: string;
  readonly engineVersion: string;
}

/**
 * Fixture input block. Structurally extends `ReplayInput` from
 * `packages/game-engine/src/replay/replay.types.ts` with an explicit
 * `playerCount` field that the harness uses to construct the setup
 * context. Class 2 (Configuration) persistable shape per WP-013.
 */
export interface FixtureInput {
  readonly seed: string;
  readonly playerCount: number;
  readonly playerOrder: readonly string[];
  readonly setupConfig: MatchSetupConfig;
  readonly moves: readonly ReplayMove[];
}

/**
 * Endgame outcome shape recorded in a fixture's `expected` block. `winner`
 * carries the engine's canonical `EndgameOutcome` value when
 * `evaluateEndgame` returned non-null at the end of the dispatch loop, and
 * `null` when the fixture's move list completed without triggering
 * endgame. `counters` is a verbatim shallow copy of `G.counters` at the
 * point the loop terminated.
 */
export interface FixtureOutcome {
  readonly winner: EndgameOutcome | null;
  readonly counters: Record<string, number>;
}

/**
 * Fixture expected block — the trajectory oracle. Asserted in the order
 * `outcome` → `messages` → `finalStateHash` so the first failing layer
 * pinpoints the diff grain.
 */
export interface FixtureExpected {
  readonly finalStateHash: string;
  readonly messages: readonly string[];
  readonly snapshotPerTurn: readonly MatchSnapshot[];
  readonly outcome: FixtureOutcome;
}

/**
 * A complete fixture file. `name` MUST equal the filename basename
 * (excluding the `.replay.json` extension); `validateFixture` rejects
 * mismatches to prevent misaligned diffs and incorrect fixture reuse.
 */
export interface FixtureFile {
  readonly name: string;
  readonly meta: FixtureMeta;
  readonly input: FixtureInput;
  readonly expected: FixtureExpected;
}

/**
 * Return shape of `runFixture(fixture, registry)`. Carries the same four
 * oracle layers as `FixtureExpected`. The driver compares this to
 * `fixture.expected` to detect regressions.
 */
export interface FixtureRunResult {
  readonly finalStateHash: string;
  readonly messages: readonly string[];
  readonly snapshotPerTurn: readonly MatchSnapshot[];
  readonly outcome: FixtureOutcome;
}

// why: the ISO 8601 datetime grammar is encoded as a regex because the
// harness is forbidden from constructing a wall-clock object for
// validation per WP-158 §Non-Negotiable Constraints (no wall-clock or
// Date constructor anywhere under fixtures/** or the recorder). The
// pattern accepts `YYYY-MM-DDTHH:MM:SS` with optional fractional
// seconds and either a `Z` suffix or a numeric timezone offset of the
// form `+HH:MM` or `-HH:MM`. Matches the canonical UTC ISO 8601 form
// plus timezone-bearing variants that operators may produce via
// shells.
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Casts `parsed` to `Record<string, unknown>` after confirming it is a
 * non-null plain object (not null and not an array). Returns false for
 * primitives, null, or arrays so the validator can emit a precise
 * shape-level error.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the `meta` block. Throws a full-sentence error on the first
 * violation. Throwing inside a thrown chain is intentional: the driver
 * surfaces the throw as `assert.fail(...)`, which is how WP-158 §Failure
 * reporter format wants validation failures to be reported.
 */
function validateMeta(meta: unknown, fixtureName: string): FixtureMeta {
  if (!isPlainObject(meta)) {
    throw new Error(
      `Fixture "${fixtureName}" has a missing or non-object meta block; a meta object with { version, createdAt, engineVersion } is required.`,
    );
  }
  if (meta.version !== 1) {
    throw new Error(
      `Fixture "${fixtureName}" has meta.version ${JSON.stringify(meta.version)}; only meta.version === 1 is supported by the current fixture schema.`,
    );
  }
  if (typeof meta.createdAt !== 'string' || meta.createdAt.length === 0) {
    throw new Error(
      `Fixture "${fixtureName}" is missing a string meta.createdAt field; an ISO 8601 timestamp produced at record time is required.`,
    );
  }
  if (!ISO_8601_PATTERN.test(meta.createdAt)) {
    throw new Error(
      `Fixture "${fixtureName}" has meta.createdAt "${meta.createdAt}" which is not a valid ISO 8601 timestamp; expected the form YYYY-MM-DDTHH:MM:SS[.fff](Z|±HH:MM).`,
    );
  }
  if (typeof meta.engineVersion !== 'string' || meta.engineVersion.length === 0) {
    throw new Error(
      `Fixture "${fixtureName}" is missing a string meta.engineVersion field; supply the engine's git short SHA or semver at record time.`,
    );
  }
  return {
    version: 1,
    createdAt: meta.createdAt,
    engineVersion: meta.engineVersion,
  };
}

/**
 * Validates the `input.moves` array. Each entry must be a `ReplayMove` —
 * an object with string `playerId`, string `moveName`, and an `args`
 * property of any type (including `null` or `undefined`, both permitted).
 */
function validateMoves(rawMoves: unknown, fixtureName: string): ReplayMove[] {
  if (!Array.isArray(rawMoves)) {
    throw new Error(
      `Fixture "${fixtureName}" has a non-array input.moves field; expected a (possibly empty) array of ReplayMove objects.`,
    );
  }
  const moves: ReplayMove[] = [];
  for (let moveIndex = 0; moveIndex < rawMoves.length; moveIndex++) {
    const candidate = rawMoves[moveIndex];
    if (!isPlainObject(candidate)) {
      throw new Error(
        `Fixture "${fixtureName}" input.moves[${moveIndex}] is not an object; each move must be { playerId, moveName, args }.`,
      );
    }
    if (typeof candidate.playerId !== 'string' || candidate.playerId.length === 0) {
      throw new Error(
        `Fixture "${fixtureName}" input.moves[${moveIndex}] is missing a non-empty string playerId field.`,
      );
    }
    if (typeof candidate.moveName !== 'string' || candidate.moveName.length === 0) {
      throw new Error(
        `Fixture "${fixtureName}" input.moves[${moveIndex}] is missing a non-empty string moveName field.`,
      );
    }
    moves.push({
      playerId: candidate.playerId,
      moveName: candidate.moveName,
      args: candidate.args,
    });
  }
  return moves;
}

/**
 * Validates the `input` block. Shape checks only — the validator does
 * NOT run the registry-validation pass (`validateMatchSetup`) because
 * the harness deliberately operates with a minimal `CardRegistryReader`
 * stub per WP-158 §Packet-Specific Constraints.
 */
function validateInput(input: unknown, fixtureName: string): FixtureInput {
  if (!isPlainObject(input)) {
    throw new Error(
      `Fixture "${fixtureName}" has a missing or non-object input block.`,
    );
  }
  if (typeof input.seed !== 'string' || input.seed.length === 0) {
    throw new Error(
      `Fixture "${fixtureName}" is missing a non-empty string input.seed field.`,
    );
  }
  if (typeof input.playerCount !== 'number' || !Number.isInteger(input.playerCount) || input.playerCount < 1) {
    throw new Error(
      `Fixture "${fixtureName}" has input.playerCount ${JSON.stringify(input.playerCount)}; expected a positive integer matching playerOrder.length.`,
    );
  }
  if (!Array.isArray(input.playerOrder) || input.playerOrder.length !== input.playerCount) {
    throw new Error(
      `Fixture "${fixtureName}" has input.playerOrder of length ${Array.isArray(input.playerOrder) ? String(input.playerOrder.length) : 'non-array'} which does not equal input.playerCount ${String(input.playerCount)}.`,
    );
  }
  for (let seatIndex = 0; seatIndex < input.playerOrder.length; seatIndex++) {
    const seatId = input.playerOrder[seatIndex];
    if (typeof seatId !== 'string' || seatId.length === 0) {
      throw new Error(
        `Fixture "${fixtureName}" input.playerOrder[${seatIndex}] is not a non-empty string seat identifier.`,
      );
    }
  }
  if (!isPlainObject(input.setupConfig)) {
    throw new Error(
      `Fixture "${fixtureName}" has a missing or non-object input.setupConfig block; the 9-field MatchSetupConfig payload is required.`,
    );
  }
  const moves = validateMoves(input.moves, fixtureName);
  return {
    seed: input.seed,
    playerCount: input.playerCount,
    playerOrder: input.playerOrder as readonly string[],
    setupConfig: input.setupConfig as unknown as MatchSetupConfig,
    moves,
  };
}

/**
 * Validates the `expected` block. The block is read-only at runtime; the
 * driver compares the harness output against it. Per WP-158 §Source-of-truth
 * discipline, this block is produced by the recorder, never hand-edited.
 */
function validateExpected(expected: unknown, fixtureName: string): FixtureExpected {
  if (!isPlainObject(expected)) {
    throw new Error(
      `Fixture "${fixtureName}" has a missing or non-object expected block.`,
    );
  }
  if (typeof expected.finalStateHash !== 'string' || !/^[0-9a-f]{64}$/.test(expected.finalStateHash)) {
    throw new Error(
      `Fixture "${fixtureName}" has expected.finalStateHash ${JSON.stringify(expected.finalStateHash)}; expected a 64-character lowercase hex sha256 string.`,
    );
  }
  if (!Array.isArray(expected.messages)) {
    throw new Error(
      `Fixture "${fixtureName}" has a non-array expected.messages field; G.messages is read byte-identically into an array of strings.`,
    );
  }
  for (let messageIndex = 0; messageIndex < expected.messages.length; messageIndex++) {
    if (typeof expected.messages[messageIndex] !== 'string') {
      throw new Error(
        `Fixture "${fixtureName}" expected.messages[${messageIndex}] is not a string; G.messages is a string[] event log.`,
      );
    }
  }
  if (!Array.isArray(expected.snapshotPerTurn)) {
    throw new Error(
      `Fixture "${fixtureName}" has a non-array expected.snapshotPerTurn field; one MatchSnapshot per completed turn is required.`,
    );
  }
  if (!isPlainObject(expected.outcome)) {
    throw new Error(
      `Fixture "${fixtureName}" has a missing or non-object expected.outcome block; expected { winner, counters }.`,
    );
  }
  const winner = expected.outcome.winner;
  const winnerIsValid =
    winner === null || winner === 'heroes-win' || winner === 'scheme-wins';
  if (!winnerIsValid) {
    throw new Error(
      `Fixture "${fixtureName}" has expected.outcome.winner ${JSON.stringify(winner)}; expected null, "heroes-win", or "scheme-wins" (the engine's canonical EndgameOutcome values).`,
    );
  }
  if (!isPlainObject(expected.outcome.counters)) {
    throw new Error(
      `Fixture "${fixtureName}" has a missing or non-object expected.outcome.counters field; G.counters is a Record<string, number>.`,
    );
  }
  return {
    finalStateHash: expected.finalStateHash,
    messages: expected.messages as readonly string[],
    snapshotPerTurn: expected.snapshotPerTurn as readonly MatchSnapshot[],
    outcome: {
      winner,
      counters: expected.outcome.counters as Record<string, number>,
    },
  };
}

/**
 * Parses and validates a fixture file's parsed-JSON payload. Throws a
 * full-sentence error on any shape violation; returns the typed
 * `FixtureFile` on success.
 *
 * The `filenameBasename` argument is the file's basename WITHOUT the
 * `.replay.json` extension. The validator REJECTS fixtures whose `name`
 * field does not exactly equal this basename — this prevents the
 * fixture-identity drift class described in WP-158 §Packet-Specific
 * Constraints.
 *
 * @param input - Parsed JSON payload (e.g. from JSON.parse).
 * @param filenameBasename - The basename of the fixture file, excluding
 *   the `.replay.json` extension.
 * @returns The validated FixtureFile.
 * @throws {Error} If any shape or identity invariant is violated.
 */
export function validateFixture(input: unknown, filenameBasename: string): FixtureFile {
  if (!isPlainObject(input)) {
    throw new Error(
      `Fixture loaded from "${filenameBasename}.replay.json" is not a JSON object; the top-level value must be an object with { name, meta, input, expected }.`,
    );
  }
  if (typeof input.name !== 'string' || input.name.length === 0) {
    throw new Error(
      `Fixture loaded from "${filenameBasename}.replay.json" is missing a non-empty string name field; the name must match the filename basename.`,
    );
  }
  if (input.name !== filenameBasename) {
    throw new Error(
      `Fixture name "${input.name}" does not match filename basename "${filenameBasename}"; rename either the file or the name field so they agree exactly (excluding the .replay.json extension).`,
    );
  }
  const meta = validateMeta(input.meta, input.name);
  const fixtureInput = validateInput(input.input, input.name);
  const expected = validateExpected(input.expected, input.name);
  return {
    name: input.name,
    meta,
    input: fixtureInput,
    expected,
  };
}
