/**
 * impl/httpRegistry.ts
 * Loads data from https://images.barefootbetters.com/metadata/
 *
 * Fetches:
 *   {metadataBaseUrl}/metadata/sets.json          → set index
 *   {metadataBaseUrl}/metadata/{abbr}.json        → full set data (on demand)
 */

import {
  SetIndexEntrySchema,
  SetDataSchema,
} from "../schema.js";
import {
  flattenSet,
  applyQuery,
  buildHealthReport,
} from "../shared.js";
import type {
  CardRegistry,
  SetIndexEntry,
  SetData,
  Hero,
  FlatCard,
  CardQuery,
  RegistryInfo,
  HealthReport,
  HttpRegistryOptions,
  PhysicalCard,
} from "../types/index.js";

/**
 * Creates a CardRegistry that loads data over HTTP from an R2-compatible
 * metadata endpoint. Fetches the set index eagerly; individual set data
 * is loaded according to the `eagerLoad` option.
 *
 * @param options - Base URL and optional eager-load list.
 * @returns A populated CardRegistry.
 * @throws If the set index fetch fails (HTTP error).
 */
export async function createRegistryFromHttp(
  options: HttpRegistryOptions
): Promise<CardRegistry> {
  const base = options.metadataBaseUrl.replace(/\/$/, "");
  const errors: Array<{ setAbbr?: string; code: string; message: string }> = [];

  // ── 1. Load set index ──────────────────────────────────────────────────────
  // why: sets.json is the set index ({ id, abbr, pkgId, slug, name, releaseDate, type }).
  // card-types.json is the card-type taxonomy ({ slug, label, emoji?, order, parentType })
  // consumed by the registry-viewer ribbon under WP-086 — incompatible shape with
  // SetIndexEntrySchema. Fetching card-types.json here would silently produce zero sets
  // because no entries match (missing abbr and releaseDate). card-types.json was deleted
  // by WP-084 (2026-04-21) and reintroduced by WP-086 (2026-04-29) with the new shape;
  // this educational comment is retained because the silent-failure pattern is independent
  // of which specific file is involved — any auxiliary metadata file with a non-overlapping
  // shape will trigger the same zero-results silent failure if fetched at this seam.
  const indexUrl = `${base}/metadata/sets.json`;
  const indexResponse = await fetch(indexUrl);
  if (!indexResponse.ok) {
    throw new Error(
      `Failed to fetch set index from ${indexUrl}: HTTP ${indexResponse.status} ${indexResponse.statusText}.`
    );
  }
  const rawIndex: unknown = await indexResponse.json();
  const setIndex: SetIndexEntry[] = [];

  // why: a non-array payload (e.g. an object or null from a misconfigured
  // endpoint) would silently produce zero sets with no error recorded.
  // Treating this as a hard error makes the failure visible immediately.
  if (!Array.isArray(rawIndex)) {
    throw new Error(
      `Set index from ${indexUrl} is not a JSON array (received ${typeof rawIndex}). ` +
      `Verify the endpoint returns the sets.json array, not card-types.json or another file.`
    );
  }

  for (const rawEntry of rawIndex) {
    const result = SetIndexEntrySchema.safeParse(rawEntry);
    if (result.success) {
      setIndex.push(result.data);
    } else {
      errors.push({
        code: "SET_INDEX_INVALID",
        message: result.error.issues.map((issue) => issue.message).join("; "),
      });
    }
  }

  // Map abbr → SetIndexEntry for fast lookup
  const setIndexMap = new Map<string, SetIndexEntry>(
    setIndex.map((entry) => [entry.abbr, entry])
  );

  // ── 2. Eagerly load requested sets ─────────────────────────────────────────
  const loadedSets = new Map<string, SetData>();

  const toLoad = options.eagerLoad ?? [];
  const abbrsToLoad =
    toLoad.includes("*")
      ? setIndex.map((entry) => entry.abbr)
      : toLoad;

  await Promise.all(
    abbrsToLoad.map(async (abbr) => {
      try {
        const set = await fetchSet(base, abbr);
        loadedSets.set(abbr, set);
      } catch (error) {
        errors.push({
          setAbbr: abbr,
          code:    "SET_FETCH_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })
  );

  // ── 3. Build flat card list from loaded sets ───────────────────────────────
  // why: flat cards are rebuilt on every call rather than cached because the
  // loaded set map can grow (via future lazy-load support). Rebuilding avoids
  // stale-cache bugs at the cost of re-flattening on each access — acceptable
  // for the registry's read-heavy, infrequent-call usage pattern.
  function rebuildFlatCards(): FlatCard[] {
    const allCards: FlatCard[] = [];
    for (const [abbr, set] of loadedSets) {
      const meta = setIndexMap.get(abbr);
      allCards.push(...flattenSet(set, meta?.name ?? abbr));
    }
    return allCards;
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

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    /** @returns High-level counts for the registry. */
    info(): RegistryInfo {
      const flatCards = rebuildFlatCards();
      let totalHeroes = 0;
      for (const set of loadedSets.values()) {
        totalHeroes += set.heroes.length;
      }
      return {
        totalSets:       setIndex.length,
        totalHeroes,
        totalCards:      flatCards.length,
        loadedSetAbbrs:  [...loadedSets.keys()],
        metadataBaseUrl: base,
      };
    },

    /** @returns All set index entries loaded from sets.json. */
    listSets(): SetIndexEntry[] {
      return setIndex;
    },

    /** @returns Full data for one set, or undefined if not loaded. */
    getSet(abbr: string): SetData | undefined {
      return loadedSets.get(abbr);
    },

    /** @returns All heroes across all loaded sets. */
    listHeroes(): Hero[] {
      return [...loadedSets.values()].flatMap((set) => set.heroes);
    },

    /** @returns Flat list of all cards across all loaded sets. */
    listCards(): FlatCard[] {
      return rebuildFlatCards();
    },

    /** @returns Flat cards matching the given query filters. */
    query(q: CardQuery): FlatCard[] {
      return applyQuery(rebuildFlatCards(), q);
    },

    /** @returns Health / validation report including any parse errors. */
    validate(): HealthReport {
      return buildHealthReport(setIndex, [...loadedSets.values()], errors);
    },

    /** @returns The PhysicalCard owning the given (heroSlug, sideSlug), or undefined. */
    getPhysicalCardForSide(heroSlug: string, sideSlug: string): PhysicalCard | undefined {
      return sideToPhysicalCard.get(`${heroSlug}/${sideSlug}`);
    },
  };
}

// ── Internal helper ───────────────────────────────────────────────────────────

/**
 * Fetches and validates a single per-set card data file from the R2 endpoint.
 *
 * @param base - The base URL (without trailing slash).
 * @param abbr - The set abbreviation (e.g., "core", "mdns").
 * @returns The validated SetData.
 * @throws If the HTTP request fails or the response does not match SetDataSchema.
 */
async function fetchSet(base: string, abbr: string): Promise<SetData> {
  const setUrl = `${base}/metadata/${abbr}.json`;
  const response = await fetch(setUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch set "${abbr}" from ${setUrl}: HTTP ${response.status} ${response.statusText}.`
    );
  }
  const raw: unknown = await response.json();
  const result = SetDataSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Set "${abbr}" failed schema validation: ` +
      result.error.issues.map((issue) => `[${issue.path.join(".")}] ${issue.message}`).join("; ")
    );
  }
  return result.data;
}
