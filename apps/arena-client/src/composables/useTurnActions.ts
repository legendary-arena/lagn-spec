/**
 * Per-stage affordance gating for the WP-129 3-step turn-actions panel.
 *
 * Owns the disabled-state tooltip precedence (stage → resource → structural)
 * for every stage-gated affordance in `<TurnActionBar>` and the play-surface
 * children. Components consume the returned `reason` directly — they do
 * NOT compose tooltips ad-hoc per EC-132 §3.
 *
 * The 3-step turn structure per `DESIGN-BOARD-LAYOUT.md §5.1`:
 *   Step 1 (`play.start`)   → reveal villain
 *   Step 2 (`play.main`)    → play / recruit / fight
 *   Step 3 (`play.cleanup`) → pass priority (advanceStage) / end turn
 *
 * @see WP-129 §Acceptance Criteria — stage gating
 * @see EC-132 §2 3-step turn structure + move-name table
 * @see EC-132 §3 disabled-state tooltip precedence
 * @see DESIGN-BOARD-LAYOUT.md §5.1
 */

import type { GatingResult } from './useCardCostGating';

export type TurnStage = 'start' | 'main' | 'cleanup';
export type TurnStep = 1 | 2 | 3;

const ALLOWED: GatingResult = { allowed: true, reason: null };

const STAGE_DISPLAY_NAMES: Record<TurnStage, string> = {
  start: 'Start (Reveal)',
  main: 'Main (Play / Recruit / Fight)',
  cleanup: 'Cleanup (End Turn)',
};

/**
 * Resolve the active turn step from the engine's `currentStage`. Used by
 * `<TurnActionBar>` to render only the active step at full prominence.
 *
 * // why: stage-to-step mapping is locked at EC-132 §2 and at
 * `DESIGN-BOARD-LAYOUT.md §5.1`. Returning a `TurnStep` rather than a
 * raw stage avoids template branches re-deriving the mapping.
 */
export function activeStepFor(currentStage: string): TurnStep {
  if (currentStage === 'start') {
    return 1;
  }
  if (currentStage === 'main') {
    return 2;
  }
  return 3;
}

function stageGateReason(currentStage: string, allowedStage: TurnStage): string {
  const allowedDisplay = STAGE_DISPLAY_NAMES[allowedStage];
  return `Only available during the ${allowedDisplay} step (current: ${currentStage}).`;
}

const NOT_YOUR_TURN: GatingResult = {
  allowed: false,
  reason: 'It is not your turn.',
};

/**
 * Composable exposing per-button gating predicates for `<TurnActionBar>`.
 * The returned object's keys map 1:1 to the locked move table in
 * EC-132 §2:
 *
 *   - `canRevealVillain`   → `revealVillainCard` at `play.start`
 *   - `canPlayCard`        → `playCard` at `play.main`
 *   - `canFightVillain`    → `fightVillain` at `play.main`
 *   - `canRecruitHero`     → `recruitHero` at `play.main`
 *   - `canFightMastermind` → `fightMastermind` at `play.main`
 *   - `canPassPriority`    → `advanceStage` at any stage (canonical
 *                             stage-advance per D-10011)
 *   - `canEndTurn`         → `endTurn` at `play.cleanup`
 *
 * Each predicate returns a {@link GatingResult}; resource and structural
 * conditions compose on top of the stage-gating reason via the locked
 * precedence (turn → stage → resource → structural).
 *
 * @param currentStage The engine's G.currentStage value.
 * @param isViewerTurn Whether it is currently the viewing player's turn.
 *   When false, all action gates return disabled. Defaults to true for
 *   backwards compatibility with callers that don't pass it.
 * @param hasPendingChoice Whether the viewer has an unresolved hero choice
 *   (derived from `UIState.pendingHeroChoice !== undefined` at the call site).
 *   When true and `currentStage === 'cleanup'`, blocks `canEndTurn` and
 *   `canPassPriority`. Defaults to false — existing callers unaffected.
 * @param hasPendingKoChoice Whether the viewer has an unresolved KO-a-Hero choice
 *   (derived from `UIState.pendingKoHeroChoice !== undefined` at the call site).
 *   When true, blocks `canEndTurn` and `canPassPriority` at ANY stage. Defaults
 *   to false. When both pending choices are active, KO gate reason takes precedence.
 */
