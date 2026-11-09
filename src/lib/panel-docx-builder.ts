// ============================================================
// Panel Regression Word (.docx) Document Builder (Standar APA / Stata 18)
// Menghasilkan dokumen Word ekonometrika data panel lengkap dengan:
// - Margin standar 1 inci (1440 twips), cell padding rapi, & angka rata kanan
// - Tabel 1.1: Identitas & Deklarasi Struktur Data Panel (xtset)
// - Tabel 2.1: Perbandingan Estimasi Tiga Model Panel (CEM, FEM, dan REM)
// - Tabel 3.1: Pengujian Spesifikasi Pemilihan Model (Chow, Hausman, Mundlak, BP-LM)
// - Tabel 4.1: Estimasi Model Akhir Terpilih (Cluster-Robust SE vce(robust))
// - Tabel 4.2: Interpretasi Efek Marginal & Signifikansi Variabel Prediktor
// - Tabel 5.1 & 5.2: Diagnostik Asumsi Klasik Data Panel & Rincian VIF
// - Bagian 6: Rincian 13 Langkah Alur Ekonometrika Gaya Stata (Kotak Konsol Monospace Presisi)
// ============================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  ShadingType
} from 'docx';
import { PanelFitResult } from './panel-types';

export interface PanelDocxOptions {
  fitResult: PanelFitResult;
  datasetName?: string;
}

const FONT_FAMILY = 'Calibri';
const MONO_FONT = 'Consolas';

const CELL_PADDING = {
  top: 80,
  bottom: 80,
  left: 120,
  right: 120
};

function fmtNum(val: number | undefined | null, digits = 4): string {
  if (val === undefined || val === null || isNaN(val)) return '-';
  return val.toFixed(digits);
}

function fmtSig(p: number | undefined | null): string {
  if (p === undefined || p === null || isNaN(p)) return '-';
  if (p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}

function sigStars(p: number | undefined | null): string {
  if (p === undefined || p === null || isNaN(p)) return '';
  if (p < 0.01) return '***';
  if (p < 0.05) return '**';
  if (p < 0.1) return '*';
  return '';
}

function createApaCell(
  text: string,
  options: {
    bold?: boolean;
    italic?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    topBorder?: boolean;
    bottomBorder?: boolean;
    bottomDouble?: boolean;
    lightBottom?: boolean;
    headerShading?: boolean;
    subtleShading?: boolean;
    color?: string;
    widthPct?: number;
    fontSize?: number;
    mono?: boolean;
  } = {}
): TableCell {
  const lines = String(text ?? '-').split(/\r?\n/);

  return new TableCell({
    width: options.widthPct ? { size: options.widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: CELL_PADDING,
    shading: options.headerShading
      ? { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' }
      : options.subtleShading
      ? { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' }
      : undefined,
    borders: {
      top: options.topBorder
        ? { style: BorderStyle.SINGLE, size: 12, color: '0F172A' }
        : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: options.bottomDouble
        ? { style: BorderStyle.DOUBLE, size: 12, color: '0F172A' }
        : options.bottomBorder
        ? { style: BorderStyle.SINGLE, size: 8, color: '334155' }
        : options.lightBottom
        ? { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
        : { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
    },
    children: lines.map(
      (line, idx) =>
        new Paragraph({
          alignment: options.align || AlignmentType.LEFT,
          spacing: { before: idx === 0 ? 20 : 10, after: idx === lines.length - 1 ? 20 : 10, line: 260 },
          children: [
            new TextRun({
              text: line,
              bold: options.bold,
              italics: options.italic,
              font: options.mono ? MONO_FONT : FONT_FAMILY,
              size: options.fontSize || 19,
              color: options.color || (options.headerShading ? '0F172A' : '1E293B')
            })
          ]
        })
    )
  });
}

function createSectionHeading(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '0F766E' }
    },
    children: [
      new TextRun({
        text: title,
        bold: true,
        font: FONT_FAMILY,
        size: 24,
        color: '0F172A'
      })
    ]
  });
}

function createTableCaption(tableNum: string, title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text: `${tableNum}  `,
        bold: true,
        font: FONT_FAMILY,
        size: 20,
        color: '0F766E'
      }),
      new TextRun({
        text: title,
        bold: true,
        italics: true,
        font: FONT_FAMILY,
        size: 20,
        color: '0F172A'
      })
    ]
  });
}

function createTableFootnote(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 180 },
    children: [
      new TextRun({
        text: 'Catatan: ',
        bold: true,
        italics: true,
        font: FONT_FAMILY,
        size: 17,
        color: '475569'
      }),
      new TextRun({
        text,
        italics: true,
        font: FONT_FAMILY,
        size: 17,
        color: '475569'
      })
    ]
  });
}

