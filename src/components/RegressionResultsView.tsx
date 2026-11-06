'use client';

import React, { useState, useMemo } from 'react';
import { OLSFitResult, runRegressionEngine, sampleStdDev } from '../lib/regression-engine';
import {
  getPermittedRemedials,
  detectOutliers,
  applyOutlierRemoval,
  computeBoxCoxProfile,
  applyTransformation,
  computeHC3StandardErrors,
  computeHACNeweyWestLag,
  computeHACNeweyWestStandardErrors,
  applyCochraneOrcuttAR1,
  applyFirstDifferenceTimeSeries,
  applyWLSRegression,
  applyOrthogLinearRegression,
  applyDoubleLogTransformation,
  calculateNormalityPassRate,
  OutlierCase,
  RemedialOption,
  PassRateResult
} from '../lib/regression-remedial';
import { generateDeterministicInterpretation } from '../lib/regression-interpretation';
import { DiagnosticPlots } from './DiagnosticPlots';
import {
  generateVariablesEnteredRemoved,
  computeAdvancedAssumptions,
  validateAgainstSPSS,
  SPSSValidationReport
} from '../lib/regression-spss-compatibility';
import {
  computeADF,
  computeKPSS,
  applyDifferencing,
  computeEngleGrangerCointegration,
  computeARCHLM
} from '../lib/regression-time-series-diagnostics';
import {
  generateStatisticalRecommendations,
  StatisticalRecommendationCard,
  RecommendationEngineOutput
} from '../lib/regression-recommendation-engine';
import {
  buildModelComparisonReport,
  ModelComparisonReport
} from '../lib/regression-model-comparison';
import {
  CheckCircle2,
  AlertTriangle,
  MinusCircle,
  Info,
  RefreshCw,
  ArrowLeft,
  LayoutGrid,
  Table as TableIcon,
  Download,
  Sliders,
  ShieldCheck,
  Check,
  X
} from 'lucide-react';

const TrendingUpIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </svg>
);

const CalculatorIcon = ({ size = 14, color }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="16" height="20" x="4" y="2" rx="2" />
    <line x1="8" x2="16" y1="6" y2="6" />
    <line x1="16" x2="16" y1="14" y2="18" />
    <path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" /><path d="M12 14h.01" /><path d="M8 14h.01" /><path d="M12 18h.01" /><path d="M8 18h.01" />
  </svg>
);

const PlusIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

interface RegressionResultsViewProps {
  result: OLSFitResult;
  onBackToConfig: () => void;
  onReRun: () => void;
  allRows?: Record<string, any>[];
  yCol?: string;
  xCols?: string[];
  isTimeSeries?: boolean;
  timeCol?: string;
  frequency?: string;
  alpha?: number;
  fileName?: string;
  selectedSheet?: string;
}

interface StoredModel {
  id: string; // "M0", "M1", etc.
  title: string;
  type: string;
  result: OLSFitResult;
  label: 'Konfirmatori' | 'Eksploratori';
  passRateResult?: PassRateResult;
  exploratoryReason?: string;
}

/** Formatter helper suppressing leading zero for probabilities and correlations bounded [0, 1] */
const formatSig = (val?: number): string => {
  if (val === undefined || isNaN(val)) return '-';
  if (val < 0.001) return '.000';
  const str = val.toFixed(3);
  return str.startsWith('0.') ? str.slice(1) : str;
};

const formatCorr = (val?: number): string => {
  if (val === undefined || isNaN(val)) return '-';
  const abs = Math.abs(val);
  const str = abs.toFixed(3);
  const formatted = str.startsWith('0.') ? str.slice(1) : str;
  return val < 0 ? `-${formatted}` : formatted;
};

const formatDec = (val?: number, digits = 3): string => {
  if (val === undefined || isNaN(val)) return '-';
  return val.toFixed(digits);
};

