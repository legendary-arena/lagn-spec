/**
 * setupContract.validate.ts — browser-safe MATCH-SETUP document validator
 * (WP-091).
 *
 * `validateMatchSetupDocument()` is a pure function of (input, registry).
 * Given identical inputs it produces identical `{ ok, errors }` or
 * `{ ok, value }` outputs. It never throws; the caller (registry-viewer
 * composable, future tooling) decides how to surface errors.
 *
 * This validator is engine-identical by construction for the parts it
 * overlaps with `packages/game-engine/src/matchSetup.validate.ts`: both
 * build a `Set<string>` from `registry.listCards()` and check every
 * composition ext_id via `Set.has()`. A document accepted here is
 * accepted by the authoritative engine-side validator at match creation
 * time; divergence is a contract bug that must be reconciled on both
 * sides simultaneously (A-091-03, D-1209).
 */

import type { ZodIssue } from "zod";

import type {
  CardRegistryReader,
  MatchSetupDocument,
  MatchSetupValidationError,
  MatchSetupErrorCode,
  ValidateMatchSetupDocumentResult,
} from "./setupContract.types.js";
import { UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE } from "./setupContract.types.js";
import { MatchSetupDocumentSchema } from "./setupContract.schema.js";

// why: Single source of truth for the WP-093 error template (D-9301).
// Both the zod-issue upgrade path (Step 1) and the raw-input defensive
// fallback (Step 1b) call this helper so byte-for-byte equality with the
// DECISIONS entry is guaranteed regardless of which detector fires.
// `<value>` is the only permitted substitution — every other byte of the
// template is normative.
function buildUnsupportedHeroSelectionModeError(
  rawValue: unknown,
): MatchSetupValidationError {
  const renderedValue = typeof rawValue === "string" ? rawValue : String(rawValue);
  return {
    field: "heroSelectionMode",
    code: "unsupported_hero_selection_mode",
    message: UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE.replace(
      "<value>",
      renderedValue,
    ),
  };
}

/**
 * Converts a zod issue path (string/number segments) to a dot-joined
 * field path such as `"composition.villainGroupIds[2]"`. Array indices
 * are rendered with bracket notation so error surfaces can point the
 * user at the exact failing element.
 */
function zodPathToField(path: Array<string | number>): string {
  if (path.length === 0) {
    return "root";
  }
  const segments: string[] = [];
  for (const part of path) {
    if (typeof part === "number") {
      segments.push(`[${part}]`);
    } else if (segments.length === 0) {
      segments.push(part);
    } else {
      segments.push(`.${part}`);
    }
  }
  return segments.join("").replace(/^\./, "");
}

/**
 * Maps a zod issue code to the MatchSetupErrorCode taxonomy used by the
 * WP-091 UI. The mapping covers every issue kind the strict
 * MatchSetupDocumentSchema can produce at parse time.
 */
function mapZodIssueCode(issue: ZodIssue): MatchSetupErrorCode {
  switch (issue.code) {
    case "invalid_type":
      if (issue.received === "undefined") {
        return "missing_field";
      }
      return "wrong_type";
    case "unrecognized_keys":
      return "unknown_field";
    case "too_small":
    case "too_big":
      return "out_of_range";
    case "invalid_enum_value":
      if (Array.isArray(issue.path) && issue.path[issue.path.length - 1] === "heroSelectionMode") {
        return "unsupported_hero_selection_mode";
      }
      return "wrong_type";
    default:
      return "wrong_type";
  }
}

/**
 * Produces a full-sentence error message for a zod issue. For
 * `heroSelectionMode` rejections the message is upgraded to the
 * WP-093 byte-for-byte template so every downstream consumer sees
 * identical prose regardless of zod version.
 */
