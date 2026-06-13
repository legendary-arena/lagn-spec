/**
 * Tests for PendingKoHeroChoicePrompt component (WP-243).
 *
 * Minimal test suite covering render gates and move dispatch.
 */

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PendingKoHeroChoicePrompt from './PendingKoHeroChoicePrompt.vue';
import type { UIPendingKoHeroChoice } from '@legendary-arena/game-engine';

describe('PendingKoHeroChoicePrompt', () => {
  const mockSubmitMove = vi.fn();

  const mockPendingChoice: UIPendingKoHeroChoice = {
    choiceType: 'ko-hero',
    playerID: 'player-0',
    remaining: 2,
    eligible: [
      {
        zone: 'discard',
        cardId: 'test-hero-1',
        display: {
          extId: 'test-hero-1',
          name: 'Test Hero 1',
          imageUrl: 'https://example.com/hero1.jpg',
          cost: 5,
        },
      },
      {
        zone: 'hand',
        cardId: 'test-hero-2',
        display: {
          extId: 'test-hero-2',
          name: 'Test Hero 2',
          imageUrl: 'https://example.com/hero2.jpg',
          cost: 6,
        },
      },
    ],
  };

  it('renders when pending choice exists and viewer is the chooser', () => {
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: 'player-0',
        submitMove: mockSubmitMove,
      },
    });

    expect(wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists()).toBe(true);
  });

  it('does not render when pending choice is undefined', () => {
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: undefined,
        viewerPlayerId: 'player-0',
        submitMove: mockSubmitMove,
      },
    });

    expect(wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists()).toBe(false);
  });

  it('does not render when viewer is not the chooser', () => {
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: 'player-1',
        submitMove: mockSubmitMove,
      },
    });

    expect(wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists()).toBe(false);
  });

  it('does not render when viewer is spectator (null playerId)', () => {
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: null,
        submitMove: mockSubmitMove,
      },
    });

    expect(wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists()).toBe(false);
  });

  it('dispatches resolveKoHeroChoice move when card is clicked', async () => {
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: 'player-0',
        submitMove: mockSubmitMove,
      },
    });

    const button = wrapper.find('[data-testid="pending-ko-hero-choice-card-discard-test-hero-1"]');
    await button.trigger('click');

    expect(mockSubmitMove).toHaveBeenCalledWith('resolveKoHeroChoice', {
      zone: 'discard',
      cardId: 'test-hero-1',
    });
  });

  it('shows remaining count when greater than 1', () => {
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: 'player-0',
        submitMove: mockSubmitMove,
      },
    });

    const remaining = wrapper.find('[class*="remaining"]');
    expect(remaining.text()).toContain('2');
  });

  it('disables buttons after first click', async () => {
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: 'player-0',
        submitMove: mockSubmitMove,
      },
    });

    const button = wrapper.find('[data-testid="pending-ko-hero-choice-card-discard-test-hero-1"]');
    await button.trigger('click');
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('[data-testid*="pending-ko-hero-choice-card-"]');
    buttons.forEach((btn) => {
      expect(btn.attributes('disabled')).toBeDefined();
    });
  });
});
