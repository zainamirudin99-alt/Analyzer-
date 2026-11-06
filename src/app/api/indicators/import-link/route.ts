import { NextRequest, NextResponse } from 'next/server';
import { fetchGoogleSheetAsXlsx } from '@/lib/google-sheets';
import { parseExcelBuffer, parseRawText } from '@/lib/indicator-importer';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = (body.url || '').trim();

    if (!rawUrl) {
      return NextResponse.json(
        { success: false, error: 'URL Google Sheets atau Google Docs wajib diisi.' },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json({ success: false, error: 'Format URL tidak valid.' }, { status: 400 });
    }

    const host = parsedUrl.hostname.toLowerCase();
    if (!['docs.google.com', 'drive.google.com'].includes(host)) {
      return NextResponse.json(
        { success: false, error: 'Hanya link resmi dari docs.google.com atau drive.google.com yang diizinkan.' },
        { status: 400 }
      );
    }

    // 1. Jalur Google Sheets
    if (parsedUrl.pathname.includes('/spreadsheets/')) {
      const downloadResult = await fetchGoogleSheetAsXlsx(rawUrl);
      if (!downloadResult.success || !downloadResult.buffer) {
        return NextResponse.json(
          {
            success: false,
            error: downloadResult.error || 'Gagal mengunduh spreadsheet.',
            statusNote: downloadResult.statusNote
          },
          { status: 400 }
        );
      }

      const parseResult = parseExcelBuffer(downloadResult.buffer);
      if (parseResult.indicators.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: parseResult.warning || 'Tidak ada indikator valid yang terdeteksi pada spreadsheet ini.'
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        sourceType: 'google_sheets',
        indicators: parseResult.indicators,
        total: parseResult.indicators.length
      });
    }

    // 2. Jalur Google Docs
    const docMatch = parsedUrl.pathname.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    if (docMatch && docMatch[1]) {
      const docId = docMatch[1];
      const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const docRes = await fetch(exportUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'CED-Analyzer-Bot/1.0' },
        signal: controller.signal
      }).catch(err => {
        clearTimeout(timeoutId);
        throw err;
      });
      clearTimeout(timeoutId);

      if (docRes.status === 401 || docRes.status === 403 || docRes.url.includes('accounts.google.com/ServiceLogin')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Dokumen Google Docs bersifat privat atau terbatas.',
            statusNote: 'Pastikan dokumen diatur ke "Anyone with the link can view", atau gunakan opsi Unggah File / Salin-Tempel Teks.'
          },
          { status: 400 }
        );
      }

      if (!docRes.ok) {
        return NextResponse.json(
          { success: false, error: `Gagal mengunduh Google Docs (HTTP ${docRes.status}).` },
          { status: 400 }
        );
      }

      const text = await docRes.text();
      const indicators = parseRawText(text);

      if (indicators.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'Tidak ditemukan indikator yang sesuai pada teks dokumen.',
            statusNote: 'Pastikan dokumen memuat daftar indikator dengan format: [KODE] Judul: Kriteria, atau gunakan template yang disediakan.'
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        sourceType: 'google_docs',
        indicators,
        total: indicators.length
      });
    }

    return NextResponse.json(
      { success: false, error: 'URL bukan Google Sheets (/spreadsheets/d/...) atau Google Docs (/document/d/...).' },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Kendala impor link: ${err?.message || 'Gagal memproses URL'}` },
      { status: 500 }
    );
  }
}
