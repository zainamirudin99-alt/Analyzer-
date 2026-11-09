import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  setStoredAuthSession,
  applySnapshotToLocal,
  readLocalSnapshot,
  clearLocalSnapshot,
  getCurrentAccountOwner
} from '../../src/lib/account-sync';
import {
  encodeNotesWithAnalyzerMeta,
  decodeRecordAnalyzerMeta,
  CEDResultRecord
} from '../../src/lib/types';
import { runStatisticalRegression } from '../../src/lib/regression-engine';
import { generateRegressionDocx } from '../../src/lib/regression-docx-builder';
import { generateRegressionXLSX } from '../../src/lib/regression-export-xlsx';
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
  computePanelResiduals,
  testPanelNormality,
  computeClusterRobustSE,
  generateEasyPanelInterpretation
} from '../../src/lib/panel-engine';
import { PanelFitInput, PanelFitResult } from '../../src/lib/panel-types';
import { generatePanelDocx } from '../../src/lib/panel-docx-builder';
import { buildPanelXlsxBuffer } from '../../src/lib/panel-export-xlsx';

function installBrowserMock() {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); }
  };
  (globalThis as any).localStorage = mockLocalStorage;
  (globalThis as any).window = {
    localStorage: mockLocalStorage,
    dispatchEvent: () => true
  };
  (globalThis as any).CustomEvent = class {
    type: string;
    detail: any;
    constructor(type: string, opts?: any) {
      this.type = type;
      this.detail = opts?.detail;
    }
  };
}

describe('Multi-Account Data Isolation (API Keys, Presets, Records, Skills)', () => {
  beforeEach(() => {
    installBrowserMock();
  });

  it('wipes previous user API keys, presets, skills, and records when switching accounts', () => {
    setStoredAuthSession({ id: 'u1', username: 'alice_user' }, 'token-alice');
    expect(getCurrentAccountOwner()).toBe('alice_user');

    localStorage.setItem('custom_gemini_key', 'AIzaSyAliceSecretKey111');
    localStorage.setItem('custom_openai_key', 'sk-alice-openai-111');
    localStorage.setItem('analyzer_indicator_presets', JSON.stringify([
      { id: 'preset-alice', name: 'Indikator Alice', indicators: [], rubric: [], rubricMode: 'scored' }
    ]));
    localStorage.setItem('analyzer_custom_skills', JSON.stringify([
      { id: 'skill-alice', name: 'Skill Alice', description: 'Desc', content: 'Alice Prompt' }
    ]));
    localStorage.setItem('analyzer_records', JSON.stringify([
      { company_code: 'BBCA', report_year: 2025, owner_username: 'alice_user', total_score: 50 }
    ]));

    expect(readLocalSnapshot().custom_gemini_key).toBe('AIzaSyAliceSecretKey111');

    // User B logs in on the same browser -> User A's local snapshot MUST be wiped immediately
    setStoredAuthSession({ id: 'u2', username: 'bob_user' }, 'token-bob');
    expect(getCurrentAccountOwner()).toBe('bob_user');
    expect(localStorage.getItem('custom_gemini_key')).toBeNull();
    expect(localStorage.getItem('custom_openai_key')).toBeNull();
    expect(localStorage.getItem('analyzer_indicator_presets')).toBeNull();
    expect(localStorage.getItem('analyzer_custom_skills')).toBeNull();
    expect(localStorage.getItem('analyzer_records')).toBeNull();
  });

  it('filters analyzer_records by owner_username and replaces all keys when hydrating an account', () => {
    setStoredAuthSession({ id: 'u2', username: 'bob_user' }, 'token-bob');
    localStorage.setItem('custom_claude_key', 'leftover-key');

    const mixedRecords = JSON.stringify([
      { company_code: 'TLKM', report_year: 2024, owner_username: 'bob_user', total_score: 70 },
      { company_code: 'ASII', report_year: 2024, owner_username: 'alice_user', total_score: 80 }
    ]);

    applySnapshotToLocal(
      {
        custom_gemini_key: 'AIzaSyBobKey222',
        analyzer_records: mixedRecords
      },
      { replaceAll: true, ownerUsername: 'bob_user' }
    );

    expect(localStorage.getItem('custom_claude_key')).toBeNull();
    expect(localStorage.getItem('custom_gemini_key')).toBe('AIzaSyBobKey222');

    const savedRecords = JSON.parse(localStorage.getItem('analyzer_records') || '[]');
    expect(savedRecords).toHaveLength(1);
    expect(savedRecords[0].company_code).toBe('TLKM');
    expect(savedRecords[0].owner_username).toBe('bob_user');

    clearLocalSnapshot();
    expect(localStorage.getItem('custom_gemini_key')).toBeNull();
  });

  it('encodes and decodes owner_username in ced_results notes metadata for Supabase isolation', () => {
    const encoded = encodeNotesWithAnalyzerMeta('Catatan analisis laporan', {
      preset_id: 'preset-hijau',
      preset_name: 'Standar Hijau',
      dynamic_scores: { WATER1: '1500 liter' },
      total_score: 1500,
      owner_username: 'Gojira123'
    });

    const rawRecord: CEDResultRecord = {
      company_code: 'AKRA',
      report_year: 2025,
      fiscal_year: 'FY 2025',
      file_name: 'AKRA_2025.pdf',
      total_score: 1500,
      disclosure_level: 'Tinggi',
      notes: encoded,
      cc1: 0, cc2: 0, ghg1: 0, ghg2: 0, ghg3: 0, ghg4: 0, ghg5: 0, ghg6: 0, ghg7: 0,
      ec1: 0, ec2: 0, ec3: 0, rc1: 0, rc2: 0, rc3: 0, rc4: 0, acc1: 0, acc2: 0
    };

    const decoded = decodeRecordAnalyzerMeta(rawRecord);
    expect(decoded.notes).toBe('Catatan analisis laporan');
    expect(decoded.owner_username).toBe('gojira123');
    expect(decoded.preset_id).toBe('preset-hijau');
    expect(decoded.dynamic_scores?.WATER1).toBe('1500 liter');
  });
});

