// ============================================================
// Panel Latent Variable Measurement Model — Step 3 Recommender
// Evaluates multiple preprocessing + likelihood/identification
// combinations via fast Bayesian MCMC and ranks them using
// scale-invariant convergence, reliability, PPC, independence,
// and back-transformed original-scale reconstruction accuracy.
// ============================================================

import {
  computePearsonCorrelation,
  DEFAULT_PREPROCESSING_OPTIONS,
  preparePanelLatentObservations,
  validatePanelLatentData
} from './panel-latent-data';
import {
  DEFAULT_PANEL_LATENT_SPEC,
  runPanelLatentBayesianAnalysis
} from './panel-latent-mcmc';
import {
  CleanedLatentObservation,
  IdentificationStrategy,
  LatentEmissionEstimate,
  LikelihoodFamily,
  MeasurementSourceKey,
  PanelLatentDataQualityReport,
  PanelLatentMapping,
  PanelLatentModelSpec,
  PanelLatentPreprocessingOptions,
  PreprocessingCandidateScenario,
  PreprocessingRecommendationResult,
  SourceComparisonRow
} from './panel-latent-types';

interface CandidateTemplate {
  id: string;
  label: string;
  shortTag: string;
  applyLog1p: boolean;
  applyWinsorize: boolean;
  applyStandardize: boolean;
  likelihood: LikelihoodFamily;
  identification: IdentificationStrategy;
  requiresNonNegative?: boolean;
  condition?: (diag: DatasetProfile) => boolean;
}

interface DatasetProfile {
  negativeCount: number;
  outlierCount: number;
  scaleRatio: number;
  maxAbsSkewness: number;
  hasDuplicates: boolean;
}

const CANDIDATE_TEMPLATES: CandidateTemplate[] = [
  {
    id: 'baseline_normal',
    label: 'Baseline (Tanpa Transformasi) + Normal',
    shortTag: 'Asli • Normal',
    applyLog1p: false,
    applyWinsorize: false,
    applyStandardize: false,
    likelihood: 'normal',
    identification: 'anchor'
  },
  {
    id: 'raw_student_t',
    label: 'Tanpa Transformasi + Student-t Likelihood',
    shortTag: 'Asli • Student-t',
    applyLog1p: false,
    applyWinsorize: false,
    applyStandardize: false,
    likelihood: 'student_t',
    identification: 'anchor'
  },
  {
    id: 'winsor_normal',
    label: 'Winsorization 2.5% + Normal Likelihood',
    shortTag: 'Winsor • Normal',
    applyLog1p: false,
    applyWinsorize: true,
    applyStandardize: false,
    likelihood: 'normal',
    identification: 'anchor'
  },
  {
    id: 'winsor_student_t',
    label: 'Winsorization 2.5% + Student-t Likelihood',
    shortTag: 'Winsor • Student-t',
    applyLog1p: false,
    applyWinsorize: true,
    applyStandardize: false,
    likelihood: 'student_t',
    identification: 'anchor',
    condition: d => d.outlierCount > 0
  },
  {
    id: 'log1p_normal',
    label: 'Transformasi log(1 + x) + Normal Likelihood',
    shortTag: 'Log(1+x) • Normal',
    applyLog1p: true,
    applyWinsorize: false,
    applyStandardize: false,
    likelihood: 'normal',
    identification: 'anchor',
    requiresNonNegative: true
  },
  {
    id: 'log1p_student_t',
    label: 'Transformasi log(1 + x) + Student-t Likelihood',
    shortTag: 'Log(1+x) • Student-t',
    applyLog1p: true,
    applyWinsorize: false,
    applyStandardize: false,
    likelihood: 'student_t',
    identification: 'anchor',
    requiresNonNegative: true,
    condition: d => d.outlierCount > 0 || d.maxAbsSkewness > 1.0
  },
  {
    id: 'log1p_winsor_normal',
    label: 'log(1 + x) + Winsorization 2.5% + Normal',
    shortTag: 'Log + Winsor • Normal',
    applyLog1p: true,
    applyWinsorize: true,
    applyStandardize: false,
    likelihood: 'normal',
    identification: 'anchor',
    requiresNonNegative: true
  },
  {
    id: 'std_normal',
    label: 'Standardization Z-Score + Normal (Standardized Y*)',
    shortTag: 'Z-Score • Normal',
    applyLog1p: false,
    applyWinsorize: false,
    applyStandardize: true,
    likelihood: 'normal',
    identification: 'standardized'
  },
  {
    id: 'std_student_t',
    label: 'Standardization Z-Score + Student-t (Standardized Y*)',
    shortTag: 'Z-Score • Student-t',
    applyLog1p: false,
    applyWinsorize: false,
    applyStandardize: true,
    likelihood: 'student_t',
    identification: 'standardized'
  },
  {
    id: 'winsor_std_normal',
    label: 'Winsorization 2.5% + Z-Score + Normal',
    shortTag: 'Winsor + Z • Normal',
    applyLog1p: false,
    applyWinsorize: true,
    applyStandardize: true,
    likelihood: 'normal',
    identification: 'standardized',
    condition: d => d.outlierCount > 0 || d.scaleRatio > 5
  },
  {
    id: 'log1p_std_normal',
    label: 'log(1 + x) + Standardization Z-Score + Normal',
    shortTag: 'Log + Z • Normal',
    applyLog1p: true,
    applyWinsorize: false,
    applyStandardize: true,
    likelihood: 'normal',
    identification: 'standardized',
    requiresNonNegative: true
  },
  {
    id: 'log1p_winsor_std_student_t',
    label: 'log(1 + x) + Winsorization + Z-Score + Student-t',
    shortTag: 'Log + Winsor + Z • t',
    applyLog1p: true,
    applyWinsorize: true,
    applyStandardize: true,
    likelihood: 'student_t',
    identification: 'standardized',
    requiresNonNegative: true,
    condition: d => d.outlierCount > 0 || d.maxAbsSkewness > 1.0 || d.scaleRatio > 5
  }
];

