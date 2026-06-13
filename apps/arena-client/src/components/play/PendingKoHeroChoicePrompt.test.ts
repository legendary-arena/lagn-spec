/**
 * Tests for PendingKoHeroChoicePrompt component (WP-243).
 *
 * Minimal test suite covering render gates and move dispatch.
 * Uses node:test with @vue/test-utils (consistent with arena-client test infrastructure).
 */

import "../testing/jsdom-setup";

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mount } from "@vue/test-utils";
import type { UIPendingKoHeroChoice } from "@legendary-arena/game-engine";

import PendingKoHeroChoicePrompt from "./PendingKoHeroChoicePrompt.vue";

describe("PendingKoHeroChoicePrompt", () => {
  const mockPendingChoice: UIPendingKoHeroChoice = {
    choiceType: "ko-hero",
    playerID: "player-0",
    remaining: 2,
    eligible: [
      {
        zone: "discard",
        cardId: "test-hero-1",
        display: {
          extId: "test-hero-1",
          name: "Test Hero 1",
          imageUrl: "https://example.com/hero1.jpg",
          cost: 5,
        },
      },
      {
        zone: "hand",
        cardId: "test-hero-2",
        display: {
          extId: "test-hero-2",
          name: "Test Hero 2",
          imageUrl: "https://example.com/hero2.jpg",
          cost: 6,
        },
      },
    ],
  };

  test("renders when pending choice exists and viewer is the chooser", () => {
    let submitMoveCalled = false;
    const mockSubmitMove = () => {
      submitMoveCalled = true;
    };

    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: "player-0",
        submitMove: mockSubmitMove,
      },
    });

    assert.ok(
      wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists(),
    );
  });

  test("does not render when pending choice is undefined", () => {
    const mockSubmitMove = () => {};

    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: undefined,
        viewerPlayerId: "player-0",
        submitMove: mockSubmitMove,
      },
    });

    assert.ok(
      !wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists(),
    );
  });

  test("does not render when viewer is not the chooser", () => {
    const mockSubmitMove = () => {};

    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: "player-1",
        submitMove: mockSubmitMove,
      },
    });

    assert.ok(
      !wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists(),
    );
  });

  test("does not render when viewer is spectator (null playerId)", () => {
    const mockSubmitMove = () => {};

    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: null,
        submitMove: mockSubmitMove,
      },
    });

    assert.ok(
      !wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists(),
    );
  });

  test("shows remaining count when greater than 1", () => {
    const mockSubmitMove = () => {};

    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: {
        pendingKoHeroChoice: mockPendingChoice,
        viewerPlayerId: "player-0",
        submitMove: mockSubmitMove,
      },
    });

    const remaining = wrapper.find('[class*="remaining"]');
    assert.ok(remaining.text().includes("2"));
  });
});
