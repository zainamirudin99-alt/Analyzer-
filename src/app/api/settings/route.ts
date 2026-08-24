import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { PROVEN_GEMINI_MODELS, executeGeminiRequest, getAvailableModelsFromApi } from '@/lib/gemini';

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
          availableModels: PROVEN_GEMINI_MODELS
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

// POST: Uji coba Gemini API Key dari client
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = body?.apiKey;
    const model = body?.model;
    const testKey = (apiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '').trim();

    if (!testKey) {
      return NextResponse.json({
        success: false,
        error: 'API Key belum diisi.'
      }, { status: 400 });
    }

    // 1. Temukan model yang aktif untuk API Key ini
    const discovered = await getAvailableModelsFromApi(testKey);
    let testModel = (model || discovered[0] || 'gemini-1.5-flash').trim();
    if (testModel.includes('3.6') || testModel.includes('3.5') || testModel.includes('2.5')) {
      testModel = discovered[0] || 'gemini-1.5-flash';
    }

    const testPayload = {
      contents: [{ parts: [{ text: 'Halo Gemini, konfirmasi koneksi OK.' }] }],
      generationConfig: { maxOutputTokens: 10 }
    };

    const response = await executeGeminiRequest(testModel, testKey, testPayload);

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: `Koneksi ke Google Gemini AI (${testModel}) BERHASIL! 🚀`,
        availableModels: discovered
      });
    }

    const errText = await response.text();
    return NextResponse.json({
      success: false,
      error: `Gemini API Error (HTTP ${response.status}): ${errText.substring(0, 250)}`,
      availableModels: discovered
    }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal menguji koneksi.'
    }, { status: 500 });
  }
}
