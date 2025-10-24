import { createClient } from '@supabase/supabase-js';

// TODO: Fill these from your Supabase project settings (Project URL and anon public key)
const SUPABASE_URL = '';

const SUPABASE_ANON_KEY = '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