/**
 * Mengubah kotak teks konsol Stata multi-baris menjadi Tabel 1-Sel Monospace
 * dengan pelestarian spasi (\u00A0) agar kolom tabel ASCII Stata sejajar vertikal 100% di MS Word
 */
function createStataTerminalBox(
  titleLabel: string,
  codeOrOutputText: string,
  isCommandBox = false
): Table {
  const rawLines = String(codeOrOutputText || '').split(/\r?\n/);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        cantSplit: !isCommandBox && rawLines.length <= 28,
        children: [
          new TableCell({
            margins: { top: 90, bottom: 90, left: 140, right: 140 },
            shading: {
              type: ShadingType.CLEAR,
              fill: isCommandBox ? 'F0FDFA' : 'F8FAFC',
              color: 'auto'
            },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: isCommandBox ? '99F6E4' : 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: isCommandBox ? '99F6E4' : 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 18, color: isCommandBox ? '0D9488' : '334155' },
              right: { style: BorderStyle.SINGLE, size: 4, color: isCommandBox ? '99F6E4' : 'CBD5E1' }
            },
            children: [
              new Paragraph({
                spacing: { before: 0, after: 40 },
                children: [
                  new TextRun({
                    text: titleLabel,
                    bold: true,
                    font: FONT_FAMILY,
                    size: 17,
                    color: isCommandBox ? '0F766E' : '334155'
                  })
                ]
              }),
              ...rawLines.map(line => {
                // Ganti spasi biasa dengan non-breaking space (\u00A0) agar MS Word tidak memangkas spasi perataan kolom Stata
                const preservedLine = (line || ' ').replace(/ /g, '\u00A0');
                return new Paragraph({
                  spacing: { before: 0, after: 0, line: 220 },
                  children: [
                    new TextRun({
                      text: preservedLine,
                      font: MONO_FONT,
                      size: isCommandBox ? 17 : 15, // 7.5pt untuk tabel ASCII Stata agar muat 80-95 karakter per baris tanpa terpotong
                      bold: isCommandBox,
                      color: isCommandBox ? '0F172A' : '1E293B'
                    })
                  ]
                });
              })
            ]
          })
        ]
      })
    ]
  });
}

