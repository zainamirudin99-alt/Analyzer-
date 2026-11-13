// ============================================================
// Panel Latent Variable Measurement Model — Word (.docx) Export
// 14-Chapter Academic Research Report in Indonesian
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
import { PanelLatentFitResult } from './panel-latent-types';

function h1(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 260, after: 120 }
  });
}

function para(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 110 }
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

export async function generatePanelLatentDocx(
  result: PanelLatentFitResult,
  datasetName = 'Dataset_CO2_Panel.xlsx'
): Promise<Buffer> {
  const ciPct = Math.round((result.spec.ciLevel || 0.95) * 100);

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'LAPORAN PENELITIAN: PANEL LATENT VARIABLE MEASUREMENT MODEL',
                bold: true,
                size: 28
              })
            ],
            spacing: { after: 100 }
          }),
          para(`Integrasi Tiga Sumber Pengukuran Emisi CO₂ | Model Bayesian Hierarkis | Dataset: ${datasetName}`),

          h1('1. Deskripsi Data'),
          para(
            `Dataset memuat ${result.nObs} observasi kota-tahun yang mencakup ${result.nCities} kota selama ${result.nYears} periode tahun (status panel: ${result.isBalanced ? 'seimbang/balanced' : 'tidak seimbang/unbalanced'}). Ketiga sumber pengukuran meliputi ${result.mapping.x1Label} (${result.mapping.x1Col}), ${result.mapping.x2Label} (${result.mapping.x2Col}), dan ${result.mapping.x3Label} (${result.mapping.x3Col}) pada satuan ${result.scaleContext.workingUnitNote}.`
          ),

          h1('2. Metodologi Penelitian'),
          para(
            'Penelitian ini menggunakan Bayesian Hierarchical Latent Variable Measurement Model yang memandang ketiga sumber (X1, X2, X3) sebagai indikator teramati dari satu konstruk emisi CO₂ laten (Y*_it), bukan sebagai prediktor regresi linear biasa.'
          ),

          h1('3. Spesifikasi Model'),
          para(
            `Likelihood: ${result.spec.likelihood === 'student_t' ? `Student-t (df=${result.spec.studentTDf})` : 'Gaussian Normal'}; Rezim Prior: ${result.spec.priorRegime}; Efek Acak Kota (u_i): ${result.spec.includeCityIntercept ? 'Aktif' : 'Nonaktif'}; Efek Waktu (γ_t): ${result.spec.includeTimeEffect ? 'Aktif' : 'Nonaktif'}; AR(1) ρ: ${result.spec.includeAR1 ? 'Aktif (jika T≥3)' : 'Nonaktif'}.`
          ),

          h1('4. Persamaan Matematis'),
          para('Persamaan Pengukuran: X_j,it = α_j + λ_j · Y*_it + ε_j,it untuk j ∈ {1 (Self-Reporting), 2 (Satellite), 3 (Sensor)}.'),
          para('Struktur Laten Panel: Y*_it = μ + u_i + γ_t + ρ(Y*_i,t-1 - μ - u_i - γ_t-1) + η_it.'),
          para('Reliabilitas Sumber: Reliability_j = (λ_j² · Var(Y*)) / (λ_j² · Var(Y*) + σ²_ε,j).'),

          h1('5. Asumsi Identifikasi'),
          para(result.interpretations.methodologyAndIdentificationNote),

          h1('6. Proses Estimasi'),
          para(
            `Estimasi dijalankan oleh ${result.engineAttribution} dengan ${result.diagnostics.chains} rantai independen, ${result.diagnostics.warmup} iterasi warmup, dan ${result.diagnostics.drawsPerChain} post-warmup draws per rantai (total ${result.diagnostics.totalPostWarmupDraws} draws posterior).`
          ),

          h1('7. Hasil Diagnostik Konvergensi'),
          para(result.interpretations.diagnosticsInterpretation),

          h1('8. Estimasi Parameter Posterior (Gaya Stata)'),
          makeTable(
            ['Parameter', 'Mean', 'SD', `${ciPct}% CI`, 'R-hat', 'ESS'],
            result.parameters.map(p => [
              p.label,
              p.mean.toFixed(4),
              p.sd.toFixed(4),
              `[${p.ciLower.toFixed(3)}, ${p.ciUpper.toFixed(3)}]`,
              p.rHat.toFixed(4),
              String(p.essBulk)
            ])
          ),

          h1('9. Perbandingan Ketiga Sumber Pengukuran'),
          makeTable(
            ['Sumber', 'Rel. Bias (α)', 'Loading (λ)', 'Error Var (σ²_ε)', 'Reliability', 'Uncertainty (σ_ε)'],
            result.sourceComparison.map(s => [
              s.sourceLabel,
              s.isAnchor ? '0.000 (Anchor)' : s.relativeBiasMean.toFixed(3),
              s.isAnchor ? '1.000 (Anchor)' : s.loadingMean.toFixed(3),
              s.errorVarianceMean.toFixed(3),
              `${(s.reliability * 100).toFixed(2)}%`,
              s.uncertaintySd.toFixed(3)
            ])
          ),
          para(result.interpretations.reliabilityInterpretation),

          h1('10. Estimasi Nilai Laten Emisi CO₂ (Cuplikan 30 Baris Pertama)'),
          makeTable(
            ['Kota', 'Tahun', 'X1', 'X2', 'X3', 'Est. Y*', `${ciPct}% CI`],
            result.latentEstimates.slice(0, 30).map(e => [
              e.city,
              String(e.year),
              e.x1 === null ? 'NA' : e.x1.toFixed(2),
              e.x2 === null ? 'NA' : e.x2.toFixed(2),
              e.x3 === null ? 'NA' : e.x3.toFixed(2),
              e.latentMean.toFixed(2),
              `[${e.ciLower.toFixed(2)}, ${e.ciUpper.toFixed(2)}]`
            ])
          ),

          h1('11. Interpretasi Hasil'),
          para(result.interpretations.parameterInterpretation),
          para(result.interpretations.latentEmissionInterpretation),
          para(result.interpretations.sensitivityInterpretation),

          h1('12. Keterbatasan Penelitian'),
          ...result.interpretations.researchLimitations.map(lim => para(`• ${lim}`)),

          h1('13. Kesimpulan'),
          para(result.interpretations.finalConclusion),

          h1('14. Referensi Teknis'),
          para('1. Stan Development Team — Stan Users Guide: Measurement Error Models (https://mc-stan.org/docs/stan-users-guide/measurement-error.html).'),
          para('2. Stan Example Models Repository (https://github.com/stan-dev/example-models).'),
          para('3. Multilevel Latent Time Series Models — mlts (https://github.com/munchfab/mlts).'),
          para('4. Bürkner, P.-C. — brms: Bayesian Regression Models using Stan (https://github.com/paul-buerkner/brms).'),
          para('5. Vehtari, A., Gelman, A., Simpson, D., Carpenter, B., & Bürkner, P.-C. (2021). Rank-Normalization, Folding, and Localization: An Improved R-hat for Assessing Convergence of MCMC. Bayesian Analysis.')
        ]
      }
    ]
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}

