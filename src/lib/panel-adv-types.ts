// ============================================================
// OPTION 3: Advanced Latent Measurement Model & Panel Accuracy Validation
// Isolated Type Contracts & Comparative Methodology Evaluation Types
// Zero modification or state coupling with Option 2
// ============================================================

import { MeasurementSource, PanelDataset } from './panel-accuracy-types';

export type AdvTransformationMethod =
  | 'none'
  | 'log'
  | 'log1p'
  | 'sqrt'
  | 'box_cox'
  | 'yeo_johnson'
  | 'z_standardize'
  | 'robust_median_iqr'
  | 'winsorize_2_5'
  | 'robust_student_t';

export type AdvLatentStructure =
  | 'POOLED_CONGENERIC'
  | 'TWO_WAY_PANEL_HIERARCHICAL'
  | 'DYNAMIC_PANEL_STATE_SPACE';

export type AdvDependencyModel =
  | 'M1_INDEPENDENT'
  | 'M2_TEMPORAL_AR1'
  | 'M3_ENTITY_SOURCE_RE'
  | 'M4_SPARSE_CORRELATED_RESIDUAL';

export type AdvAnchorStrategy =
  | 'SYMMETRIC_GEOMEAN_MEDIAN'
  | 'SUM_TO_ZERO_EQUAL_MEAN'
  | 'HIGHEST_SIGNAL_MARKER'
  | `MARKER_SOURCE_${string}`;

export type AdvPriorStrategy =
  | 'WEAKLY_INFORMATIVE_HALF_T'
  | 'DIFFUSE_LOG_SCALE'
  | 'SKEPTICAL_BSEM_SHRINKAGE';

export type AdvMissingStrategy =
  | 'COMPLETE_CASE_BALANCED_PAIR'
  | 'AVAILABLE_CASE_FIML_WEIGHTED';

export type AdvOutlierStrategy =
  | 'AUDIT_ONLY_PRESERVE_RAW'
  | 'ROBUST_STUDENT_T_LIKELIHOOD'
  | 'SYMMETRIC_WINSOR_2_5';

export type AdvStandardErrorMethod =
  | 'CONVENTIONAL_OLS'
  | 'ROBUST_HC3'
  | 'CLUSTER_ENTITY'
  | 'TWO_WAY_ENTITY_TIME'
  | 'DRISCOLL_KRAAY_HAC';

export type AdvBootstrapMethod =
  | 'NONE_ASYMPTOTIC'
  | 'RADEMACHER_WILD_CLUSTER'
  | 'WEBB_SIX_POINT_WILD_CLUSTER';

export interface AdvManualOverrides {
  transformation?: AdvTransformationMethod;
  latentStructure?: AdvLatentStructure;
  dependencyModel?: AdvDependencyModel;
  anchorStrategy?: AdvAnchorStrategy;
  priorStrategy?: AdvPriorStrategy;
  missingStrategy?: AdvMissingStrategy;
  outlierStrategy?: AdvOutlierStrategy;
  standardErrorMethod?: AdvStandardErrorMethod;
  bootstrapMethod?: AdvBootstrapMethod;
  mcmcChains?: number;
  mcmcIterations?: number;
  bootstrapReplications?: number;
  dropDuplicatePairs?: boolean;
}

export interface AdvResolvedConfig {
  transformation: AdvTransformationMethod;
  latentStructure: AdvLatentStructure;
  dependencyModel: AdvDependencyModel;
  anchorStrategy: AdvAnchorStrategy;
  priorStrategy: AdvPriorStrategy;
  missingStrategy: AdvMissingStrategy;
  outlierStrategy: AdvOutlierStrategy;
  standardErrorMethod: AdvStandardErrorMethod;
  bootstrapMethod: AdvBootstrapMethod;
  mcmcChains: number;
  mcmcWarmup: number;
  mcmcIterations: number;
  bootstrapReplications: number;
  dropDuplicatePairs: boolean;
  validationMethod: 'LOSO_PLUS_PAIR_FE_HOLM';
  robustnessSuite: 'MULTI_ANCHOR_PRIOR_COMMON_BIAS_MC';
}

export interface AdvDecisionEntry {
  dimensionKey:
    | 'latentModel'
    | 'dependencyModel'
    | 'transformation'
    | 'missingHandling'
    | 'outlierHandling'
    | 'standardError'
    | 'bootstrap'
    | 'anchorStrategy'
    | 'bayesianPrior'
    | 'mcmcConfig'
    | 'validationMethod'
    | 'robustnessAnalysis';
  dimensionLabel: string;
  selectedMethod: string;
  whySelected: string;
  empiricalDataBasis: string;
  alternativesConsidered: Array<{
    method: string;
    reasonNotSelected: string;
  }>;
  impactOnResults: string;
  warnings: string[];
  confidenceLevel: 'HIGH' | 'MODERATE' | 'CONDITIONAL' | 'INSUFFICIENT_EVIDENCE';
  isOverriddenByUser: boolean;
}

