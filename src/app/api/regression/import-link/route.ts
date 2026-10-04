import { NextRequest, NextResponse } from 'next/server';
import { fetchGoogleSheetAsXlsx } from '@/lib/google-sheets';
import { validateFileSignature } from '@/lib/file-signature';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const url = (body.url || '').trim();

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL Google Sheets wajib diisi.' },
        { status: 400 }
      );
    }

    // 1. Unduh file dari Google Sheets dengan perlindungan SSRF & batas ukuran
    const downloadResult = await fetchGoogleSheetAsXlsx(url);

    if (!downloadResult.success || !downloadResult.buffer) {
      return NextResponse.json(
        {
          success: false,
          error: downloadResult.error,
          statusNote: downloadResult.statusNote
        },
        { status: 400 }
      );
    }

    // 2. Validasi Magic Bytes (mencegah file palsu/makro)
    const sigResult = validateFileSignature(downloadResult.buffer);
    if (!sigResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: sigResult.error || 'File yang diunduh tidak memiliki signature spreadsheet valid.'
        },
        { status: 400 }
      );
    }

    // 3. Baca struktur workbook dan daftar sheet
    const workbook = XLSX.read(downloadResult.buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    if (!sheetNames || sheetNames.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File spreadsheet tidak memiliki sheet data.' },
        { status: 400 }
      );
    }

    // Ekstrak pratinjau tiap sheet
    const sheetsData = sheetNames.map(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
      return {
        sheetName,
        rowCount: rawRows.length,
        columnCount: columns.length,
        columns,
        previewRows: rawRows.slice(0, 10),
        allRows: rawRows
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        sourceType: 'link',
        originalName: `Google_Sheets_${downloadResult.spreadsheetId}.xlsx`,
        sizeBytes: downloadResult.buffer.length,
        sheetNames,
        sheets: sheetsData,
        fileBase64: downloadResult.buffer.toString('base64')
      }
    });
  } catch (err: any) {
    console.error('[Import Google Sheets Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memproses import link Google Sheets.' },
      { status: 500 }
    );
  }
}
