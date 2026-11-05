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
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          padding: '24px',
          position: 'relative'
        }}
      >
        {/* Floating Theme Switcher */}
        <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 10 }}>
          <ThemeToggle showLabel={true} />
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: '460px',
            background: 'var(--surface)',
            borderRadius: '20px',
            border: '1.5px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {/* Banner Header dengan Logo */}
          <div
            style={{
              background: 'linear-gradient(135deg, var(--surface-muted) 0%, var(--surface-sunken) 100%)',
              borderBottom: '1px solid var(--border)',
              padding: '28px 24px 22px',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'var(--header-accent-line)'
              }}
            />
            <div
              style={{
                width: '96px',
                height: '96px',
                margin: '0 auto 12px',
                borderRadius: '20px',
                background: 'var(--surface)',
                border: '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                boxShadow: 'var(--glow-primary)'
              }}
            >
              <img
                src="/logo.png?v=2"
                alt="ANALYZER(?) Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 900,
                letterSpacing: '0.02em',
                margin: '0 0 4px 0',
                background: 'linear-gradient(135deg, var(--text) 0%, var(--primary) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}
            >
              ANALYZER(?)
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
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
                    placeholder={isEn ? 'e.g. zain99' : 'Contoh: zain99'}
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
          </div>
        </div>
      </div>
    );
  }

  return <>{children({ user, onLogout: handleLogout })}</>;
};

