/**
 * Shared type contract for the click-to-play UI surface (WP-100, revised
 * 2026-04-27).
 *
 * `UiMoveName` is a UI-side mirror of the nine engine moves the
 * click-to-play surface is permitted to emit:
 *
 * - Two **lobby-phase** moves (registered on `LegendaryGame.phases.lobby.moves`):
 *   `'setPlayerReady'`, `'startMatchIfReady'`. These let the seated viewer
 *   ready up and trigger the phase transition out of the lobby. The 2026-04-27
 *   revision added these two names; the original WP-100 locked vocabulary at
 *   six names and the smoke test could not progress past the lobby phase as a
 *   result.
 * - Nine **play-phase + cross-phase** moves (registered on `LegendaryGame.moves`):
 *   `'drawCards'`, `'advanceStage'`, `'revealVillainCard'`, `'playCard'`,
 *   `'endTurn'`, `'fightVillain'`, `'recruitHero'`, `'fightMastermind'`,
 *   `'resolveHeroChoice'`. Per D-10011, `'advanceStage'` was added on
 *   2026-04-27 after smoke testing surfaced that the original WP-100
 *   vocabulary's exclusion of stage progression left the player stuck in
 *   `start` after drawing. Per D-10012, `'revealVillainCard'` was added the
 *   same day after smoke testing surfaced that the City stays empty without
 *   an explicit reveal — `fightVillain` has nothing to target. Per WP-222,
 *   `'resolveHeroChoice'` was added to unblock the reveal-attack-choose
 *   pending choice prompt (D-22201).
 *
 * The union is type-only and creates no runtime coupling. Every interactive
 * component under `apps/arena-client/src/components/play/` declares its
 * `submitMove` prop using the `SubmitMove` alias (NOT a bare `string` move
 * name) so typos are caught at compile time. The `args` parameter remains
 * `unknown` by design: the engine validates payload shape on receipt; the
 * UI compile-time check on the *name* is sufficient drift protection.
 */

/**
 * The eleven engine move names the click-to-play UI surface is permitted to
 * emit. Strict subset of the engine's `LegendaryGame.moves` bag plus the
 * `LegendaryGame.phases.lobby.moves` block. Any extension requires a new
 * Work Packet.
 */
export type UiMoveName =
  | 'setPlayerReady'
  | 'startMatchIfReady'
  | 'drawCards'
  | 'advanceStage'
  | 'revealVillainCard'
  | 'playCard'
  | 'endTurn'
  | 'fightVillain'
  | 'recruitHero'
  | 'fightMastermind'
  | 'resolveHeroChoice';

/**
 * Function signature shared by every prop-drilled `submitMove` in the
 * click-to-play surface. The engine validates the payload shape on
 * receipt — the UI's only obligation is the typed move name.
 */
export type SubmitMove = (name: UiMoveName, args: unknown) => void;
