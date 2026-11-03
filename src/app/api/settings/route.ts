import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase';
import {
  ALL_SUPPORTED_MODELS,
  buildResilientModelQueue,
  executeGeminiRequest,
  getAvailableModelsFromApi
} from '@/lib/gemini';
import { testOpenAIConnection, DEFAULT_OPENAI_MODELS } from '@/lib/openai';
import { testClaudeConnection, ALL_CLAUDE_MODELS, CLAUDE_EFFORT_CONFIGS, ClaudeEffortLevel } from '@/lib/claude';

export const dynamic = 'force-dynamic';

// GET: Cek status koneksi Supabase & Multi-AI Provider
export async function GET(_req: NextRequest) {
  try {
    const defaultModel = (typeof process !== 'undefined' ? process.env.DEFAULT_GEMINI_MODEL : '') || 'gemini-3.7-flash';
    const hasServerGeminiKey = Boolean(typeof process !== 'undefined' && process.env.GEMINI_API_KEY);
    const hasServerOpenAIKey = Boolean(typeof process !== 'undefined' && process.env.OPENAI_API_KEY);
    const hasServerClaudeKey = Boolean(typeof process !== 'undefined' && process.env.ANTHROPIC_API_KEY);

    const supabaseStatus = {
      configured: isSupabaseConfigured,
      connected: false,
      message: isSupabaseConfigured ? 'Terkoneksi' : 'Belum dikonfigurasi di .env.local / Vercel'
    };

    if (isSupabaseConfigured) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        const { error } = await supabase.from('ced_results').select('id').limit(1);
        let heartbeatInfo = null;
        try {
          const { data: hbData } = await supabase
            .from('ced_heartbeat')
            .select('last_ping, ping_count, status')
            .eq('id', 'primary')
            .maybeSingle();
          if (hbData) {
            heartbeatInfo = hbData;
          }
        } catch {}

        if (!error) {
          supabaseStatus.connected = true;
          supabaseStatus.message = 'Database Supabase Terhubung dan Siap Digunakan ✅';
          (supabaseStatus as any).heartbeat = heartbeatInfo;
        } else {
          supabaseStatus.connected = false;
          supabaseStatus.message = `Terhubung ke URL Supabase, namun tabel belum siap (${error.message}). Jalankan schema.sql di Supabase SQL Editor.`;
          (supabaseStatus as any).heartbeat = heartbeatInfo;
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
        },
        openai: {
          hasKey: hasServerOpenAIKey,
          defaultModel: 'gpt-4o-mini',
          availableModels: DEFAULT_OPENAI_MODELS.map(m => m.id)
        },
        claude: {
          hasKey: hasServerClaudeKey,
          defaultModel: 'claude-3-7-sonnet-20250219',
          availableModels: ALL_CLAUDE_MODELS.map(m => m.id),
          defaultEffort: 'medium',
          availableEfforts: Object.values(CLAUDE_EFFORT_CONFIGS).map(e => ({
            id: e.id,
            label: e.label,
            description: e.description
          }))
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

// POST: Uji coba API Key dari client (Gemini, OpenAI, atau Claude)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider = (body?.provider || 'gemini').trim().toLowerCase();
    const apiKey = body?.apiKey;
    const model = body?.model;
    const baseUrl = body?.baseUrl;
    const effort = body?.effort as ClaudeEffortLevel | undefined;

    // 1. Jalur Pengujian Anthropic Claude
    if (provider === 'claude') {
      const testKey = (apiKey || (typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : '') || '').trim();
      if (!testKey) {
        return NextResponse.json({
          success: false,
          error: 'API Key Claude belum diisi. Masukkan API Key dari Anthropic Console.'
        }, { status: 400 });
      }

      const result = await testClaudeConnection({
        apiKey: testKey,
        model: model || 'claude-3-7-sonnet-20250219',
        baseUrl: baseUrl || undefined,
        effort: effort || 'medium'
      });

      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    // 2. Jalur Pengujian OpenAI / Compatible
    if (provider === 'openai') {
      const testKey = (apiKey || (typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : '') || '').trim();
      if (!testKey) {
        return NextResponse.json({
          success: false,
          error: 'API Key OpenAI belum diisi. Masukkan API Key dari OpenAI / platform terkait.'
        }, { status: 400 });
      }

      const result = await testOpenAIConnection({
        apiKey: testKey,
        model: model || 'gpt-4o-mini',
        baseUrl: baseUrl || undefined
      });

      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    // 2. Jalur Pengujian Google Gemini (Default)
    const testKey = (apiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '').trim();

    if (!testKey) {
      return NextResponse.json({
        success: false,
        error: 'API Key Gemini belum diisi. Masukkan API Key dari Google AI Studio.'
      }, { status: 400 });
    }

    const preferredModel = (model || 'gemini-3.7-flash').trim();

    // Temukan daftar model yang aktif untuk API Key ini
    const discovered = await getAvailableModelsFromApi(testKey);

    // 2. Susun antrian uji coba cerdas (mendukung gemini-3.8-flash, gemini-argon, dll. tanpa 404)
    const testQueue = buildResilientModelQueue(preferredModel, discovered);

    const testPayload = {
      contents: [{ parts: [{ text: 'Halo Gemini, konfirmasi status koneksi.' }] }],
      generationConfig: { maxOutputTokens: 10 }
    };

    let lastError = '';

    for (const m of testQueue) {
      try {
        console.log(`[Test Key] Mencoba koneksi dengan model: ${m}...`);
        const response = await executeGeminiRequest(m, testKey, testPayload, 12000);

        if (response.ok) {
          const isDirectOrAlias =
            m === preferredModel ||
            preferredModel.includes('3.') ||
            preferredModel.includes('argon');
          const msg = isDirectOrAlias
            ? `Koneksi ke Google Gemini AI (${preferredModel}) BERHASIL 100%! 🚀 Model aktif dan siap menganalisis dokumen.`
            : `Koneksi ke Google Gemini AI BERHASIL dengan model aktif: "${m}" 🚀.`;

          return NextResponse.json({
            success: true,
            message: msg,
            activeModel: isDirectOrAlias ? preferredModel : m,
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
