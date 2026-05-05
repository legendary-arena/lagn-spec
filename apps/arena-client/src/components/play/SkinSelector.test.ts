import '../../testing/jsdom-setup';

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setActivePinia, createPinia } from 'pinia';
import { mount } from '@vue/test-utils';

// why: jsdom-setup's opaque-origin document blocks `window.localStorage`;
// install a Map-backed shim on `globalThis` so production code (which
// reads bare `localStorage`) works. See sibling `WP-130` test files
// for the same shim pattern.
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}
const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  writable: true,
  configurable: true,
});

import SkinSelector from './SkinSelector.vue';
import { usePlaymat } from '../../prefs/playmatStore';
import { skinManifest } from '../../prefs/skinManifest';

describe('WP-130 components/play/SkinSelector', () => {
  beforeEach(() => {
    memoryStorage.clear();
    setActivePinia(createPinia());
    Array.from(document.querySelectorAll('[data-testid="play-hud-skin-selector-overlay"]')).forEach(
      (node) => node.remove(),
    );
  });

  test('renders the trigger button with the active skin name and chevron', () => {
    const wrapper = mount(SkinSelector, { attachTo: document.body });
    const button = wrapper.find('[data-testid="play-hud-skin-selector-button"]');
    assert.equal(button.exists(), true);
    assert.match(button.text(), /Skin: classic ▼/);
    wrapper.unmount();
  });

  test('overlay is closed by default', () => {
    const wrapper = mount(SkinSelector, { attachTo: document.body });
    assert.equal(document.querySelector('[data-testid="play-hud-skin-selector-overlay"]'), null);
    wrapper.unmount();
  });

  test('clicking the trigger opens the overlay and lists every available skin', async () => {
    const wrapper = mount(SkinSelector, { attachTo: document.body });
    await wrapper.find('[data-testid="play-hud-skin-selector-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const overlay = document.querySelector('[data-testid="play-hud-skin-selector-overlay"]');
    assert.ok(overlay !== null, 'overlay should be teleported into document.body when open');
    for (const name of Object.keys(skinManifest)) {
      assert.ok(
        document.querySelector(`[data-testid="play-hud-skin-option-${name}"]`) !== null,
        `option button for ${name} should render in the overlay`,
      );
    }
    wrapper.unmount();
  });

  test('clicking an option fires setActiveSkin and closes the overlay', async () => {
    const wrapper = mount(SkinSelector, { attachTo: document.body });
    await wrapper.find('[data-testid="play-hud-skin-selector-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const comicOption = document.querySelector('[data-testid="play-hud-skin-option-comic"]') as HTMLElement;
    assert.ok(comicOption !== null);
    comicOption.click();
    await wrapper.vm.$nextTick();
    const playmat = usePlaymat();
    assert.equal(playmat.activeSkin, 'comic');
    assert.equal(document.querySelector('[data-testid="play-hud-skin-selector-overlay"]'), null);
    wrapper.unmount();
  });

  test('Escape key on the panel closes the overlay (D-6401 keyboard pattern)', async () => {
    const wrapper = mount(SkinSelector, { attachTo: document.body });
    await wrapper.find('[data-testid="play-hud-skin-selector-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const panel = document.querySelector('[data-testid="play-hud-skin-selector-panel"]') as HTMLElement;
    assert.ok(panel !== null);
    const escapeEvent = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    panel.dispatchEvent(escapeEvent);
    await wrapper.vm.$nextTick();
    assert.equal(document.querySelector('[data-testid="play-hud-skin-selector-overlay"]'), null);
    wrapper.unmount();
  });

  test('outside-click on the backdrop closes the overlay', async () => {
    const wrapper = mount(SkinSelector, { attachTo: document.body });
    await wrapper.find('[data-testid="play-hud-skin-selector-button"]').trigger('click');
    await wrapper.vm.$nextTick();
    const overlay = document.querySelector('[data-testid="play-hud-skin-selector-overlay"]') as HTMLElement;
    assert.ok(overlay !== null);
    const outsideClick = new window.MouseEvent('click', { bubbles: true });
    Object.defineProperty(outsideClick, 'target', { value: overlay });
    Object.defineProperty(outsideClick, 'currentTarget', { value: overlay });
    overlay.dispatchEvent(outsideClick);
    await wrapper.vm.$nextTick();
    assert.equal(document.querySelector('[data-testid="play-hud-skin-selector-overlay"]'), null);
    wrapper.unmount();
  });
});
