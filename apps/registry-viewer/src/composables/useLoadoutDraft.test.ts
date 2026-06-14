/**
 * useLoadoutDraft.test.ts — node:test coverage for the loadout-draft
 * composable's theme-prefill ext_id resolution (D-24018 follow-up).
 *
 * `prefillFromTheme` must convert the BARE entity slugs stored in theme
 * setupIntent (e.g. "magneto", "brotherhood") into the set-qualified ext_ids
 * ("{setAbbr}/{slug}") the engine's match-setup validator requires (D-10014).
 * Copying bare slugs verbatim — the pre-D-24018 behavior — produced loadouts
 * the engine rejected with an HTTP 500 at match creation. These tests pin:
 *   - all five composition fields resolve to qualified ext_ids and validate
 *   - cardType disambiguation (the same slug maps to different ext_ids per
 *     type — "magneto" is a hero in one set and a mastermind in another)
 *   - matching reads the ENTITY slug from extId, not FlatCard.slug
 *   - unresolved slugs are kept verbatim so the live error list flags them
 *   - reprint ambiguity prefers the core set, else stays unresolved
 *   - already-qualified slugs pass through untouched
 *
 * Runner: node:test (native Node.js)
 * Invoke: pnpm --filter registry-viewer test
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import type { ThemeDefinition } from "../lib/themeClient.js";

import { useLoadoutDraft } from "./useLoadoutDraft.js";

// why: a minimal stand-in for the real CardRegistry (FlatCard[]). The
// composable only reads `extId` (validation) and `cardType` (prefill
// resolution) off each card, so the fixture carries just those two fields.
function makeRegistry(
  cards: Array<{ extId: string; cardType: string }>,
): { listCards: () => Array<{ extId: string; cardType: string }> } {
  return { listCards: () => cards };
}

/** Builds a full theme setupIntent with sensible defaults the tests override. */
function makeSetupIntent(
  overrides: Partial<ThemeDefinition["setupIntent"]>,
): ThemeDefinition["setupIntent"] {
  return {
    mastermindId: "magneto",
    schemeId: "midtown-bank-robbery",
    villainGroupIds: ["brotherhood"],
    henchmanGroupIds: ["sentinel"],
    heroDeckIds: ["spider-man"],
    bystanderSetIds: [],
    woundSetIds: [],
    sidekickCardIds: [],
    officerCardIds: [],
    ...overrides,
  };
}

/** Wraps a setupIntent in an otherwise-complete v2 ThemeDefinition fixture. */
function makeTheme(
  setupIntent: ThemeDefinition["setupIntent"],
): ThemeDefinition {
  return {
    themeSchemaVersion: 2,
    themeId: "test-theme",
    name: "Test Theme",
    description: "A theme fixture for prefill resolution tests.",
    setupIntent,
    playerCount: { recommended: [2], min: 2, max: 4 },
    tags: [],
    tips: [],
  };
}

// A registry covering the slugs the tests reference, including two deliberate
// collisions: "magneto" exists as a core mastermind AND a Villains-set hero
// (different ext_ids), and "storm" is reprinted as a hero in both core and
// xmen.
const FULL_REGISTRY = makeRegistry([
  { extId: "core/midtown-bank-robbery", cardType: "scheme" },
  { extId: "core/magneto", cardType: "mastermind" },
  { extId: "core/loki", cardType: "mastermind" },
  { extId: "core/brotherhood", cardType: "villain" },
  { extId: "core/hydra", cardType: "villain" },
  { extId: "core/sentinel", cardType: "henchman" },
  { extId: "core/spider-man", cardType: "hero" },
  { extId: "core/wolverine", cardType: "hero" },
  { extId: "core/storm", cardType: "hero" },
  { extId: "xmen/storm", cardType: "hero" },
  { extId: "vill/magneto", cardType: "hero" },
]);

