import { describe, it, expect } from 'vitest';
import { runStatisticalRegression } from '../../src/lib/regression-engine';

describe('Regression Engine (OLS & SVD Dual Verification)', () => {
  // Dataset terkontrol SLR: Y = 2 + 3*X
  const slrData = [
    { X: 1, Y: 5.1 },
    { X: 2, Y: 7.9 },
    { X: 3, Y: 11.2 },
    { X: 4, Y: 13.8 },
    { X: 5, Y: 17.1 },
    { X: 6, Y: 20.0 },
    { X: 7, Y: 23.2 },
    { X: 8, Y: 25.9 },
    { X: 9, Y: 29.1 },
    { X: 10, Y: 32.0 }
  ];

  it('mengestimasi model SLR dengan presisi tinggi dan mencapai skor S3 = 100%', () => {
    const res = runStatisticalRegression({
      rows: slrData,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(res.modelType).toBe('SLR');
    expect(res.coefficients.length).toBe(2); // (Constant) dan X

    const constCoef = res.coefficients[0];
    const xCoef = res.coefficients[1];

    // Slope B mendekati 3.0
    expect(xCoef.b).toBeGreaterThan(2.8);
    expect(xCoef.b).toBeLessThan(3.2);

    // R-squared sangat tinggi (> 0.99)
    expect(res.modelSummary.rSquared).toBeGreaterThan(0.99);

    // ANOVA F-test signifikan (p < 0.001)
    expect(res.anova.regression.sig).toBeLessThan(0.001);

    // Skor S3 Konsistensi Internal = 100%
    expect(res.scores.s3Consistency).toBe(100);
    expect(res.scores.checksPassed).toBe(res.scores.totalChecks);

    // Cek SLR t^2 = F
    const tVal = xCoef.t;
    const fVal = res.anova.regression.f;
    expect(Math.abs(tVal * tVal - fVal) / fVal).toBeLessThan(1e-4);
  });

  it('mengestimasi model MLR (k=2) dan menghitung Tolerance serta VIF', () => {
    const mlrData = Array.from({ length: 40 }, (_, i) => ({
      Y: 10 + 2 * (i + 1) + 1.5 * (i % 5) + (Math.sin(i) * 2),
      X1: (i + 1) * 0.5,
      X2: (i % 5) * 2 + (i * 0.1)
    }));

    const res = runStatisticalRegression({
      rows: mlrData,
      yCol: 'Y',
      xCols: ['X1', 'X2'],
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(res.modelType).toBe('MLR');
    expect(res.coefficients.length).toBe(3); // Constant, X1, X2

    // Collinearity statistics
    const x1 = res.coefficients[1];
    const x2 = res.coefficients[2];
    expect(x1.collinearity.vif).toBeGreaterThan(0.9);
    expect(x1.collinearity.tolerance).toBeLessThanOrEqual(1.0);
    expect(x2.collinearity.vif).toBeGreaterThan(0.9);

    // Model Summary R > 0
    expect(res.modelSummary.r).toBeGreaterThan(0.8);

    // S3 consistency = 100%
    expect(res.scores.s3Consistency).toBe(100);
  });

  it('menghasilkan 9 tabel keluaran standar SPSS', () => {
    const res = runStatisticalRegression({
      rows: slrData,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: false
    });

    // 1. Model Summary
    expect(res.modelSummary).toHaveProperty('r');
    expect(res.modelSummary).toHaveProperty('rSquared');
    expect(res.modelSummary).toHaveProperty('durbinWatson');

    // 2. ANOVA
    expect(res.anova.regression).toHaveProperty('f');
    expect(res.anova.residual).toHaveProperty('ss');
    expect(res.anova.total).toHaveProperty('df');

    // 3. Coefficients
    expect(res.coefficients[1]).toHaveProperty('beta');
    expect(res.coefficients[1]).toHaveProperty('ciLower');
    expect(res.coefficients[1]).toHaveProperty('ciUpper');

    // 4. Collinearity Diagnostics
    expect(res.collinearityDiagnostics.length).toBeGreaterThan(0);

    // 5. Residuals Statistics
    expect(res.residualsStatistics.some(r => r.metric === "Cook's Distance")).toBe(true);

    // 6. Plots Data Points
    expect(res.plots.qqPlot.length).toBe(slrData.length);
    expect(res.plots.resVsFit.length).toBe(slrData.length);
    expect(res.plots.histogram.length).toBeGreaterThan(0);
  });
});
