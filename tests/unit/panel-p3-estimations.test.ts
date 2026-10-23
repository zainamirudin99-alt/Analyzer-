import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import stataExpected from '../fixtures/panel/stata_grunfeld_expected.json';
import {
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM
} from '../../src/lib/panel-engine';
import {
  computeXtsum,
  formatStataRegTable
} from '../../src/lib/panel-interpretation';

describe('Fase P3: Mesin Estimasi Dasar (CEM, FEM, REM) & Summary Stats (xtsum)', () => {
  const panelTabPath = path.resolve(__dirname, '../../src/components/PanelTab.tsx');
  const input = {
    rows: grunfeldData,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'invest',
    xCols: ['mvalue', 'kstock'],
    alpha: 0.05
  };

  describe('1. Presisi Numerik Estimasi 3 Model Awal vs Stata Benchmark (Toleransi <= 1e-6)', () => {
    it('FEM matches official Stata within estimator coefficients and SE <= 1e-6', () => {
      const fem = fitPanelFEM(input);
      const exp = stataExpected.fem;

      expect(Math.abs(fem.coefficients['mvalue'].b - exp.coefficients.mvalue.b)).toBeLessThan(1e-6);
      expect(Math.abs(fem.coefficients['mvalue'].stdError - exp.coefficients.mvalue.se)).toBeLessThan(1e-6);

      expect(Math.abs(fem.coefficients['kstock'].b - exp.coefficients.kstock.b)).toBeLessThan(1e-6);
      expect(Math.abs(fem.coefficients['kstock'].stdError - exp.coefficients.kstock.se)).toBeLessThan(1e-6);

      expect(Math.abs(fem.coefficients['_cons'].b - exp.coefficients._cons.b)).toBeLessThan(1e-5);
      expect(Math.abs(fem.r2.within - exp.r2.within)).toBeLessThan(1e-4);
    });

    it('REM matches official Stata Swamy-Arora GLS coefficients and SE <= 1e-5', () => {
      const rem = fitPanelREM(input);
      const exp = stataExpected.rem;

      expect(Math.abs(rem.coefficients['mvalue'].b - exp.coefficients.mvalue.b)).toBeLessThan(1e-6);
      expect(Math.abs(rem.coefficients['mvalue'].stdError - exp.coefficients.mvalue.se)).toBeLessThan(1e-5);

      expect(Math.abs(rem.coefficients['kstock'].b - exp.coefficients.kstock.b)).toBeLessThan(1e-6);
      expect(Math.abs(rem.coefficients['kstock'].stdError - exp.coefficients.kstock.se)).toBeLessThan(1e-5);

      expect(Math.abs(rem.coefficients['_cons'].b - exp.coefficients._cons.b)).toBeLessThan(1e-5);
      expect(rem.waldChi2).toBeDefined();
    });

    it('CEM fits Pooled OLS with correct dimensions and decomposition', () => {
      const cem = fitPanelCEM(input);
      const exp = stataExpected.cem;

      expect(cem.modelType).toBe('CEM');
      expect(cem.nObs).toBe(200);
      expect(Math.abs(cem.coefficients['mvalue'].b - exp.coefficients.mvalue.b)).toBeLessThan(1e-6);
      expect(Math.abs(cem.coefficients['kstock'].b - exp.coefficients.kstock.b)).toBeLessThan(1e-6);
      expect(Math.abs(cem.coefficients['_cons'].b - exp.coefficients._cons.b)).toBeLessThan(1e-5);
    });
  });

  describe('2. Dekomposisi Variasi Tiga Dimensi xtsum (Overall, Between, Within)', () => {
    it('calculates exact 3-dimensional statistics for dependent variable invest', () => {
      const s = computeXtsum(grunfeldData, 'company', 'invest');

      // Overall: N = 200, Mean = 145.9583, SD = 216.8753
      expect(s.overall.N).toBe(200);
      expect(s.overall.mean).toBeCloseTo(145.9583, 3);
      expect(s.overall.sd).toBeCloseTo(216.8753, 3);
      expect(s.overall.min).toBeCloseTo(0.9, 1);
      expect(s.overall.max).toBeCloseTo(1486.7, 1);

      // Between: n = 10, SD = 198.8242, Min = 3.0845, Max = 608.02
      expect(s.between.n).toBe(10);
      expect(s.between.sd).toBeCloseTo(198.8242, 3);
      expect(s.between.min).toBeCloseTo(3.0845, 3);
      expect(s.between.max).toBeCloseTo(608.02, 2);

      // Within: T-bar = 20, SD = 106.1986
      expect(s.within.tBar).toBe(20);
      expect(s.within.sd).toBeCloseTo(106.1986, 3);
    });
  });

  describe('3. Formatting Tabel Stata formatStataRegTable', () => {
    it('formats CEM, FEM, and REM cleanly without NaN or undefined', () => {
      const fem = fitPanelFEM(input);
      const rem = fitPanelREM(input);
      const cem = fitPanelCEM(input);

      const tableFem = formatStataRegTable(fem, 'invest');
      const tableRem = formatStataRegTable(rem, 'invest');
      const tableCem = formatStataRegTable(cem, 'invest');

      expect(tableFem).toContain('Fixed-effects (within) regression');
      expect(tableFem).toContain('sigma_u');
      expect(tableFem).toContain('sigma_e');
      expect(tableFem).not.toContain('NaN');
      expect(tableFem).not.toContain('undefined');

      expect(tableRem).toContain('Random-effects GLS regression');
      expect(tableRem).toContain('Wald chi2');
      expect(tableRem).not.toContain('NaN');

      expect(tableCem).toContain('Linear regression');
      expect(tableCem).not.toContain('NaN');
    });
  });

  describe('4. UI Conformance di PanelTab.tsx untuk P3', () => {
    it('contains Step 8 model switcher buttons (CEM, FEM, REM)', () => {
      expect(fs.existsSync(panelTabPath)).toBe(true);
      const content = fs.readFileSync(panelTabPath, 'utf8');

      expect(content).toContain('step8ActiveModel');
      expect(content).toContain('formatStataRegTable');
      expect(content).toContain('CEM (Pooled OLS)');
      expect(content).toContain('FEM (Fixed Effects)');
      expect(content).toContain('REM (Random Effects)');
    });
  });
});
