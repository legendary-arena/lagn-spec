/**
 * registry.smoke.test.ts — smoke test for the local card registry
 *
 * Purpose: confirm that createRegistryFromLocalFiles can load the real card
 * data from disk and expose at least one set and one card. This is a smoke
 * test, not a unit or integration suite — it validates "the registry boots"
 * rather than individual field correctness.
 *
 * Runner:  node:test (native Node.js test runner)
 * Invoke:  pnpm --filter @legendary-arena/registry test
 *
 * Assumptions:
 *   - CWD is packages/registry/ (pnpm --filter sets CWD to the package root)
 *   - data/metadata/ and data/cards/ exist at the monorepo root, which is
 *     two directory levels above packages/registry/
 *   - No network access, no database, no mocks — local files only
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { createRegistryFromLocalFiles } from "./impl/localRegistry.js";

// why: pnpm --filter sets CWD to the package directory (packages/registry/).
// The card data lives at the monorepo root under data/, so we resolve two
// levels up. If this test is ever run from a different CWD, these paths will
// fail loudly rather than silently loading nothing.
const metadataDir = join(process.cwd(), "..", "..", "data", "metadata");
const cardsDir = join(process.cwd(), "..", "..", "data", "cards");

// why: the registry is created once in the describe callback rather than in
// a beforeEach hook because (a) loading 40 set files is expensive and the
// result is read-only, so sharing it across assertions is safe, and (b)
// node:test runs the async describe callback before its child tests, which
// guarantees the registry is populated before any assertion executes.
describe("registry smoke test", async () => {
  const registry = await createRegistryFromLocalFiles({ metadataDir, cardsDir });

  it("loads at least one set", () => {
    const sets = registry.listSets();
    assert.ok(
      sets.length > 0,
      "Expected at least one set in the registry, but listSets() returned " +
      "an empty array. Check that data/metadata/sets.json exists and contains " +
      "entries matching SetIndexEntrySchema."
    );
  });

  it("loads at least one card", () => {
    const cards = registry.listCards();
    assert.ok(
      cards.length > 0,
      "Expected at least one card in the registry, but listCards() returned " +
      "an empty array. Check that data/cards/ contains at least one valid " +
      "per-set JSON file matching SetDataSchema."
    );
  });

  it("has no blocking parse errors", () => {
    const report = registry.validate();

    // why: SET_SCHEMA_INVALID errors are known data quality issues in specific
    // sets — msp1 uses sentinel IDs (-1) that violate the positive-integer
    // constraint, and shld has numeric attack/recruit values where the schema
    // expects strings. These are permissiveness gaps in the source data, not
    // registry load failures. Blocking errors (INDEX_FILE_ERROR, CARDS_DIR_ERROR,
    // SET_FILE_ERROR, SET_FETCH_ERROR) would indicate a real problem.
    const blockingErrors = report.errors.filter(
      (error) => error.code !== "SET_SCHEMA_INVALID"
    );

    assert.deepStrictEqual(
      blockingErrors,
      [],
      "Expected zero blocking parse errors (INDEX_FILE_ERROR, CARDS_DIR_ERROR, " +
      "SET_FILE_ERROR, etc.), but found:\n" +
      JSON.stringify(blockingErrors, null, 2)
    );
  });

  // why: WP-137 D-13701 — additive optional cardCounts on HeroSchema.
  // Smoke-test that real registry data exposes the field for at least
  // one set with patch data (2099 / spider-man-2099) and tolerates
  // its absence/null on at least one other hero. The registry must
  // load both shapes without a parse error (the new field is
  // .nullable().optional() so omission and explicit null are both
  // legal).
  it("WP-137: cardCounts populates on at least one hero with patch data and is absent/null on at least one without", () => {
    const set2099 = registry.getSet("2099");
    assert.ok(set2099, "2099 set must load — cardCounts smoke test depends on Phase A pipeline output");
    const spider2099 = (set2099 as { heroes: Array<{ slug: string; cardCounts?: Record<string, number> | null }> }).heroes.find(
      (hero) => hero.slug === "spider-man-2099",
    );
    assert.ok(spider2099, "2099/spider-man-2099 hero must be present");
    assert.ok(
      spider2099!.cardCounts && typeof spider2099!.cardCounts === "object",
      "2099/spider-man-2099 must have a populated cardCounts map (Phase A pipeline output)",
    );
    const cardCountsKeys = Object.keys(spider2099!.cardCounts!);
    assert.ok(
      cardCountsKeys.length > 0,
      "spider-man-2099 cardCounts must contain at least one entry",
    );
    for (const key of cardCountsKeys) {
      const value = spider2099!.cardCounts![key];
      assert.ok(
        typeof value === "number" && Number.isInteger(value) && value >= 1,
        `spider-man-2099 cardCounts[${key}] must be a positive integer`,
      );
    }

    // Find at least one hero across all sets where cardCounts is
    // null or absent — i.e., the rarity-map fallback path must remain
    // exercised by real data. Most non-patched core heroes will
    // satisfy this.
    const allSets = registry.listSets();
    let foundFallback = false;
    for (const setEntry of allSets) {
      const setData = registry.getSet(setEntry.abbr) as
        | { heroes?: Array<{ slug: string; cardCounts?: Record<string, number> | null }> }
        | undefined;
      if (!setData || !Array.isArray(setData.heroes)) continue;
      for (const hero of setData.heroes) {
        if (hero.cardCounts === null || hero.cardCounts === undefined) {
          foundFallback = true;
          break;
        }
      }
      if (foundFallback) break;
    }
    assert.ok(
      foundFallback,
      "At least one hero across all sets must have cardCounts: null or absent (rarity-map fallback path coverage)",
    );
  });
});
