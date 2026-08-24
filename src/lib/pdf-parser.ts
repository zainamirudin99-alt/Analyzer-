// ============================================================
// PDF to Clean TXT Converter
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
 * Menggunakan pdfjs-dist untuk parsing per-halaman.
 */
export async function extractTextFromPDF(pdfBuffer: Buffer | Uint8Array): Promise<PDFExtractionResult> {
  try {
    // Import pdfjs-dist dynamically (legacy build for Node serverless environment)
    // @ts-ignore
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');

    const data = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true
    });

    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const pageTexts: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      try {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Gabungkan string dengan pemisah spasi & baris baru yang rapi
        let lastY: number | null = null;
        let pageStr = '';

        for (const item of textContent.items as any[]) {
          if (!item.str) continue;
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            pageStr += '\n';
          } else if (pageStr.length > 0 && !pageStr.endsWith(' ') && !pageStr.endsWith('\n')) {
            pageStr += ' ';
          }
          pageStr += item.str;
          lastY = item.transform[5];
        }

        const trimmedPage = pageStr.trim();
        if (trimmedPage) {
          pageTexts.push(`[Halaman ${pageNum}]\n${trimmedPage}`);
        }
      } catch (pageErr) {
        console.warn(`Gagal membaca halaman ${pageNum}:`, pageErr);
      }
    }

    const fullText = pageTexts.join('\n\n');
    const totalChars = fullText.length;
    const isScannedOrEmpty = totalChars < 50; // Jika di bawah 50 karakter kemungkinan besar adalah scan foto/gambar

    return {
      success: true,
      pageCount,
      totalCharacters: totalChars,
      text: fullText,
      isScannedOrEmpty
    };
  } catch (err: any) {
    console.error('Error saat konversi PDF ke TXT:', err);
    return {
      success: false,
      pageCount: 0,
      totalCharacters: 0,
      text: '',
      isScannedOrEmpty: true,
      error: err?.message || 'Gagal mengekstrak teks dari PDF'
    };
  }
}
