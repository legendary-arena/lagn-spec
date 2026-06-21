/**
 * lagnLoadout.ts — converts an uploaded LAGN (Legendary Arena Game Notation,
 * WP-244) Tier-1 document into the MATCH-SETUP composition shape the lobby
 * already knows how to submit, plus the human-readable names LAGN carries for
 * the lobby content preview.
 *
 * Why a converter instead of teaching parseLoadoutJson a second format:
 * parseLoadoutJson (WP-092) is a locked shape guard with a byte-identical
 * WP-093 error template and a closed nine-code error enum. Rather than expand
 * that contract, this module detects a LAGN file, maps its `setup` block onto
 * the composition document shape, and hands the result back as JSON for the
 * existing parser to validate. The flow is: LAGN file → convertLagnUpload →
 * composition-document JSON → parseLoadoutJson → createMatch.
 *
 * This is a hand-rolled shape reader (same philosophy as parseLoadoutJson):
 * the engine's Game.setup() remains the sole authority on whether the
 * referenced ext_ids exist and are well-formed (D-10014). This module never
 * duplicates engine ext_id semantics — it only re-shapes a recognized LAGN
 * document and surfaces obvious structural problems with a full-sentence
 * message before submission. Per docs/ai/ARCHITECTURE.md "Engine Owns Truth".
 *
 * The LAGN field names mirror the published schema in
 * packages/lagn-spec/src/validator.ts (GameSetupSchema): snake_case keys,
 * `{ id, name }` entity objects, and a top-level `player_count`.
 */

/** Human-readable names for the lobby content preview (name falls back to id). */
export interface LagnDisplayNames {
  mastermind: string;
  scheme: string;
  villainGroups: string[];
  henchmanGroups: string[];
  heroes: string[];
}

/**
 * Result of inspecting an uploaded document for the LAGN format.
 * - `not_lagn`: the document is not a LAGN file; the caller falls through to
 *   the MATCH-SETUP parseLoadoutJson path.
 * - `ok`: a well-formed LAGN file; `documentJson` is the composition document
 *   ready for parseLoadoutJson, and `displayNames` drives the preview.
 * - `error`: the document is a LAGN file but structurally malformed; `message`
 *   is a full-sentence explanation.
 */
export type LagnConversion =
  | { kind: 'not_lagn' }
  | { kind: 'ok'; documentJson: string; displayNames: LagnDisplayNames }
  | { kind: 'error'; message: string };

/** Type guard for non-null, non-array plain objects. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads an entity `{ id, name }` object, returning its trimmed id or null when
 * the id is missing or not a non-empty string. The display name falls back to
 * the id when absent (LAGN exports from the Registry Viewer carry ids only).
 */
function readEntity(
  value: unknown,
): { id: string; name: string } | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const id = value['id'];
  if (typeof id !== 'string' || id.length === 0) {
    return null;
  }
  const rawName = value['name'];
  const name = typeof rawName === 'string' && rawName.length > 0 ? rawName : id;
  return { id, name };
}

/**
 * Reads a required array of LAGN entity objects into parallel id and name
 * lists. Returns null when the value is not a non-empty array or any entry is
 * malformed — the caller turns null into a full-sentence error.
 */
function readEntityArray(
  value: unknown,
): { ids: string[]; names: string[] } | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const ids: string[] = [];
  const names: string[] = [];
  for (const entry of value) {
    const entity = readEntity(entry);
    if (entity === null) {
      return null;
    }
    ids.push(entity.id);
    names.push(entity.name);
  }
  return { ids, names };
}

/** Reads a non-negative integer count, or null when absent/invalid. */
function readCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

/**
 * Inspects uploaded text for the LAGN format and, when recognized, converts it
 * to a MATCH-SETUP composition document plus preview names.
 *
 * A document is treated as LAGN when it parses as a JSON object carrying both
 * `lagn_version` and a `setup` object. Malformed JSON returns `not_lagn` so the
 * caller's MATCH-SETUP path surfaces the canonical `invalid_json` error in one
 * place rather than two.
 *
 * @param input - Raw uploaded or pasted file text.
 * @returns A {@link LagnConversion} describing the outcome.
 */
