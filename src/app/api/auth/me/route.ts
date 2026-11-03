import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, clearSessionCookie, findUserById, getSessionFromRequest } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }
    const user = await findUserById(session.uid, session.username);
    if (!user) {
      // Self-heal: baris belum tercatat di tabel app_users Supabase, insert sekarang
      try {
        const { getSupabaseServerClient, isSupabaseConfigured } = await import('@/lib/supabase');
        if (isSupabaseConfigured) {
          const supabase = getSupabaseServerClient();
          if (supabase) {
            const now = new Date().toISOString();
            await supabase.from('app_users').insert({
              id: session.uid,
              username: session.username,
              password_hash: '',
              settings_encrypted: null,
              created_at: now,
              updated_at: now,
              last_login_at: now
            }).catch(() => {});
          }
        }
      } catch {}

      return NextResponse.json({
        success: true,
        user: { id: session.uid, username: session.username }
      });
    }
    return NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    return authErrorResponse(err);
  }
}
