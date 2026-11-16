// ============================================================
// Comparative Measurement Accuracy Assessment — Stata Output &
// Dynamic Indonesian Academic Statistical Interpretations
// ============================================================

import {
  AccuracyAcademicInterpretations,
  ComparativeRankingResult,
  CorrelationMatricesBundle,
  MeasurementSource,
  PairFixedEffectsResult,
  PanelAccuracyDiagnosticsResult,
  PanelAccuracyQualityReport,
  SourceAccuracyMetricRow,
  StataAccuracyOutputBundle
} from './panel-accuracy-types';

const fmt = (n: number, d = 3) => (Number.isFinite(n) ? n.toFixed(d) : 'NaN');
const pad = (s: string, w: number, right = false) => {
  const str = s.length > w ? `${s.slice(0, w - 1)}…` : s;
  return right ? str.padStart(w, ' ') : str.padEnd(w, ' ');
};

export interface AccuracyCoreBundle {
  datasetMeta: {
    cityIdColumn: string;
    yearColumn: string;
    nObsRaw: number;
    nCompletePairs: number;
    nCities: number;
    nYears: number;
    isBalanced: boolean;
    workingUnitNote: string;
  };
  sources: MeasurementSource[];
  referenceSource: MeasurementSource;
  comparisonSources: MeasurementSource[];
  qualityReport: PanelAccuracyQualityReport;
  eda: CorrelationMatricesBundle;
  metrics: SourceAccuracyMetricRow[];
  pairFixedEffects: PairFixedEffectsResult;
  diagnostics: PanelAccuracyDiagnosticsResult;
  ranking: ComparativeRankingResult;
}

