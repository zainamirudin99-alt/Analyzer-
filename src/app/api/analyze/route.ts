import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPdf } from '@/lib/pdf-parser';
import { analyzeWithGemini } from '@/lib/gemini';
import { calculateDisclosureLevel, calculateTotalScore } from '@/lib/types';
import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s timeout for Vercel Serverless Function

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const directPdfText = (formData.get('pdfText') as string) || '';
    const companyCode = ((formData.get('companyCode') as string) || '').trim().toUpperCase();
    const fiscalYear = ((formData.get('fiscalYear') as string) || '').trim();
    const notes = ((formData.get('notes') as string) || '').trim();
    const customApiKey = ((formData.get('apiKey') as string) || '').trim();
    const customModel = ((formData.get('model') as string) || '').trim();

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

      if (!textToAnalyze) {
        console.log(`[Analyze] Mengekstrak teks dari PDF: ${fileName}...`);
        const extraction = await extractTextFromPdf(buffer);
        textToAnalyze = extraction.text;
        pageCount = extraction.pageCount;
        totalCharacters = extraction.totalCharacters;
        if (extraction.isScannedOrEmpty) {
          base64Fallback = buffer.toString('base64');
        }
      }
    } else if (textToAnalyze) {
      totalCharacters = textToAnalyze.length;
    } else {
      return NextResponse.json({ success: false, error: 'File PDF atau teks dokumen wajib diberikan.' }, { status: 400 });
    }

    // 2. Analisis 18 Indikator CED dengan Gemini AI
    console.log(`[Analyze] Mengirim ke Gemini AI untuk analisis ${companyCode} ${fiscalYear}...`);
    const aiResult = await analyzeWithGemini({
      companyCode,
      fiscalYear,
      pdfText: textToAnalyze,
      pdfBase64: base64Fallback,
      apiKey: customApiKey || undefined,
      preferredModel: customModel || undefined
    });

    const totalScore = calculateTotalScore(aiResult.scores);
    const disclosureLevel = calculateDisclosureLevel(totalScore);

    // 3. Simpan Hasil ke Database Supabase
    let savedInDb = false;
    let dbRecordId: string | undefined;
    let dbError: string | undefined;

    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        const recordData = {
          company_code: companyCode,
          fiscal_year: fiscalYear,
          file_name: fileName,
          notes,
          status: 'completed',
          ...aiResult.scores,
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
