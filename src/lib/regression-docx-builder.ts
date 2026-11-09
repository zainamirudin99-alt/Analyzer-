// ============================================================
// Word (.docx) Document Builder (regresi-statistik-remedial)
// Menghasilkan dokumen Word gaya SPSS / APA lengkap dengan:
// - Margin standar akademik 1 inci (1440 twips) & tipografi presisi
// - Perataan angka rata kanan (AlignmentType.RIGHT) dan teks rata kiri
// - Tabel SPSS Lengkap: Descriptive Statistics, Variables Entered/Removed,
//   Model Summary, ANOVA, Coefficients & Collinearity, Collinearity Diagnostics,
//   Residuals Statistics, Diagnostik Asumsi Klasik, Rekomendasi Tindak Lanjut,
//   dan Matriks Perbandingan Model (M0 vs M1..Mk)
// ============================================================

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  Packer,
  ShadingType
} from 'docx';
import { OLSFitResult } from './regression-engine';
import { generateDeterministicInterpretation } from './regression-interpretation';
import { RecommendationEngineOutput } from './regression-recommendation-engine';
import { ModelComparisonReport } from './regression-model-comparison';

export interface DocxExportOptions {
  result: OLSFitResult;
  datasetName: string;
  sheetName: string;
  alpha: number;
  seed?: number;
  statusLabel?: 'Konfirmatori' | 'Eksploratori';
  exploratoryReason?: string;
  kTried?: number;
  modelsHistory?: {
    id: string;
    title: string;
    type: string;
    result: OLSFitResult;
    label: 'Konfirmatori' | 'Eksploratori';
    passRate?: number;
  }[];
  recommendationOutput?: RecommendationEngineOutput;
  comparisonReport?: ModelComparisonReport;
}

const FONT_FAMILY = 'Calibri';
const MONO_FONT = 'Consolas';

function fmtNum(n?: number, digits = 3): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  return n.toFixed(digits);
}

function fmtSig(p?: number): string {
  if (p === undefined || p === null || isNaN(p)) return '-';
  if (p < 0.001) return '< .001';
  const str = p.toFixed(3);
  return str.startsWith('0.') ? str.slice(1) : str;
}

const CELL_PADDING = {
  top: 80,
  bottom: 80,
  left: 120,
  right: 120
};

/**
 * Helper membuat sel tabel bergaya SPSS / APA 7th Edition (Tanpa garis vertikal, border horizontal bersih)
 */
function createSpssCell(
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
              size: options.fontSize || 19, // 9.5pt agar tabel multi-kolom muat dengan rapi
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

function createTableCaption(tableNum: string, title: string, subtitle?: string): Paragraph[] {
  const paras: Paragraph[] = [
    new Paragraph({
      spacing: { before: 220, after: subtitle ? 30 : 80 },
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
    })
  ];
  if (subtitle) {
    paras.push(
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [
          new TextRun({
            text: subtitle,
            font: FONT_FAMILY,
            size: 18,
            color: '475569'
          })
        ]
      })
    );
  }
  return paras;
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

function createMultilineParagraphs(
  text: string,
  opts: { boldPrefix?: string; indentLeft?: number; afterSpacing?: number } = {}
): Paragraph[] {
  const cleanLines = String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (cleanLines.length === 0) return [];

  return cleanLines.map(
    (line, idx) =>
      new Paragraph({
        indent: opts.indentLeft ? { left: opts.indentLeft } : undefined,
        spacing: {
          before: 20,
          after: idx === cleanLines.length - 1 ? (opts.afterSpacing ?? 100) : 40,
          line: 276
        },
        children: [
          ...(idx === 0 && opts.boldPrefix
            ? [
                new TextRun({
                  text: opts.boldPrefix,
                  bold: true,
                  font: FONT_FAMILY,
                  size: 20,
                  color: '0F172A'
                })
              ]
            : []),
          new TextRun({
            text: line,
            font: FONT_FAMILY,
            size: 20,
            color: '1E293B'
          })
        ]
      })
  );
}

/**
 * Membangun dokumen Word (.docx) lengkap dan mengembalikannya sebagai Buffer
 */
