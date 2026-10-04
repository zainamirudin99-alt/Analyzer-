-- ============================================================
-- Supabase Migration: Tabel Hasil Estimasi Regresi Statistik & RLS
-- Versi: 20261004_regression_results.sql
-- ============================================================

-- 1. Tabel results: Menyimpan keluaran lengkap komputasi OLS & skor kesesuaian
CREATE TABLE IF NOT EXISTS public.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL DEFAULT auth.uid(),
    engine_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    result JSONB NOT NULL,
    scores JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indeks results
CREATE INDEX IF NOT EXISTS idx_results_analysis ON public.results(analysis_id);
CREATE INDEX IF NOT EXISTS idx_results_owner ON public.results(owner_id);

-- 2. Aktifkan Row Level Security (RLS) pada tabel results
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner Select Results" ON public.results;
DROP POLICY IF EXISTS "Owner Insert Results" ON public.results;
DROP POLICY IF EXISTS "Owner Delete Results" ON public.results;

CREATE POLICY "Owner Select Results" ON public.results
    FOR SELECT TO authenticated
    USING (auth.uid() = owner_id);

CREATE POLICY "Owner Insert Results" ON public.results
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner Delete Results" ON public.results
    FOR DELETE TO authenticated
    USING (auth.uid() = owner_id);
