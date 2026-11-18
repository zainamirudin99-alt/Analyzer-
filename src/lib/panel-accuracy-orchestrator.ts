// ============================================================
// Reference-Free All-Source Latent & Consensus Measurement Accuracy
// Pipeline Orchestrator (Opsi B: Evaluates & Ranks All J Sources Equally)
// ============================================================

import { generateAccuracyRScript } from './panel-accuracy-codegen-r';
import { generateAccuracyStataDoFile } from './panel-accuracy-codegen-stata';
import { computeAccuracyEDA } from './panel-accuracy-correlation';
import { computePanelAccuracyDiagnostics } from './panel-accuracy-diagnostics';
import { fitPairFixedEffectsModel } from './panel-accuracy-fixed-effects';
import {
  AccuracyCoreBundle,
  generateAccuracyAcademicInterpretations,
  generateStataAccuracyOutputBundle
} from './panel-accuracy-interpretation';
import { fitBayesianLatentMeasurementModel } from './panel-accuracy-latent';
import { computeAllSourceAccuracyMetrics } from './panel-accuracy-metrics';
import { preparePanelAccuracyObservations } from './panel-accuracy-preprocessing';
import { computeComparativeSourceRanking } from './panel-accuracy-ranking';
import {
  AccuracyPreprocessingOptions,
  PanelAccuracyFitResult,
  PanelDataset,
  PreprocessingRecommendationBundle,
  PreprocessingScenarioCandidate,
  StepRecommendationAction
} from './panel-accuracy-types';
import {
  DEFAULT_ACCURACY_PREPROCESSING,
  validatePanelAccuracyDataset
} from './panel-accuracy-validation';

