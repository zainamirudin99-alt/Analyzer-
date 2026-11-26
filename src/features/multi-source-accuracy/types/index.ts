
export type MsmaStepStatus =
  | 'Belum dikerjakan'
  | 'Sedang diproses'
  | 'Selesai'
  | 'Perlu perhatian'
  | 'Tidak memenuhi'
  | 'Tidak dapat diidentifikasi';

export type MsmaDiagnosticStatus =
  | 'Memenuhi'
  | 'Tidak memenuhi'
  | 'Perlu perhatian'
  | 'Tidak dapat diuji'
  | 'Tidak relevan';

export type MsmaTestabilityTier =
  | 'EMPIRIS'
  | 'TIDAK_LANGSUNG'
  | 'TIDAK_DAPAT_DIUJI_TANPA_GT';

export type MsmaMethodId =
  | 'BLAND_ALTMAN_DEMING'
  | 'TRIPLE_COLLOCATION'
  | 'CORRELATED_TRIPLE_COLLOCATION_FALLBACK'
  | 'N_CORNERED_HAT'
  | 'EXTENDED_COLLOCATION'
  | 'BLOCKED_CONSTRUCT_MISMATCH'
  | 'INSUFFICIENT_DATA';

export type MsmaConstructClass =
  | 'CONTOH_A'
  | 'CONTOH_B'
  | 'BELUM_DITENTUKAN';

export type MsmaPhysicalDimension =
  | 'EMISSION_FLUX_MASS_PER_TIME'
  | 'ATMOSPHERIC_MOLE_FRACTION'
  | 'SURFACE_CONCENTRATION'
  | 'ENERGY_INTENSITY'
  | 'MONETARY_VALUE'
  | 'INDEX_SCORE'
  | 'OTHER_CUSTOM';

export type MsmaTransformationId =
  | 'NONE'
  | 'LOG'
  | 'LOG1P'
  | 'SQRT'
  | 'BOX_COX'
  | 'YEO_JOHNSON'
  | 'STANDARDIZATION_Z'
  | 'DEMEANING_WITHIN'
  | 'FIRST_DIFFERENCE'
  | 'TEMPORAL_DETRENDING'
  | 'SPATIAL_ADJUSTMENT'
  | 'MISSING_LISTWISE_COMPLETE'
  | 'OUTLIER_WINSORIZE_SENSITIVITY'
  | 'UNIT_CONSTRUCT_HARMONIZATION';

export interface MsmaRawSheet {
  sheetName: string;
  rawMatrix: unknown[][];
  headerRowIndex: number;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  columnCount: number;
  numericColumnCount: number;
  isRecommendedPanelSheet: boolean;
}

export interface MsmaColumnTypeProfile {
  columnName: string;
  detectedType: 'numeric' | 'categorical' | 'mixed' | 'empty';
  totalCount: number;
  validCount: number;
  numericCount: number;
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  sampleValues: string[];
  suggestedRole: 'entity_id' | 'time_id' | 'measurement_source' | 'control_or_other';
}

export interface MsmaUploadedWorkbook {
  fileName: string;
  fileSizeBytes: number;
  sourceKind: 'upload' | 'preset' | 'paste' | 'google_sheets';
  sheets: MsmaRawSheet[];
  activeSheetName: string;
  columnProfiles: MsmaColumnTypeProfile[];
  validationMessages: string[];
  isValid: boolean;
}

export interface MsmaEntityObsSummary {
  entityId: string;
  obsCount: number;
  minPeriod: number;
  maxPeriod: number;
  hasGap: boolean;
}

export interface MsmaPanelStructureResult {
  entityColumn: string;
  timeColumn: string;
  recommendedEntityColumn: string;
  recommendedTimeColumn: string;
  nEntities: number;
  nPeriods: number;
  totalRows: number;
  validPanelRows: number;
  missingEntityOrTimeRows: number;
  expectedBalancedRows: number;
  missingPanelCells: number;
  isBalanced: boolean;
  duplicatePairsCount: number;
  duplicateExamples: string[];
  periodGapEntitiesCount: number;
  inconsistentTimeRows: number;
  periodsSorted: number[];
  entityDistribution: MsmaEntityObsSummary[];
  unbalancedEvaluationNote: string;
  potentialMissingnessBiasRisk: 'RENDAH' | 'SEDANG' | 'TINGGI';
}

