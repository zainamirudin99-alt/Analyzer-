// ============================================================
// Supabase Client Helper
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Public Client (untuk fetch di client / browser)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Admin Server Client (untuk API routes dengan privilege service role)
export const getSupabaseServerClient = () => {
  if (!supabaseUrl) return null;
  const key = supabaseServiceKey || supabaseAnonKey;
  if (!key) return null;
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
