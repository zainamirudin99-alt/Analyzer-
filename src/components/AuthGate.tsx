'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, User, LogIn, UserPlus, Eye, EyeOff, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import {
  AccountUser,
  clearLocalSnapshot,
  clearStoredAuthSession,
  getAuthHeaders,
  hydrateFromAccount,
  pushAccountSettings,
  readLocalSnapshot,
  setStoredAuthSession
} from '@/lib/account-sync';
import { useLanguage } from '@/lib/i18n';
import { ThemeToggle } from './ThemeToggle';

interface AuthGateProps {
  children: (ctx: { user: AccountUser; onLogout: () => Promise<void> }) => React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';

  const [user, setUser] = useState<AccountUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lastSyncedJsonRef = useRef<string>('');
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cek sesi aktif saat halaman dibuka
  useEffect(() => {
    let active = true;
    const verify = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          cache: 'no-store',
          headers: getAuthHeaders()
        });
        const json = await res.json().catch(() => ({}));
        if (active && res.ok && json.success && json.user) {
          setUser(json.user);
          try {
            const snap = await hydrateFromAccount();
            lastSyncedJsonRef.current = snap;
          } catch (syncErr) {
            console.warn('[AuthGate] Gagal sinkronisasi awal pengaturan akun:', syncErr);
          }
        }
      } catch (err) {
        console.warn('[AuthGate] Pemeriksaan sesi gagal:', err);
      } finally {
        if (active) setIsCheckingSession(false);
      }
    };
    verify();
    return () => {
      active = false;
    };
  }, []);

  // Sinkronisasi otomatis setiap perubahan API Key / Model / Preset / Skill ke akun
  const schedulePushToAccount = useCallback(() => {
    if (!user) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        const currentSnapshot = readLocalSnapshot();
        const serialized = JSON.stringify(currentSnapshot);
        if (serialized === lastSyncedJsonRef.current) return;
        const status = await pushAccountSettings(currentSnapshot);
        if (status === 'ok') {
          lastSyncedJsonRef.current = serialized;
        }
      } catch (err) {
        console.warn('[AuthGate] Auto-sync pengaturan akun tertunda:', err);
      }
    }, 600);
  }, [user]);

  useEffect(() => {
    if (!user || typeof window !== 'undefined') return;
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) {
      setErrorMsg(isEn ? 'Username and password are required.' : 'Username dan password wajib diisi.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg(isEn ? 'Password must be at least 6 characters.' : 'Password minimal 6 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ username: cleanUsername, password })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.user) {
        setErrorMsg(
          json.error ||
            (isEn ? 'Authentication failed. Please check your credentials.' : 'Gagal memproses akun. Periksa kembali username dan password Anda.')
        );
        return;
      }

      setStoredAuthSession(json.user, json.token);
      try {
        const snap = await hydrateFromAccount();
        lastSyncedJsonRef.current = snap;
      } catch (syncErr) {
        console.warn('[AuthGate] Gagal sinkronisasi setelah login:', syncErr);
      }
      setUser(json.user);
      setPassword('');
    } catch (err: any) {
      setErrorMsg(err?.message || (isEn ? 'Network error occurred.' : 'Terjadi gangguan jaringan saat menghubungi server.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Tetap lanjutkan logout di sisi client
    } finally {
      clearStoredAuthSession();
      clearLocalSnapshot();
      setUser(null);
      setUsername('');
      setPassword('');
      setErrorMsg(null);
    }
  };

  if (isCheckingSession) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text)',
          padding: '24px'
        }}
      >
        <div className="mascot-idle-wrap">
          <img
            src="/logo.png?v=2"
            alt="ANALYZER(?) Logo"
            className="mascot-idle-img"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>
          <RefreshCw size={18} className="spinner" />
          <span>{isEn ? 'Loading ANALYZER(?) Session...' : 'Memuat Sesi ANALYZER(?)...'}</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-viewport">
        {/* Background Image: Cockpit Over the Rift (60% Opacity) */}
        <div className="auth-bg-layer" />

        {/* Ambient Overlay for Crisp Readability & Contrast */}
        <div className="auth-backdrop-overlay" />

        {/* Floating Topbar: Cockpit HUD Pill & Theme Switcher */}
        <div className="auth-topbar">
          <div className="auth-hud-pill">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-tertiary, #39ff14)', boxShadow: '0 0 8px var(--accent-tertiary, #39ff14)' }} />
            <span>PILOT COCKPIT // SECTOR RIFT-01 // STATISTICAL LAB ONLINE</span>
          </div>
          <ThemeToggle showLabel={true} />
        </div>

        {/* Main 2-Column Responsive Container */}
        <div className="auth-container">
          {/* KOLOM KIRI: Tempat / Tab Login */}
          <div className="auth-card-left">
            {/* Header Card Kiri */}
            <div
              style={{
                padding: '24px 24px 18px',
                borderBottom: '1px solid var(--border)',
                background: 'linear-gradient(135deg, var(--surface-muted) 0%, var(--surface-sunken) 100%)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px'
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: 'var(--surface)',
                  border: '1.5px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px',
                  boxShadow: 'var(--glow-primary)',
                  flexShrink: 0
                }}
              >
                <img
                  src="/logo.png?v=2"
                  alt="ANALYZER(?) Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {isEn ? 'Pilot Access Gateway' : 'Portal Akses Pengguna'}
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)', margin: '2px 0 0 0' }}>
                  {mode === 'login' ? (isEn ? 'Sign In to Workspace' : 'Masuk ke Akun') : (isEn ? 'Create New Account' : 'Daftar Akun Baru')}
                </h2>
              </div>
            </div>

            <div style={{ padding: '22px 24px 26px' }}>
              {/* Switcher Tab Login / Buat Akun */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  background: 'var(--surface-sunken)',
                  padding: '4px',
                  borderRadius: '12px',
                  marginBottom: '18px'
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  style={{
                    flex: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px 12px',
                    minHeight: '42px',
                    borderRadius: '9px',
                    border: 'none',
                    background: mode === 'login' ? 'var(--surface)' : 'transparent',
                    color: mode === 'login' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: mode === 'login' ? 800 : 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    boxShadow: mode === 'login' ? 'var(--shadow)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <LogIn size={16} />
                  <span>{isEn ? 'Sign In' : 'Masuk Akun'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg(null);
                  }}
                  style={{
                    flex: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px 12px',
                    minHeight: '42px',
                    borderRadius: '9px',
                    border: 'none',
                    background: mode === 'register' ? 'var(--surface)' : 'transparent',
                    color: mode === 'register' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: mode === 'register' ? 800 : 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    boxShadow: mode === 'register' ? 'var(--shadow)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <UserPlus size={16} />
                  <span>{isEn ? 'Create Account' : 'Buat Akun Baru'}</span>
                </button>
              </div>

              {/* Info Sinkronisasi Lintas Perangkat */}
              <div
                style={{
                  background: 'var(--info-bg)',
                  border: '1px solid var(--info-border)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--info)',
                  lineHeight: 1.45
                }}
              >
                <Sparkles size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  {mode === 'login'
                    ? isEn
                      ? 'Sign in with your username & password. Your saved API Keys, models, and indicator presets sync automatically across all devices.'
                      : 'Cukup masuk dengan Username & Password (tanpa email). API Key, pilihan model, dan indikator Anda otomatis tersinkronisasi di semua perangkat.'
                    : isEn
                    ? 'Create an account using only a username and password (no email required). Save your API Key once and access it from any device.'
                    : 'Buat akun cukup dengan mengisi Username dan Password (tidak perlu email). Simpan API Key cukup sekali untuk dipakai di perangkat mana pun.'}
                </span>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  style={{
                    background: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    color: 'var(--danger)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    marginBottom: '14px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    lineHeight: 1.5
                  }}
                >
                  ⚠️ {errorMsg}
                  {errorMsg.includes('Supabase') && (
                    <div style={{ marginTop: '8px', fontSize: '11.5px', opacity: 0.85 }}>
                      Tip: Jika database Supabase baru, pastikan tabel <code>app_users</code> sudah dibuat dengan mengeksekusi SQL Setup yang ada di tab <strong>Pengaturan</strong>.
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '14px' }}>
                  <label
                    htmlFor="auth-username-input"
                    style={{
                      display: 'block',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    {isEn ? 'Username (No Email Required)' : 'Username (Tidak Harus Email)'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <User
                      size={17}
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)'
                      }}
                    />
                    <input
                      id="auth-username-input"
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder={isEn ? 'e.g. gojira123' : 'Contoh: gojira123'}
                      required
                      style={{
                        width: '100%',
                        padding: '11px 14px 11px 38px',
                        minHeight: '44px',
                        fontSize: '16px',
                        borderRadius: '10px',
                        border: '1.5px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text)',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label
                    htmlFor="auth-password-input"
                    style={{
                      display: 'block',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock
                      size={17}
                      style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)'
                      }}
                    />
                    <input
                      id="auth-password-input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={isEn ? 'Min. 6 characters...' : 'Minimal 6 karakter...'}
                      required
                      style={{
                        width: '100%',
                        padding: '11px 42px 11px 38px',
                        minHeight: '44px',
                        fontSize: '16px',
                        borderRadius: '10px',
                        border: '1.5px solid var(--border)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text)',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary btn-full"
                  style={{
                    minHeight: '46px',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: isSubmitting ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <ShieldCheck size={18} />
                  <span>
                    {isSubmitting
                      ? isEn
                        ? 'Processing...'
                        : 'Memproses...'
                      : mode === 'login'
                      ? isEn
                        ? 'Sign In to ANALYZER(?)'
                        : 'Masuk ke ANALYZER(?)'
                      : isEn
                      ? 'Create Account & Enter'
                      : 'Buat Akun & Masuk'}
                  </span>
                </button>
              </form>

              {/* Footnote Keamanan */}
              <div
                style={{
                  marginTop: '16px',
                  textAlign: 'center',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>🔒</span>
                <span>{isEn ? 'Hardware AES-256-GCM Encrypted • PostgreSQL RLS Isolation' : 'Terenkripsi AES-256-GCM • Isolasi Aman PostgreSQL RLS'}</span>
              </div>
            </div>
          </div>

          {/* KOLOM KANAN: Judul Aplikasi (Font Anime Mecha Logo) & Penjelasan Lengkap Namun Ringkas */}
          <div className="auth-hero-right">
            <div className="auth-brand-badge">
              <Sparkles size={14} />
              <span>{isEn ? 'Next-Gen Scientific Intelligence' : 'Platform Riset & Komputasi Statistik AI'}</span>
            </div>

            <div>
              <div className="auth-title-row">
                <span className="auth-logo-title-main">ANALYZE</span>
                <span className="auth-logo-title-mark">(?)</span>
              </div>
              <div
                style={{
                  fontSize: '12.5px',
                  fontWeight: 800,
                  letterSpacing: '0.12em',
                  color: 'var(--primary)',
                  textTransform: 'uppercase',
                  marginTop: '6px'
                }}
              >
                CED AI Analyzer • SPSS OLS Regression • Stata Panel Econometrics
              </div>
            </div>

            <p className="auth-hero-desc">
              {isEn
                ? 'A specialized scientific research platform designed for empirical economics, sustainability reporting, and rigorous econometric modeling. Analyze PDF sustainability reports with multimodal AI, compute SPSS-style linear regressions with classical assumption diagnostics, and run Stata-standard panel regressions with publication-ready output.'
                : 'Platform riset ilmiah dan analitik modern yang menggabungkan kecerdasan buatan multimodal untuk laporan keberlanjutan ESG/CED, regresi linier OLS bergaya SPSS dengan pengujian asumsi klasik komprehensif, serta ekonometrika data panel berstandar Stata 18.'}
            </p>

            {/* Grid 4 Kartu Fitur Estetik */}
            <div className="auth-features-grid">
              {/* Fitur 1: CED Analyzer */}
              <div className="auth-feature-card">
                <div className="auth-feature-head">
                  <div className="auth-feature-icon" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                    🦖
                  </div>
                  <span>{isEn ? 'Carbon Emission AI' : 'Analisis CED AI'}</span>
                </div>
                <div className="auth-feature-body">
                  {isEn
                    ? 'Automatic extraction & scoring of 18 Carbon Emission Disclosure indicators from PDF reports via Google Gemini Multimodal Vision.'
                    : 'Ekstraksi otomatis 18 indikator pengungkapan emisi karbon (CED) dari laporan PDF menggunakan Google Gemini Multimodal Vision.'}
                </div>
              </div>

              {/* Fitur 2: Regresi SPSS */}
              <div className="auth-feature-card">
                <div className="auth-feature-head">
                  <div className="auth-feature-icon" style={{ background: 'rgba(0, 229, 255, 0.15)', color: 'var(--primary)' }}>
                    📈
                  </div>
                  <span>{isEn ? 'SPSS Linear OLS' : 'Regresi Linier SPSS'}</span>
                </div>
                <div className="auth-feature-body">
                  {isEn
                    ? 'Complete SLR & MLR estimation, 5 classical assumption tests (Lilliefors, VIF, Breusch-Pagan, Durbin-Watson), and scientific remedial paths.'
                    : 'Estimasi SLR & MLR, 5 uji asumsi klasik lengkap (Lilliefors, VIF, Breusch-Pagan, Durbin-Watson), serta rekomendasi remedial sah.'}
                </div>
              </div>

              {/* Fitur 3: Regresi Data Panel Stata */}
              <div className="auth-feature-card">
                <div className="auth-feature-head">
                  <div className="auth-feature-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent)' }}>
                    ⚡
                  </div>
                  <span>{isEn ? 'Stata 18 Panel Data' : 'Regresi Panel Stata 18'}</span>
                </div>
                <div className="auth-feature-body">
                  {isEn
                    ? 'CEM, FEM, REM modeling, Chow & Hausman specification tests, Arellano clustered standard errors (vce(robust)), and terminal output.'
                    : 'Estimasi CEM, FEM, REM, uji spesifikasi Chow & Hausman, koreksi vce(robust) Arellano, dan tampilan jendela hasil Stata.'}
                </div>
              </div>

              {/* Fitur 4: Keamanan & Cloud Sync */}
              <div className="auth-feature-card">
                <div className="auth-feature-head">
                  <div className="auth-feature-icon" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>
                    🛡️
                  </div>
                  <span>{isEn ? 'Cloud Sync & Security' : 'Keamanan & Cloud Sync'}</span>
                </div>
                <div className="auth-feature-body">
                  {isEn
                    ? 'Hardware-grade AES-256-GCM encryption, cross-device Supabase PostgreSQL sync, Row-Level Security, and 24/7 keepalive.'
                    : 'Enkripsi AES-256-GCM mandiri, sinkronisasi multi-device via Supabase PostgreSQL, Row-Level Security, dan keepalive otomatis 24/7.'}
                </div>
              </div>
            </div>

            {/* Telemetry Cockpit HUD Strip */}
            <div className="auth-telemetry-strip">
              <span style={{ color: 'var(--primary)', fontWeight: 700 }}>HUD TELEMETRY:</span>
              <span>ALT: 8,750 m</span>
              <span>•</span>
              <span>SPD: 1,080 km/h</span>
              <span>•</span>
              <span>SECTOR: RIFT-01</span>
              <span>•</span>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>● SYSTEMS ONLINE</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children({ user, onLogout: handleLogout })}</>;
};

