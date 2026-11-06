// ============================================================
// Indicator Importer & Template Generator (Excel, Word, Sheets, Docs)
// Supports: .xlsx, .xls, .csv, .docx, Google Sheets, Google Docs & Pasted Text
// ============================================================

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType, HeadingLevel } from 'docx';
import { IndicatorItem } from './types';

export interface ParsedIndicatorResult {
  indicators: IndicatorItem[];
  sourceName?: string;
  warning?: string;
}

// Kolom alias untuk deteksi fleksibel
const CODE_ALIASES = ['kode', 'code', 'id', 'kode indikator', 'indicator code', 'no', 'singkatan', 'tag'];
const GROUP_ALIASES = ['kelompok', 'group', 'kategori', 'category', 'dimensi', 'aspek', 'pilar', 'kluster'];
const TITLE_ALIASES = ['judul', 'title', 'nama', 'name', 'indikator', 'indicator', 'nama indikator', 'indicator name'];
const DESC_ALIASES = ['deskripsi', 'description', 'desc', 'kriteria', 'penjelasan', 'keterangan', 'kriteria penilaian', 'full description'];

function matchAlias(header: string, aliases: string[]): boolean {
  const clean = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  return aliases.some(alias => {
    const cleanAlias = alias.replace(/[^a-z0-9]/g, '');
    return clean === cleanAlias || clean.includes(cleanAlias) || cleanAlias.includes(clean);
  });
}

function normalizeIndicatorItem(
  code: string,
  group: string,
  title: string,
  desc: string,
  idx: number
): IndicatorItem | null {
  const cleanCode = (code || `IND${idx + 1}`).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cleanTitle = (title || cleanCode).trim();
  const cleanGroup = (group || 'Umum').trim();
  const cleanDesc = (desc || '').trim();

  if (!cleanTitle && !cleanCode) return null;

  return {
    id: cleanCode.toLowerCase() || `ind_${idx + 1}`,
    code: cleanCode || `IND${idx + 1}`,
    title: cleanTitle,
    fullDesc: cleanDesc,
    group: cleanGroup,
    title_id: cleanTitle,
    fullDesc_id: cleanDesc,
    group_id: cleanGroup
  };
}

/**
 * 1. Parser Berkas Spreadsheet (Excel .xlsx, .xls, .csv)
 */
export function parseExcelBuffer(buffer: ArrayBuffer | Uint8Array): ParsedIndicatorResult {
  try {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { indicators: [], warning: 'Lembar kerja (sheet) tidak ditemukan pada berkas Excel.' };

    const sheet = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    if (!rawRows || rawRows.length === 0) {
      return { indicators: [], warning: 'Lembar kerja kosong.' };
    }

    // Cari baris header
    let headerRowIdx = -1;
    let codeCol = -1;
    let groupCol = -1;
    let titleCol = -1;
    let descCol = -1;

    for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;

      let foundMatches = 0;
      let curCode = -1, curGroup = -1, curTitle = -1, curDesc = -1;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (!val) continue;

        if (curCode === -1 && matchAlias(val, CODE_ALIASES)) {
          curCode = c;
          foundMatches++;
        } else if (curGroup === -1 && matchAlias(val, GROUP_ALIASES)) {
          curGroup = c;
          foundMatches++;
        } else if (curTitle === -1 && matchAlias(val, TITLE_ALIASES)) {
          curTitle = c;
          foundMatches++;
        } else if (curDesc === -1 && matchAlias(val, DESC_ALIASES)) {
          curDesc = c;
          foundMatches++;
        }
      }

      if (foundMatches >= 2 || (curCode !== -1 && curTitle !== -1)) {
        headerRowIdx = r;
        codeCol = curCode;
        groupCol = curGroup;
        titleCol = curTitle;
        descCol = curDesc;
        break;
      }
    }

    // Fallback jika tidak ada header terdeteksi
    if (headerRowIdx === -1) {
      headerRowIdx = 0;
      codeCol = 0;
      groupCol = 1;
      titleCol = 2;
      descCol = 3;
    }

    const items: IndicatorItem[] = [];
    for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const codeVal = codeCol !== -1 ? String(row[codeCol] || '') : '';
      const groupVal = groupCol !== -1 ? String(row[groupCol] || '') : '';
      const titleVal = titleCol !== -1 ? String(row[titleCol] || '') : '';
      const descVal = descCol !== -1 ? String(row[descCol] || '') : '';

      // Abaikan baris kosong
      if (!codeVal.trim() && !titleVal.trim()) continue;

      const item = normalizeIndicatorItem(codeVal, groupVal, titleVal, descVal, items.length);
      if (item) items.push(item);
    }

    return { indicators: items };
  } catch (err: any) {
    return { indicators: [], warning: `Gagal membaca Excel: ${err?.message || 'Format tidak valid'}` };
  }
}

