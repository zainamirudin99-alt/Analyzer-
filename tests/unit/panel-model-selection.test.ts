import { describe, it, expect } from 'vitest';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import stataExpected from '../fixtures/panel/stata_grunfeld_expected.json';
import {
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM,
  testChow,
  testHausman,
  testMundlakCRE,
  testBreuschPaganLM,
  selectOptimalPanelModel
} from '../../src/lib/panel-engine';

describe('Panel Engine - Model Selection Diagnostics (Chow, Hausman, Mundlak, LM)', () => {
  const input = {
    rows: grunfeldData,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'invest',
    xCols: ['mvalue', 'kstock'],
    alpha: 0.05
  };

  const cem = fitPanelCEM(input);
  const fem = fitPanelFEM(input);
  const rem = fitPanelREM(input);

  it('computes Chow Test matching Stata F test that all u_i=0', () => {
    const chow = testChow(cem, fem);
    expect(chow.stat).toBeCloseTo(stataExpected.modelSelection.chow.stat, 1);
    expect(chow.df1).toBe(9);
    expect(chow.df2).toBe(188);
    expect(chow.p).toBeCloseTo(0.0000, 4);
    expect(chow.preferred).toBe('FEM');
  });

  it('computes Hausman Specification Test matching Stata chi2=2.33', () => {
    const hausman = testHausman(fem, rem, input);
    expect(hausman.chi2).toBeCloseTo(stataExpected.modelSelection.hausman.chi2, 0);
    expect(hausman.df).toBe(2);
    expect(hausman.p).toBeCloseTo(stataExpected.modelSelection.hausman.p, 1);
    expect(hausman.preferred).toBe('REM');
  });

  it('computes Mundlak Correlated Random Effects (CRE) Auxiliary Regression Test', () => {
    const mundlak = testMundlakCRE(input);
    expect(mundlak.df).toBe(2);
    expect(mundlak.waldChi2).toBeGreaterThan(0);
    expect(['FEM', 'REM']).toContain(mundlak.preferred);
  });

  it('computes Breusch-Pagan LM Test (xttest0) matching Stata chibar2=798.16', () => {
    const bp = testBreuschPaganLM(input);
    expect(bp.chibar2).toBeCloseTo(stataExpected.modelSelection.breuschPaganLM.chibar2, 0);
    expect(bp.df).toBe(1);
    expect(bp.p).toBeCloseTo(0.0000, 4);
    expect(bp.preferred).toBe('REM');
  });

  it('selects optimal model (REM) based on decision matrix', () => {
    const chow = testChow(cem, fem);
    const hausman = testHausman(fem, rem, input);
    const mundlak = testMundlakCRE(input);
    const bp = testBreuschPaganLM(input);

    const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp);
    expect(selection.selectedModel).toBe('REM');
    expect(selection.isAnomalous).toBe(false);
    expect(selection.selectionReason).toContain('Random Effects');
  });
});
