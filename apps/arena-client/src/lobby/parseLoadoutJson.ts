/**
 * Pure shape-guard parser for MATCH-SETUP JSON documents uploaded or pasted
 * into the arena-client lobby (WP-092). Produced by the Registry Viewer
 * loadout builder (WP-091); validated authoritatively server-side inside
 * Game.setup() via matchSetup.validate.ts.
 */

// why: this is a SHAPE GUARD, not a validator. The arena-client lobby uses
// this parser to give immediate authoring feedback when a user uploads or
// pastes a MATCH-SETUP JSON document produced by the Registry Viewer
// (WP-091). Authoritative validation — including ext_id existence,
// uniqueness, structural cross-field invariants, and rule-mode policy — is
// performed server-side inside Game.setup() via the engine's
// matchSetup.validate.ts module. This guard only catches obvious shape
// problems before submission so the user sees a full-sentence error in the
// lobby instead of a server-side stack trace. Per docs/ai/ARCHITECTURE.md
// "Engine Owns Truth", the engine remains the sole authority on whether a
// setup is valid; this module never duplicates ext_id semantics. Layer
// boundary (.claude/rules/architecture.md): the arena-client app must not
// import the registry package at runtime, so the WP-091 registry-side
// validator is not consumed here; the primitive shape predicates are
// re-derived by hand and the WP-093 error template is mirrored
// byte-for-byte (cross-file byte-identity gate at pre-commit).

// why: v1 enum has exactly one member per WP-093 D-9301. The locked error
// template's reserved-future note covers the unsupported-modes side; this
// type literal must not be widened ad-hoc here. Any future expansion
// requires a new WP that amends WP-093 first.
export type HeroSelectionMode = 'GROUP_STANDARD';

// why: byte-for-byte mirror of the D-9301 / WP-093 canonical error template.
// Authoritative copies also live at:
//   - docs/ai/DECISIONS.md (D-9301)
//   - docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md
//   - packages/registry/src/setupContract/setupContract.types.ts:117
// The arena-client layer rule forbids importing the registry package
// at runtime, so this fifth copy is hand-maintained. The cross-file
// byte-identity grep gate (session prompt §11 Step 11) catches drift across
// all five locations. Paraphrasing, template-literal reassembly, smart-quote
// substitution, em-dash drift, or trailing-whitespace variation is a
// session abort condition (EC-092 §Session Abort Conditions). The only
// permitted transformation is substituting <value> via
// renderUnsupportedModeMessage().
export const UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE =
  "The loadout envelope's heroSelectionMode is <value>, which is not a supported rule mode in v1 of the match setup schema. Supported modes: GROUP_STANDARD. (HERO_DRAFT is reserved for a future release and is not yet implemented.)";

/**
 * Substitutes the observed value into the locked WP-093 error template.
 * The substitution is the only permitted transformation; never construct
 * an alternative phrasing.
 */
export function renderUnsupportedModeMessage(value: unknown): string {
  return UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE.replace(
    '<value>',
    String(value),
  );
}

// why: single-home message for the WP-254 (D-24025) lobby qualified-form
// ext_id guard. Unlike UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE above, this
// message is DELIBERATELY NOT part of the WP-093 five-copy byte-identity gate
// (D-9301): it lives in exactly this one place and carries no cross-file lock,
// so it is documented (not byte-locked) in MATCH-SETUP-VALIDATION.md. Do not
// add it to the five-copy gate, and do not reuse or paraphrase the
// heroSelectionMode template. The template uses literal angle brackets
// (<field>, <value>, <setAbbr>/<slug>) — mirroring the literal <value> in the
// template above — never HTML entities; <field> and <value> are the only
// permitted substitutions.
const UNQUALIFIED_EXT_ID_TEMPLATE =
  'The loadout field "<field>" value "<value>" is not a set-qualified ext_id of the form "<setAbbr>/<slug>" (for example, "core/black-widow"). This usually means the loadout was exported before the qualified-ext_id fix; re-export it from the Registry Viewer loadout builder at cards.barefootbetters.com.';

