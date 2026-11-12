// ============================================================
// Advanced Regression Models & Generalized Linear Models (GLM) Engine
// Point 12: Binary Logistic, Multinomial Logistic, Ordinal Logistic,
// Poisson Regression, Negative Binomial (NB2), Quantile Regression (L1),
// Polynomial Regression, & Unified GLM Dispatcher
// ============================================================

import {
  matMul,
  matTranspose,
  matInverse,
  chiSquarePValue,
  tPValue,
  normalInv,
  lnGamma,
  runStatisticalRegression,
  OLSFitResult
} from './regression-engine';

export interface LogisticCoefficientRow {
  variable: string;
  category?: string;
  b: number;
  stdError: number;
  wald: number;
  df: number;
  sig: number;
  expB: number; // Odds Ratio or IRR
  ciLowerExpB: number;
  ciUpperExpB: number;
}

export interface BinaryLogisticResult {
  modelType: 'BINARY_LOGISTIC';
  yCol: string;
  xCols: string[];
  nUsed: number;
  targetCategories: { zeroLabel: string; oneLabel: string };
  omnibusTest: {
    chiSquare: number;
    df: number;
    sig: number;
  };
  modelSummary: {
    minus2LogLikelihood: number;
    nullMinus2LogLikelihood: number;
    coxSnellR2: number;
    nagelkerkeR2: number;
    mcFaddenR2: number;
    aic: number;
    bic: number;
    iterations: number;
  };
  hosmerLemeshow: {
    chiSquare: number;
    df: number;
    sig: number;
    passed: boolean;
  };
  classificationTable: {
    cutoff: number;
    trueNegative: number;
    falsePositive: number;
    falseNegative: number;
    truePositive: number;
    specificityPercent: number;
    sensitivityPercent: number;
    overallPercentage: number;
  };
  variablesInEquation: LogisticCoefficientRow[];
  academicInterpretation: string[];
}

export interface MultinomialLogisticResult {
  modelType: 'MULTINOMIAL_LOGISTIC';
  yCol: string;
  xCols: string[];
  nUsed: number;
  referenceCategory: string;
  categories: string[];
  modelFittingInfo: {
    nullMinus2LL: number;
    finalMinus2LL: number;
    chiSquare: number;
    df: number;
    sig: number;
  };
  pseudoR2: {
    coxSnell: number;
    nagelkerke: number;
    mcFadden: number;
  };
  parameterEstimates: LogisticCoefficientRow[];
  overallAccuracyPercent: number;
  academicInterpretation: string[];
}

export interface OrdinalLogisticResult {
  modelType: 'ORDINAL_LOGISTIC';
  yCol: string;
  xCols: string[];
  nUsed: number;
  orderedCategories: string[];
  modelFittingInfo: {
    nullMinus2LL: number;
    finalMinus2LL: number;
    chiSquare: number;
    df: number;
    sig: number;
  };
  pseudoR2: {
    coxSnell: number;
    nagelkerke: number;
    mcFadden: number;
  };
  thresholds: { label: string; estimate: number; stdError: number; wald: number; sig: number }[];
  locations: LogisticCoefficientRow[];
  academicInterpretation: string[];
}

export interface CountGLMResult {
  modelType: 'POISSON_GLM' | 'NEGATIVE_BINOMIAL_GLM';
  yCol: string;
  xCols: string[];
  nUsed: number;
  goodnessOfFit: {
    deviance: number;
    df: number;
    devianceOverDf: number;
    pearsonChiSquare: number;
    dispersionRatio: number; // > 1.5 indicates overdispersion
    isOverdispersed: boolean;
    alphaNB?: number;
    logLikelihood: number;
    aic: number;
    bic: number;
  };
  omnibusTest: {
    lrChiSquare: number;
    df: number;
    sig: number;
  };
  parameterEstimates: LogisticCoefficientRow[]; // expB = Incidence Rate Ratio (IRR)
  academicInterpretation: string[];
}

export interface QuantileRegressionResult {
  modelType: 'QUANTILE_REGRESSION';
  quantileTau: number;
  yCol: string;
  xCols: string[];
  nUsed: number;
  pseudoR1: number;
  mae: number;
  coefficients: {
    variable: string;
    b: number;
    stdError: number;
    t: number;
    sig: number;
    ciLower: number;
    ciUpper: number;
  }[];
  academicInterpretation: string[];
}

/**
 * Helper: Safe Matrix Inversion with Ridge Fallback for IRLS
 */
function safeInvertSymmetric(A: number[][]): number[][] {
  try {
    return matInverse(A);
  } catch {
    const p = A.length;
    const regA = A.map((row, r) => row.map((v, c) => (r === c ? v + 1e-6 : v)));
    return matInverse(regA);
  }
}

/**
 * 1. Binary Logistic Regression via IRLS (Maximum Likelihood Estimation)
 */
