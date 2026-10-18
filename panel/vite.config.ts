import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { PRODUCTION_SUPABASE_URL } from './src/supabaseDefaults.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabase = new URL(env.VITE_SUPABASE_URL || PRODUCTION_SUPABASE_URL).origin;
  return {
    // Relative paths: the build works from any folder of the site (the panel is published under a sub-path).
    base: './',
    plugins: [
      react(),
      {
        name: 'panel-csp',
        // The page may only talk to its own Supabase project and load map tiles.
        transformIndexHtml: (html: string) => html.replaceAll('%SUPABASE_ORIGIN%', supabase),
      },
    ],
    // The main chunk is React, the router and the Supabase client (about 150 kB compressed); the map loads later.
    build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 600 },
    test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
  };
});
