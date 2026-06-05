<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
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
    showLabel: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  setup(props) {
    // why: tracks broken image loads so the tile falls back to text mode
    // instead of rendering a black rectangle on the dark card background
    const imageLoadFailed = ref(false);

    function hasImage(): boolean {
      return !!props.display.imageUrl && !imageLoadFailed.value;
    }

    function onImageError(): void {
      imageLoadFailed.value = true;
    }

    function shouldShowCostBadge(): boolean {
      return props.showCost && props.display.cost !== null;
    }

    return { hasImage, onImageError, shouldShowCostBadge };
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
      @error="onImageError"
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
    <!-- why: card name + cost below the image so players can read the card
         identity without relying on hover tooltips or squinting at tiny art -->
    <div
      v-if="hasImage() && showLabel"
      class="card-tile__label"
      data-testid="card-tile-label"
    >
      <span class="card-tile__label-name">{{ display.name }}</span>
      <span v-if="shouldShowCostBadge()" class="card-tile__label-cost">
        {{ display.cost }}
      </span>
    </div>
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
  padding: 0.35rem;
  text-align: center;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-sizing: border-box;
}

.card-tile__name {
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  color: #fff;
  text-transform: capitalize;
}

.card-tile__cost-text {
  font-size: 0.7rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #ffd700;
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

.card-tile__label {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  padding: 0.15rem 0.25rem;
  background: rgba(0, 0, 0, 0.65);
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}

.card-tile__label-name {
  font-size: 0.6rem;
  font-weight: 600;
  line-height: 1.2;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.card-tile__label-cost {
  font-size: 0.55rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #ffd700;
  flex-shrink: 0;
}
</style>
