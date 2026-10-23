import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { inspectAndCleanPanelData } from '../../src/lib/panel-engine';
import grunfeldFixture from '../fixtures/panel/grunfeld.json';

describe('Fase P2: Cek & Pembersihan Data serta Log Transformasi Kode Stata', () => {
  const panelTabPath = path.resolve(__dirname, '../../src/components/PanelTab.tsx');

  describe('1. Engine: inspectAndCleanPanelData', () => {
    it('cleans a standard panel dataset (Grunfeld) with zero loss and generates Stata log', () => {
      const result = inspectAndCleanPanelData(
        grunfeldFixture,
        'company',
        'year',
        'invest',
        ['mvalue', 'kstock']
      );

      expect(result.totalRawObs).toBe(200);
      expect(result.validObs).toBe(200);
      expect(result.droppedObs).toBe(0);
      expect(result.duplicateCount).toBe(0);
      expect(result.timeInvariantVars).toHaveLength(0);
      expect(result.entityEncoding.isEncoded).toBe(false); // Grunfeld company is already numeric 1..10
      expect(result.cleanedRows).toHaveLength(200);

      // Verify Stata log
      expect(result.stataDoLog).toContain('duplicates report');
      expect(result.stataDoLog).toContain('misstable summarize');
      expect(result.stataDoLog).toContain('xtset');
      expect(result.stataDoLog).toContain('xtsum');
    });

    it('detects and removes duplicate (id, time) observations and encodes string entities', () => {
      const duplicateDataset = [
        { company: 'A', year: 2020, invest: 100, mvalue: 500, kstock: 50 },
        { company: 'A', year: 2020, invest: 105, mvalue: 510, kstock: 52 }, // Duplicate
        { company: 'A', year: 2021, invest: 120, mvalue: 550, kstock: 60 },
        { company: 'B', year: 2020, invest: 200, mvalue: 800, kstock: 90 },
        { company: 'B', year: 2021, invest: 230, mvalue: 850, kstock: 95 }
      ];

      const result = inspectAndCleanPanelData(
        duplicateDataset,
        'company',
        'year',
        'invest',
        ['mvalue', 'kstock'],
        { dropDuplicates: true }
      );

      expect(result.duplicateCount).toBe(1);
      expect(result.droppedObs).toBe(1);
      expect(result.validObs).toBe(4);
      expect(result.entityEncoding.isEncoded).toBe(true); // Company 'A' and 'B' are string
      expect(result.cleanedRows).toHaveLength(4);
      expect(result.stataDoLog).toContain('duplicates drop');
      expect(result.stataDoLog).toContain('encode company, generate(id_num)');
    });

    it('performs listwise deletion on missing or invalid values', () => {
      const missingDataset = [
        { company: 1, year: 2020, invest: 100, mvalue: 500, kstock: 50 },
        { company: 1, year: 2021, invest: null, mvalue: 550, kstock: 60 }, // Missing Y
        { company: 2, year: 2020, invest: 200, mvalue: undefined, kstock: 90 }, // Missing X1
        { company: 2, year: 2021, invest: 230, mvalue: 850, kstock: 95 }
      ];

      const result = inspectAndCleanPanelData(
        missingDataset,
        'company',
        'year',
        'invest',
        ['mvalue', 'kstock'],
        { handleMissing: 'listwise' }
      );

      expect(result.totalRawObs).toBe(4);
      expect(result.droppedObs).toBe(2);
      expect(result.validObs).toBe(2);
      expect(result.missingSummary['invest']).toBe(1);
      expect(result.missingSummary['mvalue']).toBe(1);
    });

    it('enforces Invariant I12: detects time-invariant variables across entities', () => {
      const timeInvariantDataset = [
        { company: 1, year: 2020, invest: 100, mvalue: 500, sector: 1 },
        { company: 1, year: 2021, invest: 110, mvalue: 520, sector: 1 }, // sector doesn't change
        { company: 2, year: 2020, invest: 200, mvalue: 800, sector: 2 },
        { company: 2, year: 2021, invest: 210, mvalue: 820, sector: 2 }  // sector doesn't change
      ];

      const result = inspectAndCleanPanelData(
        timeInvariantDataset,
        'company',
        'year',
        'invest',
        ['mvalue', 'sector']
      );

      expect(result.timeInvariantVars).toContain('sector');
      expect(result.timeInvariantVars).not.toContain('mvalue');
      expect(result.stataDoLog).toContain('time-invariant');
    });
  });

  describe('2. UI Conformance in PanelTab.tsx for P2', () => {
    it('contains data cleaning inspection controls and summary badges', () => {
      expect(fs.existsSync(panelTabPath)).toBe(true);
      const content = fs.readFileSync(panelTabPath, 'utf8');

      expect(content).toContain('inspectAndCleanPanelData');
      expect(content).toContain('cleaningReport');
      expect(content).toContain('stataDoLog');
    });

    it('provides copy button for Stata .do transformation log', () => {
      const content = fs.readFileSync(panelTabPath, 'utf8');

      expect(content).toContain('handleCopyStataLog');
      expect(content).toContain('Salin Kode Stata');
    });
  });
});
