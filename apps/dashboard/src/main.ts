import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';
import { use as useECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import App from './App.vue';
import { router } from './router/index.js';

// why: vue-echarts 5/7 does not auto-register chart types or renderers; the
// chart widgets render blank unless the components they use (line, bar, grid,
// tooltip) and a renderer are registered here at startup.
useECharts([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent]);

const THEME_STORAGE_KEY = 'la-dashboard-theme';
const DARK_MODE_CLASS = 'app-dark';

/**
 * Applies the saved theme synchronously, before the app mounts. PrimeVue's
 * Aura preset switches its entire token set based on the presence of the
 * dark-mode selector class; reading the preference here (rather than in a
 * component's onMounted) keeps the page from flashing the light palette on
 * first paint. Dark is the default when no preference is stored.
 */
function applyInitialTheme(): void {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const isLight = savedTheme === 'light';
  document.documentElement.classList.toggle(DARK_MODE_CLASS, !isLight);
}

applyInitialTheme();

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: `.${DARK_MODE_CLASS}`,
    },
  },
});

app.mount('#app');
