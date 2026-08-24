'use client';

import React, { useState, useEffect } from 'react';
import { Database, Key, Cpu, CheckCircle2, AlertCircle, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { SUPPORTED_MODEL_CATEGORIES, ALL_SUPPORTED_MODELS } from '@/lib/gemini';

export const SettingsTab: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [customModelInput, setCustomModelInput] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [sysStatus, setSysStatus] = useState<any>(null);
  const [isCheckingSys, setIsCheckingSys] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    // Load local settings
    const storedKey = localStorage.getItem('custom_gemini_key') || '';
    const storedModel = localStorage.getItem('custom_gemini_model') || 'gemini-1.5-flash';
    
    setApiKey(storedKey);
    if (ALL_SUPPORTED_MODELS.includes(storedModel)) {
      setSelectedModel(storedModel);
      setIsCustomMode(false);
    } else if (storedModel) {
      setSelectedModel('custom');
      setCustomModelInput(storedModel);
      setIsCustomMode(true);
    } else {
      setSelectedModel('gemini-1.5-flash');
      setIsCustomMode(false);
    }

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

  const getEffectiveModel = (): string => {
    if (isCustomMode || selectedModel === 'custom') {
      return customModelInput.trim() || 'gemini-1.5-flash';
    }
    return selectedModel || 'gemini-1.5-flash';
  };

  const handleSaveLocalSettings = () => {
    const effectiveModel = getEffectiveModel();
    localStorage.setItem('custom_gemini_key', apiKey.trim());
    localStorage.setItem('custom_gemini_model', effectiveModel);
    setTestResult({
      success: true,
      message: `Pengaturan API Key & Model (${effectiveModel}) berhasil disimpan di browser lokal.`
    });
  };

  const handleTestConnection = async () => {
    setIsTestingKey(true);
    setTestResult(null);
    const effectiveModel = getEffectiveModel();

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), model: effectiveModel })
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
    model_used VARCHAR(100) DEFAULT 'gemini-1.5-flash',
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
            <span>Konfigurasi Google Gemini AI (1.5 s/d 3.7 & 3.1 Pro)</span>
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
              value={isCustomMode ? 'custom' : selectedModel}
              onChange={e => {
                const val = e.target.value;
                if (val === 'custom') {
                  setIsCustomMode(true);
                  setSelectedModel('custom');
                } else {
                  setIsCustomMode(false);
                  setSelectedModel(val);
                }
              }}
            >
              {SUPPORTED_MODEL_CATEGORIES.map(cat => (
                <optgroup key={cat.category} label={cat.category}>
                  {cat.models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="✍️ Kustomisasi">
                <option value="custom">-- Ketik Nama Model Lain Secara Manual --</option>
              </optgroup>
            </select>

            {/* Input Manual Kustom Model */}
            {(isCustomMode || selectedModel === 'custom') && (
              <div style={{ marginTop: '10px', background: '#f8faf9', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                  Ketik Nama Model Kustom / Preview Google:
                </label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="Contoh: gemini-3.1-pro, gemini-3.7-flash, gemini-3.0-pro"
                  value={customModelInput}
                  onChange={e => setCustomModelInput(e.target.value.trim())}
                />
              </div>
            )}

            <div style={{ fontSize: '12px', color: 'var(--stone)', marginTop: '6px', lineHeight: '1.5' }}>
              💡 Sistem akan memprioritaskan model pilihan Anda (misal: <strong>{getEffectiveModel()}</strong>). Jika model tersebut belum dirilis pada akun Google Anda, sistem otomatis beralih (*failover*) ke model stabil berikutnya tanpa menghentikan analisis.
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
              <span>Uji Koneksi ({getEffectiveModel()})</span>
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

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', marginBottom: '6px' }}>
              <span className={`badge ${sysStatus?.supabase?.connected ? 'badge-completed' : 'badge-failed'}`}>
                {sysStatus?.supabase?.connected ? 'Online & Terkoneksi' : 'Offline / Standalone'}
              </span>
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                {sysStatus?.supabase?.message || 'Memeriksa...'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>SQL DDL Setup Table & Keepalive</label>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleCopySql}
                style={{ padding: '4px 10px', fontSize: '11.5px', background: '#ffffff' }}
              >
                <Copy size={12} />
                <span>{copiedSql ? 'Tersalin! ✅' : 'Salin SQL'}</span>
              </button>
            </div>
            <textarea
              className="form-textarea font-mono"
              style={{ height: '160px', fontSize: '11px', lineHeight: '1.4' }}
              readOnly
              value={`-- Jalankan ini di Supabase SQL Editor:
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
    model_used VARCHAR(100) DEFAULT 'gemini-1.5-flash',
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
CREATE POLICY "Public Access Heartbeat" ON public.ced_heartbeat FOR ALL USING (true) WITH CHECK (true);`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