export async function generatePanelDocx(options: PanelDocxOptions): Promise<Buffer> {
  const { fitResult, datasetName = 'Dataset_Panel.xlsx' } = options;
  const { declaration, models, selection, finalModel, assumptions, easyInterpretation, consoleBlocks } = fitResult;

  const children: (Paragraph | Table)[] = [];

  const modelFullName =
    selection.selectedModel === 'FEM'
      ? 'Fixed Effects Model (FEM — Within Estimator)'
      : selection.selectedModel === 'REM'
      ? 'Random Effects Model (REM — Swamy-Arora GLS)'
      : 'Common Effect Model (CEM — Pooled OLS)';

  // ==========================================================
  // HEADER DOKUMEN AKADEMIK
  // ==========================================================
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: 'LAPORAN ANALISIS EKONOMETRIKA REGRESI DATA PANEL (STANDAR STATA 18 / APA)',
          bold: true,
          font: FONT_FAMILY,
          size: 28,
          color: '0F172A'
        })
      ]
    }),
    new Paragraph({
      spacing: { before: 0, after: 140 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: '0F766E' }
      },
      children: [
        new TextRun({
          text: `Berkas: ${datasetName} • Model Terpilih: `,
          font: FONT_FAMILY,
          size: 19,
          color: '475569'
        }),
        new TextRun({
          text: modelFullName,
          bold: true,
          font: FONT_FAMILY,
          size: 19,
          color: '0F766E'
        }),
        new TextRun({
          text: ` • Dicetak: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
          font: FONT_FAMILY,
          size: 19,
          color: '475569'
        })
      ]
    })
  );

  // ==========================================================
  // BAGIAN 1: IDENTITAS & STRUKTUR DATA PANEL (XTSET)
  // ==========================================================
  children.push(createSectionHeading('1. Identitas & Deklarasi Struktur Data Panel (xtset)'));
  children.push(createTableCaption('Tabel 1.1', 'Parameter Dimensi & Keseimbangan Struktur Data Panel'));

  const activeY = fitResult.activeYCol || 'Y';
  const finalX = fitResult.finalActiveXCols || fitResult.initialActiveXCols || [];

  const metaRows: [string, string][] = [
    ['Nama Berkas Dataset', datasetName],
    ['Jumlah Entitas Cross-Section (N)', `${declaration.entityCount} Entitas / Perusahaan`],
    ['Rentang & Jumlah Periode Waktu (T)', `${declaration.timeCount} Periode (${declaration.timeSpan.min} s/d ${declaration.timeSpan.max}) — T min = ${declaration.tMin}, T avg = ${declaration.tAvg}, T max = ${declaration.tMax}`],
    ['Total Observasi Panel (N × T)', `${declaration.totalObs} Observasi Valid`],
    ['Status Keseimbangan Panel', declaration.isBalanced ? 'Strongly Balanced (Seluruh entitas memiliki periode waktu lengkap)' : 'Unbalanced Panel (Jumlah periode bervariasi antar-entitas)'],
    ['Variabel Dependen Aktif (Y)', activeY],
    ['Variabel Independen Aktif (X)', finalX.join(', ')],
    ['Model Ekonometrika Terpilih', modelFullName],
    ['Koreksi Matriks Kovarians (VCE)', 'Cluster-Robust Standard Errors pada Level Entitas — vce(robust) (Arellano, 1987)']
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createApaCell('Parameter Struktur Panel', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 36 }),
            createApaCell('Spesifikasi & Keterangan', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 64 })
          ]
        }),
        ...metaRows.map(([k, v], idx) => {
          const isLast = idx === metaRows.length - 1;
          return new TableRow({
            cantSplit: true,
            children: [
              createApaCell(k, { bold: true, bottomDouble: isLast, lightBottom: !isLast, subtleShading: idx % 2 === 1, widthPct: 36 }),
              createApaCell(v, { bottomDouble: isLast, lightBottom: !isLast, subtleShading: idx % 2 === 1, widthPct: 64 })
            ]
          });
        })
      ]
    })
  );

  // ==========================================================
  // BAGIAN 2: PERBANDINGAN ESTIMASI TIGA MODEL AWAL (CEM, FEM, REM)
  // ==========================================================
  if (models?.cem && models?.fem && models?.rem) {
    children.push(createSectionHeading('2. Perbandingan Estimasi Tiga Model Panel (CEM, FEM, dan REM)'));
    children.push(createTableCaption('Tabel 2.1', 'Perbandingan Koefisien Regresi & Statistik Kebaikan Suai (CEM vs FEM vs REM)'));

    const allVarNames = Array.from(
      new Set([
        ...Object.keys(models.cem.coefficients),
        ...Object.keys(models.fem.coefficients),
        ...Object.keys(models.rem.coefficients)
      ])
    );

    const fmtModelCell = (mod: typeof models.cem, vName: string) => {
      const c = mod.coefficients[vName];
      if (!c || c.isOmitted) return '(omitted)';
      return `${fmtNum(c.b, 4)}${sigStars(c.sig)}\n(${fmtNum(c.stdError, 4)})`;
    };

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
              createApaCell('Variabel / Statistik', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 28 }),
              createApaCell('Common Effect (CEM)\nPooled OLS (b / SE)', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 24 }),
              createApaCell('Fixed Effects (FEM)\nWithin FE (b / SE)', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 24 }),
              createApaCell('Random Effects (REM)\nGLS RE (b / SE)', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 24 })
            ]
          }),
          ...allVarNames.map(vName =>
            new TableRow({
              cantSplit: true,
              children: [
                createApaCell(vName === '_cons' ? '_cons (Konstanta)' : vName, { bold: vName !== '_cons', lightBottom: true, widthPct: 28 }),
                createApaCell(fmtModelCell(models.cem, vName), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 24 }),
                createApaCell(fmtModelCell(models.fem, vName), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 24 }),
                createApaCell(fmtModelCell(models.rem, vName), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 24 })
              ]
            })
          ),
          new TableRow({
            cantSplit: true,
            children: [
              createApaCell('R-Squared (Within)', { bold: true, lightBottom: true, subtleShading: true, widthPct: 28 }),
              createApaCell(fmtNum(models.cem.r2.within, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 }),
              createApaCell(fmtNum(models.fem.r2.within, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 }),
              createApaCell(fmtNum(models.rem.r2.within, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 })
            ]
          }),
          new TableRow({
            cantSplit: true,
            children: [
              createApaCell('R-Squared (Between)', { bold: true, lightBottom: true, subtleShading: true, widthPct: 28 }),
              createApaCell(fmtNum(models.cem.r2.between, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 }),
              createApaCell(fmtNum(models.fem.r2.between, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 }),
              createApaCell(fmtNum(models.rem.r2.between, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 })
            ]
          }),
          new TableRow({
            cantSplit: true,
            children: [
              createApaCell('R-Squared (Overall)', { bold: true, lightBottom: true, subtleShading: true, widthPct: 28 }),
              createApaCell(fmtNum(models.cem.r2.overall, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 }),
              createApaCell(fmtNum(models.fem.r2.overall, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 }),
              createApaCell(fmtNum(models.rem.r2.overall, 4), { align: AlignmentType.RIGHT, lightBottom: true, subtleShading: true, widthPct: 24 })
            ]
          }),
          new TableRow({
            cantSplit: true,
            children: [
              createApaCell('Uji Simultan (F / Wald χ²)', { bold: true, bottomDouble: true, subtleShading: true, widthPct: 28 }),
              createApaCell(`F = ${fmtNum(models.cem.fStat, 2)} (p = ${fmtSig(models.cem.fPValue)})`, { align: AlignmentType.RIGHT, bottomDouble: true, subtleShading: true, widthPct: 24 }),
              createApaCell(`F = ${fmtNum(models.fem.fStat, 2)} (p = ${fmtSig(models.fem.fPValue)})`, { align: AlignmentType.RIGHT, bottomDouble: true, subtleShading: true, widthPct: 24 }),
              createApaCell(`χ² = ${fmtNum(models.rem.waldChi2, 2)} (p = ${fmtSig(models.rem.waldPValue)})`, { align: AlignmentType.RIGHT, bottomDouble: true, subtleShading: true, widthPct: 24 })
            ]
          })
        ]
      })
    );
    children.push(createTableFootnote('Angka di dalam tanda kurung ( ) adalah Standard Error. Signifikansi: *** p < 0.01, ** p < 0.05, * p < 0.10.'));
  }

  // ==========================================================
  // BAGIAN 3: PENGUJIAN SPESIFIKASI & PEMILIHAN MODEL PANEL
  // ==========================================================
  children.push(createSectionHeading('3. Pengujian Spesifikasi & Pemilihan Model Panel'));
  children.push(createTableCaption('Tabel 3.1', 'Hasil Uji Spesifikasi Pemilihan Model (Uji Chow, Uji Hausman, & Uji Breusch-Pagan LM)'));

  const specTestRows = [
    {
      name: '1. Uji Chow (F-Test / LSDV Dummy)',
      pair: 'CEM vs FEM',
      h0: 'H₀: Common Effect Model (Intersep sama untuk seluruh entitas)',
      stat: `F = ${fmtNum(selection.chow.stat, 2)}`,
      df: `(${selection.chow.df1}, ${selection.chow.df2})`,
      p: fmtSig(selection.chow.p),
      decision: `${selection.chow.p < 0.05 ? 'Tolak H₀' : 'Gagal Tolak H₀'} → Pilih ${selection.chow.preferred}`
    },
    {
      name: '2. Uji Spesifikasi Hausman',
      pair: 'FEM vs REM',
      h0: 'H₀: Random Effects Model konsisten (corr(uᵢ, Xᵢₜ) = 0)',
      stat: `χ² = ${fmtNum(selection.hausman.chi2, 2)}`,
      df: `${selection.hausman.df}`,
      p: fmtSig(selection.hausman.p),
      decision: `${selection.hausman.p < 0.05 ? 'Tolak H₀' : 'Gagal Tolak H₀'} → Pilih ${selection.hausman.preferred}`
    },
    ...(selection.hausman.isNegativeChi2 && selection.mundlakCRE
      ? [
          {
            name: '2b. Uji Mundlak CRE (Auxiliary)',
            pair: 'FEM vs REM (Non-PSD)',
            h0: 'H₀: Koefisien rata-rata grup X̄ᵢ = 0 (REM valid)',
            stat: `Wald χ² = ${fmtNum(selection.mundlakCRE.waldChi2, 2)}`,
            df: `${selection.mundlakCRE.df}`,
            p: fmtSig(selection.mundlakCRE.p),
            decision: `${selection.mundlakCRE.p < 0.05 ? 'Tolak H₀' : 'Gagal Tolak H₀'} → Pilih ${selection.mundlakCRE.preferred}`
          }
        ]
      : []),
    {
      name: '3. Uji Breusch-Pagan LM (xttest0)',
      pair: 'CEM vs REM',
      h0: 'H₀: Tidak ada efek acak individu (Var(uᵢ) = 0 → CEM)',
      stat: `chibar² = ${fmtNum(selection.breuschPaganLM.chibar2, 2)}`,
      df: `${selection.breuschPaganLM.df}`,
      p: fmtSig(selection.breuschPaganLM.p),
      decision: `${selection.breuschPaganLM.p < 0.05 ? 'Tolak H₀' : 'Gagal Tolak H₀'} → Pilih ${selection.breuschPaganLM.preferred}`
    }
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createApaCell('Pengujian Spesifikasi', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 24 }),
            createApaCell('Hipotesis Nol (H₀)', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 28 }),
            createApaCell('Statistik Uji', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 14 }),
            createApaCell('df', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 8 }),
            createApaCell('p-value', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
            createApaCell('Keputusan', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 16 })
          ]
        }),
        ...specTestRows.map((row, idx) => {
          const isLast = idx === specTestRows.length - 1;
          return new TableRow({
            cantSplit: true,
            children: [
              createApaCell(`${row.name}\n(${row.pair})`, { bold: true, bottomDouble: isLast, lightBottom: !isLast, widthPct: 24 }),
              createApaCell(row.h0, { bottomDouble: isLast, lightBottom: !isLast, widthPct: 28 }),
              createApaCell(row.stat, { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 14 }),
              createApaCell(row.df, { align: AlignmentType.CENTER, bottomDouble: isLast, lightBottom: !isLast, widthPct: 8 }),
              createApaCell(row.p, { align: AlignmentType.RIGHT, bold: true, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
              createApaCell(row.decision, { bold: true, color: '0F766E', bottomDouble: isLast, lightBottom: !isLast, widthPct: 16 })
            ]
          });
        })
      ]
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 100, after: 160 },
      children: [
        new TextRun({ text: 'Sintesis Keputusan Pemilihan Model: ', bold: true, font: FONT_FAMILY, size: 19, color: '0F172A' }),
        new TextRun({ text: `${modelFullName} terpilih sebagai estimator terbaik. Rasional: ${selection.selectionReason}`, font: FONT_FAMILY, size: 19, color: '1E293B' })
      ]
    })
  );

  // ==========================================================
  // BAGIAN 4: ESTIMASI MODEL AKHIR (VCE ROBUST) & INTERPRETASI
  // ==========================================================
  children.push(createSectionHeading(`4. Estimasi Model Akhir Terpilih (${finalModel.modelType} — Cluster-Robust SE)`));
  children.push(
    createTableCaption(
      'Tabel 4.1',
      `Hasil Estimasi Regresi Data Panel Model Akhir (${finalModel.modelType}) dengan Koreksi vce(robust)`
    )
  );

  const isREM = finalModel.modelType === 'REM';
  const statColTitle = isREM ? 'z-Stat' : 't-Stat';
  const pColTitle = isREM ? 'P > |z|' : 'P > |t|';
  const coeffEntries = Object.entries(finalModel.coefficients);

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createApaCell(`Variabel (Y: ${activeY})`, { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 22 }),
            createApaCell('Koefisien (b)', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 14 }),
            createApaCell('Robust Std. Err.', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 14 }),
            createApaCell(statColTitle, { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 11 }),
            createApaCell(pColTitle, { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 11 }),
            createApaCell('95% CI Lower', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 14 }),
            createApaCell('95% CI Upper', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 14 })
          ]
        }),
        ...coeffEntries.map(([vName, cRow], idx) => {
          const isLast = idx === coeffEntries.length - 1;
          const isSig = !cRow.isOmitted && cRow.sig < 0.05;
          return new TableRow({
            cantSplit: true,
            children: [
              createApaCell(vName === '_cons' ? '_cons (Konstanta)' : vName, { bold: vName !== '_cons', lightBottom: true, widthPct: 22 }),
              createApaCell(cRow.isOmitted ? '0 (omitted)' : `${fmtNum(cRow.b, 6)}${sigStars(cRow.sig)}`, {
                align: AlignmentType.RIGHT,
                bold: isSig,
                lightBottom: true,
                widthPct: 14
              }),
              createApaCell(cRow.isOmitted ? '-' : fmtNum(cRow.stdError, 6), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 14 }),
              createApaCell(cRow.isOmitted ? '-' : fmtNum(cRow.tOrZ, 2), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 11 }),
              createApaCell(cRow.isOmitted ? '-' : fmtSig(cRow.sig), {
                align: AlignmentType.RIGHT,
                bold: isSig,
                color: isSig ? '047857' : '1E293B',
                lightBottom: true,
                widthPct: 11
              }),
              createApaCell(cRow.isOmitted ? '-' : fmtNum(cRow.ciLower, 6), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 14 }),
              createApaCell(cRow.isOmitted ? '-' : fmtNum(cRow.ciUpper, 6), {
                align: AlignmentType.RIGHT,
                lightBottom: !isLast,
                bottomBorder: isLast,
                widthPct: 14
              })
            ]
          });
        }),
        new TableRow({
          cantSplit: true,
          children: [
            createApaCell('R-Squared (Within / Between / Overall)', { bold: true, subtleShading: true, lightBottom: true, widthPct: 22 }),
            createApaCell(`Within = ${fmtNum(finalModel.r2.within, 4)}`, { align: AlignmentType.RIGHT, subtleShading: true, lightBottom: true, widthPct: 14 }),
            createApaCell(`Between = ${fmtNum(finalModel.r2.between, 4)}`, { align: AlignmentType.RIGHT, subtleShading: true, lightBottom: true, widthPct: 14 }),
            createApaCell(`Overall = ${fmtNum(finalModel.r2.overall, 4)}`, { align: AlignmentType.RIGHT, subtleShading: true, lightBottom: true, widthPct: 11 }),
            createApaCell(`sigma_u = ${fmtNum(finalModel.sigma_u, 4)}`, { align: AlignmentType.RIGHT, subtleShading: true, lightBottom: true, widthPct: 11 }),
            createApaCell(`sigma_e = ${fmtNum(finalModel.sigma_e, 4)}`, { align: AlignmentType.RIGHT, subtleShading: true, lightBottom: true, widthPct: 14 }),
            createApaCell(`rho = ${fmtNum(finalModel.rho, 4)}`, { align: AlignmentType.RIGHT, subtleShading: true, lightBottom: true, widthPct: 14 })
          ]
        }),
        new TableRow({
          cantSplit: true,
          children: [
            createApaCell('Statistik Uji Simultan & Observasi', { bold: true, subtleShading: true, bottomDouble: true, widthPct: 22 }),
            createApaCell(
              isREM ? `Wald χ²(${finalModel.dfModel}) = ${fmtNum(finalModel.waldChi2, 2)}` : `F(${finalModel.dfModel}, ${finalModel.dfResidual}) = ${fmtNum(finalModel.fStat, 2)}`,
              { align: AlignmentType.RIGHT, bold: true, subtleShading: true, bottomDouble: true, widthPct: 14 }
            ),
            createApaCell(
              `Prob = ${fmtSig(isREM ? finalModel.waldPValue : finalModel.fPValue)}`,
              { align: AlignmentType.RIGHT, bold: true, color: '047857', subtleShading: true, bottomDouble: true, widthPct: 14 }
            ),
            createApaCell(`N Obs = ${finalModel.nObs}`, { align: AlignmentType.RIGHT, subtleShading: true, bottomDouble: true, widthPct: 11 }),
            createApaCell(`Grup = ${finalModel.nEntities}`, { align: AlignmentType.RIGHT, subtleShading: true, bottomDouble: true, widthPct: 11 }),
            createApaCell(`Periode = ${finalModel.nPeriods}`, { align: AlignmentType.RIGHT, subtleShading: true, bottomDouble: true, widthPct: 14 }),
            createApaCell('vce(robust)', { align: AlignmentType.RIGHT, bold: true, subtleShading: true, bottomDouble: true, widthPct: 14 })
          ]
        })
      ]
    })
  );
  children.push(
    createTableFootnote(
      `Standard error dikoreksi dengan pengelompokan entitas (clustered sandwich estimator pada ${finalModel.nEntities} entitas). Signifikansi: *** p < 0.01, ** p < 0.05, * p < 0.10.`
    )
  );

  // Tabel 4.2: Ringkasan Interpretasi Substantif Variabel Prediktor
  if (easyInterpretation && easyInterpretation.predictorInterpretations.length > 0) {
    children.push(createTableCaption('Tabel 4.2', 'Ringkasan Interpretasi Efek Marginal & Signifikansi Variabel Prediktor'));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
              createApaCell('Variabel Prediktor', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 18 }),
              createApaCell('Koefisien & p-value', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 18 }),
              createApaCell('Status & Arah', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 16 }),
              createApaCell('Interpretasi Ekonometrika & Makna Substantif', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 48 })
            ]
          }),
          ...easyInterpretation.predictorInterpretations.map((eff, idx) => {
            const isLast = idx === easyInterpretation.predictorInterpretations.length - 1;
            return new TableRow({
              cantSplit: true,
              children: [
                createApaCell(eff.variable, { bold: true, bottomDouble: isLast, lightBottom: !isLast, widthPct: 18 }),
                createApaCell(`b = ${fmtNum(eff.coef, 4)}\np = ${fmtSig(eff.pValue)}`, {
                  align: AlignmentType.RIGHT,
                  bottomDouble: isLast,
                  lightBottom: !isLast,
                  widthPct: 18
                }),
                createApaCell(
                  `${eff.isSignificant ? 'SIGNIFIKAN' : 'TIDAK SIGNIFIKAN'}\n(${eff.direction.toUpperCase()})`,
                  {
                    bold: true,
                    color: eff.isSignificant ? '047857' : '64748B',
                    align: AlignmentType.CENTER,
                    bottomDouble: isLast,
                    lightBottom: !isLast,
                    widthPct: 16
                  }
                ),
                createApaCell(eff.easyMeaning, { bottomDouble: isLast, lightBottom: !isLast, widthPct: 48 })
              ]
            });
          })
        ]
      })
    );
    children.push(
      new Paragraph({
        spacing: { before: 80, after: 160 },
        children: [
          new TextRun({ text: 'Kesimpulan Umum Model: ', bold: true, font: FONT_FAMILY, size: 19, color: '0F172A' }),
          new TextRun({ text: easyInterpretation.overallConclusion, font: FONT_FAMILY, size: 19, color: '1E293B' })
        ]
      })
    );
  }

  // ==========================================================
  // BAGIAN 5: DIAGNOSTIK ASUMSI KLASIK DATA PANEL
  // ==========================================================
  children.push(createSectionHeading('5. Diagnostik Pengujian Asumsi Klasik Data Panel'));
  children.push(createTableCaption('Tabel 5.1', 'Rekapitulasi Pengujian Asumsi Klasik & Remedial Ekonometrika Data Panel'));

  const vifApproachLabel = assumptions.vif.approach === 'centered' ? 'Centered VIF (estat vif)' : 'Uncentered VIF (vif, uncentered)';
  const diagPanelRows = [
    {
      test: `1. Multikolinearitas\n(${vifApproachLabel})`,
      stat: `Mean VIF = ${fmtNum(assumptions.vif.meanVif, 2)}`,
      p: '-',
      status: assumptions.vif.meanVif < 10 ? 'LOLOS' : 'TERDETEKSI',
      color: assumptions.vif.meanVif < 10 ? '047857' : 'B45309',
      note: assumptions.orthogReport?.triggered
        ? `Multikolinearitas ditangani dengan Orthogonalisasi Gram-Schmidt (${assumptions.orthogReport.stataCommand}). Mean VIF pasca-orthog = ${fmtNum(assumptions.orthogReport.postOrthogVif.meanVif, 2)}.`
        : 'Seluruh variabel prediktor memiliki nilai VIF di bawah ambang batas kritis 10.'
    },
    {
      test: '2. Heteroskedastisitas Groupwise\n(Modified Wald — xttest3)',
      stat: `χ²(${assumptions.greeneHetero?.df ?? '-'}) = ${fmtNum(assumptions.greeneHetero?.chi2, 2)}`,
      p: fmtSig(assumptions.greeneHetero?.p),
      status: assumptions.greeneHetero?.hasHeteroskedasticity ? 'TERDETEKSI (ROBUST)' : 'HOMOSKEDASTIS',
      color: assumptions.greeneHetero?.hasHeteroskedasticity ? 'B45309' : '047857',
      note: assumptions.greeneHetero?.hasHeteroskedasticity
        ? 'Varians galat berbeda antar-entitas (p < 0.05). Telah dikoreksi secara sah menggunakan Cluster-Robust Standard Errors vce(robust).'
        : 'Varians residual bersifat homoskedastis antar-unit cross-section (p >= 0.05).'
    },
    {
      test: '3. Autokorelasi Serial Panel\n(Wooldridge Test — xtserial)',
      stat: assumptions.wooldridgeSerial?.skippedReason
        ? 'Dilewati'
        : `F(${assumptions.wooldridgeSerial?.df1 ?? 1}, ${assumptions.wooldridgeSerial?.df2 ?? '-'}) = ${fmtNum(assumptions.wooldridgeSerial?.f, 2)}`,
      p: assumptions.wooldridgeSerial?.skippedReason ? '-' : fmtSig(assumptions.wooldridgeSerial?.p),
      status: assumptions.wooldridgeSerial?.skippedReason
        ? 'N/A'
        : assumptions.wooldridgeSerial?.hasAutocorrelation
        ? 'TERDETEKSI (ROBUST)'
        : 'BEBAS AUTOKORELASI',
      color: assumptions.wooldridgeSerial?.hasAutocorrelation ? 'B45309' : '047857',
      note: assumptions.wooldridgeSerial?.skippedReason
        ? assumptions.wooldridgeSerial.skippedReason
        : assumptions.wooldridgeSerial?.hasAutocorrelation
        ? 'Terdapat autokorelasi orde pertama dalam panel (p < 0.05). Telah ditangani secara simultan oleh estimator vce(robust) Arellano.'
        : 'Tidak ditemukan autokorelasi serial orde pertama pada residual panel (p >= 0.05).'
    },
    {
      test: `4. Normalitas Residu Panel\n(${assumptions.normality?.predictCommand || 'predict e, e'})`,
      stat: `W = ${fmtNum(assumptions.normality?.swilk?.w ?? assumptions.normality?.statistic, 4)}`,
      p: fmtSig(assumptions.normality?.swilk?.probZ ?? assumptions.normality?.p),
      status: assumptions.normality?.isNormal ? 'NORMAL' : assumptions.normality?.cltProtected ? 'CLT ASIMTOTIK' : 'NON-NORMAL',
      color: assumptions.normality?.isNormal || assumptions.normality?.cltProtected ? '047857' : 'B45309',
      note: `Shapiro-Wilk p = ${fmtSig(assumptions.normality?.swilk?.probZ ?? assumptions.normality?.p)} | Skewness/Kurtosis (sktest) p = ${fmtSig(assumptions.normality?.sktest?.probChi2)} | Kolmogorov-Smirnov p = ${fmtSig(assumptions.normality?.ksmirnov?.pValue)}.`
    }
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createApaCell('Jenis Pengujian Asumsi', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 24 }),
            createApaCell('Statistik Uji', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 16 }),
            createApaCell('p-value', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
            createApaCell('Status', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 14 }),
            createApaCell('Kesimpulan & Penanganan Ekonometrika', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 36 })
          ]
        }),
        ...diagPanelRows.map((d, idx) => {
          const isLast = idx === diagPanelRows.length - 1;
          return new TableRow({
            cantSplit: true,
            children: [
              createApaCell(d.test, { bold: true, bottomDouble: isLast, lightBottom: !isLast, widthPct: 24 }),
              createApaCell(d.stat, { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 16 }),
              createApaCell(d.p, { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
              createApaCell(d.status, { bold: true, color: d.color, align: AlignmentType.CENTER, bottomDouble: isLast, lightBottom: !isLast, widthPct: 14 }),
              createApaCell(d.note, { bottomDouble: isLast, lightBottom: !isLast, widthPct: 36 })
            ]
          });
        })
      ]
    })
  );

  // Tabel 5.2: Rincian VIF per Variabel
  const vifEntries = Object.entries(assumptions.vif.variables || {});
  if (vifEntries.length > 0) {
    children.push(createTableCaption('Tabel 5.2', `Rincian Nilai Variance Inflation Factor (${vifApproachLabel})`));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
              createApaCell('Variabel Prediktor', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 34 }),
              createApaCell('VIF', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 22 }),
              createApaCell('1/VIF (Tolerance)', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 22 }),
              createApaCell('Evaluasi Kolinearitas', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 22 })
            ]
          }),
          ...vifEntries.map(([vName, vStat], idx) => {
            const isHigh = vStat.vif > 10;
            return new TableRow({
              cantSplit: true,
              children: [
                createApaCell(vName, { bold: true, lightBottom: true, widthPct: 34 }),
                createApaCell(fmtNum(vStat.vif, 2), { align: AlignmentType.RIGHT, bold: isHigh, color: isHigh ? 'B91C1C' : '1E293B', lightBottom: true, widthPct: 22 }),
                createApaCell(fmtNum(vStat.tolerance, 6), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 22 }),
                createApaCell(isHigh ? 'Tinggi (VIF > 10)' : 'Aman (VIF < 10)', {
                  align: AlignmentType.CENTER,
                  bold: true,
                  color: isHigh ? 'B91C1C' : '047857',
                  lightBottom: true,
                  widthPct: 22
                })
              ]
            });
          }),
          new TableRow({
            cantSplit: true,
            children: [
              createApaCell('Mean VIF (Rata-rata)', { bold: true, subtleShading: true, bottomDouble: true, widthPct: 34 }),
              createApaCell(fmtNum(assumptions.vif.meanVif, 2), { align: AlignmentType.RIGHT, bold: true, subtleShading: true, bottomDouble: true, widthPct: 22 }),
              createApaCell('-', { align: AlignmentType.RIGHT, subtleShading: true, bottomDouble: true, widthPct: 22 }),
              createApaCell(assumptions.vif.meanVif < 10 ? 'Lolos' : 'Waspada', { align: AlignmentType.CENTER, bold: true, subtleShading: true, bottomDouble: true, widthPct: 22 })
            ]
          })
        ]
      })
    );
  }

  // ==========================================================
  // BAGIAN 6: RINCIAN 13 LANGKAH EKONOMETRIKA GAYA STATA
  // ==========================================================
  children.push(createSectionHeading('6. Rincian 13 Langkah Alur Ekonometrika Gaya Stata (Log & Konsol Lengkap)'));

  for (const block of consoleBlocks) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 80 },
        children: [
          new TextRun({
            text: `Langkah ${block.stepIndex}: ${block.stepTitle}`,
            bold: true,
            font: FONT_FAMILY,
            size: 21,
            color: '0F766E'
          })
        ]
      })
    );

    // 1. Kotak Sintaks Perintah Stata (.do)
    children.push(
      createStataTerminalBox(
        'Sintaks Perintah Stata (.do Command):',
        block.stataCommand.split(/\r?\n/).map(cmd => `. ${cmd}`).join('\n'),
        true
      )
    );

    // 2. Fungsi Ekonometrika
    children.push(
      new Paragraph({
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({ text: 'Fungsi Ekonometrika: ', bold: true, font: FONT_FAMILY, size: 18, color: '0F172A' }),
          new TextRun({ text: block.stataFunction, font: FONT_FAMILY, size: 18, color: '334155' })
        ]
      })
    );

    // 3. Kotak Jendela Hasil Konsol Stata (Monospace Presisi)
    children.push(
      createStataTerminalBox('Output Jendela Hasil Stata (Monospace Console):', block.stataOutput, false)
    );

    // 4. Penjelasan Ringkas & Interpretasi
    children.push(
      new Paragraph({
        spacing: { before: 70, after: 160 },
        children: [
          new TextRun({ text: 'Penjelasan & Interpretasi Ringkas: ', bold: true, font: FONT_FAMILY, size: 18, color: '0F766E' }),
          new TextRun({ text: block.babyLanguage, font: FONT_FAMILY, size: 18, color: '1E293B' })
        ]
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children
      }
    ]
  });

  return await Packer.toBuffer(doc);
}
