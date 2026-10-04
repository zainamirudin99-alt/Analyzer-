-- ============================================================
-- Supabase Migration: Fondasi Modul Analisis Regresi Statistik
-- Versi: 20261004_regression_foundation.sql
-- ============================================================

-- 1. Enum Frekuensi Data Time Series
DO $$ BEGIN
  CREATE TYPE public.regression_frequency AS ENUM (
    'harian', 'mingguan', 'bulanan', 'kuartalan', 'tahunan', 'tidak_beraturan'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Tabel datasets: Menyimpan metadata file dataset
CREATE TABLE IF NOT EXISTS public.datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL DEFAULT auth.uid(),
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('upload', 'link')),
    storage_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    sheet_names JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '30 days')
);

-- Indeks datasets
CREATE INDEX IF NOT EXISTS idx_datasets_owner ON public.datasets(owner_id);
CREATE INDEX IF NOT EXISTS idx_datasets_expires ON public.datasets(expires_at);

-- RLS pada datasets
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner Select Datasets" ON public.datasets;
DROP POLICY IF EXISTS "Owner Insert Datasets" ON public.datasets;
DROP POLICY IF EXISTS "Owner Update Datasets" ON public.datasets;
DROP POLICY IF EXISTS "Owner Delete Datasets" ON public.datasets;

CREATE POLICY "Owner Select Datasets" ON public.datasets
    FOR SELECT TO authenticated
    USING (auth.uid() = owner_id);

CREATE POLICY "Owner Insert Datasets" ON public.datasets
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner Update Datasets" ON public.datasets
    FOR UPDATE TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner Delete Datasets" ON public.datasets
    FOR DELETE TO authenticated
    USING (auth.uid() = owner_id);


-- 3. Tabel analyses: Menyimpan konfigurasi dan status analisis regresi
CREATE TABLE IF NOT EXISTS public.analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL DEFAULT auth.uid(),
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    y_col TEXT NOT NULL,
    x_cols TEXT[] NOT NULL,
    is_time_series BOOLEAN NOT NULL DEFAULT false,
    time_col TEXT,
    frequency public.regression_frequency DEFAULT 'tidak_beraturan',
    alpha NUMERIC(5,4) NOT NULL DEFAULT 0.0500,
    missing_policy VARCHAR(30) NOT NULL DEFAULT 'listwise' 
        CHECK (missing_policy IN ('listwise', 'impute_mean', 'impute_median')),
    normality_test VARCHAR(20) NOT NULL DEFAULT 'auto' 
        CHECK (normality_test IN ('auto', 'shapiro', 'lilliefors')),
    entry_method VARCHAR(20) NOT NULL DEFAULT 'enter' 
        CHECK (entry_method IN ('enter', 'forward', 'backward', 'stepwise')),
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'validated', 'estimating', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Invarian Basis Data (CHECK Constraints)
    CONSTRAINT check_alpha_range CHECK (alpha > 0.0000 AND alpha < 1.0000),
    CONSTRAINT check_x_cols_not_empty CHECK (array_length(x_cols, 1) > 0),
    CONSTRAINT check_y_not_in_x CHECK (NOT (y_col = ANY(x_cols))),
    CONSTRAINT check_time_series_config CHECK (
        (is_time_series = false AND time_col IS NULL) OR 
        (is_time_series = true AND time_col IS NOT NULL AND NOT (time_col = ANY(x_cols)) AND time_col <> y_col)
    )
);

-- Indeks analyses
CREATE INDEX IF NOT EXISTS idx_analyses_owner ON public.analyses(owner_id);
CREATE INDEX IF NOT EXISTS idx_analyses_dataset ON public.analyses(dataset_id);

-- RLS pada analyses
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner Select Analyses" ON public.analyses;
DROP POLICY IF EXISTS "Owner Insert Analyses" ON public.analyses;
DROP POLICY IF EXISTS "Owner Update Analyses" ON public.analyses;
DROP POLICY IF EXISTS "Owner Delete Analyses" ON public.analyses;

CREATE POLICY "Owner Select Analyses" ON public.analyses
    FOR SELECT TO authenticated
    USING (auth.uid() = owner_id);

CREATE POLICY "Owner Insert Analyses" ON public.analyses
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner Update Analyses" ON public.analyses
    FOR UPDATE TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner Delete Analyses" ON public.analyses
    FOR DELETE TO authenticated
    USING (auth.uid() = owner_id);


-- 4. Tabel analysis_events: Audit log append-only untuk pencatatan eksperimen/remedial
CREATE TABLE IF NOT EXISTS public.analysis_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
    seq INT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_analysis_event_seq UNIQUE(analysis_id, seq)
);

-- Indeks analysis_events
CREATE INDEX IF NOT EXISTS idx_events_analysis ON public.analysis_events(analysis_id, seq);

-- RLS pada analysis_events: APPEND-ONLY (hanya INSERT dan SELECT, blokir UPDATE dan DELETE)
ALTER TABLE public.analysis_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner Select Events" ON public.analysis_events;
DROP POLICY IF EXISTS "Owner Insert Events" ON public.analysis_events;
DROP POLICY IF EXISTS "Block Update Events" ON public.analysis_events;
DROP POLICY IF EXISTS "Block Delete Events" ON public.analysis_events;

CREATE POLICY "Owner Select Events" ON public.analysis_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.analyses a 
            WHERE a.id = analysis_events.analysis_id 
              AND a.owner_id = auth.uid()
        )
    );

CREATE POLICY "Owner Insert Events" ON public.analysis_events
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.analyses a 
            WHERE a.id = analysis_events.analysis_id 
              AND a.owner_id = auth.uid()
        )
    );

-- TIDAK ADA POLICY UNTUK UPDATE DAN DELETE: Otomatis ditolak oleh PostgreSQL RLS (Append-Only Enforcement)


-- 5. Konfigurasi Bucket Supabase Storage 'datasets'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'datasets',
    'datasets',
    false,
    10485760, -- 10 MB
    ARRAY[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv'
    ];

-- Kebijakan Storage RLS pada bucket 'datasets'
-- Format folder path: {auth.uid()}/{dataset_id}/{filename}
DROP POLICY IF EXISTS "User Select Own Dataset Objects" ON storage.objects;
DROP POLICY IF EXISTS "User Insert Own Dataset Objects" ON storage.objects;
DROP POLICY IF EXISTS "User Delete Own Dataset Objects" ON storage.objects;

CREATE POLICY "User Select Own Dataset Objects" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'datasets' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User Insert Own Dataset Objects" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'datasets' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "User Delete Own Dataset Objects" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'datasets' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );
