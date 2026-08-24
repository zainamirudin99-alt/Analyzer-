import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase';
import { FALLBACK_MODELS } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

// GET: Cek status koneksi Supabase & Gemini
export async function GET(req: NextRequest) {
  try {
    const defaultModel = process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.5-flash';
    const hasServerGeminiKey = Boolean(process.env.GEMINI_API_KEY);

    let supabaseStatus = {
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
          availableModels: FALLBACK_MODELS
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
    const { apiKey, model } = await req.json();
    const testKey = apiKey || process.env.GEMINI_API_KEY;
    const testModel = model || process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.5-flash';

    if (!testKey) {
      return NextResponse.json({
        success: false,
        error: 'API Key belum diisi.'
      }, { status: 400 });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${testKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Halo Gemini, konfirmasi koneksi OK.' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });

    if (response.ok) {
      return NextResponse.json({
        success: true,
        message: `Koneksi ke Gemini AI (${testModel}) BERHASIL! 🚀`
      });
    }

    const errText = await response.text();
    return NextResponse.json({
      success: false,
      error: `Gemini API Error (HTTP ${response.status}): ${errText.substring(0, 200)}`
    }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal menguji koneksi.'
    }, { status: 500 });
  }
}
