import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UIDisplayEntry, UIKoPileState } from '@legendary-arena/game-engine';
import PileBrowseModal from './PileBrowseModal.vue';
import KOPile from './KOPile.vue';
import MasterStrikePile from './MasterStrikePile.vue';
import SchemeTwistPile from './SchemeTwistPile.vue';

/**
 * @vue/test-utils + node:test coverage for WP-171 / EC-189.
 *
 * Covers PileBrowseModal directly (open/close, empty/populated rendering,
 * ESC keydown, backdrop vs panel click, ARIA, Teleport mount target,
 * order preservation, listener lifecycle) AND the by-reference emit
 * contract on the three wired pile leaves (KOPile, MasterStrikePile,
 * SchemeTwistPile) so the EC `payload.cards === source` referential
 * identity AC is exercised end-to-end.
 */

function displayEntry(
  extId: string,
  name: string,
  cost: number | null = 0,
): UIDisplayEntry {
  return {
    extId,
    display: {
      extId,
      name,
      imageUrl: `https://images.barefootbetters.com/${extId}.png`,
      cost,
    },
  };
}

function buildKoPile(cards: UIDisplayEntry[]): UIKoPileState {
  const last = cards.length === 0 ? null : cards[cards.length - 1]!;
  return {
    count: cards.length,
    topCard: last,
    cards,
  };
}

