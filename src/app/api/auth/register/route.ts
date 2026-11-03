import { NextRequest, NextResponse } from 'next/server';
import {
  attachSessionCookie,
  authErrorResponse,
  createUser,
  hashPassword,
  normalizeUsername,
  validateCredentials
} from '@/lib/auth-server';
import { signSession } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = normalizeUsername(body?.username);
    const password = String(body?.password ?? '');
    validateCredentials(username, password);

    const user = await createUser(username, password);
    const token = await signSession(user.id, user.username);
    const res = NextResponse.json({
      success: true,
      token,
      user: { id: user.id, username: user.username }
    });
    const { response } = await attachSessionCookie(res, user);
    return response;
  } catch (err) {
    return authErrorResponse(err);
  }
}
