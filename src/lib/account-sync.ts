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

function mergePresetsSnapshot(localRaw: string | null, remoteRaw: string): string {
  try {
    const remote = JSON.parse(remoteRaw);
    if (!localRaw) return remoteRaw;
    const local = JSON.parse(localRaw);
    if (!Array.isArray(local) || local.length === 0) return remoteRaw;
    if (!Array.isArray(remote) || remote.length === 0) return localRaw;

    const mergedMap = new Map<string, any>();
    // 1. Masukkan remote presets terlebih dahulu
    for (const p of remote) {
      if (p?.id) mergedMap.set(p.id, p);
    }
    // 2. Pertahankan atau timpa dengan local preset jika local memiliki data yang lebih baru / tidak ada di remote
    for (const p of local) {
      if (!p?.id) continue;
      const existing = mergedMap.get(p.id);
      if (!existing) {
        // Preset baru di local yang belum tersinkron ke cloud -> WAJIB PERTAHANKAN
        mergedMap.set(p.id, p);
      } else {
        const localTime = new Date(p.updatedAt || p.createdAt || 0).getTime();
        const remoteTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const localIndCount = Array.isArray(p.indicators) ? p.indicators.length : 0;
        const remoteIndCount = Array.isArray(existing.indicators) ? existing.indicators.length : 0;

        if (localTime >= remoteTime || localIndCount > remoteIndCount || (p.rubric && !existing.rubric)) {
          mergedMap.set(p.id, { ...existing, ...p });
        }
      }
    }
    return JSON.stringify(Array.from(mergedMap.values()));
  } catch {
    return remoteRaw;
  }
}

export function applySnapshotToLocal(settings: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  let hasLocalNewer = false;
  for (const key of ACCOUNT_SYNC_KEYS) {
    if (typeof settings[key] === 'string') {
      if (key === 'analyzer_indicator_presets') {
        const localRaw = localStorage.getItem(key);
        const merged = mergePresetsSnapshot(localRaw, settings[key]);
        if (localRaw && merged !== settings[key]) {
          hasLocalNewer = true;
        }
        localStorage.setItem(key, merged);
      } else {
        localStorage.setItem(key, settings[key]);
      }
    }
  }
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new Event('analyzer_language_changed'));
  window.dispatchEvent(new Event('analyzer_presets_changed'));
  window.dispatchEvent(new Event('analyzer_skills_changed'));
  window.dispatchEvent(new Event('analyzer-settings-changed'));
  window.dispatchEvent(new Event('analyzer_account_settings_dirty'));

  if (hasLocalNewer) {
    const token = getStoredAuthToken();
    if (token) {
      pushAccountSettings(readLocalSnapshot()).catch(err => {
        console.warn('[applySnapshotToLocal] Auto-sync merged presets to Supabase:', err);
      });
    }
  }
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

export async function pullAccountSettings(): Promise<Record<string, string>> {
  const remote = await fetchAccountSettings();
  if (Object.keys(remote).length > 0) {
    applySnapshotToLocal(remote);
  }
  return remote;
}

/**
 * Saat inisialisasi / tab focus: tarik pengaturan dari Supabase Cloud jika akun sudah memilikinya.
 * Tidak pernah menimpa cloud dengan data lokal kosong.
 */
export async function hydrateFromAccount(): Promise<string> {
  try {
    const remote = await fetchAccountSettings();
    if (Object.keys(remote).length > 0) {
      applySnapshotToLocal(remote);
      return JSON.stringify(readLocalSnapshot());
    }
  } catch (err) {
    console.warn('[hydrateFromAccount] Gagal tarik pengaturan akun:', err);
  }
  return JSON.stringify(readLocalSnapshot());
}
