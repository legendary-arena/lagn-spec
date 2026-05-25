<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { UICardDisplay } from '@legendary-arena/game-engine';

/**
 * Reusable card tile — renders either a card image (when imageUrl is truthy)
 * or a text fallback (when imageUrl is falsy). Single rendering surface for
 * all play-surface cards per WP-178.
 */
export default defineComponent({
  name: 'CardTile',
  props: {
    display: {
      type: Object as PropType<UICardDisplay>,
      required: true,
    },
    size: {
      type: String as PropType<'sm' | 'md' | 'lg'>,
      required: false,
      default: 'md',
    },
    showCost: {
      type: Boolean,
      required: false,
      default: true,
    },
    interactive: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  setup(props) {
    function hasImage(): boolean {
      // why: falsy check catches both empty string and undefined/null — no
      // broken image placeholders are ever rendered
      return !!props.display.imageUrl;
    }

    function shouldShowCostBadge(): boolean {
      return props.showCost && props.display.cost !== null;
    }

    return { hasImage, shouldShowCostBadge };
  },
});
</script>

<template>
  <div
    class="card-tile"
    :class="[
      `card-tile--${size}`,
      { 'card-tile--interactive': interactive },
    ]"
    :title="display.name"
    data-testid="card-tile"
    :data-card-ext-id="display.extId"
  >
    <!-- why: loading="lazy" reserves bandwidth for visible cards; off-screen
         card images load only when scrolled into view -->
    <img
      v-if="hasImage()"
      :src="display.imageUrl"
      :alt="display.name"
      loading="lazy"
      class="card-tile__image"
      data-testid="card-tile-image"
    />
    <div
      v-else
      class="card-tile__fallback"
      data-testid="card-tile-fallback"
    >
      <span class="card-tile__name">{{ display.name }}</span>
      <span
        v-if="display.cost !== null"
        class="card-tile__cost-text"
      >
        Cost: {{ display.cost }}
      </span>
    </div>
    <span
      v-if="hasImage() && shouldShowCostBadge()"
      class="card-tile__cost-badge"
      data-testid="card-tile-cost-badge"
    >
      {{ display.cost }}
    </span>
  </div>
</template>

<style scoped>
.card-tile {
  position: relative;
  aspect-ratio: 5 / 7;
  overflow: hidden;
  border-radius: 4px;
  background: var(--color-card-bg, #1a1a2e);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-tile--sm {
  width: 60px;
}

.card-tile--md {
  width: 90px;
}

.card-tile--lg {
  width: 120px;
}

.card-tile--interactive {
  cursor: pointer;
  transition: transform 0.15s ease;
}

.card-tile--interactive:hover {
  transform: scale(1.05);
}

.card-tile__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.card-tile__fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.25rem;
  text-align: center;
  width: 100%;
  height: 100%;
}

.card-tile__name {
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  color: var(--color-foreground, #eee);
}

.card-tile__cost-text {
  font-size: 0.6rem;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
  color: var(--color-foreground, #ccc);
}

.card-tile__cost-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 0 0.2rem;
}
</style>