describe('PileBrowseModal (WP-171)', () => {
  test('renders nothing under document.body when isOpen is false', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: false,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'Card A')],
      },
    });
    assert.equal(
      document.body.querySelector('[data-testid="play-pile-browse-modal"]'),
      null,
    );
    wrapper.unmount();
  });

  test('mounts under document.body (NOT inside the wrapper) when isOpen is true', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'Card A')],
      },
    });
    const teleportedRoot = document.body.querySelector(
      '[data-testid="play-pile-browse-modal"]',
    );
    assert.notEqual(teleportedRoot, null);
    // why: AC #2 — the teleported root MUST NOT be inside the
    // @vue/test-utils mount container; the panel lives under document.body.
    assert.equal(
      wrapper.element.querySelector('[data-testid="play-pile-browse-modal"]'),
      null,
    );
    wrapper.unmount();
  });

  test('renders verbatim "Pile is empty." copy when cards.length === 0', () => {
    const wrapper = mount(PileBrowseModal, {
      props: { isOpen: true, pileLabel: 'KO Pile', cards: [] },
    });
    const empty = document.body.querySelector(
      '[data-testid="play-pile-browse-empty"]',
    );
    assert.notEqual(empty, null);
    assert.equal(empty?.textContent?.trim(), 'Pile is empty.');
    assert.equal(
      document.body.querySelector('[data-testid="play-pile-browse-list"]'),
      null,
    );
    wrapper.unmount();
  });

  test('header is always "(N cards)" — never pluralized, even when length is 1', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'Master Strike Pile',
        cards: [displayEntry('only', 'Only Strike')],
      },
    });
    const root = document.body.querySelector(
      '[data-testid="play-pile-browse-modal"]',
    );
    const header = root?.querySelector('header');
    assert.equal(header?.textContent?.trim(), 'Master Strike Pile (1 cards)');
    wrapper.unmount();
  });

  test('renders cards in input order with extId-keyed <li> entries', () => {
    const cards = [
      displayEntry('alpha', 'Alpha'),
      displayEntry('bravo', 'Bravo'),
      displayEntry('charlie', 'Charlie'),
    ];
    const wrapper = mount(PileBrowseModal, {
      props: { isOpen: true, pileLabel: 'Scheme Twist Pile', cards },
    });
    const items = document.body.querySelectorAll(
      '[data-testid="play-pile-browse-list"] li',
    );
    assert.equal(items.length, 3);
    assert.equal(items[0]?.textContent?.trim(), 'Alpha');
    assert.equal(items[1]?.textContent?.trim(), 'Bravo');
    assert.equal(items[2]?.textContent?.trim(), 'Charlie');
    wrapper.unmount();
  });

  test('ESC keydown on document emits close when isOpen is true', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'A')],
      },
    });
    const escape = new window.KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escape);
    const closeEmits = wrapper.emitted('close') ?? [];
    assert.equal(closeEmits.length, 1);
    wrapper.unmount();
  });

  test('non-Escape keydown does NOT emit close', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'A')],
      },
    });
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter' }),
    );
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'a' }),
    );
    assert.equal(wrapper.emitted('close'), undefined);
    wrapper.unmount();
  });

  test('ESC listener is detached when isOpen transitions to false', async () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'A')],
      },
    });
    await wrapper.setProps({ isOpen: false });
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Escape' }),
    );
    // why: after detach, the ESC dispatch must not produce another close
    // emit. The detach is verified through observable behavior rather
    // than spying on document.removeEventListener.
    assert.equal(wrapper.emitted('close'), undefined);
    wrapper.unmount();
  });

  test('ESC listener is detached on unmount', () => {
    const removed: string[] = [];
    const originalRemove = document.removeEventListener.bind(document);
    document.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      opts?: boolean | EventListenerOptions,
    ): void => {
      if (type === 'keydown') {
        removed.push(type);
      }
      originalRemove(type, listener, opts);
    }) as typeof document.removeEventListener;
    try {
      const wrapper = mount(PileBrowseModal, {
        props: {
          isOpen: true,
          pileLabel: 'KO Pile',
          cards: [displayEntry('a', 'A')],
        },
      });
      wrapper.unmount();
      assert.ok(
        removed.length > 0,
        'expected document.removeEventListener("keydown", ...) on unmount',
      );
    } finally {
      document.removeEventListener = originalRemove;
    }
  });

  test('backdrop click emits close', async () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'A')],
      },
    });
    const backdrop = document.body.querySelector(
      '[data-testid="play-pile-browse-modal"]',
    );
    assert.notEqual(backdrop, null);
    (backdrop as HTMLElement).click();
    const closeEmits = wrapper.emitted('close') ?? [];
    assert.equal(closeEmits.length, 1);
    wrapper.unmount();
  });

  test('panel click does NOT emit close (stopPropagation)', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'A')],
      },
    });
    const panel = document.body.querySelector(
      '[data-testid="play-pile-browse-modal"] .pile-browse-modal__panel',
    );
    assert.notEqual(panel, null);
    (panel as HTMLElement).click();
    assert.equal(wrapper.emitted('close'), undefined);
    wrapper.unmount();
  });

  test('close button click emits close and has aria-label', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'KO Pile',
        cards: [displayEntry('a', 'A')],
      },
    });
    const closeButton = document.body.querySelector(
      '[data-testid="play-pile-browse-close"]',
    );
    assert.notEqual(closeButton, null);
    assert.equal(
      closeButton?.getAttribute('aria-label'),
      'Close pile browser',
    );
    assert.equal(
      closeButton?.getAttribute('type'),
      'button',
    );
    (closeButton as HTMLElement).click();
    const closeEmits = wrapper.emitted('close') ?? [];
    assert.equal(closeEmits.length, 1);
    wrapper.unmount();
  });

  test('root carries role="dialog", aria-modal="true", aria-label bound to pileLabel', () => {
    const wrapper = mount(PileBrowseModal, {
      props: {
        isOpen: true,
        pileLabel: 'Scheme Twist Pile',
        cards: [],
      },
    });
    const root = document.body.querySelector(
      '[data-testid="play-pile-browse-modal"]',
    );
    assert.notEqual(root, null);
    assert.equal(root?.getAttribute('role'), 'dialog');
    assert.equal(root?.getAttribute('aria-modal'), 'true');
    assert.equal(root?.getAttribute('aria-label'), 'Scheme Twist Pile');
    wrapper.unmount();
  });
});

