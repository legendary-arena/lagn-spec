import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { useUiStateStore } from './stores/uiState';
import { loadUiStateFixture, isFixtureName } from './fixtures/uiState/index';
import { installDiagnosticCapture } from './diagnostics/diagnostics';
import './styles/base.css';

installDiagnosticCapture();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// why: dev-only URL-based fixture selection is the team's reproducible
// bug-report mechanism — a bug reporter pastes
// http://localhost:5173/?fixture=mid-turn into a PR comment and every
// reviewer reproduces the same store state. The entire branch is gated
// on `import.meta.env.DEV`, which Vite statically replaces with `true`
// or `false` at build time, so production builds dead-code-eliminate
// the whole `if` block. The unique string
// `__WP061_DEV_FIXTURE_HARNESS__` below is the grep target for the
// production-build DCE verification in EC-067 — never grep for the
// fixture names themselves, because the JSON imports survive
// minification independently of this branch. Unknown `?fixture=`
// values are a silent no-op (never a throw) so malformed query
// strings cannot crash the dev bootstrap.
if (import.meta.env.DEV) {
  const devFixtureHarnessMarker = '__WP061_DEV_FIXTURE_HARNESS__';
  console.debug(devFixtureHarnessMarker);
  const params = new URLSearchParams(window.location.search);
  const fixtureParam = params.get('fixture');
  if (fixtureParam !== null && isFixtureName(fixtureParam)) {
    const store = useUiStateStore(pinia);
    store.setSnapshot(loadUiStateFixture(fixtureParam));
  }
}

app.mount('#app');
