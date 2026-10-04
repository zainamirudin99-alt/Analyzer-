import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { validateRegressionConfig, ValidationConfig } from '@/lib/regression-validator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, fileBase64, sheetName, config } = body as {
      rows?: Record<string, any>[];
      fileBase64?: string;
      sheetName?: string;
      config: ValidationConfig;
    };

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Konfigurasi regresi (config) wajib disertakan.' },
        { status: 400 }
      );
    }

    let targetRows: Record<string, any>[] = rows || [];

    if (!targetRows || targetRows.length === 0) {
      if (fileBase64) {
        const buffer = Buffer.from(fileBase64, 'base64');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const selectedSheet = sheetName || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[selectedSheet];
        targetRows = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      } else {
        return NextResponse.json(
          { success: false, error: 'Data baris (rows) atau fileBase64 wajib disertakan.' },
          { status: 400 }
        );
      }
    }

    const summary = validateRegressionConfig(targetRows, config);

    return NextResponse.json({
      success: true,
      data: summary
    });
  } catch (err: any) {
    console.error('[Engine Validate Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal memvalidasi konfigurasi regresi.' },
      { status: 500 }
    );
  }
}
