import { NextRequest, NextResponse } from 'next/server';
import { generatePanelAccuracyPDF } from '@/lib/panel-accuracy-export-pdf';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body?.result;
    const datasetName = body?.datasetName || 'Dataset_Panel_Accuracy.xlsx';

    if (!result) {
      return NextResponse.json({ success: false, error: 'Data hasil analisis tidak ditemukan.' }, { status: 400 });
    }

    const buffer = generatePanelAccuracyPDF(result, datasetName);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Laporan_Akurasi_Pengukuran_Panel_CO2.pdf"'
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal membuat berkas PDF.' },
      { status: 500 }
    );
  }
}
