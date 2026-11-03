import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return clearSessionCookie(NextResponse.json({ success: true }));
}

