/// <reference types="vite/client" />

declare const __OPPTRIX_CLIENT_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
