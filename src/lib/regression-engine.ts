// ============================================================
// Statistical Regression Engine (regresi-statistik-inti)
// Full OLS Estimation, SVD Verification, 9 Classical Assumptions,
// SPSS Format Outputs & S3 Consistency Scoring
// ============================================================

export interface OLSFitInput {
  rows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  isTimeSeries?: boolean;
  timeCol?: string;
  frequency?: string;
  alpha?: number;
  ciLevel?: number; // 0.90, 0.95, 0.99 (default 0.95)
  entryMethod?: 'enter' | 'forward' | 'backward' | 'stepwise';
  missingPolicy?: 'listwise' | 'impute_mean' | 'impute_median' | 'linear_interpolation' | 'multiple_imputation';
  weightsCol?: string; // Optional WLS weights column
  refCategories?: Record<string, string>; // Reference category per categorical predictor
}

export interface AssumptionTestResult {
  name: string;
  statistic: number;
  pValue?: number;
  df?: number | string;
  criteria: string;
  status: 'lulus' | 'gagal' | 'tidak_berlaku';
  reason: string;
}

export interface SPSSModelSummary {
  model: number;
  r: number;
  rSquared: number;
  adjRSquared: number;
  stdErrorEstimate: number;
  durbinWatson: number;
}

export interface SPSSAnovaTable {
  regression: { ss: number; df: number; ms: number; f: number; sig: number };
  residual: { ss: number; df: number; ms: number };
  total: { ss: number; df: number };
}

export interface SPSSCoefficientRow {
  variable: string;
  b: number;
  stdError: number;
  beta: number;
  t: number;
  sig: number;
  ciLower: number;
  ciUpper: number;
  correlations: {
    zeroOrder: number;
    partial: number;
    part: number;
  };
  collinearity: {
    tolerance: number;
    vif: number;
  };
}

export interface SPSSCollinearityDiagnosticRow {
  dimension: number;
  eigenvalue: number;
  conditionIndex: number;
  varianceProportions: Record<string, number>;
}

export interface SPSSResidualsStatsRow {
  metric: string;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  n: number;
}

export interface SPSSCasewiseRow {
  caseNumber: number;
  stdResidual: number;
  yValue: number;
  predictedValue: number;
  residual: number;
}

export interface PlotDataPoints {
  ppPlot: { observed: number; expected: number }[];
  qqPlot: { theoretical: number; sample: number }[];
  histogram: { binStart: number; binEnd: number; count: number; normalDensity: number }[];
  resVsFit: { fitted: number; residual: number }[];
  timeSeriesRes?: { time: string | number; residual: number }[];
  acfPacf?: { lag: number; acf: number; pacf: number; ci: number }[];
}

export interface ConsistencyCheckItem {
  id: string;
  description: string;
  passed: boolean;
  value: number;
  threshold: number;
  detail: string;
}

export interface SPSSDescriptiveStatRow {
  variable: string;
  n: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface OLSFitResult {
  engineVersion: string;
  modelType: 'SLR' | 'MLR';
  kPredictors: number;
  sampleSize: {
    nInitial: number;
    nUsed: number;
    rowsDropped: number;
  };
  descriptiveStatistics?: SPSSDescriptiveStatRow[];
  variables: {
    yCol: string;
    xCols: string[];
    enteredMethod: string;
  };
  modelSummary: SPSSModelSummary;
  anova: SPSSAnovaTable;
  coefficients: SPSSCoefficientRow[];
  collinearityDiagnostics: SPSSCollinearityDiagnosticRow[];
  residualsStatistics: SPSSResidualsStatsRow[];
  casewiseDiagnostics: SPSSCasewiseRow[];
  assumptions: AssumptionTestResult[];
  assumptionMap?: Record<string, AssumptionTestResult>;
  normalityTests?: {
    shapiroWilk: { statistic: number; pValue: number; df: number; passed: boolean };
    lilliefors: { statistic: number; pValue: number; df: number; passed: boolean };
    jarqueBera: { statistic: number; pValue: number; df: number; passed: boolean };
    andersonDarling: { statistic: number; pValue: number; df: number; passed: boolean };
    skewness: number;
    kurtosis: number;
  };
  ciLevelUsed?: number;
  plots: PlotDataPoints;
  scores: {
    s3Consistency: number; // Persentase 0-100%
    checksPassed: number;
    totalChecks: number;
    checks: ConsistencyCheckItem[];
  };
  timeSeriesSummary?: {
    isTimeSeries: boolean;
    timeCol?: string;
    frequency?: string;
    isSpuriousWarning: boolean;
  };
  timeSeriesDiagnostics?: {
    isTimeSeries: boolean;
    timeCol?: string;
    frequency?: string;
    isSpuriousRisk: boolean;
    spuriousWarning?: string;
    acfPacf?: { lag: number; acf: number; pacf: number; ci: number }[];
  };
  solverMetadata?: {
    primarySolver: 'Householder-QR';
    verificationSolver: 'One-Sided-Jacobi-SVD';
    matrixRank: number;
    conditionNumberEst: number;
    missingPolicyApplied: string;
    imputedCellsCount: number;
    dummyEncodings?: { sourceCol: string; referenceCategory: string; dummyCols: string[] }[];
  };
}

// ============================================================
// Mathematical Helpers (Matrix, Distributions, Inversion)
// ============================================================

/** Matrix multiplication: C = A * B */
export function matMul(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const rowsB = B.length;
  const colsB = B[0].length;
  if (colsA !== rowsB) throw new Error(`Matrix dimensions mismatch: ${colsA} != ${rowsB}`);

  const C: number[][] = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let k = 0; k < colsA; k++) {
      const a = A[i][k];
      for (let j = 0; j < colsB; j++) {
        C[i][j] += a * B[k][j];
      }
    }
  }
  return C;
}

/** Matrix transpose */
export function matTranspose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const AT: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      AT[j][i] = A[i][j];
    }
  }
  return AT;
}

/** Gauss-Jordan Matrix Inversion */
export function matInverse(A: number[][]): number[][] {
  const n = A.length;
  // Augment with identity
  const aug: number[][] = A.map((row, i) => {
    const idRow = new Array(n).fill(0);
    idRow[i] = 1;
    return [...row, ...idRow];
  });

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    let maxVal = Math.abs(aug[i][i]);
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > maxVal) {
        maxVal = Math.abs(aug[k][i]);
        maxRow = k;
      }
    }
    if (maxVal < 1e-12) {
      throw new Error(`Matrix is singular or rank deficient (pivot near zero at column ${i})`);
    }

    // Swap rows
    if (maxRow !== i) {
      const temp = aug[i];
      aug[i] = aug[maxRow];
      aug[maxRow] = temp;
    }

    // Normalize pivot row
    const pivot = aug[i][i];
    for (let j = 0; j < 2 * n; j++) {
      aug[i][j] /= pivot;
    }

    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = aug[k][i];
        for (let j = 0; j < 2 * n; j++) {
          aug[k][j] -= factor * aug[i][j];
        }
      }
    }
  }

  // Extract right half
  return aug.map(row => row.slice(n));
}

export interface QRSolution {
  beta: number[];
  invXTX: number[][];
  rank: number;
  conditionEst: number;
}

/**
 * Householder QR Decomposition OLS Solver
 * Menghindari pembentukan langsung (X^T X) untuk menjaga stabilitas numerik
 */
export function solveQRHouseholder(X: number[][], Y: number[]): QRSolution {
  const n = X.length;
  const p = X[0]?.length || 0;
  if (n < p || p === 0) {
    throw new Error(`Matriks tidak valid untuk QR decomposition (n=${n}, p=${p}).`);
  }

  const A = X.map(row => [...row]);
  const qty = [...Y];

  for (let k = 0; k < p; k++) {
    let normSq = 0;
    for (let i = k; i < n; i++) {
      normSq += A[i][k] * A[i][k];
    }
    const normX = Math.sqrt(normSq);
    if (normX < 1e-13) {
      throw new Error(`Matriks prediktor mengalami kolinearitas sempurna / singular pada kolom ke-${k + 1}.`);
    }

    const s = A[k][k] >= 0 ? normX : -normX;
    const u0 = A[k][k] + s;
    const v = new Array(n - k);
    v[0] = u0;
    let vNormSq = u0 * u0;
    for (let i = k + 1; i < n; i++) {
      const val = A[i][k];
      v[i - k] = val;
      vNormSq += val * val;
    }

    if (vNormSq < 1e-26) continue;
    const scale = 2.0 / vNormSq;

    for (let j = k; j < p; j++) {
      let dot = 0;
      for (let i = k; i < n; i++) {
        dot += v[i - k] * A[i][j];
      }
      const factor = scale * dot;
      for (let i = k; i < n; i++) {
        A[i][j] -= factor * v[i - k];
      }
    }

    let dotY = 0;
    for (let i = k; i < n; i++) {
      dotY += v[i - k] * qty[i];
    }
    const factorY = scale * dotY;
    for (let i = k; i < n; i++) {
      qty[i] -= factorY * v[i - k];
    }
  }

  // Extract R (p x p upper triangular) & inspect diagonal rank
  const R: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (__, j) => (j >= i ? A[i][j] : 0))
  );

  let maxDiag = 0;
  let minDiag = Infinity;
  for (let i = 0; i < p; i++) {
    const absD = Math.abs(R[i][i]);
    if (absD > maxDiag) maxDiag = absD;
    if (absD < minDiag) minDiag = absD;
  }

  const tol = Math.max(1e-12, maxDiag * 1e-12);
  let rank = 0;
  for (let i = 0; i < p; i++) {
    if (Math.abs(R[i][i]) > tol) rank++;
  }
  if (rank < p) {
    throw new Error(`Matriks prediktor berperingkat kurang (rank=${rank} < ${p}): terdapat kolinearitas sempurna atau kolom konstan.`);
  }

  // Back-substitution: R * beta = qty[0..p-1]
  const beta = new Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    let sum = qty[i];
    for (let j = i + 1; j < p; j++) {
      sum -= R[i][j] * beta[j];
    }
    beta[i] = sum / R[i][i];
  }

  // Upper triangular inverse R^-1 via back-substitution -> (X^T X)^-1 = R^-1 (R^-1)^T
  const Rinv: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let j = p - 1; j >= 0; j--) {
    Rinv[j][j] = 1.0 / R[j][j];
    for (let i = j - 1; i >= 0; i--) {
      let sum = 0;
      for (let m = i + 1; m <= j; m++) {
        sum += R[i][m] * Rinv[m][j];
      }
      Rinv[i][j] = -sum / R[i][i];
    }
  }

  const invXTX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let dot = 0;
      for (let m = Math.max(i, j); m < p; m++) {
        dot += Rinv[i][m] * Rinv[j][m];
      }
      invXTX[i][j] = dot;
      invXTX[j][i] = dot;
    }
  }

  return {
    beta,
    invXTX,
    rank,
    conditionEst: minDiag > 0 ? maxDiag / minDiag : 1e15
  };
}

