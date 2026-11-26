import { NextRequest, NextResponse } from 'next/server';
import {
  generateMsmaDocxBuffer,
  generateMsmaExcelBuffer,
  generateMsmaJournalPdfBuffer
} from '@/features/multi-source-accuracy/services/export-service';
import {
  MsmaFullAnalysisResult,
  MsmaJournalReportSections
} from '@/features/multi-source-accuracy/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result: MsmaFullAnalysisResult | undefined = body?.result;
    const journal: MsmaJournalReportSections | undefined = body?.journal;
    const format: 'pdf' | 'docx' | 'gdocs' | 'xlsx' | 'do' = body?.format || 'pdf';
    const datasetName = String(body?.datasetName || 'MSMA_Dataset.xlsx');

    if (!result || !journal || !result.panel) {
      return NextResponse.json(
        { success: false, error: 'Payload hasil analisis MSMA tidak lengkap.' },
        { status: 400 }
      );
    }

    if (format === 'do') {
      return new NextResponse(result.completeStataDoFile, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="MSMA_Master_Analysis_Stata17_18.do"'
        }
      });
    }

    if (format === 'xlsx') {
      const buf = generateMsmaExcelBuffer(result, journal, datasetName);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="Laporan_MSMA_MultiSource_Accuracy.xlsx"'
        }
      });
    }

    if (format === 'docx' || format === 'gdocs') {
      const buf = await generateMsmaDocxBuffer(result, journal, datasetName, format === 'gdocs');
      const fname =
        format === 'gdocs'
          ? 'Artikel_Jurnal_MSMA_GoogleDocs_Compatible.docx'
          : 'Artikel_Jurnal_MSMA_MultiSource_Accuracy.docx';
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fname}"`
        }
      });
    }

    const pdfBuf = generateMsmaJournalPdfBuffer(result, journal, datasetName);
    return new NextResponse(new Uint8Array(pdfBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="Artikel_Jurnal_MSMA_A4.pdf"'
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal mengekspor laporan MSMA.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
