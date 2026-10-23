import { describe, it, expect } from 'vitest';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import stataExpected from '../fixtures/panel/stata_grunfeld_expected.json';
import {
  fitPanelFEM,
  fitPanelREM,
  testPanelVIF,
  testGroupwiseHeteroGreene,
  testWooldridgeSerial,
  computeClusterRobustSE
} from '../../src/lib/panel-engine';

describe('Panel Engine - Classical Assumptions & Cluster-Robust SE', () => {
  const input = {
    rows: grunfeldData,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'invest',
    xCols: ['mvalue', 'kstock'],
    alpha: 0.05
  };

  const fem = fitPanelFEM(input);
  const rem = fitPanelREM(input);

  it('computes Panel VIF matching Stata estat vif (1.31)', () => {
    const vifRes = testPanelVIF(input);
    expect(vifRes.meanVif).toBeCloseTo(stataExpected.assumptions.vif.meanVif, 2);
    expect(vifRes.variables.mvalue.vif).toBeCloseTo(stataExpected.assumptions.vif.mvalue, 2);
    expect(vifRes.variables.kstock.vif).toBeCloseTo(stataExpected.assumptions.vif.kstock, 2);
    expect(vifRes.variables.mvalue.tolerance).toBeCloseTo(0.761, 2);
  });

  it('computes Greene Modified Wald Test for Groupwise Heteroskedasticity (xttest3)', () => {
    const hetero = testGroupwiseHeteroGreene(input, fem);
    expect(hetero.df).toBe(10);
    expect(hetero.chi2).toBeGreaterThan(300);
    expect(hetero.p).toBeCloseTo(0.0000, 4);
    expect(hetero.hasHeteroskedasticity).toBe(true);
  });

  it('computes Wooldridge Autocorrelation Test (xtserial) matching F(1, 9)=263.59', () => {
    const autoRes = testWooldridgeSerial(input);
    expect(autoRes.df1).toBe(1);
    expect(autoRes.df2).toBe(9);
    expect(autoRes.f).toBeCloseTo(stataExpected.assumptions.wooldridgeSerial.f, 0);
    expect(autoRes.p).toBeCloseTo(stataExpected.assumptions.wooldridgeSerial.p, 2);
    expect(autoRes.hasAutocorrelation).toBe(true);
  });

  it('skips Wooldridge Autocorrelation Test gracefully when T < 3', () => {
    // Subset data to T = 2 years
    const shortRows = grunfeldData.filter((r: any) => r.year <= 1936);
    const shortInput = { ...input, rows: shortRows };
    const autoRes = testWooldridgeSerial(shortInput);
    expect(autoRes.hasAutocorrelation).toBe(false);
    expect(autoRes.skippedReason).toContain('T < 3');
  });

  it('computes Cluster-Robust Standard Errors and flags small cluster warning (G < 30)', () => {
    const robustRem = computeClusterRobustSE(rem, input);
    expect(robustRem.isRobust).toBe(true);

    // Check cluster SE values on Grunfeld: standard errors change
    expect(robustRem.coefficients.mvalue.stdError).toBeGreaterThan(0);
    expect(robustRem.coefficients.kstock.stdError).toBeGreaterThan(0);

    // Grunfeld has G = 10 < 30, so small cluster check must be warned
    const clusterWarning = robustRem.clusterBiasWarning;
    expect(clusterWarning).toBeDefined();
    expect(clusterWarning?.isBiased).toBe(true);
    expect(clusterWarning?.clusterCount).toBe(10);
    expect(clusterWarning?.message).toContain('G = 10');
  });
});
