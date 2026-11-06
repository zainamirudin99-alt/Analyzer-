import { describe, it, expect } from 'vitest';
import grunfeld from '../fixtures/panel/grunfeld.json';
import {
  fitPanelREM,
  computeClusterRobustSE
} from '../../src/lib/panel-engine';

describe('Robust vs Non-Robust SE Test', () => {
  it('compares standard REM SE with robust REM SE on Grunfeld', () => {
    const input = {
      rows: grunfeld,
      idCol: 'company',
      timeCol: 'year',
      yCol: 'invest',
      xCols: ['mvalue', 'kstock'],
      alpha: 0.05
    };

    const rem = fitPanelREM(input);
    const robust = computeClusterRobustSE(rem, input);

    // In econometric theory (Stata xtreg, re vce(robust)):
    // 1. Point estimates (coefficients) must be exactly identical
    expect(robust.coefficients.mvalue.b).toBeCloseTo(rem.coefficients.mvalue.b, 6);
    expect(robust.coefficients.kstock.b).toBeCloseTo(rem.coefficients.kstock.b, 6);
    expect(robust.coefficients._cons.b).toBeCloseTo(rem.coefficients._cons.b, 6);

    // 2. Standard errors must be adjusted (not identical)
    expect(robust.coefficients.mvalue.stdError).not.toBe(rem.coefficients.mvalue.stdError);
    expect(robust.coefficients.kstock.stdError).not.toBe(rem.coefficients.kstock.stdError);

    // 3. Wald chi2 must be recalculated with robust covariance matrix
    expect(robust.waldChi2).toBeDefined();
    expect(robust.waldChi2).not.toBe(rem.waldChi2);
    expect(robust.isRobust).toBe(true);
  });
});


