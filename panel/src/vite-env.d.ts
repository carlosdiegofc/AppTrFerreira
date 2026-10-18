/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project the panel talks to. Defaults to production; the end-to-end tests point it at a local stand-in. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
