/**
 * Compatibility checking for persisted `VersionedArtifact<T>` instances.
 *
 * Pure decision functions. `checkCompatibility` returns a structured
 * `CompatibilityResult` and never throws — callers decide whether to
 * surface the message and refuse the load, log to telemetry, or
 * attempt migration via `migrateArtifact`.
 *
 * Engine-category invariants (D-3401) apply: no game framework import,
 * no registry import, no server import; no non-engine RNG, no
 * wall-clock reads, no high-resolution timing reads; no I/O.
 */

import type {
  CompatibilityResult,
  CompatibilityStatus,
  DataVersion,
  EngineVersion,
} from './versioning.types.js';
import { migrationRegistry } from './versioning.migrate.js';

// why: hand-mirror of `packages/game-engine/package.json` `version`
// field. The constant is the single source of truth at runtime;
// package.json is the human-readable copy. A future engine bump
// updates BOTH atomically. Avoiding `import pkg from
// '../../package.json'` keeps the engine `tsconfig` independent of
// `resolveJsonModule` and removes a transitive coupling that would
// break under any future build pipeline that strips JSON imports.
// why: WP-137 D-13702 — engine reducer behavior changed (hero card-instance
// ext_id grammar extended with `#<copyIndex>` suffix; setup-time fan-out
// of G.cardStats and G.cardDisplayData per copy). This is an engine-axis
// bump (1.0.0 → 1.1.0), simultaneous with the D-13701 data-axis bump
// below because WP-137's surface change is both a behavior change AND a
// wire-shape change for ReplayInput.moves[].args. package.json:version
// bumps to "1.1.0" in lockstep.
const CURRENT_ENGINE_VERSION_VALUE: EngineVersion = {
  major: 1,
  minor: 1,
  patch: 0,
};

// why: WP-137 D-13701 — wire shape of ReplayInput.moves[].args changed
// (hero card-instance ext_ids now carry a `#<copyIndex>` suffix). This
// is a data-axis bump (1 → 2) per D-0801, simultaneous with the D-13702
// engine-axis bump above. The migration migrateHeroExtIdsForCopyIndex
// at registry key `'1.0.0->1.1.0'` performs best-effort schema
// compatibility for legacy ReplayInput payloads (rewriting bare hero
// ext_ids to `#0`-suffixed form); pre-WP-137 replays are expected to
// fail re-verification because shuffle order shifts under the new
// copy-index convention (D-0802 fail-loud at the load boundary still
// applies — operators inspecting old replays should treat pre-WP-137
// fixtures as historical artifacts).
export const CURRENT_DATA_VERSION: DataVersion = { version: 2 };

/**
 * Returns the current engine version as a fresh object on every call.
 *
 * The freshness avoids accidental shared-reference mutation through
 * the returned `EngineVersion` (which is `readonly` at the type level
 * but not frozen at runtime). Callers that need a stable identity
 * should compare by field, not by reference.
 *
 * @returns The current engine version `{ major, minor, patch }`.
 */
export function getCurrentEngineVersion(): EngineVersion {
  return {
    major: CURRENT_ENGINE_VERSION_VALUE.major,
    minor: CURRENT_ENGINE_VERSION_VALUE.minor,
    patch: CURRENT_ENGINE_VERSION_VALUE.patch,
  };
}

/**
 * Formats an `EngineVersion` as a `"M.m.p"` string for messages and
 * for migration-registry lookups. Pure helper, no side effects.
 *
 * @param version - The engine version to format.
 * @returns The dotted-triple string, e.g., `"1.0.0"`.
 */
