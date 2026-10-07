'use client';

import React, { useState, useEffect } from 'react';
import { Database, Key, Copy, ExternalLink, RefreshCw, Activity, Sparkles, X } from 'lucide-react';
import { SUPPORTED_MODEL_CATEGORIES, ALL_SUPPORTED_MODELS } from '@/lib/gemini';
import { DEFAULT_OPENAI_MODELS } from '@/lib/openai';

const SQL_SETUP_SCRIPT = `-- Jalankan ini di Supabase SQL Editor:
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
    model_used VARCHAR(100) DEFAULT 'gemini-3.7-flash',
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
CREATE POLICY "Public Access Heartbeat" ON public.ced_heartbeat FOR ALL USING (true) WITH CHECK (true);

-- Function RPC untuk Loop Heartbeat Otomatis
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
$$;`;

const getTabButtonStyle = (isActive: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '8px 12px',
  border: 'none',
  borderRadius: '8px',
  background: isActive ? '#ffffff' : 'transparent',
  color: isActive ? 'var(--fern)' : 'var(--stone)',
  fontWeight: isActive ? 700 : 500,
  fontSize: '13px',
  cursor: 'pointer',
  boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  transition: 'all 0.15s ease'
});

export const SettingsTab: React.FC = () => {
  // Provider Selection
  const [activeProvider, setActiveProvider] = useState<'gemini' | 'openai'>('gemini');

  // Gemini State
  const [apiKey, setApiKey] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.7-flash');
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);

  // OpenAI / ChatGPT State
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>('gpt-4o-mini');
  const [openaiCustomModels, setOpenaiCustomModels] = useState<string[]>(['GPT Luna', 'GPT Pro']);
  const [newModelInput, setNewModelInput] = useState<string>('');
  const [isOpenaiManualMode, setIsOpenaiManualMode] = useState<boolean>(false);
  const [openaiManualInput, setOpenaiManualInput] = useState<string>('');

  // Status & Test State
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; activeModel?: string } | null>(null);

  const [sysStatus, setSysStatus] = useState<any>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingMessage, setPingMessage] = useState<string | null>(null);

  const handleManualKeepalivePing = async () => {
    setIsPinging(true);
    setPingMessage(null);
    try {
      const res = await fetch('/api/cron/keepalive', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setPingMessage(`Ping sukses! (${json.method || 'aktif'})`);
        await checkSystemStatus();
      } else {
        setPingMessage(`Gagal: ${json.error || json.message}`);
      }
    } catch (e: any) {
      setPingMessage(`Gagal: ${e.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load active provider
    const storedProvider = (localStorage.getItem('custom_ai_provider') || 'gemini') as 'gemini' | 'openai';
    setActiveProvider(storedProvider);

    // Load Gemini settings
    const storedGeminiKey = localStorage.getItem('custom_gemini_key') || '';
    const storedGeminiModel = localStorage.getItem('custom_gemini_model') || 'gemini-3.7-flash';
    setApiKey(storedGeminiKey);
    if (ALL_SUPPORTED_MODELS.includes(storedGeminiModel)) {
      setSelectedModel(storedGeminiModel);
      setIsCustomMode(false);
    } else if (storedGeminiModel && storedGeminiModel !== 'gemini-3.7-flash') {
      setSelectedModel('custom');
      setCustomModelInput(storedGeminiModel);
      setIsCustomMode(true);
    } else {
      setSelectedModel('gemini-3.7-flash');
      setIsCustomMode(false);
    }

    // Load OpenAI settings
    const storedOpenaiKey = localStorage.getItem('custom_openai_key') || '';
    const storedOpenaiBaseUrl = localStorage.getItem('custom_openai_base_url') || '';
    const storedOpenaiModel = localStorage.getItem('custom_openai_model') || 'gpt-4o-mini';
    setOpenaiKey(storedOpenaiKey);
    setOpenaiBaseUrl(storedOpenaiBaseUrl);

    // Load Custom OpenAI Models list
    const storedCustomModelsRaw = localStorage.getItem('custom_openai_custom_models');
    if (storedCustomModelsRaw) {
      try {
        const parsed = JSON.parse(storedCustomModelsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOpenaiCustomModels(parsed);
        }
      } catch {}
    }

    const defaultIds = DEFAULT_OPENAI_MODELS.map(m => m.id);
    if (defaultIds.includes(storedOpenaiModel)) {
      setOpenaiModel(storedOpenaiModel);
      setIsOpenaiManualMode(false);
    } else if (storedOpenaiModel) {
      setOpenaiModel(storedOpenaiModel);
      setIsOpenaiManualMode(false);
    }

    checkSystemStatus();
  }, []);

  const checkSystemStatus = async () => {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      if (json.success) {
        setSysStatus(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getEffectiveGeminiModel = (): string => {
    if (isCustomMode || selectedModel === 'custom') {
      return customModelInput.trim() || 'gemini-3.7-flash';
    }
    return selectedModel || 'gemini-3.7-flash';
  };

  const getEffectiveOpenAIModel = (): string => {
    if (isOpenaiManualMode || openaiModel === 'manual') {
      return openaiManualInput.trim() || 'gpt-4o-mini';
    }
    return openaiModel || 'gpt-4o-mini';
  };

  const handleAddCustomModel = () => {
    const trimmed = newModelInput.trim();
    if (!trimmed) return;
    if (!openaiCustomModels.includes(trimmed)) {
      const updated = [...openaiCustomModels, trimmed];
      setOpenaiCustomModels(updated);
      setOpenaiModel(trimmed);
      setIsOpenaiManualMode(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem('custom_openai_custom_models', JSON.stringify(updated));
      }
    } else {
      setOpenaiModel(trimmed);
      setIsOpenaiManualMode(false);
    }
    setNewModelInput('');
  };

  const handleDeleteCustomModel = (modelToRemove: string) => {
    const updated = openaiCustomModels.filter(m => m !== modelToRemove);
    setOpenaiCustomModels(updated);
    if (openaiModel === modelToRemove) {
      setOpenaiModel('gpt-4o-mini');
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_openai_custom_models', JSON.stringify(updated));
    }
  };

  const handleSaveLocalSettings = () => {
    const effectiveGemini = getEffectiveGeminiModel();
    const effectiveOpenai = getEffectiveOpenAIModel();

    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_ai_provider', activeProvider);
      localStorage.setItem('custom_gemini_key', apiKey.trim());
      localStorage.setItem('custom_gemini_model', effectiveGemini);

      localStorage.setItem('custom_openai_key', openaiKey.trim());
      localStorage.setItem('custom_openai_base_url', openaiBaseUrl.trim());
      localStorage.setItem('custom_openai_model', effectiveOpenai);
      localStorage.setItem('custom_openai_custom_models', JSON.stringify(openaiCustomModels));

      window.dispatchEvent(new Event('storage'));
    }

    const currentProviderLabel = activeProvider === 'openai' ? `OpenAI / Compatible (${effectiveOpenai})` : `Google Gemini (${effectiveGemini})`;
    setTestResult({
      success: true,
      message: `Pengaturan Provider Utama (${currentProviderLabel}) berhasil disimpan ke browser dan langsung aktif di menu Upload & Analisis.`
    });
  };

  const handleTestConnection = async () => {
    setIsTestingKey(true);
    setTestResult(null);

    const isOAI = activeProvider === 'openai';
    const effectiveModel = isOAI ? getEffectiveOpenAIModel() : getEffectiveGeminiModel();
    const activeKey = isOAI ? openaiKey.trim() : apiKey.trim();

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          apiKey: activeKey,
          model: effectiveModel,
          baseUrl: isOAI ? openaiBaseUrl.trim() : undefined
        })
      });
      const json = await res.json();
      setTestResult({
        success: json.success,
        message: json.message || json.error || 'Uji koneksi selesai.',
        activeModel: json.activeModel
      });

      if (json.success) {
        handleSaveLocalSettings();
      }
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
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(SQL_SETUP_SCRIPT);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    }
  };

  const activeModelDisplay = activeProvider === 'openai' ? getEffectiveOpenAIModel() : getEffectiveGeminiModel();

  return (
    <div className="grid-2">
      {/* Kolom Kiri: Konfigurasi Multi-AI Provider */}
      <div>
        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="ct-icon"><Key size={18} color="#2e6922" /></div>
              <span>Konfigurasi Mesin AI (Multi-Model)</span>
            </div>
            <span style={{ fontSize: '12px', background: 'var(--dew)', color: 'var(--moss)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              {activeProvider === 'openai' ? '⚡ OpenAI / ChatGPT' : '🌿 Google Gemini'}
            </span>
          </div>

          {/* Switcher Tab AI Provider */}
          <div style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '16px',
            background: 'var(--dew, #eef7eb)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--border)'
          }}>
            <button
              type="button"
              onClick={() => { setActiveProvider('gemini'); setTestResult(null); }}
              style={getTabButtonStyle(activeProvider === 'gemini')}
            >
              <span>🌿</span>
              <span>Google Gemini AI</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveProvider('openai'); setTestResult(null); }}
              style={getTabButtonStyle(activeProvider === 'openai')}
            >
              <span>⚡</span>
              <span>OpenAI / ChatGPT</span>
            </button>
          </div>

          {/* TAB CONTENT: GOOGLE GEMINI */}
          {activeProvider === 'gemini' && (
            <div>
              <div className="alert alert-info" style={{ fontSize: '13px', marginBottom: '14px' }}>
                <span>🌿</span>
                <span>
                  API Key Google Gemini dapat diperoleh <strong>gratis</strong> di{' '}
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

                {/* Input Manual Kustom Model Gemini */}
                {(isCustomMode || selectedModel === 'custom') && (
                  <div style={{ marginTop: '10px', background: '#f8faf9', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                      Ketik Nama Model Kustom / Preview Google:
                    </label>
                    <input
                      type="text"
                      className="form-input font-mono"
                      placeholder="Contoh: gemini-3.7-flash, gemini-3.5-flash, gemini-3.1-pro"
                      value={customModelInput}
                      onChange={e => setCustomModelInput(e.target.value.trim())}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: OPENAI / CHATGPT & COMPATIBLE */}
          {activeProvider === 'openai' && (
            <div>
              <div className="alert alert-info" style={{ fontSize: '13px', marginBottom: '14px' }}>
                <span>⚡</span>
                <span>
                  Mendukung <strong>OpenAI (ChatGPT)</strong>, <strong>GPT Luna</strong>, <strong>GPT Pro</strong>, atau provider OpenAI-compatible lain. API Key dapat diperoleh di{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    OpenAI Platform <ExternalLink size={12} style={{ display: 'inline' }} />
                  </a>
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">OpenAI / Provider API Key</label>
                <input
                  type="password"
                  className="form-input font-mono"
                  placeholder="sk-proj-... atau API Key OpenAI / provider lain"
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Pilih Model AI</label>
                </div>
                <select
                  className="form-select font-mono"
                  value={isOpenaiManualMode ? 'manual' : openaiModel}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'manual') {
                      setIsOpenaiManualMode(true);
                      setOpenaiModel('manual');
                    } else {
                      setIsOpenaiManualMode(false);
                      setOpenaiModel(val);
                    }
                  }}
                >
                  <optgroup label="🌟 Model Bawaan OpenAI">
                    {DEFAULT_OPENAI_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </optgroup>
                  {openaiCustomModels.length > 0 && (
                    <optgroup label="✨ Model Kustom / Tambahan Pengguna">
                      {openaiCustomModels.map(m => (
                        <option key={m} value={m}>🤖 {m}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="✍️ Kustomisasi Langsung">
                    <option value="manual">-- Ketik Nama Model Lain Secara Manual --</option>
                  </optgroup>
                </select>

                {/* Input Manual Kustom Model */}
                {(isOpenaiManualMode || openaiModel === 'manual') && (
                  <div style={{ marginTop: '10px', background: '#f8faf9', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                      Ketik Nama Model Manual:
                    </label>
                    <input
                      type="text"
                      className="form-input font-mono"
                      placeholder="Contoh: gpt-4o, gpt-3.5-turbo, gpt-pro, gpt-luna"
                      value={openaiManualInput}
                      onChange={e => setOpenaiManualInput(e.target.value.trim())}
                    />
                  </div>
                )}
              </div>

              {/* Box Tambah & Kelola Model Kustom */}
              <div style={{
                background: 'var(--dew, #f4faf2)',
                border: '1px dashed var(--leaf, #489333)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--fern, #2e6922)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} />
                  <span>Tambah Model AI Baru (Contoh: GPT Luna, GPT Pro, dll)</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="Ketik nama model (misal: GPT Luna / GPT Pro)"
                    value={newModelInput}
                    onChange={e => setNewModelInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomModel();
                      }
                    }}
                    style={{ fontSize: '13px', background: '#ffffff' }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleAddCustomModel}
                    style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 800 }}>+</span>
                    <span>Tambah Model</span>
                  </button>
                </div>

                {/* Daftar Model Kustom Terdaftar */}
                {openaiCustomModels.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11.5px', color: 'var(--stone)', marginBottom: '4px' }}>
                      Model kustom tersimpan di browser:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {openaiCustomModels.map(m => (
                        <span
                          key={m}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: openaiModel === m ? 'var(--fern)' : '#ffffff',
                            color: openaiModel === m ? '#ffffff' : 'var(--bark)',
                            border: '1px solid var(--border)',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            setOpenaiModel(m);
                            setIsOpenaiManualMode(false);
                          }}
                          title={`Klik untuk memilih ${m}`}
                        >
                          <span>🤖 {m}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomModel(m);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: openaiModel === m ? '#ffffff' : 'var(--danger)',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title={`Hapus model ${m}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Base URL (Opsional) */}
              <div className="form-group" style={{ marginBottom: '10px' }}>
                <label className="form-label" style={{ fontSize: '12px' }}>
                  Base URL Endpoint (Opsional / Custom Proxy)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="https://api.openai.com/v1 (kosongkan jika resmi)"
                    value={openaiBaseUrl}
                    onChange={e => setOpenaiBaseUrl(e.target.value.trim())}
                    style={{ fontSize: '12px' }}
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--stone)', marginTop: '4px' }}>
                  💡 Kosongkan untuk OpenAI standar, atau isi jika menggunakan server proxy, OpenRouter, atau endpoint kustom model Anda.
                </div>
              </div>
            </div>
          )}

          {/* Indikator Model Aktif */}
          <div style={{ fontSize: '12px', color: 'var(--stone)', marginTop: '6px', lineHeight: '1.5' }}>
            💡 Prioritas Aktif: <strong>{activeProvider === 'openai' ? 'OpenAI / ChatGPT' : 'Google Gemini'}</strong> (Model: <strong>{activeModelDisplay}</strong>). Pengaturan ini otomatis dipakai di menu <strong>Upload & Analisis</strong>.
          </div>

          {/* Alert Hasil Uji / Simpan */}
          {testResult && (
            <div className={`alert alert-${testResult.success ? 'success' : 'error'}`} style={{ marginTop: '12px' }}>
              <span>{testResult.success ? '✅' : '❌'}</span>
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Tombol Simpan & Uji Koneksi */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleSaveLocalSettings}>
              💾 Simpan di Browser
            </button>
            <button className="btn btn-outline" onClick={handleTestConnection} disabled={isTestingKey}>
              {isTestingKey ? <span className="spinner" /> : <RefreshCw size={14} />}
              <span>Uji Koneksi ({activeModelDisplay})</span>
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

          {/* Card Status Keepalive Loop */}
          <div style={{
            background: 'var(--surface-sunken, #f8fafc)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--forest-green, #166534)' }}>
                <Activity size={15} />
                <span>Pelindung Anti-Hibernasi (Keepalive Loop)</span>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleManualKeepalivePing}
                disabled={isPinging}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                title="Kirim ping paksa untuk memicu aktivitas database sekarang"
              >
                {isPinging ? <span className="spinner" /> : <RefreshCw size={11} />}
                <span>{isPinging ? 'Pinging...' : 'Ping Sekarang'}</span>
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', lineHeight: '1.5', marginBottom: '8px' }}>
              Looping kegiatan otomatis menjaga Supabase Free Tier tetap aktif 24/7 tanpa mencemari data analisis atau memodifikasi tabel regresi.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '11.5px', background: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color, #e2e8f0)' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Ping Terakhir:</span>
                <div style={{ fontWeight: 500, marginTop: '2px' }}>
                  {sysStatus?.supabase?.heartbeat?.last_ping 
                    ? new Date(sysStatus.supabase.heartbeat.last_ping).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short' })
                    : (sysStatus?.supabase?.connected ? 'Terkoneksi (Menunggu Siklus)' : 'Belum aktif')}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Total Siklus Ping:</span>
                <div style={{ fontWeight: 500, marginTop: '2px', color: '#166534' }}>
                  {sysStatus?.supabase?.heartbeat?.ping_count ? `${sysStatus.supabase.heartbeat.ping_count} kali` : '1 kali'}
                </div>
              </div>
            </div>

            {pingMessage && (
              <div style={{ fontSize: '11.5px', color: '#166534', marginTop: '6px' }}>
                🟢 {pingMessage}
              </div>
            )}
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
              value={SQL_SETUP_SCRIPT}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
