-- ============================================================
-- Supabase Migration: Akun Aplikasi (Username + Password, Tanpa Email)
-- Versi: 20261103_app_users.sql
-- Akses melalui server API (anon / authenticated / service_role)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) NOT NULL UNIQUE
        CHECK (username ~ '^[a-z0-9_.-]{3,32}$'),
    password_hash TEXT NOT NULL,
    settings_encrypted TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_login_at TIMESTAMPTZ
);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS settings_encrypted TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);

-- Grant privileges ke semua role Supabase
GRANT ALL ON TABLE public.app_users TO postgres, anon, authenticated, service_role;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "App Server Access Users" ON public.app_users;
CREATE POLICY "App Server Access Users" ON public.app_users FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- Catatan: Jika Anda mengalami kendala RLS policy saat pendaftaran, nonaktifkan RLS dengan perintah:
-- ALTER TABLE public.app_users DISABLE ROW LEVEL SECURITY;

-- Pastikan tabel fallback app_settings juga memiliki grant penuh
CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

GRANT ALL ON TABLE public.app_settings TO postgres, anon, authenticated, service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access App Settings" ON public.app_settings;
CREATE POLICY "Public Access App Settings" ON public.app_settings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
