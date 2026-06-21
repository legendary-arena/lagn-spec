/**
 * types/index.ts — all public TypeScript types for the card registry
 *
 * Domain types (SetIndexEntry, HeroCard, etc.) are inferred from Zod schemas
 * in schema.ts. Those schemas are the single source of truth for field shapes.
 * Do not duplicate or re-derive field definitions here — use z.infer only.
 *
 * FlatCard and the registry interfaces are hand-authored contracts that the
 * loaders populate. Changes to FlatCard field types require a DECISIONS.md entry.
 */

import type { z } from "zod";
import type {
  SetIndexEntrySchema,
  SetDataSchema,
  HeroSchema,
  HeroCardSchema,
  HeroClassSchema,
  MastermindSchema,
  MastermindCardSchema,
  VillainGroupSchema,
  VillainCardSchema,
  SchemeSchema,
  CardQuerySchema,
  PhysicalCardSchema,
} from "../schema.js";

// ── Domain types (Zod-inferred — do not hand-edit) ───────────────────────────
export type SetIndexEntry   = z.infer<typeof SetIndexEntrySchema>;
export type SetData         = z.infer<typeof SetDataSchema>;
export type Hero            = z.infer<typeof HeroSchema>;
export type HeroCard        = z.infer<typeof HeroCardSchema>;
export type HeroClass       = z.infer<typeof HeroClassSchema>;
export type Mastermind      = z.infer<typeof MastermindSchema>;
export type MastermindCard  = z.infer<typeof MastermindCardSchema>;
export type VillainGroup    = z.infer<typeof VillainGroupSchema>;
export type VillainCard     = z.infer<typeof VillainCardSchema>;
export type Scheme          = z.infer<typeof SchemeSchema>;
export type CardQuery       = z.infer<typeof CardQuerySchema>;
export type PhysicalCard    = z.infer<typeof PhysicalCardSchema>;

// ── Flat "search result" card — useful for the viewer grid ───────────────────
//
// A FlatCard is a denormalized record produced by flattenSet() in shared.ts.
// It merges hero, mastermind, villain, and scheme cards into a single shape
// so the viewer grid and search can iterate one flat list.
//
// Fields marked "hero-only" are present only when cardType is "hero".
// Fields present on all card types are always populated by flattenSet().
export interface FlatCard {
  /**
   * Unique key whose format varies by cardType:
   *   hero:       "{setAbbr}-hero-{heroSlug}-{slot}"
   *   mastermind: "{setAbbr}-mastermind-{groupSlug}-{cardSlug}"
   *   villain:    "{setAbbr}-villain-{groupSlug}-{cardSlug}"
   *   scheme:     "{setAbbr}-scheme-{schemeSlug}"
   *
   * This key is a display/grid identity, NOT a match-setup ext_id. Do not
   * use it in a MatchSetupConfig — the engine rejects flat-card keys
   * (D-10014). Use `extId` for match-setup composition fields.
   */
  key:       string;
  /**
   * Set-qualified ext_id in the locked "{setAbbr}/{slug}" form that the
   * game engine's match-setup validator requires (D-10014). The slug is the
   * entity slug the engine derives for each field:
   *   hero:       "{setAbbr}/{heroSlug}"      (engine: extractHeroSlug)
   *   mastermind: "{setAbbr}/{mastermindSlug}"
   *   villain:    "{setAbbr}/{villainGroupSlug}" (engine: extractVillainGroupSlug)
   *   scheme:     "{setAbbr}/{schemeSlug}"
   * This is the canonical identifier for loadout composition fields so a
   * loadout authored against the registry is accepted by Game.setup() rather
   * than throwing an HTTP 500 (D-24018).
   */
  extId:     string;
  cardType:  "hero" | "mastermind" | "villain" | "scheme";
  setAbbr:   string;
  setName:   string;
  name:      string;
  slug:      string;
  imageUrl:  string;

