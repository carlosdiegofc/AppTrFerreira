/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project the panel talks to. Defaults to production; the end-to-end tests point it at a local stand-in. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  /** Google Maps Platform key for the satellite view; without it the maps show only the street map. */
  readonly VITE_GOOGLE_MAPS_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