/**
 * 2. Parser Berkas Microsoft Word (.docx)
 */
export async function parseDocxBuffer(buffer: ArrayBuffer | Uint8Array): Promise<ParsedIndicatorResult> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      return { indicators: [], warning: 'Format berkas Word (.docx) tidak valid (word/document.xml tidak ditemukan).' };
    }

    const docXml = await docXmlFile.async('text');
    const items: IndicatorItem[] = [];

    // Coba ekstrak tabel dari dokumen Word terlebih dahulu
    const tableRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    const tables = docXml.match(tableRegex);

    if (tables && tables.length > 0) {
      for (const tbl of tables) {
        const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
        const rows = tbl.match(rowRegex) || [];

        for (let rIdx = 1; rIdx < rows.length; rIdx++) {
          const rowXml = rows[rIdx];
          const cellRegex = /<w:tc[\s\S]*?<\/w:tc>/g;
          const cells = rowXml.match(cellRegex) || [];

          const cellTexts = cells.map(cell => {
            return cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          });

          if (cellTexts.length >= 2) {
            const code = cellTexts[0] || '';
            const group = cellTexts.length >= 4 ? cellTexts[1] : 'Umum';
            const title = cellTexts.length >= 4 ? cellTexts[2] : cellTexts[1];
            const desc = cellTexts.length >= 4 ? cellTexts[3] : cellTexts[2] || '';

            const item = normalizeIndicatorItem(code, group, title, desc, items.length);
            if (item) items.push(item);
          }
        }
      }
    }

    // Jika tabel tidak menghasilkan indikator, coba ekstrak paragraf
    if (items.length === 0) {
      const pRegex = /<w:p[\s\S]*?<\/w:p>/g;
      const paragraphs = docXml.match(pRegex) || [];
      const lines: string[] = [];

      for (const p of paragraphs) {
        const line = p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (line) lines.push(line);
      }

      const parsedFromText = parseRawText(lines.join('\n'));
      return { indicators: parsedFromText };
    }

    return { indicators: items };
  } catch (err: any) {
    return { indicators: [], warning: `Gagal membaca Word (.docx): ${err?.message || 'Format tidak valid'}` };
  }
}

/**
 * 3. Parser Teks Mentah (Paste dari Clipboard, Google Docs, atau CSV)
 */
export function parseRawText(rawText: string): IndicatorItem[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: IndicatorItem[] = [];

  let headerDetected = false;
  let codeCol = 0;
  let titleCol = 1;
  let groupCol = 2;
  let descCol = 3;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Cek format Tab-Separated atau Pipe
    const delimiter = line.includes('\t') ? '\t' : line.includes('|') ? '|' : null;
    if (delimiter) {
      const parts = line.split(delimiter).map(p => p.trim());
      if (parts.length >= 2) {
        // Cek apakah ini baris header
        if (!headerDetected && (matchAlias(parts[0], CODE_ALIASES) || matchAlias(parts[1], TITLE_ALIASES))) {
          headerDetected = true;
          for (let c = 0; c < parts.length; c++) {
            if (matchAlias(parts[c], CODE_ALIASES)) codeCol = c;
            else if (matchAlias(parts[c], TITLE_ALIASES)) titleCol = c;
            else if (matchAlias(parts[c], GROUP_ALIASES)) groupCol = c;
            else if (matchAlias(parts[c], DESC_ALIASES)) descCol = c;
          }
          continue;
        }

        const code = parts[codeCol] || parts[0];
        let title = parts[titleCol] || (parts.length >= 2 ? parts[1] : code);
        let group = parts[groupCol] || (parts.length >= 3 ? parts[2] : 'Umum');
        let desc = parts[descCol] || (parts.length >= 4 ? parts[3] : '');

        // Heuristik fallback jika tanpa header dan posisi 1 dan 2 terbalik (Kelompok vs Judul)
        if (!headerDetected && parts.length >= 4) {
          // Jika kolom 1 sangat singkat (< 18 char) dan kolom 2 adalah kalimat judul yang lebih panjang
          if (parts[1].length > 0 && parts[2].length > 0) {
            title = parts[1];
            group = parts[2];
            desc = parts[3];
          }
        }

        const item = normalizeIndicatorItem(code, group, title, desc, items.length);
        if (item) items.push(item);
        continue;
      }
    }

    // Cek format Titik Dua / Dash: "1. CC1 - Judul: Deskripsi" atau "CC1: Judul"
    const matchColon = line.match(/^(?:(?:\d+[\.\)]|\-)\s*)?([A-Za-z0-9_-]{2,10})\s*[-–:]\s*([^:–-]+)(?:[-–:]\s*([^:–-]+))?(?:[-–:]\s*(.+))?$/);
    if (matchColon) {
      const code = matchColon[1];
      const title = matchColon[2];
      const group = matchColon[3] || 'Umum';
      const desc = matchColon[4] || '';
      const item = normalizeIndicatorItem(code, group, title, desc, items.length);
      if (item) items.push(item);
      continue;
    }
  }

  return items;
}

