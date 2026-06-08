/**
 * theme.schema.test.ts — coverage for ThemeDefinitionSchema + validators
 *
 * Runner:  node:test (native Node.js test runner)
 * Invoke:  pnpm --filter @legendary-arena/registry test
 *
 * Coverage map (WP-055 §D — ten tests inside one describe block):
 *   #1  valid theme with all fields passes (+ top-level distinctness)
 *   #2  valid theme with only required fields passes
 *   #3  missing themeSchemaVersion fails
 *   #4  invalid themeId (uppercase / spaces) fails
 *   #5  empty heroDeckIds array fails (.min(1) enforced)
 *   #6  playerCount.min > playerCount.max fails
 *   #7  playerCount.recommended outside [min, max] fails
 *   #8  validateThemeFile — manifest happy path + I/O failure + malformed JSON
 *   #9  themeSchemaVersion: 1 fails (v1 drift protection)
 *  #10  musicAssets with a non-URL string fails
 *
 * Baseline shift: registry 3 / 1 / 0 → 13 / 2 / 0 fail.
 */

import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateTheme, validateThemeFile } from "./theme.validate.js";

// why: pnpm --filter sets CWD to packages/registry/, so the shipped theme
// content two levels up resolves via "../..". Matches the path-resolution
// pattern used by registry.smoke.test.ts.
const contentThemesDir = join(process.cwd(), "..", "..", "content", "themes");

const fullTheme = {
  themeSchemaVersion: 2,
  themeId: "all-fields-example",
  name: "All Fields Example",
  description: "Every optional field populated so #1 exercises the full shape.",
  setupIntent: {
    mastermindId: "example-mastermind",
    schemeId: "example-scheme",
    villainGroupIds: ["example-villain-group"],
    henchmanGroupIds: ["example-henchmen"],
    heroDeckIds: ["example-hero-a", "example-hero-b"],
    bystanderSetIds: ["core", "xmen"],
    woundSetIds: ["core", "cvwr"],
    sidekickCardIds: ["cvwr/lockjaw"],
    officerCardIds: ["shld/maria-hill"],
  },
  playerCount: {
    recommended: [2, 3],
    min: 2,
    max: 4,
  },
  tags: ["example", "full-fields"],
  references: {
    primaryStory: {
      issue: "Example #1",
      year: 2026,
      externalUrl: "https://example.com/story",
      marvelUnlimitedUrl: "https://example.com/unlimited",
      externalIndexUrls: ["https://example.com/index"],
    },
  },
  flavorText: "A perfectly illustrative example.",
  tips: ["The key mechanic to know for this theme is the Abomination rule."],
  comicImageUrl: "https://example.com/cover.jpg",
  musicTheme: "Example Theme",
  musicAIPrompt: "Example AI prompt for music generation.",
  musicAssets: {
    previewIntroUrl: "https://example.com/preview.mp3",
    matchStartUrl: "https://example.com/match-start.mp3",
    ambientLoopUrl: "https://example.com/ambient.mp3",
    mainThemeUrl: "https://example.com/main.mp3",
    schemeTwistUrl: "https://example.com/twist.mp3",
    masterStrikeUrl: "https://example.com/strike.mp3",
    villainAmbushUrl: "https://example.com/ambush.mp3",
    bystanderUrl: "https://example.com/bystander.mp3",
  },
};

const minimalTheme = {
  themeSchemaVersion: 2,
  themeId: "minimal-example",
  name: "Minimal Example",
  description: "A minimal theme with only the required fields populated.",
  setupIntent: {
    mastermindId: "example-mastermind",
    schemeId: "example-scheme",
    villainGroupIds: ["example-villain-group"],
    heroDeckIds: ["example-hero"],
  },
  playerCount: {
    recommended: [2],
    min: 2,
    max: 2,
  },
};

