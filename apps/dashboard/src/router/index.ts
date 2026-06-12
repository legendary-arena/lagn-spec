import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/auth/LoginPage.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('../layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/overview',
        },
        {
          path: 'overview',
          name: 'overview',
          component: () => import('../pages/dashboard/OverviewPage.vue'),
        },
        {
          path: 'players',
          name: 'players',
          component: () => import('../pages/players/PlayerAnalyticsPage.vue'),
        },
        {
          path: 'monetization',
          name: 'monetization',
          component: () => import('../pages/monetization/MonetizationPage.vue'),
        },
        {
          path: 'gameplay',
          name: 'gameplay',
          component: () => import('../pages/gameplay/GameplayPage.vue'),
        },
        {
          path: 'system',
          name: 'system',
          component: () => import('../pages/system/SystemHealthPage.vue'),
        },
        {
          path: 'debug',
          name: 'debug',
          component: () => import('../pages/debug/DebugPage.vue'),
        },
        {
          path: 'pipeline',
          name: 'pipeline',
          component: () => import('../pages/pipeline/PipelinePage.vue'),
        },
      ],
    },
  ],
});

router.beforeEach((to: RouteLocationNormalized) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth === false) {
    if (authStore.isAuthenticated) {
      return { name: 'overview' };
    }
    return true;
  }

  if (!authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  // why: WP-241 / D-24004 — routing gates PURELY on `isAuthenticated`
  // (token !== null). Role-based routing is retired (no `roles` meta, no
  // per-route role check); admin role-scoping is a server-side concern deferred
  // to a follow-up WP. The Cloudflare Access gate (WP-197) remains the
  // operator-reachability boundary in front of the deploy.
  return true;
});
