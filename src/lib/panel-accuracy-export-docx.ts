// ============================================================
// Model Pengukuran Laten & Akurasi Panel (ISO 5725)
// Generator Laporan Word (.docx) Rapi & Komplit Step 1–9
// ============================================================

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
import { fmtSmart } from './panel-accuracy-interpretation';
import { PanelAccuracyFitResult } from './panel-accuracy-types';

function h1(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        color: '0F2942'
      })
    ],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 110 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 8, color: '1D4ED8' }
    }
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 21,
        color: '065F46'
      })
    ],
    spacing: { before: 180, after: 80 }
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, color: '1E293B' })],
    spacing: { after: 100, line: 276 }
  });
}

function monoBlock(title: string, content: string): Paragraph[] {
  const lines = content.split('\n');
  return [
    h2(title),
    new Paragraph({
      children: lines.flatMap((line, idx) => [
        new TextRun({
          text: line,
          font: 'Courier New',
          size: 16,
          color: '0F172A'
        }),
        ...(idx < lines.length - 1 ? [new TextRun({ break: 1 })] : [])
      ]),
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F8FAFC' },
      border: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 12, color: '0F766E' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
      },
      spacing: { before: 60, after: 140, line: 220 }
    })
  ];
}

function makeTable(headers: string[], rows: string[][]): Table {
  const borderSpec = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
  };

  const cellMargins = { top: 80, bottom: 80, left: 100, right: 100 };

  const mkHeaderCell = (text: string) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: 18, color: 'FFFFFF' })]
        })
      ],
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: '0F2942' },
      margins: cellMargins,
      borders: borderSpec
    });

  const mkDataCell = (text: string, rowIdx: number, colIdx: number) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: colIdx === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
          children: [new TextRun({ text, size: 17, color: '0F172A' })]
        })
      ],
      shading: {
        type: ShadingType.CLEAR,
        color: 'auto',
        fill: rowIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF'
      },
      margins: cellMargins,
      borders: borderSpec
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map(h => mkHeaderCell(h)) }),
      ...rows.map((r, rIdx) => new TableRow({ children: r.map((c, cIdx) => mkDataCell(c, rIdx, cIdx)) }))
    ]
  });
}