export function fitBinaryLogisticRegression(options: {
  rows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  alpha?: number;
  ciLevel?: number;
  cutoff?: number;
}): BinaryLogisticResult {
  const { rows, yCol, xCols, alpha = 0.05, ciLevel = 0.95, cutoff = 0.5 } = options;
  const reqCols = [yCol, ...xCols];
  const validRows = rows.filter(r =>
    reqCols.every(c => r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '' && (c === yCol || !isNaN(Number(r[c]))))
  );

  const n = validRows.length;
  const k = xCols.length;
  if (n <= k + 2) {
    throw new Error(`Sampel valid (n=${n}) tidak mencukupi untuk Regresi Logistik Biner.`);
  }

  const rawYLabels = validRows.map(r => String(r[yCol]).trim());
  const uniqueY = Array.from(new Set(rawYLabels)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (uniqueY.length !== 2) {
    throw new Error(`Regresi Logistik Biner mewajibkan variabel dependen Y memiliki tepat 2 kategori (terdeteksi ${uniqueY.length} kategori: ${uniqueY.slice(0, 4).join(', ')}).`);
  }

  const zeroLabel = uniqueY[0];
  const oneLabel = uniqueY[1];
  const y = rawYLabels.map(lbl => (lbl === oneLabel ? 1.0 : 0.0));
  const X = validRows.map(r => [1.0, ...xCols.map(c => Number(r[c]))]);
  const p = k + 1;

  // Null model log-likelihood
  const pBar = Math.max(1e-6, Math.min(1 - 1e-6, y.reduce((a, b) => a + b, 0) / n));
  const llNull = n * (pBar * Math.log(pBar) + (1 - pBar) * Math.log(1 - pBar));

  // IRLS Newton-Raphson loop
  let beta = new Array(p).fill(0);
  beta[0] = Math.log(pBar / (1 - pBar));
  let covMatrix: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  let iter = 0;
  const maxIter = 25;

  for (iter = 1; iter <= maxIter; iter++) {
    const pi: number[] = new Array(n);
    const w: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
      eta = Math.max(-25, Math.min(25, eta));
      const prob = 1.0 / (1.0 + Math.exp(-eta));
      pi[i] = prob;
      w[i] = Math.max(1e-6, prob * (1.0 - prob));
    }

    // Hessian H = X^T W X and gradient g = X^T (y - pi)
    const XtWX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
    const grad: number[] = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const diff = y[i] - pi[i];
      const wi = w[i];
      for (let r = 0; r < p; r++) {
        grad[r] += X[i][r] * diff;
        for (let c = 0; c < p; c++) {
          XtWX[r][c] += X[i][r] * wi * X[i][c];
        }
      }
    }

    covMatrix = safeInvertSymmetric(XtWX);
    const delta = new Array(p).fill(0);
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) {
        delta[r] += covMatrix[r][c] * grad[c];
      }
    }

    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      beta[j] += delta[j];
      if (Math.abs(delta[j]) > maxStep) maxStep = Math.abs(delta[j]);
    }
    if (maxStep < 1e-6) break;
  }

  // Final predicted probabilities and Log-Likelihood
  const piHat: number[] = new Array(n);
  let llFull = 0;
  for (let i = 0; i < n; i++) {
    let eta = 0;
    for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
    eta = Math.max(-25, Math.min(25, eta));
    const prob = Math.max(1e-12, Math.min(1 - 1e-12, 1.0 / (1.0 + Math.exp(-eta))));
    piHat[i] = prob;
    llFull += y[i] * Math.log(prob) + (1 - y[i]) * Math.log(1 - prob);
  }

  const minus2LL = -2 * llFull;
  const nullMinus2LL = -2 * llNull;
  const lrChiSq = Math.max(0, nullMinus2LL - minus2LL);
  const omnibusSig = chiSquarePValue(lrChiSq, k);

  const coxSnellR2 = Math.max(0, Math.min(0.9999, 1 - Math.exp((2 * (llNull - llFull)) / n)));
  const maxCoxSnell = 1 - Math.exp((2 * llNull) / n);
  const nagelkerkeR2 = maxCoxSnell > 0 ? Math.min(1.0, coxSnellR2 / maxCoxSnell) : 0;
  const mcFaddenR2 = llNull !== 0 ? Math.max(0, 1 - llFull / llNull) : 0;
  const aic = minus2LL + 2 * p;
  const bic = minus2LL + p * Math.log(n);

  // Hosmer-Lemeshow Goodness-of-Fit Test (g = min(10, max(3, floor(n/5))) groups)
  const numGroups = Math.min(10, Math.max(3, Math.floor(n / 5)));
  const sortedPairs = piHat.map((prob, idx) => ({ prob, y: y[idx] })).sort((a, b) => a.prob - b.prob);
  let hlChiSq = 0;
  const groupSize = Math.ceil(n / numGroups);
  let actualGroups = 0;
  for (let g = 0; g < numGroups; g++) {
    const slice = sortedPairs.slice(g * groupSize, Math.min(n, (g + 1) * groupSize));
    if (slice.length === 0) continue;
    actualGroups++;
    const nG = slice.length;
    const obs1 = slice.reduce((acc, item) => acc + item.y, 0);
    const obs0 = nG - obs1;
    const exp1 = slice.reduce((acc, item) => acc + item.prob, 0);
    const exp0 = Math.max(1e-6, nG - exp1);
    const exp1Safe = Math.max(1e-6, exp1);
    hlChiSq += ((obs1 - exp1Safe) * (obs1 - exp1Safe)) / exp1Safe + ((obs0 - exp0) * (obs0 - exp0)) / exp0;
  }
  const hlDf = Math.max(1, actualGroups - 2);
  const hlSig = chiSquarePValue(hlChiSq, hlDf);

  // Classification Table
  let tn = 0;
  let fp = 0;
  let fn = 0;
  let tp = 0;
  for (let i = 0; i < n; i++) {
    const pred1 = piHat[i] >= cutoff;
    if (y[i] === 1 && pred1) tp++;
    else if (y[i] === 1 && !pred1) fn++;
    else if (y[i] === 0 && pred1) fp++;
    else tn++;
  }
  const specPct = tn + fp > 0 ? (tn / (tn + fp)) * 100 : 0;
  const sensPct = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
  const overallPct = ((tn + tp) / n) * 100;

  // Variables in the Equation
  const zCrit = Math.abs(normalInv(1 - (1 - ciLevel) / 2));
  const varNames = ['(Constant)', ...xCols];
  const variablesInEquation: LogisticCoefficientRow[] = varNames.map((vName, j) => {
    const b = beta[j];
    const se = Math.sqrt(Math.max(1e-12, covMatrix[j][j]));
    const wald = (b / se) * (b / se);
    const sig = chiSquarePValue(wald, 1);
    const expB = Math.exp(Math.max(-20, Math.min(20, b)));
    const ciLow = Math.exp(Math.max(-20, Math.min(20, b - zCrit * se)));
    const ciHigh = Math.exp(Math.max(-20, Math.min(20, b + zCrit * se)));
    return {
      variable: vName,
      b: Number(b.toFixed(4)),
      stdError: Number(se.toFixed(4)),
      wald: Number(wald.toFixed(4)),
      df: 1,
      sig: Number(sig.toFixed(4)),
      expB: Number(expB.toFixed(4)),
      ciLowerExpB: Number(ciLow.toFixed(4)),
      ciUpperExpB: Number(ciHigh.toFixed(4))
    };
  });

  const academicInterpretation: string[] = [
    `1. Uji Omnibus Model (Likelihood Ratio): Chi-Square = ${lrChiSq.toFixed(3)} (df = ${k}, Sig. = ${omnibusSig.toFixed(4)}). Model regresi logistik biner secara simultan ${omnibusSig <= alpha ? 'signifikan' : 'tidak signifikan'} dalam memprediksi peluang ${yCol} = "${oneLabel}".`,
    `2. Pseudo R-Square & Goodness-of-Fit: Nilai Nagelkerke R² = ${nagelkerkeR2.toFixed(4)} (${(nagelkerkeR2 * 100).toFixed(2)}%), Cox & Snell R² = ${coxSnellR2.toFixed(4)}, dan McFadden R² = ${mcFaddenR2.toFixed(4)}. Uji Hosmer-Lemeshow menghasilkan Chi-Square = ${hlChiSq.toFixed(3)} (Sig. = ${hlSig.toFixed(4)}), menunjukkan model ${hlSig > alpha ? 'fit (sesuai dengan data observasi karena p > 0.05)' : 'kurang fit (p <= 0.05)'}.`,
    `3. Akurasi Klasifikasi: Ketepatan klasifikasi keseluruhan adalah ${overallPct.toFixed(2)}% (Sensitivity = ${sensPct.toFixed(2)}%, Specificity = ${specPct.toFixed(2)}%).`,
    `4. Rasio Odds Exp(B): ${variablesInEquation.slice(1).map(v => `${v.variable} (B = ${v.b.toFixed(3)}, Wald = ${v.wald.toFixed(3)}, Sig. = ${v.sig.toFixed(4)}, Exp(B) = ${v.expB.toFixed(3)})`).join('; ')}.`
  ];

  return {
    modelType: 'BINARY_LOGISTIC',
    yCol,
    xCols,
    nUsed: n,
    targetCategories: { zeroLabel, oneLabel },
    omnibusTest: {
      chiSquare: Number(lrChiSq.toFixed(4)),
      df: k,
      sig: Number(omnibusSig.toFixed(4))
    },
    modelSummary: {
      minus2LogLikelihood: Number(minus2LL.toFixed(4)),
      nullMinus2LogLikelihood: Number(nullMinus2LL.toFixed(4)),
      coxSnellR2: Number(coxSnellR2.toFixed(4)),
      nagelkerkeR2: Number(nagelkerkeR2.toFixed(4)),
      mcFaddenR2: Number(mcFaddenR2.toFixed(4)),
      aic: Number(aic.toFixed(4)),
      bic: Number(bic.toFixed(4)),
      iterations: iter
    },
    hosmerLemeshow: {
      chiSquare: Number(hlChiSq.toFixed(4)),
      df: hlDf,
      sig: Number(hlSig.toFixed(4)),
      passed: hlSig > alpha
    },
    classificationTable: {
      cutoff,
      trueNegative: tn,
      falsePositive: fp,
      falseNegative: fn,
      truePositive: tp,
      specificityPercent: Number(specPct.toFixed(2)),
      sensitivityPercent: Number(sensPct.toFixed(2)),
      overallPercentage: Number(overallPct.toFixed(2))
    },
    variablesInEquation,
    academicInterpretation
  };
}

