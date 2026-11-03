// ============================================================
// Akun aplikasi (username + password, tanpa email) — khusus server (Node runtime).
// Multi-tier persistence:
// 1. Supabase Native Auth (auth.users via synthetic email <username>@analyzer.app)
// 2. Tabel Supabase public.app_users (PostgreSQL)
// 3. Fallback tabel Supabase public.app_settings (key: user_account:<username>)
// 4. Fallback file lokal (.data/users.json) / in-memory untuk mode offline/standalone.
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
export const MIN_PASSWORD_LENGTH = 6;

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

export function toSyntheticEmail(username: string): string {
  const clean = normalizeUsername(username);
  return `${clean}@analyzer.app`;
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
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
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
  try {
    const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return {};
  }
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
    if (error) {
      console.warn('[saveUserToAppSettings error]:', error.message);
      return false;
    }
    return true;
  } catch (ex) {
    console.warn('[saveUserToAppSettings exception]:', ex);
    return false;
  }
}

export async function findUserByUsername(username: string): Promise<AppUserRecord | null> {
  const clean = normalizeUsername(username);
  if (!clean) return null;

  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    // 1. Coba dari tabel public.app_users
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, password_hash, settings_encrypted, created_at, last_login_at')
        .eq('username', clean)
        .maybeSingle();

      if (!error && data) {
        return data as AppUserRecord;
      }
    } catch (tblEx) {
      console.warn('[findUserByUsername app_users exception]:', tblEx);
    }

    // 2. Coba dari tabel public.app_settings
    try {
      const fromSettings = await readUserFromAppSettingsByUsername(clean);
      if (fromSettings) return fromSettings;
    } catch (setEx) {
      console.warn('[findUserByUsername app_settings exception]:', setEx);
    }
  }

  // 3. Coba dari local storage / memory fallback
  return (await readLocalStore()).find(u => u.username === clean) || memoryUsersFallback.get(clean) || null;
}

export async function findUserById(id: string, usernameHint?: string): Promise<AppUserRecord | null> {
  const cleanHint = usernameHint ? normalizeUsername(usernameHint) : undefined;
  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, password_hash, settings_encrypted, created_at, last_login_at')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as AppUserRecord;
      }
    } catch {}

    if (cleanHint) {
      const byName = await readUserFromAppSettingsByUsername(cleanHint);
      if (byName) return byName;
    }
    const byId = await readUserFromAppSettingsById(id);
    if (byId) return byId;
  }

  const localUsers = await readLocalStore();
  return (
    localUsers.find(u => u.id === id || (cleanHint && u.username === cleanHint)) ||
    (cleanHint ? memoryUsersFallback.get(cleanHint) : null) ||
    null
  );
}

export async function createUser(username: string, rawPassword: string): Promise<AppUserRecord> {
  const cleanUsername = normalizeUsername(username);
  validateCredentials(cleanUsername, rawPassword);

  const existing = await findUserByUsername(cleanUsername);
  if (existing) {
    throw new AuthError('Username sudah terdaftar. Silakan langsung Login atau pilih username lain.', 409);
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(rawPassword);
  let resolvedId = randomUUID();

  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  let savedInSupabaseAuth = false;
  let savedInAppUsersTable = false;
  let savedInAppSettings = false;
  let lastSupabaseError: string | null = null;

  if (supabase) {
    // 1. Daftarkan ke Supabase Native Auth (auth.users)
    const syntheticEmail = toSyntheticEmail(cleanUsername);
    try {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
      if (serviceKey && (supabase.auth as any).admin?.createUser) {
        const { data: adminUser, error: adminErr } = await (supabase.auth as any).admin.createUser({
          email: syntheticEmail,
          password: rawPassword,
          email_confirm: true,
          user_metadata: { username: cleanUsername }
        });
        if (!adminErr && adminUser?.user) {
          resolvedId = adminUser.user.id;
          savedInSupabaseAuth = true;
        } else if (adminErr && /already registered/i.test(adminErr.message)) {
          throw new AuthError('Username sudah terdaftar di Supabase Auth. Silakan langsung Login.', 409);
        }
      }

      if (!savedInSupabaseAuth) {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: syntheticEmail,
          password: rawPassword,
          options: { data: { username: cleanUsername } }
        });
        if (!signUpErr && signUpData?.user) {
          resolvedId = signUpData.user.id;
          savedInSupabaseAuth = true;
        } else if (signUpErr && /already registered/i.test(signUpErr.message)) {
          throw new AuthError('Username sudah terdaftar di Supabase Auth. Silakan langsung Login.', 409);
        } else if (signUpErr) {
          console.warn('[Supabase Auth signUp note]:', signUpErr.message);
        }
      }
    } catch (authEx: any) {
      if (authEx instanceof AuthError) throw authEx;
      console.warn('[Supabase Auth createUser exception]:', authEx?.message || authEx);
    }

    const record: AppUserRecord = {
      id: resolvedId,
      username: cleanUsername,
      password_hash: passwordHash,
      settings_encrypted: null,
      created_at: now,
      last_login_at: now
    };

    // 2. Simpan ke tabel public.app_users
    try {
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
        savedInAppUsersTable = true;
      } else if (error) {
        lastSupabaseError = error.message;
        if (error.code === '23505') {
          throw new AuthError('Username sudah terdaftar. Silakan langsung Login.', 409);
        }
        console.warn('[app_users insert error]:', error.message);
      }
    } catch (tblEx: any) {
      if (tblEx instanceof AuthError) throw tblEx;
      lastSupabaseError = tblEx?.message || String(tblEx);
      console.warn('[app_users insert exception]:', tblEx);
    }

    // 3. Simpan ke tabel fallback public.app_settings
    try {
      savedInAppSettings = await saveUserToAppSettings(record);
    } catch (setEx: any) {
      console.warn('[saveUserToAppSettings exception]:', setEx);
    }

    // 4. Verifikasi bahwa data benar-benar tersimpan di Supabase
    if (!savedInSupabaseAuth && !savedInAppUsersTable && !savedInAppSettings) {
      console.error('[createUser Failed Supabase Persistence]:', {
        savedInSupabaseAuth,
        savedInAppUsersTable,
        savedInAppSettings,
        lastSupabaseError
      });
      throw new AuthError(
        `Gagal menyimpan akun ke Supabase (${lastSupabaseError || 'Tabel app_users atau app_settings belum siap'}). Silakan jalankan script SQL migrasi app_users di Supabase SQL Editor.`,
        500
      );
    }

    // Juga simpan ke memory/local cache sebagai cadangan cepat
    const users = await readLocalStore();
    await writeLocalStore([...users.filter(u => u.username !== cleanUsername), record]);
    return record;
  }

  // Jika Supabase tidak dikonfigurasi sama sekali (mode standalone lokal):
  const record: AppUserRecord = {
    id: resolvedId,
    username: cleanUsername,
    password_hash: passwordHash,
    settings_encrypted: null,
    created_at: now,
    last_login_at: now
  };
  const users = await readLocalStore();
  await writeLocalStore([...users.filter(u => u.username !== cleanUsername), record]);
  return record;
}