function extractDatasetProfile(
  rows: Record<string, any>[],
  mapping: PanelLatentMapping,
  quality: PanelLatentDataQualityReport
): DatasetProfile {
  const baselinePrep = preparePanelLatentObservations(rows, mapping, {
    ...DEFAULT_PREPROCESSING_OPTIONS,
    dropDuplicateCityYear: quality.duplicateKeys.length > 0
  });

  const keys: MeasurementSourceKey[] = ['X1', 'X2', 'X3'];
  let negativeCount = 0;
  let maxAbsSkewness = 0;
  const positiveMeans: number[] = [];

  keys.forEach(key => {
    const vals = baselinePrep.observations
      .map(o => (key === 'X1' ? o.rawX1 : key === 'X2' ? o.rawX2 : o.rawX3))
      .filter((v): v is number => v !== null);
    if (vals.length === 0) return;

    vals.forEach(v => {
      if (v < 0) negativeCount++;
    });

    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean > 0) positiveMeans.push(mean);

    if (vals.length >= 4) {
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) || 1;
      const skew = vals.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0) / vals.length;
      if (Math.abs(skew) > maxAbsSkewness) maxAbsSkewness = Math.abs(skew);
    }
  });

  const outlierCheck = quality.checks.find(c => c.id === 'outliers');
  const scaleRatio =
    positiveMeans.length >= 2
      ? Math.max(...positiveMeans) / Math.max(1e-9, Math.min(...positiveMeans))
      : 1;

  return {
    negativeCount,
    outlierCount: outlierCheck?.count || 0,
    scaleRatio,
    maxAbsSkewness,
    hasDuplicates: quality.duplicateKeys.length > 0
  };
}

