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

    // Self-heal: Pastikan user selalu tercatat di tabel public.app_users Supabase
    try {
      const { getSupabaseServerClient, isSupabaseConfigured } = await import('@/lib/supabase');
      if (isSupabaseConfigured) {
        const supabase = getSupabaseServerClient();
        if (supabase) {
          const { data: existingRow } = await supabase
            .from('app_users')
            .select('id')
            .or(`id.eq.${session.uid},username.eq.${session.username}`)
            .maybeSingle();

          if (!existingRow) {
            await supabase.from('app_users').insert({
              id: session.uid,
              username: session.username,
              password_hash: user?.password_hash || '',
              settings_encrypted: user?.settings_encrypted || null
            }).catch(() => {});
          }
        }
      }
    } catch {}

    const resolvedUser = user || { id: session.uid, username: session.username };
    return NextResponse.json({
      success: true,
      user: { id: resolvedUser.id, username: resolvedUser.username }
    });
  } catch (err) {
    return authErrorResponse(err);
  }
}
