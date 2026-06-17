/**
 * Match setup validation for Legendary Arena.
 *
 * validateMatchSetup checks both the shape of the input and the existence
 * of all referenced ext_ids in the card registry. It never throws — it
 * returns a structured ValidateMatchSetupResult. The caller (Game.setup())
 * decides whether to throw based on the result.
 *
 * Per WP-113 D-10014, all five entity-ID fields use the locked
 * `<setAbbr>/<slug>` qualified format. Bare slugs, display names, and
 * flat-card keys are ALL rejected. Format errors fire before existence
 * checks. The validator delegates slug grammar to per-builder
 * slug-source helpers (Class A flat-card-key decoders + Class B set-data
 * iterators) — it never owns slug grammar independently (Authority Lock).
 */

import type {
  MatchSetupConfig,
  MatchSetupError,
  ValidateMatchSetupResult,
} from './matchSetup.types.js';
import {
  extractVillainGroupSlug,
  listHenchmanGroupSlugsInSet,
  type VillainDeckFlatCard,
} from './villainDeck/villainDeck.setup.js';
import { listMastermindSlugsInSet } from './mastermind/mastermind.setup.js';
import { listSchemeSlugsInSet } from './setup/buildSchemeSetupInstructions.js';
import {
  extractHeroSlug,
  type HeroAbilityFlatCard,
} from './setup/heroAbility.setup.js';

// why: D-10014 — validator needs `listSets`/`getSet` to build per-field
// qualified-ID sets; the existing `listCards`-only interface was widened
// in-place per PS-3 Option (i). Real CardRegistry already satisfies the
// wider shape structurally (verified — the four builder readers all
// consume the same underlying registry shape).

/**
 * Minimal registry interface for ext_id existence checks.
 *
 * The real CardRegistry from @legendary-arena/registry satisfies this
 * interface structurally. Defined locally to respect the layer boundary
 * that forbids game-engine from importing registry.
 */
export interface CardRegistryReader {
  /** Returns all cards. The validator uses the key field for ext_id lookup. */
  listCards(): Array<{ key: string }>;
  /** All loaded set index entries. */
  listSets(): Array<{ abbr: string }>;
  /** Full set data for one set. */
  getSet(abbr: string): unknown | undefined;
}

/** The 9 field names that must appear in a valid MatchSetupConfig. */
const STRING_FIELDS = ['schemeId', 'mastermindId'] as const;
const ARRAY_FIELDS = ['villainGroupIds', 'henchmanGroupIds', 'heroDeckIds'] as const;
const COUNT_FIELDS = ['bystandersCount', 'woundsCount', 'officersCount', 'sidekicksCount'] as const;

// why: D-24032 — per-pile supply floors. bystanders / wounds / officers each
// default to 30 (DEFAULT_BYSTANDERS_COUNT / DEFAULT_WOUNDS_COUNT /
// DEFAULT_OFFICERS_COUNT in the Registry Viewer loadout builder). A match
// configured below the floor starts but starves its pile-driven mechanic mid-
// game — the original field bug: a 1-bystander supply made core/spider-man
// Web-Shooters' "Rescue a Bystander" a silent no-op once that lone bystander
// was captured/consumed. Sidekicks default to 0 (a match may legitimately use
// no sidekicks), so their floor is 0 — i.e. the pre-existing non-negative
// check, unchanged. The engine is the authoritative match-setup gate
// (ARCHITECTURE.md "Engine Owns Truth"), so the floor lives here and aborts
// Game.setup() like every other setup error.
const COUNT_FIELD_MINIMUMS: Readonly<Record<(typeof COUNT_FIELDS)[number], number>> = {
  bystandersCount: 30,
  woundsCount: 30,
  officersCount: 30,
  sidekicksCount: 0,
};

/**
 * Checks whether a value is a non-null object (not an array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks whether a value is a non-empty array of strings.
 */
function isNonEmptyStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether a value is a non-negative integer.
 */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Parses a set-qualified ID `<setAbbr>/<slug>` into its components.
 *
 * Returns null on any malformed input — empty string, missing slash,
 * multiple slashes, empty parts, or leading/trailing whitespace. The
 * validator emits a format-error before the existence check on null
 * parse results.
 */
