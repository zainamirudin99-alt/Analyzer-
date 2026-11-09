import { describe, it, expect } from 'vitest';
import {
  SCORING_RUBRIC,
  DEFAULT_BINARY_RUBRIC,
  IndicatorPreset,
  getPresetRubric,
  getPresetRubricType,
  getPresetMaxScore,
  encodeNotesWithAnalyzerMeta,
  decodeRecordAnalyzerMeta,
  formatCleanDisclosureLevel,
  resolveRecordPresetId,
  doesRecordMatchPreset,
  getRecordScoreForPresetIndicator
} from '../../src/lib/types';
import { createDefaultCEDPreset } from '../../src/lib/indicators-storage';
import { buildAnalysisPrompt, normalizeScores } from '../../src/lib/gemini';
import {
  generateExcelTemplate,
  parseExcelBuffer,
  generateDocxTemplate,
  parseDocxBuffer,
  parseRawText
} from '../../src/lib/indicator-importer';

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

  it('supports quantitative extraction mode with real values (e.g. 1000000 liter / 0 liter)', () => {
    const quantPreset: IndicatorPreset = {
      id: 'quant_disclosure_preset',
      name: 'Waste & Water Metric Mode',
      isDefault: false,
      rubricType: 'quantitative_count',
      indicators: [
        { id: 'w1', code: 'WATER1', title: 'Limbah Air Diolah', fullDesc: 'Jumlah limbah air yang diolah perusahaan', group: 'Limbah' },
        { id: 'e1', code: 'EMIS1', title: 'Total Emisi GRK', fullDesc: 'Jumlah emisi karbon', group: 'Emisi' }
      ]
    };

    expect(getPresetRubricType(quantPreset)).toBe('quantitative_count');
    const rubric = getPresetRubric(quantPreset);
    expect(rubric.length).toBe(2);
    expect(rubric[0].score).toBe('0');
    expect(rubric[1].score).toBe('Riil');

    const maxCount = getPresetMaxScore(quantPreset);
    expect(maxCount).toBe(2); // 2 indicators max
  });

  it('buildAnalysisPrompt generates quantitative extraction prompt with real values + units and "0" when undisclosed', () => {
    const prompt = buildAnalysisPrompt({
      companyCode: 'ASII',
      fiscalYear: 'FY 2024',
      indicators: [
        { id: 'w1', code: 'WATER1', title: 'Limbah Air', fullDesc: 'Volume air diolah', group: 'Limbah' }
      ],
      rubricType: 'quantitative_count'
    });

    expect(prompt).toContain('Quantitative Disclosure Extraction');
    expect(prompt).toContain('1000000 liter');
    expect(prompt).toContain('ditulis "0" saja');
    expect(prompt).toContain('"WATER1":"1000000 liter"');
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

  it('generates Excel template and parses it back accurately', () => {
    const buffer = generateExcelTemplate();
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);

    const parsed = parseExcelBuffer(buffer);
    expect(parsed.indicators.length).toBeGreaterThanOrEqual(5);
    expect(parsed.indicators.some((i: any) => i.code === 'CC1')).toBe(true);
    expect(parsed.indicators.some((i: any) => i.code === 'GHG1')).toBe(true);
  });

  it('generates Word docx template and parses it back accurately', async () => {
    const blob = await generateDocxTemplate();
    expect(blob).toBeDefined();
    const arrayBuffer = await blob.arrayBuffer();

    const parsed = await parseDocxBuffer(arrayBuffer);
    expect(parsed.indicators.length).toBeGreaterThanOrEqual(3);
    expect(parsed.indicators.some((i: any) => i.code === 'CC1')).toBe(true);
  });

  it('parses raw text in TSV, pipe, and colon formats', () => {
    const tsvText = "IND1\tKonservasi Hutan\tLingkungan\tMenanam 1000 pohon\nIND2\tEfisiensi Energi\tEnergi\tPengurangan konsumsi listrik";
    const tsvParsed = parseRawText(tsvText);
    expect(tsvParsed.length).toBe(2);
    expect(tsvParsed[0].code).toBe('IND1');
    expect(tsvParsed[0].title).toBe('Konservasi Hutan');
    expect(tsvParsed[0].group).toBe('Lingkungan');

    const pipeText = "IND3 | Keselamatan Kerja | Sosial | Program zero accident";
    const pipeParsed = parseRawText(pipeText);
    expect(pipeParsed.length).toBe(1);
    expect(pipeParsed[0].code).toBe('IND3');
    expect(pipeParsed[0].title).toBe('Keselamatan Kerja');

    const colonText = "IND4: Audit Keuangan: Tata Kelola: Pemeriksaan KAP independen";
    const colonParsed = parseRawText(colonText);
    expect(colonParsed.length).toBe(1);
    expect(colonParsed[0].code).toBe('IND4');
    expect(colonParsed[0].title).toBe('Audit Keuangan');
  });

  it('normalizes quantitative scores preserving metric strings with units and normalizing 0 / empty to "0"', () => {
    const rawAiOutput = {
      WATER1: '1000000 liter',
      EMIS1: '25000 ton CO2e',
      WASTE1: '0 liter',
      ENERGY1: ''
    };

    const normalized = normalizeScores(rawAiOutput, ['WATER1', 'EMIS1', 'WASTE1', 'ENERGY1'], undefined, 'quantitative_count');
    expect(normalized.water1).toBe('1000000 liter');
    expect(normalized.emis1).toBe('25000 ton CO2e');
    expect(normalized.waste1).toBe('0');
    expect(normalized.energy1).toBe('0');
  });

  it('normalizes purely qualitative narrative phrases without numbers to "0" and trims metrics in long sentences', () => {
    const rawAiOutput = {
      GHG1: 'Net Zero Emisi CC1 di seluruh rantai nilai |',
      CC1: 'Komitmen dekarbonisasi jangka panjang',
      ENRG1: '80 %',
      WATER1: 'Target limbah air sebesar 500.000 liter pada tahun 2025',
      WASTE1: '0 liter'
    };

    const normalized = normalizeScores(rawAiOutput, ['GHG1', 'CC1', 'ENRG1', 'WATER1', 'WASTE1'], undefined, 'quantitative_count');
    expect(normalized.ghg1).toBe('0'); // Pure narrative without digits -> '0'
    expect(normalized.cc1).toBe('0'); // Pure narrative without digits -> '0'
    expect(normalized.enrg1).toBe('80 %'); // Valid percentage with digits -> '80 %'
    expect(normalized.water1).toBe('500.000 liter'); // Extracted metric from sentence -> '500.000 liter'
    expect(normalized.waste1).toBe('0'); // '0 liter' -> '0'
  });

  it('encodes and decodes custom indicator metadata in Supabase notes without data loss', () => {
    const encoded = encodeNotesWithAnalyzerMeta('Laporan Keberlanjutan 2025', {
      preset_id: 'preset_green_15',
      preset_name: 'Standar Kualitas Perusahaan Hijau',
      dynamic_scores: { enrg1: '50000 kWh', water1: '0 liter', gov1: 4 },
      total_score: 12
    });

    const decoded = decodeRecordAnalyzerMeta({
      company_code: 'AKRA',
      fiscal_year: 'FY 2025',
      file_name: 'AKRA_2025.pdf',
      notes: encoded
    });

    expect(decoded.notes).toBe('Laporan Keberlanjutan 2025');
    expect(decoded.preset_id).toBe('preset_green_15');
    expect(decoded.preset_name).toBe('Standar Kualitas Perusahaan Hijau');
    expect(decoded.total_score).toBe(12);
    expect(decoded.dynamic_scores?.enrg1).toBe('50000 kWh');
    expect(decoded.dynamic_scores?.water1).toBe('0');
    expect(decoded.dynamic_scores?.gov1).toBe(4);
    expect(formatCleanDisclosureLevel('Sangat Tinggi (High Disclosure)', false)).toBe('Sangat Tinggi');
    expect(formatCleanDisclosureLevel('Sangat Rendah (Minimal)', false)).toBe('Sangat Rendah');
  });

  it('strictly isolates table rows and variable scores across different indicator presets even when variable codes overlap (e.g. GHG1, CC1, CC2)', () => {
    const defaultPreset = createDefaultCEDPreset();
    const greenPreset: IndicatorPreset = {
      id: 'preset_green_15',
      name: 'Standar Kualitas Perusahaan Hijau',
      isDefault: false,
      rubricType: 'quantitative_count',
      indicators: [
        { id: 'ghg1', code: 'GHG1', title: 'Inventarisasi & Reduksi GRK', fullDesc: '', group: 'Emisi' },
        { id: 'cc1', code: 'CC1', title: 'Target Net-Zero', fullDesc: '', group: 'Iklim' },
        { id: 'cc2', code: 'CC2', title: 'Risiko Iklim', fullDesc: '', group: 'Iklim' },
        { id: 'enrg1', code: 'ENRG1', title: 'Transisi Energi Terbarukan', fullDesc: '', group: 'Energi' },
        { id: 'water1', code: 'WATER1', title: 'Efisiensi Air', fullDesc: '', group: 'Air' }
      ]
    };
    const allPresets = [defaultPreset, greenPreset];

    // 1. Rekaman yang dianalisis menggunakan Standar CED 18
    const ced18Row = {
      company_code: 'AKRA',
      fiscal_year: 'FY 2025',
      file_name: 'AKRA_2025.pdf',
      preset_id: 'default_ced_18',
      ghg1: 2,
      cc1: 2,
      cc2: 1,
      ec1: 3
    };

    expect(doesRecordMatchPreset(ced18Row, defaultPreset, allPresets)).toBe(true);
    expect(doesRecordMatchPreset(ced18Row, greenPreset, allPresets)).toBe(false);
    // Saat menampilkan greenPreset, skor GHG1/CC1/CC2 dari ced18Row tidak boleh bocor
    expect(getRecordScoreForPresetIndicator(ced18Row, 'GHG1', greenPreset, allPresets)).toBe('0');
    expect(getRecordScoreForPresetIndicator(ced18Row, 'CC1', greenPreset, allPresets)).toBe('0');
    // Saat menampilkan defaultPreset, skor asli muncul
    expect(getRecordScoreForPresetIndicator(ced18Row, 'GHG1', defaultPreset, allPresets)).toBe(2);

    // 2. Rekaman cache lama yang tercemar (memiliki preset_id greenPreset tetapi isinya sebenarnya skor Likert 1-5 dari CED 18 dan seluruh indikator unik bernilai 0)
    const mislabeledLegacyRow = {
      company_code: 'BBCA',
      fiscal_year: 'FY 2025',
      file_name: 'BBCA_2025.pdf',
      preset_id: 'preset_green_15',
      ghg1: 4,
      cc1: 5,
      cc2: 5,
      dynamic_scores: {
        ghg1: '4',
        cc1: '5',
        cc2: '5',
        enrg1: '0',
        water1: '0'
      }
    };

    expect(resolveRecordPresetId(mislabeledLegacyRow, allPresets)).toBe('default_ced_18');
    expect(doesRecordMatchPreset(mislabeledLegacyRow, greenPreset, allPresets)).toBe(false);
    expect(doesRecordMatchPreset(mislabeledLegacyRow, defaultPreset, allPresets)).toBe(true);

    // 3. Rekaman yang benar-benar dianalisis menggunakan Standar Kualitas Perusahaan Hijau
    const validGreenRow = {
      company_code: 'PTBA',
      fiscal_year: 'FY 2025',
      file_name: 'PTBA_2025.pdf',
      preset_id: 'preset_green_15',
      dynamic_scores: {
        ghg1: '25000 ton CO2e',
        cc1: '0',
        cc2: '0',
        enrg1: '50000 kWh',
        water1: '1000000 liter'
      }
    };

    expect(resolveRecordPresetId(validGreenRow, allPresets)).toBe('preset_green_15');
    expect(doesRecordMatchPreset(validGreenRow, greenPreset, allPresets)).toBe(true);
    expect(doesRecordMatchPreset(validGreenRow, defaultPreset, allPresets)).toBe(false);
    expect(getRecordScoreForPresetIndicator(validGreenRow, 'WATER1', greenPreset, allPresets)).toBe('1000000 liter');
    expect(getRecordScoreForPresetIndicator(validGreenRow, 'GHG1', greenPreset, allPresets)).toBe('25000 ton CO2e');
    expect(getRecordScoreForPresetIndicator(validGreenRow, 'CC1', greenPreset, allPresets)).toBe('0');
  });
});
