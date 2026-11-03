/**
 * Regression Remedial & Honest Reporting Engine
 *
 * Implements statistically valid assumption remediations,
 * honest reporting tracking (M0 permanent baseline, K specifications),
 * Invariant I10 enforcement (remedials never triggered by coefficient p-values),
 * Box-Cox regression likelihood profiling, HC3 covariance, and Wilson score intervals.
 */

import { OLSFitResult, runRegressionEngine } from "./regression-engine";

export interface OutlierCase {
  index: number;
  rowNumber: number;
  yActual: number;
  yPred: number;
  residual: number;
  studentizedResidual: number;
  cooksD: number;
  isEligible: boolean;
}

export interface BoxCoxProfileResult {
  optimalLambda: number;
  roundedLambda: number;
  ciLower: number;
  ciUpper: number;
  shiftConstant: number;
  profileLogLikelihood: Array<{ lambda: number; logLik: number }>;
}

export interface WilsonInterval {
  center: number;
  lower: number;
  upper: number;
  passes: number;
  total: number;
}

export interface RemedialOption {
  type:
    | "outlier_removal"
    | "transformation"
    | "robust_hc3"
    | "robust_rlm"
    | "quantile"
    | "bootstrap"
    | "wls"
    | "orthog"
    | "collinearity_drop"
    | "ridge"
    | "pca"
    | "polynomial"
    | "hac_newey_west"
    | "cochrane_orcutt"
    | "first_difference"
    | "arx_lag"
    | "low_r2_pathway";
  title: string;
  description: string;
  targetAssumption: string;
  notes: string;
  normalityPassRateApplicable: boolean;
  statusLabel: "Konfirmatori" | "Eksploratori";
}

/**
 * Invariant I10: Permitted Remedials Filter
 * Strictly checks diagnostic assumption test statuses.
 * NEVER accepts, inspects, or evaluates predictor coefficient p-values!
 */
