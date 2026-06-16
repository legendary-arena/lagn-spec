// why: use types-index.ts (the live/wide type source) per EC-102
// consolidation. See browser.ts comment. CardQueryExtended is
// canonically exported from that file — no local redeclaration needed.
import type {
  SetData, SetIndexEntry, FlatCard, CardQueryExtended, HealthReport,
} from "./types/types-index.js";

// why: schemeTwistAssignments is optional so flattenSet stays pure and
// degrades gracefully — when the R2 fetch fails the parameter is undefined
// and scheme cards simply omit the twistPattern field. patternAssignmentsByType
// extends the same pattern for the four WP-184 mechanical pattern taxonomies
// (hero / villain / henchman / mastermind / scheme — scheme is threaded here
// as well so a single caller can pass all assignments through one structured
// parameter). Each Map is built once at load time and passed in for O(1)
// lookups; flattenSet stays pure (no singleton reads inside).
export interface PatternAssignmentsByType {
  hero?:       Map<string, string>;
  villain?:    Map<string, string>;
  henchman?:   Map<string, string>;
  mastermind?: Map<string, string>;
  scheme?:     Map<string, string>;
}

export function flattenSet(
  set: SetData,
  setName: string,
  schemeTwistAssignments?: Map<string, string>,
  patternAssignmentsByType?: PatternAssignmentsByType,
): FlatCard[] {
  const cards: FlatCard[] = [];
  const abbr = set.abbr;

  // why: per-entity (hero / villain / henchman / mastermind) pattern lookups
  // for WP-184. Resolved ONCE per group/hero before the inner card loop so
  // every card under the same entity reuses the lookup. Explicit per-type
  // routing — no dynamic dispatch by cardType string and no singleton reads.
  const heroPatternMap       = patternAssignmentsByType?.hero;
  const villainPatternMap    = patternAssignmentsByType?.villain;
  const henchmanPatternMap   = patternAssignmentsByType?.henchman;
  const mastermindPatternMap = patternAssignmentsByType?.mastermind;

  // Heroes
  for (const hero of set.heroes) {
    // why: D-15101 — physicalCards[] is the sole hero image source now that
    // HeroCardSchema.imageUrl has been removed (D-14103 transition closed).
    const sideToImageUrl = new Map<string, string>();
    if (Array.isArray(hero.physicalCards)) {
      for (const physicalCard of hero.physicalCards) {
        if (!physicalCard || typeof physicalCard !== 'object') continue;
        if (typeof physicalCard.imageUrl !== 'string') continue;
        if (!Array.isArray(physicalCard.sides)) continue;
        for (const sideSlug of physicalCard.sides) {
          if (typeof sideSlug === 'string') {
            sideToImageUrl.set(sideSlug, physicalCard.imageUrl);
          }
        }
      }
    }

    // why: WP-170 Amendment (2026-05-22) — heroDeckTotal precomputed ONCE per
    // hero before the per-card loop. Sum cardCounts values (typically
    // 5/5/3/1 → 14) so every card in this hero reuses the same total.
    // Undefined when cardCounts is absent (SHIELD Officers, alt-art heroes)
    // — count row omits per AND-semantics. No per-card summation.
    let heroDeckTotal: number | undefined;
    if (hero.cardCounts && typeof hero.cardCounts === "object") {
      let sum = 0;
      for (const value of Object.values(hero.cardCounts)) {
        if (typeof value === "number") sum += value;
      }
      if (sum > 0) heroDeckTotal = sum;
    }

    // why: WP-184 — hero patterns are assigned at the hero level (one slug per
    // hero, applied to all 4 cards in the set). Look up once per hero.
    const heroMechanicalPattern = heroPatternMap?.get(`${abbr}/${hero.slug}`);

    for (const card of hero.cards) {
      // why: WP-170 Amendment (2026-05-22) — R2 cardCounts is keyed by card
      // display name (e.g. {"Mission Accomplished": 5, ...}), not by rarity
      // tier or rarity label. Original WP/EC spec said cardCounts[card.rarity]
      // — that's a misread of the data shape; rarity-key lookup yields
      // undefined for every hero card. Name-key lookup is deterministic; no
      // fuzzy matching, no fallback heuristics. Absent key ⇒ count undefined
      // ⇒ row omits per AND-semantics.
      let heroCardCount: number | undefined;
      if (hero.cardCounts && typeof card.name === "string" && card.name.length > 0) {
        const lookedUp = hero.cardCounts[card.name];
        if (typeof lookedUp === "number") heroCardCount = lookedUp;
      }
      // why: WP-086 Phase 2 (Officer-Specials slice) — heroes may carry a
      // per-card cardType override. When absent, defaults to "hero" so the
      // historical behavior is preserved for every existing hero card. The
      // override is currently used only for the 8 S.H.I.E.L.D. Officer
      // Specials in shld.json so they appear under the SHIELD ribbon's
      // Officer-Special sub-chip rather than under Hero. The key still
      // includes the override slug so it stays unique across reclassified
      // cards (e.g., `shld-shield-officer-special-dum-dum-dugan` instead of
      // `shld-hero-dum-dum-dugan-dum-dum-dugan`).
      const resolvedCardType = typeof card.cardType === "string" && card.cardType.length > 0
        ? card.cardType
        : "hero";
      cards.push({
        // why: use card.slug (not card.slot) — a few heroes (wwhk Caiera,
        // Miek The Unhived, Rick Jones) have two cards sharing the same
        // slot because one Transforms into the other. Keying on slot
        // produced duplicate Vue v-for keys and stranded DOM nodes that
        // survived filtering, making those cards appear to match every
        // search term.
        key:         `${abbr}-${resolvedCardType}-${hero.slug}-${card.slug}`,
        // why: D-24018 — set-qualified ext_id (hero slug) for loadout
        // composition, mirroring the engine's extractHeroSlug derivation.
        extId:       `${abbr}/${hero.slug}`,
        cardType:    resolvedCardType,
        setAbbr:     abbr,
        setName,
        name:        card.name ?? "",
        // why: group/entity display name for the loadout picker — the hero
        // ("Black Widow"), not the member card's name ("Mission Accomplished").
        // The picker collapses a hero's cards by extId; labeling by groupName
        // makes one click add the whole hero group.
        groupName:   hero.name,
        slug:        card.slug,
        imageUrl:    sideToImageUrl.get(card.slug) ?? "",
        physicalCardImageUrl: sideToImageUrl.get(card.slug),
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
        count:       heroCardCount,
        setTotal:    heroDeckTotal,
        // why: WP-184 — populated only when the resolved cardType is exactly
        // "hero". Per-card cardType overrides (e.g. "shield-officer-special")
        // route to no map, so mechanicalPattern stays undefined for those.
        mechanicalPattern: resolvedCardType === "hero" ? heroMechanicalPattern : undefined,
      });
    }
  }

  // Masterminds
  for (const mm of set.masterminds) {
    const mastermindMechanicalPattern = mastermindPatternMap?.get(`${abbr}/${mm.slug}`);
    for (const card of mm.cards) {
      cards.push({
        key:       `${abbr}-mastermind-${mm.slug}-${card.slug}`,
        // why: D-24018 — set-qualified ext_id (mastermind group slug).
        extId:     `${abbr}/${mm.slug}`,
        cardType:  "mastermind",
        setAbbr:   abbr,
        setName,
        name:      card.name,
        // why: group name for the loadout picker — the mastermind ("Dr. Doom"),
        // not whichever tactic/main card lands first in the collapsed entry.
        groupName: mm.name,
        slug:      card.slug,
        imageUrl:  card.imageUrl ?? "",
        abilities: card.abilities ?? [],
        mechanicalPattern: mastermindMechanicalPattern,
      });
    }
  }

  // Villains
  for (const group of set.villains) {
    // why: WP-170 — villainGroupTotal precomputed ONCE per group before the
    // per-card loop. Sum copies ?? 1 across all cards in the group (e.g.
    // Brotherhood 4 cards × 2 copies = 8). The `?? 1` default is applied at
    // computation time only — source data remains read-only. Per-card iteration
    // below only assigns; no summation inside the loop.
    let villainGroupTotal = 0;
    for (const card of group.cards) {
      villainGroupTotal += card.copies ?? 1;
    }
    for (const card of group.cards) {
      // why: WP-184 per-card defect fix (2026-05-27) — villain patterns are
      // assigned PER CARD, not per group. A villain group bundles 4-8
      // mechanically distinct cards; the prior group-level lookup stamped one
      // slug onto every card, so the "Fight: KO Hero" chip surfaced cards with
      // no Fight effect. Key shape is `{abbr}/{groupSlug}/{cardSlug}`; cards
      // with no qualifying clause are absent from the map and stay unbadged.
      const villainMechanicalPattern = villainPatternMap?.get(`${abbr}/${group.slug}/${card.slug}`);
      cards.push({
        key:       `${abbr}-villain-${group.slug}-${card.slug}`,
        // why: D-24018 — set-qualified ext_id (villain GROUP slug; every member
        // card shares it), mirroring the engine's extractVillainGroupSlug.
        extId:     `${abbr}/${group.slug}`,
        cardType:  "villain",
        setAbbr:   abbr,
        setName,
        name:      card.name,
        // why: group name for the loadout picker — the villain group
        // ("Brotherhood"), not a member card ("Blob"). One click adds the group.
        groupName: group.name,
        slug:      card.slug,
        imageUrl:  card.imageUrl ?? "",
        abilities: card.abilities ?? [],
        count:     card.copies ?? 1,
        setTotal:  villainGroupTotal,
        mechanicalPattern: villainMechanicalPattern,
      });
    }
  }

  // Henchmen
  // why (a): most henchman groups are flat objects — `{ id, name, slug,
  //   imageUrl, abilities, vAttack, vp }` with no nested `cards`. WP-122
  //   pre-flight (2026-05-01) confirmed this for 44 entries across 40 set
  //   files, and the viewer originally emitted one FlatCard per group.
  // why (b): the upstream converter (modern-master-strike convert-cards-v15)
  //   was extended (2026-05-01) to emit a `cards: [{ name, slug, imageUrl,
  //   abilities }]` sub-array on multi-card henchman groups whose source
  //   cards are name-distinct (Mandarin's Rings has 10 different rings;
  //   Tardigrade and Ultron Sentries each have 5 class variants). For those
  //   groups we emit one FlatCard per card so each variant is browseable
  //   with its own art. Single-card groups (Hand Ninjas etc.) keep the
  //   original one-FlatCard-per-group behavior — `cards` is absent and the
  //   flat-shape branch fires.
  // why (c): the sibling `flattenSet` in `packages/registry/src/shared.ts`
  //   does not iterate `set.henchmen` at all (it emits only hero,
  //   mastermind, villain, and scheme cards) and therefore needs no
  //   parallel fix. This is a viewer-local divergence, intentional and
  //   isolated.
  // why (d): see DECISIONS.md D-12201 for the original locked decision; the
  //   per-card branch added 2026-05-01 supersedes the "one push per group"
  //   rule for the multi-card case while preserving it for single-card
  //   groups. Engine-layer expansion to 10 deck copies is unrelated and
  //   continues to live in `packages/game-engine/**`.
  // why (e): scope reference WP-122 / EC-123 (original flat-shape branch);
  //   per-card branch added under EC-124 (ad-hoc, no WP) coordinated with
  //   the upstream converter change. Both ECs together cover the deployed
  //   data shapes; either alone leaves a partial-emission regression.
  // why (f): the class-keyed `imageUrlByClass` map carried by tardigrade and
  //   ultron-sentries is still ignored at this seam — those groups now have
  //   a `cards` array which is the canonical per-variant source. The flat
  //   `imageUrl`/`imageUrlByClass` patch fields remain in the JSON for
  //   backward compatibility with engine consumers but are not surfaced
  //   here.
  for (const henchman of set.henchmen) {
    if (typeof henchman !== "object" || henchman === null) continue;
    const henchmanRecord = henchman as Record<string, unknown>;
    const groupSlug = String(henchmanRecord["slug"] ?? henchmanRecord["name"] ?? "henchman");
    const groupName = String(henchmanRecord["name"] ?? groupSlug);
    const subCards = henchmanRecord["cards"];
    const henchmanMechanicalPattern = henchmanPatternMap?.get(`${abbr}/${groupSlug}`);

    if (Array.isArray(subCards) && subCards.length > 0) {
      for (const c of subCards) {
        if (typeof c !== "object" || c === null) continue;
        const cardRecord = c as Record<string, unknown>;
        const cardSlug = String(cardRecord["slug"] ?? cardRecord["name"] ?? groupSlug);
        cards.push({
          key:       `${abbr}-henchman-${groupSlug}-${cardSlug}`,
          // why: D-24018 — set-qualified ext_id (henchman GROUP slug; every
          // sub-card shares it), matching the engine's henchman group lookup.
          extId:     `${abbr}/${groupSlug}`,
          cardType:  "henchman",
          setAbbr:   abbr,
          setName,
          name:      String(cardRecord["name"] ?? groupName),
          // why: group name for the loadout picker — the henchman group, not a
          // per-variant sub-card (e.g. one of Mandarin's Rings).
          groupName,
          slug:      cardSlug,
          imageUrl:  String(cardRecord["imageUrl"] ?? henchmanRecord["imageUrl"] ?? ""),
          abilities: Array.isArray(cardRecord["abilities"]) ? cardRecord["abilities"] as string[] : [],
          mechanicalPattern: henchmanMechanicalPattern,
        });
      }
      continue;
    }

    cards.push({
      key:       `${abbr}-henchman-${groupSlug}`,
      // why: D-24018 — set-qualified ext_id (henchman group slug).
      extId:     `${abbr}/${groupSlug}`,
      cardType:  "henchman",
      setAbbr:   abbr,
      setName,
      name:      groupName,
      // why: group name for the loadout picker (single-card henchman group).
      groupName,
      slug:      groupSlug,
      imageUrl:  String(henchmanRecord["imageUrl"] ?? ""),
      abilities: Array.isArray(henchmanRecord["abilities"]) ? henchmanRecord["abilities"] as string[] : [],
      mechanicalPattern: henchmanMechanicalPattern,
    });
  }

  // Schemes
  for (const scheme of set.schemes) {
    // why: Map.get is O(1) — no per-render recomputation; the map is built
    // once at load time and passed in as a parameter to keep flattenSet pure.
    const twistPattern = schemeTwistAssignments?.get(`${abbr}/${scheme.slug}`);
    cards.push({
      key:       `${abbr}-scheme-${scheme.slug}`,
      // why: D-24018 — set-qualified ext_id (scheme slug).
      extId:     `${abbr}/${scheme.slug}`,
      cardType:  "scheme",
      setAbbr:   abbr,
      setName,
      name:      scheme.name,
      // why: schemes are a single entity, so groupName mirrors name — set
      // explicitly so the picker's groupName label path is uniform across slots.
      groupName: scheme.name,
      slug:      scheme.slug,
      imageUrl:  scheme.imageUrl ?? "",
      abilities: scheme.cards?.flatMap((c) => c.abilities ?? []) ?? [],
      twistPattern,
    });
  }

  // Bystanders
  for (const b of set.bystanders) {
    if (typeof b !== "object" || b === null) continue;
    const by = b as Record<string, unknown>;
    const slug = String(by["slug"] ?? by["name"] ?? "bystander");
    cards.push({
      key:       `${abbr}-bystander-${slug}`,
      // why: D-24018 — bystanders are not a composition entity (they are a
      // count, not an ext_id), but FlatCard.extId is required; the qualified
      // form keeps the field consistent across every card type.
      extId:     `${abbr}/${slug}`,
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
      // why: D-24018 — wounds are a count, not a composition ext_id; the
      // qualified form keeps the required FlatCard.extId field consistent.
      extId:     `${abbr}/${slug}`,
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
  // why (a): set.other[] is the registry's generic bucket for cards that don't
  //   fit the seven primary categories. Reading entry.cardType (when present)
  //   and using it as the FlatCard's cardType is the foundation for any future
  //   Phase 2 emission -- Sidekick, S.H.I.E.L.D. Officer, Trooper, and Agent,
  //   or any new taxonomy slug -- without hardcoding new top-level loops.
  // why (b): entries without a cardType field preserve the prior behavior
  //   (FlatCard.cardType = "other", key = ${abbr}-other-${slug}). This is
  //   byte-identical to the pre-WP-123 output for the existing (currently
  //   empty) set.other[] arrays -- introducing the dispatch cannot break
  //   compatibility because legacy entries take the fallback branch.
  // why (c): WP-086 Phase 2 wire-through: see WP-086 §Out of Scope ("Phase 2
  //   -- upstream modern-master-strike generator emits cardType on each card;
  //   regenerate 40 sets -- is a follow-up WP, not in scope here"). This WP
  //   is the viewer side of that wire; the upstream data-authoring side is a
  //   separate operator/upstream task and is out of scope here.
  // why (d): see DECISIONS.md D-12301 for the locked decision (key shape,
  //   fallback string, type-widening pairing).
  // why (e): scope reference WP-123 / EC-125.
  for (const entry of set.other) {
    if (typeof entry !== "object" || entry === null) continue;
    const entryRecord = entry as Record<string, unknown>;
    const cardType = String(entryRecord["cardType"] ?? "other");
    const slug = String(entryRecord["slug"] ?? entryRecord["name"] ?? "other");
    cards.push({
      key:       `${abbr}-${cardType}-${slug}`,
      // why: D-24018 — generic bucket; the qualified form keeps the required
      // FlatCard.extId field consistent for any future taxonomy slug.
      extId:     `${abbr}/${slug}`,
      cardType,
      setAbbr:   abbr,
      setName,
      name:      String(entryRecord["name"] ?? slug),
      slug,
      imageUrl:  String(entryRecord["imageUrl"] ?? ""),
      abilities: Array.isArray(entryRecord["abilities"]) ? entryRecord["abilities"] as string[] : [],
    });
  }

  return cards;
}

export function applyQuery(
  cards: FlatCard[],
  q: CardQueryExtended,
  twistPatterns?: Set<string>,
  mechanicalPatterns?: Set<string>,
): FlatCard[] {
  // why: WP-184 — the mechanical pattern filter has undefined semantics when
  // the user has multiple cardType chips active (a hero pattern slug should
  // not match a villain card, and vice versa). Single-cardType enforcement
  // lives here (in logic) — NOT only in UI gating — so a future caller that
  // bypasses the chip UI still gets safe behavior.
  // why: cross-taxonomy pattern filter has undefined semantics
  const activeMechanicalPatterns = (() => {
    if (!mechanicalPatterns || mechanicalPatterns.size === 0) return null;
    const activeCardTypeCount = (q.cardTypes?.length ?? 0) + (q.cardType ? 1 : 0);
    if (activeCardTypeCount !== 1) {
      console.warn(
        "[card-patterns] mechanicalPatterns filter ignored — requires exactly one active cardType " +
        `(got ${activeCardTypeCount}). Activate a single cardType chip to apply pattern filtering.`,
      );
      return null;
    }
    return mechanicalPatterns;
  })();

  return cards.filter((c) => {
    // why: when twist-pattern filter is active, non-scheme cards are excluded
    // regardless of the cardType filter state — the twist taxonomy is
    // scheme-specific and including non-scheme cards would be nonsensical.
    if (twistPatterns && twistPatterns.size > 0) {
      if (c.cardType !== "scheme") return false;
      if (!c.twistPattern || !twistPatterns.has(c.twistPattern)) return false;
    }
    // why: mechanical pattern filter — AND-combined with all other filters.
    // The single-cardType guard above guarantees that only cards of that one
    // cardType reach this filter; unassigned cards (no mechanicalPattern)
    // are excluded when the filter is active.
    if (activeMechanicalPatterns) {
      if (!c.mechanicalPattern || !activeMechanicalPatterns.has(c.mechanicalPattern)) return false;
    }
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
