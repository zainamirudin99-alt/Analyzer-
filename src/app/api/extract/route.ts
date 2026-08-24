import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPdf } from '@/lib/pdf-parser';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'File PDF belum diunggah.'
      }, { status: 400 });
    }

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return NextResponse.json({
        success: false,
        error: 'Hanya file PDF yang didukung.'
      }, { status: 400 });
    }

    console.log(`[Extract API] Membaca file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extraction = await extractTextFromPdf(buffer);

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        fileSize: file.size,
        pageCount: extraction.pageCount,
        totalCharacters: extraction.totalCharacters,
        isScanned: extraction.isScannedOrEmpty,
        text: extraction.text
      }
    });
  } catch (err: any) {
    console.error('[Extract API] Error:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Gagal mengekstrak teks dari PDF.'
    }, { status: 500 });
  }
}