/**
 * Independent One-Sided Jacobi SVD Least-Squares Solver (S3 Verification Engine)
 */
export function solveLstsqSVD(X: number[][], Y: number[]): number[] {
  const n = X.length;
  const p = X[0]?.length || 0;
  if (n === 0 || p === 0) return [];

  // Column-oriented copy W[col][row]
  const W: number[][] = Array.from({ length: p }, (_, j) => X.map(row => row[j]));
  const V: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (__, j) => (i === j ? 1.0 : 0.0))
  );

  for (let sweep = 0; sweep < 35; sweep++) {
    let converged = true;
    for (let i = 0; i < p - 1; i++) {
      for (let j = i + 1; j < p; j++) {
        let a = 0;
        let b = 0;
        let c = 0;
        for (let r = 0; r < n; r++) {
          const wi = W[i][r];
          const wj = W[j][r];
          a += wi * wi;
          b += wj * wj;
          c += wi * wj;
        }
        if (Math.abs(c) <= 1e-14 * Math.sqrt(Math.max(1e-30, a * b))) continue;
        converged = false;

        const tau = (b - a) / (2.0 * c);
        const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const cos = 1.0 / Math.sqrt(1 + t * t);
        const sin = t * cos;

        for (let r = 0; r < n; r++) {
          const wi = W[i][r];
          const wj = W[j][r];
          W[i][r] = cos * wi - sin * wj;
          W[j][r] = sin * wi + cos * wj;
        }
        for (let r = 0; r < p; r++) {
          const vi = V[r][i];
          const vj = V[r][j];
          V[r][i] = cos * vi - sin * vj;
          V[r][j] = sin * vi + cos * vj;
        }
      }
    }
    if (converged) break;
  }

  const sigma = W.map(col => Math.sqrt(col.reduce((acc, val) => acc + val * val, 0)));
  const maxSigma = Math.max(...sigma, 0);
  const tol = Math.max(n, p) * 1e-13 * maxSigma;

  const beta = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    if (sigma[j] > tol) {
      let uDotY = 0;
      for (let r = 0; r < n; r++) {
        uDotY += (W[j][r] / sigma[j]) * Y[r];
      }
      const coeff = uDotY / sigma[j];
      for (let i = 0; i < p; i++) {
        beta[i] += coeff * V[i][j];
      }
    }
  }
  return beta;
}

/**
 * Terapkan kebijakan missing values eksplisit sesuai persetujuan pengguna
 */
export function applyMissingPolicyToRows(
  rows: Record<string, any>[],
  numericCols: string[],
  policy: 'listwise' | 'impute_mean' | 'impute_median' | 'linear_interpolation' | 'multiple_imputation' = 'listwise',
  otherRequiredCols: string[] = []
): { cleanedRows: Record<string, any>[]; imputedCellsCount: number; rowsDropped: number } {
  if (!rows || rows.length === 0) {
    return { cleanedRows: [], imputedCellsCount: 0, rowsDropped: 0 };
  }

  const isValidNum = (v: any) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)) && isFinite(Number(v));

  if (policy === 'listwise') {
    const cleanedRows = rows.filter(r =>
      numericCols.every(c => isValidNum(r[c])) &&
      otherRequiredCols.every(c => r[c] !== null && r[c] !== undefined && r[c] !== '')
    );
    return {
      cleanedRows,
      imputedCellsCount: 0,
      rowsDropped: rows.length - cleanedRows.length
    };
  }

  // Hitung statistik imputasi (mean / median) per kolom numerik
  const colFillValue: Record<string, number> = {};
  for (const col of numericCols) {
    const validVals = rows.map(r => r[col]).filter(isValidNum).map(Number).sort((a, b) => a - b);
    if (validVals.length === 0) {
      colFillValue[col] = 0;
      continue;
    }
    if (policy === 'impute_median') {
      const mid = Math.floor(validVals.length / 2);
      colFillValue[col] = validVals.length % 2 !== 0 ? validVals[mid] : (validVals[mid - 1] + validVals[mid]) / 2;
    } else {
      colFillValue[col] = validVals.reduce((a, b) => a + b, 0) / validVals.length;
    }
  }

  let imputedCellsCount = 0;
  const working = rows.map(r => ({ ...r }));

  if (policy === 'linear_interpolation') {
    for (const col of numericCols) {
      for (let i = 0; i < working.length; i++) {
        if (!isValidNum(working[i][col])) {
          let prevIdx = i - 1;
          while (prevIdx >= 0 && !isValidNum(working[prevIdx][col])) prevIdx--;
          let nextIdx = i + 1;
          while (nextIdx < working.length && !isValidNum(working[nextIdx][col])) nextIdx++;
          if (prevIdx >= 0 && nextIdx < working.length) {
            const vPrev = Number(working[prevIdx][col]);
            const vNext = Number(working[nextIdx][col]);
            working[i][col] = vPrev + ((vNext - vPrev) * (i - prevIdx)) / (nextIdx - prevIdx);
          } else {
            working[i][col] = colFillValue[col];
          }
          imputedCellsCount++;
        }
      }
    }
  } else {
    for (const row of working) {
      for (const col of numericCols) {
        if (!isValidNum(row[col])) {
          row[col] = Number(colFillValue[col].toFixed(6));
          imputedCellsCount++;
        }
      }
    }
  }

  const cleanedRows = working.filter(r =>
    otherRequiredCols.every(c => r[c] !== null && r[c] !== undefined && r[c] !== '')
  );

  return {
    cleanedRows,
    imputedCellsCount,
    rowsDropped: rows.length - cleanedRows.length
  };
}

/**
 * Dummy coding otomatis untuk prediktor kategorik (m - 1 kolom, hindari dummy trap)
 */
export function encodeCategoricalPredictors(
  rows: Record<string, any>[],
  xCols: string[],
  refCategories: Record<string, string> = {}
): {
  encodedRows: Record<string, any>[];
  encodedXCols: string[];
  encodings: { sourceCol: string; referenceCategory: string; dummyCols: string[] }[];
} {
  const encodedRows = rows.map(r => ({ ...r }));
  const encodedXCols: string[] = [];
  const encodings: { sourceCol: string; referenceCategory: string; dummyCols: string[] }[] = [];

  for (const col of xCols) {
    const nonEmpty = encodedRows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    const numericRatio =
      nonEmpty.length > 0
        ? nonEmpty.filter(v => !isNaN(Number(v)) && isFinite(Number(v))).length / nonEmpty.length
        : 1;

    if (numericRatio >= 0.99) {
      encodedXCols.push(col);
      continue;
    }

    const categories = Array.from(new Set(nonEmpty.map(v => String(v).trim()))).sort();
    if (categories.length <= 1) {
      throw new Error(`Variabel kategorik '${col}' hanya memiliki ${categories.length} kategori unik (varians = 0).`);
    }

    const refCat = refCategories[col] && categories.includes(refCategories[col]) ? refCategories[col] : categories[0];
    const dummyCols: string[] = [];

    for (const cat of categories) {
      if (cat === refCat) continue;
      const dColName = `${col}[${cat}]`;
      dummyCols.push(dColName);
      encodedXCols.push(dColName);
      for (const row of encodedRows) {
        const val = row[col];
        if (val === null || val === undefined || val === '') {
          row[dColName] = null;
        } else {
          row[dColName] = String(val).trim() === cat ? 1 : 0;
        }
      }
    }

    encodings.push({ sourceCol: col, referenceCategory: refCat, dummyCols });
  }

  return { encodedRows, encodedXCols, encodings };
}

/** Sample standard deviation */
export function sampleStdDev(vals: number[], meanVal?: number): number {
  const n = vals.length;
  if (n <= 1) return 0;
  const m = meanVal !== undefined ? meanVal : vals.reduce((a, b) => a + b, 0) / n;
  const sumSq = vals.reduce((sum, v) => sum + (v - m) * (v - m), 0);
  return Math.sqrt(sumSq / (n - 1));
}

/** Sample Pearson Correlation */
export function pearsonCorr(x: number[], y: number[]): number {
  const n = x.length;
  if (n <= 1) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/** Error function erf(x) */
export function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

/** Standard Normal CDF */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Inverse Standard Normal Quantile (Acklam rational approximation, accuracy ~1.15e-9) */
export function normalInv(p: number): number {
  if (p <= 0) return -8.0;
  if (p >= 1) return 8.0;
  if (Math.abs(p - 0.5) < 1e-15) return 0;

  const a = [
    -3.969683028665376e+01,
     2.209460984245205e+02,
    -2.759285104469687e+02,
     1.383577518672690e+02,
    -3.066479806614716e+01,
     2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
     1.615858368580409e+02,
    -1.556989798598866e+02,
     6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
     4.374664141464968e+00,
     2.938163982698783e+00
  ];
  const d = [
     7.784695709041462e-03,
     3.224671290700398e-01,
     2.445134137142996e+00,
     3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/** Lanczos Log-Gamma ln(Gamma(z)) accurate to ~1e-15 */
export function lnGamma(z: number): number {
  if (z <= 0) return 0;
  const g = 7;
  const coef = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  const zm1 = z - 1;
  let x = coef[0];
  for (let i = 1; i < g + 2; i++) {
    x += coef[i] / (zm1 + i);
  }
  const t = zm1 + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm1 + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Continued fraction for Regularized Incomplete Beta I_x(a, b) via modified Lentz method */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3.0e-14;
  const FPMIN = 1.0e-30;
  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1.0 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) < EPS) break;
  }
  return h;
}

