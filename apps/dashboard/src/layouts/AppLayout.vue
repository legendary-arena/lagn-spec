<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const authStore = useAuthStore();

function handleLogout(): void {
  authStore.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-layout">
    <nav class="sidebar">
      <div class="sidebar-header">
        <h2>Legendary Arena</h2>
        <span class="subtitle">Dashboard</span>
      </div>
      <ul class="nav-links">
        <li><RouterLink to="/overview">Overview</RouterLink></li>
        <li><RouterLink to="/players">Players</RouterLink></li>
        <li><RouterLink to="/monetization">Monetization</RouterLink></li>
        <li><RouterLink to="/gameplay">Gameplay</RouterLink></li>
        <li><RouterLink to="/system">System Health</RouterLink></li>
        <li><RouterLink to="/debug">Debug</RouterLink></li>
      </ul>
      <div class="sidebar-footer">
        <span class="user-email">{{ authStore.user?.email }}</span>
        <button class="logout-button" @click="handleLogout">Logout</button>
      </div>
    </nav>
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 240px;
  background: #1e293b;
  color: #e2e8f0;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  margin-bottom: 2rem;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #f8fafc;
}

.subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
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
  display: block;
  padding: 0.6rem 0.75rem;
  color: #cbd5e1;
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.9rem;
}

.nav-links a:hover {
  background: #334155;
  color: #f8fafc;
}

.nav-links a.router-link-active {
  background: #3b82f6;
  color: #ffffff;
}

.sidebar-footer {
  border-top: 1px solid #334155;
  padding-top: 1rem;
}

.user-email {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-bottom: 0.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logout-button {
  background: none;
  border: 1px solid #475569;
  color: #94a3b8;
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.logout-button:hover {
  background: #334155;
  color: #f8fafc;
}

.main-content {
  flex: 1;
  padding: 2rem;
  background: #f8fafc;
  overflow-y: auto;
}
</style>
