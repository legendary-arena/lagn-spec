/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEGENDS_R2_BASE_URL: string;
  readonly VITE_LEGENDS_POLL_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