export function getPermittedRemedials(
  assumptions: Array<{ name: string; status: string; pValue?: number | null }>,
  isTimeSeries: boolean
): RemedialOption[] {
  const options: RemedialOption[] = [];
  const failedAssumptions = assumptions.filter(
    (a) => a.status === "gagal" || a.status === "waspada"
  );

  const hasNonNormal = failedAssumptions.some((a) =>
    a.name.toLowerCase().includes("normalitas")
  );
  const hasHetero = failedAssumptions.some((a) =>
    a.name.toLowerCase().includes("homoskedastisitas") ||
    a.name.toLowerCase().includes("breusch-pagan") ||
    a.name.toLowerCase().includes("arch")
  );
  const hasMulticol = failedAssumptions.some((a) =>
    a.name.toLowerCase().includes("multikolinearitas") || a.name.toLowerCase().includes("vif")
  );
  const hasNonLinear = failedAssumptions.some((a) =>
    a.name.toLowerCase().includes("linearitas") || a.name.toLowerCase().includes("reset")
  );
  const hasOutlier = failedAssumptions.some((a) =>
    a.name.toLowerCase().includes("outlier") || a.name.toLowerCase().includes("cook")
  );
  const hasAutocorr = failedAssumptions.some(
    (a) =>
      a.name.toLowerCase().includes("autokorelasi") ||
      a.name.toLowerCase().includes("durbin-watson") ||
      a.name.toLowerCase().includes("breusch-godfrey") ||
      a.name.toLowerCase().includes("ljung-box")
  );
  const hasNonStationary = failedAssumptions.some(
    (a) =>
      a.name.toLowerCase().includes("stasioneritas") ||
      a.name.toLowerCase().includes("adf") ||
      a.name.toLowerCase().includes("kpss")
  );

  // 1. Residu tidak normal
  if (hasNonNormal || hasOutlier) {
    options.push({
      type: "outlier_removal",
      title: "Hapus Kasus Berpengaruh (Maks. 5% Data)",
      description: "Menghapus kasus terdeteksi (|t| > 3 atau Cook's D > 4/n) dengan konfirmasi per baris.",
      targetAssumption: "Uji Normalitas & Outlier",
      notes: "Wajib disertai analisis sensitivitas (dengan dan tanpa outlier).",
      normalityPassRateApplicable: true,
      statusLabel: "Konfirmatori",
    });
    options.push({
      type: "transformation",
      title: "Transformasi Variabel (Log, Akar, Box-Cox)",
      description: "Menstabilkan varians dan mendekatkan residual ke distribusi normal.",
      targetAssumption: "Uji Normalitas",
      notes: "Box-Cox dihitung dari profil likelihood model regresi. Nilai R² tidak sebanding lintas skala Y.",
      normalityPassRateApplicable: true,
      statusLabel: "Konfirmatori",
    });
    options.push({
      type: "robust_hc3",
      title: "Estimator Galat Baku Robust (HC3)",
      description: "Mengoreksi galat baku inferensial tanpa mengubah estimasi koefisien B.",
      targetAssumption: "Uji Normalitas / Heteroskedastisitas",
      notes: "HC3 tidak mengubah bentuk residual, namun membuat uji hipotesis t/F menjadi valid.",
      normalityPassRateApplicable: false,
      statusLabel: "Konfirmatori",
    });
  }

  // 2. Heteroskedastisitas
  if (hasHetero) {
    if (!options.some((o) => o.type === "robust_hc3")) {
      options.push({
        type: "robust_hc3",
        title: "Galat Baku Heteroskedasticity-Consistent (HC3)",
        description: "Mengoreksi kovarians ragam galat baku terhadap heteroskedastisitas.",
        targetAssumption: "Uji Homoskedastisitas",
        notes: "Standar emas White-MacKinnon HC3 untuk sampel berukuran sedang-kecil.",
        normalityPassRateApplicable: false,
        statusLabel: "Konfirmatori",
      });
    }
    options.push({
      type: "wls",
      title: "Weighted Least Squares (WLS — Pembobotan Ragam)",
      description: "Membobot observasi dengan 1/sigma_i dari regresi bantu ln(e^2) untuk memulihkan homoskedastisitas.",
      targetAssumption: "Uji Homoskedastisitas",
      notes: "Efisien secara asimtotik ketika pola heteroskedastisitas proporsional terhadap prediktor.",
      normalityPassRateApplicable: true,
      statusLabel: "Konfirmatori",
    });
  }

  // 3. Multikolinearitas (VIF > 10)
  if (hasMulticol) {
    options.push({
      type: "orthog",
      title: "Ortogonalisasi Gram-Schmidt (orthog — VIF = 1.00)",
      description: "Mentransformasikan prediktor yang kolinear menjadi ortogonal saling bebas (VIF = 1.000) tanpa membuang variabel.",
      targetAssumption: "Uji Multikolinearitas",
      notes: "Mempertahankan seluruh informasi variabel X dan R² model secara eksak sambil menghilangkan multikolinearitas.",
      normalityPassRateApplicable: false,
      statusLabel: "Konfirmatori",
    });
    options.push({
      type: "collinearity_drop",
      title: "Eliminasi Variabel Redundan (Drop VIF Tertinggi)",
      description: "Menghapus prediktor dengan VIF paling ekstrem untuk menstabilkan matriks desain X.",
      targetAssumption: "Uji Multikolinearitas",
      notes: "Memerlukan justifikasi teoretis agar tidak memicu omitted variable bias.",
      normalityPassRateApplicable: false,
      statusLabel: "Eksploratori",
    });
  }

  // 4. Non-Linearitas
  if (hasNonLinear) {
    options.push({
      type: "polynomial",
      title: "Bentuk Polinomial Kuadratik Terpusat",
      description: "Menambahkan suku kuadratik (X - mean(X))^2 untuk menangkap kelengkungan.",
      targetAssumption: "Uji Linearitas (RESET)",
      notes: "Pemusatan variabel wajib dilakukan untuk mencegah multikolinearitas buatan.",
      normalityPassRateApplicable: false,
      statusLabel: "Eksploratori",
    });
  }

  // 5. Time Series Autokorelasi & Non-Stasioneritas
  if (isTimeSeries || hasAutocorr || hasNonStationary) {
    options.push({
      type: "hac_newey_west",
      title: "Galat Baku HAC Newey-West (Bartlett Kernel)",
      description: "Koreksi galat baku terhadap autokorelasi serial dan heteroskedastisitas time series.",
      targetAssumption: "Uji Autokorelasi & Time Series",
      notes: "Lag otomatis L dihitung menurut kaidah Newey-West L = floor(4*(n/100)^(2/9)).",
      normalityPassRateApplicable: false,
      statusLabel: "Konfirmatori",
    });
    options.push({
      type: "cochrane_orcutt",
      title: "Transformasi Cochrane-Orcutt / Prais-Winsten AR(1) (GLSAR)",
      description: "Mengestimasi koefisien autokorelasi rho dan mentransformasi Y_t - rho*Y_{t-1} agar Durbin-Watson mendekati 2.0.",
      targetAssumption: "Uji Autokorelasi (Durbin-Watson / Breusch-Godfrey)",
      notes: "Menghilangkan autokorelasi AR(1) secara struktural pada residual.",
      normalityPassRateApplicable: true,
      statusLabel: "Konfirmatori",
    });
    options.push({
      type: "first_difference",
      title: "Transformasi First-Difference (Delta Y_t, Delta X_t)",
      description: "Menurunkan deret waktu I(1) menjadi selisih pertama untuk mengatasi ketidakstasioneran (ADF/KPSS) dan regresi lancung (Spurious Regression R² > DW).",
      targetAssumption: "Stasioneritas Time Series & Regresi Lancung",
      notes: "Solusi baku Granger-Newbold untuk data time series non-stasioner.",
      normalityPassRateApplicable: true,
      statusLabel: "Konfirmatori",
    });
  }

  return options;
}

