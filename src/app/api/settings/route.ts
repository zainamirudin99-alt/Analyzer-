import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { ALL_SUPPORTED_MODELS, executeGeminiRequest, getAvailableModelsFromApi } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

// GET: Cek status koneksi Supabase & Gemini
export async function GET(_req: NextRequest) {
  try {
    const defaultModel = (typeof process !== 'undefined' ? process.env.DEFAULT_GEMINI_MODEL : '') || 'gemini-1.5-flash';
    const hasServerGeminiKey = Boolean(typeof process !== 'undefined' && process.env.GEMINI_API_KEY);

    const supabaseStatus = {
      configured: isSupabaseConfigured,
      connected: false,
      message: isSupabaseConfigured ? 'Terkoneksi' : 'Belum dikonfigurasi di .env.local / Vercel'
    };

    if (isSupabaseConfigured) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { error } = await supabase.from('ced_results').select('id').limit(1);
        if (!error) {
          supabaseStatus.connected = true;
          supabaseStatus.message = 'Database Supabase Terhubung dan Siap Digunakan ✅';
        } else {
          supabaseStatus.connected = false;
          supabaseStatus.message = `Terhubung ke URL Supabase, namun tabel belum siap (${error.message}). Jalankan schema.sql di Supabase SQL Editor.`;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        supabase: supabaseStatus,
        gemini: {
          hasKey: hasServerGeminiKey,
          defaultModel,
          availableModels: ALL_SUPPORTED_MODELS
        }
      }
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal mengecek status sistem.'
    }, { status: 500 });
  }
}

// POST: Uji coba Gemini API Key dari client dengan Automatic Failover Queue
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = body?.apiKey;
    const model = body?.model;
    const testKey = (apiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '').trim();

    if (!testKey) {
      return NextResponse.json({
        success: false,
        error: 'API Key belum diisi. Masukkan API Key dari Google AI Studio.'
      }, { status: 400 });
    }

    const preferredModel = (model || 'gemini-1.5-flash').trim();

    // 1. Temukan daftar model yang aktif untuk API Key ini
    const discovered = await getAvailableModelsFromApi(testKey);

    // 2. Susun antrian uji coba (model pilihan user diuji paling pertama)
    const testQueue = Array.from(new Set([
      preferredModel,
      ...discovered,
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash-8b'
    ]));

    const testPayload = {
      contents: [{ parts: [{ text: 'Halo Gemini, konfirmasi status koneksi.' }] }],
      generationConfig: { maxOutputTokens: 10 }
    };

    let lastError = '';

    for (const m of testQueue) {
      try {
        console.log(`[Test Key] Mencoba koneksi dengan model: ${m}...`);
        const response = await executeGeminiRequest(m, testKey, testPayload);

        if (response.ok) {
          const isDirectMatch = m === preferredModel;
          const msg = isDirectMatch
            ? `Koneksi ke Google Gemini AI (${m}) BERHASIL 100%! 🚀`
            : `Koneksi ke Google Gemini AI BERHASIL! Model aktif terverifikasi: ${m} 🚀 (Model ${preferredModel} otomatis dialihkan ke ${m}).`;

          return NextResponse.json({
            success: true,
            message: msg,
            activeModel: m,
            availableModels: discovered
          });
        }

        const errText = await response.text();
        lastError = `HTTP ${response.status} (${m}): ${errText.substring(0, 200)}`;
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    return NextResponse.json({
      success: false,
      error: `Uji koneksi gagal pada semua model. Respon terakhir dari Google: ${lastError}`,
      availableModels: discovered
    }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal menguji koneksi.'
    }, { status: 500 });
  }
}
