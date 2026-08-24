import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPDF } from '@/lib/pdf-parser';
import { analyzeWithGemini } from '@/lib/gemini';
import { calculateDisclosureLevel, calculateTotalScore } from '@/lib/types';
import { getSupabaseServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s timeout for Vercel Serverless Function

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
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
    if (!file) {
      return NextResponse.json({ success: false, error: 'File PDF wajib diunggah.' }, { status: 400 });
    }

    const fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Ekstraksi Otomatis PDF ke Format TXT
    console.log(`[Analyze] Mengekstrak teks dari PDF: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)...`);
    const extraction = await extractTextFromPDF(buffer);
    console.log(`[Analyze] Ekstraksi selesai: ${extraction.pageCount} halaman, ${extraction.totalCharacters} karakter.`);

    // Siapkan base64 sebagai fallback jika PDF berupa scan/gambar
    const base64 = buffer.toString('base64');

    // 2. Analisis 18 Indikator CED dengan Gemini AI
    console.log(`[Analyze] Mengirim ke Gemini AI untuk analisis ${companyCode} ${fiscalYear}...`);
    const aiResult = await analyzeWithGemini({
      companyCode,
      fiscalYear,
      pdfText: extraction.text,
      pdfBase64: extraction.isScannedOrEmpty ? base64 : undefined,
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

        // Simpan (Upsert jika kode dan tahun sama, atau insert baru)
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
    } else {
      console.log('[Analyze] Supabase belum dikonfigurasi, hasil disimpan secara lokal di respon browser.');
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
          page_count: extraction.pageCount,
          total_characters: extraction.totalCharacters,
          is_scanned: extraction.isScannedOrEmpty
        },
        saved_in_supabase: savedInDb,
        supabase_note: dbError ? `Gagal simpan ke DB: ${dbError}` : (savedInDb ? 'Tersimpan di Supabase' : 'Supabase belum diset')
      }
    });

  } catch (err: any) {
    console.error('[Analyze API Error]', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Terjadi kesalahan saat memproses dokumen.'
    }, { status: 500 });
  }
}