/**
 * Deteksi Kasus Outlier Berpengaruh
 * (|t_studentized| > 3 atau Cook's D > 4/n)
 */
export function detectOutliers(result: OLSFitResult, y: number[], x: number[][]): OutlierCase[] {
  const n = y.length;
  const k = x[0].length;
  const s2 = result.anova?.residual?.ms ?? 1;
  const cooksThreshold = 4 / n;

  // Compute leverage h_ii
  // X with constant
  const X = x.map((row) => [1, ...row]);
  const p = k + 1;

  // (X^T X)^-1
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        XtX[r][c] += X[i][r] * X[i][c];
      }
    }
  }
  const invXtX = invertMatrix(XtX);

  const cases: OutlierCase[] = [];

  for (let i = 0; i < n; i++) {
    // h_ii = x_i * inv(X^T X) * x_i^T
    let hii = 0;
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        hii += X[i][r] * invXtX[r][c] * X[i][c];
      }
    }
    hii = Math.max(0, Math.min(0.9999, hii));

    // Residual e_i
    let yPred = 0;
    for (let j = 0; j < result.coefficients.length; j++) {
      yPred += result.coefficients[j].b * X[i][j];
    }
    const e_i = y[i] - yPred;

    // Studentized deleted residual
    // s_(i)^2 = ((n - p) s^2 - e_i^2 / (1 - h_ii)) / (n - p - 1)
    const dfRes = n - p;
    const numerator = dfRes * s2 - (e_i * e_i) / (1 - hii);
    const s_i2 = dfRes > 1 && numerator > 0 ? numerator / (dfRes - 1) : s2;
    const se_del = Math.sqrt(Math.max(1e-12, s_i2 * (1 - hii)));
    const studentized = e_i / se_del;

    // Cook's D
    const cooksD = (e_i * e_i * hii) / (p * s2 * (1 - hii) * (1 - hii) + 1e-12);

    const isEligible = Math.abs(studentized) > 3 || cooksD > cooksThreshold;

    cases.push({
      index: i,
      rowNumber: i + 1,
      yActual: y[i],
      yPred,
      residual: e_i,
      studentizedResidual: studentized,
      cooksD,
      isEligible,
    });
  }

  return cases;
}

/**
 * Penghapusan Outlier dengan Penegakan Batas Kumulatif 5%
 */
export function applyOutlierRemoval(
  y: number[],
  x: number[][],
  selectedIndices: number[],
  totalOriginalN: number
): { y: number[]; x: number[][]; removedIndices: number[] } {
  const maxAllowed = Math.floor(0.05 * totalOriginalN);
  if (selectedIndices.length > maxAllowed) {
    throw new Error(
      `Pelanggaran Batas Remedial: Penghapusan outlier dibatasi kumulatif maksimal 5 persen dari data (Maksimal ${maxAllowed} baris, Anda memilih ${selectedIndices.length} baris).`
    );
  }

  const removeSet = new Set(selectedIndices);
  const newY: number[] = [];
  const newX: number[][] = [];

  for (let i = 0; i < y.length; i++) {
    if (!removeSet.has(i)) {
      newY.push(y[i]);
      newX.push([...x[i]]);
    }
  }

  return {
    y: newY,
    x: newX,
    removedIndices: [...selectedIndices],
  };
}

/**
 * Box-Cox Profile Log-Likelihood Search
 * Menghitung nilai lambda optimal pada model regresi linear
 */
