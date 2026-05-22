/**
 * schema.schemeDeckCounts.test.ts — WP-169 scheme villain-deck count curation
 *
 * Proves the curated per-scheme villainDeckTwistCount / villainDeckBystanderCount
 * data (D-16803) is applied independently and that defaults / carve-outs are not
 * over-encoded (D-16804). The counts themselves are extracted from each scheme's
 * committed printed "Setup:" text and applied by the two converters
 * (convert-cards-v15.mjs for the 36 npm sets, apply-card-counts.mjs for the 4
 * outlier sets); these cases assert the regenerated data/cards/*.json reflect them.
 *
 * Runner:  node:test (native Node.js test runner)
 * Invoke:  pnpm --filter @legendary-arena/registry test
 *
 * Assumptions:
 *   - CWD is packages/registry/ (pnpm --filter sets CWD to the package root)
 *   - data/cards/*.json exist at the monorepo root, two levels up
 *   - No network access, no database, no mocks — local files only
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SetDataSchema } from "./schema.js";

// why: pnpm --filter sets CWD to packages/registry/; the regenerated card data
// lives at the monorepo root under data/cards/, two directory levels up.
const cardsDir = join(process.cwd(), "..", "..", "data", "cards");

type Scheme = {
  slug: string;
  villainDeckTwistCount?: number;
  villainDeckBystanderCount?: number;
};

/**
 * Reads a regenerated set file and returns the scheme matching the given slug,
 * failing loudly if the set or scheme is absent so a renamed slug surfaces here
 * rather than as a silent undefined.
 */
function findScheme(setAbbr: string, schemeSlug: string): Scheme {
  const setData = JSON.parse(readFileSync(join(cardsDir, `${setAbbr}.json`), "utf8"));
  const scheme = (setData.schemes as Scheme[]).find((candidate) => candidate.slug === schemeSlug);
  assert.ok(scheme, `${setAbbr}.json must contain the "${schemeSlug}" scheme`);
  return scheme;
}

describe("curated scheme deck counts — independent assignment (WP-169 / D-16803)", () => {
  it("a twist-only scheme carries villainDeckTwistCount and NO villainDeckBystanderCount key", () => {
    const portals = findScheme("core", "portals-to-the-dark-dimension");
    assert.equal(portals.villainDeckTwistCount, 7, "Portals prints 'Setup: 7 Twists.' → twist count 7");
    assert.equal(
      "villainDeckBystanderCount" in portals,
      false,
      "A twist-only entry must leave villainDeckBystanderCount absent (independent assignment, not defaulted)",
    );
  });

  it("the explicit-zero bystander scheme carries villainDeckBystanderCount 0 and NO twist key", () => {
    const hypnotize = findScheme("chmp", "hypnotize-every-human");
    assert.equal(
      hypnotize.villainDeckBystanderCount,
      0,
      "Hypnotize prints 'No Bystanders in the Villain Deck' → bystander count 0",
    );
    assert.equal(
      "villainDeckTwistCount" in hypnotize,
      false,
      "An entry printing the default 8 twists must leave villainDeckTwistCount absent",
    );
  });

  it("a both-counts scheme carries the printed twist and bystander counts", () => {
    const killbots = findScheme("core", "replace-earths-leaders-with-killbots");
    assert.equal(
      killbots.villainDeckTwistCount,
      5,
      "Killbots prints '5 Twists' in the deck (the 3 additional next to the Scheme are excluded)",
    );
    assert.equal(
      killbots.villainDeckBystanderCount,
      18,
      "Killbots prints '18 total Bystanders in the Villain Deck' → bystander count 18",
    );
  });
});

describe("outlier-set application via apply-card-counts.mjs (WP-169 Scope B)", () => {
  it("a 2099 outlier scheme carries its curated twist count", () => {
    const pullReality = findScheme("2099", "pull-reality-into-cyberspace");
    assert.equal(
      pullReality.villainDeckTwistCount,
      7,
      "2099 pull-reality-into-cyberspace prints 'Setup: 7 Twists' → twist count 7 (proves Scope B wiring)",
    );
  });
});

describe("defaults and carve-outs are not over-encoded (WP-169 / D-16804)", () => {
  it("a default-8 scheme with no explicit bystander count carries neither field", () => {
    const cosmicCube = findScheme("core", "unleash-the-power-of-the-cosmic-cube");
    assert.equal(
      "villainDeckTwistCount" in cosmicCube,
      false,
      "An 8-twist scheme must stay unencoded (the 8-twist default is already correct)",
    );
    assert.equal(
      "villainDeckBystanderCount" in cosmicCube,
      false,
      "A scheme naming no villain-deck bystander count must stay unencoded (numPlayers default applies)",
    );
  });

  it("a player-count-dependent (carve-out) scheme carries NO villainDeckTwistCount", () => {
    const civilWar = findScheme("core", "super-hero-civil-war");
    assert.equal(
      "villainDeckTwistCount" in civilWar,
      false,
      "Super Hero Civil War (2-3 players: 8; 4-5 players: 5) is carved out and must keep the 8-twist fallback",
    );
  });
});

describe("all 40 regenerated data/cards/*.json validate against SetDataSchema", () => {
  const setFiles = readdirSync(cardsDir).filter((file) => file.endsWith(".json"));

  it("the cards directory holds exactly 40 set files", () => {
    assert.equal(setFiles.length, 40, "data/cards/ must contain all 40 regenerated set files");
  });

  for (const file of setFiles) {
    it(`${file} validates`, () => {
      const setData = JSON.parse(readFileSync(join(cardsDir, file), "utf8"));
      const result = SetDataSchema.safeParse(setData);
      assert.equal(
        result.success,
        true,
        `${file} must validate against SetDataSchema` +
          (result.success ? "" : `: ${JSON.stringify(result.error.issues[0])}`),
      );
    });
  }
});
