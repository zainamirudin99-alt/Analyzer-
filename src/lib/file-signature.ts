// ============================================================
// File Signature (Magic Bytes) Validator & CSV/Excel Sanitizer
// ============================================================

export type SupportedFormat = 'xlsx' | 'xls' | 'csv';

export interface FileValidationResult {
  isValid: boolean;
  format?: SupportedFormat;
  error?: string;
  isMacroEnabled?: boolean;
}

/**
 * Validasi signature file (Magic Bytes) untuk .xlsx, .xls, dan .csv
 * Mencegah pemalsuan ekstensi (.exe diubah ke .xlsx) dan menolak makro (.xlsm)
 */
export function validateFileSignature(buffer: Buffer): FileValidationResult {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: 'File kosong (0 bytes).' };
  }

  // Maksimal 10 MB (10485760 bytes)
  if (buffer.length > 10485760) {
    return { isValid: false, error: 'Ukuran file melebihi batas maksimal 10 MB.' };
  }

  // 1. Cek ZIP / OOXML (.xlsx atau .xlsm)
  // Magic bytes: 50 4B 03 04 (PK..)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    const rawString = buffer.toString('utf-8', 0, Math.min(buffer.length, 100000));
    
    // Tolak file makro .xlsm (memuat vbaProject.bin)
    if (rawString.includes('vbaProject.bin') || rawString.includes('macroEnabled')) {
      return {
        isValid: false,
        isMacroEnabled: true,
        error: 'File mengandung Macro (.xlsm). Demi keamanan sistem, spreadsheet makro ditolak.'
      };
    }

    // Pastikan ini adalah spreadsheet OpenXML (memuat xl/ atau workbook.xml)
    if (rawString.includes('xl/') || rawString.includes('workbook.xml') || rawString.includes('[Content_Types].xml')) {
      return { isValid: true, format: 'xlsx' };
    }

    return {
      isValid: false,
      error: 'Arsip ZIP terdeteksi tetapi bukan spreadsheet Excel (.xlsx) yang valid.'
    };
  }

  // 2. Cek Compound File Binary Format (CFBF / OLE2 untuk .xls legacy)
  // Magic bytes: D0 CF 11 E0 A1 B1 1A E1
  if (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    return { isValid: true, format: 'xls' };
  }

  // 3. Cek CSV (Plaintext ASCII / UTF-8)
  // Tidak boleh ada null bytes (\0) di 4096 byte pertama
  const checkLength = Math.min(buffer.length, 4096);
  let hasNullByte = false;
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0x00) {
      hasNullByte = true;
      break;
    }
  }

  if (!hasNullByte) {
    // Validasi apakah terdapat pemisah baris dan karakter teks
    const textPreview = buffer.toString('utf-8', 0, checkLength);
    if (textPreview.includes('\n') || textPreview.includes(',') || textPreview.includes(';')) {
      return { isValid: true, format: 'csv' };
    }
  }

  return {
    isValid: false,
    error: 'Format file tidak didukung atau ekstensi dipalsukan. Hanya mendukung file .xlsx, .xls, dan .csv yang sah.'
  };
}

/**
 * Netralisasi Formula Injection (CSV Injection)
 * Menetralkan sel yang diawali karakter eksekusi formula: '=', '+', '-', '@'
 */
export function sanitizeCellValue(val: unknown): unknown {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (['=', '+', '-', '@'].some(char => trimmed.startsWith(char))) {
      return `'${val}`;
    }
  }
  return val;
}
