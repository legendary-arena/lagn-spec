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
import { HeroSchema, PhysicalCardSchema } from "./schema.js";

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

// why: WP-138 Phase 1a — physicalCards is the new authoritative
// deck-composition surface (D-13801..D-13806). The seven tests below
// cover schema validation (sides[] length 0/3, id format), cross-field
// invariants enforced via HeroSchema.superRefine (drift, orphan-side,
// duplicate-membership), and the bkwd/falcon-winter-soldier reference
// fixture (3 split + 1 solo physicalCards summing to 14 deck instances).
describe("physicalCards (WP-138 Phase 1a)", () => {
  // why: shared baseline used by validator tests so each case differs only
  // in the field under examination. Using a single hero shape with one
  // common card means cross-field tests don't accidentally trip an
  // unrelated validator path.
  const validHeroBase = {
    name: "Test Hero",
    slug: "test-hero",
    team: "avengers",
    cards: [
      {
        slug: "card-a",
        name: "Card A",
        imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-a.webp",
      },
      {
        slug: "card-b",
        name: "Card B",
        imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-b.webp",
      },
    ],
  };

  it("rejects physicalCards.sides[] of length 0", () => {
    const result = PhysicalCardSchema.safeParse({
      id:       "p1",
      count:    1,
      imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero.webp",
      sides:    [],
    });
    assert.equal(result.success, false, "Empty sides[] must fail PhysicalCardSchema");
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      assert.ok(
        /at least one side/i.test(message),
        `Expected error message to mention 'at least one side'; got: ${message}`,
      );
    }
  });

  it("rejects physicalCards.sides[] of length 3", () => {
    const result = PhysicalCardSchema.safeParse({
      id:       "p1",
      count:    1,
      imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-a-b-c.webp",
      sides:    ["a", "b", "c"],
    });
    assert.equal(result.success, false, "Triple-side sides[] must fail PhysicalCardSchema (D-13802 ceiling lock)");
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      assert.ok(
        /at most two side/i.test(message),
        `Expected error message to mention the two-side ceiling; got: ${message}`,
      );
    }
  });

  it("rejects physicalCards.id with non-conforming format", () => {
    const badIds = ["q1", "physical-card-1", "P1", "p", "p1a", "1"];
    for (const badId of badIds) {
      const result = PhysicalCardSchema.safeParse({
        id:       badId,
        count:    1,
        imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-a.webp",
        sides:    ["card-a"],
      });
      assert.equal(
        result.success,
        false,
        `physicalCards.id "${badId}" must fail; expected ^p\\d+$ format`,
      );
    }
  });

  it("rejects drift between cardCounts and sum of physicalCards counts", () => {
    const result = HeroSchema.safeParse({
      ...validHeroBase,
      cardCounts: { "Card A": 5, "Card B": 5 },
      physicalCards: [
        {
          id: "p1",
          count: 4,
          imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-a.webp",
          sides: ["card-a"],
        },
        {
          id: "p2",
          count: 5,
          imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-b.webp",
          sides: ["card-b"],
        },
      ],
    });
    assert.equal(result.success, false, "Drift between cardCounts and physicalCards must fail load");
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      assert.ok(
        message.includes("test-hero") && /cardCounts/.test(message) && /physicalCards/.test(message),
        `Expected drift error to name hero, cardCounts, and physicalCards; got: ${message}`,
      );
    }
  });

  it("rejects orphan side: a sides[] entry that does not match any cards[].slug", () => {
    const result = HeroSchema.safeParse({
      ...validHeroBase,
      physicalCards: [
        {
          id: "p1",
          count: 1,
          imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-a.webp",
          sides: ["card-a"],
        },
        {
          id: "p2",
          count: 1,
          imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-not-a-real-side.webp",
          sides: ["not-a-real-side"],
        },
      ],
    });
    assert.equal(result.success, false, "Orphan sides[] entry must fail HeroSchema (WP-138 §8)");
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      assert.ok(
        message.includes("test-hero") &&
          message.includes("p2") &&
          message.includes("not-a-real-side"),
        `Expected orphan-side error to name hero, physicalCard id, and missing slug; got: ${message}`,
      );
    }
  });

  it("rejects duplicate side membership: a side slug appearing in two physicalCards", () => {
    const result = HeroSchema.safeParse({
      ...validHeroBase,
      physicalCards: [
        {
          id: "p1",
          count: 1,
          imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-a.webp",
          sides: ["card-a"],
        },
        {
          id: "p2",
          count: 1,
          imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-a-card-b.webp",
          sides: ["card-a", "card-b"],
        },
      ],
    });
    assert.equal(result.success, false, "Duplicate side membership must fail HeroSchema (WP-138 §9)");
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join("; ");
      assert.ok(
        message.includes("test-hero") &&
          message.includes("card-a") &&
          message.includes("p1") &&
          message.includes("p2"),
        `Expected duplicate-membership error to name hero, side slug, and both physicalCard ids; got: ${message}`,
      );
    }
  });

  // why: WP-147 D-14701 — PhysicalCardSchema.companionSlug is optional. The
  // four tests below cover the three direct schema cases (valid slug, invalid
  // empty/whitespace string, absent field — backward-compatible) plus the
  // Drax mgtg data shape, which is the first registry application of the
  // new field.
  it("WP-147: PhysicalCardSchema accepts companionSlug when valid", () => {
    const result = PhysicalCardSchema.safeParse({
      id:            "p1",
      count:         3,
      imageUrl:      "https://images.barefootbetters.com/test/test-hr-test-hero-companion-a-b.webp",
      sides:         ["a", "b"],
      companionSlug: "irani-rael",
    });
    assert.equal(result.success, true, "PhysicalCardSchema must accept a valid companionSlug");
  });

  it("WP-147: PhysicalCardSchema rejects companionSlug with whitespace or empty value", () => {
    const emptyResult = PhysicalCardSchema.safeParse({
      id:            "p1",
      count:         3,
      imageUrl:      "https://images.barefootbetters.com/test/test-hr-test-hero.webp",
      sides:         ["a"],
      companionSlug: "",
    });
    assert.equal(emptyResult.success, false, "Empty companionSlug must fail PhysicalCardSchema");
    if (!emptyResult.success) {
      const message = emptyResult.error.issues.map((i) => i.message).join("; ");
      assert.ok(
        /companionSlug/.test(message) && /non-empty|slug regex/.test(message),
        `Expected empty-companionSlug error to name the field; got: ${message}`,
      );
    }

    const whitespaceResult = PhysicalCardSchema.safeParse({
      id:            "p1",
      count:         3,
      imageUrl:      "https://images.barefootbetters.com/test/test-hr-test-hero.webp",
      sides:         ["a"],
      companionSlug: "has spaces",
    });
    assert.equal(whitespaceResult.success, false, "Whitespace companionSlug must fail PhysicalCardSchema");
    if (!whitespaceResult.success) {
      const message = whitespaceResult.error.issues.map((i) => i.message).join("; ");
      assert.ok(
        /companionSlug/.test(message) && /slug regex/.test(message),
        `Expected whitespace-companionSlug error to name the field and slug regex; got: ${message}`,
      );
    }
  });

  it("WP-147: PhysicalCardSchema validates physicalCard without companionSlug (backward-compatible)", () => {
    const result = PhysicalCardSchema.safeParse({
      id:       "p1",
      count:    1,
      imageUrl: "https://images.barefootbetters.com/test/test-hr-test-hero-card-a.webp",
      sides:    ["card-a"],
    });
    assert.equal(result.success, true, "PhysicalCardSchema must accept physicalCard without companionSlug (optional field)");
  });

  it("WP-147: Drax mgtg physicalCards p1 + p3 have correct companion slugs and physical-side order", async () => {
    const registry = await createRegistryFromLocalFiles({ metadataDir, cardsDir });
    const mgtg = registry.getSet("mgtg");
    assert.ok(mgtg, "mgtg set must load — WP-147 Drax companionSlug fix depends on it");
    const drax = mgtg.heroes.find((hero) => hero.slug === "drax");
    assert.ok(drax, "mgtg/drax hero must be present (WP-147 fix target)");

    const p1 = drax.physicalCards.find((p) => p.id === "p1");
    assert.ok(p1, "Drax p1 physicalCard must be present");
    assert.equal(p1.companionSlug, "rhomann-dey", "Drax p1 companionSlug must be 'rhomann-dey'");
    assert.deepEqual(
      p1.sides,
      ["remove-his-spine", "also-illegal"],
      "Drax p1 sides[] must be in physical-side order: remove-his-spine (left/top), also-illegal (right/bottom)",
    );

    const p3 = drax.physicalCards.find((p) => p.id === "p3");
    assert.ok(p3, "Drax p3 physicalCard must be present");
    assert.equal(p3.companionSlug, "irani-rael", "Drax p3 companionSlug must be 'irani-rael'");
    assert.deepEqual(
      p3.sides,
      ["i-am-invisible", "xandar-is-invincible"],
      "Drax p3 sides[] must be in physical-side order: i-am-invisible (left), xandar-is-invincible (right)",
    );
  });

  // why: end-to-end validation of the canonical reference patch — this is
  // the only Phase 1a curated split-hero declaration. The 3 split + 1 solo
  // shape and 14-instance deck size are the locked acceptance values.
  it("bkwd/falcon-winter-soldier reference fixture has 4 physicalCards (3 split + 1 solo) summing to 14", async () => {
    const registry = await createRegistryFromLocalFiles({ metadataDir, cardsDir });
    const bkwd = registry.getSet("bkwd");
    assert.ok(bkwd, "bkwd set must load — falcon-winter-soldier reference fixture depends on it");
    const falconWinterSoldier = bkwd.heroes.find((hero) => hero.slug === "falcon-winter-soldier");
    assert.ok(
      falconWinterSoldier,
      "bkwd/falcon-winter-soldier hero must be present (canonical reference patch under WP-138 Phase 1a)",
    );
    const physicalCards = falconWinterSoldier.physicalCards;
    assert.equal(physicalCards.length, 4, "Expected 4 physicalCards (3 split + 1 solo)");
    const splitCount = physicalCards.filter((p) => p.sides.length === 2).length;
    const soloCount = physicalCards.filter((p) => p.sides.length === 1).length;
    assert.equal(splitCount, 3, "Expected 3 split-side physicalCards (Attune/Atone, Relocate/Reload, New Wings/New Plan)");
    assert.equal(soloCount, 1, "Expected 1 solo physicalCard (Captain America's Legacy)");
    let totalCount = 0;
    for (const physicalCard of physicalCards) {
      totalCount += physicalCard.count;
    }
    assert.equal(totalCount, 14, "Expected sum(physicalCards[].count) === 14 deck instances");
    // Look up via the runtime index using the namespaced key.
    const lookup = registry.getPhysicalCardForSide("falcon-winter-soldier", "attune");
    assert.ok(lookup, "getPhysicalCardForSide must resolve the 'attune' side");
    assert.equal(lookup.id, "p1", "attune resolves to the first declared physicalCard (p1)");
    assert.deepEqual(lookup.sides, ["attune", "atone"], "p1.sides[] must include both faces of the split card");
  });
});
