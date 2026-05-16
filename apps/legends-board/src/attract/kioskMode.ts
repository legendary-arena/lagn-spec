/**
 * Kiosk mode query-parameter parser and CSS class binding.
 *
 * Kiosk mode (`?kiosk=1`) hides all navigation chrome and disables
 * links that would navigate away from the attract board.
 */

const MINIMUM_CYCLE_INTERVAL_MS = 5_000;
const DEFAULT_CYCLE_INTERVAL_MS = 15_000;

/** Parsed kiosk configuration from the current URL. */
export interface KioskConfig {
  readonly isKiosk: boolean;
  readonly isDebug: boolean;
  readonly cycleIntervalMs: number;
}

/** Parses kiosk and debug flags from a query string. */
export function parseKioskConfig(search: string): KioskConfig {
  const params = new URLSearchParams(search);
  const isKiosk = params.get("kiosk") === "1";
  const isDebug = params.get("debug") === "1";

  let cycleIntervalMs = DEFAULT_CYCLE_INTERVAL_MS;
  const intervalOverride = params.get("interval");
  if (intervalOverride) {
    const parsed = Number(intervalOverride);
    if (Number.isFinite(parsed) && parsed > 0) {
      // why: 5-second floor prevents accidental seizure-inducing rapid cycling
      cycleIntervalMs = Math.max(parsed, MINIMUM_CYCLE_INTERVAL_MS);
    }
  }

  return { isKiosk, isDebug, cycleIntervalMs };
}

/** Returns the kiosk config for the current browser location. */
export function getKioskConfig(): KioskConfig {
  return parseKioskConfig(window.location.search);
}
