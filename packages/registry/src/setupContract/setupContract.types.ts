/**
 * setupContract.types.ts — MATCH-SETUP document types for the registry-side
 * browser-safe validator and the registry-viewer loadout builder (WP-091).
 *
 * Canonical authority for the document shape:
 *   - docs/ai/REFERENCE/MATCH-SETUP-SCHEMA.md
 *   - docs/ai/REFERENCE/MATCH-SETUP-JSON-SCHEMA.json
 * Canonical authority for `heroSelectionMode` semantics, error code, error
 * message template, and human-readable label mapping:
 *   - docs/ai/DECISIONS.md — D-9301 (WP-093)
 *
 * Every field name here appears verbatim in the JSON document consumed by
 * the engine-side setup pipeline; drift is detected by the drift-detection
 * test inside setupContract.test.ts.
 */

// why: CardRegistryReader is redeclared registry-side (not imported) because
// packages/registry/** and apps/registry-viewer/** must never import from
// @legendary-arena/game-engine per the layer boundary in
// docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative). The real
// CardRegistry from @legendary-arena/registry satisfies this interface
// structurally via its listCards(): FlatCard[] surface.
//
// why: D-24018 — the validator now reads `extId` (the set-qualified
// "{setAbbr}/{slug}" form), not `key` (the flat-card display id). The engine's
// authoritative match-setup validator rejects flat-card keys (D-10014), so
// validating composition fields against `key` here green-lit loadouts the
// engine then rejected with an HTTP 500. Reading `extId` makes this validator
// accept exactly the id space the engine accepts.
export interface CardRegistryReader {
  /** Returns all cards. The validator uses the extId field for ext_id lookup. */
  listCards(): Array<{ extId: string }>;
}

// why: SetupCompositionInput mirrors the engine's MatchSetupConfig
// (packages/game-engine/src/matchSetup.types.ts) field-for-field. The nine
// field names are locked by 00.2 §7 Match Configuration and by the
// 9-field composition lock in .claude/rules/code-style.md §Data Contracts.
// A compile-time drift-detection assertion in setupContract.test.ts keeps
// the registry-side mirror and the engine-side source of truth synchronized.
export interface SetupCompositionInput {
  schemeId: string;
  mastermindId: string;
  villainGroupIds: string[];
  henchmanGroupIds: string[];
  heroDeckIds: string[];
  bystandersCount: number;
  woundsCount: number;
  officersCount: number;
  sidekicksCount: number;
}

// why: HeroSelectionMode is a literal-union with exactly one v1 member
// ("GROUP_STANDARD") per WP-093 / D-9301. "HERO_DRAFT" is reserved for a
// future release and is deliberately NOT a member of the v1 union — adding
// it to the union here requires amending WP-093's naming-governance policy
// first (four-point policy, item 3). Future additions follow the same
// convention: amend D-9301, land a new DECISIONS entry, then extend this
// union.
export type HeroSelectionMode = "GROUP_STANDARD";

/**
 * SetupEnvelope — the MATCH-SETUP envelope metadata surrounding the
 * composition block. Field names and ordering match
 * MATCH-SETUP-JSON-SCHEMA.json verbatim.
 */
export interface SetupEnvelope {
  schemaVersion: "1.0";
  setupId: string;
  createdAt: string;
  createdBy: "player" | "system" | "simulation";
  seed: string;
  playerCount: number;
  themeId?: string;
  expansions: string[];
  heroSelectionMode?: HeroSelectionMode;
}

/**
 * MatchSetupDocument — the full authored document. Envelope fields are
 * flattened onto the root alongside a nested `composition` block, matching
 * the JSON shape documented in MATCH-SETUP-SCHEMA.md §Example.
 */
export interface MatchSetupDocument extends SetupEnvelope {
  composition: SetupCompositionInput;
}

/** Error code union for validator diagnostics. */
export type MatchSetupErrorCode =
  | "missing_field"
  | "unknown_extid"
  | "out_of_range"
  | "unknown_field"
  | "wrong_type"
  | "unsupported_hero_selection_mode";

/** A single validation error: field path, machine code, full-sentence message. */
export interface MatchSetupValidationError {
  field: string;
  code: MatchSetupErrorCode;
  message: string;
}

/** Result of validating a MATCH-SETUP document against the schema + registry. */
export type ValidateMatchSetupDocumentResult =
  | { ok: true; value: MatchSetupDocument }
  | { ok: false; errors: MatchSetupValidationError[] };

/**
 * UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE — the single source of truth
 * for the WP-093 error message template (D-9301). Both the zod-error upgrade
 * path (validator Step 1) and the defensive raw-input fallback (validator
 * Step 1b) substitute `<value>` into this string so byte-for-byte equality
 * with D-9301 is guaranteed regardless of which detector branch fires.
 * Tests assert exact-string equality with this constant; paraphrasing or
 * template-literal reassembly anywhere else is a WP-091 Session Abort
 * Condition.
 */
export const UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE =
  "The loadout envelope's heroSelectionMode is <value>, which is not a supported rule mode in v1 of the match setup schema. Supported modes: GROUP_STANDARD. (HERO_DRAFT is reserved for a future release and is not yet implemented.)";

/**
 * HERO_SELECTION_MODE_READONLY_LABEL — the full composed read-only label
 * the WP-091 rule-mode indicator renders. Sourced verbatim from D-9301 +
 * MATCH-SETUP-SCHEMA.md §Field Semantics / Hero Selection Mode. Consumed
 * byte-for-byte by LoadoutBuilder.vue.
 */
export const HERO_SELECTION_MODE_READONLY_LABEL =
  "Hero selection rule: GROUP_STANDARD — Classic Legendary hero groups";

/**
 * HERO_SELECTION_MODE_SHORT_LABEL — WP-093 short UI label for
 * "GROUP_STANDARD". Consumed byte-for-byte; never paraphrased as
 * "classic mode", "standard", "Legendary rules", etc.
 */
export const HERO_SELECTION_MODE_SHORT_LABEL =
  "Classic Legendary hero groups";

/**
 * HERO_SELECTION_MODE_LONG_EXPLANATION — WP-093 long explanation / hover
 * tooltip for "GROUP_STANDARD". The rule-mode indicator surfaces this
 * verbatim on hover.
 */
export const HERO_SELECTION_MODE_LONG_EXPLANATION =
  "The engine expands each selected hero group into its canonical card set at match start.";

/**
 * HERO_SELECTION_MODE_FUTURE_NOTICE — the one explanatory sentence WP-091
 * is permitted to emit beyond the machine name, sourced from D-9301's
 * future-notice UX copy. The info icon next to the rule-mode indicator
 * surfaces this verbatim; no other UI copy in the builder references
 * "Hero Draft" or "HERO_DRAFT" beyond this single sentence.
 */
export const HERO_SELECTION_MODE_FUTURE_NOTICE =
  "Hero Draft rules are planned for a future update.";