export function formatEngineVersion(version: EngineVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Builds a migration-registry lookup key from a source and target
 * engine version. Format: `"<a.b.c>-><a.b.c>"` per the WP-034
 * Locked Values block.
 */
function buildMigrationKey(
  fromVersion: EngineVersion,
  toVersion: EngineVersion,
): string {
  return `${formatEngineVersion(fromVersion)}->${formatEngineVersion(toVersion)}`;
}

// why: `checkCompatibility` is a pure decision function. It returns a
// structured `CompatibilityResult` and never throws. Callers
// (load-time deserializers) decide whether to surface the message and
// refuse, log to telemetry, or attempt migration. Same purity contract
// as `validateScoringConfig` (D-4805) and `validateContent` (D-3303).
// why: D-1234 (graceful degradation for unknown types — warn via
// G.messages, continue) does NOT apply here. D-0802 (Incompatible
// Data Fails Loudly) wins for load-time validation: the engine has no
// G.messages to write to before Game.setup() runs, and silently
// dropping an unknown-version artifact would erase replay history.

/**
 * Decides whether an artifact saved at `artifactVersion` can be loaded
 * by an engine at `currentVersion`.
 *
 * Decision rules (locked in WP-034 Locked Values):
 *
 * - Same `major` + same or lower `minor` + any `patch`: `compatible`.
 * - Same `major` + higher `minor` WITH a registered migration path:
 *   `migratable`. Returns the migration sequence to apply.
 * - Same `major` + higher `minor` WITHOUT a registered migration path:
 *   `incompatible`.
 * - Different `major`: `incompatible` — major-version changes are
 *   breaking and require an explicit migration path.
 * - Missing or non-object `artifactVersion`: `incompatible` — the
 *   engine refuses to guess what an unstamped artifact means.
 *
 * @param artifactVersion - The engine version stamped on the artifact
 *                          at save time (or `null` / `undefined` /
 *                          a non-object value if the stamp is missing
 *                          or unparseable).
 * @param currentVersion - The current engine version (typically from
 *                         `getCurrentEngineVersion()`).
 * @returns A structured result describing the decision.
 */
export function checkCompatibility(
  artifactVersion: EngineVersion | null | undefined,
  currentVersion: EngineVersion,
): CompatibilityResult {
  if (
    artifactVersion === null ||
    artifactVersion === undefined ||
    typeof artifactVersion !== 'object' ||
    typeof artifactVersion.major !== 'number' ||
    typeof artifactVersion.minor !== 'number' ||
    typeof artifactVersion.patch !== 'number'
  ) {
    return buildResult(
      'incompatible',
      'Artifact is missing a valid engineVersion stamp; cannot determine compatibility.',
    );
  }

  const artifact = formatEngineVersion(artifactVersion);
  const current = formatEngineVersion(currentVersion);

  if (artifactVersion.major !== currentVersion.major) {
    return buildResult(
      'incompatible',
      `Artifact engine version ${artifact} differs in major version from current engine version ${current}; major-version changes are breaking and require an explicit migration path which is not present.`,
    );
  }

  if (artifactVersion.minor < currentVersion.minor) {
    return buildResult(
      'compatible',
      `Artifact engine version ${artifact} is compatible with current engine version ${current}.`,
    );
  }

  if (artifactVersion.minor === currentVersion.minor) {
    return buildResult(
      'compatible',
      `Artifact engine version ${artifact} is compatible with current engine version ${current}.`,
    );
  }

  // artifactVersion.minor > currentVersion.minor (same major)
  const migrations = collectMigrationPath(artifactVersion, currentVersion);
  if (migrations === null) {
    return buildResult(
      'incompatible',
      `Artifact engine version ${artifact} is newer than current engine version ${current} and no migration path is registered; refusing to load.`,
    );
  }

  return buildResult(
    'migratable',
    `Artifact engine version ${artifact} requires migration to current engine version ${current}; migrations: [${migrations.join(', ')}].`,
    migrations,
  );
}

/**
 * Builds the immutable `CompatibilityResult` literal. Branches on
 * whether `migrations` is present so the optional field is omitted
 * (per `exactOptionalPropertyTypes`) when absent.
 */
function buildResult(
  status: CompatibilityStatus,
  message: string,
  migrations?: readonly string[],
): CompatibilityResult {
  if (migrations === undefined) {
    return { status, message };
  }
  return { status, message, migrations };
}

/**
 * Looks up a migration path from `fromVersion` to `toVersion` in the
 * registry. Returns the ordered list of migration keys to apply, or
 * `null` if no path exists.
 *
 * MVP only checks for a single direct registered key. A future
 * multi-step path-resolver belongs in `versioning.migrate.ts` once
 * the registry has more than one entry.
 */
function collectMigrationPath(
  fromVersion: EngineVersion,
  toVersion: EngineVersion,
): readonly string[] | null {
  const directKey = buildMigrationKey(fromVersion, toVersion);
  if (directKey in migrationRegistry) {
    return [directKey];
  }
  return null;
}