/**
 * Substitutes the failing field path and the offending value into the
 * single-home WP-254 message. Module-private (unlike the exported
 * renderUnsupportedModeMessage): the new message has no cross-file contract,
 * so nothing outside this module constructs it. `<field>` is substituted
 * before `<value>`; field paths never contain the literal "<value>", so the
 * substitution order is unambiguous.
 */
function renderUnqualifiedExtIdMessage(field: string, value: string): string {
  return UNQUALIFIED_EXT_ID_TEMPLATE.replace('<field>', field).replace(
    '<value>',
    value,
  );
}

/**
 * Successful parse output. The composition block matches MatchSetupConfig's
 * 9-field lock from docs/ai/REFERENCE/00.2-data-requirements.md §7. The
 * playerCount and heroSelectionMode fields are envelope-level; other
 * envelope fields (setupId, createdAt, createdBy, seed, themeId,
 * expansions) are dropped on submission per WP-092 D-9201.
 */
export interface ParsedLoadout {
  composition: {
    schemeId: string;
    mastermindId: string;
    villainGroupIds: string[];
    henchmanGroupIds: string[];
    heroDeckIds: string[];
    bystandersCount: number;
    woundsCount: number;
    officersCount: number;
    sidekicksCount: number;
  };
  playerCount: number;
  // why: included so callers can log or branch on rule mode in the future
  // without re-parsing the raw JSON; v1 value is always "GROUP_STANDARD"
  // per WP-093 D-9301. Single-site default normalization (RS-3): if the
  // input JSON omits heroSelectionMode, parseLoadoutJson() materializes
  // "GROUP_STANDARD" exactly once before returning, so downstream callers
  // (LobbyView.vue, lobbyApi.ts) never see undefined. Duplicate
  // nullish-coalescing-to-default fallbacks anywhere else are forbidden.
  heroSelectionMode: HeroSelectionMode;
}

/**
 * Locked enum of ten error codes; expansion requires a new WP. The tenth
 * member, "unqualified_ext_id", was added by WP-254 (D-24025) — the lobby
 * qualified-form ext_id guard. The original nine are byte-unchanged in
 * spelling and declaration order.
 */
export type ParseErrorCode =
  | 'invalid_json'
  | 'not_object'
  | 'missing_composition'
  | 'composition_not_object'
  | 'missing_field'
  | 'wrong_type'
  | 'missing_player_count'
  | 'player_count_out_of_range'
  | 'unsupported_hero_selection_mode'
  | 'unqualified_ext_id';

/**
 * A single parse error. `field` is a dot-path (e.g.,
 * "composition.schemeId" or "playerCount") when the error names a specific
 * field; absent for root-level shape failures. The presence of `field` is
 * locked per code (see WP-092 session prompt §3.8).
 */
export interface ParseError {
  code: ParseErrorCode;
  message: string;
  field?: string;
}

/**
 * Discriminated union returned by parseLoadoutJson. The parser never
 * throws; every failure path returns `{ ok: false, error: ... }`.
 */
export type ParseResult =
  | { ok: true; value: ParsedLoadout }
  | { ok: false; error: ParseError };

/** Type guard for non-null, non-array plain objects. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

/**
 * True iff `value` is an array whose every entry is a non-empty string.
 * Empty arrays return true (the parser accepts empty arrays at the shape
 * level; semantic minimum-length checks are server-side).
 */
function isArrayOfNonEmptyStrings(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) {
      return false;
    }
  }
  return true;
}

/** True iff `value` is a JS number that is a non-negative integer. */
function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0
  );
}

interface CompositionFieldSpec {
  readonly name: string;
  readonly kind: 'string' | 'string-array' | 'non-negative-integer';
}

const COMPOSITION_FIELDS: readonly CompositionFieldSpec[] = [
  { name: 'schemeId', kind: 'string' },
  { name: 'mastermindId', kind: 'string' },
  { name: 'villainGroupIds', kind: 'string-array' },
  { name: 'henchmanGroupIds', kind: 'string-array' },
  { name: 'heroDeckIds', kind: 'string-array' },
  { name: 'bystandersCount', kind: 'non-negative-integer' },
  { name: 'woundsCount', kind: 'non-negative-integer' },
  { name: 'officersCount', kind: 'non-negative-integer' },
  { name: 'sidekicksCount', kind: 'non-negative-integer' },
];

