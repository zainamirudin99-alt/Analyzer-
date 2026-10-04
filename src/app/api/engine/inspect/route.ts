import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { inspectColumn } from '../../../../lib/regression-validator';
import { sanitizeCellValue } from '../../../../lib/file-signature';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileBase64, format = 'xlsx' } = body;

    if (!fileBase64) {
      return NextResponse.json(
        { success: false, error: 'Parameter fileBase64 wajib disertakan.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    if (!sheetNames || sheetNames.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada sheet yang ditemukan dalam workbook.' },
        { status: 400 }
      );
    }

    const sheetsSummary = sheetNames.map(sName => {
      const sheet = workbook.Sheets[sName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: null });
      const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

      const columnTypes: Record<string, string> = {};
      columns.forEach(col => {
        const vals = rawRows.map(r => r[col]);
        const info = inspectColumn(col, vals);
        columnTypes[col] = info.type;
      });

      // Sanitasi sel untuk pratinjau (formula injection protection)
      const previewRows = rawRows.slice(0, 10).map(row => {
        const sanitized: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
          sanitized[k] = sanitizeCellValue(v);
        });
        return sanitized;
      });

      return {
        sheetName: sName,
        rowCount: rawRows.length,
        columnCount: columns.length,
        columns,
        columnTypes,
        previewRows
      };
    });

    return NextResponse.json({
      success: true,
      sheets: sheetsSummary
    });
  } catch (err: any) {
    console.error('[Engine Inspect Error]:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Gagal menginspeksi dataset.' },
      { status: 500 }
    );
  }
}
