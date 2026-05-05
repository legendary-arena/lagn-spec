<script lang="ts">
import { defineComponent, nextTick, ref } from 'vue';
import { usePlaymat } from '../../prefs/playmatStore';
import { useViewport } from '../../composables/useViewport';
import type { SkinName } from '../../prefs/skinManifest';

/**
 * HUD-bar mounted skin selector for the WP-130 re-skin / playmat
 * preference. Always mounts in the WP-129 reserved slot
 * (`<TopHudBar>`'s `<slot name="skin-selector">`, D-12907); when the
 * bundled manifest is empty (vanishingly rare; would require a
 * mis-built deployment), the selector renders a disabled `🎨 (default)`
 * chip in place rather than unmounting (D-13005 + EC-133 §3
 * always-mounted rule).
 *
 * The overlay is a Vue 3 `<Teleport to="body">` modal so it renders
 * above the mobile-portrait sticky bottom-bar zones per
 * `DESIGN-BOARD-LAYOUT.md §3.2`. The panel root carries `tabindex="0"`
 * and a root-level `@keydown` handler per the D-6401 keyboard-focus
 * pattern (mirrors `<ReplayInspector>` posture). Escape closes;
 * outside-click on the backdrop closes; selecting a skin closes.
 *
 * Per the EC-132 §2 SFC authoring whitelist (which extends to all
 * arena-client SFCs under WP-065 D-6512): this component MUST use
 * `defineComponent({ setup() { return {...} } })` rather than
 * `<script setup>` sugar — the vue-sfc-loader's `inlineTemplate: false`
 * pipeline does not expose script-setup top-level bindings on the
 * template's `_ctx`.
 *
 * @see WP-130 §C "Selector UI"
 * @see DECISIONS.md D-12907 (HUD-bar slot reservation)
 * @see DECISIONS.md D-6401 (keyboard focus pattern)
 * @see DECISIONS.md D-13005 (empty-state fallback)
 */
export default defineComponent({
  name: 'SkinSelector',
  setup() {
    const playmat = usePlaymat();
    const { isMobile } = useViewport();
    const isOpen = ref(false);
    const panelRef = ref<HTMLElement | null>(null);

    function openOverlay(): void {
      if (playmat.availableSkins.length === 0) {
        return;
      }
      isOpen.value = true;
      void nextTick(() => {
        if (panelRef.value !== null) {
          panelRef.value.focus();
        }
      });
    }

    function closeOverlay(): void {
      isOpen.value = false;
    }

    function selectSkin(name: SkinName): void {
      playmat.setActiveSkin(name);
      closeOverlay();
    }

    function buttonLabel(skin: SkinName): string {
      return isMobile.value ? `🎨 ${skin} ▼` : `🎨 Skin: ${skin} ▼`;
    }

    function isActive(skin: SkinName): boolean {
      return skin === playmat.activeSkin;
    }

    function backdropClicked(event: MouseEvent): void {
      if (event.target === event.currentTarget) {
        closeOverlay();
      }
    }

    return {
      playmat,
      isOpen,
      panelRef,
      openOverlay,
      closeOverlay,
      selectSkin,
      buttonLabel,
      isActive,
      backdropClicked,
    };
  },
});
</script>

<template>
  <!-- why: D-13005 always-mounted rule + empty-state policy. When the
       bundled manifest is empty, render a disabled `🎨 (default)` chip
       rather than unmounting; HUD-bar layout reflow would violate the
       D-12907 slot reservation (the slot reserves layout space, not
       just functionality). -->
  <button
    v-if="playmat.availableSkins.length === 0"
    type="button"
    disabled
    class="skin-chip skin-chip--disabled"
    data-testid="play-hud-skin-selector-empty"
    title="No bundled skins available; using the default theme."
  >
    🎨 (default)
  </button>

  <button
    v-else
    type="button"
    class="skin-chip skin-chip--active"
    data-testid="play-hud-skin-selector-button"
    :aria-haspopup="'menu'"
    :aria-expanded="isOpen"
    @click="openOverlay"
  >
    {{ buttonLabel(playmat.activeSkin) }}
  </button>

  <!-- why: Vue 3 Teleport keeps the overlay above the mobile-portrait
       sticky bottom-bar zones per `DESIGN-BOARD-LAYOUT.md §3.2`.
       Mounting under `document.body` also frees the modal from any
       scoped CSS / overflow:hidden cropping in the HUD-bar's parent
       chain. -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="skin-selector-backdrop"
      data-testid="play-hud-skin-selector-overlay"
      role="presentation"
      @click="backdropClicked"
    >
      <!-- why: D-6401 keyboard focus pattern — `tabindex="0"` on the
           component's interactive root, `@keydown` listeners mounted on
           the same root rather than on individual list items. Mirrors
           `<ReplayInspector>` posture. Escape collapses the overlay;
           selecting an item collapses the overlay via the
           per-list-item handler. -->
      <div
        ref="panelRef"
        class="skin-selector-panel"
        role="menu"
        tabindex="0"
        :aria-label="'Playmat skin'"
        data-testid="play-hud-skin-selector-panel"
        @keydown.escape="closeOverlay"
      >
        <header class="skin-selector-panel__header">Choose a skin</header>
        <ul class="skin-selector-panel__list">
          <li
            v-for="skin in playmat.availableSkins"
            :key="skin"
            class="skin-selector-panel__item"
          >
            <button
              type="button"
              role="menuitem"
              class="skin-selector-panel__option"
              :class="{ 'skin-selector-panel__option--active': isActive(skin) }"
              :data-testid="`play-hud-skin-option-${skin}`"
              :aria-current="isActive(skin) ? 'true' : 'false'"
              @click="selectSkin(skin)"
            >
              {{ skin }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.skin-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--color-foreground, #999);
  background: transparent;
  color: inherit;
  border-radius: 0.5rem;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}

.skin-chip--disabled {
  opacity: 0.6;
  cursor: not-allowed;
  font-style: italic;
}

.skin-chip--active:hover {
  background: var(--color-hover, rgba(0, 0, 0, 0.05));
}

.skin-selector-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.skin-selector-panel {
  background: var(--color-background, #fff);
  color: var(--color-foreground, #111);
  padding: 1rem 1.25rem;
  min-width: 16rem;
  max-width: 80vw;
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--color-foreground, #999);
  border-radius: 0.5rem;
  outline: none;
}

.skin-selector-panel__header {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.skin-selector-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.skin-selector-panel__option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.6rem;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  border-radius: 0.25rem;
  cursor: pointer;
  font: inherit;
}

.skin-selector-panel__option:hover,
.skin-selector-panel__option:focus-visible {
  border-color: var(--color-foreground, #999);
}

.skin-selector-panel__option--active {
  background: var(--color-hover, rgba(0, 0, 0, 0.06));
  font-weight: 600;
}
</style>
