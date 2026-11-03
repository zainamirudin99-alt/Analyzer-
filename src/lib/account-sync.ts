'use client';

// Sinkronisasi pengaturan localStorage <-> akun pengguna (lintas perangkat).
import { ACCOUNT_SYNC_KEYS } from './account-sync-keys';
import { SESSION_HEADER } from './auth-token';

export const AUTH_TOKEN_STORAGE_KEY = 'analyzer_auth_token';
export const AUTH_USER_STORAGE_KEY = 'analyzer_auth_user';

export interface AccountUser {
  id: string;
  username: string;
}

export function getStoredAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
}

export function setStoredAuthSession(user: AccountUser, token?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  }
}

export function clearStoredAuthSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = token ? { ...extra, [SESSION_HEADER]: token } : { ...extra };
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('custom_supabase_url');
    const customKey = localStorage.getItem('custom_supabase_anon_key') || localStorage.getItem('custom_supabase_service_key');
    if (customUrl) headers['x-supabase-url'] = customUrl.trim();
    if (customKey) headers['x-supabase-key'] = customKey.trim();
  }
  return headers;
}

export function readLocalSnapshot(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const snapshot: Record<string, string> = {};
  for (const key of ACCOUNT_SYNC_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

export function applySnapshotToLocal(settings: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  for (const key of ACCOUNT_SYNC_KEYS) {
    if (typeof settings[key] === 'string') {
      localStorage.setItem(key, settings[key]);
    }
  }
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new Event('analyzer_language_changed'));
  window.dispatchEvent(new Event('analyzer_presets_changed'));
  window.dispatchEvent(new Event('analyzer_skills_changed'));
  window.dispatchEvent(new Event('analyzer-settings-changed'));
  window.dispatchEvent(new Event('analyzer_account_settings_dirty'));
}

export function clearLocalSnapshot(): void {
  if (typeof window === 'undefined') return;
  for (const key of ACCOUNT_SYNC_KEYS) {
    localStorage.removeItem(key);
  }
}

export async function fetchAccountSettings(): Promise<Record<string, string>> {
  const res = await fetch('/api/auth/settings', {
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (res.status === 401) throw new Error('unauthorized');
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  return json.settings || {};
}

export async function pushAccountSettings(settings: Record<string, string>): Promise<'ok' | 'unauthorized'> {
  const res = await fetch('/api/auth/settings', {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ settings })
  });
  if (res.status === 401) return 'unauthorized';
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return 'ok';
}

/**
 * Saat login: jika akun sudah punya pengaturan, pakai pengaturan akun (mengisi API key & model otomatis).
 * Jika akun baru belum punya pengaturan, unggah pengaturan lokal perangkat ini ke akun.
 */
export async function hydrateFromAccount(): Promise<string> {
  const remote = await fetchAccountSettings();
  if (Object.keys(remote).length > 0) {
    applySnapshotToLocal(remote);
    return JSON.stringify(readLocalSnapshot());
  }
  const local = readLocalSnapshot();
  if (Object.keys(local).length > 0) {
    await pushAccountSettings(local);
  }
  return JSON.stringify(local);
}
