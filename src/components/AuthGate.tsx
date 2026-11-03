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
    if (!user || typeof window === 'undefined') return;
    const events = [
      'storage',
      'analyzer_presets_changed',
      'analyzer_active_preset_changed',
      'analyzer_skills_changed',
      'analyzer_active_skill_changed',
      'analyzer_language_changed',
      'analyzer_account_settings_dirty'
    ];
    events.forEach(ev => window.addEventListener(ev, schedulePushToAccount));
    return () => {
      events.forEach(ev => window.removeEventListener(ev, schedulePushToAccount));
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [user, schedulePushToAccount]);

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
        headers: { 'Content-Type': 'application/json' },
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
      const currentSnapshot = readLocalSnapshot();
      if (Object.keys(currentSnapshot).length > 0) {
        await pushAccountSettings(currentSnapshot).catch(() => {});
      }
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
          background: 'linear-gradient(145deg, #0d1f0a 0%, #1e3d14 55%, #2e6922 100%)',
          color: '#ffffff',
          padding: '24px'
        }}
      >
        <img
          src="/logo.png?v=2"
          alt="ANALYZER(?) Logo"
          style={{
            width: '110px',
            height: '110px',
            objectFit: 'contain',
            marginBottom: '16px',
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))'
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 700 }}>
          <RefreshCw size={18} className="animate-spin" />
          <span>{isEn ? 'Loading ANALYZER(?) Session...' : 'Memuat Sesi ANALYZER(?)...'}</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #0d1f0a 0%, #1e3d14 50%, #142c10 100%)',
          padding: '24px'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '440px',
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid var(--border, #d2e2ca)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.38)',
            overflow: 'hidden'
          }}
        >
          {/* Banner Header dengan Logo Baru */}
          <div
            style={{
              background: 'linear-gradient(135deg, #11240b 0%, #1e3d14 60%, #2e6922 100%)',
              color: '#ffffff',
              padding: '28px 24px 22px',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '96px',
                height: '96px',
                margin: '0 auto 12px',
                borderRadius: '20px',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '2px solid rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.35)'
              }}
            >
              <img
                src="/logo.png?v=2"
                alt="ANALYZER(?) Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '0.03em', margin: '0 0 4px 0' }}>
              ANALYZER(?)
            </h1>
            <p style={{ fontSize: '12.5px', opacity: 0.9, margin: 0, lineHeight: 1.45 }}>
              {isEn
                ? 'AI Document Indicator Analyzer, SPSS Linear Regression & Stata Panel Regression'
                : 'Analisis Indikator Dokumen AI, Regresi Linier SPSS & Regresi Data Panel Stata'}
            </p>
          </div>

          {/* Switcher Tab Login / Buat Akun */}
          <div style={{ padding: '22px 24px 26px' }}>
            <div
              style={{
                display: 'flex',
                gap: '6px',
                background: 'var(--dew, #eef7eb)',
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
                  background: mode === 'login' ? '#ffffff' : 'transparent',
                  color: mode === 'login' ? 'var(--moss, #1e3d14)' : 'var(--stone, #687962)',
                  fontWeight: mode === 'login' ? 800 : 600,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  boxShadow: mode === 'login' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
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
                  background: mode === 'register' ? '#ffffff' : 'transparent',
                  color: mode === 'register' ? 'var(--moss, #1e3d14)' : 'var(--stone, #687962)',
                  fontWeight: mode === 'register' ? 800 : 600,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  boxShadow: mode === 'register' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <UserPlus size={16} />
                <span>{isEn ? 'Create Account' : 'Buat Akun Baru'}</span>
              </button>
            </div>

            {/* Info Sinkronisasi Lintas Perangkat */}
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '10px 12px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '12px',
                color: '#166534',
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
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
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
                  <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#7f1d1d' }}>
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
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--bark, #2b221a)',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em'
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
                      color: 'var(--stone, #687962)'
                    }}
                  />
                  <input
                    id="auth-username-input"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder={isEn ? 'e.g. zain99' : 'Contoh: zain99'}
                    required
                    style={{
                      width: '100%',
                      padding: '11px 14px 11px 38px',
                      minHeight: '44px',
                      fontSize: '16px',
                      borderRadius: '10px',
                      border: '1px solid var(--border, #d2e2ca)',
                      background: '#f8faf6',
                      color: 'var(--bark, #2b221a)',
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
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--bark, #2b221a)',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em'
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
                      color: 'var(--stone, #687962)'
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
                      border: '1px solid var(--border, #d2e2ca)',
                      background: '#f8faf6',
                      color: 'var(--bark, #2b221a)',
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
                      color: 'var(--stone, #687962)',
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
                style={{
                  width: '100%',
                  minHeight: '46px',
                  padding: '12px 18px',
                  borderRadius: '11px',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--moss, #1e3d14) 0%, var(--fern, #2e6922) 100%)',
                  color: '#ffffff',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: isSubmitting ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 18px rgba(46, 105, 34, 0.28)'
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
          </div>
        </div>
      </div>
    );
  }

  return <>{children({ user, onLogout: handleLogout })}</>;
};

