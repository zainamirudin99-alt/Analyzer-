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

-- 5. Konfigurasi Jadwal pg_cron (Jalankan di Supabase SQL Editor jika pg_cron aktif)
-- Catatan: Ekstensi pg_cron diaktifkan secara default di Supabase.
-- Script berikut menjadwalkan update otomatis setiap 6 jam:
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--     'ced-supabase-keepalive-every-6-hours',
--     '0 */6 * * *',
--     'SELECT public.keepalive_ping()'
-- );
