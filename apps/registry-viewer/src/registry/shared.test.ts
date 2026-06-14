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
import type { FlatCard, CardQueryExtended } from "./browser.js";
import type { SetData } from "./types/types-index.js";

const fixtureCards: FlatCard[] = [
  {
    key:       "core-hero-spider-man-web-of-confusion",
    extId:     "core/spider-man",
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
    extId:     "core/dr-doom",
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
    const q: CardQueryExtended = { cardTypes: ["sidekick"] };
    const result = applyQuery(fixtureCards, q);
    assert.equal(result.length, 0);
  });

  it("shield-agent filter returns zero cards (Phase 2 emission upstream)", () => {
    const q: CardQueryExtended = { cardTypes: ["shield-agent"] };
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
    const q: CardQueryExtended = { cardTypes: ["totally-fake-slug"] };
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

  it("emits one FlatCard per card when a henchman group has a multi-entry cards array", () => {
    // why: locks the per-card branch added 2026-05-01 alongside the upstream
    // converter change. Mandarin's Rings (rvlt) has 10 name-distinct ring
    // cards, each with its own image. Each card must surface as its own
    // browsable FlatCard with key {abbr}-henchman-{groupSlug}-{cardSlug}.
    const setData = buildHenchmanFixture([
      {
        id:        34,
        name:      "Mandarin's Rings",
        slug:      "mandarins-rings",
        imageUrl:  "https://images.barefootbetters.com/rvlt/rvlt-hm-mandarins-rings-daimonic-the-white-light.webp",
        abilities: [],
        cards: [
          {
            name:      "Daimonic, The White Light",
            slug:      "daimonic-the-white-light",
            imageUrl:  "https://images.barefootbetters.com/rvlt/rvlt-hm-mandarins-rings-daimonic-the-white-light.webp",
            abilities: ["Fight: Draw a card."],
          },
          {
            name:      "Zero, The Ice Blast",
            slug:      "zero-the-ice-blast",
            imageUrl:  "https://images.barefootbetters.com/rvlt/rvlt-hm-mandarins-rings-zero-the-ice-blast.webp",
            abilities: ["Fight: Choose a card you played this turn that costs 0..."],
          },
        ],
      },
    ]);
    const result = flattenSet(setData, "Revelations");
    assert.equal(result.length, 2);
    assert.equal(result[0]!.cardType, "henchman");
    assert.equal(result[0]!.slug, "daimonic-the-white-light");
    assert.equal(result[0]!.key, "core-henchman-mandarins-rings-daimonic-the-white-light");
    assert.equal(result[0]!.name, "Daimonic, The White Light");
    assert.equal(
      result[0]!.imageUrl,
      "https://images.barefootbetters.com/rvlt/rvlt-hm-mandarins-rings-daimonic-the-white-light.webp"
    );
    assert.deepEqual(result[0]!.abilities, ["Fight: Draw a card."]);
    assert.equal(result[1]!.slug, "zero-the-ice-blast");
    assert.equal(result[1]!.key, "core-henchman-mandarins-rings-zero-the-ice-blast");
    assert.equal(
      result[1]!.imageUrl,
      "https://images.barefootbetters.com/rvlt/rvlt-hm-mandarins-rings-zero-the-ice-blast.webp"
    );
  });
});

function buildOtherFixture(other: unknown[]): SetData {
  return {
    id:          1,
    abbr:        "core",
    heroes:      [],
    masterminds: [],
    villains:    [],
    henchmen:    [],
    schemes:     [],
    bystanders:  [],
    wounds:      [],
    other,
  } as unknown as SetData;
}

