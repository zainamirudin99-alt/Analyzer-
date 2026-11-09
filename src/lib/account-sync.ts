'use client';

// Sinkronisasi pengaturan localStorage <-> akun pengguna (lintas perangkat) dengan isolasi penuh per akun.
import { ACCOUNT_SYNC_KEYS } from './account-sync-keys';
import { SESSION_HEADER } from './auth-token';

export const AUTH_TOKEN_STORAGE_KEY = 'analyzer_auth_token';
export const AUTH_USER_STORAGE_KEY = 'analyzer_auth_user';
export const ACCOUNT_OWNER_KEY = 'analyzer_owner_username';

export interface AccountUser {
  id: string;
  username: string;
}

export function normalizeAccountUsername(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function getStoredAuthToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '';
}

export function getStoredAuthUser(): AccountUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string') {
      return {
        id: String(parsed.id || ''),
        username: normalizeAccountUsername(parsed.username)
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function getCurrentAccountOwner(): string {
  if (typeof window === 'undefined') return '';
  const fromUser = getStoredAuthUser()?.username;
  if (fromUser) return normalizeAccountUsername(fromUser);
  return normalizeAccountUsername(localStorage.getItem(ACCOUNT_OWNER_KEY));
}

export function setStoredAuthSession(user: AccountUser, token?: string): void {
  if (typeof window === 'undefined') return;
  const cleanUsername = normalizeAccountUsername(user.username);
  const prevOwner = normalizeAccountUsername(localStorage.getItem(ACCOUNT_OWNER_KEY));

  // Jika berpindah akun di browser yang sama, bersihkan seluruh snapshot lokal akun sebelumnya terlebih dahulu
  if (prevOwner && prevOwner !== cleanUsername) {
    clearLocalSnapshot();
  }

  localStorage.setItem(
    AUTH_USER_STORAGE_KEY,
    JSON.stringify({ id: user.id, username: cleanUsername })
  );
  localStorage.setItem(ACCOUNT_OWNER_KEY, cleanUsername);
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  }
}

export function clearStoredAuthSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(ACCOUNT_OWNER_KEY);
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

