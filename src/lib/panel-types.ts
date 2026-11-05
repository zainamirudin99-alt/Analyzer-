// ============================================================
// Panel Data Regression Types (Gaya Stata)
// ============================================================

export const SUPPORTED_PANEL_MODELS = ['CEM', 'FEM', 'REM'] as const;
export type PanelModelType = typeof SUPPORTED_PANEL_MODELS[number];

export interface PanelFitInput {
  rows: Record<string, any>[];
  idCol: string;
  timeCol: string;
  yCol: string;
  xCols: string[];
  alpha?: number;
  robust?: boolean;
}

export interface PanelCoefficientRow {
  variable: string;
  b: number;
  stdError: number;
  tOrZ: number;
  statType: 't' | 'z';
  sig: number;
  ciLower: number;
  ciUpper: number;
  isOmitted?: boolean;
  omittedReason?: string;
}

export interface PanelModelResult {
  modelType: PanelModelType;
  coefficients: Record<string, PanelCoefficientRow>;
  r2: {
    within: number;
    between: number;
    overall: number;
  };
  adjR2?: number;
  sigma_u?: number;
  sigma_e: number;
  rho?: number;
  theta?: number;
  fStat?: number;
  fPValue?: number;
  waldChi2?: number;
  waldPValue?: number;
  dfModel: number;
  dfResidual: number;
  nEntities: number;
  nPeriods: number;
  nObs: number;
  isRobust: boolean;
  clusterBiasWarning?: {
    isBiased: boolean;
    clusterCount: number;
    message: string;
  };
  chowF?: {
    f: number;
    df1: number;
    df2: number;
    p: number;
  };
  residuals?: number[];
}

export interface PanelDeclarationResult {
  isValid: boolean;
  entityCount: number;
  timeCount: number;
  totalObs: number;
  isBalanced: boolean;
  tMin: number;
  tAvg: number;
  tMax: number;
  hasDuplicates: boolean;
  duplicateCount: number;
  timeSpan: {
    min: number;
    max: number;
  };
  errors: string[];
  warnings: string[];
}

export interface StataConsoleBlockData {
  stepIndex: number;
  stepTitle: string;
  stataCommand: string;
  stataFunction: string;
  stataOutput: string;
  babyLanguage: string;
}

export type ZeroValuePolicy = 'true_zero' | 'no_disclosure_drop' | 'no_disclosure_impute_mean' | 'no_disclosure_impute_median';

export type TransformMethod = 'asli' | 'ln' | 'ln_1p' | 'sqrt' | 'orthog' | 'inv' | 'std';

export interface TransformOptionItem {
  method: TransformMethod;
  label: string;
  badge: string;
  formula: string;
  desc: string;
  isRecommended?: boolean;
  isValid: boolean;
  invalidReason?: string;
}

export interface VariableLNAnalysis {
  variable: string;
  role: 'Y' | 'X';
  n: number;
  min: number;
  max: number;
  mean: number;
  sd: number;
  skewness: number;
  kurtosis: number;
  hasZero: boolean;
  hasNegative: boolean;
  needsLN: boolean;
  reason: string;
  lnVarName: string;
  shiftUsed: number;
  recommendedMethod?: TransformMethod;
  selectedMethod?: TransformMethod;
  activeVarName?: string;
  recommendedReason?: string;
  stataCommand?: string;
  availableOptions?: TransformOptionItem[];
}

export interface PanelLNTransformReport {
  analyses: VariableLNAnalysis[];
  recommendedVars: string[];
  appliedVars: string[];
  transformMap?: Record<string, TransformMethod>;
  activeYCol: string;
  activeXCols: string[];
  transformedRows: Record<string, any>[];
  stataCommands: string[];
}

export interface PanelOrthogReport {
  triggered: boolean;
  vifApproach: 'uncentered' | 'centered';
  collinearVars: string[];
  orthogMapping: Record<string, string>; // originalVar -> orth_var
  finalActiveXCols: string[];
  transformedRows: Record<string, any>[];
  stataCommand: string;
  postOrthogVif: {
    meanVif: number;
    variables: Record<string, { vif: number; tolerance: number }>;
  };
}

export interface NormalityHistogramBin {
  binStart: number;
  binEnd: number;
  mid: number;
  count: number;
  density: number;
  normalDensity: number;
}

