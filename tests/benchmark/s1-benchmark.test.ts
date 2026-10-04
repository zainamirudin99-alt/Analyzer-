import { describe, it, expect } from 'vitest';
import { runRegressionEngine, calculateLRE } from '../../src/lib/regression-engine';
import { NIST_NORRIS } from '../fixtures/nist-fixtures';
import {
  ALL_SYNTHETIC_DATASETS,
  DATASET_SLR_N20,
  DATASET_WITH_OUTLIER,
  DATASET_HETEROSKEDASTIC,
  DATASET_MULTICOLLINEAR,
  DATASET_LOW_R2,
  DATASET_TIME_SERIES_AR1,
  DATASET_TIME_SERIES_NONSTATIONARY
} from '../fixtures/synthetic-datasets';

describe('S1 Benchmark: NIST StRD Certified Datasets Accuracy', () => {
  it('achieves LRE >= 9.0 on NIST Norris dataset (Lower difficulty benchmark)', () => {
    const rows = NIST_NORRIS.data.map(d => ({ Y: d.Y, X1: d.X1 }));
    const result = runRegressionEngine({
      data: rows,
      yCol: 'Y',
      xCols: ['X1'],
      isTimeSeries: false,
      alpha: 0.05
    });

    const b0Calculated = result.coefficients.find(r => r.variable === '(Constant)')?.b ?? 0;
    const b1Calculated = result.coefficients.find(r => r.variable === 'X1')?.b ?? 0;
    const r2Calculated = result.modelSummary.rSquared;
    const seResidual = result.modelSummary.stdErrorEstimate;

    const b0Certified = NIST_NORRIS.certified.intercept;
    const b1Certified = NIST_NORRIS.certified.slope1;
    const r2Certified = NIST_NORRIS.certified.rSquared;
    const seCertified = NIST_NORRIS.certified.residualStdError;

    const lreB0 = calculateLRE(b0Calculated, b0Certified);
    const lreB1 = calculateLRE(b1Calculated, b1Certified);
    const lreR2 = calculateLRE(r2Calculated, r2Certified);
    const lreSE = calculateLRE(seResidual, seCertified);

    console.log(`[NIST Norris Benchmark] LRE Results:`);
    console.log(`  b0 (Intercept): ${lreB0.toFixed(2)} (Calc: ${b0Calculated}, Cert: ${b0Certified})`);
    console.log(`  b1 (Slope):     ${lreB1.toFixed(2)} (Calc: ${b1Calculated}, Cert: ${b1Certified})`);
    console.log(`  R²:             ${lreR2.toFixed(2)} (Calc: ${r2Calculated}, Cert: ${r2Certified})`);
    console.log(`  Std Error:      ${lreSE.toFixed(2)} (Calc: ${seResidual}, Cert: ${seCertified})`);

    // Target LRE >= 9.0 as specified in skill regresi-statistik-inti
    expect(lreB0).toBeGreaterThanOrEqual(9.0);
    expect(lreB1).toBeGreaterThanOrEqual(9.0);
    expect(lreR2).toBeGreaterThanOrEqual(9.0);
    expect(lreSE).toBeGreaterThanOrEqual(8.5);
  });
});

