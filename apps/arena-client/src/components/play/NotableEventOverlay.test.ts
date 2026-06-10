import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UICardDisplay } from '@legendary-arena/game-engine';
import NotableEventOverlay, {
  type NotableEventCardLookup,
} from './NotableEventOverlay.vue';
import type { NotableGameEvent } from '../../composables/useNotableEventStream';

function display(extId: string, name: string): UICardDisplay {
  return {
    extId,
    name,
    imageUrl: `https://images.barefootbetters.com/${extId}.png`,
    cost: null,
  };
}

function fightEvent(
  cardId: string,
  appliedEffects: Extract<NotableGameEvent, { type: 'fightResolved' }>['appliedEffects'] = [],
): NotableGameEvent {
  return {
    type: 'fightResolved',
    playerId: '0',
    cardId,
    citySpace: 0,
    bystandersRescued: 0,
    appliedEffects,
    narrative: `Fought "${cardId}".`,
  };
}

function ambushEvent(
  revealedCardId: string,
  appliedEffects: Extract<NotableGameEvent, { type: 'ambushResolved' }>['appliedEffects'] = [],
): NotableGameEvent {
  return {
    type: 'ambushResolved',
    revealedCardId,
    citySpace: 1,
    appliedEffects,
    narrative: `"${revealedCardId}" ambushed.`,
  };
}

function twistEvent(twistCardId: string): NotableGameEvent {
  return {
    type: 'schemeTwistResolved',
    twistCardId,
    resolverKey: 'woundAll',
    narrative: `Scheme Twist "${twistCardId}": every player gained wounds.`,
  };
}

function strikeEvent(strikeCardId: string): NotableGameEvent {
  return {
    type: 'mastermindStrikeResolved',
    strikeCardId,
    narrative: `Master Strike: "${strikeCardId}" resolved.`,
  };
}

function defeatEvent(mastermindId: string): NotableGameEvent {
  return {
    type: 'mastermindDefeated',
    playerId: '0',
    mastermindId,
    bystandersRescued: 2,
    narrative: `Defeated the Mastermind "${mastermindId}" and rescued 2 bystander(s).`,
  };
}

describe('NotableEventOverlay — null event renders nothing (WP-201)', () => {
  test('omits the overlay element when event prop is null', () => {
    const wrapper = mount(NotableEventOverlay, { props: { event: null } });
    assert.equal(
      wrapper.find('[data-testid="play-notable-event-overlay"]').exists(),
      false,
    );
  });
});

describe('NotableEventOverlay — required attributes on root (WP-201 §Locked Values)', () => {
  test('renders data-testid, data-event-type, aria-live, role, aria-atomic on the overlay root', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('thug') },
    });
    const overlay = wrapper.find('[data-testid="play-notable-event-overlay"]');
    assert.equal(overlay.exists(), true);
    assert.equal(overlay.attributes('data-event-type'), 'fightResolved');
    assert.equal(overlay.attributes('aria-live'), 'polite');
    assert.equal(overlay.attributes('role'), 'status');
    assert.equal(overlay.attributes('aria-atomic'), 'true');
  });
});

describe('NotableEventOverlay — locked chip labels (WP-201 §Locked Values)', () => {
  test('fightResolved → "Fought"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('thug') },
    });
    assert.match(wrapper.text(), /Fought/);
  });

  test('ambushResolved → "Ambush!"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: ambushEvent('hand-ninja') },
    });
    assert.match(wrapper.text(), /Ambush!/);
  });

  test('schemeTwistResolved → "Scheme Twist!"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: twistEvent('scheme-twist-aa') },
    });
    assert.match(wrapper.text(), /Scheme Twist!/);
  });

  test('mastermindStrikeResolved → "Master Strike!"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: strikeEvent('master-strike-01') },
    });
    assert.match(wrapper.text(), /Master Strike!/);
  });

  test('mastermindDefeated → "Mastermind Defeated!"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: defeatEvent('core/magneto') },
    });
    assert.match(wrapper.text(), /Mastermind Defeated!/);
  });
});

describe('NotableEventOverlay — card name lookup + fallback (WP-201 §AC)', () => {
  test('renders the display name when cardDisplayData carries the ext_id', () => {
    const cardDisplayData: NotableEventCardLookup = {
      'hand-ninja': display('hand-ninja', 'Hand Ninja'),
    };
    const wrapper = mount(NotableEventOverlay, {
      props: { event: ambushEvent('hand-ninja'), cardDisplayData },
    });
    assert.match(wrapper.text(), /Hand Ninja/);
  });

  test('falls back to the raw ext_id when display data is missing', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('doom-bot-04') },
    });
    assert.match(wrapper.text(), /doom-bot-04/);
  });

  test('falls back to the raw ext_id when cardDisplayData has no entry for this id', () => {
    const cardDisplayData: NotableEventCardLookup = {
      'something-else': display('something-else', 'Something Else'),
    };
    const wrapper = mount(NotableEventOverlay, {
      props: { event: twistEvent('scheme-twist-xyz'), cardDisplayData },
    });
    assert.match(wrapper.text(), /scheme-twist-xyz/);
  });
});

