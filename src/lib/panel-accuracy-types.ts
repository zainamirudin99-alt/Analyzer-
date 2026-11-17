// ============================================================
// Reference-Free All-Source Latent & Consensus Measurement Accuracy Assessment
// Contracts & Types for Panel Data Approach (Option B — All J >= 3 Sources Ranked)
// ============================================================

export type SourceRole = 'evaluated' | 'comparison' | 'reference';

export interface MeasurementSource {
  id: string;
  name: string;
  label: string;
  columnKey: string;
  unit: string;
  role: SourceRole;
  uncertaintyColumn?: string;
  methodDescription?: string;
  metadata?: Record<string, unknown>;
}

export interface PanelDataset {
  cityIdColumn: string;
  yearColumn: string;
  sources: MeasurementSource[];
  observations: Record<string, unknown>[];
}

export interface AccuracyPreprocessingOptions {
  dropDuplicateCityYear: boolean;
  applyLog1p: boolean;
  applyWinsorize: boolean;
  winsorQuantile: number; // default 0.025
  applyUnitMultiplier: boolean;
  unitMultipliers: Record<string, number>; // keyed by source.id (default 1.0)
  allowNegativeValues: boolean;
}

export interface DataQualityCheckItem {
  id: string;
  title: string;
  severity: 'ok' | 'warning' | 'error';
  count: number;
  message: string;
  recommendation?: string;
}

export interface LatentIdentificationAudit {
  nSources: number;
  isIdentifiedForAllSourceRanking: boolean; // true requires J >= 3 valid sources with positive variance
  nValidCompletePairs: number;
  hasZeroVarianceSources: string[];
  potentialDependentPairs: string[];
  summary: string;
  warnings: string[];
}

/** @deprecated Kept as alias shape for backward-safe exports; reflects All-Source Identification Audit */
export interface ReferenceSourceAudit {
  referenceSourceId: string;
  referenceSourceName: string;
  referenceSourceLabel: string;
  nValid: number;
  coveragePct: number;
  hasZeroVariance: boolean;
  outlierCount: number;
  hasMethodNote: boolean;
  isCredibleReference: boolean;
  warnings: string[];
  summary: string;
}

export interface PanelAccuracyQualityReport {
  nObsRaw: number;
  nObsValidAny: number;
  nCompleteCasePairs: number;
  nCities: number;
  nYears: number;
  yearMin: number | null;
  yearMax: number | null;
  isBalanced: boolean;
  missingBySource: Record<string, number>;
  availablePairsBySource: Record<string, number>;
  duplicateKeys: string[];
  scaleRatioMaxToMin: number;
  outlierCountTotal: number;
  latentAudit: LatentIdentificationAudit;
  referenceAudit: ReferenceSourceAudit;
  checks: DataQualityCheckItem[];
  recommendedActions: string[];
  hasBlockingError: boolean;
}

export interface CleanedPanelObservation {
  rowIndex: number;
  city: string;
  cityIdx: number;
  year: number;
  yearIdx: number;
  pairKey: string;
  values: Record<string, number | null>;
  rawValues: Record<string, number | null>;
  uncertainties: Record<string, number>;
}

export interface SourceDescriptiveSummary {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  role: SourceRole;
  unit: string;
  n: number;
  missing: number;
  mean: number;
  sd: number;
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  min: number;
  max: number;
  cv: number;
  skewness: number;
  kurtosisExcess: number;
}

export interface CorrelationMatricesBundle {
  sourceIds: string[];
  sourceNames: string[];
  sourceLabels: string[];
  descriptives: SourceDescriptiveSummary[];
  overallPearson: number[][];
  overallSpearman: number[][];
  withinCityPearson: number[][];
  firstDiffPearson: number[][];
  yearlyAverages: Array<{
    year: number;
    values: Record<string, number | null>;
  }>;
  cityTrends: Array<{
    city: string;
    points: Array<{
      year: number;
      values: Record<string, number | null>;
    }>;
  }>;
}

export interface LinsCCCResult {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  n: number;
  ccc: number;
  ciLower: number;
  ciUpper: number;
  pearsonR: number;
  biasCorrectionFactorCb: number;
  scaleShiftV: number;
  locationShiftU: number;
  seZ: number;
}