function computeOriginalScaleAccuracy(
  observations: CleanedLatentObservation[],
  sourceComparison: SourceComparisonRow[],
  latentEstimates: LatentEmissionEstimate[],
  prep: PanelLatentPreprocessingOptions,
  meansBeforeStd: Record<MeasurementSourceKey, number>,
  sdsBeforeStd: Record<MeasurementSourceKey, number>
): { nrmseOriginalScale: number; pearsonOriginalScale: number } {
  const keys: MeasurementSourceKey[] = ['X1', 'X2', 'X3'];
  const nrmsePerSource: number[] = [];
  const corrPerSource: number[] = [];

  keys.forEach((key, j) => {
    const sc = sourceComparison[j];
    const raws: number[] = [];
    const preds: number[] = [];

    observations.forEach((obs, idx) => {
      const rawVal = key === 'X1' ? obs.rawX1 : key === 'X2' ? obs.rawX2 : obs.rawX3;
      if (rawVal === null) return;

      const yLat = latentEstimates[idx].latentMean;
      const predWork = sc.relativeBiasMean + sc.loadingMean * yLat;

      let predOrig = prep.applyStandardize
        ? predWork * sdsBeforeStd[key] + meansBeforeStd[key]
        : predWork;

      if (prep.applyLog1p) {
        const sigmaPreStd = prep.applyStandardize ? sc.errorSdMean * sdsBeforeStd[key] : sc.errorSdMean;
        const jensenAdj = 0.5 * Math.min(0.8, sigmaPreStd * sigmaPreStd);
        predOrig = Math.max(0, Math.exp(Math.min(20, predOrig + jensenAdj)) - 1);
      }

      if (Number.isFinite(predOrig) && Number.isFinite(rawVal)) {
        raws.push(rawVal);
        preds.push(predOrig);
      }
    });

    if (raws.length < 3) return;
    const meanRaw = raws.reduce((a, b) => a + b, 0) / raws.length;
    const rawSd = Math.sqrt(Math.max(1e-12, raws.reduce((s, v) => s + (v - meanRaw) ** 2, 0) / (raws.length - 1)));
    const mse = raws.reduce((s, v, idx) => s + (v - preds[idx]) ** 2, 0) / raws.length;
    nrmsePerSource.push(Math.sqrt(mse) / rawSd);
    corrPerSource.push(computePearsonCorrelation(raws, preds));
  });

  const nrmseOriginalScale = nrmsePerSource.length
    ? nrmsePerSource.reduce((a, b) => a + b, 0) / nrmsePerSource.length
    : 1;
  const pearsonOriginalScale = corrPerSource.length
    ? corrPerSource.reduce((a, b) => a + b, 0) / corrPerSource.length
    : 0;

  return { nrmseOriginalScale, pearsonOriginalScale };
}

function buildScenarioRationale(
  tpl: CandidateTemplate,
  metrics: {
    isConverged: boolean;
    maxRHat: number;
    meanReliability: number;
    nrmseOriginalScale: number;
    maxResidualCorr: number;
    ppcPMean: number;
    ppcPSd: number;
  },
  profile: DatasetProfile
): string {
  const parts: string[] = [];
  parts.push(
    metrics.isConverged
      ? `Konvergen (R-hat maks ${metrics.maxRHat.toFixed(3)})`
      : `Konvergensi belum ideal (R-hat ${metrics.maxRHat.toFixed(3)})`
  );
  parts.push(`reliabilitas rata-rata ${(metrics.meanReliability * 100).toFixed(1)}%`);
  parts.push(`NRMSE skala asli ${(metrics.nrmseOriginalScale * 100).toFixed(1)}%`);

  if (profile.outlierCount > 0 && tpl.likelihood === 'student_t') {
    parts.push(`menangani ${profile.outlierCount} outlier tanpa memotong data`);
  } else if (profile.outlierCount > 0 && tpl.applyWinsorize) {
    parts.push(`meredam ${profile.outlierCount} outlier ekstrem (2.5%)`);
  }
  if (profile.scaleRatio > 10 && tpl.applyStandardize) {
    parts.push(`menyetarakan perbedaan skala ${profile.scaleRatio.toFixed(1)}×`);
  }
  if (profile.maxAbsSkewness > 1.2 && tpl.applyLog1p) {
    parts.push('menormalkan distribusi miring kanan');
  }
  if (metrics.maxResidualCorr > 0.35) {
    parts.push(`perhatian: |r residu| maks ${metrics.maxResidualCorr.toFixed(2)}`);
  }

  return `${parts[0].charAt(0).toUpperCase() + parts[0].slice(1)}, ${parts.slice(1).join(', ')}.`;
}

