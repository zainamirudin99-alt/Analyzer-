
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import * as XLSX from 'xlsx';
import {
  MsmaFullAnalysisResult,
  MsmaJournalReportSections
} from '../types';
import { fmtAdaptive, sanitizeCellText } from '../utils/numerical';

function fitWorksheetColumns(aoa: unknown[][]): XLSX.ColInfo[] {
  if (aoa.length === 0) return [];
  const colCount = Math.max(...aoa.map(r => r.length));
  const widths = Array.from({ length: colCount }, () => 14);
  for (const row of aoa) {
    for (let c = 0; c < colCount; c++) {
      const len = String(row[c] ?? '').length;
      if (len + 3 > widths[c]) widths[c] = Math.min(84, len + 3);
    }
  }
  return widths.map(wch => ({ wch }));
}

function appendFormulaSafeSheet(wb: XLSX.WorkBook, sheetName: string, aoa: unknown[][]) {
  const safeAoa = aoa.map(row =>
    row.map(cell => (typeof cell === 'string' ? sanitizeCellText(cell) : cell))
  );
  const ws = XLSX.utils.aoa_to_sheet(safeAoa);
  ws['!cols'] = fitWorksheetColumns(safeAoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

export function generateMsmaExcelBuffer(
  result: MsmaFullAnalysisResult,
  journal: MsmaJournalReportSections,
  datasetName: string
): Buffer {
  const wb = XLSX.utils.book_new();

  appendFormulaSafeSheet(wb, '01_Executive_Summary', [
    ['MULTI-SOURCE MEASUREMENT ACCURACY ANALYSIS (WITHOUT GROUND TRUTH)'],
    ['Dataset', datasetName],
    ['Waktu Komputasi', result.computedAt],
    ['Entitas (G) × Periode (T)', `${result.panel.nEntities} × ${result.panel.nPeriods}`],
    ['Observasi Lengkap (N_CC) / Total Valid', `${result.descriptives.nCompleteCasesAllSources} / ${result.panel.validPanelRows}`],
    ['Struktur Panel', result.panel.isBalanced ? 'Balanced Panel' : 'Unbalanced Panel'],
    ['Klasifikasi Konstruk (Contoh A/B)', result.classification.finalClassification],
    ['Metode Utama Dijalankan', result.estimation.executedMethodLabel],
    ['Status Diagnostik Asumsi', result.diagnostics.overallStatus],
    ['Transformasi Aktif', result.transformation.activeTransformation],
    [],
    ['INTERPRETASI TEKNIS'],
    [result.technicalInterpretation],
    [],
    ['INTERPRETASI SEDERHANA (PENGGUNA UMUM)'],
    [result.simpleInterpretation]
  ]);

  appendFormulaSafeSheet(wb, '02_Descriptives_Step5', [
    ['STATISTIK DESKRIPTIF PANEL & KUALITAS DATA (STEP 5)'],
    ['Sumber', 'Satuan', 'N Valid', 'Missing (%)', 'Mean', 'Median', 'SD', 'Varians', 'Min', 'Max', 'Skewness', 'Excess Kurtosis', 'Between SD', 'Within SD', 'Outlier MAD'],
    ...result.descriptives.sourceStats.map(s => [
      s.displayName,
      s.unit,
      s.nValid,
      Number(s.missingPct.toFixed(2)),
      s.mean,
      s.median,
      s.sd,
      s.variance,
      s.min,
      s.max,
      s.skewness,
      s.kurtosisExcess,
      s.betweenEntitySd,
      s.withinEntitySd,
      s.outlierCountMad
    ])
  ]);

  appendFormulaSafeSheet(wb, '03_Diagnostics_Step6', [
    ['PENGUJIAN ASUMSI & DIAGNOSTIK MODEL (STEP 6)'],
    ['Pengujian', 'Tingkat Keterujian', 'Hipotesis / Kriteria', 'Statistik', 'Nilai', 'p-value', 'Status', 'Interpretasi'],
    ...result.diagnostics.items.map(d => [
      d.testName,
      d.testabilityTier,
      d.hypothesis,
      d.statisticLabel,
      d.statisticValue ?? '-',
      d.pValue ?? '-',
      d.status,
      d.interpretation
    ])
  ]);

  const estRows: unknown[][] = [['HASIL ESTIMASI UTAMA (STEP 8)'], ['Metode', result.estimation.executedMethodLabel], []];
  if (result.estimation.twoSourceResult) {
    const t2 = result.estimation.twoSourceResult;
    estRows.push(
      ['Metrik Kesepakatan 2 Sumber', 'Nilai', '95% Cluster CI / Catatan'],
      ['Mean Difference', t2.meanDifference, `[${t2.meanDifferenceCi95[0]}, ${t2.meanDifferenceCi95[1]}]`],
      ['Repeated-Measures SD Diff', t2.repeatedMeasuresSdDifference, `Between Var=${t2.betweenEntityDiffVariance}, Within Var=${t2.withinEntityDiffVariance}`],
      ['95% RM Limits of Agreement', `${t2.loaLowerRepeatedMeasures} s.d. ${t2.loaUpperRepeatedMeasures}`, t2.unit],
      ['Deming Slope', t2.demingSlope, `[${t2.demingSlopeCi95[0]}, ${t2.demingSlopeCi95[1]}]`],
      ['Deming Intercept', t2.demingIntercept, `[${t2.demingInterceptCi95[0]}, ${t2.demingInterceptCi95[1]}]`],
      ['Lin CCC', t2.linsCcc, t2.identificationBoundaryWarning]
    );
  } else {
    const list = result.estimation.tcaResult?.estimates ?? result.estimation.multiSourceResult?.estimates ?? [];
    estRows.push([
      'Sumber',
      'Satuan',
      'Intercept Kalibrasi α',
      'Slope Kalibrasi β',
      'Raw Error Variance',
      'Calibrated Error Variance',
      'Conversion Variance',
      'Total Comparable Error Variance',
      '95% CI Error Variance',
      'Error SD',
      '95% CI Error SD',
      'Relative Error (%)',
      'ETC R²',
      'SNR (dB)',
      'Bootstrap P(Rank #1) %',
      'Relative Rank'
    ]);
    for (const e of list) {
      estRows.push([
        e.displayName,
        e.unit,
        e.calibrationInterceptAlpha,
        e.calibrationSlopeBeta,
        e.rawErrorVariance,
        e.calibratedErrorVariance,
        e.propagatedConversionVariance,
        e.totalComparableErrorVariance,
        `[${e.errorVarianceCi95[0]}, ${e.errorVarianceCi95[1]}]`,
        e.errorStandardDeviation,
        `[${e.errorSdCi95[0]}, ${e.errorSdCi95[1]}]`,
        Number(e.relativeErrorPct.toFixed(2)),
        Number(e.etcCorrelationR2.toFixed(4)),
        Number(e.snrDb.toFixed(2)),
        Number(e.bootstrapRank1ProbPct.toFixed(2)),
        e.relativeRank ?? 'Not Identified'
      ]);
    }
  }
  appendFormulaSafeSheet(wb, '04_Main_Results_Step8', estRows);

  appendFormulaSafeSheet(wb, '05_Robustness_Step9', [
    ['ROBUSTNESS & SENSITIVITY ANALYSIS (STEP 9)'],
    ['Verdict', result.robustness.stabilityVerdict],
    ['Ranking Stability (%)', Number(result.robustness.rankingStabilityPct.toFixed(2))],
    [],
    ['Skenario', 'Kategori', 'N Obs', 'Teridentifikasi?', 'Peringkat #1', 'Berubah dari Utama?', 'Catatan'],
    ...result.robustness.scenarios.map(s => [
      s.scenarioLabel,
      s.category,
      s.nObs,
      s.identifiable ? 'YA' : 'TIDAK',
      s.topSourceName ?? '-',
      s.rankChangedFromBaseline ? 'YA' : 'TIDAK',
      s.conclusionNote
    ])
  ]);

  appendFormulaSafeSheet(wb, '06_Journal_Draft_Step10', [
    ['LAPORAN ARTIKEL ILMIAH 14 BAGIAN'],
    ['Judul', journal.title],
    ['Abstrak', journal.abstractText],
    ['Kata Kunci', journal.keywords],
    ['1. Pendahuluan', journal.introduction],
    ['2. Tinjauan Pustaka', journal.literatureReview],
    ['3. Metodologi Penelitian', journal.researchMethodology],
    ['4. Data dan Variabel', journal.dataAndVariables],
    ['5. Hasil Statistik', journal.statisticalResults],
    ['6. Pembahasan', journal.discussion],
    ['7. Analisis Ketahanan (Robustness)', journal.robustnessAnalysis],
    ['8. Kesimpulan', journal.conclusion],
    ['9. Keterbatasan Penelitian', journal.limitations],
    ['10. Daftar Pustaka', journal.referencesText],
    ['11. Lampiran Kode Stata', journal.appendixStataCommands]
  ]);

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function mkDocH1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 260, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '1D4ED8' } },
    children: [new TextRun({ text, bold: true, size: 24, color: '0F2942' })]
  });
}

