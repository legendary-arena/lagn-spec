/**
 * cardMechanicsClient.test.ts — node:test coverage for the hero-mechanic feed
 * fetcher and its pure card→mechanic predicate (WP-270 / EC-301).
 *
 * Covers client behavior — happy path, schema rejection (non-blocking), HTTP
 * failure (non-blocking), singleton caching — and predicate correctness —
 * empty selection passes every card, a single slug matches only mapped cards,
 * OR-within-selected-mechanics, and AND-across composition against a
 * pre-narrowed (query-result) subset.
 *
 * This verifies the VIEWER CLIENT's use of the schema and the predicate; it
 * does NOT re-test or redefine the producer `CardMechanicsIndexSchema` — that
 * is WP-269's `schema.cardMechanicsIndex.test.ts`.
 *
 * Runner: node:test (native Node.js)
 * Invoke: pnpm --filter registry-viewer test
 */

import { describe, it, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import type { CardMechanicsIndex } from "@legendary-arena/registry/schema";
import {
  getCardMechanics,
  resetCardMechanics,
  cardMatchesMechanics,
} from "./cardMechanicsClient.js";

// why: stub globalThis.fetch per test rather than importing a mocking
// framework. Node 22+ has fetch as a built-in, so reassigning the global is
// the lowest-friction approach and matches cardTypesClient.test.ts.
const originalFetch = globalThis.fetch;

function stubFetch(
  handler: (url: string) => Promise<Partial<Response>> | Partial<Response>,
): { callCount: () => number } {
  let count = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    count++;
    const url = typeof input === "string" ? input : input.toString();
    const partial = await handler(url);
    return partial as Response;
  }) as typeof fetch;
  return { callCount: () => count };
}

// A schema-valid hero-mechanic feed. The cross-field invariants the producer
// schema enforces are satisfied here so the happy-path parse succeeds:
// cardCount === cardIds.length, every mechanics[].cardIds[] appears in cards{}
// with that slug, and every cards[extId].mechanics[] slug is declared.
const VALID_FEED: CardMechanicsIndex = {
  version:     1,
  scope:       "hero",
  generatedAt: "2026-06-20T00:00:00.000Z",
  mechanics: [
    {
      slug:      "undercover",
      label:     "Undercover",
      scope:     "hero",
      source:    "free-text",
      cardCount: 2,
      cardIds:   ["2099/doctor-doom-2099", "2099/ghost-rider-2099"],
      hidden:    false,
    },
    {
      slug:      "fated-future",
      label:     "Fated Future",
      scope:     "hero",
      source:    "free-text",
      cardCount: 1,
      cardIds:   ["2099/doctor-doom-2099"],
      hidden:    true,
    },
    {
      slug:      "antics",
      label:     "Antics",
      scope:     "hero",
      source:    "free-text",
      cardCount: 1,
      cardIds:   ["3dtc/deadpool"],
      hidden:    false,
    },
  ],
  cards: {
    "2099/doctor-doom-2099": { mechanics: ["undercover", "fated-future"] },
    "2099/ghost-rider-2099": { mechanics: ["undercover"] },
    "3dtc/deadpool":         { mechanics: ["antics"] },
  },
};

