<script lang="ts">
import { defineComponent } from 'vue';
import VersionBadge from './VersionBadge.vue';

export default defineComponent({
  name: 'BrandFooter',
  components: { VersionBadge },
});
</script>

<template>
  <footer class="brand-footer" data-testid="brand-footer">
    <span class="brand-footer-copyright">
      &copy; 2026
      <a class="brand-footer-link" href="https://www.legendary-arena.com">
        Legendary Arena
      </a>
    </span>
    <VersionBadge />
  </footer>
</template>

<style scoped>
.brand-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--la-space-3);
  padding: var(--la-space-4) var(--la-space-5);
  background: var(--la-color-bg-primary);
  color: var(--la-color-text-secondary);
  border-top: 1px solid var(--la-color-border-subtle);
  font-family: var(--la-font-body);
  font-size: var(--la-font-size-small);
}

.brand-footer-link {
  color: var(--la-color-text-secondary);
  text-decoration: underline;
}

.brand-footer-link:hover,
.brand-footer-link:focus-visible {
  color: var(--la-color-cta);
}
</style>
