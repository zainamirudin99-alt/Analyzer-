'use client';

import React, { useState, useEffect } from 'react';
import { Database, Key, Cpu, CheckCircle2, AlertCircle, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { FALLBACK_MODELS } from '@/lib/gemini';

export const SettingsTab: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.6-flash');
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [sysStatus, setSysStatus] = useState<any>(null);
  const [isCheckingSys, setIsCheckingSys] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    // Load local settings & migrasi otomatis model lama
    const storedKey = localStorage.getItem('custom_gemini_key') || '';
    let storedModel = localStorage.getItem('custom_gemini_model') || 'gemini-3.6-flash';
    
    if (storedModel === 'gemini-2.5-flash' || !FALLBACK_MODELS.includes(storedModel)) {
      storedModel = 'gemini-3.6-flash';
      localStorage.setItem('custom_gemini_model', storedModel);
    }

    setApiKey(storedKey);
    setSelectedModel(storedModel);
    checkSystemStatus();
  }, []);

  const checkSystemStatus = async () => {
    setIsCheckingSys(true);
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.success) {
        setSysStatus(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCheckingSys(false);
    }
  };

  const handleSaveLocalSettings = () => {
    const chosenModel = selectedModel === 'gemini-2.5-flash' ? 'gemini-3.6-flash' : selectedModel;
    localStorage.setItem('custom_gemini_key', apiKey.trim());
    localStorage.setItem('custom_gemini_model', chosenModel);
    setSelectedModel(chosenModel);
    setTestResult({
      success: true,
      message: `Pengaturan API Key & Model (${chosenModel}) berhasil disimpan di browser lokal.`
    });
  };

  const handleTestConnection = async () => {
    setIsTestingKey(true);
    setTestResult(null);
    const chosenModel = selectedModel === 'gemini-2.5-flash' ? 'gemini-3.6-flash' : selectedModel;
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), model: chosenModel })
      });
      const json = await res.json();
      setTestResult({
        success: json.success,
        message: json.message || json.error || 'Uji koneksi selesai.'
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Gagal menguji koneksi.'
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleCopySql = () => {
    const sqlText = `-- Jalankan ini di Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.ced_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code VARCHAR(20) NOT NULL,
    fiscal_year VARCHAR(20) NOT NULL,
    file_name TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'completed',
    cc1 SMALLINT DEFAULT 0 CHECK (cc1 BETWEEN 0 AND 5),
    cc2 SMALLINT DEFAULT 0 CHECK (cc2 BETWEEN 0 AND 5),
    ghg1 SMALLINT DEFAULT 0 CHECK (ghg1 BETWEEN 0 AND 5),
    ghg2 SMALLINT DEFAULT 0 CHECK (ghg2 BETWEEN 0 AND 5),
    ghg3 SMALLINT DEFAULT 0 CHECK (ghg3 BETWEEN 0 AND 5),
    ghg4 SMALLINT DEFAULT 0 CHECK (ghg4 BETWEEN 0 AND 5),
    ghg5 SMALLINT DEFAULT 0 CHECK (ghg5 BETWEEN 0 AND 5),
    ghg6 SMALLINT DEFAULT 0 CHECK (ghg6 BETWEEN 0 AND 5),
    ghg7 SMALLINT DEFAULT 0 CHECK (ghg7 BETWEEN 0 AND 5),
    ec1 SMALLINT DEFAULT 0 CHECK (ec1 BETWEEN 0 AND 5),
    ec2 SMALLINT DEFAULT 0 CHECK (ec2 BETWEEN 0 AND 5),
    ec3 SMALLINT DEFAULT 0 CHECK (ec3 BETWEEN 0 AND 5),
    rc1 SMALLINT DEFAULT 0 CHECK (rc1 BETWEEN 0 AND 5),
    rc2 SMALLINT DEFAULT 0 CHECK (rc2 BETWEEN 0 AND 5),
    rc3 SMALLINT DEFAULT 0 CHECK (rc3 BETWEEN 0 AND 5),
    rc4 SMALLINT DEFAULT 0 CHECK (rc4 BETWEEN 0 AND 5),
    acc1 SMALLINT DEFAULT 0 CHECK (acc1 BETWEEN 0 AND 5),
    acc2 SMALLINT DEFAULT 0 CHECK (acc2 BETWEEN 0 AND 5),
    total_score SMALLINT GENERATED ALWAYS AS (
        cc1 + cc2 + ghg1 + ghg2 + ghg3 + ghg4 + ghg5 + ghg6 + ghg7 +
        ec1 + ec2 + ec3 + rc1 + rc2 + rc3 + rc4 + acc1 + acc2
    ) STORED,
    disclosure_level VARCHAR(50) DEFAULT 'Rendah',
    model_used VARCHAR(100) DEFAULT 'gemini-3.6-flash',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.ced_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public All Access" ON public.ced_results;
CREATE POLICY "Public All Access" ON public.ced_results FOR ALL USING (true) WITH CHECK (true);

-- Tabel Keep-Alive Heartbeat (Mencegah Supabase Pause)
CREATE TABLE IF NOT EXISTS public.ced_heartbeat (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'primary',
    last_ping TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    ping_count BIGINT DEFAULT 1,
    status TEXT DEFAULT 'active_keepalive'
);

ALTER TABLE public.ced_heartbeat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access Heartbeat" ON public.ced_heartbeat;
CREATE POLICY "Public Access Heartbeat" ON public.ced_heartbeat FOR ALL USING (true) WITH CHECK (true);`;

    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="grid-2">
      {/* Kolom Kiri: Konfigurasi Gemini AI */}
      <div>
        <div className="card">
          <div className="card-title">
            <div className="ct-icon"><Key size={18} color="#2e6922" /></div>
            <span>Konfigurasi Google Gemini AI</span>
          </div>

          <div className="alert alert-info" style={{ fontSize: '13px' }}>
            <span>🌿</span>
            <span>
              API Key dapat diperoleh <strong>gratis</strong> di{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline' }}
              >
                Google AI Studio <ExternalLink size={12} style={{ display: 'inline' }} />
              </a>
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Gemini API Key</label>
            <input
              type="password"
              className="form-input font-mono"
              placeholder="AQ.... atau AIzaSy... (dari Google AI Studio)"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Pilih Model Utama Gemini AI</label>
            <select
              className="form-select font-mono"
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
            >
              {FALLBACK_MODELS.map(m => (
                <option key={m} value={m}>
                  {m} {m.includes('3.6-flash') ? '⭐ (Rekomendasi Resmi Google)' : ''}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '12px', color: 'var(--stone)', marginTop: '6px' }}>
              Jika terjadi limit kuota (HTTP 429), sistem otomatis beralih (*failover*) ke model alternatif di atas.
            </div>
          </div>

          {testResult && (
            <div className={`alert alert-${testResult.success ? 'success' : 'error'}`}>
              <span>{testResult.success ? '✅' : '❌'}</span>
              <span>{testResult.message}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleSaveLocalSettings}>
              💾 Simpan di Browser
            </button>
            <button className="btn btn-outline" onClick={handleTestConnection} disabled={isTestingKey}>
              {isTestingKey ? <span className="spinner" /> : <RefreshCw size={14} />}
              <span>Uji Koneksi AI</span>
            </button>
          </div>
        </div>
      </div>

      {/* Kolom Kanan: Status Supabase Database & DDL Guide */}
      <div>
        <div className="card">
          <div className="card-title">
            <div className="ct-icon"><Database size={18} color="#2e6922" /></div>
            <span>Status Database Supabase (PostgreSQL)</span>
          </div>

          {sysStatus?.supabase ? (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                {sysStatus.supabase.connected ? (
                  <CheckCircle2 size={18} color="#2e6922" />
                ) : (
                  <AlertCircle size={18} color="#b87514" />
                )}
                <span style={{ fontWeight: 800, fontSize: '14px', color: sysStatus.supabase.connected ? 'var(--fern)' : 'var(--warn)' }}>
                  {sysStatus.supabase.connected ? 'Terhubung & Aktif' : 'Perlu Setup'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--stone)', lineHeight: '1.5' }}>
                {sysStatus.supabase.message}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--stone)' }}>Memeriksa status Supabase...</p>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--stone)', textTransform: 'uppercase' }}>
                Inisialisasi Tabel Supabase (SQL DDL)
              </span>
              <button className="btn btn-outline btn-sm" onClick={handleCopySql}>
                <Copy size={13} />
                <span>{copiedSql ? 'Tersalin!' : 'Salin SQL'}</span>
              </button>
            </div>
            <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '14px', borderRadius: '8px', fontSize: '11px', maxHeight: '160px', overflowY: 'auto', fontFamily: "'DM Mono', monospace" }}>
{`-- Salin dan jalankan di Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.ced_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_code VARCHAR(20) NOT NULL,
    fiscal_year VARCHAR(20) NOT NULL,
    file_name TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'completed',
    cc1 SMALLINT DEFAULT 0 CHECK (cc1 BETWEEN 0 AND 5),
    cc2 SMALLINT DEFAULT 0 CHECK (cc2 BETWEEN 0 AND 5),
    ghg1 SMALLINT DEFAULT 0 CHECK (ghg1 BETWEEN 0 AND 5),
    ghg2 SMALLINT DEFAULT 0 CHECK (ghg2 BETWEEN 0 AND 5),
    ghg3 SMALLINT DEFAULT 0 CHECK (ghg3 BETWEEN 0 AND 5),
    ghg4 SMALLINT DEFAULT 0 CHECK (ghg4 BETWEEN 0 AND 5),
    ghg5 SMALLINT DEFAULT 0 CHECK (ghg5 BETWEEN 0 AND 5),
    ghg6 SMALLINT DEFAULT 0 CHECK (ghg6 BETWEEN 0 AND 5),
    ghg7 SMALLINT DEFAULT 0 CHECK (ghg7 BETWEEN 0 AND 5),
    ec1 SMALLINT DEFAULT 0 CHECK (ec1 BETWEEN 0 AND 5),
    ec2 SMALLINT DEFAULT 0 CHECK (ec2 BETWEEN 0 AND 5),
    ec3 SMALLINT DEFAULT 0 CHECK (ec3 BETWEEN 0 AND 5),
    rc1 SMALLINT DEFAULT 0 CHECK (rc1 BETWEEN 0 AND 5),
    rc2 SMALLINT DEFAULT 0 CHECK (rc2 BETWEEN 0 AND 5),
    rc3 SMALLINT DEFAULT 0 CHECK (rc3 BETWEEN 0 AND 5),
    rc4 SMALLINT DEFAULT 0 CHECK (rc4 BETWEEN 0 AND 5),
    acc1 SMALLINT DEFAULT 0 CHECK (acc1 BETWEEN 0 AND 5),
    acc2 SMALLINT DEFAULT 0 CHECK (acc2 BETWEEN 0 AND 5),
    total_score SMALLINT GENERATED ALWAYS AS (
        cc1 + cc2 + ghg1 + ghg2 + ghg3 + ghg4 + ghg5 + ghg6 + ghg7 +
        ec1 + ec2 + ec3 + rc1 + rc2 + rc3 + rc4 + acc1 + acc2
    ) STORED,
    disclosure_level VARCHAR(50) DEFAULT 'Rendah',
    model_used VARCHAR(100) DEFAULT 'gemini-3.6-flash',
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.ced_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public All Access" ON public.ced_results FOR ALL USING (true);`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
