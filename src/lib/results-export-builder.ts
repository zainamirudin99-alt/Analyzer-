// ============================================================
// Results Export Builder (Word .docx, Google Docs, Excel .xlsx, Google Sheets & CSV)
// Format ekspor tabel hasil analisis yang dinamis mengikuti pilihan indikator aktif:
// - Excel (.xlsx): Multi-sheet (Hasil Analisis, Kamus Indikator, Ringkasan Statistik) dengan auto-fit kolom
// - Word (.docx): Format Landscape A4/Letter dengan header styled emerald, zebra striping, dan glosarium
// - Google Docs (.docx): Format .docx standar OpenXML yang dioptimalkan untuk Google Docs
// - Spreadsheet (Google Sheets & Excel Clipboard): Format ganda HTML + TSV agar saat Ctrl+V langsung rapi
// - CSV: Format RFC 4180 dengan sanitasi formula injection
// ============================================================

import * as XLSX from 'xlsx';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
  PageOrientation,
  BorderStyle,
  VerticalAlign,
  Footer,
  PageNumber
} from 'docx';
import { sanitizeCellValue } from './file-signature';

export interface ResultsExportIndicator {
  code: string;
  title: string;
  group?: string;
  fullDesc?: string;
}

export interface ResultsExportRow {
  company_code: string;
  fiscal_year: string;
  file_name?: string;
  preset_name?: string;
  scores: Record<string, string | number>;
  total_score: number | string;
  disclosure_level?: string;
  model_used?: string;
  created_at?: string;
}

export interface ResultsExportOptions {
  presetName: string;
  presetId?: string;
  rubricType?: string;
  indicators: ResultsExportIndicator[];
  rows: ResultsExportRow[];
  stats?: {
    total: number;
    avg: string | number;
    max: number;
    min: number;
  };
  filterCode?: string;
  filterYear?: string;
  lang?: 'id' | 'en';
}

function sanitizeString(val: any): string {
  if (val === undefined || val === null) return '';
  const sanitized = sanitizeCellValue(String(val));
  return String(sanitized);
}

function cleanFilenamePart(str: string): string {
  return (str || 'Preset')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 32);
}

