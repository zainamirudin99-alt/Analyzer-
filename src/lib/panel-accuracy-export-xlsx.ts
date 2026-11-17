// ============================================================
// Reference-Free All-Source Latent & Consensus Assessment
// Excel (.xlsx) & CSV Export
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

  addSheet(wb, 'Ringkasan_Riset', [
    ['LAPORAN REFERENCE-FREE ALL-SOURCE LATENT & CONSENSUS ACCURACY ASSESSMENT'],
    ['Dataset', datasetName],
    ['Mesin Komputasi', result.engineAttribution],
    ['Sumber Dievaluasi (J)', result.sources.map(s => `${s.name} (${s.label})`).join(', ')],
    ['Pasangan Complete-Case / Raw', `${result.datasetMeta.nCompletePairs} / ${result.datasetMeta.nObsRaw}`],
    ['Jumlah Kota (G) / Tahun (T)', `${result.datasetMeta.nCities} / ${result.datasetMeta.nYears}`],
    ['MCMC Max R-hat / Min ESS', `${result.latentModel.maxRhat.toFixed(4)} / ${result.latentModel.minEss}`],
    ['Status Keputusan Ranking', result.ranking.conclusivenessStatus],
    ['Sumber Paling Akurat (#1)', result.ranking.bestSourceLabel || 'Belum Dapat Ditetapkan (Inkonklusif)'],
    [],
    ['INTERPRETASI AKADEMIS & KESIMPULAN'],
    ['1. Identifikasi Model Laten', result.interpretations.referenceValidityInterpretation],
    ['2. EDA & Korelasi Panel', result.interpretations.edaAndCorrelationInterpretation],
    ['3. Model Laten & Agreement', result.interpretations.accuracyAndAgreementInterpretation],
    ['4. Pair Fixed Effects', result.interpretations.pairFixedEffectsInterpretation],
    ['5. Diagnostik & Konvergensi', result.interpretations.diagnosticsInterpretation],
    ['6. Keputusan Pemeringkatan', result.interpretations.rankingDecisionInterpretation],
    ['7. Kesimpulan Akhir', result.interpretations.finalConclusion]
  ]);

  addSheet(wb, 'Latent_dan_Akurasi', [
    [
      'Source ID',
      'Nama Sumber',
      'Total Latent RMSE',
      'Error SD (σ_ε)',
      'Reliabilitas R²',
      'Intercept Bias (α)',
      'Loading (λ)',
      'Posterior Prob Best (%)',
      'MCMC R-hat',
      'N (Complete-Case)',
      'N (Available-Case)',
      'LOSO MAE',
      'LOSO RMSE',
      'LOSO MBE',
      'Pearson r',
      'Within-City r',
      'Lin CCC'
    ],
    ...result.metrics.map(m => [
      m.sourceId,
      m.sourceLabel,
      Number(m.totalLatentRmse.toFixed(4)),
      Number(m.errorSd.toFixed(4)),
      Number(m.reliabilityR2.toFixed(4)),
      Number(m.latentInterceptBias.toFixed(4)),
      Number(m.latentLoading.toFixed(4)),
      Number((m.posteriorProbBest * 100).toFixed(2)),
      Number(m.mcmcRhat.toFixed(4)),
      m.nCompleteCase,
      m.nAvailableCase,
      Number(m.mae.toFixed(4)),
      Number(m.rmse.toFixed(4)),
      Number(m.mbe.toFixed(4)),
      Number(m.pearsonR.toFixed(4)),
      Number(m.withinCityR.toFixed(4)),
      Number(m.ccc.ccc.toFixed(4))
    ])
  ]);

  addSheet(wb, 'CCC_BlandAltman', [
    [
      'Sumber Pengukuran',
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

  addSheet(wb, 'Pair_FE_dan_Kontras', [
    ['TABEL KOEFISIEN PAIR FIXED EFFECTS (Absorbed City-Year Pair FE)'],
    ['Sumber Pengukuran', 'Mean AE', 'Beta Diff vs Base', 'Cluster SE', 't-stat', 'p-value Cluster', 'Wild Bootstrap p'],
    ...result.pairFixedEffects.coefficients.map(c => [
      c.sourceLabel,
      Number(c.meanAe.toFixed(4)),
      Number(c.betaDiffVsBaseline.toFixed(4)),
      Number(c.seCluster.toFixed(4)),
      Number(c.tStat.toFixed(4)),
      Number(c.pValue.toFixed(4)),
      c.wildBootstrapPValue !== undefined ? Number(c.wildBootstrapPValue.toFixed(4)) : '-'
    ]),
    [],
    ['TABEL KONTRAS BERPASANGAN SELURUH SUMBER'],
    ['Sumber A', 'Sumber B', 'ΔMAE (A - B)', 'Cluster SE', 'Cluster p', 'Wild Bootstrap p', 'P_Bayes (A < B)'],
    ...result.pairFixedEffects.pairwiseContrasts.map(c => [
      c.sourceALabel,
      c.sourceBLabel,
      Number(c.diffAminusB.toFixed(4)),
      Number(c.seCluster.toFixed(4)),
      Number(c.pValueCluster.toFixed(4)),
      Number(c.wildBootstrapPValue.toFixed(4)),
      Number((c.posteriorProbABetterThanB * 100).toFixed(2))
    ])
  ]);

  addSheet(wb, 'Ranking_Semua_Sumber', [
    ['PEMERINGKATAN AKURASI SELURUH J SUMBER (Tanpa Reference Terkunci)'],
    ['Peringkat', 'Sumber', 'Total Latent RMSE', 'Error SD', 'Reliabilitas R²', 'Posterior Prob Best (%)', 'LOSO MAE', 'Lin CCC', 'WildBoot p vs #1', 'Catatan'],
    ...result.ranking.ranks.map(r => [
      r.rank,
      r.sourceLabel,
      Number(r.totalLatentRmse.toFixed(4)),
      Number(r.errorSd.toFixed(4)),
      Number(r.reliabilityR2.toFixed(4)),
      Number((r.posteriorProbBest * 100).toFixed(2)),
      Number(r.mae.toFixed(4)),
      Number(r.ccc.toFixed(4)),
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
    'Total_Latent_RMSE',
    'Error_SD',
    'Reliability_R2',
    'Posterior_Prob_Best',
    'LOSO_MAE',
    'LOSO_RMSE',
    'LOSO_MBE',
    'Lins_CCC',
    'Pearson_r',
    'Within_City_r',
    'WildBoot_p_vs_Top'
  ];

  const rows = result.ranking.ranks.map(r => {
    const m = result.metrics.find(x => x.sourceId === r.sourceId)!;
    return [
      r.rank,
      r.sourceId,
      r.sourceName,
      `"${sanitizeSpreadsheetText(r.sourceLabel)}"`,
      r.totalLatentRmse.toFixed(4),
      r.errorSd.toFixed(4),
      r.reliabilityR2.toFixed(4),
      r.posteriorProbBest.toFixed(4),
      r.mae.toFixed(4),
      r.rmse.toFixed(4),
      r.mbe.toFixed(4),
      r.ccc.toFixed(4),
      r.pearsonR.toFixed(4),
      m.withinCityR.toFixed(4),
      r.pValueVsTopWildBootstrap !== null ? r.pValueVsTopWildBootstrap.toFixed(4) : ''
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