function scoreCandidateScenario(
  tpl: CandidateTemplate,
  profile: DatasetProfile,
  metrics: {
    isConverged: boolean;
    maxRHat: number;
    minEssBulk: number;
    meanReliability: number;
    nrmseOriginalScale: number;
    pearsonOriginalScale: number;
    ppcPMean: number;
    ppcPSd: number;
    maxResidualCorr: number;
  }
): number {
  // 1. Convergence & ESS health (0..25 pts; strong penalty if failed to converge)
  const rHatMargin = Math.max(0, 1 - Math.max(0, metrics.maxRHat - 1.0) / 0.12);
  const essScore = Math.min(1, metrics.minEssBulk / 150) * 5;
  const convScore = (metrics.isConverged ? 20 * rHatMargin : Math.max(-15, 8 * rHatMargin - 12)) + essScore;

  // 2. Average scale-invariant reliability across X1, X2, X3 (0..30 pts)
  const relScore = Math.max(0, Math.min(1, metrics.meanReliability)) * 30;

  // 3. Original-scale reconstruction accuracy (0..20 pts)
  const accR = Math.max(0, Math.min(1, metrics.pearsonOriginalScale)) * 10;
  const accNrmse = Math.max(0, 1 - Math.min(1, metrics.nrmseOriginalScale)) * 10;
  const accScore = accR + accNrmse;

  // 4. Conditional independence integrity (0..15 pts; 3-indicator factor models naturally induce modest negative residual correlation)
  const indScore = Math.max(0, 1 - Math.min(1, metrics.maxResidualCorr / 0.85)) * 15;

  // 5. PPC calibration proximity to 0.50 (0..10 pts)
  const ppcDev = Math.abs(metrics.ppcPMean - 0.5) + Math.abs(metrics.ppcPSd - 0.5);
  const ppcScore = Math.max(0, 1 - ppcDev) * 10;

  // 6. Mild methodological alignment tie-breaker (-2.5..+3.5 pts)
  let adj = 0;
  if (profile.scaleRatio > 10) {
    adj += tpl.applyStandardize ? 2.5 : -2.0;
  } else if (!tpl.applyLog1p && !tpl.applyWinsorize && !tpl.applyStandardize) {
    // Prefer preserving natural measurement scale unless transformations genuinely improve fit
    adj += profile.outlierCount === 0 && profile.maxAbsSkewness <= 1.2 ? 1.5 : 0.5;
  }
  if (profile.outlierCount > 0) {
    if (tpl.likelihood === 'student_t') adj += 1.5;
    if (tpl.applyWinsorize) adj += 0.5;
  }

  const rawTotal = convScore + relScore + accScore + indScore + ppcScore + adj;
  return Math.max(0, Math.min(100, Number(rawTotal.toFixed(1))));
}

/**
 * Evaluate multiple eligible preprocessing + likelihood/identification scenarios
 * for Step 3 and return a ranked table of results plus the best configuration.
 */
