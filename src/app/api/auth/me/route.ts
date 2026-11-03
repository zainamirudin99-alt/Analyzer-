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
      // Sesi HMAC tetap valid walau instance baru belum sinkron; kembalikan identitas dari token
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
