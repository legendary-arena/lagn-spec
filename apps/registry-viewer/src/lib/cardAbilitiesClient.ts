/**
 * cardAbilitiesClient.ts — Fetches the card-abilities effect-tag taxonomy
 * JSON from R2 and computes a per-card effect-tag index for the registry
 * viewer.
 *
 * Card-abilities data is stored alongside other registry metadata at
 * `{metadataBaseUrl}/metadata/card-abilities.json` — an array of
 * CardAbilityEntry (slug, label, emoji?, order, matchers). Each matcher is
 * a regex pattern applied to the card's `abilities[]` strings; cards whose
 * abilities match any of an entry's matcher patterns are tagged with that
 * entry's slug.
 *
 * Shape and discipline mirror cardTypesClient.ts line-for-line for the
 * fetcher half (module-scope singleton promise, devLog instrumentation,
 * .safeParse at the fetch boundary, dot-joined-path warning, terminal
 * try/catch swallow). Differences from cardTypesClient.ts:
 *   - The post-parse relational invariant is duplicate-slug detection
 *     (parallel to cardTypes' orphan-parentType filter).
 *   - An additional pure helper (buildAbilityTagIndex) is exported because
 *     cardAbilities have a per-card derived form that cardTypes do not.
 *
 * Schema authority lives at `packages/registry/src/schema.ts`; this module
 * imports `CardAbilitiesIndexSchema` and calls `.safeParse` so a malformed
 * R2 publish degrades to an empty-array fallback (chip ribbon hidden via
 * the v-if="taxonomy.length > 0" guard on AbilityEffectFilter.vue's outer
 * wrapper). This fetcher never throws — fully non-blocking at the boundary.
 *
 * The companion buildAbilityTagIndex helper is pure: no I/O, no module-scope
 * reads, no throws, no input mutation. Each matcher's regex is compiled once
 * per call and reused across every card scanned. Identical inputs produce
 * identical outputs.
 */

// why: import the schema from the `@legendary-arena/registry/schema`
// subpath rather than the barrel, per D-8601. The narrow subpath has zero
// Node-module dependencies; the barrel pulls in a Node-only local-file
// registry factory that breaks the browser build at the Rollup resolve
// step. Established by glossaryClient.ts (WP-082) + themeClient.ts (WP-083),
// reaffirmed by cardTypesClient.ts (WP-086).
import {
  CardAbilitiesIndexSchema,
  type CardAbilityEntry,
} from "@legendary-arena/registry/schema";
import type { FlatCard } from "../registry/types/types-index";
import { devLog } from "./devLog";

// ── Singleton loader ────────────────────────────────────────────────────────

let _promise: Promise<CardAbilityEntry[]> | null = null;

/**
 * Fetches the card-abilities effect-tag taxonomy from R2. Results are cached
 * for the session.
 *
 * Non-blocking at the boundary: HTTP failure or schema rejection resolves to
 * `[]`, never throws. App.vue hides the chip ribbon via the
 * v-if="abilitiesTaxonomy.length > 0" guard when this returns empty.
 *
 * @param metadataBaseUrl - The base URL for R2 metadata (same as card data).
 */
