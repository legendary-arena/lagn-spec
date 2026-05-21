/**
 * schema.villainDeckComposition.test.ts — WP-167 villain deck composition data
 *
 * Covers the three additive-optional schema fields (D-16701, D-16702) and the
 * regenerated core.json regression that proves the card data pipeline (D-16703)
 * populated villain copies, the Magneto ↔ Brotherhood Always-Leads relationship,
 * and the Midtown Bank Robbery villain-deck counts.
 *
 * Runner:  node:test (native Node.js test runner)
 * Invoke:  pnpm --filter @legendary-arena/registry test
 *
 * Assumptions:
 *   - CWD is packages/registry/ (pnpm --filter sets CWD to the package root)
 *   - data/cards/core.json exists at the monorepo root, two levels up
 *   - No network access, no database, no mocks — local files only
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VillainCardSchema, SchemeSchema, SetDataSchema } from "./schema.js";

// why: pnpm --filter sets CWD to packages/registry/; the regenerated card data
// lives at the monorepo root under data/cards/, two directory levels up.
const coreJsonPath = join(process.cwd(), "..", "..", "data", "cards", "core.json");

// why: a complete, valid villain card so each schema case differs only in the
// field under examination (copies).
const validVillainCardBase = {
  name: "Blob",
  slug: "blob",
  vp: 3,
  vAttack: 5,
  imageUrl: "https://images.barefootbetters.com/core/core-vi-brotherhood-blob.webp",
  abilities: [],
};

// why: a complete, valid scheme so the optional-count cases differ only in the
// presence of the two villain-deck count fields.
const validSchemeBase = {
  id: 1,
  name: "Midtown Bank Robbery",
  slug: "midtown-bank-robbery",
  imageUrl: "https://images.barefootbetters.com/core/core-sc-midtown-bank-robbery.webp",
  cards: [{ abilities: [] }],
};

describe("VillainCardSchema.copies (WP-167 / D-16701)", () => {
  it("accepts a positive integer copies value", () => {
    const result = VillainCardSchema.safeParse({ ...validVillainCardBase, copies: 3 });
    assert.equal(result.success, true, "VillainCardSchema must accept copies: 3");
  });

  it("accepts a villain card with no copies field (optional)", () => {
    const result = VillainCardSchema.safeParse({ ...validVillainCardBase });
    assert.equal(result.success, true, "VillainCardSchema must accept a card omitting copies");
    if (result.success) {
      assert.equal(
        "copies" in result.data,
        false,
        "Omitted copies must stay absent on the parsed object (genuinely optional, not defaulted)",
      );
    }
  });

  it("rejects copies: 0", () => {
    const result = VillainCardSchema.safeParse({ ...validVillainCardBase, copies: 0 });
    assert.equal(result.success, false, "copies: 0 must fail (min 1)");
  });

  it("rejects a negative copies value", () => {
    const result = VillainCardSchema.safeParse({ ...validVillainCardBase, copies: -1 });
    assert.equal(result.success, false, "copies: -1 must fail (min 1)");
  });
});

describe("SchemeSchema villain-deck counts (WP-167 / D-16702)", () => {
  it("accepts both villainDeckTwistCount and villainDeckBystanderCount", () => {
    const result = SchemeSchema.safeParse({
      ...validSchemeBase,
      villainDeckTwistCount: 8,
      villainDeckBystanderCount: 12,
    });
    assert.equal(result.success, true, "SchemeSchema must accept both villain-deck count fields");
  });

  it("accepts a scheme omitting both fields, and neither key is present after parse", () => {
    const result = SchemeSchema.safeParse({ ...validSchemeBase });
    assert.equal(result.success, true, "SchemeSchema must accept a scheme with neither count field");
    if (result.success) {
      assert.equal(
        "villainDeckTwistCount" in result.data,
        false,
        "Omitted villainDeckTwistCount must stay absent (genuinely optional, not defaulted)",
      );
      assert.equal(
        "villainDeckBystanderCount" in result.data,
        false,
        "Omitted villainDeckBystanderCount must stay absent (genuinely optional, not defaulted)",
      );
    }
  });

  it("rejects a negative villainDeckTwistCount", () => {
    const result = SchemeSchema.safeParse({ ...validSchemeBase, villainDeckTwistCount: -1 });
    assert.equal(result.success, false, "villainDeckTwistCount: -1 must fail (min 0)");
  });
});

describe("regenerated core.json (WP-167 / D-16703)", () => {
  const coreData = JSON.parse(readFileSync(coreJsonPath, "utf8"));

  it("validates against SetDataSchema", () => {
    const result = SetDataSchema.safeParse(coreData);
    assert.equal(
      result.success,
      true,
      "Regenerated core.json must validate against SetDataSchema" +
        (result.success ? "" : `: ${JSON.stringify(result.error.issues[0])}`),
    );
  });

  it("Brotherhood villains each have copies: 2", () => {
    const brotherhood = coreData.villains.find((group: { slug: string }) => group.slug === "brotherhood");
    assert.ok(brotherhood, "core.json must contain the brotherhood villain group");
    for (const card of brotherhood.cards) {
      assert.equal(card.copies, 2, `Brotherhood villain "${card.slug}" must have copies: 2`);
    }
  });

  it("Magneto alwaysLeads includes 'brotherhood' and Brotherhood ledBy includes 'magneto' (symmetric)", () => {
    const magneto = coreData.masterminds.find((mastermind: { slug: string }) => mastermind.slug === "magneto");
    const brotherhood = coreData.villains.find((group: { slug: string }) => group.slug === "brotherhood");
    assert.ok(magneto, "core.json must contain the magneto mastermind");
    assert.ok(brotherhood, "core.json must contain the brotherhood villain group");
    assert.ok(
      magneto.alwaysLeads.includes("brotherhood"),
      "Magneto.alwaysLeads must include 'brotherhood'",
    );
    assert.ok(
      brotherhood.ledBy.includes("magneto"),
      "Brotherhood.ledBy must include 'magneto'",
    );
  });

  it("Midtown Bank Robbery resolves villainDeckTwistCount 8 / villainDeckBystanderCount 12", () => {
    const midtown = coreData.schemes.find((scheme: { slug: string }) => scheme.slug === "midtown-bank-robbery");
    assert.ok(midtown, "core.json must contain the midtown-bank-robbery scheme");
    assert.equal(midtown.villainDeckTwistCount, 8, "Midtown villainDeckTwistCount must be 8");
    assert.equal(midtown.villainDeckBystanderCount, 12, "Midtown villainDeckBystanderCount must be 12");
  });

  it("round-trips: re-stringifying then re-parsing the parsed set is structurally unchanged", () => {
    const first = SetDataSchema.parse(coreData);
    const roundTripped = SetDataSchema.parse(JSON.parse(JSON.stringify(first)));
    assert.deepEqual(roundTripped, first, "Round-tripped core.json must be structurally identical");
  });
});