// why: D-10014 — single source of truth for the qualified-ID envelope
// grammar. Builders may duplicate this logic locally (Authority Lock
// permits — see WP-113 §6 step 1). The validator owns the surrounding
// envelope grammar; per-builder helpers own the slug grammar within.
export function parseQualifiedId(input: string): { setAbbr: string; slug: string } | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  if (input !== input.trim()) return null;
  const slashIndex = input.indexOf('/');
  if (slashIndex === -1) return null;
  if (input.indexOf('/', slashIndex + 1) !== -1) return null;
  const setAbbr = input.slice(0, slashIndex);
  const slug = input.slice(slashIndex + 1);
  if (setAbbr.length === 0 || slug.length === 0) return null;
  return { setAbbr, slug };
}

/**
 * Builds a set of known ext_id strings from the card registry.
 *
 * @deprecated Per WP-113 D-10014, no entity-ID field uses flat-card-key
 * validation any longer; callers were migrated to the per-field
 * `buildKnownXxxQualifiedIds` helpers. Retained for one release cycle
 * as a forensic-debugging aid; no current consumers. Removal is scoped
 * to a follow-up cleanup WP.
 */
// why: D-10014 — deprecated; remove in follow-up cleanup WP — no
// current consumers.
export function buildKnownExtIds(registry: CardRegistryReader): Set<string> {
  const cards = registry.listCards();
  const knownIds = new Set<string>();
  for (const card of cards) {
    knownIds.add(card.key);
  }
  return knownIds;
}

/**
 * Builds a set of qualified `<setAbbr>/<slug>` IDs for all known
 * scheme entries across all loaded sets.
 *
 * Delegates slug grammar to `listSchemeSlugsInSet` (Class B set-data
 * slug enumerator) per the Authority Lock.
 */
// why: D-10014 — delegate to builder-owned slug-source helper.
function buildKnownSchemeQualifiedIds(registry: CardRegistryReader): Set<string> {
  const known = new Set<string>();
  for (const setEntry of registry.listSets()) {
    const setData = registry.getSet(setEntry.abbr);
    for (const slug of listSchemeSlugsInSet(setData)) {
      known.add(`${setEntry.abbr}/${slug}`);
    }
  }
  return known;
}

/**
 * Builds a set of qualified `<setAbbr>/<slug>` IDs for all known
 * mastermind entries across all loaded sets.
 */
// why: D-10014 — delegate to builder-owned slug-source helper.
function buildKnownMastermindQualifiedIds(registry: CardRegistryReader): Set<string> {
  const known = new Set<string>();
  for (const setEntry of registry.listSets()) {
    const setData = registry.getSet(setEntry.abbr);
    for (const slug of listMastermindSlugsInSet(setData)) {
      known.add(`${setEntry.abbr}/${slug}`);
    }
  }
  return known;
}

/**
 * Builds a set of qualified `<setAbbr>/<slug>` IDs for all known
 * villain groups across all loaded sets.
 *
 * Derives `(setAbbr, groupSlug)` pairs from villain flat cards via
 * `extractVillainGroupSlug` (Class A flat-card-key decoder).
 */
// why: D-10014 — delegate to builder-owned slug-source helper.
function buildKnownVillainGroupQualifiedIds(registry: CardRegistryReader): Set<string> {
  const known = new Set<string>();
  for (const card of registry.listCards()) {
    const villainCard = card as VillainDeckFlatCard;
    if (villainCard.cardType !== 'villain') continue;
    if (typeof villainCard.setAbbr !== 'string') continue;
    if (typeof villainCard.slug !== 'string') continue;
    if (typeof villainCard.key !== 'string') continue;
    const groupSlug = extractVillainGroupSlug(villainCard);
    if (groupSlug.length === 0) continue;
    known.add(`${villainCard.setAbbr}/${groupSlug}`);
  }
  return known;
}

/**
 * Builds a set of qualified `<setAbbr>/<slug>` IDs for all known
 * henchman groups across all loaded sets.
 */
// why: D-10014 — delegate to builder-owned slug-source helper.
function buildKnownHenchmanGroupQualifiedIds(registry: CardRegistryReader): Set<string> {
  const known = new Set<string>();
  for (const setEntry of registry.listSets()) {
    const setData = registry.getSet(setEntry.abbr);
    for (const slug of listHenchmanGroupSlugsInSet(setData)) {
      known.add(`${setEntry.abbr}/${slug}`);
    }
  }
  return known;
}

/**
 * Builds a set of qualified `<setAbbr>/<slug>` IDs for all known
 * heroes across all loaded sets.
 *
 * Derives `(setAbbr, heroSlug)` pairs from hero flat cards via
 * `extractHeroSlug` (Class A flat-card-key decoder).
 */