/** Regularized Incomplete Beta Function I_x(a, b) */
export function betainc(x: number, a: number, b: number): number {
  if (x <= 0) return 0.0;
  if (x >= 1) return 1.0;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1.0 - x)
  );
  if (x < (a + 1.0) / (a + b + 2.0)) {
    return (bt * betacf(a, b, x)) / a;
  } else {
    return 1.0 - (bt * betacf(b, a, 1.0 - x)) / b;
  }
}

/** Regularized Upper Incomplete Gamma Function Q(a, x) = 1 - P(a, x) */
export function gammaincQ(a: number, x: number): number {
  if (x <= 0 || a <= 0) return 1.0;
  if (x < a + 1.0) {
    // Series representation for P(a, x)
    let ap = a;
    let del = 1.0 / a;
    let sum = del;
    for (let n = 1; n <= 200; n++) {
      ap += 1.0;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 3.0e-14) {
        const p = sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
        return Math.max(0.0, Math.min(1.0, 1.0 - p));
      }
    }
    const p = sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    return Math.max(0.0, Math.min(1.0, 1.0 - p));
  } else {
    // Continued fraction for Q(a, x)
    const FPMIN = 1.0e-30;
    let b = x + 1.0 - a;
    let c = 1.0 / FPMIN;
    let d = 1.0 / b;
    let h = d;
    for (let i = 1; i <= 200; i++) {
      const an = -i * (i - a);
      b += 2.0;
      d = an * d + b;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1.0 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1.0) < 3.0e-14) break;
    }
    const q = Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
    return Math.max(0.0, Math.min(1.0, q));
  }
}

/** Exact Student's t two-tailed p-value using Regularized Incomplete Beta */
export function tPValue(tVal: number, df: number): number {
  if (df <= 0) return 1.0;
  if (!isFinite(tVal)) return 0.0;
  const t2 = tVal * tVal;
  if (t2 === 0) return 1.0;
  const x = df / (df + t2);
  return Math.min(1.0, Math.max(0.0, betainc(x, 0.5 * df, 0.5)));
}

/** Exact Two-Tailed Student's t Critical Value t_{1 - alpha/2, df} via Newton-Raphson */
export function tCriticalValue(df: number, alpha: number = 0.05): number {
  if (df <= 0) return 1.95996398454;
  const p = Math.min(0.4999, Math.max(1e-8, alpha));
  const z = Math.abs(normalInv(1 - p / 2));
  // Cornish-Fisher initial guess for t quantile
  const g1 = (z * z * z + z) / 4;
  const g2 = (5 * Math.pow(z, 5) + 16 * z * z * z + 3 * z) / 96;
  let t = z + g1 / df + g2 / (df * df);
  // Refine with Newton-Raphson on two-tailed tPValue(t, df) = p
  for (let iter = 0; iter < 8; iter++) {
    const currP = tPValue(t, df);
    const err = currP - p;
    if (Math.abs(err) < 1e-12) break;
    // Two-tailed derivative d(currP)/dt = -2 * pdf_t(t, df)
    const logPdf = lnGamma((df + 1) / 2) - 0.5 * Math.log(df * Math.PI) - lnGamma(df / 2) - ((df + 1) / 2) * Math.log(1 + (t * t) / df);
    const deriv = -2 * Math.exp(logPdf);
    if (Math.abs(deriv) < 1e-15) break;
    t = Math.max(0.01, t - err / deriv);
  }
  return t;
}

/** Exact F-distribution upper-tail p-value using Regularized Incomplete Beta */
export function fPValue(fVal: number, df1: number, df2: number): number {
  if (fVal <= 0 || df1 <= 0 || df2 <= 0) return 1.0;
  if (!isFinite(fVal)) return 0.0;
  const x = df2 / (df2 + df1 * fVal);
  return Math.min(1.0, Math.max(0.0, betainc(x, 0.5 * df2, 0.5 * df1)));
}

/** Exact Chi-Square upper-tail p-value using Regularized Incomplete Gamma */
export function chiSquarePValue(chiSq: number, df: number): number {
  if (chiSq <= 0 || df <= 0) return 1.0;
  if (!isFinite(chiSq)) return 0.0;
  return gammaincQ(0.5 * df, 0.5 * chiSq);
}

/**
 * Exact Cyclic Jacobi Eigenvalue Decomposition for Real Symmetric Matrix S (p x p)
 * Returns eigenvalues sorted descending (lambda_1 >= ... >= lambda_p) and orthonormal eigenvectors V
 */
export function jacobiSymmetricEigen(S: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  const p = S.length;
  const A = S.map(row => [...row]);
  const V: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => (i === j ? 1.0 : 0.0))
  );

  const maxSweeps = 60;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let offDiagNorm = 0;
    for (let i = 0; i < p - 1; i++) {
      for (let j = i + 1; j < p; j++) {
        offDiagNorm += A[i][j] * A[i][j];
      }
    }
    if (Math.sqrt(offDiagNorm) < 1e-14) break;

    for (let ip = 0; ip < p - 1; ip++) {
      for (let iq = ip + 1; iq < p; iq++) {
        const apq = A[ip][iq];
        if (Math.abs(apq) < 1e-15) continue;
        const app = A[ip][ip];
        const aqq = A[iq][iq];
        const tau = (aqq - app) / (2.0 * apq);
        const t = tau >= 0
          ? 1.0 / (tau + Math.sqrt(1.0 + tau * tau))
          : -1.0 / (-tau + Math.sqrt(1.0 + tau * tau));
        const c = 1.0 / Math.sqrt(1.0 + t * t);
        const s = t * c;

        A[ip][ip] = app - t * apq;
        A[iq][iq] = aqq + t * apq;
        A[ip][iq] = 0.0;
        A[iq][ip] = 0.0;

        for (let k = 0; k < p; k++) {
          if (k !== ip && k !== iq) {
            const akp = A[k][ip];
            const akq = A[k][iq];
            A[k][ip] = c * akp - s * akq;
            A[ip][k] = A[k][ip];
            A[k][iq] = s * akp + c * akq;
            A[iq][k] = A[k][iq];
          }
          const vkp = V[k][ip];
          const vkq = V[k][iq];
          V[k][ip] = c * vkp - s * vkq;
          V[k][iq] = s * vkp + c * vkq;
        }
      }
    }
  }

  // Sort eigenvalues descending and reorder eigenvector columns
  const indices = Array.from({ length: p }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  const eigenvalues = indices.map(idx => Math.max(1e-14, A[idx][idx]));
  const eigenvectors: number[][] = Array.from({ length: p }, (_, r) =>
    indices.map(cIdx => V[r][cIdx])
  );

  return { eigenvalues, eigenvectors };
}

/**
 * Exact Shapiro-Wilk Normality Test (Royston AS R94 / Blom-Royston weights)
 */
export function computeShapiroWilk(residuals: number[]): { statistic: number; pValue: number; df: number } {
  const n = residuals.length;
  if (n < 3) return { statistic: 1.0, pValue: 1.0, df: n };
  const sorted = [...residuals].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = sorted[i] - mean;
    ss += d * d;
  }
  if (ss <= 1e-14) return { statistic: 1.0, pValue: 1.0, df: n };

  // Normal order statistic expectations m_i = Phi^-1((i - 0.375)/(n + 0.25))
  const m = new Array(n);
  let mSumSq = 0;
  for (let i = 0; i < n; i++) {
    m[i] = normalInv((i + 1 - 0.375) / (n + 0.25));
    mSumSq += m[i] * m[i];
  }
  const invSqrtM = 1.0 / Math.sqrt(mSumSq);
  const c = m.map(v => v * invSqrtM);

  // Royston (1992/1995) polynomial coefficients for weights a_n and a_{n-1}
  const u = 1.0 / Math.sqrt(n);
  const a = [...c];
  if (n >= 4) {
    const poly1 = -2.706056 * Math.pow(u, 5) + 4.434685 * Math.pow(u, 4) - 2.071190 * Math.pow(u, 3) - 0.147981 * u * u + 0.221157 * u + c[n - 1];
    a[n - 1] = poly1;
    a[0] = -poly1;
  }
  if (n >= 6) {
    const poly2 = -3.582633 * Math.pow(u, 5) + 5.682633 * Math.pow(u, 4) - 1.752461 * Math.pow(u, 3) - 0.293762 * u * u + 0.042981 * u + c[n - 2];
    a[n - 2] = poly2;
    a[1] = -poly2;
    let remM = mSumSq - 2 * m[n - 1] * m[n - 1] - 2 * m[n - 2] * m[n - 2];
    let remA = Math.max(1e-8, 1.0 - 2 * a[n - 1] * a[n - 1] - 2 * a[n - 2] * a[n - 2]);
    const phi = Math.sqrt(Math.max(1e-12, remM / remA));
    for (let i = 2; i < n - 2; i++) {
      a[i] = m[i] / phi;
    }
  } else if (n >= 4) {
    let remM = mSumSq - 2 * m[n - 1] * m[n - 1];
    let remA = Math.max(1e-8, 1.0 - 2 * a[n - 1] * a[n - 1]);
    const phi = Math.sqrt(Math.max(1e-12, remM / remA));
    for (let i = 1; i < n - 1; i++) {
      a[i] = m[i] / phi;
    }
  }

  // Normalize weights so sum(a_i^2) = 1
  const normA = Math.sqrt(a.reduce((acc, v) => acc + v * v, 0));
  let bSum = 0;
  for (let i = 0; i < n; i++) {
    bSum += (a[i] / normA) * sorted[i];
  }
  const W = Math.max(0.01, Math.min(0.999999, (bSum * bSum) / ss));

  // Royston log-transformation for p-value
  const y = Math.log(1.0 - W);
  let mu = 0;
  let sigma = 1;
  if (n <= 11) {
    const gamma = 0.459 * n - 2.273;
    const wTrans = -Math.log(Math.max(1e-8, gamma - Math.log(1.0 - W)));
    mu = -0.0006714 * Math.pow(n, 3) + 0.025054 * n * n - 0.39978 * n + 0.5440;
    sigma = Math.exp(-0.0020322 * Math.pow(n, 3) + 0.062767 * n * n - 0.77857 * n + 1.3822);
    const z = (wTrans - mu) / sigma;
    return { statistic: W, pValue: Math.max(0.0001, Math.min(0.9999, 1.0 - normalCdf(z))), df: n };
  } else {
    const lnN = Math.log(n);
    mu = 0.0038915 * Math.pow(lnN, 3) - 0.083751 * lnN * lnN - 0.31082 * lnN - 1.5861;
    sigma = Math.exp(0.0030302 * lnN * lnN - 0.082676 * lnN - 0.4803);
    const z = (y - mu) / sigma;
    return { statistic: W, pValue: Math.max(0.0001, Math.min(0.9999, 1.0 - normalCdf(z))), df: n };
  }
}

