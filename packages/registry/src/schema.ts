/**
 * schema.ts — matches the actual Legendary Arena R2 data format
 *
 * Data lives at:
 *   https://images.barefootbetters.com/registry-config.json      → set abbreviation list
 *   https://images.barefootbetters.com/metadata/sets.json        → set index
 *   https://images.barefootbetters.com/metadata/{abbr}.json      → full set card data
 *
 * Image URLs are embedded directly in each card object (imageUrl field).
 * All imageUrl values should point to the R2 domain (images.barefootbetters.com).
 *
 * Schema permissiveness decisions (grounded in real data observations):
 *
 *   HeroSchema.id              — any int, nullable, optional:
 *                                  3dtc has null on heroes 2-4
 *                                  shld heroes 4-11 have no id key at all
 *                                  msp1 uses -1 as a sentinel value
 *   HeroCardSchema.*           — most fields optional: anni cards have only slug+imageUrl
 *   HeroCardSchema.slot        — no upper bound: mgtg MCU Guardians has 7-card hero decks
 *   HeroCardSchema.displayName — optional: amwp omits this field entirely
 *   HeroCardSchema.cost        — string|number|optional: amwp Wasp has '2*', '3*' star-cost cards
 *   MastermindCardSchema.vAttack — nullable: msmc/dstr/bkpt main card has vAttack:null
 *   MastermindSchema.vp        — nullable: mgtg MCU Guardians masterminds have vp:null
 *   VillainCardSchema.vp       — nullable: wpnx villain cards have vp:null
 *   SchemeSchema.id            — nullable: transform card reverse sides have id:null
 */

import { z } from "zod";

// ── Registry set-abbreviation list (R2 /registry-config.json artifact) ────────
// Simple array of set abbreviation strings. R2 artifact only — not the viewer's
// public config. For the viewer's public/registry-config.json (object shape with
// metadataBaseUrl, eagerLoad, rulebookPdfUrl), see ViewerConfigSchema below.
export const RegistryConfigSchema = z.array(
  z.string().min(2).max(10)
);

// ── Set index (sets.json) ─────────────────────────────────────────────────────
// One entry per expansion. releaseDate is ISO date string.
export const SetIndexEntrySchema = z.object({
  id:          z.number().int().positive(),
  abbr:        z.string().min(1).max(10),
  pkgId:       z.number().int().positive(),
  slug:        z.string().min(1),
  name:        z.string().min(1),
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type:        z.string().min(1),
});

// ── Hero class string enum ────────────────────────────────────────────────────
export const HeroClassSchema = z.enum([
  "covert", "instinct", "ranged", "strength", "tech",
]);

// ── Hero card (one slot inside a hero deck) ───────────────────────────────────
// Permissiveness decisions:
//   - Most fields are optional because some sets (e.g. anni) produce cards
//     with only slug + imageUrl due to incomplete source data conversion.
//   - slot has no upper bound: MCU Guardians (mgtg) has 7-card hero decks.
//   - displayName is optional: amwp omits it entirely.
//   - cost accepts string|number|optional: amwp Wasp has '2*', '3*' star-cost cards.
//   - attack and recruit are strings ("2", "2+", "0+") to preserve the '+'
//     modifier; null when not applicable for this card.
export const HeroCardSchema = z.object({
  name:        z.string().optional(),
  displayName: z.string().optional(),
  slug:        z.string(),
  rarity:      z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  rarityLabel: z.string().optional(),
  slot:        z.number().int().min(1).optional(),
  hc:          HeroClassSchema.optional(),
  cost:        z.union([z.number().int().min(0), z.string()]).optional(),
  attack:      z.string().nullable().optional(),
  recruit:     z.string().nullable().optional(),
  imageUrl:    z.string().url(),
  abilities:   z.array(z.string()).optional(),
});

