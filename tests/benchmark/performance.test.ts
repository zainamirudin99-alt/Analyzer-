import { describe, it, expect } from 'vitest';
import { runRegressionEngine } from '../../src/lib/regression-engine';

describe('Performance Benchmark: Large Dataset Scalability', () => {
  it('fits OLS model with n = 10,000 observations and k = 10 predictors in < 3000ms', () => {
    const n = 10000;
    const k = 10;
    const xCols = Array.from({ length: k }, (_, j) => `X${j + 1}`);

    // Generate synthetic dataset n=10,000, k=10
    const rows: Record<string, number>[] = new Array(n);
    let s = 42;
    const prng = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    for (let i = 0; i < n; i++) {
      const row: Record<string, number> = {};
      let yVal = 10.0;
      for (let j = 0; j < k; j++) {
        const xVal = (prng() * 50) + 5;
        row[`X${j + 1}`] = xVal;
        yVal += (j + 1) * 0.5 * xVal;
      }
      yVal += (prng() - 0.5) * 5; // noise
      row['Y'] = yVal;
      rows[i] = row;
    }

    const t0 = performance.now();
    const result = runRegressionEngine({
      data: rows,
      yCol: 'Y',
      xCols,
      isTimeSeries: false,
      alpha: 0.05
    });
    const t1 = performance.now();
    const elapsedMs = Math.round(t1 - t0);

    console.log(`[Performance Benchmark] n = ${n}, k = ${k}: Fit execution time = ${elapsedMs} ms`);

    // Verify model correctness and consistency
    expect(result.coefficients.length).toBe(k + 1);
    expect(result.scores.s3Consistency).toBe(100);
    expect(result.modelSummary.rSquared).toBeGreaterThan(0.95);

    // Verify performance constraint (well under Vercel serverless timeout)
    expect(elapsedMs).toBeLessThan(3000);
  });
});