describe("useLoadoutDraft prefillFromTheme — ext_id resolution (D-24018)", () => {
  it("resolves every bare composition slug to its set-qualified ext_id and validates", () => {
    const api = useLoadoutDraft(FULL_REGISTRY);
    api.prefillFromTheme(
      makeTheme(
        makeSetupIntent({
          schemeId: "midtown-bank-robbery",
          mastermindId: "loki",
          villainGroupIds: ["brotherhood", "hydra"],
          henchmanGroupIds: ["sentinel"],
          heroDeckIds: ["spider-man", "wolverine"],
        }),
      ),
    );

    const composition = api.draft.value.composition;
    assert.equal(composition.schemeId, "core/midtown-bank-robbery");
    assert.equal(composition.mastermindId, "core/loki");
    assert.deepEqual(composition.villainGroupIds, ["core/brotherhood", "core/hydra"]);
    assert.deepEqual(composition.henchmanGroupIds, ["core/sentinel"]);
    assert.deepEqual(composition.heroDeckIds, ["core/spider-man", "core/wolverine"]);
    assert.equal(api.draft.value.themeId, "test-theme");
    assert.equal(
      api.isValid.value,
      true,
      `Expected a fully-resolved theme prefill to validate; errors: ${JSON.stringify(api.errors.value)}`,
    );
  });

  it("disambiguates the same slug by cardType — mastermind 'magneto' → core/magneto", () => {
    const api = useLoadoutDraft(FULL_REGISTRY);
    api.prefillFromTheme(makeTheme(makeSetupIntent({ mastermindId: "magneto" })));
    // why: "magneto" exists as both a core mastermind and a Villains-set hero;
    // the mastermind field must resolve to the mastermind ext_id, not the hero.
    assert.equal(api.draft.value.composition.mastermindId, "core/magneto");
  });

  it("disambiguates the same slug by cardType — hero 'magneto' → vill/magneto", () => {
    const api = useLoadoutDraft(FULL_REGISTRY);
    api.prefillFromTheme(makeTheme(makeSetupIntent({ heroDeckIds: ["magneto"] })));
    // why: the hero field must resolve to the hero ext_id even though a
    // mastermind named "magneto" exists in a different set.
    assert.deepEqual(api.draft.value.composition.heroDeckIds, ["vill/magneto"]);
  });

  it("matches the ENTITY slug carried in extId, not the per-card FlatCard.slug", () => {
    // why: hero "wolverine" has extId "core/wolverine" but its FlatCard.slug is
    // an individual card slug (e.g. "keen-senses"). A FlatCard.slug match would
    // miss it; resolution must read the slug portion of extId.
    const registry = makeRegistry([
      { extId: "core/wolverine", cardType: "hero" },
      { extId: "core/midtown-bank-robbery", cardType: "scheme" },
      { extId: "core/magneto", cardType: "mastermind" },
      { extId: "core/brotherhood", cardType: "villain" },
      { extId: "core/sentinel", cardType: "henchman" },
    ]);
    const api = useLoadoutDraft(registry);
    api.prefillFromTheme(makeTheme(makeSetupIntent({ heroDeckIds: ["wolverine"] })));
    assert.deepEqual(api.draft.value.composition.heroDeckIds, ["core/wolverine"]);
  });

  it("keeps an unresolvable slug verbatim so the validator flags it", () => {
    const api = useLoadoutDraft(FULL_REGISTRY);
    api.prefillFromTheme(
      makeTheme(makeSetupIntent({ mastermindId: "no-such-mastermind" })),
    );
    // why: a slug matching no card of its type is kept bare — the existing
    // validation error list surfaces an actionable error instead of the fix
    // silently dropping the field or the engine throwing an HTTP 500.
    assert.equal(api.draft.value.composition.mastermindId, "no-such-mastermind");
    assert.equal(api.isValid.value, false);
    const mastermindError = api.errors.value.find(
      (entry) => entry.field === "composition.mastermindId",
    );
    assert.ok(
      mastermindError,
      "Expected a validation error on composition.mastermindId for the unresolved bare slug.",
    );
  });

  it("prefers the core set when a reprinted slug is ambiguous across sets", () => {
    const api = useLoadoutDraft(FULL_REGISTRY);
    api.prefillFromTheme(makeTheme(makeSetupIntent({ heroDeckIds: ["storm"] })));
    // why: "storm" is a hero in both core and xmen; prefer core/storm.
    assert.deepEqual(api.draft.value.composition.heroDeckIds, ["core/storm"]);
  });

  it("resolves a reprint deterministically (lexicographically-first) when no core candidate exists", () => {
    const registry = makeRegistry([
      { extId: "bbb/ambiguous", cardType: "villain" },
      { extId: "aaa/ambiguous", cardType: "villain" },
    ]);
    const api = useLoadoutDraft(registry);
    api.prefillFromTheme(makeTheme(makeSetupIntent({ villainGroupIds: ["ambiguous"] })));
    // why: every "{set}/ambiguous" printing is a villain ext_id the engine
    // accepts; resolution picks the lexicographically-first ("aaa/ambiguous")
    // deterministically rather than 500-ing the match. Registry order is
    // intentionally reversed here to prove the sort, not iteration order,
    // decides.
    assert.deepEqual(api.draft.value.composition.villainGroupIds, ["aaa/ambiguous"]);
  });

  it("keeps a slug bare only when NO card of that type carries it", () => {
    const api = useLoadoutDraft(FULL_REGISTRY);
    api.prefillFromTheme(
      makeTheme(makeSetupIntent({ villainGroupIds: ["does-not-exist"] })),
    );
    // why: zero candidates is the only null path — the bare slug stays so the
    // validator surfaces a genuine theme/card data gap.
    assert.deepEqual(api.draft.value.composition.villainGroupIds, ["does-not-exist"]);
    assert.equal(api.isValid.value, false);
  });

  it("passes an already-qualified slug through untouched", () => {
    const api = useLoadoutDraft(FULL_REGISTRY);
    api.prefillFromTheme(
      makeTheme(makeSetupIntent({ schemeId: "core/midtown-bank-robbery" })),
    );
    assert.equal(api.draft.value.composition.schemeId, "core/midtown-bank-robbery");
  });
});
