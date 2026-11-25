// ============================================================
// OPTION 3 — Master Pipeline Orchestrator
// Independent Namespace & State: Zero Dependency on Option 2 Execution
// ============================================================

import { buildOption3AutoDecisions } from './panel-adv-auto-engine';
import { runOption3LatentEstimation } from './panel-adv-estimation';
import { runOption3MonteCarloValidation } from './panel-adv-montecarlo';
import { profileAndPreprocessOption3Dataset } from './panel-adv-preprocessing';
import { computeOption3SourceRanking } from './panel-adv-ranking';
import {
  buildOption3StepStataGuides,
  generateOption3MasterStataDoFile,
  generateOption3RScript,
  generateOption3StanCode,
  VERIFIED_OPTION3_LITERATURE
} from './panel-adv-stata';
import {
  AdvManualOverrides,
  AdvPanelFitResult,
  AdvTransformationMethod,
  PanelDataset
} from './panel-adv-types';
import { runOption3ValidationAndAgreement } from './panel-adv-validation';

export function executeAdvancedPanelAccuracyPipeline(params: {
  dataset: PanelDataset;
  datasetName?: string;
  overrides?: AdvManualOverrides;
  highPrecisionMode?: boolean;
  monteCarloReplications?: number;
  executionMode?: 'client_reactive' | 'server_high_precision';
}): AdvPanelFitResult {
  const startedAt = Date.now();
  const datasetName = params.datasetName || 'Panel_MultiSource_Dataset.xlsx';
  const dropDup = params.overrides?.dropDuplicatePairs ?? true;

  // Step 1 & Step 3 Initial Empirical Profiling
  const initialPrep = profileAndPreprocessOption3Dataset({
    dataset: params.dataset,
    forcedTransformation: params.overrides?.transformation,
    dropDuplicatePairs: dropDup
  });

  if (initialPrep.profile.hasBlockingError) {
    throw new Error(
      `Validasi dataset Option 3 gagal: diperlukan minimal 2 kolom sumber valid dan >= 3 pasangan observasi lengkap (saat ini J=${initialPrep.profile.nSources}, N_CC=${initialPrep.profile.nCompletePairs}).`
    );
  }

  // Step 2: 12-Component Validity-First Automatic Decision Engine
  const autoDecision = buildOption3AutoDecisions({
    profile: initialPrep.profile,
    overrides: params.overrides,
    highPrecisionMode: params.highPrecisionMode
  });

  // Reconcile effective transformation with outlier handling if overridden
  let effectiveTransformation: AdvTransformationMethod = autoDecision.activeConfig.transformation;
  if (
    !params.overrides?.transformation &&
    autoDecision.activeConfig.outlierStrategy === 'SYMMETRIC_WINSOR_2_5' &&
    effectiveTransformation === 'none'
  ) {
    effectiveTransformation = 'winsorize_2_5';
  } else if (
    !params.overrides?.transformation &&
    autoDecision.activeConfig.outlierStrategy === 'ROBUST_STUDENT_T_LIKELIHOOD' &&
    effectiveTransformation === 'none'
  ) {
    effectiveTransformation = 'robust_student_t';
  }

  const preprocessed =
    effectiveTransformation !== initialPrep.profile.chosenTransformation
      ? profileAndPreprocessOption3Dataset({
          dataset: params.dataset,
          forcedTransformation: effectiveTransformation,
          dropDuplicatePairs: autoDecision.activeConfig.dropDuplicatePairs
        })
      : initialPrep;

  // Step 4 & Step 5: Latent Estimation, Vehtari MCMC Diagnostics, Dependency Selection & Multi-Anchor Sensitivity
  const estimation = runOption3LatentEstimation({
    preprocessed,
    config: autoDecision.activeConfig
  });

  // Step 6: Probabilistic Ranking, Cumulative Rank Probabilities & Common-Mode Bias Simulator
  const ranking = computeOption3SourceRanking({
    preprocessed,
    estimation
  });

  // Step 7: Covariance-Audited LOSO, Pair FE + Holm Step-Down, Wild Bootstrap & Repeated-Measures Mixed LoA
  const validation = runOption3ValidationAndAgreement({
    preprocessed,
    estimation,
    config: autoDecision.activeConfig
  });

  // Step 8: 7-Family Calibrated Monte Carlo Validation
  const mcReps =
    params.monteCarloReplications ?? (params.highPrecisionMode ? 50 : 28);
  const monteCarlo = runOption3MonteCarloValidation({
    nEntities: preprocessed.profile.nEntities,
    nPeriods: preprocessed.profile.nPeriods,
    nSources: preprocessed.profile.nSources,
    replicationsPerScenario: mcReps
  });

  // Step 9: Reproducible Stata 17/18 + Companion R/Stan Guides
  const stepStataGuides = buildOption3StepStataGuides({
    datasetName,
    preprocessed,
    config: autoDecision.activeConfig,
    estimation,
    ranking,
    validation,
    monteCarlo
  });

  const masterStataDoFile = generateOption3MasterStataDoFile(stepStataGuides, datasetName);
  const companionRScript = generateOption3RScript({
    datasetName,
    preprocessed,
    config: autoDecision.activeConfig
  });
  const companionStanCode = generateOption3StanCode({
    nSources: preprocessed.profile.nSources,
    priorStrategy: autoDecision.activeConfig.priorStrategy
  });

  const keyLimitations: string[] = [
    'Tanpa Ground Truth fisik atau instrumen referensi terkalibrasi eksternal, model hanya mengestimasi keandalan dan ketepatan RELATIF antarsumber, bukan akurasi absolut terhadap nilai sejati sejagat.',
    'Apabila mayoritas atau seluruh sumber berbagi bias sistematis searah (common-mode additive atau multiplicative bias), komponen bersama tersebut tidak terpisahkan dari sinyal laten θ_it.',
    'Mekanisme missingness (MCAR vs MAR vs MNAR) tidak dapat dibuktikan secara konklusif hanya dari data yang teramati.'
  ];
  if (preprocessed.profile.nSources === 3) {
    keyLimitations.push(
      'Dengan tepat J = 3 sumber, model kongenerik tepat teridentifikasi (df_cov = 0) di bawah asumsi independensi galat, sehingga korelasi galat bebas antarsumber tidak dapat diestimasi simultan tanpa informasi tambahan.'
    );
  }
  if (estimation.anchorSensitivity.topSourceFlipAcrossAnchors) {
    keyLimitations.push(
      'Peringkat berbasis Total RMSE sensitif terhadap pemilihan rezim anchor lokasi/skala; rujuk rasio presisi bebas-lokasi R_j = σ_j/|λ_j| dan distribusi probabilitas peringkat P(R_j ≤ k | Y).'
    );
  }

  const headline =
    ranking.verdictStatus === 'CREDIBLE_RELATIVE_LEADER' && ranking.leaderSourceLabel
      ? `${ranking.leaderSourceLabel} menunjukkan bukti keandalan relatif terkuat secara konsisten pada model pengukuran laten panel (bukan klaim Ground Truth absolut).`
      : ranking.verdictStatus === 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY' && ranking.leaderSourceLabel
        ? `${ranking.leaderSourceLabel} memimpin secara numerik, namun ketidakpastian posterior masih moderat sehingga kesimpulan bersifat kondisional.`
        : ranking.verdictStatus === 'ANCHOR_OR_METRIC_SENSITIVE'
          ? 'Urutan sumber teratas bergantung pada pilihan rezim anchor atau perbedaan bobot bias lokasi vs presisi skala (R_j = σ_j/|λ_j|).'
          : ranking.verdictStatus === 'INDISTINGUISHABLE_TIE'
            ? 'Beberapa sumber teratas memiliki distribusi galat posterior yang bertumpang tindih secara substansial (seri secara statistik).'
            : 'Model tidak teridentifikasi atau belum memenuhi syarat konvergensi — pemeringkatan definitif ditangguhkan.';

  return {
    methodologyName: 'Option 3: Advanced Latent Measurement Model and Panel Accuracy Validation',
    executedAt: new Date().toISOString(),
    elapsedMs: Math.max(1, Date.now() - startedAt),
    executionMode: params.executionMode ?? 'client_reactive',
    datasetSummary: {
      datasetName,
      entityColumn: preprocessed.profile.entityColumn,
      timeColumn: preprocessed.profile.timeColumn,
      nEntities: preprocessed.profile.nEntities,
      nPeriods: preprocessed.profile.nPeriods,
      nSources: preprocessed.profile.nSources,
      nCompletePairs: preprocessed.profile.nCompletePairs,
      nRawRows: preprocessed.profile.nRowsRaw,
      isBalanced: preprocessed.profile.isBalancedPanel,
      workingScaleLabel: preprocessed.profile.workingScaleLabel
    },
    autoDecision,
    preprocessing: preprocessed.profile,
    estimation,
    ranking,
    validation,
    monteCarlo,
    stepStataGuides,
    masterStataDoFile,
    companionRScript,
    companionStanCode,
    literature: VERIFIED_OPTION3_LITERATURE,
    scientificConclusion: {
      headline,
      relativeReliabilitySummary: ranking.rankingSynthesisNarrative,
      keyLimitations,
      epistemologicalGroundTruthBoundary:
        'BATAS EPISTEMOLOGIS WAJIB: Peringkat #1 dalam Option 3 bermakna sumber dengan deviasi galat spesifik terendah dan konsistensi sinyal tertinggi relatif terhadap struktur kovarians lintas-sumber yang diasumsikan — BUKAN bukti matematis bahwa sumber tersebut bebas dari bias fisik absolut.'
    }
  };
}
