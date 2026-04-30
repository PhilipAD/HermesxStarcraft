interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly VITE_TITAN_WEB_URL?: string
  readonly VITE_CASC_HTTP_URL?: string
  readonly VITE_TITAN_STUB_RUNTIME_URL?: string
  readonly VITE_TITAN_STUB_PLUGINS_URL?: string
  readonly VITE_BRIDGE_WS_URL?: string
  readonly VITE_CASCBRIDGE?: string
  readonly VITE_HERMES_DIAG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'js-yaml'
