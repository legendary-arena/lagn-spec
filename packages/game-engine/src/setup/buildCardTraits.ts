/**
 * Card traits builder for setup-time resolution.
 *
 * Resolves categorical card attributes (hero class, team) from registry
 * data at setup time. Produces G.cardTraits — a sibling snapshot to
 * G.cardStats, G.cardKeywords, G.cardDisplayData.
 *
 * No boardgame.io imports. No registry imports. No .reduce().
 */

import type { CardExtId } from '../state/zones.types.js';
import type { CardTraitEntry } from '../state/cardTraits.types.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import { normalizeTraitSlug } from '../state/traits.normalize.js';

// ---------------------------------------------------------------------------
// CardTraitsRegistryReader — local structural interface
// ---------------------------------------------------------------------------

// why: game-engine must not import @legendary-arena/registry; this interface
// is satisfied structurally by CardRegistry. Same layer-boundary pattern as
// CardStatsRegistryReader in economy.logic.ts.

/**
 * Minimal structural type for a hero card entry inside SetData.heroes[i].cards[j].
 */
interface TraitsHeroCardEntry {
  slug: string;
  hc?: string | null | undefined;
}

/**
 * Minimal structural type for a physical card entry.
 */
interface TraitsPhysicalCardEntry {
  count: number;
  sides: string[];
}

/**
 * Minimal structural type for a hero group entry inside SetData.heroes[i].
 */
interface TraitsHeroEntry {
  slug: string;
  team?: string | null | undefined;
  cards: TraitsHeroCardEntry[];
  physicalCards?: unknown;
}

/**
 * Setup-time registry interface for card traits resolution.
 *
 * Satisfied structurally by the real CardRegistry.
 */
export interface CardTraitsRegistryReader {
  listSets(): Array<{ abbr: string }>;
  getSet(abbr: string): unknown | undefined;
}

// ---------------------------------------------------------------------------
// Structural guards
// ---------------------------------------------------------------------------

/**
 * Runtime type guard for CardTraitsRegistryReader.
 */
export function isCardTraitsRegistryReader(
  registry: unknown,
): registry is CardTraitsRegistryReader {
  if (!registry || typeof registry !== 'object') return false;
  const candidate = registry as Record<string, unknown>;
  return (
    typeof candidate.listSets === 'function' &&
    typeof candidate.getSet === 'function'
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses a qualified ID (setAbbr/slug) into components.
 */
function parseQualifiedId(input: string): { setAbbr: string; slug: string } | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  if (input !== input.trim()) return null;
  const slashIndex = input.indexOf('/');
  if (slashIndex === -1) return null;
  if (input.indexOf('/', slashIndex + 1) !== -1) return null;
  const setAbbr = input.slice(0, slashIndex);
  const slug = input.slice(slashIndex + 1);
  if (setAbbr.length === 0 || slug.length === 0) return null;
  return { setAbbr, slug };
}

/**
 * Finds the hero entry in set data by slug.
 */
function findHeroEntry(
  setData: unknown,
  heroSlug: string,
): TraitsHeroEntry | null {
  if (!setData || typeof setData !== 'object') return null;
  const candidate = setData as { heroes?: unknown };
  if (!Array.isArray(candidate.heroes)) return null;

  for (const entry of candidate.heroes) {
    if (!entry || typeof entry !== 'object') continue;
    const heroEntry = entry as TraitsHeroEntry;
    if (typeof heroEntry.slug !== 'string') continue;
    if (heroEntry.slug !== heroSlug) continue;
    if (!Array.isArray(heroEntry.cards)) continue;
    return heroEntry;
  }
  return null;
}

/**
 * Defensively parses physicalCards into typed entries.
 */
function parsePhysicalCards(raw: unknown): TraitsPhysicalCardEntry[] {
  if (!Array.isArray(raw)) return [];
  const result: TraitsPhysicalCardEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { count?: unknown; sides?: unknown };
    if (typeof candidate.count !== 'number' || candidate.count < 1) continue;
    if (!Array.isArray(candidate.sides) || candidate.sides.length === 0) continue;
    result.push({
      count: candidate.count,
      sides: candidate.sides as string[],
    });
  }
  return result;
}

/**
 * Finds the card entry by slug in a hero's cards array.
 */
function findCardEntryBySlug(
  cards: TraitsHeroCardEntry[],
  slug: string,
): TraitsHeroCardEntry | null {
  for (const card of cards) {
    if (card.slug === slug) return card;
  }
  return null;
}

// ---------------------------------------------------------------------------
// buildCardTraits — main builder
// ---------------------------------------------------------------------------

// why: fan-out per copy is required because zone entries are copy-suffixed
// ext_ids (e.g., core/black-widow/mission-accomplished#0). Without per-copy
// entries, every zone lookup returns undefined and superpowers silently fail.

/**
 * Builds the G.cardTraits lookup table from registry data at setup time.
 *
 * Enumerates the same CardExtId universe as buildCardStats() (single
 * enumeration authority) and fans out per copy using the #N suffix pattern.
 *
 * @param registry - Registry reader (structural interface).
 * @param config - Validated match setup config.
 * @returns Record mapping each copy-suffixed CardExtId to its CardTraitEntry.
 */
export function buildCardTraits(
  registry: unknown,
  config: MatchSetupConfig,
): Record<CardExtId, CardTraitEntry> {
  if (!isCardTraitsRegistryReader(registry)) {
    return {};
  }

  const traits: Record<CardExtId, CardTraitEntry> = {};

  for (const heroDeckId of config.heroDeckIds) {
    const parsed = parseQualifiedId(heroDeckId);
    if (parsed === null) continue;

    const setData = registry.getSet(parsed.setAbbr);
    if (!setData || typeof setData !== 'object') continue;

    const heroEntry = findHeroEntry(setData, parsed.slug);
    if (heroEntry === null) continue;

    const team = (typeof heroEntry.team === 'string' && heroEntry.team.length > 0)
      ? normalizeTraitSlug(heroEntry.team)
      : null;

    const physicalCards = parsePhysicalCards(heroEntry.physicalCards);

    if (physicalCards.length > 0) {
      for (const physicalCard of physicalCards) {
        const canonicalSlug = physicalCard.sides[0] as string;
        const cardEntry = findCardEntryBySlug(heroEntry.cards, canonicalSlug);
        const heroClass = (cardEntry !== null && typeof cardEntry.hc === 'string' && cardEntry.hc.length > 0)
          ? normalizeTraitSlug(cardEntry.hc)
          : null;
        const baseExtId = `${parsed.setAbbr}/${parsed.slug}/${canonicalSlug}`;

        for (let copyIndex = 0; copyIndex < physicalCard.count; copyIndex++) {
          const extId = `${baseExtId}#${copyIndex}` as CardExtId;
          traits[extId] = { heroClass, team };
        }
      }
    } else {
      for (const card of heroEntry.cards) {
        const heroClass = (typeof card.hc === 'string' && card.hc.length > 0)
          ? normalizeTraitSlug(card.hc)
          : null;
        const baseExtId = `${parsed.setAbbr}/${parsed.slug}/${card.slug}`;
        traits[baseExtId as CardExtId] = { heroClass, team };
      }
    }
  }

  return traits;
}