describe("flattenSet other-block cardType dispatch (WP-123)", () => {
  it("emits one FlatCard with the entry's declared cardType", () => {
    const setData = buildOtherFixture([
      {
        id:        1,
        name:      "Wasp",
        slug:      "wasp",
        cardType:  "sidekick",
        imageUrl:  "https://images.barefootbetters.com/example/example-sk-wasp.webp",
        abilities: [],
      },
    ]);
    const result = flattenSet(setData, "Example Set");
    const sidekickCards = result.filter((card) => card.cardType === "sidekick");
    assert.equal(sidekickCards.length, 1);
    assert.equal(sidekickCards[0]!.cardType, "sidekick");
    assert.equal(sidekickCards[0]!.slug, "wasp");
    assert.equal(sidekickCards[0]!.key, "core-sidekick-wasp");
    assert.equal(sidekickCards[0]!.setAbbr, "core");
    assert.equal(
      sidekickCards[0]!.imageUrl,
      "https://images.barefootbetters.com/example/example-sk-wasp.webp"
    );
  });

  it("falls back to \"other\" when entry has no cardType field", () => {
    const setData = buildOtherFixture([
      {
        id:        2,
        name:      "Mystery Card",
        slug:      "mystery-card",
        imageUrl:  "https://images.barefootbetters.com/example/example-other-mystery.webp",
        abilities: [],
      },
    ]);
    const result = flattenSet(setData, "Example Set");
    assert.equal(result.length, 1);
    assert.equal(result[0]!.cardType, "other");
    assert.equal(result[0]!.slug, "mystery-card");
    assert.equal(result[0]!.key, "core-other-mystery-card");
  });

  it("dispatches multiple entries to their declared cardTypes", () => {
    const setData = buildOtherFixture([
      {
        cardType:  "sidekick",
        slug:      "wasp",
        name:      "Wasp",
        imageUrl:  "https://images.barefootbetters.com/example/example-sk-wasp.webp",
        abilities: [],
      },
      {
        cardType:  "shield-agent",
        slug:      "phil-coulson",
        name:      "Agent Coulson",
        imageUrl:  "https://images.barefootbetters.com/example/example-sa-phil-coulson.webp",
        abilities: [],
      },
      {
        slug:      "untagged-card",
        name:      "Untagged",
        imageUrl:  "https://images.barefootbetters.com/example/example-other-untagged.webp",
        abilities: [],
      },
    ]);
    const result = flattenSet(setData, "Example Set");
    assert.equal(result.length, 3);
    assert.equal(result[0]!.cardType, "sidekick");
    assert.equal(result[0]!.key, "core-sidekick-wasp");
    assert.equal(result[1]!.cardType, "shield-agent");
    assert.equal(result[1]!.key, "core-shield-agent-phil-coulson");
    assert.equal(result[2]!.cardType, "other");
    assert.equal(result[2]!.key, "core-other-untagged-card");
  });

  it("emits zero FlatCards from set.other when array is empty", () => {
    const setData = buildOtherFixture([]);
    const result = flattenSet(setData, "Example Set");
    assert.equal(result.length, 0);
  });
});

// ===========================================================================
// D-14103 — physicalCards hero-card imageUrl migration
// ===========================================================================

describe("flattenSet hero physicalCardImageUrl (D-14103)", () => {
  it("populates physicalCardImageUrl from physicalCards[] for hero cards", () => {
    const setData = {
      id: 1,
      abbr: "bkwd",
      heroes: [
        {
          name: "Falcon/Winter Soldier",
          slug: "falcon-winter-soldier",
          cards: [
            { slug: "attune", name: "Attune", imageUrl: "https://img/old-attune.webp", abilities: [] },
            { slug: "atone", name: "Atone", imageUrl: "https://img/old-atone.webp", abilities: [] },
          ],
          physicalCards: [
            { id: "p1", count: 5, imageUrl: "https://img/attune-atone.webp", sides: ["attune", "atone"] },
          ],
        },
      ],
      masterminds: [],
      villains: [],
      henchmen: [],
      schemes: [],
      bystanders: [],
      wounds: [],
      other: [],
    } as unknown as SetData;

    const result = flattenSet(setData, "BKWD Set");
    const attune = result.find((c) => c.slug === "attune");
    const atone = result.find((c) => c.slug === "atone");

    assert.ok(attune, "attune card must exist");
    assert.equal(attune.physicalCardImageUrl, "https://img/attune-atone.webp", "physicalCardImageUrl from physicalCards");
    assert.equal(attune.imageUrl, "https://img/attune-atone.webp", "imageUrl prefers physicalCards source");

    assert.ok(atone, "atone card must exist");
    assert.equal(atone.physicalCardImageUrl, "https://img/attune-atone.webp", "back-side also gets physicalCardImageUrl");
  });

  it("yields empty imageUrl when physicalCards is absent (D-15101)", () => {
    const setData = {
      id: 1,
      abbr: "core",
      heroes: [
        {
          name: "Spider-Man",
          slug: "spider-man",
          cards: [
            { slug: "web", name: "Web", abilities: [] },
          ],
        },
      ],
      masterminds: [],
      villains: [],
      henchmen: [],
      schemes: [],
      bystanders: [],
      wounds: [],
      other: [],
    } as unknown as SetData;

    const result = flattenSet(setData, "Core Set");
    const web = result.find((c) => c.slug === "web");

    assert.ok(web, "web card must exist");
    assert.equal(web.imageUrl, "", "imageUrl is empty when physicalCards absent");
    assert.equal(web.physicalCardImageUrl, undefined, "physicalCardImageUrl undefined when no physicalCards");
  });
});