// ------------------------------------------------------------
// 1. GENERATOR EXCEL (.XLSX)
// ------------------------------------------------------------
export function generateResultsExcelWorkbook(options: ResultsExportOptions): Uint8Array {
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toISOString().slice(0, 10);
  const isEn = options.lang === 'en';

  // --- SHEET 1: Hasil_Analisis ---
  const sheet1Rows: any[][] = [];

  // Baris Judul & Metadata
  sheet1Rows.push([isEn ? 'ANALYSIS RESULTS REPORT' : 'LAPORAN HASIL ANALISIS PENGUNGKAPAN']);
  sheet1Rows.push([
    `${isEn ? 'Indicator Preset' : 'Standar / Pilihan Indikator'}: ${options.presetName} (${options.indicators.length} ${isEn ? 'Indicators' : 'Indikator'})`
  ]);
  sheet1Rows.push([
    `${isEn ? 'Rubric Type' : 'Jenis Rubrik'}: ${options.rubricType || '-'} | ${isEn ? 'Total Reports' : 'Total Laporan'}: ${options.rows.length} | ${isEn ? 'Average Score' : 'Rata-Rata Skor'}: ${options.stats?.avg ?? '-'} | ${isEn ? 'Export Date' : 'Tanggal Ekspor'}: ${dateStr}`
  ]);
  sheet1Rows.push([]); // Baris kosong pemisah

  // Header Tabel Kolom Dinamis
  const tableHeader = [
    'No',
    isEn ? 'Company Code' : 'Kode Emiten',
    isEn ? 'Fiscal Year' : 'Tahun Fiskal',
    ...options.indicators.map(i => i.code),
    isEn ? 'Total Score' : 'Total Skor',
    isEn ? 'Disclosure Level' : 'Tingkat Pengungkapan',
    isEn ? 'File Name' : 'Nama File',
    isEn ? 'Model Used' : 'Model AI',
    isEn ? 'Analyzed At' : 'Waktu Analisis'
  ];
  sheet1Rows.push(tableHeader);

  // Baris Data
  options.rows.forEach((r, idx) => {
    const scores = options.indicators.map(ind => {
      const val = r.scores[ind.code] ?? r.scores[ind.code.toLowerCase()] ?? '-';
      return sanitizeString(val);
    });

    const rowItem = [
      idx + 1,
      sanitizeString(r.company_code),
      sanitizeString(r.fiscal_year),
      ...scores,
      sanitizeString(r.total_score),
      sanitizeString(r.disclosure_level || '-'),
      sanitizeString(r.file_name || '-'),
      sanitizeString(r.model_used || '-'),
      sanitizeString(r.created_at || '-')
    ];
    sheet1Rows.push(rowItem);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);

  // Auto-fit kolom Sheet 1
  const colWidths1: { wch: number }[] = [];
  sheet1Rows.slice(4).forEach(row => {
    row.forEach((cell, colIdx) => {
      const len = String(cell ?? '').length;
      const current = colWidths1[colIdx]?.wch || 10;
      colWidths1[colIdx] = { wch: Math.min(48, Math.max(current, len + 3)) };
    });
  });
  // Pastikan kolom No dan Code tidak terlalu sempit
  if (colWidths1[0]) colWidths1[0].wch = Math.max(colWidths1[0].wch, 6);
  if (colWidths1[1]) colWidths1[1].wch = Math.max(colWidths1[1].wch, 14);
  if (colWidths1[2]) colWidths1[2].wch = Math.max(colWidths1[2].wch, 14);
  ws1['!cols'] = colWidths1;

  XLSX.utils.book_append_sheet(wb, ws1, isEn ? 'Analysis_Results' : 'Hasil_Analisis');

  // --- SHEET 2: Kamus_Indikator ---
  const sheet2Rows: any[][] = [];
  sheet2Rows.push([isEn ? 'INDICATORS DICTIONARY & GLOSSARY' : 'KAMUS & DAFTAR INDIKATOR PENGUNGKAPAN']);
  sheet2Rows.push([`${isEn ? 'Standard Preset' : 'Standar Preset'}: ${options.presetName} (${options.indicators.length} Indikator)`]);
  sheet2Rows.push([]);

  sheet2Rows.push([
    'No',
    isEn ? 'Indicator Code' : 'Kode Indikator',
    isEn ? 'Dimension / Group' : 'Kelompok / Dimensi',
    isEn ? 'Indicator Title' : 'Nama Indikator',
    isEn ? 'Assessment Criteria / Description' : 'Kriteria / Deskripsi Penilaian'
  ]);

  options.indicators.forEach((ind, idx) => {
    sheet2Rows.push([
      idx + 1,
      sanitizeString(ind.code),
      sanitizeString(ind.group || (isEn ? 'General' : 'Umum')),
      sanitizeString(ind.title),
      sanitizeString(ind.fullDesc || '-')
    ]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
  ws2['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 22 }, { wch: 38 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, ws2, isEn ? 'Indicators_Dictionary' : 'Kamus_Indikator');

  // --- SHEET 3: Ringkasan_Statistik ---
  const sheet3Rows: any[][] = [];
  sheet3Rows.push([isEn ? 'STATISTICAL SUMMARY & METADATA' : 'RINGKASAN STATISTIK & METADATA']);
  sheet3Rows.push([]);
  sheet3Rows.push([isEn ? 'Metric' : 'Parameter Metrik', isEn ? 'Value' : 'Nilai']);
  sheet3Rows.push([isEn ? 'Total Analyzed Reports' : 'Total Laporan Dianalisis', options.rows.length]);
  sheet3Rows.push([isEn ? 'Average Score' : 'Rata-Rata Skor', options.stats?.avg ?? '-']);
  sheet3Rows.push([isEn ? 'Highest Score' : 'Skor Tertinggi', options.stats?.max ?? '-']);
  sheet3Rows.push([isEn ? 'Lowest Score' : 'Skor Terendah', options.stats?.min ?? '-']);
  sheet3Rows.push([isEn ? 'Selected Indicator Preset' : 'Pilihan Indikator Terpilih', options.presetName]);
  sheet3Rows.push([isEn ? 'Total Indicators in Preset' : 'Jumlah Indikator dalam Preset', options.indicators.length]);
  sheet3Rows.push([isEn ? 'Rubric Assessment Type' : 'Jenis Rubrik Penilaian', options.rubricType || '-']);
  sheet3Rows.push([isEn ? 'Export Timestamp' : 'Waktu Ekspor', new Date().toLocaleString()]);

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Rows);
  ws3['!cols'] = [{ wch: 32 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, ws3, isEn ? 'Statistical_Summary' : 'Ringkasan_Statistik');

  const generated = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(generated);
}

// ------------------------------------------------------------
// 2. GENERATOR WORD (.DOCX) & GOOGLE DOCS
// ------------------------------------------------------------
export async function generateResultsDocxDocument(
  options: ResultsExportOptions,
  isGoogleDocsVariant = false
): Promise<Blob> {
  const isEn = options.lang === 'en';
  const isLandscape = options.indicators.length >= 6;
  const dateStr = new Date().toLocaleDateString(isEn ? 'en-US' : 'id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const cellBorderLight = {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' }
  };

  const cellMarginCompact = {
    top: 100,
    bottom: 100,
    left: 120,
    right: 120
  };

  // Header Baris Tabel Utama
  const mainTableHeaders = [
    'No',
    isEn ? 'Code' : 'Kode',
    isEn ? 'Years' : 'Tahun',
    ...options.indicators.map(i => i.code),
    'TOTAL',
    'Level'
  ];

  const headerCells = mainTableHeaders.map(title => {
    return new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, color: 'FFFFFF', size: 18 })],
          alignment: AlignmentType.CENTER
        })
      ],
      shading: { fill: '0F766E' }, // Teal Emerald
      verticalAlign: VerticalAlign.CENTER,
      margins: cellMarginCompact,
      borders: cellBorderLight
    });
  });

  const mainTableRows: TableRow[] = [
    new TableRow({
      children: headerCells,
      tableHeader: true
    })
  ];

  // Baris Data Tabel Utama
  options.rows.forEach((r, idx) => {
    const isZebra = idx % 2 === 1;
    const rowFill = isZebra ? 'F8FAFC' : 'FFFFFF';

    const scoreCells = options.indicators.map(ind => {
      const scoreVal = r.scores[ind.code] ?? r.scores[ind.code.toLowerCase()] ?? '-';
      return new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: String(scoreVal), size: 17 })],
            alignment: AlignmentType.CENTER
          })
        ],
        shading: { fill: rowFill },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMarginCompact,
        borders: cellBorderLight
      });
    });

    const rowCells = [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 17 })], alignment: AlignmentType.CENTER })],
        shading: { fill: rowFill },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMarginCompact,
        borders: cellBorderLight
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: r.company_code, bold: true, size: 17 })], alignment: AlignmentType.CENTER })],
        shading: { fill: rowFill },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMarginCompact,
        borders: cellBorderLight
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: r.fiscal_year, size: 17 })], alignment: AlignmentType.CENTER })],
        shading: { fill: rowFill },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMarginCompact,
        borders: cellBorderLight
      }),
      ...scoreCells,
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(r.total_score), bold: true, size: 18 })], alignment: AlignmentType.CENTER })],
        shading: { fill: rowFill },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMarginCompact,
        borders: cellBorderLight
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: r.disclosure_level || '-', size: 16 })], alignment: AlignmentType.CENTER })],
        shading: { fill: rowFill },
        verticalAlign: VerticalAlign.CENTER,
        margins: cellMarginCompact,
        borders: cellBorderLight
      })
    ];

    mainTableRows.push(new TableRow({ children: rowCells }));
  });

  // Tabel Kamus / Glosarium Indikator
  const glossaryHeaderCells = [
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: 'No', bold: true, color: 'FFFFFF', size: 18 })], alignment: AlignmentType.CENTER })],
      shading: { fill: '1E293B' },
      borders: cellBorderLight,
      margins: cellMarginCompact,
      width: { size: 6, type: WidthType.PERCENTAGE }
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: isEn ? 'Code' : 'Kode', bold: true, color: 'FFFFFF', size: 18 })], alignment: AlignmentType.CENTER })],
      shading: { fill: '1E293B' },
      borders: cellBorderLight,
      margins: cellMarginCompact,
      width: { size: 14, type: WidthType.PERCENTAGE }
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: isEn ? 'Group' : 'Kelompok', bold: true, color: 'FFFFFF', size: 18 })], alignment: AlignmentType.LEFT })],
      shading: { fill: '1E293B' },
      borders: cellBorderLight,
      margins: cellMarginCompact,
      width: { size: 22, type: WidthType.PERCENTAGE }
    }),
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: isEn ? 'Indicator Title & Description' : 'Nama & Kriteria Indikator', bold: true, color: 'FFFFFF', size: 18 })], alignment: AlignmentType.LEFT })],
      shading: { fill: '1E293B' },
      borders: cellBorderLight,
      margins: cellMarginCompact,
      width: { size: 58, type: WidthType.PERCENTAGE }
    })
  ];

  const glossaryRows: TableRow[] = [new TableRow({ children: glossaryHeaderCells, tableHeader: true })];

  options.indicators.forEach((ind, idx) => {
    const isZebra = idx % 2 === 1;
    const rowFill = isZebra ? 'F8FAFC' : 'FFFFFF';
    glossaryRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 17 })], alignment: AlignmentType.CENTER })],
            shading: { fill: rowFill },
            borders: cellBorderLight,
            margins: cellMarginCompact
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: ind.code, bold: true, size: 17 })], alignment: AlignmentType.CENTER })],
            shading: { fill: rowFill },
            borders: cellBorderLight,
            margins: cellMarginCompact
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: ind.group || (isEn ? 'General' : 'Umum'), size: 17 })] })],
            shading: { fill: rowFill },
            borders: cellBorderLight,
            margins: cellMarginCompact
          }),
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: ind.title, bold: true, size: 17 })] }),
              ...(ind.fullDesc
                ? [
                    new Paragraph({
                      children: [new TextRun({ text: ind.fullDesc, size: 15, color: '64748B' })],
                      spacing: { before: 40 }
                    })
                  ]
                : [])
            ],
            shading: { fill: rowFill },
            borders: cellBorderLight,
            margins: cellMarginCompact
          })
        ]
      })
    );
  });

  // Metadata Box
  const summaryBoxTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${isEn ? 'Standard Indicator Preset' : 'Standar Pilihan Indikator'}: `, bold: true, size: 18 }),
                  new TextRun({ text: `${options.presetName} (${options.indicators.length} ${isEn ? 'Indicators' : 'Indikator'})`, size: 18 })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `${isEn ? 'Rubric Assessment Type' : 'Jenis Rubrik Penilaian'}: `, bold: true, size: 18 }),
                  new TextRun({ text: String(options.rubricType || 'Standar'), size: 18 })
                ],
                spacing: { before: 60 }
              })
            ],
            shading: { fill: 'F0FDF4' },
            borders: cellBorderLight,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            width: { size: 50, type: WidthType.PERCENTAGE }
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${isEn ? 'Sample Count' : 'Total Laporan Dianalisis'}: `, bold: true, size: 18 }),
                  new TextRun({ text: `${options.rows.length} ${isEn ? 'Reports' : 'Entri Laporan'}`, size: 18 })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `${isEn ? 'Average Score' : 'Rata-Rata Skor'}: `, bold: true, size: 18 }),
                  new TextRun({ text: `${options.stats?.avg ?? '-'} | ${isEn ? 'Date' : 'Tanggal'}: ${dateStr}`, size: 18 })
                ],
                spacing: { before: 60 }
              })
            ],
            shading: { fill: 'F0FDF4' },
            borders: cellBorderLight,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            width: { size: 50, type: WidthType.PERCENTAGE }
          })
        ]
      })
    ]
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            },
            margin: {
              top: 720, // 0.5 inci
              right: 720,
              bottom: 720,
              left: 720
            }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `ANALYZER(?) — ${isEn ? 'AI Analysis Results Table' : 'Tabel Hasil Analisis Dokumen AI'} | ${dateStr} | ${isEn ? 'Page ' : 'Halaman '}`,
                    size: 16,
                    color: '94A3B8'
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: '94A3B8'
                  })
                ],
                alignment: AlignmentType.RIGHT
              })
            ]
          })
        },
        children: [
          new Paragraph({
            text: isEn ? 'DISCLOSURE ANALYSIS RESULTS REPORT' : 'LAPORAN HASIL ANALISIS PENGUNGKAPAN',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: isGoogleDocsVariant
                  ? (isEn ? 'Compatible for Microsoft Word & Google Docs' : 'Format Kompatibel Microsoft Word & Google Docs')
                  : 'ANALYZER(?) — AI Document & Indicator Assessment',
                color: '64748B',
                size: 19
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),

          summaryBoxTable,

          new Paragraph({
            text: isEn ? '1. Main Analysis Results Table' : '1. Tabel Utama Hasil Analisis',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 260, after: 120 }
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: mainTableRows
          }),

          new Paragraph({
            text: isEn ? '2. Indicator Glossary & Criteria' : '2. Kamus & Panduan Indikator Pengungkapan',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 320, after: 120 }
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: glossaryRows
          })
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