/** Renders the expected-type clause for a wrong_type error message. */
function describeKind(kind: CompositionFieldSpec['kind']): string {
  if (kind === 'string') {
    return 'a string ext_id';
  }
  if (kind === 'string-array') {
    return 'an array of non-empty string ext_ids';
  }
  return 'a non-negative integer';
}

/**
 * True iff `value` is in the set-qualified `<setAbbr>/<slug>` envelope form:
 * no surrounding whitespace, exactly one slash, and a non-empty part on each
 * side of it. Mirrors the engine's authoritative qualified-ID envelope
 * grammar (parseQualifiedId in matchSetup.validate.ts, D-10014).
 */
// why: re-derived by hand rather than imported. parseQualifiedId lives on the
// engine setup-tooling surface (@legendary-arena/game-engine/setup), and the
// arena-client layer must not import the registry or that engine surface at
// runtime (.claude/rules/architecture.md Import Rules; D-14401). This module
// already re-derives its other shape predicates for the same reason.
// why: the check is the slash ENVELOPE only — never a [a-z0-9-] charset check.
// The engine owns charset/existence (D-10014, D-24025); a lobby charset check
// could reject an id the engine would accept, the inverse of the D-24018 bug
// this guard exists to keep from re-appearing. Grammar-only here is deliberate.
function isQualifiedExtId(value: string): boolean {
  if (value !== value.trim()) {
    return false;
  }
  const firstSlashIndex = value.indexOf('/');
  if (firstSlashIndex === -1) {
    return false;
  }
  if (value.indexOf('/', firstSlashIndex + 1) !== -1) {
    return false;
  }
  const setAbbr = value.slice(0, firstSlashIndex);
  const slug = value.slice(firstSlashIndex + 1);
  if (setAbbr.length === 0 || slug.length === 0) {
    return false;
  }
  return true;
}

/**
 * Walks one composition array field (villainGroupIds, henchmanGroupIds, or
 * heroDeckIds) and returns an `unqualified_ext_id` ParseError for the FIRST
 * entry that fails the qualified-form envelope, or null if every entry is
 * qualified. The offender's field uses bracket notation
 * (`composition.<name>[<index>]`), mirroring the engine validator's
 * checkArrayExtIds field style. Entries are already non-empty strings (the
 * COMPOSITION_FIELDS type-check loop guarantees it before this runs).
 */
function findUnqualifiedArrayEntry(
  fieldName: string,
  entries: readonly string[],
): ParseError | null {
  // why: iterate with .entries() rather than an indexed for: under
  // noUncheckedIndexedAccess, entries[index] is `string | undefined`, but
  // .entries() yields the element type (`string`) alongside the index, so no
  // non-null assertion is needed. Entries are already non-empty strings.
  for (const [index, entry] of entries.entries()) {
    if (!isQualifiedExtId(entry)) {
      const field = `composition.${fieldName}[${index}]`;
      return {
        code: 'unqualified_ext_id',
        message: renderUnqualifiedExtIdMessage(field, entry),
        field,
      };
    }
  }
  return null;
}

/**
 * Parses a MATCH-SETUP JSON document into a ParsedLoadout, or returns a
 * structured ParseError describing the first failure encountered. Pure,
 * side-effect free, and never throws.
 *
 * Control flow follows WP-092 §Scope (In) A bullet 5 steps 1–8:
 *   1. JSON.parse in try/catch → invalid_json
 *   2. Root is a plain object → not_object
 *   3. composition property exists → missing_composition
 *   4. composition is a plain object → composition_not_object
 *   5. Each of the nine composition fields: presence, then primitive type
 *   6. envelope playerCount exists and is an integer → missing_player_count
 *   7. envelope playerCount in [1, 5] → player_count_out_of_range
 *   8. envelope heroSelectionMode is absent or "GROUP_STANDARD" →
 *      unsupported_hero_selection_mode (WP-093 template, byte-for-byte)
 *
 * On success, `heroSelectionMode` is normalized to "GROUP_STANDARD" exactly
 * once (RS-3 single-site default normalization). Other envelope fields
 * (setupId, createdAt, createdBy, seed, themeId, expansions, schemaVersion)
 * are accepted permissively and dropped from the output.
 */
