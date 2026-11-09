import { NextRequest, NextResponse } from 'next/server';
import { buildPanelXlsxBuffer } from '@/lib/panel-export-xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fitResult, datasetName = 'Dataset_Panel.xlsx' } = body;

    if (!fitResult || !fitResult.finalModel) {
      return NextResponse.json(
        { success: false, error: 'Objek fitResult tidak lengkap untuk diekspor ke Excel.' },
        { status: 400 }
      );
    }

    const xlsxBuffer = buildPanelXlsxBuffer({
      fitResult,
      datasetName
    });

    const filename = `Laporan_Regresi_Panel_Stata_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    console.error('[Panel Export XLSX Error]:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat dokumen Excel: ' + (err.message || String(err)) },
      { status: 500 }
    );
  }
}