function mkDocH2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 70 },
    children: [new TextRun({ text, bold: true, size: 21, color: '065F46' })]
  });
}

function mkDocPara(text: string): Paragraph[] {
  return text
    .split(/\n+/)
    .filter(Boolean)
    .map(
      line =>
        new Paragraph({
          spacing: { after: 110, line: 276 },
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: line, size: 20, color: '1E293B' })]
        })
    );
}

function mkDocMono(content: string): Paragraph {
  const lines = content.split('\n');
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 12, color: '1D4ED8' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
    },
    spacing: { before: 60, after: 140, line: 220 },
    children: lines.flatMap((ln, idx) => [
      new TextRun({ text: ln, font: 'Courier New', size: 16, color: '0F172A' }),
      ...(idx < lines.length - 1 ? [new TextRun({ break: 1 })] : [])
    ])
  });
}

function mkDocTable(headers: string[], rows: string[][], rightCols: number[] = []): Table {
  const borderSpec = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
  };
  const margins = { top: 80, bottom: 80, left: 100, right: 100 };
  const rightSet = new Set(rightCols);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, cIdx) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F2942' },
            margins,
            borders: borderSpec,
            children: [
              new Paragraph({
                alignment: rightSet.has(cIdx) ? AlignmentType.RIGHT : AlignmentType.LEFT,
                children: [new TextRun({ text: h, bold: true, size: 18, color: 'FFFFFF' })]
              })
            ]
          })
        )
      }),
      ...rows.map(
        (r, rIdx) =>
          new TableRow({
            children: r.map((cell, cIdx) =>
              new TableCell({
                shading: {
                  type: ShadingType.CLEAR,
                  color: 'auto',
                  fill: rIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF'
                },
                margins,
                borders: borderSpec,
                children: [
                  new Paragraph({
                    alignment: rightSet.has(cIdx) ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    children: [new TextRun({ text: cell, size: 17, color: '0F172A' })]
                  })
                ]
              })
            )
          })
      )
    ]
  });
}

