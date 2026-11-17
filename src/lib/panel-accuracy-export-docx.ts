// ============================================================
// Reference-Free All-Source Latent & Consensus Assessment
// Word (.docx) Export
// ============================================================

import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import { PanelAccuracyFitResult } from './panel-accuracy-types';

function h1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 110 }
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 21 })],
    spacing: { after: 100 }
  });
}

function makeTable(headers: string[], rows: string[][]): Table {
  const mkCell = (text: string, bold = false) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
      }
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(h => mkCell(h, true)) }),
      ...rows.map(r => new TableRow({ children: r.map(c => mkCell(c, false)) }))
    ]
  });
}

export async function generatePanelAccuracyDocx(
  result: PanelAccuracyFitResult,
  datasetName = 'Dataset_Panel_Accuracy.xlsx'
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'LAPORAN REFERENCE-FREE ALL-SOURCE LATENT & CONSENSUS ACCURACY ASSESSMENT',
                bold: true,
                size: 28
              })
            ],
            spacing: { after: 120 }
          }),
          para(
            `Dataset: ${datasetName} | Sumber Dievaluasi: J = ${result.sources.length} (Tanpa Reference Terkunci) | Complete-Case: ${result.datasetMeta.nCompletePairs} (${result.datasetMeta.nCities} Kota × ${result.datasetMeta.nYears} Tahun) | Max R-hat = ${result.latentModel.maxRhat.toFixed(4)}`
          ),

          h1('1. Identifikasi Model Laten & Kualitas Data'),
          para(result.interpretations.referenceValidityInterpretation),

          h1('2. Korelasi Panel (Overall, Within-City, First-Difference)'),
          para(result.interpretations.edaAndCorrelationInterpretation),

          h1('3. Bayesian Hierarchical Latent Model & Agreement (Seluruh J Sumber)'),
          makeTable(
            ['Sumber', 'Tot Latent RMSE', 'Error SD (σ_ε)', 'Reliabilitas R²', 'Alpha (α)', 'P(Best)', 'LOSO MAE', 'Lin CCC'],
            result.metrics.map(m => [
              m.sourceLabel,
              `${m.totalLatentRmse.toFixed(2)} [${m.totalLatentRmseCiLower.toFixed(1)}, ${m.totalLatentRmseCiUpper.toFixed(1)}]`,
              m.errorSd.toFixed(2),
              `${(m.reliabilityR2 * 100).toFixed(2)}%`,
              `${m.latentInterceptBias >= 0 ? '+' : ''}${m.latentInterceptBias.toFixed(2)}`,
              `${(m.posteriorProbBest * 100).toFixed(1)}%`,
              m.mae.toFixed(2),
              m.ccc.ccc.toFixed(4)
            ])
          ),
          para(result.interpretations.accuracyAndAgreementInterpretation),

          h1('4. Model Inferensial Pair Fixed Effects & Kontras Antarsumber'),
          makeTable(
            ['Kontras (A vs B)', 'ΔMAE (A - B)', 'Cluster SE', 'Cluster p', 'Wild Boot p', 'P_Bayes (A < B)'],
            result.pairFixedEffects.pairwiseContrasts.map(c => [
              `${c.sourceALabel} vs ${c.sourceBLabel}`,
              c.diffAminusB.toFixed(3),
              c.seCluster.toFixed(3),
              c.pValueCluster.toFixed(4),
              c.wildBootstrapPValue.toFixed(4),
              `${(c.posteriorProbABetterThanB * 100).toFixed(1)}%`
            ])
          ),
          para(result.interpretations.pairFixedEffectsInterpretation),

          h1('5. Diagnostik MCMC & Struktur Error Panel'),
          para(result.interpretations.diagnosticsInterpretation),

          h1('6. Pemeringkatan Akhir Seluruh Sumber (#1 s/d #' + result.ranking.ranks.length + ')'),
          makeTable(
            ['Peringkat', 'Sumber', 'Total RMSE', 'Error SD', 'R²', 'P(Best)', 'Catatan Evaluasi'],
            result.ranking.ranks.map(r => [
              `#${r.rank}`,
              r.sourceLabel,
              r.totalLatentRmse.toFixed(2),
              r.errorSd.toFixed(2),
              `${(r.reliabilityR2 * 100).toFixed(2)}%`,
              `${(r.posteriorProbBest * 100).toFixed(1)}%`,
              r.rankNote
            ])
          ),
          para(result.interpretations.rankingDecisionInterpretation),

          h1('7. Keterbatasan Epistemologis & Penelitian'),
          ...result.interpretations.researchLimitations.map(lim => para(`- ${lim}`))
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
