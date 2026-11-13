import { NextRequest, NextResponse } from 'next/server';
import { generatePanelLatentDocx } from '@/lib/panel-latent-export-docx';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = body?.result;
    const datasetName = body?.datasetName || 'Dataset_CO2_Panel.xlsx';
    if (!result || !result.parameters || !result.latentEstimates) {
      return NextResponse.json(
        { success: false, error: 'Payload hasil analisis Panel Latent tidak lengkap.' },
        { status: 400 }
      );
    }
    const buf = await generatePanelLatentDocx(result, datasetName);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Laporan_Panel_Latent_CO2.docx"'
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal mengekspor laporan Word.' },
      { status: 500 }
    );
  }
}