export interface MsmaSourceConfig {
  id: string;
  columnKey: string;
  displayName: string;
  unit: string;
  constructDefinition: string;
  physicalDimension: MsmaPhysicalDimension;
  spatialScope: string;
  temporalPeriod: string;
  dataType: 'continuous_numeric' | 'discrete_numeric' | 'non_numeric';
  sourceOriginInfo: string;
  unitScaleMultiplier: number;
  conversionModelEnabled: boolean;
  conversionSlope: number;
  conversionIntercept: number;
  conversionUncertaintySd: number;
  conversionFormulaNote: string;
  conversionLiteratureRef: string;
}

export interface MsmaConstructDimensionCheck {
  aspect: string;
  passed: boolean;
  statusLabel: 'Sama / Sebanding' | 'Dapat Dikonversi Fisik' | 'Berbeda Konstruk' | 'Belum Lengkap';
  detail: string;
}

export interface MsmaConstructClassificationResult {
  autoClassification: MsmaConstructClass;
  finalClassification: MsmaConstructClass;
  isUserOverridden: boolean;
  userConfirmed: boolean;
  checks: MsmaConstructDimensionCheck[];
  primaryWarning: string | null;
  harmonizationPossible: boolean;
  harmonizationMethodSummary: string;
  propagatedConversionVarianceBySource: Record<string, number>;
  allowsJointCollocationRanking: boolean;
  classificationReasons: string[];
  alternativeResearchRecommendations: string[];
}

export interface MsmaDescriptiveSourceRow {
  sourceId: string;
  displayName: string;
  unit: string;
  nValid: number;
  nMissing: number;
  missingPct: number;
  mean: number;
  median: number;
  sd: number;
  variance: number;
  min: number;
  max: number;
  skewness: number;
  kurtosisExcess: number;
  iqr: number;
  outlierCountMad: number;
  outlierPctMad: number;
  betweenEntitySd: number;
  withinEntitySd: number;
}

export interface MsmaPairwiseScatterSummary {
  sourceAId: string;
  sourceBId: string;
  sourceAName: string;
  sourceBName: string;
  nPairs: number;
  pearsonR: number;
  pearsonP: number;
  spearmanRho: number;
  spearmanP: number;
  olsSlope: number;
  olsIntercept: number;
  points: Array<{ entity: string; period: number; a: number; b: number; isOutlier: boolean }>;
}

export interface MsmaDescriptiveBundle {
  nCompleteCasesAllSources: number;
  nTotalPanelRows: number;
  sourceStats: MsmaDescriptiveSourceRow[];
  pearsonMatrix: number[][];
  spearmanMatrix: number[][];
  pairwiseScatters: MsmaPairwiseScatterSummary[];
  periodMeans: Array<{ period: number; valuesBySource: Record<string, number | null> }>;
  entityMeans: Array<{ entity: string; valuesBySource: Record<string, number | null> }>;
  missingnessGrid: Array<{
    entity: string;
    period: number;
    presentBySource: Record<string, boolean>;
  }>;
}

export interface SelectMeasurementMethodInput {
  sourceCount: number;
  measurementType: 'CONTOH_A_SAME' | 'CONTOH_B_HARMONIZED' | 'CONTOH_B_UNHARMONIZED' | 'UNDETERMINED';
  commonTarget: boolean;
  panelStructure: {
    nEntities: number;
    nPeriods: number;
    nCompleteCases: number;
    isBalanced: boolean;
    duplicatePairsCount: number;
  };
  errorIndependence: {
    suspectedCorrelatedPairsCount: number;
    maxEstimatedErrorCorrAbs: number;
    hasHeywoodNegativeVariance: boolean;
  };
  missingPattern: {
    overallMissingPct: number;
    missingnessBiasRisk: 'RENDAH' | 'SEDANG' | 'TINGGI';
  };
  sampleSize: number;
  temporalStructure: {
    maxResidualAr1Abs: number;
    hasPeriodGaps: boolean;
  };
  spatialStructure: {
    betweenEntitySharePct: number;
    crossSectionalDependenceAbs: number;
  };
  modelIdentifiability: {
    isIdentified: boolean;
    covarianceDegreesOfFreedom: number;
    requiredParameters: number;
    reason: string;
  };
}