export function getCardAbilities(metadataBaseUrl: string): Promise<CardAbilityEntry[]> {
  if (_promise) return _promise;
  _promise = (async () => {
    const url = `${metadataBaseUrl}/metadata/card-abilities.json`;
    const startedAt = performance.now();
    devLog("cardAbilities", "load start", { baseUrl: metadataBaseUrl });
    try {
      const response = await fetch(url);
      if (!response.ok) {
        devLog("cardAbilities", "load failed", {
          baseUrl:    metadataBaseUrl,
          durationMs: Math.round(performance.now() - startedAt),
          status:     response.status,
          message:    `HTTP ${response.status}`,
        });
        // why: empty-array fallback rather than throw. The chip ribbon has
        // a degraded-mode invisibility guard (v-if on the outer wrapper);
        // an empty taxonomy hides the ribbon and the card view stays
        // fully functional. Mirrors cardTypesClient.ts:67–71.
        return [];
      }
      const rawPayload = await response.json();
      const result = CardAbilitiesIndexSchema.safeParse(rawPayload);
      if (!result.success) {
        const issue = result.error.issues[0]!;
        // why: dot-joined path keeps viewer logs operator-readable; default
        // ["0","matchers","0","type"]-style array paths are noisy. Mirrors
        // cardTypesClient.ts:77–80 verbatim.
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        console.warn(
          `[CardAbilities] Rejected card-abilities.json from ${url}: ${path} — ${issue.message}. ` +
          "Effect chip ribbon will stay hidden until data is corrected.",
        );
        return [];
      }
      // why: relational invariant — every entry's slug is unique within the
      // taxonomy. Not expressible in Zod (cross-element reference); enforced
      // post-parse here. Duplicate slugs warn (one dedup'd warn per offending
      // slug) and the second-and-later entries are dropped from the returned
      // array. Parallel to cardTypesClient.ts's orphan-parentType filter
      // (cardTypesClient.ts:88–110).
      const seenSlugs = new Set<string>();
      const seenDuplicates = new Set<string>();
      const filtered: CardAbilityEntry[] = [];
      for (const entry of result.data) {
        if (seenSlugs.has(entry.slug)) {
          if (!seenDuplicates.has(entry.slug)) {
            seenDuplicates.add(entry.slug);
            console.warn(
              `[CardAbilities] Duplicate slug: ${entry.slug}. ` +
              "Second-and-later entries dropped from the chip ribbon; " +
              "fix data/metadata/card-abilities.json so every entry has a unique slug.",
            );
          }
          continue;
        }
        seenSlugs.add(entry.slug);
        filtered.push(entry);
      }
      devLog("cardAbilities", "load complete", {
        baseUrl:               metadataBaseUrl,
        durationMs:            Math.round(performance.now() - startedAt),
        entryCount:            filtered.length,
        droppedDuplicateCount: result.data.length - filtered.length,
      });
      return filtered;
    } catch (error) {
      devLog("cardAbilities", "load failed", {
        baseUrl:    metadataBaseUrl,
        durationMs: Math.round(performance.now() - startedAt),
        message:    error instanceof Error ? error.message : String(error),
      });
      // why: never throw — the chip ribbon has a degraded-mode
      // invisibility guard (v-if on the outer wrapper); an empty taxonomy
      // hides the ribbon and the card view stays fully functional.
      // Mirrors cardTypesClient.ts:118–129.
      return [];
    }
  })();
  return _promise;
}

/**
 * Computes the per-card effect-tag index from a taxonomy and a card list.
 *
 * For each card, scans every ability text against every matcher regex.
 * If any of an entry's matcher patterns matches any of a card's ability
 * texts, the entry's slug is added to that card's tag set.
 *
 * Pure helper: no I/O, no module-scope reads, no throws, no input mutation.
 * Identical inputs produce identical outputs. Each matcher's regex is
 * compiled once per call and reused across every card.
 *
 * @param cards    - The flat card list from `registry.listCards()`.
 * @param taxonomy - The effect-tag taxonomy from `getCardAbilities()`.
 * @returns A Map keyed by `card.key` (the `${abbr}-${cardType}-${slug}` form
 *          established by WP-122). Cards with no matching tags have no
 *          entry in the Map (callers treat absent === empty).
 */
export function buildAbilityTagIndex(
  cards: readonly FlatCard[],
  taxonomy: readonly CardAbilityEntry[],
): Map<string, Set<string>> {
  // why: compile each matcher's regex once per call rather than once per
  // card. With ~3000 cards × ~10 matchers × 1–3 patterns each, per-card
  // compilation would mean ~90,000 RegExp constructors per session;
  // per-call compilation reduces that to ~30. Default flags = "i"
  // (case-insensitive) when absent because card-text capitalization is
  // inconsistent ("KO" / "Ko" / "ko"); an explicit empty-string flags
  // field is respected as opt-out for case-sensitive matching.
  interface CompiledMatcher {
    slug:  string;
    regex: RegExp;
  }
  const compiled: CompiledMatcher[] = [];
  for (const entry of taxonomy) {
    for (const matcher of entry.matchers) {
      const flags = matcher.flags ?? "i";
      compiled.push({
        slug:  entry.slug,
        regex: new RegExp(matcher.pattern, flags),
      });
    }
  }

  const index = new Map<string, Set<string>>();
  for (const card of cards) {
    let cardTags: Set<string> | null = null;
    for (const abilityText of card.abilities) {
      for (const matcher of compiled) {
        if (matcher.regex.test(abilityText)) {
          if (cardTags === null) cardTags = new Set<string>();
          cardTags.add(matcher.slug);
        }
      }
    }
    if (cardTags !== null) {
      index.set(card.key, cardTags);
    }
  }
  return index;
}
