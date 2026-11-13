// ============================================================
// Panel Latent Variable Measurement Model — Types & Contracts
// Bayesian Hierarchical Multi-Source CO2 Measurement Integration
// ============================================================

export type MeasurementSourceKey = 'X1' | 'X2' | 'X3';

export type IdentificationStrategy = 'anchor' | 'standardized';
export type PriorRegime = 'weakly_informative' | 'skeptical_tight' | 'diffuse_wide';
export type LikelihoodFamily = 'normal' | 'student_t';

export interface PanelLatentMapping {
  cityCol: string;
  yearCol: string;
  x1Col: string;
  x2Col: string;
  x3Col: string;
  se1Col?: string;
  se2Col?: string;
  se3Col?: string;
  x1Label: string;
  x2Label: string;
  x3Label: string;
  x1Unit?: string;
  x2Unit?: string;
  x3Unit?: string;
}

export interface PanelLatentPreprocessingOptions {
  applyLog1p: boolean;
  applyStandardize: boolean;
  applyWinsorize: boolean;
  winsorQuantile: number; // default 0.025
  dropDuplicateCityYear: boolean;
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

export interface PanelLatentDataQualityReport {
  nObsRaw: number;
  nObsValid: number;
  nCities: number;
  nYears: number;
  yearMin: number | null;
  yearMax: number | null;
  isBalanced: boolean;
  missingSourceCells: Record<MeasurementSourceKey, number>;
  duplicateKeys: string[];
  checks: DataQualityCheckItem[];
  recommendedActions: string[];
  hasBlockingError: boolean;
}

export interface SourceDescriptiveStats {
  sourceKey: MeasurementSourceKey;
  label: string;
  n: number;
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
}

export interface PanelLatentEDAResult {
  descriptives: SourceDescriptiveStats[];
  pearsonMatrix: number[][]; // 3x3
  spearmanMatrix: number[][]; // 3x3
  cityTrends: Array<{
    city: string;
    points: Array<{ year: number; x1: number | null; x2: number | null; x3: number | null }>;
  }>;
  yearlyAverages: Array<{ year: number; x1: number | null; x2: number | null; x3: number | null }>;
}

export interface PanelLatentModelSpec {
  identification: IdentificationStrategy;
  anchorSource: MeasurementSourceKey;
  sourceSpecificBias: boolean;
  sourceSpecificLoading: boolean;
  includeCityIntercept: boolean;
  includeTimeEffect: boolean;
  includeAR1: boolean;
  priorRegime: PriorRegime;
  likelihood: LikelihoodFamily;
  studentTDf: number;
  chains: number;
  warmup: number;
  draws: number;
  seed: number;
  ciLevel: number;
}

export interface CleanedLatentObservation {
  rowIndex: number;
  city: string;
  cityIdx: number;
  year: number;
  yearIdx: number;
  x1: number | null;
  x2: number | null;
  x3: number | null;
  se1: number;
  se2: number;
  se3: number;
  rawX1: number | null;
  rawX2: number | null;
  rawX3: number | null;
}

export interface MCMCParameterSummary {
  name: string;
  label: string;
  group: 'bias' | 'loading' | 'error_sd' | 'structural';
  mean: number;
  sd: number;
  median: number;
  ciLower: number;
  ciUpper: number;
  rHat: number;
  essBulk: number;
  essTail: number;
  mcse: number;
  isFixed?: boolean;
  chainTraces: number[][];
  densityBins: Array<{ x: number; density: number }>;
}

export interface SourceComparisonRow {
  sourceKey: MeasurementSourceKey;
  sourceLabel: string;
  relativeBiasMean: number;
  relativeBiasSd: number;
  relativeBiasCI: [number, number];
  loadingMean: number;
  loadingSd: number;
  loadingCI: [number, number];
  errorVarianceMean: number;
  errorSdMean: number;
  reliability: number;
  uncertaintySd: number;
  noiseToSignalRatio: number;
  isAnchor: boolean;
}

export interface SourceEvaluationSummary {
  lowestErrorVarianceSource: MeasurementSourceKey;
  mostConsistentSource: MeasurementSourceKey;
  highestUncertaintySource: MeasurementSourceKey;
  highestReliabilitySource: MeasurementSourceKey;
  biasedSources: MeasurementSourceKey[];
  relativeOnlyCaveat: string;
}

export interface LatentEmissionEstimate {
  city: string;
  year: number;
  x1: number | null;
  x2: number | null;
  x3: number | null;
  latentMean: number;
  latentSd: number;
  ciLower: number;
  ciUpper: number;
  rHat: number;
  ess: number;
}

export interface IdentificationAuditResult {
  status: 'teridentifikasi' | 'teridentifikasi_lemah' | 'tidak_teridentifikasi';
  isIdentified: boolean;
  strategy: IdentificationStrategy;
  anchorSource: MeasurementSourceKey;
  scaleConstraint: string;
  locationConstraint: string;
  pairwiseSourceCorrelations: { r12: number; r13: number; r23: number };
  residualErrorCorrelations: { r12: number; r13: number; r23: number };
  conditionalIndependenceFlag: boolean;
  warnings: string[];
  explanation: string;
}

export interface PosteriorPredictiveMetrics {
  bayesianPValueMean: number;
  bayesianPValueSd: number;
  rmseOverall: number;
  rmseBySource: Record<MeasurementSourceKey, number>;
  waic: number;
  lppd: number;
  pWaic: number;
  obsVsPred: Array<{
    city: string;
    year: number;
    source: MeasurementSourceKey;
    observed: number;
    predicted: number;
    residual: number;
  }>;
}

export interface PriorSensitivityEntry {
  regime: PriorRegime;
  regimeLabel: string;
  loadingMeans: Record<MeasurementSourceKey, number>;
  biasMeans: Record<MeasurementSourceKey, number>;
  errorSdMeans: Record<MeasurementSourceKey, number>;
  latentGrandMean: number;
  maxRelativeShiftPct: number;
}

export interface ModelComparisonEntry {
  id: string;
  specLabel: string;
  likelihood: LikelihoodFamily;
  includeAR1: boolean;
  includeTimeEffect: boolean;
  waic: number;
  rmseOverall: number;
  maxRHat: number;
  minESS: number;
  isConverged: boolean;
}

export interface ConvergenceDiagnostics {
  chains: number;
  warmup: number;
  drawsPerChain: number;
  totalPostWarmupDraws: number;
  maxRHat: number;
  minEssBulk: number;
  minEssTail: number;
  maxMcseRatio: number;
  numericalWarningsCount: number;
  isConverged: boolean;
  convergenceStatusLabel: 'KONVERGEN' | 'PERINGATAN_KONVERGENSI' | 'TIDAK_KONVERGEN';
  convergenceMessages: string[];
  ar1SkippedReason?: string;
}

export interface StataStyleOutputBundle {
  headerConsoleText: string;
  parameterTableText: string;
  reliabilityTableText: string;
  latentTableText: string;
  diagnosticsSummaryText: string;
}

export interface AcademicInterpretations {
  parameterInterpretation: string;
  reliabilityInterpretation: string;
  latentEmissionInterpretation: string;
  diagnosticsInterpretation: string;
  sensitivityInterpretation: string;
  methodologyAndIdentificationNote: string;
  researchLimitations: string[];
  finalConclusion: string;
}

export interface GeneratedReproducibleCode {
  stanCode: string;
  rScript: string;
  brmsSnippet: string;
  preprocessingCodeR: string;
}

export interface PanelLatentFitResult {
  engineAttribution: string;
  spec: PanelLatentModelSpec;
  mapping: PanelLatentMapping;
  preprocessing: PanelLatentPreprocessingOptions;
  nObs: number;
  nCities: number;
  nYears: number;
  isBalanced: boolean;
  scaleContext: {
    workingUnitNote: string;
    wasLog1p: boolean;
    wasStandardized: boolean;
    meansBeforeStd: Record<MeasurementSourceKey, number>;
    sdsBeforeStd: Record<MeasurementSourceKey, number>;
  };
  parameters: MCMCParameterSummary[];
  sourceComparison: SourceComparisonRow[];
  sourceEvaluation: SourceEvaluationSummary;
  latentEstimates: LatentEmissionEstimate[];
  diagnostics: ConvergenceDiagnostics;
  identificationAudit: IdentificationAuditResult;
  ppc: PosteriorPredictiveMetrics;
  sensitivity: PriorSensitivityEntry[];
  modelComparison: ModelComparisonEntry[];
  stataOutput: StataStyleOutputBundle;
  interpretations: AcademicInterpretations;
  generatedCode: GeneratedReproducibleCode;
}

