import { describe, it, expect } from 'vitest';
import {
  SCORING_RUBRIC,
  DEFAULT_BINARY_RUBRIC,
  IndicatorPreset,
  getPresetRubric,
  getPresetRubricType,
  getPresetMaxScore
} from '../../src/lib/types';
import { createDefaultCEDPreset } from '../../src/lib/indicators-storage';
import { buildAnalysisPrompt } from '../../src/lib/gemini';

describe('Custom Indicator Rubric & Dynamic Scoring Engine', () => {
  it('preserves Invariant I7: default CED 18 preset has 0-5 weighted rubric (max score 90)', () => {
    const defaultPreset = createDefaultCEDPreset();
    expect(defaultPreset.isDefault).toBe(true);
    expect(defaultPreset.rubricType).toBe('weighted');
    expect(defaultPreset.indicators.length).toBe(18);

    const rubric = getPresetRubric(defaultPreset);
    expect(rubric.length).toBe(6);
    expect(rubric[0].score).toBe(0);
    expect(rubric[5].score).toBe(5);

    const maxScore = getPresetMaxScore(defaultPreset);
    expect(maxScore).toBe(90); // 18 indicators × 5 points
  });

  it('supports custom weighted rubric with unlimited tiers and scores up to 100', () => {
    const customPreset: IndicatorPreset = {
      id: 'custom_carbon_100',
      name: 'Custom Carbon 100 Scale',
      isDefault: false,
      rubricType: 'weighted',
      rubric: [
        { score: 0, label: '0: Nol', desc: 'Tidak ada pengungkapan' },
        { score: 25, label: '25: Parsial', desc: 'Pengungkapan parsial' },
        { score: 50, label: '50: Sedang', desc: 'Pengungkapan memadai' },
        { score: 75, label: '75: Substansial', desc: 'Pengungkapan mendalam' },
        { score: 100, label: '100: Sempurna', desc: 'Pengungkapan sempurna komprehensif' }
      ],
      indicators: [
        { id: 'c1', code: 'C1', title: 'Carbon Target', fullDesc: 'Target penurunan', group: 'Target' },
        { id: 'c2', code: 'C2', title: 'Audit Eksternal', fullDesc: 'Verifikasi auditor', group: 'Audit' }
      ]
    };

    const rubric = getPresetRubric(customPreset);
    expect(rubric.length).toBe(5);
    expect(rubric[4].score).toBe(100);

    const maxScore = getPresetMaxScore(customPreset);
    expect(maxScore).toBe(200); // 2 indicators × 100 points
  });

  it('supports binary presence count mode without weighted points', () => {
    const binaryPreset: IndicatorPreset = {
      id: 'binary_disclosure_preset',
      name: 'ESG Checklist Mode',
      isDefault: false,
      rubricType: 'binary_count',
      indicators: [
        { id: 'i1', code: 'IND1', title: 'Indikator 1', fullDesc: 'Deskripsi 1', group: 'General' },
        { id: 'i2', code: 'IND2', title: 'Indikator 2', fullDesc: 'Deskripsi 2', group: 'General' },
        { id: 'i3', code: 'IND3', title: 'Indikator 3', fullDesc: 'Deskripsi 3', group: 'General' }
      ]
    };

    expect(getPresetRubricType(binaryPreset)).toBe('binary_count');
    const rubric = getPresetRubric(binaryPreset);
    expect(rubric.length).toBe(2);
    expect(rubric[0].score).toBe(0);
    expect(rubric[1].score).toBe(1);

    const maxScore = getPresetMaxScore(binaryPreset);
    expect(maxScore).toBe(3); // 3 indicators disclosed max
  });

  it('buildAnalysisPrompt generates binary checklist prompt when rubricType is binary_count', () => {
    const prompt = buildAnalysisPrompt({
      companyCode: 'ASII',
      fiscalYear: 'FY 2024',
      indicators: [
        { id: 'i1', code: 'IND1', title: 'Indikator 1', fullDesc: 'Deskripsi 1', group: 'General' }
      ],
      rubricType: 'binary_count'
    });

    expect(prompt).toContain('Checklist / Binary Count');
    expect(prompt).toContain('0 (jika tidak diungkapkan) atau 1 (jika diungkapkan)');
    expect(prompt).toContain('"IND1":0');
  });

  it('buildAnalysisPrompt formats dynamic rubric tiers up to 100 for weighted mode', () => {
    const prompt = buildAnalysisPrompt({
      companyCode: 'BBCA',
      fiscalYear: 'FY 2024',
      indicators: [
        { id: 't1', code: 'TAX1', title: 'Tax Transparency', fullDesc: 'Laporan pajak', group: 'Tax' }
      ],
      rubricType: 'weighted',
      rubric: [
        { score: 0, label: '0: Nil', desc: 'Tidak ada data' },
        { score: 50, label: '50: Parsial', desc: 'Data setengah' },
        { score: 100, label: '100: Sempurna', desc: 'Data lengkap 100 persen' }
      ]
    });

    expect(prompt).toContain('Skala 0 sampai 100');
    expect(prompt).toContain('100: Sempurna — Data lengkap 100 persen');
    expect(prompt).toContain('nilai skor 0 sampai 100');
  });
});
