/**
 * theme.schema.ts — Theme Definition contract (registry-layer data primitive)
 *
 * Defines the authoritative Zod schemas for Mastermind / Scenario themes:
 * curated combinations of mastermind, scheme, villain groups, henchman groups,
 * and hero decks that recreate iconic Marvel storylines. Themes are pure
 * static JSON content with no runtime behavior, no engine integration, and
 * no `G` mutation.
 *
 * Authority: WP-055 (Theme Data Model v2) — locks the schema at version 2
 * per D-5509 (music-field addition via version bump). See:
 *   - docs/ai/work-packets/WP-055-theme-data-model.md §Scope (In) §A
 *   - docs/ai/execution-checklists/EC-055-theme-data-model.checklist.md
 *   - docs/ai/DECISIONS.md D-5501…D-5509
 *
 * Downstream consumers import these schemas via the registry package's public
 * surface (`packages/registry/src/index.ts`); deep-path imports are not
 * required or encouraged. See §E of WP-055 for the re-export contract.
 */

import { z } from "zod";

// ── Setup intent (MatchSetupConfig mirror — ID fields only) ───────────────────
// why: exact field names from the WP-005A MatchSetupConfig contract so themes
// project cleanly into match creation with no renaming layer. Count fields
// (`bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`) are
// intentionally excluded because themes describe content composition (which
// cards / which groups), not pile sizing — pile sizes belong to match
// configuration, not theme data.
export const ThemeSetupIntentSchema = z.object({
  mastermindId: z.string().min(1),
  schemeId: z.string().min(1),
  villainGroupIds: z.array(z.string().min(1)).min(1),
  henchmanGroupIds: z.array(z.string().min(1)).default([]),
  heroDeckIds: z.array(z.string().min(1)).min(1),
  // why: bystanderSetIds / woundSetIds hold bare set abbreviations matching the `abbr`
  // field in card set JSON — a set reference includes all bystander/wound cards from
  // that set (D-22103). sidekickCardIds / officerCardIds use "<setAbbr>/<slug>" format
  // to resolve ambiguity when the same slug appears in multiple sets (D-22104).
  // Count fields remain intentionally excluded — themes describe which cards, not pile
  // sizing (see D-22101 for why this is not a version bump).
  bystanderSetIds: z.array(z.string().min(1)).default([]),
  woundSetIds: z.array(z.string().min(1)).default([]),
  sidekickCardIds: z.array(z.string().min(1)).default([]),
  officerCardIds: z.array(z.string().min(1)).default([]),
});

// ── Player count window (refined) ─────────────────────────────────────────────
export const ThemePlayerCountSchema = z
  .object({
    recommended: z.array(z.number().int().min(1).max(6)).min(1),
    min: z.number().int().min(1).max(6),
    max: z.number().int().min(1).max(6),
  })
  .refine((data) => data.min <= data.max, {
    message: "playerCount.min must be less than or equal to playerCount.max",
  })
  .refine(
    (data) =>
      data.recommended.every(
        (count) => count >= data.min && count <= data.max,
      ),
    { message: "all recommended player counts must be within [min, max]" },
  );

// ── Primary story reference (editorial only) ──────────────────────────────────
// why: all fields are editorial only — never authoritative and never required
// at runtime. Vendor-specific URLs (Marvel Unlimited, Marvel Fandom, CMRO,
// Comic Vine) may rot without consequence and must never be treated as
// dependencies by loaders, UI, or any downstream consumer (D-5505).
export const ThemePrimaryStoryReferenceSchema = z.object({
  issue: z.string().optional(),
  year: z.number().int().optional(),
  externalUrl: z.string().url().optional(),
  marvelUnlimitedUrl: z.string().url().optional(),
  externalIndexUrls: z.array(z.string().url()).default([]),
});

// ── Music assets (v2 addition per D-5509) ─────────────────────────────────────
// why: every URL is optional so themes can ship partial audio coverage while
// the full asset pipeline documented in content/media/MUSIC-AUTHORING.md is
// still being produced. Music assets are editorial content — the engine never
// reads them, so missing URLs are silently tolerated by all runtime consumers.
export const ThemeMusicAssetsSchema = z.object({
  previewIntroUrl: z.string().url().optional(),
  matchStartUrl: z.string().url().optional(),
  ambientLoopUrl: z.string().url().optional(),
  mainThemeUrl: z.string().url().optional(),
  schemeTwistUrl: z.string().url().optional(),
  masterStrikeUrl: z.string().url().optional(),
  villainAmbushUrl: z.string().url().optional(),
  bystanderUrl: z.string().url().optional(),
});

// ── Theme definition (v2) ─────────────────────────────────────────────────────
// why: themes are data, not behavior (D-5501). No rule logic, modifiers, or
// effects are permitted at any level of this schema. Themes describe composition
// and editorial metadata only; engine integration (setup projection, scenario
// loading, PAR scoring) is deferred to downstream consumer WPs.
// why: themeSchemaVersion is z.literal(2) (not z.number()) so v1 files are
// rejected at validation time and must be migrated (D-5504 — schema evolution
// via versioning only; never silent mutation of existing fields).
// why: comicImageUrl is an editorial cover-image reference hotlinked from
// Comic Vine; nullable because not every theme has a verified cover. No image
// is hosted in R2 — URLs may rot without consequence (D-5506).
// why: musicTheme, musicAIPrompt, and musicAssets are the v2 additions per
// D-5509. All three are optional at the top level so themes without authored
// audio simply omit them; the engine ignores music fields entirely.
// why: parDifficultyRating is intentionally excluded from v2 — PAR scoring
// does not exist yet (WP-048 owns PAR; D-5508). Adding parDifficultyRating
// here before PAR exists would couple the theme contract to an undefined
// scoring surface.
export const ThemeDefinitionSchema = z.object({
  themeSchemaVersion: z.literal(2),
  themeId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "themeId must be kebab-case"),
  name: z.string().min(1),
  description: z.string().min(1),
  setupIntent: ThemeSetupIntentSchema,
  playerCount: ThemePlayerCountSchema,
  tags: z.array(z.string().min(1)).default([]),
  references: z
    .object({
      primaryStory: ThemePrimaryStoryReferenceSchema,
    })
    .optional(),
  flavorText: z.string().optional(),
  // why: tips are editorial gameplay guidance displayed in the themes tab; top-level
  // (not in setupIntent) because they describe how to play the theme, not what cards
  // to include (D-22102).
  tips: z.array(z.string().min(1)).default([]),
  comicImageUrl: z.string().url().nullable().optional(),
  musicTheme: z.string().optional(),
  musicAIPrompt: z.string().optional(),
  musicAssets: ThemeMusicAssetsSchema.optional(),
});

export type ThemeDefinition = z.infer<typeof ThemeDefinitionSchema>;
