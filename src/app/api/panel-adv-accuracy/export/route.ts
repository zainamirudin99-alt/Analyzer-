import { NextRequest, NextResponse } from 'next/server';
import {
  generateOption3CSV,
  generateOption3Docx,
  generateOption3PDF,
  generateOption3XLSX
} from '@/lib/panel-adv-export';
import { AdvPanelFitResult } from '@/lib/panel-adv-types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result: AdvPanelFitResult | undefined = body?.result;
    const format: 'pdf' | 'docx' | 'xlsx' | 'csv' = body?.format || 'pdf';
    const datasetName = String(body?.datasetName || 'Option3_Panel_Accuracy.xlsx');

    if (!result || !result.ranking || !result.estimation) {
      return NextResponse.json(
        { success: false, error: 'Objek hasil analisis Option 3 tidak ditemukan.' },
        { status: 400 }
      );
    }

    if (format === 'xlsx') {
      const buf = generateOption3XLSX(result, datasetName);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="Laporan_Option3_Advanced_Latent_Panel.xlsx"'
        }
      });
    }

    if (format === 'docx') {
      const buf = await generateOption3Docx(result, datasetName);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="Laporan_Option3_Advanced_Latent_Panel.docx"'
        }
      });
    }

    if (format === 'csv') {
      const csv = generateOption3CSV(result);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="Ranking_Option3_Advanced_Latent_Panel.csv"'
        }
      });
    }

    const pdfBuf = generateOption3PDF(result, datasetName);
    return new NextResponse(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Laporan_Option3_Advanced_Latent_Panel.pdf"'
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal membuat berkas ekspor Option 3.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
