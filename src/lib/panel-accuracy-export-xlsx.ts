// ============================================================
// Comparative Measurement Accuracy Assessment — Excel & CSV Export
// ============================================================

import * as XLSX from 'xlsx';
import { PanelAccuracyFitResult } from './panel-accuracy-types';
import { sanitizeSpreadsheetText } from './panel-accuracy-validation';

function fitCols(rows: any[][]): XLSX.ColInfo[] {
  if (!rows || rows.length === 0) return [];
  const colCount = Math.max(...rows.map(r => r.length));
  const widths = new Array(colCount).fill(12);
  rows.forEach(r => {
    for (let i = 0; i < colCount; i++) {
      const len = String(r[i] ?? '').length;
      if (len + 3 > widths[i]) widths[i] = Math.min(58, len + 3);
    }
  });
  return widths.map(wch => ({ wch }));
}

function addSheet(wb: XLSX.WorkBook, name: string, aoa: any[][]) {
  const safe = aoa.map(row =>
    row.map(cell => (typeof cell === 'string' ? sanitizeSpreadsheetText(cell) : cell))
  );
  const ws = XLSX.utils.aoa_to_sheet(safe);
  ws['!cols'] = fitCols(safe);
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

export function generatePanelAccuracyXLSX(
  result: PanelAccuracyFitResult,
  datasetName = 'Dataset_Panel_Accuracy.xlsx'
): Buffer {
  const wb = XLSX.utils.book_new();
  const refTag = `${result.referenceSource.name} (${result.referenceSource.label})`;

  // Sheet 1: Ringkasan & Metodologi
  addSheet(wb, 'Ringkasan_Riset', [
    ['LAPORAN COMPARATIVE MEASUREMENT ACCURACY ASSESSMENT (PANEL DATA APPROACH)'],
    ['Dataset', datasetName],
    ['Mesin Komputasi', result.engineAttribution],
    ['Sumber Referensi (r)', refTag],
    ['Sumber Pembanding', result.comparisonSources.map(s => `${s.name} (${s.label})`).join(', ')],
    ['Pasangan Complete-Case / Raw', `${result.datasetMeta.nCompletePairs} / ${result.datasetMeta.nObsRaw}`],
    ['Jumlah Kota (G) / Tahun (T)', `${result.datasetMeta.nCities} / ${result.datasetMeta.nYears}`],
    ['Status Keputusan Ranking', result.ranking.conclusivenessStatus],
    ['Sumber Pembanding Terbaik', result.ranking.bestSourceLabel || 'Belum Dapat Ditetapkan (Inconclusive)'],
    [],
    ['INTERPRETASI AKADEMIS & KESIMPULAN'],
    ['1. Validitas Referensi', result.interpretations.referenceValidityInterpretation],
    ['2. EDA & Korelasi Panel', result.interpretations.edaAndCorrelationInterpretation],
    ['3. Akurasi & Bland-Altman', result.interpretations.accuracyAndAgreementInterpretation],
    ['4. Pair Fixed Effects', result.interpretations.pairFixedEffectsInterpretation],
    ['5. Diagnostik Statistik', result.interpretations.diagnosticsInterpretation],
    ['6. Keputusan Pemeringkatan', result.interpretations.rankingDecisionInterpretation],
    ['7. Kesimpulan Akhir', result.interpretations.finalConclusion]
  ]);

  // Sheet 2: Metrik Akurasi (Complete-Case vs Available-Case)
  addSheet(wb, 'Metrik_Akurasi', [
    [
      'Source ID',
      'Nama Sumber',
      'N (Complete-Case)',
      'N (Available-Case)',
      'MAE (CC)',
      'MAE 95% CI Lower',
      'MAE 95% CI Upper',
      'RMSE (CC)',
      'MBE (CC)',
      'MBE p-value',
      'NMAE (%)',
      'Pearson r',
      'Spearman rho',
      'Within-City r',
      'First-Diff r',
      'MAE (Available-Case)',
      'RMSE (Available-Case)',
      'MBE (Available-Case)'
    ],
    ...result.metrics.map(m => [
      m.sourceId,
      m.sourceLabel,
      m.nCompleteCase,
      m.nAvailableCase,
      Number(m.mae.toFixed(4)),
      Number(m.maeCiLower.toFixed(4)),
      Number(m.maeCiUpper.toFixed(4)),
      Number(m.rmse.toFixed(4)),
      Number(m.mbe.toFixed(4)),
      Number(m.mbePValue.toFixed(4)),
      Number(m.nmaePct.toFixed(2)),
      Number(m.pearsonR.toFixed(4)),
      Number(m.spearmanRho.toFixed(4)),
      Number(m.withinCityR.toFixed(4)),
      Number(m.firstDiffR.toFixed(4)),
      Number(m.availableCase.mae.toFixed(4)),
      Number(m.availableCase.rmse.toFixed(4)),
      Number(m.availableCase.mbe.toFixed(4))
    ])
  ]);

  // Sheet 3: Lin's CCC & Bland-Altman
  addSheet(wb, 'CCC_BlandAltman', [
    [
      'Sumber Pembanding',
      'Lin CCC',
      'CCC 95% CI Lower',
      'CCC 95% CI Upper',
      'Precision r',
      'Bias Correction Cb',
      'Scale Shift v',
      'Location Shift u',
      'BA Mean Bias',
      'BA SD Diff',
      '95% LoA Lower',
      '95% LoA Upper',
      'Outside LoA (%)',
      'Prop Bias Slope',
      'Prop Bias p-value'
    ],
    ...result.metrics.map(m => [
      m.sourceLabel,
      Number(m.ccc.ccc.toFixed(4)),
      Number(m.ccc.ciLower.toFixed(4)),
      Number(m.ccc.ciUpper.toFixed(4)),
      Number(m.ccc.pearsonR.toFixed(4)),
      Number(m.ccc.biasCorrectionFactorCb.toFixed(4)),
      Number(m.ccc.scaleShiftV.toFixed(4)),
      Number(m.ccc.locationShiftU.toFixed(4)),
      Number(m.blandAltman.meanBias.toFixed(4)),
      Number(m.blandAltman.sdDiff.toFixed(4)),
      Number(m.blandAltman.loaLower.toFixed(4)),
      Number(m.blandAltman.loaUpper.toFixed(4)),
      Number(m.blandAltman.outsideLoaPct.toFixed(2)),
      Number(m.blandAltman.propBiasSlope.toFixed(4)),
      Number(m.blandAltman.propBiasPValue.toFixed(4))
    ])
  ]);

  // Sheet 4: Pair Fixed Effects & Kontras
  addSheet(wb, 'Pair_FE_dan_Kontras', [
    ['TABEL KOEFISIEN PAIR FIXED EFFECTS (Absorbed City-Year Pair FE)'],
    ['Sumber Pembanding', 'Mean AE (MAE)', 'Beta Diff vs Base', 'Cluster SE', 't-stat', 'p-value Cluster', '95% CI Lower', '95% CI Upper', 'Wild Bootstrap p-value'],
    ...result.pairFixedEffects.coefficients.map(c => [
      c.sourceLabel,
      Number(c.meanAe.toFixed(4)),
      Number(c.betaDiffVsBaseline.toFixed(4)),
      Number(c.seCluster.toFixed(4)),
      Number(c.tStat.toFixed(4)),
      Number(c.pValue.toFixed(4)),
      Number(c.ciLower.toFixed(4)),
      Number(c.ciUpper.toFixed(4)),
      c.wildBootstrapPValue !== undefined ? Number(c.wildBootstrapPValue.toFixed(4)) : '-'
    ]),
    [],
    ['TABEL KONTRAS BERPASANGAN ANTAR SUMBER PEMBANDING'],
    ['Sumber A', 'Sumber B', 'MAE_A - MAE_B', 'Cluster SE', 't-stat', 'Cluster p-value', 'Wild Bootstrap p-value', 'Wild 95% CI Lower', 'Wild 95% CI Upper'],
    ...result.pairFixedEffects.pairwiseContrasts.map(c => [
      c.sourceALabel,
      c.sourceBLabel,
      Number(c.diffAminusB.toFixed(4)),
      Number(c.seCluster.toFixed(4)),
      Number(c.tStat.toFixed(4)),
      Number(c.pValueCluster.toFixed(4)),
      Number(c.wildBootstrapPValue.toFixed(4)),
      Number(c.wildBootstrapCiLower.toFixed(4)),
      Number(c.wildBootstrapCiUpper.toFixed(4))
    ])
  ]);

  // Sheet 5: Pemeringkatan & Diagnostik
  addSheet(wb, 'Ranking_dan_Diagnostik', [
    ['PEMERINGKATAN SUMBER PEMBANDING (Metrik Utama: MAE)'],
    ['Peringkat', 'Sumber Pembanding', 'MAE', 'RMSE', 'MBE', 'Lin CCC', 'Lebar LoA', 'Delta MAE vs #1', 'Cluster p vs #1', 'WildBoot p vs #1', 'Catatan'],
    ...result.ranking.ranks.map(r => [
      r.rank,
      r.sourceLabel,
      Number(r.mae.toFixed(4)),
      Number(r.rmse.toFixed(4)),
      Number(r.mbe.toFixed(4)),
      Number(r.ccc.toFixed(4)),
      Number(r.loaWidth.toFixed(4)),
      Number(r.diffFromTopMae.toFixed(4)),
      r.pValueVsTopCluster !== null ? Number(r.pValueVsTopCluster.toFixed(4)) : '-',
      r.pValueVsTopWildBootstrap !== null ? Number(r.pValueVsTopWildBootstrap.toFixed(4)) : '-',
      r.rankNote
    ])
  ]);

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(out);
}

export function generatePanelAccuracyCSV(result: PanelAccuracyFitResult): string {
  const headers = [
    'Rank',
    'Source_ID',
    'Source_Name',
    'Source_Label',
    'Reference_Source',
    'N_Complete_Case',
    'N_Available_Case',
    'MAE',
    'MAE_CI_Lower',
    'MAE_CI_Upper',
    'RMSE',
    'MBE',
    'MBE_PValue',
    'Pearson_R',
    'Spearman_Rho',
    'Within_City_R',
    'First_Diff_R',
    'Lins_CCC',
    'CCC_CI_Lower',
    'CCC_CI_Upper',
    'BA_LoA_Lower',
    'BA_LoA_Upper'
  ];

  const refTag = `${result.referenceSource.name} (${result.referenceSource.label})`;
  const rankMap = new Map(result.ranking.ranks.map(r => [r.sourceId, r.rank]));

  const rows = result.metrics.map(m => [
    rankMap.get(m.sourceId) ?? '',
    sanitizeSpreadsheetText(m.sourceId),
    sanitizeSpreadsheetText(m.sourceName),
    `"${sanitizeSpreadsheetText(m.sourceLabel).replace(/"/g, '""')}"`,
    `"${sanitizeSpreadsheetText(refTag).replace(/"/g, '""')}"`,
    m.nCompleteCase,
    m.nAvailableCase,
    m.mae.toFixed(4),
    m.maeCiLower.toFixed(4),
    m.maeCiUpper.toFixed(4),
    m.rmse.toFixed(4),
    m.mbe.toFixed(4),
    m.mbePValue.toFixed(4),
    m.pearsonR.toFixed(4),
    m.spearmanRho.toFixed(4),
    m.withinCityR.toFixed(4),
    m.firstDiffR.toFixed(4),
    m.ccc.ccc.toFixed(4),
    m.ccc.ciLower.toFixed(4),
    m.ccc.ciUpper.toFixed(4),
    m.blandAltman.loaLower.toFixed(4),
    m.blandAltman.loaUpper.toFixed(4)
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