// why: D-10014 — delegate to builder-owned slug-source helper.
function buildKnownHeroQualifiedIds(registry: CardRegistryReader): Set<string> {
  const known = new Set<string>();
  for (const card of registry.listCards()) {
    const heroCard = card as HeroAbilityFlatCard;
    if (heroCard.cardType !== 'hero') continue;
    if (typeof heroCard.setAbbr !== 'string') continue;
    if (typeof heroCard.key !== 'string') continue;
    const heroSlug = extractHeroSlug(heroCard);
    if (heroSlug.length === 0) continue;
    known.add(`${heroCard.setAbbr}/${heroSlug}`);
  }
  return known;
}

/**
 * Sets used by the loaded set existence check ("set not loaded" vs
 * "slug not in that set" distinction in error messages).
 */
function buildLoadedSetAbbrs(registry: CardRegistryReader): Set<string> {
  const loaded = new Set<string>();
  for (const setEntry of registry.listSets()) {
    if (typeof setEntry.abbr === 'string' && setEntry.abbr.length > 0) {
      loaded.add(setEntry.abbr);
    }
  }
  return loaded;
}

/**
 * Validates the shape of the match setup input — type and structural
 * checks for the 9 fields. Pushes errors onto the shared accumulator.
 * Returns true if the shape is valid (so callers can proceed to
 * existence checks), false otherwise.
 */
function validateShape(input: Record<string, unknown>, errors: MatchSetupError[]): boolean {
  // why: Empty strings pass this type check intentionally. Format and
  // existence checks in validateExistence below catch them.
  for (const fieldName of STRING_FIELDS) {
    if (typeof input[fieldName] !== 'string') {
      errors.push({
        field: fieldName,
        message: `The ${fieldName} field must be a string containing a set-qualified ext_id of the form "<setAbbr>/<slug>" (e.g., "core/legacy-virus").`,
      });
    }
  }

  for (const fieldName of ARRAY_FIELDS) {
    if (!isNonEmptyStringArray(input[fieldName])) {
      errors.push({
        field: fieldName,
        message: `The ${fieldName} field must be a non-empty array of set-qualified ext_id strings of the form "<setAbbr>/<slug>" (e.g., "core/black-widow").`,
      });
    }
  }

  for (const fieldName of COUNT_FIELDS) {
    const countValue = input[fieldName];
    if (!isNonNegativeInteger(countValue)) {
      errors.push({
        field: fieldName,
        message: `The ${fieldName} field must be a non-negative integer.`,
      });
      continue;
    }
    // why: D-24032 — the supply-floor check runs only after the value is a
    // confirmed non-negative integer, so a bad-type value still reports the
    // type error above rather than the floor error.
    const minimumCount = COUNT_FIELD_MINIMUMS[fieldName];
    if (countValue < minimumCount) {
      errors.push({
        field: fieldName,
        message: `The ${fieldName} field must be at least ${minimumCount} so the supply pile does not run dry during play; received ${countValue}. Re-export the loadout from the Registry Viewer, whose defaults satisfy this minimum.`,
      });
    }
  }

  return errors.length === 0;
}

/**
 * Validates a single qualified-ID field against the parse grammar, the
 * loaded-sets index, and the per-field known-IDs set. Pushes errors
 * onto the shared accumulator with field-specific messages. Per
 * D-10014, the parse-error fires first; "set not loaded" fires before
 * "slug not in that set".
 */
// why: D-10014 — slug-vs-key contract per field. Format errors precede
// existence checks; existence checks distinguish set-not-loaded from
// slug-missing for actionable remediation.
function validateQualifiedIdField(
  fieldName: string,
  rawValue: string,
  knownQualified: Set<string>,
  loadedSetAbbrs: Set<string>,
  errors: MatchSetupError[],
  entityKind: string,
  exampleQualifiedId: string,
): void {
  const parsed = parseQualifiedId(rawValue);
  if (parsed === null) {
    errors.push({
      field: fieldName,
      message: `The ${fieldName} value "${rawValue}" is not in the locked qualified form "<setAbbr>/<slug>" (e.g., "${exampleQualifiedId}"). Bare slugs, display names, and flat-card keys are rejected per D-10014.`,
    });
    return;
  }

  if (!loadedSetAbbrs.has(parsed.setAbbr)) {
    errors.push({
      field: fieldName,
      message: `The ${fieldName} value "${rawValue}" references set "${parsed.setAbbr}", which is not loaded. Verify that the set abbreviation is correct and that data/cards/${parsed.setAbbr}.json was loaded by the registry.`,
    });
    return;
  }

  if (!knownQualified.has(rawValue)) {
    errors.push({
      field: fieldName,
      message: `The ${fieldName} value "${rawValue}" does not match any known ${entityKind} in set "${parsed.setAbbr}". Verify that "${parsed.slug}" is the correct slug within that set's ${entityKind}s.`,
    });
  }
}

