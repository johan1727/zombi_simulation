/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del relay de matchmaking en vivo desplegado (Plan 10 Task 4). Ver src/net/sala.ts. */
  readonly VITE_RELAY_URL?: string;
  /** URL del servidor de verificación de desafíos desplegado (Plan 17 Task 3). Ver src/net/verificar.ts. */
  readonly VITE_VERIFICAR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