  // ── Hero-only fields (undefined for non-hero card types) ───────────────
  // why: These fields include `| undefined` in their types because
  // HeroCardSchema marks them as optional (z.string().optional()), and
  // exactOptionalPropertyTypes requires explicit undefined in the type
  // when assigning schema-inferred values to optional properties.
  heroName?:    string | undefined;
  team?:        string | undefined;
  hc?:          HeroClass | undefined;
  rarity?:      1 | 2 | 3 | undefined;
  rarityLabel?: string | undefined;
  slot?:        number | undefined;

  /**
   * Hero card recruit cost. Accepts both integers (3) and star-cost strings
   * ("2*"). Widened from `number` to `string | number` by WP-003 / D-1204
   * because real card data (amwp Wasp) contains star-cost modifiers.
   * Must never be narrowed back to `number | undefined`.
   *
   * Hero-only — undefined for non-hero card types.
   */
  cost?:      string | number | undefined;

  /** Hero-only. Nullable: null when the card has no printed attack value. */
  attack?:    string | null | undefined;

  /** Hero-only. Nullable: null when the card has no printed recruit value. */
  recruit?:   string | null | undefined;

  /** Card ability text lines. Present on all card types. */
  abilities:  string[];
}

// ── Registry info (read-only snapshot) ───────────────────────────────────────
/** Counts and metadata returned by CardRegistry.info(). */
export interface RegistryInfo {
  totalSets:       number;
  totalHeroes:     number;
  totalCards:      number;
  loadedSetAbbrs:  string[];
  metadataBaseUrl: string;
}

// ── Health report (read-only snapshot) ───────────────────────────────────────
/** Validation summary returned by CardRegistry.validate(). */
export interface HealthReport {
  generatedAt: string;
  summary: {
    setsIndexed:    number;
    setsLoaded:     number;
    totalHeroes:    number;
    totalCards:     number;
    parseErrors:    number;
  };
  errors: Array<{
    setAbbr?: string;
    code:     string;
    message:  string;
  }>;
}

// ── Registry interface ────────────────────────────────────────────────────────
/**
 * Read-only card registry populated by one of the factory functions
 * (createRegistryFromLocalFiles or createRegistryFromHttp).
 *
 * All returned arrays are fresh copies — callers may mutate them without
 * affecting the registry's internal state.
 */
export interface CardRegistry {
  /** High-level counts for the registry. */
  info(): RegistryInfo;

  /** All set index entries loaded from sets.json. */
  listSets(): SetIndexEntry[];

  /** Full data for one set. Returns undefined if the set was not loaded. */
  getSet(abbr: string): SetData | undefined;

  /** All heroes across all loaded sets. */
  listHeroes(): Hero[];

  /**
   * Flat list of every card across all loaded sets.
   * Each individual hero card, mastermind card, villain card, and scheme
   * becomes its own FlatCard.
   */
  listCards(): FlatCard[];

  /** Filter flat cards by the given query parameters. */
  query(q: CardQuery): FlatCard[];

  /** Validation report including any schema parse errors from loading. */
  validate(): HealthReport;

  /**
   * Look up the PhysicalCard that owns a given card-side under a hero.
   *
   * Solo cards resolve to their single-side physicalCard; split cards
   * resolve to the physicalCard whose `sides[]` array includes the
   * given `sideSlug`. Returns `undefined` when no match is found —
   * callers must handle the miss path (typically via the legacy
   * `cards[].imageUrl` field while Phase 2 consumer migration is
   * pending).
   *
   * @param heroSlug - The hero slug (e.g., "falcon-winter-soldier").
   * @param sideSlug - The card-side slug (e.g., "attune").
   * @returns The owning PhysicalCard, or undefined on miss.
   */
  getPhysicalCardForSide(heroSlug: string, sideSlug: string): PhysicalCard | undefined;
}

// ── Factory options ──────────────────────────────────────────────────────────
/** Options for createRegistryFromHttp. */
export interface HttpRegistryOptions {
  /** Base URL for the R2 metadata endpoint (without trailing slash). */
  metadataBaseUrl: string;
  /**
   * Which set abbreviations to eagerly load at construction time.
   * Pass ["*"] to load all sets listed in sets.json (slow — many fetches).
   * Default: index only; individual sets are loaded lazily via getSet().
   */
  eagerLoad?: string[];
}
