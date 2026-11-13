// ============================================================
// Panel Latent Variable Measurement Model — Excel (.xlsx) & CSV Export
// ============================================================

import * as XLSX from 'xlsx';
import { sanitizeSpreadsheetText } from './panel-latent-data';
import { PanelLatentFitResult } from './panel-latent-types';

function fitSheetColumns(rows: any[][]): XLSX.ColInfo[] {
  if (!rows || rows.length === 0) return [];
  const colCount = Math.max(...rows.map(r => r.length));
  const widths: number[] = new Array(colCount).fill(12);
  rows.forEach(r => {
    for (let i = 0; i < colCount; i++) {
      const len = String(r[i] ?? '').length;
      if (len + 3 > widths[i]) widths[i] = Math.min(60, len + 3);
    }
  });
  return widths.map(wch => ({ wch }));
}

function addSheet(wb: XLSX.WorkBook, name: string, aoa: any[][]) {
  const safeAoa = aoa.map(row =>
    row.map(cell => (typeof cell === 'string' ? sanitizeSpreadsheetText(cell) : cell))
  );
  const ws = XLSX.utils.aoa_to_sheet(safeAoa);
  ws['!cols'] = fitSheetColumns(safeAoa);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

export function generatePanelLatentXLSX(result: PanelLatentFitResult, datasetName = 'Dataset_Panel.xlsx'): Buffer {
  const wb = XLSX.utils.book_new();
  const ciPct = Math.round((result.spec.ciLevel || 0.95) * 100);

  // Sheet 1: Ringkasan & Metodologi (Bab 1-7)
  addSheet(wb, 'Ringkasan_Riset', [
    ['LAPORAN HASIL BAYESIAN HIERARCHICAL LATENT VARIABLE MEASUREMENT MODEL'],
    ['Dataset', datasetName],
    ['Mesin Komputasi', result.engineAttribution],
    ['Jumlah Observasi / Kota / Tahun', `${result.nObs} / ${result.nCities} / ${result.nYears}`],
    ['Keseimbangan Panel', result.isBalanced ? 'Balanced' : 'Unbalanced'],
    ['Strategi Identifikasi', result.identificationAudit.status.toUpperCase()],
    ['Skala & Lokasi', `${result.identificationAudit.scaleConstraint}; ${result.identificationAudit.locationConstraint}`],
    ['Likelihood', result.spec.likelihood === 'student_t' ? `Student-t (df=${result.spec.studentTDf})` : 'Normal (Gaussian)'],
    ['MCMC Konvergensi', result.diagnostics.convergenceStatusLabel],
    ['Max Split R-hat', Number(result.diagnostics.maxRHat.toFixed(4))],
    ['Min Bulk ESS', result.diagnostics.minEssBulk],
    ['WAIC', Number(result.ppc.waic.toFixed(2))],
    ['RMSE Overall', Number(result.ppc.rmseOverall.toFixed(4))],
    ['PPC p-value (Mean / SD)', `${result.ppc.bayesianPValueMean.toFixed(3)} / ${result.ppc.bayesianPValueSd.toFixed(3)}`],
    [],
    ['Bab 11. Interpretasi Parameter', result.interpretations.parameterInterpretation],
    ['Bab 11. Interpretasi Reliabilitas', result.interpretations.reliabilityInterpretation],
    ['Bab 11. Interpretasi Laten Y*', result.interpretations.latentEmissionInterpretation],
    ['Bab 13. Kesimpulan Akhir', result.interpretations.finalConclusion]
  ]);

  // Sheet 2: Parameter Estimation (Stata Style)
  addSheet(wb, 'Estimasi_Parameter', [
    ['Parameter', 'Kode', 'Mean', 'SD', 'Median', `${ciPct}% CI Lower`, `${ciPct}% CI Upper`, 'R-hat', 'Bulk ESS', 'Tail ESS', 'MCSE', 'Status'],
    ...result.parameters.map(p => [
      p.label,
      p.name,
      Number(p.mean.toFixed(5)),
      Number(p.sd.toFixed(5)),
      Number(p.median.toFixed(5)),
      Number(p.ciLower.toFixed(5)),
      Number(p.ciUpper.toFixed(5)),
      Number(p.rHat.toFixed(4)),
      p.essBulk,
      p.essTail,
      Number(p.mcse.toFixed(5)),
      p.isFixed ? 'Anchor/Fixed' : 'Estimated'
    ])
  ]);

  // Sheet 3: Source Reliability Comparison
  addSheet(wb, 'Reliabilitas_Sumber', [
    ['Sumber', 'Kunci', 'Jangkar', 'Relative Bias (alpha)', 'Bias CI Lower', 'Bias CI Upper', 'Loading (lambda)', 'Error Variance', 'Error SD (Uncertainty)', 'Reliability (0-1)', 'Noise/Signal Ratio'],
    ...result.sourceComparison.map(s => [
      s.sourceLabel,
      s.sourceKey,
      s.isAnchor ? 'Ya' : 'Tidak',
      Number(s.relativeBiasMean.toFixed(5)),
      Number(s.relativeBiasCI[0].toFixed(5)),
      Number(s.relativeBiasCI[1].toFixed(5)),
      Number(s.loadingMean.toFixed(5)),
      Number(s.errorVarianceMean.toFixed(5)),
      Number(s.errorSdMean.toFixed(5)),
      Number(s.reliability.toFixed(5)),
      Number(s.noiseToSignalRatio.toFixed(5))
    ]),
    [],
    ['Evaluasi Reliabilitas', 'Sumber'],
    ['Varians Error Terkecil', result.sourceEvaluation.lowestErrorVarianceSource],
    ['Paling Konsisten (Reliabilitas Tertinggi)', result.sourceEvaluation.highestReliabilitySource],
    ['Ketidakpastian Tertinggi', result.sourceEvaluation.highestUncertaintySource],
    ['Indikasi Bias Relatif Signifikan', result.sourceEvaluation.biasedSources.join(', ') || 'Tidak ada'],
    ['Catatan Penting', result.sourceEvaluation.relativeOnlyCaveat]
  ]);

  // Sheet 4: Latent CO2 Estimates per City & Year
  addSheet(wb, 'Estimasi_Laten_CO2', [
    ['City', 'Year', 'X1_SelfReporting', 'X2_Satellite', 'X3_Sensor', 'Estimated_Y_Star', 'Posterior_SD', `${ciPct}% CI_Lower`, `${ciPct}% CI_Upper`, 'R-hat', 'ESS'],
    ...result.latentEstimates.map(e => [
      e.city,
      e.year,
      e.x1 === null ? '' : Number(e.x1.toFixed(4)),
      e.x2 === null ? '' : Number(e.x2.toFixed(4)),
      e.x3 === null ? '' : Number(e.x3.toFixed(4)),
      Number(e.latentMean.toFixed(4)),
      Number(e.latentSd.toFixed(4)),
      Number(e.ciLower.toFixed(4)),
      Number(e.ciUpper.toFixed(4)),
      Number(e.rHat.toFixed(4)),
      e.ess
    ])
  ]);

  // Sheet 5: Sensitivity & Model Comparison
  addSheet(wb, 'Sensitivitas_Model', [
    ['ANALISIS SENSITIVITAS PRIOR'],
    ['Rezim Prior', 'Loading X1', 'Loading X2', 'Loading X3', 'Error SD X1', 'Error SD X2', 'Error SD X3', 'Rata-rata Laten', 'Pergeseran Maks (%)'],
    ...result.sensitivity.map(s => [
      s.regimeLabel,
      Number(s.loadingMeans.X1.toFixed(4)),
      Number(s.loadingMeans.X2.toFixed(4)),
      Number(s.loadingMeans.X3.toFixed(4)),
      Number(s.errorSdMeans.X1.toFixed(4)),
      Number(s.errorSdMeans.X2.toFixed(4)),
      Number(s.errorSdMeans.X3.toFixed(4)),
      Number(s.latentGrandMean.toFixed(3)),
      Number(s.maxRelativeShiftPct.toFixed(2))
    ]),
    [],
    ['PERBANDINGAN SPESIFIKASI MODEL'],
    ['Spesifikasi', 'Likelihood', 'AR(1)', 'WAIC', 'RMSE Overall', 'Max R-hat', 'Min ESS', 'Konvergen'],
    ...result.modelComparison.map(m => [
      m.specLabel,
      m.likelihood,
      m.includeAR1 ? 'Ya' : 'Tidak',
      Number(m.waic.toFixed(2)),
      Number(m.rmseOverall.toFixed(4)),
      Number(m.maxRHat.toFixed(4)),
      m.minESS,
      m.isConverged ? 'Ya' : 'Tidak'
    ])
  ]);

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(out);
}

export function generatePanelLatentCSV(result: PanelLatentFitResult): string {
  const ciPct = Math.round((result.spec.ciLevel || 0.95) * 100);
  const headers = [
    'City',
    'Year',
    'X1_SelfReporting',
    'X2_Satellite',
    'X3_Sensor',
    'Estimated_Latent_CO2',
    'Posterior_SD',
    `CI_${ciPct}_Lower`,
    `CI_${ciPct}_Upper`,
    'R_hat',
    'ESS'
  ];
  const lines = [headers.join(',')];
  result.latentEstimates.forEach(row => {
    const cityEsc = `"${sanitizeSpreadsheetText(row.city).replace(/"/g, '""')}"`;
    lines.push(
      [
        cityEsc,
        row.year,
        row.x1 ?? '',
        row.x2 ?? '',
        row.x3 ?? '',
        row.latentMean.toFixed(4),
        row.latentSd.toFixed(4),
        row.ciLower.toFixed(4),
        row.ciUpper.toFixed(4),
        row.rHat.toFixed(4),
        row.ess
      ].join(',')
    );
  });
  return lines.join('\n');
}

