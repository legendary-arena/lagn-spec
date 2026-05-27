/**
 * cardPatternsClient.ts — Fetches the four card mechanical pattern taxonomies
 * (hero / villain / henchman / mastermind) and their per-entity assignments
 * from R2 for the registry viewer (WP-184).
 *
 * Eight JSON files at {metadataBaseUrl}/metadata/:
 *   /metadata/hero-patterns.json              — Array<CardPattern>
 *   /metadata/hero-pattern-assignments.json   — Record<string, HeroPatternSlug>
 *   /metadata/villain-patterns.json           — Array<CardPattern>
 *   /metadata/villain-pattern-assignments.json — Record<string, VillainPatternSlug>
 *   /metadata/henchman-patterns.json          — Array<CardPattern>
 *   /metadata/henchman-pattern-assignments.json — Record<string, HenchmanPatternSlug>
 *   /metadata/mastermind-patterns.json        — Array<CardPattern>
 *   /metadata/mastermind-pattern-assignments.json — Record<string, MastermindPatternSlug>
 *
 * Singleton-cached, non-blocking at the boundary. HTTP or schema failure for
 * any single taxonomy resolves to empty (never throws) so other taxonomies
 * continue to load. App.vue hides pattern UI elements per-taxonomy when the
 * corresponding data is empty.
 *
 * Model: schemeTwistClient.ts (WP-183) — same singleton + safeParse + non-blocking
 * pattern, extended to four parallel taxonomies via Promise.allSettled.
 */

// why: import from the `@legendary-arena/registry/schema` subpath rather
// than the barrel, per D-8601. The narrow subpath has zero Node-module
// dependencies; the barrel pulls in a Node-only local-file registry
// factory that breaks the browser build.
import {
  CardPatternsIndexSchema,
  HeroPatternAssignmentsSchema,
  VillainPatternAssignmentsSchema,
  HenchmanPatternAssignmentsSchema,
  MastermindPatternAssignmentsSchema,
  type CardPattern,
} from "@legendary-arena/registry/schema";
import { devLog } from "./devLog";

export type PatternTaxonomyKey = "hero" | "villain" | "henchman" | "mastermind";

export interface CardPatternsBundle {
  patternsByType: Record<PatternTaxonomyKey, CardPattern[]>;
  assignmentsByType: Record<PatternTaxonomyKey, Map<string, string>>;
}

const ASSIGNMENT_SCHEMA_BY_TYPE = {
  hero:       HeroPatternAssignmentsSchema,
  villain:    VillainPatternAssignmentsSchema,
  henchman:   HenchmanPatternAssignmentsSchema,
  mastermind: MastermindPatternAssignmentsSchema,
} as const;

const TAXONOMY_KEYS: readonly PatternTaxonomyKey[] = [
  "hero", "villain", "henchman", "mastermind",
];

let _bundlePromise: Promise<CardPatternsBundle> | null = null;

/**
 * Fetches all 8 pattern taxonomy files in parallel and returns a bundle of
 * pattern definitions + assignment maps keyed by taxonomy type.
 *
 * Singleton-cached. Non-blocking per taxonomy: a failed fetch for one
 * taxonomy resolves to [] / new Map() for that taxonomy only; the other
 * three continue to load. The implementation never throws.
 */
