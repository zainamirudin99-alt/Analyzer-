import { describe, it, expect } from 'vitest';
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

describe('Fase P6: 4 Blok Stata Lengkap (Langkah 0 s/d 12), Ekspor Word (.docx), PDF Print, & Salin Ringkasan', () => {
  const input: PanelFitInput = {
    rows: grunfeldData,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'invest',
    xCols: ['mvalue', 'kstock'],
    alpha: 0.05
  };

  const decl = validatePanelStructure(input.rows, input.idCol, input.timeCol);
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

  const selectedModel = selection.selectedModel === 'FEM' ? fem : rem;
  const normality = testPanelNormality(selectedModel.residuals);
  const robustFinal = computeClusterRobustSE(selectedModel, input);

  const fitResult: PanelFitResult = {
    success: true,
    declaration: decl,
    models: { cem, fem, rem },
    selection,
    selectedModel,
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

  const consoleBlocks = generateAllPanelConsoleBlocks(input, fitResult);
  fitResult.consoleBlocks = consoleBlocks;

  describe('1. Verifikasi Kelengkapan 13 Blok Konsol Stata (Langkah 0 s/d 12)', () => {
    it('generates exactly 13 console blocks with indices 0 through 12', () => {
      expect(consoleBlocks).toHaveLength(13);
      consoleBlocks.forEach((block, idx) => {
        expect(block.stepIndex).toBe(idx);
      });
    });

    it('ensures each block contains non-empty metadata and no undefined / NaN values', () => {
      consoleBlocks.forEach(block => {
        expect(block.stepTitle).toBeDefined();
        expect(block.stepTitle.trim().length).toBeGreaterThan(0);

        // Blok 1: Perintah Stata
        expect(block.stataCommand).toBeDefined();
        expect(block.stataCommand.trim().length).toBeGreaterThan(0);
        expect(block.stataCommand).not.toContain('undefined');
        expect(block.stataCommand).not.toContain('NaN');

        // Blok 2: Fungsi Metodologis
        expect(block.stataFunction).toBeDefined();
        expect(block.stataFunction.trim().length).toBeGreaterThan(0);
        expect(block.stataFunction).not.toContain('undefined');
        expect(block.stataFunction).not.toContain('NaN');

        // Blok 3: Output Monospace Terminal Stata
        expect(block.stataOutput).toBeDefined();
        expect(block.stataOutput.trim().length).toBeGreaterThan(0);
        expect(block.stataOutput).not.toContain('undefined');
        expect(block.stataOutput).not.toContain('NaN');

        // Blok 4: Bahasa Bayi (Analogi Awam)
        expect(block.babyLanguage).toBeDefined();
        expect(block.babyLanguage.trim().length).toBeGreaterThan(0);
        expect(block.babyLanguage).not.toContain('undefined');
        expect(block.babyLanguage).not.toContain('NaN');
      });
    });

    it('contains specific Stata commands matching the standard econometrics pipeline', () => {
      // Langkah 5: xtsum
      expect(consoleBlocks[5].stataCommand).toContain('xtsum');
      // Langkah 7: xtset
      expect(consoleBlocks[7].stataCommand).toContain('xtset id_num year');
      // Langkah 8: reg, fe, re
      expect(consoleBlocks[8].stataCommand).toContain('reg');
      expect(consoleBlocks[8].stataCommand).toContain('xtreg');
      // Langkah 9: hausman
      expect(consoleBlocks[9].stataCommand).toContain('hausman');
      // Langkah 11: estat vif, xttest3, xtserial
      expect(consoleBlocks[11].stataCommand).toContain('vif');
      expect(consoleBlocks[11].stataCommand).toContain('xttest3');
      // Langkah 12: vce(cluster id_num)
      expect(consoleBlocks[12].stataCommand).toContain('vce(cluster id_num)');
    });
  });

  describe('2. Verifikasi Generator Berkas Word (.docx)', () => {
    it('generates a valid binary docx buffer with proper size', async () => {
      const buffer = await generatePanelDocx({
        fitResult,
        datasetName: 'grunfeld_1958.xlsx'
      });

      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      // Word docx files are compressed ZIPs, typically > 5000 bytes
      expect(buffer.length).toBeGreaterThan(5000);
      // Check ZIP magic header (PK\x03\x04)
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
      expect(buffer[2]).toBe(0x03);
      expect(buffer[3]).toBe(0x04);
    });
  });

  describe('3. Verifikasi Format Salin Ringkasan ke Clipboard', () => {
    it('formats an executive summary with all key sections', () => {
      const summary = formatPanelClipboardSummary(fitResult, 'grunfeld_1958.xlsx');

      expect(summary).toBeDefined();
      expect(summary).toContain('RINGKASAN EKSEKUTIF');
      expect(summary).toContain('grunfeld_1958.xlsx');
      expect(summary).toContain('Model Terpilih');
      expect(summary).toContain('Uji Chow');
      expect(summary).toContain('Uji Hausman');
      expect(summary).toContain('Uji Breusch-Pagan LM');
      expect(summary).toContain('Cluster-Robust Standard Errors');
      expect(summary).toContain('mvalue');
      expect(summary).toContain('kstock');
      expect(summary).toContain('R-squared');
      expect(summary).not.toContain('undefined');
      expect(summary).not.toContain('NaN');
    });
  });
});