export function generateStataAccuracyOutputBundle(core: AccuracyCoreBundle): StataAccuracyOutputBundle {
  const { datasetMeta, referenceSource, metrics, pairFixedEffects, diagnostics, ranking } = core;
  const sep = '-'.repeat(98);
  const refTag = `${referenceSource.name} (${referenceSource.label})`;

  const headerConsoleText = [
    `. * Comparative Measurement Accuracy Assessment Using Reference Measurements: A Panel Data Approach`,
    `. * Reference Source (r): ${refTag} [Unit: ${datasetMeta.workingUnitNote}]`,
    `. * Panel Structure     : ${datasetMeta.cityIdColumn} (G = ${datasetMeta.nCities} cities) x ${datasetMeta.yearColumn} (T = ${datasetMeta.nYears} years)`,
    `. * Complete-Case Pairs : ${datasetMeta.nCompletePairs} of ${datasetMeta.nObsRaw} raw rows (${datasetMeta.isBalanced ? 'Balanced' : 'Unbalanced/Partial'})`,
    `. * Comparison Sources  : ${core.comparisonSources.map(s => `${s.name}(${s.label})`).join(', ')}`
  ].join('\n');

  const mHead =
    `${pad('Comparison Source', 24)} | ${pad('N(CC/Av)', 9, true)} ${pad('MAE', 10, true)} ${pad('RMSE', 10, true)} ${pad('MBE', 10, true)} ${pad('Pearson r', 10, true)} ${pad('Within r', 9, true)} ${pad('Lin CCC', 9, true)}`;
  const mRows = metrics.map(m =>
    `${pad(m.sourceLabel, 24)} | ${pad(`${m.nCompleteCase}/${m.nAvailableCase}`, 9, true)} ${pad(fmt(m.mae, 3), 10, true)} ${pad(fmt(m.rmse, 3), 10, true)} ${pad(fmt(m.mbe, 3), 10, true)} ${pad(fmt(m.pearsonR, 4), 10, true)} ${pad(fmt(m.withinCityR, 4), 9, true)} ${pad(fmt(m.ccc.ccc, 4), 9, true)}`
  );

  const accuracyMetricsTableText = [
    `. * Tabel 1: Metrik Akurasi & Korelasi Terhadap Sumber Referensi ${refTag}`,
    sep,
    mHead,
    sep,
    ...mRows,
    sep,
    `Catatan: Evaluasi utama menggunakan N(CC) Complete-Case pasangan City-Year yang sama.`
  ].join('\n');

  const baHead =
    `${pad('Comparison Source', 24)} | ${pad('Lin CCC [95% CI]', 23, true)} ${pad('Cb', 7, true)} ${pad('Mean Bias', 10, true)} ${pad('SD Diff', 9, true)} ${pad('95% Limits of Agreement', 23, true)}`;
  const baRows = metrics.map(m => {
    const cccCi = `${fmt(m.ccc.ccc, 3)} [${fmt(m.ccc.ciLower, 3)},${fmt(m.ccc.ciUpper, 3)}]`;
    const loaStr = `[${fmt(m.blandAltman.loaLower, 2)}, ${fmt(m.blandAltman.loaUpper, 2)}]`;
    return `${pad(m.sourceLabel, 24)} | ${pad(cccCi, 23, true)} ${pad(fmt(m.ccc.biasCorrectionFactorCb, 3), 7, true)} ${pad(fmt(m.blandAltman.meanBias, 3), 10, true)} ${pad(fmt(m.blandAltman.sdDiff, 3), 9, true)} ${pad(loaStr, 23, true)}`;
  });

  const cccAndBlandAltmanTableText = [
    `. * Tabel 2: Lin's Concordance Correlation (CCC) & Bland-Altman Agreement Analysis`,
    sep,
    baHead,
    sep,
    ...baRows,
    sep
  ].join('\n');

  const feHead =
    `${pad('Source (Dep: AE_ijt)', 24)} | ${pad('Mean AE', 10, true)} ${pad('Beta Diff', 10, true)} ${pad('Cluster SE', 10, true)} ${pad('t', 8, true)} ${pad('P>|t|', 8, true)} ${pad('[95% Conf. Interval]', 21, true)}`;
  const feRows = pairFixedEffects.coefficients.map(c => {
    if (c.isBaselineComparison) {
      return `${pad(`${c.sourceLabel} (Base)`, 24)} | ${pad(fmt(c.meanAe, 3), 10, true)} ${pad('0.000 (omitted)', 21, true)} ${pad('-', 8, true)} ${pad('-', 8, true)} ${pad(`[${fmt(c.ciLower, 2)}, ${fmt(c.ciUpper, 2)}]`, 21, true)}`;
    }
    const ci = `[${fmt(c.ciLower, 3)}, ${fmt(c.ciUpper, 3)}]`;
    return `${pad(c.sourceLabel, 24)} | ${pad(fmt(c.meanAe, 3), 10, true)} ${pad(fmt(c.betaDiffVsBaseline, 3), 10, true)} ${pad(fmt(c.seCluster, 3), 10, true)} ${pad(fmt(c.tStat, 2), 8, true)} ${pad(fmt(c.pValue, 4), 8, true)} ${pad(ci, 21, true)}`;
  });

  const pairFixedEffectsTableText = [
    `. areg ae i.source_id, absorb(city_year_pair) vce(cluster ${datasetMeta.cityIdColumn})`,
    `Absorbed Pair Fixed Effects : ${pairFixedEffects.nCompletePairs} City-Year pairs | Long N = ${pairFixedEffects.nLongObs}`,
    `Std. Err. adjusted for      : ${pairFixedEffects.nClustersCity} clusters in ${datasetMeta.cityIdColumn} (df = ${pairFixedEffects.dfCluster})`,
    `Omnibus Wald F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${fmt(pairFixedEffects.omnibusFStat, 3)} (Prob > F = ${fmt(pairFixedEffects.omnibusPValue, 4)} | Wild Bootstrap p = ${fmt(pairFixedEffects.omnibusWildBootstrapPValue, 4)})`,
    sep,
    feHead,
    sep,
    ...feRows,
    sep
  ].join('\n');

  const cHead =
    `${pad('Contrast (A vs B)', 28)} | ${pad('MAE_A - MAE_B', 13, true)} ${pad('Cluster SE', 10, true)} ${pad('t', 8, true)} ${pad('Cluster p', 9, true)} ${pad('WildBoot p', 10, true)} ${pad('Wild 95% CI', 19, true)}`;
  const cRows =
    pairFixedEffects.pairwiseContrasts.length > 0
      ? pairFixedEffects.pairwiseContrasts.map(c => {
          const wCi = `[${fmt(c.wildBootstrapCiLower, 2)}, ${fmt(c.wildBootstrapCiUpper, 2)}]`;
          return `${pad(`${c.sourceALabel} - ${c.sourceBLabel}`, 28)} | ${pad(fmt(c.diffAminusB, 3), 13, true)} ${pad(fmt(c.seCluster, 3), 10, true)} ${pad(fmt(c.tStat, 2), 8, true)} ${pad(fmt(c.pValueCluster, 4), 9, true)} ${pad(fmt(c.wildBootstrapPValue, 4), 10, true)} ${pad(wCi, 19, true)}`;
        })
      : [`(Hanya 1 sumber pembanding; kontras antar-sumber memerlukan >= 2 sumber pembanding)`];

  const pairwiseContrastsTableText = [
    `. * Tabel 4: Kontras Berpasangan Antarsumber Pembanding & Wild Cluster Bootstrap (${pairFixedEffects.bootstrapReplications} reps)`,
    sep,
    cHead,
    sep,
    ...cRows,
    sep
  ].join('\n');

  const rkLines = ranking.ranks.map(
    r =>
      `Rank #${r.rank}: ${pad(r.sourceLabel, 24)} | MAE=${fmt(r.mae, 3)} | RMSE=${fmt(r.rmse, 3)} | MBE=${fmt(r.mbe, 3)} | CCC=${fmt(r.ccc, 4)} | ${r.rankNote}`
  );

  const diagnosticsAndRankingText = [
    `. * Tabel 5: Ringkasan Diagnostik Panel & Pemeringkatan Sumber Pembanding`,
    sep,
    `Heteroskedasticity F : ${fmt(diagnostics.heteroskedasticityTest.statisticValue, 3)} (p = ${fmt(diagnostics.heteroskedasticityTest.pValue ?? 1, 4)})`,
    `Within-City AR(1) t  : ${fmt(diagnostics.serialCorrelationTest.statisticValue, 3)} (p = ${fmt(diagnostics.serialCorrelationTest.pValue ?? 1, 4)})`,
    `Pesaran CD Stat      : ${fmt(diagnostics.crossSectionalDependenceTest.statisticValue, 3)} (p = ${fmt(diagnostics.crossSectionalDependenceTest.pValue ?? 1, 4)})`,
    `Cluster Count (G)    : ${diagnostics.clusterCountAudit.nClusters} (${diagnostics.clusterCountAudit.isSmallCluster ? 'Small Cluster < 30: Wild Bootstrap Aktif' : 'Memadai >= 30'})`,
    `Outlier Sensitivity  : ${diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'PERINGATAN: Urutan berubah pada 95% trimmed MAE' : 'Stabil (urutan MAE tidak berubah)'}`,
    sep,
    ...rkLines,
    sep,
    `Keputusan Akhir [${ranking.conclusivenessStatus}]: ${ranking.rankingSummary}`
  ].join('\n');

  return {
    headerConsoleText,
    accuracyMetricsTableText,
    cccAndBlandAltmanTableText,
    pairFixedEffectsTableText,
    pairwiseContrastsTableText,
    diagnosticsAndRankingText
  };
}

