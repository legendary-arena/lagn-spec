<script lang="ts">
import {
  defineAsyncComponent,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';

import ArenaHud from './components/hud/ArenaHud.vue';
import AppShell from './components/branding/AppShell.vue';
import LobbyView from './lobby/LobbyView.vue';
import PlayViewport from './pages/PlayViewport.vue';
import {
  createLiveClient,
  type LiveClientHandle,
} from './client/bgioClient';
import { serverUrl } from './lobby/lobbyApi';
import type {
  SubmitMove,
  UiMoveName,
} from './components/play/uiMoveName.types';

// why: PlayerProfilePage is lazy-loaded via defineAsyncComponent so the
// public-profile branch (?profile=<handle>) does not increase the
// live-match path's bundle size. The component is only fetched when
// route === 'profile' renders for the first time. Mirrors the
// per-route lazy-load pattern documented for future routed pages
// (PS-2 / WP-102 §F).
const PlayerProfilePage = defineAsyncComponent(
  () => import('./pages/PlayerProfilePage.vue'),
);

// why: WP-104 — MyProfilePage is the owner-edit surface at ?route=me.
// Lazy-loaded for the same bundle-size reason as PlayerProfilePage;
// the component is only fetched when route === 'me' renders for the
// first time.
const MyProfilePage = defineAsyncComponent(
  () => import('./pages/MyProfilePage.vue'),
);

// why: WP-110 — AdminBillingPage is the admin billing visibility surface
// at ?route=admin-billing. Lazy-loaded for the same bundle-size reason
// as the other routed pages.
const AdminBillingPage = defineAsyncComponent(
  () => import('./pages/AdminBillingPage.vue'),
);

type AppRoute = 'fixture' | 'live' | 'lobby' | 'profile' | 'me' | 'admin-billing';

interface LiveRouteParams {
  matchID: string;
  playerID: string;
  credentials: string;
}

interface ParsedQuery {
  fixtureName: string | null;
  live: LiveRouteParams | null;
  profileHandle: string | null;
  meRoute: boolean;
  adminBillingRoute: boolean;
}

// why: defineComponent({ setup() { return {...} } }) is required (NOT
// <script setup>) because the template references non-prop bindings — the
// `route`, `matchID`, `playerID`, and `hasSnapshot` values — that under the
// @legendary-arena/vue-sfc-loader separate-compile pipeline only reach
// `_ctx` when explicitly returned from setup() (D-6512 / P6-30; precedent
// matches ArenaHud + ReplayFileLoader).

function readQueryParam(
  params: URLSearchParams,
  key: string,
): string | null {
  const value = params.get(key);
  if (value === null || value === '') {
    return null;
  }
  return value;
}

function parseQuery(search: string): ParsedQuery {
  const params = new URLSearchParams(search);

  const fixtureName = readQueryParam(params, 'fixture');

  const matchID = readQueryParam(params, 'match');
  const playerID = readQueryParam(params, 'player');
  const credentials = readQueryParam(params, 'credentials');

  let live: LiveRouteParams | null = null;
  if (matchID !== null && playerID !== null && credentials !== null) {
    live = { matchID, playerID, credentials };
  }

  const profileHandle = readQueryParam(params, 'profile');

  // why: WP-104 — `?route=me` is the owner-edit surface. We look for the
  // literal `me` value to avoid false-positive matches on stale `?route=`
  // values left over from past sessions; future surfaces will extend the
  // closed set here rather than introducing per-feature query keys.
  const routeParam = readQueryParam(params, 'route');
  const meRoute = routeParam === 'me';
  const adminBillingRoute = routeParam === 'admin-billing';

  return { fixtureName, live, profileHandle, meRoute, adminBillingRoute };
}

function selectRoute(parsed: ParsedQuery): AppRoute {
  // why: route discriminator precedence is
  // `admin-billing > me > profile > fixture > live > lobby`.
  // Explicit `?route=` values take priority over every other query
  // param so the targeted surface always wins when the user has
  // navigated to it (e.g., a stale `?match=` left over from a past
  // session must not shadow the explicit route). The
  // `profile > fixture > live > lobby` ordering below remains
  // unchanged from WP-102.
  if (parsed.adminBillingRoute === true) {
    return 'admin-billing';
  }
  if (parsed.meRoute === true) {
    return 'me';
  }
  if (parsed.profileHandle !== null) {
    return 'profile';
  }
  if (parsed.fixtureName !== null) {
    return 'fixture';
  }
  if (parsed.live !== null) {
    return 'live';
  }
  // why: missing or empty `match`/`player`/`credentials` fall back to the
  // lobby silently. Half-mounting the live branch with partial params would
  // propagate undefined strings into boardgame.io and into the URL, so the
  // admission gate rejects any incomplete set (matches WP-061's fixture
  // silent-no-op precedent).
  return 'lobby';
}

export default defineComponent({
  name: 'App',
  components: { AppShell, ArenaHud, LobbyView, PlayViewport, PlayerProfilePage, MyProfilePage, AdminBillingPage },
  props: {
    // why: `searchOverride` is a testing seam. Production callers never pass
    // it — `null` means "read from window.location.search at setup time".
    // Tests inject the query string directly because jsdom's window.location
    // is non-configurable, which rules out redefining it per-test.
    searchOverride: {
      type: String as () => string | null,
      default: null,
    },
  },
  setup(props) {
    const rawSearch =
      props.searchOverride ??
      (typeof window !== 'undefined' ? window.location.search : '');
    const parsed = parseQuery(rawSearch);
    const route: AppRoute = selectRoute(parsed);
    const liveParams = parsed.live;

    const matchID = liveParams?.matchID ?? '';
    const playerID = liveParams?.playerID ?? '';
    const profileHandle = parsed.profileHandle ?? '';

    const liveClient = ref<LiveClientHandle | null>(null);
    // why: `import.meta.env` is Vite-provided; in the node:test runner there
    // is no Vite transform, so the property is undefined. Optional chaining
    // keeps tests (and any non-Vite consumer) from crashing at setup time.
    const isDev = Boolean(import.meta.env?.DEV);

    onMounted(() => {
      if (route === 'live' && liveParams !== null) {
        const handle = createLiveClient({
          matchID: liveParams.matchID,
          playerID: liveParams.playerID,
          credentials: liveParams.credentials,
          serverUrl,
        });
        handle.start();
        liveClient.value = handle;
      }
    });

    onBeforeUnmount(() => {
      const handle = liveClient.value;
      if (handle !== null) {
        handle.stop();
        liveClient.value = null;
      }
    });

    // why: prop-drill submitMove into <PlayView> rather than letting the
    // play components reach into the live client factory. Components stay
    // pure and prop-driven for testability (a stub function is enough);
    // the bgioClient remains the sole runtime engine-import site per the
    // WP-090 grep invariant. The closure reads liveClient.value at call
    // time so clicks before mount silently no-op rather than crashing.
    const submitMove: SubmitMove = (name: UiMoveName, args: unknown): void => {
      liveClient.value?.submitMove(name, args);
    };

    return {
      route,
      matchID,
      playerID,
      profileHandle,
      isDev,
      submitMove,
    };
  },
});
</script>

<template>
  <AppShell>
    <main data-testid="app-root" :data-route="route">
      <template v-if="route === 'admin-billing'">
        <AdminBillingPage />
      </template>
      <template v-else-if="route === 'me'">
        <MyProfilePage />
      </template>
      <template v-else-if="route === 'profile'">
        <PlayerProfilePage :handle="profileHandle" />
      </template>
      <template v-else-if="route === 'fixture'">
        <ArenaHud />
      </template>
      <template v-else-if="route === 'live'">
        <PlayViewport :submit-move="submitMove" />
        <footer
          v-if="isDev"
          class="live-diagnostics"
          data-testid="app-live-diagnostics"
        >
          <span>match: {{ matchID }}</span>
          <span>player: {{ playerID }}</span>
        </footer>
      </template>
      <template v-else>
        <LobbyView />
      </template>
    </main>
  </AppShell>
</template>

<style scoped>
.live-diagnostics {
  display: flex;
  gap: 1rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  opacity: 0.65;
}
</style>
