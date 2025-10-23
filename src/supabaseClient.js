import { createClient } from '@supabase/supabase-js';

// TODO: Fill these from your Supabase project settings (Project URL and anon public key)
const SUPABASE_URL = 'https://eurqsknzmiabhpxnfctz.supabase.co';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cnFza256bWlhYmhweG5mY3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3Nzg2MjgsImV4cCI6MjA3NjM1NDYyOH0.iiXki6y9A_FhtTuOHOJWC_x0Kr5eTyZgV-g48Q360OM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