export interface BlandAltmanPoint {
  city: string;
  year: number;
  compVal: number;
  refVal: number; // Consensus benchmark theta_hat (or LOSO theta_hat^(-j))
  meanVal: number;
  diffVal: number;
  absError: number;
  isOutsideLoa: boolean;
}

export interface BlandAltmanResult {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  n: number;
  meanBias: number;
  sdDiff: number;
  seMeanBias: number;
  meanBiasCiLower: number;
  meanBiasCiUpper: number;
  loaLower: number;
  loaUpper: number;
  seLoa: number;
  loaLowerCi: [number, number];
  loaUpperCi: [number, number];
  outsideLoaCount: number;
  outsideLoaPct: number;
  propBiasIntercept: number;
  propBiasSlope: number;
  propBiasTStat: number;
  propBiasPValue: number;
  hasProportionalBias: boolean;
  points: BlandAltmanPoint[];
}

export interface AvailableCaseMetricSummary {
  n: number;
  mae: number;
  rmse: number;
  mbe: number;
  pearsonR: number;
  spearmanRho: number;
  ccc: number;
}

export interface LatentSourceEstimate {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  // Congeneric latent model X_ijt = alpha_j + lambda_j * theta_it + eps_ijt
  interceptBiasAlpha: number;
  interceptBiasCiLower: number;
  interceptBiasCiUpper: number;
  loadingLambda: number;
  loadingCiLower: number;
  loadingCiUpper: number;
  errorVariance: number;
  errorVarianceCiLower: number;
  errorVarianceCiUpper: number;
  errorSd: number;
  errorSdCiLower: number;
  errorSdCiUpper: number;
  totalLatentMse: number;
  totalLatentRmse: number;
  totalLatentRmseCiLower: number;
  totalLatentRmseCiUpper: number;
  reliabilityR2: number;
  reliabilityCiLower: number;
  reliabilityCiUpper: number;
  signalToNoiseRatio: number;
  posteriorProbBestTotalError: number; // P(lowest total latent RMSE | data)
  posteriorProbBestPrecision: number;  // P(lowest error variance / highest reliability | data)
  grubbsErrorVariance: number;         // Analytical Grubbs triangulation variance check
  mcmcRhat: number;
  mcmcEss: number;
}

export interface LatentModelSummary {
  nSources: number;
  nPairs: number;
  nChains: number;
  iterationsPerChain: number;
  burnInPerChain: number;
  maxRhat: number;
  minEss: number;
  converged: boolean;
  latentThetaMean: number;
  latentThetaSd: number;
  posteriorPredictivePValue: number;
  identificationRule: string;
  epistemologicalCaveat: string;
  latentThetaSeries: Array<{
    pairKey: string;
    city: string;
    year: number;
    thetaMean: number;
    thetaSd: number;
    thetaCiLower: number;
    thetaCiUpper: number;
  }>;
  sourceEstimates: LatentSourceEstimate[];
}

export interface SourceAccuracyMetricRow {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  unit: string;
  nCompleteCase: number;
  nAvailableCase: number;
  missingGapVsComplete: number;
  // Latent True-Value Model Metrics (All J Sources Evaluated Equally)
  latentInterceptBias: number;
  latentLoading: number;
  errorVariance: number;
  errorSd: number;
  errorSdCiLower: number;
  errorSdCiUpper: number;
  totalLatentRmse: number;
  totalLatentRmseCiLower: number;
  totalLatentRmseCiUpper: number;
  reliabilityR2: number;
  reliabilityCiLower: number;
  reliabilityCiUpper: number;
  posteriorProbBest: number;
  mcmcRhat: number;
  mcmcEss: number;
  grubbsErrorVariance: number;
  // Empirical Deviation vs Leave-One-Source-Out Consensus Benchmark theta_hat^(-j)
  mae: number;
  maeSeCluster: number;
  maeCiLower: number;
  maeCiUpper: number;
  rmse: number;
  rmseCiLower: number;
  rmseCiUpper: number;
  mbe: number;
  mbeSeCluster: number;
  mbeCiLower: number;
  mbeCiUpper: number;
  mbeTStat: number;
  mbePValue: number;
  nmaePct: number;
  pearsonR: number;
  spearmanRho: number;
  withinCityR: number;
  firstDiffR: number;
  ccc: LinsCCCResult;
  blandAltman: BlandAltmanResult;
  availableCase: AvailableCaseMetricSummary;
}

