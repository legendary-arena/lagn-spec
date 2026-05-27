/**
 * schemeTwistClient.ts — Fetches scheme twist pattern taxonomy and per-scheme
 * assignments from R2 for the registry viewer.
 *
 * Two JSON files at {metadataBaseUrl}/metadata/:
 *   /metadata/scheme-twist-patterns.json    — Array<SchemeTwistPattern>
 *   /metadata/scheme-twist-assignments.json — Record<string, TwistPatternSlug>
 *
 * Singleton-cached, non-blocking at the boundary. HTTP or schema failure
 * resolves to empty (never throws). App.vue hides twist UI elements when
 * the data is empty.
 */

// why: import from the `@legendary-arena/registry/schema` subpath rather
// than the barrel, per D-8601. The narrow subpath has zero Node-module
// dependencies; the barrel pulls in a Node-only local-file registry
// factory that breaks the browser build.
import {
  SchemeTwistPatternsIndexSchema,
  SchemeTwistAssignmentsSchema,
  type SchemeTwistPattern,
} from "@legendary-arena/registry/schema";
import { devLog } from "./devLog";

// ── Singleton loaders ───────────────────────────────────────────────────────

let _patternsPromise: Promise<SchemeTwistPattern[]> | null = null;
let _assignmentsPromise: Promise<Map<string, string>> | null = null;

/**
 * Fetches the 8 scheme twist pattern definitions from R2. Singleton-cached.
 *
 * Non-blocking: HTTP failure or schema rejection resolves to [], never throws.
 */
export function getSchemeTwistPatterns(metadataBaseUrl: string): Promise<SchemeTwistPattern[]> {
  if (_patternsPromise) return _patternsPromise;
  _patternsPromise = (async () => {
    const url = `${metadataBaseUrl}/metadata/scheme-twist-patterns.json`;
    const startedAt = performance.now();
    devLog("schemeTwist", "patterns load start", { baseUrl: metadataBaseUrl });
    try {
      const response = await fetch(url);
      if (!response.ok) {
        devLog("schemeTwist", "patterns load failed", {
          baseUrl: metadataBaseUrl,
          durationMs: Math.round(performance.now() - startedAt),
          status: response.status,
          message: `HTTP ${response.status}`,
        });
        return [];
      }
      const rawPayload = await response.json();
      const result = SchemeTwistPatternsIndexSchema.safeParse(rawPayload);
      if (!result.success) {
        const issue = result.error.issues[0]!;
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        console.warn(
          `[scheme-twist] Rejected scheme-twist-patterns.json from ${url}: ${path} — ${issue.message}. ` +
          "Twist pattern filter and badges will be disabled until data is corrected.",
        );
        return [];
      }
      // why: drift guard — pattern slugs must be unique. Not expressible
      // in Zod (cross-element reference); enforced post-parse. Duplicate
      // slugs warn and the second-and-later entries are dropped.
      const seenSlugs = new Set<string>();
      const seenDuplicates = new Set<string>();
      const filtered: SchemeTwistPattern[] = [];
      for (const entry of result.data) {
        if (seenSlugs.has(entry.slug)) {
          if (!seenDuplicates.has(entry.slug)) {
            seenDuplicates.add(entry.slug);
            console.warn(
              `[scheme-twist] Duplicate pattern slug: ${entry.slug}. ` +
              "Second-and-later entries dropped; fix data/metadata/scheme-twist-patterns.json.",
            );
          }
          continue;
        }
        seenSlugs.add(entry.slug);
        filtered.push(entry);
      }
      devLog("schemeTwist", "patterns load complete", {
        baseUrl: metadataBaseUrl,
        durationMs: Math.round(performance.now() - startedAt),
        entryCount: filtered.length,
        droppedDuplicateCount: result.data.length - filtered.length,
      });
      return filtered;
    } catch (error) {
      devLog("schemeTwist", "patterns load failed", {
        baseUrl: metadataBaseUrl,
        durationMs: Math.round(performance.now() - startedAt),
        message: error instanceof Error ? error.message : String(error),
      });
      // why: never throw — the twist UI has degraded-mode guards (v-if on
      // pattern list length); empty patterns hides the filter ribbon and
      // badges. Card view stays fully functional.
      return [];
    }
  })();
  return _patternsPromise;
}

/**
 * Fetches the scheme-to-pattern assignments from R2. Singleton-cached.
 * Returns a Map<schemeExtId, patternSlug> for O(1) lookups during flattening.
 *
 * Non-blocking: HTTP failure or schema rejection resolves to empty Map, never throws.
 */
export function getSchemeTwistAssignments(metadataBaseUrl: string): Promise<Map<string, string>> {
  if (_assignmentsPromise) return _assignmentsPromise;
  _assignmentsPromise = (async () => {
    const url = `${metadataBaseUrl}/metadata/scheme-twist-assignments.json`;
    const startedAt = performance.now();
    devLog("schemeTwist", "assignments load start", { baseUrl: metadataBaseUrl });
    try {
      const response = await fetch(url);
      if (!response.ok) {
        devLog("schemeTwist", "assignments load failed", {
          baseUrl: metadataBaseUrl,
          durationMs: Math.round(performance.now() - startedAt),
          status: response.status,
          message: `HTTP ${response.status}`,
        });
        return new Map();
      }
      const rawPayload = await response.json();
      const result = SchemeTwistAssignmentsSchema.safeParse(rawPayload);
      if (!result.success) {
        const issue = result.error.issues[0]!;
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        console.warn(
          `[scheme-twist] Rejected scheme-twist-assignments.json from ${url}: ${path} — ${issue.message}. ` +
          "Twist pattern badges and filtering will be disabled until data is corrected.",
        );
        return new Map();
      }
      // why: convert JSON object to Map once at load time for O(1) lookups
      // during flattenSet enrichment. No per-render recomputation.
      const assignmentsMap = new Map<string, string>(Object.entries(result.data));
      devLog("schemeTwist", "assignments load complete", {
        baseUrl: metadataBaseUrl,
        durationMs: Math.round(performance.now() - startedAt),
        entryCount: assignmentsMap.size,
      });
      return assignmentsMap;
    } catch (error) {
      devLog("schemeTwist", "assignments load failed", {
        baseUrl: metadataBaseUrl,
        durationMs: Math.round(performance.now() - startedAt),
        message: error instanceof Error ? error.message : String(error),
      });
      // why: never throw — empty Map means no badges and no filtering, but
      // card view stays fully functional.
      return new Map();
    }
  })();
  return _assignmentsPromise;
}
