// ============================================================
// Comparative Measurement Accuracy Assessment — Word (.docx) Export
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
  const refTag = `${result.referenceSource.name} (${result.referenceSource.label})`;

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'LAPORAN ANALISIS KOMPARATIF AKURASI PENGUKURAN EMISI CO₂ BERBASIS DATA PANEL',
                bold: true,
                size: 28
              })
            ],
            spacing: { after: 120 }
          }),
          para(
            `Dataset: ${datasetName} | Sumber Referensi (r): ${refTag} | Pasangan Complete-Case: ${result.datasetMeta.nCompletePairs} (${result.datasetMeta.nCities} Kota × ${result.datasetMeta.nYears} Tahun)`
          ),

          h1('1. Validitas Sumber Referensi & Kualitas Data'),
          para(result.interpretations.referenceValidityInterpretation),

          h1('2. Analisis Korelasi Panel (Overall, Within-City, First-Difference)'),
          para(result.interpretations.edaAndCorrelationInterpretation),

          h1('3. Metrik Akurasi (MAE, RMSE, MBE), Lin\'s CCC & Bland-Altman Agreement'),
          makeTable(
            ['Sumber Pembanding', 'N (CC/Av)', 'MAE [95% CI]', 'RMSE', 'MBE (p)', 'Lin CCC [95% CI]', '95% LoA Bland-Altman'],
            result.metrics.map(m => [
              m.sourceLabel,
              `${m.nCompleteCase}/${m.nAvailableCase}`,
              `${m.mae.toFixed(3)} [${m.maeCiLower.toFixed(2)}, ${m.maeCiUpper.toFixed(2)}]`,
              m.rmse.toFixed(3),
              `${m.mbe.toFixed(3)} (${m.mbePValue.toFixed(4)})`,
              `${m.ccc.ccc.toFixed(4)} [${m.ccc.ciLower.toFixed(3)}, ${m.ccc.ciUpper.toFixed(3)}]`,
              `[${m.blandAltman.loaLower.toFixed(2)}, ${m.blandAltman.loaUpper.toFixed(2)}]`
            ])
          ),
          para(result.interpretations.accuracyAndAgreementInterpretation),

          h1('4. Model Inferensial Panel — Pair Fixed Effects & Wild Cluster Bootstrap'),
          makeTable(
            ['Kontras Sumber (A vs B)', 'MAE_A - MAE_B', 'Cluster SE', 't-stat', 'Cluster p', 'Wild Bootstrap p', 'Wild 95% CI'],
            result.pairFixedEffects.pairwiseContrasts.length > 0
              ? result.pairFixedEffects.pairwiseContrasts.map(c => [
                  `${c.sourceALabel} vs ${c.sourceBLabel}`,
                  c.diffAminusB.toFixed(3),
                  c.seCluster.toFixed(3),
                  c.tStat.toFixed(2),
                  c.pValueCluster.toFixed(4),
                  c.wildBootstrapPValue.toFixed(4),
                  `[${c.wildBootstrapCiLower.toFixed(2)}, ${c.wildBootstrapCiUpper.toFixed(2)}]`
                ])
              : [['(Hanya 1 sumber pembanding)', '-', '-', '-', '-', '-', '-']]
          ),
          para(result.interpretations.pairFixedEffectsInterpretation),

          h1('5. Diagnostik Statistik & Keterbatasan Inferensi'),
          para(result.interpretations.diagnosticsInterpretation),

          h1('6. Pemeringkatan Sumber Pembanding & Kesimpulan Akhir'),
          makeTable(
            ['Peringkat', 'Sumber Pembanding', 'MAE', 'RMSE', 'MBE', 'Lin CCC', 'Catatan Evaluasi'],
            result.ranking.ranks.map(r => [
              `#${r.rank}`,
              r.sourceLabel,
              r.mae.toFixed(3),
              r.rmse.toFixed(3),
              r.mbe.toFixed(3),
              r.ccc.toFixed(4),
              r.rankNote
            ])
          ),
          para(result.interpretations.rankingDecisionInterpretation),

          h1('7. Keterbatasan Penelitian'),
          ...result.interpretations.researchLimitations.map(lim => para(`- ${lim}`))
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
