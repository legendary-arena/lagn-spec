<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';

import PlayDesktop from './PlayDesktop.vue';
import PlayMobile from './PlayMobile.vue';
import DiagnosticExportButton from '../components/DiagnosticExportButton.vue';
import { useViewport } from '../composables/useViewport';
import { useSkinApplier } from '../composables/useSkinApplier';
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
 * Per WP-130, `useSkinApplier()` is invoked here against the viewport's
 * root element so the active playmat skin's CSS class propagates to
 * both `<PlayDesktop>` and `<PlayMobile>` (whichever this component
 * renders). Application is exclusive to this root element — never
 * `<body>` or any global document node — so non-Play pages (lobby,
 * replay-viewer, future routes) never inherit skin styling.
 *
 * @see WP-129 §Acceptance Criteria — viewport discriminator
 * @see WP-130 §D "Skin application"
 * @see DECISIONS.md D-12909 viewport breakpoint
 */
export default defineComponent({
  name: 'PlayViewport',
  components: { PlayDesktop, PlayMobile, DiagnosticExportButton },
  props: {
    submitMove: {
      type: Function as PropType<SubmitMove>,
      required: true,
    },
    // why: forwarded to <PlayDesktop> only (the autoplay bar is desktop-only);
    // part of the additive App.vue → PlayViewport.vue → PlayDesktop.vue
    // matchId prop-drill (D-16501). Defaults to '' so non-live mounts forward
    // an empty value that probes nothing.
    matchId: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const { isMobile } = useViewport();
    const viewportRoot = ref<HTMLElement | null>(null);
    useSkinApplier(viewportRoot);
    return { isMobile, viewportRoot, matchId: props.matchId };
  },
});
</script>

<template>
  <div ref="viewportRoot" class="play-viewport">
    <PlayMobile v-if="isMobile" :submit-move="submitMove" />
    <PlayDesktop v-else :submit-move="submitMove" :match-id="matchId" />
    <DiagnosticExportButton />
  </div>
</template>

<style scoped>
.play-viewport {
  display: contents;
}
</style>
