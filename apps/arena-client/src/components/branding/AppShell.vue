<script lang="ts">
import { defineComponent } from 'vue';

import BrandHeader from './Header.vue';
import BrandFooter from './Footer.vue';

// why: top-level layout wrapper for the brand chrome (header / footer)
// per WP-007a Step 5 mounting requirement. AppShell is the outermost
// element rendered by App.vue; brand surface is mounted at the root
// layout boundary so it renders on every route and is never coupled
// to gameplay state. The default <slot /> hosts whatever App.vue's
// router branch renders for the current route.
export default defineComponent({
  name: 'AppShell',
  components: { BrandHeader, BrandFooter },
});
</script>

<template>
  <div class="app-shell" data-testid="app-shell">
    <BrandHeader />
    <div class="app-shell-content">
      <slot />
    </div>
    <BrandFooter />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--la-color-bg-primary);
  color: var(--la-color-text-primary);
}

.app-shell-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
</style>
