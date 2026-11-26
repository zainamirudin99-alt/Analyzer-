import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import {
  isAllowedGoogleRedirectHost,
  parseMsmaGoogleSheetsUrl
} from '@/features/multi-source-accuracy/utils/gsheet-url';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const MAX_REDIRECT_HOPS = 5;

function hasValidXlsxSignature(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // Standard ZIP / OOXML magic bytes PK\x03\x04
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

async function safeFetchGoogleWorkbook(initialUrl: string, signal: AbortSignal): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const res = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'CED-Analyzer-MSMA/1.0 (Multi-Sheet-Importer)'
      },
      signal,
      redirect: 'manual'
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error('Redirect Google Sheets tidak menyertakan alamat tujuan.');
      }
      const nextParsed = new URL(location, currentUrl);
      if (nextParsed.protocol !== 'https:' || !isAllowedGoogleRedirectHost(nextParsed.hostname)) {
        throw new Error(`Redirect ke host "${nextParsed.hostname}" ditolak demi perlindungan anti-SSRF.`);
      }
      if (nextParsed.hostname.toLowerCase() === 'accounts.google.com') {
        throw new Error('AUTH_REQUIRED');
      }
      currentUrl = nextParsed.toString();
      continue;
    }

    return res;
  }

  throw new Error('Terlalu banyak pengalihan (redirect) saat mengakses Google Sheets.');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';

    const parsed = parseMsmaGoogleSheetsUrl(rawUrl);
    if (!parsed.isValid || !parsed.multiSheetExportUrl || !parsed.spreadsheetId) {
      return NextResponse.json(
        { success: false, error: parsed.error || 'Tautan Google Sheets tidak valid.' },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await safeFetchGoogleWorkbook(parsed.multiSheetExportUrl, controller.signal);
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json(
          {
            success: false,
            error: 'Koneksi ke Google Sheets melebihi batas waktu 15 detik. Coba lagi atau unduh file sebagai .xlsx.'
          },
          { status: 408 }
        );
      }
      if (err instanceof Error && err.message === 'AUTH_REQUIRED') {
        return NextResponse.json(
          {
            success: false,
            error:
              'Akses Google Sheets masih bersifat privat. Ubah pengaturan berbagi ke "Anyone with the link (Viewer)" atau unduh sebagai .xlsx lalu unggah pada tab Excel.'
          },
          { status: 403 }
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Gagal mengakses tautan Google Sheets.'
        },
        { status: 400 }
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Akses Google Sheets ditolak (Private/Restricted). Setel berbagi ke "Anyone with the link (Viewer)" atau unggah berkas .xlsx secara langsung.'
        },
        { status: 403 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Gagal mengunduh Google Sheets (HTTP ${response.status}). Pastikan ID tautan benar dan file masih tersedia.`
        },
        { status: 400 }
      );
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader && Number.parseInt(contentLengthHeader, 10) > MAX_SPREADSHEET_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Ukuran Google Sheets melebihi batas 10 MB.' },
        { status: 413 }
      );
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Berkas hasil unduhan Google Sheets kosong (0 byte).' },
        { status: 400 }
      );
    }
    if (buffer.length > MAX_SPREADSHEET_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Ukuran Google Sheets melebihi batas 10 MB.' },
        { status: 413 }
      );
    }
    if (!hasValidXlsxSignature(buffer)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Respon Google bukan berkas spreadsheet .xlsx (kemungkinan tautan masih privat / meminta login Google). Aktifkan akses "Anyone with the link (Viewer)" lalu coba lagi.'
        },
        { status: 400 }
      );
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames ?? [];
    if (sheetNames.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Spreadsheet tidak memiliki worksheet yang dapat dibaca.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sourceType: 'google_sheets',
        spreadsheetId: parsed.spreadsheetId,
        detectedGid: parsed.detectedGid ?? null,
        originalName: `Google_Sheets_${parsed.spreadsheetId.slice(0, 12)}.xlsx`,
        sizeBytes: buffer.length,
        sheetNames,
        fileBase64: buffer.toString('base64')
      }
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Gagal memproses impor Google Sheets.'
      },
      { status: 500 }
    );
  }
}