describe('NotableEventOverlay — narrative is rendered verbatim (WP-201 §Non-Negotiable — D-20002)', () => {
  test('renders the engine-composed narrative byte-for-byte', () => {
    const event = fightEvent('thug');
    event.narrative = 'Fought "thug" and rescued 2 bystander(s); Fight effect: every player gained a wound.';
    const wrapper = mount(NotableEventOverlay, { props: { event } });
    assert.match(wrapper.text(), /Fought "thug" and rescued 2 bystander\(s\); Fight effect: every player gained a wound\./);
  });
});

describe('NotableEventOverlay — applied-effect badges (WP-201 §AC + D-20005)', () => {
  test('omits the effect-badge row entirely when appliedEffects is empty', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('thug', []) },
    });
    assert.equal(
      wrapper.find('[data-testid="play-notable-event-overlay-effects"]').exists(),
      false,
    );
  });

  test('renders one badge per appliedEffects entry in dispatch order (D-20003)', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: {
        event: fightEvent('thug', [
          'gainWoundCurrentPlayer',
          'koHeroCurrentPlayer',
        ]),
      },
    });
    const badges = wrapper.findAll('.notable-event-overlay__effect-badge');
    assert.equal(badges.length, 2);
    assert.equal(badges[0]!.attributes('data-effect-keyword'), 'gainWoundCurrentPlayer');
    assert.equal(badges[1]!.attributes('data-effect-keyword'), 'koHeroCurrentPlayer');
  });

  test('renders applied-effect badges for Ambush events', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: ambushEvent('hand-ninja', ['captureBystander']) },
    });
    assert.equal(
      wrapper.find('[data-testid="play-notable-event-overlay-effects"]').exists(),
      true,
    );
  });

  test('does NOT render an effect-badge row for Scheme Twist events (D-20005)', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: twistEvent('scheme-twist-aa') },
    });
    assert.equal(
      wrapper.find('[data-testid="play-notable-event-overlay-effects"]').exists(),
      false,
    );
  });

  test('does NOT render an effect-badge row for Master Strike events (D-20005)', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: strikeEvent('master-strike-01') },
    });
    assert.equal(
      wrapper.find('[data-testid="play-notable-event-overlay-effects"]').exists(),
      false,
    );
  });
});

describe('NotableEventOverlay — locked humanised effect-label map (WP-201 §Locked Values — D-20102)', () => {
  test('gainWoundEachPlayer → "Each player gains a Wound"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('thug', ['gainWoundEachPlayer']) },
    });
    assert.match(wrapper.text(), /Each player gains a Wound/);
  });

  test('gainWoundCurrentPlayer → "You gain a Wound"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('thug', ['gainWoundCurrentPlayer']) },
    });
    assert.match(wrapper.text(), /You gain a Wound/);
  });

  test('koHeroCurrentPlayer → "KO a Hero"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('thug', ['koHeroCurrentPlayer']) },
    });
    assert.match(wrapper.text(), /KO a Hero/);
  });

  test('heroDeckTopToEscape → "Hero deck top escapes"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: fightEvent('thug', ['heroDeckTopToEscape']) },
    });
    assert.match(wrapper.text(), /Hero deck top escapes/);
  });

  test('captureBystander → "Captures a Bystander"', () => {
    const wrapper = mount(NotableEventOverlay, {
      props: { event: ambushEvent('hand-ninja', ['captureBystander']) },
    });
    assert.match(wrapper.text(), /Captures a Bystander/);
  });
});

describe('NotableEventOverlay — unknown-keyword fallback (WP-201 §AC — D-20102 totality)', () => {
  test('renders the raw keyword string verbatim when the engine emits a keyword the arena-client map does not recognise', () => {
    // Synthetic event using a keyword string outside the locked 5-entry map.
    // `koHeroEachPlayer` is a real VillainEffectKeyword on the engine union
    // (added by WP-189) but is NOT in the arena-client's locked label map per
    // WP-201 §Scope (In) — the totality rule says render the raw keyword.
    // Typecast escape simulates any future engine widening.
    const unknownKeyword = 'koHeroEachPlayer' as never;
    const event: NotableGameEvent = {
      type: 'fightResolved',
      playerId: '0',
      cardId: 'thug',
      citySpace: 0,
      bystandersRescued: 0,
      appliedEffects: [unknownKeyword],
      narrative: 'Fought "thug".',
    };
    const wrapper = mount(NotableEventOverlay, { props: { event } });
    assert.match(wrapper.text(), /koHeroEachPlayer/);
  });
});
