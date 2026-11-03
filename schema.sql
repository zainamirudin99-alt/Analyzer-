-- ============================================================
-- SQL SCHEMA FOR ANALYZER (Carbon Emission Disclosure)
-- Database: Supabase (PostgreSQL)
-- Update: Support 18 Indikator CED, Model 3.6-Flash, & Auto Keep-Alive Heartbeat
-- ============================================================

-- 1. Buat Tabel Utama: ced_results
CREATE TABLE IF NOT EXISTS public.ced_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code VARCHAR(20) NOT NULL,
    fiscal_year VARCHAR(20) NOT NULL,
    file_name TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'completed',
    
    -- 18 Indikator Carbon Emission Disclosure (Skor 0 - 5)
    -- Group 1: Climate Change (CC)
    cc1 SMALLINT DEFAULT 0 CHECK (cc1 BETWEEN 0 AND 5),
    cc2 SMALLINT DEFAULT 0 CHECK (cc2 BETWEEN 0 AND 5),
    
    -- Group 2: Greenhouse Gas (GHG)
    ghg1 SMALLINT DEFAULT 0 CHECK (ghg1 BETWEEN 0 AND 5),
    ghg2 SMALLINT DEFAULT 0 CHECK (ghg2 BETWEEN 0 AND 5),
    ghg3 SMALLINT DEFAULT 0 CHECK (ghg3 BETWEEN 0 AND 5),
    ghg4 SMALLINT DEFAULT 0 CHECK (ghg4 BETWEEN 0 AND 5),
    ghg5 SMALLINT DEFAULT 0 CHECK (ghg5 BETWEEN 0 AND 5),
    ghg6 SMALLINT DEFAULT 0 CHECK (ghg6 BETWEEN 0 AND 5),
    ghg7 SMALLINT DEFAULT 0 CHECK (ghg7 BETWEEN 0 AND 5),
    
    -- Group 3: Energy Consumption (EC)
    ec1 SMALLINT DEFAULT 0 CHECK (ec1 BETWEEN 0 AND 5),
    ec2 SMALLINT DEFAULT 0 CHECK (ec2 BETWEEN 0 AND 5),
    ec3 SMALLINT DEFAULT 0 CHECK (ec3 BETWEEN 0 AND 5),
    
    -- Group 4: Reduction Commitment (RC)
    rc1 SMALLINT DEFAULT 0 CHECK (rc1 BETWEEN 0 AND 5),
    rc2 SMALLINT DEFAULT 0 CHECK (rc2 BETWEEN 0 AND 5),
    rc3 SMALLINT DEFAULT 0 CHECK (rc3 BETWEEN 0 AND 5),
    rc4 SMALLINT DEFAULT 0 CHECK (rc4 BETWEEN 0 AND 5),
    
    -- Group 5: Accountability (ACC)
    acc1 SMALLINT DEFAULT 0 CHECK (acc1 BETWEEN 0 AND 5),
    acc2 SMALLINT DEFAULT 0 CHECK (acc2 BETWEEN 0 AND 5),
    
    -- Agregasi Skor Otomatis (Maksimal 90)
    total_score SMALLINT GENERATED ALWAYS AS (
        cc1 + cc2 + ghg1 + ghg2 + ghg3 + ghg4 + ghg5 + ghg6 + ghg7 +
        ec1 + ec2 + ec3 + rc1 + rc2 + rc3 + rc4 + acc1 + acc2
    ) STORED,
    
    -- Klasifikasi Tingkat Pengungkapan & Model AI
    disclosure_level VARCHAR(50) DEFAULT 'Rendah',
    model_used VARCHAR(100) DEFAULT 'gemini-3.7-flash',
    
    -- Timestamp Audit
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indeks untuk query dan filter cepat
CREATE INDEX IF NOT EXISTS idx_ced_company_year ON public.ced_results(company_code, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_ced_created_at ON public.ced_results(created_at DESC);

-- 2. Aktifkan Row Level Security (RLS) pada ced_results
ALTER TABLE public.ced_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public All Access" ON public.ced_results;
DROP POLICY IF EXISTS "Public Select CED Results" ON public.ced_results;
DROP POLICY IF EXISTS "Public Insert CED Results" ON public.ced_results;
DROP POLICY IF EXISTS "Public Update CED Results" ON public.ced_results;
DROP POLICY IF EXISTS "Public Delete CED Results" ON public.ced_results;

CREATE POLICY "Public All Access" ON public.ced_results FOR ALL USING (true) WITH CHECK (true);

-- 3. Buat Tabel Keep-Alive Heartbeat (Mencegah Supabase Free Tier Pause / Hibernasi)
CREATE TABLE IF NOT EXISTS public.ced_heartbeat (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'primary',
    last_ping TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    ping_count BIGINT DEFAULT 1,
    status TEXT DEFAULT 'active_keepalive'
);

ALTER TABLE public.ced_heartbeat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Heartbeat" ON public.ced_heartbeat;
CREATE POLICY "Public Access Heartbeat" ON public.ced_heartbeat FOR ALL USING (true) WITH CHECK (true);

-- Insert record awal heartbeat jika belum ada
INSERT INTO public.ced_heartbeat (id, last_ping, ping_count, status)
VALUES ('primary', NOW(), 1, 'active_keepalive')
ON CONFLICT (id) DO UPDATE 
SET last_ping = NOW(), ping_count = public.ced_heartbeat.ping_count + 1;

-- 4. Tabel Konfigurasi Opsi Aplikasi (app_settings)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access App Settings" ON public.app_settings;
CREATE POLICY "Public Access App Settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.app_settings (key, value)
VALUES ('active_gemini_model', 'gemini-3.7-flash')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 5. Function RPC Keepalive (dipanggil pg_cron, Vercel Cron, dan GitHub Actions)
CREATE OR REPLACE FUNCTION public.keepalive_ping()
RETURNS TABLE(last_ping TIMESTAMPTZ, ping_count BIGINT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO public.ced_heartbeat (id, last_ping, ping_count, status)
    VALUES ('primary', NOW(), 1, 'active_keepalive')
    ON CONFLICT (id) DO UPDATE
    SET last_ping = NOW(),
        ping_count = public.ced_heartbeat.ping_count + 1,
        status = 'active_keepalive'
    RETURNING public.ced_heartbeat.last_ping, public.ced_heartbeat.ping_count, public.ced_heartbeat.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.keepalive_ping() TO anon, authenticated;

-- 6. Jadwal pg_cron otomatis setiap 6 jam (tetap berjalan walau web/dashboard tidak dibuka)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'ced-supabase-keepalive-every-6-hours';
    PERFORM cron.schedule(
        'ced-supabase-keepalive-every-6-hours',
        '0 */6 * * *',
        'SELECT public.keepalive_ping()'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron tidak tersedia (%). Aktifkan via Database > Extensions, lalu jalankan ulang blok ini.', SQLERRM;
END $$;

-- 7. Tabel Akun Aplikasi (username + password, tanpa email). Hanya diakses server (service role).
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

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "App Server Access Users" ON public.app_users;
CREATE POLICY "App Server Access Users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);
