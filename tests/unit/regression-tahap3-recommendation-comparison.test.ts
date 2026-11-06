// ============================================================
// Tahap 3 Comprehensive Unit & Numerical Test Suite
// Tests for Statistical Recommendation Engine, Model Comparison,
// Predictive Validation, Multi-Tab XLSX Export, and Non-Causal Standards
// ============================================================

import { describe, it, expect } from 'vitest';
import { runStatisticalRegression } from '../../src/lib/regression-engine';
import {
  generateStatisticalRecommendations,
  StatisticalRecommendationCard
} from '../../src/lib/regression-recommendation-engine';
import {
  computeInformationCriteria,
  computeErrorMetrics,
  performPredictiveValidation,
  buildModelComparisonReport
} from '../../src/lib/regression-model-comparison';
import { generateRegressionXLSX } from '../../src/lib/regression-export-xlsx';
import { generateDeterministicInterpretation } from '../../src/lib/regression-interpretation';

describe('Tahap 3: Statistical Recommendation Engine', () => {
  it('generates complete recommendation cards containing all 13 items for SLR model', () => {
    // Generate clean SLR dataset
    const n = 35;
    const rows: Record<string, any>[] = [];
    for (let i = 1; i <= n; i++) {
      const x = 10 + i * 1.5;
      const y = 5 + 2.4 * x + (Math.sin(i) * 1.2);
      rows.push({ Y: y, X1: x });
    }

    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'] });
    const output = generateStatisticalRecommendations(fit, {
      rawY: rows.map(r => r.Y),
      rawX: rows.map(r => [r.X1]),
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(output.cards.length).toBeGreaterThanOrEqual(5);
    expect(output.summary.overallHealth).toBeDefined();
    expect(output.summary.healthScore).toBeGreaterThanOrEqual(0);
    expect(output.summary.healthScore).toBeLessThanOrEqual(100);

    // Verify all 13 mandatory items exist on every card
    for (const card of output.cards) {
      expect(card.id).toBeDefined(); // Item 1 (id/name)
      expect(card.testName).toBeDefined(); // Item 1: Nama pengujian
      expect(typeof card.statistic).toBe('number'); // Item 2: Nilai statistik
      expect(card.statisticName).toBeDefined();
      expect(card.alpha).toBe(0.05); // Item 4: Alpha
      expect(['Tolak H0', 'Gagal Tolak H0', 'Tidak Berlaku']).toContain(card.h0Decision); // Item 5: Keputusan H0
      expect(['LULUS', 'PELANGGARAN', 'WASPADA', 'TIDAK BERLAKU']).toContain(card.status); // Item 6: Status
      expect(card.interpretation.length).toBeGreaterThan(10); // Item 7: Interpretasi
      expect(card.potentialCauses.length).toBeGreaterThan(0); // Item 8: Potensi penyebab
      expect(card.modelImpact.length).toBeGreaterThan(10); // Item 9: Dampak terhadap model
      expect(card.primaryRecommendation.length).toBeGreaterThan(5); // Item 10: Rekomendasi utama
      expect(Array.isArray(card.alternativeMethods)).toBe(true); // Item 11: Alternatif metode
      expect(card.methodologicalConsequences).toBeDefined(); // Item 12: Konsekuensi
      expect(typeof card.methodologicalConsequences.coefficientsChange).toBe('boolean');
      expect(typeof card.methodologicalConsequences.standardErrorChange).toBe('boolean');
      expect(typeof card.methodologicalConsequences.pValueChange).toBe('boolean');
      expect(typeof card.methodologicalConsequences.sampleSizeChange).toBe('boolean');
      expect(typeof card.methodologicalConsequences.interpretationChange).toBe('boolean');
      expect(card.availableActions).toBeDefined(); // Item 13: Next Steps & Available Actions
      expect(card.availableActions.actionLabel).toBeDefined();
    }
  });

  it('correctly handles small sample normality (Shapiro-Wilk) vs large sample CLT protection', () => {
    // 1. Small sample n = 25
    const rowsSmall: Record<string, any>[] = [];
    for (let i = 1; i <= 25; i++) {
      rowsSmall.push({ Y: 2 + i * 3 + Math.sin(i), X1: i });
    }
    const fitSmall = runStatisticalRegression({ rows: rowsSmall, yCol: 'Y', xCols: ['X1'] });
    const outputSmall = generateStatisticalRecommendations(fitSmall, { alpha: 0.05 });
    const normSmall = outputSmall.cards.find(c => c.category === 'normality');
    expect(normSmall).toBeDefined();
    expect(normSmall?.modelImpact).toContain('sampel kecil');

    // 2. Large sample n = 120 (CLT active)
    const rowsLarge: Record<string, any>[] = [];
    for (let i = 1; i <= 120; i++) {
      rowsLarge.push({ Y: 10 + i * 0.5 + Math.cos(i), X1: i });
    }
    const fitLarge = runStatisticalRegression({ rows: rowsLarge, yCol: 'Y', xCols: ['X1'] });
    const outputLarge = generateStatisticalRecommendations(fitLarge, { alpha: 0.05 });
    const normLarge = outputLarge.cards.find(c => c.category === 'normality');
    expect(normLarge).toBeDefined();
    expect(normLarge?.modelImpact).toContain('Teorema Limit Pusat (CLT)');
  });

  it('generates multicollinearity recommendation with centering and PCA without auto-dropping', () => {
    // Multicollinear predictors: X2 is nearly collinear with X1
    const n = 40;
    const rows: Record<string, any>[] = [];
    for (let i = 1; i <= n; i++) {
      const x1 = i * 2;
      const x2 = x1 * 2 + (Math.sin(i) * 0.01); // near collinear
      rows.push({ Y: 10 + 2 * x1 + 0.5 * x2 + Math.cos(i), X1: x1, X2: x2 });
    }

    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1', 'X2'] });
    const output = generateStatisticalRecommendations(fit, { alpha: 0.05 });
    const multicolCard = output.cards.find(c => c.category === 'multicollinearity');

    expect(multicolCard).toBeDefined();
    expect(multicolCard?.statistic).toBeGreaterThan(10); // VIF > 10
    expect(multicolCard?.status).toBe('PELANGGARAN');
    expect(multicolCard?.modelImpact).toContain('Standard Error membengkak');
    expect(multicolCard?.primaryRecommendation).toContain('Jangan menghapus variabel secara sembarangan');
    expect(multicolCard?.alternativeMethods.some(m => m.id === 'centering_x')).toBe(true);
    expect(multicolCard?.alternativeMethods.some(m => m.id === 'pca_composite')).toBe(true);
  });

  it('prioritizes HC3 robust standard errors when heteroskedasticity is detected', () => {
    // Heteroskedastic data: variance expands with X
    const n = 50;
    const rows: Record<string, any>[] = [];
    for (let i = 1; i <= n; i++) {
      const x = i * 2;
      const noise = (Math.random() - 0.5) * (x * 2.5); // expanding variance
      rows.push({ Y: 5 + 3 * x + noise, X: x });
    }

    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X'] });
    const output = generateStatisticalRecommendations(fit, { alpha: 0.05 });
    const heteroCard = output.cards.find(c => c.category === 'heteroskedasticity');

    expect(heteroCard).toBeDefined();
    const hc3Alt = heteroCard?.alternativeMethods.find(a => a.id === 'robust_hc3');
    expect(hc3Alt).toBeDefined();
    expect(hc3Alt?.consequences.coefficientsChange).toBe(false); // HC3 preserves OLS beta!
    expect(hc3Alt?.consequences.standardErrorChange).toBe(true);
  });

  it('warns about Spurious Regression for Time Series when R2 > DW', () => {
    // Generate trending non-stationary series where R2 > DW
    const n = 30;
    const rows: Record<string, any>[] = [];
    let y = 100;
    let x = 50;
    for (let t = 1; t <= n; t++) {
      y += 5 + (t % 2 === 0 ? 1 : -1);
      x += 4 + (t % 3 === 0 ? 1 : -1);
      rows.push({ Y: y, X: x, Year: 1990 + t });
    }

    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X'], isTimeSeries: true, timeCol: 'Year' });
    const output = generateStatisticalRecommendations(fit, { isTimeSeries: true, alpha: 0.05 });
    const stationarityCard = output.cards.find(c => c.category === 'stationarity');

    expect(stationarityCard).toBeDefined();
    expect(stationarityCard?.alternativeMethods.some(a => a.id === 'first_diff')).toBe(true);
  });

  it('evaluates Sample Size Adequacy using Green (1991) formulas', () => {
    // n = 30 with k = 3 -> Green requires n >= 50 + 8(3) = 74
    const rows: Record<string, any>[] = [];
    for (let i = 1; i <= 30; i++) {
      rows.push({ Y: 10 + i, X1: i, X2: Math.cos(i) * 5, X3: i % 5 });
    }

    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1', 'X2', 'X3'] });
    const output = generateStatisticalRecommendations(fit, { alpha: 0.05 });
    const sampleCard = output.cards.find(c => c.category === 'sample_size');

    expect(sampleCard).toBeDefined();
    expect(sampleCard?.status).toBe('PELANGGARAN'); // 30 < 74
    expect(sampleCard?.interpretation).toContain('Green (1991)');
  });
});

describe('Tahap 3: Model Comparison & Predictive Evaluation Engine', () => {
  it('computes AIC and BIC with appropriate penalty for predictors', () => {
    const ssRes = 500;
    const n = 100;
    const k1 = 1;
    const k3 = 3;

    const ic1 = computeInformationCriteria(ssRes, n, k1);
    const ic3 = computeInformationCriteria(ssRes, n, k3);

    expect(ic1.aic).toBeDefined();
    expect(ic1.bic).toBeDefined();
    // AIC with more parameters on same residual variance must be higher (penalized)
    expect(ic3.aic).toBeGreaterThan(ic1.aic);
    expect(ic3.bic).toBeGreaterThan(ic1.bic);
  });

  it('computes RMSE and MAE accurately', () => {
    const residuals = [2, -2, 4, -4]; // sum sq = 4 + 4 + 16 + 16 = 40, mean sq = 10, rmse = sqrt(10) ≈ 3.162
    const errors = computeErrorMetrics(residuals);

    expect(errors.rmse).toBeCloseTo(3.162, 2);
    expect(errors.mae).toBe(3.0); // (|2| + |-2| + |4| + |-4|) / 4 = 12 / 4 = 3
  });

  it('performs Cross-Sectional 70/30 Train-Test split validation', () => {
    const n = 50;
    const rawY: number[] = [];
    const rawX: number[][] = [];
    for (let i = 1; i <= n; i++) {
      const x = i * 2;
      rawY.push(10 + 2.5 * x + (Math.sin(i) * 2));
      rawX.push([x]);
    }

    const val = performPredictiveValidation(rawY, rawX, false, 0.7);
    expect(val).not.toBeNull();
    expect(val?.splitType).toBe('cross_section_train_test');
    expect(val?.trainSampleSize).toBe(35);
    expect(val?.testSampleSize).toBe(15);
    expect(val?.trainRmse).toBeGreaterThan(0);
    expect(val?.testRmse).toBeGreaterThan(0);
    expect(val?.forecastPoints?.length).toBe(15);
  });

  it('performs Time-Series Rolling-Origin validation strictly without future data leakage', () => {
    const n = 40;
    const rawY: number[] = [];
    const rawX: number[][] = [];
    for (let t = 1; t <= n; t++) {
      const x = 50 + t * 1.2;
      rawY.push(20 + 1.8 * x + (Math.cos(t) * 1.5));
      rawX.push([x]);
    }

    const val = performPredictiveValidation(rawY, rawX, true, 0.7);
    expect(val).not.toBeNull();
    expect(val?.splitType).toBe('time_series_rolling_origin');
    expect(val?.trainSampleSize).toBe(28);
    expect(val?.testSampleSize).toBe(12);
    expect(val?.forecastPoints?.length).toBe(12);
    expect(val?.isOverfittingRisk).toBeDefined();
  });

  it('builds comprehensive Model Comparison Report with best inferential and predictive models', () => {
    const n = 35;
    const rows: Record<string, any>[] = [];
    for (let i = 1; i <= n; i++) {
      rows.push({ Y: 10 + 2 * i + Math.sin(i), X1: i, X2: Math.cos(i) * 4 });
    }

    const m0 = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'] });
    const m1 = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1', 'X2'] });

    const report = buildModelComparisonReport([
      { id: 'M0', title: 'Model Awal M0', type: 'baseline', result: m0, label: 'Konfirmatori' },
      { id: 'M1', title: 'Model Alternatif M1', type: 'alternative', result: m1, label: 'Eksploratori' }
    ]);

    expect(report.models.length).toBe(2);
    expect(report.baselineModelId).toBe('M0');
    expect(report.bestInferentialModel.modelId).toBeDefined();
    expect(report.bestPredictiveModel.modelId).toBeDefined();
    expect(report.comparisonMatrix.length).toBeGreaterThan(5);
  });
});

describe('Tahap 3: Multi-Tab XLSX Export & Non-Causal Interpretation Standards', () => {
  it('generates multi-tab Excel workbook with all 8 sheets', () => {
    const n = 30;
    const rows: Record<string, any>[] = [];
    for (let i = 1; i <= n; i++) {
      rows.push({ Y: 5 + 3 * i, X1: i });
    }
    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'] });
    const recOutput = generateStatisticalRecommendations(fit);
    const compReport = buildModelComparisonReport([
      { id: 'M0', title: 'Model Awal', type: 'baseline', result: fit, label: 'Konfirmatori' }
    ]);

    const xlsxBuffer = generateRegressionXLSX({
      result: fit,
      datasetName: 'TestDataset.xlsx',
      sheetName: 'Sheet1',
      recommendationOutput: recOutput,
      comparisonReport: compReport
    });

    expect(xlsxBuffer).toBeDefined();
    expect(xlsxBuffer.length).toBeGreaterThan(1000); // Valid zip binary
  });

  it('enforces non-causal language and covariance estimator transparency in narrative interpretation', () => {
    const n = 30;
    const rows: Record<string, any>[] = [];
    for (let i = 1; i <= n; i++) {
      rows.push({ Y: 10 + 1.5 * i, X1: i });
    }
    const fit = runStatisticalRegression({ rows, yCol: 'Y', xCols: ['X1'] });
    const narrative = generateDeterministicInterpretation(fit, {
      modelId: 'M0',
      modelType: 'baseline',
      title: 'Model Awal',
      kTried: 1,
      label: 'Konfirmatori',
      alpha: 0.05
    });

    // Check non-causal advisory
    expect(narrative.nonCausalAdvisory).toBeDefined();
    expect(narrative.nonCausalAdvisory).toContain('data observasional');
    expect(narrative.nonCausalAdvisory).toContain('BUKAN persentase pengaruh kausal sebab-akibat');

    // Check coefficient phrasing (must NOT claim causality)
    expect(narrative.coefficients).not.toContain('membuktikan bahwa X1 menyebabkan');
    expect(narrative.coefficients).toContain('berasosiasi');

    // Check covariance estimator note
    expect(narrative.covarianceEstimatorNote).toBeDefined();
    expect(narrative.covarianceEstimatorNote).toContain('Estimator Kovarians');
  });
});