function zodIssueToMessage(issue: ZodIssue, input: unknown): string {
  if (
    issue.code === "invalid_enum_value" &&
    Array.isArray(issue.path) &&
    issue.path[issue.path.length - 1] === "heroSelectionMode"
  ) {
    // why: Preserves the authoritative WP-093 message text via the
    // exported UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE constant rather
    // than whatever prose zod's default `invalid_enum_value` message
    // happens to produce this release.
    const rawValue = extractRawHeroSelectionMode(input);
    const valueString =
      typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
    return UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE.replace(
      "<value>",
      valueString,
    );
  }
  if (issue.code === "invalid_type" && issue.received === "undefined") {
    const field = zodPathToField(issue.path);
    return `The ${field} field is required but was not present in the match setup document.`;
  }
  if (issue.code === "unrecognized_keys") {
    const keys = Array.isArray(issue.keys) ? issue.keys.join(", ") : "";
    const container = zodPathToField(issue.path) || "root";
    return `The match setup document contains unknown field(s) (${keys}) inside ${container} that the schema does not permit.`;
  }
  return issue.message;
}

/**
 * Extracts the raw `heroSelectionMode` value from an unknown input
 * without relying on zod's parsed shape. Used by the defensive
 * fallback (Step 1b) and by the zod-issue-message upgrade.
 */
function extractRawHeroSelectionMode(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  return (input as { heroSelectionMode?: unknown }).heroSelectionMode;
}

/**
 * Validates a MATCH-SETUP document against the strict zod schema and the
 * caller-supplied card registry. Accumulates every error (no fail-fast)
 * so the authoring UI can render a complete actionable list.
 *
 * @param input - The unvalidated document (typically parsed from JSON).
 * @param registry - A CardRegistryReader whose `listCards()` return values
 *                   carry `key: string` ext_ids for existence checks.
 * @returns Either `{ ok: true, value }` with the parsed document (and
 *          `heroSelectionMode` materialized to "GROUP_STANDARD" when
 *          absent, per D-9301 backward-compat semantics), or
 *          `{ ok: false, errors }` with every collected error.
 */