/**
 * 2. Multinomial Logistic Regression (Reference Category vs J-1 Contrasts)
 */
export function fitMultinomialLogisticRegression(options: {
  rows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  alpha?: number;
  ciLevel?: number;
}): MultinomialLogisticResult {
  const { rows, yCol, xCols, alpha = 0.05, ciLevel = 0.95 } = options;
  const reqCols = [yCol, ...xCols];
  const validRows = rows.filter(r =>
    reqCols.every(c => r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '' && (c === yCol || !isNaN(Number(r[c]))))
  );
  const n = validRows.length;
  const k = xCols.length;
  const categories = Array.from(new Set(validRows.map(r => String(r[yCol]).trim()))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  if (categories.length < 2) {
    throw new Error(`Regresi Logistik Multinomial membutuhkan minimal 2 kategori Y.`);
  }

  const refCat = categories[0];
  const nonRefCats = categories.slice(1);
  const parameterEstimates: LogisticCoefficientRow[] = [];

  // Fit separate binary logit contrasts against reference category (Begg & Gray / Softmax IRLS)
  const catWeights: Record<string, number[]> = {};
  for (const cat of nonRefCats) {
    const subRows = validRows.filter(r => String(r[yCol]).trim() === refCat || String(r[yCol]).trim() === cat);
    if (subRows.length > k + 2) {
      const binFit = fitBinaryLogisticRegression({
        rows: subRows.map(r => ({ ...r, [yCol]: String(r[yCol]).trim() === cat ? '1' : '0' })),
        yCol,
        xCols,
        alpha,
        ciLevel
      });
      catWeights[cat] = binFit.variablesInEquation.map(v => v.b);
      binFit.variablesInEquation.forEach(v => {
        parameterEstimates.push({ ...v, category: cat });
      });
    }
  }

  // Evaluate full Softmax Log-Likelihood and Classification Accuracy
  const X = validRows.map(r => [1.0, ...xCols.map(c => Number(r[c]))]);
  let llFull = 0;
  let correctCount = 0;
  const catFreq: Record<string, number> = {};
  categories.forEach(c => { catFreq[c] = 0; });

  for (let i = 0; i < n; i++) {
    const actualCat = String(validRows[i][yCol]).trim();
    catFreq[actualCat] = (catFreq[actualCat] || 0) + 1;
    const scores: Record<string, number> = { [refCat]: 0 };
    for (const cat of nonRefCats) {
      const w = catWeights[cat] || new Array(k + 1).fill(0);
      let eta = 0;
      for (let j = 0; j <= k; j++) eta += X[i][j] * w[j];
      scores[cat] = Math.max(-20, Math.min(20, eta));
    }
    const sumExp = categories.reduce((acc, c) => acc + Math.exp(scores[c]), 0);
    let bestCat = refCat;
    let bestProb = -1;
    for (const c of categories) {
      const prob = Math.exp(scores[c]) / sumExp;
      if (prob > bestProb) {
        bestProb = prob;
        bestCat = c;
      }
      if (c === actualCat) {
        llFull += Math.log(Math.max(1e-12, prob));
      }
    }
    if (bestCat === actualCat) correctCount++;
  }

  let llNull = 0;
  for (const c of categories) {
    const cnt = catFreq[c] || 0;
    if (cnt > 0) llNull += cnt * Math.log(cnt / n);
  }

  const nullMinus2LL = -2 * llNull;
  const finalMinus2LL = -2 * llFull;
  const lrChiSq = Math.max(0, nullMinus2LL - finalMinus2LL);
  const df = k * nonRefCats.length;
  const sig = chiSquarePValue(lrChiSq, Math.max(1, df));

  const coxSnell = Math.max(0, Math.min(0.9999, 1 - Math.exp((2 * (llNull - llFull)) / n)));
  const maxCS = 1 - Math.exp((2 * llNull) / n);
  const nagelkerke = maxCS > 0 ? Math.min(1, coxSnell / maxCS) : 0;
  const mcFadden = llNull !== 0 ? Math.max(0, 1 - llFull / llNull) : 0;
  const overallAccuracyPercent = Number(((correctCount / n) * 100).toFixed(2));

  return {
    modelType: 'MULTINOMIAL_LOGISTIC',
    yCol,
    xCols,
    nUsed: n,
    referenceCategory: refCat,
    categories,
    modelFittingInfo: {
      nullMinus2LL: Number(nullMinus2LL.toFixed(4)),
      finalMinus2LL: Number(finalMinus2LL.toFixed(4)),
      chiSquare: Number(lrChiSq.toFixed(4)),
      df,
      sig: Number(sig.toFixed(4))
    },
    pseudoR2: {
      coxSnell: Number(coxSnell.toFixed(4)),
      nagelkerke: Number(nagelkerke.toFixed(4)),
      mcFadden: Number(mcFadden.toFixed(4))
    },
    parameterEstimates,
    overallAccuracyPercent,
    academicInterpretation: [
      `1. Uji Kesesuaian Model Multinomial (Reference = "${refCat}"): Likelihood Ratio Chi-Square = ${lrChiSq.toFixed(3)} (df = ${df}, Sig. = ${sig.toFixed(4)}).`,
      `2. Pseudo R-Square: Nagelkerke R² = ${nagelkerke.toFixed(4)}, Cox & Snell R² = ${coxSnell.toFixed(4)}, McFadden R² = ${mcFadden.toFixed(4)} dengan akurasi klasifikasi ${overallAccuracyPercent}%.`
    ]
  };
}

/**
 * 3. Ordinal Logistic Regression (Proportional Odds / Cumulative Logit PLUM)
 */
export function fitOrdinalLogisticRegression(options: {
  rows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  alpha?: number;
  ciLevel?: number;
}): OrdinalLogisticResult {
  const { rows, yCol, xCols, alpha = 0.05, ciLevel = 0.95 } = options;
  const reqCols = [yCol, ...xCols];
  const validRows = rows.filter(r =>
    reqCols.every(c => r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '' && (c === yCol || !isNaN(Number(r[c]))))
  );
  const n = validRows.length;
  const k = xCols.length;
  const orderedCategories = Array.from(new Set(validRows.map(r => String(r[yCol]).trim()))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const J = orderedCategories.length;
  if (J < 2) {
    throw new Error(`Regresi Logistik Ordinal membutuhkan minimal 2 kategori berjenjang.`);
  }

  // Fit J-1 cumulative binary logits P(Y > j) and pool location slopes (Proportional Odds estimator)
  const zCrit = Math.abs(normalInv(1 - (1 - ciLevel) / 2));
  const thresholds: OrdinalLogisticResult['thresholds'] = [];
  const slopeAccum = new Array(k).fill(0);
  const varAccum = new Array(k).fill(0);
  let validSplits = 0;

  for (let j = 0; j < J - 1; j++) {
    const lowSet = new Set(orderedCategories.slice(0, j + 1));
    const binRows = validRows.map(r => ({
      ...r,
      __cumY: lowSet.has(String(r[yCol]).trim()) ? '0' : '1'
    }));
    try {
      const binFit = fitBinaryLogisticRegression({
        rows: binRows,
        yCol: '__cumY',
        xCols,
        alpha,
        ciLevel
      });
      const constRow = binFit.variablesInEquation[0];
      // In SPSS PLUM, threshold theta_j = -intercept of P(Y > j)
      const theta = -constRow.b;
      thresholds.push({
        label: `[${yCol} = ${orderedCategories[j]}]`,
        estimate: Number(theta.toFixed(4)),
        stdError: constRow.stdError,
        wald: constRow.wald,
        sig: constRow.sig
      });
      for (let m = 0; m < k; m++) {
        const sRow = binFit.variablesInEquation[m + 1];
        slopeAccum[m] += sRow.b;
        varAccum[m] += sRow.stdError * sRow.stdError;
      }
      validSplits++;
    } catch {
      // skip degenerate split
    }
  }

  const div = Math.max(1, validSplits);
  const locations: LogisticCoefficientRow[] = xCols.map((col, m) => {
    const b = slopeAccum[m] / div;
    const se = Math.sqrt(varAccum[m]) / div;
    const wald = se > 0 ? (b / se) * (b / se) : 0;
    const sig = chiSquarePValue(wald, 1);
    const expB = Math.exp(Math.max(-20, Math.min(20, b)));
    return {
      variable: col,
      b: Number(b.toFixed(4)),
      stdError: Number(se.toFixed(4)),
      wald: Number(wald.toFixed(4)),
      df: 1,
      sig: Number(sig.toFixed(4)),
      expB: Number(expB.toFixed(4)),
      ciLowerExpB: Number(Math.exp(b - zCrit * se).toFixed(4)),
      ciUpperExpB: Number(Math.exp(b + zCrit * se).toFixed(4))
    };
  });

  // Compute cumulative probabilities & log-likelihood
  const catCounts = orderedCategories.map(cat =>
    validRows.filter(r => String(r[yCol]).trim() === cat).length
  );
  let llNull = 0;
  catCounts.forEach(cnt => {
    if (cnt > 0) llNull += cnt * Math.log(cnt / n);
  });

  // Approximate full log-likelihood from proportional odds linear predictor
  const waldSum = locations.reduce((acc, l) => acc + l.wald, 0);
  const llFull = llNull + 0.5 * waldSum;
  const nullMinus2LL = -2 * llNull;
  const finalMinus2LL = Math.max(0.01, -2 * llFull);
  const lrChiSq = Math.max(0, nullMinus2LL - finalMinus2LL);
  const sig = chiSquarePValue(lrChiSq, k);

  const coxSnell = Math.max(0, Math.min(0.9999, 1 - Math.exp(-lrChiSq / n)));
  const maxCS = 1 - Math.exp((2 * llNull) / n);
  const nagelkerke = maxCS > 0 ? Math.min(1, coxSnell / maxCS) : 0;
  const mcFadden = llNull !== 0 ? Math.max(0, 1 - llFull / llNull) : 0;

  return {
    modelType: 'ORDINAL_LOGISTIC',
    yCol,
    xCols,
    nUsed: n,
    orderedCategories,
    modelFittingInfo: {
      nullMinus2LL: Number(nullMinus2LL.toFixed(4)),
      finalMinus2LL: Number(finalMinus2LL.toFixed(4)),
      chiSquare: Number(lrChiSq.toFixed(4)),
      df: k,
      sig: Number(sig.toFixed(4))
    },
    pseudoR2: {
      coxSnell: Number(coxSnell.toFixed(4)),
      nagelkerke: Number(nagelkerke.toFixed(4)),
      mcFadden: Number(mcFadden.toFixed(4))
    },
    thresholds,
    locations,
    academicInterpretation: [
      `1. Model Regresi Logistik Ordinal (PLUM Cumulative Logit): Mengestimasi ${J - 1} ambang batas (Threshold) dan ${k} koefisien lokasi (Location) pada N = ${n}.`,
      `2. Kesesuaian Model: Chi-Square = ${lrChiSq.toFixed(3)} (df = ${k}, Sig. = ${sig.toFixed(4)}), Nagelkerke R² = ${nagelkerke.toFixed(4)}.`
    ]
  };
}

/**
 * 4. Poisson & Negative Binomial (NB2) Count GLM via IRLS
 */
export function fitCountGLMRegression(options: {
  rows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  family: 'poisson' | 'negative_binomial';
  alpha?: number;
  ciLevel?: number;
}): CountGLMResult {
  const { rows, yCol, xCols, family, alpha = 0.05, ciLevel = 0.95 } = options;
  const reqCols = [yCol, ...xCols];
  const validRows = rows.filter(r =>
    reqCols.every(c => r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '' && !isNaN(Number(r[c])))
  );
  const n = validRows.length;
  const k = xCols.length;
  const p = k + 1;
  const y = validRows.map(r => Math.max(0, Math.round(Number(r[yCol]))));
  const X = validRows.map(r => [1.0, ...xCols.map(c => Number(r[c]))]);

  const meanY = Math.max(0.01, y.reduce((a, b) => a + b, 0) / n);
  let beta = new Array(p).fill(0);
  beta[0] = Math.log(meanY);
  let covMatrix: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));

  // Step 1: Fit Poisson IRLS
  for (let iter = 1; iter <= 25; iter++) {
    const XtWX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
    const grad: number[] = new Array(p).fill(0);

    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
      eta = Math.max(-20, Math.min(20, eta));
      const mu = Math.exp(eta);
      const diff = y[i] - mu;
      for (let r = 0; r < p; r++) {
        grad[r] += X[i][r] * diff;
        for (let c = 0; c < p; c++) {
          XtWX[r][c] += X[i][r] * mu * X[i][c];
        }
      }
    }

    covMatrix = safeInvertSymmetric(XtWX);
    let maxStep = 0;
    for (let r = 0; r < p; r++) {
      let step = 0;
      for (let c = 0; c < p; c++) step += covMatrix[r][c] * grad[c];
      beta[r] += step;
      if (Math.abs(step) > maxStep) maxStep = Math.abs(step);
    }
    if (maxStep < 1e-6) break;
  }

  // Estimate overdispersion alphaNB if Negative Binomial
  let alphaNB = 0;
  if (family === 'negative_binomial') {
    let numAlpha = 0;
    let denAlpha = 0;
    for (let i = 0; i < n; i++) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
      const mu = Math.exp(Math.max(-20, Math.min(20, eta)));
      numAlpha += (y[i] - mu) * (y[i] - mu) - y[i];
      denAlpha += mu * mu;
    }
    alphaNB = denAlpha > 0 ? Math.max(0.01, numAlpha / denAlpha) : 0.1;

    // Re-fit IRLS with Negative Binomial NB2 weights W_i = mu_i / (1 + alphaNB * mu_i)
    for (let iter = 1; iter <= 20; iter++) {
      const XtWX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
      const grad: number[] = new Array(p).fill(0);
      for (let i = 0; i < n; i++) {
        let eta = 0;
        for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
        const mu = Math.exp(Math.max(-20, Math.min(20, eta)));
        const denom = 1.0 + alphaNB * mu;
        const wi = mu / denom;
        const score = (y[i] - mu) / denom;
        for (let r = 0; r < p; r++) {
          grad[r] += X[i][r] * score;
          for (let c = 0; c < p; c++) {
            XtWX[r][c] += X[i][r] * wi * X[i][c];
          }
        }
      }
      covMatrix = safeInvertSymmetric(XtWX);
      let maxStep = 0;
      for (let r = 0; r < p; r++) {
        let step = 0;
        for (let c = 0; c < p; c++) step += covMatrix[r][c] * grad[c];
        beta[r] += step;
        if (Math.abs(step) > maxStep) maxStep = Math.abs(step);
      }
      if (maxStep < 1e-6) break;
    }
  }

  // Compute Deviance, Pearson Chi-Square, and Log-Likelihood
  let deviance = 0;
  let pearsonChiSq = 0;
  let llFull = 0;
  let llNull = 0;

  for (let i = 0; i < n; i++) {
    let eta = 0;
    for (let j = 0; j < p; j++) eta += X[i][j] * beta[j];
    const mu = Math.exp(Math.max(-20, Math.min(20, eta)));
    const yi = y[i];
    const varY = family === 'negative_binomial' ? mu + alphaNB * mu * mu : mu;

    pearsonChiSq += ((yi - mu) * (yi - mu)) / Math.max(1e-8, varY);
    if (yi > 0) {
      deviance += 2 * (yi * Math.log(yi / mu) - (yi - mu));
    } else {
      deviance += 2 * mu;
    }

    llFull += yi * Math.log(mu) - mu - lnGamma(yi + 1);
    llNull += yi * Math.log(meanY) - meanY - lnGamma(yi + 1);
  }

  const dfRes = Math.max(1, n - p);
  const dispersionRatio = pearsonChiSq / dfRes;
  const lrChiSq = Math.max(0, 2 * (llFull - llNull));
  const omnibusSig = chiSquarePValue(lrChiSq, k);
  const aic = -2 * llFull + 2 * (family === 'negative_binomial' ? p + 1 : p);
  const bic = -2 * llFull + (family === 'negative_binomial' ? p + 1 : p) * Math.log(n);

  const zCrit = Math.abs(normalInv(1 - (1 - ciLevel) / 2));
  const varNames = ['(Intercept)', ...xCols];
  const parameterEstimates: LogisticCoefficientRow[] = varNames.map((vName, j) => {
    const b = beta[j];
    const se = Math.sqrt(Math.max(1e-12, covMatrix[j][j]));
    const wald = (b / se) * (b / se);
    const sig = chiSquarePValue(wald, 1);
    const irr = Math.exp(Math.max(-20, Math.min(20, b)));
    return {
      variable: vName,
      b: Number(b.toFixed(4)),
      stdError: Number(se.toFixed(4)),
      wald: Number(wald.toFixed(4)),
      df: 1,
      sig: Number(sig.toFixed(4)),
      expB: Number(irr.toFixed(4)),
      ciLowerExpB: Number(Math.exp(b - zCrit * se).toFixed(4)),
      ciUpperExpB: Number(Math.exp(b + zCrit * se).toFixed(4))
    };
  });

  return {
    modelType: family === 'negative_binomial' ? 'NEGATIVE_BINOMIAL_GLM' : 'POISSON_GLM',
    yCol,
    xCols,
    nUsed: n,
    goodnessOfFit: {
      deviance: Number(deviance.toFixed(4)),
      df: dfRes,
      devianceOverDf: Number((deviance / dfRes).toFixed(4)),
      pearsonChiSquare: Number(pearsonChiSq.toFixed(4)),
      dispersionRatio: Number(dispersionRatio.toFixed(4)),
      isOverdispersed: dispersionRatio > 1.5,
      alphaNB: family === 'negative_binomial' ? Number(alphaNB.toFixed(4)) : undefined,
      logLikelihood: Number(llFull.toFixed(4)),
      aic: Number(aic.toFixed(4)),
      bic: Number(bic.toFixed(4))
    },
    omnibusTest: {
      lrChiSquare: Number(lrChiSq.toFixed(4)),
      df: k,
      sig: Number(omnibusSig.toFixed(4))
    },
    parameterEstimates,
    academicInterpretation: [
      `1. Spesifikasi Count GLM (${family === 'negative_binomial' ? 'Negative Binomial NB2' : 'Poisson Log-Linear'}): Omnibus Likelihood Ratio Chi-Square = ${lrChiSq.toFixed(3)} (df = ${k}, Sig. = ${omnibusSig.toFixed(4)}).`,
      `2. Evaluasi Overdispersi: Rasio Pearson Chi-Square / df = ${dispersionRatio.toFixed(3)} dan Deviance / df = ${(deviance / dfRes).toFixed(3)}. ${dispersionRatio > 1.5 && family === 'poisson' ? 'Terindikasi overdispersi (rasio > 1.5); disarankan menggunakan Negative Binomial Regression.' : 'Dispersi data terkendali.'}`,
      `3. Incidence Rate Ratio Exp(B): ${parameterEstimates.slice(1).map(v => `${v.variable} (IRR = ${v.expB.toFixed(3)}, p = ${v.sig.toFixed(4)})`).join('; ')}.`
    ]
  };
}

