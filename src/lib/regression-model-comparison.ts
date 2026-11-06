// ============================================================
// Model Comparison & Predictive Evaluation Engine (Tahap 3)
// Information criteria (AIC, BIC), prediction errors (RMSE, MAE),
// train-test split, rolling-origin time series validation,
// and objective multi-model decision comparison matrix.
// ============================================================

import { OLSFitResult, matMul, matTranspose, matInverse } from './regression-engine';

export interface ModelMetricsSummary {
  modelId: string;
  title: string;
  label: 'Konfirmatori' | 'Eksploratori';
  kPredictors: number;
  sampleSize: number;
  r: number;
  rSquared: number;
  adjRSquared: number;
  fStat: number;
  fSig: number;
  stdErrorEstimate: number;
  aic: number;
  bic: number;
  deltaAic: number; // relative to M0
  deltaBic: number; // relative to M0
  rmse: number;
  mae: number;
  maxVif: number;
  meanVif: number;
  normalityStatus: 'LULUS' | 'GAGAL' | 'WASPADA';
  heteroskedasticityStatus: 'LULUS' | 'GAGAL';
  autocorrelationStatus: 'LULUS' | 'GAGAL' | 'TIDAK BERLAKU';
  durbinWatson: number;
  allAssumptionsPassed: boolean;
  passRate?: number;
}

export interface PredictiveValidationResult {
  splitType: 'cross_section_train_test' | 'time_series_rolling_origin';
  trainSampleSize: number;
  testSampleSize: number;
  trainRmse: number;
  testRmse: number;
  trainMae: number;
  testMae: number;
  trainR2: number;
  testR2: number;
  overfittingGap: number; // testRmse - trainRmse
  isOverfittingRisk: boolean;
  forecastPoints?: Array<{ actual: number; predicted: number; error: number }>;
}

export interface ModelComparisonReport {
  models: ModelMetricsSummary[];
  baselineModelId: string;
  bestInferentialModel: {
    modelId: string;
    title: string;
    justification: string;
  };
  bestPredictiveModel: {
    modelId: string;
    title: string;
    justification: string;
  };
  predictiveValidation?: PredictiveValidationResult;
  comparisonMatrix: Array<{
    indicator: string;
    category: 'goodness_of_fit' | 'information_criteria' | 'error_metrics' | 'diagnostics';
    values: Record<string, string | number>;
    bestModelId?: string;
  }>;
}

/**
 * Compute AIC and BIC for an OLS regression model
 * AIC = n * ln(SS_res / n) + 2 * (k + 1)
 * BIC = n * ln(SS_res / n) + (k + 1) * ln(n)
 */
export function computeInformationCriteria(
  ssResidual: number,
  n: number,
  kPredictors: number
): { aic: number; bic: number } {
  if (n <= 0 || ssResidual <= 0) {
    return { aic: 0, bic: 0 };
  }
  const variance = ssResidual / n;
  const kParams = kPredictors + 1; // plus intercept
  const aic = n * Math.log(variance) + 2 * kParams;
  const bic = n * Math.log(variance) + kParams * Math.log(n);
  return {
    aic: Math.round(aic * 1000) / 1000,
    bic: Math.round(bic * 1000) / 1000
  };
}

/**
 * Compute RMSE and MAE from residuals vector
 */
export function computeErrorMetrics(
  residuals: number[]
): { rmse: number; mae: number } {
  const n = residuals.length;
  if (n === 0) return { rmse: 0, mae: 0 };

  let sumSq = 0;
  let sumAbs = 0;
  for (let i = 0; i < n; i++) {
    const e = residuals[i];
    sumSq += e * e;
    sumAbs += Math.abs(e);
  }

  return {
    rmse: Math.round(Math.sqrt(sumSq / n) * 1000) / 1000,
    mae: Math.round((sumAbs / n) * 1000) / 1000
  };
}

/**
 * Extract summary metrics for a single model result
 */
