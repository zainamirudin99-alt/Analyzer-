// ============================================================
// PDF to Clean TXT Converter (Vercel Serverless Compatible)
// ============================================================

export interface PDFExtractionResult {
  success: boolean;
  pageCount: number;
  totalCharacters: number;
  text: string;
  isScannedOrEmpty: boolean;
  error?: string;
}

/**
 * Mengekstrak teks dari Buffer PDF menjadi teks bersih (.txt)
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<PDFExtractionResult> {
  try {
    // Import pdf-parse dynamically
    // @ts-ignore
    const pdfParse = (await import('pdf-parse')).default || (await import('pdf-parse'));

    const data = await pdfParse(pdfBuffer);
    const rawText = data.text || '';
    
    // Rapikan baris baru dan spasi ganda
    const cleanText = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    const totalChars = cleanText.length;
    const isScannedOrEmpty = totalChars < 50;

    return {
      success: true,
      pageCount: data.numpages || 1,
      totalCharacters: totalChars,
      text: cleanText,
      isScannedOrEmpty
    };
  } catch (err: any) {
    console.error('Error saat ekstraksi PDF:', err);
    return {
      success: false,
      pageCount: 0,
      totalCharacters: 0,
      text: '',
      isScannedOrEmpty: true,
      error: err?.message || 'Gagal mengekstrak teks dari file PDF.'
    };
  }
}

// Alias untuk kompatibilitas penamaan
export const extractTextFromPdf = extractTextFromPDF;