describe('Publication-Grade Regression & Panel Stata Exports (DOCX & XLSX)', () => {
  it('generates neat SPSS Regression DOCX and auto-sized 8-sheet XLSX', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      Y: 12 + 2.5 * (i + 1) + Math.sin(i),
      X1: i + 1,
      X2: (i + 1) * 0.8 + Math.cos(i)
    }));

    const result = runStatisticalRegression({
      rows,
      yCol: 'Y',
      xCols: ['X1', 'X2'],
      alpha: 0.05
    });

    const docxBuf = await generateRegressionDocx({
      result,
      datasetName: 'Data_Uji_Regresi.xlsx',
      sheetName: 'Sheet1',
      alpha: 0.05
    });
    expect(docxBuf.length).toBeGreaterThan(2000);
    expect(docxBuf[0]).toBe(0x50);
    expect(docxBuf[1]).toBe(0x4b);

    const xlsxBuf = generateRegressionXLSX({
      result,
      datasetName: 'Data_Uji_Regresi.xlsx',
      sheetName: 'Sheet1'
    });
    const wb = XLSX.read(xlsxBuf, { type: 'buffer', cellStyles: true });
    expect(wb.SheetNames).toEqual([
      'Ringkasan_Model',
      'Statistik_Deskriptif',
      'Tabel_SPSS_Utama',
      'Diagnostik_Asumsi',
      'Rekomendasi_Remedial',
      'Perbandingan_Model',
      'Matriks_Kriteria',
      'Residu_Prediksi'
    ]);
    const mainSheet = wb.Sheets['Tabel_SPSS_Utama'];
    expect(mainSheet['!ref']).toBeDefined();
  });

  it('generates neat Stata Panel Regression DOCX and auto-sized 6-sheet XLSX', async () => {
    const panelRows: Record<string, any>[] = [];
    const firms = ['BBCA', 'BMRI', 'BBRI', 'BBNI', 'BRIS', 'CIMB'];
    for (let i = 0; i < firms.length; i++) {
      for (let t = 2019; t <= 2024; t++) {
        const x1 = 10 + i * 2 + (t - 2018) * 1.3 + Math.sin(i + t);
        const x2 = 5 + i * 0.8 + Math.cos(i * t) * 2;
        const y = 25 + i * 4 + 1.8 * x1 - 0.9 * x2 + Math.sin(t) * 0.5;
        panelRows.push({ Emiten: firms[i], Tahun: t, ROA: y, CED: x1, LEV: x2 });
      }
    }

    const input: PanelFitInput = {
      rows: panelRows,
      idCol: 'Emiten',
      timeCol: 'Tahun',
      yCol: 'ROA',
      xCols: ['CED', 'LEV'],
      alpha: 0.05
    };

    const struct = validatePanelStructure(panelRows, 'Emiten', 'Tahun');
    const cem = fitPanelCEM(input);
    const fem = fitPanelFEM(input);
    const rem = fitPanelREM(input);
    const chow = testChow(cem, fem, 0.05);
    const hausman = testHausman(fem, rem, input, 0.05);
    const mundlak = testMundlakCRE(input, 0.05);
    const bplm = testBreuschPaganLM(input, 0.05);
    const sel = selectOptimalPanelModel(chow, hausman, mundlak, bplm, 0.05);
    const baseSelected = sel.selectedModel === 'FEM' ? fem : sel.selectedModel === 'REM' ? rem : cem;
    const robustSelected = computeClusterRobustSE(baseSelected, input);
    const vif = testPanelVIF(input);
    const hetero = testGroupwiseHeteroGreene(input, fem, 0.05);
    const serial = testWooldridgeSerial(input, 0.05);
    const resids = computePanelResiduals(baseSelected, input);
    const norm = testPanelNormality(resids.eResiduals, 0.05);
    const easy = generateEasyPanelInterpretation(robustSelected, 'ROA', ['CED', 'LEV'], 0.05);

    const panelRes: PanelFitResult = {
      success: true,
      declaration: {
        isValid: struct.isValid,
        entityCount: struct.entityCount,
        timeCount: struct.timeCount,
        totalObs: struct.totalObs,
        isBalanced: struct.isBalanced,
        tMin: struct.tMin,
        tAvg: struct.tAvg,
        tMax: struct.tMax,
        hasDuplicates: struct.hasDuplicates,
        duplicateCount: struct.duplicateCount,
        timeSpan: struct.timeSpan,
        errors: struct.errors,
        warnings: struct.warnings
      },
      models: { cem, fem, rem },
      selection: sel,
      selectedModel: baseSelected,
      finalModel: robustSelected,
      assumptions: {
        vif,
        greeneHetero: hetero,
        wooldridgeSerial: serial,
        normality: norm
      },
      easyInterpretation: easy,
      consoleBlocks: [
        {
          stepIndex: 1,
          stepTitle: 'Deklarasi Panel (xtset)',
          stataCommand: 'xtset Emiten Tahun',
          stataFunction: 'Deklarasi identitas dan periode panel',
          stataOutput: '       panel variable:  Emiten (strongly balanced)\n        time variable:  Tahun, 2019 to 2024\n                delta:  1 unit',
          babyLanguage: 'Panel seimbang.'
        }
      ]
    };

    const docxBuf = await generatePanelDocx({
      fitResult: panelRes,
      datasetName: 'Panel_Perbankan.xlsx'
    });
    expect(docxBuf.length).toBeGreaterThan(2500);
    expect(docxBuf[0]).toBe(0x50);
    expect(docxBuf[1]).toBe(0x4b);

    const xlsxBuf = buildPanelXlsxBuffer({
      fitResult: panelRes,
      datasetName: 'Panel_Perbankan.xlsx'
    });
    const wb = XLSX.read(xlsxBuf, { type: 'buffer' });
    expect(wb.SheetNames).toEqual([
      'Ringkasan_Panel',
      'Perbandingan_3_Model',
      'Uji_Pemilihan_Model',
      'Model_Akhir_Robust',
      'Diagnostik_Asumsi_VIF',
      'Log_13_Langkah_Stata'
    ]);
  });
});