export interface AdvAutoDecisionBundle {
  hierarchyRule: string;
  initialAutoConfig: AdvResolvedConfig;
  activeConfig: AdvResolvedConfig;
  hasManualOverrides: boolean;
  decisions: AdvDecisionEntry[];
  overallIdentifiabilityStatus: 'IDENTIFIED' | 'WEAKLY_IDENTIFIED' | 'UNDERIDENTIFIED';
  summaryHeadline: string;
}

export interface AdvSourceProfileItem {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  unit: string;
  nValid: number;
  nMissing: number;
  missingPct: number;
  hasZeros: boolean;
  hasNegatives: boolean;
  mean: number;
  sd: number;
  median: number;
  mad: number;
  iqr: number;
  min: number;
  max: number;
  skewness: number;
  excessKurtosis: number;
  panelMadOutlierCount: number;
  withinEntityIqrOutlierCount: number;
}

export interface AdvTransformationCandidateEval {
  method: AdvTransformationMethod;
  label: string;
  eligible: boolean;
  ineligibleReason?: string;
  centralNormalityScore: number;
  proportionalHeteroscedasticityAbsT: number;
  scaleSpreadRatioAfter: number;
  estimandPreservation: 'EXACT_ORIGINAL_UNIT' | 'DIMENSIONLESS_STANDARDIZED' | 'NONLINEAR_MONOTONIC';
  estimandImpactNote: string;
  selected: boolean;
  decisionReason: string;
}

export interface AdvCleanedObservation {
  rowIndex: number;
  entity: string;
  entityIdx: number;
  time: number;
  timeIdx: number;
  pairKey: string;
  rawValues: Record<string, number | null>;
  transformedValues: Record<string, number | null>;
  robustWeight: number;
}

export interface AdvDataProfileReport {
  entityColumn: string;
  timeColumn: string;
  nRowsRaw: number;
  nCompletePairs: number;
  nAvailableRows: number;
  nEntities: number;
  nPeriods: number;
  nSources: number;
  isBalancedPanel: boolean;
  entityCoveragePct: number;
  timeCoveragePct: number;
  duplicatePairKeys: string[];
  invalidValueCount: number;
  totalMissingCells: number;
  missingnessPatternNote: string;
  scaleSpreadRatioRaw: number;
  crossScaleHeteroscedasticityAbsT: number;
  hasAnyZeros: boolean;
  hasAnyNegatives: boolean;
  totalPanelMadOutliers: number;
  whyNotDefaultGrubbsNote: string;
  sourceProfiles: AdvSourceProfileItem[];
  transformationEvaluations: AdvTransformationCandidateEval[];
  chosenTransformation: AdvTransformationMethod;
  boxCoxLambdaBySource: Record<string, number>;
  yeoJohnsonLambdaBySource: Record<string, number>;
  workingScaleLabel: string;
  warnings: string[];
  hasBlockingError: boolean;
}

export interface AdvPreprocessingBundle {
  profile: AdvDataProfileReport;
  completeObservations: AdvCleanedObservation[];
  allValidObservations: AdvCleanedObservation[];
  entities: string[];
  periods: number[];
  sources: MeasurementSource[];
}

export interface AdvSourceMcmcDiagnostic {
  sourceId: string;
  sourceLabel: string;
  rankNormalizedRhat: number;
  foldedRhat: number;
  bulkEss: number;
  tailEss: number;
  mcseErrorSd: number;
  mcseBias: number;
  lag1Autocorr: number;
  traceDraws: number[][];
}

export interface AdvMcmcDiagnosticsBundle {
  nChains: number;
  warmupPerChain: number;
  samplingPerChain: number;
  totalPostWarmupDraws: number;
  maxRankNormalizedRhat: number;
  maxFoldedRhat: number;
  minBulkEss: number;
  minTailEss: number;
  pseudoDivergencePct: number;
  posteriorPredictivePValue: number;
  marginalWaic: number;
  conditionalWaic: number;
  psisLooElpd: number;
  psisMaxParetoK: number;
  converged: boolean;
  convergenceNote: string;
  perSource: AdvSourceMcmcDiagnostic[];
}

