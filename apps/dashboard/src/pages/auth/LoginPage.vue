<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import type { AuthUser, UserRole } from '../../types/index.js';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const email = ref('');
const selectedRole = ref<UserRole>('admin');
const isSubmitting = ref(false);

const roles: UserRole[] = ['admin', 'operator', 'finance', 'support'];

async function handleLogin(): Promise<void> {
  if (!email.value.trim()) {
    return;
  }
  isSubmitting.value = true;

  const mockUser: AuthUser = {
    id: 'user-1',
    email: email.value.trim(),
    name: email.value.split('@')[0] ?? 'User',
    roles: [selectedRole.value],
  };

  authStore.login(mockUser);

  const redirect = typeof route.query.redirect === 'string'
    ? route.query.redirect
    : '/overview';

  await router.push(redirect);
  isSubmitting.value = false;
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>Legendary Arena</h1>
      <p class="subtitle">Admin Dashboard</p>

      <form @submit.prevent="handleLogin" class="login-form">
        <label for="email">Email</label>
        <input
          id="email"
          v-model="email"
          type="email"
          placeholder="operator@legendary-arena.com"
          required
          autocomplete="email"
        />

        <label for="role">Role (mock)</label>
        <select id="role" v-model="selectedRole">
          <option v-for="role in roles" :key="role" :value="role">
            {{ role }}
          </option>
        </select>

        <button type="submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>

      <p class="mock-note">Mock mode — any email will be accepted.</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f1f5f9;
}

.login-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 2.5rem;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.login-card h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #0f172a;
}

.subtitle {
  color: #64748b;
  margin: 0.25rem 0 2rem;
  font-size: 0.9rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 0.5rem;
}

.login-form label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  margin-top: 0.5rem;
}

.login-form input,
.login-form select {
  padding: 0.6rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
}

.login-form button {
  margin-top: 1.5rem;
  padding: 0.7rem;
  background: #3b82f6;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.login-form button:hover { background: #2563eb; }
.login-form button:disabled { background: #94a3b8; cursor: not-allowed; }

.mock-note {
  margin-top: 1.5rem;
  font-size: 0.75rem;
  color: #94a3b8;
}
</style>
