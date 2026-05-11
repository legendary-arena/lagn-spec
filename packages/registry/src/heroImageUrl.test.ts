/**
 * heroImageUrl.test.ts — unit tests for the heroImageUrl() URL assembler.
 *
 * Covers: single-side, two-side preserve alphabetical input, two-side
 * preserve non-alphabetical input (D-14702 explicit coverage), companion
 * on 2-side card, companion on 1-side card, length-floor throw,
 * length-ceiling throw, companionSlug regex throw, empty-string throw,
 * and a determinism duplicate-call assertion.
 *
 * Runner: node:test + node:assert/strict — no boardgame.io, no Jest, no
 * Vitest. Pure-function module; no fixtures or filesystem access required.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { heroImageUrl, R2_BASE_URL } from "./heroImageUrl.js";

describe("heroImageUrl (WP-147)", () => {
  it("single-side card emits {setAbbr}-hr-{heroSlug}-{side}.webp", () => {
    assert.equal(
      heroImageUrl("xx", "y", ["a"]),
      `${R2_BASE_URL}/xx/xx-hr-y-a.webp`,
    );
  });

  it("two-side card with alphabetical sides[] preserves input order", () => {
    assert.equal(
      heroImageUrl("xx", "y", ["a", "b"]),
      `${R2_BASE_URL}/xx/xx-hr-y-a-b.webp`,
    );
  });

  it("two-side card with non-alphabetical sides[] preserves input order (D-14702)", () => {
    // why: D-14702 — source-data sides[] order is authoritative for
    // sides.length === 2. This case would have been alphabetically
    // reordered under the previous D-13802 sort lock; under D-14702 the
    // filename must reflect the input order verbatim (physical-side order:
    // side A on the left/top of the printed card is first in the array).
    assert.equal(
      heroImageUrl("xx", "y", ["b", "a"]),
      `${R2_BASE_URL}/xx/xx-hr-y-b-a.webp`,
    );
  });

  it("two-side card with companionSlug inserts companion between hero and sides", () => {
    assert.equal(
      heroImageUrl("xx", "y", ["a", "b"], "c"),
      `${R2_BASE_URL}/xx/xx-hr-y-c-a-b.webp`,
    );
  });

  it("single-side card with companionSlug inserts companion between hero and side", () => {
    assert.equal(
      heroImageUrl("xx", "y", ["a"], "c"),
      `${R2_BASE_URL}/xx/xx-hr-y-c-a.webp`,
    );
  });

  it("throws full-sentence error when sides[] is empty (length floor)", () => {
    assert.throws(
      () => heroImageUrl("xx", "y", []),
      (error: Error) => {
        assert.ok(
          /sides must be an array of length 1 or 2 \(D-13802 ceiling lock\)/.test(error.message),
          `Expected length-floor error message; got: ${error.message}`,
        );
        return true;
      },
    );
  });

  it("throws full-sentence error when sides[] has length 3 (length ceiling)", () => {
    assert.throws(
      () => heroImageUrl("xx", "y", ["a", "b", "c"]),
      (error: Error) => {
        assert.ok(
          /sides must be an array of length 1 or 2 \(D-13802 ceiling lock\)/.test(error.message),
          `Expected length-ceiling error message; got: ${error.message}`,
        );
        return true;
      },
    );
  });

  it("throws full-sentence error when companionSlug fails the slug regex", () => {
    assert.throws(
      () => heroImageUrl("xx", "y", ["a"], "Bad Slug!"),
      (error: Error) => {
        assert.ok(
          /companionSlug .* must match the slug regex \^\[a-z0-9-\]\+\$/.test(error.message),
          `Expected companionSlug regex error message; got: ${error.message}`,
        );
        return true;
      },
    );
  });

  it("throws full-sentence error when companionSlug is an empty string", () => {
    assert.throws(
      () => heroImageUrl("xx", "y", ["a"], ""),
      (error: Error) => {
        assert.ok(
          /companionSlug must be a non-empty slug when provided/.test(error.message),
          `Expected empty-string companionSlug error message; got: ${error.message}`,
        );
        return true;
      },
    );
  });

  it("determinism: two consecutive calls with identical args return byte-identical strings", () => {
    // why: D-14702 guarantees ordering comes from source data alone — no
    // internal mutation, no randomness, no sort applied to sides[]. This
    // test catches any future regression that re-introduces hidden state
    // (e.g., an accidental re-sort, locale-aware comparison, or a cached
    // result that holds a reference to a mutated array).
    const first = heroImageUrl("xx", "y", ["b", "a"], "c");
    const second = heroImageUrl("xx", "y", ["b", "a"], "c");
    assert.equal(first, second);
    assert.equal(first, `${R2_BASE_URL}/xx/xx-hr-y-c-b-a.webp`);
  });
});
