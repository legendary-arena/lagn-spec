import '../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useViewport, BREAKPOINT_MOBILE_MAX_PX } from './useViewport';

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: (event: 'change', handler: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (event: 'change', handler: (event: MediaQueryListEvent) => void) => void;
  fire: (matches: boolean) => void;
}

function installMatchMedia(initialMatches: boolean): FakeMediaQueryList {
  let storedHandler: ((event: MediaQueryListEvent) => void) | null = null;
  const fake: FakeMediaQueryList = {
    matches: initialMatches,
    media: `(max-width: ${BREAKPOINT_MOBILE_MAX_PX}px)`,
    addEventListener(event, handler) {
      if (event === 'change') {
        storedHandler = handler;
      }
    },
    removeEventListener(event) {
      if (event === 'change') {
        storedHandler = null;
      }
    },
    fire(matches) {
      this.matches = matches;
      if (storedHandler !== null) {
        storedHandler({ matches } as MediaQueryListEvent);
      }
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    value: () => fake,
    writable: true,
    configurable: true,
  });
  return fake;
}

function mountHarness(): { isMobile: { value: boolean }; isDesktop: { value: boolean } } {
  const captured: { isMobile: { value: boolean } | null; isDesktop: { value: boolean } | null } = {
    isMobile: null,
    isDesktop: null,
  };
  const Harness = defineComponent({
    setup() {
      const refs = useViewport();
      captured.isMobile = refs.isMobile;
      captured.isDesktop = refs.isDesktop;
      return () => h('div');
    },
  });
  mount(Harness);
  return { isMobile: captured.isMobile!, isDesktop: captured.isDesktop! };
}

describe('useViewport (WP-129)', () => {
  test('BREAKPOINT_MOBILE_MAX_PX is locked at 767', () => {
    assert.equal(BREAKPOINT_MOBILE_MAX_PX, 767);
  });

  test('isMobile=true when matchMedia matches at mount', () => {
    installMatchMedia(true);
    const refs = mountHarness();
    assert.equal(refs.isMobile.value, true);
    assert.equal(refs.isDesktop.value, false);
  });

  test('isDesktop=true when matchMedia does not match at mount', () => {
    installMatchMedia(false);
    const refs = mountHarness();
    assert.equal(refs.isMobile.value, false);
    assert.equal(refs.isDesktop.value, true);
  });

  test('refs flip when matchMedia fires a change event', () => {
    const fake = installMatchMedia(false);
    const refs = mountHarness();
    assert.equal(refs.isDesktop.value, true);
    fake.fire(true);
    assert.equal(refs.isMobile.value, true);
    assert.equal(refs.isDesktop.value, false);
  });
});