export function executePanelAccuracyPipeline(params: {
  dataset: PanelDataset;
  preprocessing?: Partial<AccuracyPreprocessingOptions>;
  bootstrapReplications?: number;
  mcmcIterations?: number;
  executionSource?: 'client_live' | 'server_verified';
  driscollKraayActivated?: boolean;
  correlatedErrorReviewed?: boolean;
}): PanelAccuracyFitResult {
  const startedAt = Date.now();
  const preprocessing: AccuracyPreprocessingOptions = {
    ...DEFAULT_ACCURACY_PREPROCESSING,
    ...(params.preprocessing || {})
  };
  const usedBootstrapReps = params.bootstrapReplications ?? 999;
  const usedMcmcIterations = params.mcmcIterations ?? 450;

  const qualityReport = validatePanelAccuracyDataset(params.dataset, preprocessing);
  if (qualityReport.hasBlockingError) {
    const errMsgs = qualityReport.checks
      .filter(c => c.severity === 'error')
      .map(c => c.message)
      .join(' ');
    throw new Error(
      `Validasi dataset evaluasi akurasi gagal: ${errMsgs || 'Periksa pemetaan kolom, jumlah sumber, dan duplikat City-Year.'}`
    );
  }

  const prepared = preparePanelAccuracyObservations(params.dataset, preprocessing);
  if (prepared.completeCaseObservations.length < 3) {
    throw new Error('Jumlah pasangan observasi Complete-Case terlalu sedikit (< 3) untuk analisis akurasi panel.');
  }

  const eda = computeAccuracyEDA(prepared.completeCaseObservations, params.dataset.sources);

  let latentOut = fitBayesianLatentMeasurementModel({
    observations: prepared.completeCaseObservations,
    sources: prepared.comparisonSources,
    iterationsPerChain: usedMcmcIterations,
    burnInPerChain: usedMcmcIterations >= 700 ? 400 : 350
  });
  if (prepared.comparisonSources.length >= 3 && latentOut.summary.maxRhat > 1.08) {
    latentOut = fitBayesianLatentMeasurementModel({
      observations: prepared.completeCaseObservations,
      sources: prepared.comparisonSources,
      iterationsPerChain: Math.max(usedMcmcIterations * 2, 1000),
      burnInPerChain: 600
    });
  }

  const metrics = computeAllSourceAccuracyMetrics(prepared, latentOut);
  const pairFixedEffects = fitPairFixedEffectsModel(prepared, latentOut, {
    bootstrapReplications: usedBootstrapReps
  });
  const diagnostics = computePanelAccuracyDiagnostics(prepared, latentOut, {
    qualityReport,
    metrics,
    pairFixedEffects,
    preprocessing,
    driscollKraayActivated: params.driscollKraayActivated,
    correlatedErrorReviewed: params.correlatedErrorReviewed
  });
  const ranking = computeComparativeSourceRanking({
    metrics,
    latentOut,
    pairFixedEffects,
    diagnostics,
    qualityReport
  });

  const core: AccuracyCoreBundle = {
    datasetMeta: {
      cityIdColumn: params.dataset.cityIdColumn,
      yearColumn: params.dataset.yearColumn,
      nObsRaw: qualityReport.nObsRaw,
      nCompletePairs: prepared.completeCaseObservations.length,
      nCities: prepared.cities.length,
      nYears: prepared.years.length,
      isBalanced: qualityReport.isBalanced,
      workingUnitNote: prepared.workingUnitNote
    },
    sources: params.dataset.sources,
    referenceSource: prepared.referenceSource,
    comparisonSources: prepared.comparisonSources,
    qualityReport,
    preprocessing,
    eda,
    latentModel: latentOut.summary,
    metrics,
    pairFixedEffects,
    diagnostics,
    ranking
  };

  const stataOutput = generateStataAccuracyOutputBundle(core);
  const interpretations = generateAccuracyAcademicInterpretations(core);
  const generatedCode = {
    stataDoFile: generateAccuracyStataDoFile({
      cityIdColumn: params.dataset.cityIdColumn,
      yearColumn: params.dataset.yearColumn,
      sources: params.dataset.sources,
      preprocessing
    }),
    rScript: generateAccuracyRScript({
      cityIdColumn: params.dataset.cityIdColumn,
      yearColumn: params.dataset.yearColumn,
      sources: params.dataset.sources,
      preprocessing
    }),
    stanCode: [
      '// Stan Model: Bayesian Hierarchical Panel Latent Measurement Model',
      'data {',
      '  int<lower=1> P;               // Complete-case entity-time pairs',
      `  int<lower=2> J;               // Evaluated measurement sources (J = ${params.dataset.sources.length})`,
      '  matrix[P, J] X;               // Observed panel measurements',
      '}',
      'parameters {',
      '  vector[P] theta_raw;',
      '  real mu_theta;',
      '  real<lower=1e-6> sigma_theta;',
      '  vector[J] alpha_raw;',
      '  vector<lower=0.1>[J] lambda_raw;',
      '  vector<lower=1e-6>[J] sigma_eps;',
      '}',
      'transformed parameters {',
      '  real geo_lambda = exp(mean(log(lambda_raw)));',
      '  vector[J] lambda = lambda_raw / geo_lambda;',
      '  vector[J] alpha = alpha_raw - mean(alpha_raw);',
      '  vector[P] theta = mu_theta + sigma_theta * geo_lambda * theta_raw;',
      '}',
      'model {',
      '  theta_raw ~ std_normal();',
      '  log(lambda_raw) ~ normal(0, 0.5);',
      '  sigma_eps ~ cauchy(0, 5);',
      '  for (j in 1:J)',
      '    X[, j] ~ normal(alpha[j] + lambda[j] * theta, sigma_eps[j]);',
      '}',
      'generated quantities {',
      '  vector[J] total_latent_rmse;',
      '  vector[J] reliability_R2;',
      '  for (j in 1:J) {',
      '    real sig_var = square(lambda[j] * sigma_theta);',
      '    real mse_j = square(alpha[j]) + square((lambda[j] - 1) * sigma_theta) + square(sigma_eps[j]);',
      '    total_latent_rmse[j] = sqrt(mse_j);',
      '    reliability_R2[j] = sig_var / (sig_var + square(sigma_eps[j]));',
      '  }',
      '}'
    ].join('\n')
  };

  return {
    engineAttribution:
      'Bayesian Hierarchical Panel Latent Measurement Model (3-Chain Gibbs MCMC + Grubbs Triangulation + Pair Fixed Effects & Rademacher Wild Cluster Bootstrap)',
    executionMeta: {
      bootstrapReplications: usedBootstrapReps,
      mcmcIterations: latentOut.summary.iterationsPerChain,
      elapsedMs: Math.max(1, Date.now() - startedAt),
      source: params.executionSource ?? 'server_verified',
      executedAt: new Date().toISOString()
    },
    ...core,
    preprocessing,
    stataOutput,
    interpretations,
    generatedCode
  };
}

/**
 * Evaluate candidate preprocessing configurations in Step 3 without altering user data.
 */
