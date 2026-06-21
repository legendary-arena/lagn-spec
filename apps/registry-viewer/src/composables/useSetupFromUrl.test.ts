/**
 * useSetupFromUrl.test.ts — node:test coverage for the URL-driven setup
 * preview composable (WP-114).
 *
 * Covers the EC-116 §Files to Produce contract points: valid synthesis with
 * registry-known ext_ids, unknown_extid surfacing, empty-URL null result,
 * and drift test against the six DEFAULT_* constants exported by
 * useLoadoutDraft.ts (PS-1 export gate).
 *
 * Note: ext_ids in test fixtures use the set-qualified `<setAbbr>/<slug>`
 * form (e.g., "core/midtown-bank-robbery"). D-24018 closed the prior gap
 * where the registry-side validator accepted bare-hyphenated ids that the
 * engine-side validator then rejected (D-10014) — both validators now share
 * the qualified ext_id space, so a setup URL that validates here is accepted
 * at match creation. The parser preserves forward slashes through URL
 * encoding (covered separately in setupUrlParams.test.ts).
 *
 * Runner: node:test (native Node.js)
 * Invoke: pnpm --filter registry-viewer test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import type { CardRegistryReader } from "@legendary-arena/registry/setupContract";

import {
  DEFAULT_BYSTANDERS_COUNT,
  DEFAULT_WOUNDS_COUNT,
  DEFAULT_OFFICERS_COUNT,
  DEFAULT_SIDEKICKS_COUNT,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_EXPANSIONS,
} from "./useLoadoutDraft.js";

import { useSetupFromUrl } from "./useSetupFromUrl.js";

// why: the composable reads `window.location.search` once at instantiation.
// Stubbing globalThis.window per test (matches the cardTypesClient.test.ts
// "no-mocks" stub-fetch pattern) is the lowest-friction path — node:test
// runs in pure Node with no DOM, so we install a minimal shape with just
// the `location.search` property the composable touches.
const originalWindow = (globalThis as { window?: unknown }).window;

function setSearch(search: string): void {
  (globalThis as { window?: unknown }).window = { location: { search } };
}

function restoreWindow(): void {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
  } else {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
}

function makeRegistry(knownExtIds: string[]): CardRegistryReader {
  // why: D-24018 — the validator looks up set-qualified ext_ids via the
  // `extId` field (not the flat-card `key`).
  return {
    listCards: () => knownExtIds.map((extId) => ({ extId })),
  };
}

describe("useSetupFromUrl (WP-114)", () => {
  beforeEach(() => {
    setSearch("");
  });

  afterEach(() => {
    restoreWindow();
  });

  it("synthesizes a valid MatchSetupDocument when all five entity arrays are registry-known", () => {
    const knownExtIds = [
      "core/midtown-bank-robbery",
      "core/loki",
      "core/hydra",
      "core/sentinel",
      "core/spider-man",
    ];
    setSearch(
      "?schemeId=core/midtown-bank-robbery" +
        "&mastermindId=core/loki" +
        "&villainGroupIds=core/hydra" +
        "&henchmanGroupIds=core/sentinel" +
        "&heroDeckIds=core/spider-man",
    );

    const { hasUrlParams, previewDocument, validationErrors, matchedCount } =
      useSetupFromUrl(makeRegistry(knownExtIds));

    assert.equal(hasUrlParams.value, true);
    assert.notEqual(previewDocument.value, null);
    assert.deepEqual(validationErrors.value, []);
    assert.deepEqual(matchedCount.value, {
      schemes: 1,
      masterminds: 1,
      villainGroups: 1,
      henchmanGroups: 1,
      heroDecks: 1,
    });
  });

  it("surfaces unknown_extid errors when URL names IDs absent from the registry", () => {
    // why: the schema enforces `min(1)` on every entity-array field, so the
    // URL must populate all five composition slots for Step 1 (zod) to
    // succeed and Step 2 (unknown_extid) to even run. Four of five IDs are
    // registry-known; the villain ID is deliberately absent so a single
    // unknown_extid surfaces with the canonical path
    // "composition.villainGroupIds[0]".
    const knownExtIds = [
      "core/scheme-known",
      "core/mastermind-known",
      "core/henchman-known",
      "core/hero-known",
    ];
    setSearch(
      "?schemeId=core/scheme-known" +
        "&mastermindId=core/mastermind-known" +
        "&villainGroupIds=core/villain-not-in-registry" +
        "&henchmanGroupIds=core/henchman-known" +
        "&heroDeckIds=core/hero-known",
    );

    const { validationErrors, matchedCount } = useSetupFromUrl(makeRegistry(knownExtIds));

    const unknownExtIdErrors = validationErrors.value.filter(
      (entry) => entry.code === "unknown_extid",
    );
    assert.equal(
      unknownExtIdErrors.length,
      1,
      "Expected exactly one unknown_extid error for the missing villain group.",
    );
    assert.equal(unknownExtIdErrors[0]!.field, "composition.villainGroupIds[0]");
    assert.equal(matchedCount.value.schemes, 1);
    assert.equal(matchedCount.value.masterminds, 1);
    assert.equal(matchedCount.value.villainGroups, 0);
    assert.equal(matchedCount.value.henchmanGroups, 1);
    assert.equal(matchedCount.value.heroDecks, 1);
  });

  it("returns previewDocument: null when URL is empty", () => {
    setSearch("");
    const { hasUrlParams, previewDocument, validationErrors } = useSetupFromUrl(
      makeRegistry([]),
    );

    assert.equal(hasUrlParams.value, false);
    assert.equal(previewDocument.value, null);
    assert.deepEqual(validationErrors.value, []);
  });

  it("drift test: synthesized envelope uses the six DEFAULT_* constants byte-for-byte", () => {
    // why: failure here means defaults forked between the editor
    // (`useLoadoutDraft.ts`) and the preview (`useSetupFromUrl.ts`),
    // breaking round-trip consistency between "Edit this loadout" and the
    // original URL. The six constants are imported live from the editor
    // composable and compared against the preview's synthesized document.
    setSearch("?schemeId=core/scheme-foo");
    const { previewDocument } = useSetupFromUrl(makeRegistry(["core/scheme-foo"]));
    const document = previewDocument.value;
    assert.notEqual(document, null);
    if (document === null) {
      return;
    }

    assert.equal(document.composition.bystandersCount, DEFAULT_BYSTANDERS_COUNT);
    assert.equal(document.composition.woundsCount, DEFAULT_WOUNDS_COUNT);
    assert.equal(document.composition.officersCount, DEFAULT_OFFICERS_COUNT);
    assert.equal(document.composition.sidekicksCount, DEFAULT_SIDEKICKS_COUNT);
    assert.equal(document.playerCount, DEFAULT_PLAYER_COUNT);
    assert.deepEqual(document.expansions, [...DEFAULT_EXPANSIONS]);
  });

  it("synthetic envelope uses fixed-string defaults that satisfy the determinism contract", () => {
    setSearch("?schemeId=core/scheme-foo");
    const { previewDocument } = useSetupFromUrl(makeRegistry(["core/scheme-foo"]));
    const document = previewDocument.value;
    assert.notEqual(document, null);
    if (document === null) {
      return;
    }

    assert.equal(document.schemaVersion, "1.0");
    assert.equal(document.setupId, "url-preview");
    assert.equal(document.createdAt, "1970-01-01T00:00:00.000Z");
    assert.equal(document.createdBy, "system");
    assert.equal(document.seed, "0000000000000000");
    assert.equal(document.heroSelectionMode, "GROUP_STANDARD");
  });
});
