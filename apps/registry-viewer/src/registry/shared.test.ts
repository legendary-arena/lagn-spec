/**
 * shared.test.ts — Phase 1 ribbon zero-card invariants for WP-086.
 *
 * Asserts that filtering by Phase-2-only cardType slugs (sidekick,
 * shield-agent) returns zero cards because flattenSet() in shared.ts
 * assigns one of 8 hardcoded literals (hero / mastermind / villain /
 * henchman / scheme / bystander / wound / other) and never sidekick or
 * shield-*. Phase 2 (separate WP) regenerates per-card cardType emission
 * upstream via modern-master-strike.
 *
 * Also asserts the existing `hero` regression baseline + no-crash
 * behavior on unknown slugs.
 *
 * Runner: node:test (native Node.js)
 * Invoke: pnpm --filter registry-viewer test
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { applyQuery, flattenSet } from "./shared.js";
import type { FlatCard, FlatCardType, CardQueryExtended } from "./browser.js";
import type { SetData } from "./types/types-index.js";

const fixtureCards: FlatCard[] = [
  {
    key:       "core-hero-spider-man-web-of-confusion",
    cardType:  "hero",
    setAbbr:   "core",
    setName:   "Core Set",
    name:      "Web of Confusion",
    slug:      "web-of-confusion",
    imageUrl:  "https://images.barefootbetters.com/core/example.webp",
    abilities: [],
  },
  {
    key:       "core-mastermind-dr-doom-main",
    cardType:  "mastermind",
    setAbbr:   "core",
    setName:   "Core Set",
    name:      "Dr. Doom",
    slug:      "dr-doom",
    imageUrl:  "https://images.barefootbetters.com/core/example.webp",
    abilities: [],
  },
];

describe("Phase 1 ribbon zero-card invariants (WP-086)", () => {
  it("sidekick filter returns zero cards (Phase 2 emission upstream)", () => {
    // why: cast to FlatCardType[] because "sidekick" is not in the 9-value
    // FlatCardType union at registry/types/types-index.ts. The cast mirrors
    // App.vue's applyFilters cast at the registry.query call site — both
    // reflect that selectedTypes can hold Phase-2-only slugs without widening
    // the narrow registry type.
    const q: CardQueryExtended = { cardTypes: ["sidekick"] as unknown as FlatCardType[] };
    const result = applyQuery(fixtureCards, q);
    assert.equal(result.length, 0);
  });

  it("shield-agent filter returns zero cards (Phase 2 emission upstream)", () => {
    const q: CardQueryExtended = { cardTypes: ["shield-agent"] as unknown as FlatCardType[] };
    const result = applyQuery(fixtureCards, q);
    assert.equal(result.length, 0);
  });

  it("hero filter returns hero cards (regression baseline)", () => {
    const q: CardQueryExtended = { cardTypes: ["hero"] };
    const result = applyQuery(fixtureCards, q);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.cardType, "hero");
  });

  it("unknown slug returns zero cards without crashing", () => {
    const q: CardQueryExtended = { cardTypes: ["totally-fake-slug"] as unknown as FlatCardType[] };
    const result = applyQuery(fixtureCards, q);
    assert.equal(result.length, 0);
  });
});

// why: build a minimal SetData with empty arrays for every category other
// than the henchmen list provided by the caller. flattenSet consumes
// SetData directly with no Zod parse step, so the fixture is constructed
// in-memory and cast to SetData rather than round-tripped through schema.
function buildHenchmanFixture(henchmen: unknown[]): SetData {
  return {
    id:          1,
    abbr:        "core",
    heroes:      [],
    masterminds: [],
    villains:    [],
    henchmen,
    schemes:     [],
    bystanders:  [],
    wounds:      [],
    other:       [],
  } as unknown as SetData;
}

describe("flattenSet henchman emission (WP-122)", () => {
  it("emits exactly one FlatCard per henchman group with the real-data shape", () => {
    const setData = buildHenchmanFixture([
      {
        id:        1,
        name:      "Doombot Legion",
        slug:      "doombot-legion",
        imageUrl:  "https://images.barefootbetters.com/core/core-hm-doombot-legion.webp",
        abilities: [],
      },
    ]);
    const result = flattenSet(setData, "Core Set");
    assert.equal(result.length, 1);
    assert.equal(result[0]!.cardType, "henchman");
    assert.equal(result[0]!.slug, "doombot-legion");
    assert.equal(result[0]!.key, "core-henchman-doombot-legion");
    assert.equal(result[0]!.setAbbr, "core");
    assert.equal(result[0]!.setName, "Core Set");
    assert.equal(result[0]!.name, "Doombot Legion");
    assert.equal(
      result[0]!.imageUrl,
      "https://images.barefootbetters.com/core/core-hm-doombot-legion.webp"
    );
  });

  it("emits zero FlatCards when set.henchmen is empty", () => {
    const setData = buildHenchmanFixture([]);
    const result = flattenSet(setData, "Core Set");
    const henchmanCards = result.filter((card) => card.cardType === "henchman");
    assert.equal(henchmanCards.length, 0);
  });

  it("falls back through name then literal 'henchman' when slug is absent", () => {
    const setData = buildHenchmanFixture([
      {
        id:        2,
        name:      "Sentinel",
        imageUrl:  "https://images.barefootbetters.com/example/sentinel.webp",
        abilities: [],
      },
      {
        id:        3,
        imageUrl:  "https://images.barefootbetters.com/example/anonymous.webp",
        abilities: [],
      },
    ]);
    const result = flattenSet(setData, "Example Set");
    assert.equal(result.length, 2);
    assert.equal(result[0]!.slug, "Sentinel");
    assert.equal(result[0]!.key, "core-henchman-Sentinel");
    assert.equal(result[1]!.slug, "henchman");
    assert.equal(result[1]!.key, "core-henchman-henchman");
    assert.equal(result[1]!.name, "henchman");
  });

  it("surfaces flat imageUrl and ignores imageUrlByClass when both are present", () => {
    const setData = buildHenchmanFixture([
      {
        id:        43,
        name:      "Tardigrade",
        slug:      "tardigrade",
        imageUrl:  "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade-covert.webp",
        abilities: [],
        imageUrlByClass: {
          covert:   "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade-covert.webp",
          instinct: "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade-instinct.webp",
          ranged:   "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade-ranged.webp",
          strength: "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade-strength.webp",
          tech:     "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade-tech.webp",
        },
      },
    ]);
    const result = flattenSet(setData, "Age of Marvel-Whittier Pop");
    assert.equal(result.length, 1);
    assert.equal(
      result[0]!.imageUrl,
      "https://images.barefootbetters.com/amwp/amwp-hm-tardigrade-covert.webp"
    );
    const projection = result[0]! as unknown as Record<string, unknown>;
    assert.equal(projection["imageUrlByClass"], undefined);
  });
});