export interface SelectMeasurementMethodOutput {
  recommendedMethod: MsmaMethodId;
  recommendedMethodLabel: string;
  alternativeMethods: Array<{
    methodId: MsmaMethodId;
    label: string;
    whenAppropriate: string;
    identifiable: boolean;
  }>;
  methodJustification: string[];
  assumptions: string[];
  limitations: string[];
  eligibilityStatus: MsmaStepStatus;
}

export interface MsmaDiagnosticItem {
  id: string;
  testName: string;
  applicableMethods: string;
  testabilityTier: MsmaTestabilityTier;
  hypothesis: string;
  statisticLabel: string;
  statisticValue: number | null;
  pValue: number | null;
  confidenceInterval: [number, number] | null;
  status: MsmaDiagnosticStatus;
  interpretation: string;
}

export interface MsmaDiagnosticsBundle {
  targetMethod: MsmaMethodId;
  items: MsmaDiagnosticItem[];
  overallStatus: MsmaStepStatus;
  summaryNote: string;
}

export interface MsmaTransformationRecommendation {
  id: MsmaTransformationId;
  issueDetected: string;
  recommendationLabel: string;
  statisticalRationale: string;
  interpretationConsequence: string;
  stataCommand: string;
  eligibleOnCurrentData: boolean;
  ineligibilityReason: string | null;
  isPrimaryRecommendation: boolean;
  status: 'Belum diterapkan' | 'Diterapkan' | 'Ditolak';
  beforeAfterPreview: {
    meanSkewnessBefore: number;
    meanSkewnessAfter: number;
    completeCasesBefore: number;
    completeCasesAfter: number;
    scaleSummaryBefore: string;
    scaleSummaryAfter: string;
  };
}

export interface MsmaTransformationBundle {
  activeTransformation: MsmaTransformationId;
  dropDuplicates: boolean;
  outlierHandling: 'KEEP_ALL' | 'WINSORIZE_2_5' | 'TRIM_EXTREME_3_5_MAD';
  missingHandling: 'COMPLETE_CASE' | 'WITHIN_ENTITY_INTERPOLATE';
  primaryRecommendationId: MsmaTransformationId;
  primarySelectionReason: string;
  recommendations: MsmaTransformationRecommendation[];
}

export interface MsmaTwoSourceResult {
  source1Id: string;
  source2Id: string;
  source1Name: string;
  source2Name: string;
  unit: string;
  nPairs: number;
  nEntities: number;
  meanDifference: number;
  meanDifferenceSeCluster: number;
  meanDifferenceCi95: [number, number];
  naiveSdDifference: number;
  betweenEntityDiffVariance: number;
  withinEntityDiffVariance: number;
  repeatedMeasuresSdDifference: number;
  loaLowerNaive: number;
  loaUpperNaive: number;
  loaLowerRepeatedMeasures: number;
  loaUpperRepeatedMeasures: number;
  loaLowerCi95: [number, number];
  loaUpperCi95: [number, number];
  proportionalBiasSlope: number;
  proportionalBiasT: number;
  proportionalBiasP: number;
  heteroskedasticitySlopeAbsDiff: number;
  heteroskedasticityP: number;
  demingErrorVarianceRatioLambda: number;
  isAssumedEqualErrorRatio: boolean;
  demingSlope: number;
  demingSlopeSeCluster: number;
  demingSlopeCi95: [number, number];
  demingIntercept: number;
  demingInterceptSeCluster: number;
  demingInterceptCi95: [number, number];
  linsCcc: number;
  agreementInterpretation: string;
  identificationBoundaryWarning: string;
  points: Array<{
    entity: string;
    period: number;
    x1: number;
    x2: number;
    meanPair: number;
    diffPair: number;
    demingFittedX2: number;
  }>;
}

