'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Database, Key, Copy, ExternalLink, RefreshCw, Activity, Sparkles, Upload, FileText, Trash2, Eye, Plus, Check, X, BookOpen, Edit2, Globe } from 'lucide-react';
import { CustomAISkill } from '@/lib/types';
import { getStoredSkills, saveStoredSkills, parseUploadedSkillFile } from '@/lib/indicators-storage';
import { useLanguage } from '@/lib/i18n';
import { SUPPORTED_MODEL_CATEGORIES, ALL_SUPPORTED_MODELS } from '@/lib/gemini';
import { DEFAULT_OPENAI_MODELS } from '@/lib/openai';
import {
  CLAUDE_MODEL_CATEGORIES,
  ALL_CLAUDE_MODELS,
  CLAUDE_EFFORT_CONFIGS,
  ClaudeEffortLevel
} from '@/lib/claude';
import { pushAccountSettings, hydrateFromAccount, readLocalSnapshot } from '@/lib/account-sync';

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
$$;
GRANT EXECUTE ON FUNCTION public.keepalive_ping() TO anon, authenticated;

-- Jadwal pg_cron otomatis setiap 6 jam (tetap aktif walau web/dashboard tidak dibuka)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ced-supabase-keepalive-every-6-hours';
    PERFORM cron.schedule('ced-supabase-keepalive-every-6-hours', '0 */6 * * *', 'SELECT public.keepalive_ping()');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron tidak tersedia (%)', SQLERRM;
END $$;

