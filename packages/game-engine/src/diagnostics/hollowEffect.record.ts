/**
 * Hollow-effect record writer for the Legendary Arena game engine
 * (WP-257 / D-24034).
 *
 * `recordHollowEffect` is the single seam both effect executors call when they
 * classify a declared mechanic as hollow (handler unreachable). It lazy-inits
 * the `G.diagnostics` channel, enforces the bounded-channel cap, and appends a
 * full-sentence `G.messages` line for operator visibility.
 *
 * It mirrors the existing in-executor write precedents: `heroEffectRescue` and
 * the WP-256 primitive interpreter both push a `G.messages` line directly from
 * inside an executor, and `pendingOptionalKoRewards` lazy-inits its field at the
 * park site (never in Game.setup). This writer never throws — a missing or
 * non-array `G.messages` is a no-op, not a crash (moves never throw).
 *
 * No boardgame.io imports. No registry imports. No I/O. No randomness.
 */

import type { LegendaryGameState } from '../types.js';
import type { HollowEffectRecord } from './hollowEffect.types.js';
import { HOLLOW_EFFECTS_CAP } from './hollowEffect.types.js';

// ---------------------------------------------------------------------------
// recordHollowEffect — the single write seam (WP-257)
// ---------------------------------------------------------------------------

/**
 * Records one hollow-effect observation into the runtime-only `G.diagnostics`
 * channel and appends a matching `G.messages` line.
 *
 * Lazy-inits `G.diagnostics` on first write (mirrors the
 * `pendingOptionalKoRewards` lazy-init at its park site — never in Game.setup).
 * Pushes the record while the list is under `HOLLOW_EFFECTS_CAP`; once the cap
 * is reached it drops the record and increments `hollowEffectsDropped` so a long
 * match cannot grow `G` without limit. The `G.messages` line is appended only
 * when the record was retained, and only when `G.messages` is an array — a
 * missing or non-array `G.messages` (older test mocks) is a guarded no-op,
 * never a throw.
 *
 * The channel is observation only: nothing here reads back any gameplay state,
 * and no move/rule/`endIf` may ever consume `G.diagnostics` (never gameplay
 * input — the load-bearing rule for the persistence/serialization boundary).
 *
 * @param G - Game state (mutated under Immer draft).
 * @param record - The hollow-effect record to store.
 */
export function recordHollowEffect(
  G: LegendaryGameState,
  record: HollowEffectRecord,
): void {
  // why: lazy-init at the writer (mirrors pendingOptionalKoRewards) — NEVER in
  // Game.setup; the optional channel tolerates older snapshots and narrow test
  // mocks that predate WP-257. buildInitialGameState seeds it empty for live
  // matches; this guard covers everything else.
  if (!G.diagnostics) {
    G.diagnostics = { hollowEffects: [], hollowEffectsDropped: 0 };
  }

  // why: bounded channel — once the cap is reached, drop the record and count
  // it instead of pushing, so a pathological long match cannot grow G without
  // limit (mirrors the arena-client diagnostics ring-buffer posture). The cap
  // is observation hygiene only; the channel is never gameplay input.
  if (G.diagnostics.hollowEffects.length >= HOLLOW_EFFECTS_CAP) {
    G.diagnostics.hollowEffectsDropped += 1;
    return;
  }

  G.diagnostics.hollowEffects.push(record);

  // why: the G.messages line is operator visibility only (it projects to
  // UIState.log), NOT the contract — tests assert on the record. Guard the push
  // so a missing / non-array G.messages (older test mocks build G without it)
  // is a silent no-op rather than a throw: moves never throw, and detection
  // must never crash the effect path.
  if (Array.isArray(G.messages)) {
    G.messages.push(
      `Unhandled effect observed: card "${record.cardId}" declared a "${record.mechanic}" mechanic at ${record.timing}, but no executable handler was reached (${record.reason}).`,
    );
  }
}