export function extractModelMetrics(
  modelId: string,
  title: string,
  label: 'Konfirmatori' | 'Eksploratori',
  result: OLSFitResult,
  baselineAic?: number,
  baselineBic?: number,
  passRate?: number
): ModelMetricsSummary {
  const n = result.sampleSize.nUsed;
  const k = result.kPredictors;
  const ssRes = result.anova.residual.ss;
  const residuals = result.plots.resVsFit.map((p) => p.residual);

  const { aic, bic } = computeInformationCriteria(ssRes, n, k);
  const { rmse, mae } = computeErrorMetrics(residuals);

  const vifs = result.coefficients
    .filter((c) => c.variable !== '(Constant)')
    .map((c) => c.collinearity?.vif || 1.0);
  const maxVif = vifs.length > 0 ? Math.max(...vifs) : 1.0;
  const meanVif = vifs.length > 0 ? vifs.reduce((a, b) => a + b, 0) / vifs.length : 1.0;

  // Diagnostic statuses
  const normAssump = result.assumptions.find((a) => a.name.toLowerCase().includes('normalitas'));
  const heteroAssump = result.assumptions.find((a) => a.name.toLowerCase().includes('homoskedastisitas'));
  const autocorrAssump = result.assumptions.find((a) => a.name.toLowerCase().includes('autokorelasi'));

  const normalityStatus: ModelMetricsSummary['normalityStatus'] =
    normAssump?.status === 'lulus' ? 'LULUS' : (n > 50 ? 'WASPADA' : 'GAGAL');
  const heteroskedasticityStatus: ModelMetricsSummary['heteroskedasticityStatus'] =
    heteroAssump?.status === 'lulus' ? 'LULUS' : 'GAGAL';
  const autocorrelationStatus: ModelMetricsSummary['autocorrelationStatus'] =
    autocorrAssump?.status === 'lulus' ? 'LULUS' : (autocorrAssump?.status === 'tidak_berlaku' ? 'TIDAK BERLAKU' : 'GAGAL');

  const allAssumptionsPassed = result.assumptions.every((a) => a.status === 'lulus' || a.status === 'tidak_berlaku');

  return {
    modelId,
    title,
    label,
    kPredictors: k,
    sampleSize: n,
    r: result.modelSummary.r,
    rSquared: result.modelSummary.rSquared,
    adjRSquared: result.modelSummary.adjRSquared,
    fStat: result.anova.regression.f,
    fSig: result.anova.regression.sig,
    stdErrorEstimate: result.modelSummary.stdErrorEstimate,
    aic,
    bic,
    deltaAic: baselineAic !== undefined ? Math.round((aic - baselineAic) * 1000) / 1000 : 0,
    deltaBic: baselineBic !== undefined ? Math.round((bic - baselineBic) * 1000) / 1000 : 0,
    rmse,
    mae,
    maxVif: Math.round(maxVif * 100) / 100,
    meanVif: Math.round(meanVif * 100) / 100,
    normalityStatus,
    heteroskedasticityStatus,
    autocorrelationStatus,
    durbinWatson: result.modelSummary.durbinWatson,
    allAssumptionsPassed,
    passRate
  };
}

/**
 * Cross-Validation / Train-Test Split Engine
 * For Cross-Section: 70/30 split.
 * For Time Series: Rolling-Origin sequential evaluation (No Data Leakage!).
 */