function mergePresetsSnapshot(localRaw: string | null, remoteRaw: string, allowLocalMerge: boolean): string {
  try {
    const remote = JSON.parse(remoteRaw);
    if (!allowLocalMerge || !localRaw) return remoteRaw;
    const local = JSON.parse(localRaw);
    if (!Array.isArray(local) || local.length === 0) return remoteRaw;
    if (!Array.isArray(remote) || remote.length === 0) return localRaw;

    const mergedMap = new Map<string, any>();
    // 1. Masukkan remote presets terlebih dahulu
    for (const p of remote) {
      if (p?.id) mergedMap.set(p.id, p);
    }
    // 2. Pertahankan atau timpa dengan local preset HANYA jika milik akun yang sama dan lebih baru
    for (const p of local) {
      if (!p?.id) continue;
      const existing = mergedMap.get(p.id);
      if (!existing) {
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

function filterRecordsForOwner(rawRecordsJson: string, ownerUsername: string): string {
  if (!ownerUsername) return rawRecordsJson;
  try {
    const parsed = JSON.parse(rawRecordsJson);
    if (!Array.isArray(parsed)) return '[]';
    const cleanOwner = normalizeAccountUsername(ownerUsername);
    const filtered = parsed
      .filter(item => {
        if (!item || typeof item !== 'object') return false;
        const itemOwner = normalizeAccountUsername(item.owner_username);
        // Jika ada owner_username yang berbeda, buang agar tidak bocor lintas akun
        if (itemOwner && itemOwner !== cleanOwner) return false;
        return true;
      })
      .map(item => ({
        ...item,
        owner_username: cleanOwner
      }));
    return JSON.stringify(filtered);
  } catch {
    return '[]';
  }
}

export interface ApplySnapshotOptions {
  replaceAll?: boolean;
  ownerUsername?: string;
}

export function applySnapshotToLocal(
  settings: Record<string, string>,
  options?: ApplySnapshotOptions
): void {
  if (typeof window === 'undefined') return;

  const targetOwner = normalizeAccountUsername(options?.ownerUsername || getCurrentAccountOwner());
  const currentLocalOwner = normalizeAccountUsername(localStorage.getItem(ACCOUNT_OWNER_KEY));
  const isAccountSwitch = Boolean(targetOwner && currentLocalOwner && targetOwner !== currentLocalOwner);
  const shouldReplaceAll = Boolean(options?.replaceAll || isAccountSwitch);

  // Jika ganti akun, hapus bersih seluruh kunci akun sebelumnya terlebih dahulu
  if (isAccountSwitch) {
    for (const key of ACCOUNT_SYNC_KEYS) {
      localStorage.removeItem(key);
    }
  }

  let hasLocalNewer = false;

  for (const key of ACCOUNT_SYNC_KEYS) {
    if (typeof settings[key] === 'string') {
      if (key === 'analyzer_indicator_presets') {
        const localRaw = shouldReplaceAll ? null : localStorage.getItem(key);
        const merged = mergePresetsSnapshot(localRaw, settings[key], !shouldReplaceAll);
        if (localRaw && merged !== settings[key]) {
          hasLocalNewer = true;
        }
        localStorage.setItem(key, merged);
      } else if (key === 'analyzer_records') {
        const isolatedRecords = filterRecordsForOwner(settings[key], targetOwner);
        localStorage.setItem(key, isolatedRecords);
      } else {
        localStorage.setItem(key, settings[key]);
      }
    } else if (shouldReplaceAll) {
      // Pastikan kunci yang tidak dimiliki akun ini dihapus dari localStorage agar tidak mewarisi data akun lain
      localStorage.removeItem(key);
    }
  }

  if (targetOwner) {
    localStorage.setItem(ACCOUNT_OWNER_KEY, targetOwner);
  }

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new Event('analyzer_language_changed'));
  window.dispatchEvent(new Event('analyzer_presets_changed'));
  window.dispatchEvent(new Event('analyzer_active_preset_changed'));
  window.dispatchEvent(new Event('analyzer_skills_changed'));
  window.dispatchEvent(new Event('analyzer_active_skill_changed'));
  window.dispatchEvent(new Event('analyzer_records_changed'));
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
  localStorage.removeItem(ACCOUNT_OWNER_KEY);
  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new Event('analyzer_presets_changed'));
  window.dispatchEvent(new Event('analyzer_active_preset_changed'));
  window.dispatchEvent(new Event('analyzer_skills_changed'));
  window.dispatchEvent(new Event('analyzer_active_skill_changed'));
  window.dispatchEvent(new Event('analyzer_records_changed'));
  window.dispatchEvent(new Event('analyzer-settings-changed'));
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

export function syncCurrentSnapshotToCloud(): void {
  if (typeof window === 'undefined') return;
  const token = getStoredAuthToken();
  if (!token) return;
  pushAccountSettings(readLocalSnapshot()).catch(err => {
    console.warn('[syncCurrentSnapshotToCloud] Gagal sync ke Supabase:', err);
  });
}

export async function pullAccountSettings(options?: ApplySnapshotOptions): Promise<Record<string, string>> {
  const remote = await fetchAccountSettings();
  applySnapshotToLocal(remote, { replaceAll: options?.replaceAll ?? true, ownerUsername: options?.ownerUsername });
  return remote;
}

/**
 * Saat inisialisasi / login / tab focus: tarik pengaturan dari Supabase Cloud untuk akun aktif.
 * Jika akun baru belum memiliki pengaturan di Cloud (remote kosong) namun replaceAll=true atau berganti akun,
 * localStorage dibersihkan agar tidak pernah mencampur data dari akun sebelumnya.
 */
export async function hydrateFromAccount(options?: ApplySnapshotOptions): Promise<string> {
  try {
    const remote = await fetchAccountSettings();
    const targetOwner = normalizeAccountUsername(options?.ownerUsername || getCurrentAccountOwner());
    const currentLocalOwner = normalizeAccountUsername(localStorage.getItem(ACCOUNT_OWNER_KEY));
    const isAccountSwitch = Boolean(targetOwner && currentLocalOwner && targetOwner !== currentLocalOwner);

    if (Object.keys(remote).length > 0) {
      applySnapshotToLocal(remote, {
        replaceAll: options?.replaceAll ?? isAccountSwitch,
        ownerUsername: targetOwner
      });
      return JSON.stringify(readLocalSnapshot());
    } else if (options?.replaceAll || isAccountSwitch) {
      applySnapshotToLocal({}, {
        replaceAll: true,
        ownerUsername: targetOwner
      });
      return JSON.stringify(readLocalSnapshot());
    }
  } catch (err) {
    console.warn('[hydrateFromAccount] Gagal tarik pengaturan akun:', err);
  }
  return JSON.stringify(readLocalSnapshot());
}