export async function generateRegressionDocx(options: DocxExportOptions): Promise<Buffer> {
  const {
    result,
    datasetName,
    sheetName,
    alpha,
    seed = 12345,
    statusLabel = 'Konfirmatori',
    exploratoryReason,
    kTried = 1,
    recommendationOutput,
    comparisonReport
  } = options;

  const interp = generateDeterministicInterpretation(result, {
    modelId: 'M0',
    modelType: 'baseline',
    title: 'Model Utama',
    alpha,
    label: statusLabel,
    kTried,
    exploratoryReason
  });

  const children: (Paragraph | Table)[] = [];

  // ==========================================================
  // HEADER DOKUMEN AKADEMIK (JUDUL & METADATA)
  // ==========================================================
  children.push(
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: 'LAPORAN HASIL ANALISIS REGRESI LINIER BERGANDA (STANDAR SPSS / APA)',
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
          text: `Mesin Komputasi Statistik OLS (SVD Rank-Verified) • Versi ${result.engineVersion} • Klasifikasi: `,
          font: FONT_FAMILY,
          size: 19,
          color: '475569'
        }),
        new TextRun({
          text: statusLabel.toUpperCase(),
          bold: true,
          font: FONT_FAMILY,
          size: 19,
          color: statusLabel === 'Konfirmatori' ? '047857' : 'B45309'
        }),
        new TextRun({
          text: ` (K = ${kTried} spesifikasi diuji)`,
          font: FONT_FAMILY,
          size: 19,
          color: '475569'
        })
      ]
    })
  );

  // ==========================================================
  // BAGIAN 1: METADATA & SPESIFIKASI MODEL
  // ==========================================================
  children.push(createSectionHeading('1. Spesifikasi & Parameter Model'));
  children.push(...createTableCaption('Tabel 1.1', 'Parameter Konfigurasi & Spesifikasi Analisis Regresi'));

  const specRows: [string, string][] = [
    ['Berkas Dataset & Sheet', `${datasetName} (Sheet: ${sheetName})`],
    ['Tipe Model Regresi', `${result.modelType === 'SLR' ? 'Simple Linear Regression (SLR)' : 'Multiple Linear Regression (MLR)'} — Metode: ${result.variables.enteredMethod || 'Enter'}`],
    ['Variabel Dependen (Y)', result.variables.yCol],
    ['Variabel Independen / Prediktor (X)', `${result.variables.xCols.join(', ')} (k = ${result.kPredictors} prediktor)`],
    ['Ukuran Sampel Observasi (n)', `N Awal = ${result.sampleSize.nInitial}, N Valid Digunakan = ${result.sampleSize.nUsed} (Dihapus Listwise = ${result.sampleSize.rowsDropped})`],
    ['Tingkat Signifikansi (Alpha)', `α = ${alpha} (Interval Kepercayaan ${(1 - alpha) * 100}%)`],
    ['Jalur Analisis Deret Waktu', result.timeSeriesSummary?.isTimeSeries ? `Ya (Kolom Waktu: ${result.timeSeriesSummary.timeCol || '-'}, Frekuensi: ${result.timeSeriesSummary.frequency || '-'})` : 'Cross-Sectional (Bukan Deret Waktu)'],
    ['Status Klasifikasi Inferensi', `${statusLabel}${exploratoryReason ? ` (${exploratoryReason})` : ''}`],
    ['PRNG Seed & Waktu Cetak', `Seed = ${seed} • Dicetak pada ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`]
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createSpssCell('Parameter Konfigurasi', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 35 }),
            createSpssCell('Nilai / Spesifikasi Aktif', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 65 })
          ]
        }),
        ...specRows.map(([k, v], idx) =>
          new TableRow({
            cantSplit: true,
            children: [
              createSpssCell(k, {
                bold: true,
                widthPct: 35,
                lightBottom: idx < specRows.length - 1,
                bottomDouble: idx === specRows.length - 1,
                subtleShading: idx % 2 === 1
              }),
              createSpssCell(v, {
                widthPct: 65,
                lightBottom: idx < specRows.length - 1,
                bottomDouble: idx === specRows.length - 1,
                subtleShading: idx % 2 === 1
              })
            ]
          })
        )
      ]
    })
  );

  // ==========================================================
  // BAGIAN 2: INTERPRETASI NARATIF & PERSAMAAN REGRESI
  // ==========================================================
  children.push(createSectionHeading('2. Ringkasan Eksekutif & Persamaan Regresi'));

  // Kotak Persamaan Regresi
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              margins: { top: 100, bottom: 100, left: 160, right: 160 },
              shading: { type: ShadingType.CLEAR, fill: 'F0FDFA', color: 'auto' },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 6, color: '0D9488' },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: '0D9488' },
                left: { style: BorderStyle.SINGLE, size: 24, color: '0D9488' },
                right: { style: BorderStyle.SINGLE, size: 6, color: '0D9488' }
              },
              children: [
                new Paragraph({
                  spacing: { before: 0, after: 40 },
                  children: [
                    new TextRun({
                      text: 'Persamaan Regresi Linier Terestimasi:',
                      bold: true,
                      font: FONT_FAMILY,
                      size: 19,
                      color: '0F766E'
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { before: 0, after: 0 },
                  children: [
                    new TextRun({
                      text: interp.regressionEquation,
                      bold: true,
                      font: MONO_FONT,
                      size: 20,
                      color: '0F172A'
                    })
                  ]
                })
              ]
            })
          ]
        })
      ]
    })
  );

  children.push(
    ...createMultilineParagraphs(interp.anova, { boldPrefix: 'Uji Kelayakan Model Simultan (Uji F): ', afterSpacing: 80 }),
    ...createMultilineParagraphs(interp.modelSummary, { boldPrefix: 'Koefisien Determinasi (R² & Adjusted R²): ', afterSpacing: 80 }),
    ...createMultilineParagraphs(interp.covarianceEstimatorNote, { boldPrefix: 'Estimator Kovarians & Standard Error: ', afterSpacing: 80 }),
    ...createMultilineParagraphs(interp.nonCausalAdvisory, { boldPrefix: 'Catatan Metodologis Non-Kausal: ', afterSpacing: 100 })
  );

  children.push(
    new Paragraph({
      spacing: { before: 100, after: 60 },
      children: [
        new TextRun({
          text: 'Interpretasi Koefisien Parsial (Uji t — Ceteris Paribus):',
          bold: true,
          font: FONT_FAMILY,
          size: 20,
          color: '0F172A'
        })
      ]
    })
  );

  const coefLines = interp.coefficients.split(/\s*\|\s*|\r?\n/).filter(s => s.trim().length > 0);
  coefLines.forEach((line, idx) => {
    children.push(
      new Paragraph({
        indent: { left: 240 },
        spacing: { before: 20, after: 50, line: 260 },
        children: [
          new TextRun({
            text: `${idx + 1}. `,
            bold: true,
            font: FONT_FAMILY,
            size: 19,
            color: '0F766E'
          }),
          new TextRun({
            text: line,
            font: FONT_FAMILY,
            size: 19,
            color: '1E293B'
          })
        ]
      })
    );
  });

  if (interp.lowR2Note) {
    children.push(
      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          new TextRun({
            text: `Catatan R²: ${interp.lowR2Note}`,
            bold: true,
            font: FONT_FAMILY,
            size: 19,
            color: 'B45309'
          })
        ]
      })
    );
  }

  if (interp.remedialNote) {
    children.push(
      new Paragraph({
        spacing: { before: 80, after: 100 },
        children: [
          new TextRun({
            text: `Catatan Diagnostik & Remedial: ${interp.remedialNote}`,
            bold: true,
            font: FONT_FAMILY,
            size: 19,
            color: 'B91C1C'
          })
        ]
      })
    );
  }

  // ==========================================================
  // BAGIAN 3: TABEL OUTPUT UTAMA (GAYA SPSS / APA)
  // ==========================================================
  children.push(createSectionHeading('3. Tabel Output Utama (Standar SPSS / APA)'));

  // 3.0 Descriptive Statistics
  if (result.descriptiveStatistics && result.descriptiveStatistics.length > 0) {
    children.push(...createTableCaption('Tabel 3.0', 'Descriptive Statistics'));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
              createSpssCell('Variabel', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 32 }),
              createSpssCell('Mean', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 15 }),
              createSpssCell('Std. Deviation', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 16 }),
              createSpssCell('Minimum', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 13 }),
              createSpssCell('Maximum', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 13 }),
              createSpssCell('N', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 11 })
            ]
          }),
          ...result.descriptiveStatistics.map((d, idx) => {
            const isLast = idx === result.descriptiveStatistics!.length - 1;
            return new TableRow({
              cantSplit: true,
              children: [
                createSpssCell(d.variable, { bold: idx === 0, bottomDouble: isLast, lightBottom: !isLast, widthPct: 32 }),
                createSpssCell(fmtNum(d.mean, 4), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 15 }),
                createSpssCell(fmtNum(d.stdDev, 4), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 16 }),
                createSpssCell(fmtNum(d.min, 4), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 13 }),
                createSpssCell(fmtNum(d.max, 4), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 13 }),
                createSpssCell(String(d.n), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 11 })
              ]
            });
          })
        ]
      })
    );
    children.push(createTableFootnote(`Baris pertama (${result.variables.yCol}) merupakan Variabel Dependen (Y), diikuti oleh variabel prediktor.`));
  }

  // 3.1 Variables Entered/Removed
  children.push(...createTableCaption('Tabel 3.1', 'Variables Entered/Removedª'));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createSpssCell('Model', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 12 }),
            createSpssCell('Variables Entered', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 42 }),
            createSpssCell('Variables Removed', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 24 }),
            createSpssCell('Method', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 22 })
          ]
        }),
        new TableRow({
          cantSplit: true,
          children: [
            createSpssCell('1', { bottomDouble: true, align: AlignmentType.CENTER, widthPct: 12 }),
            createSpssCell(`${result.variables.xCols.join(', ')}ᵇ`, { bottomDouble: true, widthPct: 42 }),
            createSpssCell('.', { bottomDouble: true, widthPct: 24 }),
            createSpssCell(result.variables.enteredMethod || 'Enter', { bottomDouble: true, widthPct: 22 })
          ]
        })
      ]
    })
  );
  children.push(
    createTableFootnote(`a. Dependent Variable: ${result.variables.yCol} • b. All requested variables entered.`)
  );

  // 3.2 Model Summary
  children.push(...createTableCaption('Tabel 3.2', 'Model Summaryᵇ'));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createSpssCell('Model', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 12 }),
            createSpssCell('R', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 16 }),
            createSpssCell('R Square', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 18 }),
            createSpssCell('Adjusted R Square', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 20 }),
            createSpssCell('Std. Error of the Estimate', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 18 }),
            createSpssCell('Durbin-Watson', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 16 })
          ]
        }),
        new TableRow({
          cantSplit: true,
          children: [
            createSpssCell('1', { bottomDouble: true, align: AlignmentType.CENTER, widthPct: 12 }),
            createSpssCell(`${fmtNum(result.modelSummary.r, 3)}ᵃ`, { bottomDouble: true, align: AlignmentType.RIGHT, widthPct: 16 }),
            createSpssCell(fmtNum(result.modelSummary.rSquared, 3), { bottomDouble: true, align: AlignmentType.RIGHT, widthPct: 18 }),
            createSpssCell(fmtNum(result.modelSummary.adjRSquared, 3), { bottomDouble: true, align: AlignmentType.RIGHT, widthPct: 20 }),
            createSpssCell(fmtNum(result.modelSummary.stdErrorEstimate, 4), { bottomDouble: true, align: AlignmentType.RIGHT, widthPct: 18 }),
            createSpssCell(fmtNum(result.modelSummary.durbinWatson, 3), { bottomDouble: true, align: AlignmentType.RIGHT, widthPct: 16 })
          ]
        })
      ]
    })
  );
  children.push(
    createTableFootnote(
      `a. Predictors: (Constant), ${result.variables.xCols.join(', ')} • b. Dependent Variable: ${result.variables.yCol}`
    )
  );

  // 3.3 ANOVA
  children.push(...createTableCaption('Tabel 3.3', 'ANOVAª (Analysis of Variance)'));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createSpssCell('Model', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 24 }),
            createSpssCell('Sum of Squares', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 22 }),
            createSpssCell('df', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 12 }),
            createSpssCell('Mean Square', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 18 }),
            createSpssCell('F', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 12 }),
            createSpssCell('Sig.', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 12 })
          ]
        }),
        new TableRow({
          cantSplit: true,
          children: [
            createSpssCell('1  Regression', { lightBottom: true, widthPct: 24 }),
            createSpssCell(fmtNum(result.anova.regression.ss, 3), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 22 }),
            createSpssCell(String(result.anova.regression.df), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 12 }),
            createSpssCell(fmtNum(result.anova.regression.ms, 3), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 18 }),
            createSpssCell(fmtNum(result.anova.regression.f, 3), { align: AlignmentType.RIGHT, lightBottom: true, bold: true, widthPct: 12 }),
            createSpssCell(`${fmtSig(result.anova.regression.sig)}ᵇ`, { align: AlignmentType.RIGHT, lightBottom: true, bold: true, widthPct: 12 })
          ]
        }),
        new TableRow({
          cantSplit: true,
          children: [
            createSpssCell('    Residual', { lightBottom: true, widthPct: 24 }),
            createSpssCell(fmtNum(result.anova.residual.ss, 3), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 22 }),
            createSpssCell(String(result.anova.residual.df), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 12 }),
            createSpssCell(fmtNum(result.anova.residual.ms, 3), { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 18 }),
            createSpssCell('', { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 12 }),
            createSpssCell('', { align: AlignmentType.RIGHT, lightBottom: true, widthPct: 12 })
          ]
        }),
        new TableRow({
          cantSplit: true,
          children: [
            createSpssCell('    Total', { bold: true, bottomDouble: true, widthPct: 24 }),
            createSpssCell(fmtNum(result.anova.total.ss, 3), { bold: true, align: AlignmentType.RIGHT, bottomDouble: true, widthPct: 22 }),
            createSpssCell(String(result.anova.total.df), { bold: true, align: AlignmentType.RIGHT, bottomDouble: true, widthPct: 12 }),
            createSpssCell('', { bottomDouble: true, widthPct: 18 }),
            createSpssCell('', { bottomDouble: true, widthPct: 12 }),
            createSpssCell('', { bottomDouble: true, widthPct: 12 })
          ]
        })
      ]
    })
  );
  children.push(
    createTableFootnote(
      `a. Dependent Variable: ${result.variables.yCol} • b. Predictors: (Constant), ${result.variables.xCols.join(', ')}`
    )
  );

  // 3.4 Coefficients
  children.push(...createTableCaption('Tabel 3.4', 'Coefficientsª & Collinearity Statistics'));
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createSpssCell('Variabel', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 20 }),
            createSpssCell('B', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
            createSpssCell('Std. Error', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
            createSpssCell('Beta', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 9 }),
            createSpssCell('t', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 9 }),
            createSpssCell('Sig.', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 9 }),
            createSpssCell('95% CI Lower', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
            createSpssCell('95% CI Upper', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
            createSpssCell('Tolerance', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 7 }),
            createSpssCell('VIF', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 6 })
          ]
        }),
        ...result.coefficients.map((c, idx) => {
          const isLast = idx === result.coefficients.length - 1;
          const isConst = c.variable === '(Constant)';
          const isSig = c.sig < alpha;
          return new TableRow({
            cantSplit: true,
            children: [
              createSpssCell(c.variable, { bold: !isConst, bottomDouble: isLast, lightBottom: !isLast, widthPct: 20 }),
              createSpssCell(fmtNum(c.b, 4), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
              createSpssCell(fmtNum(c.stdError, 4), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
              createSpssCell(isConst ? '' : fmtNum(c.beta, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 9 }),
              createSpssCell(fmtNum(c.t, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 9 }),
              createSpssCell(fmtSig(c.sig), {
                align: AlignmentType.RIGHT,
                bold: isSig,
                color: isSig ? '047857' : '1E293B',
                bottomDouble: isLast,
                lightBottom: !isLast,
                widthPct: 9
              }),
              createSpssCell(fmtNum(c.ciLower, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
              createSpssCell(fmtNum(c.ciUpper, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
              createSpssCell(isConst ? '' : fmtNum(c.collinearity.tolerance, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 7 }),
              createSpssCell(isConst ? '' : fmtNum(c.collinearity.vif, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 6 })
            ]
          });
        })
      ]
    })
  );
  children.push(createTableFootnote(`a. Dependent Variable: ${result.variables.yCol} • Nilai Sig. < ${alpha} menandakan pengaruh signifikan secara statistik.`));

  // 3.5 Collinearity Diagnostics
  if (result.collinearityDiagnostics && result.collinearityDiagnostics.length > 0) {
    const varPropKeys = Object.keys(result.collinearityDiagnostics[0].varianceProportions || {});
    children.push(...createTableCaption('Tabel 3.5', 'Collinearity Diagnosticsª (Belsley-Kuh-Welsch)'));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
              createSpssCell('Dimension', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER }),
              createSpssCell('Eigenvalue', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT }),
              createSpssCell('Condition Index', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT }),
              ...varPropKeys.map(vk =>
                createSpssCell(`VP: ${vk}`, { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT })
              )
            ]
          }),
          ...result.collinearityDiagnostics.map((cd, idx) => {
            const isLast = idx === result.collinearityDiagnostics.length - 1;
            return new TableRow({
              cantSplit: true,
              children: [
                createSpssCell(String(cd.dimension), { align: AlignmentType.CENTER, bottomDouble: isLast, lightBottom: !isLast }),
                createSpssCell(fmtNum(cd.eigenvalue, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast }),
                createSpssCell(fmtNum(cd.conditionIndex, 3), {
                  align: AlignmentType.RIGHT,
                  bold: cd.conditionIndex > 30,
                  color: cd.conditionIndex > 30 ? 'B91C1C' : '1E293B',
                  bottomDouble: isLast,
                  lightBottom: !isLast
                }),
                ...varPropKeys.map(vk =>
                  createSpssCell(fmtNum(cd.varianceProportions[vk], 2), {
                    align: AlignmentType.RIGHT,
                    bottomDouble: isLast,
                    lightBottom: !isLast
                  })
                )
              ]
            });
          })
        ]
      })
    );
    children.push(createTableFootnote(`a. Dependent Variable: ${result.variables.yCol} • Condition Index > 30 mengindikasikan kolinearitas kuat.`));
  }

  // 3.6 Residuals Statistics
  if (result.residualsStatistics && result.residualsStatistics.length > 0) {
    children.push(...createTableCaption('Tabel 3.6', 'Residuals Statisticsª'));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
              createSpssCell('Komponen Residu / Prediksi', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 32 }),
              createSpssCell('Minimum', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 15 }),
              createSpssCell('Maximum', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 15 }),
              createSpssCell('Mean', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 15 }),
              createSpssCell('Std. Deviation', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 13 }),
              createSpssCell('N', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 })
            ]
          }),
          ...result.residualsStatistics.map((rs, idx) => {
            const isLast = idx === result.residualsStatistics.length - 1;
            return new TableRow({
              cantSplit: true,
              children: [
                createSpssCell(rs.metric, { bold: true, bottomDouble: isLast, lightBottom: !isLast, widthPct: 32 }),
                createSpssCell(fmtNum(rs.min, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 15 }),
                createSpssCell(fmtNum(rs.max, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 15 }),
                createSpssCell(fmtNum(rs.mean, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 15 }),
                createSpssCell(fmtNum(rs.stdDev, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 13 }),
                createSpssCell(String(rs.n), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 })
              ]
            });
          })
        ]
      })
    );
    children.push(createTableFootnote(`a. Dependent Variable: ${result.variables.yCol}`));
  }

  // ==========================================================
  // BAGIAN 4: DIAGNOSTIK ASUMSI KLASIK & REKOMENDASI TINDAK LANJUT
  // ==========================================================
  children.push(createSectionHeading('4. Diagnostik Asumsi Klasik & Rekomendasi Tindak Lanjut'));
  children.push(...createTableCaption('Tabel 4.1', 'Rekapitulasi Hasil Pengujian Asumsi Klasik OLS'));

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
            createSpssCell('Uji Asumsi Klasik', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 26 }),
            createSpssCell('Statistik Uji', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 12 }),
            createSpssCell('Sig. / p-value', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 12 }),
            createSpssCell('Status', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 14 }),
            createSpssCell('Kriteria & Kesimpulan Diagnostik', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 36 })
          ]
        }),
        ...result.assumptions.map((a, idx) => {
          const isLast = idx === result.assumptions.length - 1;
          const statusColor = a.status === 'lulus' ? '047857' : a.status === 'gagal' ? 'B91C1C' : '64748B';
          return new TableRow({
            cantSplit: true,
            children: [
              createSpssCell(a.name, { bold: true, bottomDouble: isLast, lightBottom: !isLast, widthPct: 26 }),
              createSpssCell(fmtNum(a.statistic, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 12 }),
              createSpssCell(a.pValue !== undefined ? fmtSig(a.pValue) : '-', { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 12 }),
              createSpssCell(a.status.toUpperCase(), {
                bold: true,
                color: statusColor,
                align: AlignmentType.CENTER,
                bottomDouble: isLast,
                lightBottom: !isLast,
                widthPct: 14
              }),
              createSpssCell(a.reason, { bottomDouble: isLast, lightBottom: !isLast, widthPct: 36 })
            ]
          });
        })
      ]
    })
  );

  // Rincian Kartu Rekomendasi Statistik
  if (recommendationOutput && recommendationOutput.cards && recommendationOutput.cards.length > 0) {
    const sum = recommendationOutput.summary;
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 80 },
        children: [
          new TextRun({
            text: `Ringkasan Evaluasi Diagnostik: Kesehatan Model ${sum.overallHealth} (Skor: ${sum.healthScore}/100 — Lulus: ${sum.passedAssumptions}/${sum.totalAssumptions}, Pelanggaran: ${sum.violatedAssumptions}, Waspada: ${sum.warningAssumptions})`,
            bold: true,
            font: FONT_FAMILY,
            size: 20,
            color: '0F172A'
          })
        ]
      })
    );

    recommendationOutput.cards.forEach((card, idx) => {
      const borderColor = card.status === 'LULUS' ? '10B981' : card.status === 'PELANGGARAN' ? 'EF4444' : 'F59E0B';
      const fillBg = card.status === 'LULUS' ? 'F0FDF4' : card.status === 'PELANGGARAN' ? 'FEF2F2' : 'FFFBEB';
      const statSummary = `${card.statisticName} = ${fmtNum(card.statistic, 4)}${card.pValue !== undefined ? ` (p = ${fmtSig(card.pValue)})` : ''}`;

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  margins: { top: 100, bottom: 100, left: 150, right: 150 },
                  shading: { type: ShadingType.CLEAR, fill: fillBg, color: 'auto' },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
                    left: { style: BorderStyle.SINGLE, size: 20, color: borderColor },
                    right: { style: BorderStyle.SINGLE, size: 6, color: borderColor }
                  },
                  children: [
                    new Paragraph({
                      spacing: { before: 0, after: 40 },
                      children: [
                        new TextRun({
                          text: `${idx + 1}. ${card.testName}  [${card.status}]`,
                          bold: true,
                          font: FONT_FAMILY,
                          size: 20,
                          color: '0F172A'
                        })
                      ]
                    }),
                    new Paragraph({
                      spacing: { before: 0, after: 30 },
                      children: [
                        new TextRun({ text: 'Hasil Uji & Keputusan H₀: ', bold: true, font: FONT_FAMILY, size: 18, color: '334155' }),
                        new TextRun({ text: `${statSummary} — ${card.h0Decision}`, font: FONT_FAMILY, size: 18, color: '1E293B' })
                      ]
                    }),
                    new Paragraph({
                      spacing: { before: 0, after: 30 },
                      children: [
                        new TextRun({ text: 'Interpretasi: ', bold: true, font: FONT_FAMILY, size: 18, color: '334155' }),
                        new TextRun({ text: card.interpretation, font: FONT_FAMILY, size: 18, color: '1E293B' })
                      ]
                    }),
                    new Paragraph({
                      spacing: { before: 0, after: 30 },
                      children: [
                        new TextRun({ text: 'Rekomendasi Utama: ', bold: true, font: FONT_FAMILY, size: 18, color: '0F766E' }),
                        new TextRun({ text: card.primaryRecommendation, font: FONT_FAMILY, size: 18, color: '1E293B' })
                      ]
                    }),
                    new Paragraph({
                      spacing: { before: 0, after: 0 },
                      children: [
                        new TextRun({ text: 'Langkah Tindak Lanjut: ', bold: true, font: FONT_FAMILY, size: 18, color: '334155' }),
                        new TextRun({ text: `${card.availableActions.actionLabel} — ${card.availableActions.explanationText}`, font: FONT_FAMILY, size: 18, color: '1E293B' })
                      ]
                    })
                  ]
                })
              ]
            })
          ]
        }),
        new Paragraph({ spacing: { before: 0, after: 100 }, children: [] })
      );
    });
  }

  // ==========================================================
  // BAGIAN 5: MATRIKS PERBANDINGAN SPESIFIKASI MODEL
  // ==========================================================
  if (comparisonReport && comparisonReport.models && comparisonReport.models.length > 0) {
    children.push(createSectionHeading('5. Matriks Perbandingan Spesifikasi Model (M0 vs Remedial)'));
    children.push(
      new Paragraph({
        spacing: { before: 40, after: 80 },
        children: [
          new TextRun({
            text: `Model Inferensial Terbaik: ${comparisonReport.bestInferentialModel.title} (${comparisonReport.bestInferentialModel.justification}). Model Prediktif Terbaik: ${comparisonReport.bestPredictiveModel.title} (${comparisonReport.bestPredictiveModel.justification}).`,
            font: FONT_FAMILY,
            size: 19,
            color: '1E293B'
          })
        ]
      })
    );
    children.push(...createTableCaption('Tabel 5.1', 'Perbandingan Metrik Kebaikan Suai (Goodness-of-Fit) & Kelulusan Asumsi'));

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
              createSpssCell('Model ID & Spesifikasi', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, widthPct: 26 }),
              createSpssCell('N', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 7 }),
              createSpssCell('R²', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 9 }),
              createSpssCell('Adj. R²', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
              createSpssCell('F-Stat', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
              createSpssCell('RMSE', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
              createSpssCell('AIC', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
              createSpssCell('BIC', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.RIGHT, widthPct: 10 }),
              createSpssCell('Asumsi', { bold: true, topBorder: true, bottomBorder: true, headerShading: true, align: AlignmentType.CENTER, widthPct: 8 })
            ]
          }),
          ...comparisonReport.models.map((m, idx) => {
            const isLast = idx === comparisonReport.models.length - 1;
            const isRecommended = m.modelId === comparisonReport.bestInferentialModel.modelId;
            return new TableRow({
              cantSplit: true,
              children: [
                createSpssCell(`${m.modelId}: ${m.title}${isRecommended ? ' ★' : ''}`, {
                  bold: isRecommended,
                  color: isRecommended ? '047857' : '1E293B',
                  bottomDouble: isLast,
                  lightBottom: !isLast,
                  widthPct: 26
                }),
                createSpssCell(String(m.sampleSize), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 7 }),
                createSpssCell(fmtNum(m.rSquared, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 9 }),
                createSpssCell(fmtNum(m.adjRSquared, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
                createSpssCell(fmtNum(m.fStat, 2), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
                createSpssCell(fmtNum(m.rmse, 3), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
                createSpssCell(fmtNum(m.aic, 2), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
                createSpssCell(fmtNum(m.bic, 2), { align: AlignmentType.RIGHT, bottomDouble: isLast, lightBottom: !isLast, widthPct: 10 }),
                createSpssCell(m.allAssumptionsPassed ? 'LULUS' : 'EVALUASI', {
                  align: AlignmentType.CENTER,
                  bold: true,
                  bottomDouble: isLast,
                  lightBottom: !isLast,
                  widthPct: 8
                })
              ]
            });
          })
        ]
      })
    );
    children.push(createTableFootnote('Tanda ★ menunjukkan spesifikasi model dengan keseimbangan terbaik antara pemenuhan asumsi klasik dan kriteria informasi (AIC/BIC).'));
  }

  // ==========================================================
  // BAGIAN 6: SKOR KESESUAIAN BENCHMARK SPSS & JEJAK AUDIT
  // ==========================================================
  children.push(createSectionHeading('6. Skor Kesesuaian Benchmark SPSS & Reprodusibilitas'));
  children.push(
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: `Skor Kesesuaian Numerik S3: ${result.scores.s3Consistency}% (${result.scores.checksPassed}/${result.scores.totalChecks} pemeriksaan matriks & dekomposisi SVD lulus pada toleransi ε ≤ 10⁻⁶). Seluruh estimasi disajikan jujur apa adanya sesuai prinsip transparansi ilmiah.`,
          font: FONT_FAMILY,
          size: 19,
          color: '334155'
        })
      ]
    })
  );

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

export const buildRegressionDocxBuffer = generateRegressionDocx;
