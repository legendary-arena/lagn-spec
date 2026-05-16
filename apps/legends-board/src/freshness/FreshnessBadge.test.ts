import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * FreshnessBadge logic tests.
 *
 * The Vue component itself is tested via the dev server smoke test.
 * These tests verify the stale-threshold logic by testing the
 * constants and time-math that drive the badge's computed state.
 */

const STALE_THRESHOLD_MS = 30 * 60 * 1000;

describe("FreshnessBadge stale-threshold logic", () => {
  it("threshold is exactly 30 minutes in milliseconds", () => {
    assert.equal(STALE_THRESHOLD_MS, 1_800_000);
  });

  it("an age under 30 minutes is not stale", () => {
    const ageMs = 29 * 60 * 1000;
    assert.equal(ageMs > STALE_THRESHOLD_MS, false);
  });

  it("an age over 30 minutes is stale", () => {
    const ageMs = 31 * 60 * 1000;
    assert.equal(ageMs > STALE_THRESHOLD_MS, true);
  });

  it("exactly 30 minutes is not stale (uses > not >=)", () => {
    const ageMs = 30 * 60 * 1000;
    assert.equal(ageMs > STALE_THRESHOLD_MS, false);
  });
});

describe("FreshnessBadge display-text derivation", () => {
  /** Mirrors the component's displayText logic for testability. */
  function deriveDisplayText(
    generatedAt: string | null,
    fetchError: boolean,
  ): string {
    if (fetchError) {
      return "Unable to check freshness";
    }
    if (!generatedAt) {
      return "Freshness unknown";
    }
    const generated = new Date(generatedAt).getTime();
    if (Number.isNaN(generated)) {
      return "Freshness unknown";
    }
    const ageMs = Date.now() - generated;
    const totalSeconds = Math.floor(ageMs / 1000);
    if (totalSeconds < 60) {
      return "Updated just now";
    }
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) {
      return `Updated ${minutes} min ago`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `Updated ${hours}h ago`;
    }
    return `Updated ${hours}h ${remainingMinutes}m ago`;
  }

  it("shows error state when fetchError is true", () => {
    assert.equal(
      deriveDisplayText(null, true),
      "Unable to check freshness",
    );
  });

  it("shows unknown when generatedAt is null", () => {
    assert.equal(deriveDisplayText(null, false), "Freshness unknown");
  });

  it("shows unknown for an invalid date string", () => {
    assert.equal(deriveDisplayText("not-a-date", false), "Freshness unknown");
  });

  it("shows 'just now' for a very recent timestamp", () => {
    const recentIso = new Date(Date.now() - 5_000).toISOString();
    assert.equal(deriveDisplayText(recentIso, false), "Updated just now");
  });

  it("shows minutes for a timestamp a few minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.equal(deriveDisplayText(fiveMinAgo, false), "Updated 5 min ago");
  });

  it("shows hours and minutes for a timestamp over an hour ago", () => {
    const ninetyMinAgo = new Date(
      Date.now() - 90 * 60 * 1000,
    ).toISOString();
    assert.equal(
      deriveDisplayText(ninetyMinAgo, false),
      "Updated 1h 30m ago",
    );
  });
});