export function getCardPatterns(metadataBaseUrl: string): Promise<CardPatternsBundle> {
  if (_bundlePromise) return _bundlePromise;
  _bundlePromise = (async () => {
    const startedAt = performance.now();
    devLog("cardPatterns", "bundle load start", { baseUrl: metadataBaseUrl });

    const taxonomyTasks: Array<Promise<{
      taxonomy: PatternTaxonomyKey;
      patterns: CardPattern[];
      assignments: Map<string, string>;
    }>> = TAXONOMY_KEYS.map((taxonomy) => loadOneTaxonomy(metadataBaseUrl, taxonomy));

    const settled = await Promise.allSettled(taxonomyTasks);

    const patternsByType = {} as Record<PatternTaxonomyKey, CardPattern[]>;
    const assignmentsByType = {} as Record<PatternTaxonomyKey, Map<string, string>>;
    for (const key of TAXONOMY_KEYS) {
      patternsByType[key] = [];
      assignmentsByType[key] = new Map();
    }

    for (let index = 0; index < settled.length; index++) {
      const result = settled[index]!;
      const taxonomy = TAXONOMY_KEYS[index]!;
      if (result.status === "fulfilled") {
        patternsByType[taxonomy] = result.value.patterns;
        assignmentsByType[taxonomy] = result.value.assignments;
      } else {
        // why: loadOneTaxonomy never throws; this branch is defensive only
        // (Promise.allSettled "rejected" should be unreachable). Logging
        // preserves diagnostic parity if it ever does fire.
        devLog("cardPatterns", "taxonomy task rejected (unexpected)", {
          taxonomy,
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    devLog("cardPatterns", "bundle load complete", {
      baseUrl: metadataBaseUrl,
      durationMs: Math.round(performance.now() - startedAt),
      heroPatterns: patternsByType.hero.length,
      heroAssignments: assignmentsByType.hero.size,
      villainPatterns: patternsByType.villain.length,
      villainAssignments: assignmentsByType.villain.size,
      henchmanPatterns: patternsByType.henchman.length,
      henchmanAssignments: assignmentsByType.henchman.size,
      mastermindPatterns: patternsByType.mastermind.length,
      mastermindAssignments: assignmentsByType.mastermind.size,
    });

    return { patternsByType, assignmentsByType };
  })();
  return _bundlePromise;
}

async function loadOneTaxonomy(
  metadataBaseUrl: string,
  taxonomy: PatternTaxonomyKey,
): Promise<{ taxonomy: PatternTaxonomyKey; patterns: CardPattern[]; assignments: Map<string, string> }> {
  const [patterns, assignments] = await Promise.all([
    loadPatternsFile(metadataBaseUrl, taxonomy),
    loadAssignmentsFile(metadataBaseUrl, taxonomy),
  ]);
  return { taxonomy, patterns, assignments };
}

async function loadPatternsFile(
  metadataBaseUrl: string,
  taxonomy: PatternTaxonomyKey,
): Promise<CardPattern[]> {
  const url = `${metadataBaseUrl}/metadata/${taxonomy}-patterns.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      devLog("cardPatterns", "patterns load failed", {
        taxonomy,
        status: response.status,
        message: `HTTP ${response.status}`,
      });
      return [];
    }
    const rawPayload = await response.json();
    const result = CardPatternsIndexSchema.safeParse(rawPayload);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      console.warn(
        `[card-patterns] Rejected ${taxonomy}-patterns.json from ${url}: ${path} — ${issue.message}. ` +
        `${taxonomy} pattern filter and badges will be disabled until data is corrected.`,
      );
      return [];
    }
    // why: drift guard — pattern slugs must be unique within a taxonomy.
    // Not expressible in Zod (cross-element reference); enforced post-parse.
    // Duplicate slugs warn once per slug and the second-and-later entries
    // are dropped.
    const seenSlugs = new Set<string>();
    const seenDuplicates = new Set<string>();
    const filtered: CardPattern[] = [];
    for (const entry of result.data) {
      if (seenSlugs.has(entry.slug)) {
        if (!seenDuplicates.has(entry.slug)) {
          seenDuplicates.add(entry.slug);
          console.warn(
            `[card-patterns] Duplicate pattern slug in ${taxonomy}-patterns.json: ${entry.slug}. ` +
            `Second-and-later entries dropped; fix data/metadata/${taxonomy}-patterns.json.`,
          );
        }
        continue;
      }
      seenSlugs.add(entry.slug);
      filtered.push(entry);
    }
    return filtered;
  } catch (error) {
    devLog("cardPatterns", "patterns load failed", {
      taxonomy,
      message: error instanceof Error ? error.message : String(error),
    });
    // why: never throw — empty patterns hides the filter chip ribbon and
    // badges for this taxonomy only; other taxonomies and the card view
    // stay fully functional.
    return [];
  }
}

async function loadAssignmentsFile(
  metadataBaseUrl: string,
  taxonomy: PatternTaxonomyKey,
): Promise<Map<string, string>> {
  const url = `${metadataBaseUrl}/metadata/${taxonomy}-pattern-assignments.json`;
  const schema = ASSIGNMENT_SCHEMA_BY_TYPE[taxonomy];
  try {
    const response = await fetch(url);
    if (!response.ok) {
      devLog("cardPatterns", "assignments load failed", {
        taxonomy,
        status: response.status,
        message: `HTTP ${response.status}`,
      });
      return new Map();
    }
    const rawPayload = await response.json();
    // why: the JSON files allow a top-level `_unassigned` documentation block
    // (per WP-184 §Coverage Contract). Strip it before parsing so the strict
    // per-taxonomy z.enum value type doesn't reject the documentation object.
    const sanitized = stripUnassignedBlock(rawPayload);
    const result = schema.safeParse(sanitized);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      console.warn(
        `[card-patterns] Rejected ${taxonomy}-pattern-assignments.json from ${url}: ${path} — ${issue.message}. ` +
        `${taxonomy} pattern badges and filtering will be disabled until data is corrected.`,
      );
      return new Map();
    }
    // why: convert JSON object to Map once at load time for O(1) lookups
    // during flattenSet enrichment. No per-render recomputation.
    return new Map<string, string>(Object.entries(result.data));
  } catch (error) {
    devLog("cardPatterns", "assignments load failed", {
      taxonomy,
      message: error instanceof Error ? error.message : String(error),
    });
    // why: never throw — empty Map means no badges and no filtering for
    // this taxonomy, but card view stays fully functional.
    return new Map();
  }
}

function stripUnassignedBlock(rawPayload: unknown): unknown {
  if (typeof rawPayload !== "object" || rawPayload === null || Array.isArray(rawPayload)) {
    return rawPayload;
  }
  const record = rawPayload as Record<string, unknown>;
  if (!("_unassigned" in record)) return rawPayload;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "_unassigned") continue;
    copy[key] = value;
  }
  return copy;
}