// ------------------------------------------------------------
// 3. GENERATOR SPREADSHEET CLIPBOARD (GOOGLE SHEETS & EXCEL)
// ------------------------------------------------------------
export function generateResultsSpreadsheetClipboard(options: ResultsExportOptions): {
  html: string;
  tsv: string;
} {
  const isEn = options.lang === 'en';

  // 1. TSV FORMAT (Fallback and standard tab-delimited paste)
  const tsvHeaders = [
    'No',
    isEn ? 'Code' : 'Kode',
    isEn ? 'Years' : 'Tahun',
    ...options.indicators.map(i => i.code),
    'TOTAL',
    'Level'
  ];

  const tsvRows = options.rows.map((r, idx) => {
    const scores = options.indicators.map(ind => r.scores[ind.code] ?? r.scores[ind.code.toLowerCase()] ?? '-');
    return [idx + 1, r.company_code, r.fiscal_year, ...scores, r.total_score, r.disclosure_level || '-'].join('\t');
  });

  const tsv = [tsvHeaders.join('\t'), ...tsvRows].join('\n');

  // 2. HTML TABLE FORMAT (With CSS styles for beautiful Google Sheets / Excel paste)
  const headerThs = tsvHeaders
    .map(
      h =>
        `<th style="background-color:#0f766e; color:#ffffff; font-weight:bold; padding:8px 12px; border:1px solid #cbd5e1; text-align:center;">${h}</th>`
    )
    .join('');

  const bodyTrs = options.rows
    .map((r, idx) => {
      const isZebra = idx % 2 === 1;
      const bg = isZebra ? '#f8fafc' : '#ffffff';
      const scores = options.indicators
        .map(
          ind =>
            `<td style="padding:6px 10px; border:1px solid #cbd5e1; text-align:center;">${
              r.scores[ind.code] ?? r.scores[ind.code.toLowerCase()] ?? '-'
            }</td>`
        )
        .join('');

      return `<tr style="background-color:${bg};">
        <td style="padding:6px 10px; border:1px solid #cbd5e1; text-align:center;">${idx + 1}</td>
        <td style="padding:6px 10px; border:1px solid #cbd5e1; text-align:center; font-weight:bold;">${r.company_code}</td>
        <td style="padding:6px 10px; border:1px solid #cbd5e1; text-align:center;">${r.fiscal_year}</td>
        ${scores}
        <td style="padding:6px 10px; border:1px solid #cbd5e1; text-align:center; font-weight:bold; color:#0f766e;">${r.total_score}</td>
        <td style="padding:6px 10px; border:1px solid #cbd5e1; text-align:center;">${r.disclosure_level || '-'}</td>
      </tr>`;
    })
    .join('');

  const html = `<meta charset="utf-8">
<table border="1" style="border-collapse:collapse; font-family:Arial, Calibri, sans-serif; font-size:10pt;">
  <thead>
    <tr>${headerThs}</tr>
  </thead>
  <tbody>
    ${bodyTrs}
  </tbody>
</table>`;

  return { html, tsv };
}

