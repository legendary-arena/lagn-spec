import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import CardTile from './CardTile.vue';

function makeDisplay(overrides: Partial<{
  extId: string;
  name: string;
  imageUrl: string;
  cost: number | null;
}> = {}) {
  return {
    extId: overrides.extId ?? 'core-hero-spider-man-web-shooters',
    name: overrides.name ?? 'Web Shooters',
    imageUrl: overrides.imageUrl ?? 'https://images.legendary-arena.com/core-hero-spider-man-web-shooters.jpg',
    cost: overrides.cost !== undefined ? overrides.cost : 3,
  };
}

describe('CardTile — Image Mode (WP-178)', () => {
  test('renders img with correct src and alt when imageUrl is truthy', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay() },
    });
    const image = wrapper.find('[data-testid="card-tile-image"]');
    assert.equal(image.exists(), true);
    assert.equal(image.attributes('src'), 'https://images.legendary-arena.com/core-hero-spider-man-web-shooters.jpg');
    assert.equal(image.attributes('alt'), 'Web Shooters');
  });

  test('img has loading="lazy"', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay() },
    });
    const image = wrapper.find('[data-testid="card-tile-image"]');
    assert.equal(image.attributes('loading'), 'lazy');
  });

  test('title attribute shows card name', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay() },
    });
    const tile = wrapper.find('[data-testid="card-tile"]');
    assert.equal(tile.attributes('title'), 'Web Shooters');
  });

  test('cost badge renders when showCost is true and cost is not null', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ cost: 5 }) },
    });
    const badge = wrapper.find('[data-testid="card-tile-cost-badge"]');
    assert.equal(badge.exists(), true);
    assert.equal(badge.text(), '5');
  });

  test('cost badge does not render when cost is null', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ cost: null }) },
    });
    const badge = wrapper.find('[data-testid="card-tile-cost-badge"]');
    assert.equal(badge.exists(), false);
  });

  test('cost badge does not render when showCost is false', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ cost: 5 }), showCost: false },
    });
    const badge = wrapper.find('[data-testid="card-tile-cost-badge"]');
    assert.equal(badge.exists(), false);
  });

  test('fallback element is NOT rendered in image mode', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay() },
    });
    const fallback = wrapper.find('[data-testid="card-tile-fallback"]');
    assert.equal(fallback.exists(), false);
  });
});

describe('CardTile — Fallback Mode (WP-178)', () => {
  test('renders text fallback when imageUrl is empty string', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ imageUrl: '' }) },
    });
    const fallback = wrapper.find('[data-testid="card-tile-fallback"]');
    assert.equal(fallback.exists(), true);
    assert.match(fallback.text(), /Web Shooters/);
  });

  test('no img element emitted in fallback mode', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ imageUrl: '' }) },
    });
    const image = wrapper.find('[data-testid="card-tile-image"]');
    assert.equal(image.exists(), false);
  });

  test('fallback shows cost when cost is not null', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ imageUrl: '', cost: 7 }) },
    });
    const fallback = wrapper.find('[data-testid="card-tile-fallback"]');
    assert.match(fallback.text(), /Cost: 7/);
  });

  test('fallback does not show cost when cost is null', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ imageUrl: '', cost: null }) },
    });
    const fallback = wrapper.find('[data-testid="card-tile-fallback"]');
    assert.doesNotMatch(fallback.text(), /Cost:/);
  });

  test('no cost badge in fallback mode', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay({ imageUrl: '', cost: 5 }) },
    });
    const badge = wrapper.find('[data-testid="card-tile-cost-badge"]');
    assert.equal(badge.exists(), false);
  });
});

describe('CardTile — Size Variants (WP-178)', () => {
  test('applies card-tile--sm class for size="sm"', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay(), size: 'sm' },
    });
    assert.equal(wrapper.find('.card-tile--sm').exists(), true);
  });

  test('applies card-tile--md class by default', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay() },
    });
    assert.equal(wrapper.find('.card-tile--md').exists(), true);
  });

  test('applies card-tile--lg class for size="lg"', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay(), size: 'lg' },
    });
    assert.equal(wrapper.find('.card-tile--lg').exists(), true);
  });
});

describe('CardTile — Interactive (WP-178)', () => {
  test('applies card-tile--interactive class when interactive=true', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay(), interactive: true },
    });
    assert.equal(wrapper.find('.card-tile--interactive').exists(), true);
  });

  test('does NOT apply card-tile--interactive class when interactive=false', () => {
    const wrapper = mount(CardTile, {
      props: { display: makeDisplay(), interactive: false },
    });
    assert.equal(wrapper.find('.card-tile--interactive').exists(), false);
  });
});