export function convertLagnUpload(input: string): LagnConversion {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    // why: a JSON parse failure is reported by the MATCH-SETUP path's
    // invalid_json branch; returning not_lagn keeps a single error source.
    return { kind: 'not_lagn' };
  }

  if (!isPlainObject(raw) || !('lagn_version' in raw) || !('setup' in raw)) {
    return { kind: 'not_lagn' };
  }

  const setup = raw['setup'];
  if (!isPlainObject(setup)) {
    return {
      kind: 'error',
      message:
        'The uploaded LAGN file is missing its "setup" object, or "setup" is not an object. Re-export the game setup from the Registry Viewer loadout builder at cards.barefootbetters.com.',
    };
  }

  const mastermind = readEntity(setup['mastermind']);
  const scheme = readEntity(setup['scheme']);
  if (mastermind === null || scheme === null) {
    return {
      kind: 'error',
      message:
        'The uploaded LAGN file is missing a valid "setup.mastermind" or "setup.scheme" entry. Each must be an object with a non-empty "id". Re-export the game setup from the Registry Viewer loadout builder.',
    };
  }

  const villainGroups = readEntityArray(setup['villain_groups']);
  const henchmanGroups = readEntityArray(setup['henchmen_groups']);
  const heroes = readEntityArray(setup['heroes']);
  if (villainGroups === null || henchmanGroups === null || heroes === null) {
    return {
      kind: 'error',
      message:
        'The uploaded LAGN file must list at least one entry in each of "setup.villain_groups", "setup.henchmen_groups", and "setup.heroes", and every entry must have a non-empty "id". Re-export the game setup from the Registry Viewer loadout builder.',
    };
  }

  const bystandersCount = readCount(setup['bystanders_count']);
  const woundsCount = readCount(setup['wounds_count']);
  const officersCount = readCount(setup['shield_officers_count']);
  const sidekicksCount = readCount(setup['sidekicks_count']);
  if (
    bystandersCount === null ||
    woundsCount === null ||
    officersCount === null ||
    sidekicksCount === null
  ) {
    return {
      kind: 'error',
      message:
        'The uploaded LAGN file must provide non-negative integer counts for "setup.bystanders_count", "setup.wounds_count", "setup.shield_officers_count", and "setup.sidekicks_count". Re-export the game setup from the Registry Viewer loadout builder.',
    };
  }

  // why: LAGN carries the seat count at the top level as `player_count`; the
  // MATCH-SETUP envelope names it `playerCount`. parseLoadoutJson performs the
  // 1..5 range check, so only basic presence is asserted here.
  const playerCount = raw['player_count'];

  // why: assemble the MATCH-SETUP composition document that parseLoadoutJson
  // already validates. The `shield_officers_count` LAGN field maps to the
  // composition `officersCount` field (the engine's S.H.I.E.L.D. officer pile)
  // per docs/ai/REFERENCE/00.2-data-requirements.md §7.
  const compositionDocument = {
    schemaVersion: '1.0',
    playerCount,
    heroSelectionMode: 'GROUP_STANDARD',
    composition: {
      schemeId: scheme.id,
      mastermindId: mastermind.id,
      villainGroupIds: villainGroups.ids,
      henchmanGroupIds: henchmanGroups.ids,
      heroDeckIds: heroes.ids,
      bystandersCount,
      woundsCount,
      officersCount,
      sidekicksCount,
    },
  };

  const displayNames: LagnDisplayNames = {
    mastermind: mastermind.name,
    scheme: scheme.name,
    villainGroups: villainGroups.names,
    henchmanGroups: henchmanGroups.names,
    heroes: heroes.names,
  };

  return {
    kind: 'ok',
    documentJson: JSON.stringify(compositionDocument),
    displayNames,
  };
}
