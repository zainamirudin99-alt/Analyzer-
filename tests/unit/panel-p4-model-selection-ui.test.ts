import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import {
  validatePanelStructure,
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM,
  testChow,
  testHausman,
  testMundlakCRE,
  testBreuschPaganLM,
  selectOptimalPanelModel
} from '../../src/lib/panel-engine';
import { generateAllPanelConsoleBlocks } from '../../src/lib/panel-interpretation';

describe('Fase P4: Uji Pemilihan Model (Chow, Hausman, LM) & Matriks Keputusan', () => {
  const panelTabPath = path.resolve(__dirname, '../../src/components/PanelTab.tsx');
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

  describe('1. Uji Pemilihan Model Spesifik Dataset Grunfeld', () => {
    it('Chow test selects FEM over CEM with p < 0.05', () => {
      const chow = testChow(cem, fem);
      expect(chow.stat).toBeCloseTo(49.18, 1);
      expect(chow.df1).toBe(9);
      expect(chow.df2).toBe(188);
      expect(chow.p).toBeLessThan(0.0001);
      expect(chow.preferred).toBe('FEM');
    });

    it('Hausman test selects REM over FEM with p >= 0.05', () => {
      const hausman = testHausman(fem, rem, input);
      expect(hausman.chi2).toBeCloseTo(2.33, 0);
      expect(hausman.df).toBe(2);
      expect(hausman.p).toBeGreaterThan(0.05);
      expect(hausman.preferred).toBe('REM');
      expect(hausman.isNegativeChi2).toBe(false);
    });

    it('Breusch-Pagan LM test selects REM over CEM with p < 0.05', () => {
      const bp = testBreuschPaganLM(input);
      expect(bp.chibar2).toBeCloseTo(798.16, 0);
      expect(bp.df).toBe(1);
      expect(bp.p).toBeLessThan(0.0001);
      expect(bp.preferred).toBe('REM');
    });

    it('Grunfeld overall decision is REM without anomaly', () => {
      const chow = testChow(cem, fem);
      const hausman = testHausman(fem, rem, input);
      const mundlak = testMundlakCRE(input);
      const bp = testBreuschPaganLM(input);

      const decision = selectOptimalPanelModel(chow, hausman, mundlak, bp);
      expect(decision.selectedModel).toBe('REM');
      expect(decision.isAnomalous).toBe(false);
      expect(decision.selectionReason).toContain('Random Effects Model (REM) terpilih');
    });
  });

  describe('2. Matriks Keputusan Ekonometrika Lengkap (6 Skenario)', () => {
    const dummyMundlak = { waldChi2: 5.0, df: 2, p: 0.08, preferred: 'REM' as const };

    it('Skenario 1: Chow Sig & Hausman Sig -> FEM', () => {
      const chow = { stat: 20.0, df1: 9, df2: 188, p: 0.001, preferred: 'FEM' as const };
      const hausman = { chi2: 15.0, df: 2, p: 0.001, preferred: 'FEM' as const };
      const bp = { chibar2: 100.0, df: 1, p: 0.001, preferred: 'REM' as const };

      const res = selectOptimalPanelModel(chow, hausman, dummyMundlak, bp);
      expect(res.selectedModel).toBe('FEM');
      expect(res.isAnomalous).toBe(false);
      expect(res.selectionReason).toContain('Fixed Effects Model (FEM) adalah model paling konsisten');
    });

    it('Skenario 2: Chow Sig & Hausman Not Sig & LM Sig -> REM', () => {
      const chow = { stat: 20.0, df1: 9, df2: 188, p: 0.001, preferred: 'FEM' as const };
      const hausman = { chi2: 2.0, df: 2, p: 0.35, preferred: 'REM' as const };
      const bp = { chibar2: 100.0, df: 1, p: 0.001, preferred: 'REM' as const };

      const res = selectOptimalPanelModel(chow, hausman, dummyMundlak, bp);
      expect(res.selectedModel).toBe('REM');
      expect(res.isAnomalous).toBe(false);
      expect(res.selectionReason).toContain('Random Effects Model (REM) terpilih');
    });

    it('Skenario 3: Chow Not Sig & LM Not Sig -> CEM', () => {
      const chow = { stat: 1.0, df1: 9, df2: 188, p: 0.45, preferred: 'CEM' as const };
      const hausman = { chi2: 1.0, df: 2, p: 0.60, preferred: 'REM' as const };
      const bp = { chibar2: 0.5, df: 1, p: 0.50, preferred: 'CEM' as const };

      const res = selectOptimalPanelModel(chow, hausman, dummyMundlak, bp);
      expect(res.selectedModel).toBe('CEM');
      expect(res.isAnomalous).toBe(false);
      expect(res.selectionReason).toContain('Common Effect Model (Pooled OLS)');
    });

    it('Skenario 4: Chow Not Sig & LM Sig & Hausman Not Sig -> REM', () => {
      const chow = { stat: 1.2, df1: 9, df2: 188, p: 0.30, preferred: 'CEM' as const };
      const hausman = { chi2: 1.5, df: 2, p: 0.45, preferred: 'REM' as const };
      const bp = { chibar2: 50.0, df: 1, p: 0.001, preferred: 'REM' as const };

      const res = selectOptimalPanelModel(chow, hausman, dummyMundlak, bp);
      expect(res.selectedModel).toBe('REM');
      expect(res.isAnomalous).toBe(false);
    });

    it('Skenario 5 (Anomali 1): Chow Sig, Hausman Not Sig, LM Not Sig -> FEM with anomaly flag', () => {
      const chow = { stat: 25.0, df1: 9, df2: 188, p: 0.001, preferred: 'FEM' as const };
      const hausman = { chi2: 1.0, df: 2, p: 0.60, preferred: 'REM' as const };
      const bp = { chibar2: 0.2, df: 1, p: 0.65, preferred: 'CEM' as const };

      const res = selectOptimalPanelModel(chow, hausman, dummyMundlak, bp);
      expect(res.selectedModel).toBe('FEM');
      expect(res.isAnomalous).toBe(true);
      expect(res.selectionReason).toContain('Anomali');
    });

    it('Skenario 6 (Fallback Mundlak): Hausman non-PSD / negative chi2 activates Mundlak CRE', () => {
      const chow = { stat: 20.0, df1: 9, df2: 188, p: 0.001, preferred: 'FEM' as const };
      const hausman = { chi2: 0, df: 2, p: 1.0, preferred: 'REM' as const, isNegativeChi2: true };
      const mundlakSig = { waldChi2: 12.0, df: 2, p: 0.002, preferred: 'FEM' as const };
      const bp = { chibar2: 80.0, df: 1, p: 0.001, preferred: 'REM' as const };

      const res = selectOptimalPanelModel(chow, hausman, mundlakSig, bp);
      expect(res.selectedModel).toBe('FEM');
    });
  });

  describe('3. Output Konsol Stata Langkah 9 & 10', () => {
    it('generates Stata-like comparison table for Hausman in step 9', () => {
      const chow = testChow(cem, fem);
      const hausman = testHausman(fem, rem, input);
      const mundlak = testMundlakCRE(input);
      const bp = testBreuschPaganLM(input);
      const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp);

      const decl = validatePanelStructure(input.rows, input.idCol, input.timeCol);

      const blocks = generateAllPanelConsoleBlocks(input, {
        success: true,
        declaration: decl,
        models: { cem, fem, rem },
        selection,
        selectedModel: rem,
        finalModel: rem,
        assumptions: {
          vif: { variables: {}, meanVif: 1.31 },
          greeneHetero: { chi2: 10, df: 10, p: 0.5, hasHeteroskedasticity: false },
          wooldridgeSerial: { f: 10, df1: 1, df2: 9, p: 0.01, hasAutocorrelation: true }
        },
        consoleBlocks: []
      });

      const step9 = blocks.find(b => b.stepIndex === 9);
      expect(step9).toBeDefined();
      expect(step9!.stataOutput).toContain('Test 1: Chow Test');
      expect(step9!.stataOutput).toContain('Test 2: Hausman Specification Test');
      expect(step9!.stataOutput).toContain('Test 3: Breusch and Pagan Lagrangian Multiplier Test');
      expect(step9!.stataOutput).toContain('Matriks Keputusan Ekonometrika: Model Terpilih = REM');

      const step10 = blocks.find(b => b.stepIndex === 10);
      expect(step10).toBeDefined();
      expect(step10!.stepTitle).toContain('Model Terpilih: REM');
    });
  });

  describe('4. UI Conformance di PanelTab.tsx untuk Langkah 9 & 10', () => {
    it('contains visual decision cards, badges, and selected model display', () => {
      expect(fs.existsSync(panelTabPath)).toBe(true);
      const content = fs.readFileSync(panelTabPath, 'utf8');

      expect(content).toContain('Matriks Keputusan Pemilihan Model');
      expect(content).toContain('Uji Chow (F-Test)');
      expect(content).toContain('Uji Hausman');
      expect(content).toContain('Uji Breusch-Pagan LM');
      expect(content).toContain('Model Rekomendasi Ekonometrika');
      expect(content).toContain('activeStep === 9');
      expect(content).toContain('activeStep === 10');
    });
  });
});