// ── Physical card (deck-composition primitive — WP-138 Phase 1a) ──────────────
// why: D-13801 — `physicalCards[]` is the authoritative deck-composition
// surface for hero decks. A `PhysicalCard` represents a single physical
// artifact in the deck; its `sides[]` list names the per-face card slugs
// (one for solo cards, two for split-side cards like Falcon/Winter Soldier's
// Attune/Atone). Deck size for split heroes is the sum of `count` across
// `physicalCards[]`, NOT the sum of per-side `cardCounts`. The previous
// model conflated "card" with "card side" and silently produced inflated
// deck reservoirs for split heroes (Falcon/Winter Soldier 27 instead of 14).
// `cardCounts` becomes a derived view validated against physicalCards counts
// at registry load.
// why: D-13802 — `imageUrl` lives on the physicalCard, not on the card-side.
// The convert script computes it deterministically from sorted side slugs:
// solo cards `{abbr}-hr-{hero}-{slug}.webp`; split cards
// `{abbr}-hr-{hero}-{sortedA}-{sortedB}.webp` where sort is
// `Array.prototype.sort()` with NO comparator argument (UTF-16 code-unit
// ordering). See D-13802 for the full forbidden list of locale-aware
// comparison APIs and the rationale: locale-dependent collation would
// produce non-deterministic URLs across environments.
// why: D-13804 — physical-card identity is a registry concept, not an
// ext_id concept. Per-side ext_ids (D-13502 grammar
// `<setAbbr>/<heroSlug>/<cardSlug>` plus WP-137's `#N` copy suffix per
// D-13702) are unchanged. Replay or audit code MUST NOT assume that a
// per-side ext_id alone uniquely identifies a physical card instance —
// for split heroes, two ext_ids share one physicalCard.
// why: `sides` is typed `readonly string[]` (not a tuple union) with the
// `1 <= length <= 2` invariant enforced by the validator below. This
// keeps the ceiling raise (e.g., future triple-face cards in some games)
// a single Zod-check change rather than a TypeScript-type migration
// across every consumer. The `<= 2` ceiling is locked for this WP;
// raising it requires its own DECISIONS entry.
// why: D-14701 — physicalCard depicts hero plus a named non-hero companion
// character on the printed artwork (e.g., Drax/Irani Rael, Drax/Rhomann Dey
// in mgtg). The slug appears in the imageUrl between heroSlug and side
// slugs. Field is optional: most physicalCards have no companion (the
// printed art shows the hero alone or with only side slugs). The slug
// regex matches the slug grammar used elsewhere across the schema (lower-
// case alphanumerics and hyphens). PhysicalCardSchema is primary
// enforcement; heroImageUrl() has a defense-in-depth guard at the module
// boundary so direct callers also surface bad input loudly.
export const PhysicalCardSchema = z
  .object({
    id:            z.string().regex(/^p\d+$/, "physicalCard id must match ^p\\d+$ (e.g., p1, p2)"),
    count:         z.number().int().min(1),
    imageUrl:      z.string().url(),
    sides:         z.array(z.string().min(1))
                     .min(1, "physicalCard.sides[] must contain at least one side slug")
                     .max(2, "physicalCard.sides[] must contain at most two side slugs (D-13802 ceiling lock; raising requires a new DECISIONS entry)"),
    companionSlug: z
                     .string()
                     .min(1, "physicalCard.companionSlug must be a non-empty slug; check the patch entry or remove the field if no companion appears on the printed artwork")
                     .regex(/^[a-z0-9-]+$/, "physicalCard.companionSlug must match the slug regex ^[a-z0-9-]+$ (lowercase alphanumerics and hyphens only); check the patch entry for stray whitespace, uppercase, or punctuation")
                     .optional(),
  });

