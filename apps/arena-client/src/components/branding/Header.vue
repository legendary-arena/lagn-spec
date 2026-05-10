<script lang="ts">
import { defineComponent } from 'vue';

// why: defineComponent (NOT <script setup>) matches the established
// arena-client convention under the @legendary-arena/vue-sfc-loader
// separate-compile pipeline (D-6512 / P6-30). Even though this
// component has no setup-time bindings, keeping the convention
// uniform avoids per-component decisions about which compile mode
// is active.
export default defineComponent({
  name: 'BrandHeader',
});
</script>

<template>
  <header class="brand-header" data-testid="brand-header">
    <a class="brand-wordmark" href="https://www.legendary-arena.com">
      Legendary Arena
    </a>
    <nav class="brand-nav" aria-label="Site navigation">
      <a class="brand-nav-link" href="https://www.legendary-arena.com">Home</a>
      <a class="brand-nav-link" href="https://cards.barefootbetters.com">
        Cards
      </a>
    </nav>
  </header>
</template>

<style scoped>
.brand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--la-space-5);
  padding: var(--la-space-4) var(--la-space-5);
  background: var(--la-color-bg-primary);
  color: var(--la-color-text-primary);
  border-bottom: 1px solid var(--la-color-border-subtle);
}

.brand-wordmark {
  font-family: var(--la-font-display);
  font-size: var(--la-font-size-h4);
  letter-spacing: var(--la-letter-spacing-display);
  text-transform: uppercase;
  color: var(--la-color-text-primary);
  text-decoration: none;
}

.brand-wordmark:hover,
.brand-wordmark:focus-visible {
  color: var(--la-color-cta);
}

.brand-nav {
  display: flex;
  gap: var(--la-space-5);
}

.brand-nav-link {
  font-family: var(--la-font-body);
  font-size: var(--la-font-size-body);
  color: var(--la-color-text-secondary);
  text-decoration: none;
}

.brand-nav-link:hover,
.brand-nav-link:focus-visible {
  color: var(--la-color-cta);
}
</style>
