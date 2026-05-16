/**
 * Snapshot client — fetches leaderboard data from R2 public-read URLs.
 *
 * Type definitions mirror apps/server/src/legends/legends.types.ts exactly.
 * DO NOT import from @legendary-arena/server (layer boundary violation).
 */

// ---------------------------------------------------------------------------
// Mirrored types from WP-142 legends.types.ts
// ---------------------------------------------------------------------------

/** A single row in a global-top snapshot board. */
export interface GlobalTopSnapshotEntry {
  readonly handle: string;
  readonly rank: number;
  readonly scenarioKey: string;
  readonly score: number;
}

/** A single row in a per-scenario snapshot board. */
export interface ScenarioSnapshotEntry {
  readonly handle: string;
  readonly rank: number;
  readonly score: number;
}

/** A single board snapshot written to R2 at `legends/v1/<board>.json`. */
export interface LegendsSnapshotBoard {
  readonly board: string;
  readonly entries: readonly (GlobalTopSnapshotEntry | ScenarioSnapshotEntry)[];
  readonly rowCount: number;
  readonly schemaVersion: 1;
}

/** Manifest written to `legends/v1/manifest.json`. */
export interface LegendsManifest {
  readonly boards: readonly string[];
  readonly generatedAt: string;
  readonly schemaVersion: 1;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

/** Returns the R2 base URL from the build-time env var. */
function getBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_LEGENDS_R2_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "VITE_LEGENDS_R2_BASE_URL is not set. Configure this environment variable to point at the R2 public-read URL.",
    );
  }
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

/** Returns the manifest poll interval from the build-time env var. */
export function getPollIntervalMs(): number {
  const override = import.meta.env.VITE_LEGENDS_POLL_INTERVAL_MS;
  if (override) {
    const parsed = Number(override);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cachedManifest: LegendsManifest | null = null;
const boardCache = new Map<string, LegendsSnapshotBoard>();

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Fetches JSON from an R2 URL with a timeout.
 *
 * @throws on network error, non-OK status, or timeout
 */
async function fetchJson<T>(url: string): Promise<T> {
  // why: 10-second timeout prevents a stalled R2 edge from blocking the UI indefinitely
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Snapshot fetch failed for ${url}: HTTP ${response.status} ${response.statusText}`,
      );
    }
    const data = (await response.json()) as T;
    console.log(`[legends] Fetched ${url} (${response.status})`);
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetches the manifest from R2. Always hits the network (no-cache manifest). */
export async function fetchManifest(): Promise<LegendsManifest> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}legends/v1/manifest.json`;
  const manifest = await fetchJson<LegendsManifest>(url);
  cachedManifest = manifest;
  return manifest;
}

/**
 * Fetches a single board snapshot from R2.
 * Returns a cached copy if the manifest has not changed since the last fetch.
 */
export async function fetchBoard(
  boardName: string,
): Promise<LegendsSnapshotBoard> {
  const cached = boardCache.get(boardName);
  if (cached) {
    return cached;
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}legends/v1/${boardName}.json`;
  const board = await fetchJson<LegendsSnapshotBoard>(url);
  boardCache.set(boardName, board);
  console.log(
    `[legends] Board "${boardName}" cached (${board.rowCount} rows)`,
  );
  return board;
}

/**
 * Fetches all boards listed in the manifest.
 * Returns a Map of board name to snapshot data.
 * Individual board failures are caught and logged; other boards still load.
 */
export async function fetchAllBoards(
  manifest: LegendsManifest,
): Promise<Map<string, LegendsSnapshotBoard>> {
  const results = new Map<string, LegendsSnapshotBoard>();
  const fetchPromises = manifest.boards.map(async (boardName) => {
    try {
      const board = await fetchBoard(boardName);
      results.set(boardName, board);
    } catch (error) {
      console.error(
        `[legends] Failed to fetch board "${boardName}":`,
        error,
      );
    }
  });
  await Promise.all(fetchPromises);
  return results;
}

/**
 * Invalidates all cached board data. Called when `manifest.generatedAt`
 * changes, indicating the publisher wrote fresh snapshots.
 */
export function invalidateBoardCache(): void {
  boardCache.clear();
  console.log("[legends] Board cache invalidated");
}

/** Returns the most recently fetched manifest, or null if none. */
export function getCachedManifest(): LegendsManifest | null {
  return cachedManifest;
}

/**
 * Checks whether the manifest has changed by comparing `generatedAt`.
 * If changed, invalidates the board cache so boards are re-fetched.
 * Returns the new manifest.
 */
export async function pollManifest(): Promise<LegendsManifest> {
  const previousGeneratedAt = cachedManifest?.generatedAt ?? null;
  const manifest = await fetchManifest();

  if (
    previousGeneratedAt !== null &&
    manifest.generatedAt !== previousGeneratedAt
  ) {
    invalidateBoardCache();
    console.log(
      `[legends] Manifest changed: ${previousGeneratedAt} -> ${manifest.generatedAt}`,
    );
  }

  return manifest;
}

/**
 * Derives a human-readable display name from a board slug.
 * Example: "by-scheme" -> "By Scheme", "overall" -> "Overall"
 */
export function boardDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