export interface MsmaSourceAccuracyEstimate {
  sourceId: string;
  displayName: string;
  unit: string;
  calibrationInterceptAlpha: number;
  calibrationSlopeBeta: number;
  calibrationSlopeCi95: [number, number];
  rawErrorVariance: number;
  calibratedErrorVariance: number;
  propagatedConversionVariance: number;
  totalComparableErrorVariance: number;
  errorVarianceCi95: [number, number];
  errorStandardDeviation: number;
  errorSdCi95: [number, number];
  relativeErrorPct: number;
  etcCorrelationR2: number;
  snrDb: number;
  bootstrapRank1ProbPct: number;
  bootstrapMeanRank: number;
  relativeRank: number | null;
  heywoodNegativeFlag: boolean;
  identifiable: boolean;
}

export interface MsmaTcaResult {
  referenceSourceId: string;
  referenceSourceName: string;
  nCompleteTriplets: number;
  nEntities: number;
  estimatedLatentVariance: number;
  covarianceMatrix: number[][];
  isIdentifiable: boolean;
  hasHeywoodCase: boolean;
  suspectedErrorCorrelationFlag: boolean;
  autocorrelatedErrorShareBySource: Record<string, number>;
  correlatedTcNote: string;
  rankingAllowed: boolean;
  rankingBlockedReason: string | null;
  estimates: MsmaSourceAccuracyEstimate[];
}

export interface MsmaErrorCovariancePair {
  sourceAId: string;
  sourceBId: string;
  sourceAName: string;
  sourceBName: string;
  estimatedErrorCovariance: number;
  estimatedErrorCorrelation: number;
  ci95: [number, number];
  identifiedByQuartet: string;
}

export interface MsmaMultiSourceCollocationResult {
  selectedEstimator: 'N_CORNERED_HAT' | 'EXTENDED_COLLOCATION';
  alternativeEstimator: 'N_CORNERED_HAT' | 'EXTENDED_COLLOCATION';
  selectionRationale: string;
  nCompleteCases: number;
  nEntities: number;
  nSources: number;
  covarianceDegreesOfFreedom: number;
  estimatedParametersCount: number;
  overidentificationDf: number;
  isPositiveSemidefinite: boolean;
  minEigenvalueRawCov: number;
  matrixConditionNumber: number;
  modelFitRmseCov: number;
  isIdentifiable: boolean;
  rankingAllowed: boolean;
  rankingBlockedReason: string | null;
  estimates: MsmaSourceAccuracyEstimate[];
  alternativeEstimates: MsmaSourceAccuracyEstimate[];
  estimatedErrorCovariances: MsmaErrorCovariancePair[];
}

export interface MsmaEstimationBundle {
  executedMethod: MsmaMethodId;
  executedMethodLabel: string;
  uncertaintyMethod: 'ENTITY_CLUSTER_BOOTSTRAP' | 'ANALYTICAL_AND_CLUSTER_BOOTSTRAP' | 'NONE_BLOCKED';
  bootstrapReplications: number;
  workingScaleNote: string;
  twoSourceResult: MsmaTwoSourceResult | null;
  tcaResult: MsmaTcaResult | null;
  multiSourceResult: MsmaMultiSourceCollocationResult | null;
  residualsBySource: Record<string, Array<{ entity: string; period: number; approxResidual: number }>>;
}

export interface MsmaRobustnessScenarioResult {
  scenarioId: string;
  scenarioLabel: string;
  category:
    | 'FULL_SAMPLE'
    | 'ENTITY_GROUP'
    | 'PERIOD_SPLIT'
    | 'OUTLIER_SENSITIVITY'
    | 'ALT_TRANSFORMATION'
    | 'BALANCED_SUBPANEL'
    | 'ERROR_CORRELATION_PERTURBATION'
    | 'ALT_METHOD';
  nObs: number;
  identifiable: boolean;
  ranksBySourceId: Record<string, number | null>;
  errorSdBySourceId: Record<string, number | null>;
  topSourceId: string | null;
  topSourceName: string | null;
  rankChangedFromBaseline: boolean;
  conclusionNote: string;
}