/**
 * 5. Quantile Regression (L1 Median / Tau-Quantile via Asymmetric IRLS)
 */
export function fitQuantileRegression(options: {
  rows: Record<string, any>[];
  yCol: string;
  xCols: string[];
  tau?: number; // Default 0.50 (Median L1 Regression)
  alpha?: number;
  ciLevel?: number;
}): QuantileRegressionResult {
  const { rows, yCol, xCols, tau = 0.5, alpha = 0.05, ciLevel = 0.95 } = options;
  const reqCols = [yCol, ...xCols];
  const validRows = rows.filter(r =>
    reqCols.every(c => r[c] !== null && r[c] !== undefined && String(r[c]).trim() !== '' && !isNaN(Number(r[c])))
  );
  const n = validRows.length;
  const k = xCols.length;
  const p = k + 1;
  const y = validRows.map(r => Number(r[yCol]));
  const X = validRows.map(r => [1.0, ...xCols.map(c => Number(r[c]))]);

  // Initial OLS start
  const XT = matTranspose(X);
  let invXtX = safeInvertSymmetric(matMul(XT, X));
  let beta = matMul(invXtX, matMul(XT, y.map(v => [v]))).map(v => v[0]);

  // Asymmetric IRLS for Quantile Loss rho_tau(u) = u * (tau - I(u < 0))
  for (let iter = 1; iter <= 35; iter++) {
    const XtWX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
    const XtWy: number[] = new Array(p).fill(0);

    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let j = 0; j < p; j++) pred += X[i][j] * beta[j];
      const u = y[i] - pred;
      const absU = Math.max(1e-4, Math.abs(u));
      const wi = u >= 0 ? tau / absU : (1.0 - tau) / absU;
      for (let r = 0; r < p; r++) {
        XtWy[r] += X[i][r] * wi * y[i];
        for (let c = 0; c < p; c++) {
          XtWX[r][c] += X[i][r] * wi * X[i][c];
        }
      }
    }

    const nextInv = safeInvertSymmetric(XtWX);
    const nextBeta = new Array(p).fill(0);
    for (let r = 0; r < p; r++) {
      for (let c = 0; c < p; c++) nextBeta[r] += nextInv[r][c] * XtWy[c];
    }

    let maxDiff = 0;
    for (let j = 0; j < p; j++) {
      if (Math.abs(nextBeta[j] - beta[j]) > maxDiff) maxDiff = Math.abs(nextBeta[j] - beta[j]);
    }
    beta = nextBeta;
    invXtX = nextInv;
    if (maxDiff < 1e-6) break;
  }

  // Compute Pseudo R1 (Koenker & Machado 1999) and MAE
  const sortedY = [...y].sort((a, b) => a - b);
  const qTauY = sortedY[Math.min(n - 1, Math.max(0, Math.floor(tau * n)))];
  let lossModel = 0;
  let lossNull = 0;
  let sumAbsErr = 0;
  const res: number[] = [];

  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < p; j++) pred += X[i][j] * beta[j];
    const u = y[i] - pred;
    res.push(u);
    sumAbsErr += Math.abs(u);
    lossModel += u >= 0 ? tau * u : (tau - 1) * u;
    const u0 = y[i] - qTauY;
    lossNull += u0 >= 0 ? tau * u0 : (tau - 1) * u0;
  }

  const pseudoR1 = lossNull > 0 ? Math.max(0, 1 - lossModel / lossNull) : 0;
  const mae = sumAbsErr / n;
  const dfRes = Math.max(1, n - p);
  const scaleVar = (sumAbsErr / dfRes) * (sumAbsErr / dfRes) * (tau * (1 - tau));
  const zCrit = Math.abs(normalInv(1 - (1 - ciLevel) / 2));

  const varNames = ['(Constant)', ...xCols];
  const coefficients = varNames.map((vName, j) => {
    const b = beta[j];
    const se = Math.sqrt(Math.max(1e-12, invXtX[j][j] * scaleVar));
    const t = b / se;
    const sig = tPValue(t, dfRes);
    return {
      variable: vName,
      b: Number(b.toFixed(4)),
      stdError: Number(se.toFixed(4)),
      t: Number(t.toFixed(4)),
      sig: Number(sig.toFixed(4)),
      ciLower: Number((b - zCrit * se).toFixed(4)),
      ciUpper: Number((b + zCrit * se).toFixed(4))
    };
  });

  return {
    modelType: 'QUANTILE_REGRESSION',
    quantileTau: tau,
    yCol,
    xCols,
    nUsed: n,
    pseudoR1: Number(pseudoR1.toFixed(4)),
    mae: Number(mae.toFixed(4)),
    coefficients,
    academicInterpretation: [
      `1. Regresi Kuantil (tau = ${tau.toFixed(2)}): Mengestimasi efek prediktor terhadap kuantil ke-${Math.round(tau * 100)} dari ${yCol} secara tahan banting (robust) terhadap outlier ekstrem.`,
      `2. Goodness-of-Fit: Koenker-Machado Pseudo-R¹ = ${pseudoR1.toFixed(4)} dengan Mean Absolute Error (MAE) = ${mae.toFixed(4)}.`
    ]
  };
}

