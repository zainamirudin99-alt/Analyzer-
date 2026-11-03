-- ====================================================================
-- Supabase Keepalive & Automated Heartbeat Migration
-- Mencegah Supabase Free Tier tertidur / hibernasi (pause) setelah 7 hari
-- ====================================================================

-- 1. Buat Tabel Heartbeat Terisolasi (TIDAK menyentuh data analisis/regresi)
CREATE TABLE IF NOT EXISTS public.ced_heartbeat (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'primary',
    last_ping TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    ping_count BIGINT DEFAULT 1,
    status TEXT DEFAULT 'active_keepalive'
);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.ced_heartbeat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Heartbeat" ON public.ced_heartbeat;
CREATE POLICY "Public Access Heartbeat" 
    ON public.ced_heartbeat 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- 3. Inisialisasi Record Primer jika belum ada
INSERT INTO public.ced_heartbeat (id, last_ping, ping_count, status)
VALUES ('primary', NOW(), 1, 'active_keepalive')
ON CONFLICT (id) DO UPDATE 
SET last_ping = NOW(), 
    ping_count = public.ced_heartbeat.ping_count + 1,
    status = 'active_keepalive';

-- 4. Function Khusus untuk Eksekusi Ping yang Cepat dan Efisien
CREATE OR REPLACE FUNCTION public.keepalive_ping()
RETURNS TABLE(last_ping TIMESTAMPTZ, ping_count BIGINT, status TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 5. Jadwal pg_cron otomatis di dalam database (berjalan walau web/dashboard tidak dibuka).
-- Dibungkus EXCEPTION agar migrasi tetap sukses bila pg_cron belum diizinkan pada proyek.
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