export function computeBoxCoxProfile(y: number[], x: number[][]): BoxCoxProfileResult {
  const n = y.length;
  const minY = Math.min(...y);
  const shiftConstant = minY <= 0 ? Math.abs(minY) + 1 : 0;
  const yShifted = y.map((v) => v + shiftConstant);

  // Geometric mean
  let sumLog = 0;
  for (let i = 0; i < n; i++) {
    sumLog += Math.log(yShifted[i]);
  }
  const geoMean = Math.exp(sumLog / n);

  // Evaluate lambdas from -2.0 to 2.0 with step 0.1
  const lambdas: number[] = [];
  for (let l = -20; l <= 20; l++) {
    lambdas.push(l / 10);
  }

  const X = x.map((row) => [1, ...row]);
  const p = X[0].length;
  const invXtX = invertMatrix(computeXtX(X));

  const profileLogLikelihood: Array<{ lambda: number; logLik: number }> = [];
  let maxLogLik = -Infinity;
  let optimalLambda = 1;

  for (const lam of lambdas) {
    // Transform Y
    const yTrans: number[] = [];
    for (let i = 0; i < n; i++) {
      const yi = yShifted[i];
      let val = 0;
      if (Math.abs(lam) < 1e-4) {
        val = geoMean * Math.log(yi);
      } else {
        val = (Math.pow(yi, lam) - 1) / (lam * Math.pow(geoMean, lam - 1));
      }
      yTrans.push(val);
    }

    // Regress yTrans on X
    // b = inv(X^T X) X^T y
    const Xty = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        Xty[j] += X[i][j] * yTrans[i];
      }
    }
    const b = new Array(p).fill(0);
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        b[i] += invXtX[i][j] * Xty[j];
      }
    }

    // SSE
    let sse = 0;
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let j = 0; j < p; j++) {
        pred += b[j] * X[i][j];
      }
      const diff = yTrans[i] - pred;
      sse += diff * diff;
    }
    const s2 = Math.max(1e-12, sse / n);
    const logLik = -0.5 * n * Math.log(s2);

    profileLogLikelihood.push({ lambda: lam, logLik });
    if (logLik > maxLogLik) {
      maxLogLik = logLik;
      optimalLambda = lam;
    }
  }

  // 95% Confidence Interval for lambda: logLik >= maxLogLik - 1.9207
  const ciThreshold = maxLogLik - 1.9207;
  const eligibleLambdas = profileLogLikelihood
    .filter((item) => item.logLik >= ciThreshold)
    .map((item) => item.lambda);

  const ciLower = eligibleLambdas.length > 0 ? Math.min(...eligibleLambdas) : optimalLambda - 0.2;
  const ciUpper = eligibleLambdas.length > 0 ? Math.max(...eligibleLambdas) : optimalLambda + 0.2;

  // Rounded meaningful lambda
  const meaningfulValues = [-2, -1, -0.5, 0, 0.5, 1, 2];
  let roundedLambda = optimalLambda;
  let minDiff = Infinity;
  for (const m of meaningfulValues) {
    if (m >= ciLower && m <= ciUpper) {
      const diff = Math.abs(m - optimalLambda);
      if (diff < minDiff) {
        minDiff = diff;
        roundedLambda = m;
      }
    }
  }

  return {
    optimalLambda,
    roundedLambda,
    ciLower,
    ciUpper,
    shiftConstant,
    profileLogLikelihood,
  };
}

/**
 * Transformasi Array Y
 */
export function applyTransformation(
  y: number[],
  type: "ln" | "log10" | "sqrt" | "box_cox",
  lambda = 1,
  shiftConstant = 0
): number[] {
  return y.map((val) => {
    const shifted = val + shiftConstant;
    if (shifted <= 0 && (type === "ln" || type === "log10" || type === "sqrt")) {
      throw new Error(`Nilai Y non-positif (${shifted}) tidak dapat ditransformasi ${type}.`);
    }
    switch (type) {
      case "ln":
        return Math.log(shifted);
      case "log10":
        return Math.log10(shifted);
      case "sqrt":
        return Math.sqrt(shifted);
      case "box_cox":
        if (Math.abs(lambda) < 1e-4) {
          return Math.log(shifted);
        }
        return (Math.pow(shifted, lambda) - 1) / lambda;
    }
  });
}

/**
 * HC3 Heteroskedasticity-Consistent Covariance Matrix
 * V_HC3 = (X^T X)^-1 X^T diag(e_i^2 / (1 - h_ii)^2) X (X^T X)^-1
 */
export function computeHC3StandardErrors(y: number[], x: number[][], b: number[]): number[] {
  const n = y.length;
  const X = x.map((row) => [1, ...row]);
  const p = X[0].length;
  const invXtX = invertMatrix(computeXtX(X));

  // Compute leverage h_ii and residuals
  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    let hii = 0;
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        hii += X[i][r] * invXtX[r][c] * X[i][c];
      }
    }
    hii = Math.max(0, Math.min(0.9999, hii));

    let pred = 0;
    for (let j = 0; j < p; j++) {
      pred += b[j] * X[i][j];
    }
    const e_i = y[i] - pred;
    const denom = Math.max(1e-6, 1 - hii);
    weights.push((e_i * e_i) / (denom * denom));
  }

  // Middle matrix M = X^T diag(weights) X
  const M: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    const w = weights[i];
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        M[r][c] += X[i][r] * w * X[i][c];
      }
    }
  }

  // V_HC3 = invXtX * M * invXtX
  const temp: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let r = 0; r < p; r++) {
    for (let c = 0; c < p; c++) {
      for (let k = 0; k < p; k++) {
        temp[r][c] += invXtX[r][k] * M[k][c];
      }
    }
  }

  const V_HC3: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let r = 0; r < p; r++) {
    for (let c = 0; c < p; c++) {
      for (let k = 0; k < p; k++) {
        V_HC3[r][c] += temp[r][k] * invXtX[k][c];
      }
    }
  }

  return V_HC3.map((row, idx) => Math.sqrt(Math.max(1e-12, row[idx])));
}

