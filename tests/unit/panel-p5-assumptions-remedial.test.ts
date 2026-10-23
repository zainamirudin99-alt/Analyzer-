import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import {
  validatePanelStructure,
  fitPanelFEM,
  fitPanelREM,
  testPanelVIF,
  testGroupwiseHeteroGreene,
  testWooldridgeSerial,
  testPanelNormality,
  computeClusterRobustSE
} from '../../src/lib/panel-engine';
import { generateAllPanelConsoleBlocks } from '../../src/lib/panel-interpretation';

describe('Fase P5: Uji Asumsi Klasik, Remedial Cluster-Robust & Small Cluster Bias', () => {
  const panelTabPath = path.resolve(__dirname, '../../src/components/PanelTab.tsx');
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

  describe('1. Diagnostik Asumsi Klasik Panel Grunfeld', () => {
    it('computes Multicollinearity VIF for panel predictors (Mean VIF < 10)', () => {
      const vif = testPanelVIF(input);
      expect(vif.meanVif).toBeCloseTo(1.31, 1);
      expect(vif.variables['mvalue'].vif).toBeCloseTo(1.31, 1);
      expect(vif.variables['kstock'].vif).toBeCloseTo(1.31, 1);
      expect(vif.meanVif).toBeLessThan(10.0);
    });

    it('computes Greene Modified Wald Groupwise Heteroskedasticity (xttest3)', () => {
      const greene = testGroupwiseHeteroGreene(input, fem);
      expect(greene.df).toBe(10);
      expect(greene.chi2).toBeGreaterThan(0);
      expect(greene.hasHeteroskedasticity).toBe(true);
    });

    it('computes Wooldridge Panel Autocorrelation (xtserial) for Grunfeld', () => {
      const serial = testWooldridgeSerial(input);
      expect(serial.df1).toBe(1);
      expect(serial.df2).toBe(9); // G - 1 = 10 - 1 = 9
      expect(serial.f).toBeGreaterThan(0);
      expect(serial.p).toBeLessThan(0.05);
      expect(serial.hasAutocorrelation).toBe(true);
    });

    it('computes Residual Normality test with CLT protection for N=200', () => {
      const normality = testPanelNormality(rem.residuals);
      expect(normality.statistic).toBeGreaterThan(0);
      expect(normality.testName).toBe('Shapiro-Wilk');
      expect(normality.cltProtected).toBe(true);
    });

    it('gracefully skips Wooldridge autocorrelation test when T < 3', () => {
      // Filter Grunfeld to only 2 years (1935, 1936)
      const shortData = grunfeldData.filter(r => r.year <= 1936);
      const shortInput = { ...input, rows: shortData };

      const serialShort = testWooldridgeSerial(shortInput);
      expect(serialShort.skippedReason).toBeDefined();
      expect(serialShort.skippedReason).toContain('T < 3');
      expect(serialShort.hasAutocorrelation).toBe(false);
    });
  });

  describe('2. Remedial Cluster-Robust SE (Arellano) & Deteksi Small Cluster (G < 30)', () => {
    it('computes Arellano cluster-robust SE and triggers G < 30 warning for Grunfeld (G = 10)', () => {
      const robustREM = computeClusterRobustSE(rem, input);

      expect(robustREM.isRobust).toBe(true);
      expect(robustREM.coefficients['mvalue'].stdError).toBeGreaterThan(0);
      expect(robustREM.coefficients['kstock'].stdError).toBeGreaterThan(0);

      // Grunfeld has 10 companies, so G = 10 < 30
      expect(robustREM.clusterBiasWarning).toBeDefined();
      expect(robustREM.clusterBiasWarning?.isBiased).toBe(true);
      expect(robustREM.clusterBiasWarning?.clusterCount).toBe(10);
      expect(robustREM.clusterBiasWarning?.message).toContain('G = 10');
      expect(robustREM.clusterBiasWarning?.message).toContain('bias ke bawah');
    });
  });

  describe('3. Output Konsol Stata Langkah 11 & 12', () => {
    it('formats Step 11 assumptions and Step 12 small cluster warning correctly', () => {
      const decl = validatePanelStructure(input.rows, input.idCol, input.timeCol);
      const robustREM = computeClusterRobustSE(rem, input);

      const blocks = generateAllPanelConsoleBlocks(input, {
        success: true,
        declaration: decl,
        models: { cem: fem, fem, rem },
        selection: {
          selectedModel: 'REM',
          selectionReason: 'REM optimal',
          isAnomalous: false,
          chow: { stat: 49.18, df1: 9, df2: 188, p: 0.0000, preferred: 'FEM' },
          hausman: { chi2: 2.33, df: 2, p: 0.3118, preferred: 'REM' },
          mundlakCRE: { waldChi2: 5.0, df: 2, p: 0.08, preferred: 'REM' },
          breuschPaganLM: { chibar2: 798.16, df: 1, p: 0.0000, preferred: 'REM' }
        },
        selectedModel: rem,
        finalModel: robustREM,
        assumptions: {
          vif: { meanVif: 1.31, variables: { mvalue: { vif: 1.31, tolerance: 0.76 }, kstock: { vif: 1.31, tolerance: 0.76 } } },
          greeneHetero: { chi2: 485.45, df: 10, p: 0.0000, hasHeteroskedasticity: true },
          wooldridgeSerial: { f: 13.97, df1: 1, df2: 9, p: 0.0046, hasAutocorrelation: true },
          normality: { statistic: 0.962, p: 0.0328, testName: 'Shapiro-Wilk', isNormal: false, cltProtected: true },
          clusterBiasWarning: robustREM.clusterBiasWarning
        },
        consoleBlocks: []
      });

      const step11 = blocks.find(b => b.stepIndex === 11);
      expect(step11).toBeDefined();
      expect(step11!.stataOutput).toContain('1. Multicollinearity');
      expect(step11!.stataOutput).toContain('2. Groupwise Heteroskedasticity');
      expect(step11!.stataOutput).toContain('3. Wooldridge Autocorrelation');
      expect(step11!.stataOutput).toContain('4. Residual Normality');
      expect(step11!.stataOutput).toContain('Cluster-Robust Standard Errors');

      const step12 = blocks.find(b => b.stepIndex === 12);
      expect(step12).toBeDefined();
      expect(step12!.stataOutput).toContain('Small Cluster Warning: Number of clusters (G = 10) < 30');
    });
  });

  describe('4. UI Conformance di PanelTab.tsx untuk Langkah 11 & 12', () => {
    it('contains diagnostic cards, remedial banner, and small cluster warning', () => {
      expect(fs.existsSync(panelTabPath)).toBe(true);
      const content = fs.readFileSync(panelTabPath, 'utf8');

      expect(content).toContain('activeStep === 11');
      expect(content).toContain('activeStep === 12');
      expect(content).toContain('Uji Multikolinearitas (VIF)');
      expect(content).toContain('Uji Heteroskedastisitas Kelompok');
      expect(content).toContain('Uji Autokorelasi Serial Wooldridge');
      expect(content).toContain('Uji Normalitas Residu');
      expect(content).toContain('Tindakan Remedial Otomatis');
      expect(content).toContain('clusterBiasWarning');
    });
  });
});
