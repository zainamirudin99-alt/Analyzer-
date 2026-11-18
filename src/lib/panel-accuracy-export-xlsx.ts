// ============================================================
// Model Pengukuran Laten & Akurasi Panel (ISO 5725)
// Generator Workbook Excel (.xlsx 9-Sheet Terurut) & CSV
// ============================================================

import * as XLSX from 'xlsx';
import { PanelAccuracyFitResult } from './panel-accuracy-types';
import { sanitizeSpreadsheetText } from './panel-accuracy-validation';

const roundSmart = (n: number | null | undefined): number | string => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs === 0) return 0;
  if (abs < 1) return Number(n.toFixed(6));
  if (abs < 100) return Number(n.toFixed(4));
  return Number(n.toFixed(2));
};

function fitCols(rows: any[][]): XLSX.ColInfo[] {
  if (!rows || rows.length === 0) return [];
  const colCount = Math.max(...rows.map(r => r.length));
  const widths = new Array(colCount).fill(12);
  rows.forEach(r => {
    for (let i = 0; i < colCount; i++) {
      const len = String(r[i] ?? '').length;
      if (len + 3 > widths[i]) widths[i] = Math.min(88, len + 3);
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

  // Sheet 1: Ringkasan Riset
  addSheet(wb, '01_Ringkasan_Riset', [
    ['LAPORAN MODEL PENGUKURAN LATEN & AKURASI PANEL (ISO 5725)'],
    ['Dataset', datasetName],
    ['Mesin Komputasi', result.engineAttribution],
    ['Sumber Dievaluasi (J)', result.sources.map(s => `${s.name} (${s.label})`).join(', ')],
    ['Pasangan Complete-Case / Raw', `${result.datasetMeta.nCompletePairs} / ${result.datasetMeta.nObsRaw}`],
    ['Jumlah Entitas (G) / Periode (T)', `${result.datasetMeta.nCities} / ${result.datasetMeta.nYears}`],
    ['MCMC Max R-hat / Min ESS / PPP', `${result.latentModel.maxRhat.toFixed(4)} / ${result.latentModel.minEss} / ${result.latentModel.posteriorPredictivePValue.toFixed(3)}`],
    ['Status Keputusan Kanonik', result.ranking.canonicalStatus],
    ['Sumber Paling Akurat (#1)', result.ranking.bestSourceLabel || result.ranking.bestCandidateLabel || 'Belum Dapat Ditetapkan (Inkonklusif)'],
    [],
    ['INTERPRETASI AKADEMIS & KESIMPULAN'],
    ['1. Identifikasi Model Laten (Step 1-3)', result.interpretations.referenceValidityInterpretation],
    ['2. EDA & Korelasi Panel (Step 4)', result.interpretations.edaAndCorrelationInterpretation],
    ['3. Model Laten & LOSO (Step 5-6)', result.interpretations.accuracyAndAgreementInterpretation],
    ['4. Pair Fixed Effects (Step 6)', result.interpretations.pairFixedEffectsInterpretation],
    ['5. Diagnostik & Konvergensi (Step 7)', result.interpretations.diagnosticsInterpretation],
    ['6. Keputusan Pemeringkatan (Step 8)', result.interpretations.rankingDecisionInterpretation],
    ['7. Kesimpulan Akhir', result.interpretations.finalConclusion],
    [],
    ['KETERBATASAN PENELITIAN & EPISTEMOLOGIS'],
    ...result.interpretations.researchLimitations.map((lim, i) => [`Batasan ${i + 1}`, lim])
  ]);

  // Sheet 2: Audit Data Step 1-3
  addSheet(wb, '02_Audit_Kualitas_Step1_3', [
    ['KONFIGURASI PRAPEMROSESAN EKSPLISIT (STEP 3)'],
    ['Drop Duplikat Entitas-Waktu', result.preprocessing.dropDuplicateCityYear ? 'Ya' : 'Tidak'],
    ['Log1p Transform', result.preprocessing.applyLog1p ? 'Ya' : 'Tidak'],
    ['Winsorization Aktif', result.preprocessing.applyWinsorize ? `Ya (${(result.preprocessing.winsorQuantile * 100).toFixed(1)}%)` : 'Tidak'],
    ['Penyelarasan Multiplier Satuan', result.preprocessing.applyUnitMultiplier ? 'Ya' : 'Tidak'],
    [],
    ['KELENGKAPAN PER SUMBER (STEP 2)'],
    ['Source ID', 'Nama Sumber', 'Unit', 'Available-Case N', 'Missing N', 'Zero Variance?'],
    ...result.sources.map(s => [
      s.name,
      s.label,
      s.unit || '-',
      result.qualityReport.availablePairsBySource[s.id] ?? result.datasetMeta.nCompletePairs,
      result.qualityReport.missingBySource[s.id] ?? 0,
      result.qualityReport.latentAudit.hasZeroVarianceSources.includes(s.id) ? 'YA' : 'TIDAK'
    ]),
    [],
    ['10 INDIKATOR AUDIT KUALITAS DATA'],
    ['Indikator', 'Tingkat', 'Jumlah', 'Ringkasan', 'Rekomendasi'],
    ...result.qualityReport.checks.map(chk => [
      chk.title,
      chk.severity.toUpperCase(),
      chk.count,
      chk.message,
      chk.recommendation || '-'
    ])
  ]);

  // Sheet 3: EDA & Korelasi Panel Step 4
  addSheet(wb, '03_EDA_Korelasi_Step4', [
    ['STATISTIK DESKRIPTIF EKSPLORATIF (STEP 4)'],
    ['Sumber', 'Peran', 'Unit', 'N', 'Missing', 'Mean', 'SD', 'Median', 'IQR', 'Min', 'Max', 'CV (%)', 'Skewness', 'Kurtosis'],
    ...result.eda.descriptives.map(d => [
      d.sourceLabel,
      d.role,
      d.unit || '-',
      d.n,
      d.missing,
      roundSmart(d.mean),
      roundSmart(d.sd),
      roundSmart(d.median),
      roundSmart(d.iqr),
      roundSmart(d.min),
      roundSmart(d.max),
      Number(d.cv.toFixed(2)),
      Number(d.skewness.toFixed(4)),
      Number(d.kurtosisExcess.toFixed(4))
    ]),
    [],
    ['MATRIKS KORELASI PEARSON OVERALL'],
    ['Sumber', ...result.eda.sourceLabels],
    ...result.eda.overallPearson.map((row, i) => [result.eda.sourceLabels[i], ...row.map(v => Number(v.toFixed(4)))]),
    [],
    ['MATRIKS KORELASI WITHIN-ENTITY (DEMEANED)'],
    ['Sumber', ...result.eda.sourceLabels],
    ...result.eda.withinCityPearson.map((row, i) => [result.eda.sourceLabels[i], ...row.map(v => Number(v.toFixed(4)))]),
    [],
    ['MATRIKS KORELASI FIRST-DIFFERENCE (DELTA X)'],
    ['Sumber', ...result.eda.sourceLabels],
    ...result.eda.firstDiffPearson.map((row, i) => [result.eda.sourceLabels[i], ...row.map(v => Number(v.toFixed(4)))])
  ]);

  // Sheet 4: Model Laten Step 5
  addSheet(wb, '04_Model_Laten_Step5', [
    ['ESTIMASI PARAMETER MODEL HIERARKIS LATEN BAYESIAN (STEP 5)'],
    [
      'Source ID',
      'Nama Sumber',
      'Bias Alpha (α)',
      'Alpha CrI 95% Low',
      'Alpha CrI 95% High',
      'Loading Lambda (λ)',
      'Lambda CrI Low',
      'Lambda CrI High',
      'Error SD (σ_ε)',
      'Scale Distortion',
      'Reliabilitas R²',
      'SNR',
      'Posterior Exp Loss',
      'Expected Rank',
      'Ranking Stability (%)',
      'MCMC ESS',
      'MCMC R-hat'
    ],
    ...result.latentModel.sourceEstimates.map(se => [
      se.sourceId,
      se.sourceLabel,
      roundSmart(se.interceptBiasAlpha),
      roundSmart(se.interceptBiasCiLower),
      roundSmart(se.interceptBiasCiUpper),
      Number(se.loadingLambda.toFixed(4)),
      Number(se.loadingCiLower.toFixed(4)),
      Number(se.loadingCiUpper.toFixed(4)),
      roundSmart(se.errorSd),
      roundSmart(se.scaleDistortionComponent),
      Number(se.reliabilityR2.toFixed(4)),
      Number(se.signalToNoiseRatio.toFixed(4)),
      roundSmart(se.posteriorExpectedLoss),
      Number(se.expectedRank.toFixed(2)),
      Number(se.rankingStabilityPct.toFixed(2)),
      Math.round(se.mcmcEss),
      Number(se.mcmcRhat.toFixed(4))
    ]),
    [],
    ['MATRIKS KORELASI RESIDUAL ANTARSUMBER (AUDIT D3)'],
    ['Sumber', ...result.sources.map(s => s.label)],
    ...result.latentModel.residualCorrelationMatrix.map((row, i) => [
      result.sources[i]?.label || `S${i + 1}`,
      ...row.map(v => Number(v.toFixed(4)))
    ])
  ]);

  // Sheet 5: Akurasi Lengkap, LOSO & Pair FE Step 6
  addSheet(wb, '05_Akurasi_PairFE_Step6', [
    ['METRIK AKURASI ISO 5725, VALIDASI LOSO & AGREEMENT (STEP 6A)'],
    [
      'Sumber',
      'Total Latent RMSE',
      'TotRMSE 95% CrI Low',
      'TotRMSE 95% CrI High',
      'Bias^2',
      'ScaleDist^2',
      'Error Var(ε)',
      'LOSO MAE',
      'LOSO RMSE',
      'LOSO MBE',
      'LOSO NMAE (%)',
      'LOSO Cov95 (%)',
      'LOSO Cal Slope',
      'Lin CCC',
      'CCC 95% CI Low',
      'CCC 95% CI High',
      'BA Mean Bias',
      'BA 95% LoA Low',
      'BA 95% LoA High'
    ],
    ...result.metrics.map(m => [
      m.sourceLabel,
      roundSmart(m.totalLatentRmse),
      roundSmart(m.totalLatentRmseCiLower),
      roundSmart(m.totalLatentRmseCiUpper),
      roundSmart(m.latentInterceptBias * m.latentInterceptBias),
      roundSmart(m.scaleDistortion * m.scaleDistortion),
      roundSmart(m.errorVariance),
      roundSmart(m.mae),
      roundSmart(m.rmse),
      roundSmart(m.mbe),
      Number(m.nmaePct.toFixed(2)),
      Number(m.losoPredictiveCoverage95.toFixed(2)),
      Number(m.losoCalibrationSlope.toFixed(4)),
      Number(m.ccc.ccc.toFixed(4)),
      Number(m.ccc.ciLower.toFixed(4)),
      Number(m.ccc.ciUpper.toFixed(4)),
      roundSmart(m.blandAltman.meanBias),
      roundSmart(m.blandAltman.loaLower),
      roundSmart(m.blandAltman.loaUpper)
    ]),
    [],
    ['KOEFISIEN PAIR FIXED EFFECTS (CLUSTER SE & DRISCOLL-KRAAY SE)'],
    ['Sumber', 'Mean AE', 'Beta Diff vs Base', 'Cluster SE', 'Driscoll-Kraay SE', 't-stat', 'p-value Cluster', 'Wild Bootstrap p'],
    ...result.pairFixedEffects.coefficients.map(c => [
      c.sourceLabel,
      roundSmart(c.meanAe),
      roundSmart(c.betaDiffVsBaseline),
      roundSmart(c.seCluster),
      c.seDriscollKraay !== undefined ? roundSmart(c.seDriscollKraay) : '-',
      Number(c.tStat.toFixed(4)),
      Number(c.pValue.toFixed(4)),
      c.wildBootstrapPValue !== undefined ? Number(c.wildBootstrapPValue.toFixed(4)) : '-'
    ]),
    [],
    ['KONTRAS BERPASANGAN ANTAR-SUMBER'],
    ['Sumber A', 'Sumber B', 'dMAE (A - B)', 'Cluster SE', 'Driscoll-Kraay SE', 'Cluster p', 'DK p', 'Wild Bootstrap p', 'P_Bayes (A < B)'],
    ...result.pairFixedEffects.pairwiseContrasts.map(c => [
      c.sourceALabel,
      c.sourceBLabel,
      roundSmart(c.diffAminusB),
      roundSmart(c.seCluster),
      c.seDriscollKraay !== undefined ? roundSmart(c.seDriscollKraay) : '-',
      Number(c.pValueCluster.toFixed(4)),
      c.pValueDriscollKraay !== undefined ? Number(c.pValueDriscollKraay.toFixed(4)) : '-',
      Number(c.wildBootstrapPValue.toFixed(4)),
      Number((c.posteriorProbABetterThanB * 100).toFixed(2))
    ])
  ]);

  // Sheet 6: Diagnostik & Sensitivitas Step 7
  addSheet(wb, '06_Diagnostik_Step7', [
    ['UJI DIAGNOSTIK PANEL & SENSITIVITAS INFERENSI (STEP 7)'],
    ['Uji Diagnostik', 'Statistik', 'Nilai', 'df', 'p-value', 'Status', 'Kesimpulan', 'Implikasi'],
    ...[
      result.diagnostics.heteroskedasticityTest,
      result.diagnostics.serialCorrelationTest,
      result.diagnostics.crossSectionalDependenceTest
    ].map(d => [
      d.testName,
      d.statisticLabel,
      Number(d.statisticValue.toFixed(4)),
      d.dfLabel,
      d.pValue !== null ? Number(d.pValue.toFixed(4)) : '-',
      d.status.toUpperCase(),
      d.conclusion,
      d.implication
    ]),
    [],
    ['AUDIT KLASTER, KORELASI GALAT, OUTLIER & MISSINGNESS'],
    ['Komponen Audit', 'Ringkasan Hasil'],
    ['Audit Konvergensi Bayesian', result.diagnostics.bayesianConvergenceAudit.summary],
    ['Audit Jumlah Klaster Entitas', result.diagnostics.clusterCountAudit.message],
    ['Sensitivitas Outlier 95% Trimmed', result.diagnostics.outlierSensitivityAudit.summary],
    ['Audit Korelasi Galat Antarsumber', result.diagnostics.correlatedErrorAudit?.summary || '-'],
    ['Sensitivitas Missing Data (CC vs Avail)', result.diagnostics.missingDataSensitivityAudit?.summary || '-'],
    ['Catatan Normalitas & CLT', result.diagnostics.normalityAndCltNote.explanation],
    [],
    ['SENSITIVITAS OUTLIER PER SUMBER'],
    ['Sumber', 'MAE Penuh', 'MAE Trimmed 95%', 'Rank Penuh', 'Rank Trimmed', 'Pergeseran (%)'],
    ...result.diagnostics.outlierSensitivityAudit.entries.map(e => [
      e.sourceLabel,
      roundSmart(e.maeFull),
      roundSmart(e.maeTrimmed95),
      e.rankFull,
      e.rankTrimmed95,
      Number(e.shiftPct.toFixed(2))
    ])
  ]);

  // Sheet 7: Ranking & 8-Poin Mengapa Sumber Terbaik Step 8
  addSheet(wb, '07_Ranking_Step8', [
    ['PEMERINGKATAN AKURASI FINAL SELURUH J SUMBER (STEP 8)'],
    ['Status Kanonik', result.ranking.canonicalStatus],
    ['Konklusif Mutlak?', result.ranking.isConclusive ? 'YA' : 'BELUM'],
    [],
    ['Peringkat', 'Sumber', 'Total Latent RMSE', 'Error SD', 'Scale Distortion', 'Reliabilitas R² (%)', 'Posterior P(Best) %', 'Expected Rank', 'Stability (%)', 'LOSO MAE', 'Lin CCC', 'WildBoot p vs #1', 'Catatan'],
    ...result.ranking.ranks.map(r => [
      r.rank,
      r.sourceLabel,
      roundSmart(r.totalLatentRmse),
      roundSmart(r.errorSd),
      roundSmart(r.scaleDistortion),
      Number((r.reliabilityR2 * 100).toFixed(2)),
      Number((r.posteriorProbBest * 100).toFixed(2)),
      Number(r.expectedRank.toFixed(2)),
      Number(r.rankingStabilityPct.toFixed(2)),
      roundSmart(r.mae),
      Number(r.ccc.toFixed(4)),
      r.pValueVsTopWildBootstrap !== null ? Number(r.pValueVsTopWildBootstrap.toFixed(4)) : '-',
      r.rankNote
    ]),
    [],
    ['MENGAPA SUMBER INI MENJADI YANG TERBAIK? (ANALISIS 8-POIN)'],
    ['Headline', result.ranking.whyBestAnalysis.headline],
    ['Dimensi Evaluasi', 'Bukti Kuantitatif & Penjelasan'],
    ...result.ranking.whyBestAnalysis.points.map(pt => [pt.label, pt.detail])
  ]);

  // Sheet 8: Output Tabel Stata Berurutan Step 1 -> Step 9
  const ordered = result.stataOutput.orderedStepOutputs || [];
  const stataRows: any[][] = [
    ['OUTPUT TABEL STATA TERURUT KRONOLOGIS (STEP 1 S.D. STEP 9)'],
    ['Step', 'Judul Tahap', 'Perintah Stata', 'Baris Output Tabel']
  ];
  if (ordered.length > 0) {
    ordered.forEach(st => {
      st.outputTableText.split('\n').forEach((line, idx) => {
        stataRows.push([
          idx === 0 ? `Step ${st.stepId}` : '',
          idx === 0 ? st.stepTitle : '',
          idx === 0 ? st.stataCommand : '',
          line
        ]);
      });
      stataRows.push(['', '', '', '']);
    });
  } else {
    [
      { t: 'Header', cmd: 'header', txt: result.stataOutput.headerConsoleText },
      { t: 'Tabel 1', cmd: 'bayes: sem', txt: result.stataOutput.accuracyMetricsTableText },
      { t: 'Tabel 2', cmd: 'lin_ccc', txt: result.stataOutput.cccAndBlandAltmanTableText },
      { t: 'Tabel 3', cmd: 'areg ae', txt: result.stataOutput.pairFixedEffectsTableText },
      { t: 'Tabel 4', cmd: 'contrast', txt: result.stataOutput.pairwiseContrastsTableText },
      { t: 'Tabel 5', cmd: 'ranking', txt: result.stataOutput.diagnosticsAndRankingText }
    ].forEach(blk => {
      blk.txt.split('\n').forEach((line, idx) => {
        stataRows.push([blk.t, idx === 0 ? blk.t : '', idx === 0 ? blk.cmd : '', line]);
      });
    });
  }
  addSheet(wb, '08_Output_Stata_Step1_9', stataRows);

  // Sheet 9: Kode Reprodusibilitas Stata .do, R, & Stan
  const codeRows: any[][] = [
    ['KODE REPRODUSIBILITAS LENGKAP (STATA .DO, R .R, STAN .STAN)'],
    ['Platform', 'Nomor Baris', 'Baris Kode']
  ];
  const pushCode = (platform: string, script?: string) => {
    if (!script) return;
    script.split('\n').forEach((line, idx) => {
      codeRows.push([platform, idx + 1, line]);
    });
    codeRows.push(['', '', '']);
  };
  pushCode('Stata (.do)', result.generatedCode.stataDoFile);
  pushCode('R (.R)', result.generatedCode.rScript);
  pushCode('Stan (.stan)', result.generatedCode.stanCode);
  addSheet(wb, '09_Kode_Stata_R_Stan', codeRows);

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
      r.totalLatentRmse.toFixed(6),
      r.errorSd.toFixed(6),
      r.reliabilityR2.toFixed(4),
      r.posteriorProbBest.toFixed(4),
      r.mae.toFixed(6),
      r.rmse.toFixed(6),
      r.mbe.toFixed(6),
      r.ccc.toFixed(4),
      r.pearsonR.toFixed(4),
      m.withinCityR.toFixed(4),
      r.pValueVsTopWildBootstrap !== null ? r.pValueVsTopWildBootstrap.toFixed(4) : ''
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
