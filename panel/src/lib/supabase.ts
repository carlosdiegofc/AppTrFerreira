import { createClient } from '@supabase/supabase-js';
import { PRODUCTION_SUPABASE_KEY, PRODUCTION_SUPABASE_URL } from '../supabaseDefaults';
import type { RoadDatabase as Database } from './roadDatabase';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || PRODUCTION_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY || PRODUCTION_SUPABASE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'trf-panel-nuevo-sesion' },
});