export function generateAccuracyAcademicInterpretations(
  core: AccuracyCoreBundle
): AccuracyAcademicInterpretations {
  const { referenceSource, metrics, pairFixedEffects, diagnostics, ranking, qualityReport } = core;
  const refLabel = `${referenceSource.name} (${referenceSource.label})`;

  const referenceValidityInterpretation =
    `${qualityReport.referenceAudit.summary} ` +
    `Dalam metodologi Reference-Based Measurement Accuracy Assessment, sumber referensi "${refLabel}" berfungsi sebagai patokan pembanding empiris (benchmark), bukan nilai kebenaran absolut bebas galat. ` +
    `Kesesuaian satuan (${core.datasetMeta.workingUnitNote}), cakupan periode (${qualityReport.yearMin ?? '-'}–${qualityReport.yearMax ?? '-'}), dan konsistensi metode agregasi wajib dipertimbangkan ketika menginterpretasikan selisih pengukuran.`;

  const corrSummary = metrics
    .map(
      m =>
        `${m.sourceLabel} mencatat korelasi Pearson overall r = ${m.pearsonR.toFixed(4)} (Spearman ρ = ${m.spearmanRho.toFixed(4)}, within-city r = ${m.withinCityR.toFixed(4)}, first-difference r = ${m.firstDiffR.toFixed(4)})`
    )
    .join('; ');

  const edaAndCorrelationInterpretation =
    `Berdasarkan analisis korelasi panel pada ${core.datasetMeta.nCompletePairs} pasangan observasi Kota-Tahun terhadap referensi ${refLabel}: ${corrSummary}. ` +
    `Penting ditekankan secara metodologis bahwa korelasi Pearson maupun Spearman yang tinggi hanya membuktikan keeratan hubungan linear/monotonik (presisi arah), namun BUKAN bukti akurasi pengukuran apabila terdapat bias sistematis aditif (location shift) atau kemiringan skala (scale shift).`;

  const accSummary = metrics
    .map(
      m =>
        `${m.sourceLabel} menghasilkan MAE = ${m.mae.toFixed(3)} (95% CI [${m.maeCiLower.toFixed(3)}, ${m.maeCiUpper.toFixed(3)}]), RMSE = ${m.rmse.toFixed(3)}, MBE = ${m.mbe.toFixed(3)} (p = ${m.mbePValue.toFixed(4)}), Lin's CCC = ${m.ccc.ccc.toFixed(4)} (Cb = ${m.ccc.biasCorrectionFactorCb.toFixed(3)}), dan 95% Limits of Agreement Bland-Altman [${m.blandAltman.loaLower.toFixed(2)}, ${m.blandAltman.loaUpper.toFixed(2)}]`
    )
    .join('. ');

  const accuracyAndAgreementInterpretation =
    `Evaluasi akurasi dan kesepakatan terhadap sumber referensi ${refLabel} menunjukkan: ${accSummary}. ` +
    `Semakin kecil nilai MAE dan RMSE menunjukkan tingkat kesalahan rata-rata yang semakin rendah, sedangkan nilai MBE yang mendekati nol menandakan minimnya bias sistematis (overestimation/underestimation). ` +
    `Lin's Concordance Correlation Coefficient (CCC) menggabungkan korelasi Pearson (r) dengan faktor koreksi bias (Cb) untuk mengukur kedekatan titik pengamatan terhadap garis kesetaraan 45 derajat.`;

  const pairFixedEffectsInterpretation =
    pairFixedEffects.nComparisonSources <= 1
      ? `Karena analisis hanya melibatkan satu sumber pembanding terhadap sumber referensi ${refLabel}, estimasi terfokus pada pengujian rata-rata kesalahan absolut (MAE = ${pairFixedEffects.coefficients[0]?.meanAe.toFixed(3) ?? '0'}) dengan standar error yang dikelompokkan berdasarkan kota (G = ${pairFixedEffects.nClustersCity}).`
      : `Model inferensial Pair Fixed Effects mengestimasi persamaan AE_ijt = α_it + Σ β_j Source_j + ε_ijt dengan menyerap ${pairFixedEffects.nCompletePairs} efek tetap pasangan Kota-Tahun (α_it) dan mengelompokkan standar error pada ${pairFixedEffects.nClustersCity} klaster kota. ` +
        `Uji omnibus Wald menghasilkan F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${pairFixedEffects.omnibusFStat.toFixed(3)} dengan p = ${pairFixedEffects.omnibusPValue.toFixed(4)} (Wild Cluster Bootstrap p = ${pairFixedEffects.omnibusWildBootstrapPValue.toFixed(4)}). ` +
        `Kontras berpasangan menunjukkan: ` +
        pairFixedEffects.pairwiseContrasts
          .map(
            c =>
              `selisih MAE antara ${c.sourceALabel} dan ${c.sourceBLabel} adalah ΔMAE = ${c.diffAminusB.toFixed(3)} (SE cluster = ${c.seCluster.toFixed(3)}, p cluster = ${c.pValueCluster.toFixed(4)}, Wild Bootstrap p = ${c.wildBootstrapPValue.toFixed(4)})`
          )
          .join('; ') +
        `.`;

  const diagnosticsInterpretation =
    `${diagnostics.heteroskedasticityTest.conclusion} ${diagnostics.serialCorrelationTest.conclusion} ${diagnostics.crossSectionalDependenceTest.conclusion} ` +
    `${diagnostics.clusterCountAudit.message} ${diagnostics.outlierSensitivityAudit.summary} ${diagnostics.normalityAndCltNote.explanation}`;

  const rankingDecisionInterpretation = `${ranking.rankingSummary} ${ranking.methodologicalCaveat}`;

  return {
    referenceValidityInterpretation,
    edaAndCorrelationInterpretation,
    accuracyAndAgreementInterpretation,
    pairFixedEffectsInterpretation,
    diagnosticsInterpretation,
    rankingDecisionInterpretation,
    researchLimitations: diagnostics.inferenceLimitations,
    finalConclusion: ranking.rankingSummary
  };
}