/**
 * Validates existence of all referenced qualified IDs against the
 * registry. Builds five per-field known-ID sets up front, then runs
 * each field through validateQualifiedIdField.
 */
function validateExistence(
  input: Record<string, unknown>,
  registry: CardRegistryReader,
  errors: MatchSetupError[],
): void {
  const loadedSetAbbrs = buildLoadedSetAbbrs(registry);
  const knownSchemes = buildKnownSchemeQualifiedIds(registry);
  const knownMasterminds = buildKnownMastermindQualifiedIds(registry);
  const knownVillainGroups = buildKnownVillainGroupQualifiedIds(registry);
  const knownHenchmanGroups = buildKnownHenchmanGroupQualifiedIds(registry);
  const knownHeroes = buildKnownHeroQualifiedIds(registry);

  validateQualifiedIdField(
    'schemeId',
    input.schemeId as string,
    knownSchemes,
    loadedSetAbbrs,
    errors,
    'scheme',
    'core/legacy-virus',
  );

  validateQualifiedIdField(
    'mastermindId',
    input.mastermindId as string,
    knownMasterminds,
    loadedSetAbbrs,
    errors,
    'mastermind',
    'core/dr-doom',
  );

  for (const value of input.villainGroupIds as string[]) {
    validateQualifiedIdField(
      'villainGroupIds',
      value,
      knownVillainGroups,
      loadedSetAbbrs,
      errors,
      'villain group',
      'core/brotherhood',
    );
  }

  for (const value of input.henchmanGroupIds as string[]) {
    validateQualifiedIdField(
      'henchmanGroupIds',
      value,
      knownHenchmanGroups,
      loadedSetAbbrs,
      errors,
      'henchman group',
      'core/savage-land-mutates',
    );
  }

  for (const value of input.heroDeckIds as string[]) {
    validateQualifiedIdField(
      'heroDeckIds',
      value,
      knownHeroes,
      loadedSetAbbrs,
      errors,
      'hero',
      'core/black-widow',
    );
  }
}

/**
 * Validates a match setup payload against the MatchSetupConfig contract
 * and the card registry.
 *
 * Checks are performed in order:
 * 1. Shape: all 9 fields present, correct type, non-empty arrays,
 *    non-negative integers.
 * 2. Existence (qualified-ID format): each entity-ID is parsed as
 *    `<setAbbr>/<slug>`. Format errors fire first; "set not loaded"
 *    fires before "slug not in that set".
 *
 * Never throws. Returns a structured result.
 *
 * @param input - The unvalidated input to check (typically from a lobby request).
 * @param registry - The card registry for ext_id existence checks.
 * @returns A ValidateMatchSetupResult — either ok with the validated config,
 *          or not ok with an array of errors.
 */
export function validateMatchSetup(
  input: unknown,
  registry: CardRegistryReader,
): ValidateMatchSetupResult {
  const errors: MatchSetupError[] = [];

  if (!isPlainObject(input)) {
    errors.push({
      field: 'input',
      message: 'The match setup input must be a non-null object.',
    });
    return { ok: false, errors };
  }

  const shapeOk = validateShape(input, errors);

  // why: If shape validation already failed, existence checks would
  // produce misleading errors (e.g., trying to look up undefined as a
  // qualified ID). Return early with the shape errors so the caller
  // gets actionable feedback.
  if (!shapeOk) {
    return { ok: false, errors };
  }

  // why: D-10014 — per-field qualified-ID validation. Format-error
  // fires before existence check on parse failure; "set not loaded"
  // fires before "slug not in that set". Validator delegates slug
  // grammar to per-builder helpers (Authority Lock).
  validateExistence(input, registry, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // why: At this point all shape and existence checks have passed. The
  // input is safe to cast to MatchSetupConfig because we verified every
  // field individually above.
  const validConfig: MatchSetupConfig = {
    schemeId: input.schemeId as string,
    mastermindId: input.mastermindId as string,
    villainGroupIds: input.villainGroupIds as string[],
    henchmanGroupIds: input.henchmanGroupIds as string[],
    heroDeckIds: input.heroDeckIds as string[],
    bystandersCount: input.bystandersCount as number,
    woundsCount: input.woundsCount as number,
    officersCount: input.officersCount as number,
    sidekicksCount: input.sidekicksCount as number,
  };

  return { ok: true, value: validConfig };
}