// ── Hero (a named hero deck with 3-7 cards) ───────────────────────────────────
// id permissiveness:
//   - 3dtc:  some heroes have null id
//   - shld:  heroes 4-11 have no id key at all (undefined, not null)
//   - msp1:  all heroes use -1 as a sentinel (no positive constraint)
//
// why: D-13701 (verbatim per EC-137 §Required `// why:` Comments):
// `cardCounts` keys are card display names from the upstream dataset; the engine resolves them against `cards[].name` and emits ext_ids using `cards[].slug`.
// The map is optional and nullable: present-with-value when the upstream
// patch supplies explicit copy counts (per-hero, per-card-name); null/absent
// when the engine falls back to the locked rarity → copy-count map (D-13501)
// keyed by `cards[].rarityLabel`. Values must be positive integers; 0,
// negative, non-integer, or non-number values are silently ignored and
// trigger the rarity-map fallback.
//
// why: D-13803 — `physicalCards[]` is required and non-empty whenever
// `cards[]` is non-empty. Solo heroes get one single-side physicalCard
// per `cards[]` entry (uniform model — no special-casing in consumer
// code: every hero has `physicalCards[]`). The empty-cards case
// (`cards: []`) is the only case `physicalCards: []` is allowed.
//
// superRefine enforces three cross-field invariants from WP-138:
//   - non-empty physicalCards when cards[] non-empty (D-13803)
//   - orphan-side rejection: every physicalCards[].sides[] entry resolves
//     to an existing cards[].slug under the same hero (WP-138 §8)
//   - duplicate-membership rejection: a side slug appears in at most one
//     physicalCard within the same hero (WP-138 §9)
//   - drift detection: when cardCounts is populated, for every side named
//     in cardCounts the sum of physicalCards[].count over physicalCards
//     whose sides[] includes that side must equal cardCounts[sideName]
//     (D-13801 — physicalCards is the authoritative deck-composition surface)
export const HeroSchema = z
  .object({
    id:            z.number().int().nullable().optional(),
    name:          z.string(),
    slug:          z.string(),
    team:          z.string(),
    cards:         z.array(HeroCardSchema),
    cardCounts:    z.record(z.string(), z.number().int().min(1)).nullable().optional(),
    physicalCards: z.array(PhysicalCardSchema),
  })
  .superRefine((hero, ctx) => {
    if (hero.cards.length > 0 && hero.physicalCards.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["physicalCards"],
        message:
          `Hero "${hero.slug}" has ${hero.cards.length} card-side(s) but no ` +
          `physicalCards[] entries. Every hero with non-empty cards[] must ` +
          `declare its deck composition via physicalCards[] (D-13803 uniform model).`,
      });
      return;
    }

    const cardSlugs = new Set<string>();
    for (const card of hero.cards) {
      cardSlugs.add(card.slug);
    }

    const sideOwner = new Map<string, string>();
    for (const physicalCard of hero.physicalCards) {
      for (const sideSlug of physicalCard.sides) {
        if (!cardSlugs.has(sideSlug)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["physicalCards"],
            message:
              `Hero "${hero.slug}" physicalCard "${physicalCard.id}" references ` +
              `unknown side slug "${sideSlug}". Every physicalCards[].sides[] ` +
              `entry must resolve to an existing cards[].slug under the same hero.`,
          });
        }
        const previousOwner = sideOwner.get(sideSlug);
        if (previousOwner !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["physicalCards"],
            message:
              `Hero "${hero.slug}" side slug "${sideSlug}" appears in physicalCards ` +
              `"${previousOwner}" and "${physicalCard.id}". A side slug must appear ` +
              `in at most one physicalCard within a given hero.`,
          });
        } else {
          sideOwner.set(sideSlug, physicalCard.id);
        }
      }
    }

    if (hero.cardCounts) {
      for (const [sideName, expectedCount] of Object.entries(hero.cardCounts)) {
        // why: cardCounts keys are display names (e.g., "Attune") per D-13701;
        // physicalCards.sides[] entries are slugs (e.g., "attune"). Resolve
        // the display name to its slug via cards[] before summing.
        const card = hero.cards.find((c) => c.name === sideName);
        if (!card) continue;
        const sideSlug = card.slug;
        let actualCount = 0;
        for (const physicalCard of hero.physicalCards) {
          if (physicalCard.sides.includes(sideSlug)) {
            actualCount += physicalCard.count;
          }
        }
        if (actualCount !== expectedCount) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["physicalCards"],
            message:
              `Hero "${hero.slug}" cardCounts["${sideName}"] = ${expectedCount} but ` +
              `physicalCards summing for side slug "${sideSlug}" = ${actualCount}. ` +
              `physicalCards is the authoritative deck-composition surface ` +
              `(D-13801); cardCounts must equal the sum of physicalCards[].count ` +
              `over physicalCards whose sides[] includes the side slug.`,
          });
        }
      }
    }
  });