/**
 * HAC Newey-West Lag Formula
 * L = floor(4 * (n / 100)^(2/9))
 */
export function computeHACNeweyWestLag(n: number): number {
  return Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));
}

/**
 * Wilson Score 95% Confidence Interval for Pass Rate
 */
export function calculateWilsonScoreInterval(passes: number, total: number, alpha = 0.05): WilsonInterval {
  if (total <= 0) {
    return { center: 0, lower: 0, upper: 0, passes: 0, total: 0 };
  }
  const p = passes / total;
  const z = 1.95996398454; // 95% two-tailed normal
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;

  return {
    center: center * 100,
    lower: Math.max(0, (center - margin) * 100),
    upper: Math.min(100, (center + margin) * 100),
    passes,
    total,
  };
}

/**
 * Minimum Detectable Effect Size (MDES) f^2
 * Cohen's f^2 = R^2 / (1 - R^2)
 * Based on non-central F approximation at alpha, power = 0.8
 */
export function computeMDES(n: number, k: number, alpha = 0.05, power = 0.8): number {
  const df1 = k;
  const df2 = Math.max(1, n - k - 1);
  // Approximation for non-centrality lambda required for power = 0.80 at alpha = 0.05
  // lambda ~ (z_{1-alpha/2} + z_{power})^2 * (df1 + df2)/df2
  const zAlpha = 1.95996;
  const zBeta = 0.84162;
  const lambda = Math.pow(zAlpha + zBeta, 2) * ((df1 + df2) / df2);
  const f2 = lambda / n;
  return Math.max(0.01, f2);
}

// Matrix Utility Helpers
function computeXtX(X: number[][]): number[][] {
  const n = X.length;
  const p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        XtX[r][c] += X[i][r] * X[i][c];
      }
    }
  }
  return XtX;
}

function invertMatrix(M: number[][]): number[][] {
  const n = M.length;
  const A = M.map((row) => [...row]);
  const I: number[][] = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? 1 : 0))
  );

  for (let i = 0; i < n; i++) {
    let pivot = A[i][i];
    let pivotRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(pivot)) {
        pivot = A[r][i];
        pivotRow = r;
      }
    }
    if (Math.abs(pivot) < 1e-12) {
      // Small regularization
      pivot = 1e-12;
      A[i][i] += 1e-12;
    }
    if (pivotRow !== i) {
      [A[i], A[pivotRow]] = [A[pivotRow], A[i]];
      [I[i], I[pivotRow]] = [I[pivotRow], I[i]];
    }

    const invPivot = 1 / A[i][i];
    for (let j = 0; j < n; j++) {
      A[i][j] *= invPivot;
      I[i][j] *= invPivot;
    }

    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = A[r][i];
        for (let c = 0; c < n; c++) {
          A[r][c] -= factor * A[i][c];
          I[r][c] -= factor * I[i][c];
        }
      }
    }
  }

  return I;
}

export interface PassRateResult {
  passRate: number; // 0 - 100%
  wilsonCiLower: number;
  wilsonCiUpper: number;
  b: number; // e.g. 1000
  subsampleSize: number; // floor(0.8n)
  m0PassRate?: number;
  isApplicable: boolean;
  inapplicabilityReason?: string;
  heuristic: "stabil" | "borderline" | "tidak_stabil";
}

/**
 * Normality Pass Rate (PR)
 * B = 1000 subsamples of size m = floor(0.8n)
 * Evaluates residual normality across subsamples
 */
