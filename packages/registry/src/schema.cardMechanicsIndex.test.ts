/**
 * schema.cardMechanicsIndex.test.ts — WP-269 / D-24046 hero mechanic metadata feed
 *
 * Proves CardMechanicsIndexSchema (a) accepts the committed, generated feed at
 * data/metadata/card-mechanics.json and (b) rejects each malformed payload the
 * published contract forbids: missing/wrong version, non-hero scope, a source
 * outside the closed union, duplicate slugs, duplicate cardIds, a cardCount /
 * cardIds.length mismatch, and both directions of the mechanic/card join. This
 * is the producer-side guarantee that the viewer (WP-270) can trust the feed it
 * fetches.
 *
 * Runner:  node:test (native Node.js test runner)
 * Invoke:  pnpm --filter @legendary-arena/registry test
 *
 * Assumptions:
 *   - CWD is packages/registry/ (pnpm --filter sets CWD to the package root)
 *   - data/metadata/card-mechanics.json exists at the monorepo root, two levels up
 *   - No network access, no database, no mocks — local files only
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CardMechanicsIndexSchema } from "./schema.js";

// why: pnpm --filter sets CWD to packages/registry/; the generated feed lives at
// the monorepo root under data/metadata/, two directory levels up.
const feedPath = join(process.cwd(), "..", "..", "data", "metadata", "card-mechanics.json");

/**
 * Returns a fresh, minimally-valid card-mechanics index. Each reject case mutates
 * its own copy so the cases stay independent.
 */
function validIndex() {
  return {
    version: 1,
    scope: "hero",
    generatedAt: "1970-01-01T00:00:00.000Z",
    mechanics: [
      {
        slug: "draw",
        label: "Draw",
        scope: "hero",
        source: "keyword",
        cardCount: 1,
        cardIds: ["core/hulk"],
        hidden: false,
      },
      {
        slug: "berserk",
        label: "Berserk",
        scope: "hero",
        source: "composition-marker",
        cardCount: 2,
        cardIds: ["core/hulk", "core/thor"],
        hidden: false,
      },
    ],
    cards: {
      "core/hulk": { mechanics: ["berserk", "draw"] },
      "core/thor": { mechanics: ["berserk"] },
    },
  };
}

describe("CardMechanicsIndexSchema — accepts valid feeds (WP-269 / D-24046)", () => {
  it("accepts the minimal hand-built valid index", () => {
    const result = CardMechanicsIndexSchema.safeParse(validIndex());
    assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues[0]));
  });

  it("accepts the committed, generated card-mechanics feed", () => {
    const feed = JSON.parse(readFileSync(feedPath, "utf8"));
    const result = CardMechanicsIndexSchema.safeParse(feed);
    assert.equal(
      result.success,
      true,
      result.success
        ? ""
        : `data/metadata/card-mechanics.json must validate: ${JSON.stringify(result.error.issues[0])}`,
    );
  });
});

describe("CardMechanicsIndexSchema — rejects malformed feeds (WP-269 / D-24046)", () => {
  it("rejects a missing version", () => {
    const index = validIndex();
    delete index.version;
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects a version other than 1", () => {
    const index = validIndex();
    index.version = 2;
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects a top-level scope other than hero", () => {
    const index = validIndex();
    index.scope = "villain";
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects a mechanic scope other than hero", () => {
    const index = validIndex();
    index.mechanics[0].scope = "villain";
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects a source outside the closed union", () => {
    const index = validIndex();
    index.mechanics[0].source = "made-up";
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects duplicate mechanic slugs", () => {
    const index = validIndex();
    index.mechanics.push({
      slug: "draw",
      label: "Draw",
      scope: "hero",
      source: "keyword",
      cardCount: 1,
      cardIds: ["core/hulk"],
      hidden: false,
    });
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects duplicate cardIds within a mechanic", () => {
    const index = validIndex();
    index.mechanics[0].cardIds = ["core/hulk", "core/hulk"];
    index.mechanics[0].cardCount = 2;
    index.cards["core/hulk"].mechanics = ["berserk", "draw"];
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects a cardCount that does not equal cardIds.length", () => {
    const index = validIndex();
    index.mechanics[0].cardCount = 99;
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects a mechanic->card join miss (a cardId absent from cards{})", () => {
    const index = validIndex();
    index.mechanics[0].cardIds = ["core/hulk", "core/ghost"];
    index.mechanics[0].cardCount = 2;
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });

  it("rejects a card->mechanic join miss (a card slug not declared in mechanics[])", () => {
    const index = validIndex();
    index.cards["core/hulk"].mechanics = ["berserk", "draw", "flight"];
    assert.equal(CardMechanicsIndexSchema.safeParse(index).success, false);
  });
});