// ── Mastermind card (main card, epic variant, or tactic) ──────────────────────
// vAttack is nullable: some sets (msmc, dstr, bkpt) have the main mastermind
// card with vAttack:null — the printed attack value appears only on the epic
// or is determined dynamically by the card's rules text.
// vAttack may also be a string ("8+", "7") or number (8) depending on the set.
export const MastermindCardSchema = z.object({
  name:      z.string(),
  slug:      z.string(),
  tactic:    z.boolean().optional(),
  vAttack:   z.union([z.string(), z.number()]).nullable(),
  imageUrl:  z.string().url(),
  abilities: z.array(z.string()),
});

// ── Mastermind (one entity with its set of cards) ─────────────────────────────
// vp is nullable: mgtg MCU Guardians masterminds have vp:null.
export const MastermindSchema = z.object({
  id:          z.number().int().positive(),
  name:        z.string(),
  slug:        z.string(),
  alwaysLeads: z.array(z.string()),
  vp:          z.number().int().nullable(),
  cards:       z.array(MastermindCardSchema),
});

// ── Villain card ──────────────────────────────────────────────────────────────
// vp is nullable: wpnx has villain cards with vp:null.
// vp and vAttack may be strings or numbers in source data across different sets.
export const VillainCardSchema = z.object({
  name:      z.string(),
  slug:      z.string(),
  vp:        z.union([z.string(), z.number()]).nullable(),
  vAttack:   z.union([z.string(), z.number()]).nullable(),
  imageUrl:  z.string().url(),
  abilities: z.array(z.string()),
});

// ── Villain group (a named collection of villain cards) ───────────────────────
export const VillainGroupSchema = z.object({
  id:    z.number().int().positive(),
  name:  z.string(),
  slug:  z.string(),
  ledBy: z.array(z.string()),
  cards: z.array(VillainCardSchema),
});

// ── Scheme ────────────────────────────────────────────────────────────────────
// id is nullable: scheme-transform reverse-side cards have id:null.
export const SchemeSchema = z.object({
  id:       z.number().int().positive().nullable(),
  name:     z.string(),
  slug:     z.string(),
  imageUrl: z.string().url(),
  cards:    z.array(z.object({ abilities: z.array(z.string()) })),
});

// ── Full per-set file ({abbr}.json) ───────────────────────────────────────────
export const SetDataSchema = z.object({
  id:          z.number().int().positive(),
  abbr:        z.string(),
  exportName:  z.string(),
  heroes:      z.array(HeroSchema),
  masterminds: z.array(MastermindSchema),
  villains:    z.array(VillainGroupSchema),
  henchmen:    z.array(z.unknown()),
  schemes:     z.array(SchemeSchema),
  bystanders:  z.array(z.unknown()),
  wounds:      z.array(z.unknown()),
  other:       z.array(z.unknown()),
});