export function calculateNormalityPassRate(
  y: number[],
  x: number[][],
  isTimeSeries: boolean,
  methodApplicable = true,
  inapplicabilityReason?: string,
  b = 1000
): PassRateResult {
  if (!methodApplicable) {
    return {
      passRate: 0,
      wilsonCiLower: 0,
      wilsonCiUpper: 0,
      b,
      subsampleSize: Math.floor(0.8 * y.length),
      isApplicable: false,
      inapplicabilityReason:
        inapplicabilityReason || "Metode ini tidak bergantung pada asumsi normalitas residual.",
      heuristic: "tidak_stabil",
    };
  }

  const n = y.length;
  const m = Math.max(10, Math.floor(0.8 * n));
  const p = x[0].length + 1;
  let passes = 0;

  // PRNG with fixed seed
  let seed = 123456789;
  const prng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const X = x.map((row) => [1, ...row]);

  for (let it = 0; it < b; it++) {
    let sampleIndices: number[] = [];

    if (isTimeSeries) {
      // Contiguous window for time series
      const maxStart = Math.max(0, n - m);
      const start = maxStart > 0 ? Math.floor(prng() * (maxStart + 1)) : 0;
      sampleIndices = Array.from({ length: m }, (_, i) => start + i);
    } else {
      // Random sample without replacement
      const available = Array.from({ length: n }, (_, i) => i);
      for (let i = 0; i < m; i++) {
        const pickIdx = Math.floor(prng() * available.length);
        sampleIndices.push(available[pickIdx]);
        available[pickIdx] = available[available.length - 1];
        available.pop();
      }
    }

    // Fit quick OLS on subsample
    const subX = sampleIndices.map((idx) => X[idx]);
    const subY = sampleIndices.map((idx) => y[idx]);

    try {
      const invXtX = invertMatrix(computeXtX(subX));
      const Xty = new Array(p).fill(0);
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < p; j++) {
          Xty[j] += subX[i][j] * subY[i];
        }
      }
      const beta = new Array(p).fill(0);
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          beta[i] += invXtX[i][j] * Xty[j];
        }
      }

      // Residuals
      const res: number[] = [];
      let meanRes = 0;
      for (let i = 0; i < m; i++) {
        let pred = 0;
        for (let j = 0; j < p; j++) {
          pred += beta[j] * subX[i][j];
        }
        const diff = subY[i] - pred;
        res.push(diff);
        meanRes += diff;
      }
      meanRes /= m;

      // Jarque-Bera / Lilliefors normality test on subsample residuals
      let m2 = 0;
      let m3 = 0;
      let m4 = 0;
      for (let i = 0; i < m; i++) {
        const d = res[i] - meanRes;
        m2 += d * d;
        m3 += d * d * d;
        m4 += d * d * d * d;
      }
      m2 /= m;
      m3 /= m;
      m4 /= m;

      const skew = m2 > 1e-12 ? m3 / Math.pow(m2, 1.5) : 0;
      const kurt = m2 > 1e-12 ? m4 / Math.pow(m2, 2) : 3;
      // Jarque-Bera statistic
      const jb = (m / 6) * (skew * skew + Math.pow(kurt - 3, 2) / 4);

      // Chi-square df=2 critical value at alpha=0.05 is 5.991
      // If jb < 5.991, normality is not rejected (pass)
      if (jb < 5.991) {
        passes++;
      }
    } catch {
      // Numerical failure treated as non-pass
    }
  }

  const wilson = calculateWilsonScoreInterval(passes, b, 0.05);
  const pr = (passes / b) * 100;
  const heuristic: "stabil" | "borderline" | "tidak_stabil" =
    pr >= 80 ? "stabil" : pr >= 50 ? "borderline" : "tidak_stabil";

  return {
    passRate: pr,
    wilsonCiLower: wilson.lower,
    wilsonCiUpper: wilson.upper,
    b,
    subsampleSize: m,
    isApplicable: true,
    heuristic,
  };
}

/**
 * HAC Newey-West Heteroskedasticity & Autocorrelation Consistent Standard Errors (Bartlett Kernel)
 * V_HAC = (X^T X)^-1 * (Omega_0 + sum_{l=1}^L w_l (Omega_l + Omega_l^T)) * (X^T X)^-1
 */
export function computeHACNeweyWestStandardErrors(
  y: number[],
  x: number[][],
  b: number[],
  lag?: number
): { se: number[]; lagUsed: number } {
  const n = y.length;
  const X = x.map((row) => [1, ...row]);
  const p = X[0].length;
  const invXtX = invertMatrix(computeXtX(X));
  const L = lag ?? computeHACNeweyWestLag(n);

  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < p; j++) {
      pred += b[j] * X[i][j];
    }
    residuals.push(y[i] - pred);
  }

  // Omega_0 = sum_{t=1}^n e_t^2 x_t x_t^T
  const S: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let t = 0; t < n; t++) {
    const e2 = residuals[t] * residuals[t];
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        S[r][c] += e2 * X[t][r] * X[t][c];
      }
    }
  }

  // Bartlett kernel lags l = 1..L
  for (let l = 1; l <= L; l++) {
    const wl = 1 - l / (L + 1);
    for (let t = l; t < n; t++) {
      const ee = residuals[t] * residuals[t - l];
      for (let r = 0; r < p; r++) {
        for (let c = 0; c < p; c++) {
          const term = ee * (X[t][r] * X[t - l][c] + X[t - l][r] * X[t][c]);
          S[r][c] += wl * term;
        }
      }
    }
  }

  // Small-sample correction n / (n - p)
  const dofFactor = n > p ? n / (n - p) : 1;

  // V_HAC = dofFactor * invXtX * S * invXtX
  const temp: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let r = 0; r < p; r++) {
    for (let c = 0; c < p; c++) {
      for (let k = 0; k < p; k++) {
        temp[r][c] += invXtX[r][k] * S[k][c];
      }
    }
  }

  const V_HAC: number[][] = Array.from({ length: p }, () => Array(p).fill(0));
  for (let r = 0; r < p; r++) {
    for (let c = 0; c < p; c++) {
      for (let k = 0; k < p; k++) {
        V_HAC[r][c] += dofFactor * temp[r][k] * invXtX[k][c];
      }
    }
  }

  return {
    se: V_HAC.map((row, idx) => Math.sqrt(Math.max(1e-12, row[idx]))),
    lagUsed: L,
  };
}

