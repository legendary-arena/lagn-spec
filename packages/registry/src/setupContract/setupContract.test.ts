/**
 * setupContract.test.ts — registry-side tests for the browser-safe
 * MATCH-SETUP document validator (WP-091).
 *
 * All tests live inside a single `describe('setupContract (WP-091)')`
 * block so `node:test` reports +1 suite relative to the pre-WP-091
 * baseline (31 / 3 / 0 locked by EC-091 L13). Bare top-level `test()`
 * calls would not register as a suite under node:test and would produce
 * 31 / 2 / 0 — see WP-031 P6-31 precedent.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type {
  CardRegistryReader,
  MatchSetupDocument,
  SetupCompositionInput,
  ValidateMatchSetupDocumentResult,
} from "./setupContract.types.js";
import {
  UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE,
} from "./setupContract.types.js";
import { validateMatchSetupDocument } from "./setupContract.validate.js";

// ── Shared fixtures ─────────────────────────────────────────────────────────

/**
 * A minimal stub CardRegistryReader whose `listCards()` covers every
 * ext_id used in the happy-path test documents. Declared inline so no
 * shared helper module is introduced (EC-091 §6.1 item 4).
 */
function buildStubRegistry(): CardRegistryReader {
  return {
    // why: D-24018 — the validator reads `extId` (set-qualified ids), not the
    // flat-card `key`. These stub ids use the locked "{setAbbr}/{slug}" form;
    // the happy-path composition values below reference them verbatim.
    listCards: () => [
      { extId: "core/scheme-alpha" },
      { extId: "core/mastermind-beta" },
      { extId: "core/villain-group-one" },
      { extId: "core/villain-group-two" },
      { extId: "core/villain-group-three" },
      { extId: "core/henchman-group-one" },
      { extId: "core/hero-deck-alpha" },
      { extId: "core/hero-deck-beta" },
      { extId: "core/hero-deck-gamma" },
      { extId: "core/hero-deck-delta" },
      { extId: "core/hero-deck-epsilon" },
    ],
  };
}

/** Builds a minimally-valid MATCH-SETUP document for happy-path tests. */
function buildValidDocument(): MatchSetupDocument {
  return {
    schemaVersion: "1.0",
    setupId: "setup-alpha",
    createdAt: "2026-04-24T12:00:00.000Z",
    createdBy: "player",
    seed: "9b4a4e2d6e1c43c2",
    playerCount: 2,
    expansions: ["base"],
    heroSelectionMode: "GROUP_STANDARD",
    composition: {
      schemeId: "core/scheme-alpha",
      mastermindId: "core/mastermind-beta",
      villainGroupIds: ["core/villain-group-one"],
      henchmanGroupIds: ["core/henchman-group-one"],
      heroDeckIds: ["core/hero-deck-alpha"],
      bystandersCount: 30,
      woundsCount: 30,
      officersCount: 30,
      sidekicksCount: 0,
    },
  };
}

/** Returns the shared error if present, else throws to fail the test loudly. */
function errorsOf(result: ValidateMatchSetupDocumentResult) {
  if (result.ok) {
    throw new Error(
      "Expected validateMatchSetupDocument to fail, but it returned { ok: true }.",
    );
  }
  return result.errors;
}

// why: A compile-time drift-detection assertion. The literal tuple below
// is the 9-field composition lock from 00.2 §7 verbatim. `AssertEqual` is
// a standard TypeScript idiom that resolves to `true` only when the two
// unions are identical. If SetupCompositionInput drifts from the lock —
// either by renaming a field, adding one, or dropping one — the
// assignment below stops type-checking and the registry build fails.
// This keeps the registry-side mirror in sync with the engine's
// MatchSetupConfig (packages/game-engine/src/matchSetup.types.ts) without
// requiring a runtime engine import (which would violate the layer
// boundary per A-091-01).
const COMPOSITION_FIELD_NAMES = [
  "schemeId",
  "mastermindId",
  "villainGroupIds",
  "henchmanGroupIds",
  "heroDeckIds",
  "bystandersCount",
  "woundsCount",
  "officersCount",
  "sidekicksCount",
] as const;

type CompositionFieldName = (typeof COMPOSITION_FIELD_NAMES)[number];

type AssertEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

const _compositionFieldDriftCheck: AssertEqual<
  CompositionFieldName,
  keyof SetupCompositionInput
> = true;
void _compositionFieldDriftCheck;

// ── Test suite ──────────────────────────────────────────────────────────────

describe("setupContract (WP-091)", () => {
  test("#1 drift-detection: SetupCompositionInput carries the 9 locked field names in 00.2 §7 order", () => {
    // Runtime mirror of the compile-time check above — catches any
    // reordering of COMPOSITION_FIELD_NAMES that still type-checks but
    // departs from the canonical 00.2 §7 ordering.
    assert.deepStrictEqual(
      [...COMPOSITION_FIELD_NAMES],
      [
        "schemeId",
        "mastermindId",
        "villainGroupIds",
        "henchmanGroupIds",
        "heroDeckIds",
        "bystandersCount",
        "woundsCount",
        "officersCount",
        "sidekicksCount",
      ],
    );
  });

  test("#2 valid minimal document passes validation", () => {
    const registry = buildStubRegistry();
    const document = buildValidDocument();
    const result = validateMatchSetupDocument(document, registry);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.heroSelectionMode, "GROUP_STANDARD");
      assert.equal(result.value.composition.schemeId, "core/scheme-alpha");
    }
  });

  test("#3 valid document with all optional fields populated passes", () => {
    const registry = buildStubRegistry();
    const document: MatchSetupDocument = {
      ...buildValidDocument(),
      themeId: "theme-sample",
      heroSelectionMode: "GROUP_STANDARD",
    };
    const result = validateMatchSetupDocument(document, registry);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.themeId, "theme-sample");
      assert.equal(result.value.heroSelectionMode, "GROUP_STANDARD");
    }
  });

  test("#4 absent heroSelectionMode is normalized to GROUP_STANDARD (WP-093 backward-compat default)", () => {
    const registry = buildStubRegistry();
    const document = buildValidDocument();
    const { heroSelectionMode, ...documentWithoutMode } = document;
    void heroSelectionMode;
    const result = validateMatchSetupDocument(documentWithoutMode, registry);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.heroSelectionMode, "GROUP_STANDARD");
    }
  });

  test("#5 heroSelectionMode: HERO_DRAFT is rejected with the WP-093 byte-for-byte template", () => {
    const registry = buildStubRegistry();
    const document = {
      ...buildValidDocument(),
      heroSelectionMode: "HERO_DRAFT",
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const modeError = errors.find(
      (candidate) => candidate.code === "unsupported_hero_selection_mode",
    );
    assert.ok(modeError, "Expected at least one unsupported_hero_selection_mode error.");
    // why: Exact-string equality enforces the byte-for-byte WP-093 consumer
    // contract. `.includes()` / regex / substring matching would silently
    // accept paraphrased variants and defeat the whole discipline.
    assert.strictEqual(
      modeError.message,
      UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE.replace("<value>", "HERO_DRAFT"),
    );
    assert.strictEqual(modeError.field, "heroSelectionMode");
  });

  test("#6 heroSelectionMode: MADE_UP follows the same rejection path", () => {
    const registry = buildStubRegistry();
    const document = {
      ...buildValidDocument(),
      heroSelectionMode: "MADE_UP",
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const modeError = errors.find(
      (candidate) => candidate.code === "unsupported_hero_selection_mode",
    );
    assert.ok(modeError, "Expected at least one unsupported_hero_selection_mode error.");
    assert.strictEqual(
      modeError.message,
      UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE.replace("<value>", "MADE_UP"),
    );
  });

  test("#7 compound failure: HERO_DRAFT + missing seed emits exactly one dedup'd unsupported_hero_selection_mode error (L11 / A-091-05)", () => {
    // why: Exercises the Step 1b raw-input defensive fallback. Even if
    // zod's issue-order places the missing-seed issue first (or future zod
    // versions reshape the heroSelectionMode issue path), Step 1b guarantees
    // the WP-093 template emits exactly once. References copilot Issue 22
    // FIX rationale.
    const registry = buildStubRegistry();
    const document = {
      ...buildValidDocument(),
      heroSelectionMode: "HERO_DRAFT",
    };
    const { seed, ...documentWithoutSeed } = document;
    void seed;
    const errors = errorsOf(validateMatchSetupDocument(documentWithoutSeed, registry));
    const modeErrors = errors.filter(
      (candidate) => candidate.code === "unsupported_hero_selection_mode",
    );
    assert.equal(modeErrors.length, 1, "Expected exactly one unsupported_hero_selection_mode error.");
    assert.strictEqual(
      modeErrors[0].message,
      UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE.replace("<value>", "HERO_DRAFT"),
    );
    const seedError = errors.find((candidate) => candidate.field === "seed");
    assert.ok(seedError, "Expected a seed validation error alongside the mode error.");
  });

  test("#8 missing envelope field (seed) produces a missing_field error", () => {
    const registry = buildStubRegistry();
    const document = buildValidDocument();
    const { seed, ...documentWithoutSeed } = document;
    void seed;
    const errors = errorsOf(validateMatchSetupDocument(documentWithoutSeed, registry));
    const seedError = errors.find((candidate) => candidate.field === "seed");
    assert.ok(seedError, "Expected a seed error.");
    assert.equal(seedError.code, "missing_field");
  });

  test("#9 missing composition field (schemeId) produces a missing_field error", () => {
    const registry = buildStubRegistry();
    const document = buildValidDocument();
    const { schemeId, ...compositionWithoutScheme } = document.composition;
    void schemeId;
    const invalidDocument = {
      ...document,
      composition: compositionWithoutScheme,
    };
    const errors = errorsOf(validateMatchSetupDocument(invalidDocument, registry));
    const schemeError = errors.find(
      (candidate) => candidate.field === "composition.schemeId",
    );
    assert.ok(schemeError, "Expected a composition.schemeId error.");
    assert.equal(schemeError.code, "missing_field");
  });

  test("#10 unknown top-level field is rejected (strict root object)", () => {
    const registry = buildStubRegistry();
    const document = { ...buildValidDocument(), extraneous: "payload" };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const unknownFieldError = errors.find(
      (candidate) => candidate.code === "unknown_field",
    );
    assert.ok(unknownFieldError, "Expected an unknown_field error at the root.");
  });

  test("#11 unknown composition field is rejected (strict composition object)", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();
    const document = {
      ...baseDocument,
      composition: { ...baseDocument.composition, extraField: "nope" },
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const unknownFieldError = errors.find(
      (candidate) => candidate.code === "unknown_field",
    );
    assert.ok(
      unknownFieldError,
      "Expected an unknown_field error on composition.",
    );
  });

  test("#12 duplicate villainGroupIds entries are rejected", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();
    const document = {
      ...baseDocument,
      composition: {
        ...baseDocument.composition,
        villainGroupIds: ["core/villain-group-one", "core/villain-group-one"],
      },
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const duplicateError = errors.find(
      (candidate) => candidate.field === "composition.villainGroupIds",
    );
    assert.ok(duplicateError, "Expected a duplicate villainGroupIds error.");
  });

  test("#13 unknown ext_id for composition.schemeId produces unknown_extid", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();
    const document: MatchSetupDocument = {
      ...baseDocument,
      composition: { ...baseDocument.composition, schemeId: "core/scheme-nonexistent" },
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const extIdError = errors.find(
      (candidate) =>
        candidate.field === "composition.schemeId" &&
        candidate.code === "unknown_extid",
    );
    assert.ok(extIdError, "Expected unknown_extid error on composition.schemeId.");
  });

  test("#14 unknown ext_id for composition.mastermindId produces unknown_extid", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();
    const document: MatchSetupDocument = {
      ...baseDocument,
      composition: {
        ...baseDocument.composition,
        mastermindId: "core/mastermind-nonexistent",
      },
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const extIdError = errors.find(
      (candidate) =>
        candidate.field === "composition.mastermindId" &&
        candidate.code === "unknown_extid",
    );
    assert.ok(extIdError, "Expected unknown_extid error on composition.mastermindId.");
  });

  test("#15 unknown ext_id inside villainGroupIds array produces indexed unknown_extid", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();
    const document: MatchSetupDocument = {
      ...baseDocument,
      composition: {
        ...baseDocument.composition,
        villainGroupIds: [
          "core/villain-group-one",
          "core/villain-group-two",
          "core/villain-group-missing",
        ],
      },
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    const extIdError = errors.find(
      (candidate) =>
        candidate.field === "composition.villainGroupIds[2]" &&
        candidate.code === "unknown_extid",
    );
    assert.ok(
      extIdError,
      "Expected unknown_extid error at composition.villainGroupIds[2].",
    );
  });

  test("#16 playerCount out of range (0 and 6) produces out_of_range errors", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();
    const lowErrors = errorsOf(
      validateMatchSetupDocument({ ...baseDocument, playerCount: 0 }, registry),
    );
    const lowError = lowErrors.find(
      (candidate) => candidate.field === "playerCount",
    );
    assert.ok(lowError, "Expected a playerCount error when playerCount is 0.");
    assert.equal(lowError.code, "out_of_range");

    const highErrors = errorsOf(
      validateMatchSetupDocument({ ...baseDocument, playerCount: 6 }, registry),
    );
    const highError = highErrors.find(
      (candidate) => candidate.field === "playerCount",
    );
    assert.ok(highError, "Expected a playerCount error when playerCount is 6.");
    assert.equal(highError.code, "out_of_range");
  });

  test("#17 malformed ext_id and non-integer counts surface full-sentence errors", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();
    const document = {
      ...baseDocument,
      composition: {
        ...baseDocument.composition,
        schemeId: "Scheme With Spaces",
        bystandersCount: 3.5,
      },
    };
    const errors = errorsOf(validateMatchSetupDocument(document, registry));
    assert.ok(
      errors.some(
        (candidate) =>
          candidate.field === "composition.schemeId" &&
          candidate.message.includes("^[a-z0-9-]+/[a-z0-9-]+$"),
      ),
      "Expected a schemeId pattern error with the qualified ext_id regex in the full-sentence message.",
    );
    assert.ok(
      errors.some(
        (candidate) => candidate.field === "composition.bystandersCount",
      ),
      "Expected a bystandersCount error for the non-integer value.",
    );
  });

  test("#18 round-trip: valid document → JSON.stringify → JSON.parse → validator is { ok: true } and value deep-equals input", () => {
    const registry = buildStubRegistry();
    const document = buildValidDocument();
    const serialized = JSON.stringify(document);
    const reparsed = JSON.parse(serialized);
    const result = validateMatchSetupDocument(reparsed, registry);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.value, document);
    }

    // Byte-for-byte equality across two consecutive exports of the same
    // draft: stringify should be deterministic given identical input.
    const reserialized = JSON.stringify(document);
    assert.strictEqual(reserialized, serialized);
  });

  // why: D-24018 regression guard. Before D-24018 the validator built its
  // known-id set from each card's flat-card `key`, so a composition carrying
  // flat-card keys (what the Registry Viewer loadout builder produced) passed
  // here and was then rejected by the engine's Game.setup() with an HTTP 500.
  // This test pins the fix: a flat-card key is now rejected (it isn't even
  // qualified form), and the set-qualified ext_id is accepted.
  test("#19 flat-card key is rejected; the set-qualified ext_id for the same card is accepted", () => {
    const registry = buildStubRegistry();
    const baseDocument = buildValidDocument();

    // A flat-card key like the Registry Viewer used to emit. It fails the
    // qualified-form pattern (no slash), so a pattern error fires in step 1.
    const flatKeyDocument: MatchSetupDocument = {
      ...baseDocument,
      composition: {
        ...baseDocument.composition,
        mastermindId: "core-mastermind-beta-card",
      },
    };
    const flatKeyErrors = errorsOf(
      validateMatchSetupDocument(flatKeyDocument, registry),
    );
    assert.ok(
      flatKeyErrors.some(
        (candidate) => candidate.field === "composition.mastermindId",
      ),
      "Expected a flat-card key to be rejected on composition.mastermindId.",
    );

    // The set-qualified ext_id for the same card is present in the registry
    // stub and validates cleanly.
    const qualifiedResult = validateMatchSetupDocument(baseDocument, registry);
    assert.equal(
      qualifiedResult.ok,
      true,
      "Expected the set-qualified composition to pass validation.",
    );
  });
});
