import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Keep-Alive Cron Endpoint untuk Mencegah Supabase Free Tier Hibernasi / Pause
 * Mendukung GET dan POST. Dipanggil oleh Vercel Cron, GitHub Actions, dan Client Silent Heartbeat.
 */
async function executeKeepalive() {
  const timestamp = new Date().toISOString();

  if (!isSupabaseConfigured) {
    return NextResponse.json({
      success: true,
      message: 'Keepalive dijalankan dalam mode lokal (Supabase belum dikonfigurasi di environment).',
      timestamp,
      data: { status: 'mock_local', ping_count: 1 }
    });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({
      success: true,
      message: 'Supabase client tidak aktif atau belum siap.',
      timestamp
    });
  }

  try {
    // 1. Coba panggil RPC keepalive_ping() jika sudah dibuat
    const { data: rpcData, error: rpcError } = await supabase.rpc('keepalive_ping');
    if (!rpcError && rpcData && rpcData.length > 0) {
      return NextResponse.json({
        success: true,
        method: 'rpc',
        message: 'Supabase Keepalive via RPC berhasil! Database aktif & terlindungi dari pause 🟢',
        timestamp,
        data: rpcData[0]
      });
    }

    // 2. Fallback: Upsert langsung ke tabel ced_heartbeat
    const { data: upsertData, error: upsertError } = await supabase
      .from('ced_heartbeat')
      .upsert({
        id: 'primary',
        last_ping: timestamp,
        status: 'active_keepalive'
      })
      .select('last_ping, ping_count, status')
      .single();

    if (!upsertError && upsertData) {
      return NextResponse.json({
        success: true,
        method: 'upsert',
        message: 'Supabase Keepalive via Upsert tabel ced_heartbeat berhasil dieksekusi 🟢',
        timestamp,
        data: upsertData
      });
    }

    // 3. Fallback terakhir: Query baca ringan ke ced_results jika tabel ced_heartbeat belum ada
    const { error: queryError } = await supabase.from('ced_results').select('id').limit(1);
    if (!queryError) {
      return NextResponse.json({
        success: true,
        method: 'fallback_read',
        message: 'Keepalive ping via fallback query berhasil dieksekusi! Database tetap aktif 🟢',
        timestamp
      });
    }

    return NextResponse.json({
      success: false,
      message: 'Gagal mengeksekusi keepalive query di Supabase.',
      timestamp,
      error: upsertError?.message || queryError?.message
    }, { status: 500 });
  } catch (err: any) {
    console.error('[Keepalive Error]:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal mengeksekusi keepalive query.'
    }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  return executeKeepalive();
}

export async function POST(_req: NextRequest) {
  return executeKeepalive();
}
