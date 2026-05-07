/**
 * Forward-only migration of `VersionedArtifact<T>` instances across
 * engine versions. The migration registry is the locked seam for
 * future migrations to extend; MVP ships with an empty registry.
 *
 * Engine-category invariants (D-3401) apply: no game framework import,
 * no registry import, no server import; no non-engine RNG, no
 * wall-clock reads, no high-resolution timing reads; no I/O.
 */

import type { EngineVersion, VersionedArtifact } from './versioning.types.js';
import { formatEngineVersion } from './versioning.check.js';

/** Migration registry key format: `"<fromMajor.fromMinor.fromPatch>-><toMajor.toMinor.toPatch>"`. */
export type MigrationKey = string;

/**
 * Pure transformation function from one payload version to the next.
 * Same input -> same output. No I/O, no RNG, no wall clock.
 */
export type MigrationFn = (payload: unknown) => unknown;

// why: WP-137 — the previously empty frozen registry now carries its
// first entry. Future migrations append by replacing this literal with
// an extended frozen object; the registry shape
// (`Record<MigrationKey, MigrationFn>`) is the long-lived seam.
// `Object.freeze` prevents accidental in-process mutation; `Readonly<...>`
// keeps the type contract honest. The `'1.0.0->1.1.0'` key matches
// `buildMigrationKey` in versioning.check.ts:73-78 and below at
// versioning.migrate.ts buildMigrationKey.
export const migrationRegistry: Readonly<Record<MigrationKey, MigrationFn>> =
  Object.freeze({
    '1.0.0->1.1.0': migrateHeroExtIdsForCopyIndex,
  });

// why: WP-137 D-13702 — best-effort schema-compatibility migration for
// legacy ReplayInput payloads saved at engine 1.0.0. Recurses into
// `moves[].args` and rewrites bare hero card-instance ext_ids by
// appending `#0` so the wire-shape gates downstream of the migration
// don't reject pre-WP-137 fixtures outright.
//
// This migration is best-effort schema compatibility only — it prevents
// `#`-absent crashes in legacy ext_ids by appending `#0`. It does NOT
// guarantee semantic equivalence: pre-WP-137 replays are expected to
// fail re-verification because shuffle order shifts under the new
// copy-index convention (per D-0802 — operators inspecting old replays
// should treat pre-WP-137 fixtures as historical artifacts).
//
// Throw discipline: this function is registered as a `MigrationFn`,
// which has the pure-transform contract `(payload: unknown) => unknown`.
// The throw surface is owned by `migrateArtifact` (the load-boundary
// exception) — this function returns `payload` unchanged when the
// payload doesn't satisfy the `ReplayInput`-shape guard. Never throws.
//
// Aliasing prevention (WP-028 D-2802): returns a NEW payload object
// with a NEW `moves` array; `args` recursion returns new objects/arrays
// whenever any nested value is rewritten, so input arrays / objects
// are never mutated.
/**
 * Best-effort schema-compatibility migration for legacy ReplayInput
 * payloads. Recurses into moves[].args and rewrites bare hero
 * card-instance ext_ids by appending `#0`. Never throws; returns input
 * unchanged when the payload doesn't satisfy the ReplayInput-shape
 * guard.
 *
 * Rewrite predicate (all three must hold for a string to be rewritten):
 *
 *   1. The string contains exactly two `/` separators.
 *   2. The string contains no `#` character.
 *   3. The string matches `^[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-]+$`.
 *
 * Any failing predicate leaves the string untouched. The narrow matcher
 * prevents accidental mutation of villain / mastermind / henchman /
 * scheme ext_ids (hyphen-form `setAbbr-cardType-groupSlug-cardSlug` —
 * no `/` separators), partial paths, and arbitrary user-supplied
 * strings.
 *
 * @param payload - Untyped payload from a `VersionedArtifact<unknown>`.
 * @returns A new payload object with rewritten move args, or the input
 *   unchanged when the payload shape doesn't match `ReplayInput`.
 */
export function migrateHeroExtIdsForCopyIndex(payload: unknown): unknown {
  if (!isReplayInputShape(payload)) {
    return payload;
  }
  // why: WP-028 D-2802 aliasing prevention — the migration must not return
  // a reference that shares structure with the input. Top-level fields
  // (seed, playerOrder, setupConfig, etc.) are deep-copied via the
  // recursive rewriter so a downstream mutation of the returned payload
  // cannot leak back into the source artifact. The rewriter is the same
  // function used for `args` values and handles plain objects, arrays,
  // and primitives correctly; ReplayInput is JSON-serializable by its
  // persistence contract.
  const cloned = rewriteArgsValue(payload);
  return cloned;
}

/**
 * Best-effort structural guard for the `ReplayInput` shape used by the
 * migration above. Permissive on the inner fields (only `moves` array
 * presence is required) so the migration doesn't reject legitimate
 * pre-WP-137 artifacts that happen to omit optional fields.
 */
function isReplayInputShape(
  payload: unknown,
): payload is { moves: Array<{ args: unknown }> } & Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as { moves?: unknown };
  if (!Array.isArray(candidate.moves)) return false;
  for (const move of candidate.moves) {
    if (!move || typeof move !== 'object') return false;
  }
  return true;
}

/**
 * Recursive rewrite for `args` values. Strings hit the rewrite
 * predicate; arrays and plain objects recurse; primitives pass through.
 *
 * Returns a new array/object whenever any nested value is rewritten;
 * pure pass-through for unchanged primitives. The recursion has no
 * max-depth guard because move args are author-controlled bounded
 * structures in practice.
 */
function rewriteArgsValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return rewriteHeroExtIdString(value);
  }
  if (Array.isArray(value)) {
    return value.map((element) => rewriteArgsValue(element));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const candidate = value as Record<string, unknown>;
    for (const key of Object.keys(candidate)) {
      result[key] = rewriteArgsValue(candidate[key]);
    }
    return result;
  }
  return value;
}

/**
 * Rewrites a single string value if it matches the bare hero
 * card-instance ext_id grammar `<setAbbr>/<heroSlug>/<cardSlug>` and
 * carries no `#`-suffix. Appends `#0` on match; returns input unchanged
 * otherwise.
 */
const HERO_EXT_ID_BARE_PATTERN = /^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/;

function rewriteHeroExtIdString(value: string): string {
  if (value.indexOf('#') !== -1) return value;
  // why: cheap reject before the regex — must contain exactly two `/`.
  let slashCount = 0;
  for (let i = 0; i < value.length; i++) {
    if (value.charAt(i) === '/') {
      slashCount++;
      if (slashCount > 2) return value;
    }
  }
  if (slashCount !== 2) return value;
  if (!HERO_EXT_ID_BARE_PATTERN.test(value)) return value;
  return `${value}#0`;
}

// why: `migrateArtifact` MAY throw — this is the load-boundary
// exception. The rationale is identical to `Game.setup()`'s throw:
// the engine cannot proceed without a valid artifact, and the
// failure is a structural-load error (D-0802 fail-loud), not a
// gameplay condition. The throw uses `Error` (base class).
// why: returns a NEW `VersionedArtifact<T>` with spread-copied fields
// so callers cannot mutate stored artifacts via the migrated
// reference. Aliasing prevention extends D-2802 from G-projections
// to load-boundary wrappers — the same bug class, different surface.

/**
 * Applies the registered migration sequence forward from
 * `artifact.engineVersion` to `targetVersion`. Returns a new
 * `VersionedArtifact<T>` with `engineVersion` updated and `payload`
 * transformed by the chained migration functions.
 *
 * Throws `Error` when no migration path exists. The error message
 * names both versions and the artifact's `savedAt` timestamp so
 * operators can locate the offending artifact.
 *
 * Forward-only: this function refuses to migrate when
 * `targetVersion` precedes `artifact.engineVersion` (any axis lower
 * than the corresponding source axis). Downgrade support is a
 * separate WP gated on a `D-34NN` decision.
 *
 * @typeParam T - The payload type (preserved across migrations).
 * @param artifact - The source `VersionedArtifact<T>` to migrate.
 * @param targetVersion - The desired engine version to migrate to.
 * @returns A new `VersionedArtifact<T>` at `targetVersion`.
 * @throws Error - When no migration path is registered or when
 *                 `targetVersion` precedes the source version.
 */
export function migrateArtifact<T>(
  artifact: VersionedArtifact<T>,
  targetVersion: EngineVersion,
): VersionedArtifact<T> {
  const sourceVersion = artifact.engineVersion;

  if (engineVersionsEqual(sourceVersion, targetVersion)) {
    return spreadCopyArtifact(artifact);
  }

  if (isDowngrade(sourceVersion, targetVersion)) {
    throw new Error(
      `Cannot migrate engine version ${formatEngineVersion(sourceVersion)} backward to engine version ${formatEngineVersion(targetVersion)}; downgrade migrations are not supported (artifact savedAt ${artifact.savedAt}).`,
    );
  }

  const migrationKey = buildMigrationKey(sourceVersion, targetVersion);
  const migrationFn = migrationRegistry[migrationKey];
  if (migrationFn === undefined) {
    throw new Error(
      `No migration path from engine version ${formatEngineVersion(sourceVersion)} to engine version ${formatEngineVersion(targetVersion)}; cannot migrate artifact saved at ${artifact.savedAt}.`,
    );
  }

  const migratedPayload = migrationFn(artifact.payload) as T;
  return {
    engineVersion: { ...targetVersion },
    dataVersion: { ...artifact.dataVersion },
    ...(artifact.contentVersion !== undefined
      ? { contentVersion: { ...artifact.contentVersion } }
      : {}),
    payload: migratedPayload,
    savedAt: artifact.savedAt,
  };
}

function buildMigrationKey(
  fromVersion: EngineVersion,
  toVersion: EngineVersion,
): MigrationKey {
  return `${formatEngineVersion(fromVersion)}->${formatEngineVersion(toVersion)}`;
}

function engineVersionsEqual(a: EngineVersion, b: EngineVersion): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

function isDowngrade(source: EngineVersion, target: EngineVersion): boolean {
  if (target.major < source.major) {
    return true;
  }
  if (target.major > source.major) {
    return false;
  }
  if (target.minor < source.minor) {
    return true;
  }
  if (target.minor > source.minor) {
    return false;
  }
  return target.patch < source.patch;
}

function spreadCopyArtifact<T>(
  artifact: VersionedArtifact<T>,
): VersionedArtifact<T> {
  return {
    engineVersion: { ...artifact.engineVersion },
    dataVersion: { ...artifact.dataVersion },
    ...(artifact.contentVersion !== undefined
      ? { contentVersion: { ...artifact.contentVersion } }
      : {}),
    payload: artifact.payload,
    savedAt: artifact.savedAt,
  };
}
