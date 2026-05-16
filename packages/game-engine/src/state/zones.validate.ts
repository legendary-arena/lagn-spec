/**
 * Pure runtime shape validators for zone and player state structures.
 *
 * These validators confirm that a value has the correct structural shape
 * for game state zones. They do NOT validate card identity, semantics,
 * or gameplay rules — shape only.
 *
 * No boardgame.io imports allowed — this is a pure helper module.
 */

import type { ZoneValidationError } from './zones.types.js';

// why: Validators return structured results instead of throwing because
// callers need to inspect all validation failures at once (not just the
// first one). Throwing on the first error would hide subsequent problems
// and force callers into try/catch control flow. Structured results let
// the caller decide how to handle errors — log them, display them, or
// abort the operation.

/** Canonical keys that must be present in every PlayerZones object. */
const PLAYER_ZONE_KEYS = ['deck', 'hand', 'discard', 'inPlay', 'victory'] as const;

/** Canonical keys that must be present in every GlobalPiles object. */
const GLOBAL_PILE_KEYS = ['bystanders', 'wounds', 'officers', 'sidekicks', 'horrors'] as const;

/**
 * Checks whether a value is a non-null object (not an array).
 *
 * @param value - The value to check.
 * @returns True if the value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates that a value is a Zone (an array of strings).
 *
 * @param value - The value to check.
 * @param fieldPath - The field path for error reporting.
 * @param errors - The error accumulator to append to.
 */
function validateZoneShape(
  value: unknown,
  fieldPath: string,
  errors: ZoneValidationError[],
): void {
  if (!Array.isArray(value)) {
    errors.push({
      field: fieldPath,
      message: `Expected ${fieldPath} to be an array, but got ${typeof value}.`,
    });
    return;
  }

  for (let index = 0; index < value.length; index++) {
    if (typeof value[index] !== 'string') {
      errors.push({
        field: `${fieldPath}[${index}]`,
        message: `Expected ${fieldPath}[${index}] to be a string (CardExtId), but got ${typeof value[index]}.`,
      });
    }
  }
}

/**
 * Validates that a value has the correct PlayerZones shape (5 zone arrays).
 *
 * @param value - The value to check.
 * @param fieldPath - The field path for error reporting.
 * @param errors - The error accumulator to append to.
 */
function validatePlayerZonesShape(
  value: unknown,
  fieldPath: string,
  errors: ZoneValidationError[],
): void {
  if (!isPlainObject(value)) {
    errors.push({
      field: fieldPath,
      message: `Expected ${fieldPath} to be an object, but got ${typeof value}.`,
    });
    return;
  }

  for (const zoneKey of PLAYER_ZONE_KEYS) {
    validateZoneShape(value[zoneKey], `${fieldPath}.${zoneKey}`, errors);
  }
}

/**
 * Validates that a value has the correct GlobalPiles shape (4 pile arrays).
 *
 * @param value - The value to check.
 * @param fieldPath - The field path for error reporting.
 * @param errors - The error accumulator to append to.
 */
function validateGlobalPilesShape(
  value: unknown,
  fieldPath: string,
  errors: ZoneValidationError[],
): void {
  if (!isPlainObject(value)) {
    errors.push({
      field: fieldPath,
      message: `Expected ${fieldPath} to be an object, but got ${typeof value}.`,
    });
    return;
  }

  for (const pileKey of GLOBAL_PILE_KEYS) {
    validateZoneShape(value[pileKey], `${fieldPath}.${pileKey}`, errors);
  }
}

/**
 * Validates that an unknown value has the structural shape of GameStateShape.
 *
 * Checks that playerZones is a record of PlayerZones objects and that piles
 * has the correct GlobalPiles shape. Does NOT validate card identity, counts,
 * cross-zone uniqueness, or gameplay rules.
 *
 * @param input - The value to validate (typically a game state object).
 * @returns Structured result: { ok: true } or { ok: false, errors }.
 */
export function validateGameStateShape(
  input: unknown,
): { ok: true } | { ok: false; errors: ZoneValidationError[] } {
  const errors: ZoneValidationError[] = [];

  if (!isPlainObject(input)) {
    errors.push({
      field: 'root',
      message: `Expected game state to be an object, but got ${typeof input}.`,
    });
    return { ok: false, errors };
  }

  // Validate playerZones
  if (!isPlainObject(input['playerZones'])) {
    errors.push({
      field: 'playerZones',
      message: 'Expected playerZones to be an object containing per-player zone records.',
    });
  } else {
    const playerZones = input['playerZones'] as Record<string, unknown>;

    for (const playerId of Object.keys(playerZones)) {
      validatePlayerZonesShape(
        playerZones[playerId],
        `playerZones.${playerId}`,
        errors,
      );
    }
  }

  // Validate piles
  validateGlobalPilesShape(input['piles'], 'piles', errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}

/**
 * Validates that an unknown value has the structural shape of PlayerState.
 *
 * Checks that playerId is a string and that zones has the correct PlayerZones
 * shape. Does NOT validate card identity or gameplay rules.
 *
 * @param input - The value to validate (typically a player state object).
 * @returns Structured result: { ok: true } or { ok: false, errors }.
 */
export function validatePlayerStateShape(
  input: unknown,
): { ok: true } | { ok: false; errors: ZoneValidationError[] } {
  const errors: ZoneValidationError[] = [];

  if (!isPlainObject(input)) {
    errors.push({
      field: 'root',
      message: `Expected player state to be an object, but got ${typeof input}.`,
    });
    return { ok: false, errors };
  }

  if (typeof input['playerId'] !== 'string') {
    errors.push({
      field: 'playerId',
      message: `Expected playerId to be a string, but got ${typeof input['playerId']}.`,
    });
  }

  if (!isPlainObject(input['zones'])) {
    errors.push({
      field: 'zones',
      message: 'Expected zones to be an object containing player zone arrays.',
    });
  } else {
    validatePlayerZonesShape(input['zones'], 'zones', errors);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true };
}
