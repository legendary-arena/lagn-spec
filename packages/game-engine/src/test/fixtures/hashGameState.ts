/**
 * Canonical-JSON sha256 hash of a `LegendaryGameState` for the
 * complete-game regression harness (WP-158).
 *
 * The hash is the `finalStateHash` oracle layer — the tightest of the
 * three oracle layers, intended to catch subtle state-placement
 * differences that the message log does not surface. Two harness
 * invocations against identical inputs MUST produce byte-identical
 * hashes on any machine; that is the contract this file's canonical-JSON
 * rules enforce.
 *
 * Distinct from `packages/game-engine/src/replay/replay.hash.ts`, which
 * implements a djb2 hash for the determinism-only replay harness
 * (WP-027 / D-0205). That file remains contract-locked; WP-158
 * deliberately ships its own sha256 helper so the seed-faithful and
 * determinism-only pipelines remain independent.
 *
 * No framework runtime import. No randomness, no wall-clock, no git.
 * Imports only `node:crypto`.
 */

import { createHash } from 'node:crypto';

import type { LegendaryGameState } from '../../types.js';

/**
 * Canonical-JSON `JSON.stringify` replacer that sorts object keys in
 * ASCII-lexicographic order at every nesting depth. Arrays are returned
 * unchanged — element order is semantically meaningful (deck order, zone
 * contents, message log) and MUST be preserved.
 *
 * `undefined` values are omitted by `JSON.stringify` by default; `null`
 * values are preserved as the JSON literal `null`. Numbers are
 * serialized using JavaScript's native `JSON.stringify` numeric format.
 */
function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const sortedRecord: Record<string, unknown> = {};
  const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
  for (const key of sortedKeys) {
    sortedRecord[key] = (value as Record<string, unknown>)[key];
  }
  return sortedRecord;
}

/**
 * Computes the canonical-JSON sha256 of a `LegendaryGameState`.
 *
 * The state is serialized via `JSON.stringify` with the sort-keys
 * replacer above (ASCII-lex sort, arrays preserved, `undefined` omitted,
 * `null` preserved, native JSON numbers), then hashed with `node:crypto`
 * sha256, then returned as a 64-character lowercase hexadecimal string.
 *
 * Two `LegendaryGameState` values with identical content produce
 * identical hashes regardless of property insertion order. Different
 * states produce different hashes with the standard hash-collision
 * caveat — sha256 is collision-resistant for this purpose by a wide
 * margin and is well above what regression testing needs.
 *
 * @param state - The game state to hash. Read-only; not mutated.
 * @returns 64-character lowercase hex sha256 of the canonical
 *   serialization of `state`.
 */
export function hashGameState(state: LegendaryGameState): string {
  const canonicalJson = JSON.stringify(state, sortKeysReplacer);
  const hasher = createHash('sha256');
  hasher.update(canonicalJson);
  return hasher.digest('hex');
}
