import { describe, it, expect } from 'vitest';
import { runRegressionEngine } from '../../src/lib/regression-engine';
import { DATASET_SLR_N20, DATASET_TIME_SERIES_AR1 } from '../fixtures/synthetic-datasets';

describe('Diagnostic Plots Data Generation', () => {
  it('generates valid coordinates for P-P, Q-Q, Histogram, and ResVsFit plots', () => {
    const res = runRegressionEngine({
      data: DATASET_SLR_N20.data,
      yCol: DATASET_SLR_N20.yCol,
      xCols: DATASET_SLR_N20.xCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    const { ppPlot, qqPlot, histogram, resVsFit } = res.plots;

    // 1. P-P plot: values should be between 0 and 1
    expect(ppPlot.length).toBe(20);
    for (const pt of ppPlot) {
      expect(pt.observed).toBeGreaterThanOrEqual(0);
      expect(pt.observed).toBeLessThanOrEqual(1);
      expect(pt.expected).toBeGreaterThanOrEqual(0);
      expect(pt.expected).toBeLessThanOrEqual(1);
    }

    // 2. Q-Q plot: points must be ordered
    expect(qqPlot.length).toBe(20);
    expect(typeof qqPlot[0].theoretical).toBe('number');
    expect(typeof qqPlot[0].sample).toBe('number');

    // 3. Histogram: bins must sum up to n
    expect(histogram.length).toBeGreaterThan(4);
    const totalCount = histogram.reduce((sum, b) => sum + b.count, 0);
    expect(totalCount).toBe(20);

    // 4. Residuals vs Fitted: points equal n
    expect(resVsFit.length).toBe(20);
    expect(typeof resVsFit[0].fitted).toBe('number');
    expect(typeof resVsFit[0].residual).toBe('number');
  });

  it('generates time series residual plot data when isTimeSeries is true', () => {
    const res = runRegressionEngine({
      data: DATASET_TIME_SERIES_AR1.data,
      yCol: DATASET_TIME_SERIES_AR1.yCol,
      xCols: DATASET_TIME_SERIES_AR1.xCols,
      isTimeSeries: true,
      timeCol: DATASET_TIME_SERIES_AR1.timeCol,
      alpha: 0.05
    });

    expect(res.plots.resVsFit.length).toBe(60);
  });
});