export async function authenticateUser(username: string, rawPassword: string): Promise<AppUserRecord> {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || !rawPassword) {
    throw new AuthError('Username dan password wajib diisi.', 400);
  }

  // 1. Coba verifikasi dengan user yang ada di public.app_users atau public.app_settings
  const existingUser = await findUserByUsername(cleanUsername);
  if (existingUser && (await verifyPassword(rawPassword, existingUser.password_hash))) {
    await updateUser(existingUser.id, { last_login_at: new Date().toISOString() }, existingUser.username).catch(() => {});
    return existingUser;
  }

  // 2. Jika belum ditemukan / hash tidak cocok, coba verifikasi dengan Supabase Native Auth
  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    try {
      const syntheticEmail = toSyntheticEmail(cleanUsername);
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: rawPassword
      });

      if (!signInErr && signInData?.user) {
        // Otentikasi Supabase Auth sukses! Lakukan self-heal ke app_users & app_settings jika sebelumnya belum tersimpan
        const now = new Date().toISOString();
        const healedUser: AppUserRecord = {
          id: signInData.user.id,
          username: cleanUsername,
          password_hash: await hashPassword(rawPassword),
          settings_encrypted: existingUser?.settings_encrypted || null,
          created_at: signInData.user.created_at || now,
          last_login_at: now
        };

        // Simpan self-heal ke Supabase
        await saveUserToAppSettings(healedUser).catch(() => {});
        await supabase
          .from('app_users')
          .upsert({
            id: healedUser.id,
            username: healedUser.username,
            password_hash: healedUser.password_hash,
            last_login_at: now
          })
          .catch(() => {});

        const users = await readLocalStore();
        await writeLocalStore([...users.filter(u => u.username !== cleanUsername), healedUser]);
        return healedUser;
      }
    } catch (authEx) {
      console.warn('[authenticateUser Supabase Auth signIn exception]:', authEx);
    }
  }

  throw new AuthError('Username atau password salah.', 401);
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<AppUserRecord, 'settings_encrypted' | 'last_login_at'>>,
  usernameHint?: string
): Promise<void> {
  const cleanHint = usernameHint ? normalizeUsername(usernameHint) : undefined;
  const supabase = isSupabaseConfigured ? getSupabaseServerClient() : null;
  if (supabase) {
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (!error) {
        if (cleanHint) {
          const existingInSettings = await readUserFromAppSettingsByUsername(cleanHint);
          if (existingInSettings) {
            await saveUserToAppSettings({ ...existingInSettings, ...patch });
          }
        }
        return;
      }
    } catch {}

    const current = await findUserById(id, cleanHint);
    if (current) {
      const saved = await saveUserToAppSettings({ ...current, ...patch });
      if (saved) return;
    }
  }

  const users = await readLocalStore();
  await writeLocalStore(
    users.map(u => (u.id === id || (cleanHint && u.username === cleanHint) ? { ...u, ...patch } : u))
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
