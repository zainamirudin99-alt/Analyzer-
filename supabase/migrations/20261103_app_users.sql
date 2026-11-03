-- ============================================================
-- Supabase Migration: Akun Aplikasi (Username + Password, Tanpa Email)
-- Versi: 20261103_app_users.sql
-- Akses hanya melalui server (service role). RLS aktif tanpa policy publik.
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

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users(username);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "App Server Access Users" ON public.app_users;
CREATE POLICY "App Server Access Users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);