export function evaluatePreprocessingCandidates(params: {
  rows: Record<string, any>[];
  mapping: PanelLatentMapping;
  baseSpec?: Partial<PanelLatentModelSpec>;
  allowNegativeValues?: boolean;
}): PreprocessingRecommendationResult {
  const startedAt = Date.now();
  const baseSpec: PanelLatentModelSpec = {
    ...DEFAULT_PANEL_LATENT_SPEC,
    ...(params.baseSpec || {})
  };

  const rawQuality = validatePanelLatentData(params.rows, params.mapping, DEFAULT_PREPROCESSING_OPTIONS);
  const profile = extractDatasetProfile(params.rows, params.mapping, rawQuality);

  // Filter strictly eligible candidates
  const eligibleTemplates = CANDIDATE_TEMPLATES.filter(tpl => {
    if (tpl.requiresNonNegative && profile.negativeCount > 0) return false;
    if (tpl.condition && !tpl.condition(profile)) return false;
    return true;
  });

  const screeningBudget =
    params.rows.length > 220
      ? { chains: 2, warmup: 180, draws: 180 }
      : { chains: 2, warmup: 260, draws: 240 };

  const evaluated: PreprocessingCandidateScenario[] = [];

  for (const tpl of eligibleTemplates) {
    const prep: PanelLatentPreprocessingOptions = {
      applyLog1p: tpl.applyLog1p,
      applyWinsorize: tpl.applyWinsorize,
      applyStandardize: tpl.applyStandardize,
      winsorQuantile: DEFAULT_PREPROCESSING_OPTIONS.winsorQuantile,
      dropDuplicateCityYear: profile.hasDuplicates,
      allowNegativeValues: Boolean(params.allowNegativeValues)
    };

    const candSpec: PanelLatentModelSpec = {
      ...baseSpec,
      likelihood: tpl.likelihood,
      identification: tpl.identification,
      chains: screeningBudget.chains,
      warmup: screeningBudget.warmup,
      draws: screeningBudget.draws
    };

    const prepared = preparePanelLatentObservations(params.rows, params.mapping, prep);
    if (prepared.observations.length < 4 || prepared.cities.length < 2 || prepared.years.length < 2) {
      continue;
    }

    const fit = runPanelLatentBayesianAnalysis(
      prepared.observations,
      prepared.cities,
      prepared.years,
      params.mapping,
      prep,
      candSpec,
      {
        wasLog1p: prep.applyLog1p,
        wasStandardized: prep.applyStandardize,
        meansBeforeStd: prepared.meansBeforeStd,
        sdsBeforeStd: prepared.sdsBeforeStd
      },
      { lightweight: true }
    );

    const meanReliability =
      fit.sourceComparison.reduce((s, r) => s + r.reliability, 0) / Math.max(1, fit.sourceComparison.length);
    const maxResidualCorr = Math.max(
      Math.abs(fit.identificationAudit.residualErrorCorrelations.r12),
      Math.abs(fit.identificationAudit.residualErrorCorrelations.r13),
      Math.abs(fit.identificationAudit.residualErrorCorrelations.r23)
    );
    const { nrmseOriginalScale, pearsonOriginalScale } = computeOriginalScaleAccuracy(
      prepared.observations,
      fit.sourceComparison,
      fit.latentEstimates,
      prep,
      prepared.meansBeforeStd,
      prepared.sdsBeforeStd
    );

    const compositeScore = scoreCandidateScenario(tpl, profile, {
      isConverged: fit.diagnostics.isConverged,
      maxRHat: fit.diagnostics.maxRHat,
      minEssBulk: fit.diagnostics.minEssBulk,
      meanReliability,
      nrmseOriginalScale,
      pearsonOriginalScale,
      ppcPMean: fit.ppc.bayesianPValueMean,
      ppcPSd: fit.ppc.bayesianPValueSd,
      maxResidualCorr
    });

    const warnings: string[] = [];
    if (!fit.diagnostics.isConverged) {
      warnings.push(`R-hat ${fit.diagnostics.maxRHat.toFixed(3)} > 1.05`);
    }
    if (maxResidualCorr > 0.35) {
      warnings.push(`|r residu| = ${maxResidualCorr.toFixed(2)} > 0.35`);
    }
    if (fit.ppc.bayesianPValueMean < 0.08 || fit.ppc.bayesianPValueMean > 0.92) {
      warnings.push(`PPC p-mean = ${fit.ppc.bayesianPValueMean.toFixed(2)}`);
    }

    evaluated.push({
      id: tpl.id,
      label: tpl.label,
      shortTag: tpl.shortTag,
      preprocessing: prep,
      recommendedLikelihood: tpl.likelihood,
      recommendedIdentification: tpl.identification,
      compositeScore,
      isConverged: fit.diagnostics.isConverged,
      maxRHat: fit.diagnostics.maxRHat,
      minEssBulk: fit.diagnostics.minEssBulk,
      meanReliability,
      nrmseOriginalScale,
      pearsonOriginalScale,
      ppcPMean: fit.ppc.bayesianPValueMean,
      ppcPSd: fit.ppc.bayesianPValueSd,
      maxResidualCorr,
      waic: fit.ppc.waic,
      rationale: buildScenarioRationale(
        tpl,
        {
          isConverged: fit.diagnostics.isConverged,
          maxRHat: fit.diagnostics.maxRHat,
          meanReliability,
          nrmseOriginalScale,
          maxResidualCorr,
          ppcPMean: fit.ppc.bayesianPValueMean,
          ppcPSd: fit.ppc.bayesianPValueSd
        },
        profile
      ),
      warnings
    });
  }

  if (evaluated.length === 0) {
    throw new Error('Tidak ada skenario prapemrosesan yang memenuhi syarat minimal data (>= 4 observasi, >= 2 kota, >= 2 tahun).');
  }

  evaluated.sort((a, b) => {
    if (a.isConverged !== b.isConverged) return a.isConverged ? -1 : 1;
    if (Math.abs(b.compositeScore - a.compositeScore) > 1e-6) return b.compositeScore - a.compositeScore;
    return b.meanReliability - a.meanReliability;
  });

  const best = evaluated[0];
  const duplicateNote = profile.hasDuplicates
    ? ` Terdapat ${rawQuality.duplicateKeys.length} kunci City-Year ganda; seluruh skenario otomatis menguji penghapusan duplikat agar panel valid.`
    : '';
  const summaryNote =
    `Sistem memproses ${evaluated.length} kombinasi prapemrosesan & likelihood (Normal vs Student-t). ` +
    `Konfigurasi terbaik adalah "${best.label}" (Skor ${best.compositeScore.toFixed(1)}/100, Reliabilitas rata-rata ${(best.meanReliability * 100).toFixed(1)}%, R-hat maks ${best.maxRHat.toFixed(3)}).` +
    duplicateNote;

  return {
    evaluatedCount: evaluated.length,
    elapsedMs: Date.now() - startedAt,
    duplicateRowsDetected: rawQuality.duplicateKeys.length,
    outlierCountDetected: profile.outlierCount,
    scaleRatioDetected: profile.scaleRatio,
    maxAbsSkewnessDetected: profile.maxAbsSkewness,
    bestScenarioId: best.id,
    bestScenario: best,
    scenarios: evaluated,
    summaryNote
  };
}
