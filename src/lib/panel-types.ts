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

export interface ModelSelectionResult {
  chow: {
    stat: number;
    df1: number;
    df2: number;
    p: number;
    preferred: 'CEM' | 'FEM';
  };
  hausman: {
    chi2: number;
    df: number;
    p: number;
    preferred: 'FEM' | 'REM';
    isNegativeChi2?: boolean;
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
  };
  selectedModel: PanelModelType;
  selectionReason: string;
  isAnomalous: boolean;
}

export interface PanelAssumptionsResult {
  vif: {
    meanVif: number;
    variables: Record<string, { vif: number; tolerance: number }>;
  };
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
  normality?: {
    statistic: number;
    p: number;
    testName: string;
    isNormal: boolean;
    cltProtected?: boolean;
    reason?: string;
  };
  clusterBiasWarning?: {
    isBiased: boolean;
    clusterCount: number;
    message: string;
  };
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
  finalModel: PanelModelResult;
  assumptions: PanelAssumptionsResult;
  consoleBlocks: StataConsoleBlockData[];
  errors?: string[];
}