describe('KOPile browse affordance (WP-171)', () => {
  test('renders <button type="button"> View all ▼ when count > 0', () => {
    const koPile = buildKoPile([displayEntry('a', 'Card A')]);
    const wrapper = mount(KOPile, { props: { koPile } });
    const button = wrapper.find('[data-testid="play-ko-browse"]');
    assert.equal(button.exists(), true);
    assert.equal(button.attributes('type'), 'button');
    assert.match(button.text(), /View all ▼/);
    wrapper.unmount();
  });

  test('does NOT render browse button when count === 0', () => {
    const koPile = buildKoPile([]);
    const wrapper = mount(KOPile, { props: { koPile } });
    assert.equal(
      wrapper.find('[data-testid="play-ko-browse"]').exists(),
      false,
    );
    wrapper.unmount();
  });

  test('clicking browse emits open with cards === koPile.cards (same JS reference)', async () => {
    const koPile = buildKoPile([
      displayEntry('a', 'A'),
      displayEntry('b', 'B'),
    ]);
    const wrapper = mount(KOPile, { props: { koPile } });
    await wrapper.find('[data-testid="play-ko-browse"]').trigger('click');
    const opens = wrapper.emitted('open') ?? [];
    assert.equal(opens.length, 1);
    const payload = opens[0]![0] as {
      pileLabel: string;
      cards: readonly UIDisplayEntry[];
    };
    assert.equal(payload.pileLabel, 'KO Pile');
    // why: WP-171 / EC-189 — emit MUST preserve referential identity with
    // the source array (no clone, no slice, no spread). The downstream
    // PileBrowseModal binds to the exact same JS reference as the engine
    // projection so order preservation is byte-stable across the wire.
    assert.equal(payload.cards === koPile.cards, true);
    wrapper.unmount();
  });
});

describe('MasterStrikePile browse affordance (WP-171)', () => {
  test('renders <button type="button"> View all ▼ when pile.length > 0', () => {
    const pile: UIDisplayEntry[] = [displayEntry('s', 'Strike S')];
    const wrapper = mount(MasterStrikePile, { props: { pile } });
    const button = wrapper.find('[data-testid="play-master-strike-browse"]');
    assert.equal(button.exists(), true);
    assert.equal(button.attributes('type'), 'button');
    assert.match(button.text(), /View all ▼/);
    wrapper.unmount();
  });

  test('does NOT render browse button when pile.length === 0', () => {
    const wrapper = mount(MasterStrikePile, { props: { pile: [] } });
    assert.equal(
      wrapper.find('[data-testid="play-master-strike-browse"]').exists(),
      false,
    );
    wrapper.unmount();
  });

  test('clicking browse emits open with cards === pile (same JS reference)', async () => {
    const pile: UIDisplayEntry[] = [
      displayEntry('s1', 'Strike One'),
      displayEntry('s2', 'Strike Two'),
    ];
    const wrapper = mount(MasterStrikePile, { props: { pile } });
    await wrapper
      .find('[data-testid="play-master-strike-browse"]')
      .trigger('click');
    const opens = wrapper.emitted('open') ?? [];
    assert.equal(opens.length, 1);
    const payload = opens[0]![0] as {
      pileLabel: string;
      cards: readonly UIDisplayEntry[];
    };
    assert.equal(payload.pileLabel, 'Master Strike Pile');
    assert.equal(payload.cards === pile, true);
    wrapper.unmount();
  });
});

describe('SchemeTwistPile browse affordance (WP-171)', () => {
  test('renders <button type="button"> View all ▼ when pile.length > 0', () => {
    const pile: UIDisplayEntry[] = [displayEntry('t', 'Twist T')];
    const wrapper = mount(SchemeTwistPile, { props: { pile } });
    const button = wrapper.find('[data-testid="play-scheme-twist-browse"]');
    assert.equal(button.exists(), true);
    assert.equal(button.attributes('type'), 'button');
    assert.match(button.text(), /View all ▼/);
    wrapper.unmount();
  });

  test('does NOT render browse button when pile.length === 0', () => {
    const wrapper = mount(SchemeTwistPile, { props: { pile: [] } });
    assert.equal(
      wrapper.find('[data-testid="play-scheme-twist-browse"]').exists(),
      false,
    );
    wrapper.unmount();
  });

  test('clicking browse emits open with cards === pile (same JS reference)', async () => {
    const pile: UIDisplayEntry[] = [
      displayEntry('t1', 'Twist One'),
      displayEntry('t2', 'Twist Two'),
    ];
    const wrapper = mount(SchemeTwistPile, { props: { pile } });
    await wrapper
      .find('[data-testid="play-scheme-twist-browse"]')
      .trigger('click');
    const opens = wrapper.emitted('open') ?? [];
    assert.equal(opens.length, 1);
    const payload = opens[0]![0] as {
      pileLabel: string;
      cards: readonly UIDisplayEntry[];
    };
    assert.equal(payload.pileLabel, 'Scheme Twist Pile');
    assert.equal(payload.cards === pile, true);
    wrapper.unmount();
  });
});