export interface AdvSourceParameterEstimate {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  biasAlpha: number;
  biasCrILower: number;
  biasCrIUpper: number;
  loadingLambda: number;
  loadingCrILower: number;
  loadingCrIUpper: number;
  errorVariance: number;
  errorSd: number;
  errorSdCrILower: number;
  errorSdCrIUpper: number;
  scaleAdjustedNoiseRatio: number; // R_j = sigma_j / |lambda_j|
  noiseRatioCrILower: number;
  noiseRatioCrIUpper: number;
  anchorConditionedTotalRmse: number;
  totalRmseCrILower: number;
  totalRmseCrIUpper: number;
  signalToNoiseRatio: number;
  reliabilityR2: number;
  ar1RhoResidual: number;
  entitySourceReSd: number;
}

export interface AdvAnchorRegimeResult {
  anchorKey: string;
  anchorLabel: string;
  constraintFormula: string;
  topRankedByPrecisionRatioId: string;
  topRankedByTotalRmseId: string;
  ranksByTotalRmse: Record<string, number>;
  ranksByNoiseRatio: Record<string, number>;
  sourceBiasUnderAnchor: Record<string, number>;
  sourceLoadingUnderAnchor: Record<string, number>;
  sourceTotalRmseUnderAnchor: Record<string, number>;
}

export interface AdvAnchorSensitivitySummary {
  evaluatedAnchors: AdvAnchorRegimeResult[];
  kendallWTotalRmse: number;
  kendallWNoiseRatio: number;
  topSourceFlipAcrossAnchors: boolean;
  maxRankShiftBySource: Record<string, number>;
  isAnchorInvariantPrecisionRatio: boolean;
  sensitivityStatus: 'ROBUST_ACROSS_ANCHORS' | 'MODERATE_ANCHOR_SHIFT' | 'HIGH_ANCHOR_SENSITIVITY';
  interpretation: string;
}

export interface AdvCandidateDependencyFit {
  modelId: AdvDependencyModel;
  modelLabel: string;
  isIdentifiable: boolean;
  identifiabilityCheck: string;
  nFreeParameters: number;
  degreesOfFreedomCov: number;
  marginalWaic: number;
  looElpd: number;
  ppcPValue: number;
  converged: boolean;
  selected: boolean;
  selectionReason: string;
}

export interface AdvPriorSensitivityComparison {
  priorStrategy: AdvPriorStrategy;
  topSourceId: string;
  maxAbsParameterShiftPct: number;
  rankConcordantWithPrimary: boolean;
}

export interface AdvLatentEstimationBundle {
  identified: boolean;
  identificationMessage: string;
  activeLatentStructure: AdvLatentStructure;
  activeDependencyModel: AdvDependencyModel;
  activeAnchorStrategy: AdvAnchorStrategy;
  activePriorStrategy: AdvPriorStrategy;
  latentVarianceDecomposition: {
    totalThetaVar: number;
    betweenEntityVarU: number;
    betweenTimeVarV: number;
    idiosyncraticVarW: number;
    temporalPersistencePhi: number;
    betweenEntitySharePct: number;
    betweenTimeSharePct: number;
  };
  latentSignalSeries: Array<{
    pairKey: string;
    entity: string;
    time: number;
    thetaMean: number;
    thetaSd: number;
    thetaCrILower: number;
    thetaCrIUpper: number;
  }>;
  sourceParameters: AdvSourceParameterEstimate[];
  residualCorrelationMatrix: number[][];
  flaggedResidualPairs: Array<{
    sourceAId: string;
    sourceALabel: string;
    sourceBId: string;
    sourceBLabel: string;
    corr: number;
    ciLower: number;
    ciUpper: number;
    identifiable: boolean;
  }>;
  candidateModels: AdvCandidateDependencyFit[];
  anchorSensitivity: AdvAnchorSensitivitySummary;
  priorSensitivity: AdvPriorSensitivityComparison[];
  mcmcDiagnostics: AdvMcmcDiagnosticsBundle;
  posteriorTotalRmseDrawsBySource: Record<string, number[]>;
  posteriorNoiseRatioDrawsBySource: Record<string, number[]>;
}

export interface AdvSourceRankingRow {
  rank: number;
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  anchorTotalRmse: number;
  anchorTotalRmseCrI: [number, number];
  scaleAdjustedNoiseRatio: number;
  noiseRatioCrI: [number, number];
  relativeBiasAbs: number;
  reliabilityR2: number;
  probRank1: number;                 // P(R_j = 1 | Data)
  probTop2: number;                  // P(R_j <= 2 | Data)
  cumulativeRankProbs: number[];     // P(R_j <= k | Data) for k = 1..J
  expectedRank: number;
  rankSdDispersion: number;
  rankEntropyNormalized: number;
  entityStabilityPct: number;
  temporalStabilityPct: number;
  maxAnchorRankShift: number;
  statisticallyIndistinguishableFromTop: boolean;
  summaryNote: string;
}