export function performPredictiveValidation(
  rawY: number[],
  rawX: number[][],
  isTimeSeries: boolean = false,
  trainRatio: number = 0.7
): PredictiveValidationResult | null {
  const n = rawY.length;
  if (n < 15 || rawX.length !== n) return null;

  const nTrain = Math.floor(n * trainRatio);
  const nTest = n - nTrain;
  if (nTrain <= rawX[0].length + 2 || nTest < 3) return null;

  if (isTimeSeries) {
    // -------------------------------------------------------------
    // Rolling-Origin Forward Validation (Strictly Sequential)
    // Prevents temporal data leakage: never trains on t+1 to predict t!
    // -------------------------------------------------------------
    const forecastPoints: Array<{ actual: number; predicted: number; error: number }> = [];
    let trainSumSq = 0;
    let trainSumAbs = 0;
    let trainNCount = 0;

    for (let t = nTrain; t < n; t++) {
      // Historical window up to t-1
      const subY = rawY.slice(0, t);
      const subX = rawX.slice(0, t);

      // Fit OLS on subX, subY
      const ones = subX.map(() => [1.0]);
      const Xmat = subX.map((row, idx) => [1.0, ...row]);
      const Ymat = subY.map((v) => [v]);

      try {
        const XT = matTranspose(Xmat);
        const XTX = matMul(XT, Xmat);
        const XTXInv = matInverse(XTX);
        const XTY = matMul(XT, Ymat);
        const beta = matMul(XTXInv, XTY).map((r) => r[0]);

        // Evaluate 1-step ahead at period t
        const targetX = [1.0, ...rawX[t]];
        let predVal = 0;
        for (let j = 0; j < targetX.length; j++) {
          predVal += targetX[j] * beta[j];
        }

        const actualVal = rawY[t];
        const error = actualVal - predVal;
        forecastPoints.push({
          actual: Math.round(actualVal * 1000) / 1000,
          predicted: Math.round(predVal * 1000) / 1000,
          error: Math.round(error * 1000) / 1000
        });

        // Track in-sample error of the first window for baseline reference
        if (t === nTrain) {
          for (let i = 0; i < t; i++) {
            let inSamplePred = 0;
            const inSampleRow = [1.0, ...rawX[i]];
            for (let j = 0; j < inSampleRow.length; j++) inSamplePred += inSampleRow[j] * beta[j];
            const inSampleErr = rawY[i] - inSamplePred;
            trainSumSq += inSampleErr * inSampleErr;
            trainSumAbs += Math.abs(inSampleErr);
            trainNCount++;
          }
        }
      } catch {
        continue;
      }
    }

    if (forecastPoints.length === 0) return null;

    let testSumSq = 0;
    let testSumAbs = 0;
    for (const p of forecastPoints) {
      testSumSq += p.error * p.error;
      testSumAbs += Math.abs(p.error);
    }

    const trainRmse = trainNCount > 0 ? Math.sqrt(trainSumSq / trainNCount) : 0;
    const trainMae = trainNCount > 0 ? trainSumAbs / trainNCount : 0;
    const testRmse = Math.sqrt(testSumSq / forecastPoints.length);
    const testMae = testSumAbs / forecastPoints.length;

    const gap = testRmse - trainRmse;

    return {
      splitType: 'time_series_rolling_origin',
      trainSampleSize: nTrain,
      testSampleSize: forecastPoints.length,
      trainRmse: Math.round(trainRmse * 1000) / 1000,
      testRmse: Math.round(testRmse * 1000) / 1000,
      trainMae: Math.round(trainMae * 1000) / 1000,
      testMae: Math.round(testMae * 1000) / 1000,
      trainR2: 0,
      testR2: 0,
      overfittingGap: Math.round(gap * 1000) / 1000,
      isOverfittingRisk: gap > 0.3 * (trainRmse || 1),
      forecastPoints
    };
  } else {
    // -------------------------------------------------------------
    // Cross-Sectional Train-Test Split (Block/K-Fold Style)
    // -------------------------------------------------------------
    const trainY = rawY.slice(0, nTrain);
    const trainX = rawX.slice(0, nTrain);
    const testY = rawY.slice(nTrain);
    const testX = rawX.slice(nTrain);

    const XmatTrain = trainX.map((row) => [1.0, ...row]);
    const YmatTrain = trainY.map((v) => [v]);

    try {
      const XT = matTranspose(XmatTrain);
      const XTX = matMul(XT, XmatTrain);
      const XTXInv = matInverse(XTX);
      const XTY = matMul(XT, YmatTrain);
      const beta = matMul(XTXInv, XTY).map((r) => r[0]);

      // In-sample train errors
      let trainSumSq = 0;
      let trainSumAbs = 0;
      let trainTotalSq = 0;
      const meanTrainY = trainY.reduce((a, b) => a + b, 0) / nTrain;

      for (let i = 0; i < nTrain; i++) {
        let pred = 0;
        const row = [1.0, ...trainX[i]];
        for (let j = 0; j < row.length; j++) pred += row[j] * beta[j];
        const err = trainY[i] - pred;
        trainSumSq += err * err;
        trainSumAbs += Math.abs(err);
        trainTotalSq += (trainY[i] - meanTrainY) * (trainY[i] - meanTrainY);
      }

      // Out-of-sample test errors
      let testSumSq = 0;
      let testSumAbs = 0;
      let testTotalSq = 0;
      const meanTestY = testY.reduce((a, b) => a + b, 0) / testY.length;
      const forecastPoints: Array<{ actual: number; predicted: number; error: number }> = [];

      for (let i = 0; i < testY.length; i++) {
        let pred = 0;
        const row = [1.0, ...testX[i]];
        for (let j = 0; j < row.length; j++) pred += row[j] * beta[j];
        const err = testY[i] - pred;
        testSumSq += err * err;
        testSumAbs += Math.abs(err);
        testTotalSq += (testY[i] - meanTestY) * (testY[i] - meanTestY);
        forecastPoints.push({
          actual: Math.round(testY[i] * 1000) / 1000,
          predicted: Math.round(pred * 1000) / 1000,
          error: Math.round(err * 1000) / 1000
        });
      }

      const trainRmse = Math.sqrt(trainSumSq / nTrain);
      const trainMae = trainSumAbs / nTrain;
      const testRmse = Math.sqrt(testSumSq / testY.length);
      const testMae = testSumAbs / testY.length;

      const trainR2 = trainTotalSq > 0 ? Math.max(0, 1 - trainSumSq / trainTotalSq) : 0;
      const testR2 = testTotalSq > 0 ? Math.max(0, 1 - testSumSq / testTotalSq) : 0;
      const gap = testRmse - trainRmse;

      return {
        splitType: 'cross_section_train_test',
        trainSampleSize: nTrain,
        testSampleSize: testY.length,
        trainRmse: Math.round(trainRmse * 1000) / 1000,
        testRmse: Math.round(testRmse * 1000) / 1000,
        trainMae: Math.round(trainMae * 1000) / 1000,
        testMae: Math.round(testMae * 1000) / 1000,
        trainR2: Math.round(trainR2 * 1000) / 1000,
        testR2: Math.round(testR2 * 1000) / 1000,
        overfittingGap: Math.round(gap * 1000) / 1000,
        isOverfittingRisk: gap > 0.3 * (trainRmse || 1),
        forecastPoints
      };
    } catch {
      return null;
    }
  }
}

