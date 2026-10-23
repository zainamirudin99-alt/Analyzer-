import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { validatePanelMappingConfig } from '../../src/lib/panel-engine';
import grunfeldFixture from '../fixtures/panel/grunfeld.json';

describe('Fase P1: Impor Data, Pemilih Sheet & Pemetaan Kolom Data Panel', () => {
  const panelTabPath = path.resolve(__dirname, '../../src/components/PanelTab.tsx');

  describe('1. Validasi Pemetaan Kolom & Invarian Matematis (validatePanelMappingConfig)', () => {
    it('validates a correct panel dataset (Grunfeld 1958) successfully', () => {
      const result = validatePanelMappingConfig(
        grunfeldFixture,
        'company',
        'year',
        'invest',
        ['mvalue', 'kstock']
      );

      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.summary.nEntities).toBe(10);
      expect(result.summary.nPeriods).toBe(20);
      expect(result.summary.isBalanced).toBe(true);
    });

    it('enforces Invariant I5: Y cannot be in X predictors', () => {
      const result = validatePanelMappingConfig(
        grunfeldFixture,
        'company',
        'year',
        'invest',
        ['invest', 'mvalue']
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invariant I5') || e.includes('Invarian I5'))).toBe(true);
    });

    it('enforces Invariant I6: idCol and timeCol cannot be in X or Y', () => {
      const resultIdInY = validatePanelMappingConfig(
        grunfeldFixture,
        'company',
        'year',
        'company',
        ['mvalue', 'kstock']
      );
      expect(resultIdInY.isValid).toBe(false);
      expect(resultIdInY.errors.some(e => e.includes('Invarian I6'))).toBe(true);

      const resultTimeInX = validatePanelMappingConfig(
        grunfeldFixture,
        'company',
        'year',
        'invest',
        ['mvalue', 'year']
      );
      expect(resultTimeInX.isValid).toBe(false);
      expect(resultTimeInX.errors.some(e => e.includes('Invarian I6'))).toBe(true);
    });

    it('enforces Invariant I1: Y must be continuous numeric (blocks binary 0/1)', () => {
      const binaryRows = [
        { id: 1, year: 2020, y: 0, x: 10 },
        { id: 1, year: 2021, y: 1, x: 15 },
        { id: 2, year: 2020, y: 1, x: 20 },
        { id: 2, year: 2021, y: 0, x: 25 }
      ];

      const result = validatePanelMappingConfig(binaryRows, 'id', 'year', 'y', ['x']);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invarian I1') && e.includes('biner'))).toBe(true);
    });

    it('enforces Invariant I11: requires N >= 2 and T >= 2', () => {
      const singleEntity = [
        { id: 1, year: 2020, y: 100, x: 10 },
        { id: 1, year: 2021, y: 120, x: 15 }
      ];

      const result = validatePanelMappingConfig(singleEntity, 'id', 'year', 'y', ['x']);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invarian I11') && e.includes('entitas'))).toBe(true);
    });

    it('enforces Invariant I10: blocks duplicate (id, time) keys', () => {
      const duplicateKeyRows = [
        { id: 1, year: 2020, y: 100, x: 10 },
        { id: 1, year: 2020, y: 105, x: 12 }, // duplicate (1, 2020)
        { id: 2, year: 2020, y: 200, x: 20 },
        { id: 2, year: 2021, y: 220, x: 22 }
      ];

      const result = validatePanelMappingConfig(duplicateKeyRows, 'id', 'year', 'y', ['x']);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invarian I10') && e.includes('duplikat'))).toBe(true);
    });

    it('issues warning when T < 3 for Wooldridge autocorrelation requirement', () => {
      const shortTRows = [
        { id: 1, year: 2020, y: 100, x: 10 },
        { id: 1, year: 2021, y: 120, x: 15 },
        { id: 2, year: 2020, y: 200, x: 20 },
        { id: 2, year: 2021, y: 220, x: 25 }
      ];

      const result = validatePanelMappingConfig(shortTRows, 'id', 'year', 'y', ['x']);
      expect(result.isValid).toBe(true);
      expect(result.warnings.some(w => w.includes('T < 3') || w.includes('Wooldridge'))).toBe(true);
    });
  });

  describe('2. PanelTab.tsx UI Conformance for P1 (Impor, Sheet, Pemetaan)', () => {
    it('contains file upload (.xlsx, .xls, .csv), Google Sheets link, and Grunfeld preset', () => {
      expect(fs.existsSync(panelTabPath)).toBe(true);
      const content = fs.readFileSync(panelTabPath, 'utf8');

      // Local file upload
      expect(content).toContain('type="file"');
      expect(content).toContain('.xlsx');
      expect(content).toContain('/api/regression/upload');

      // Google Sheets link
      expect(content).toContain('/api/regression/import-link');

      // Preset button
      expect(content).toContain('handleLoadGrunfeldPreset');
    });

    it('contains sheet selection and table preview controls', () => {
      const content = fs.readFileSync(panelTabPath, 'utf8');

      expect(content).toContain('sheetsList');
      expect(content).toContain('activeSheet');
      expect(content).toContain('previewRows');
    });

    it('contains variable mapping selectors for idCol, timeCol, yCol, and xCols', () => {
      const content = fs.readFileSync(panelTabPath, 'utf8');

      expect(content).toContain('idCol');
      expect(content).toContain('timeCol');
      expect(content).toContain('yCol');
      expect(content).toContain('xCols');
      expect(content).toContain('validatePanelMappingConfig');
    });
  });
});
