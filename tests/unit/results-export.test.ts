import { describe, it, expect } from 'vitest';
import {
  generateResultsExcelWorkbook,
  generateResultsDocxDocument,
  generateResultsSpreadsheetClipboard,
  generateResultsGoogleDocsHtml,
  generateResultsCSVString,
  ResultsExportOptions
} from '../../src/lib/results-export-builder';
import * as XLSX from 'xlsx';

describe('Results Export Builder (Excel, Word, Google Docs, Spreadsheet & CSV)', () => {
  const sampleOptions: ResultsExportOptions = {
    presetName: 'Standar Kualitas Perusahaan Hijau',
    presetId: 'preset_green_15',
    rubricType: 'quantitative_count',
    indicators: [
      { code: 'GHG1', title: 'Inventarisasi & Reduksi Emisi GRK', group: 'Emisi', fullDesc: 'Scope 1, 2, 3 emisi' },
      { code: 'CC1', title: 'Target Net-Zero Dekarbonisasi', group: 'Iklim', fullDesc: 'Target berbasis sains' },
      { code: 'ENRG1', title: 'Transisi Energi Terbarukan', group: 'Energi', fullDesc: 'Persentase bauran EBT' },
      { code: 'WATER1', title: 'Pengolahan Air Limbah', group: 'Air', fullDesc: 'Volume air yang diolah' }
    ],
    rows: [
      {
        company_code: 'AKRA',
        fiscal_year: 'FY 2025',
        file_name: 'AKRA_2025.pdf',
        preset_name: 'Standar Kualitas Perusahaan Hijau',
        scores: {
          GHG1: '25000 ton CO2e',
          CC1: '2050',
          ENRG1: '80 %',
          WATER1: '1000000 liter'
        },
        total_score: '4/4',
        disclosure_level: 'Sangat Tinggi',
        model_used: 'Gemini 2.5 Flash',
        created_at: '2026-11-10 09:00:00'
      },
      {
        company_code: 'BBCA',
        fiscal_year: 'FY 2025',
        file_name: 'BBCA_2025.pdf',
        preset_name: 'Standar Kualitas Perusahaan Hijau',
        scores: {
          GHG1: '0',
          CC1: '0',
          ENRG1: '0',
          WATER1: '0'
        },
        total_score: '0/4',
        disclosure_level: 'Sangat Rendah',
        model_used: 'Gemini 2.5 Flash',
        created_at: '2026-11-10 09:01:00'
      }
    ],
    stats: {
      total: 2,
      avg: '2.0',
      max: 4,
      min: 0
    },
    lang: 'id'
  };

  it('generates multi-sheet Excel (.xlsx) workbook with dynamic indicator columns and auto-fit widths', () => {
    const uint8 = generateResultsExcelWorkbook(sampleOptions);
    expect(uint8).toBeDefined();
    expect(uint8.length).toBeGreaterThan(1000);

    const wb = XLSX.read(uint8, { type: 'array' });
    expect(wb.SheetNames).toContain('Hasil_Analisis');
    expect(wb.SheetNames).toContain('Kamus_Indikator');
    expect(wb.SheetNames).toContain('Ringkasan_Statistik');

    // Cek Sheet 1
    const ws1 = wb.Sheets['Hasil_Analisis'];
    const sheetData = XLSX.utils.sheet_to_json<any[]>(ws1, { header: 1 });
    const headerRow = sheetData[4]; // Baris ke-5 adalah header tabel

    expect(headerRow).toContain('Kode Emiten');
    expect(headerRow).toContain('Tahun Fiskal');
    expect(headerRow).toContain('GHG1');
    expect(headerRow).toContain('CC1');
    expect(headerRow).toContain('ENRG1');
    expect(headerRow).toContain('WATER1');
    expect(headerRow).toContain('Total Skor');

    // Cek Data Baris 1 (AKRA)
    const akraRow = sheetData[5];
    expect(akraRow).toContain('AKRA');
    expect(akraRow).toContain('FY 2025');
    expect(akraRow).toContain('25000 ton CO2e');
    expect(akraRow).toContain('80 %');
    expect(akraRow).toContain('1000000 liter');
    expect(akraRow).toContain('4/4');

    // Cek Sheet 2 (Kamus Indikator)
    const ws2 = wb.Sheets['Kamus_Indikator'];
    const glossaryData = XLSX.utils.sheet_to_json<any[]>(ws2, { header: 1 });
    expect(JSON.stringify(glossaryData)).toContain('Inventarisasi & Reduksi Emisi GRK');
    expect(JSON.stringify(glossaryData)).toContain('Pengolahan Air Limbah');
  });

  it('generates landscape Word (.docx) document with custom preset metadata, table, and glossary', async () => {
    const blob = await generateResultsDocxDocument(sampleOptions, false);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(5000);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('generates Google Docs compatible .docx document variant', async () => {
    const blob = await generateResultsDocxDocument(sampleOptions, true);
    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(5000);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('generates rich HTML and clean TSV for Spreadsheet (Google Sheets & Excel clipboard)', () => {
    const { html, tsv } = generateResultsSpreadsheetClipboard(sampleOptions);

    // Cek TSV
    expect(tsv).toContain('Kode\tTahun\tGHG1\tCC1\tENRG1\tWATER1\tTOTAL\tLevel');
    expect(tsv).toContain('AKRA\tFY 2025\t25000 ton CO2e\t2050\t80 %\t1000000 liter\t4/4\tSangat Tinggi');
    expect(tsv).toContain('BBCA\tFY 2025\t0\t0\t0\t0\t0/4\tSangat Rendah');

    // Cek HTML
    expect(html).toContain('<table');
    expect(html).toContain('#0f766e'); // Warna header teal
    expect(html).toContain('>GHG1</th>');
    expect(html).toContain('>WATER1</th>');
    expect(html).toContain('>AKRA</td>');
    expect(html).toContain('>1000000 liter</td>');
  });

  it('generates rich Google Docs document HTML with Kop, Summary Box, Main Table, and Glossary', () => {
    const gdocsHtml = generateResultsGoogleDocsHtml(sampleOptions);

    // Judul & Subjudul
    expect(gdocsHtml).toContain('LAPORAN HASIL ANALISIS PENGUNGKAPAN');
    expect(gdocsHtml).toContain('ANALYZER(?) — AI Document & Indicator Assessment');

    // Summary Box
    expect(gdocsHtml).toContain('Standar Pilihan Indikator');
    expect(gdocsHtml).toContain('Standar Kualitas Perusahaan Hijau');

    // Tabel Utama Hasil Analisis
    expect(gdocsHtml).toContain('1. Tabel Utama Hasil Analisis');
    expect(gdocsHtml).toContain('>GHG1</th>');
    expect(gdocsHtml).toContain('>WATER1</th>');
    expect(gdocsHtml).toContain('>AKRA</td>');
    expect(gdocsHtml).toContain('>1000000 liter</td>');

    // Glosarium Indikator
    expect(gdocsHtml).toContain('2. Kamus Indikator Pengungkapan (Glosarium)');
    expect(gdocsHtml).toContain('Inventarisasi & Reduksi Emisi GRK');
    expect(gdocsHtml).toContain('Pengolahan Air Limbah');
  });

  it('generates sanitized RFC 4180 CSV string', () => {
    const csv = generateResultsCSVString(sampleOptions);
    expect(csv).toContain('Kode Emiten');
    expect(csv).toContain('GHG1');
    expect(csv).toContain('WATER1');
    expect(csv).toContain('"AKRA"');
    expect(csv).toContain('"1000000 liter"');
  });

  it('neutralizes formula injection characters (=, +, -, @) in cell values', () => {
    const maliciousOptions: ResultsExportOptions = {
      ...sampleOptions,
      rows: [
        {
          company_code: '=CMD|calc',
          fiscal_year: '+2025',
          scores: {
            GHG1: '@SUM(1,2)',
            CC1: '-100'
          },
          total_score: '2/4'
        }
      ]
    };

    const uint8 = generateResultsExcelWorkbook(maliciousOptions);
    const wb = XLSX.read(uint8, { type: 'array' });
    const ws1 = wb.Sheets['Hasil_Analisis'];
    const sheetData = XLSX.utils.sheet_to_json<any[]>(ws1, { header: 1 });
    const row = sheetData[5];

    expect(row[1]).toBe("'=CMD|calc");
    expect(row[2]).toBe("'+2025");
    expect(row[3]).toBe("'@SUM(1,2)");
    expect(row[4]).toBe("'-100");
  });
});
