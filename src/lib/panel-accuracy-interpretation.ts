// ============================================================
// Reference-Free All-Source Latent & Consensus Assessment
// Stata-Style Output Tables & Indonesian Academic Interpretations
// ============================================================

import {
  AccuracyAcademicInterpretations,
  ComparativeRankingResult,
  CorrelationMatricesBundle,
  LatentModelSummary,
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
  latentModel: LatentModelSummary;
  metrics: SourceAccuracyMetricRow[];
  pairFixedEffects: PairFixedEffectsResult;
  diagnostics: PanelAccuracyDiagnosticsResult;
  ranking: ComparativeRankingResult;
}

export function generateStataAccuracyOutputBundle(core: AccuracyCoreBundle): StataAccuracyOutputBundle {
  const { datasetMeta, latentModel, metrics, pairFixedEffects, diagnostics, ranking } = core;
  const sep = '-'.repeat(106);

  const headerConsoleText = [
    `. * Reference-Free All-Source Latent & Consensus Measurement Accuracy Assessment`,
    `. * Benchmark Model    : Bayesian Hierarchical Congeneric Latent Model (${latentModel.nChains} chains × ${latentModel.iterationsPerChain} iters)`,
    `. * Evaluated Sources  : J = ${core.sources.length} (${core.sources.map(s => `${s.name}(${s.label})`).join(', ')}) [Unit: ${datasetMeta.workingUnitNote}]`,
    `. * Panel Structure    : ${datasetMeta.cityIdColumn} (G = ${datasetMeta.nCities} cities) x ${datasetMeta.yearColumn} (T = ${datasetMeta.nYears} years)`,
    `. * Complete-Case Pairs: ${datasetMeta.nCompletePairs} of ${datasetMeta.nObsRaw} raw rows | Max R-hat = ${latentModel.maxRhat.toFixed(4)} | Min ESS = ${latentModel.minEss}`
  ].join('\n');

  const mHead =
    `${pad('Evaluated Source', 24)} | ${pad('TotRMSE', 9, true)} ${pad('ErrSD(σ)', 9, true)} ${pad('Reliab R²', 10, true)} ${pad('Alpha(α)', 9, true)} ${pad('Lambda(λ)', 9, true)} ${pad('LOSO MAE', 9, true)} ${pad('P(Best)', 8, true)} ${pad('R-hat', 6, true)}`;
  const mRows = metrics.map(m =>
    `${pad(m.sourceLabel, 24)} | ${pad(fmt(m.totalLatentRmse, 2), 9, true)} ${pad(fmt(m.errorSd, 2), 9, true)} ${pad(fmt(m.reliabilityR2, 4), 10, true)} ${pad(fmt(m.latentInterceptBias, 2), 9, true)} ${pad(fmt(m.latentLoading, 3), 9, true)} ${pad(fmt(m.mae, 2), 9, true)} ${pad(`${(m.posteriorProbBest * 100).toFixed(1)}%`, 8, true)} ${pad(fmt(m.mcmcRhat, 3), 6, true)}`
  );

  const accuracyMetricsTableText = [
    `. * Tabel 1: Evaluasi Akurasi & Reliabilitas Laten Seluruh J = ${metrics.length} Sumber (Tanpa Reference Terkunci)`,
    sep,
    mHead,
    sep,
    ...mRows,
    sep,
    `Identification: ${latentModel.identificationRule}`
  ].join('\n');

  const baHead =
    `${pad('Evaluated Source', 24)} | ${pad('N(CC/Av)', 9, true)} ${pad('LOSO Lin CCC [95% CI]', 22, true)} ${pad('Cb', 6, true)} ${pad('LOSO MBE', 9, true)} ${pad('SD Diff', 8, true)} ${pad('95% LoA (vs θ̂_-j)', 21, true)}`;
  const baRows = metrics.map(m => {
    const cccCi = `${fmt(m.ccc.ccc, 3)} [${fmt(m.ccc.ciLower, 3)},${fmt(m.ccc.ciUpper, 3)}]`;
    const loaStr = `[${fmt(m.blandAltman.loaLower, 1)}, ${fmt(m.blandAltman.loaUpper, 1)}]`;
    return `${pad(m.sourceLabel, 24)} | ${pad(`${m.nCompleteCase}/${m.nAvailableCase}`, 9, true)} ${pad(cccCi, 22, true)} ${pad(fmt(m.ccc.biasCorrectionFactorCb, 3), 6, true)} ${pad(fmt(m.blandAltman.meanBias, 2), 9, true)} ${pad(fmt(m.blandAltman.sdDiff, 2), 8, true)} ${pad(loaStr, 21, true)}`;
  });

  const cccAndBlandAltmanTableText = [
    `. * Tabel 2: Lin's CCC & Bland-Altman Agreement Setiap Sumber vs Konsensus Laten Leave-One-Source-Out`,
    sep,
    baHead,
    sep,
    ...baRows,
    sep
  ].join('\n');

  const feHead =
    `${pad('Source (Dep: |X - θ̂|)', 24)} | ${pad('Mean AE', 9, true)} ${pad('Beta Diff', 10, true)} ${pad('Cluster SE', 10, true)} ${pad('t', 8, true)} ${pad('P>|t|', 8, true)} ${pad('[95% Conf. Interval]', 21, true)}`;
  const feRows = pairFixedEffects.coefficients.map(c => {
    if (c.isBaselineComparison) {
      return `${pad(`${c.sourceLabel} (Base)`, 24)} | ${pad(fmt(c.meanAe, 3), 9, true)} ${pad('0.000 (omitted)', 21, true)} ${pad('-', 8, true)} ${pad('-', 8, true)} ${pad(`[${fmt(c.ciLower, 2)}, ${fmt(c.ciUpper, 2)}]`, 21, true)}`;
    }
    const ci = `[${fmt(c.ciLower, 2)}, ${fmt(c.ciUpper, 2)}]`;
    return `${pad(c.sourceLabel, 24)} | ${pad(fmt(c.meanAe, 3), 9, true)} ${pad(fmt(c.betaDiffVsBaseline, 3), 10, true)} ${pad(fmt(c.seCluster, 3), 10, true)} ${pad(fmt(c.tStat, 2), 8, true)} ${pad(fmt(c.pValue, 4), 8, true)} ${pad(ci, 21, true)}`;
  });

  const pairFixedEffectsTableText = [
    `. areg ae i.source_id, absorb(city_year_pair) vce(cluster ${datasetMeta.cityIdColumn})`,
    `Absorbed Pair Fixed Effects : ${pairFixedEffects.nCompletePairs} City-Year pairs | Long N = ${pairFixedEffects.nLongObs} (ALL ${pairFixedEffects.nComparisonSources} sources)`,
    `Std. Err. adjusted for      : ${pairFixedEffects.nClustersCity} clusters in ${datasetMeta.cityIdColumn} (df = ${pairFixedEffects.dfCluster})`,
    `Omnibus Wald F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${fmt(pairFixedEffects.omnibusFStat, 3)} (Prob > F = ${fmt(pairFixedEffects.omnibusPValue, 4)} | Wild Bootstrap p = ${fmt(pairFixedEffects.omnibusWildBootstrapPValue, 4)})`,
    sep,
    feHead,
    sep,
    ...feRows,
    sep
  ].join('\n');

  const cHead =
    `${pad('Contrast (A vs B)', 28)} | ${pad('ΔMAE(A-B)', 10, true)} ${pad('Cluster p', 9, true)} ${pad('WildBoot p', 10, true)} ${pad('P_Bayes(A<B)', 12, true)} ${pad('Wild 95% CI', 19, true)}`;
  const cRows =
    pairFixedEffects.pairwiseContrasts.length > 0
      ? pairFixedEffects.pairwiseContrasts.map(c => {
          const wCi = `[${fmt(c.wildBootstrapCiLower, 2)}, ${fmt(c.wildBootstrapCiUpper, 2)}]`;
          return `${pad(`${c.sourceALabel} - ${c.sourceBLabel}`, 28)} | ${pad(fmt(c.diffAminusB, 3), 10, true)} ${pad(fmt(c.pValueCluster, 4), 9, true)} ${pad(fmt(c.wildBootstrapPValue, 4), 10, true)} ${pad(`${(c.posteriorProbABetterThanB * 100).toFixed(1)}%`, 12, true)} ${pad(wCi, 19, true)}`;
        })
      : [`(Kontras memerlukan >= 2 sumber)`];

  const pairwiseContrastsTableText = [
    `. * Tabel 4: Kontras Berpasangan Seluruh C(${metrics.length},2) Pasangan Sumber (${pairFixedEffects.bootstrapReplications} Wild Boot Reps)`,
    sep,
    cHead,
    sep,
    ...cRows,
    sep
  ].join('\n');

  const rkLines = ranking.ranks.map(
    r =>
      `Rank #${r.rank}: ${pad(r.sourceLabel, 24)} | TotRMSE=${fmt(r.totalLatentRmse, 2)} | ErrSD=${fmt(r.errorSd, 2)} | R²=${fmt(r.reliabilityR2, 4)} | P(Best)=${(r.posteriorProbBest * 100).toFixed(1)}% | ${r.rankNote}`
  );

  const diagnosticsAndRankingText = [
    `. * Tabel 5: Ringkasan Diagnostik Panel, Konvergensi Bayesian & Pemeringkatan Seluruh Sumber`,
    sep,
    `Bayesian MCMC        : max R-hat = ${fmt(latentModel.maxRhat, 4)} | min ESS = ${latentModel.minEss} | PPC p = ${fmt(latentModel.posteriorPredictivePValue, 3)}`,
    `Heteroskedasticity F : ${fmt(diagnostics.heteroskedasticityTest.statisticValue, 3)} (p = ${fmt(diagnostics.heteroskedasticityTest.pValue ?? 1, 4)})`,
    `Within-City AR(1) t  : ${fmt(diagnostics.serialCorrelationTest.statisticValue, 3)} (p = ${fmt(diagnostics.serialCorrelationTest.pValue ?? 1, 4)})`,
    `Pesaran CD Stat      : ${fmt(diagnostics.crossSectionalDependenceTest.statisticValue, 3)} (p = ${fmt(diagnostics.crossSectionalDependenceTest.pValue ?? 1, 4)})`,
    `Cluster Count (G)    : ${diagnostics.clusterCountAudit.nClusters} (${diagnostics.clusterCountAudit.isSmallCluster ? 'Small Cluster < 30: Wild Bootstrap + Bayes Aktif' : 'Memadai >= 30'})`,
    `Outlier Sensitivity  : ${diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'PERINGATAN: Urutan berubah pada 95% trimmed' : 'Stabil (urutan deviasi tidak berubah)'}`,
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
  const { latentModel, metrics, pairFixedEffects, diagnostics, ranking, qualityReport } = core;

  const referenceValidityInterpretation =
    `${qualityReport.latentAudit.summary} Dalam metodologi Reference-Free All-Source Latent & Consensus Evaluation, ` +
    `tidak ada satu variabel pun yang dikunci secara sepihak sebagai reference absolut; sebaliknya, keseluruhan J = ${metrics.length} sumber ` +
    `dievaluasi serentak terhadap sinyal laten emisi bersama θ_it (${latentModel.identificationRule}).`;

  const corrSummary = metrics
    .map(
      m =>
        `${m.sourceLabel} mencatat Pearson r = ${m.pearsonR.toFixed(4)} (Spearman ρ = ${m.spearmanRho.toFixed(4)}, within-city r = ${m.withinCityR.toFixed(4)}, first-diff r = ${m.firstDiffR.toFixed(4)}) terhadap konsensus keluar-satu-sumber`
    )
    .join('; ');

  const edaAndCorrelationInterpretation =
    `Analisis korelasi panel pada ${core.datasetMeta.nCompletePairs} pasangan Kota-Tahun menunjukkan: ${corrSummary}. ` +
    `Korelasi tinggi hanya mengukur kesamaan arah linear, sedangkan ketepatan akurasi penuh harus dinilai lewat dekomposisi bias (α_j), loading skala (λ_j), Error SD (σ_εj), Total Latent RMSE, dan Reliabilitas (R²).`;

  const accSummary = metrics
    .map(
      m =>
        `${m.sourceLabel} memperoleh Total Latent RMSE = ${m.totalLatentRmse.toFixed(2)}, Error SD σ_ε = ${m.errorSd.toFixed(2)} (95% CrI [${m.errorSdCiLower.toFixed(2)}, ${m.errorSdCiUpper.toFixed(2)}]), Reliabilitas R² = ${(m.reliabilityR2 * 100).toFixed(2)}%, Bias relatif α_j = ${m.latentInterceptBias >= 0 ? '+' : ''}${m.latentInterceptBias.toFixed(2)}, LOSO MAE = ${m.mae.toFixed(2)}, Lin's CCC = ${m.ccc.ccc.toFixed(4)}, dan Posterior Prob Best = ${(m.posteriorProbBest * 100).toFixed(1)}%`
    )
    .join('. ');

  const accuracyAndAgreementInterpretation =
    `Estimasi Bayesian Hierarchical Latent Measurement Model dan Leave-One-Source-Out Consensus menghasilkan: ${accSummary}. ` +
    `Sumber dengan Total Latent RMSE terkecil, Error SD terendah, dan Reliabilitas R² tertinggi merupakan sumber yang paling akurat sekaligus paling konsisten memprediksi emisi laten sebenarnya.`;

  const pairFixedEffectsInterpretation =
    `Model Pair Fixed Effects membandingkan deviasi absolut seluruh J = ${pairFixedEffects.nComparisonSources} sumber terhadap estimasi emisi laten θ̂_it secara serentak (` +
    `menyerap ${pairFixedEffects.nCompletePairs} efek tetap pasangan Kota-Tahun pada ${pairFixedEffects.nClustersCity} klaster kota). ` +
    `Uji omnibus Wald menghasilkan F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${pairFixedEffects.omnibusFStat.toFixed(3)} (p = ${pairFixedEffects.omnibusPValue.toFixed(4)}, Wild Bootstrap p = ${pairFixedEffects.omnibusWildBootstrapPValue.toFixed(4)}).`;

  const diagnosticsInterpretation =
    `${diagnostics.bayesianConvergenceAudit.summary} ${diagnostics.heteroskedasticityTest.conclusion} ${diagnostics.serialCorrelationTest.conclusion} ` +
    `${diagnostics.crossSectionalDependenceTest.conclusion} ${diagnostics.outlierSensitivityAudit.summary} ${diagnostics.normalityAndCltNote.explanation}`;

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