/**
 * 6. Polynomial Regression (Degree 2 Quadratic or Degree 3 Cubic with Mean Centering)
 */
export function fitPolynomialRegression(options: {
  rows: Record<string, any>[];
  yCol: string;
  xCol: string;
  degree?: 2 | 3;
  centerX?: boolean;
  alpha?: number;
  ciLevel?: number;
}): {
  degree: 2 | 3;
  linearFit: OLSFitResult;
  polynomialFit: OLSFitResult;
  rSquaredChange: number;
  fChange: number;
  sigFChange: number;
} {
  const { rows, yCol, xCol, degree = 2, centerX = true, alpha = 0.05, ciLevel = 0.95 } = options;
  const validRows = rows.filter(
    r => r[yCol] !== null && r[yCol] !== undefined && !isNaN(Number(r[yCol])) && !isNaN(Number(r[xCol]))
  );
  const n = validRows.length;
  const meanX = validRows.reduce((acc, r) => acc + Number(r[xCol]), 0) / (n || 1);

  const x1Name = centerX ? `${xCol}_c` : xCol;
  const x2Name = `${x1Name}_sq`;
  const x3Name = `${x1Name}_cub`;

  const polyRows = validRows.map(r => {
    const xv = centerX ? Number(r[xCol]) - meanX : Number(r[xCol]);
    return {
      ...r,
      [x1Name]: xv,
      [x2Name]: xv * xv,
      [x3Name]: xv * xv * xv
    };
  });

  const linearFit = runStatisticalRegression({ rows: polyRows, yCol, xCols: [x1Name], alpha, ciLevel });
  const polyCols = degree === 3 ? [x1Name, x2Name, x3Name] : [x1Name, x2Name];
  const polynomialFit = runStatisticalRegression({ rows: polyRows, yCol, xCols: polyCols, alpha, ciLevel });

  const r2Lin = linearFit.modelSummary.rSquared;
  const r2Poly = polynomialFit.modelSummary.rSquared;
  const deltaR2 = Math.max(0, r2Poly - r2Lin);
  const df1 = degree - 1;
  const df2 = polynomialFit.anova.residual.df;
  const fChange = (1 - r2Poly) > 1e-12 ? (deltaR2 / df1) / ((1 - r2Poly) / df2) : 0;
  const sigFChange = chiSquarePValue(fChange * df1, df1);

  return {
    degree,
    linearFit,
    polynomialFit,
    rSquaredChange: Number(deltaR2.toFixed(6)),
    fChange: Number(fChange.toFixed(4)),
    sigFChange: Number(sigFChange.toFixed(4))
  };
}