export function parseLoadoutJson(input: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (parseError) {
    const cause =
      parseError instanceof Error ? parseError.message : String(parseError);
    return {
      ok: false,
      error: {
        code: 'invalid_json',
        message: `The loadout JSON could not be parsed. JSON.parse reported: ${cause}. Confirm the file was produced by the Registry Viewer loadout builder at cards.barefootbetters.com and was not modified by hand.`,
      },
    };
  }

  if (!isPlainObject(raw)) {
    return {
      ok: false,
      error: {
        code: 'not_object',
        message:
          'The loadout JSON document must be a JSON object at its root. Arrays, numbers, strings, booleans, and null are not accepted. Re-export the document from the Registry Viewer loadout builder.',
      },
    };
  }

  if (!('composition' in raw)) {
    return {
      ok: false,
      error: {
        code: 'missing_composition',
        message:
          'The loadout JSON document is missing its "composition" property at the root. Confirm the file was produced by the Registry Viewer loadout builder; the composition block is mandatory.',
      },
    };
  }

  const compositionRaw = raw['composition'];
  if (!isPlainObject(compositionRaw)) {
    return {
      ok: false,
      error: {
        code: 'composition_not_object',
        message:
          'The "composition" property of the loadout JSON document must be a JSON object. Arrays and primitive values are not accepted. Re-export the document from the Registry Viewer loadout builder.',
      },
    };
  }

  for (const spec of COMPOSITION_FIELDS) {
    const fieldPath = `composition.${spec.name}`;
    if (!(spec.name in compositionRaw)) {
      return {
        ok: false,
        error: {
          code: 'missing_field',
          message: `The loadout JSON document is missing the required field "${fieldPath}". Re-export the document from the Registry Viewer loadout builder; all nine composition fields are mandatory.`,
          field: fieldPath,
        },
      };
    }
    const fieldValue = compositionRaw[spec.name];
    let typeMatches = false;
    if (spec.kind === 'string') {
      typeMatches = typeof fieldValue === 'string';
    } else if (spec.kind === 'string-array') {
      typeMatches = isArrayOfNonEmptyStrings(fieldValue);
    } else {
      typeMatches = isNonNegativeInteger(fieldValue);
    }
    if (!typeMatches) {
      return {
        ok: false,
        error: {
          code: 'wrong_type',
          message: `The loadout JSON field "${fieldPath}" must be ${describeKind(spec.kind)}. Re-export the document from the Registry Viewer loadout builder.`,
          field: fieldPath,
        },
      };
    }
  }

  // why: this qualified-form pass runs ONLY after the COMPOSITION_FIELDS
  // type-check loop above has fully succeeded — every entity-id is now known
  // to be a string (scalars) or an array of non-empty strings (arrays), so the
  // <setAbbr>/<slug> envelope grammar is meaningful (checking it earlier could
  // dereference a non-string). It runs BEFORE the playerCount checks so a
  // stale id-space loadout — the WP-254 defect: pre-D-24018 flat keys
  // ("core-scheme-midtown-bank-robbery") or bare slugs ("black-widow") that
  // 500 inside Game.setup() — fails in the lobby as soon as the composition is
  // structurally valid. Fail-fast and deterministic: the two scalars first,
  // then the arrays in declaration order (villain → henchman → hero), first
  // offender returned.
  const schemeIdValue = compositionRaw['schemeId'] as string;
  if (!isQualifiedExtId(schemeIdValue)) {
    return {
      ok: false,
      error: {
        code: 'unqualified_ext_id',
        message: renderUnqualifiedExtIdMessage(
          'composition.schemeId',
          schemeIdValue,
        ),
        field: 'composition.schemeId',
      },
    };
  }

  const mastermindIdValue = compositionRaw['mastermindId'] as string;
  if (!isQualifiedExtId(mastermindIdValue)) {
    return {
      ok: false,
      error: {
        code: 'unqualified_ext_id',
        message: renderUnqualifiedExtIdMessage(
          'composition.mastermindId',
          mastermindIdValue,
        ),
        field: 'composition.mastermindId',
      },
    };
  }

  const qualifiedArrayFieldNames = [
    'villainGroupIds',
    'henchmanGroupIds',
    'heroDeckIds',
  ];
  for (const arrayFieldName of qualifiedArrayFieldNames) {
    const entries = compositionRaw[arrayFieldName] as string[];
    const arrayError = findUnqualifiedArrayEntry(arrayFieldName, entries);
    if (arrayError !== null) {
      return { ok: false, error: arrayError };
    }
  }

  if (!('playerCount' in raw)) {
    return {
      ok: false,
      error: {
        code: 'missing_player_count',
        message:
          'The loadout JSON envelope is missing the required field "playerCount". Re-export the document from the Registry Viewer loadout builder; playerCount must be an integer in the range 1..5.',
        field: 'playerCount',
      },
    };
  }

  const playerCountRaw = raw['playerCount'];
  if (typeof playerCountRaw !== 'number' || !Number.isInteger(playerCountRaw)) {
    return {
      ok: false,
      error: {
        code: 'missing_player_count',
        message:
          'The loadout JSON envelope field "playerCount" must be an integer in the range 1..5. Re-export the document from the Registry Viewer loadout builder.',
        field: 'playerCount',
      },
    };
  }

  if (playerCountRaw < 1 || playerCountRaw > 5) {
    return {
      ok: false,
      error: {
        code: 'player_count_out_of_range',
        message: `The loadout JSON envelope field "playerCount" must be an integer in the range 1..5. Received ${playerCountRaw}. Re-export the document with a valid seat count.`,
        field: 'playerCount',
      },
    };
  }

  // Rule-mode shape guard. RS-3 single-site default normalization happens
  // here: absent heroSelectionMode → "GROUP_STANDARD"; downstream code reads
  // value.heroSelectionMode as always set, so no nullish-coalescing default
  // fallbacks may exist anywhere else in apps/arena-client/src/**.
  let heroSelectionMode: HeroSelectionMode = 'GROUP_STANDARD';
  if ('heroSelectionMode' in raw) {
    const heroSelectionModeRaw = raw['heroSelectionMode'];
    if (heroSelectionModeRaw !== 'GROUP_STANDARD') {
      return {
        ok: false,
        error: {
          code: 'unsupported_hero_selection_mode',
          message: renderUnsupportedModeMessage(heroSelectionModeRaw),
          field: 'heroSelectionMode',
        },
      };
    }
    heroSelectionMode = 'GROUP_STANDARD';
  }

  // All checks passed. Build the typed result with explicit field reads
  // (no spread, no Object.assign) so the returned shape is exactly the
  // nine-field lock; the type assertions are safe because the predicate
  // flow above narrowed each property's runtime type.
  const validatedComposition: ParsedLoadout['composition'] = {
    schemeId: compositionRaw['schemeId'] as string,
    mastermindId: compositionRaw['mastermindId'] as string,
    villainGroupIds: compositionRaw['villainGroupIds'] as string[],
    henchmanGroupIds: compositionRaw['henchmanGroupIds'] as string[],
    heroDeckIds: compositionRaw['heroDeckIds'] as string[],
    bystandersCount: compositionRaw['bystandersCount'] as number,
    woundsCount: compositionRaw['woundsCount'] as number,
    officersCount: compositionRaw['officersCount'] as number,
    sidekicksCount: compositionRaw['sidekicksCount'] as number,
  };

  return {
    ok: true,
    value: {
      composition: validatedComposition,
      playerCount: playerCountRaw,
      heroSelectionMode,
    },
  };
}