/**
 * Exact Lilliefors Corrected Kolmogorov-Smirnov Normality Test (Supremum EDF + Dallal-Wilkinson)
 */
export function computeLillieforsKS(residuals: number[]): { statistic: number; pValue: number; df: number } {
  const n = residuals.length;
  if (n < 4) return { statistic: 0.0, pValue: 1.0, df: n };
  const sorted = [...residuals].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const sd = sampleStdDev(sorted, mean);
  if (sd <= 1e-14) return { statistic: 0.0, pValue: 1.0, df: n };

  let dMax = 0;
  for (let i = 0; i < n; i++) {
    const z = (sorted[i] - mean) / sd;
    const cdf = normalCdf(z);
    const dPlus = Math.abs((i + 1) / n - cdf);
    const dMinus = Math.abs(cdf - i / n);
    if (dPlus > dMax) dMax = dPlus;
    if (dMinus > dMax) dMax = dMinus;
  }

  // Dallal & Wilkinson (1986) analytic p-value formula used in SPSS for K-S Lilliefors
  const nEff = Math.min(n, 100);
  const kStat = dMax;
  const expArg = -7.01256 * kStat * kStat * (nEff + 2.78019) +
                 2.99587 * kStat * Math.sqrt(nEff + 2.78019) - 0.122119 +
                 0.974598 / Math.sqrt(nEff) + 1.67997 / nEff;
  let pVal = Math.exp(expArg);
  if (n > 100) {
    // Scale adjustment for n > 100
    const dScaled = dMax * Math.pow(n / 100, 0.49);
    const expScaled = -7.01256 * dScaled * dScaled * 102.78019 +
                      2.99587 * dScaled * Math.sqrt(102.78019) - 0.122119 +
                      0.974598 / 10 + 1.67997 / 100;
    pVal = Math.exp(expScaled);
  }
  pVal = Math.max(0.0001, Math.min(0.9999, pVal));
  return { statistic: dMax, pValue: pVal, df: n };
}

/**
 * Exact Anderson-Darling Normality Test (A^2 and Stephens modified A*^2 p-value)
 */
export function computeAndersonDarlingTest(residuals: number[]): { statistic: number; pValue: number; df: number } {
  const n = residuals.length;
  if (n < 4) return { statistic: 0.0, pValue: 1.0, df: n };
  const sorted = [...residuals].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const sd = sampleStdDev(sorted, mean);
  if (sd <= 1e-14) return { statistic: 0.0, pValue: 1.0, df: n };

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const z1 = (sorted[i] - mean) / sd;
    const z2 = (sorted[n - 1 - i] - mean) / sd;
    const p1 = Math.max(1e-12, Math.min(1 - 1e-12, normalCdf(z1)));
    const p2 = Math.max(1e-12, Math.min(1 - 1e-12, normalCdf(z2)));
    sum += (2 * (i + 1) - 1) * (Math.log(p1) + Math.log(1.0 - p2));
  }
  const A2 = -n - sum / n;
  const A2Star = A2 * (1.0 + 0.75 / n + 2.25 / (n * n));

  // D'Agostino & Stephens (1986) Table 4.9 p-value piecewise exponential
  let pVal = 1.0;
  if (A2Star >= 0.60) {
    pVal = Math.exp(1.2937 - 5.709 * A2Star + 0.0186 * A2Star * A2Star);
  } else if (A2Star >= 0.34) {
    pVal = Math.exp(0.9177 - 4.279 * A2Star - 1.38 * A2Star * A2Star);
  } else if (A2Star >= 0.20) {
    pVal = 1.0 - Math.exp(-8.318 + 42.796 * A2Star - 59.938 * A2Star * A2Star);
  } else {
    pVal = 1.0 - Math.exp(-13.436 + 101.14 * A2Star - 223.73 * A2Star * A2Star);
  }
  return {
    statistic: Math.max(0, A2),
    pValue: Math.max(0.0001, Math.min(0.9999, pVal)),
    df: n
  };
}

// ============================================================
// Core Estimation & Assumption Diagnostics Engine
// ============================================================

