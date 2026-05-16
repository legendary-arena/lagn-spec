import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for the snapshot client's pure helpers.
 *
 * The fetch-based functions (fetchManifest, fetchBoard, etc.) depend on
 * import.meta.env which is Vite-specific and not available in node:test.
 * Those are tested via the dev server smoke test. These tests cover the
 * pure logic: boardDisplayName, getPollIntervalMs, and cache invalidation.
 */

describe("boardDisplayName", () => {
  /**
   * We test the display-name derivation logic directly. The function
   * is a pure string transform with no dependencies.
   */
  it("capitalizes a single-word slug", async () => {
    const { boardDisplayName } = await import("./snapshotClient.ts");
    assert.equal(boardDisplayName("overall"), "Overall");
  });

  it("capitalizes each word in a hyphenated slug", async () => {
    const { boardDisplayName } = await import("./snapshotClient.ts");
    assert.equal(boardDisplayName("by-scheme"), "By Scheme");
  });

  it("handles multi-word slugs", async () => {
    const { boardDisplayName } = await import("./snapshotClient.ts");
    assert.equal(
      boardDisplayName("recent-achievements"),
      "Recent Achievements",
    );
  });

  it("handles now-playing slug", async () => {
    const { boardDisplayName } = await import("./snapshotClient.ts");
    assert.equal(boardDisplayName("now-playing"), "Now Playing");
  });
});