export interface AdvCommonModeBiasScenario {
  scenarioCode: string;
  title: string;
  simulatedCondition: string;
  detectedTopSourceLabel: string;
  trueBestUnderSimulationLabel: string;
  biasesRecoverableWithoutGroundTruth: boolean;
  epistemologicalFinding: string;
}

export interface AdvRankingBundle {
  rankingBasisLabel: string;
  verdictStatus:
    | 'CREDIBLE_RELATIVE_LEADER'
    | 'PROVISIONAL_LEADER_HIGH_UNCERTAINTY'
    | 'ANCHOR_OR_METRIC_SENSITIVE'
    | 'INDISTINGUISHABLE_TIE'
    | 'UNIDENTIFIED_OR_NONCONVERGENT';
  isConclusiveWithoutGroundTruthCaveat: boolean;
  leaderSourceId: string | null;
  leaderSourceLabel: string | null;
  tiedWithLeaderLabels: string[];
  rows: AdvSourceRankingRow[];
  commonModeBiasScenarios: AdvCommonModeBiasScenario[];
  commonModeLimitationStatement: string;
  rankingSynthesisNarrative: string;
}

export interface AdvLosoSourceEntry {
  leftOutSourceId: string;
  leftOutSourceLabel: string;
  losoIdentified: boolean;
  latentCorrelationWithFull: number;
  losoPredictiveMae: number;
  losoPredictiveRmse: number;
  losoPredictiveMbe: number;
  benchmarkThetaVarMean: number;
  covarianceTermAudit: number; // Estimated 2 * lambda_j * Cov(eps_j, theta_hat_-j)
  debiasedImpliedErrorSd: number;
  fullModelErrorSd: number;
  remainingTopSourceLabel: string;
  rankChangedAmongPeers: boolean;
}

export interface AdvPairwiseHolmContrast {
  sourceAId: string;
  sourceALabel: string;
  sourceBId: string;
  sourceBLabel: string;
  diffAbsErrorAminusB: number;
  seSelected: number;
  seMethodUsed: AdvStandardErrorMethod;
  pRawAsymptotic: number;
  pWildBootstrap: number;
  pHolmAdjusted: number;
  simultaneous95Ci: [number, number];
  significantFamilywise05: boolean;
}

export interface AdvRepeatedMeasuresAgreementEntry {
  sourceId: string;
  sourceLabel: string;
  pooledPearsonR: number;
  withinEntityR: number;
  linsCcc: number;
  linsCccCi: [number, number];
  meanBias: number;
  betweenEntityDiffSd: number;
  withinEntityDiffSd: number;
  totalRepeatedMeasuresDiffSd: number;
  mixedEffectsLoaLower: number;
  mixedEffectsLoaUpper: number;
  outsideMixedLoaPct: number;
  naivePooledLoaWidth: number;
  mixedEffectsLoaWidth: number;
}

export interface AdvValidationBundle {
  selectedSeMethod: AdvStandardErrorMethod;
  selectedBootstrapMethod: AdvBootstrapMethod;
  seSelectionRationale: string;
  losoEntries: AdvLosoSourceEntry[];
  losoVarianceFormulaNote: string;
  pairFeOmnibusF: number;
  pairFeOmnibusP: number;
  pairFeOmnibusWildP: number;
  holmFamilySize: number;
  pairwiseHolmContrasts: AdvPairwiseHolmContrast[];
  repeatedMeasuresAgreement: AdvRepeatedMeasuresAgreementEntry[];
  validationWarnings: string[];
}

export interface AdvMonteCarloScenarioResult {
  family: 'A_BASELINE' | 'B_BIAS' | 'C_COMMON_MODE' | 'D_DEPENDENCY' | 'E_PANEL_STRUCTURE' | 'F_RANKING_EDGE' | 'G_MISSINGNESS';
  scenarioId: string;
  scenarioTitle: string;
  replications: number;
  parameterBiasMean: number;
  parameterRmse: number;
  interval95CoveragePct: number;
  intervalMeanWidth: number;
  top1RankingRecoveryPct: number;
  meanTopRankPosteriorProb: number;
  empiricalTypeIErrorPct: number;
  empiricalPowerPct: number;
  convergenceRatePct: number;
  identificationFailurePct: number;
  latentSignalRecoveryR: number;
  anchorSensitivityShiftMean: number;
  commonModeSensitivityFlag: boolean;
  interpretation: string;
}

