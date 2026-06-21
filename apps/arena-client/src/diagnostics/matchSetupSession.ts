/**
 * Session-scoped persistence of the INPUT match-setup composition the client
 * submitted at match creation, so the play-surface "Download diagnostics"
 * export can carry it alongside the live UIState snapshot.
 *
 * Why this exists: the client never receives the engine's raw `G` — only the
 * WP-089 playerView/UIState projection (see `client/bgioClient.ts`), and that
 * projection does not include the match's input config (scheme / mastermind /
 * groups / heroes + the four supply-pile counts). Without the input config a
 * diagnostics report shows the *live* supply (e.g. `bystandersCount: 0`) but
 * not what it *started* at, so it cannot distinguish "misconfigured to 1" from
 * "started at 30 and drained mid-game" — exactly the disambiguation the
 * Web-Shooters rescue bug needed. The lobby holds that input config at submit
 * time; this module stashes it so the play surface can read it back.
 *
 * Storage choice: `sessionStorage` (not an in-memory singleton) so the setup
 * survives a mid-match reload — the diagnostics it feeds is most needed exactly
 * when something broke and the operator reloaded. Keyed by matchId so a tab
 * that creates several matches never cross-contaminates.
 *
 * Posture: zero engine import and zero network egress, matching the locked
 * diagnostics-module boundary (EC-260 / D-22801). The setup value is opaque
 * (`unknown`) here — the caller supplies a typed `MatchSetupConfig`; this module
 * only serializes and reads it back.
 */

// why: a namespaced, versionable key prefix keeps these entries distinct from
// any other sessionStorage use and makes them greppable in a browser inspector.
const MATCH_SETUP_KEY_PREFIX = 'legendary-arena:match-setup:';

/**
 * Returns the live `sessionStorage`, or `null` when it is unavailable.
 *
 * @returns The Storage instance, or null in a non-browser / storage-disabled
 *   context.
 */
function getSessionStorageSafely(): Storage | null {
  // why: guard for the node:test runner and any SSR / storage-disabled context.
  // Some privacy modes throw on the mere property access, so the read itself is
  // wrapped — a missing or throwing sessionStorage is a silent no-op, never a
  // crash in either the match-create path or the diagnostics export path.
  try {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }
    return sessionStorage;
  } catch (storageAccessError) {
    return null;
  }
}

/**
 * Persists the submitted match-setup composition for a created match.
 *
 * Called once at match creation (both lobby create paths). A failure to persist
 * is swallowed: the setup is a diagnostics nicety, never load-bearing for play.
 *
 * @param matchId The server-assigned match id the setup belongs to.
 * @param setup The submitted composition (a typed MatchSetupConfig at the call
 *   site; opaque here).
 */
export function persistMatchSetup(matchId: string, setup: unknown): void {
  const store = getSessionStorageSafely();
  if (store === null || matchId === '') {
    return;
  }
  try {
    store.setItem(`${MATCH_SETUP_KEY_PREFIX}${matchId}`, JSON.stringify(setup));
  } catch (persistError) {
    // why: a quota or serialization failure must never block match creation —
    // swallow it so the create flow continues unaffected.
  }
}

/**
 * Reads back the persisted match-setup composition for a match, or `null` when
 * none was stored (e.g. a player who joined a match they did not create, a
 * reload after the tab's session cleared, or a corrupt entry).
 *
 * @param matchId The match id to read, or null when no match is active.
 * @returns The parsed composition, or null when absent / unreadable.
 */
export function readMatchSetup(matchId: string | null): unknown {
  const store = getSessionStorageSafely();
  if (store === null || matchId === null || matchId === '') {
    return null;
  }
  const raw = store.getItem(`${MATCH_SETUP_KEY_PREFIX}${matchId}`);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (parseError) {
    // why: a corrupt entry resolves to null rather than throwing in the export
    // path — a malformed setup must not break the diagnostics download.
    return null;
  }
}