export interface DetailedPanelNormalityResult {
  statistic: number;
  p: number;
  testName: string;
  isNormal: boolean;
  cltProtected?: boolean;
  reason?: string;
  // Stata predict choice
  predictCommand?: 'predict e, e' | 'predict resid, residuals';
  predictExplanation?: string;
  residualsUsed?: number[];
  altResiduals?: number[];
  meanResidual?: number;
  sdResidual?: number;
  skewness?: number;
  kurtosis?: number;
  histogramBins?: NormalityHistogramBin[];
  // 3 Stata Normality Tests
  sktest?: {
    n: number;
    prSkewness: number;
    prKurtosis: number;
    adjChi2: number;
    probChi2: number;
    isNormal: boolean;
  };
  swilk?: {
    n: number;
    w: number;
    v: number;
    z: number;
    probZ: number;
    isNormal: boolean;
  };
  ksmirnov?: {
    n: number;
    dStat: number;
    pValue: number;
    correctedP: number;
    isNormal: boolean;
  };
}

export interface ModelSelectionResult {
  chow: {
    stat: number;
    df1: number;
    df2: number;
    p: number;
    preferred: 'CEM' | 'FEM';
    dummyApproach?: {
      stataCmd: string;
      testparmCmd: string;
      nDummies: number;
      r2LSDV: number;
      sampleDummies: Array<{ entity: string; coef: number; se: number; t: number; p: number }>;
    };
  };
  hausman: {
    chi2: number;
    df: number;
    p: number;
    preferred: 'FEM' | 'REM';
    isNegativeChi2?: boolean;
    dataConditionNote?: string;
  };
  mundlakCRE: {
    waldChi2: number;
    df: number;
    p: number;
    preferred: 'FEM' | 'REM';
  };
  breuschPaganLM: {
    chibar2: number;
    df: number;
    p: number;
    preferred: 'CEM' | 'REM';
    adaptedNote?: string;
  };
  selectedModel: PanelModelType;
  selectionReason: string;
  isAnomalous: boolean;
}

export interface PanelAssumptionsResult {
  vif: {
    meanVif: number;
    approach?: 'uncentered' | 'centered';
    stataCmd?: string;
    hasMulticollinearity?: boolean;
    variables: Record<string, { vif: number; tolerance: number }>;
  };
  centeredVif?: {
    meanVif: number;
    variables: Record<string, { vif: number; tolerance: number }>;
  };
  uncenteredVif?: {
    meanVif: number;
    variables: Record<string, { vif: number; tolerance: number }>;
  };
  orthogReport?: PanelOrthogReport;
  greeneHetero?: {
    chi2: number;
    df: number;
    p: number;
    hasHeteroskedasticity: boolean;
  };
  breuschPaganHetero?: {
    lm: number;
    p: number;
    hasHeteroskedasticity: boolean;
  };
  wooldridgeSerial?: {
    f: number;
    df1: number;
    df2: number;
    p: number;
    hasAutocorrelation: boolean;
    skippedReason?: string;
  };
  normality?: DetailedPanelNormalityResult;
  clusterBiasWarning?: {
    isBiased: boolean;
    clusterCount: number;
    message: string;
  };
}

export interface EasyPanelInterpretation {
  modelSummaryLine: string;
  simultaneousTestLine: string;
  rSquaredLine: string;
  transformationNotes: string[];
  predictorInterpretations: Array<{
    variable: string;
    originalVariable: string;
    coef: number;
    se: number;
    tOrZ: number;
    pValue: number;
    isSignificant: boolean;
    direction: 'positif' | 'negatif' | 'netral';
    easyMeaning: string;
  }>;
  overallConclusion: string;
}

export interface PanelFitResult {
  success: boolean;
  declaration: PanelDeclarationResult;
  models: {
    cem: PanelModelResult;
    fem: PanelModelResult;
    rem: PanelModelResult;
  };
  selection: ModelSelectionResult;
  selectedModel: PanelModelResult;
  postOrthogSelectedModel?: PanelModelResult;
  finalModel: PanelModelResult;
  assumptions: PanelAssumptionsResult;
  lnReport?: PanelLNTransformReport;
  activeYCol?: string;
  initialActiveXCols?: string[];
  finalActiveXCols?: string[];
  easyInterpretation?: EasyPanelInterpretation;
  consoleBlocks: StataConsoleBlockData[];
  errors?: string[];
}
