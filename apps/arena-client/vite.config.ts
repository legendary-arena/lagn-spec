import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// why: build.sourcemap is enabled so that first-time bootstrap failures are
// diagnosable against the original TypeScript / Vue source rather than the
// minified bundle. Revisit in a future packet once the app grows and the
// sourcemap size becomes a production concern.

// why: D-14401 ("Boundary Leakage" failure class) — the engine package
// runtime entry (`@legendary-arena/game-engine` = `.` subpath) is the
// Runtime-Safe Engine Surface and contains zero `node:*` imports
// transitively reachable. The Setup-Tooling Surface (`./setup` subpath)
// holds every Node-IO module (scoringConfigLoader + par.storage) and is
// Node-only. arena-client must NEVER import from
// `@legendary-arena/game-engine/setup`. This `onwarn` handler is one of
// three independent enforcement layers (subpath exports + this hard-fail
// + arena-client tsconfig path guard); it converts any silent
// `node:*` externalization regression into a build failure. The handler
// MUST `throw`, not `console.warn` — silent regressions defeat structural
// enforcement and were exactly what the pre-WP `stubParStoragePlugin`
// workaround masked.
function failOnNodeExternalization(warning: { code?: string; message?: string; source?: string; id?: string }): void {
  const message = warning.message ?? '';
  const source = warning.source ?? '';
  const isNodeUnresolved =
    warning.code === 'UNRESOLVED_IMPORT' && source.startsWith('node:');
  const isNodeExternalized =
    message.includes('__vite-browser-external') ||
    /externalized.*node:/.test(message);
  if (isNodeUnresolved || isNodeExternalized) {
    throw new Error(
      'Boundary Leakage detected (D-14401): arena-client production build ' +
      'tried to bundle a `node:*` import. The Runtime-Safe Engine Surface ' +
      '(`@legendary-arena/game-engine`) must not transitively reach Node-IO ' +
      'modules. If a new Node-IO surface was added to the engine, author it ' +
      'under `packages/game-engine/src/setup-tooling/` and consume it via ' +
      '`@legendary-arena/game-engine/setup` from server / CLI code only. ' +
      `Original Rollup warning: code=${warning.code ?? 'n/a'} ` +
      `source=${source || 'n/a'} message=${message}`,
    );
  }
}

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        failOnNodeExternalization(warning);
        defaultHandler(warning);
      },
    },
  },
});