// ===========================================================================
// WP-170 — Card Count display (count + setTotal on FlatCard)
// ===========================================================================

describe("flattenSet villain card-count (WP-170)", () => {
  it("Brotherhood: Blob is 2 of 8, totals shared across all group cards", () => {
    const setData = {
      id: 1,
      abbr: "core",
      heroes: [],
      masterminds: [],
      villains: [
        {
          id: 1,
          name: "Brotherhood",
          slug: "brotherhood",
          cards: [
            { name: "Blob", slug: "blob", copies: 2, abilities: [] },
            { name: "Juggernaut", slug: "juggernaut", copies: 2, abilities: [] },
            { name: "Mystique", slug: "mystique", copies: 2, abilities: [] },
            { name: "Sabretooth", slug: "sabretooth", copies: 2, abilities: [] },
          ],
        },
      ],
      henchmen: [], schemes: [], bystanders: [], wounds: [], other: [],
    } as unknown as SetData;

    const result = flattenSet(setData, "Core Set");
    const blob = result.find((c) => c.slug === "blob");
    const juggernaut = result.find((c) => c.slug === "juggernaut");

    assert.ok(blob, "blob must exist");
    assert.equal(blob.count, 2, "Blob count");
    assert.equal(blob.setTotal, 8, "Brotherhood group total = 4 × 2");
    assert.ok(juggernaut, "juggernaut must exist");
    assert.equal(juggernaut.setTotal, 8, "Group total reused across all cards");
  });

  it("treats missing copies as 1 at computation time (no source mutation)", () => {
    const groupCards = [
      { name: "A", slug: "a", abilities: [] },
      { name: "B", slug: "b", copies: 3, abilities: [] },
    ];
    const setData = {
      id: 1, abbr: "core", heroes: [], masterminds: [],
      villains: [{ id: 1, name: "Mixed", slug: "mixed", cards: groupCards }],
      henchmen: [], schemes: [], bystanders: [], wounds: [], other: [],
    } as unknown as SetData;

    const result = flattenSet(setData, "Core Set");
    const a = result.find((c) => c.slug === "a");
    const b = result.find((c) => c.slug === "b");
    assert.equal(a?.count, 1, "absent copies defaults to 1");
    assert.equal(b?.count, 3, "explicit copies preserved");
    assert.equal(a?.setTotal, 4, "group total = 1 + 3");
    assert.equal(b?.setTotal, 4, "group total shared");
    // source data must not be mutated
    assert.equal((groupCards[0] as Record<string, unknown>)["copies"], undefined, "source still has no copies");
  });
});

