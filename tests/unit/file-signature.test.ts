import { describe, it, expect } from 'vitest';
import { validateFileSignature, sanitizeCellValue } from '../../src/lib/file-signature';

describe('File Signature Validator & Formula Sanitizer', () => {
  it('menolak buffer kosong', () => {
    const res = validateFileSignature(Buffer.from([]));
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('kosong');
  });

  it('menolak file melebihi 10 MB', () => {
    const largeBuffer = Buffer.alloc(10485761); // 10MB + 1 byte
    const res = validateFileSignature(largeBuffer);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('melebihi batas');
  });

  it('memvalidasi spreadsheet .xlsx yang sah (ZIP header dengan xl/ atau workbook.xml)', () => {
    // 50 4B 03 04 + string xl/workbook.xml
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const body = Buffer.from('xl/workbook.xml[Content_Types].xml');
    const validXlsx = Buffer.concat([header, body]);

    const res = validateFileSignature(validXlsx);
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('xlsx');
  });

  it('menolak spreadsheet makro .xlsm (vbaProject.bin)', () => {
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const body = Buffer.from('xl/vbaProject.bin macroEnabled');
    const macroFile = Buffer.concat([header, body]);

    const res = validateFileSignature(macroFile);
    expect(res.isValid).toBe(false);
    expect(res.isMacroEnabled).toBe(true);
    expect(res.error).toContain('Macro');
  });

  it('memvalidasi format .xls legacy (CFBF OLE2 magic bytes)', () => {
    // D0 CF 11 E0 A1 B1 1A E1
    const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const res = validateFileSignature(oleHeader);
    expect(res.isValid).toBe(true);
    expect(res.format).toBe('xls');
  });

  it('memvalidasi CSV plaintext dan menolak file dengan null bytes', () => {
    // Valid CSV
    const csvBuffer = Buffer.from('Tahun,Penjualan,Biaya\n2020,100,50\n2021,120,60');
    const resCsv = validateFileSignature(csvBuffer);
    expect(resCsv.isValid).toBe(true);
    expect(resCsv.format).toBe('csv');

    // Executable / Binary dengan ekstensi palsu (.exe diubah jadi .csv)
    const fakeCsv = Buffer.from([0x4d, 0x5a, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04]); // MZ header dengan \0
    const resFake = validateFileSignature(fakeCsv);
    expect(resFake.isValid).toBe(false);
  });

  it('menetralkan formula injection (=, +, -, @)', () => {
    expect(sanitizeCellValue('=1+2')).toBe("'=1+2");
    expect(sanitizeCellValue('+cmd|/c calc')).toBe("'+cmd|/c calc");
    expect(sanitizeCellValue('-SUM(A1:A10)')).toBe("'-SUM(A1:A10)");
    expect(sanitizeCellValue('@eval(evil)')).toBe("'@eval(evil)");
    expect(sanitizeCellValue('Nilai Normal')).toBe('Nilai Normal');
    expect(sanitizeCellValue(12345)).toBe(12345);
  });
});
