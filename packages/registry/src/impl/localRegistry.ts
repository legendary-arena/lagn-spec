/**
 * impl/localRegistry.ts
 * Loads set data from the local filesystem (for CI validation and dev tools).
 * Node.js only — not included in the browser bundle.
 *
 * Directory layout expected:
 *   metadataDir/     (default: data/metadata/)
 *     sets.json          ← set index (id, abbr, name, releaseDate, etc.)
 *   cardsDir/        (default: data/cards/)
 *     core.json          ← per-set card data
 *     dkcy.json
 *     ... (one file per set abbreviation)
 */

import { readFile, readdir } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { SetIndexEntrySchema, SetDataSchema } from "../schema.js";
import { flattenSet, applyQuery, buildHealthReport } from "../shared.js";
import type {
  CardRegistry,
  SetIndexEntry,
  SetData,
  Hero,
  FlatCard,
  CardQuery,
  RegistryInfo,
  HealthReport,
  PhysicalCard,
} from "../types/index.js";

export interface LocalRegistryOptions {
  /** Path to the metadata lookup folder containing sets.json. */
  metadataDir: string;
  /**
   * Path to the folder containing per-set card JSON files ({abbr}.json).
   * Defaults to a sibling "cards/" directory next to metadataDir.
   * Example: if metadataDir is "data/metadata", cardsDir defaults to "data/cards".
   */
  cardsDir?: string;
}

export async function createRegistryFromLocalFiles(
  options: LocalRegistryOptions
): Promise<CardRegistry> {
  const metadataDir = resolve(options.metadataDir);

  // why: cardsDir defaults to a sibling "cards/" directory so the caller
  // only needs to specify metadataDir — the most common case
  const cardsDir = resolve(
    options.cardsDir ?? join(metadataDir, "..", "cards")
  );

  const errors: Array<{ setAbbr?: string; code: string; message: string }> = [];

  // ── Load set index from sets.json ──────────────────────────────────────────
  // why: sets.json is the canonical set index (id, abbr, name, releaseDate, type).
  let setIndex: SetIndexEntry[] = [];
  try {
    const raw: unknown = JSON.parse(
      await readFile(join(metadataDir, "sets.json"), "utf8")
    );
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const result = SetIndexEntrySchema.safeParse(item);
        if (result.success) {
          setIndex.push(result.data);
        } else {
          errors.push({
            code:    "SET_INDEX_INVALID",
            message: result.error.issues.map((i) => i.message).join("; "),
          });
        }
      }
    }
  } catch (err) {
    errors.push({
      code:    "INDEX_FILE_ERROR",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Load all per-set card JSON files from cardsDir ─────────────────────────
  // why: cardsDir contains only card set files — no filtering is needed.
  // The lookup file (sets.json) lives in metadataDir.
  const loadedSets    = new Map<string, SetData>();
  const setIndexByAbbr = new Map(setIndex.map((s) => [s.abbr, s]));

  let cardFiles: string[] = [];
  try {
    cardFiles = (await readdir(cardsDir)).filter(
      (f) => extname(f) === ".json"
    );
  } catch (err) {
    errors.push({
      code:    "CARDS_DIR_ERROR",
      message: `Could not read cards directory "${cardsDir}": ` +
               (err instanceof Error ? err.message : String(err)),
    });
  }

  for (const file of cardFiles) {
    const abbr = file.replace(".json", "");
    try {
      const raw: unknown = JSON.parse(
        await readFile(join(cardsDir, file), "utf8")
      );
      const result = SetDataSchema.safeParse(raw);
      if (result.success) {
        loadedSets.set(abbr, result.data);
      } else {
        errors.push({
          setAbbr: abbr,
          code:    "SET_SCHEMA_INVALID",
          message: result.error.issues
            .map((i) => `[${i.path.join(".")}] ${i.message}`)
            .join("; "),
        });
      }
    } catch (err) {
      errors.push({
        setAbbr: abbr,
        code:    "SET_FILE_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function rebuildFlatCards(): FlatCard[] {
    const all: FlatCard[] = [];
    for (const [abbr, set] of loadedSets) {
      const meta = setIndexByAbbr.get(abbr);
      all.push(...flattenSet(set, meta?.name ?? abbr));
    }
    return all;
  }

  // why: D-13806 — the sideToPhysicalCard map is a registry-internal cache
  // built once at load time from immutable input data. It is never persisted,
  // never serialized, and never written to PostgreSQL: regenerating it from
  // the registry data is always cheaper than caching it across boundaries.
  // why: namespaced compound key `<heroSlug>/<sideSlug>` is required, not
  // cosmetic — global uniqueness of a card slug across heroes is NOT
  // assumed (e.g., a slug like "night-vision" can recur under multiple
  // heroes in different sets). Keying on `sideSlug` alone would silently
  // collide.
  const sideToPhysicalCard = new Map<string, PhysicalCard>();
  for (const set of loadedSets.values()) {
    for (const hero of set.heroes) {
      for (const physicalCard of hero.physicalCards) {
        for (const sideSlug of physicalCard.sides) {
          sideToPhysicalCard.set(`${hero.slug}/${sideSlug}`, physicalCard);
        }
      }
    }
  }

  return {
    info(): RegistryInfo {
      return {
        totalSets:       setIndex.length,
        totalHeroes:     [...loadedSets.values()].reduce((n, s) => n + s.heroes.length, 0),
        totalCards:      rebuildFlatCards().length,
        loadedSetAbbrs:  [...loadedSets.keys()],
        metadataBaseUrl: metadataDir,
      };
    },

    listSets():           SetIndexEntry[]    { return setIndex; },
    getSet(abbr: string): SetData | undefined { return loadedSets.get(abbr); },
    listHeroes():         Hero[]             { return [...loadedSets.values()].flatMap((s) => s.heroes); },
    listCards():          FlatCard[]         { return rebuildFlatCards(); },
    query(q: CardQuery):  FlatCard[]         { return applyQuery(rebuildFlatCards(), q); },

    validate(): HealthReport {
      return buildHealthReport(setIndex, [...loadedSets.values()], errors);
    },

    getPhysicalCardForSide(heroSlug: string, sideSlug: string): PhysicalCard | undefined {
      return sideToPhysicalCard.get(`${heroSlug}/${sideSlug}`);
    },
  };
}
