import { describe, it, expect } from 'vitest';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import {
  validatePanelStructure,
  validatePanelMappingConfig,
  inspectAndCleanPanelData,
  fitPanelCEM,
  fitPanelFEM,
  fitPanelREM,
  testChow,
  testHausman,
  testMundlakCRE,
  testBreuschPaganLM,
  selectOptimalPanelModel,
  testPanelVIF,
  testGroupwiseHeteroGreene,
  testWooldridgeSerial,
  testPanelNormality,
  computeClusterRobustSE
} from '../../src/lib/panel-engine';
import {
  generateAllPanelConsoleBlocks,
  formatPanelClipboardSummary
} from '../../src/lib/panel-interpretation';
import { generatePanelDocx } from '../../src/lib/panel-docx-builder';
import { PanelFitInput, PanelFitResult } from '../../src/lib/panel-types';
import {
  calculateTotalScore,
  calculateDisclosureLevel,
  CEDScores
} from '../../src/lib/types';

describe('Fase P7: Validasi Akhir End-to-End, Invarian I1-I12, & Zero-Regression Menu CED', () => {
  describe('1. Alur Lengkap Estimasi Regresi Data Panel (Grunfeld Benchmark)', () => {
    const rawRows = [...grunfeldData];
    const idCol = 'company';
    const timeCol = 'year';
    const yCol = 'invest';
    const xCols = ['mvalue', 'kstock'];

    it('tahap 1-2: validasi struktur dan sanitasi data panel', () => {
      const mapping = validatePanelMappingConfig(rawRows, idCol, timeCol, yCol, xCols);
      expect(mapping.isValid).toBe(true);
      expect(mapping.errors).toHaveLength(0);

      const cleaning = inspectAndCleanPanelData(rawRows, idCol, timeCol, yCol, xCols);
      expect(cleaning.validObs).toBe(200);
      expect(cleaning.droppedObs).toBe(0);
      expect(cleaning.duplicateCount).toBe(0);
      expect(cleaning.stataDoLog).toContain('duplicates report company year');
      expect(cleaning.stataDoLog).toContain('xtset company year');

      // Pengujian encode string entitas
      const stringData = rawRows.map(r => ({ ...r, company_name: `Firm_${r.company}` }));
      const cleanString = inspectAndCleanPanelData(stringData, 'company_name', timeCol, yCol, xCols);
      expect(cleanString.entityEncoding.isEncoded).toBe(true);
      expect(cleanString.stataDoLog).toContain('encode company_name, generate(id_num)');
    });

    it('tahap 3: estimasi 3 model (CEM, FEM, REM) dengan presisi ekonometrika Stata', () => {
      const input: PanelFitInput = {
        rows: rawRows,
        idCol,
        timeCol,
        yCol,
        xCols,
        alpha: 0.05
      };

      const cem = fitPanelCEM(input);
      const fem = fitPanelFEM(input);
      const rem = fitPanelREM(input);

      // Verifikasi koefisien FEM Grunfeld terhadap benchmark resmi Stata 17/18
      expect(fem.coefficients['mvalue'].b).toBeCloseTo(0.1101238, 5);
      expect(fem.coefficients['kstock'].b).toBeCloseTo(0.3100653, 5);
      expect(fem.coefficients['_cons'].b).toBeCloseTo(-58.74393, 3);
      expect(fem.r2.within).toBeCloseTo(0.7668, 3);

      // Verifikasi koefisien REM Grunfeld
      expect(rem.coefficients['mvalue'].b).toBeCloseTo(0.1097812, 5);
      expect(rem.coefficients['kstock'].b).toBeCloseTo(0.3081130, 5);
      expect(rem.coefficients['_cons'].b).toBeCloseTo(-57.83441, 3);
    });

    it('tahap 4: pengujian spesifikasi dan pemilihan model (Chow, Hausman, LM)', () => {
      const input: PanelFitInput = {
        rows: rawRows,
        idCol,
        timeCol,
        yCol,
        xCols,
        alpha: 0.05
      };

      const cem = fitPanelCEM(input);
      const fem = fitPanelFEM(input);
      const rem = fitPanelREM(input);

      const chow = testChow(cem, fem);
      const hausman = testHausman(fem, rem);
      const mundlak = testMundlakCRE(input);
      const bp = testBreuschPaganLM(input);
      const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp);

      // Chow: Tolak H0 -> FEM preferred over CEM
      expect(chow.p).toBeLessThan(0.05);
      expect(chow.preferred).toBe('FEM');

      // Hausman: Gagal Tolak H0 (p >= 0.05) -> REM preferred over FEM
      expect(hausman.chi2).toBeGreaterThan(0);
      expect(hausman.preferred).toBe('REM');

      // Breusch-Pagan LM: Tolak H0 -> REM preferred over CEM
      expect(bp.p).toBeLessThan(0.05);
      expect(bp.preferred).toBe('REM');

      // Matriks Keputusan: REM terpilih
      expect(selection.selectedModel).toBe('REM');
    });

    it('tahap 5: uji asumsi klasik dan deteksi bias cluster (G < 30)', () => {
      const input: PanelFitInput = {
        rows: rawRows,
        idCol,
        timeCol,
        yCol,
        xCols,
        alpha: 0.05
      };

      const rem = fitPanelREM(input);
      const fem = fitPanelFEM(input);

      // 1. Multikolinearitas (VIF)
      const vif = testPanelVIF(input);
      expect(vif.meanVif).toBeLessThan(10);

      // 2. Heteroskedastisitas (Modified Wald Greene)
      const greene = testGroupwiseHeteroGreene(input, fem);
      expect(greene.hasHeteroskedasticity).toBe(true);

      // 3. Autokorelasi Serial (Wooldridge xtserial)
      const serial = testWooldridgeSerial(input);
      expect(serial.hasAutocorrelation).toBe(true);

      // 4. Normalitas dengan CLT Protection
      const normality = testPanelNormality(rem.residuals);
      expect(normality.cltProtected).toBe(true);

      // 5. Remedial Cluster-Robust SE & Small Cluster Warning
      const robustFinal = computeClusterRobustSE(rem, input);
      expect(robustFinal.coefficients['mvalue'].stdError).toBeGreaterThan(0);
      expect(robustFinal.clusterBiasWarning?.isBiased).toBe(true);
      expect(robustFinal.clusterBiasWarning?.clusterCount).toBe(10);
    });

    it('tahap 6: pembuatan 13 blok konsol Stata dan generator dokumen Word & Clipboard', async () => {
      const input: PanelFitInput = {
        rows: rawRows,
        idCol,
        timeCol,
        yCol,
        xCols,
        alpha: 0.05
      };

      const decl = validatePanelStructure(rawRows, idCol, timeCol);
      const cem = fitPanelCEM(input);
      const fem = fitPanelFEM(input);
      const rem = fitPanelREM(input);
      const chow = testChow(cem, fem);
      const hausman = testHausman(fem, rem);
      const mundlak = testMundlakCRE(input);
      const bp = testBreuschPaganLM(input);
      const selection = selectOptimalPanelModel(chow, hausman, mundlak, bp);

      const vif = testPanelVIF(input);
      const greene = testGroupwiseHeteroGreene(input, fem);
      const serial = testWooldridgeSerial(input);
      const normality = testPanelNormality(rem.residuals);
      const robustFinal = computeClusterRobustSE(rem, input);

      const fitResult: PanelFitResult = {
        success: true,
        declaration: decl,
        models: { cem, fem, rem },
        selection,
        selectedModel: rem,
        finalModel: robustFinal,
        assumptions: {
          vif,
          greeneHetero: greene,
          wooldridgeSerial: serial,
          normality,
          clusterBiasWarning: robustFinal.clusterBiasWarning
        },
        consoleBlocks: []
      };

      const blocks = generateAllPanelConsoleBlocks(input, fitResult);
      fitResult.consoleBlocks = blocks;

      expect(blocks).toHaveLength(13);
      blocks.forEach(b => {
        expect(b.stataCommand.length).toBeGreaterThan(0);
        expect(b.stataOutput.length).toBeGreaterThan(0);
        expect(b.babyLanguage.length).toBeGreaterThan(0);
      });

      // Validasi Docx Buffer
      const docxBuffer = await generatePanelDocx({ fitResult, datasetName: 'grunfeld_1958.xlsx' });
      expect(docxBuffer.length).toBeGreaterThan(5000);

      // Validasi Clipboard Summary Text
      const summary = formatPanelClipboardSummary(fitResult, 'grunfeld_1958.xlsx');
      expect(summary).toContain('RINGKASAN EKSEKUTIF');
      expect(summary).toContain('Random Effects Model');
      expect(summary).toContain('Cluster-Robust Standard Errors');
    });
  });

  describe('2. Penegakan Invarian Platform & Metodologi', () => {
    it('Invarian I1: memblokir variabel Y non-kontinu (string)', () => {
      const invalidRows = grunfeldData.map(r => ({ ...r, invest: 'invalid_text' }));
      const res = validatePanelMappingConfig(invalidRows, 'company', 'year', 'invest', ['mvalue']);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('kontinu') || e.includes('numerik'))).toBe(true);
    });

    it('Invarian I5: memblokir variabel Y yang juga dijadikan variabel X', () => {
      const res = validatePanelMappingConfig(grunfeldData, 'company', 'year', 'invest', ['invest', 'mvalue']);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('Invarian I5') || e.includes('Invariant I5'))).toBe(true);
    });

    it('Invarian I6: memblokir kolom waktu yang dijadikan variabel X atau Y', () => {
      const res = validatePanelMappingConfig(grunfeldData, 'company', 'year', 'invest', ['year', 'mvalue']);
      expect(res.isValid).toBe(false);
      expect(res.errors.some(e => e.includes('Invarian I6') || e.includes('Invariant I6'))).toBe(true);
    });

    it('Invarian I12: mendeteksi variabel time-invariant pada panel data', () => {
      const constantXRows = grunfeldData.map(r => ({ ...r, const_var: 100 }));
      const cleaning = inspectAndCleanPanelData(constantXRows, 'company', 'year', 'invest', ['mvalue', 'const_var']);
      expect(cleaning.timeInvariantVars).toContain('const_var');
      expect(cleaning.stataDoLog).toContain('Catatan Invarian I12: Variabel time-invariant terdeteksi');
    });
  });

  describe('3. Invarian I7: Zero-Regression pada Menu Analisis CED Eksisting', () => {
    it('menghitung total skor 18 indikator CED secara tepat tanpa deviasi fungsi', () => {
      const zeroScores: CEDScores = {
        cc1: 0, cc2: 0,
        ghg1: 0, ghg2: 0, ghg3: 0, ghg4: 0, ghg5: 0, ghg6: 0, ghg7: 0,
        ec1: 0, ec2: 0, ec3: 0,
        rc1: 0, rc2: 0, rc3: 0, rc4: 0,
        acc1: 0, acc2: 0
      };
      expect(calculateTotalScore(zeroScores)).toBe(0);

      const maxScores: CEDScores = {
        cc1: 5, cc2: 5,
        ghg1: 5, ghg2: 5, ghg3: 5, ghg4: 5, ghg5: 5, ghg6: 5, ghg7: 5,
        ec1: 5, ec2: 5, ec3: 5,
        rc1: 5, rc2: 5, rc3: 5, rc4: 5,
        acc1: 5, acc2: 5
      };
      expect(calculateTotalScore(maxScores)).toBe(90);
    });

    it('mengklasifikasikan tingkat pengungkapan CED sesuai skala resmi 5 kategori', () => {
      expect(calculateDisclosureLevel(10)).toBe('Sangat Rendah (Minimal)');
      expect(calculateDisclosureLevel(25)).toBe('Rendah (Low)');
      expect(calculateDisclosureLevel(45)).toBe('Sedang (Moderate)');
      expect(calculateDisclosureLevel(65)).toBe('Tinggi (Substantial)');
      expect(calculateDisclosureLevel(85)).toBe('Sangat Tinggi (High Disclosure)');
    });
  });
});
