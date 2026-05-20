import '../../testing/jsdom-setup';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import SharedScoreboard from './SharedScoreboard.vue';

test('SharedScoreboard renders five counters with the literal leaf-name aria-labels', () => {
  const wrapper = mount(SharedScoreboard, {
    props: {
      scheme: { id: 'scheme-midtown-bank-robbery', twistCount: 2, twistPile: [] },
      mastermind: {
        id: 'mastermind-doctor-octopus',
        tacticsRemaining: 3,
        tacticsDefeated: 1,
        display: {
          extId: 'mastermind-doctor-octopus',
          name: 'Doctor Octopus',
          imageUrl: '',
          cost: null,
        },
        attachedBystanders: [],
        strikePile: [],
      },
      progress: { bystandersRescued: 4, escapedVillains: 1 },
    },
  });

  const bystanders = wrapper.find('[aria-label="bystandersRescued"]');
  const escaped = wrapper.find('[aria-label="escapedVillains"]');
  const twists = wrapper.find('[aria-label="twistCount"]');
  const remaining = wrapper.find('[aria-label="tacticsRemaining"]');
  const defeated = wrapper.find('[aria-label="tacticsDefeated"]');

  assert.equal(bystanders.exists(), true);
  assert.equal(escaped.exists(), true);
  assert.equal(twists.exists(), true);
  assert.equal(remaining.exists(), true);
  assert.equal(defeated.exists(), true);

  assert.equal(bystanders.text(), '4');
  assert.equal(escaped.text(), '1');
  assert.equal(twists.text(), '2');
  assert.equal(remaining.text(), '3');
  assert.equal(defeated.text(), '1');
});

test('SharedScoreboard carries data-emphasis="primary" exactly once (on bystandersRescued)', () => {
  const wrapper = mount(SharedScoreboard, {
    props: {
      scheme: { id: 'scheme-midtown-bank-robbery', twistCount: 2, twistPile: [] },
      mastermind: {
        id: 'mastermind-doctor-octopus',
        tacticsRemaining: 3,
        tacticsDefeated: 1,
        display: {
          extId: 'mastermind-doctor-octopus',
          name: 'Doctor Octopus',
          imageUrl: '',
          cost: null,
        },
        attachedBystanders: [],
        strikePile: [],
      },
      progress: { bystandersRescued: 4, escapedVillains: 1 },
    },
  });

  const primary = wrapper.findAll('[data-emphasis="primary"]');
  const secondary = wrapper.findAll('[data-emphasis="secondary"]');

  assert.equal(primary.length, 1);
  assert.equal(secondary.length, 4);

  // The single primary must wrap the bystandersRescued value.
  const primarySlot = primary[0];
  assert.ok(primarySlot, 'expected exactly one [data-emphasis="primary"] slot');
  assert.equal(
    primarySlot.find('[aria-label="bystandersRescued"]').exists(),
    true,
  );
});

test('SharedScoreboard renders all five counters at lobby with zero values (no phase gating)', () => {
  const wrapper = mount(SharedScoreboard, {
    props: {
      scheme: { id: 'scheme-placeholder', twistCount: 0, twistPile: [] },
      mastermind: {
        id: 'mastermind-placeholder',
        tacticsRemaining: 0,
        tacticsDefeated: 0,
        display: {
          extId: 'mastermind-placeholder',
          name: 'Mastermind',
          imageUrl: '',
          cost: null,
        },
        attachedBystanders: [],
        strikePile: [],
      },
      progress: { bystandersRescued: 0, escapedVillains: 0 },
    },
  });

  assert.equal(
    wrapper.find('[aria-label="bystandersRescued"]').text(),
    '0',
  );
  assert.equal(wrapper.find('[aria-label="escapedVillains"]').text(), '0');
  assert.equal(wrapper.find('[aria-label="twistCount"]').text(), '0');
  assert.equal(wrapper.find('[aria-label="tacticsRemaining"]').text(), '0');
  assert.equal(wrapper.find('[aria-label="tacticsDefeated"]').text(), '0');

  // Make sure no counter was swapped for an em-dash at zero.
  assert.equal(wrapper.text().includes('\u2014'), false);
});