-- Tabel Akun Aplikasi (username + password, tanpa email)
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_.-]{3,32}$'),
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
GRANT ALL ON TABLE public.app_users TO postgres, anon, authenticated, service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "App Server Access Users" ON public.app_users;
CREATE POLICY "App Server Access Users" ON public.app_users FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- Tabel fallback app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
GRANT ALL ON TABLE public.app_settings TO postgres, anon, authenticated, service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access App Settings" ON public.app_settings;
CREATE POLICY "Public Access App Settings" ON public.app_settings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- (Opsional) Tabel Kustom Preset Indikator & Custom AI Skills:
CREATE TABLE IF NOT EXISTS public.custom_indicator_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.custom_indicator_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Presets" ON public.custom_indicator_presets FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.custom_ai_skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_name TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE public.custom_ai_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Skills" ON public.custom_ai_skills FOR ALL USING (true) WITH CHECK (true);`;

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
  const { lang, setLang } = useLanguage();
  const isEn = lang === 'en';

  // Provider Selection
  const [activeProvider, setActiveProvider] = useState<'gemini' | 'openai' | 'claude'>('gemini');

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

  // Claude State
  const [claudeKey, setClaudeKey] = useState<string>('');
  const [claudeBaseUrl, setClaudeBaseUrl] = useState<string>('');
  const [claudeModel, setClaudeModel] = useState<string>('claude-3-7-sonnet-20250219');
  const [claudeEffort, setClaudeEffort] = useState<ClaudeEffortLevel>('medium');
  const [claudeCustomModels, setClaudeCustomModels] = useState<string[]>([]);
  const [newClaudeModelInput, setNewClaudeModelInput] = useState<string>('');
  const [isClaudeManualMode, setIsClaudeManualMode] = useState<boolean>(false);
  const [claudeManualInput, setClaudeManualInput] = useState<string>('');

  // Status & Test State
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; activeModel?: string } | null>(null);

  const [sysStatus, setSysStatus] = useState<any>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingMessage, setPingMessage] = useState<string | null>(null);

  // Custom AI Skills State
  const [skills, setSkills] = useState<CustomAISkill[]>([]);
  const [showSkillModal, setShowSkillModal] = useState<boolean>(false);
  const [previewingSkill, setPreviewingSkill] = useState<CustomAISkill | null>(null);
  const [editingSkill, setEditingSkill] = useState<CustomAISkill | null>(null);
  const [skillFormName, setSkillFormName] = useState<string>('');
  const [skillFormContent, setSkillFormContent] = useState<string>('');
  const [skillNotice, setSkillNotice] = useState<{ type: 'success' | 'warn'; text: string } | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  const loadSkillsData = () => {
    const loaded = getStoredSkills();
    setSkills(loaded);
  };

  const handleSkillFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const allowedExts = ['.skill', '.md', '.txt', '.json', '.yaml', '.yml'];
    if (!allowedExts.some(ext => lowerName.endsWith(ext))) {
      alert(
        isEn
          ? 'Supported formats: .skill, Markdown (.md), Text (.txt), JSON (.json), or YAML (.yaml).'
          : 'Hanya mendukung file format .skill, Markdown (.md), Teks (.txt), JSON (.json), atau YAML (.yaml).'
      );
      e.target.value = '';
      return;
    }

    try {
      const parsed = await parseUploadedSkillFile(file);
      const newSkill: CustomAISkill = {
        id: `skill_${Date.now()}`,
        name: parsed.name,
        description: parsed.description,
        fileName: file.name,
        content: parsed.content,
        createdAt: new Date().toISOString()
      };

      const updated = [newSkill, ...skills.filter(s => s.name !== parsed.name)];
      setSkills(updated);
      saveStoredSkills(updated);
      setSkillNotice({
        type: 'success',
        text: isEn
          ? `Skill "${file.name}" (${parsed.name}) uploaded and saved!`
          : `Skill "${file.name}" (${parsed.name}) berhasil diunggah dan disimpan!`
      });
      setTimeout(() => setSkillNotice(null), 4000);
    } catch (err: any) {
      alert(err?.message || (isEn ? 'Failed to read skill file.' : 'Gagal membaca file skill.'));
    } finally {
      e.target.value = '';
    }
  };

  const handleOpenSkillModal = (skill?: CustomAISkill) => {
    if (skill) {
      setEditingSkill(skill);
      setSkillFormName(skill.name);
      setSkillFormContent(skill.content);
    } else {
      setEditingSkill(null);
      setSkillFormName('');
      setSkillFormContent('');
    }
    setShowSkillModal(true);
  };

  const handleSaveSkillManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillFormName.trim() || !skillFormContent.trim()) return;

    if (editingSkill) {
      const updated = skills.map(s => s.id === editingSkill.id ? {
        ...s,
        name: skillFormName.trim(),
        content: skillFormContent.trim()
      } : s);
      setSkills(updated);
      saveStoredSkills(updated);
      setSkillNotice({ type: 'success', text: `Skill "${skillFormName.trim()}" berhasil diperbarui.` });
    } else {
      const newSkill: CustomAISkill = {
        id: `skill_${Date.now()}`,
        name: skillFormName.trim(),
        content: skillFormContent.trim(),
        createdAt: new Date().toISOString()
      };
      const updated = [newSkill, ...skills];
      setSkills(updated);
      saveStoredSkills(updated);
      setSkillNotice({ type: 'success', text: `Skill baru "${newSkill.name}" berhasil ditambahkan.` });
    }

    setShowSkillModal(false);
    setTimeout(() => setSkillNotice(null), 4000);
  };

  const handleDeleteSkill = (skillId: string, skillName: string) => {
    if (!confirm(`Hapus skill "${skillName}"?`)) return;
    const updated = skills.filter(s => s.id !== skillId);
    setSkills(updated);
    saveStoredSkills(updated);
    setSkillNotice({ type: 'warn', text: `Skill "${skillName}" telah dihapus.` });
    setTimeout(() => setSkillNotice(null), 4000);
  };

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

  const loadLocalProviderSettings = () => {
    if (typeof window === 'undefined') return;

    // Load active provider
    const storedProvider = (localStorage.getItem('custom_ai_provider') || 'gemini') as 'gemini' | 'openai' | 'claude';
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

    // Load Claude settings
    const storedClaudeKey = localStorage.getItem('custom_claude_key') || '';
    const storedClaudeBaseUrl = localStorage.getItem('custom_claude_base_url') || '';
    const storedClaudeModel = localStorage.getItem('custom_claude_model') || 'claude-3-7-sonnet-20250219';
    const storedClaudeEffort = (localStorage.getItem('custom_claude_effort') || 'medium') as ClaudeEffortLevel;
    setClaudeKey(storedClaudeKey);
    setClaudeBaseUrl(storedClaudeBaseUrl);
    if (storedClaudeEffort in CLAUDE_EFFORT_CONFIGS) {
      setClaudeEffort(storedClaudeEffort);
    }

    const storedClaudeCustomRaw = localStorage.getItem('custom_claude_custom_models');
    if (storedClaudeCustomRaw) {
      try {
        const parsed = JSON.parse(storedClaudeCustomRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClaudeCustomModels(parsed);
        }
      } catch {}
    }

    const defaultClaudeIds = ALL_CLAUDE_MODELS.map(m => m.id);
    if (defaultClaudeIds.includes(storedClaudeModel)) {
      setClaudeModel(storedClaudeModel);
      setIsClaudeManualMode(false);
    } else if (storedClaudeModel) {
      setClaudeModel(storedClaudeModel);
      setIsClaudeManualMode(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadLocalProviderSettings();
    checkSystemStatus();
    loadSkillsData();

    const handleSyncUpdate = () => {
      loadLocalProviderSettings();
      loadSkillsData();
    };
    window.addEventListener('analyzer-settings-changed', handleSyncUpdate);
    return () => {
      window.removeEventListener('analyzer-settings-changed', handleSyncUpdate);
    };
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

  const getEffectiveClaudeModel = (): string => {
    if (isClaudeManualMode || claudeModel === 'manual') {
      return claudeManualInput.trim() || 'claude-3-7-sonnet-20250219';
    }
    return claudeModel || 'claude-3-7-sonnet-20250219';
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

  const handleAddClaudeCustomModel = () => {
    const trimmed = newClaudeModelInput.trim();
    if (!trimmed) return;
    if (!claudeCustomModels.includes(trimmed)) {
      const updated = [...claudeCustomModels, trimmed];
      setClaudeCustomModels(updated);
      setClaudeModel(trimmed);
      setIsClaudeManualMode(false);
      if (typeof window !== 'undefined') {
        localStorage.setItem('custom_claude_custom_models', JSON.stringify(updated));
      }
    } else {
      setClaudeModel(trimmed);
      setIsClaudeManualMode(false);
    }
    setNewClaudeModelInput('');
  };

  const handleDeleteClaudeCustomModel = (modelToRemove: string) => {
    const updated = claudeCustomModels.filter(m => m !== modelToRemove);
    setClaudeCustomModels(updated);
    if (claudeModel === modelToRemove) {
      setClaudeModel('claude-3-7-sonnet-20250219');
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_claude_custom_models', JSON.stringify(updated));
    }
  };

  const handleSaveLocalSettings = () => {
    const effectiveGemini = getEffectiveGeminiModel();
    const effectiveOpenai = getEffectiveOpenAIModel();
    const effectiveClaude = getEffectiveClaudeModel();

    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_ai_provider', activeProvider);
      localStorage.setItem('custom_gemini_key', apiKey.trim());
      localStorage.setItem('custom_gemini_model', effectiveGemini);

      localStorage.setItem('custom_openai_key', openaiKey.trim());
      localStorage.setItem('custom_openai_base_url', openaiBaseUrl.trim());
      localStorage.setItem('custom_openai_model', effectiveOpenai);
      localStorage.setItem('custom_openai_custom_models', JSON.stringify(openaiCustomModels));

      localStorage.setItem('custom_claude_key', claudeKey.trim());
      localStorage.setItem('custom_claude_base_url', claudeBaseUrl.trim());
      localStorage.setItem('custom_claude_model', effectiveClaude);
      localStorage.setItem('custom_claude_effort', claudeEffort);
      localStorage.setItem('custom_claude_custom_models', JSON.stringify(claudeCustomModels));

      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('analyzer-settings-changed'));
    }

    let currentProviderLabel = `Google Gemini (${effectiveGemini})`;
    if (activeProvider === 'openai') {
      currentProviderLabel = `OpenAI / Compatible (${effectiveOpenai})`;
    } else if (activeProvider === 'claude') {
      currentProviderLabel = `Anthropic Claude (${effectiveClaude} - ${CLAUDE_EFFORT_CONFIGS[claudeEffort]?.label || claudeEffort})`;
    }

    setTestResult({
      success: true,
      message: `Pengaturan Provider Utama (${currentProviderLabel}) berhasil disimpan ke Akun Anda & Browser (tersinkronisasi otomatis lintas perangkat).`
    });
  };

  const handleTestConnection = async () => {
    setIsTestingKey(true);
    setTestResult(null);

    let effectiveModel = getEffectiveGeminiModel();
    let activeKey = apiKey.trim();
    let baseUrl: string | undefined = undefined;

    if (activeProvider === 'openai') {
      effectiveModel = getEffectiveOpenAIModel();
      activeKey = openaiKey.trim();
      baseUrl = openaiBaseUrl.trim() || undefined;
    } else if (activeProvider === 'claude') {
      effectiveModel = getEffectiveClaudeModel();
      activeKey = claudeKey.trim();
      baseUrl = claudeBaseUrl.trim() || undefined;
    }

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          apiKey: activeKey,
          model: effectiveModel,
          baseUrl,
          effort: activeProvider === 'claude' ? claudeEffort : undefined
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

  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string | null>(null);

  const handlePushToCloud = async () => {
    setIsCloudSyncing(true);
    setCloudSyncMessage(null);
    try {
      handleSaveLocalSettings();
      const local = readLocalSnapshot();
      const status = await pushAccountSettings(local);
      if (status === 'ok') {
        setCloudSyncMessage(isEn ? 'Settings synced to Supabase (app_users) successfully!' : 'Pengaturan & API Key berhasil dikirim dan disimpan ke tabel app_users di Supabase!');
      } else {
        setCloudSyncMessage(isEn ? 'Session expired, please login again.' : 'Sesi login telah berakhir. Silakan login kembali.');
      }
    } catch (err: any) {
      setCloudSyncMessage(err?.message || (isEn ? 'Sync failed' : 'Gagal sinkronisasi ke Supabase'));
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setCloudSyncMessage(null), 6000);
    }
  };

  const handlePullFromCloud = async () => {
    setIsCloudSyncing(true);
    setCloudSyncMessage(null);
    try {
      await hydrateFromAccount();
      loadLocalProviderSettings();
      loadSkillsData();
      setCloudSyncMessage(isEn ? 'Settings pulled from Supabase successfully!' : 'Pengaturan & API Key berhasil ditarik dari akun Supabase Anda ke browser ini!');
    } catch (err: any) {
      setCloudSyncMessage(err?.message || (isEn ? 'Pull failed' : 'Gagal menarik pengaturan dari Supabase'));
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setCloudSyncMessage(null), 6000);
    }
  };

  const handleCopySql = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(SQL_SETUP_SCRIPT);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    }
  };

  let activeModelDisplay = getEffectiveGeminiModel();
  if (activeProvider === 'openai') {
    activeModelDisplay = getEffectiveOpenAIModel();
  } else if (activeProvider === 'claude') {
    activeModelDisplay = `${getEffectiveClaudeModel()} [${claudeEffort.toUpperCase()}]`;
  }

  return (
    <div className="grid-2">
      {/* SECTION: PILIHAN BAHASA TAMPILAN & TRANSLASI OTOMATIS INDIKATOR */}
      <div className="card" style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div className="card-title" style={{ marginBottom: '4px' }}>
              <div className="ct-icon"><Globe size={18} color="#2e6922" /></div>
              <span>{isEn ? 'Display Language & Auto-Indicator Translation' : 'Pilihan Bahasa Tampilan & Translasi Indikator'}</span>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
              {isEn
                ? 'All menus and indicators (even custom indicators inputted in Indonesian) will automatically translate and display in your selected language.'
                : 'Seluruh menu serta daftar indikator (termasuk indikator kustom yang diinput dalam Bahasa Indonesia/Inggris) akan otomatis diterjemahkan mengikuti bahasa tampilan yang dipilih.'}
            </p>
          </div>

          <div
            style={{
              display: 'inline-flex',
              gap: '6px',
              background: 'var(--dew, #eef7eb)',
              padding: '5px',
              borderRadius: '10px',
              border: '1px solid var(--border)'
            }}
          >
            <button
              type="button"
              onClick={() => setLang('id')}
              style={{
                ...getTabButtonStyle(lang === 'id'),
                padding: '8px 16px',
                minWidth: '170px'
              }}
            >
              <span>🇮🇩</span>
              <span>Bahasa Indonesia</span>
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              style={{
                ...getTabButtonStyle(lang === 'en'),
                padding: '8px 16px',
                minWidth: '170px'
              }}
            >
              <span>🇬🇧</span>
              <span>English (EN)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Kolom Kiri: Konfigurasi Multi-AI Provider */}
      <div>
        <div className="card">
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="ct-icon"><Key size={18} color="#2e6922" /></div>
              <span>{isEn ? 'AI Engine Configuration (Multi-Model)' : 'Konfigurasi Mesin AI (Multi-Model)'}</span>
            </div>
            <span style={{ fontSize: '12px', background: 'var(--dew)', color: 'var(--moss)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              {activeProvider === 'claude' ? '🎭 Anthropic Claude' : activeProvider === 'openai' ? '⚡ OpenAI / ChatGPT' : '🌿 Google Gemini'}
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
            <button
              type="button"
              onClick={() => { setActiveProvider('claude'); setTestResult(null); }}
              style={getTabButtonStyle(activeProvider === 'claude')}
            >
              <span>🎭</span>
              <span>Anthropic Claude</span>
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

          {/* TAB CONTENT: ANTHROPIC CLAUDE */}
          {activeProvider === 'claude' && (
            <div>
              <div className="alert alert-info" style={{ fontSize: '13px', marginBottom: '14px' }}>
                <span>🎭</span>
                <span>
                  Mendukung <strong>Anthropic Claude</strong> resmi (Opus, Sonnet, Haiku, Fable) serta server proxy Claude. API Key dapat diperoleh di{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    Anthropic Console <ExternalLink size={12} style={{ display: 'inline' }} />
                  </a>
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Claude API Key</label>
                <input
                  type="password"
                  className="form-input font-mono"
                  placeholder="sk-ant-api03-... (dari Anthropic Console)"
                  value={claudeKey}
                  onChange={e => setClaudeKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Pilih Model Claude AI</label>
                </div>
                <select
                  className="form-select font-mono"
                  value={isClaudeManualMode ? 'manual' : claudeModel}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'manual') {
                      setIsClaudeManualMode(true);
                      setClaudeModel('manual');
                    } else {
                      setIsClaudeManualMode(false);
                      setClaudeModel(val);
                    }
                  }}
                >
                  {CLAUDE_MODEL_CATEGORIES.map(cat => (
                    <optgroup key={cat.category} label={cat.category}>
                      {cat.models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {claudeCustomModels.length > 0 && (
                    <optgroup label="✨ Model Kustom / Tambahan Pengguna">
                      {claudeCustomModels.map(m => (
                        <option key={m} value={m}>🤖 {m}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="✍️ Kustomisasi Langsung">
                    <option value="manual">-- Ketik Nama Model Lain Secara Manual --</option>
                  </optgroup>
                </select>

                {/* Input Manual Kustom Model Claude */}
                {(isClaudeManualMode || claudeModel === 'manual') && (
                  <div style={{ marginTop: '10px', background: '#f8faf9', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                      Ketik Nama Model Claude Manual:
                    </label>
                    <input
                      type="text"
                      className="form-input font-mono"
                      placeholder="Contoh: claude-3-7-sonnet-20250219, claude-opus-5-5, claude-fable-5-1"
                      value={claudeManualInput}
                      onChange={e => setClaudeManualInput(e.target.value.trim())}
                    />
                  </div>
                )}
              </div>

              {/* Tingkat Kerja (Extended Thinking Budget) */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tingkat Kerja (Extended Thinking Budget)</span>
                  <span style={{ fontSize: '11px', color: 'var(--moss)', fontWeight: 600 }}>
                    Token Reasoning
                  </span>
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '6px',
                  marginBottom: '8px'
                }}>
                  {(['low', 'medium', 'hard', 'extra'] as ClaudeEffortLevel[]).map(lvl => {
                    const cfg = CLAUDE_EFFORT_CONFIGS[lvl];
                    const isSelected = claudeEffort === lvl;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setClaudeEffort(lvl)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid var(--fern)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--dew, #eef7eb)' : '#ffffff',
                          color: isSelected ? 'var(--fern)' : 'var(--bark)',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>
                          {lvl === 'medium' ? 'Medium ⭐' : lvl}
                        </span>
                        <span style={{ fontSize: '10.5px', color: isSelected ? 'var(--fern)' : 'var(--stone)' }}>
                          {(cfg.budgetTokens / 1024).toFixed(0)}k tkns
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--stone)', background: '#fafbfc', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  💡 <strong>{CLAUDE_EFFORT_CONFIGS[claudeEffort]?.label}</strong>: {CLAUDE_EFFORT_CONFIGS[claudeEffort]?.description}
                </div>
              </div>

              {/* Box Tambah & Kelola Model Kustom Claude */}
              <div style={{
                background: 'var(--dew, #f4faf2)',
                border: '1px dashed var(--leaf, #489333)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--fern, #2e6922)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} />
                  <span>Tambah Model Claude Kustom (Contoh: claude-custom-proxy, dll)</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="Ketik slug model (misal: claude-opus-next)"
                    value={newClaudeModelInput}
                    onChange={e => setNewClaudeModelInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddClaudeCustomModel();
                      }
                    }}
                    style={{ fontSize: '13px', background: '#ffffff' }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleAddClaudeCustomModel}
                    style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span style={{ fontSize: '15px', fontWeight: 800 }}>+</span>
                    <span>Tambah Model</span>
                  </button>
                </div>

                {/* Daftar Model Kustom Terdaftar */}
                {claudeCustomModels.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11.5px', color: 'var(--stone)', marginBottom: '4px' }}>
                      Model kustom tersimpan di browser:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {claudeCustomModels.map(m => (
                        <span
                          key={m}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: claudeModel === m ? 'var(--fern)' : '#ffffff',
                            color: claudeModel === m ? '#ffffff' : 'var(--bark)',
                            border: '1px solid var(--border)',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                          onClick={() => {
                            setClaudeModel(m);
                            setIsClaudeManualMode(false);
                          }}
                          title={`Klik untuk memilih ${m}`}
                        >
                          <span>🤖 {m}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClaudeCustomModel(m);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: claudeModel === m ? '#ffffff' : 'var(--danger)',
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
                  Base URL Endpoint (Opsional / Claude Proxy)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-input font-mono"
                    placeholder="https://api.anthropic.com/v1 (kosongkan jika resmi)"
                    value={claudeBaseUrl}
                    onChange={e => setClaudeBaseUrl(e.target.value.trim())}
                    style={{ fontSize: '12px' }}
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--stone)', marginTop: '4px' }}>
                  💡 Kosongkan untuk Anthropic standar, atau isi jika menggunakan server proxy gateway Claude kustom Anda.
                </div>
              </div>
            </div>
          )}

          {/* Indikator Model Aktif */}
          <div style={{ fontSize: '12px', color: 'var(--stone)', marginTop: '6px', lineHeight: '1.5' }}>
            💡 Prioritas Aktif: <strong>{activeProvider === 'claude' ? 'Anthropic Claude' : activeProvider === 'openai' ? 'OpenAI / ChatGPT' : 'Google Gemini'}</strong> (Model: <strong>{activeModelDisplay}</strong>). Pengaturan ini otomatis dipakai di menu <strong>Upload & Analisis</strong>.
          </div>

          {/* Alert Hasil Uji / Simpan */}
          {testResult && (
            <div className={`alert alert-${testResult.success ? 'success' : 'error'}`} style={{ marginTop: '12px' }}>
              <span>{testResult.success ? '✅' : '❌'}</span>
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Tombol Simpan & Uji Koneksi & Cloud Sync */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleSaveLocalSettings}>
              💾 Simpan di Browser
            </button>
            <button
              className="btn btn-outline"
              onClick={handlePushToCloud}
              disabled={isCloudSyncing}
              title="Kirim dan simpan seluruh API Key & Pengaturan lokal ke akun Supabase"
              style={{ borderColor: 'var(--fern)', color: 'var(--fern)', fontWeight: 700 }}
            >
              {isCloudSyncing ? <span className="spinner" /> : <Upload size={14} />}
              <span>{isEn ? 'Sync to Supabase' : 'Kirim ke Cloud Supabase'}</span>
            </button>
            <button
              className="btn btn-outline"
              onClick={handlePullFromCloud}
              disabled={isCloudSyncing}
              title="Tarik API Key & Pengaturan dari akun Supabase Anda ke browser ini"
            >
              {isCloudSyncing ? <span className="spinner" /> : <RefreshCw size={14} />}
              <span>{isEn ? 'Pull from Supabase' : 'Tarik dari Cloud Supabase'}</span>
            </button>
            <button className="btn btn-outline" onClick={handleTestConnection} disabled={isTestingKey}>
              {isTestingKey ? <span className="spinner" /> : <RefreshCw size={14} />}
              <span>Uji Koneksi ({activeModelDisplay})</span>
            </button>
          </div>

          {cloudSyncMessage && (
            <div className="alert alert-info" style={{ marginTop: '10px', fontSize: '12.5px' }}>
              <span>☁️</span>
              <span>{cloudSyncMessage}</span>
            </div>
          )}
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

      {/* SECTION: MANAJEMEN CUSTOM AI SKILLS */}
      <div className="card" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="ct-icon">🧠</div>
            <span>{isEn ? 'Custom AI Skills Management (Analysis Assistant)' : 'Manajemen Custom AI Skills (Bantuan Analisis)'}</span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="file"
              ref={skillFileInputRef}
              accept=".skill,.md,.txt,.json,.yaml,.yml"
              style={{ display: 'none' }}
              onChange={handleSkillFileUpload}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => skillFileInputRef.current?.click()}
            >
              <Upload size={14} />
              <span>{isEn ? 'Upload Skill File (.skill / .md / .txt)' : 'Unggah File Skill (.skill / .md / .txt)'}</span>
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleOpenSkillModal()}
            >
              <Plus size={14} />
              <span>{isEn ? 'Write Manual Skill' : 'Tulis Skill Manual'}</span>
            </button>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          {isEn ? (
            <>
              Upload auditing guidelines, specific regulations (e.g., POJK 51, GRI Standards, green taxonomy), or industry guides in <code>.skill</code>, Markdown (<code>.md</code>), or Text (<code>.txt</code>) format. Saved skills can be selected in the <strong>Upload & Analysis</strong> tab to deepen AI evaluation.
            </>
          ) : (
            <>
              Unggah instruksi pedoman auditing, regulasi spesifik (misal: POJK 51, Standar GRI, taksonomi hijau), atau panduan industri dalam format <code>.skill</code>, Markdown (<code>.md</code>), atau Teks (<code>.txt</code>). Skill yang tersimpan dapat dipilih pada tab <strong>Upload & Analisis</strong> untuk memperdalam evaluasi AI.
            </>
          )}
        </p>

        {skillNotice && (
          <div className={`alert alert-${skillNotice.type}`} style={{ marginBottom: '14px' }}>
            <span>{skillNotice.type === 'success' ? '🌿' : '⚠️'}</span>
            <span>{skillNotice.text}</span>
          </div>
        )}

        {/* Daftar Skill Tersimpan */}
        {skills.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', background: 'var(--dew)', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--stone)' }}>
            <BookOpen size={28} style={{ opacity: 0.6, marginBottom: '6px' }} />
            <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text)' }}>
              {isEn ? 'No custom skills uploaded yet' : 'Belum ada skill yang diunggah'}
            </div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              {isEn ? (
                <>
                  Click <strong>"Upload Skill File (.skill / .md / .txt)"</strong> above to add your first analysis assistant skill.
                </>
              ) : (
                <>
                  Klik tombol <strong>"Unggah File Skill (.skill / .md / .txt)"</strong> di atas untuk menambahkan dokumen keahlian bantuan analisis pertama Anda.
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {skills.map(s => {
              const extBadge = s.fileName
                ? s.fileName.toLowerCase().endsWith('.skill')
                  ? '.SKILL'
                  : s.fileName.toLowerCase().endsWith('.md')
                  ? '.MD'
                  : '.TXT'
                : 'MANUAL';

              return (
                <div
                  key={s.id}
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                        ✨ {s.name}
                      </div>
                      <span className="badge" style={{ fontSize: '10px', background: 'var(--dew)', color: 'var(--moss)' }}>
                        {extBadge}
                      </span>
                    </div>
                    {s.description && (
                      <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--fern)', marginBottom: '4px' }}>
                        {s.description}
                      </div>
                    )}
                    <p style={{ fontSize: '12px', color: 'var(--stone)', lineHeight: '1.45', height: '36px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {s.content}
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--stone)' }}>
                      {new Date(s.createdAt).toLocaleDateString(isEn ? 'en-US' : 'id-ID')}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => setPreviewingSkill(s)}
                        title={isEn ? 'Preview Skill Content' : 'Pratinjau Teks Skill'}
                      >
                        <Eye size={12} /> {isEn ? 'Preview' : 'Pratinjau'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        onClick={() => handleOpenSkillModal(s)}
                        title={isEn ? 'Edit Skill' : 'Edit Skill'}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        style={{ padding: '3px 8px', fontSize: '11px', color: 'var(--danger)', borderColor: 'var(--border)' }}
                        onClick={() => handleDeleteSkill(s.id, s.name)}
                        title={isEn ? 'Delete Skill' : 'Hapus Skill'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL EDIT / TAMBAH SKILL */}
      {showSkillModal && (
        <div className="modal-backdrop" onClick={() => setShowSkillModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🧠</span>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>
                  {editingSkill ? `Edit Skill: ${editingSkill.name}` : 'Tambah Custom AI Skill Baru'}
                </h3>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setShowSkillModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSkillManual}>
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>Nama Skill</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Misal: POJK 51 ESG Auditor atau Panduan Sektor Pertambangan"
                  value={skillFormName}
                  onChange={e => setSkillFormName(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
                  Konten Instruksi Pedoman (Prompt Tambahan untuk AI)
                </label>
                <textarea
                  className="form-textarea font-mono"
                  rows={8}
                  style={{ fontSize: '12px', lineHeight: '1.5' }}
                  placeholder="Ketik atau paste instruksi panduan audit, terminologi, atau kriteria penilaian khusus di sini..."
                  value={skillFormContent}
                  onChange={e => setSkillFormContent(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowSkillModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {editingSkill ? 'Simpan Perubahan' : 'Simpan Skill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRATINJAU SKILL */}
      {previewingSkill && (
        <div className="modal-backdrop" onClick={() => setPreviewingSkill(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📄</span>
                <h3 style={{ fontSize: '16px', fontWeight: 800 }}>Pratinjau Skill: {previewingSkill.name}</h3>
              </div>
              <button type="button" className="drawer-close-btn" onClick={() => setPreviewingSkill(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ maxHeight: '350px', overflowY: 'auto', background: 'var(--dew)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: 'monospace' }}>
              {previewingSkill.content}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewingSkill(null)}>
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
