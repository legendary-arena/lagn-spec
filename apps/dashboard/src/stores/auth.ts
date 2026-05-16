import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AuthUser } from '../types/index.js';

const STORAGE_KEY = 'dashboard_auth_user';

function loadPersistedUser(): AuthUser | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as AuthUser;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(loadPersistedUser());

  const isAuthenticated = computed(() => user.value !== null);

  function login(authUser: AuthUser): void {
    user.value = authUser;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
  }

  function logout(): void {
    user.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  return { user, isAuthenticated, login, logout };
});
