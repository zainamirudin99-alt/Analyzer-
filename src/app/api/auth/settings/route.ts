import { NextRequest, NextResponse } from 'next/server';
import {
  AuthError,
  authErrorResponse,
  decryptSettings,
  encryptSettings,
  findUserById,
  getSessionFromRequest,
  updateUser
} from '@/lib/auth-server';
import { ACCOUNT_SYNC_KEYS } from '@/lib/account-sync-keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SETTINGS_BYTES = 2 * 1024 * 1024;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) throw new AuthError('Sesi berakhir. Silakan login kembali.', 401);
    let user = await findUserById(session.uid, session.username, req);
    let rawEncrypted = user?.settings_encrypted;

    // Fallback 1: periksa langsung tabel public.app_users berdasarkan username
    if (!rawEncrypted) {
      try {
        const { getSupabaseServerClient } = await import('@/lib/supabase');
        const supabase = getSupabaseServerClient(req);
        if (supabase) {
          const { data: userRow } = await supabase
            .from('app_users')
            .select('settings_encrypted')
            .eq('username', session.username)
            .maybeSingle();
          if (userRow?.settings_encrypted) rawEncrypted = userRow.settings_encrypted;
        }
      } catch {}
    }

    // Fallback 2: periksa juga dari tabel app_settings jika user di app_users baru dibuat
    if (!rawEncrypted) {
      try {
        const { getSupabaseServerClient, checkIsSupabaseConfigured } = await import('@/lib/supabase');
        if (checkIsSupabaseConfigured(req)) {
          const supabase = getSupabaseServerClient(req);
          if (supabase) {
            const { data: stData } = await supabase
              .from('app_settings')
              .select('value')
              .eq('key', `user_settings:${session.username}`)
              .maybeSingle();
            if (stData?.value) rawEncrypted = stData.value;
          }
        }
      } catch {}
    }

    let settings: Record<string, string> = {};
    if (rawEncrypted) {
      try {
        settings = decryptSettings(rawEncrypted);
      } catch (decryptErr) {
        console.warn('[Account Settings] Gagal dekripsi pengaturan akun:', decryptErr);
      }
    }
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return authErrorResponse(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) throw new AuthError('Sesi berakhir. Silakan login kembali.', 401);
    const body = await req.json().catch(() => ({}));
    const incoming = body?.settings && typeof body.settings === 'object' ? body.settings : {};

    // 1. Ambil pengaturan tersimpan sebelumnya agar tidak menimpa API key perangkat lain dengan string kosong
    let existingSettings: Record<string, string> = {};
    try {
      const existingUser = await findUserById(session.uid, session.username, req);
      let existingEncrypted = existingUser?.settings_encrypted;
      if (!existingEncrypted) {
        const { getSupabaseServerClient } = await import('@/lib/supabase');
        const supabase = getSupabaseServerClient(req);
        if (supabase) {
          const { data: row } = await supabase
            .from('app_users')
            .select('settings_encrypted')
            .eq('username', session.username)
            .maybeSingle();
          if (row?.settings_encrypted) existingEncrypted = row.settings_encrypted;
        }
      }
      if (existingEncrypted) {
        existingSettings = decryptSettings(existingEncrypted);
      }
    } catch {}

    // 2. Gabungkan existing dengan incoming
    const allowed: Record<string, string> = { ...existingSettings };
    for (const key of ACCOUNT_SYNC_KEYS) {
      const value = incoming[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        // Jangan timpa API key yang sudah tersimpan dengan string kosong dari tab baru
        if (key.endsWith('_key') && !trimmed && existingSettings[key]) {
          allowed[key] = existingSettings[key];
        } else {
          allowed[key] = value;
        }
      }
    }

    if (JSON.stringify(allowed).length > MAX_SETTINGS_BYTES) {
      throw new AuthError('Ukuran pengaturan akun melebihi 2 MB.', 413);
    }

    await updateUser(session.uid, { settings_encrypted: encryptSettings(allowed) }, session.username, req);
    return NextResponse.json({ success: true, keysCount: Object.keys(allowed).length });
  } catch (err) {
    return authErrorResponse(err);
  }
}