export function validateMatchSetupDocument(
  input: unknown,
  registry: CardRegistryReader,
): ValidateMatchSetupDocumentResult {
  const errors: MatchSetupValidationError[] = [];

  // ── Step 1 — zod structural parse ──────────────────────────────────────
  // why: Accumulate-don't-fail-fast is deliberate: the authoring UX in
  // WP-091 is more usable when the user sees every structural mistake in
  // one pass. Fail-fast would force the user to iterate through errors
  // one at a time, which is frustrating for the loadout builder use case.
  const parsed = MatchSetupDocumentSchema.safeParse(input);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        field: zodPathToField(issue.path),
        code: mapZodIssueCode(issue),
        message: zodIssueToMessage(issue, input),
      });
    }

    // ── Step 1b — defensive raw-input fallback (L11 / A-091-05) ──────────
    // why: Belt-and-suspenders against zod minor-version drift. If a future
    // zod release renames `invalid_enum_value`, reshapes `issue.path`, or
    // reorders issues such that the Step 1 detector misses the
    // `heroSelectionMode` rejection, this raw-input check still force-emits
    // the WP-093 template. Deduplicated by (code, field) pair so the same
    // error is never emitted twice. See copilot Issue 22 FIX for the
    // failure mode this guards against.
    const rawHeroSelectionMode = extractRawHeroSelectionMode(input);
    if (
      typeof rawHeroSelectionMode === "string" &&
      rawHeroSelectionMode !== "GROUP_STANDARD"
    ) {
      const alreadyEmitted = errors.some(
        (existing) =>
          existing.code === "unsupported_hero_selection_mode" &&
          existing.field === "heroSelectionMode",
      );
      if (!alreadyEmitted) {
        errors.push(
          buildUnsupportedHeroSelectionModeError(rawHeroSelectionMode),
        );
      }
    }

    return { ok: false, errors };
  }

  // ── Step 2 — registry ext_id existence checks ─────────────────────────
  // why: D-24018 — build the known-id set from each card's `extId` (the
  // set-qualified "{setAbbr}/{slug}" form), NOT its flat-card `key`. The
  // engine's authoritative validator
  // (packages/game-engine/src/matchSetup.validate.ts) rejects flat-card keys
  // and bare slugs (D-10014) and accepts only the qualified form; building
  // this set from `key` previously green-lit loadouts the engine then threw
  // on (HTTP 500 at match creation). Reading `extId` makes a document
  // accepted here accepted by the engine too. Built with for...of (never
  // .reduce() — .claude/rules/code-style.md §Patterns to Avoid). Note: the
  // engine uses per-field qualified sets (stricter cross-type isolation);
  // this single global set is a necessary-but-looser superset, so it never
  // rejects an engine-valid id.
  const cards = registry.listCards();
  const knownExtIds = new Set<string>();
  for (const card of cards) {
    knownExtIds.add(card.extId);
  }

  const composition = parsed.data.composition;

  if (!knownExtIds.has(composition.schemeId)) {
    errors.push({
      field: "composition.schemeId",
      code: "unknown_extid",
      message: `The composition.schemeId value "${composition.schemeId}" does not match any known card ext_id in the registry.`,
    });
  }

  if (!knownExtIds.has(composition.mastermindId)) {
    errors.push({
      field: "composition.mastermindId",
      code: "unknown_extid",
      message: `The composition.mastermindId value "${composition.mastermindId}" does not match any known card ext_id in the registry.`,
    });
  }

  checkArrayExtIds("composition.villainGroupIds", composition.villainGroupIds, knownExtIds, errors);
  checkArrayExtIds("composition.henchmanGroupIds", composition.henchmanGroupIds, knownExtIds, errors);
  checkArrayExtIds("composition.heroDeckIds", composition.heroDeckIds, knownExtIds, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // ── Step 3 — rule-mode default normalization (single-site) ─────────────
  // why: Enforces WP-093 D-9301 backward-compat semantic ("absent →
  // GROUP_STANDARD") exactly once at this boundary (L3). Downstream code
  // (composables, Vue components, serializers) reads value.heroSelectionMode
  // after validation and relies on it being set. Duplicate
  // `?? "GROUP_STANDARD"` fallbacks anywhere else are forbidden because
  // they would mask validator bugs and duplicate default logic across
  // layers.
  const value: MatchSetupDocument = {
    schemaVersion: parsed.data.schemaVersion,
    setupId: parsed.data.setupId,
    createdAt: parsed.data.createdAt,
    createdBy: parsed.data.createdBy,
    seed: parsed.data.seed,
    playerCount: parsed.data.playerCount,
    expansions: parsed.data.expansions,
    heroSelectionMode: parsed.data.heroSelectionMode ?? "GROUP_STANDARD",
    composition: {
      schemeId: composition.schemeId,
      mastermindId: composition.mastermindId,
      villainGroupIds: composition.villainGroupIds,
      henchmanGroupIds: composition.henchmanGroupIds,
      heroDeckIds: composition.heroDeckIds,
      bystandersCount: composition.bystandersCount,
      woundsCount: composition.woundsCount,
      officersCount: composition.officersCount,
      sidekicksCount: composition.sidekicksCount,
    },
  };
  if (parsed.data.themeId !== undefined) {
    value.themeId = parsed.data.themeId;
  }

  return { ok: true, value };
}

/**
 * Pushes an `unknown_extid` error for every entry in `values` whose string
 * is not present in `knownExtIds`. The field path uses bracket notation to
 * identify the exact failing element (e.g., `composition.villainGroupIds[2]`).
 */
function checkArrayExtIds(
  fieldPrefix: string,
  values: string[],
  knownExtIds: Set<string>,
  errors: MatchSetupValidationError[],
): void {
  for (let index = 0; index < values.length; index += 1) {
    const extId = values[index];
    if (extId === undefined) {
      continue;
    }
    if (!knownExtIds.has(extId)) {
      errors.push({
        field: `${fieldPrefix}[${index}]`,
        code: "unknown_extid",
        message: `The ${fieldPrefix}[${index}] value "${extId}" does not match any known card ext_id in the registry.`,
      });
    }
  }
}