describe("theme schema (WP-055)", () => {
  test("#1 valid theme with all fields passes and theme is not the same reference as input", () => {
    const result = validateTheme(fullTheme);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.theme.themeId, "all-fields-example");
      // why: pins the WP-028 / D-2802 aliasing-prevention precedent at the
      // one concrete boundary Zod's safeParse guarantees — a fresh top-level
      // object for object schemas. Nested references may still alias; see
      // the validateTheme JSDoc for the full semantic.
      assert.notStrictEqual(result.theme, fullTheme);
    }
  });

  test("#2 valid theme with only required fields passes", () => {
    const result = validateTheme(minimalTheme);
    assert.equal(result.success, true);
  });

  test("#3 missing themeSchemaVersion fails validation", () => {
    const { themeSchemaVersion: _unused, ...withoutVersion } = minimalTheme;
    const result = validateTheme(withoutVersion);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) => error.path === "themeSchemaVersion"),
        "expected an error on path 'themeSchemaVersion', got: " +
          JSON.stringify(result.errors),
      );
    }
  });

  test("#4 invalid themeId format (uppercase, spaces) fails validation", () => {
    const invalidIdTheme = { ...minimalTheme, themeId: "Not Kebab Case" };
    const result = validateTheme(invalidIdTheme);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some(
          (error) =>
            error.path === "themeId" &&
            error.message === "themeId must be kebab-case",
        ),
        "expected kebab-case error on themeId, got: " +
          JSON.stringify(result.errors),
      );
    }
  });

  test("#5 empty heroDeckIds array fails validation", () => {
    const emptyHeroDecks = {
      ...minimalTheme,
      setupIntent: {
        ...minimalTheme.setupIntent,
        heroDeckIds: [],
      },
    };
    const result = validateTheme(emptyHeroDecks);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some(
          (error) => error.path === "setupIntent.heroDeckIds",
        ),
        "expected an error on setupIntent.heroDeckIds, got: " +
          JSON.stringify(result.errors),
      );
    }
  });

  test("#6 playerCount.min greater than playerCount.max fails validation", () => {
    const badRange = {
      ...minimalTheme,
      playerCount: { recommended: [3], min: 5, max: 3 },
    };
    const result = validateTheme(badRange);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) =>
          error.message.includes(
            "playerCount.min must be less than or equal to playerCount.max",
          ),
        ),
        "expected playerCount.min<=max error, got: " +
          JSON.stringify(result.errors),
      );
    }
  });

  test("#7 playerCount.recommended outside [min, max] fails validation", () => {
    const outOfRange = {
      ...minimalTheme,
      playerCount: { recommended: [6], min: 2, max: 4 },
    };
    const result = validateTheme(outOfRange);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) =>
          error.message.includes(
            "all recommended player counts must be within [min, max]",
          ),
        ),
        "expected recommended-in-range error, got: " +
          JSON.stringify(result.errors),
      );
    }
  });

  // why: Part A reads content/themes/index.json (the authoritative manifest,
  // not readdir) so aggregate/manifest artifacts in the same directory
  // (00-ALL_THEMES_COMBINED.json, 01-ALL_THEMES_COMBINED.json, index.json
  // itself) are excluded by construction — a naïve readdir scan would load
  // them and fail validation. Parts B and C live inside the same test() call
  // so the 10-test baseline lock holds (WP-033 P6-23 count preservation).
  test("#8 validateThemeFile manifest happy path + I/O failure + malformed JSON", async (t) => {
    // Part A — manifest-driven happy path
    const manifestPath = join(contentThemesDir, "index.json");
    const manifestRaw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw) as string[];
    assert.ok(
      Array.isArray(manifest) && manifest.length > 0,
      "content/themes/index.json must be a non-empty string[] manifest",
    );
    for (const filename of manifest) {
      const filePath = join(contentThemesDir, filename);
      const result = await validateThemeFile(filePath);
      assert.equal(
        result.success,
        true,
        `expected ${filename} to pass validateThemeFile, got: ` +
          (result.success
            ? "(unreachable — success=true)"
            : JSON.stringify(result.errors)),
      );
    }

    // Part B — I/O failure returns structured result (never throws)
    const missingPath = join(contentThemesDir, "this-file-does-not-exist.json");
    const ioResult = await validateThemeFile(missingPath);
    assert.equal(ioResult.success, false);
    if (!ioResult.success) {
      assert.equal(ioResult.errors.length, 1);
      assert.equal(ioResult.errors[0]?.path, "file");
      assert.match(ioResult.errors[0]?.message ?? "", /^Cannot read theme file/);
    }

    // Part C — malformed JSON returns structured result (never throws)
    const tmpPath = join(tmpdir(), "wp055-invalid.json");
    await writeFile(tmpPath, "{ not valid json", "utf-8");
    t.after(async () => {
      await unlink(tmpPath);
    });
    const jsonResult = await validateThemeFile(tmpPath);
    assert.equal(jsonResult.success, false);
    if (!jsonResult.success) {
      assert.equal(jsonResult.errors.length, 1);
      assert.equal(jsonResult.errors[0]?.path, "json");
      assert.match(jsonResult.errors[0]?.message ?? "", /contains invalid JSON/);
    }
  });

  test("#9 themeSchemaVersion: 1 fails validation (v1 drift protection)", () => {
    const v1Theme = { ...minimalTheme, themeSchemaVersion: 1 };
    const result = validateTheme(v1Theme);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some((error) => error.path === "themeSchemaVersion"),
        "expected an error on path 'themeSchemaVersion' for v1 file, got: " +
          JSON.stringify(result.errors),
      );
    }
  });

  test("#10 musicAssets with a non-URL string in any URL field fails validation", () => {
    const badMusicTheme = {
      ...minimalTheme,
      musicAssets: { mainThemeUrl: "not-a-real-url" },
    };
    const result = validateTheme(badMusicTheme);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.ok(
        result.errors.some(
          (error) => error.path === "musicAssets.mainThemeUrl",
        ),
        "expected an error on musicAssets.mainThemeUrl, got: " +
          JSON.stringify(result.errors),
      );
    }
  });

  test("#11 bystanderSetIds and woundSetIds round-trip", () => {
    const themeWithSets = {
      ...minimalTheme,
      setupIntent: {
        ...minimalTheme.setupIntent,
        bystanderSetIds: ["core", "xmen"],
        woundSetIds: ["core", "cvwr"],
      },
    };
    const result = validateTheme(themeWithSets);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(
        result.theme.setupIntent.bystanderSetIds,
        ["core", "xmen"],
        "bystanderSetIds must round-trip exactly",
      );
      assert.deepEqual(
        result.theme.setupIntent.woundSetIds,
        ["core", "cvwr"],
        "woundSetIds must round-trip exactly",
      );
    }
  });

  test("#12 sidekickCardIds and officerCardIds round-trip", () => {
    const themeWithCards = {
      ...minimalTheme,
      setupIntent: {
        ...minimalTheme.setupIntent,
        sidekickCardIds: ["cvwr/lockjaw", "cvwr/redwing"],
        officerCardIds: ["shld/maria-hill"],
      },
    };
    const result = validateTheme(themeWithCards);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(
        result.theme.setupIntent.sidekickCardIds,
        ["cvwr/lockjaw", "cvwr/redwing"],
        "sidekickCardIds must round-trip exactly",
      );
      assert.deepEqual(
        result.theme.setupIntent.officerCardIds,
        ["shld/maria-hill"],
        "officerCardIds must round-trip exactly",
      );
    }
  });

  test("#13 tips round-trip: present value preserved; absent defaults to []", () => {
    const themeWithTips = {
      ...minimalTheme,
      tips: ["The key mechanic is Abomination."],
    };
    const resultWithTips = validateTheme(themeWithTips);
    assert.equal(resultWithTips.success, true);
    if (resultWithTips.success) {
      assert.deepEqual(
        resultWithTips.theme.tips,
        ["The key mechanic is Abomination."],
        "tips must round-trip exactly when present",
      );
    }

    const resultWithoutTips = validateTheme(minimalTheme);
    assert.equal(resultWithoutTips.success, true);
    if (resultWithoutTips.success) {
      assert.deepEqual(
        resultWithoutTips.theme.tips,
        [],
        "tips must default to [] when absent",
      );
    }
  });
});