export function useTurnActions(
  currentStage: string,
  isViewerTurn: boolean = true,
  hasPendingChoice: boolean = false,
  hasPendingKoChoice: boolean = false,
): {
  activeStep: TurnStep;
  canRevealVillain: () => GatingResult;
  canPlayCard: () => GatingResult;
  canFightVillain: () => GatingResult;
  canRecruitHero: () => GatingResult;
  canFightMastermind: () => GatingResult;
  canPassPriority: () => GatingResult;
  canEndTurn: () => GatingResult;
} {
  return {
    activeStep: activeStepFor(currentStage),
    canRevealVillain: () => {
      if (!isViewerTurn) return NOT_YOUR_TURN;
      return currentStage === 'start'
        ? ALLOWED
        : { allowed: false, reason: stageGateReason(currentStage, 'start') };
    },
    canPlayCard: () => {
      if (!isViewerTurn) return NOT_YOUR_TURN;
      return currentStage === 'main'
        ? ALLOWED
        : { allowed: false, reason: stageGateReason(currentStage, 'main') };
    },
    canFightVillain: () => {
      if (!isViewerTurn) return NOT_YOUR_TURN;
      return currentStage === 'main'
        ? ALLOWED
        : { allowed: false, reason: stageGateReason(currentStage, 'main') };
    },
    canRecruitHero: () => {
      if (!isViewerTurn) return NOT_YOUR_TURN;
      return currentStage === 'main'
        ? ALLOWED
        : { allowed: false, reason: stageGateReason(currentStage, 'main') };
    },
    canFightMastermind: () => {
      if (!isViewerTurn) return NOT_YOUR_TURN;
      return currentStage === 'main'
        ? ALLOWED
        : { allowed: false, reason: stageGateReason(currentStage, 'main') };
    },
    // why: D-10011 — Pass-priority fires `advanceStage`, the canonical
    // stage-advance vocabulary. Allowed at every stage (start advances
    // to main; main advances to cleanup; cleanup advances + ends turn
    // per turnLoop.ts). NOT a no-op.
    // why: D-22203 — blocked at cleanup ONLY when hasPendingChoice is true.
    // Start and main must remain passable so the player can advance through
    // stages to reach the cleanup prompt; blocking all stages would prevent
    // the player from ever reaching the choice.
    // why: D-24012 — blocked at ANY stage when hasPendingKoChoice is true
    // (the KO choice freezes the board completely, unlike the cleanup-only
    // hero-reveal gate). When both pending choices are active, KO gate
    // reason takes precedence.
    canPassPriority: () => {
      if (!isViewerTurn) return NOT_YOUR_TURN;
      if (hasPendingKoChoice) {
        return {
          allowed: false,
          reason: 'Choose a Hero to KO before taking another action.',
        };
      }
      if (currentStage === 'cleanup' && hasPendingChoice) {
        return {
          allowed: false,
          reason: 'Resolve the revealed card choice before ending your turn.',
        };
      }
      return ALLOWED;
    },
    canEndTurn: () => {
      if (!isViewerTurn) return NOT_YOUR_TURN;
      if (hasPendingKoChoice) {
        // why: D-24012 — the engine's dual turn-end guard (WP-242) blocks
        // endTurn when pendingKoHeroChoices queue is non-empty; this
        // client-side gate surfaces the reason so the player sees a tooltip
        // instead of a silent rejection.
        return {
          allowed: false,
          reason: 'Choose a Hero to KO before taking another action.',
        };
      }
      if (currentStage === 'cleanup' && hasPendingChoice) {
        // why: D-22203 — the engine's dual turn-end guard (WP-220) blocks
        // endTurn when pendingHeroChoice is set; this client-side gate
        // surfaces the reason so the player sees a tooltip instead of a
        // silent rejection.
        return {
          allowed: false,
          reason: 'Resolve the revealed card choice before ending your turn.',
        };
      }
      return currentStage === 'cleanup'
        ? ALLOWED
        : { allowed: false, reason: stageGateReason(currentStage, 'cleanup') };
    },
  };
}
