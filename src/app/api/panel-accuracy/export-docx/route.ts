import { NextRequest, NextResponse } from 'next/server';
import { generatePanelAccuracyDocx } from '@/lib/panel-accuracy-export-docx';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body?.result;
    const datasetName = body?.datasetName || 'Dataset_Panel_Accuracy.xlsx';

    if (!result) {
      return NextResponse.json({ success: false, error: 'Data hasil analisis tidak ditemukan.' }, { status: 400 });
    }

    const buffer = await generatePanelAccuracyDocx(result, datasetName);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Laporan_Akurasi_Pengukuran_Panel_CO2.docx"'
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal membuat berkas Word (.docx).' },
      { status: 500 }
    );
  }
}
