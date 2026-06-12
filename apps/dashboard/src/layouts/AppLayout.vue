<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import MockModeBanner from '../components/MockModeBanner.vue';

const THEME_STORAGE_KEY = 'la-dashboard-theme';
const DARK_MODE_CLASS = 'app-dark';
const FULL_LAYOUT_MIN_WIDTH = 1200;
const HIDDEN_LAYOUT_MAX_WIDTH = 768;
const RESIZE_THROTTLE_MS = 150;

interface NavItem {
  to: string;
  label: string;
  abbreviation: string;
}

interface ExternalLink {
  href: string;
  label: string;
  abbreviation: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/overview', label: 'Overview', abbreviation: 'Ov' },
  { to: '/players', label: 'Players', abbreviation: 'Pl' },
  { to: '/monetization', label: 'Monetization', abbreviation: 'Mo' },
  { to: '/gameplay', label: 'Gameplay', abbreviation: 'Ga' },
  { to: '/system', label: 'System Health', abbreviation: 'Sy' },
  { to: '/debug', label: 'Debug', abbreviation: 'De' },
  { to: '/pipeline', label: 'Pipeline', abbreviation: 'Pi' },
];

const EXTERNAL_LINKS: readonly ExternalLink[] = [
  { href: 'https://ewiki.legendary-arena.com', label: 'Eng Wiki', abbreviation: 'Wi' },
];

const router = useRouter();
const authStore = useAuthStore();

const isDark = ref(document.documentElement.classList.contains(DARK_MODE_CLASS));
const isCollapsed = ref(false);
const isHidden = ref(false);
const isMobileMenuOpen = ref(false);

let resizeThrottleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Toggles between the dark and light Aura token sets by flipping PrimeVue's
 * dark-mode selector class, persists the choice, and notifies chart widgets so
 * they can re-read their theme-derived colors.
 */
function toggleTheme(): void {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle(DARK_MODE_CLASS, isDark.value);
  localStorage.setItem(THEME_STORAGE_KEY, isDark.value ? 'dark' : 'light');
  window.dispatchEvent(new CustomEvent('dashboard-theme-change'));
}

/**
 * Maps a viewport width to the sidebar layout tier. Below 768px the sidebar is
 * hidden behind a hamburger; from 768 to 1199px it collapses to icons; at
 * 1200px and above it shows full labels.
 */
function computeLayout(width: number): { collapsed: boolean; hidden: boolean } {
  if (width < HIDDEN_LAYOUT_MAX_WIDTH) {
    return { collapsed: false, hidden: true };
  }
  if (width < FULL_LAYOUT_MIN_WIDTH) {
    return { collapsed: true, hidden: false };
  }
  return { collapsed: false, hidden: false };
}

/**
 * Applies the layout tier for the given width, reassigning reactive state only
 * when a breakpoint boundary is actually crossed so a stream of resize events
 * does not thrash the sidebar.
 */
function applyLayout(width: number): void {
  const next = computeLayout(width);
  if (next.collapsed !== isCollapsed.value) {
    isCollapsed.value = next.collapsed;
  }
  if (next.hidden !== isHidden.value) {
    isHidden.value = next.hidden;
    if (!next.hidden) {
      isMobileMenuOpen.value = false;
    }
  }
}

function handleResize(): void {
  if (resizeThrottleTimer !== null) {
    return;
  }
  resizeThrottleTimer = setTimeout(() => {
    resizeThrottleTimer = null;
    applyLayout(window.innerWidth);
  }, RESIZE_THROTTLE_MS);
}

function toggleMobileMenu(): void {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
}

function handleNavigate(): void {
  if (isHidden.value) {
    isMobileMenuOpen.value = false;
  }
}

function handleLogout(): void {
  // why: WP-241 — the identity-only store carries no broker sign-out flow in
  // scope; clearing the local session drops the bearer token so the router
  // guard (isAuthenticated) routes the operator to the LoginPage. A broker-side
  // logout is a follow-up concern.
  authStore.clearSession();
  router.push({ name: 'login' });
}

onMounted(() => {
  applyLayout(window.innerWidth);
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (resizeThrottleTimer !== null) {
    clearTimeout(resizeThrottleTimer);
  }
});
</script>