describe("flattenSet hero card-count (WP-170, name-keyed amendment)", () => {
  // why: R2 cardCounts is keyed by card display name, not rarity (verified
  // 2026-05-22 across 5 heroes). Original WP spec said rarity-key; amendment
  // landed in this execution session corrects to name-key lookup.
  it("Black Widow standard deck: rare card is 1 of 14", () => {
    const setData = {
      id: 1, abbr: "core",
      heroes: [
        {
          name: "Black Widow",
          slug: "black-widow",
          cardCounts: {
            "Dangerous Rescue": 5,
            "Mission Accomplished": 5,
            "Covert Operation": 3,
            "Silent Sniper": 1,
          },
          cards: [
            { name: "Dangerous Rescue", slug: "dangerous-rescue", rarity: 1, abilities: [] },
            { name: "Mission Accomplished", slug: "mission-accomplished", rarity: 1, abilities: [] },
            { name: "Covert Operation", slug: "covert-operation", rarity: 2, abilities: [] },
            { name: "Silent Sniper", slug: "silent-sniper", rarity: 3, abilities: [] },
          ],
        },
      ],
      masterminds: [], villains: [], henchmen: [], schemes: [], bystanders: [], wounds: [], other: [],
    } as unknown as SetData;

    const result = flattenSet(setData, "Core Set");
    const silentSniper = result.find((c) => c.slug === "silent-sniper");
    const dangerousRescue = result.find((c) => c.slug === "dangerous-rescue");

    assert.ok(silentSniper, "silent sniper must exist");
    assert.equal(silentSniper.count, 1, "rare card (Silent Sniper) count = 1");
    assert.equal(silentSniper.setTotal, 14, "deck total = 5+5+3+1");
    assert.ok(dangerousRescue, "dangerous rescue must exist");
    assert.equal(dangerousRescue.count, 5, "common card (Dangerous Rescue) count = 5");
    assert.equal(dangerousRescue.setTotal, 14, "deck total shared");
  });

  it("hero without cardCounts (e.g. SHIELD Officer): count and setTotal undefined", () => {
    const setData = {
      id: 1, abbr: "shld",
      heroes: [
        {
          name: "Dum Dum Dugan",
          slug: "dum-dum-dugan",
          cards: [
            { name: "Officer", slug: "officer", abilities: [] },
          ],
        },
      ],
      masterminds: [], villains: [], henchmen: [], schemes: [], bystanders: [], wounds: [], other: [],
    } as unknown as SetData;

    const result = flattenSet(setData, "SHIELD");
    const officer = result.find((c) => c.slug === "officer");
    assert.ok(officer, "officer must exist");
    assert.equal(officer.count, undefined, "count undefined when cardCounts absent");
    assert.equal(officer.setTotal, undefined, "setTotal undefined when cardCounts absent");
  });

  it("AND-semantics edge case: card name not in cardCounts ⇒ count undefined (setTotal stays defined)", () => {
    // why: lock the strict AND-semantics — if a card's name doesn't appear in
    // cardCounts (data drift, alt-card), count must be undefined so the row
    // omits. setTotal is still precomputed from the hero's cardCounts; the
    // template never renders the row when count is missing.
    const setData = {
      id: 1, abbr: "core",
      heroes: [
        {
          name: "Black Widow",
          slug: "black-widow",
          cardCounts: {
            "Dangerous Rescue": 5,
            "Mission Accomplished": 5,
            "Covert Operation": 3,
            "Silent Sniper": 1,
          },
          cards: [
            { name: "Orphaned Variant", slug: "orphaned-variant", rarity: 1, abilities: [] },
          ],
        },
      ],
      masterminds: [], villains: [], henchmen: [], schemes: [], bystanders: [], wounds: [], other: [],
    } as unknown as SetData;

    const result = flattenSet(setData, "Core Set");
    const orphan = result.find((c) => c.slug === "orphaned-variant");
    assert.ok(orphan, "orphan must exist");
    assert.equal(orphan.count, undefined, "name not in cardCounts ⇒ count undefined");
    assert.equal(orphan.setTotal, 14, "setTotal still precomputed from hero cardCounts");
  });
});

describe("schema preservation through Zod parse (WP-170)", () => {
  it("villain copies and hero cardCounts survive SetDataSchema.safeParse()", async () => {
    const { SetDataSchema } = await import("./schema.js");
    const raw = {
      id: 1, abbr: "core",
      heroes: [
        {
          name: "Black Widow",
          slug: "black-widow",
          cardCounts: { "Silent Sniper": 1, "Covert Operation": 3 },
          cards: [
            { name: "Silent Sniper", slug: "silent-sniper", rarity: 3, abilities: [] },
          ],
        },
      ],
      masterminds: [],
      villains: [
        {
          id: 1, name: "Brotherhood", slug: "brotherhood",
          cards: [
            { name: "Blob", slug: "blob", copies: 2, abilities: [] },
          ],
        },
      ],
      henchmen: [], schemes: [], bystanders: [], wounds: [], other: [],
    };
    const parsed = SetDataSchema.safeParse(raw);
    assert.equal(parsed.success, true, "raw set parses cleanly");
    if (!parsed.success) return;
    const widow = parsed.data.heroes[0];
    assert.deepEqual(widow?.cardCounts, { "Silent Sniper": 1, "Covert Operation": 3 }, "cardCounts preserved");
    const blob = parsed.data.villains[0]?.cards[0];
    assert.equal((blob as { copies?: number })?.copies, 2, "villain copies preserved");
  });
});