// ── Search query (for registry query() API) ───────────────────────────────────
export const CardQuerySchema = z.object({
  setAbbr:      z.string().optional(),
  heroClass:    HeroClassSchema.optional(),
  team:         z.string().optional(),
  nameContains: z.string().optional(),
  // why: cardType widened from the 4-value z.enum to z.string() because
  // data/metadata/card-types.json (consumed by the registry-viewer ribbon
  // generator under WP-086) is now the authoritative taxonomy. The registry
  // package stays permissive at load time; the viewer enforces the taxonomy
  // at fetch time via CardTypesIndexSchema.safeParse.
  cardType:     z.string().optional(),
  rarity:       z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

// ── Keyword & Rule glossary entries (keywords-full.json, rules-full.json) ─────
// why: Keyword and Rule glossary entries are intentionally separate
// schemas. The description/summary distinction is semantic (one
// defines an ability, the other states a rule). Duplicating the
// shared fields keeps semantics explicit at the registry boundary
// and avoids a future contributor extracting a base shape that
// blurs that distinction.
export const KeywordGlossaryEntrySchema = z.object({
  key:         z.string().min(1),
  label:       z.string().min(1),
  description: z.string().min(1),
  pdfPage:     z.number().int().min(1).optional(),
}).strict();

export const RuleGlossaryEntrySchema = z.object({
  key:     z.string().min(1),
  label:   z.string().min(1),
  summary: z.string().min(1),
  pdfPage: z.number().int().min(1).optional(),
}).strict();

export const KeywordGlossarySchema = z.array(KeywordGlossaryEntrySchema);
export const RuleGlossarySchema    = z.array(RuleGlossaryEntrySchema);

export type KeywordGlossaryEntry = z.infer<typeof KeywordGlossaryEntrySchema>;
export type RuleGlossaryEntry    = z.infer<typeof RuleGlossaryEntrySchema>;

// ── Card-types taxonomy (card-types.json) ─────────────────────────────────────
// why: card-types.json drives the registry-viewer ribbon as the authoritative
// taxonomy under WP-086. .strict() rejects unknown fields so any future
// pipeline drift surfaces as an explicit Zod error rather than silent data
// loss. parentType is nullable because top-level entries have no parent;
// non-null parentType references are validated at fetch time
// (cardTypesClient.ts) against existing slugs to detect orphan entries — that
// relational invariant is not expressible in Zod.
export const CardTypeEntrySchema = z.object({
  slug:       z.string().min(1),
  label:      z.string().min(1),
  emoji:      z.string().optional(),
  order:      z.number().int().nonnegative(),
  parentType: z.string().nullable(),
}).strict();

export const CardTypesIndexSchema = z.array(CardTypeEntrySchema);

export type CardTypeEntry  = z.infer<typeof CardTypeEntrySchema>;
export type CardTypesIndex = z.infer<typeof CardTypesIndexSchema>;

// ── Card-abilities effect-tag taxonomy (card-abilities.json) ────────────
// why: WP-125 second metadata-driven taxonomy under WP-086 precedent
// (card-types.json was the first). .strict() rejects unknown fields so any
// future pipeline drift surfaces as an explicit Zod error rather than silent
// data loss. The matcher.type field is locked to a single z.literal("regex")
// so adding a future matcher type (substring / token-presence / structured)
// is an explicit schema decision in a follow-up WP rather than a silent
// extension. D-12501 records the lock.
export const CardAbilityMatcherSchema = z.object({
  type:    z.literal("regex"),
  pattern: z.string().min(1),
  flags:   z.string().optional(),
}).strict();

export const CardAbilityEntrySchema = z.object({
  slug:     z.string().min(1).regex(/^[a-z][a-z0-9-]*$/),
  label:    z.string().min(1),
  emoji:    z.string().optional(),
  order:    z.number().int().nonnegative(),
  matchers: z.array(CardAbilityMatcherSchema).min(1),
}).strict();

export const CardAbilitiesIndexSchema = z.array(CardAbilityEntrySchema);

export type CardAbilityMatcher = z.infer<typeof CardAbilityMatcherSchema>;
export type CardAbilityEntry   = z.infer<typeof CardAbilityEntrySchema>;
export type CardAbilitiesIndex = z.infer<typeof CardAbilitiesIndexSchema>;

// why: CardType = string is the named alias replacing the prior 4-value
// z.enum(["hero","mastermind","villain","scheme"]) at CardQuerySchema. The
// registry package stays permissive at load (any string accepted); the viewer
// enforces the 13-entry taxonomy at fetch time via
// CardTypesIndexSchema.safeParse. Phase 2 (separate WP) will populate per-card
// cardType slugs upstream via modern-master-strike — having a permissive load
// path now means Phase 2 won't require a registry-side schema change.
export type CardType = string;

// ── Registry-viewer public config (apps/registry-viewer/public/registry-config.json) ──
// why: distinct from RegistryConfigSchema (R2 set-abbreviation artifact).
// Object shape consumed by the viewer at boot to locate metadata and optional
// rulebook PDF. rulebookPdfUrl is optional so WP-082 can add it before, after,
// or alongside EC-108 without schema churn.
export const ViewerConfigSchema = z
  .object({
    metadataBaseUrl: z.string().url(),
    eagerLoad: z.array(z.string().min(2).max(10)).optional(),
    rulebookPdfUrl: z.string().url().optional(),
  })
  .strict();

export type ViewerConfig = z.infer<typeof ViewerConfigSchema>;

// ── Themes directory index (R2 /themes/index.json) ────────────────────────────
// why: root manifest of theme filenames; if malformed, the Themes subsystem
// is considered unavailable and must fail fast. Individual theme failures are
// non-fatal (warn + skip) because one bad theme must not hide the rest.
export const ThemeIndexSchema = z.array(z.string().regex(/\.json$/, "theme index entries must end in .json"));

export type ThemeIndex = z.infer<typeof ThemeIndexSchema>;