export interface PairFixedEffectsCoefficient {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  isBaselineComparison: boolean;
  meanAe: number;
  betaDiffVsBaseline: number;
  seCluster: number;
  tStat: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  wildBootstrapPValue?: number;
  wildBootstrapCi?: [number, number];
}

export interface PairwiseSourceContrast {
  sourceAId: string;
  sourceALabel: string;
  sourceBId: string;
  sourceBLabel: string;
  maeA: number;
  maeB: number;
  diffAminusB: number;
  seCluster: number;
  tStat: number;
  dfCluster: number;
  pValueCluster: number;
  ciLowerCluster: number;
  ciUpperCluster: number;
  wildBootstrapPValue: number;
  wildBootstrapCiLower: number;
  wildBootstrapCiUpper: number;
  posteriorProbABetterThanB: number; // From Bayesian posterior draws of Total Latent RMSE
  isSignificant05: boolean;
  betterSourceId: string | null;
}

export interface PairFixedEffectsResult {
  nCompletePairs: number;
  nComparisonSources: number; // Equals J (all evaluated sources)
  nLongObs: number;
  nClustersCity: number;
  dfCluster: number;
  baselineComparisonSourceId: string;
  baselineComparisonSourceLabel: string;
  referenceSourceId: string;    // 'latent_consensus'
  referenceSourceLabel: string; // 'Latent Consensus Benchmark (θ_hat)'
  withinR2: number;
  omnibusFStat: number;
  omnibusDf1: number;
  omnibusDf2: number;
  omnibusPValue: number;
  omnibusWildBootstrapPValue: number;
  smallClusterWarning: boolean;
  bootstrapReplications: number;
  coefficients: PairFixedEffectsCoefficient[];
  pairwiseContrasts: PairwiseSourceContrast[];
  longObservationsPreview: Array<{
    pairId: string;
    city: string;
    year: number;
    sourceId: string;
    sourceName: string;
    signedError: number;
    absError: number;
    sqError: number;
  }>;
}

export interface DiagnosticTestEntry {
  testName: string;
  statisticLabel: string;
  statisticValue: number;
  dfLabel: string;
  pValue: number | null;
  status: 'ok' | 'warning' | 'info';
  conclusion: string;
  implication: string;
}

export interface OutlierSensitivityEntry {
  sourceId: string;
  sourceLabel: string;
  maeFull: number;
  maeTrimmed95: number;
  rankFull: number;
  rankTrimmed95: number;
  shiftPct: number;
}

export interface StepRecommendationAction {
  id: string;
  priority: 'KRITIS' | 'TINGGI' | 'DISARANKAN' | 'OPTIMAL';
  title: string;
  statisticalBasis: string;
  actionLabel: string;
  expectedImpact: string;
  actionType:
    | 'DROP_DUPLICATES'
    | 'APPLY_WINSORIZE'
    | 'APPLY_LOG1P'
    | 'RESET_RAW_BASELINE'
    | 'RUN_HIGH_PRECISION_VERIFICATION'
    | 'ADD_THIRD_SOURCE'
    | 'KEEP_CURRENT';
}

export interface Step7DiagnosticAdvisorBundle {
  overallHealthStatus: 'OPTIMAL' | 'PERLU_PENYESUAIAN_RINGAN' | 'PERLU_PERBAIKAN_METODOLOGI';
  diagnosticScore: number;
  headline: string;
  statisticalPrincipleNote: string;
  actions: StepRecommendationAction[];
}

export interface PanelAccuracyDiagnosticsResult {
  heteroskedasticityTest: DiagnosticTestEntry;
  serialCorrelationTest: DiagnosticTestEntry;
  crossSectionalDependenceTest: DiagnosticTestEntry;
  clusterCountAudit: {
    nClusters: number;
    isSmallCluster: boolean;
    message: string;
    recommendation: string;
  };
  outlierSensitivityAudit: {
    rankOrderChanged: boolean;
    entries: OutlierSensitivityEntry[];
    summary: string;
  };
  bayesianConvergenceAudit: {
    maxRhat: number;
    minEss: number;
    posteriorPredictivePValue: number;
    converged: boolean;
    summary: string;
  };
  normalityAndCltNote: {
    residualSkewness: number;
    residualKurtosisExcess: number;
    shapiroProxyPValue: number;
    explanation: string;
  };
  inferenceLimitations: string[];
  diagnosticAdvisor?: Step7DiagnosticAdvisorBundle;
}

