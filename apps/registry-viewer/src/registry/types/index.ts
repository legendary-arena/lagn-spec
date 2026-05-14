/**
 * types/index.ts — all public TypeScript types inferred from the real schema
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
} from "../schema.js";

// ── Domain types ──────────────────────────────────────────────────────────────
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

// ── Flat "search result" card — useful for the viewer grid ───────────────────
export interface FlatCard {
  /** Unique key: "{setAbbr}-{cardType}-{slug}"  */
  key:       string;
  cardType:  "hero" | "mastermind" | "villain" | "scheme";
  setAbbr:   string;
  setName:   string;
  name:      string;
  slug:      string;
  imageUrl:  string;
  /** Hero-only: image URL resolved from physicalCards[] (D-14103). */
  physicalCardImageUrl?: string;
  /** Hero-only fields */
  heroName?:  string;
  team?:      string;
  hc?:        HeroClass;
  rarity?:    1 | 2 | 3;
  rarityLabel?: string;
  slot?:      number;
  cost?:      number;
  attack?:    string | null;
  recruit?:   string | null;
  abilities:  string[];
}

// ── Registry info ─────────────────────────────────────────────────────────────
export interface RegistryInfo {
  totalSets:      number;
  totalHeroes:    number;
  totalCards:     number;
  loadedSetAbbrs: string[];
  metadataBaseUrl: string;
}

// ── Health report ─────────────────────────────────────────────────────────────
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
export interface CardRegistry {
  /** High-level counts */
  info(): RegistryInfo;

  /** All set index entries (from sets.json) */
  listSets(): SetIndexEntry[];

  /** Full data for one set. Returns undefined if not loaded. */
  getSet(abbr: string): SetData | undefined;

  /** All heroes across all loaded sets */
  listHeroes(): Hero[];

  /**
   * Flat list of all cards across all loaded sets.
   * Each individual hero card, mastermind card, villain card, and scheme
   * becomes its own FlatCard — good for search/grid display.
   */
  listCards(): FlatCard[];

  /** Query / filter flat cards */
  query(q: CardQuery): FlatCard[];

  /** Health / validation report */
  validate(): HealthReport;
}

// ── Factory options ───────────────────────────────────────────────────────────
export interface HttpRegistryOptions {
  /** Base URL — everything lives under {metadataBaseUrl}/metadata/ */
  metadataBaseUrl: string;
  /**
   * Which set abbrs to eagerly load.
   * Pass ["*"] to load all sets listed in sets.json (slow — many fetches).
   * Default: load index only, sets are loaded lazily via getSet().
   */
  eagerLoad?: string[];
}
