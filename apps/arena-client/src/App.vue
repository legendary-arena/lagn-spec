<script lang="ts">
import {
  defineAsyncComponent,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  provide,
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
import {
  getCurrentTokenFromHandle,
  initializeHankoClient,
  subscribeToSessionEvents,
} from './auth/hankoClient';
import { useAuthStore } from './stores/auth';

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

// why: WP-160 — LoginPage is the production sign-in surface at
// ?route=login. Lazy-loaded for the same bundle-size reason as the
// other routed pages; the broker SDK bundle is only fetched when the
// LoginPage (or a guarded-route bootstrap) needs it.
const LoginPage = defineAsyncComponent(
  () => import('./pages/LoginPage.vue'),
);

type AppRoute =
  | 'fixture'
  | 'play-fixture'
  | 'live'
  | 'lobby'
  | 'profile'
  | 'me'
  | 'admin-billing'
  | 'login';

interface LiveRouteParams {
  matchID: string;
  playerID: string;
  credentials: string;
}

interface ParsedQuery {
  fixtureName: string | null;
  playFixture: boolean;
  live: LiveRouteParams | null;
  profileHandle: string | null;
  meRoute: boolean;
  adminBillingRoute: boolean;
  loginRoute: boolean;
  returnTo: string | null;
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
  // WP-160 — `?route=login` is the sign-in surface (D-16008); the
  // companion `?returnTo=<route>` carries the originally-requested
  // guarded route so the LoginPage can navigate back on sign-in success.
  const routeParam = readQueryParam(params, 'route');
  const meRoute = routeParam === 'me';
  const adminBillingRoute = routeParam === 'admin-billing';
  const loginRoute = routeParam === 'login';
  // why: dev-only route — `?fixture=mid-turn&play=1` renders PlayViewport
  // instead of ArenaHud so the gameplay mat can be previewed with fixture data
  const playFixture = params.get('play') === '1';
  const returnTo = readQueryParam(params, 'returnTo');

  return {
    fixtureName,
    playFixture,
    live,
    profileHandle,
    meRoute,
    adminBillingRoute,
    loginRoute,
    returnTo,
  };
}

function selectRoute(parsed: ParsedQuery): AppRoute {
  // why: route discriminator precedence is
  // `admin-billing > me > login > profile > fixture > live > lobby`.
  // Explicit `?route=` values take priority over every other query
  // param so the targeted surface always wins when the user has
  // navigated to it (e.g., a stale `?match=` left over from a past
  // session must not shadow the explicit route). `login` slots in
  // between `me` and `profile` so an explicit `?route=login` always
  // wins over a leftover `?profile=` from a past navigation
  // (WP-160 §F + Locked Values precedence).
  if (parsed.adminBillingRoute === true) {
    return 'admin-billing';
  }
  if (parsed.meRoute === true) {
    return 'me';
  }
  if (parsed.loginRoute === true) {
    return 'login';
  }
  if (parsed.profileHandle !== null) {
    return 'profile';
  }
  if (parsed.fixtureName !== null && parsed.playFixture) {
    return 'play-fixture';
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

function readTenantBaseUrl(): string {
  // why: import.meta.env is Vite-provided; under the node:test runner
  // there is no Vite transform, so the property may be undefined.
  // Optional chaining keeps this safe; the empty-string default below
  // routes guarded-route bootstraps directly to the LoginPage's
  // 'unavailable' branch without attempting a broker call.
  return (import.meta.env?.VITE_HANKO_TENANT_BASE_URL ?? '') as string;
}

export default defineComponent({
  name: 'App',
  components: {
    AppShell,
    ArenaHud,
    LobbyView,
    PlayViewport,
    PlayerProfilePage,
    MyProfilePage,
    AdminBillingPage,
    LoginPage,
  },
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
    const initialRoute = selectRoute(parsed);
    const route = ref<AppRoute>(initialRoute);
    const returnTo = ref<string | null>(parsed.returnTo);
    const liveParams = parsed.live;

    const matchID = liveParams?.matchID ?? '';
    const playerID = liveParams?.playerID ?? '';
    const profileHandle = parsed.profileHandle ?? '';

    const liveClient = ref<LiveClientHandle | null>(null);
    // why: `import.meta.env` is Vite-provided; in the node:test runner there
    // is no Vite transform, so the property is undefined. Optional chaining
    // keeps tests (and any non-Vite consumer) from crashing at setup time.
    const isDev = Boolean(import.meta.env?.DEV);

    // why: WP-160 — guarded-route bootstrap. When the user lands on a
    // guarded route (`me`, `admin-billing`), App.vue must check for a
    // cached broker session before rendering the page. If no session,
    // mutate the local route to `'login'` (one-shot — NOT a reactive
    // watch) and pass the original route to LoginPage via `returnTo` so
    // sign-in success can navigate back. The render is gated on
    // `isAuthBootstrapping` so the user never sees a flash of the
    // guarded page with an empty auth store. The URL bar stays at the
    // original `?route=me`; only the rendered component differs until
    // the LoginPage's full-reload navigation re-runs this setup with
    // the cached cookie populated.
    const isAuthBootstrapping = ref(
      initialRoute === 'me' || initialRoute === 'admin-billing',
    );

    // why: isAuthBootstrapping is provided via Vue provide/inject (D-17501)
    // so the BrandHeader's useAuthNav composable can read it without
    // extending the Pinia auth store. The bootstrapping state is a transient
    // app-lifecycle concern, not a durable auth-session property.
    provide('isAuthBootstrapping', isAuthBootstrapping);

    if (isAuthBootstrapping.value === true) {
      const tenantBaseUrl = readTenantBaseUrl();
      if (tenantBaseUrl === '') {
        // No tenant configured (test runs, missing build-time env);
        // route immediately to the LoginPage's 'unavailable' state.
        returnTo.value = initialRoute;
        route.value = 'login';
        isAuthBootstrapping.value = false;
      } else {
        void (async () => {
          try {
            const handle = await initializeHankoClient({ tenantBaseUrl });
            const token = getCurrentTokenFromHandle(handle);
            if (token === null) {
              returnTo.value = initialRoute;
              route.value = 'login';
              return;
            }
            useAuthStore().bootstrapFromCachedToken(token);
            subscribeToSessionEvents(handle, {
              onSessionCreated: () => {
                // why: sign-in already happened on the LoginPage's
                // navigation back to this guarded route; App.vue's
                // subscription only cares about the expiry/logout
                // side. Re-firing setSession here would be redundant.
              },
              onSessionExpired: () => {
                useAuthStore().clearSession();
              },
              onUserLoggedOut: () => {
                useAuthStore().clearSession();
              },
            });
          } catch {
            // Broker initialization failed (network, bundle load,
            // tenant unreachable) — fall back to the LoginPage's
            // 'unavailable' surface. The underlying error is swallowed
            // inside the wrapper per D-16009.
            returnTo.value = initialRoute;
            route.value = 'login';
          } finally {
            isAuthBootstrapping.value = false;
          }
        })();
      }
    }

    onMounted(() => {
      if (route.value === 'live' && liveParams !== null) {
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
      returnTo,
      isAuthBootstrapping,
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
      <template v-if="isAuthBootstrapping">
        <p
          class="app-auth-bootstrapping"
          data-testid="app-auth-bootstrapping"
        >
          Preparing sign-in…
        </p>
      </template>
      <template v-else-if="route === 'admin-billing'">
        <AdminBillingPage />
      </template>
      <template v-else-if="route === 'me'">
        <MyProfilePage />
      </template>
      <template v-else-if="route === 'login'">
        <LoginPage :return-to="returnTo" />
      </template>
      <template v-else-if="route === 'profile'">
        <PlayerProfilePage :handle="profileHandle" />
      </template>
      <template v-else-if="route === 'play-fixture'">
        <PlayViewport :submit-move="submitMove" />
      </template>
      <template v-else-if="route === 'fixture'">
        <ArenaHud />
      </template>
      <template v-else-if="route === 'live'">
        <!-- why: additive matchId prop-drill (D-16501) — binds the
             already-parsed live matchID so PlayDesktop can probe autoplay
             status. No query-parsing / route change, no ?autoplay key. -->
        <PlayViewport :submit-move="submitMove" :match-id="matchID" />
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

.app-auth-bootstrapping {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.95rem;
  opacity: 0.75;
}
</style>
