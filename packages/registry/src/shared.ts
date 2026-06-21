/**
 * shared.ts — pure helpers shared by both registry implementations
 */

import type {
  SetData,
  SetIndexEntry,
  FlatCard,
  CardQuery,
  HealthReport,
} from "./types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Flatten a full set into individual FlatCard records for searching/display
// ─────────────────────────────────────────────────────────────────────────────
export function flattenSet(set: SetData, setName: string): FlatCard[] {
  const cards: FlatCard[] = [];
  const abbr = set.abbr;

  // Hero cards
  for (const hero of set.heroes) {
    // why: D-15101 — physicalCards[] is the sole hero image source now that
    // HeroCardSchema.imageUrl has been removed. Build a side-to-imageUrl
    // lookup from physicalCards[] (same algorithm as viewer flattenSet).
    const sideToImageUrl = new Map<string, string>();
    for (const physicalCard of hero.physicalCards) {
      for (const side of physicalCard.sides) {
        sideToImageUrl.set(side, physicalCard.imageUrl);
      }
    }

    for (const card of hero.cards) {
      cards.push({
        key:          `${abbr}-hero-${hero.slug}-${card.slot}`,
        // why: D-24018 — canonical set-qualified ext_id for match-setup
        // composition. Mirrors the engine's extractHeroSlug derivation
        // (hero.slug), so a loadout built from this card is accepted by
        // Game.setup() instead of being rejected as a flat-card key (D-10014).
        extId:        `${abbr}/${hero.slug}`,
        cardType:     "hero",
        setAbbr:      abbr,
        setName,
        name:         card.name ?? card.slug,
        slug:         card.slug,
        imageUrl:     sideToImageUrl.get(card.slug) ?? "",
        heroName:     hero.name,
        team:         hero.team,
        hc:           card.hc,
        rarity:       card.rarity,
        rarityLabel:  card.rarityLabel,
        slot:         card.slot,
        cost:         card.cost,
        attack:       card.attack,
        recruit:      card.recruit,
        abilities:    card.abilities ?? [],
      });
    }
  }

  // Mastermind cards
  for (const mm of set.masterminds) {
    for (const card of mm.cards) {
      cards.push({
        key:       `${abbr}-mastermind-${mm.slug}-${card.slug}`,
        // why: D-24018 — canonical set-qualified ext_id (mastermind group slug).
        extId:     `${abbr}/${mm.slug}`,
        cardType:  "mastermind",
        setAbbr:   abbr,
        setName,
        name:      card.name,
        slug:      card.slug,
        imageUrl:  card.imageUrl,
        abilities: card.abilities,
      });
    }
  }

  // Villain cards
  for (const group of set.villains) {
    for (const card of group.cards) {
      cards.push({
        key:       `${abbr}-villain-${group.slug}-${card.slug}`,
        // why: D-24018 — canonical set-qualified ext_id (villain group slug).
        // Mirrors the engine's extractVillainGroupSlug derivation.
        extId:     `${abbr}/${group.slug}`,
        cardType:  "villain",
        setAbbr:   abbr,
        setName,
        name:      card.name,
        slug:      card.slug,
        imageUrl:  card.imageUrl,
        abilities: card.abilities,
      });
    }
  }

  // Schemes
  for (const scheme of set.schemes) {
    cards.push({
      key:       `${abbr}-scheme-${scheme.slug}`,
      // why: D-24018 — canonical set-qualified ext_id (scheme slug).
      extId:     `${abbr}/${scheme.slug}`,
      cardType:  "scheme",
      setAbbr:   abbr,
      setName,
      name:      scheme.name,
      slug:      scheme.slug,
      imageUrl:  scheme.imageUrl,
      abilities: scheme.cards.flatMap((c) => c.abilities),
    });
  }

  return cards;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query filtering
// ─────────────────────────────────────────────────────────────────────────────
export function applyQuery(cards: FlatCard[], q: CardQuery): FlatCard[] {
  return cards.filter((c) => {
    if (q.cardType  && c.cardType !== q.cardType) return false;
    if (q.setAbbr   && c.setAbbr  !== q.setAbbr)  return false;
    if (q.heroClass && c.hc       !== q.heroClass) return false;
    if (q.team      && c.team     !== q.team)      return false;
    if (q.rarity    && c.rarity   !== q.rarity)    return false;
    if (q.nameContains) {
      const needle = q.nameContains.toLowerCase();
      const hay = [c.name, c.heroName ?? ""].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Build health report from parse errors
// ─────────────────────────────────────────────────────────────────────────────
export function buildHealthReport(
  sets: SetIndexEntry[],
  loadedSets: SetData[],
  errors: Array<{ setAbbr?: string; code: string; message: string }>
): HealthReport {
  const totalHeroes = loadedSets.reduce((n, s) => n + s.heroes.length, 0);
  const totalCards  = loadedSets.reduce(
    (n, s) =>
      n +
      s.heroes.reduce((h, hero) => h + hero.cards.length, 0) +
      s.masterminds.reduce((m, mm) => m + mm.cards.length, 0) +
      s.villains.reduce((v, g) => v + g.cards.length, 0) +
      s.schemes.length,
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      setsIndexed:  sets.length,
      setsLoaded:   loadedSets.length,
      totalHeroes,
      totalCards,
      parseErrors:  errors.length,
    },
    errors,
  };
}
