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
  /**
   * Unique key: "{setAbbr}-{cardType}-{slug}". Display/grid identity only —
   * NOT a match-setup ext_id. The engine rejects flat-card keys (D-10014);
   * use `extId` for loadout composition fields.
   */
  key:       string;
  /**
   * Set-qualified ext_id "{setAbbr}/{slug}" the engine's match-setup
   * validator requires (D-10014). For the five composition entity types the
   * slug is the entity slug the engine derives — hero slug, mastermind group
   * slug, villain group slug, henchman group slug, scheme slug — so a loadout
   * authored here is accepted by Game.setup() rather than throwing an HTTP 500
   * (D-24018).
   */
  extId:     string;
  cardType:  string;
  setAbbr:   string;
  setName:   string;
  name:      string;
  /**
   * Group/entity display name for the loadout picker (WP-091 builder).
   * For the five composition entity types this is the GROUP the `extId`
   * points at — hero name ("Black Widow"), mastermind name, villain group
   * ("Brotherhood"), henchman group, scheme name — NOT a member card's
   * name. The picker collapses a group's member cards into one entry by
   * `extId`; labeling by `groupName` (rather than `name`) makes one click
   * add the whole group instead of reading like an individual card.
   * Absent on non-composition card types (bystander, wound, other), where
   * the picker never renders.
   */
  groupName?: string;
  /**
   * Mastermind-only: the villain group slugs this mastermind "Always Leads".
   * Bare entity slugs (e.g. `["brotherhood"]`), mirroring the card data's
   * `Mastermind.alwaysLeads`. The loadout builder reads this to auto-include —
   * and require — the led villain group(s) when the mastermind is selected
   * (e.g. Magneto Always Leads the Brotherhood). Empty/absent for masterminds
   * with no Always-Leads clause and for every non-mastermind card type.
   */
  alwaysLeads?: readonly string[];
  slug:      string;
  imageUrl:  string;
  /** Hero-only: image URL resolved from physicalCards[] (D-14103). */
  physicalCardImageUrl?: string;
  /** Hero-only fields */
  heroName?:  string;
  team?:      string;
  hc?:        HeroClass;
  rarity?:     number;      // 0-3 depending on set
  rarityLabel?: string;
  slot?:       number;      // may be missing in some sets
  cost?:      number;
  attack?:    string | null;
  recruit?:   string | null;
  abilities:  string[];
  /** Scheme twist pattern slug (WP-183): assigned mechanical pattern for scheme cards. */
  twistPattern?: string;
  /** Card mechanical pattern slug (WP-184): assigned pattern for hero/villain/henchman/mastermind cards. */
  mechanicalPattern?: string;
  /** Card-count display (WP-170): copies of this card in its group/deck. */
  count?:     number;
  /** Card-count display (WP-170): total cards in the villain group or hero deck. */
  setTotal?:  number;
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

// ── Extended query with multi-type support ────────────────────────────────────
export type FlatCardType = FlatCard["cardType"];

export interface CardQueryExtended extends CardQuery {
  cardTypes?: FlatCardType[];
}