/**
 * Transformasi Cochrane-Orcutt / Prais-Winsten AR(1) (GLSAR) untuk Autokorelasi Time Series
 */
export function applyCochraneOrcuttAR1(
  rows: Record<string, any>[],
  yCol: string,
  xCols: string[],
  b: number[]
): { rows: Record<string, any>[]; rho: number } {
  const validRows = rows.filter(
    (r) =>
      r[yCol] !== undefined &&
      r[yCol] !== null &&
      !isNaN(Number(r[yCol])) &&
      xCols.every((c) => r[c] !== undefined && r[c] !== null && !isNaN(Number(r[c])))
  );
  const n = validRows.length;
  if (n < 4) {
    return { rows: validRows, rho: 0 };
  }

  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    let pred = b[0] || 0;
    for (let j = 0; j < xCols.length; j++) {
      pred += (b[j + 1] || 0) * Number(validRows[i][xCols[j]]);
    }
    residuals.push(Number(validRows[i][yCol]) - pred);
  }

  let num = 0;
  let den = 0;
  for (let t = 1; t < n; t++) {
    num += residuals[t] * residuals[t - 1];
    den += residuals[t - 1] * residuals[t - 1];
  }
  const rho = den > 1e-12 ? Math.max(-0.95, Math.min(0.95, num / den)) : 0;
  const pwFactor = Math.sqrt(Math.max(1e-6, 1 - rho * rho));

  const transformedRows: Record<string, any>[] = [];
  for (let t = 0; t < n; t++) {
    const newRow: Record<string, any> = { ...validRows[t] };
    if (t === 0) {
      // Prais-Winsten first observation retention
      newRow[yCol] = Number(validRows[0][yCol]) * pwFactor;
      for (const c of xCols) {
        newRow[c] = Number(validRows[0][c]) * pwFactor;
      }
    } else {
      newRow[yCol] = Number(validRows[t][yCol]) - rho * Number(validRows[t - 1][yCol]);
      for (const c of xCols) {
        newRow[c] = Number(validRows[t][c]) - rho * Number(validRows[t - 1][c]);
      }
    }
    transformedRows.push(newRow);
  }

  return {
    rows: transformedRows,
    rho: Number(rho.toFixed(4)),
  };
}

/**
 * Transformasi First-Difference (Delta Y_t, Delta X_t) untuk Data Time Series Non-Stasioner / Spurious Regression
 */
export function applyFirstDifferenceTimeSeries(
  rows: Record<string, any>[],
  yCol: string,
  xCols: string[]
): { rows: Record<string, any>[]; diffYCol: string; diffXCols: string[] } {
  const validRows = rows.filter(
    (r) =>
      r[yCol] !== undefined &&
      r[yCol] !== null &&
      !isNaN(Number(r[yCol])) &&
      xCols.every((c) => r[c] !== undefined && r[c] !== null && !isNaN(Number(r[c])))
  );
  const diffYCol = `d_${yCol}`;
  const diffXCols = xCols.map((c) => `d_${c}`);
  const diffRows: Record<string, any>[] = [];

  for (let t = 1; t < validRows.length; t++) {
    const newRow: Record<string, any> = { ...validRows[t] };
    newRow[diffYCol] = Number(validRows[t][yCol]) - Number(validRows[t - 1][yCol]);
    xCols.forEach((c, idx) => {
      newRow[diffXCols[idx]] = Number(validRows[t][c]) - Number(validRows[t - 1][c]);
    });
    diffRows.push(newRow);
  }

  return {
    rows: diffRows,
    diffYCol,
    diffXCols,
  };
}

/**
 * Weighted Least Squares (WLS) via Auxiliary Log-Squared Residual Variance Estimation
 */
export function applyWLSRegression(
  rows: Record<string, any>[],
  yCol: string,
  xCols: string[],
  b: number[]
): { rows: Record<string, any>[] } {
  const validRows = rows.filter(
    (r) =>
      r[yCol] !== undefined &&
      r[yCol] !== null &&
      !isNaN(Number(r[yCol])) &&
      xCols.every((c) => r[c] !== undefined && r[c] !== null && !isNaN(Number(r[c])))
  );
  const n = validRows.length;
  const X = validRows.map((r) => [1, ...xCols.map((c) => Number(r[c]))]);
  const p = X[0].length;

  // Compute log(e_i^2)
  const logE2: number[] = [];
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < p; j++) {
      pred += (b[j] || 0) * X[i][j];
    }
    const e = Number(validRows[i][yCol]) - pred;
    logE2.push(Math.log(Math.max(1e-8, e * e)));
  }

  // Regress log(e_i^2) on X to estimate sigma_i
  const invXtX = invertMatrix(computeXtX(X));
  const Xty = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * logE2[i];
    }
  }
  const gamma = new Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      gamma[i] += invXtX[i][j] * Xty[j];
    }
  }

  const wlsRows: Record<string, any>[] = [];
  for (let i = 0; i < n; i++) {
    let logVarHat = 0;
    for (let j = 0; j < p; j++) {
      logVarHat += gamma[j] * X[i][j];
    }
    const sigmaHat = Math.exp(0.5 * Math.max(-10, Math.min(10, logVarHat)));
    const weightSqrt = 1 / Math.max(1e-4, sigmaHat);
    const newRow: Record<string, any> = { ...validRows[i] };
    newRow[yCol] = Number(validRows[i][yCol]) * weightSqrt;
    for (const c of xCols) {
      newRow[c] = Number(validRows[i][c]) * weightSqrt;
    }
    wlsRows.push(newRow);
  }

  return { rows: wlsRows };
}

