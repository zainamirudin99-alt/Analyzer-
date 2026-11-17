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
  PreprocessingScenarioCandidate
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
}): PanelAccuracyFitResult {
  const preprocessing: AccuracyPreprocessingOptions = {
    ...DEFAULT_ACCURACY_PREPROCESSING,
    ...(params.preprocessing || {})
  };

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

  const latentOut = fitBayesianLatentMeasurementModel({
    observations: prepared.completeCaseObservations,
    sources: prepared.comparisonSources,
    iterationsPerChain: params.mcmcIterations ?? 450,
    burnInPerChain: 250
  });

  const metrics = computeAllSourceAccuracyMetrics(prepared, latentOut);
  const pairFixedEffects = fitPairFixedEffectsModel(prepared, latentOut, {
    bootstrapReplications: params.bootstrapReplications ?? 999
  });
  const diagnostics = computePanelAccuracyDiagnostics(prepared, latentOut);
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
    })
  };

  return {
    engineAttribution:
      'Bayesian Hierarchical Panel Latent Measurement Model (3-Chain Gibbs MCMC + Grubbs Triangulation + Pair Fixed Effects & Rademacher Wild Cluster Bootstrap)',
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

    const sorted = [...metrics].sort((a, b) => a.totalLatentRmse - b.totalLatentRmse);
    const best = sorted[0];
    const maxPropBiasT = Math.max(...metrics.map(m => Math.abs(m.blandAltman.propBiasTStat)), 0);
    const maxOutlierShift = Math.max(
      ...diag.outlierSensitivityAudit.entries.map(e => Math.abs(e.shiftPct)),
      0
    );

    const isRecommended =
      spec.id === 'raw_baseline'
        ? baseQuality.outlierCountTotal === 0 || !diag.outlierSensitivityAudit.rankOrderChanged
        : spec.id === 'winsor_25' &&
          baseQuality.outlierCountTotal > 0 &&
          diag.outlierSensitivityAudit.rankOrderChanged;

    const rationale =
      spec.id === 'raw_baseline'
        ? `Mempertahankan satuan fisik asli (${best.unit}); Total Latent RMSE terendah = ${best.totalLatentRmse.toFixed(2)} pada ${best.sourceLabel} (R² = ${(best.reliabilityR2 * 100).toFixed(2)}%).`
        : spec.id === 'winsor_25'
          ? `Meredam ${baseQuality.outlierCountTotal} observasi ekstrem; pergeseran sensitivitas maks ${maxOutlierShift.toFixed(1)}%.`
          : `Mengevaluasi reliabilitas proporsional pada skala logaritmik (CCC terbaik = ${best.ccc.ccc.toFixed(4)}, |t| proportional bias maks = ${maxPropBiasT.toFixed(2)}).`;

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
      maxProportionalBiasAbsT: maxPropBiasT,
      outlierSensitivityShiftPct: maxOutlierShift,
      isRecommended,
      rationale
    });
  }

  const recommended =
    scenarios.find(s => s.isRecommended) || scenarios[0];
  scenarios.forEach(s => {
    s.isRecommended = s.id === recommended.id;
  });

  return {
    evaluatedCount: scenarios.length,
    elapsedMs: Date.now() - startedAt,
    bestScenarioId: recommended.id,
    bestScenario: recommended,
    scenarios,
    summaryNote:
      `Sistem mengevaluasi ${scenarios.length} skenario prapemrosesan. ` +
      `Rekomendasi utama adalah "${recommended.label}" agar Error SD (σ_εj), Total Latent RMSE, dan Reliabilitas R² tetap langsung bermakna pada satuan fisik asli.`
  };
}
