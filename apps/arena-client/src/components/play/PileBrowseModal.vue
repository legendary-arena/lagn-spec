<script lang="ts">
import {
  defineComponent,
  onBeforeUnmount,
  watch,
  type PropType,
} from 'vue';
// why: WP-171 / D-16502 — `UIDisplayEntry` is reached via a type-only
// import on the Runtime-Safe Engine Surface; the arena-client layer is
// forbidden from importing engine runtime code (Layer Boundary). The
// `import type` form erases at compile time and produces no runtime
// dependency on `@legendary-arena/game-engine`.
import type { UIDisplayEntry } from '@legendary-arena/game-engine';

/**
 * Generic pile browse modal — face-up, text-only, deterministic order.
 *
 * Mounts under `document.body` via Vue 3 `<Teleport>` to escape sticky
 * board-layout zones. Closes on backdrop click + `Escape` keydown on the
 * document. Renders `cards[i].display.name` in the exact order received
 * (no `sort` / `reverse` / `slice` / `map` / `filter` in the wiring path).
 *
 * Per WP-171 the modal is consumed by three pile leaves at once
 * (`KOPile`, `MasterStrikePile`, `SchemeTwistPile`), so the leaf is
 * generic across pile types. Per the EC-132 §2 SFC authoring whitelist
 * this leaf still uses `defineComponent({ setup() { return {...} } })`
 * (mirrors the `OpponentVictoryModal.vue` precedent).
 *
 * @see WP-171 §Acceptance Criteria — Pile Browse Modal
 * @see EC-189 §Locked Values — ARIA, dimensions, ESC handler, Teleport gating
 * @see DECISIONS.md D-12803 (pile contents public), D-12805 (UIDisplayEntry shape),
 *      D-16502 (type-only engine import)
 */
export default defineComponent({
  name: 'PileBrowseModal',
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    pileLabel: {
      type: String,
      required: true,
    },
    cards: {
      type: Array as PropType<readonly UIDisplayEntry[]>,
      required: true,
    },
  },
  emits: ['close'],
  setup(_props, { emit }) {
    function onDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        emit('close');
      }
    }

    function attachKeydownListener(): void {
      document.addEventListener('keydown', onDocumentKeyDown);
    }

    function detachKeydownListener(): void {
      document.removeEventListener('keydown', onDocumentKeyDown);
    }

    // why: EC-189 locks the ESC handler form — wired through
    // `watch(isOpen, ..., { immediate: true })` so an initial `isOpen=true`
    // on mount also attaches (no skipped first-open). Detaching on the
    // `false` transition AND on `onBeforeUnmount` prevents listener leaks
    // across mount/unmount cycles. Inline `@keydown` on the dialog is
    // explicitly forbidden because the dialog may not have focus at open
    // time (the trigger button retains focus until ESC fires).
    watch(
      () => _props.isOpen,
      (open) => {
        if (open) {
          attachKeydownListener();
        } else {
          detachKeydownListener();
        }
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      detachKeydownListener();
    });

    return {};
  },
});
</script>

<template>
  <!-- why: EC-189 — the `<Teleport>` node ITSELF is wrapped in
       `v-if="isOpen"`. Gating only an inner child would leave an
       always-mounted Teleport anchor in `document.body` and trip
       AC #2 ("renders nothing when closed"). -->
  <Teleport v-if="isOpen" to="body">
    <div
      class="pile-browse-modal__backdrop"
      data-testid="play-pile-browse-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="pileLabel"
      @click="$emit('close')"
    >
      <!-- why: EC-189 — backdrop click emits `close`; panel click is
           stopped at the panel so a click on the dialog contents does
           NOT close the modal. The dialog only closes on backdrop click,
           ESC keydown, or the explicit close button. -->
      <div class="pile-browse-modal__panel" @click.stop>
        <header class="pile-browse-modal__header">
          {{ pileLabel }} ({{ cards.length }} cards)
        </header>
        <button
          type="button"
          class="pile-browse-modal__close"
          data-testid="play-pile-browse-close"
          aria-label="Close pile browser"
          @click="$emit('close')"
        >
          Close
        </button>
        <ul
          v-if="cards.length > 0"
          class="pile-browse-modal__list"
          data-testid="play-pile-browse-list"
        >
          <li
            v-for="entry in cards"
            :key="entry.extId"
            class="pile-browse-modal__entry"
          >
            {{ entry.display.name }}
          </li>
        </ul>
        <p
          v-else
          class="pile-browse-modal__empty"
          data-testid="play-pile-browse-empty"
        >
          Pile is empty.
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pile-browse-modal__backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

.pile-browse-modal__panel {
  background: var(--color-background, #fff);
  padding: 1rem 1.25rem;
  min-width: 18rem;
  max-width: 80vw;
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid var(--color-foreground, #999);
}

.pile-browse-modal__header {
  font-weight: 600;
  margin: 0 0 0.5rem 0;
}

.pile-browse-modal__close {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.5rem;
}

.pile-browse-modal__list {
  list-style: none;
  margin: 0.5rem 0 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.pile-browse-modal__empty {
  margin: 0.5rem 0 0 0;
  font-style: italic;
  opacity: 0.7;
}
</style>
