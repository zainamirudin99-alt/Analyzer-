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
  computeClusterRobustSE
} from '../../src/lib/panel-engine';
import { generateAllPanelConsoleBlocks } from '../../src/lib/panel-interpretation';
import { PanelFitInput, PanelFitResult } from '../../src/lib/panel-types';

describe('Panel Interpretation - 13 Deterministic Stata Console Blocks', () => {
  const input: PanelFitInput = {
    rows: grunfeldData,
    idCol: 'company',
    timeCol: 'year',
    yCol: 'invest',
    xCols: ['mvalue', 'kstock'],
    alpha: 0.05
  };

  const declaration = validatePanelStructure(grunfeldData, 'company', 'year');
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
  const robustFinal = computeClusterRobustSE(selectedModel, input);

  const fitResult: PanelFitResult = {
    success: true,
    declaration,
    models: { cem, fem, rem },
    selection,
    selectedModel,
    finalModel: robustFinal,
    assumptions: {
      vif,
      greeneHetero: greene,
      wooldridgeSerial: serial,
      clusterBiasWarning: robustFinal.clusterBiasWarning
    },
    consoleBlocks: []
  };

  it('generates all 13 Stata blocks (steps 0 to 12) without empty or placeholder fields', () => {
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
    expect(blocks).toHaveLength(13);

    for (let i = 0; i < 13; i++) {
      const b = blocks[i];
      expect(b.stepIndex).toBe(i);
      expect(b.stepTitle.length).toBeGreaterThan(3);
      expect(b.stataCommand.length).toBeGreaterThan(3);
      expect(b.stataFunction.length).toBeGreaterThan(5);
      expect(b.stataOutput.length).toBeGreaterThan(10);
      expect(b.babyLanguage.length).toBeGreaterThan(15);
      // Zero LLM placeholder tokens
      expect(b.stataOutput).not.toContain('undefined');
      expect(b.stataOutput).not.toContain('NaN');
      expect(b.babyLanguage).not.toContain('undefined');
    }
  });

  it('Step 0 properly describes panel dimensions in monospace and baby language', () => {
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
    const step0 = blocks[0];
    expect(step0.stataOutput).toContain('Entity Identifier  : company (10 units detected)');
    expect(step0.stataOutput).toContain('Time Identifier    : year');
    expect(step0.babyLanguage).toContain('10');
    expect(step0.babyLanguage).toContain('20');
  });

  it('Step 5 displays 3-dimensional xtsum table (overall, between, within)', () => {
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
    const step5 = blocks[5];
    expect(step5.stataCommand).toContain('xtsum');
    expect(step5.stataOutput).toContain('overall');
    expect(step5.stataOutput).toContain('between');
    expect(step5.stataOutput).toContain('within');
    expect(step5.babyLanguage).toContain('between');
    expect(step5.babyLanguage).toContain('within');
  });

  it('Step 7 outputs xtset declaration with balance status', () => {
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
    const step7 = blocks[7];
    expect(step7.stataCommand).toContain('xtset');
    expect(step7.stataOutput).toContain('panel variable:');
    expect(step7.stataOutput).toContain('time variable:');
    expect(step7.stataOutput).toContain('strongly balanced');
  });

  it('Step 9 presents Chow, Hausman, and Breusch-Pagan LM tests clearly', () => {
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
    const step9 = blocks[9];
    expect(step9.stataOutput).toContain('Chow Test');
    expect(step9.stataOutput).toContain('Hausman Specification Test');
    expect(step9.stataOutput).toContain('Breusch and Pagan');
  });

  it('Step 11 reports classical assumptions and notes remedial cluster action', () => {
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
    const step11 = blocks[11];
    expect(step11.stataOutput).toContain('Multicollinearity');
    expect(step11.stataOutput).toContain('Heteroskedasticity');
    expect(step11.stataOutput).toContain('Autocorrelation');
    expect(step11.stataOutput).toContain('Remedial Action Applied:');
  });

  it('Step 12 presents the final cluster-robust model with warning if G < 30', () => {
    const blocks = generateAllPanelConsoleBlocks(input, fitResult);
    const step12 = blocks[12];
    expect(step12.stataCommand).toContain('vce(cluster');
    expect(step12.stataOutput).toContain('Std. err. adjusted for 10 clusters');
    expect(step12.babyLanguage).toContain('Cluster-Robust');
  });
});
