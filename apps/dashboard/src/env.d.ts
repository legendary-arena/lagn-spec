/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_TIMESTAMP__: string;
declare const __GIT_SHA__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_USE_MOCKS: string;
  readonly VITE_FEATURE_FLAGS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
