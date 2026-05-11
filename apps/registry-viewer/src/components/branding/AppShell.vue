<script setup lang="ts">
// Top-level brand shell. Mounts <BrandHeader> above the slot,
// <BrandFooter> below; the slot hosts the existing App.vue body
// (cards / themes / loadout views, tab switcher, filter bars).
//
// Per WP-007b §Step 5 mount-point rule: the shell renders in every
// view, never duplicates, and never reads from registry / R2 fetch
// state / tab-switcher state. No data-pipeline imports.
import Header from './Header.vue';
import Footer from './Footer.vue';
</script>

<template>
  <div class="app-shell">
    <Header />
    <main class="app-shell-main">
      <slot />
    </main>
    <Footer />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--la-color-bg-primary);
}

.app-shell-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
