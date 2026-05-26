<script setup lang="ts">
const appVersion = __APP_VERSION__;
const gitSha = __GIT_SHA__;
const formattedDate = new Date(__BUILD_TIMESTAMP__).toLocaleDateString('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
</script>

<template>
  <div class="version-badge">
    v{{ appVersion }} &middot; {{ gitSha }} &middot; {{ formattedDate }}
  </div>
</template>

<style scoped>
.version-badge {
  position: fixed;
  bottom: 4px;
  right: 8px;
  font-size: 11px;
  font-family: monospace;
  opacity: 0.5;
  color: #aaa;
  background: transparent;
  pointer-events: none;
  user-select: none;
  z-index: 50;
}
</style>