describe("cardMechanicsClient — fetch behavior (WP-270)", () => {
  beforeEach(() => {
    resetCardMechanics();
    globalThis.fetch = originalFetch;
  });

  it("happy path: fetches card-mechanics.json and returns the parsed index", async () => {
    const stub = stubFetch(() => ({
      ok:   true,
      json: async () => VALID_FEED,
    }));

    const result = await getCardMechanics("https://example.com");

    assert.equal(result.mechanics.length, 3, "Expected all 3 mechanics to pass through the fetcher.");
    assert.equal(result.scope, "hero");
    assert.deepEqual(
      result.cards["2099/doctor-doom-2099"]?.mechanics,
      ["undercover", "fated-future"],
      "Expected the per-card mapping to round-trip through safeParse.",
    );
    assert.equal(stub.callCount(), 1, "Expected exactly one fetch on the happy path.");
  });

  it("schema rejection: invalid payload resolves to the empty fallback (non-blocking)", async () => {
    stubFetch(() => ({
      ok: true,
      // why: invalid — `version` must be the literal 1 and `scope` the literal
      // "hero". A mismatched version triggers a Zod rejection, so the client
      // must degrade to the empty fallback rather than throw.
      json: async () => ({ version: 2, scope: "hero", generatedAt: "x", mechanics: [], cards: {} }),
    }));

    const result = await getCardMechanics("https://example.com");

    assert.equal(result.generatedAt, "1970-01-01T00:00:00.000Z", "Expected the sentinel fallback on schema rejection.");
    assert.deepEqual(result.mechanics, [], "Expected an empty mechanics list on schema rejection (non-blocking).");
    assert.deepEqual(result.cards, {}, "Expected an empty card mapping on schema rejection (non-blocking).");
  });

  it("HTTP failure: 404 resolves to the empty fallback (non-blocking)", async () => {
    stubFetch(() => ({
      ok:     false,
      status: 404,
    }));

    const result = await getCardMechanics("https://example.com");

    assert.equal(result.generatedAt, "1970-01-01T00:00:00.000Z", "Expected the sentinel fallback on HTTP failure.");
    assert.deepEqual(result.mechanics, [], "Expected an empty mechanics list on HTTP failure (non-blocking).");
    assert.deepEqual(result.cards, {}, "Expected an empty card mapping on HTTP failure (non-blocking).");
  });

  it("network error: a thrown fetch resolves to the empty fallback (non-blocking)", async () => {
    stubFetch(() => {
      throw new Error("network down");
    });

    const result = await getCardMechanics("https://example.com");

    assert.equal(result.generatedAt, "1970-01-01T00:00:00.000Z", "Expected the sentinel fallback when fetch throws.");
    assert.deepEqual(result.mechanics, [], "Expected an empty mechanics list when fetch throws (non-blocking).");
  });

  it("singleton: second call within session does not re-fetch", async () => {
    const stub = stubFetch(() => ({
      ok:   true,
      json: async () => VALID_FEED,
    }));

    await getCardMechanics("https://example.com");
    await getCardMechanics("https://example.com");

    assert.equal(
      stub.callCount(),
      1,
      "Expected the singleton _promise to cache the first call — a second " +
      "fetch indicates the cache was bypassed.",
    );
  });
});

describe("cardMatchesMechanics — predicate correctness (WP-270)", () => {
  it("empty selection: every card passes (filter inactive)", () => {
    const noSelection = new Set<string>();
    assert.equal(cardMatchesMechanics(VALID_FEED, "2099/doctor-doom-2099", noSelection), true);
    assert.equal(cardMatchesMechanics(VALID_FEED, "3dtc/deadpool", noSelection), true);
    // why: a card absent from the feed still passes when nothing is selected —
    // the grid is unchanged until the user picks a mechanic.
    assert.equal(cardMatchesMechanics(VALID_FEED, "core/spider-man", noSelection), true);
  });

  it("single slug: only cards whose mapping includes it pass", () => {
    const undercover = new Set(["undercover"]);
    assert.equal(cardMatchesMechanics(VALID_FEED, "2099/doctor-doom-2099", undercover), true);
    assert.equal(cardMatchesMechanics(VALID_FEED, "2099/ghost-rider-2099", undercover), true);
    // deadpool maps to "antics" only — it must not match an "undercover" filter.
    assert.equal(cardMatchesMechanics(VALID_FEED, "3dtc/deadpool", undercover), false);
    // a card absent from the feed cannot match a non-empty selection.
    assert.equal(cardMatchesMechanics(VALID_FEED, "core/spider-man", undercover), false);
  });

  it("OR within selected mechanics: a card matches if it has ANY selected slug", () => {
    const undercoverOrAntics = new Set(["undercover", "antics"]);
    const allMapped = ["2099/doctor-doom-2099", "2099/ghost-rider-2099", "3dtc/deadpool"];
    for (const extId of allMapped) {
      assert.equal(
        cardMatchesMechanics(VALID_FEED, extId, undercoverOrAntics),
        true,
        `Expected ${extId} to match the OR of {undercover, antics}.`,
      );
    }
  });

  it("AND across filters: applied to a query-narrowed subset yields only the BOTH-satisfying cards", () => {
    // Simulate App.vue's composition: a prior text/type query already narrowed
    // the result set (ghost-rider was excluded upstream), then the mechanic
    // predicate is applied to that subset. Only cards satisfying BOTH the prior
    // query AND the mechanic selection survive.
    const queryNarrowedSubset = ["2099/doctor-doom-2099", "3dtc/deadpool"];
    const undercover = new Set(["undercover"]);
    const survivors = queryNarrowedSubset.filter((extId) =>
      cardMatchesMechanics(VALID_FEED, extId, undercover),
    );
    assert.deepEqual(
      survivors,
      ["2099/doctor-doom-2099"],
      "Expected only doctor-doom — deadpool lacks undercover, and ghost-rider " +
      "(which has undercover) was already excluded by the prior query.",
    );
  });
});
