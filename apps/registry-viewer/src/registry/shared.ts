// why: use types-index.ts (the live/wide type source) per EC-102
// consolidation. See browser.ts comment. CardQueryExtended is
// canonically exported from that file — no local redeclaration needed.
import type {
  SetData, SetIndexEntry, FlatCard, CardQueryExtended, HealthReport,
} from "./types/types-index.js";

export function flattenSet(set: SetData, setName: string): FlatCard[] {
  const cards: FlatCard[] = [];
  const abbr = set.abbr;

  // Heroes
  for (const hero of set.heroes) {
    for (const card of hero.cards) {
      cards.push({
        // why: use card.slug (not card.slot) — a few heroes (wwhk Caiera,
        // Miek The Unhived, Rick Jones) have two cards sharing the same
        // slot because one Transforms into the other. Keying on slot
        // produced duplicate Vue v-for keys and stranded DOM nodes that
        // survived filtering, making those cards appear to match every
        // search term.
        key:         `${abbr}-hero-${hero.slug}-${card.slug}`,
        cardType:    "hero",
        setAbbr:     abbr,
        setName,
        name:        card.name ?? "",
        slug:        card.slug,
        imageUrl:    card.imageUrl ?? "",
        heroName:    hero.name,
        team:        hero.team ?? undefined,
        hc:          card.hc ?? undefined,
        rarity:      card.rarity ?? undefined,
        rarityLabel: card.rarityLabel ?? undefined,
        slot:        card.slot ?? undefined,
        cost:        typeof card.cost === "number" ? card.cost : undefined,
        // why: attack/recruit may be numeric or string (star-modifier
        // costs per registry D-1204). FlatCard stores as string-or-null
        // for display; stringify on the way in to preserve both forms.
        attack:      card.attack == null ? null : String(card.attack),
        recruit:     card.recruit == null ? null : String(card.recruit),
        abilities:   card.abilities ?? [],
      });
    }
  }

  // Masterminds
  for (const mm of set.masterminds) {
    for (const card of mm.cards) {
      cards.push({
        key:       `${abbr}-mastermind-${mm.slug}-${card.slug}`,
        cardType:  "mastermind",
        setAbbr:   abbr,
        setName,
        name:      card.name,
        slug:      card.slug,
        imageUrl:  card.imageUrl ?? "",
        abilities: card.abilities ?? [],
      });
    }
  }

  // Villains
  for (const group of set.villains) {
    for (const card of group.cards) {
      cards.push({
        key:       `${abbr}-villain-${group.slug}-${card.slug}`,
        cardType:  "villain",
        setAbbr:   abbr,
        setName,
        name:      card.name,
        slug:      card.slug,
        imageUrl:  card.imageUrl ?? "",
        abilities: card.abilities ?? [],
      });
    }
  }

  // Henchmen
  // why (a): the prior implementation looked for a nested `cards` sub-array
  //   on each henchman entry and iterated it. The actual data shape across
  //   all 40 set files in `data/cards/*.json` is a flat object per henchman
  //   group — `{ id, name, slug, imageUrl, abilities, vAttack, vp }` with no
  //   `cards` array. The shape sweep at WP-122 pre-flight (2026-05-01)
  //   confirmed 44 henchman entries, zero with nested `cards`. The result
  //   was zero henchman emission and an empty `Henchman` ribbon pill.
  // why (b): this flat treatment mirrors the bystanders block (below at
  //   "Bystanders") and the wounds block (below at "Wounds") in this same
  //   file — same null-narrowing, same `Record<string, unknown>` cast,
  //   same slug fallback chain, same single push per group.
  // why (c): the sibling `flattenSet` in `packages/registry/src/shared.ts`
  //   does not iterate `set.henchmen` at all (it emits only hero,
  //   mastermind, villain, and scheme cards) and therefore needs no
  //   parallel fix. This is a viewer-local divergence, intentional and
  //   isolated.
  // why (d): see DECISIONS.md D-12201 for the locked decision (key
  //   format, locked test minimum, divergence rationale).
  // why (e): scope reference WP-122 / EC-123.
  // why (f): one `FlatCard` per henchman group, not a per-card expansion.
  //   In Legendary, a henchman group enters the villain deck as 10 copies,
  //   but that expansion is an engine-layer concern in
  //   `packages/game-engine/**`. `FlatCard` is the registry-display
  //   projection (one record per registry entry), not a deck realization.
  // why (g): only the flat `imageUrl` field is surfaced; the class-keyed
  //   image map (covert / instinct / ranged / strength / tech) carried by
  //   a few henchman entries is intentionally ignored. Confirmed examples
  //   `amwp/tardigrade` and `wtif/ultron-sentries` carry both a flat
  //   `imageUrl` and the class-keyed map. The current `FlatCard` schema
  //   models only `imageUrl: string`; surfacing class-keyed art requires
  //   widening `FlatCard` plus paired UI changes in `CardGrid.vue` /
  //   `CardDetail.vue`. Deferred to a future WP that widens `FlatCard`.
  for (const henchman of set.henchmen) {
    if (typeof henchman !== "object" || henchman === null) continue;
    const henchmanRecord = henchman as Record<string, unknown>;
    const slug = String(henchmanRecord["slug"] ?? henchmanRecord["name"] ?? "henchman");
    cards.push({
      key:       `${abbr}-henchman-${slug}`,
      cardType:  "henchman",
      setAbbr:   abbr,
      setName,
      name:      String(henchmanRecord["name"] ?? slug),
      slug,
      imageUrl:  String(henchmanRecord["imageUrl"] ?? ""),
      abilities: Array.isArray(henchmanRecord["abilities"]) ? henchmanRecord["abilities"] as string[] : [],
    });
  }

  // Schemes
  for (const scheme of set.schemes) {
    cards.push({
      key:       `${abbr}-scheme-${scheme.slug}`,
      cardType:  "scheme",
      setAbbr:   abbr,
      setName,
      name:      scheme.name,
      slug:      scheme.slug,
      imageUrl:  scheme.imageUrl ?? "",
      abilities: scheme.cards?.flatMap((c) => c.abilities ?? []) ?? [],
    });
  }

  // Bystanders
  for (const b of set.bystanders) {
    if (typeof b !== "object" || b === null) continue;
    const by = b as Record<string, unknown>;
    const slug = String(by["slug"] ?? by["name"] ?? "bystander");
    cards.push({
      key:       `${abbr}-bystander-${slug}`,
      cardType:  "bystander",
      setAbbr:   abbr,
      setName,
      name:      String(by["name"] ?? slug),
      slug,
      imageUrl:  String(by["imageUrl"] ?? ""),
      abilities: Array.isArray(by["abilities"]) ? by["abilities"] as string[] : [],
    });
  }

  // Wounds
  for (const w of set.wounds) {
    if (typeof w !== "object" || w === null) continue;
    const wd = w as Record<string, unknown>;
    const slug = String(wd["slug"] ?? wd["name"] ?? "wound");
    cards.push({
      key:       `${abbr}-wound-${slug}`,
      cardType:  "wound",
      setAbbr:   abbr,
      setName,
      name:      String(wd["name"] ?? slug),
      slug,
      imageUrl:  String(wd["imageUrl"] ?? ""),
      abilities: Array.isArray(wd["abilities"]) ? wd["abilities"] as string[] : [],
    });
  }

  // Other
  for (const o of set.other) {
    if (typeof o !== "object" || o === null) continue;
    const ot = o as Record<string, unknown>;
    const slug = String(ot["slug"] ?? ot["name"] ?? "other");
    cards.push({
      key:       `${abbr}-other-${slug}`,
      cardType:  "other",
      setAbbr:   abbr,
      setName,
      name:      String(ot["name"] ?? slug),
      slug,
      imageUrl:  String(ot["imageUrl"] ?? ""),
      abilities: Array.isArray(ot["abilities"]) ? ot["abilities"] as string[] : [],
    });
  }

  return cards;
}

export function applyQuery(cards: FlatCard[], q: CardQueryExtended): FlatCard[] {
  return cards.filter((c) => {
    // Multi-type filter takes priority over single cardType
    if (q.cardTypes && q.cardTypes.length > 0) {
      if (!q.cardTypes.includes(c.cardType)) return false;
    } else if (q.cardType) {
      if (c.cardType !== q.cardType) return false;
    }
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
      s.henchmen.length +
      s.schemes.length +
      s.bystanders.length +
      s.wounds.length +
      s.other.length,
    0
  );
  return {
    generatedAt: new Date().toISOString(),
    summary: { setsIndexed: sets.length, setsLoaded: loadedSets.length, totalHeroes, totalCards, parseErrors: errors.length },
    errors,
  };
}
