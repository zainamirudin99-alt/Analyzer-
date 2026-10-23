import { NextRequest, NextResponse } from 'next/server';
import { generatePanelDocx } from '../../../../lib/panel-docx-builder';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fitResult, datasetName = 'Dataset_Panel.xlsx' } = body;

    if (!fitResult || !fitResult.finalModel || !fitResult.consoleBlocks) {
      return NextResponse.json(
        { success: false, error: 'Objek fitResult tidak lengkap untuk diekspor ke Word.' },
        { status: 400 }
      );
    }

    const docxBuffer = await generatePanelDocx({
      fitResult,
      datasetName
    });

    const filename = `Laporan_Regresi_Panel_Stata_${new Date().toISOString().slice(0, 10)}.docx`;

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    console.error('[Panel Export DOCX Error]:', err);
    return NextResponse.json(
      { success: false, error: 'Gagal membuat dokumen Word: ' + (err.message || String(err)) },
      { status: 500 }
    );
  }
}