export function evaluateAccuracyPreprocessingRecommendations(params: {
  dataset: PanelDataset;
  allowNegativeValues?: boolean;
}): PreprocessingRecommendationBundle {
  const startedAt = Date.now();
  const baseQuality = validatePanelAccuracyDataset(params.dataset, DEFAULT_ACCURACY_PREPROCESSING);
  const hasDuplicates = baseQuality.duplicateKeys.length > 0;
  const hasNegatives =
    (baseQuality.checks.find(c => c.id === 'negative_or_zero')?.count || 0) > 0;

  const candidateSpecs: Array<{
    id: string;
    label: string;
    shortTag: string;
    applyLog1p: boolean;
    applyWinsorize: boolean;
  }> = [
    {
      id: 'raw_baseline',
      label: 'Baseline Satuan Fisik Asli (Tanpa Transformasi)',
      shortTag: 'Satuan Fisik Asli',
      applyLog1p: false,
      applyWinsorize: false
    },
    {
      id: 'winsor_25',
      label: 'Winsorization 2.5% Ekor Bawah & Atas (Meredam Outlier Ekstrem)',
      shortTag: 'Winsorization 2.5%',
      applyLog1p: false,
      applyWinsorize: true
    }
  ];

  if (!hasNegatives) {
    candidateSpecs.push(
      {
        id: 'log1p_only',
        label: 'Transformasi Logaritmik log(1 + x) (Kesalahan Relatif Proporsional)',
        shortTag: 'log(1 + x)',
        applyLog1p: true,
        applyWinsorize: false
      },
      {
        id: 'log1p_winsor',
        label: 'log(1 + x) + Winsorization 2.5%',
        shortTag: 'log(1 + x) + Winsor',
        applyLog1p: true,
        applyWinsorize: true
      }
    );
  }

  const scenarios: PreprocessingScenarioCandidate[] = [];
  let rawRankOrderChanged = false;
  let rawSkewAbs = 0;

  for (const spec of candidateSpecs) {
    const opt: AccuracyPreprocessingOptions = {
      ...DEFAULT_ACCURACY_PREPROCESSING,
      dropDuplicateCityYear: hasDuplicates,
      applyLog1p: spec.applyLog1p,
      applyWinsorize: spec.applyWinsorize,
      allowNegativeValues: Boolean(params.allowNegativeValues)
    };

    const prepared = preparePanelAccuracyObservations(params.dataset, opt);
    if (prepared.completeCaseObservations.length < 3) continue;

    const latentOut = fitBayesianLatentMeasurementModel({
      observations: prepared.completeCaseObservations,
      sources: prepared.comparisonSources,
      nChains: 2,
      iterationsPerChain: 180,
      burnInPerChain: 100
    });
    const metrics = computeAllSourceAccuracyMetrics(prepared, latentOut);
    const diag = computePanelAccuracyDiagnostics(prepared, latentOut);
    if (metrics.length === 0) continue;

    if (spec.id === 'raw_baseline') {
      rawRankOrderChanged = diag.outlierSensitivityAudit.rankOrderChanged;
      rawSkewAbs = Math.abs(diag.normalityAndCltNote.residualSkewness);
    }

    const sorted = [...metrics].sort((a, b) => a.totalLatentRmse - b.totalLatentRmse);
    const best = sorted[0];
    const meanReliabilityR2 =
      metrics.reduce((sum, m) => sum + m.reliabilityR2, 0) / Math.max(1, metrics.length);
    const minReliabilityR2 = Math.min(...metrics.map(m => m.reliabilityR2), 1);
    const maxRhat = latentOut.summary.maxRhat;
    const maxPropBiasT = Math.max(...metrics.map(m => Math.abs(m.blandAltman.propBiasTStat)), 0);
    const maxOutlierShift = Math.max(
      ...diag.outlierSensitivityAudit.entries.map(e => Math.abs(e.shiftPct)),
      0
    );

    const reliabilityPts = 45 * Math.max(0, Math.min(1, meanReliabilityR2));
    const convergencePts =
      maxRhat <= 1.05 ? 20 : maxRhat <= 1.1 ? 15 : Math.max(0, 15 - (maxRhat - 1.1) * 40);
    const stabilityPts = !diag.outlierSensitivityAudit.rankOrderChanged
      ? maxOutlierShift <= 10
        ? 20
        : maxOutlierShift <= 20
          ? 15
          : 10
      : 4;
    const propBiasPts = maxPropBiasT <= 2.0 ? 10 : maxPropBiasT <= 3.5 ? 6 : 3;
    const interpretabilityBonus =
      spec.id === 'raw_baseline' ? 5 : spec.id === 'winsor_25' ? 2 : 0;
    const compositeQualityScore = Number(
      Math.max(0, Math.min(100, reliabilityPts + convergencePts + stabilityPts + propBiasPts + interpretabilityBonus)).toFixed(1)
    );

    const rationale =
      spec.id === 'raw_baseline'
        ? `Mempertahankan satuan fisik asli (${best.unit}); Sumber #1 = ${best.sourceLabel}, Mean Reliabilitas R² = ${(meanReliabilityR2 * 100).toFixed(2)}%, Max R-hat = ${maxRhat.toFixed(3)}.`
        : spec.id === 'winsor_25'
          ? `Meredam ${baseQuality.outlierCountTotal} observasi ekstrem; pergeseran sensitivitas maks ${maxOutlierShift.toFixed(1)}% (Mean R² = ${(meanReliabilityR2 * 100).toFixed(2)}%).`
          : `Mengevaluasi reliabilitas proporsional pada skala logaritmik (Mean R² = ${(meanReliabilityR2 * 100).toFixed(2)}%, CCC terbaik = ${best.ccc.ccc.toFixed(4)}, |t| proportional bias maks = ${maxPropBiasT.toFixed(2)}).`;

    scenarios.push({
      id: spec.id,
      label: spec.label,
      shortTag: spec.shortTag,
      options: opt,
      nCompletePairs: prepared.completeCaseObservations.length,
      bestComparisonLabel: best.sourceLabel,
      bestMae: best.mae,
      bestNmaePct: best.nmaePct,
      bestCcc: best.ccc.ccc,
      meanReliabilityR2,
      minReliabilityR2,
      maxRhat,
      topLatentRmse: best.totalLatentRmse,
      compositeQualityScore,
      maxProportionalBiasAbsT: maxPropBiasT,
      outlierSensitivityShiftPct: maxOutlierShift,
      isRecommended: false,
      rationale
    });
  }

  const rawScen = scenarios.find(s => s.id === 'raw_baseline') || scenarios[0];
  const winsorScen = scenarios.find(s => s.id === 'winsor_25');
  const logScen = scenarios.find(s => s.id === 'log1p_only');
  const logWinsorScen = scenarios.find(s => s.id === 'log1p_winsor');

  let recommended = rawScen;
  const outlierSevere =
    baseQuality.outlierCountTotal > 0 &&
    (rawRankOrderChanged || (rawScen?.outlierSensitivityShiftPct ?? 0) > 20);
  const rawPropSevere = (rawScen?.maxProportionalBiasAbsT ?? 0) > 2.5;
  const skewSevere = rawSkewAbs > 1.5;

  // Pick statistically optimal candidate based on composite score + interpretability guardrails
  const sortedByQuality = [...scenarios].sort(
    (a, b) => b.compositeQualityScore - a.compositeQualityScore
  );
  if (sortedByQuality.length > 0 && rawScen) {
    const topQual = sortedByQuality[0];
    // Preserve physical units (raw_baseline) unless another candidate meaningfully improves composite quality (> +2.5 pts)
    // or specifically remediates severe outlier rank shifts / proportional bias without sacrificing reliability.
    if (
      topQual.id !== rawScen.id &&
      (topQual.compositeQualityScore >= rawScen.compositeQualityScore + 2.5 ||
        outlierSevere ||
        (rawPropSevere && skewSevere && logScen && logScen.maxProportionalBiasAbsT < rawScen.maxProportionalBiasAbsT - 0.8))
    ) {
      recommended = topQual;
    } else if (outlierSevere && winsorScen) {
      recommended = winsorScen;
    } else if (
      rawPropSevere &&
      skewSevere &&
      !hasNegatives &&
      logScen &&
      logScen.compositeQualityScore >= rawScen.compositeQualityScore - 1
    ) {
      recommended =
        logWinsorScen && logWinsorScen.compositeQualityScore > logScen.compositeQualityScore + 1.5
          ? logWinsorScen
          : logScen;
    }
  }

  scenarios.forEach(s => {
    s.isRecommended = s.id === recommended.id;
  });

  const actionItems: StepRecommendationAction[] = [];
  if (hasDuplicates) {
    actionItems.push({
      id: 'step3_drop_dups',
      priority: 'KRITIS',
      title: `Hapus ${baseQuality.duplicateKeys.length} Kunci Duplikat (City, Year)`,
      statisticalBasis:
        'Duplikasi City-Year melanggar identifikasi panel xtset dan menggandakan bobot kota tertentu secara tidak sah.',
      actionLabel: 'Aktifkan Penghapusan Duplikat (Pertahankan Entri Pertama)',
      expectedImpact: 'Menjamin struktur panel unik untuk Pair Fixed Effects dan model laten.',
      actionType: 'DROP_DUPLICATES'
    });
  }
  if (params.dataset.sources.length < 3) {
    actionItems.push({
      id: 'step3_need_3_sources',
      priority: 'KRITIS',
      title: `Tambahkan Sumber Pengukuran Ke-3 (Saat Ini J = ${params.dataset.sources.length})`,
      statisticalBasis:
        'Model pengukuran laten tanpa variabel referensi memerlukan minimal 3 sumber independen untuk identifikasi unik varians error.',
      actionLabel: 'Kembali ke Step 2 untuk Menambah Sumber',
      expectedImpact: 'Mengaktifkan status identifikasi penuh agar pemeringkatan bersifat konklusif.',
      actionType: 'ADD_THIRD_SOURCE'
    });
  }
  if (recommended.options.applyWinsorize) {
    actionItems.push({
      id: 'step3_apply_winsor',
      priority: 'TINGGI',
      title: 'Aktifkan Winsorization 2.5% untuk Meredam Pengaruh Outlier Ekstrem',
      statisticalBasis: `Skor kualitas meningkat dari ${rawScen.compositeQualityScore} ke ${recommended.compositeQualityScore} dan menstabilkan pergeseran outlier (${recommended.outlierSensitivityShiftPct.toFixed(1)}%).`,
      actionLabel: 'Terapkan Winsorization 2.5%',
      expectedImpact: 'Mencegah distorsi varians error tanpa menghapus baris panel berharga.',
      actionType: 'APPLY_WINSORIZE'
    });
  }
  if (recommended.options.applyLog1p) {
    actionItems.push({
      id: 'step3_apply_log1p',
      priority: 'DISARANKAN',
      title: 'Aktifkan Transformasi log(1 + x) untuk Bias Proporsional Lintas Skala',
      statisticalBasis: `Proportional bias pada skala asli signifikan (|t| = ${(rawScen?.maxProportionalBiasAbsT ?? 0).toFixed(2)}); skala log(1+x) mengevaluasi kesalahan relatif persentase.`,
      actionLabel: 'Terapkan Transformasi log(1 + x)',
      expectedImpact: `Menurunkan proportional bias menjadi |t| = ${recommended.maxProportionalBiasAbsT.toFixed(2)} dengan Mean R² ${(recommended.meanReliabilityR2 * 100).toFixed(2)}%.`,
      actionType: 'APPLY_LOG1P'
    });
  }
  if (actionItems.length === 0) {
    actionItems.push({
      id: 'step3_keep_optimal',
      priority: 'OPTIMAL',
      title: 'Pertahankan Satuan Fisik Asli (Baseline Sudah Optimal)',
      statisticalBasis: `Data bebas duplikat bermasalah, konvergensi baik (R-hat = ${recommended.maxRhat.toFixed(3)}), dan Mean Reliabilitas R² = ${(recommended.meanReliabilityR2 * 100).toFixed(2)}% (Skor ${recommended.compositeQualityScore}/100).`,
      actionLabel: 'Terapkan Konfigurasi Optimal Satuan Asli',
      expectedImpact:
        'Menjaga interpretabilitas langsung Error SD, RMSE, dan bias dalam satuan fisik asli tanpa distorsi transformasi buatan.',
      actionType: 'RESET_RAW_BASELINE'
    });
  }

  return {
    evaluatedCount: scenarios.length,
    elapsedMs: Date.now() - startedAt,
    bestScenarioId: recommended.id,
    bestScenario: recommended,
    scenarios,
    actionItems,
    optimalChecklistNote:
      'Pemilihan skenario terbaik Step 3 membandingkan metrik bebas-skala (Mean Reliability R², Max R-hat, Stabilitas Outlier 95% Trim, Proportional Bias |t|) sehingga perbandingan antara skala asli vs log(1+x) bersifat adil secara statistika.',
    summaryNote:
      `Sistem mengevaluasi ${scenarios.length} skenario prapemrosesan (Skor Optimal = ${recommended.compositeQualityScore}/100). ` +
      `Rekomendasi utama: "${recommended.label}" — mempertahankan estimasi yang valid secara statistika (Mean R² = ${(recommended.meanReliabilityR2 * 100).toFixed(2)}%, Max R-hat = ${recommended.maxRhat.toFixed(3)}).`
  };
}
