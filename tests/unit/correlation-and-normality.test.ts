import { describe, it, expect } from 'vitest';
import grunfeld from '../fixtures/panel/grunfeld.json';
import {
  computePanelCorrelationMatrix,
  testPanelNormality
} from '../../src/lib/panel-engine';

describe('Correlation Matrix & Normality Tests Fix Verification', () => {
  it('computes real non-trivial Pearson and Spearman correlations on Grunfeld data', () => {
    const vars = ['invest', 'mvalue', 'kstock'];
    const corr = computePanelCorrelationMatrix(grunfeld, vars);

    expect(corr.variables).toEqual(vars);
    expect(corr.n).toBe(200);

    // Diagonal elements must be 1.0000
    for (const v of vars) {
      expect(corr.pearson[v][v].coef).toBe(1.0);
      expect(corr.spearman[v][v].coef).toBe(1.0);
    }

    // Off-diagonal elements MUST NOT be 1.0000 (proving fix of hardcoded 1.0000 bug)
    const rInvestMval = corr.pearson['invest']['mvalue'].coef;
    const rhoInvestMval = corr.spearman['invest']['mvalue'].coef;

    expect(rInvestMval).not.toBe(1.0);
    expect(rInvestMval).toBeGreaterThan(0.5); // Grunfeld invest & mvalue are strongly positively correlated (~0.8-0.9)
    expect(corr.pearson['invest']['mvalue'].isSignificant).toBe(true);

    expect(rhoInvestMval).not.toBe(1.0);
    expect(rhoInvestMval).toBeGreaterThan(0.5);
    expect(corr.spearman['invest']['mvalue'].isSignificant).toBe(true);

    // Symmetry check: r(x, y) === r(y, x)
    expect(corr.pearson['invest']['kstock'].coef).toBe(corr.pearson['kstock']['invest'].coef);
    expect(corr.spearman['invest']['kstock'].coef).toBe(corr.spearman['kstock']['invest'].coef);
  });

  it('correctly rejects normality when data is severely non-normal (W = 0.65181, N = 145)', () => {
    // Generate severely skewed / leptokurtic synthetic residuals similar to user's data
    const nonNormalResids: number[] = new Array(140).fill(0).map(() => (Math.random() - 0.5) * 0.1);
    // Add extreme outliers to create skewness ~ -3.5 and kurtosis ~ 32
    nonNormalResids.push(-2.5, -2.1, -1.8, -1.5, 0.7);

    const norm = testPanelNormality(nonNormalResids, 0.05);

    // swilk must correctly yield high z and tiny p-value < 0.05 (NOT falsely 0.25050)
    expect(norm.swilk.w).toBeLessThan(0.85);
    expect(norm.swilk.z).toBeGreaterThan(3.0);
    expect(norm.swilk.probZ).toBeLessThan(0.05);
    expect(norm.swilk.isNormal).toBe(false);

    // sktest and ksmirnov must also reject normality
    expect(norm.sktest.isNormal).toBe(false);
    expect(norm.ksmirnov.isNormal).toBe(false);

    // Overall isNormal must be false
    expect(norm.isNormal).toBe(false);
  });
});