export interface MsmaRobustnessBundle {
  evaluated: boolean;
  rankingStabilityPct: number;
  isRankingRobust: boolean | null;
  stabilityVerdict: string;
  scenarios: MsmaRobustnessScenarioResult[];
}

export interface MsmaStepStataBundle {
  stepNumber: number;
  stepTitle: string;
  stataVersionCompatibility: string;
  commandOrigin: 'BUILT_IN_STATA' | 'BUILT_IN_STATA_AND_MATA' | 'COMMUNITY_PACKAGE_OPTIONAL';
  requiredExternalPackages: Array<{ name: string; installCmd: string; purpose: string }>;
  stataCode: string;
  explanationBullets: string[];
}

export interface MsmaStataCompiledSection {
  sectionNumber: number;
  sectionTitle: string;
  stataCommand: string;
  replicatedOutput: string;
  resultNote: string;
  interpretation: string;
}

export interface MsmaJournalReportSections {
  title: string;
  abstractText: string;
  keywords: string;
  introduction: string;
  literatureReview: string;
  researchMethodology: string;
  dataAndVariables: string;
  statisticalResults: string;
  discussion: string;
  robustnessAnalysis: string;
  conclusion: string;
  limitations: string;
  referencesText: string;
  appendixStataCommands: string;
}

export interface MsmaBibliographyEntry {
  id: string;
  category:
    | 'Triple Collocation'
    | 'Extended Collocation'
    | 'N-Cornered Hat'
    | 'Correlated Error'
    | 'Panel Measurement Models'
    | 'Urban CO₂ Emission Validation'
    | 'Atmospheric Inversion';
  title: string;
  authors: string;
  year: number;
  journal: string;
  publisher: string;
  doi: string;
  url: string;
  methodCovered: string;
  contributionSummary: string;
  relevanceToFeature: string;
  verifiedVia: 'Crossref API';
}

export interface MsmaGlossaryItem {
  termKey: string;
  termLabel: string;
  fullExpansion: string;
  simpleDefinition: string;
  technicalExplanation: string;
  whyImportant: string;
  simpleExample: string;
  impactOnAnalysis: string;
}

export interface MsmaFullAnalysisResult {
  computedAt: string;
  panel: MsmaPanelStructureResult;
  classification: MsmaConstructClassificationResult;
  descriptives: MsmaDescriptiveBundle;
  decision: SelectMeasurementMethodOutput;
  diagnostics: MsmaDiagnosticsBundle;
  transformation: MsmaTransformationBundle;
  estimation: MsmaEstimationBundle;
  robustness: MsmaRobustnessBundle;
  stepStataCommands: MsmaStepStataBundle[];
  stataCompilation: MsmaStataCompiledSection[];
  completeStataDoFile: string;
  technicalInterpretation: string;
  simpleInterpretation: string;
  journalDefault: MsmaJournalReportSections;
}

export interface MsmaConfigurableSnapshot {
  activeSheetName: string;
  headerRowIndex: number;
  entityColumn: string;
  timeColumn: string;
  sources: MsmaSourceConfig[];
  classificationOverride: MsmaConstructClass | null;
  userConfirmedClassification: boolean;
  activeTransformation: MsmaTransformationId;
  rejectedTransformations: MsmaTransformationId[];
  dropDuplicates: boolean;
  outlierHandling: 'KEEP_ALL' | 'WINSORIZE_2_5' | 'TRIM_EXTREME_3_5_MAD';
  missingHandling: 'COMPLETE_CASE' | 'WITHIN_ENTITY_INTERPOLATE';
  preferredMethodOverride: MsmaMethodId | null;
  demingLambdaRatio: number;
  demingLambdaExternalKnown: boolean;
  bootstrapReplications: number;
}

export interface MsmaAuditTrailEntry {
  id: string;
  timestamp: string;
  stepNumber: number;
  actionLabel: string;
  detail: string;
}
