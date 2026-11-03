// ============================================================
// Akun aplikasi (username + password, tanpa email) — khusus server (Node runtime).
// Multi-tier persistence:
// 1. Tabel Supabase public.app_users
// 2. Fallback otomatis ke tabel Supabase public.app_settings (key: user_account:<username>)
//    sehingga langsung berjalan walaupun pengguna belum membuka Supabase SQL Editor.
// 3. Fallback file lokal (.data/users.json) / in-memory saat mode lokal.
// ============================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from './supabase';
import {
  SESSION_COOKIE,
  SESSION_HEADER,
  SESSION_MAX_AGE_SECONDS,
  SessionPayload,
  getAuthSecret,
  signSession,
  verifySession
} from './auth-token';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 4;

export interface AppUserRecord {
  id: string;
  username: string;
  password_hash: string;
  settings_encrypted: string | null;
  created_at: string;
  last_login_at: string | null;
}

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function validateCredentials(username: string, password: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new AuthError('Username harus 3–32 karakter (huruf kecil, angka, titik, garis bawah, atau strip, tanpa spasi).', 400);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`, 400);
  }
}

// ---------- Password hashing (scrypt) ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ---------- Enkripsi pengaturan akun (AES-256-GCM) ----------

function getEncryptionKey(): Buffer {
  return createHash('sha256').update(`analyzer-settings:${getAuthSecret()}`).digest();
}

export function encryptSettings(settings: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(settings), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.');
}

export function decryptSettings(payload: string | null): Record<string, string> {
  if (!payload) return {};
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) return {};
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// ---------- Penyimpanan akun Multi-Tier ----------

const LOCAL_STORE_PATH = path.join(process.cwd(), '.data', 'users.json');
const memoryUsersFallback = new Map<string, AppUserRecord>();

async function readLocalStore(): Promise<AppUserRecord[]> {
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return Array.from(memoryUsersFallback.values());
  }
}

async function writeLocalStore(users: AppUserRecord[]): Promise<void> {
  users.forEach(u => memoryUsersFallback.set(u.username, u));
  try {
    await fs.mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
    await fs.writeFile(LOCAL_STORE_PATH, JSON.stringify(users, null, 2), 'utf8');
  } catch {
    // Pada environment read-only seperti serverless tanpa DB, memoryUsersFallback tetap memegang data sesi
  }
}

function isMissingTableError(message: string): boolean {
  return /(does not exist|not find|schema cache|relation .* does not exist|permission denied)/i.test(message);
}

async function readUserFromAppSettingsByUsername(username: string): Promise<AppUserRecord | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `user_account:${username}`)
      .maybeSingle();
    if (error || !data?.value) return null;
    return JSON.parse(data.value) as AppUserRecord;
  } catch {
    return null;
  }
}

async function readUserFromAppSettingsById(id: string): Promise<AppUserRecord | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  try {
    const { data: ptr } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `user_id:${id}`)
      .maybeSingle();
    if (ptr?.value) {
      return readUserFromAppSettingsByUsername(ptr.value);
    }
    return null;
  } catch {
    return null;
  }
}

async function saveUserToAppSettings(user: AppUserRecord): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return false;
  try {
    const now = new Date().toISOString();
    const { error } = await supabase.from('app_settings').upsert([
      {
        key: `user_account:${user.username}`,
        value: JSON.stringify(user),
        updated_at: now
      },
      {
        key: `user_id:${user.id}`,
        value: user.username,
        updated_at: now
      }
    ]);
    return !error;
  } catch {
    return false;
  }
}

export async function findUserByUsername(username: string): Promise<AppUserRecord | null> {
  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, password_hash, settings_encrypted, created_at, last_login_at')
      .eq('username', username)
      .maybeSingle();

    if (!error && data) {
      return data as AppUserRecord;
    }

    if (!error || isMissingTableError(error.message)) {
      const fromSettings = await readUserFromAppSettingsByUsername(username);
      if (fromSettings) return fromSettings;
    }
  }

  return (await readLocalStore()).find(u => u.username === username) || null;
}

export async function findUserById(id: string, usernameHint?: string): Promise<AppUserRecord | null> {
  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, password_hash, settings_encrypted, created_at, last_login_at')
      .eq('id', id)
      .maybeSingle();

    if (!error && data) {
      return data as AppUserRecord;
    }

    if (!error || isMissingTableError(error.message)) {
      if (usernameHint) {
        const byName = await readUserFromAppSettingsByUsername(usernameHint);
        if (byName) return byName;
      }
      const byId = await readUserFromAppSettingsById(id);
      if (byId) return byId;
    }
  }

  const localUsers = await readLocalStore();
  return localUsers.find(u => u.id === id || (usernameHint && u.username === usernameHint)) || null;
}

export async function createUser(username: string, passwordHash: string): Promise<AppUserRecord> {
  const existing = await findUserByUsername(username);
  if (existing) {
    throw new AuthError('Username sudah terdaftar. Silakan langsung Login atau pilih username lain.', 409);
  }

  const now = new Date().toISOString();
  const record: AppUserRecord = {
    id: randomUUID(),
    username,
    password_hash: passwordHash,
    settings_encrypted: null,
    created_at: now,
    last_login_at: now
  };

  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    const { data, error } = await supabase
      .from('app_users')
      .insert({
        id: record.id,
        username: record.username,
        password_hash: record.password_hash,
        last_login_at: now
      })
      .select('id, username, password_hash, settings_encrypted, created_at, last_login_at')
      .single();

    if (!error && data) {
      return data as AppUserRecord;
    }

    if (error?.code === '23505') {
      throw new AuthError('Username sudah terdaftar. Silakan langsung Login.', 409);
    }

    // Fallback otomatis ke tabel app_settings bila tabel app_users belum dibuat
    const savedInSettings = await saveUserToAppSettings(record);
    if (savedInSettings) {
      return record;
    }
  }

  const users = await readLocalStore();
  await writeLocalStore([...users.filter(u => u.username !== username), record]);
  return record;
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<AppUserRecord, 'settings_encrypted' | 'last_login_at'>>,
  usernameHint?: string
): Promise<void> {
  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    const { error } = await supabase
      .from('app_users')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      // Juga perbarui apabila disimpan di app_settings
      if (usernameHint) {
        const existingInSettings = await readUserFromAppSettingsByUsername(usernameHint);
        if (existingInSettings) {
          await saveUserToAppSettings({ ...existingInSettings, ...patch });
        }
      }
      return;
    }

    const current = await findUserById(id, usernameHint);
    if (current) {
      const saved = await saveUserToAppSettings({ ...current, ...patch });
      if (saved) return;
    }
  }

  const users = await readLocalStore();
  await writeLocalStore(
    users.map(u => (u.id === id || (usernameHint && u.username === usernameHint) ? { ...u, ...patch } : u))
  );
}

// ---------- Sesi & respons ----------

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookieToken) {
    const verified = await verifySession(cookieToken);
    if (verified) return verified;
  }
  const headerToken = req.headers.get(SESSION_HEADER);
  if (headerToken) {
    return verifySession(headerToken);
  }
  return null;
}

export async function attachSessionCookie(
  res: NextResponse,
  user: AppUserRecord
): Promise<{ response: NextResponse; token: string }> {
  const token = await signSession(user.id, user.username);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  return { response: res, token };
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  console.error('[Auth Error]:', err);
  const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada sistem akun.';
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}
