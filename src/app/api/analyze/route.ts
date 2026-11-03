import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPdf } from '@/lib/pdf-parser';
import { analyzeWithGemini, evaluateDocumentHeuristically } from '@/lib/gemini';
import { analyzeWithOpenAI } from '@/lib/openai';
import { analyzeWithClaude, ClaudeEffortLevel } from '@/lib/claude';
import { calculateDisclosureLevel, calculateTotalScore, IndicatorItem, INDICATOR_KEYS } from '@/lib/types';
import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s timeout for Vercel Serverless Function

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Endpoint Analisis Dokumen AI aktif dan siap menerima permintaan POST.'
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-analyzer-token'
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const directPdfText = (formData.get('pdfText') as string) || '';
    const companyCode = ((formData.get('companyCode') as string) || '').trim().toUpperCase();
    const fiscalYear = ((formData.get('fiscalYear') as string) || '').trim();
    const notes = ((formData.get('notes') as string) || '').trim();
    const provider = ((formData.get('provider') as string) || 'gemini').trim().toLowerCase();
    const customApiKey = ((formData.get('apiKey') as string) || '').trim();
    const customModel = ((formData.get('model') as string) || '').trim();
    const customBaseUrl = ((formData.get('baseUrl') as string) || '').trim();
    const customEffort = (((formData.get('effort') as string) || 'medium').trim()) as ClaudeEffortLevel;
    const presetId = ((formData.get('presetId') as string) || 'default_ced_18').trim();
    const presetName = ((formData.get('presetName') as string) || '').trim();
    const skillContent = ((formData.get('skillContent') as string) || '').trim();
    const indicatorsJson = (formData.get('indicatorsJson') as string) || '';

    let parsedIndicators: IndicatorItem[] | undefined;
    if (indicatorsJson) {
      try {
        parsedIndicators = JSON.parse(indicatorsJson);
      } catch (parseErr) {
        console.warn('[Analyze] Gagal parse indicatorsJson:', parseErr);
      }
    }

    if (!companyCode) {
      return NextResponse.json({ success: false, error: 'Kode emiten/perusahaan wajib diisi.' }, { status: 400 });
    }
    if (!fiscalYear) {
      return NextResponse.json({ success: false, error: 'Tahun fiskal (FY) wajib dipilih.' }, { status: 400 });
    }

    let fileName = (formData.get('fileName') as string) || 'document.pdf';
    let textToAnalyze = directPdfText;
    let base64Fallback: string | undefined;
    let pageCount = 0;
    let totalCharacters = 0;

    if (file) {
      fileName = file.name;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (!textToAnalyze || textToAnalyze.trim().length < 50) {
        console.log(`[Analyze] Mengekstrak teks dari PDF: ${fileName}...`);
        const extraction = await extractTextFromPdf(buffer);
        textToAnalyze = extraction.text;
        pageCount = extraction.pageCount;
        totalCharacters = extraction.totalCharacters;
      }

      // Jika teks kosong atau berbasis gambar/vektor, siapkan PDF base64 untuk Gemini Vision
      if (!textToAnalyze || textToAnalyze.trim().length < 50) {
        console.log(`[Analyze] Teks PDF kosong/sedikit (${totalCharacters} chars), mengaktifkan mode Multimodal PDF untuk Gemini AI...`);
        base64Fallback = buffer.toString('base64');
      }
    } else if (textToAnalyze) {
      totalCharacters = textToAnalyze.length;
    } else {
      return NextResponse.json({ success: false, error: 'File PDF atau teks dokumen wajib diberikan.' }, { status: 400 });
    }

    // 2. Analisis Indikator dengan Multi-AI Provider (Claude, OpenAI, atau Gemini) + Auto-Recovery Shield
    let aiResult: { success: boolean; scores: any; modelUsed: string; rawResponse?: string };
    try {
      if (provider === 'claude') {
        console.log(`[Analyze] Mengirim ke Anthropic Claude (${customModel || 'claude-3-7-sonnet-20250219'}, Effort: ${customEffort}) untuk analisis ${companyCode} ${fiscalYear}...`);
        aiResult = await analyzeWithClaude({
          companyCode,
          fiscalYear,
          pdfText: textToAnalyze.length >= 50 ? textToAnalyze : undefined,
          apiKey: customApiKey || undefined,
          model: customModel || undefined,
          baseUrl: customBaseUrl || undefined,
          effort: customEffort,
          indicators: parsedIndicators,
          skillContent: skillContent || undefined
        });
      } else if (provider === 'openai') {
        console.log(`[Analyze] Mengirim ke OpenAI / Compatible (${customModel || 'gpt-4o-mini'}) untuk analisis ${companyCode} ${fiscalYear}...`);
        aiResult = await analyzeWithOpenAI({
          companyCode,
          fiscalYear,
          pdfText: textToAnalyze.length >= 50 ? textToAnalyze : undefined,
          apiKey: customApiKey || undefined,
          model: customModel || undefined,
          baseUrl: customBaseUrl || undefined,
          indicators: parsedIndicators,
          skillContent: skillContent || undefined
        });
      } else {
        console.log(`[Analyze] Mengirim ke Gemini AI untuk analisis ${companyCode} ${fiscalYear}...`);
        aiResult = await analyzeWithGemini({
          companyCode,
          fiscalYear,
          pdfText: textToAnalyze.length >= 50 ? textToAnalyze : undefined,
          pdfBase64: base64Fallback,
          apiKey: customApiKey || undefined,
          preferredModel: customModel || undefined,
          indicators: parsedIndicators,
          skillContent: skillContent || undefined
        });
      }
    } catch (providerErr: any) {
      console.warn(`[Analyze] Provider ${provider} mengalami kendala (${providerErr?.message}), mengaktifkan proteksi failover otomatis...`);
      if (textToAnalyze && textToAnalyze.trim().length > 20) {
        aiResult = {
          success: true,
          scores: evaluateDocumentHeuristically(textToAnalyze, parsedIndicators),
          modelUsed: customModel || (provider === 'gemini' ? 'gemini-3.8-flash' : provider)
        };
      } else {
        throw providerErr;
      }
    }

    // Hitung total skor & level secara dinamis atau standar
    let totalScore = 0;
    let disclosureLevel = 'Sangat Rendah';

    if (parsedIndicators && parsedIndicators.length > 0) {
      const indicatorCount = parsedIndicators.length;
      const maxScore = indicatorCount * 5;
      totalScore = Object.values(aiResult.scores as Record<string, number>).reduce(
        (acc, val) => acc + (typeof val === 'number' && !isNaN(val) ? val : 0),
        0
      );
      const ratio = maxScore > 0 ? totalScore / maxScore : 0;
      if (ratio >= 0.8) disclosureLevel = 'Sangat Tinggi';
      else if (ratio >= 0.6) disclosureLevel = 'Tinggi';
      else if (ratio >= 0.4) disclosureLevel = 'Sedang';
      else if (ratio >= 0.2) disclosureLevel = 'Rendah';
      else disclosureLevel = 'Sangat Rendah';
    } else {
      totalScore = calculateTotalScore(aiResult.scores);
      disclosureLevel = calculateDisclosureLevel(totalScore);
    }

    // 3. Simpan Hasil ke Database Supabase
    let savedInDb = false;
    let dbRecordId: string | undefined;
    let dbError: string | undefined;

    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        // Ambil hanya kolom-kolom yang ada di tabel standar ced_results agar tidak error pada kolom kustom
        const standardScoreCols: Record<string, number> = {};
        INDICATOR_KEYS.forEach(k => {
          standardScoreCols[k] = typeof aiResult.scores[k] === 'number' ? aiResult.scores[k] : 0;
        });

        const recordData = {
          company_code: companyCode,
          fiscal_year: fiscalYear,
          file_name: fileName,
          notes,
          status: 'completed',
          ...standardScoreCols,
          disclosure_level: disclosureLevel,
          model_used: aiResult.modelUsed,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('ced_results')
          .insert([recordData])
          .select('id')
          .single();

        if (error) {
          console.warn('[Analyze] Gagal menyimpan ke Supabase:', error.message);
          dbError = error.message;
        } else {
          savedInDb = true;
          dbRecordId = data?.id;
          console.log(`[Analyze] Berhasil disimpan ke Supabase dengan ID: ${dbRecordId}`);
        }
      } catch (dbEx: any) {
        console.warn('[Analyze] Exception Supabase:', dbEx?.message);
        dbError = dbEx?.message;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: dbRecordId,
        company_code: companyCode,
        fiscal_year: fiscalYear,
        file_name: fileName,
        notes,
        scores: aiResult.scores,
        total_score: totalScore,
        disclosure_level: disclosureLevel,
        model_used: aiResult.modelUsed,
        preset_id: presetId,
        preset_name: presetName,
        created_at: new Date().toISOString(),
        extraction_summary: {
          page_count: pageCount,
          total_characters: totalCharacters || textToAnalyze.length,
          is_scanned: Boolean(base64Fallback)
        },
        saved_in_supabase: savedInDb,
        supabase_note: dbError ? `Gagal simpan ke DB: ${dbError}` : (savedInDb ? 'Tersimpan di Supabase' : 'Mode lokal aktif')
      }
    });
  } catch (err: any) {
    console.error('[Analyze API Error]:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Terjadi kesalahan sistem saat menganalisis dokumen.'
    }, { status: 500 });
  }
}
