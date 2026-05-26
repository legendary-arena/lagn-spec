import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');

// why: git may be unavailable in CI shallow clones or ZIP deploys
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  console.warn('[build] Could not resolve git SHA — using "unknown".');
}

export default defineConfig({
  plugins: [vue()],
  // why: these are build-time constants replaced by Vite, not runtime globals
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
});
