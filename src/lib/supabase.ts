// ============================================================
// Supabase Client Helper
// Mendukung konfigurasi via Environment Variables (Vercel)
// serta Custom Header dari browser (Settings Tab)
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const defaultSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.PROJECT_URL ||
  '';

const defaultSupabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.API_ANON ||
  '';

const defaultSupabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE ||
  '';

export const isSupabaseConfigured = Boolean(defaultSupabaseUrl && defaultSupabaseAnonKey);

// Public Client (untuk fetch di client / browser)
export const supabase = isSupabaseConfigured
  ? createClient(defaultSupabaseUrl, defaultSupabaseAnonKey)
  : null;

export interface RequestWithHeaders {
  headers?: {
    get: (name: string) => string | null;
  };
}

export function extractSupabaseCredentials(req?: RequestWithHeaders | null): { url: string; key: string; isCustom: boolean } {
  let url = defaultSupabaseUrl;
  let key = defaultSupabaseServiceKey || defaultSupabaseAnonKey;
  let isCustom = false;

  if (req && req.headers && typeof req.headers.get === 'function') {
    const headerUrl = req.headers.get('x-supabase-url');
    const headerServiceKey = req.headers.get('x-supabase-service-key');
    const headerAnonKey = req.headers.get('x-supabase-key') || req.headers.get('x-supabase-anon-key');
    
    if (headerUrl) {
      url = headerUrl.trim();
      isCustom = true;
    }

    // Jika server sudah memiliki SERVICE_ROLE / SUPABASE_SERVICE_ROLE_KEY,
    // jangan turunkan ke anon key browser (agar RLS PostgreSQL tidak memblokir query user & settings).
    if (headerServiceKey) {
      key = headerServiceKey.trim();
      isCustom = true;
    } else if (!defaultSupabaseServiceKey && headerAnonKey) {
      key = headerAnonKey.trim();
      isCustom = true;
    }
  }

  return { url, key, isCustom };
}

export function checkIsSupabaseConfigured(req?: RequestWithHeaders | null): boolean {
  const { url, key } = extractSupabaseCredentials(req);
  return Boolean(url && key);
}

// Admin Server Client (untuk API routes dengan privilege service role atau custom header)
export const getSupabaseServerClient = (req?: RequestWithHeaders | null): SupabaseClient | null => {
  const { url, key } = extractSupabaseCredentials(req);
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
};