// ------------------------------------------------------------
// 4. GENERATOR CSV FORMAT
// ------------------------------------------------------------
export function generateResultsCSVString(options: ResultsExportOptions): string {
  const isEn = options.lang === 'en';
  const headers = [
    'No',
    isEn ? 'Company Code' : 'Kode Emiten',
    isEn ? 'Fiscal Year' : 'Tahun Fiskal',
    isEn ? 'Preset Name' : 'Nama Preset',
    ...options.indicators.map(i => i.code),
    isEn ? 'Total Score' : 'Total Skor',
    isEn ? 'Disclosure Level' : 'Tingkat Pengungkapan',
    isEn ? 'File Name' : 'Nama File',
    isEn ? 'Model Used' : 'Model AI',
    isEn ? 'Analyzed At' : 'Waktu Analisis'
  ];

  const rows = options.rows.map((r, idx) => {
    const scores = options.indicators.map(ind => {
      const val = r.scores[ind.code] ?? r.scores[ind.code.toLowerCase()] ?? '-';
      return `"${sanitizeString(val).replace(/"/g, '""')}"`;
    });

    return [
      idx + 1,
      `"${sanitizeString(r.company_code).replace(/"/g, '""')}"`,
      `"${sanitizeString(r.fiscal_year).replace(/"/g, '""')}"`,
      `"${sanitizeString(r.preset_name || options.presetName).replace(/"/g, '""')}"`,
      ...scores,
      `"${sanitizeString(r.total_score).replace(/"/g, '""')}"`,
      `"${sanitizeString(r.disclosure_level || '-').replace(/"/g, '""')}"`,
      `"${sanitizeString(r.file_name || '-').replace(/"/g, '""')}"`,
      `"${sanitizeString(r.model_used || '-').replace(/"/g, '""')}"`,
      `"${sanitizeString(r.created_at || '-').replace(/"/g, '""')}"`
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ------------------------------------------------------------
// 5. CLIENT-SIDE TRIGGER & ACTION HELPERS
// ------------------------------------------------------------
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportResultsToExcelFile(options: ResultsExportOptions, filename?: string): void {
  const uint8 = generateResultsExcelWorkbook(options);
  const blob = new Blob([uint8], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const defaultName = `Hasil_Analisis_${cleanFilenamePart(options.presetName)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  downloadBlob(blob, filename || defaultName);
}

export async function exportResultsToDocxFile(
  options: ResultsExportOptions,
  isGoogleDocsVariant = false,
  filename?: string
): Promise<void> {
  const blob = await generateResultsDocxDocument(options, isGoogleDocsVariant);
  const prefix = isGoogleDocsVariant ? 'GoogleDocs_Hasil_Analisis' : 'Word_Hasil_Analisis';
  const defaultName = `${prefix}_${cleanFilenamePart(options.presetName)}_${new Date().toISOString().slice(0, 10)}.docx`;
  downloadBlob(blob, filename || defaultName);
}

export function exportResultsToCSVFile(options: ResultsExportOptions, filename?: string): void {
  const csvContent = generateResultsCSVString(options);
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const defaultName = `Hasil_Analisis_${cleanFilenamePart(options.presetName)}_${new Date().toISOString().slice(0, 10)}.csv`;
  downloadBlob(blob, filename || defaultName);
}

export async function copyResultsToSpreadsheetClipboard(options: ResultsExportOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const { html, tsv } = generateResultsSpreadsheetClipboard(options);

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const textBlob = new Blob([tsv], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]);
      return true;
    }
  } catch (err) {
    console.warn('ClipboardItem rich HTML copy fallback:', err);
  }

  // Fallback ke writeText TSV
  try {
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