/**
 * 4. Generator Template Excel (.xlsx) Siap Pakai
 */
export function generateExcelTemplate(): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Template_Indikator
  const header = ['Kode', 'Kelompok', 'Judul', 'Deskripsi_Kriteria'];
  const sampleData = [
    header,
    ['CC1', 'Climate Change', 'Penilaian & Aksi Risiko Iklim', 'Penilaian risiko regulasi atau fisik terkait iklim dan strategi mitigasinya.'],
    ['CC2', 'Climate Change', 'Peluang Bisnis & Finansial Iklim', 'Deskripsi implikasi finansial positif dan peluang transisi ekonomi hijau.'],
    ['GHG1', 'Greenhouse Gas', 'Metodologi Perhitungan GRK', 'Standar dan metodologi kalkulasi emisi GRK (GHG Protocol atau ISO 14064).'],
    ['WATER1', 'Environmental', 'Konsumsi & Efisiensi Air', 'Kuantifikasi total volume air yang diambil dan inisiatif efisiensi daur ulang.'],
    ['GOV1', 'Governance', 'Komite Keberlanjutan Dewan', 'Indikasi keberadaan komite ESG / dewan yang mengawasi target keberlanjutan.']
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 35 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Template_Indikator');

  // Sheet 2: Panduan_Pengisian
  const guideData = [
    ['PANDUAN PENGISIAN TEMPLATE INDIKATOR'],
    ['1. Kolom Kode: Kode singkatan kapital tanpa spasi (contoh: CC1, GHG2, WATER1, BIODIV).'],
    ['2. Kolom Kelompok: Kategori pengelompokan indikator (contoh: Climate, Environmental, Social, Governance).'],
    ['3. Kolom Judul: Nama ringkas dan jelas dari indikator yang dievaluasi.'],
    ['4. Kolom Deskripsi_Kriteria: Penjelasan mengenai bukti atau kriteria pengungkapan dalam laporan perusahaan.'],
    ['5. Simpan file ini dalam format .xlsx lalu unggah kembali melalui menu Import Indikator.']
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan');

  const generated = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(generated);
}

/**
 * 5. Generator Template Word (.docx) Siap Pakai
 */
export async function generateDocxTemplate(): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'TEMPLATE IMPORT INDIKATOR ANALYZER',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER
          }),
          new Paragraph({
            text: 'Panduan: Isi tabel di bawah dengan indikator yang ingin Anda impor. Pastikan kolom Kode, Kelompok, Judul, dan Kriteria terisi dengan baik.',
            spacing: { before: 200, after: 300 }
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Kode', bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Kelompok', bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Judul Indikator', bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Kriteria / Deskripsi Penilaian', bold: true })] })] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('CC1')] }),
                  new TableCell({ children: [new Paragraph('Climate Change')] }),
                  new TableCell({ children: [new Paragraph('Penilaian Risiko Perubahan Iklim')] }),
                  new TableCell({ children: [new Paragraph('Penilaian risiko regulasi atau fisik iklim dan mitigasinya.')] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('GHG1')] }),
                  new TableCell({ children: [new Paragraph('Greenhouse Gas')] }),
                  new TableCell({ children: [new Paragraph('Metodologi Perhitungan GRK')] }),
                  new TableCell({ children: [new Paragraph('Deskripsi standar metodologi kalkulasi emisi GRK.')] })
                ]
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('WATER1')] }),
                  new TableCell({ children: [new Paragraph('Environmental')] }),
                  new TableCell({ children: [new Paragraph('Efisiensi Penggunaan Air')] }),
                  new TableCell({ children: [new Paragraph('Kuantifikasi konsumsi air dan rasio daur ulang air operasional.')] })
                ]
              })
            ]
          })
        ]
      }
    ]
  });

  return await Packer.toBlob(doc);
}
