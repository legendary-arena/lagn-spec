/**
 * schema.ts — loosened to match the full range of real Legendary set data
 */

import { z } from "zod";

// ── Set index entry — make optional fields truly optional ─────────────────────
export const SetIndexEntrySchema = z.object({
  id:          z.number().int().positive(),
  abbr:        z.string().min(1).max(10),
  pkgId:       z.number().int().positive().optional().nullable(),
  slug:        z.string().optional().nullable(),
  name:        z.string().min(1),
  releaseDate: z.string().optional().nullable(),
  type:        z.string().optional().nullable(),
});

// ── Hero class ────────────────────────────────────────────────────────────────
export const HeroClassSchema = z.enum([
  "covert", "instinct", "ranged", "strength", "tech",
]);

// ── Hero card — much more permissive ─────────────────────────────────────────
export const HeroCardSchema = z.object({
  name:        z.string().optional().nullable(),  // missing in some patch-merged cards
  displayName: z.string().optional().nullable(),
  slug:        z.string(),
  // rarity: accept 0,1,2,3 or any number — some sets use 0 or omit it
  rarity:      z.number().int().optional().nullable(),
  rarityLabel: z.string().optional().nullable(),
  // slot: optional — some sets omit it entirely
  slot:        z.number().int().min(1).optional().nullable(),
  hc:          HeroClassSchema.optional().nullable(),
  cost:        z.union([z.number(), z.string(), z.null()]).optional(),
  // attack/recruit: accept number OR string OR null — some sets use numbers
  attack:      z.union([z.string(), z.number(), z.null()]).optional(),
  recruit:     z.union([z.string(), z.number(), z.null()]).optional(),
  imageUrl:    z.string().url().optional().nullable(),
  abilities:   z.array(z.string()).optional().default([]),
  // why: per-card cardType override (Phase 2 of WP-086). Defaults to "hero"
  // in flattenSet when absent. Currently set only on S.H.I.E.L.D. Officer
  // Specials in shld.json so they appear under the SHIELD ribbon's
  // Officer-Special sub-chip rather than being miscounted as heroes.
  cardType:    z.string().optional(),
});

// ── Hero ──────────────────────────────────────────────────────────────────────
// why: D-14103 — physicalCards[] is passed through so flattenSet can
// resolve hero-card imageUrl from the physical card rather than the
// per-side card entry. The schema is permissive (z.unknown passthrough)
// because the registry package's PhysicalCardSchema is the authoritative
// validator; the viewer only reads id, imageUrl, and sides from entries.
export const HeroSchema = z.object({
  // id: optional — some sets omit it entirely, others use null
  id:    z.number().int().optional().nullable(),
  name:  z.string(),
  slug:  z.string(),
  team:  z.string().optional().nullable(),
  cards: z.array(HeroCardSchema),
  // why: WP-170 — declare cardCounts so SetDataSchema.safeParse() preserves it
  // through the parse boundary. Keyed by rarity label ("common"/"uncommon"/
  // "rare"); values are deck-copy counts. Optional+nullable because SHIELD
  // Officers and alt-art heroes don't carry it (count row omits per AND-
  // semantics). Engine-side schema lives at packages/registry/src/schema.ts;
  // viewer parses independently.
  cardCounts: z.record(z.string(), z.number().int().min(1)).optional().nullable(),
  physicalCards: z.array(z.object({
    id:       z.string(),
    count:    z.number().int().min(1),
    imageUrl: z.string(),
    sides:    z.array(z.string()),
  })).optional().default([]),
});

// ── Mastermind card — vAttack can be string, number, or null ──────────────────
export const MastermindCardSchema = z.object({
  name:      z.string(),
  slug:      z.string(),
  tactic:    z.boolean().optional(),
  vAttack:   z.union([z.string(), z.number(), z.null()]).optional(),
  imageUrl:  z.string().url().optional().nullable(),
  abilities: z.array(z.string()).optional().default([]),
});

// ── Mastermind ────────────────────────────────────────────────────────────────
export const MastermindSchema = z.object({
  id:          z.number().int().positive(),
  name:        z.string(),
  slug:        z.string(),
  alwaysLeads: z.array(z.string()).optional().default([]),
  vp:          z.number().int().optional().nullable(),
  cards:       z.array(MastermindCardSchema),
});

// ── Villain card — vp and vAttack are flexible ────────────────────────────────
export const VillainCardSchema = z.object({
  name:      z.string(),
  slug:      z.string(),
  vp:        z.union([z.string(), z.number(), z.null()]).optional(),
  vAttack:   z.union([z.string(), z.number(), z.null()]).optional(),
  imageUrl:  z.string().url().optional().nullable(),
  abilities: z.array(z.string()).optional().default([]),
  // why: WP-170 — declare copies so SetDataSchema.safeParse() preserves it
  // through the parse boundary. WP-167 published this on all 632 villain
  // cards (default 2, absent ⇒ 1). flattenSet applies the absent-⇒-1 default
  // at computation time; source data is treated read-only.
  copies:    z.number().int().min(1).optional(),
});

// ── Villain group ─────────────────────────────────────────────────────────────
export const VillainGroupSchema = z.object({
  id:    z.number().int().positive(),
  name:  z.string(),
  slug:  z.string(),
  ledBy: z.array(z.string()).optional().default([]),
  cards: z.array(VillainCardSchema),
});

// ── Scheme ────────────────────────────────────────────────────────────────────
export const SchemeSchema = z.object({
  id:       z.number().int().nullable(),   // null in some sets
  name:     z.string(),
  slug:     z.string(),
  imageUrl: z.string().url().optional().nullable(),
  cards:    z.array(z.object({
    abilities: z.array(z.string()).optional().default([]),
  })).optional().default([]),
});

// ── Full set file ─────────────────────────────────────────────────────────────
export const SetDataSchema = z.object({
  id:          z.number().int().positive(),
  abbr:        z.string(),
  exportName:  z.string().optional().nullable(),
  heroes:      z.array(HeroSchema).optional().default([]),
  masterminds: z.array(MastermindSchema).optional().default([]),
  villains:    z.array(VillainGroupSchema).optional().default([]),
  henchmen:    z.array(z.unknown()).optional().default([]),
  schemes:     z.array(SchemeSchema).optional().default([]),
  bystanders:  z.array(z.unknown()).optional().default([]),
  wounds:      z.array(z.unknown()).optional().default([]),
  other:       z.array(z.unknown()).optional().default([]),
});

// ── Search query ──────────────────────────────────────────────────────────────
export const CardQuerySchema = z.object({
  setAbbr:      z.string().optional(),
  heroClass:    HeroClassSchema.optional(),
  team:         z.string().optional(),
  nameContains: z.string().optional(),
  cardType:     z.string().optional(),
  cardTypes:    z.array(z.string()).optional(),
  rarity:       z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
