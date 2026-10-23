import { describe, it, expect } from 'vitest';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import stataExpected from '../fixtures/panel/stata_grunfeld_expected.json';
import {
  validatePanelStructure,
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM
} from '../../src/lib/panel-engine';

describe('Panel Engine - Core Estimations (CEM, FEM, REM)', () => {
  const input = {
    rows: grunfeldData,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'invest',
    xCols: ['mvalue', 'kstock'],
    alpha: 0.05
  };

  it('validates panel structure on Grunfeld data (10 entities, 20 periods)', () => {
    const decl = validatePanelStructure(input.rows, input.idCol, input.timeCol);
    expect(decl.isValid).toBe(true);
    expect(decl.entityCount).toBe(10);
    expect(decl.timeCount).toBe(20);
    expect(decl.totalObs).toBe(200);
    expect(decl.isBalanced).toBe(true);
    expect(decl.hasDuplicates).toBe(false);
    expect(decl.tMin).toBe(20);
    expect(decl.tMax).toBe(20);
    expect(decl.tAvg).toBe(20);
  });

  it('fits Pooled OLS (CEM) with Stata-precision benchmark', () => {
    const cem = fitPanelCEM(input);
    expect(cem.modelType).toBe('CEM');
    expect(cem.nObs).toBe(200);
    expect(cem.dfResidual).toBe(197);

    // Coefficients check
    expect(cem.coefficients.mvalue.b).toBeCloseTo(stataExpected.cem.coefficients.mvalue.b, 4);
    expect(cem.coefficients.kstock.b).toBeCloseTo(stataExpected.cem.coefficients.kstock.b, 4);
    expect(cem.coefficients._cons.b).toBeCloseTo(stataExpected.cem.coefficients._cons.b, 3);

    // R2 check
    expect(cem.r2.overall).toBeCloseTo(stataExpected.cem.r2, 3);
  });

  it('fits Fixed Effects Model (FEM / Within) matching Stata Grunfeld benchmark down to 1e-5', () => {
    const fem = fitPanelFEM(input);
    expect(fem.modelType).toBe('FEM');
    expect(fem.nEntities).toBe(10);
    expect(fem.nObs).toBe(200);
    expect(fem.dfModel).toBe(2);
    expect(fem.dfResidual).toBe(188); // NT - n - k = 200 - 10 - 2

    // Coefficients match Stata 17/18
    expect(fem.coefficients.mvalue.b).toBeCloseTo(stataExpected.fem.coefficients.mvalue.b, 5);
    expect(fem.coefficients.kstock.b).toBeCloseTo(stataExpected.fem.coefficients.kstock.b, 5);
    expect(fem.coefficients._cons.b).toBeCloseTo(stataExpected.fem.coefficients._cons.b, 4);

    // Standard errors match Stata
    expect(fem.coefficients.mvalue.stdError).toBeCloseTo(stataExpected.fem.coefficients.mvalue.se, 4);
    expect(fem.coefficients.kstock.stdError).toBeCloseTo(stataExpected.fem.coefficients.kstock.se, 4);
    expect(fem.coefficients._cons.stdError).toBeCloseTo(stataExpected.fem.coefficients._cons.se, 3);

    // Variance components and R-squared
    expect(fem.sigma_e).toBeCloseTo(stataExpected.fem.sigma_e, 3);
    expect(fem.sigma_u).toBeCloseTo(stataExpected.fem.sigma_u, 2);
    expect(fem.rho).toBeCloseTo(stataExpected.fem.rho, 3);
    expect(fem.r2.within).toBeCloseTo(stataExpected.fem.r2.within, 3);
    expect(fem.r2.between).toBeCloseTo(stataExpected.fem.r2.between, 3);
    expect(fem.r2.overall).toBeCloseTo(stataExpected.fem.r2.overall, 3);

    // Model F-test
    expect(fem.fStat).toBeCloseTo(stataExpected.fem.fStat, 1);
    expect(fem.fPValue).toBeCloseTo(0.0000, 4);
  });

  it('fits Random Effects Model (REM / Swamy-Arora GLS) matching Stata Grunfeld benchmark', () => {
    const rem = fitPanelREM(input);
    expect(rem.modelType).toBe('REM');
    expect(rem.nEntities).toBe(10);
    expect(rem.nObs).toBe(200);
    expect(rem.dfModel).toBe(2);

    // Coefficients match Stata
    expect(rem.coefficients.mvalue.b).toBeCloseTo(stataExpected.rem.coefficients.mvalue.b, 5);
    expect(rem.coefficients.kstock.b).toBeCloseTo(stataExpected.rem.coefficients.kstock.b, 5);
    expect(rem.coefficients._cons.b).toBeCloseTo(stataExpected.rem.coefficients._cons.b, 4);

    // Standard errors match Stata
    expect(rem.coefficients.mvalue.stdError).toBeCloseTo(stataExpected.rem.coefficients.mvalue.se, 4);
    expect(rem.coefficients.kstock.stdError).toBeCloseTo(stataExpected.rem.coefficients.kstock.se, 4);
    expect(rem.coefficients._cons.stdError).toBeCloseTo(stataExpected.rem.coefficients._cons.se, 1);

    // Variance components and theta
    expect(rem.sigma_e).toBeCloseTo(stataExpected.rem.sigma_e, 3);
    expect(rem.sigma_u).toBeCloseTo(stataExpected.rem.sigma_u, 3);
    expect(rem.rho).toBeCloseTo(stataExpected.rem.rho, 3);
    expect(rem.theta).toBeCloseTo(stataExpected.rem.theta, 3);

    // Wald Chi-Square
    expect(rem.waldChi2).toBeCloseTo(stataExpected.rem.waldChi2, 1);
    expect(rem.waldPValue).toBeCloseTo(0.0000, 4);
  });
});
