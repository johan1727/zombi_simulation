/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del relay de matchmaking en vivo desplegado (Plan 10 Task 4). Ver src/net/sala.ts. */
  readonly VITE_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
