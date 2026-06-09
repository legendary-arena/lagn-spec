import { isLiveModeEnabled } from '../services/analyticsLiveFetchers.js';

/**
 * Shape returned by {@link useMockModeIndicator}: whether the dashboard is
 * currently showing sample (mock) data instead of provably-live data, plus
 * the operator-facing message that explains how to switch the deploy to live.
 */
interface MockModeIndicator {
  isMockData: boolean;
  message: string;
}

// why: the message names the env-var tokens (VITE_USE_MOCKS /
// VITE_API_BASE_URL) as operator-guidance prose only — it is display copy,
// not an env read. The single-source-of-truth grep (D-20601 / D-22601)
// targets direct Vite build-time env access, which this file performs only
// through the imported isLiveModeEnabled() predicate; the locked copy is
// plain prose and stays clear of that gate (§18 prose-vs-grep discipline).
const MOCK_MODE_MESSAGE =
  'Mock data — this dashboard is showing sample metrics, not live data. To show real metrics, set VITE_USE_MOCKS=false and a valid VITE_API_BASE_URL in the deploy environment, then redeploy.';

/**
 * Determines whether the operator dashboard is showing mock (sample) data and
 * supplies the locked banner copy. The banner is shown whenever the deploy is
 * not provably serving live data, so the operator never mistakes sample
 * numbers for real ones.
 *
 * @returns the mock-mode flag and the locked operator-facing message.
 */
export function useMockModeIndicator(): MockModeIndicator {
  // why: visibility keys off the conservative `!isLiveModeEnabled()` gate
  // ("warn unless provably live") and imports that single-source predicate
  // from analyticsLiveFetchers rather than re-reading Vite env directly or
  // reusing the API-routing module's separate VITE_USE_MOCKS-only mock gate
  // (D-20601 / D-22601). The two gates can disagree in the unset-VITE_USE_MOCKS
  // + empty-URL edge case, so the banner deliberately trusts the LIVE gate as
  // the one source of truth.
  const isMockData = !isLiveModeEnabled();
  return { isMockData, message: MOCK_MODE_MESSAGE };
}
