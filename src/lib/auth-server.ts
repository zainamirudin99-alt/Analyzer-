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
import { getSupabaseServerClient, isSupabaseConfigured, RequestWithHeaders } from './supabase';
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

function getEncryptionKey(secretOverride?: string): Buffer {
  return createHash('sha256').update(`analyzer-settings:${secretOverride || getAuthSecret()}`).digest();
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

  const candidateSecrets = [
    process.env.KEY_ENCRYPTION_SECRET,
    process.env.AUTH_SECRET,
    process.env.SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.API_ANON,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'analyzer-hmac-secret-key-2026'
  ].filter(Boolean) as string[];

  for (const secret of candidateSecrets) {
    try {
      const key = getEncryptionKey(secret);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
      const parsed = JSON.parse(decrypted.toString('utf8'));
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      // Coba kandidat kunci berikutnya jika kunci ini gagal
    }
  }

  return {};
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

export async function findUserByUsername(username: string, req?: RequestWithHeaders | null): Promise<AppUserRecord | null> {
  const clean = normalizeUsername(username);
  if (!clean) return null;

  const supabase = getSupabaseServerClient(req);
  if (supabase) {
    // 1. Coba dari tabel public.app_users (hanya panggil kolom yang pasti ada di database)
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, password_hash, settings_encrypted')
        .eq('username', clean)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          username: data.username,
          password_hash: data.password_hash,
          settings_encrypted: data.settings_encrypted || null,
          created_at: new Date().toISOString(),
          last_login_at: null
        };
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

export async function findUserById(id: string, usernameHint?: string, req?: RequestWithHeaders | null): Promise<AppUserRecord | null> {
  const cleanHint = usernameHint ? normalizeUsername(usernameHint) : undefined;
  const supabase = getSupabaseServerClient(req);
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('id, username, password_hash, settings_encrypted')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          username: data.username,
          password_hash: data.password_hash,
          settings_encrypted: data.settings_encrypted || null,
          created_at: new Date().toISOString(),
          last_login_at: null
        };
      }
    } catch {}

    if (cleanHint) {
      try {
        const { data: byNameUser, error: byNameErr } = await supabase
          .from('app_users')
          .select('id, username, password_hash, settings_encrypted')
          .eq('username', cleanHint)
          .maybeSingle();

        if (!byNameErr && byNameUser) {
          return {
            id: byNameUser.id,
            username: byNameUser.username,
            password_hash: byNameUser.password_hash,
            settings_encrypted: byNameUser.settings_encrypted || null,
            created_at: new Date().toISOString(),
            last_login_at: null
          };
        }
      } catch {}

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

export async function createUser(username: string, rawPassword: string, req?: RequestWithHeaders | null): Promise<AppUserRecord> {
  const cleanUsername = normalizeUsername(username);
  validateCredentials(cleanUsername, rawPassword);

  const existing = await findUserByUsername(cleanUsername, req);
  if (existing) {
    throw new AuthError('Username sudah terdaftar. Silakan langsung Login atau pilih username lain.', 409);
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(rawPassword);
  let resolvedId = randomUUID();

  const supabase = getSupabaseServerClient(req);
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

    // 2. Simpan ke tabel public.app_users (hanya kirim kolom yang pasti ada: id, username, password_hash, settings_encrypted)
    try {
      const insertRow: Record<string, any> = {
        id: record.id,
        username: record.username,
        password_hash: record.password_hash
      };
      if (record.settings_encrypted) {
        insertRow.settings_encrypted = record.settings_encrypted;
      }
      const { error } = await supabase
        .from('app_users')
        .upsert(insertRow, { onConflict: 'username' });

      if (!error) {
        savedInAppUsersTable = true;
      } else {
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
    if (!savedInAppUsersTable && !savedInAppSettings && !savedInSupabaseAuth) {
      console.error('[createUser Failed Supabase Persistence]:', {
        savedInSupabaseAuth,
        savedInAppUsersTable,
        savedInAppSettings,
        lastSupabaseError
      });
      throw new AuthError(
        `Gagal menyimpan akun ke Supabase (${lastSupabaseError || 'Tabel app_users atau app_settings belum siap'}). Silakan pastikan RLS dinonaktifkan atau jalankan script SQL migrasi app_users di Supabase SQL Editor.`,
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

export async function authenticateUser(username: string, rawPassword: string, req?: RequestWithHeaders | null): Promise<AppUserRecord> {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || !rawPassword) {
    throw new AuthError('Username dan password wajib diisi.', 400);
  }

  // 1. Coba verifikasi dengan user yang ada di public.app_users atau public.app_settings
  const existingUser = await findUserByUsername(cleanUsername, req);
  const supabase = getSupabaseServerClient(req);

  if (existingUser && (await verifyPassword(rawPassword, existingUser.password_hash))) {
    // Pastikan user pasti tercatat di tabel public.app_users
    if (supabase) {
      const upsertRow: Record<string, any> = {
        id: existingUser.id,
        username: existingUser.username,
        password_hash: existingUser.password_hash
      };
      if (existingUser.settings_encrypted) {
        upsertRow.settings_encrypted = existingUser.settings_encrypted;
      }
      try {
        await supabase.from('app_users').upsert(upsertRow, { onConflict: 'username' });
      } catch (upsertErr) {
        console.warn('[authenticateUser app_users notice]:', upsertErr);
      }
    }
    return existingUser;
  }

  // 2. Jika belum ditemukan / hash tidak cocok, coba verifikasi dengan Supabase Native Auth
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
        try {
          await saveUserToAppSettings(healedUser);
        } catch {}
        const healRow: Record<string, any> = {
          id: healedUser.id,
          username: healedUser.username,
          password_hash: healedUser.password_hash
        };
        if (healedUser.settings_encrypted) {
          healRow.settings_encrypted = healedUser.settings_encrypted;
        }
        try {
          await supabase.from('app_users').upsert(healRow, { onConflict: 'username' });
        } catch {}

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
  usernameHint?: string,
  req?: RequestWithHeaders | null
): Promise<void> {
  const cleanHint = usernameHint ? normalizeUsername(usernameHint) : undefined;
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient(req);

  if (supabase) {
    try {
      // 1. Periksa apakah baris user sudah ada di app_users
      let matchedUserId: string | null = null;
      let matchedPasswordHash = '';
      const { data: byId } = await supabase
        .from('app_users')
        .select('id, username, password_hash')
        .eq('id', id)
        .maybeSingle();

      if (byId) {
        matchedUserId = byId.id;
        matchedPasswordHash = byId.password_hash || '';
      } else if (cleanHint) {
        const { data: byName } = await supabase
          .from('app_users')
          .select('id, username, password_hash')
          .eq('username', cleanHint)
          .maybeSingle();
        if (byName) {
          matchedUserId = byName.id;
          matchedPasswordHash = byName.password_hash || '';
        }
      }

      const updateData: Record<string, any> = {};
      if (patch.settings_encrypted !== undefined) {
        updateData.settings_encrypted = patch.settings_encrypted;
      }

      if (Object.keys(updateData).length > 0) {
        // Update berdasarkan username jika ada (paling akurat untuk tabel app_users)
        if (cleanHint) {
          const { error: updNameErr } = await supabase
            .from('app_users')
            .update(updateData)
            .eq('username', cleanHint);
          if (updNameErr) {
            console.warn('[updateUser by username error]:', updNameErr.message);
          }
        }

        // Update juga berdasarkan id
        if (matchedUserId || id) {
          await supabase
            .from('app_users')
            .update(updateData)
            .eq('id', matchedUserId || id);
        }
      }

      if (!matchedUserId && cleanHint) {
        // Baris BELUM ADA di app_users -> INSERT SEKARANG (hanya 4 kolom dasar)
        if (!matchedPasswordHash) {
          const fromSettings = await readUserFromAppSettingsByUsername(cleanHint);
          if (fromSettings?.password_hash) matchedPasswordHash = fromSettings.password_hash;
        }

        const insertRow: Record<string, any> = {
          id,
          username: cleanHint,
          password_hash: matchedPasswordHash
        };
        if (patch.settings_encrypted !== undefined) {
          insertRow.settings_encrypted = patch.settings_encrypted;
        }
        const { error: insErr } = await supabase
          .from('app_users')
          .upsert(insertRow, { onConflict: 'username' });
        if (insErr) {
          console.warn('[updateUser insert into app_users notice]:', insErr.message);
        }
      }
    } catch (tblEx) {
      console.warn('[updateUser app_users exception]:', tblEx);
    }

    // 2. Simpan cadangan ke tabel app_settings
    if (cleanHint) {
      try {
        const existingInSettings = await readUserFromAppSettingsByUsername(cleanHint);
        const userToSave: AppUserRecord = existingInSettings
          ? { ...existingInSettings, ...patch }
          : {
              id,
              username: cleanHint,
              password_hash: '',
              settings_encrypted: patch.settings_encrypted || null,
              created_at: now,
              last_login_at: patch.last_login_at || now
            };
        await saveUserToAppSettings(userToSave);

        // Simpan juga string encrypted langsung ke app_settings
        if (patch.settings_encrypted) {
          await supabase.from('app_settings').upsert([
            {
              key: `user_settings:${cleanHint}`,
              value: patch.settings_encrypted,
              updated_at: now
            }
          ]);
        }
      } catch (setEx) {
        console.warn('[updateUser app_settings exception]:', setEx);
      }
    }
  }

  // 3. Simpan ke local store
  const users = await readLocalStore();
  const existingLocal = users.find(u => u.id === id || (cleanHint && u.username === cleanHint));
  if (existingLocal) {
    await writeLocalStore(
      users.map(u => (u.id === id || (cleanHint && u.username === cleanHint) ? { ...u, ...patch } : u))
    );
  } else if (cleanHint) {
    const newLocal: AppUserRecord = {
      id,
      username: cleanHint,
      password_hash: '',
      settings_encrypted: patch.settings_encrypted || null,
      created_at: now,
      last_login_at: patch.last_login_at || now
    };
    await writeLocalStore([...users, newLocal]);
  }
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