/**
 * Modified Gram-Schmidt Orthogonalization (orthog) untuk Mengatasi Multikolinearitas (VIF = 1.000)
 */
export function applyOrthogLinearRegression(
  rows: Record<string, any>[],
  yCol: string,
  xCols: string[]
): { rows: Record<string, any>[]; orthXCols: string[] } {
  const validRows = rows.filter(
    (r) =>
      r[yCol] !== undefined &&
      r[yCol] !== null &&
      !isNaN(Number(r[yCol])) &&
      xCols.every((c) => r[c] !== undefined && r[c] !== null && !isNaN(Number(r[c])))
  );
  const n = validRows.length;
  const k = xCols.length;
  if (n === 0 || k === 0) {
    return { rows: validRows, orthXCols: xCols };
  }

  const colsData: number[][] = xCols.map((col) => {
    const raw = validRows.map((r) => Number(r[col]));
    const mean = raw.reduce((s, v) => s + v, 0) / n;
    return raw.map((v) => v - mean);
  });

  const orthoBasis: number[][] = [];
  for (let j = 0; j < k; j++) {
    const v = [...colsData[j]];
    for (let m = 0; m < j; m++) {
      const u = orthoBasis[m];
      let dotVU = 0;
      let dotUU = 0;
      for (let i = 0; i < n; i++) {
        dotVU += v[i] * u[i];
        dotUU += u[i] * u[i];
      }
      const proj = dotUU > 1e-12 ? dotVU / dotUU : 0;
      for (let i = 0; i < n; i++) {
        v[i] -= proj * u[i];
      }
    }
    let ss = 0;
    for (let i = 0; i < n; i++) ss += v[i] * v[i];
    const std = Math.sqrt(ss / Math.max(1, n - 1));
    orthoBasis.push(std > 1e-12 ? v.map((val) => val / std) : v);
  }

  const orthXCols = xCols.map((c) => (c.startsWith("orth_") ? c : `orth_${c}`));
  const orthRows = validRows.map((r, i) => {
    const nextRow: Record<string, any> = { ...r };
    orthXCols.forEach((orthCol, j) => {
      nextRow[orthCol] = Number(orthoBasis[j][i].toFixed(6));
    });
    return nextRow;
  });

  return { rows: orthRows, orthXCols };
}

/**
 * Transformasi Double-Log (Log-Log: ln(Y) dan ln(X)) untuk Kelinearan & Optimasi R²
 */
export function applyDoubleLogTransformation(
  rows: Record<string, any>[],
  yCol: string,
  xCols: string[]
): { rows: Record<string, any>[]; lnYCol: string; lnXCols: string[] } {
  const validRows = rows.filter(
    (r) =>
      r[yCol] !== undefined &&
      r[yCol] !== null &&
      !isNaN(Number(r[yCol])) &&
      xCols.every((c) => r[c] !== undefined && r[c] !== null && !isNaN(Number(r[c])))
  );
  const allCols = [yCol, ...xCols];
  const shifts: Record<string, number> = {};
  for (const col of allCols) {
    const vals = validRows.map((r) => Number(r[col]));
    const minVal = vals.length > 0 ? Math.min(...vals) : 1;
    shifts[col] = minVal <= 0 ? Math.abs(minVal) + 1 : 0;
  }

  const lnYCol = yCol.startsWith("ln_") ? yCol : `ln_${yCol}`;
  const lnXCols = xCols.map((c) => (c.startsWith("ln_") ? c : `ln_${c}`));

  const transformedRows = validRows.map((r) => {
    const nextRow: Record<string, any> = { ...r };
    nextRow[lnYCol] = Number(Math.log(Number(r[yCol]) + shifts[yCol]).toFixed(6));
    xCols.forEach((c, idx) => {
      nextRow[lnXCols[idx]] = Number(Math.log(Number(r[c]) + shifts[c]).toFixed(6));
    });
    return nextRow;
  });

  return {
    rows: transformedRows,
    lnYCol,
    lnXCols,
  };
}