export interface SourceRankEntry {
  rank: number;
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  totalLatentRmse: number;
  errorSd: number;
  reliabilityR2: number;
  posteriorProbBest: number;
  mae: number;
  rmse: number;
  absMbe: number;
  mbe: number;
  ccc: number;
  pearsonR: number;
  loaWidth: number;
  diffFromTopLatentRmse: number;
  diffFromTopMae: number;
  posteriorProbBetterThanSecond: number | null;
  pValueVsTopCluster: number | null;
  pValueVsTopWildBootstrap: number | null;
  isStatisticallyIndistinguishableFromTop: boolean;
  rankNote: string;
}

export interface ComparativeRankingResult {
  primaryMetric: 'TOTAL_LATENT_RMSE';
  referenceSourceId: string;
  referenceSourceLabel: string;
  isConclusive: boolean;
  conclusivenessStatus:
    | 'TERBUKTI_BERBEDA_SIGNIFIKAN'
    | 'PERBEDAAN_TIDAK_SIGNIFIKAN'
    | 'KONFLIK_ANTAR_METRIK'
    | 'MODEL_TIDAK_TERIDENTIFIKASI';
  bestSourceId: string | null;
  bestSourceLabel: string | null;
  tiedTopSourceLabels: string[];
  rankingSummary: string;
  methodologicalCaveat: string;
  ranks: SourceRankEntry[];
}

export interface PreprocessingScenarioCandidate {
  id: string;
  label: string;
  shortTag: string;
  options: AccuracyPreprocessingOptions;
  nCompletePairs: number;
  bestComparisonLabel: string;
  bestMae: number;
  bestNmaePct: number;
  bestCcc: number;
  meanReliabilityR2: number;
  minReliabilityR2: number;
  maxRhat: number;
  topLatentRmse: number;
  compositeQualityScore: number;
  maxProportionalBiasAbsT: number;
  outlierSensitivityShiftPct: number;
  isRecommended: boolean;
  rationale: string;
}

export interface PreprocessingRecommendationBundle {
  evaluatedCount: number;
  elapsedMs: number;
  bestScenarioId: string;
  bestScenario: PreprocessingScenarioCandidate;
  scenarios: PreprocessingScenarioCandidate[];
  actionItems: StepRecommendationAction[];
  optimalChecklistNote: string;
  summaryNote: string;
}

export interface StataAccuracyOutputBundle {
  headerConsoleText: string;
  accuracyMetricsTableText: string;
  cccAndBlandAltmanTableText: string;
  pairFixedEffectsTableText: string;
  pairwiseContrastsTableText: string;
  diagnosticsAndRankingText: string;
}

export interface AccuracyAcademicInterpretations {
  referenceValidityInterpretation: string;
  edaAndCorrelationInterpretation: string;
  accuracyAndAgreementInterpretation: string;
  pairFixedEffectsInterpretation: string;
  diagnosticsInterpretation: string;
  rankingDecisionInterpretation: string;
  researchLimitations: string[];
  finalConclusion: string;
}

export interface GeneratedAccuracyCode {
  stataDoFile: string;
  rScript: string;
}

export interface PanelAccuracyFitResult {
  engineAttribution: string;
  executionMeta?: {
    bootstrapReplications: number;
    mcmcIterations: number;
    elapsedMs: number;
    source: 'client_live' | 'server_verified';
    executedAt: string;
  };
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
  referenceSource: MeasurementSource;     // Consensus Latent Benchmark metadata descriptor
  comparisonSources: MeasurementSource[]; // Contains ALL J evaluated sources equally
  preprocessing: AccuracyPreprocessingOptions;
  qualityReport: PanelAccuracyQualityReport;
  eda: CorrelationMatricesBundle;
  latentModel: LatentModelSummary;
  metrics: SourceAccuracyMetricRow[];
  pairFixedEffects: PairFixedEffectsResult;
  diagnostics: PanelAccuracyDiagnosticsResult;
  ranking: ComparativeRankingResult;
  stataOutput: StataAccuracyOutputBundle;
  interpretations: AccuracyAcademicInterpretations;
  generatedCode: GeneratedAccuracyCode;
}