/**
 * Build Full Multi-Model Comparison Report
 */
export function buildModelComparisonReport(
  models: Array<{
    id: string;
    title: string;
    type: string;
    result: OLSFitResult;
    label: 'Konfirmatori' | 'Eksploratori';
    passRate?: number;
  }>,
  rawY?: number[],
  rawX?: number[][],
  isTimeSeries: boolean = false
): ModelComparisonReport {
  if (models.length === 0) {
    throw new Error('Minimal harus ada 1 model (M0) untuk perbandingan.');
  }

  const baseline = models[0];
  const baselineIC = computeInformationCriteria(
    baseline.result.anova.residual.ss,
    baseline.result.sampleSize.nUsed,
    baseline.result.kPredictors
  );

  const modelSummaries: ModelMetricsSummary[] = models.map((m) =>
    extractModelMetrics(
      m.id,
      m.title,
      m.label,
      m.result,
      baselineIC.aic,
      baselineIC.bic,
      m.passRate
    )
  );

  // Determine Best Inferential Model
  // Rules: Prioritizes valid assumptions, statistical integrity, lowest BIC, and parsimony
  let bestInferential = modelSummaries[0];
  for (const m of modelSummaries) {
    if (m.allAssumptionsPassed && !bestInferential.allAssumptionsPassed) {
      bestInferential = m;
    } else if (m.allAssumptionsPassed === bestInferential.allAssumptionsPassed) {
      if (m.bic < bestInferential.bic) {
        bestInferential = m;
      }
    }
  }

  const inferentialJustification =
    bestInferential.modelId === 'M0'
      ? 'Model Awal M0 dipertahankan sebagai model inferensial terbaik karena seluruh koefisien mencerminkan spesifikasi teoretis murni tanpa distorsi data snooping.'
      : `${bestInferential.title} (${bestInferential.modelId}) direkomendasikan untuk inferensi karena berhasil memenuhi seluruh asumsi Gauss-Markov dengan nilai BIC terendah (${bestInferential.bic.toFixed(2)}).`;

  // Determine Best Predictive Model
  // Rules: Lowest RMSE / Lowest AIC / High Adjusted R²
  let bestPredictive = modelSummaries[0];
  for (const m of modelSummaries) {
    if (m.rmse < bestPredictive.rmse) {
      bestPredictive = m;
    }
  }

  const predictiveJustification =
    bestPredictive.modelId === 'M0'
      ? 'Model M0 memiliki kesalahan prediksi (RMSE) terendah dalam sampel.'
      : `${bestPredictive.title} (${bestPredictive.modelId}) menghasilkan estimasi varian error terkecil dengan RMSE = ${bestPredictive.rmse.toFixed(3)} dan AIC = ${bestPredictive.aic.toFixed(2)}.`;

  // Compute predictive validation if raw data available
  const predictiveValidation =
    rawY && rawX && rawY.length >= 15
      ? performPredictiveValidation(rawY, rawX, isTimeSeries, 0.7) ?? undefined
      : undefined;

  // Comparison Matrix
  const comparisonMatrix: ModelComparisonReport['comparisonMatrix'] = [
    {
      indicator: 'Status Model & Metodologi',
      category: 'goodness_of_fit',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.label]))
    },
    {
      indicator: 'R Square (R²)',
      category: 'goodness_of_fit',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.rSquared.toFixed(3)]))
    },
    {
      indicator: 'Adjusted R Square',
      category: 'goodness_of_fit',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.adjRSquared.toFixed(3)])),
      bestModelId: modelSummaries.reduce((max, m) => (m.adjRSquared > max.adjRSquared ? m : max)).modelId
    },
    {
      indicator: 'F-Statistic (Simultan)',
      category: 'goodness_of_fit',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, `${m.fStat.toFixed(2)} (p=${m.fSig < 0.001 ? '.000' : m.fSig.toFixed(3)})`]))
    },
    {
      indicator: 'Akaike Information Criterion (AIC)',
      category: 'information_criteria',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, `${m.aic.toFixed(2)} (${m.deltaAic >= 0 ? '+' : ''}${m.deltaAic.toFixed(2)})`])),
      bestModelId: modelSummaries.reduce((min, m) => (m.aic < min.aic ? m : min)).modelId
    },
    {
      indicator: 'Bayesian Information Criterion (BIC)',
      category: 'information_criteria',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, `${m.bic.toFixed(2)} (${m.deltaBic >= 0 ? '+' : ''}${m.deltaBic.toFixed(2)})`])),
      bestModelId: modelSummaries.reduce((min, m) => (m.bic < min.bic ? m : min)).modelId
    },
    {
      indicator: 'Root Mean Square Error (RMSE)',
      category: 'error_metrics',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.rmse.toFixed(3)])),
      bestModelId: modelSummaries.reduce((min, m) => (m.rmse < min.rmse ? m : min)).modelId
    },
    {
      indicator: 'Mean Absolute Error (MAE)',
      category: 'error_metrics',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.mae.toFixed(3)])),
      bestModelId: modelSummaries.reduce((min, m) => (m.mae < min.mae ? m : min)).modelId
    },
    {
      indicator: 'Maximum VIF (Multikolinearitas)',
      category: 'diagnostics',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.maxVif.toFixed(2)]))
    },
    {
      indicator: 'Uji Normalitas Residual',
      category: 'diagnostics',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.normalityStatus]))
    },
    {
      indicator: 'Uji Heteroskedastisitas',
      category: 'diagnostics',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, m.heteroskedasticityStatus]))
    },
    {
      indicator: 'Durbin-Watson (Autokorelasi)',
      category: 'diagnostics',
      values: Object.fromEntries(modelSummaries.map((m) => [m.modelId, `${m.durbinWatson.toFixed(3)} (${m.autocorrelationStatus})`]))
    }
  ];

  return {
    models: modelSummaries,
    baselineModelId: baseline.id,
    bestInferentialModel: {
      modelId: bestInferential.modelId,
      title: bestInferential.title,
      justification: inferentialJustification
    },
    bestPredictiveModel: {
      modelId: bestPredictive.modelId,
      title: bestPredictive.title,
      justification: predictiveJustification
    },
    predictiveValidation,
    comparisonMatrix
  };
}