<template>
  <div class="app-layout">
    <div v-if="isHidden" class="mobile-bar">
      <button
        type="button"
        class="hamburger"
        aria-label="Toggle navigation"
        @click="toggleMobileMenu"
      >
        <span class="hamburger-lines"></span>
      </button>
      <span class="mobile-title">Legendary Arena</span>
      <button type="button" class="theme-toggle" :aria-pressed="isDark" @click="toggleTheme">
        {{ isDark ? 'Light' : 'Dark' }}
      </button>
    </div>

    <nav
      class="sidebar"
      :class="{ collapsed: isCollapsed, hidden: isHidden, open: isMobileMenuOpen }"
    >
      <div class="sidebar-header">
        <h2>Legendary Arena</h2>
        <span v-if="!isCollapsed" class="subtitle">Dashboard</span>
      </div>

      <ul class="nav-links">
        <li v-for="navItem in NAV_ITEMS" :key="navItem.to">
          <RouterLink :to="navItem.to" :title="navItem.label" @click="handleNavigate">
            <span class="nav-icon">{{ navItem.abbreviation }}</span>
            <span v-if="!isCollapsed" class="nav-label">{{ navItem.label }}</span>
          </RouterLink>
        </li>
        <li v-for="link in EXTERNAL_LINKS" :key="link.href" class="external-link">
          <a :href="link.href" :title="link.label" target="_blank" rel="noopener noreferrer">
            <span class="nav-icon">{{ link.abbreviation }}</span>
            <span v-if="!isCollapsed" class="nav-label">{{ link.label }} ↗</span>
          </a>
        </li>
      </ul>

      <div class="sidebar-footer">
        <button type="button" class="theme-toggle" :aria-pressed="isDark" @click="toggleTheme">
          {{ isCollapsed ? (isDark ? 'L' : 'D') : isDark ? 'Light mode' : 'Dark mode' }}
        </button>
        <button type="button" class="logout-button" @click="handleLogout">
          {{ isCollapsed ? 'Out' : 'Logout' }}
        </button>
      </div>
    </nav>

    <div v-if="isHidden && isMobileMenuOpen" class="scrim" @click="toggleMobileMenu"></div>

    <div class="content-column">
      <MockModeBanner />
      <main class="main-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--p-content-background);
}

.mobile-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1rem;
  background: var(--p-content-background);
  border-bottom: 1px solid var(--p-content-border-color);
}

.mobile-title {
  flex: 1;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--p-text-color);
}

.hamburger {
  background: transparent;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  width: 36px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hamburger-lines,
.hamburger-lines::before,
.hamburger-lines::after {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--p-text-color);
  position: relative;
}

.hamburger-lines::before,
.hamburger-lines::after {
  content: '';
  position: absolute;
}

.hamburger-lines::before {
  top: -5px;
}
.hamburger-lines::after {
  top: 5px;
}

.sidebar {
  width: 240px;
  background: var(--p-content-background);
  color: var(--p-text-color);
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--p-content-border-color);
  transition: width 0.15s ease;
}

.sidebar.collapsed {
  width: 60px;
  padding: 1.5rem 0.5rem;
}

.sidebar.hidden {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}

.sidebar.hidden.open {
  transform: translateX(0);
}

.sidebar-header {
  margin-bottom: 2rem;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--p-text-color);
}

.subtitle {
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.nav-links {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
}

.nav-links li {
  margin-bottom: 0.25rem;
}

.nav-links a {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  color: var(--p-text-muted-color);
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.9rem;
}

.nav-icon {
  flex-shrink: 0;
  width: 1.5rem;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 700;
}

.nav-links a:hover {
  background: var(--p-content-border-color);
  color: var(--p-text-color);
}

.nav-links .external-link {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-content-border-color);
}

.nav-links a.router-link-active {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.sidebar-footer {
  border-top: 1px solid var(--p-content-border-color);
  padding-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.theme-toggle,
.logout-button {
  background: transparent;
  border: 1px solid var(--p-content-border-color);
  color: var(--p-text-muted-color);
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.theme-toggle:hover,
.logout-button:hover {
  background: var(--p-content-border-color);
  color: var(--p-text-color);
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 35;
  background: var(--p-mask-background, color-mix(in srgb, var(--p-text-color) 40%, transparent));
}

/* why: .app-layout is a horizontal (row) flex with align-items:stretch, so a
   bare child stretches to full viewport height. The mock-mode banner must be a
   top strip above the routed page, so banner + main share a vertical column
   that occupies the content area beside the sidebar (fixes WP-226's full-height
   banner; the "one mount line" lock in D-22601 could not express this). */
.content-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.main-content {
  flex: 1;
  padding: 2rem;
  background: var(--p-content-background);
  color: var(--p-text-color);
  overflow-y: auto;
}

/* why: on mobile the sidebar is hidden and a 56px fixed mobile-bar overlays the
   top; the content column (now the sidebar's flow sibling, not main-content)
   clears it so neither the banner nor the page hides under the bar. */
.sidebar.hidden ~ .content-column {
  padding-top: calc(56px + 2rem);
}
</style>
