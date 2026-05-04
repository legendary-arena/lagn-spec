<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import PlayDesktop from './PlayDesktop.vue';
import PlayMobile from './PlayMobile.vue';
import { useViewport } from '../composables/useViewport';
import type { SubmitMove } from '../components/play/uiMoveName.types';

/**
 * Viewport discriminator. Renders `<PlayDesktop>` when the viewport is
 * desktop-sized; `<PlayMobile>` when the viewport is mobile-portrait.
 * The breakpoint is locked at D-12909 (`max-width: 767px`).
 *
 * Filename `PlayViewport.vue` chosen to disambiguate from the deleted
 * WP-100 `components/play/PlayView.vue` per EC-132 §2.
 *
 * Per the EC-132 §2 SFC authoring whitelist: this page uses a composable
 * (`useViewport`) and conditionally renders children, so it MUST use
 * `defineComponent({ setup() { return {...} } })` per P6-30 / P6-46 /
 * D-6512.
 *
 * @see WP-129 §Acceptance Criteria — viewport discriminator
 * @see DECISIONS.md D-12909 viewport breakpoint
 */
export default defineComponent({
  name: 'PlayViewport',
  components: { PlayDesktop, PlayMobile },
  props: {
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
  },
  setup() {
    const { isMobile } = useViewport();
    return { isMobile };
  },
});
</script>

<template>
  <PlayMobile v-if="isMobile" :submit-move="submitMove" />
  <PlayDesktop v-else :submit-move="submitMove" />
</template>
