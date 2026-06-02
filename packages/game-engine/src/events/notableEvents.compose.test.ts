/**
 * Golden-string tests for the pure narrative composers in
 * `notableEvents.compose.ts`.
 *
 * Pins the byte-stable output of every composer for representative inputs
 * — empty-effects, single-effect, multi-effect, and missing-display
 * fallback (raw cardId as cardName). A future change to any format string
 * trips these tests AND requires re-pinning the replay hashes per WP-200
 * §Non-Negotiable Constraints.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeFightNarrative,
  composeAmbushNarrative,
  composeSchemeTwistNarrative,
  composeMastermindStrikeNarrative,
} from './notableEvents.compose.js';

describe('composeFightNarrative', () => {
  it('emits the bare-fight sentence when no effects applied and no bystanders rescued', () => {
    const narrative = composeFightNarrative('Magneto', 0, []);
    assert.equal(narrative, 'Fought "Magneto".');
  });

  it('includes the bystander clause when bystandersRescued > 0', () => {
    const narrative = composeFightNarrative('Magneto', 2, []);
    assert.equal(narrative, 'Fought "Magneto" and rescued 2 bystander(s).');
  });

  it('includes the effect clause on a single applied effect', () => {
    const narrative = composeFightNarrative('Toad', 0, ['captureBystander']);
    assert.equal(
      narrative,
      'Fought "Toad"; Fight effect: a bystander was captured.',
    );
  });

  it('joins multiple applied effects with comma + final "and"', () => {
    const narrative = composeFightNarrative('Pyro', 1, [
      'captureBystander',
      'gainWoundEachPlayer',
    ]);
    assert.equal(
      narrative,
      'Fought "Pyro" and rescued 1 bystander(s); Fight effect: a bystander was captured and every player gained a wound.',
    );
  });

  it('joins three effects with comma separators and Oxford-style final "and"', () => {
    const narrative = composeFightNarrative('Sabretooth', 0, [
      'gainWoundCurrentPlayer',
      'captureBystander',
      'koHeroCurrentPlayer',
    ]);
    assert.equal(
      narrative,
      'Fought "Sabretooth"; Fight effect: the active player gained a wound, a bystander was captured, and the active player KO’d a hero.',
    );
  });

  it('falls back to the raw cardId when display data was missing at the call site', () => {
    // why: defensive fallback — the call site substitutes the raw cardId
    // into `cardName` when `G.cardDisplayData[cardId]` is missing, so the
    // composer renders the raw token without throwing.
    const narrative = composeFightNarrative(
      'core-villain-brotherhood-blob-00',
      0,
      [],
    );
    assert.equal(narrative, 'Fought "core-villain-brotherhood-blob-00".');
  });
});

describe('composeAmbushNarrative', () => {
  it('emits the no-effect sentence when the executor returned an empty array', () => {
    const narrative = composeAmbushNarrative('Magneto', []);
    assert.equal(narrative, '"Magneto" entered the city with no Ambush effect.');
  });

  it('emits the single-effect sentence when one Ambush effect applied', () => {
    const narrative = composeAmbushNarrative('Toad', ['gainWoundEachPlayer']);
    assert.equal(narrative, '"Toad" ambushed: every player gained a wound.');
  });

  it('joins multiple Ambush effects with comma + final "and"', () => {
    const narrative = composeAmbushNarrative('Pyro', [
      'gainWoundCurrentPlayer',
      'captureBystander',
    ]);
    assert.equal(
      narrative,
      '"Pyro" ambushed: the active player gained a wound and a bystander was captured.',
    );
  });

  it('falls back to the raw cardId when display data was missing', () => {
    const narrative = composeAmbushNarrative('core-villain-x-men-toad-00', []);
    assert.equal(
      narrative,
      '"core-villain-x-men-toad-00" entered the city with no Ambush effect.',
    );
  });
});

describe('composeSchemeTwistNarrative', () => {
  it('emits the locked phrase for revealOrPunish', () => {
    const narrative = composeSchemeTwistNarrative('Legacy Virus', 'revealOrPunish');
    assert.equal(
      narrative,
      'Scheme Twist "Legacy Virus": players were forced to reveal a matching hero or suffer a penalty.',
    );
  });

  it('emits the locked phrase for chainedReveals', () => {
    const narrative = composeSchemeTwistNarrative(
      'Negative Zone Prison Breakout',
      'chainedReveals',
    );
    assert.equal(
      narrative,
      'Scheme Twist "Negative Zone Prison Breakout": extra villain-deck cards were revealed.',
    );
  });

  it('emits the locked phrase for woundAll', () => {
    const narrative = composeSchemeTwistNarrative(
      'Unleash the Power of the Cosmic Cube',
      'woundAll',
    );
    assert.equal(
      narrative,
      'Scheme Twist "Unleash the Power of the Cosmic Cube": every player gained wounds.',
    );
  });

  it('emits the locked phrase for koFromHq', () => {
    const narrative = composeSchemeTwistNarrative('Super Hero Civil War', 'koFromHq');
    assert.equal(
      narrative,
      'Scheme Twist "Super Hero Civil War": heroes were KO’d from the HQ.',
    );
  });

  it('emits the locked phrase for midtownBankRobbery', () => {
    const narrative = composeSchemeTwistNarrative(
      'Midtown Bank Robbery',
      'midtownBankRobbery',
    );
    assert.equal(
      narrative,
      'Scheme Twist "Midtown Bank Robbery": the Bank villain captured bystanders and another card was revealed.',
    );
  });

  it('falls back to the raw cardId when display data was missing', () => {
    const narrative = composeSchemeTwistNarrative(
      'core-scheme-twist-legacy-virus',
      'revealOrPunish',
    );
    assert.equal(
      narrative,
      'Scheme Twist "core-scheme-twist-legacy-virus": players were forced to reveal a matching hero or suffer a penalty.',
    );
  });
});

describe('composeMastermindStrikeNarrative', () => {
  it('emits the locked Master Strike sentence with the resolved name', () => {
    const narrative = composeMastermindStrikeNarrative('Dr. Doom Strike');
    assert.equal(narrative, 'Master Strike: "Dr. Doom Strike" resolved.');
  });

  it('falls back to the raw cardId when display data was missing', () => {
    const narrative = composeMastermindStrikeNarrative('master-strike-00');
    assert.equal(narrative, 'Master Strike: "master-strike-00" resolved.');
  });
});
