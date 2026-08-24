// ============================================================
// Robust PDF to Clean TXT Converter (Multi-Strategy Extraction)
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
 * Custom Page Renderer untuk mengekstrak teks dari berbagai format InDesign / PDF Corporate Reports
 */
function customPageRender(pageData: any) {
  const render_options = {
    normalizeWhitespace: true,
    disableCombineTextItems: true
  };

  return pageData.getTextContent(render_options)
    .then((textContent: any) => {
      if (!textContent || !textContent.items || textContent.items.length === 0) {
        return '';
      }

      let lastY: any = null;
      let pageText = '';

      for (const item of textContent.items) {
        if (!item || typeof item.str !== 'string') continue;
        const str = item.str.trim();
        if (!str) continue;

        // Cek perpindahan baris vertikal
        const currentY = item.transform ? item.transform[5] : null;
        if (lastY === null || (currentY !== null && Math.abs(lastY - currentY) < 3)) {
          pageText += str + ' ';
        } else {
          pageText += '\n' + str + ' ';
        }
        lastY = currentY;
      }

      return pageText + '\n';
    })
    .catch((err: any) => {
      console.warn('[PDF Render Error]:', err);
      return '';
    });
}

/**
 * Fallback Stream Extractor untuk PDF dengan encoded stream
 */
function extractRawTextFromBuffer(buffer: Buffer): string {
  try {
    const rawStr = buffer.toString('binary');
    const textMatches = rawStr.match(/\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ/g);
    if (textMatches && textMatches.length > 50) {
      const extracted = textMatches
        .map(m => m.replace(/[\(\)\[\]]|Tj|TJ/g, '').trim())
        .filter(s => s.length > 2)
        .join(' ');
      return extracted.length > 100 ? extracted : '';
    }
  } catch (e) {
    // Ignore fallback failure
  }
  return '';
}

/**
 * Mengekstrak teks dari Buffer PDF menjadi teks bersih (.txt)
 */
export async function extractTextFromPDF(pdfBuffer: any): Promise<PDFExtractionResult> {
  const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  let totalChars = 0;
  let pageCount = 1;
  let cleanText = '';

  try {
    // Strategi 1: pdf-parse dengan custom pagerender
    const pdfModule = await import('pdf-parse');
    const pdfParse = (pdfModule as any).default || pdfModule;

    const options = {
      pagerender: customPageRender,
      max: 0
    };

    const data = await pdfParse(buf, options);
    pageCount = data.numpages || 1;
    let rawText = data.text || '';

    // Jika custom render kosong, coba default render
    if (!rawText || rawText.trim().length < 50) {
      const defaultData = await pdfParse(buf);
      if (defaultData.text && defaultData.text.trim().length > rawText.length) {
        rawText = defaultData.text;
      }
    }

    // Rapikan teks
    cleanText = rawText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    totalChars = cleanText.length;

    // Strategi 2: Jika teks masih kosong, gunakan raw stream extraction
    if (totalChars < 50) {
      const rawExtracted = extractRawTextFromBuffer(buf);
      if (rawExtracted && rawExtracted.length > 100) {
        cleanText = rawExtracted;
        totalChars = cleanText.length;
      }
    }

    const isScannedOrEmpty = totalChars < 50;

    return {
      success: true,
      pageCount,
      totalCharacters: totalChars,
      text: cleanText,
      isScannedOrEmpty
    };
  } catch (err: any) {
    console.error('Error saat ekstraksi PDF:', err);

    // Fallback stream jika pdf-parse error
    const rawExtracted = extractRawTextFromBuffer(buf);
    if (rawExtracted && rawExtracted.length > 100) {
      return {
        success: true,
        pageCount: 1,
        totalCharacters: rawExtracted.length,
        text: rawExtracted,
        isScannedOrEmpty: false
      };
    }

    return {
      success: false,
      pageCount: 1,
      totalCharacters: 0,
      text: '',
      isScannedOrEmpty: true,
      error: err?.message || 'Gagal mengekstrak teks dari file PDF.'
    };
  }
}

// Alias untuk kompatibilitas penamaan
export const extractTextFromPdf = extractTextFromPDF;