export const RegressionResultsView: React.FC<RegressionResultsViewProps> = ({
  result: initialM0Result,
  onBackToConfig,
  onReRun,
  allRows = [],
  yCol = initialM0Result.variables.yCol,
  xCols = initialM0Result.variables.xCols,
  isTimeSeries = initialM0Result.timeSeriesSummary?.isTimeSeries ?? false,
  timeCol,
  frequency = 'tidak_beraturan',
  alpha = 0.05,
  fileName = 'Dataset.xlsx',
  selectedSheet = 'Sheet1'
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [showS3Modal, setShowS3Modal] = useState(false);
  const [showRemedialModal, setShowRemedialModal] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [showRecommendationsModal, setShowRecommendationsModal] = useState(false);
  const [showModelComparisonModal, setShowModelComparisonModal] = useState(false);

  // Models history: M0 is permanent and always present!
  const [models, setModels] = useState<StoredModel[]>([
    {
      id: 'M0',
      title: 'Model Awal (M0)',
      type: 'baseline',
      result: initialM0Result,
      label: 'Konfirmatori'
    }
  ]);
  const [activeModelId, setActiveModelId] = useState<string>('M0');

  // Remedial state
  const [activeRemedialTab, setActiveRemedialTab] = useState<'assumptions' | 'r2_optimization'>('assumptions');
  const [selectedRemedialType, setSelectedRemedialType] = useState<string>('');
  const [selectedOutlierIndices, setSelectedOutlierIndices] = useState<number[]>([]);
  const [selectedTransformType, setSelectedTransformType] = useState<'ln' | 'log10' | 'sqrt' | 'box_cox'>('box_cox');
  const [boxCoxLambda, setBoxCoxLambda] = useState<number>(0);

  const activeModel = models.find((m) => m.id === activeModelId) || models[0];
  const activeResult = activeModel.result;

  const {
    modelType,
    sampleSize,
    variables,
    modelSummary,
    anova,
    coefficients,
    collinearityDiagnostics,
    residualsStatistics,
    casewiseDiagnostics,
    assumptions,
    scores,
    timeSeriesDiagnostics
  } = activeResult;

  // Extract raw Y and X numbers for remedial computations
  const validDataRows = allRows.filter(
    (r) =>
      r[yCol] !== undefined &&
      r[yCol] !== null &&
      r[yCol] !== '' &&
      !isNaN(Number(r[yCol])) &&
      xCols.every((col) => r[col] !== undefined && r[col] !== null && r[col] !== '' && !isNaN(Number(r[col])))
  );
  const rawY = validDataRows.map((r) => Number(r[yCol]));
  const rawX = validDataRows.map((r) => xCols.map((col) => Number(r[col])));

  // Descriptive statistics for Y and all X predictors
  const descStats = activeResult.descriptiveStatistics || [
    {
      variable: variables.yCol,
      n: rawY.length,
      mean: rawY.reduce((a, b) => a + b, 0) / (rawY.length || 1),
      stdDev: sampleStdDev(rawY),
      min: rawY.length > 0 ? Math.min(...rawY) : 0,
      max: rawY.length > 0 ? Math.max(...rawY) : 0
    },
    ...variables.xCols.map((col, idx) => {
      const vals = rawX.map((r) => r[idx]);
      return {
        variable: col,
        n: vals.length,
        mean: vals.reduce((a, b) => a + b, 0) / (vals.length || 1),
        stdDev: sampleStdDev(vals),
        min: vals.length > 0 ? Math.min(...vals) : 0,
        max: vals.length > 0 ? Math.max(...vals) : 0
      };
    })
  ];

  // Invariant I10: Permitted remedials purely driven by diagnostic assumption test failures
  const permittedRemedials = getPermittedRemedials(assumptions, isTimeSeries);

  // Candidate predictors for R² optimization (scans remaining numeric columns in dataset)
  const candidatePredictors = useMemo(() => {
    if (!allRows || allRows.length === 0 || !yCol) return [];
    const firstRow = allRows[0];
    const allCols = Object.keys(firstRow);
    const candidates = allCols.filter((c) => c !== yCol && !variables.xCols.includes(c));

    const results: { col: string; correlation: number; r2Contribution: number; nValid: number }[] = [];

    for (const col of candidates) {
      const validPairs = allRows
        .map((r) => ({ y: Number(r[yCol]), x: Number(r[col]) }))
        .filter((p) => !isNaN(p.y) && !isNaN(p.x) && isFinite(p.y) && isFinite(p.x));

      if (validPairs.length < 5) continue;

      const n = validPairs.length;
      const meanY = validPairs.reduce((s, p) => s + p.y, 0) / n;
      const meanX = validPairs.reduce((s, p) => s + p.x, 0) / n;

      let num = 0;
      let denY = 0;
      let denX = 0;
      for (const p of validPairs) {
        const dy = p.y - meanY;
        const dx = p.x - meanX;
        num += dy * dx;
        denY += dy * dy;
        denX += dx * dx;
      }

      if (denY > 0 && denX > 0) {
        const r = num / Math.sqrt(denY * denX);
        results.push({
          col,
          correlation: Math.round(r * 1000) / 1000,
          r2Contribution: Math.round(r * r * 1000) / 1000,
          nValid: n
        });
      }
    }

    return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }, [allRows, yCol, variables.xCols]);

  // Detected outliers
  const detectedOutliers = rawY.length > 0 && rawX.length > 0 ? detectOutliers(activeResult, rawY, rawX) : [];
  const eligibleOutliers = detectedOutliers.filter((o) => o.isEligible);
  const maxAllowedOutliers = Math.floor(0.05 * (allRows.length || activeResult.sampleSize.nInitial));

  // Box-Cox profile
  const boxCoxProfile = rawY.length > 0 && rawX.length > 0 ? computeBoxCoxProfile(rawY, rawX) : null;

  // Tahap 2: State Validasi SPSS & Diagnostik Lanjutan
  const [showSpssValidation, setShowSpssValidation] = useState<boolean>(false);
  const [showTimeSeriesDiagnostics, setShowTimeSeriesDiagnostics] = useState<boolean>(false);

  // Variables Entered / Removed (Tabel Standar SPSS)
  const varsEnteredRemoved = useMemo(() => {
    return generateVariablesEnteredRemoved(
      1,
      variables.xCols,
      (variables.enteredMethod?.toLowerCase() as any) || 'enter'
    );
  }, [variables]);

  // Advanced Assumptions (Jarque-Bera, White, Glejser, Goldfeld-Quandt, Ljung-Box)
  const advancedAssumptions = useMemo(() => {
    const residuals = activeResult.plots.resVsFit.map(p => p.residual);
    return computeAdvancedAssumptions(rawX, residuals);
  }, [rawX, activeResult]);

  // Time Series Advanced Diagnostics (ADF, KPSS, Differencing, Engle-Granger, ARCH-LM)
  const tsDiagnostics = useMemo(() => {
    if (!isTimeSeries || rawY.length < 15) return null;
    const residuals = activeResult.plots.resVsFit.map(p => p.residual);
    return {
      adf: computeADF(rawY, 'constant', 4),
      kpss: computeKPSS(rawY, 'level', 4),
      diff: applyDifferencing(rawY),
      cointegration: computeEngleGrangerCointegration(rawY, rawX),
      arch: computeARCHLM(residuals, 2)
    };
  }, [isTimeSeries, rawY, rawX, activeResult]);

  // SPSS Validation Report
  const spssValidationReport = useMemo(() => {
    return validateAgainstSPSS(activeResult, {
      r: activeResult.modelSummary.r,
      rSquared: activeResult.modelSummary.rSquared,
      adjRSquared: activeResult.modelSummary.adjRSquared,
      stdErrorEstimate: activeResult.modelSummary.stdErrorEstimate,
      durbinWatson: activeResult.modelSummary.durbinWatson,
      fStat: activeResult.anova.regression.f,
      fSig: activeResult.anova.regression.sig,
      ssRegression: activeResult.anova.regression.ss,
      ssResidual: activeResult.anova.residual.ss,
      dfRegression: activeResult.anova.regression.df,
      dfResidual: activeResult.anova.residual.df,
      coefficients: activeResult.coefficients.map(c => ({
        variable: c.variable,
        b: c.b,
        stdError: c.stdError,
        beta: c.beta,
        t: c.t,
        sig: c.sig,
        vif: c.collinearity.vif
      }))
    });
  }, [activeResult]);

  // Tahap 3: Statistical Recommendations Engine
  const recommendationOutput = useMemo(() => {
    return generateStatisticalRecommendations(activeResult, {
      rawY,
      rawX,
      isTimeSeries,
      alpha
    });
  }, [activeResult, rawY, rawX, isTimeSeries, alpha]);

  // Tahap 3: Model Comparison Report Matrix (AIC, BIC, RMSE, MAE)
  const modelComparisonReport = useMemo(() => {
    return buildModelComparisonReport(
      models.map((m) => ({
        id: m.id,
        title: m.title,
        type: m.type,
        result: m.result,
        label: m.label,
        passRate: m.passRateResult?.passRate
      })),
      rawY,
      rawX,
      isTimeSeries
    );
  }, [models, rawY, rawX, isTimeSeries]);

  // SPSS Table Style Objects (Horizontal borders only, zero vertical rules)
  const spssTableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    borderTop: '2px solid var(--border-color, #475569)',
    borderBottom: '2px solid var(--border-color, #475569)',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: '13px',
    lineHeight: '1.4'
  };

  const spssThStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color, #475569)',
    fontWeight: 600,
    color: 'var(--text-primary, #f8fafc)',
    background: 'var(--bg-secondary, #0f172a)'
  };

  const spssTdStyle: React.CSSProperties = {
    padding: '7px 12px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
    color: 'var(--text-primary, #f1f5f9)'
  };

  const spssCaptionStyle: React.CSSProperties = {
    captionSide: 'top',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: '14px',
    color: 'var(--text-primary, #f8fafc)',
    paddingBottom: '8px'
  };

  const footnoteStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--text-secondary, #94a3b8)',
    marginTop: '6px',
    lineHeight: '1.4'
  };

  // Generate deterministic narrative interpretation for active model
  const interpretation = generateDeterministicInterpretation(activeResult, {
    modelId: activeModel.id,
    modelType: activeModel.type,
    title: activeModel.title,
    kTried: models.length,
    label: activeModel.label,
    alpha,
    exploratoryReason: activeModel.exploratoryReason
  });

  // Handler: Apply Outlier Removal
  const handleApplyOutlierRemoval = () => {
    if (selectedOutlierIndices.length === 0) return;
    if (selectedOutlierIndices.length > maxAllowedOutliers) {
      alert(`Batas maksimal 5% terlampaui (${selectedOutlierIndices.length} > ${maxAllowedOutliers} baris).`);
      return;
    }

    try {
      const cleaned = applyOutlierRemoval(rawY, rawX, selectedOutlierIndices, allRows.length || rawY.length);
      const cleanedRows = cleaned.y.map((yVal, i) => {
        const rowObj: Record<string, any> = { [yCol]: yVal };
        xCols.forEach((col, cIdx) => {
          rowObj[col] = cleaned.x[i][cIdx];
        });
        return rowObj;
      });

      const newFit = runRegressionEngine({
        data: cleanedRows,
        yCol,
        xCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `Hapus ${selectedOutlierIndices.length} Outlier (${newModelId})`,
        type: 'outlier_removal',
        result: newFit,
        label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
        exploratoryReason: models.length > 1 ? 'Mengeksplorasi beberapa spesifikasi perbaikan' : undefined
      };

      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
      setSelectedOutlierIndices([]);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan penghapusan outlier');
    }
  };

  // Handler: Apply Transformation
  const handleApplyTransformation = () => {
    try {
      const lam = selectedTransformType === 'box_cox' ? (boxCoxProfile?.optimalLambda ?? 0) : 1;
      const shift = boxCoxProfile?.shiftConstant ?? 0;
      const transY = applyTransformation(rawY, selectedTransformType, lam, shift);

      const transRows = transY.map((yVal, i) => {
        const rowObj: Record<string, any> = { [yCol]: yVal };
        xCols.forEach((col, cIdx) => {
          rowObj[col] = rawX[i][cIdx];
        });
        return rowObj;
      });

      const newFit = runRegressionEngine({
        data: transRows,
        yCol,
        xCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const passRate = calculateNormalityPassRate(transY, rawX, isTimeSeries, true, undefined, 200);

      const newModelId = `M${models.length}`;
      const transTitle = selectedTransformType === 'box_cox' ? `Box-Cox (λ=${lam.toFixed(2)})` : selectedTransformType.toUpperCase();
      const newModel: StoredModel = {
        id: newModelId,
        title: `Transformasi ${transTitle} (${newModelId})`,
        type: 'transformation',
        result: newFit,
        label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
        passRateResult: passRate,
        exploratoryReason: models.length > 1 ? 'Mengevaluasi berbagai alternatif transformasi' : undefined
      };

      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan transformasi');
    }
  };

  // Handler: Apply Robust HC3
  const handleApplyHC3 = () => {
    const hc3SE = computeHC3StandardErrors(rawY, rawX, activeResult.coefficients.map((c) => c.b));
    // Create cloned result with updated HC3 standard errors, t, and sig
    const updatedCoefficients = activeResult.coefficients.map((c, idx) => {
      const robustSE = hc3SE[idx];
      const robustT = c.b / robustSE;
      // Normal/Student-t two-tailed p-value approximation
      const z = Math.abs(robustT);
      const tSig = Math.max(0.0001, 2 * (1 - normalCdf(z)));
      return {
        ...c,
        stdError: robustSE,
        t: robustT,
        sig: tSig,
        ciLower: c.b - 1.96 * robustSE,
        ciUpper: c.b + 1.96 * robustSE
      };
    });

    const newFit: OLSFitResult = {
      ...activeResult,
      coefficients: updatedCoefficients,
      engineVersion: `${activeResult.engineVersion}+hc3`
    };

    const newModelId = `M${models.length}`;
    const newModel: StoredModel = {
      id: newModelId,
      title: `Robust HC3 (${newModelId})`,
      type: 'robust_hc3',
      result: newFit,
      label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
      passRateResult: {
        passRate: 0,
        wilsonCiLower: 0,
        wilsonCiUpper: 0,
        b: 1000,
        subsampleSize: Math.floor(0.8 * rawY.length),
        isApplicable: false,
        inapplicabilityReason: 'HC3 tidak mengubah residual dan tidak bergantung pada asumsi normalitas.',
        heuristic: 'tidak_stabil'
      }
    };

    setModels([...models, newModel]);
    setActiveModelId(newModelId);
    setShowRemedialModal(false);
  };

  // Handler: Add Candidate Predictor for R² Optimization
  const handleAddPredictor = (newCol: string) => {
    try {
      const newXCols = [...variables.xCols, newCol];
      const newFit = runRegressionEngine({
        data: allRows,
        yCol,
        xCols: newXCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `Tambah ${newCol} (${newModelId})`,
        type: 'add_predictor',
        result: newFit,
        label: 'Eksploratori',
        exploratoryReason: `Menambahkan prediktor ${newCol} untuk mengoptimalkan varians terjelaskan R²`
      };

      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menambahkan prediktor ke model');
    }
  };

  // Handler: Apply Polynomial Quadratic Term (X²) for R² Optimization
  const handleApplyPolynomial = (xColToSquare: string) => {
    try {
      const quadColName = `${xColToSquare}_Kuadrat`;
      const origVals = validDataRows.map((r) => Number(r[xColToSquare]));
      const meanXVal = origVals.reduce((a, b) => a + b, 0) / (origVals.length || 1);

      const quadRows = allRows.map((r) => {
        const val = Number(r[xColToSquare]);
        if (isNaN(val) || val === null || val === undefined) {
          return { ...r, [quadColName]: null };
        }
        const centered = val - meanXVal;
        return {
          ...r,
          [quadColName]: centered * centered
        };
      });

      const newXCols = [...variables.xCols, quadColName];
      const newFit = runRegressionEngine({
        data: quadRows,
        yCol,
        xCols: newXCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `Polinomial (${xColToSquare}²) (${newModelId})`,
        type: 'polynomial',
        result: newFit,
        label: 'Eksploratori',
        exploratoryReason: `Menambahkan suku kuadratik ${xColToSquare}² untuk memodelkan hubungan kurvilinear`
      };

      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menambahkan suku polinomial');
    }
  };

  // Handler: Apply Weighted Least Squares (WLS)
  const handleApplyWLS = () => {
    try {
      const bVec = activeResult.coefficients.map((c) => c.b);
      const { rows: wlsRows } = applyWLSRegression(validDataRows, variables.yCol, variables.xCols, bVec);
      const newFit = runRegressionEngine({
        data: wlsRows,
        yCol: variables.yCol,
        xCols: variables.xCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `WLS Pembobotan Ragam (${newModelId})`,
        type: 'wls',
        result: newFit,
        label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
        exploratoryReason: models.length > 1 ? 'Pembobotan WLS untuk mengatasi heteroskedastisitas' : undefined
      };
      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan WLS');
    }
  };

  // Handler: Apply Gram-Schmidt Orthogonalization (orthog) for Multicollinearity
  const handleApplyOrthog = () => {
    try {
      const { rows: orthRows, orthXCols } = applyOrthogLinearRegression(validDataRows, variables.yCol, variables.xCols);
      const newFit = runRegressionEngine({
        data: orthRows,
        yCol: variables.yCol,
        xCols: orthXCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `Orthog Bebas Multiko VIF=1 (${newModelId})`,
        type: 'orthog',
        result: newFit,
        label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
        exploratoryReason: models.length > 1 ? 'Ortogonalisasi Gram-Schmidt untuk menghilangkan multikolinearitas' : undefined
      };
      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan ortogonalisasi orthog');
    }
  };

  // Handler: Apply HAC Newey-West Standard Errors (Time Series)
  const handleApplyHACNeweyWest = () => {
    try {
      const bVec = activeResult.coefficients.map((c) => c.b);
      const { se: hacSE, lagUsed } = computeHACNeweyWestStandardErrors(rawY, rawX, bVec);
      const updatedCoefficients = activeResult.coefficients.map((c, idx) => {
        const robustSE = hacSE[idx];
        const robustT = c.b / robustSE;
        const z = Math.abs(robustT);
        const tSig = Math.max(0.0001, 2 * (1 - normalCdf(z)));
        return {
          ...c,
          stdError: robustSE,
          t: robustT,
          sig: tSig,
          ciLower: c.b - 1.96 * robustSE,
          ciUpper: c.b + 1.96 * robustSE
        };
      });

      const newFit: OLSFitResult = {
        ...activeResult,
        coefficients: updatedCoefficients,
        engineVersion: `${activeResult.engineVersion}+hac(L=${lagUsed})`
      };

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `HAC Newey-West L=${lagUsed} (${newModelId})`,
        type: 'hac_newey_west',
        result: newFit,
        label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
        exploratoryReason: models.length > 1 ? `Koreksi HAC Newey-West lag L=${lagUsed} untuk autokorelasi time series` : undefined
      };
      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan HAC Newey-West');
    }
  };

  // Handler: Apply Cochrane-Orcutt / Prais-Winsten AR(1) (GLSAR)
  const handleApplyCochraneOrcutt = () => {
    try {
      const bVec = activeResult.coefficients.map((c) => c.b);
      const { rows: ar1Rows, rho } = applyCochraneOrcuttAR1(validDataRows, variables.yCol, variables.xCols, bVec);
      const newFit = runRegressionEngine({
        data: ar1Rows,
        yCol: variables.yCol,
        xCols: variables.xCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `Cochrane-Orcutt AR(1) ρ=${rho} (${newModelId})`,
        type: 'cochrane_orcutt',
        result: newFit,
        label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
        exploratoryReason: models.length > 1 ? `Transformasi AR(1) Prais-Winsten/Cochrane-Orcutt (rho=${rho})` : undefined
      };
      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan Cochrane-Orcutt AR(1)');
    }
  };

  // Handler: Apply First-Difference (Delta Y_t, Delta X_t) for Non-Stationary / Spurious Time Series
  const handleApplyFirstDifference = () => {
    try {
      const { rows: diffRows, diffYCol, diffXCols } = applyFirstDifferenceTimeSeries(
        validDataRows,
        variables.yCol,
        variables.xCols
      );
      if (diffRows.length < variables.xCols.length + 3) {
        alert('Jumlah observasi terlalu sedikit untuk transformasi First-Difference.');
        return;
      }
      const newFit = runRegressionEngine({
        data: diffRows,
        yCol: diffYCol,
        xCols: diffXCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `First-Difference ΔY, ΔX (${newModelId})`,
        type: 'first_difference',
        result: newFit,
        label: models.length === 1 ? 'Konfirmatori' : 'Eksploratori',
        exploratoryReason: 'Transformasi selisih pertama (First-Difference) untuk menstasionerkan deret waktu I(1) dan mencegah regresi lancung'
      };
      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan First-Difference');
    }
  };

  // Handler: Apply Double-Log (Log-Log: ln(Y) and ln(X))
  const handleApplyDoubleLog = () => {
    try {
      const { rows: logRows, lnYCol, lnXCols } = applyDoubleLogTransformation(
        validDataRows,
        variables.yCol,
        variables.xCols
      );
      const newFit = runRegressionEngine({
        data: logRows,
        yCol: lnYCol,
        xCols: lnXCols,
        isTimeSeries,
        timeCol,
        frequency,
        alpha
      });

      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `Double-Log ln(Y) & ln(X) (${newModelId})`,
        type: 'double_log',
        result: newFit,
        label: 'Eksploratori',
        exploratoryReason: 'Transformasi Double-Log (Cobb-Douglas elastisitas konstan) untuk melinearkan hubungan eksponensial & menstabilkan varians'
      };
      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menerapkan transformasi Double-Log');
    }
  };

  // Handler: 1-Click Auto-Scan Best Valid Specification (Optimasi R² & Asumsi Klasik Sesuai Kaidah Statistika)
  const handleAutoOptimizeBestSpecification = () => {
    try {
      const candidates: Array<{ title: string; type: string; fit: OLSFitResult; reason: string; score: number }> = [];

      const evaluateCandidate = (title: string, type: string, fit: OLSFitResult, reason: string) => {
        const passedCount = fit.assumptions.filter((a) => a.status === 'lulus').length;
        const r2 = isNaN(fit.modelSummary.rSquared) ? 0 : fit.modelSummary.rSquared;
        const adjR2 = isNaN(fit.modelSummary.adjRSquared) ? 0 : fit.modelSummary.adjRSquared;
        // Composite statistical quality score: balances Adjusted R² and Classical Assumption Pass Rate
        const score = adjR2 * 0.65 + r2 * 0.15 + (passedCount / Math.max(1, fit.assumptions.length)) * 0.2;
        candidates.push({ title, type, fit, reason, score });
      };

      // 1. Candidate: Outlier Removal (top eligible outliers up to 5%)
      if (eligibleOutliers.length > 0 && maxAllowedOutliers > 0) {
        try {
          const topOutliers = [...eligibleOutliers]
            .sort((a, b) => b.cooksD - a.cooksD)
            .slice(0, maxAllowedOutliers)
            .map((o) => o.index);
          const cleaned = applyOutlierRemoval(rawY, rawX, topOutliers, allRows.length || rawY.length);
          const cleanedRows = cleaned.y.map((yVal, i) => {
            const rowObj: Record<string, any> = { [variables.yCol]: yVal };
            variables.xCols.forEach((col, cIdx) => {
              rowObj[col] = cleaned.x[i][cIdx];
            });
            return rowObj;
          });
          const fitOutlier = runRegressionEngine({
            data: cleanedRows,
            yCol: variables.yCol,
            xCols: variables.xCols,
            isTimeSeries,
            timeCol,
            frequency,
            alpha
          });
          evaluateCandidate(
            `Auto-Clean ${topOutliers.length} Outlier`,
            'outlier_removal',
            fitOutlier,
            `Mengeliminasi ${topOutliers.length} pencilan berpengaruh (Cook's D > 4/n, batas <= 5%)`
          );
        } catch {
          // ignore candidate error
        }
      }

      // 2. Candidate: Double-Log (ln(Y) & ln(X))
      try {
        const { rows: logRows, lnYCol, lnXCols } = applyDoubleLogTransformation(
          validDataRows,
          variables.yCol,
          variables.xCols
        );
        const fitDoubleLog = runRegressionEngine({
          data: logRows,
          yCol: lnYCol,
          xCols: lnXCols,
          isTimeSeries,
          timeCol,
          frequency,
          alpha
        });
        evaluateCandidate(
          'Auto Double-Log ln(Y) & ln(X)',
          'double_log',
          fitDoubleLog,
          'Transformasi logaritma natural ganda (Double-Log) untuk kelinearan elastisitas & stabilisasi varians'
        );
      } catch {
        // ignore candidate error
      }

      // 3. Candidate: Centered Quadratic Polynomial on strongest X
      if (variables.xCols.length > 0) {
        try {
          const primaryX = variables.xCols[0];
          const quadColName = `${primaryX}_Kuadrat`;
          const origVals = validDataRows.map((r) => Number(r[primaryX]));
          const meanXVal = origVals.reduce((a, b) => a + b, 0) / (origVals.length || 1);
          const quadRows = validDataRows.map((r) => {
            const val = Number(r[primaryX]);
            const centered = val - meanXVal;
            return { ...r, [quadColName]: centered * centered };
          });
          const fitPoly = runRegressionEngine({
            data: quadRows,
            yCol: variables.yCol,
            xCols: [...variables.xCols, quadColName],
            isTimeSeries,
            timeCol,
            frequency,
            alpha
          });
          evaluateCandidate(
            `Auto Polinomial (${primaryX}²)`,
            'polynomial',
            fitPoly,
            `Penambahan suku kuadratik terpusat (${primaryX}²) untuk menangkap pola non-linear`
          );
        } catch {
          // ignore
        }
      }

      // 4. Candidate: Cochrane-Orcutt AR(1) if Time Series or Autocorrelation detected
      if (isTimeSeries || activeResult.modelSummary.durbinWatson < 1.5 || activeResult.modelSummary.durbinWatson > 2.5) {
        try {
          const bVec = activeResult.coefficients.map((c) => c.b);
          const { rows: ar1Rows, rho } = applyCochraneOrcuttAR1(validDataRows, variables.yCol, variables.xCols, bVec);
          const fitAR1 = runRegressionEngine({
            data: ar1Rows,
            yCol: variables.yCol,
            xCols: variables.xCols,
            isTimeSeries,
            timeCol,
            frequency,
            alpha
          });
          evaluateCandidate(
            `Auto AR(1) GLSAR (ρ=${rho})`,
            'cochrane_orcutt',
            fitAR1,
            `Koreksi autokorelasi AR(1) Prais-Winsten / Cochrane-Orcutt (rho=${rho})`
          );
        } catch {
          // ignore
        }
      }

      // 5. Candidate: Add Top Correlated Dataset Predictor (if available)
      if (candidatePredictors.length > 0) {
        try {
          const bestCand = candidatePredictors[0].col;
          const fitAdd = runRegressionEngine({
            data: allRows,
            yCol: variables.yCol,
            xCols: [...variables.xCols, bestCand],
            isTimeSeries,
            timeCol,
            frequency,
            alpha
          });
          evaluateCandidate(
            `Auto +Prediktor ${bestCand}`,
            'add_predictor',
            fitAdd,
            `Menambahkan prediktor kandidat terkuat (${bestCand}) dari dataset`
          );
        } catch {
          // ignore
        }
      }

      if (candidates.length === 0) {
        alert('Model saat ini sudah berada pada spesifikasi optimal yang tersedia.');
        return;
      }

      candidates.sort((a, b) => b.score - a.score);
      const winner = candidates[0];
      const newModelId = `M${models.length}`;
      const newModel: StoredModel = {
        id: newModelId,
        title: `${winner.title} (${newModelId})`,
        type: winner.type,
        result: winner.fit,
        label: 'Eksploratori',
        exploratoryReason: `${winner.reason} (R² = ${(winner.fit.modelSummary.rSquared * 100).toFixed(1)}%, Adj R² = ${(winner.fit.modelSummary.adjRSquared * 100).toFixed(1)}%)`
      };

      setModels([...models, newModel]);
      setActiveModelId(newModelId);
      setShowRemedialModal(false);
    } catch (e: any) {
      alert(e.message || 'Gagal menjalankan optimasi spesifikasi otomatis');
    }
  };

  // Handler: Export Word (.docx)
  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      const res = await fetch('/api/regression/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: activeResult,
          datasetName: fileName,
          sheetName: selectedSheet,
          alpha,
          seed: 12345,
          statusLabel: activeModel.label,
          exploratoryReason: activeModel.exploratoryReason,
          kTried: models.length,
          modelsHistory: models.map((m) => ({
            id: m.id,
            title: m.title,
            type: m.type,
            result: m.result,
            label: m.label,
            passRate: m.passRateResult?.passRate
          })),
          recommendationOutput,
          comparisonReport: modelComparisonReport
        })
      });

      if (!res.ok) throw new Error('Gagal menghasilkan file Word docx.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Hasil_Regresi_SPSS_${activeModel.id}_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert(e.message || 'Gagal mengekspor file Word');
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Handler: Export Excel (.xlsx Multi-Sheet)
  const handleExportXlsx = async () => {
    setIsExportingXlsx(true);
    try {
      const res = await fetch('/api/regression/export-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: activeResult,
          datasetName: fileName,
          sheetName: selectedSheet,
          comparisonReport: modelComparisonReport,
          recommendationOutput
        })
      });

      if (!res.ok) throw new Error('Gagal menghasilkan file Excel.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Hasil_Regresi_SPSS_${activeModel.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert(e.message || 'Gagal mengekspor file Excel');
    } finally {
      setIsExportingXlsx(false);
    }
  };

  // Handler: Export CSV (Residuals & Prediksi)
  const handleExportCsv = () => {
    try {
      const headers = ['Case_Number', variables.yCol, 'Predicted_Y', 'Residual', 'Std_Residual'];
      const rows = activeResult.plots.resVsFit.map((p, idx) => {
        const yVal = rawY[idx] !== undefined ? rawY[idx] : p.fitted + p.residual;
        const stdRes = activeResult.modelSummary.stdErrorEstimate > 0
          ? (p.residual / activeResult.modelSummary.stdErrorEstimate).toFixed(4)
          : '0';
        return [idx + 1, yVal, p.fitted.toFixed(4), p.residual.toFixed(4), stdRes].join(',');
      });
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Residuals_${variables.yCol}_${activeModel.id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert('Gagal mengekspor CSV: ' + (e.message || String(e)));
    }
  };

  // Handler: Export JSON (Audit Trail Lengkap)
  const handleExportJson = () => {
    try {
      const auditPayload = {
        modelId: activeModel.id,
        title: activeModel.title,
        label: activeModel.label,
        engineVersion: activeResult.engineVersion,
        exportedAt: new Date().toISOString(),
        dataset: { fileName, sheet: selectedSheet, n: activeResult.sampleSize.nUsed },
        variables: activeResult.variables,
        modelSummary: activeResult.modelSummary,
        anova: activeResult.anova,
        coefficients: activeResult.coefficients,
        assumptions: activeResult.assumptions,
        scores: activeResult.scores,
        recommendations: recommendationOutput,
        comparison: modelComparisonReport
      };
      const blob = new Blob([JSON.stringify(auditPayload, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit_Regresi_${activeModel.id}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      alert('Gagal mengekspor JSON: ' + (e.message || String(e)));
    }
  };

  return (
    <div style={{ padding: '4px 0 32px 0' }}>
      {/* ========================================================
          BAR NAVIGASI MODEL MULTI-SPESIFIKASI (M0 SELALU PERMANEN)
         ======================================================== */}
      <div style={{
        background: 'var(--bg-card, #1e293b)',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #334155)',
        marginBottom: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', marginRight: '4px' }}>
            Spesifikasi Model:
          </span>
          {models.map((m) => {
            const isActive = m.id === activeModelId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveModelId(m.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  border: isActive ? '1px solid var(--accent-primary, #10b981)' : '1px solid var(--border-color, #475569)',
                  background: isActive ? 'var(--accent-primary, #10b981)' : 'var(--bg-secondary, #0f172a)',
                  color: isActive ? '#ffffff' : 'var(--text-primary, #f8fafc)',
                  cursor: 'pointer'
                }}
              >
                <span>{m.title}</span>
                <span style={{
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: m.label === 'Konfirmatori' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                  color: m.label === 'Konfirmatori' ? '#a7f3d0' : '#fde68a'
                }}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Status Badge & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status Label Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            background: activeModel.label === 'Konfirmatori' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            border: `1px solid ${activeModel.label === 'Konfirmatori' ? '#10b981' : '#f59e0b'}`,
            color: activeModel.label === 'Konfirmatori' ? '#34d399' : '#fbbf24'
          }}>
            <ShieldCheck size={14} /> Status: {activeModel.label} (K={models.length})
          </div>

          {/* Tombol Rekomendasi Statistik */}
          <button
            type="button"
            onClick={() => setShowRecommendationsModal(!showRecommendationsModal)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #f59e0b',
              background: showRecommendationsModal ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
              color: showRecommendationsModal ? '#000000' : '#fbbf24',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <Sliders size={13} /> Rekomendasi Statistik ({recommendationOutput.summary.violatedAssumptions} Pelanggaran)
          </button>

          {/* Tombol Komparasi Model */}
          <button
            type="button"
            onClick={() => setShowModelComparisonModal(!showModelComparisonModal)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #8b5cf6',
              background: showModelComparisonModal ? '#8b5cf6' : 'rgba(139, 92, 246, 0.15)',
              color: showModelComparisonModal ? '#ffffff' : '#c4b5fd',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <TrendingUpIcon size={13} /> Komparasi Model ({models.length})
          </button>

          {/* Export Word (.docx) */}
          <button
            type="button"
            onClick={handleExportDocx}
            disabled={isExportingDocx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #0284c7',
              background: '#0284c7',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isExportingDocx ? 'not-allowed' : 'pointer',
              opacity: isExportingDocx ? 0.7 : 1
            }}
          >
            <Download size={13} /> {isExportingDocx ? 'Word...' : 'Word (.docx)'}
          </button>

          {/* Export Excel (.xlsx Multi-Tab) */}
          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={isExportingXlsx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #059669',
              background: '#059669',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
              cursor: isExportingXlsx ? 'not-allowed' : 'pointer',
              opacity: isExportingXlsx ? 0.7 : 1
            }}
          >
            <Download size={13} /> {isExportingXlsx ? 'Excel...' : 'Excel (.xlsx)'}
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #475569)',
              background: 'var(--bg-secondary, #0f172a)',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            CSV
          </button>

          {/* Export JSON Audit */}
          <button
            type="button"
            onClick={handleExportJson}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #475569)',
              background: 'var(--bg-secondary, #0f172a)',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            JSON
          </button>
        </div>
      </div>

      {/* Exploratory Warning Alert if active model is Exploratory */}
      {activeModel.label === 'Eksploratori' && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#fef08a',
          fontSize: '12.5px',
          lineHeight: 1.5
        }}>
          <strong>Peringatan Metodologis (Eksploratori):</strong> Karena model ini dihasilkan dari eksplorasi jamak ({models.length} spesifikasi diuji), nilai p-value dan interval keyakinan cenderung terlalu optimistis akibat forking path. Sangat disarankan mereplikasi temuan ini pada dataset sampel independen baru sebelum membuat kesimpulan final.
        </div>
      )}

      {/* Top Header & View Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onBackToConfig}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #475569)',
              background: 'transparent',
              color: 'var(--text-primary, #f8fafc)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            <ArrowLeft size={16} /> Ubah Konfigurasi
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                background: 'var(--accent-primary, #10b981)',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {modelType}
              </span>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                Hasil Analisis Regresi OLS Gaya SPSS — {activeModel.title}
              </h2>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', marginTop: '2px' }}>
              Dependen (Y): <strong>{variables.yCol}</strong> | Prediktor (X): <strong>{variables.xCols.join(', ')}</strong> | N = {sampleSize.nUsed}
            </div>
          </div>
        </div>

        {/* Badges & Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* S3 Score Badge */}
          <button
            type="button"
            onClick={() => setShowS3Modal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: scores.s3Consistency === 100 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${scores.s3Consistency === 100 ? '#10b981' : '#ef4444'}`,
              color: scores.s3Consistency === 100 ? '#34d399' : '#f87171',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Klik untuk melihat rincian 8 cek identitas matematika"
          >
            <CheckCircle2 size={14} /> Skor S3: {scores.s3Consistency}% ({scores.checksPassed}/{scores.totalChecks} Cek Lolos)
          </button>

          {/* S1 Benchmark Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500
          }}>
            <Info size={14} /> Tervalidasi NIST Norris (LRE 13-15) & R lm
          </div>

          {/* Mobile view toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-secondary, #0f172a)', padding: '2px', borderRadius: '6px' }}>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'table' ? 'var(--accent-primary, #10b981)' : 'transparent',
                color: viewMode === 'table' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
              }}
            >
              <TableIcon size={13} /> Tabel
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                fontSize: '12px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                background: viewMode === 'card' ? 'var(--accent-primary, #10b981)' : 'transparent',
                color: viewMode === 'card' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
              }}
            >
              <LayoutGrid size={13} /> Kartu
            </button>
          </div>
        </div>
      </div>

      {/* Spurious Regression Warning Alert (if flagged) */}
      {timeSeriesDiagnostics?.isSpuriousRisk && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '14px',
          marginBottom: '20px',
          color: '#fca5a5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#f87171' }}>
            <AlertTriangle size={18} /> Peringatan Risiko Regresi Lancung (Spurious Regression)
          </div>
          <div style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.5, color: '#fecaca' }}>
            Model memiliki koefisien determinasi tinggi (R² = {formatDec(modelSummary.rSquared)}), namun statistik Durbin-Watson sangat rendah (DW = {formatDec(modelSummary.durbinWatson)}) atau residual terindikasi non-stasioner. Hubungan yang tampak signifikan kemungkinan besar merupakan korelasi semu akibat tren bersama pada deret waktu.
          </div>
        </div>
      )}

      {/* Ringkasan Status 9 Asumsi Klasik (Pelaporan Hasil Apa Adanya) */}
      <div style={{
        background: 'var(--bg-card, #1e293b)',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #334155)',
        padding: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
              Status Diagnostik Asumsi Klasik Regresi (Hasil Apa Adanya)
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
              Model M0 selalu dipertahankan. Bila terdapat asumsi yang gagal, opsi perbaikan yang sah dapat dipilih secara transparan.
            </p>
          </div>

          {/* Button: Buka Drawer Opsi Remedial & Tools Optimasi R² */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {permittedRemedials.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveRemedialTab('assumptions');
                  setShowRemedialModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #f59e0b',
                  background: '#f59e0b',
                  color: '#000000',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Sliders size={14} /> Pilih Opsi Perbaikan Sah ({permittedRemedials.length} Opsi Tersedia)
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveRemedialTab('r2_optimization');
                setShowRemedialModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #10b981',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.35) 100%)',
                color: '#34d399',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <TrendingUpIcon size={14} /> Tools Optimasi R² (4 Metode Sah)
            </button>

            <button
              type="button"
              onClick={() => setShowSpssValidation(!showSpssValidation)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #3b82f6',
                background: showSpssValidation ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)',
                color: showSpssValidation ? '#ffffff' : '#60a5fa',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <ShieldCheck size={14} /> Mode Validasi SPSS ({spssValidationReport.concordancePercent}%)
            </button>

            {isTimeSeries && (
              <button
                type="button"
                onClick={() => setShowTimeSeriesDiagnostics(!showTimeSeriesDiagnostics)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #06b6d4',
                  background: showTimeSeriesDiagnostics ? '#06b6d4' : 'rgba(6, 182, 212, 0.15)',
                  color: showTimeSeriesDiagnostics ? '#ffffff' : '#22d3ee',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <TrendingUpIcon size={14} /> Diagnostik Time Series
              </button>
            )}
          </div>
        </div>

        {/* ========================================================
            MODE VALIDASI BENCHMARK IBM SPSS STATISTICS
           ======================================================== */}
        {showSpssValidation && (
          <div style={{
            background: 'var(--bg-secondary, #0f172a)',
            borderRadius: '8px',
            border: '1px solid #3b82f6',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={18} color="#60a5fa" />
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#93c5fd' }}>
                    Laporan Validasi Komparasi SPSS vs Mesin Aplikasi
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#cbd5e1' }}>
                  Membandingkan parameter numerik model aplikasi terhadap benchmark standar IBM SPSS Statistics dengan threshold toleransi 1e-4 dan Log Relative Error (LRE &ge; 4.0).
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', fontSize: '11.5px', color: '#bfdbfe' }}>
                  Kesesuaian: <strong>{spssValidationReport.concordancePercent}%</strong> ({spssValidationReport.items.filter(i => i.status !== 'DISCREPANCY').length}/{spssValidationReport.items.length} Metrik)
                </div>
                <div style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', fontSize: '11.5px', color: '#6ee7b7' }}>
                  Rata-rata LRE: <strong>{formatDec(spssValidationReport.averageLRE, 2)}</strong> Presisi Digit
                </div>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontWeight: 700,
                  fontSize: '11.5px',
                  background: spssValidationReport.overallStatus === 'PASS' ? '#059669' : '#d97706',
                  color: '#ffffff'
                }}>
                  {spssValidationReport.overallStatus}
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '12px' }}>
              <table style={spssTableStyle}>
                <caption style={spssCaptionStyle}>Comparison of Regression Outputs vs. IBM SPSS Statistics Benchmark</caption>
                <thead>
                  <tr>
                    <th style={{ ...spssThStyle, textAlign: 'left' }}>Metrik</th>
                    <th style={{ ...spssThStyle, textAlign: 'left' }}>Variabel</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Nilai SPSS</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Nilai Aplikasi</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Selisih Absolut</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>Selisih Relatif</th>
                    <th style={{ ...spssThStyle, textAlign: 'right' }}>LRE</th>
                    <th style={{ ...spssThStyle, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {spssValidationReport.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ ...spssTdStyle, fontWeight: 500 }}>{item.metric}</td>
                      <td style={{ ...spssTdStyle }}>{item.variable || '-'}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{typeof item.spssValue === 'number' ? formatDec(item.spssValue, 4) : item.spssValue}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{typeof item.appValue === 'number' ? formatDec(item.appValue, 4) : item.appValue}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{item.absDiff !== undefined ? item.absDiff.toExponential(2) : '-'}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{item.relDiff !== undefined ? `${(item.relDiff * 100).toFixed(4)}%` : '-'}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'right' }}>{item.lre !== undefined ? item.lre.toFixed(1) : '-'}</td>
                      <td style={{ ...spssTdStyle, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: item.status === 'EXACT_MATCH' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: item.status === 'EXACT_MATCH' ? '#34d399' : '#f87171'
                        }}>
                          {item.status === 'EXACT_MATCH' ? <Check size={12} /> : <X size={12} />}
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: 'var(--bg-card, #1e293b)', padding: '10px 14px', borderRadius: '6px', fontSize: '11.5px', color: '#94a3b8' }}>
              <p style={{ margin: '0 0 4px 0' }}>
                <strong>Keterangan Diagnostik:</strong> Nilai selisih absolut &le; 1e-4 diklasifikasikan sebagai <code style={{ color: '#34d399' }}>EXACT_MATCH</code>, membuktikan kesamaan numerik antara algoritma internal dengan solver QR/SVD IBM SPSS Statistics.
              </p>
              {spssValidationReport.diagnostics.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '16px', color: '#cbd5e1' }}>
                  {spssValidationReport.diagnostics.map((diag, dIdx) => (
                    <li key={dIdx}>{diag}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            DIAGNOSTIK TIME SERIES (ADF, KPSS, ARCH-LM, KOINTEGRASI)
           ======================================================== */}
        {(showTimeSeriesDiagnostics || isTimeSeries) && tsDiagnostics && (
          <div style={{
            background: 'var(--bg-secondary, #0f172a)',
            borderRadius: '8px',
            border: '1px solid #06b6d4',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <TrendingUpIcon size={18} />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#67e8f9' }}>
                Diagnostik Deret Waktu Lanjutan (Time Series Diagnostics)
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {/* 1. ADF Unit Root Test */}
              <div style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '6px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#f8fafc' }}>1. Augmented Dickey-Fuller (ADF)</span>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: tsDiagnostics.adf.isStationary ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: tsDiagnostics.adf.isStationary ? '#34d399' : '#f87171'
                  }}>
                    {tsDiagnostics.adf.isStationary ? 'STASIONER' : 'UNIT ROOT'}
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>
                  <div>Statistik ADF: <strong>{formatDec(tsDiagnostics.adf.statistic, 4)}</strong> (Lag: {tsDiagnostics.adf.lagsUsed})</div>
                  <div>Nilai Kritis 1%: {formatDec(tsDiagnostics.adf.criticalValues['1%'])} | 5%: {formatDec(tsDiagnostics.adf.criticalValues['5%'])} | 10%: {formatDec(tsDiagnostics.adf.criticalValues['10%'])}</div>
                  <div style={{ marginTop: '4px', color: '#cbd5e1' }}>{tsDiagnostics.adf.details}</div>
                </div>
              </div>

              {/* 2. KPSS Stationarity Test */}
              <div style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '6px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#f8fafc' }}>2. KPSS Stationarity Test</span>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: tsDiagnostics.kpss.isStationary ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: tsDiagnostics.kpss.isStationary ? '#34d399' : '#f87171'
                  }}>
                    {tsDiagnostics.kpss.isStationary ? 'STASIONER' : 'NON-STASIONER'}
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>
                  <div>Statistik LM (KPSS): <strong>{formatDec(tsDiagnostics.kpss.statistic, 4)}</strong> (Lag: {tsDiagnostics.kpss.lagsUsed})</div>
                  <div>Nilai Kritis 1%: {formatDec(tsDiagnostics.kpss.criticalValues['1%'])} | 5%: {formatDec(tsDiagnostics.kpss.criticalValues['5%'])} | 10%: {formatDec(tsDiagnostics.kpss.criticalValues['10%'])}</div>
                  <div style={{ marginTop: '4px', color: '#cbd5e1' }}>{tsDiagnostics.kpss.details}</div>
                </div>
              </div>

              {/* 3. Differencing Variance Reduction */}
              <div style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '6px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#f8fafc' }}>3. Reduksi Varians Differencing</span>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa'
                  }}>
                    {tsDiagnostics.diff.varianceReduction ? 'REDUKSI VARIANS BERHASIL' : 'VARIANS TIDAK TURUN'}
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>
                  <div>Observasi Series: <strong>{tsDiagnostics.diff.original.length}</strong></div>
                  <div>Observasi Diff 1: <strong>{tsDiagnostics.diff.firstDiff.length}</strong> | Diff 2: <strong>{tsDiagnostics.diff.secondDiff.length}</strong></div>
                  <div style={{ marginTop: '4px', color: '#cbd5e1' }}>
                    {tsDiagnostics.diff.varianceReduction ? 'Differencing berhasil menurunkan dispersi varians deret waktu.' : 'Peringatan: Differencing berulang berpotensi overdifferencing.'}
                  </div>
                </div>
              </div>

              {/* 4. Engle-Granger Cointegration & ARCH-LM */}
              <div style={{ background: 'var(--bg-card, #1e293b)', borderRadius: '6px', padding: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#f8fafc' }}>4. Kointegrasi & Efek ARCH-LM</span>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: tsDiagnostics.cointegration.isCointegrated ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: tsDiagnostics.cointegration.isCointegrated ? '#34d399' : '#fbbf24'
                  }}>
                    {tsDiagnostics.cointegration.isCointegrated ? 'TERKOINTEGRASI' : 'TIDAK KOINTEGRASI'}
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5 }}>
                  <div>Engle-Granger ADF: <strong>{formatDec(tsDiagnostics.cointegration.statistic, 4)}</strong> (p: {formatSig(tsDiagnostics.cointegration.pValue)})</div>
                  <div>ARCH-LM Stat: <strong>{formatDec(tsDiagnostics.arch.statistic, 3)}</strong> (df: {tsDiagnostics.arch.df}, p: {formatSig(tsDiagnostics.arch.pValue)})</div>
                  <div style={{ marginTop: '4px', color: '#cbd5e1' }}>
                    {tsDiagnostics.arch.hasARCHEffect ? '⚠️ Efek ARCH terdeteksi pada residual deret waktu.' : 'Bebas dari efek heteroskedastisitas bersyarat (ARCH).'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
          {assumptions.map((item, idx) => {
            const isPass = item.status === 'lulus';
            const isNA = item.status === 'tidak_berlaku';
            return (
              <div
                key={idx}
                style={{
                  background: 'var(--bg-secondary, #0f172a)',
                  border: `1px solid ${isNA ? '#475569' : (isPass ? '#059669' : '#b45309')}`,
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f8fafc)' }}>
                      {item.name}
                    </span>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: isNA ? 'rgba(148, 163, 184, 0.15)' : (isPass ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'),
                      color: isNA ? '#94a3b8' : (isPass ? '#34d399' : '#fbbf24')
                    }}>
                      {isNA ? <MinusCircle size={12} /> : (isPass ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />)}
                      {isNA ? 'TIDAK BERLAKU' : (isPass ? 'LULUS' : 'PELANGGARAN')}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '6px' }}>
                    Statistik: <strong>{formatDec(item.statistic)}</strong> {item.pValue !== undefined ? `| Sig: ${formatSig(item.pValue)}` : ''} | Kriteria: {item.criteria}
                  </div>

                  <div style={{ fontSize: '12px', color: isPass ? 'var(--text-primary, #e2e8f0)' : '#fef08a', lineHeight: 1.4 }}>
                    {item.reason}
                  </div>
                </div>

                {/* Tombol Aksi Perbaikan Terarah */}
                {!isPass && !isNA && (
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRemedialModal(true);
                        if (item.name.toLowerCase().includes('normalitas')) setSelectedRemedialType('transformation');
                        else if (item.name.toLowerCase().includes('homoskedastisitas')) setSelectedRemedialType('robust_hc3');
                        else if (item.name.toLowerCase().includes('outlier')) setSelectedRemedialType('outlier_removal');
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        borderRadius: '4px',
                        border: '1px solid #f59e0b',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#fbbf24',
                        cursor: 'pointer'
                      }}
                    >
                      Periksa Opsi Perbaikan untuk Uji Ini
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ========================================================
            UJI ASUMSI KLASIK LANJUTAN (SPSS COMPATIBILITY SUITE)
           ======================================================== */}
        {advancedAssumptions && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color, #334155)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Uji Asumsi Klasik Lanjutan (Robust & Spesifikasi Tambahan):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
              {/* Jarque-Bera */}
              <div style={{
                background: 'var(--bg-secondary, #0f172a)',
                border: `1px solid ${advancedAssumptions.jarqueBera.passed ? '#059669' : '#b45309'}`,
                borderRadius: '6px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f8fafc)' }}>Normalitas: Jarque-Bera</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: advancedAssumptions.jarqueBera.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: advancedAssumptions.jarqueBera.passed ? '#34d399' : '#fbbf24'
                  }}>
                    {advancedAssumptions.jarqueBera.passed ? 'NORMAL' : 'TIDAK NORMAL'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '4px' }}>
                  Statistik JB: <strong>{formatDec(advancedAssumptions.jarqueBera.statistic)}</strong> | Sig: <strong>{formatSig(advancedAssumptions.jarqueBera.pValue)}</strong>
                </div>
                <div style={{ fontSize: '12px', color: advancedAssumptions.jarqueBera.passed ? 'var(--text-primary, #e2e8f0)' : '#fef08a', lineHeight: 1.4 }}>
                  {advancedAssumptions.jarqueBera.details}
                </div>
              </div>

              {/* White Test */}
              <div style={{
                background: 'var(--bg-secondary, #0f172a)',
                border: `1px solid ${advancedAssumptions.whiteTest.passed ? '#059669' : '#b45309'}`,
                borderRadius: '6px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f8fafc)' }}>Heteroskedastisitas: White LM</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: advancedAssumptions.whiteTest.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: advancedAssumptions.whiteTest.passed ? '#34d399' : '#fbbf24'
                  }}>
                    {advancedAssumptions.whiteTest.passed ? 'HOMOSKEDASTIS' : 'HETEROSKEDASTIS'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '4px' }}>
                  LM Stat: <strong>{formatDec(advancedAssumptions.whiteTest.statistic)}</strong> (df: {advancedAssumptions.whiteTest.df}) | Sig: <strong>{formatSig(advancedAssumptions.whiteTest.pValue)}</strong>
                </div>
                <div style={{ fontSize: '12px', color: advancedAssumptions.whiteTest.passed ? 'var(--text-primary, #e2e8f0)' : '#fef08a', lineHeight: 1.4 }}>
                  {advancedAssumptions.whiteTest.details}
                </div>
              </div>

              {/* Glejser Test */}
              <div style={{
                background: 'var(--bg-secondary, #0f172a)',
                border: `1px solid ${advancedAssumptions.glejserTest.passed ? '#059669' : '#b45309'}`,
                borderRadius: '6px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f8fafc)' }}>Heteroskedastisitas: Glejser</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: advancedAssumptions.glejserTest.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: advancedAssumptions.glejserTest.passed ? '#34d399' : '#fbbf24'
                  }}>
                    {advancedAssumptions.glejserTest.passed ? 'HOMOSKEDASTIS' : 'HETEROSKEDASTIS'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '4px' }}>
                  Min p-value (|e| ~ X): <strong>{formatSig(advancedAssumptions.glejserTest.pValue)}</strong>
                </div>
                <div style={{ fontSize: '12px', color: advancedAssumptions.glejserTest.passed ? 'var(--text-primary, #e2e8f0)' : '#fef08a', lineHeight: 1.4 }}>
                  {advancedAssumptions.glejserTest.details}
                </div>
              </div>

              {/* Goldfeld-Quandt Test */}
              <div style={{
                background: 'var(--bg-secondary, #0f172a)',
                border: `1px solid ${advancedAssumptions.goldfeldQuandt.passed ? '#059669' : '#b45309'}`,
                borderRadius: '6px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f8fafc)' }}>Heteroskedastisitas: Goldfeld-Quandt</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: advancedAssumptions.goldfeldQuandt.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: advancedAssumptions.goldfeldQuandt.passed ? '#34d399' : '#fbbf24'
                  }}>
                    {advancedAssumptions.goldfeldQuandt.passed ? 'HOMOSKEDASTIS' : 'HETEROSKEDASTIS'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '4px' }}>
                  F Stat: <strong>{formatDec(advancedAssumptions.goldfeldQuandt.statistic)}</strong> (df: {advancedAssumptions.goldfeldQuandt.df1}, {advancedAssumptions.goldfeldQuandt.df2}) | Sig: <strong>{formatSig(advancedAssumptions.goldfeldQuandt.pValue)}</strong>
                </div>
                <div style={{ fontSize: '12px', color: advancedAssumptions.goldfeldQuandt.passed ? 'var(--text-primary, #e2e8f0)' : '#fef08a', lineHeight: 1.4 }}>
                  {advancedAssumptions.goldfeldQuandt.details}
                </div>
              </div>

              {/* Ljung-Box Test */}
              <div style={{
                background: 'var(--bg-secondary, #0f172a)',
                border: `1px solid ${advancedAssumptions.ljungBox.passed ? '#059669' : '#b45309'}`,
                borderRadius: '6px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary, #f8fafc)' }}>Autokorelasi: Ljung-Box Q</span>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: advancedAssumptions.ljungBox.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: advancedAssumptions.ljungBox.passed ? '#34d399' : '#fbbf24'
                  }}>
                    {advancedAssumptions.ljungBox.passed ? 'BEBAS AUTOKORELASI' : 'TERDETEKSI AUTOKORELASI'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '4px' }}>
                  Q Stat: <strong>{formatDec(advancedAssumptions.ljungBox.statistic)}</strong> (df: {advancedAssumptions.ljungBox.df}) | Sig: <strong>{formatSig(advancedAssumptions.ljungBox.pValue)}</strong>
                </div>
                <div style={{ fontSize: '12px', color: advancedAssumptions.ljungBox.passed ? 'var(--text-primary, #e2e8f0)' : '#fef08a', lineHeight: 1.4 }}>
                  {advancedAssumptions.ljungBox.details}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          TABEL OUTPUT RESMI STANDAR IBM SPSS STATISTICS
         ======================================================== */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Table A: Variables Entered/Removed */}
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
          <table style={spssTableStyle}>
            <caption style={spssCaptionStyle}>Variables Entered/Removed<sup>a</sup></caption>
            <thead>
              <tr>
                <th style={{ ...spssThStyle, textAlign: 'center' }}>Model</th>
                <th style={{ ...spssThStyle, textAlign: 'left' }}>Variables Entered</th>
                <th style={{ ...spssThStyle, textAlign: 'left' }}>Variables Removed</th>
                <th style={{ ...spssThStyle, textAlign: 'left' }}>Method</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...spssTdStyle, textAlign: 'center', fontWeight: 600 }}>{varsEnteredRemoved.model}</td>
                <td style={{ ...spssTdStyle, textAlign: 'left' }}>{varsEnteredRemoved.variablesEntered.join(', ')}<sup>b</sup></td>
                <td style={{ ...spssTdStyle, textAlign: 'left' }}>{varsEnteredRemoved.variablesRemoved.length > 0 ? varsEnteredRemoved.variablesRemoved.join(', ') : '.'}</td>
                <td style={{ ...spssTdStyle, textAlign: 'left' }}>{varsEnteredRemoved.method}</td>
              </tr>
            </tbody>
          </table>
          <div style={footnoteStyle}>
            <div>a. Dependent Variable: {variables.yCol}</div>
            <div>b. {varsEnteredRemoved.notes}</div>
          </div>
        </div>

        {/* Table 0: Descriptive Statistics */}
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
          <table style={spssTableStyle}>
            <caption style={spssCaptionStyle}>Descriptive Statistics</caption>
            <thead>
              <tr>
                <th style={{ ...spssThStyle, textAlign: 'left' }}>Variabel</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>N</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Mean</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Std. Deviation</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Minimum</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Maximum</th>
              </tr>
            </thead>
            <tbody>
              {descStats.map((ds, i) => (
                <tr key={i}>
                  <td style={{ ...spssTdStyle, fontWeight: 500 }}>{ds.variable}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{ds.n}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(ds.mean)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(ds.stdDev)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(ds.min)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(ds.max)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={footnoteStyle}>
            <div>a. Data terpakai menggunakan metode listwise deletion (N = {sampleSize.nUsed})</div>
          </div>
        </div>

        {/* Table 1: Model Summary */}
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
          <table style={spssTableStyle}>
            <caption style={spssCaptionStyle}>Model Summary<sup>b</sup></caption>
            <thead>
              <tr>
                <th style={{ ...spssThStyle, textAlign: 'center' }}>Model</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>R</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>R Square</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Adjusted R Square</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Std. Error of the Estimate</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Durbin-Watson</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...spssTdStyle, textAlign: 'center', fontWeight: 600 }}>{modelSummary.model}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatCorr(modelSummary.r)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatCorr(modelSummary.rSquared)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatCorr(modelSummary.adjRSquared)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(modelSummary.stdErrorEstimate)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(modelSummary.durbinWatson)}</td>
              </tr>
            </tbody>
          </table>
          <div style={footnoteStyle}>
            <div>a. Predictors: (Constant), {variables.xCols.join(', ')}</div>
            <div>b. Dependent Variable: {variables.yCol}</div>
          </div>
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '6px', fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic' }}>
            <strong>Interpretasi:</strong> {interpretation.modelSummary}
          </div>
        </div>

        {/* Table 2: ANOVA */}
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
          <table style={spssTableStyle}>
            <caption style={spssCaptionStyle}>ANOVA<sup>a</sup></caption>
            <thead>
              <tr>
                <th style={{ ...spssThStyle, textAlign: 'left' }}>Model</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Sum of Squares</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>df</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Mean Square</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>F</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Sig.</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...spssTdStyle, fontWeight: 500 }}>Regression</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(anova.regression.ss)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{anova.regression.df}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(anova.regression.ms)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{formatDec(anova.regression.f)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{formatSig(anova.regression.sig)}<sup>b</sup></td>
              </tr>
              <tr>
                <td style={{ ...spssTdStyle, fontWeight: 500 }}>Residual</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(anova.residual.ss)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{anova.residual.df}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(anova.residual.ms)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}></td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}></td>
              </tr>
              <tr style={{ borderTop: '1px solid var(--border-color, #475569)' }}>
                <td style={{ ...spssTdStyle, fontWeight: 600 }}>Total</td>
                <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{formatDec(anova.total.ss)}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{anova.total.df}</td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}></td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}></td>
                <td style={{ ...spssTdStyle, textAlign: 'right' }}></td>
              </tr>
            </tbody>
          </table>
          <div style={footnoteStyle}>
            <div>a. Dependent Variable: {variables.yCol}</div>
            <div>b. Predictors: (Constant), {variables.xCols.join(', ')}</div>
          </div>
          <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '6px', fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic' }}>
            <strong>Interpretasi:</strong> {interpretation.anova}
          </div>
        </div>

        {/* Table 3: Coefficients */}
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
          {/* Card Formula Persamaan Regresi Linear */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
            border: '1px solid #10b981',
            borderRadius: '8px',
            padding: '14px 18px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Persamaan Garis Regresi Linear ({modelType}):
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399', fontFamily: 'monospace', marginTop: '4px' }}>
                {interpretation.regressionEquation}
              </div>
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#f8fafc',
              background: 'rgba(16, 185, 129, 0.2)',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(16, 185, 129, 0.4)'
            }}>
              <CalculatorIcon size={14} color="#34d399" />
              <span>k = {variables.xCols.length} Prediktor</span>
            </div>
          </div>

          <table style={spssTableStyle}>
            <caption style={spssCaptionStyle}>Coefficients<sup>a</sup></caption>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...spssThStyle, textAlign: 'left', verticalAlign: 'bottom' }}>Model</th>
                <th colSpan={2} style={{ ...spssThStyle, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Unstandardized Coefficients</th>
                <th style={{ ...spssThStyle, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Standardized</th>
                <th rowSpan={2} style={{ ...spssThStyle, textAlign: 'right', verticalAlign: 'bottom' }}>t</th>
                <th rowSpan={2} style={{ ...spssThStyle, textAlign: 'right', verticalAlign: 'bottom' }}>Sig.</th>
                <th colSpan={2} style={{ ...spssThStyle, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>95.0% Confidence Interval for B</th>
                <th colSpan={2} style={{ ...spssThStyle, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Collinearity Statistics</th>
              </tr>
              <tr>
                <th style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>B</th>
                <th style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>Std. Error</th>
                <th style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>Beta</th>
                <th style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>Lower Bound</th>
                <th style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>Upper Bound</th>
                <th style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>Tolerance</th>
                <th style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>VIF</th>
              </tr>
            </thead>
            <tbody>
              {coefficients.map((row, i) => (
                <tr key={i}>
                  <td style={{ ...spssTdStyle, fontWeight: 500 }}>{row.variable}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.b)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.stdError)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{row.variable === '(Constant)' ? '' : formatCorr(row.beta)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.t)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right', fontWeight: 600 }}>{formatSig(row.sig)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.ciLower)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.ciUpper)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{row.variable === '(Constant)' ? '' : formatDec(row.collinearity.tolerance)}</td>
                  <td style={{ ...spssTdStyle, textAlign: 'right' }}>{row.variable === '(Constant)' ? '' : formatDec(row.collinearity.vif)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={footnoteStyle}>
            <div>a. Dependent Variable: {variables.yCol}</div>
          </div>
          <div style={{ marginTop: '12px', padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                Uji Parsial (Uji t) & Interpretasi Koefisien:
              </span>
            </div>
            <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.6' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Persamaan Garis Regresi:</strong> <code style={{ color: '#34d399', fontWeight: 700 }}>{interpretation.regressionEquation}</code>
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Hasil Uji Parsial (Uji t):</strong> {interpretation.tTestSummary}
              </p>
              <p style={{ margin: 0, fontStyle: 'italic', color: '#94a3b8', fontSize: '12px' }}>
                {interpretation.coefficients}
              </p>
            </div>
          </div>
        </div>

        {/* Table E: Residuals Statistics */}
        {residualsStatistics && residualsStatistics.length > 0 && (
          <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
            <table style={spssTableStyle}>
              <caption style={spssCaptionStyle}>Residuals Statistics<sup>a</sup></caption>
              <thead>
                <tr>
                  <th style={{ ...spssThStyle, textAlign: 'left' }}>Metric</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Minimum</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Maximum</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Mean</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>Std. Deviation</th>
                  <th style={{ ...spssThStyle, textAlign: 'right' }}>N</th>
                </tr>
              </thead>
              <tbody>
                {residualsStatistics.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ ...spssTdStyle, fontWeight: 500 }}>{row.metric}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.min)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.max)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.mean)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.stdDev)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{row.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={footnoteStyle}>
              <div>a. Dependent Variable: {variables.yCol}</div>
            </div>
          </div>
        )}

        {/* Table F: Collinearity Diagnostics */}
        {collinearityDiagnostics && collinearityDiagnostics.length > 0 && (
          <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
            <table style={spssTableStyle}>
              <caption style={spssCaptionStyle}>Collinearity Diagnostics<sup>a</sup></caption>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...spssThStyle, textAlign: 'center', verticalAlign: 'bottom' }}>Model</th>
                  <th rowSpan={2} style={{ ...spssThStyle, textAlign: 'center', verticalAlign: 'bottom' }}>Dimension</th>
                  <th rowSpan={2} style={{ ...spssThStyle, textAlign: 'right', verticalAlign: 'bottom' }}>Eigenvalue</th>
                  <th rowSpan={2} style={{ ...spssThStyle, textAlign: 'right', verticalAlign: 'bottom' }}>Condition Index</th>
                  <th colSpan={Object.keys(collinearityDiagnostics[0]?.varianceProportions || {}).length} style={{ ...spssThStyle, textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Variance Proportions</th>
                </tr>
                <tr>
                  {Object.keys(collinearityDiagnostics[0]?.varianceProportions || {}).map((colName, cIdx) => (
                    <th key={cIdx} style={{ ...spssThStyle, textAlign: 'right', fontSize: '11px' }}>{colName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collinearityDiagnostics.map((row, idx) => (
                  <tr key={idx}>
                    {idx === 0 && (
                      <td rowSpan={collinearityDiagnostics.length} style={{ ...spssTdStyle, textAlign: 'center', fontWeight: 600, verticalAlign: 'top' }}>
                        1
                      </td>
                    )}
                    <td style={{ ...spssTdStyle, textAlign: 'center' }}>{row.dimension}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.eigenvalue)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.conditionIndex)}</td>
                    {Object.values(row.varianceProportions).map((val, vpIdx) => (
                      <td key={vpIdx} style={{ ...spssTdStyle, textAlign: 'right' }}>{formatCorr(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={footnoteStyle}>
              <div>a. Dependent Variable: {variables.yCol}</div>
            </div>
          </div>
        )}

        {/* Table G: Casewise Diagnostics */}
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)', overflowX: 'auto' }}>
          <table style={spssTableStyle}>
            <caption style={spssCaptionStyle}>Casewise Diagnostics<sup>a</sup></caption>
            <thead>
              <tr>
                <th style={{ ...spssThStyle, textAlign: 'center' }}>Case Number</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Std. Residual</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>{variables.yCol}</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Predicted Value</th>
                <th style={{ ...spssThStyle, textAlign: 'right' }}>Residual</th>
              </tr>
            </thead>
            <tbody>
              {casewiseDiagnostics && casewiseDiagnostics.length > 0 ? (
                casewiseDiagnostics.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ ...spssTdStyle, textAlign: 'center' }}>{row.caseNumber}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right', color: Math.abs(row.stdResidual) > 3 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>{formatDec(row.stdResidual)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.yValue)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.predictedValue)}</td>
                    <td style={{ ...spssTdStyle, textAlign: 'right' }}>{formatDec(row.residual)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ ...spssTdStyle, textAlign: 'center', color: 'var(--text-secondary, #94a3b8)', fontStyle: 'italic', padding: '16px' }}>
                    Tidak ada observasi dengan residual terstandarisasi |Std. Residual| &ge; 3.0 (Bebas dari outlier residual ekstrem).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div style={footnoteStyle}>
            <div>a. Dependent Variable: {variables.yCol}</div>
          </div>
        </div>

        {/* Diagnostic Plots SVG */}
        <div style={{ background: 'var(--bg-card, #1e293b)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color, #334155)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #f8fafc)' }}>
            Grafik Diagnostik Residual Regresi
          </h3>
          <DiagnosticPlots plots={activeResult.plots} yCol={variables.yCol} isTimeSeries={isTimeSeries} />
        </div>
      </div>

      {/* ========================================================
          PERINGATAN METODOLOGIS KAUSALITAS & ESTIMATOR KOVARIANS
         ======================================================== */}
      <div style={{
        marginTop: '24px',
        padding: '16px 20px',
        background: 'var(--bg-card, #1e293b)',
        borderRadius: '8px',
        border: '1px solid var(--border-color, #334155)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} color="#60a5fa" />
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#93c5fd' }}>
            Pedoman Metodologis & Batasan Kausalitas Regresi (Kaidah Akademik Tahap 3)
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.6' }}>
          {interpretation.nonCausalAdvisory}
        </p>
        <div style={{
          padding: '8px 12px',
          background: 'var(--bg-secondary, #0f172a)',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#34d399',
          borderLeft: '3px solid #10b981'
        }}>
          {interpretation.covarianceEstimatorNote}
        </div>
      </div>

      {/* ========================================================
          DRAWER / MODAL REKOMENDASI STATISTIK ILMIAH (13 ITEMS)
         ======================================================== */}
      {showRecommendationsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 65,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card, #1e293b)',
            borderRadius: '10px',
            border: '1px solid #f59e0b',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={20} color="#fbbf24" />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fef08a' }}>
                    Sistem Rekomendasi Statistik (Rule-Based Engine)
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#cbd5e1' }}>
                  Evaluasi eksplisit terhadap seluruh diagnostik regresi, dampak model, dan solusi sah berdasarkan kaidah statistika.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  background: recommendationOutput.summary.overallHealth === 'EXCELLENT' ? '#059669' : (recommendationOutput.summary.overallHealth === 'GOOD' ? '#0284c7' : '#d97706'),
                  color: '#ffffff'
                }}>
                  Health Score: {recommendationOutput.summary.healthScore}% ({recommendationOutput.summary.overallHealth})
                </span>
                <button
                  type="button"
                  onClick={() => setShowRecommendationsModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Rekomendasi Cards Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {recommendationOutput.cards.map((card) => {
                const isPass = card.status === 'LULUS';
                const isWarning = card.status === 'WASPADA';
                const borderColor = isPass ? '#059669' : (isWarning ? '#d97706' : '#dc2626');

                return (
                  <div
                    key={card.id}
                    style={{
                      background: 'var(--bg-secondary, #0f172a)',
                      borderRadius: '8px',
                      border: `1px solid ${borderColor}`,
                      padding: '16px'
                    }}
                  >
                    {/* Header: Item 1-6 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            background: 'rgba(255,255,255,0.08)',
                            color: '#94a3b8',
                            textTransform: 'uppercase'
                          }}>
                            {card.category}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                            1. {card.testName}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>
                          2. Statistik: <strong>{formatDec(card.statistic)}</strong> ({card.statisticName}) | 3. Sig: <strong>{card.pValue !== undefined ? formatSig(card.pValue) : '-'}</strong> | 4. Alpha: <strong>{card.alpha}</strong> | 5. Keputusan H0: <strong>{card.h0Decision}</strong>
                        </div>
                      </div>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: isPass ? 'rgba(16, 185, 129, 0.2)' : (isWarning ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                        color: isPass ? '#34d399' : (isWarning ? '#fbbf24' : '#f87171')
                      }}>
                        6. STATUS: {card.status}
                      </span>
                    </div>

                    {/* Interpretation & Causes: Item 7-9 */}
                    <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5', marginBottom: '10px' }}>
                      <p style={{ margin: '0 0 6px 0' }}>
                        <strong>7. Interpretasi:</strong> {card.interpretation}
                      </p>
                      <p style={{ margin: '0 0 6px 0', color: '#94a3b8' }}>
                        <strong>8. Potensi Penyebab:</strong> {card.potentialCauses.join(' ')}
                      </p>
                      <p style={{ margin: 0, color: '#fef08a' }}>
                        <strong>9. Dampak Terhadap Model:</strong> {card.modelImpact}
                      </p>
                    </div>

                    {/* Primary & Alternative Recommendations: Item 10-11 */}
                    <div style={{
                      background: 'rgba(0,0,0,0.25)',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      marginBottom: '10px',
                      borderLeft: `3px solid ${borderColor}`
                    }}>
                      <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                        10. Rekomendasi Utama:
                      </div>
                      <div style={{ color: '#f8fafc', marginBottom: '8px' }}>
                        {card.primaryRecommendation}
                      </div>

                      {card.alternativeMethods.length > 0 && (
                        <div>
                          <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>
                            11. Alternatif Metode yang Sah:
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11.5px', color: '#cbd5e1' }}>
                            {card.alternativeMethods.map((alt) => (
                              <li key={alt.id} style={{ marginBottom: '2px' }}>
                                <strong>{alt.name}:</strong> {alt.description} ({alt.applicability})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Methodological Consequences: Item 12 */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '6px',
                      fontSize: '11px',
                      padding: '8px 10px',
                      background: 'var(--bg-card, #1e293b)',
                      borderRadius: '6px',
                      marginBottom: '10px'
                    }}>
                      <div style={{ color: card.methodologicalConsequences.coefficientsChange ? '#fbbf24' : '#94a3b8' }}>
                        Koefisien Berubah: <strong>{card.methodologicalConsequences.coefficientsChange ? 'Ya' : 'Tidak'}</strong>
                      </div>
                      <div style={{ color: card.methodologicalConsequences.standardErrorChange ? '#fbbf24' : '#94a3b8' }}>
                        SE Berubah: <strong>{card.methodologicalConsequences.standardErrorChange ? 'Ya' : 'Tidak'}</strong>
                      </div>
                      <div style={{ color: card.methodologicalConsequences.pValueChange ? '#fbbf24' : '#94a3b8' }}>
                        p-value Berubah: <strong>{card.methodologicalConsequences.pValueChange ? 'Ya' : 'Tidak'}</strong>
                      </div>
                      <div style={{ color: card.methodologicalConsequences.sampleSizeChange ? '#fbbf24' : '#94a3b8' }}>
                        Ukuran n Berubah: <strong>{card.methodologicalConsequences.sampleSizeChange ? 'Ya' : 'Tidak'}</strong>
                      </div>
                      <div style={{ color: card.methodologicalConsequences.interpretationChange ? '#fbbf24' : '#94a3b8' }}>
                        Interpretasi Berubah: <strong>{card.methodologicalConsequences.interpretationChange ? 'Ya' : 'Tidak'}</strong>
                      </div>
                    </div>

                    {/* Available Actions: Item 13 */}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      {card.availableActions.canApply && card.availableActions.remedialType && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowRecommendationsModal(false);
                            setShowRemedialModal(true);
                            setSelectedRemedialType(card.availableActions.remedialType || '');
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            border: '1px solid #10b981',
                            background: '#10b981',
                            color: '#ffffff',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          13. {card.availableActions.actionLabel}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowRecommendationsModal(false)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color, #475569)',
                          background: 'transparent',
                          color: '#94a3b8',
                          fontSize: '11.5px',
                          cursor: 'pointer'
                        }}
                      >
                        Lewati / Pertahankan M0
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          DRAWER / MODAL KOMPARASI MODEL MULTI-SPESIFIKASI (AIC/BIC)
         ======================================================== */}
      {showModelComparisonModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 65,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card, #1e293b)',
            borderRadius: '10px',
            border: '1px solid #8b5cf6',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUpIcon size={20} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#c4b5fd' }}>
                    Matriks Komparasi Model & Evaluasi Prediktif (AIC, BIC, RMSE)
                  </h3>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#cbd5e1' }}>
                  Membandingkan goodness of fit, trade-off kompleksitas (penalti k), dan kestabilan out-of-sample di antara seluruh model yang dieksplorasi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModelComparisonModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {/* Best Model Recommendations Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
                  🏆 Rekomendasi Model Inferensial Terbaik:
                </div>
                <div style={{ fontSize: '12.5px', color: '#ffffff', fontWeight: 600 }}>
                  {modelComparisonReport.bestInferentialModel.title} ({modelComparisonReport.bestInferentialModel.modelId})
                </div>
                <div style={{ fontSize: '11.5px', color: '#a7f3d0', marginTop: '4px' }}>
                  {modelComparisonReport.bestInferentialModel.justification}
                </div>
              </div>

              <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6', borderRadius: '6px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#60a5fa', marginBottom: '4px' }}>
                  🎯 Rekomendasi Model Prediktif Terbaik:
                </div>
                <div style={{ fontSize: '12.5px', color: '#ffffff', fontWeight: 600 }}>
                  {modelComparisonReport.bestPredictiveModel.title} ({modelComparisonReport.bestPredictiveModel.modelId})
                </div>
                <div style={{ fontSize: '11.5px', color: '#bfdbfe', marginTop: '4px' }}>
                  {modelComparisonReport.bestPredictiveModel.justification}
                </div>
              </div>
            </div>

            {/* Comparison Matrix Table */}
            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table style={spssTableStyle}>
                <caption style={spssCaptionStyle}>Multi-Model Evaluation Matrix</caption>
                <thead>
                  <tr>
                    <th style={{ ...spssThStyle, textAlign: 'left' }}>Indikator Ekonometrika</th>
                    {modelComparisonReport.models.map((m) => (
                      <th key={m.modelId} style={{ ...spssThStyle, textAlign: 'right' }}>
                        {m.title} ({m.modelId})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modelComparisonReport.comparisonMatrix.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ ...spssTdStyle, fontWeight: 500 }}>{row.indicator}</td>
                      {modelComparisonReport.models.map((m) => {
                        const isBest = row.bestModelId === m.modelId;
                        return (
                          <td
                            key={m.modelId}
                            style={{
                              ...spssTdStyle,
                              textAlign: 'right',
                              fontWeight: isBest ? 700 : 400,
                              color: isBest ? '#34d399' : 'inherit'
                            }}
                          >
                            {row.values[m.modelId] ?? '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Out-of-sample Cross-Validation (Predictive) */}
            {modelComparisonReport.predictiveValidation && (
              <div style={{
                background: 'var(--bg-secondary, #0f172a)',
                borderRadius: '6px',
                padding: '14px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                    Evaluasi Out-of-Sample ({modelComparisonReport.predictiveValidation.splitType === 'time_series_rolling_origin' ? 'Rolling-Origin Time Series (No Leakage)' : 'Train-Test 70/30'})
                  </span>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: modelComparisonReport.predictiveValidation.isOverfittingRisk ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: modelComparisonReport.predictiveValidation.isOverfittingRisk ? '#f87171' : '#34d399'
                  }}>
                    {modelComparisonReport.predictiveValidation.isOverfittingRisk ? 'RISIKO OVERFITTING' : 'GENERALISASI STABIL'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                  <div>Sampel Train: <strong>{modelComparisonReport.predictiveValidation.trainSampleSize}</strong></div>
                  <div>Sampel Test: <strong>{modelComparisonReport.predictiveValidation.testSampleSize}</strong></div>
                  <div>Train RMSE: <strong>{formatDec(modelComparisonReport.predictiveValidation.trainRmse)}</strong></div>
                  <div>Test RMSE: <strong>{formatDec(modelComparisonReport.predictiveValidation.testRmse)}</strong></div>
                  <div>Overfitting Gap: <strong>{formatDec(modelComparisonReport.predictiveValidation.overfittingGap)}</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          DRAWER / MODAL REMEDIAL PERBAIKAN ASUMSI YANG SAH
         ======================================================== */}
      {showRemedialModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 60,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card, #1e293b)',
            borderRadius: '10px',
            border: '1px solid var(--border-color, #334155)',
            maxWidth: '750px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                  {activeRemedialTab === 'assumptions'
                    ? 'Pilihan Perbaikan Asumsi yang Sah (Remedial Statistik)'
                    : 'Tools & Metode Optimasi Koefisien Determinasi (R²)'}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                  {activeRemedialTab === 'assumptions'
                    ? 'Perbaikan dipicu murni oleh hasil diagnostik asumsi (Invarian I10). Model M0 selalu dipertahankan.'
                    : 'Metode statistik berkaidah ilmiah (Skill Remedial Bagian 5) untuk meningkatkan varians terjelaskan secara objektif.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRemedialModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            {/* Tab Navigation: Perbaikan Asumsi vs Optimasi R² */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color, #334155)', paddingBottom: '12px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setActiveRemedialTab('assumptions')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeRemedialTab === 'assumptions' ? 'var(--accent-primary, #10b981)' : 'var(--bg-secondary, #0f172a)',
                  color: activeRemedialTab === 'assumptions' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
                }}
              >
                <Sliders size={14} /> Perbaikan Asumsi ({permittedRemedials.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveRemedialTab('r2_optimization')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: activeRemedialTab === 'r2_optimization' ? 'var(--accent-primary, #10b981)' : 'var(--bg-secondary, #0f172a)',
                  color: activeRemedialTab === 'r2_optimization' ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
                }}
              >
                <TrendingUpIcon size={14} /> 📈 Optimasi R² (4 Metode Sah)
              </button>
            </div>

            {/* TAB 1: PERBAIKAN ASUMSI KLASIK */}
            {activeRemedialTab === 'assumptions' && (
              <>
                {permittedRemedials.length === 0 ? (
                  <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: 'var(--bg-secondary, #0f172a)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color, #334155)',
                    marginBottom: '20px'
                  }}>
                    <CheckCircle2 size={32} color="#34d399" style={{ margin: '0 auto 12px auto' }} />
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>
                      Seluruh Asumsi Klasik Telah Terpenuhi
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '480px', margin: '0 auto 16px auto', lineHeight: '1.5' }}>
                      Hasil diagnostik tidak menemukan pelanggaran asumsi yang memerlukan tindakan remedial otomatis. Jika Anda ingin mengevaluasi peningkatan varians model secara objektif, gunakan tab Optimasi R².
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveRemedialTab('r2_optimization')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: '1px solid #10b981',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Buka Tools Optimasi R² →
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Selector Remedial Type */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                      {permittedRemedials.map((opt) => (
                        <div
                          key={opt.type}
                          onClick={() => setSelectedRemedialType(opt.type)}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: selectedRemedialType === opt.type ? '2px solid #10b981' : '1px solid var(--border-color, #334155)',
                            background: selectedRemedialType === opt.type ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary, #0f172a)',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ fontSize: '13.5px', color: '#ffffff' }}>{opt.title}</strong>
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: opt.statusLabel === 'Konfirmatori' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: opt.statusLabel === 'Konfirmatori' ? '#34d399' : '#fbbf24',
                              fontWeight: 700
                            }}>
                              {opt.statusLabel}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>{opt.description}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontStyle: 'italic' }}>
                            Catatan: {opt.notes}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Detail Configuration Panel */}
                    {selectedRemedialType === 'outlier_removal' && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>
                          Konfirmasi Baris Outlier (Maksimal {maxAllowedOutliers} baris / 5% dari N):
                        </h4>
                        {eligibleOutliers.length === 0 ? (
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Tidak ada kasus outlier ekstrem (|t| &gt; 3 atau Cook D &gt; 4/n) terdeteksi.</div>
                        ) : (
                          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                            {eligibleOutliers.map((o) => {
                              const isChecked = selectedOutlierIndices.includes(o.index);
                              return (
                                <label
                                  key={o.index}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '6px',
                                    fontSize: '12px',
                                    color: '#f8fafc',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        if (selectedOutlierIndices.length >= maxAllowedOutliers) {
                                          alert(`Batas maksimal 5% tercapai (${maxAllowedOutliers} baris).`);
                                          return;
                                        }
                                        setSelectedOutlierIndices([...selectedOutlierIndices, o.index]);
                                      } else {
                                        setSelectedOutlierIndices(selectedOutlierIndices.filter((idx) => idx !== o.index));
                                      }
                                    }}
                                  />
                                  <span>
                                    Baris #{o.rowNumber}: Y={o.yActual}, Pred={formatDec(o.yPred)}, |t_stud|={formatDec(o.studentizedResidual)}, Cook&apos;s D={formatDec(o.cooksD)}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyOutlierRemoval}
                            disabled={selectedOutlierIndices.length === 0}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#10b981',
                              color: '#ffffff',
                              fontWeight: 700,
                              cursor: selectedOutlierIndices.length === 0 ? 'not-allowed' : 'pointer',
                              opacity: selectedOutlierIndices.length === 0 ? 0.6 : 1
                            }}
                          >
                            Terapkan Penghapusan ({selectedOutlierIndices.length} Baris Terpilih)
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRemedialType === 'transformation' && boxCoxProfile && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>Pilihan Transformasi Skala:</h4>
                        <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '10px' }}>
                          Estimasi Box-Cox Likelihood: λ optimal = <strong>{boxCoxProfile.optimalLambda.toFixed(2)}</strong> (CI 95%: [{boxCoxProfile.ciLower.toFixed(2)}, {boxCoxProfile.ciUpper.toFixed(2)}]).
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => { setSelectedTransformType('box_cox'); setBoxCoxLambda(boxCoxProfile.optimalLambda); }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: selectedTransformType === 'box_cox' ? '2px solid #10b981' : '1px solid #475569',
                              background: 'transparent',
                              color: '#ffffff',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Box-Cox Optimal (λ={boxCoxProfile.optimalLambda.toFixed(2)})
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTransformType('ln')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: selectedTransformType === 'ln' ? '2px solid #10b981' : '1px solid #475569',
                              background: 'transparent',
                              color: '#ffffff',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Log Alami ln(Y)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTransformType('sqrt')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: selectedTransformType === 'sqrt' ? '2px solid #10b981' : '1px solid #475569',
                              background: 'transparent',
                              color: '#ffffff',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            Akar Kuadrat √Y
                          </button>
                        </div>
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyTransformation}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Terapkan Transformasi
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRemedialType === 'robust_hc3' && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>Koreksi Galat Baku Robust HC3:</h4>
                        <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          Metode HC3 mengoreksi kovarians galat baku terhadap heteroskedastisitas menggunakan pembobotan 1/(1-h_ii)². Koefisien B tidak berubah, namun nilai t dan Sig. disesuaikan secara inferensial.
                        </p>
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyHC3}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Terapkan Estimasi Galat Baku HC3
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRemedialType === 'wls' && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>Weighted Least Squares (WLS — Pembobotan Ragam):</h4>
                        <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          Mengestimasi fungsi ragam melalui regresi bantu ln(e²) terhadap prediktor, lalu membobot observasi dengan 1/σ̂_i untuk memulihkan homoskedastisitas dan efisiensi BLUE.
                        </p>
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyWLS}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Terapkan Regresi WLS
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRemedialType === 'orthog' && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>Ortogonalisasi Gram-Schmidt (orthog — VIF = 1.000):</h4>
                        <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          Mentransformasi matriks prediktor X yang mengalami multikolinearitas menjadi basis ortogonal saling bebas sehingga seluruh prediktor memiliki VIF = 1.000 dan Tolerance = 1.000 tanpa membuang variabel.
                        </p>
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyOrthog}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Terapkan Transformasi orthog (VIF = 1.00)
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRemedialType === 'hac_newey_west' && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>Koreksi Galat Baku HAC Newey-West (Time Series):</h4>
                        <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          Menggunakan kernel Bartlett dengan lag otomatis L = floor(4*(n/100)^(2/9)) untuk mengoreksi galat baku terhadap autokorelasi serial dan heteroskedastisitas secara simultan.
                        </p>
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyHACNeweyWest}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Terapkan Galat Baku HAC Newey-West
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRemedialType === 'cochrane_orcutt' && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>Transformasi Cochrane-Orcutt / Prais-Winsten AR(1) (GLSAR):</h4>
                        <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          Mengestimasi koefisien autokorelasi orde-1 (ρ) dari residual OLS lalu menerapkan kuasi-diferensiasi Y_t - ρY_{'{t-1}'} untuk menyembuhkan autokorelasi Durbin-Watson &amp; Breusch-Godfrey.
                        </p>
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyCochraneOrcutt}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Terapkan Transformasi Cochrane-Orcutt AR(1)
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRemedialType === 'first_difference' && (
                      <div style={{ padding: '14px', background: 'var(--bg-secondary, #0f172a)', borderRadius: '8px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#ffffff' }}>Transformasi First-Difference (ΔY_t, ΔX_t):</h4>
                        <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                          Menurunkan deret waktu non-stasioner I(1) menjadi selisih pertama (ΔY_t = Y_t - Y_{'{t-1}'}) agar stasioner pada derajat I(0) dan bebas dari jebakan Regresi Lancung (Spurious Regression R² &gt; DW).
                        </p>
                        <div style={{ marginTop: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyFirstDifference}
                            style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Terapkan Transformasi First-Difference (ΔY, ΔX)
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* TAB 2: OPTIMASI KOEFISIEN DETERMINASI (R²) & REMEDIAL MENYELURUH SESUAI KAIDAH STATISTIKA */}
            {activeRemedialTab === 'r2_optimization' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                {/* Educational Banner + 1-Click Auto-Optimize Best Valid Specification */}
                <div style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  padding: '14px 16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 700, fontSize: '13px' }}>
                      <ShieldCheck size={16} /> Status Baseline Model Saat Ini:
                    </div>
                    <button
                      type="button"
                      onClick={handleAutoOptimizeBestSpecification}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#10b981',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      ⚡ Auto-Scan &amp; Terapkan Spesifikasi Terbaik (Optimasi R² &amp; Asumsi)
                    </button>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: '1.6' }}>
                    R² = <strong>{formatDec(modelSummary.rSquared)}</strong> ({((modelSummary.rSquared || 0) * 100).toFixed(1)}%) | Adjusted R² = <strong>{formatDec(modelSummary.adjRSquared)}</strong> | F = <strong>{formatDec(anova.regression.f)}</strong> (Sig. {formatSig(anova.regression.sig)})
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '6px', fontStyle: 'italic' }}>
                    <strong>Prinsip Kejujuran Ilmiah (Skill Remedial Bagian 5):</strong> Setiap perbaikan asumsi atau optimasi R² di bawah ini mematuhi kaidah ekonometrika/statistika. Model awal M0 tetap dipertahankan permanen sebagai pembanding.
                  </div>
                </div>

                {/* METODE CEPAT: DOUBLE-LOG, ORTHOG, WLS & TIME SERIES REMEDIAL */}
                <div style={{
                  background: 'var(--bg-secondary, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '8px',
                  padding: '14px'
                }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                    Aksi Cepat Perbaikan Pelanggaran Asumsi &amp; Transformasi Fungsional (1-Klik)
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px', lineHeight: '1.4' }}>
                    Pilih perbaikan yang sesuai dengan kondisi data Anda (Normalitas, Multikolinearitas, Heteroskedastisitas, Autokorelasi Time Series, atau peningkatan R² melalui elastisitas Double-Log):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={handleApplyDoubleLog}
                      style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Transformasi Double-Log (ln Y &amp; ln X)
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyOrthog}
                      style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #38bdf8', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Orthog Bebas Multikolinearitas (VIF = 1.00)
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyWLS}
                      style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #a78bfa', background: 'rgba(167, 139, 250, 0.12)', color: '#c4b5fd', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Weighted Least Squares (WLS — Atasi Hetero)
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCochraneOrcutt}
                      style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Cochrane-Orcutt AR(1) (Atasi Autokorelasi DW)
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyFirstDifference}
                      style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      First-Difference ΔY, ΔX (Atasi Non-Stasioner / Spurious)
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyHACNeweyWest}
                      style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #94a3b8', background: 'rgba(148, 163, 184, 0.12)', color: '#e2e8f0', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Galat Baku HAC Newey-West
                    </button>
                  </div>
                </div>

                {/* METODE 1: ELIMINASI OUTLIER EKSTREM BERPENGARUH */}
                <div style={{
                  background: 'var(--bg-secondary, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '8px',
                  padding: '14px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                        1. Eliminasi Outlier Ekstrem Berpengaruh (|t_stud| &gt; 3 atau Cook&apos;s D &gt; 4/n)
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', lineHeight: '1.4' }}>
                        Poin data yang menyimpang drastis dari garis regresi dapat mendistorsi kemiringan OLS dan menurunkan R² secara tajam.
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                      Maks. 5% Data ({maxAllowedOutliers} Baris)
                    </span>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    {eligibleOutliers.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                        ✓ Tidak ada outlier ekstrem leverage yang menekan model saat ini.
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '8px' }}>
                          Terdeteksi <strong>{eligibleOutliers.length}</strong> baris outlier yang memenuhi syarat eliminasi statistik:
                        </div>
                        <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '6px' }}>
                          {eligibleOutliers.map((o) => {
                            const isChecked = selectedOutlierIndices.includes(o.index);
                            return (
                              <label
                                key={o.index}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '4px 6px',
                                  fontSize: '11.5px',
                                  color: '#f8fafc',
                                  cursor: 'pointer'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      if (selectedOutlierIndices.length >= maxAllowedOutliers) {
                                        alert(`Batas maksimal 5% tercapai (${maxAllowedOutliers} baris).`);
                                        return;
                                      }
                                      setSelectedOutlierIndices([...selectedOutlierIndices, o.index]);
                                    } else {
                                      setSelectedOutlierIndices(selectedOutlierIndices.filter((idx) => idx !== o.index));
                                    }
                                  }}
                                />
                                <span>
                                  Baris #{o.rowNumber}: Y={o.yActual}, Pred={formatDec(o.yPred)}, |t_stud|={formatDec(o.studentizedResidual)}, Cook&apos;s D={formatDec(o.cooksD)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div style={{ marginTop: '10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={handleApplyOutlierRemoval}
                            disabled={selectedOutlierIndices.length === 0}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#10b981',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: selectedOutlierIndices.length === 0 ? 'not-allowed' : 'pointer',
                              opacity: selectedOutlierIndices.length === 0 ? 0.6 : 1
                            }}
                          >
                            Eliminasi {selectedOutlierIndices.length} Baris &amp; Hitung Ulang R²
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* METODE 2: TRANSFORMASI SKALA VARIABEL Y */}
                <div style={{
                  background: 'var(--bg-secondary, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '8px',
                  padding: '14px'
                }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                    2. Transformasi Skala Variabel (Melinearkan Relasi Non-Linear)
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', lineHeight: '1.4' }}>
                    Jika respon {variables.yCol} memiliki heterogenitas varians atau relasi eksponensial/pangkat dengan prediktor, transformasi skala memulihkan kelinearan garis regresi.
                  </div>

                  {boxCoxProfile && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '8px' }}>
                        Estimasi Box-Cox Likelihood: λ optimal = <strong>{boxCoxProfile.optimalLambda.toFixed(2)}</strong> (CI 95%: [{boxCoxProfile.ciLower.toFixed(2)}, {boxCoxProfile.ciUpper.toFixed(2)}]).
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        <button
                          type="button"
                          onClick={() => { setSelectedTransformType('box_cox'); setBoxCoxLambda(boxCoxProfile.optimalLambda); }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: selectedTransformType === 'box_cox' ? '2px solid #10b981' : '1px solid #475569',
                            background: selectedTransformType === 'box_cox' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                            color: '#ffffff',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Box-Cox Optimal (λ={boxCoxProfile.optimalLambda.toFixed(2)})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTransformType('ln')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: selectedTransformType === 'ln' ? '2px solid #10b981' : '1px solid #475569',
                            background: selectedTransformType === 'ln' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                            color: '#ffffff',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Log Alami ln(Y)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTransformType('sqrt')}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: selectedTransformType === 'sqrt' ? '2px solid #10b981' : '1px solid #475569',
                            background: selectedTransformType === 'sqrt' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                            color: '#ffffff',
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          Akar Kuadrat √Y
                        </button>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={handleApplyTransformation}
                          style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Terapkan Transformasi Skala ({selectedTransformType.toUpperCase()})
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* METODE 3: PENAMBAHAN SUKU POLINOMIAL KUADRATIK */}
                <div style={{
                  background: 'var(--bg-secondary, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '8px',
                  padding: '14px'
                }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                    3. Penambahan Suku Polinomial Kuadratik (X² Terpusat)
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', lineHeight: '1.4' }}>
                    Menangkap pola lengkungan U-shaped atau kurva batas yang tidak terdeteksi oleh OLS linear murni. Variabel dipusatkan (mean-centered) untuk mencegah multikolinearitas struktural.
                  </div>

                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {variables.xCols.map((col) => {
                      const isAlreadySquared = variables.xCols.includes(`${col}_Kuadrat`);
                      if (isAlreadySquared || col.endsWith('_Kuadrat')) return null;
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => handleApplyPolynomial(col)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #10b981',
                            background: 'rgba(16, 185, 129, 0.1)',
                            color: '#34d399',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <PlusIcon size={13} /> Tambahkan Suku Kuadratik: {col}² Terpusat
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* METODE 4: PENAMBAHAN PREDIKTOR DARI DATASET */}
                <div style={{
                  background: 'var(--bg-secondary, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '8px',
                  padding: '14px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                        4. Penambahan Prediktor Tambahan dari Dataset (Omitted Variable Bias)
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', lineHeight: '1.4' }}>
                        Rendahnya R² sering kali disebabkan variabel penting belum dimasukkan ke model. Berikut kolom dataset yang belum terpilih, diurutkan berdasarkan korelasi Pearson dengan {variables.yCol}:
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700 }}>
                      {candidatePredictors.length} Kolom Tersedia
                    </span>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    {candidatePredictors.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                        Seluruh kolom numerik dalam dataset sudah dimasukkan ke dalam model.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                        {candidatePredictors.map((cand) => (
                          <div
                            key={cand.col}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.06)'
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{cand.col}</strong>
                              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                                Korelasi r = <span style={{ color: cand.correlation >= 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>{cand.correlation}</span> | Potensi r² bivariat = <strong>{(cand.r2Contribution * 100).toFixed(1)}%</strong> | N = {cand.nValid}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddPredictor(cand.col)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#10b981',
                                color: '#ffffff',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              <PlusIcon size={13} /> Tambahkan ke Model
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowRemedialModal(false)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #475569', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* S3 Consistency Modal */}
      {showS3Modal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 50,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card, #1e293b)',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #334155)',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #f8fafc)' }}>
                Skor Konsistensi Internal S3 ({scores.s3Consistency}%)
              </h3>
              <button
                type="button"
                onClick={() => setShowS3Modal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary, #94a3b8)', fontSize: '18px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', marginBottom: '16px' }}>
              Mesin regresi mengevaluasi 8 identitas aljabar linear independen untuk membuktikan kebenaran matematis model secara objektif.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scores.checks.map((c, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary, #0f172a)',
                    border: `1px solid ${c.passed ? '#059669' : '#dc2626'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', color: c.passed ? '#34d399' : '#f87171' }}>
                    {c.passed ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    {c.description}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginTop: '4px' }}>
                    {c.detail} (Batas toleransi: {c.threshold})
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowS3Modal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent-primary, #10b981)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Normal CDF approximation for HC3 p-value
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);

  const t = 1.0 / (1.0 + p * absX);
  const erf = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * erf);
}
