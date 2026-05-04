import '../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import PlayViewport from './PlayViewport.vue';
import type { SubmitMove } from '../components/play/uiMoveName.types';

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    value: () => ({
      matches,
      media: '(max-width: 767px)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    writable: true,
    configurable: true,
  });
}

const noopSubmitMove: SubmitMove = () => undefined;

describe('PlayViewport (WP-129)', () => {
  test('renders <PlayDesktop> when viewport is desktop-sized', () => {
    setActivePinia(createPinia());
    installMatchMedia(false);
    const wrapper = mount(PlayViewport, {
      props: { submitMove: noopSubmitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-desktop"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-mobile"]').exists(), false);
  });

  test('renders <PlayMobile> when viewport is mobile portrait', () => {
    setActivePinia(createPinia());
    installMatchMedia(true);
    const wrapper = mount(PlayViewport, {
      props: { submitMove: noopSubmitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-mobile"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-desktop"]').exists(), false);
  });
});
