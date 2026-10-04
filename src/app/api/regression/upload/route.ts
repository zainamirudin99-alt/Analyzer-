import { NextRequest, NextResponse } from 'next/server';
import { validateFileSignature } from '@/lib/file-signature';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File dataset (.xlsx, .xls, .csv) wajib diunggah.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Validasi Magic Bytes
    const sigResult = validateFileSignature(buffer);
    if (!sigResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: sigResult.error || 'Signature file tidak valid atau format tidak didukung.',
          isMacroEnabled: sigResult.isMacroEnabled
        },
        { status: 400 }
      );
    }

    // 2. Parse Spreadsheet
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    if (!sheetNames || sheetNames.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File tidak memuat sheet data yang dapat dibaca.' },
        { status: 400 }
      );
    }

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
        sourceType: 'upload',
        originalName: file.name,
        sizeBytes: buffer.length,
        detectedFormat: sigResult.format,
        sheetNames,
        sheets: sheetsData,
        fileBase64: buffer.toString('base64')
      }
    });
  } catch (err: any) {
    console.error('[Upload Dataset Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memproses file unggahan.' },
      { status: 500 }
    );
  }
}
