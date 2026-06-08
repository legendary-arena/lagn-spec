// why: ESLint 8 loads its legacy config as CommonJS even inside a
// "type": "module" package, so this config file is `.cjs` — the one
// sanctioned CJS exception in this ESM project (mirrors the pattern in
// apps/registry-viewer/.eslintrc.cjs). The ruleset is intentionally lean:
// recommended TypeScript + Vue 3 rules, with `eslint-config-prettier` last
// in `extends` so formatting is owned by Prettier, not ESLint.
/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
    extraFileExtensions: ['.vue'],
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    '@vue/eslint-config-typescript',
    // why: must be LAST — turns off every ESLint rule that would fight
    // Prettier's formatting, so the two gates never disagree.
    'prettier',
  ],
  rules: {
    // why: the dashboard ingests untyped analytics + mock JSON through
    // permissive shapes; a focused `any`-elimination pass belongs in its
    // own change, not as a day-one blocker on the lint gate.
    '@typescript-eslint/no-explicit-any': 'off',
    // why: Vue 3 permits single-word names for unambiguous custom
    // components (App, KpiCard, AlertsPanel). None collide with native
    // HTML elements in this project.
    'vue/multi-word-component-names': 'off',
    // why: stray console.log/info/debug surface as WARNINGS (visible but
    // non-blocking) so debug traces don't silently accumulate; warn/error
    // stay allowed for genuine operator-facing failures. The dashboard has
    // no devLog gate yet — promote to 'error' once one exists.
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // why: an underscore prefix (`_nowMs`) is this project's deliberate
    // "intentionally unused" marker — honor it so the convention isn't
    // flagged as a false positive.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.config.ts',
    '*.config.js',
    // why: generated build-time governance snapshot, not hand-authored source.
    'src/data/*.json',
  ],
};
