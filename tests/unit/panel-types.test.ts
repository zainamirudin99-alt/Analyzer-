import { describe, it, expect } from 'vitest';
import grunfeldData from '../fixtures/panel/grunfeld.json';
import stataExpected from '../fixtures/panel/stata_grunfeld_expected.json';
import {
  PanelFitInput,
  PanelFitResult,
  PanelModelType,
  StataConsoleBlockData,
  PanelDeclarationResult,
  SUPPORTED_PANEL_MODELS
} from '../../src/lib/panel-types';

describe('Panel Types & Fixtures Integrity', () => {
  it('loads Grunfeld dataset fixture with 200 rows and 10 balanced companies', () => {
    expect(grunfeldData).toBeDefined();
    expect(grunfeldData.length).toBe(200);

    const companies = new Set(grunfeldData.map((d: any) => d.company));
    expect(companies.size).toBe(10);

    const years = new Set(grunfeldData.map((d: any) => d.year));
    expect(years.size).toBe(20);
    expect(Math.min(...Array.from(years))).toBe(1935);
    expect(Math.max(...Array.from(years))).toBe(1954);
  });

  it('verifies Stata expected benchmark fixture format and values', () => {
    expect(stataExpected.dataset).toContain('Grunfeld');
    expect(stataExpected.fem.coefficients.mvalue.b).toBeCloseTo(0.1101238, 6);
    expect(stataExpected.fem.coefficients.kstock.b).toBeCloseTo(0.3100653, 6);
    expect(stataExpected.fem.coefficients._cons.b).toBeCloseTo(-58.74393, 4);
    expect(stataExpected.rem.coefficients.mvalue.b).toBeCloseTo(0.1097812, 6);
    expect(stataExpected.modelSelection.selectedModel).toBe('REM');
  });

  it('verifies runtime constant SUPPORTED_PANEL_MODELS exists', () => {
    expect(SUPPORTED_PANEL_MODELS).toEqual(['CEM', 'FEM', 'REM']);
  });

  it('validates PanelFitInput type construct', () => {
    const input: PanelFitInput = {
      rows: grunfeldData,
      idCol: 'company',
      timeCol: 'year',
      yCol: 'invest',
      xCols: ['mvalue', 'kstock'],
      alpha: 0.05
    };
    expect(input.idCol).toBe('company');
    expect(input.timeCol).toBe('year');
    expect(input.yCol).toBe('invest');
    expect(input.xCols.length).toBe(2);
  });

  it('validates StataConsoleBlockData structure for 4 mandatory blocks', () => {
    const block: StataConsoleBlockData = {
      stepIndex: 8,
      stepTitle: 'Estimasi Fixed Effects Model (FEM)',
      stataCommand: 'xtreg invest mvalue kstock, fe',
      stataFunction: 'Mengestimasi regresi panel dengan intersep individual tetap per entitas.',
      stataOutput: 'Fixed-effects (within) regression ...',
      babyLanguage: 'Kita mengukur efek modal terhadap investasi dengan mengunci ciri unik tiap perusahaan.'
    };
    expect(block.stepIndex).toBe(8);
    expect(block.stataCommand).toContain('xtreg');
    expect(block.babyLanguage).toBeDefined();
  });
});