describe('S3 Consistency Benchmark Across All 8 Synthetic Datasets', () => {
  it('achieves 100% S3 score on all valid non-degenerate datasets', () => {
    for (const ds of ALL_SYNTHETIC_DATASETS) {
      const result = runRegressionEngine({
        data: ds.data,
        yCol: ds.yCol,
        xCols: ds.xCols,
        isTimeSeries: ds.isTimeSeries,
        timeCol: ds.timeCol,
        alpha: 0.05
      });

      expect(result.scores.s3Consistency).toBe(100);
      const failed = result.scores.checks.filter(c => !c.passed);
      expect(failed).toHaveLength(0);
    }
  });

  it('correctly identifies clean SLR (n=20) without assumption violations', () => {
    const res = runRegressionEngine({
      data: DATASET_SLR_N20.data,
      yCol: DATASET_SLR_N20.yCol,
      xCols: DATASET_SLR_N20.xCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(res.modelSummary.rSquared).toBeGreaterThan(0.99);
    expect(res.assumptionMap?.normality.status).toBe('lulus');
    expect(res.assumptionMap?.multicollinearity.status).toBe('tidak_berlaku'); // SLR
    expect(res.assumptionMap?.multicollinearity.reason).toContain('SLR');
  });

  it('correctly identifies extreme outliers in WITH_OUTLIER dataset', () => {
    const res = runRegressionEngine({
      data: DATASET_WITH_OUTLIER.data,
      yCol: DATASET_WITH_OUTLIER.yCol,
      xCols: DATASET_WITH_OUTLIER.xCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(res.casewiseDiagnostics.length).toBeGreaterThanOrEqual(1);
    expect(res.assumptionMap?.outliers.status).toBe('gagal');
  });

  it('correctly detects heteroskedasticity in HETEROSKEDASTIC dataset', () => {
    const res = runRegressionEngine({
      data: DATASET_HETEROSKEDASTIC.data,
      yCol: DATASET_HETEROSKEDASTIC.yCol,
      xCols: DATASET_HETEROSKEDASTIC.xCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(res.assumptionMap?.homoscedasticity.status).toBe('gagal');
    expect(res.assumptionMap?.homoscedasticity.pValue).toBeLessThan(0.05);
  });

  it('correctly detects severe multicollinearity (VIF > 10) in MULTICOLLINEAR dataset', () => {
    const res = runRegressionEngine({
      data: DATASET_MULTICOLLINEAR.data,
      yCol: DATASET_MULTICOLLINEAR.yCol,
      xCols: DATASET_MULTICOLLINEAR.xCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(res.assumptionMap?.multicollinearity.status).toBe('gagal');
    const x1Row = res.coefficients.find(r => r.variable === 'X1');
    expect(x1Row?.collinearity.vif).toBeGreaterThan(10);
    expect(x1Row?.collinearity.tolerance).toBeLessThan(0.10);
  });

  it('correctly reports low R² dataset without crashing or distorting values', () => {
    const res = runRegressionEngine({
      data: DATASET_LOW_R2.data,
      yCol: DATASET_LOW_R2.yCol,
      xCols: DATASET_LOW_R2.xCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(res.modelSummary.rSquared).toBeLessThan(0.10);
    expect(res.anova.regression.sig).toBeGreaterThan(0.05);
  });

  it('correctly detects AR(1) autocorrelation in time series', () => {
    const res = runRegressionEngine({
      data: DATASET_TIME_SERIES_AR1.data,
      yCol: DATASET_TIME_SERIES_AR1.yCol,
      xCols: DATASET_TIME_SERIES_AR1.xCols,
      isTimeSeries: true,
      timeCol: DATASET_TIME_SERIES_AR1.timeCol,
      alpha: 0.05
    });

    expect(res.assumptionMap?.autocorrelation.status).toBe('gagal');
    expect(res.assumptionMap?.autocorrelation.pValue).toBeLessThan(0.05);
  });

  it('triggers spurious regression warning on non-stationary random walks', () => {
    const res = runRegressionEngine({
      data: DATASET_TIME_SERIES_NONSTATIONARY.data,
      yCol: DATASET_TIME_SERIES_NONSTATIONARY.yCol,
      xCols: DATASET_TIME_SERIES_NONSTATIONARY.xCols,
      isTimeSeries: true,
      timeCol: DATASET_TIME_SERIES_NONSTATIONARY.timeCol,
      alpha: 0.05
    });

    console.log('[Time Series Nonstationary Diagnostics]:', {
      rSquared: res.modelSummary.rSquared,
      durbinWatson: res.modelSummary.durbinWatson,
      stationarity: res.assumptionMap?.stationarity,
      timeSeriesDiagnostics: res.timeSeriesDiagnostics
    });

    expect(res.timeSeriesDiagnostics?.isSpuriousRisk).toBe(true);
    expect(res.timeSeriesDiagnostics?.spuriousWarning).toBeDefined();
    expect(res.assumptionMap?.stationarity?.status).toBe('gagal');
  });
});
