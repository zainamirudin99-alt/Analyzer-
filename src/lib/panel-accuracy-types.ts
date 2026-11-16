// ============================================================
// Comparative Measurement Accuracy Assessment — Types & Contracts
// Reference-Based Panel Data Approach with Dynamic N Sources (J >= 2)
// ============================================================

export type SourceRole = 'reference' | 'comparison';

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
  missingBySource: Record<string, number>; // keyed by source.id
  availablePairsBySource: Record<string, number>; // keyed by comparison source.id
  duplicateKeys: string[];
  scaleRatioMaxToMin: number;
  outlierCountTotal: number;
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
  values: Record<string, number | null>;      // keyed by source.id (after opt-in preprocessing)
  rawValues: Record<string, number | null>;   // keyed by source.id (before preprocessing)
  uncertainties: Record<string, number>;      // keyed by source.id
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
  refVal: number;
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

export interface SourceAccuracyMetricRow {
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  unit: string;
  nCompleteCase: number;
  nAvailableCase: number;
  missingGapVsComplete: number;
  // Primary evaluation on Complete-Case paired City-Year sample
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
  // Separate Available-Case summary when N differs
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
  diffAminusB: number; // MAE_A - MAE_B (negative means A is more accurate than B)
  seCluster: number;
  tStat: number;
  dfCluster: number;
  pValueCluster: number;
  ciLowerCluster: number;
  ciUpperCluster: number;
  wildBootstrapPValue: number;
  wildBootstrapCiLower: number;
  wildBootstrapCiUpper: number;
  isSignificant05: boolean;
  betterSourceId: string | null;
}

export interface PairFixedEffectsResult {
  nCompletePairs: number;
  nComparisonSources: number;
  nLongObs: number;
  nClustersCity: number;
  dfCluster: number;
  baselineComparisonSourceId: string;
  baselineComparisonSourceLabel: string;
  referenceSourceId: string;
  referenceSourceLabel: string;
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
  normalityAndCltNote: {
    residualSkewness: number;
    residualKurtosisExcess: number;
    shapiroProxyPValue: number;
    explanation: string;
  };
  inferenceLimitations: string[];
}

export interface SourceRankEntry {
  rank: number;
  sourceId: string;
  sourceName: string;
  sourceLabel: string;
  mae: number;
  rmse: number;
  absMbe: number;
  mbe: number;
  ccc: number;
  pearsonR: number;
  loaWidth: number;
  diffFromTopMae: number;
  pValueVsTopCluster: number | null;
  pValueVsTopWildBootstrap: number | null;
  isStatisticallyIndistinguishableFromTop: boolean;
  rankNote: string;
}

export interface ComparativeRankingResult {
  primaryMetric: 'MAE';
  referenceSourceId: string;
  referenceSourceLabel: string;
  isConclusive: boolean;
  conclusivenessStatus: 'TERBUKTI_BERBEDA_SIGNIFIKAN' | 'PERBEDAAN_TIDAK_SIGNIFIKAN' | 'KONFLIK_ANTAR_METRIK' | 'REFERENSI_TIDAK_VALID';
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
  preprocessing: AccuracyPreprocessingOptions;
  qualityReport: PanelAccuracyQualityReport;
  eda: CorrelationMatricesBundle;
  metrics: SourceAccuracyMetricRow[];
  pairFixedEffects: PairFixedEffectsResult;
  diagnostics: PanelAccuracyDiagnosticsResult;
  ranking: ComparativeRankingResult;
  stataOutput: StataAccuracyOutputBundle;
  interpretations: AccuracyAcademicInterpretations;
  generatedCode: GeneratedAccuracyCode;
}