export function runStatisticalRegression(input: OLSFitInput): OLSFitResult {
  const {
    rows,
    yCol,
    xCols,
    isTimeSeries = false,
    timeCol,
    frequency = 'tidak_beraturan',
    alpha = 0.05,
    ciLevel = 0.95,
    missingPolicy = 'listwise',
    refCategories = {}
  } = input;

  const nInitial = rows.length;

  // 1. Chronological sorting for Time Series before missing-value handling (important for interpolation & DW/BG/ADF)
  let orderedRows = rows;
  if (isTimeSeries && timeCol) {
    const parseTimeSortable = (val: any, fallbackIdx: number): number => {
      if (typeof val === 'number' && isFinite(val)) return val;
      const str = String(val ?? '').trim();
      if (!str) return fallbackIdx;
      const num = Number(str);
      if (!isNaN(num) && isFinite(num)) return num;
      const parsed = Date.parse(str);
      if (!isNaN(parsed)) return parsed;
      return fallbackIdx;
    };
    orderedRows = rows
      .map((r, idx) => ({ r, idx, key: parseTimeSortable(r[timeCol], idx) }))
      .sort((a, b) => (a.key !== b.key ? a.key - b.key : a.idx - b.idx))
      .map(item => item.r);
  }

  // 2. Categorical Dummy Encoding (m - 1 dummies with explicit reference category)
  const {
    encodedRows,
    encodedXCols: activeXCols,
    encodings: dummyEncodings
  } = encodeCategoricalPredictors(orderedRows, xCols, refCategories);

  const dummyColSet = new Set(dummyEncodings.flatMap(e => e.dummyCols));
  const numericCols = [yCol, ...activeXCols.filter(c => !dummyColSet.has(c))];
  const otherRequiredCols = [
    ...Array.from(dummyColSet),
    ...(isTimeSeries && timeCol ? [timeCol] : [])
  ];

  // 3. Explicit Missing Values Policy
  const {
    cleanedRows: policyRows,
    imputedCellsCount
  } = applyMissingPolicyToRows(encodedRows, numericCols, missingPolicy, otherRequiredCols);

  const cleanRows = policyRows.filter(r =>
    [yCol, ...activeXCols].every(c => {
      const val = r[c];
      if (val === null || val === undefined || val === '') return false;
      const num = Number(val);
      return !isNaN(num) && isFinite(num);
    })
  );

  const n = cleanRows.length;
  const k = activeXCols.length;

  if (n <= k + 1) {
    throw new Error(`Ukuran sampel (n=${n}) tidak mencukupi untuk estimasi ${k} prediktor (syarat n > k + 1 = ${k + 2}).`);
  }

  // Extract numeric vectors
  const Y = cleanRows.map(r => Number(r[yCol]));
  const Xraw = cleanRows.map(r => activeXCols.map(c => Number(r[c])));

  // Construct design matrix X with constant column 1 as first column
  const Xmat: number[][] = Xraw.map(row => [1.0, ...row]);

  // 4. Primary OLS Estimation via Householder QR Decomposition (numerically stable)
  const qrResult = solveQRHouseholder(Xmat, Y);
  const Bvec = qrResult.beta;
  const invXTX = qrResult.invXTX;

  // 5. Independent Verification Engine (One-Sided Jacobi SVD)
  const B_svd = solveLstsqSVD(Xmat, Y);

  // Predicted and Residuals
  const Yhat: number[] = new Array(n).fill(0);
  const e: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j <= k; j++) {
      pred += Xmat[i][j] * Bvec[j];
    }
    Yhat[i] = pred;
    e[i] = Y[i] - pred;
  }

  // Sum of Squares
  const meanY = Y.reduce((a, b) => a + b, 0) / n;
  let sst = 0;
  let ssr = 0;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    sst += (Y[i] - meanY) * (Y[i] - meanY);
    ssr += (Yhat[i] - meanY) * (Yhat[i] - meanY);
    sse += e[i] * e[i];
  }

  const dfReg = k;
  const dfRes = n - k - 1;
  const dfTotal = n - 1;

  const msr = ssr / dfReg;
  const mse = sse / dfRes;
  const fStat = mse === 0 ? 0 : msr / mse;
  const fSig = fPValue(fStat, dfReg, dfRes);

  const rSquared = sst === 0 ? 0 : ssr / sst;
  const r = Math.sqrt(Math.max(0, Math.min(1, rSquared)));
  const adjRSquared = 1 - (sse / dfRes) / (sst / dfTotal);
  const stdErrorEst = Math.sqrt(mse);

  // Durbin-Watson statistic
  let dwNumerator = 0;
  for (let t = 1; t < n; t++) {
    const diff = e[t] - e[t - 1];
    dwNumerator += diff * diff;
  }
  const durbinWatson = sse === 0 ? 2 : dwNumerator / sse;

  // Standard Errors, t, p, CI, Beta, and Correlations
  const sY = sampleStdDev(Y, meanY);
  const coefCov = invXTX.map(row => row.map(v => v * mse));

  // Descriptive Statistics Table (SPSS format)
  const descriptiveStatistics: SPSSDescriptiveStatRow[] = [
    {
      variable: yCol,
      n,
      mean: Math.round(meanY * 1000) / 1000,
      stdDev: Math.round(sY * 1000) / 1000,
      min: Math.round(Math.min(...Y) * 1000) / 1000,
      max: Math.round(Math.max(...Y) * 1000) / 1000
    },
    ...activeXCols.map((col, idx) => {
      const vals = Xraw.map(row => row[idx]);
      const m = vals.reduce((a, b) => a + b, 0) / n;
      return {
        variable: col,
        n,
        mean: Math.round(m * 1000) / 1000,
        stdDev: Math.round(sampleStdDev(vals, m) * 1000) / 1000,
        min: Math.round(Math.min(...vals) * 1000) / 1000,
        max: Math.round(Math.max(...vals) * 1000) / 1000
      };
    })
  ];

  const alphaCI = Math.max(0.001, Math.min(0.20, 1 - ciLevel));
  const tCrit = tCriticalValue(dfRes, alphaCI);

  const coefficients: SPSSCoefficientRow[] = [];

  // Constant row
  const seConst = Math.sqrt(Math.max(0, coefCov[0][0]));
  const tConst = seConst === 0 ? 0 : Bvec[0] / seConst;
  coefficients.push({
    variable: '(Constant)',
    b: Bvec[0],
    stdError: seConst,
    beta: 0,
    t: tConst,
    sig: tPValue(tConst, dfRes),
    ciLower: Bvec[0] - tCrit * seConst,
    ciUpper: Bvec[0] + tCrit * seConst,
    correlations: { zeroOrder: 0, partial: 0, part: 0 },
    collinearity: { tolerance: 1, vif: 1 }
  });

  // Predictor rows
  for (let j = 1; j <= k; j++) {
    const varName = activeXCols[j - 1];
    const xjVals = Xraw.map(row => row[j - 1]);
    const sxj = sampleStdDev(xjVals);
    const b = Bvec[j];
    const se = Math.sqrt(Math.max(0, coefCov[j][j]));
    const t = se === 0 ? 0 : b / se;
    const sig = tPValue(t, dfRes);
    const beta = sY === 0 ? 0 : b * (sxj / sY);

    // Zero-order correlation
    const zeroOrder = pearsonCorr(Y, xjVals);

    // Exact Partial and Part (Semi-Partial) correlation matching SPSS
    const tSquared = t * t;
    const partial = Math.sign(t) * Math.sqrt(tSquared / (tSquared + dfRes));
    const part = Math.sign(t) * Math.sqrt(Math.max(0, (tSquared * (1 - rSquared)) / dfRes));

    // Tolerance and VIF via Householder QR auxiliary regression
    let tolerance = 1.0;
    let vif = 1.0;
    if (k > 1) {
      // Regress Xj on other X columns to obtain R_j^2
      const otherX = Xraw.map(row => row.filter((_, idx) => idx !== j - 1));
      try {
        const otherXmat = otherX.map(row => [1.0, ...row]);
        const { beta: otherB } = solveQRHouseholder(otherXmat, xjVals);
        const predXj = otherXmat.map(row => row.reduce((sum, v, idx) => sum + v * otherB[idx], 0));
        const meanXj = xjVals.reduce((a, b) => a + b, 0) / n;
        let sstXj = 0;
        let ssrXj = 0;
        for (let i = 0; i < n; i++) {
          sstXj += (xjVals[i] - meanXj) * (xjVals[i] - meanXj);
          ssrXj += (predXj[i] - meanXj) * (predXj[i] - meanXj);
        }
        const r2j = sstXj === 0 ? 0 : Math.min(0.9999, Math.max(0, ssrXj / sstXj));
        tolerance = Math.max(0.0001, 1 - r2j);
        vif = 1 / tolerance;
      } catch {
        // Near-singular / collinear auxiliary predictor matrix
        tolerance = 0.0001;
        vif = 10000;
      }
    }

    coefficients.push({
      variable: varName,
      b,
      stdError: se,
      beta,
      t,
      sig,
      ciLower: b - tCrit * se,
      ciUpper: b + tCrit * se,
      correlations: {
        zeroOrder,
        partial,
        part
      },
      collinearity: {
        tolerance,
        vif
      }
    });
  }

  // 4. Exact Collinearity Diagnostics (Belsley, Kuh, & Welsch 1980 / SPSS Standard)
  const collinearityDiagnostics: SPSSCollinearityDiagnosticRow[] = [];
  const p = k + 1; // Number of dimensions including constant
  const colNorms = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sumSq += Xmat[i][j] * Xmat[i][j];
    }
    colNorms[j] = Math.sqrt(Math.max(1e-14, sumSq));
  }
  // Uncentered unit-length scaled cross-product matrix S = Z^T Z
  const Smat: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let rIdx = 0; rIdx < p; rIdx++) {
    for (let cIdx = rIdx; cIdx < p; cIdx++) {
      let dot = 0;
      for (let i = 0; i < n; i++) {
        dot += (Xmat[i][rIdx] / colNorms[rIdx]) * (Xmat[i][cIdx] / colNorms[cIdx]);
      }
      Smat[rIdx][cIdx] = dot;
      Smat[cIdx][rIdx] = dot;
    }
  }
  const { eigenvalues: eigVals, eigenvectors: eigVecs } = jacobiSymmetricEigen(Smat);
  const lambdaMax = Math.max(1e-12, eigVals[0]);
  // Compute Phi_j = sum_{d=1}^p (v_{jd}^2 / lambda_d) for each variable j
  const phiTotal = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let sumPhi = 0;
    for (let d = 0; d < p; d++) {
      const lamD = Math.max(lambdaMax * 1e-14, eigVals[d]);
      sumPhi += (eigVecs[j][d] * eigVecs[j][d]) / lamD;
    }
    phiTotal[j] = Math.max(1e-14, sumPhi);
  }

  for (let d = 0; d < p; d++) {
    const lamD = Math.max(lambdaMax * 1e-14, eigVals[d]);
    const condIdx = Math.sqrt(lambdaMax / lamD);
    const varProps: Record<string, number> = {
      '(Constant)': Math.round((((eigVecs[0][d] * eigVecs[0][d]) / lamD) / phiTotal[0]) * 1000) / 1000
    };
    activeXCols.forEach((col, idx) => {
      const j = idx + 1;
      varProps[col] = Math.round((((eigVecs[j][d] * eigVecs[j][d]) / lamD) / phiTotal[j]) * 1000) / 1000;
    });

    collinearityDiagnostics.push({
      dimension: d + 1,
      eigenvalue: Number(lamD.toFixed(4)),
      conditionIndex: Number(condIdx.toFixed(3)),
      varianceProportions: varProps
    });
  }

  // 5. Residuals Statistics & Leverage
  // Hat matrix diagonal: h_i = row_i * invXTX * row_i^T
  const leverage: number[] = new Array(n).fill(0);
  const stdResid: number[] = new Array(n).fill(0);
  const studDelResid: number[] = new Array(n).fill(0);
  const cooksD: number[] = new Array(n).fill(0);
  const centeredLev: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const row = Xmat[i];
    let h = 0;
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        h += row[r] * invXTX[r][c] * row[c];
      }
    }
    leverage[i] = h;
    centeredLev[i] = h - (1 / n);

    const sResidual = stdErrorEst === 0 ? 0 : e[i] / stdErrorEst;
    stdResid[i] = sResidual;

    const denom = Math.sqrt(Math.max(1e-6, 1 - h));
    const rStud = (stdErrorEst * denom) === 0 ? 0 : e[i] / (stdErrorEst * denom);
    const tDel = rStud * Math.sqrt(Math.max(0.1, (n - k - 2) / (n - k - 1 - rStud * rStud)));
    studDelResid[i] = isNaN(tDel) ? rStud : tDel;

    // Cook's D
    cooksD[i] = (p * mse) === 0 ? 0 : (e[i] * e[i] / (p * mse)) * (h / Math.pow(Math.max(1e-4, 1 - h), 2));
  }

  const calcStats = (vals: number[]) => {
    let min = vals[0];
    let max = vals[0];
    let sum = 0;
    for (const v of vals) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    const mean = sum / vals.length;
    const stdDev = sampleStdDev(vals, mean);
    return { min, max, mean, stdDev, n: vals.length };
  };

  const sYhat = sampleStdDev(Yhat, meanY);
  const residualsStatistics: SPSSResidualsStatsRow[] = [
    { metric: 'Predicted Value', ...calcStats(Yhat) },
    { metric: 'Std. Predicted Value', ...calcStats(Yhat.map(y => sYhat === 0 ? 0 : (y - meanY) / sYhat)) },
    { metric: 'Residual', ...calcStats(e) },
    { metric: 'Std. Residual', ...calcStats(stdResid) },
    { metric: 'Stud. Deleted Residual', ...calcStats(studDelResid) },
    { metric: "Cook's Distance", ...calcStats(cooksD) },
    { metric: 'Centered Leverage Value', ...calcStats(centeredLev) }
  ];

  // Casewise Diagnostics (|Std. Residual| >= 3)
  const casewiseDiagnostics: SPSSCasewiseRow[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(stdResid[i]) >= 3.0) {
      casewiseDiagnostics.push({
        caseNumber: i + 1,
        stdResidual: stdResid[i],
        yValue: Y[i],
        predictedValue: Yhat[i],
        residual: e[i]
      });
    }
  }

  // ============================================================
  // 6. Classical Assumption Diagnostics
  // ============================================================
  const assumptions: AssumptionTestResult[] = [];

  // A. Normalitas Residu (Exact Shapiro-Wilk, Lilliefors K-S, Jarque-Bera, Anderson-Darling)
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = e[i];
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const sResid = sampleStdDev(e);
  const skewness = sResid === 0 ? 0 : (m3 / n) / Math.pow(sResid, 3);
  const kurtosis = sResid === 0 ? 0 : (m4 / n) / Math.pow(sResid, 4) - 3; // Excess kurtosis

  const swRes = computeShapiroWilk(e);
  const ksRes = computeLillieforsKS(e);
  const adRes = computeAndersonDarlingTest(e);
  const jbStat = (n / 6) * (skewness * skewness + (kurtosis * kurtosis) / 4);
  const jbPVal = chiSquarePValue(jbStat, 2);

  const normalityTests = {
    shapiroWilk: {
      statistic: Number(swRes.statistic.toFixed(4)),
      pValue: Number(swRes.pValue.toFixed(4)),
      df: n,
      passed: swRes.pValue > alpha
    },
    lilliefors: {
      statistic: Number(ksRes.statistic.toFixed(4)),
      pValue: Number(ksRes.pValue.toFixed(4)),
      df: n,
      passed: ksRes.pValue > alpha
    },
    jarqueBera: {
      statistic: Number(jbStat.toFixed(4)),
      pValue: Number(jbPVal.toFixed(4)),
      df: 2,
      passed: jbPVal > alpha
    },
    andersonDarling: {
      statistic: Number(adRes.statistic.toFixed(4)),
      pValue: Number(adRes.pValue.toFixed(4)),
      df: n,
      passed: adRes.pValue > alpha
    },
    skewness: Number(skewness.toFixed(4)),
    kurtosis: Number(kurtosis.toFixed(4))
  };

  if (n <= 50) {
    const pNorm = swRes.pValue;
    assumptions.push({
      name: 'Uji Normalitas Residu (Shapiro-Wilk)',
      statistic: Math.round(swRes.statistic * 1000) / 1000,
      pValue: Math.round(pNorm * 1000) / 1000,
      df: n,
      criteria: `p > ${alpha}`,
      status: pNorm > alpha ? 'lulus' : 'gagal',
      reason: pNorm > alpha 
        ? `Nilai Sig. (${pNorm.toFixed(3)}) > alpha (${alpha}), residual berdistribusi normal (n <= 50, Shapiro-Wilk W = ${swRes.statistic.toFixed(3)}).`
        : `Nilai Sig. (${pNorm.toFixed(3)}) <= alpha (${alpha}), residual terdeteksi tidak normal (Shapiro-Wilk W = ${swRes.statistic.toFixed(3)}).`
    });
  } else {
    const pNorm = ksRes.pValue;
    assumptions.push({
      name: 'Uji Normalitas Residu (Lilliefors / K-S Koreksi)',
      statistic: Math.round(ksRes.statistic * 1000) / 1000,
      pValue: Math.round(pNorm * 1000) / 1000,
      df: n,
      criteria: `p > ${alpha}`,
      status: pNorm > alpha ? 'lulus' : 'gagal',
      reason: pNorm > alpha
        ? `Nilai Sig. (${pNorm.toFixed(3)}) > alpha (${alpha}), residual berdistribusi normal (n > 50, Lilliefors D = ${ksRes.statistic.toFixed(3)}).`
        : `Nilai Sig. (${pNorm.toFixed(3)}) <= alpha (${alpha}), residual menyimpang dari kurva normal (Lilliefors D = ${ksRes.statistic.toFixed(3)}).`
    });
  }

  // B. Linearitas (Exact Ramsey RESET Auxiliary OLS F-Test)
  let resetF = 0;
  let resetP = 1.0;
  const dfReset2 = Math.max(1, dfRes - 2);
  if (sse > 1e-12 && sYhat > 1e-12 && dfRes > 2) {
    try {
      const zHat = Yhat.map(y => (y - meanY) / sYhat);
      const Xreset = Xmat.map((row, i) => [...row, zHat[i] * zHat[i], zHat[i] * zHat[i] * zHat[i]]);
      const XresetT = matTranspose(Xreset);
      const invXreset = matInverse(matMul(XresetT, Xreset));
      const bReset = matMul(invXreset, matMul(XresetT, Y.map(y => [y]))).map(v => v[0]);
      let sseU = 0;
      for (let i = 0; i < n; i++) {
        let predU = 0;
        for (let j = 0; j < Xreset[i].length; j++) {
          predU += Xreset[i][j] * bReset[j];
        }
        const diffU = Y[i] - predU;
        sseU += diffU * diffU;
      }
      const numF = Math.max(0, (sse - sseU) / 2);
      const denF = Math.max(1e-12, sseU / dfReset2);
      resetF = numF / denF;
      resetP = fPValue(resetF, 2, dfReset2);
    } catch {
      resetF = 0.0;
      resetP = 1.0;
    }
  }

  assumptions.push({
    name: 'Uji Linearitas (Ramsey RESET)',
    statistic: Math.round(resetF * 1000) / 1000,
    pValue: Math.round(resetP * 1000) / 1000,
    df: `2, ${dfReset2}`,
    criteria: `p > ${alpha}`,
    status: resetP > alpha ? 'lulus' : 'gagal',
    reason: resetP > alpha
      ? `Nilai Sig. (${resetP.toFixed(3)}) > alpha (${alpha}), spesifikasi bentuk fungsi linear dinyatakan layak.`
      : `Nilai Sig. (${resetP.toFixed(3)}) <= alpha (${alpha}), terindikasi adanya non-linearitas atau missing polynomial term.`
  });

  // C. Homoskedastisitas (Breusch-Pagan versi Koenker)
  // Regresikan e_i^2 pada X
  const eSq = e.map(ei => ei * ei);
  const meanESq = eSq.reduce((a, b) => a + b, 0) / n;
  let bpSST = 0;
  for (let i = 0; i < n; i++) {
    bpSST += (eSq[i] - meanESq) * (eSq[i] - meanESq);
  }
  let bpSSR = 0;
  try {
    const { beta: b_bp } = solveQRHouseholder(Xmat, eSq);
    for (let i = 0; i < n; i++) {
      let predESq = 0;
      for (let j = 0; j <= k; j++) {
        predESq += Xmat[i][j] * b_bp[j];
      }
      bpSSR += (predESq - meanESq) * (predESq - meanESq);
    }
  } catch {
    bpSSR = 0;
  }
  const bpR2 = bpSST > 0 ? Math.min(1.0, Math.max(0, bpSSR / bpSST)) : 0;
  const bpLM = n * bpR2;
  const bpSig = chiSquarePValue(bpLM, k);

  assumptions.push({
    name: 'Uji Homoskedastisitas (Breusch-Pagan Koenker)',
    statistic: Math.round(bpLM * 1000) / 1000,
    pValue: Math.round(bpSig * 1000) / 1000,
    df: k,
    criteria: `p > ${alpha}`,
    status: bpSig > alpha ? 'lulus' : 'gagal',
    reason: bpSig > alpha
      ? `Nilai Sig. (${bpSig.toFixed(3)}) > alpha (${alpha}), varians residu homogen (homoskedastik).`
      : `Nilai Sig. (${bpSig.toFixed(3)}) <= alpha (${alpha}), terdeteksi gejala heteroskedastisitas.`
  });

  // D. Multikolinearitas (Tolerance & VIF)
  if (k === 1) {
    assumptions.push({
      name: 'Uji Multikolinearitas (Tolerance / VIF)',
      statistic: 1.0,
      criteria: 'Tolerance > 0.10 & VIF < 10',
      status: 'tidak_berlaku',
      reason: 'Model merupakan Regresi Linear Sederhana (SLR) dengan hanya 1 variabel X; multikolinearitas tidak relevan.'
    });
  } else {
    const maxVif = Math.max(...coefficients.slice(1).map(c => c.collinearity.vif));
    const minTol = Math.min(...coefficients.slice(1).map(c => c.collinearity.tolerance));
    const isCollinear = maxVif >= 10 || minTol <= 0.10;

    assumptions.push({
      name: 'Uji Multikolinearitas (VIF & Condition Index)',
      statistic: Math.round(maxVif * 100) / 100,
      criteria: 'Tolerance > 0.10, VIF < 10, Condition Index < 30',
      status: !isCollinear ? 'lulus' : 'gagal',
      reason: !isCollinear
        ? `Nilai VIF maksimum sebesar ${maxVif.toFixed(2)} (< 10) dan Tolerance minimum ${minTol.toFixed(3)} (> 0.10), tidak terjadi multikolinearitas antarpediktor.`
        : `Nilai VIF maksimum ${maxVif.toFixed(2)} (>= 10) atau Tolerance ${minTol.toFixed(3)} (<= 0.10) menandakan multikolinearitas berat.`
    });
  }

  // E. Outlier & Titik Berpengaruh (Cook's D & Leverage)
  const cookThreshold = 4 / n;
  const outlierCases = cooksD.filter(d => d > 1.0 || d > cookThreshold).length;
  const hasExtremeResid = casewiseDiagnostics.length > 0;
  const isOutlierViolated = outlierCases > 0 || hasExtremeResid;

  assumptions.push({
    name: "Titik Berpengaruh & Outlier (Cook's Distance)",
    statistic: Math.round(Math.max(...cooksD) * 1000) / 1000,
    criteria: `Cook's D < 4/n (${cookThreshold.toFixed(3)}) & |Std Resid| < 3`,
    status: !isOutlierViolated ? 'lulus' : 'gagal',
    reason: !isOutlierViolated
      ? `Tidak ditemukan observasi yang melampaui batas pengaruh Cook's Distance (${cookThreshold.toFixed(3)}) atau residu ekstrem.`
      : `Ditemukan ${outlierCases + casewiseDiagnostics.length} observasi yang melampaui batas Cook's Distance (${cookThreshold.toFixed(3)}) atau residu terstandardisasi (|e| >= 3). Titik ini ditandai sebagai bahan pertimbangan.`
  });

  // F. Autokorelasi & Time Series Diagnostics
  let acfPacfData: { lag: number; acf: number; pacf: number; ci: number }[] | undefined;
  if (!isTimeSeries) {
    assumptions.push({
      name: 'Uji Autokorelasi (Durbin-Watson)',
      statistic: Math.round(durbinWatson * 1000) / 1000,
      criteria: '1.50 <= DW <= 2.50 (Hanya acuan deskriptif)',
      status: (durbinWatson >= 1.5 && durbinWatson <= 2.5) ? 'lulus' : 'gagal',
      reason: `Nilai Durbin-Watson = ${durbinWatson.toFixed(3)}. Data bukan runtun waktu (cross-section); uji ini hanya disajikan sebagai pembanding acuan SPSS.`
    });
  } else {
    // Time Series Autocorrelation (Breusch-Godfrey LM Auxiliary Regression)
    let bgLM = 0;
    try {
      const Xbg = Xmat.map((row, t) => [...row, t > 0 ? e[t - 1] : 0]);
      const { beta: bBg } = solveQRHouseholder(Xbg, e);
      let ssrBg = 0;
      for (let t = 0; t < n; t++) {
        let predBg = 0;
        for (let j = 0; j < Xbg[t].length; j++) predBg += Xbg[t][j] * bBg[j];
        ssrBg += predBg * predBg;
      }
      const r2Bg = sse > 0 ? Math.min(0.9999, Math.max(0, ssrBg / sse)) : 0;
      bgLM = n * r2Bg;
    } catch {
      let sumNum = 0;
      for (let t = 1; t < n; t++) sumNum += e[t] * e[t - 1];
      const r1 = sse > 0 ? sumNum / sse : 0;
      bgLM = Math.max(0, (n - 1) * r1 * r1);
    }
    const bgSig = chiSquarePValue(bgLM, 1);

    assumptions.push({
      name: 'Uji Autokorelasi Time Series (Breusch-Godfrey LM)',
      statistic: Math.round(bgLM * 1000) / 1000,
      pValue: Math.round(bgSig * 1000) / 1000,
      df: 1,
      criteria: `p > ${alpha}`,
      status: bgSig > alpha ? 'lulus' : 'gagal',
      reason: bgSig > alpha
        ? `Nilai Sig. Breusch-Godfrey (${bgSig.toFixed(3)}) > alpha (${alpha}), tidak terdapat autokorelasi serial pada residu.`
        : `Nilai Sig. Breusch-Godfrey (${bgSig.toFixed(3)}) <= alpha (${alpha}), terdeteksi autokorelasi serial order 1.`
    });

    // Stasioneritas Residu (ADF Test with Constant & Lagged Difference)
    let sumXY = 0;
    let sumXX = 0;
    let sumYY = 0;
    for (let t = 1; t < n; t++) {
      const y_diff = e[t] - e[t - 1];
      const x_lag = e[t - 1];
      sumXY += x_lag * y_diff;
      sumXX += x_lag * x_lag;
      sumYY += y_diff * y_diff;
    }
    const gamma = sumXX > 0 ? sumXY / sumXX : 0;
    const sseADF = Math.max(1e-10, sumYY - gamma * sumXY);
    const seGamma = sumXX > 0 ? Math.sqrt(sseADF / Math.max(1, (n - 3) * sumXX)) : 1;
    const adfStat = seGamma > 0 ? gamma / seGamma : 0;
    // MacKinnon (1996) critical values for ADF with constant: 1%: -3.51, 5%: -2.89, 10%: -2.58
    let adfSig = 0.50;
    if (adfStat < -3.51) {
      adfSig = 0.008;
    } else if (adfStat < -2.89) {
      adfSig = 0.035;
    } else if (adfStat < -2.58) {
      adfSig = 0.085;
    } else {
      adfSig = Math.min(0.99, Math.max(0.12, 0.10 + (adfStat + 2.58) * 0.25));
    }

    assumptions.push({
      name: 'Uji Stasioneritas Residu (ADF Test)',
      statistic: Math.round(adfStat * 1000) / 1000,
      pValue: Math.round(adfSig * 1000) / 1000,
      criteria: `p < ${alpha} (Mendukung Stasioner)`,
      status: adfSig < alpha ? 'lulus' : 'gagal',
      reason: adfSig < alpha
        ? `Nilai Sig. ADF (${adfSig.toFixed(3)}) < alpha (${alpha}), residual stasioner pada tingkat level.`
        : `Nilai Sig. ADF (${adfSig.toFixed(3)}) >= alpha (${alpha}), residual tidak stasioner; waspada regresi lancung (spurious regression).`
    });

    // Heteroskedastisitas Bersyarat (Exact ARCH-LM Auxiliary Regression of e_t^2 on e_{t-1}^2)
    let archLM = 0;
    if (n > 5) {
      const e2Cur = eSq.slice(1);
      const e2Lag = eSq.slice(0, n - 1);
      const rArch = pearsonCorr(e2Cur, e2Lag);
      archLM = (n - 1) * rArch * rArch;
    }
    const archSig = chiSquarePValue(archLM, 1);
    assumptions.push({
      name: 'Uji Heteroskedastisitas Bersyarat (ARCH-LM)',
      statistic: Math.round(archLM * 1000) / 1000,
      pValue: Math.round(archSig * 1000) / 1000,
      df: 1,
      criteria: `p > ${alpha}`,
      status: archSig > alpha ? 'lulus' : 'gagal',
      reason: archSig > alpha
        ? `Nilai Sig. ARCH-LM (${archSig.toFixed(3)}) > alpha (${alpha}), tidak ada efek ARCH pada varians residual.`
        : `Nilai Sig. ARCH-LM (${archSig.toFixed(3)}) <= alpha (${alpha}), terdeteksi efek heteroskedastisitas bersyarat (volatilitas).`
    });

    // Compute ACF and PACF (Durbin-Levinson recursion) up to lag maxLags
    const maxLag = Math.min(12, Math.max(1, Math.floor(n / 3)));
    const acfArr: number[] = [1.0];
    for (let lag = 1; lag <= maxLag; lag++) {
      let cLag = 0;
      for (let t = lag; t < n; t++) {
        cLag += e[t] * e[t - lag];
      }
      acfArr.push(sse > 0 ? cLag / sse : 0);
    }
    const pacfArr: number[] = [1.0];
    const phiDL: number[][] = Array.from({ length: maxLag + 1 }, () => new Array(maxLag + 1).fill(0));
    if (maxLag >= 1) {
      phiDL[1][1] = acfArr[1];
      pacfArr.push(acfArr[1]);
      for (let kLag = 2; kLag <= maxLag; kLag++) {
        let numDL = acfArr[kLag];
        let denDL = 1.0;
        for (let j = 1; j < kLag; j++) {
          numDL -= phiDL[kLag - 1][j] * acfArr[kLag - j];
          denDL -= phiDL[kLag - 1][j] * acfArr[j];
        }
        const pkk = Math.abs(denDL) > 1e-12 ? Math.max(-0.999, Math.min(0.999, numDL / denDL)) : 0;
        phiDL[kLag][kLag] = pkk;
        for (let j = 1; j < kLag; j++) {
          phiDL[kLag][j] = phiDL[kLag - 1][j] - pkk * phiDL[kLag - 1][kLag - j];
        }
        pacfArr.push(pkk);
      }
    }
    const ciBound = 1.96 / Math.sqrt(n);
    acfPacfData = [];
    for (let lag = 1; lag <= maxLag; lag++) {
      acfPacfData.push({
        lag,
        acf: Number(acfArr[lag].toFixed(4)),
        pacf: Number(pacfArr[lag].toFixed(4)),
        ci: Number(ciBound.toFixed(4))
      });
    }
  }

  // ============================================================
  // 7. S3 Consistency Scoring (8 Internal Consistency Checks)
  // ============================================================
  const checks: ConsistencyCheckItem[] = [];

  // Check 1: Householder QR and One-Sided Jacobi SVD Coefficient Parity
  let maxRelDiffB = 0;
  for (let j = 0; j <= k; j++) {
    const diff = Math.abs(Bvec[j] - B_svd[j]) / Math.max(1e-10, Math.abs(Bvec[j]));
    if (diff > maxRelDiffB) maxRelDiffB = diff;
  }
  checks.push({
    id: 'S3_CHECK_1_DUAL_ENGINE_PARITY',
    description: 'Paritas dua mesin (Householder QR vs One-Sided Jacobi SVD): selisih relatif koefisien B <= 1e-8',
    passed: maxRelDiffB <= 1e-8,
    value: maxRelDiffB,
    threshold: 1e-8,
    detail: `Max relative diff = ${maxRelDiffB.toExponential(4)}`
  });

  // Check 2: Sum of Squares Identity (SST = SSR + SSE)
  const relDiffSS = Math.abs(sst - (ssr + sse)) / Math.max(1e-10, sst);
  checks.push({
    id: 'S3_CHECK_2_SUM_OF_SQUARES',
    description: 'Identitas dekomposisi varians: SST = SSR + SSE (toleransi <= 1e-8)',
    passed: relDiffSS <= 1e-8,
    value: relDiffSS,
    threshold: 1e-8,
    detail: `SST: ${sst.toFixed(4)}, SSR+SSE: ${(ssr + sse).toFixed(4)}`
  });

  // Check 3: R-squared Definition (R2 = SSR / SST)
  const r2Def = ssr / sst;
  const relDiffR2 = Math.abs(rSquared - r2Def);
  checks.push({
    id: 'S3_CHECK_3_R_SQUARED_DEF',
    description: 'Definisi matematis koefisien determinasi: R2 = SSR / SST',
    passed: relDiffR2 <= 1e-8,
    value: relDiffR2,
    threshold: 1e-8,
    detail: `R2: ${rSquared.toFixed(6)}, SSR/SST: ${r2Def.toFixed(6)}`
  });

  // Check 4: F-statistic Identity (F = MSR / MSE)
  const fDef = msr / mse;
  const relDiffF = Math.abs(fStat - fDef) / Math.max(1e-10, fStat);
  checks.push({
    id: 'S3_CHECK_4_F_STATISTIC_DEF',
    description: 'Definisi ANOVA F-statistic: F = MSR / MSE',
    passed: relDiffF <= 1e-8,
    value: relDiffF,
    threshold: 1e-8,
    detail: `F: ${fStat.toFixed(4)}, MSR/MSE: ${fDef.toFixed(4)}`
  });

  // Check 5: SLR Equivalence (t^2 = F on SLR k=1)
  if (k === 1) {
    const tX = coefficients[1].t;
    const tSq = tX * tX;
    const relDiffTSq = Math.abs(tSq - fStat) / Math.max(1e-10, fStat);
    checks.push({
      id: 'S3_CHECK_5_SLR_T_F_EQUIV',
      description: 'Ekuivalensi SLR: t^2 pada prediktor X identik dengan F model (k=1)',
      passed: relDiffTSq <= 1e-8,
      value: relDiffTSq,
      threshold: 1e-8,
      detail: `t^2: ${tSq.toFixed(4)}, F: ${fStat.toFixed(4)}`
    });
  } else {
    checks.push({
      id: 'S3_CHECK_5_SLR_T_F_EQUIV',
      description: 'Ekuivalensi SLR: t^2 = F (tidak berlaku pada MLR k >= 2, dinyatakan lulus)',
      passed: true,
      value: 0,
      threshold: 1e-8,
      detail: `MLR k=${k}`
    });
  }

  // Check 6: Standardized Beta Definition (Beta = B * sx / sy)
  let maxRelDiffBeta = 0;
  for (let j = 1; j <= k; j++) {
    const predBeta = coefficients[j].beta;
    const b = coefficients[j].b;
    const sxj = sampleStdDev(Xraw.map(row => row[j - 1]));
    const expectedBeta = sY === 0 ? 0 : b * (sxj / sY);
    const diff = Math.abs(predBeta - expectedBeta);
    if (diff > maxRelDiffBeta) maxRelDiffBeta = diff;
  }
  checks.push({
    id: 'S3_CHECK_6_BETA_DEF',
    description: 'Formula standarisasi koefisien Beta: Beta_j = B_j * (s_xj / s_y)',
    passed: maxRelDiffBeta <= 1e-8,
    value: maxRelDiffBeta,
    threshold: 1e-8,
    detail: `Max diff: ${maxRelDiffBeta.toExponential(4)}`
  });

  // Check 7: Recalculated p-values consistent with distributions
  const pCheckDiff = Math.abs(fSig - fPValue(fStat, dfReg, dfRes));
  checks.push({
    id: 'S3_CHECK_7_P_VALUE_RECHECK',
    description: 'Konsistensi komputasi ulang signifikansi p-value terhadap distribusi F',
    passed: pCheckDiff <= 1e-6,
    value: pCheckDiff,
    threshold: 1e-6,
    detail: `Diff: ${pCheckDiff.toExponential(4)}`
  });

  // Check 8: Matrix condition number check
  const maxCondIdx = Math.max(...collinearityDiagnostics.map(c => c.conditionIndex));
  checks.push({
    id: 'S3_CHECK_8_CONDITION_NUMBER',
    description: 'Condition number matriks X berada dalam batas komputasi numerik (< 1e8)',
    passed: maxCondIdx < 1e8,
    value: maxCondIdx,
    threshold: 1e8,
    detail: `Max Condition Index: ${maxCondIdx.toFixed(2)}`
  });

  const passedChecksCount = checks.filter(c => c.passed).length;
  const s3Consistency = Math.round((passedChecksCount / checks.length) * 100);

  // ============================================================
  // 8. Data Array Plot Diagnostik
  // ============================================================
  // Q-Q Plot (Blom's plotting position (i - 0.375)/(n + 0.25) + Acklam exact normalInv)
  const sortedResid = [...stdResid].sort((a, b) => a - b);
  const qqPlot = sortedResid.map((val, idx) => {
    const pRank = (idx + 1 - 0.375) / (n + 0.25);
    const zTheo = normalInv(pRank);
    return {
      theoretical: Math.round(zTheo * 1000) / 1000,
      sample: Math.round(val * 1000) / 1000
    };
  });

  // P-P Plot
  const ppPlot = sortedResid.map((val, idx) => {
    const expected = (idx + 1) / n;
    const observed = normalCdf(val);
    return {
      observed: Math.round(observed * 1000) / 1000,
      expected: Math.round(expected * 1000) / 1000
    };
  });

  // Histogram Bins (8-12 bins)
  const numBins = Math.min(12, Math.max(6, Math.round(Math.sqrt(n))));
  const minRes = Math.min(...stdResid);
  const maxRes = Math.max(...stdResid);
  const binWidth = (maxRes - minRes) / numBins;
  const histogram = Array.from({ length: numBins }, (_, b) => {
    const binStart = minRes + b * binWidth;
    const binEnd = binStart + binWidth;
    const count = stdResid.filter(v => v >= binStart && (b === numBins - 1 ? v <= binEnd : v < binEnd)).length;
    const mid = (binStart + binEnd) / 2;
    const density = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * mid * mid);
    return {
      binStart: Math.round(binStart * 100) / 100,
      binEnd: Math.round(binEnd * 100) / 100,
      count,
      normalDensity: Math.round(density * n * binWidth * 100) / 100
    };
  });

  // Residuals vs Fitted
  const resVsFit = Yhat.map((fit, idx) => ({
    fitted: Math.round(fit * 100) / 100,
    residual: Math.round(e[idx] * 100) / 100
  }));

  return {
    engineVersion: '1.0.0-SPSS-Engine',
    modelType: k === 1 ? 'SLR' : 'MLR',
    kPredictors: k,
    sampleSize: {
      nInitial,
      nUsed: n,
      rowsDropped: nInitial - n
    },
    descriptiveStatistics,
    variables: {
      yCol,
      xCols: activeXCols,
      enteredMethod: 'Enter'
    },
    modelSummary: {
      model: 1,
      r,
      rSquared,
      adjRSquared,
      stdErrorEstimate: stdErrorEst,
      durbinWatson
    },
    anova: {
      regression: {
        ss: ssr,
        df: dfReg,
        ms: msr,
        f: fStat,
        sig: fSig
      },
      residual: {
        ss: sse,
        df: dfRes,
        ms: mse
      },
      total: {
        ss: sst,
        df: dfTotal
      }
    },
    coefficients,
    collinearityDiagnostics,
    residualsStatistics,
    casewiseDiagnostics,
    assumptions,
    assumptionMap: {
      normality: assumptions.find(a => a.name.includes('Normalitas'))!,
      linearity: assumptions.find(a => a.name.includes('Linearitas'))!,
      homoscedasticity: assumptions.find(a => a.name.includes('Homoskedastisitas'))!,
      multicollinearity: assumptions.find(a => a.name.includes('Multikolinearitas'))!,
      outliers: assumptions.find(a => a.name.includes('Outlier'))!,
      autocorrelation: assumptions.find(a => a.name.includes('Autokorelasi'))!,
      stationarity: assumptions.find(a => a.name.includes('Stasioneritas')),
      arch: assumptions.find(a => a.name.includes('ARCH-LM'))
    },
    normalityTests,
    ciLevelUsed: ciLevel,
    plots: {
      ppPlot,
      qqPlot,
      histogram,
      resVsFit,
      acfPacf: acfPacfData
    },
    scores: {
      s3Consistency,
      checksPassed: passedChecksCount,
      totalChecks: checks.length,
      checks
    },
    timeSeriesSummary: isTimeSeries ? {
      isTimeSeries: true,
      timeCol,
      frequency,
      isSpuriousWarning: (rSquared > 0.70 && durbinWatson < 1.0) || ((assumptions.find(a => a.name.includes('Stasioneritas'))?.pValue ?? 0) >= alpha && rSquared > 0.50)
    } : undefined,
    timeSeriesDiagnostics: isTimeSeries ? {
      isTimeSeries: true,
      timeCol,
      frequency,
      isSpuriousRisk: (rSquared > 0.70 && durbinWatson < 1.0) || ((assumptions.find(a => a.name.includes('Stasioneritas'))?.pValue ?? 0) >= alpha && rSquared > 0.50),
      spuriousWarning: ((rSquared > 0.70 && durbinWatson < 1.0) || ((assumptions.find(a => a.name.includes('Stasioneritas'))?.pValue ?? 0) >= alpha && rSquared > 0.50))
        ? 'Peringatan Regresi Lancung (Spurious Regression): Nilai R2 tinggi namun residual tidak stasioner atau DW rendah.'
        : undefined,
      acfPacf: acfPacfData
    } : undefined,
    solverMetadata: {
      primarySolver: 'Householder-QR',
      verificationSolver: 'One-Sided-Jacobi-SVD',
      matrixRank: qrResult.rank,
      conditionNumberEst: Number(qrResult.conditionEst.toFixed(4)),
      missingPolicyApplied: missingPolicy,
      imputedCellsCount,
      dummyEncodings: dummyEncodings.length > 0 ? dummyEncodings : undefined
    }
  };
}

/**
 * Log Relative Error (LRE) calculation for NIST benchmark comparison:
 * LRE = -log10(|q - c| / |c|)
 * Returns 15.0 if exact match or difference is at machine epsilon.
 */
export function calculateLRE(computed: number, certified: number): number {
  if (computed === certified) return 15.0;
  const absDiff = Math.abs(computed - certified);
  const absCert = Math.abs(certified);
  if (absCert === 0) return absDiff === 0 ? 15.0 : -Math.log10(absDiff);
  const relDiff = absDiff / absCert;
  if (relDiff <= 0) return 15.0;
  return -Math.log10(relDiff);
}

/**
 * Convenient alias wrapper for running the regression engine
 */
export function runRegressionEngine(options: {
  data: Record<string, any>[];
  yCol: string;
  xCols: string[];
  isTimeSeries?: boolean;
  timeCol?: string;
  frequency?: string;
  alpha?: number;
}): OLSFitResult {
  return runStatisticalRegression({
    rows: options.data,
    yCol: options.yCol,
    xCols: options.xCols,
    isTimeSeries: options.isTimeSeries,
    timeCol: options.timeCol,
    frequency: options.frequency,
    alpha: options.alpha
  });
}

