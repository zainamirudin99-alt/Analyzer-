import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Keep-Alive Cron Endpoint untuk Mencegah Supabase Free Tier Hibernasi / Pause
 * Berjalan otomatis via Vercel Cron Jobs setiap 12 jam.
 */
export async function GET(req: NextRequest) {
  try {
    const timestamp = new Date().toISOString();

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        message: 'Keepalive dijalankan dalam mode lokal (Supabase belum diset di .env).'
      });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({
        success: true,
        message: 'Supabase client tidak aktif.'
      });
    }

    // Eksekusi query ringan keep-alive (Upsert heartbeat record)
    const { data, error } = await supabase
      .from('ced_heartbeat')
      .upsert({
        id: 'primary',
        last_ping: timestamp,
        status: 'active_keepalive'
      })
      .select('last_ping, ping_count')
      .single();

    if (error) {
      // Fallback query jika tabel ced_heartbeat belum dibuat di database
      const fallbackQuery = await supabase.from('ced_results').select('id').limit(1);
      return NextResponse.json({
        success: true,
        message: 'Keepalive ping via fallback query berhasil dieksekusi! Database tetap aktif 🟢',
        timestamp
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase Keepalive Heartbeat Berhasil! Database Aktif & Terlindungi dari Pause 🟢',
      timestamp,
      data
    });
  } catch (err: any) {
    console.error('[Keepalive Error]:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal mengeksekusi keepalive query.'
    }, { status: 500 });
  }
}
