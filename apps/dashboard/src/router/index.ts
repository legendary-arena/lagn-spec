import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import type { UserRole } from '../types/index.js';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    roles?: UserRole[];
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
          meta: { roles: ['admin', 'operator', 'finance', 'support'] },
        },
        {
          path: 'players',
          name: 'players',
          component: () => import('../pages/players/PlayerAnalyticsPage.vue'),
          meta: { roles: ['admin', 'operator', 'support'] },
        },
        {
          path: 'monetization',
          name: 'monetization',
          component: () => import('../pages/monetization/MonetizationPage.vue'),
          meta: { roles: ['admin', 'finance'] },
        },
        {
          path: 'gameplay',
          name: 'gameplay',
          component: () => import('../pages/gameplay/GameplayPage.vue'),
          meta: { roles: ['admin', 'operator'] },
        },
        {
          path: 'system',
          name: 'system',
          component: () => import('../pages/system/SystemHealthPage.vue'),
          meta: { roles: ['admin'] },
        },
        {
          path: 'debug',
          name: 'debug',
          component: () => import('../pages/debug/DebugPage.vue'),
          meta: { roles: ['admin', 'operator'] },
        },
      ],
    },
  ],
});

function hasRequiredRole(userRoles: UserRole[], routeRoles: UserRole[] | undefined): boolean {
  if (!routeRoles || routeRoles.length === 0) {
    return true;
  }
  for (const role of routeRoles) {
    if (userRoles.includes(role)) {
      return true;
    }
  }
  return false;
}

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

  if (!hasRequiredRole(authStore.user?.roles ?? [], to.meta.roles)) {
    return { name: 'overview' };
  }

  return true;
});