export async function generateMsmaDocxBuffer(
  result: MsmaFullAnalysisResult,
  journal: MsmaJournalReportSections,
  datasetName: string,
  googleDocsOptimized = false
): Promise<Buffer> {
  const activeEsts =
    result.estimation.tcaResult?.estimates ?? result.estimation.multiSourceResult?.estimates ?? [];

  const mainResultTable = result.estimation.twoSourceResult
    ? mkDocTable(
        ['Metrik Kesepakatan 2 Sumber', 'Estimasi', '95% Cluster CI / Keterangan'],
        [
          [
            `Mean Difference (${result.estimation.twoSourceResult.source1Name} − ${result.estimation.twoSourceResult.source2Name})`,
            fmtAdaptive(result.estimation.twoSourceResult.meanDifference),
            `[${fmtAdaptive(result.estimation.twoSourceResult.meanDifferenceCi95[0])}, ${fmtAdaptive(result.estimation.twoSourceResult.meanDifferenceCi95[1])}]`
          ],
          [
            '95% Repeated-Measures Panel LoA',
            `[${fmtAdaptive(result.estimation.twoSourceResult.loaLowerRepeatedMeasures)}, ${fmtAdaptive(result.estimation.twoSourceResult.loaUpperRepeatedMeasures)}]`,
            `RM SD = ${fmtAdaptive(result.estimation.twoSourceResult.repeatedMeasuresSdDifference)}`
          ],
          [
            `Deming Slope (λ = ${result.estimation.twoSourceResult.demingErrorVarianceRatioLambda})`,
            result.estimation.twoSourceResult.demingSlope.toFixed(4),
            `[${result.estimation.twoSourceResult.demingSlopeCi95[0].toFixed(4)}, ${result.estimation.twoSourceResult.demingSlopeCi95[1].toFixed(4)}]`
          ],
          [
            'Lin Concordance (CCC)',
            result.estimation.twoSourceResult.linsCcc.toFixed(4),
            'Peringkat individual tidak diklaim pada J = 2 tanpa Ground Truth'
          ]
        ]
      )
    : mkDocTable(
        ['Sumber', 'Slope β', 'Cal. Error Var', 'Error SD (95% CI)', 'ETC R²', 'P(#1)', 'Rank'],
        activeEsts.map(e => [
          `${e.displayName} (${e.unit})`,
          e.calibrationSlopeBeta.toFixed(3),
          fmtAdaptive(e.totalComparableErrorVariance),
          `${fmtAdaptive(e.errorStandardDeviation)} [${fmtAdaptive(e.errorSdCi95[0])}, ${fmtAdaptive(e.errorSdCi95[1])}]`,
          `${(e.etcCorrelationR2 * 100).toFixed(2)}%`,
          `${e.bootstrapRank1ProbPct.toFixed(1)}%`,
          e.relativeRank ? `#${e.relativeRank}` : 'N/A'
        ]),
        [1, 2, 3, 4, 5, 6]
      );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } // 2.0 cm A4 margins
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: googleDocsOptimized
                      ? 'MSMA JOURNAL REPORT (GOOGLE DOCS COMPATIBLE DOCX)'
                      : 'MULTI-SOURCE MEASUREMENT ACCURACY ANALYSIS — SCIENTIFIC REPORT',
                    size: 16,
                    color: '64748B'
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${datasetName}  |  Halaman `, size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                  new TextRun({ text: ' dari ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' })
                ]
              })
            ]
          })
        },
        children: [
          new Paragraph({
            spacing: { after: 100 },
            children: [new TextRun({ text: journal.title, bold: true, size: 30, color: '0F2942' })]
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: `Dataset: ${datasetName}  ·  Panel: G=${result.panel.nEntities} × T=${result.panel.nPeriods} (N_CC=${result.descriptives.nCompleteCasesAllSources})  ·  Metode: ${result.estimation.executedMethodLabel}`,
                italics: true,
                size: 19,
                color: '065F46'
              })
            ]
          }),

          mkDocH2('Abstract'),
          ...mkDocPara(journal.abstractText),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({ text: 'Keywords: ', bold: true, size: 19, color: '0F2942' }),
              new TextRun({ text: journal.keywords, italics: true, size: 19, color: '334155' })
            ]
          }),

          mkDocH1('1. Introduction'),
          ...mkDocPara(journal.introduction),

          mkDocH1('2. Literature Review'),
          ...mkDocPara(journal.literatureReview),

          mkDocH1('3. Research Methodology & Mathematical Model'),
          ...mkDocPara(journal.researchMethodology),
          mkDocMono(
            'Persamaan Pengukuran Laten:\n  X_{k,it} = alpha_k + beta_k * T_{it} + varepsilon_{k,it}\nRumus Varians Galat TCA Terkalibrasi (J = 3):\n  sigma^2_{eps_1} = C_{11} - (C_{12} * C_{13}) / C_{23}\n  sigma^2_{eps_k,cal} = sigma^2_{eps_k} / tilde{beta}_k^2'
          ),

          mkDocH1('4. Data Description & Panel Structure'),
          ...mkDocPara(journal.dataAndVariables),
          new Paragraph({
            spacing: { before: 80, after: 60 },
            children: [new TextRun({ text: 'Tabel 1. Statistik Deskriptif Panel & Dekomposisi Variasi (xtsum)', bold: true, size: 19 })]
          }),
          mkDocTable(
            ['Sumber', 'Satuan', 'N', 'Mean', 'SD', 'Between SD', 'Within SD', 'Skew'],
            result.descriptives.sourceStats.map(s => [
              s.displayName,
              s.unit,
              String(s.nValid),
              fmtAdaptive(s.mean),
              fmtAdaptive(s.sd),
              fmtAdaptive(s.betweenEntitySd),
              fmtAdaptive(s.withinEntitySd),
              s.skewness.toFixed(2)
            ]),
            [2, 3, 4, 5, 6, 7]
          ),

          mkDocH1('5. Diagnostic & Assumption Testing'),
          new Paragraph({
            spacing: { before: 80, after: 60 },
            children: [new TextRun({ text: 'Tabel 2. Hasil Pengujian Asumsi Empiris vs Tidak Langsung', bold: true, size: 19 })]
          }),
          mkDocTable(
            ['Pengujian Asumsi', 'Keterujian', 'Status', 'Interpretasi Ringkas'],
            result.diagnostics.items.map(d => [d.testName, d.testabilityTier, d.status, d.interpretation])
          ),

          mkDocH1('6. Main Empirical Results'),
          ...mkDocPara(journal.statisticalResults),
          new Paragraph({
            spacing: { before: 80, after: 60 },
            children: [new TextRun({ text: `Tabel 3. Estimasi Utama — ${result.estimation.executedMethodLabel}`, bold: true, size: 19 })]
          }),
          mainResultTable,

          mkDocH1('7. Discussion & General Interpretation'),
          ...mkDocPara(journal.discussion),
          mkDocH2('Interpretasi Pengguna Umum (Non-Teknis)'),
          ...mkDocPara(result.simpleInterpretation),

          mkDocH1('8. Robustness & Sensitivity Analysis'),
          ...mkDocPara(journal.robustnessAnalysis),
          ...(result.robustness.scenarios.length > 0
            ? [
                new Paragraph({
                  spacing: { before: 80, after: 60 },
                  children: [new TextRun({ text: 'Tabel 4. Evaluasi Stabilitas Peringkat Lintas Skenario', bold: true, size: 19 })]
                }),
                mkDocTable(
                  ['Skenario Sensitivitas', 'N', 'Sumber #1', 'Stabil?', 'Kesimpulan'],
                  result.robustness.scenarios.map(s => [
                    s.scenarioLabel,
                    String(s.nObs),
                    s.topSourceName ?? 'N/A',
                    s.rankChangedFromBaseline ? 'Bergeser' : 'Stabil',
                    s.conclusionNote
                  ]),
                  [1]
                )
              ]
            : []),

          mkDocH1('9. Conclusion & Limitations'),
          ...mkDocPara(journal.conclusion),
          mkDocH2('Limitations'),
          ...mkDocPara(journal.limitations),

          mkDocH1('10. References (Crossref-Verified)'),
          ...mkDocPara(journal.referencesText),

          mkDocH1('11. Appendix A — Stata-Compatible Replicated Output Compilation'),
          ...result.stataCompilation.flatMap(sec => [
            mkDocH2(sec.sectionTitle),
            mkDocMono(sec.replicatedOutput)
          ]),

          mkDocH1('12. Appendix B — Executable Stata 17/18 & Mata Master Do-File'),
          mkDocMono(journal.appendixStataCommands)
        ]
      }
    ]
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function escapePdfAscii(text: string): string {
  const ascii = text
    .replace(/CO₂/g, 'CO2')
    .replace(/[₀]/g, '0')
    .replace(/[₁]/g, '1')
    .replace(/[₂]/g, '2')
    .replace(/[₃]/g, '3')
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/[α]/g, 'alpha')
    .replace(/[β]/g, 'beta')
    .replace(/[ε]/g, 'eps')
    .replace(/[λ]/g, 'lambda')
    .replace(/[μ]/g, 'mu')
    .replace(/[ρ]/g, 'rho')
    .replace(/[σ]/g, 'sigma')
    .replace(/[θ]/g, 'theta')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/[≠]/g, '!=')
    .replace(/[±]/g, '+/-')
    .replace(/[×]/g, 'x')
    .replace(/[·•]/g, '*')
    .replace(/[–—−]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ');
  return ascii.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLines(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const w of words) {
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export function generateMsmaJournalPdfBuffer(
  result: MsmaFullAnalysisResult,
  journal: MsmaJournalReportSections,
  datasetName: string
): Buffer {
  interface PdfLine {
    text: string;
    font: 'F1' | 'F2' | 'F3';
    size: number;
    leading: number;
  }

  const lines: PdfLine[] = [];
  const spacer = (leading = 8) => lines.push({ text: '', font: 'F1', size: 9, leading });
  const h1 = (t: string) => {
    spacer(9);
    wrapLines(t.toUpperCase(), 78).forEach(l =>
      lines.push({ text: l, font: 'F2', size: 10.5, leading: 15 })
    );
  };
  const body = (t: string) => {
    wrapLines(t, 90).forEach(l =>
      lines.push({ text: l, font: 'F1', size: 9, leading: 12.5 })
    );
  };
  const mono = (t: string) => {
    t.split('\n').forEach(raw => {
      const chunks = raw.length <= 92 ? [raw] : [raw.slice(0, 92), `  ${raw.slice(92, 182)}`];
      chunks.forEach(c => lines.push({ text: c, font: 'F3', size: 7.4, leading: 10 }));
    });
  };

  wrapLines(journal.title, 72).forEach(l =>
    lines.push({ text: l, font: 'F2', size: 12.5, leading: 17 })
  );
  body(
    `Dataset: ${datasetName} | Panel: G=${result.panel.nEntities}, T=${result.panel.nPeriods}, N_CC=${result.descriptives.nCompleteCasesAllSources} | Method: ${result.estimation.executedMethodLabel}`
  );
  spacer(6);
  h1('Abstract');
  body(journal.abstractText);
  body(`Keywords: ${journal.keywords}`);

  h1('1. Introduction');
  body(journal.introduction);

  h1('2. Literature Review');
  body(journal.literatureReview);

  h1('3. Research Methodology & Mathematical Formulation');
  body(journal.researchMethodology);
  mono(
    'Measurement Equation: X_{k,it} = alpha_k + beta_k * T_{it} + eps_{k,it}\nCalibrated TCA Error Variance: sigma^2_{eps_1} = C_11 - (C_12 * C_13) / C_23 ; sigma^2_{eps_k,cal} = sigma^2_{eps_k} / beta_k^2'
  );

  h1('4. Data, Panel Structure & Descriptive Statistics');
  body(journal.dataAndVariables);
  if (result.stataCompilation[3]) {
    mono(result.stataCompilation[3].replicatedOutput);
  }

  h1('5. Diagnostic & Assumption Evaluation');
  if (result.stataCompilation[4]) {
    mono(result.stataCompilation[4].replicatedOutput);
  }

  h1('6. Main Statistical Results (Table 3)');
  body(journal.statisticalResults);
  if (result.stataCompilation[6]) {
    mono(result.stataCompilation[6].replicatedOutput);
  }

  h1('7. Discussion & General Interpretation');
  body(journal.discussion);
  body(`General Summary: ${result.simpleInterpretation}`);

  h1('8. Robustness & Sensitivity Analysis (Table 4)');
  body(journal.robustnessAnalysis);
  if (result.stataCompilation[7]) {
    mono(result.stataCompilation[7].replicatedOutput);
  }

  h1('9. Conclusion & Limitations');
  body(journal.conclusion);
  body(journal.limitations);

  h1('10. References');
  body(journal.referencesText);

  h1('11. Appendix: Executable Stata 17/18 & Mata Commands');
  mono(journal.appendixStataCommands);

  // Paginate onto A4 (595.28 x 841.89 pt, 50pt margins)
  const TOP_Y = 782;
  const BOT_Y = 56;
  const pages: PdfLine[][] = [];
  let cur: PdfLine[] = [];
  let yCursor = TOP_Y;

  for (const ln of lines) {
    if (yCursor - ln.leading < BOT_Y && cur.length > 0) {
      pages.push(cur);
      cur = [];
      yCursor = TOP_Y;
    }
    cur.push(ln);
    yCursor -= ln.leading;
  }
  if (cur.length > 0 || pages.length === 0) pages.push(cur);

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  const firstPageObj = 6;
  const pageObjIds = pages.map((_, i) => firstPageObj + i * 2);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`
  );
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj');

  pages.forEach((pLines, idx) => {
    const pObj = firstPageObj + idx * 2;
    const cObj = pObj + 1;
    let y = TOP_Y;
    const cmds: string[] = [
      'q',
      '0.09 0.25 0.52 RG 0.8 w 48 796 m 547 796 l S',
      '0.75 0.80 0.86 RG 0.5 w 48 44 m 547 44 l S',
      'Q',
      'BT',
      '/F1 7.5 Tf 0.35 0.42 0.48 rg',
      '1 0 0 1 48 804 Tm',
      '(MULTI-SOURCE MEASUREMENT ACCURACY ANALYSIS — JOURNAL ARTICLE REPORT) Tj',
      `1 0 0 1 48 31 Tm`,
      `(${escapePdfAscii(datasetName)} | Page ${idx + 1} of ${pages.length}) Tj`,
      '0 0 0 rg'
    ];

    for (const ln of pLines) {
      if (ln.text) {
        cmds.push(`/${ln.font} ${ln.size} Tf`);
        cmds.push(`1 0 0 1 48 ${y.toFixed(2)} Tm`);
        cmds.push(`(${escapePdfAscii(ln.text)}) Tj`);
      }
      y -= ln.leading;
    }
    cmds.push('ET');

    const stream = cmds.join('\n');
    objects.push(
      `${pObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${cObj} 0 R >>\nendobj`
    );
    objects.push(
      `${cObj} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${obj}\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}