export async function generatePanelAccuracyDocx(
  result: PanelAccuracyFitResult,
  datasetName = 'Dataset_Panel_Accuracy.xlsx'
): Promise<Buffer> {
  const ordered = result.stataOutput.orderedStepOutputs || [];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'MODEL PENGUKURAN LATEN & AKURASI PANEL (ISO 5725)',
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
                  new TextRun({ text: `${datasetName}   |   Halaman `, size: 16, color: '64748B' }),
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
            children: [
              new TextRun({
                text: 'LAPORAN MODEL PENGUKURAN LATEN & AKURASI PANEL (ISO 5725)',
                bold: true,
                size: 30,
                color: '0F2942'
              })
            ],
            spacing: { after: 80 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Komparasi Bayesian Multi-Sumber Tanpa Reference Source — Laporan Lengkap Step 1 s.d. Step 9',
                bold: true,
                size: 21,
                color: '065F46'
              })
            ],
            spacing: { after: 140 }
          }),
          makeTable(
            ['Parameter Ringkasan', 'Nilai Aktual'],
            [
              ['Dataset', datasetName],
              ['Mesin Komputasi', result.engineAttribution],
              ['Sumber Dievaluasi (J Setara)', result.sources.map(s => `${s.name} (${s.label})`).join(', ')],
              ['Struktur Panel (G × T)', `G = ${result.datasetMeta.nCities} entitas × T = ${result.datasetMeta.nYears} periode (${result.datasetMeta.isBalanced ? 'Balanced' : 'Unbalanced'})`],
              ['Sampel Complete-Case / Raw', `${result.datasetMeta.nCompletePairs} / ${result.datasetMeta.nObsRaw} baris`],
              ['Konvergensi MCMC', `Max R-hat = ${result.latentModel.maxRhat.toFixed(4)} | Min ESS = ${result.latentModel.minEss} | PPP = ${result.latentModel.posteriorPredictivePValue.toFixed(3)}`],
              ['Status Keputusan Ranking', result.ranking.canonicalStatus],
              ['Kandidat Terbaik Relatif (#1)', result.ranking.bestSourceLabel || result.ranking.bestCandidateLabel || 'Belum Dapat Ditetapkan Secara Mutlak']
            ]
          ),

          h1('Step 1–3. Audit Kualitas Data, Identifiabilitas & Prapemrosesan'),
          makeTable(
            ['Indikator Audit Kualitas', 'Level', 'Jumlah', 'Keterangan'],
            result.qualityReport.checks.map(c => [c.title, c.severity.toUpperCase(), String(c.count), c.message])
          ),
          para(result.interpretations.referenceValidityInterpretation),

          h1('Step 4. Exploratory Data Analysis (EDA) & Korelasi Panel'),
          makeTable(
            ['Sumber', 'N', 'Mean', 'SD', 'Median', 'IQR', 'CV (%)', 'Skewness'],
            result.eda.descriptives.map(d => [
              d.sourceLabel,
              String(d.n),
              fmtSmart(d.mean),
              fmtSmart(d.sd),
              fmtSmart(d.median),
              fmtSmart(d.iqr),
              `${d.cv.toFixed(1)}%`,
              d.skewness.toFixed(2)
            ])
          ),
          para(result.interpretations.edaAndCorrelationInterpretation),

          h1('Step 5. Bayesian Hierarchical Latent Model & Korelasi Residual'),
          makeTable(
            ['Sumber', 'Alpha (α)', 'Lambda (λ)', 'Error SD (σ_ε)', 'Scale Dist.', 'Rel R²', 'ESS', 'R-hat'],
            result.latentModel.sourceEstimates.map(se => [
              se.sourceLabel,
              `${se.interceptBiasAlpha >= 0 ? '+' : ''}${fmtSmart(se.interceptBiasAlpha)}`,
              se.loadingLambda.toFixed(3),
              fmtSmart(se.errorSd),
              fmtSmart(se.scaleDistortionComponent),
              `${(se.reliabilityR2 * 100).toFixed(2)}%`,
              String(Math.round(se.mcmcEss)),
              se.mcmcRhat.toFixed(4)
            ])
          ),

          h1('Step 6. Akurasi ISO 5725, Validasi LOSO, Pair FE & Driscoll-Kraay SE'),
          makeTable(
            ['Sumber', 'Tot Latent RMSE [95% CrI]', 'LOSO MAE', 'Cov95%', 'Lin CCC', 'Exp Loss', 'Exp Rank', 'Stab (%)'],
            result.metrics.map(m => [
              m.sourceLabel,
              `${fmtSmart(m.totalLatentRmse)} [${fmtSmart(m.totalLatentRmseCiLower)}, ${fmtSmart(m.totalLatentRmseCiUpper)}]`,
              fmtSmart(m.mae),
              `${m.losoPredictiveCoverage95.toFixed(1)}%`,
              m.ccc.ccc.toFixed(4),
              fmtSmart(m.posteriorExpectedLoss),
              m.expectedRank.toFixed(2),
              `${m.rankingStabilityPct.toFixed(1)}%`
            ])
          ),
          para(result.interpretations.accuracyAndAgreementInterpretation),
          h2('Kontras Berpasangan Antarsumber (Cluster SE, Driscoll-Kraay SE, Wild Bootstrap)'),
          makeTable(
            ['Kontras (A vs B)', 'ΔMAE (A - B)', 'Cluster SE', 'DK SE', 'Cluster p', 'WildBoot p', 'P_Bayes (A < B)'],
            result.pairFixedEffects.pairwiseContrasts.map(c => [
              `${c.sourceALabel} vs ${c.sourceBLabel}`,
              fmtSmart(c.diffAminusB),
              fmtSmart(c.seCluster),
              c.seDriscollKraay !== undefined ? fmtSmart(c.seDriscollKraay) : '-',
              c.pValueCluster.toFixed(4),
              c.wildBootstrapPValue.toFixed(4),
              `${(c.posteriorProbABetterThanB * 100).toFixed(1)}%`
            ])
          ),
          para(result.interpretations.pairFixedEffectsInterpretation),

          h1('Step 7. Diagnostik Panel, Audit Klaster & Sensitivitas'),
          makeTable(
            ['Uji Diagnostik', 'Statistik', 'df', 'p-value', 'Status', 'Kesimpulan'],
            [
              result.diagnostics.heteroskedasticityTest,
              result.diagnostics.serialCorrelationTest,
              result.diagnostics.crossSectionalDependenceTest
            ].map(d => [
              d.testName,
              d.statisticValue.toFixed(3),
              d.dfLabel,
              d.pValue !== null ? d.pValue.toFixed(4) : '-',
              d.status.toUpperCase(),
              d.conclusion
            ])
          ),
          para(result.interpretations.diagnosticsInterpretation),

          h1(`Step 8. Pemeringkatan Akhir (#1 s/d #${result.ranking.ranks.length}) & 8-Poin Mengapa Terbaik`),
          makeTable(
            ['Peringkat', 'Sumber', 'Total RMSE', 'Error SD', 'Rel R²', 'P(Best)', 'Exp Rank', 'WB p vs #1', 'Catatan Evaluasi'],
            result.ranking.ranks.map(r => [
              `#${r.rank}`,
              r.sourceLabel,
              fmtSmart(r.totalLatentRmse),
              fmtSmart(r.errorSd),
              `${(r.reliabilityR2 * 100).toFixed(2)}%`,
              `${(r.posteriorProbBest * 100).toFixed(1)}%`,
              r.expectedRank.toFixed(2),
              r.pValueVsTopWildBootstrap !== null ? r.pValueVsTopWildBootstrap.toFixed(4) : '-',
              r.rankNote
            ])
          ),
          h2(`Analisis 8-Poin: ${result.ranking.whyBestAnalysis.headline}`),
          makeTable(
            ['Dimensi Evaluasi', 'Temuan Empiris & Bukti'],
            result.ranking.whyBestAnalysis.points.map(pt => [pt.label, pt.detail])
          ),
          para(result.interpretations.rankingDecisionInterpretation),

          h1('Step 9A. Keterbatasan Epistemologis & Kesimpulan Akhir'),
          ...result.interpretations.researchLimitations.map(lim => para(`- ${lim}`)),
          para(`Kesimpulan Akhir: ${result.interpretations.finalConclusion}`),

          h1('Step 9B. Output Tabel Stata Terurut (Step 1 s.d. Step 9)'),
          ...(ordered.length > 0
            ? ordered.flatMap(st => monoBlock(`${st.stepTitle} (. ${st.stataCommand})`, st.outputTableText))
            : [
                ...monoBlock('Header & Konvergensi', result.stataOutput.headerConsoleText),
                ...monoBlock('Tabel 1. Metrik Laten', result.stataOutput.accuracyMetricsTableText),
                ...monoBlock('Tabel 2. Lin CCC & Bland-Altman', result.stataOutput.cccAndBlandAltmanTableText),
                ...monoBlock('Tabel 3. Pair Fixed Effects', result.stataOutput.pairFixedEffectsTableText),
                ...monoBlock('Tabel 4. Kontras Berpasangan', result.stataOutput.pairwiseContrastsTableText),
                ...monoBlock('Tabel 5. Diagnostik & Ranking', result.stataOutput.diagnosticsAndRankingText)
              ]),

          h1('Lampiran. Kode Master Stata Reproduksi (.do)'),
          ...monoBlock('Stata Master Do-File', result.generatedCode.stataDoFile)
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