export interface AdvMonteCarloBundle {
  calibratedDimensions: { G: number; T: number; J: number };
  totalReplicationsRun: number;
  scenarios: AdvMonteCarloScenarioResult[];
  meanRankingRecoveryPct: number;
  meanCoverage95Pct: number;
  missingnessEpistemologicalCaveat: string;
  overallValidationSummary: string;
}

export interface AdvLiteratureReference {
  id: string;
  authors: string;
  year: number;
  title: string;
  journal: string;
  volumePages: string;
  doi: string;
  evidenceCategory: 'ESTABLISHED_THEORY' | 'PUBLISHED_EMPIRICAL_METHOD' | 'HEURISTIC_GUARDRAIL';
  roleInOption3: string;
}

export interface AdvStepStataSection {
  stepNumber: number;
  stepTitle: string;
  methodName: string;
  purpose: string;
  stataCode: string;
  codeWalkthrough: Array<{ command: string; explanation: string }>;
  requiredInputs: string;
  expectedOutputs: string;
  howToReadOutput: string;
  pointByPointInterpretation: string[];
  assumptions: string[];
  limitationsAndNativeGap: {
    hasExactNativeStata: boolean;
    internalEngineMethod: string;
    whyNoExactNativeStata: string;
    closestStataAlternative: string;
    expectedNumericalDifferences: string;
  };
  nextStepRecommendation: string;
}

export interface AdvPanelFitResult {
  methodologyName: 'Option 3: Advanced Latent Measurement Model and Panel Accuracy Validation';
  executedAt: string;
  elapsedMs: number;
  executionMode: 'client_reactive' | 'server_high_precision';
  datasetSummary: {
    datasetName: string;
    entityColumn: string;
    timeColumn: string;
    nEntities: number;
    nPeriods: number;
    nSources: number;
    nCompletePairs: number;
    nRawRows: number;
    isBalanced: boolean;
    workingScaleLabel: string;
  };
  autoDecision: AdvAutoDecisionBundle;
  preprocessing: AdvPreprocessingBundle['profile'];
  estimation: AdvLatentEstimationBundle;
  ranking: AdvRankingBundle;
  validation: AdvValidationBundle;
  monteCarlo: AdvMonteCarloBundle;
  stepStataGuides: AdvStepStataSection[];
  masterStataDoFile: string;
  companionRScript: string;
  companionStanCode: string;
  literature: AdvLiteratureReference[];
  scientificConclusion: {
    headline: string;
    relativeReliabilitySummary: string;
    keyLimitations: string[];
    epistemologicalGroundTruthBoundary: string;
  };
}

export interface ComparativeAspectRow {
  aspect: string;
  option2Value: string;
  option3Value: string;
  methodologicalImplication: string;
}

export interface ComparativeSourceRankRow {
  sourceId: string;
  sourceLabel: string;
  option2Rank: number;
  option3Rank: number;
  rankShift: number;
  option2MetricValue: number;
  option3TotalRmse: number;
  option3NoiseRatio: number;
  option2ProbBestPct: number;
  option3ProbRank1Pct: number;
  option2StatusNote: string;
  option3AnchorMaxShift: number;
}

export type ComparativeConclusionCategory =
  | 'OPTION_2_MORE_DEFENSIBLE'
  | 'OPTION_3_MORE_DEFENSIBLE'
  | 'BOTH_CONSISTENT_CONCORDANT'
  | 'DIVERGENT_RANKINGS_EXPLAINED'
  | 'BOTH_IDENTIFICATION_LIMITED'
  | 'INSUFFICIENT_EVIDENCE_TO_PREFER';

export interface ComparativeMethodologyEvaluationResult {
  evaluatedAt: string;
  datasetMeta: {
    entityColumn: string;
    timeColumn: string;
    nRawRows: number;
    nSources: number;
    sourceLabels: string[];
    option2PreprocessingSummary: string;
    option3PreprocessingSummary: string;
    preprocessingDiffImpact: string;
  };
  aspectComparisonTable: ComparativeAspectRow[];
  rankingComparison: {
    sameTopRankedSource: boolean;
    option2TopLabel: string | null;
    option3TopLabel: string | null;
    spearmanRankConcordance: number;
    rows: ComparativeSourceRankRow[];
    divergenceExplanation: string;
  };
  diagnosticComparison: Array<{
    criterion: string;
    option2Summary: string;
    option3Summary: string;
    assessment: string;
  }>;
  conclusion: {
    category: ComparativeConclusionCategory;
    categoryLabel: string;
    evidenceSummary: string;
    methodologicalRecommendation: string;
    noGroundTruthDisclaimer: string;
  };
}

export type { PanelDataset, MeasurementSource };
