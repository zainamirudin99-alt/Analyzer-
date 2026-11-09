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
import { createDefaultCEDPreset, getDefaultSkills, parseUploadedSkillFile } from '../../src/lib/indicators-storage';
import zlib from 'zlib';
import { buildAnalysisPrompt, normalizeScores, preprocessTextForCED } from '../../src/lib/gemini';
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

  it('provides built-in AI assistant skills (pdfreader & esg-auditor) with deep extraction instructions', () => {
    const defaultSkills = getDefaultSkills();
    expect(defaultSkills.length).toBeGreaterThanOrEqual(2);

    const pdfReader = defaultSkills.find(s => s.name === 'pdfreader');
    expect(pdfReader).toBeDefined();
    expect(pdfReader?.content).toContain('PDF Deep Reader');
    expect(pdfReader?.content).toContain('Navigasi Tabel & Metrik Kuantitatif');
    expect(pdfReader?.content).toContain('Format Nilai Riil & Zero Non-Disclosure');

    const esgAuditor = defaultSkills.find(s => s.name === 'esg-auditor');
    expect(esgAuditor).toBeDefined();
    expect(esgAuditor?.content).toContain('Rigorous ESG');
  });

  it('buildAnalysisPrompt injects active skill instructions as top-priority AI directives', () => {
    const promptWithSkill = buildAnalysisPrompt({
      companyCode: 'UNVR',
      fiscalYear: 'FY 2025',
      indicators: [
        { id: 'ghg1', code: 'GHG1', title: 'Inventarisasi Emisi', fullDesc: 'Scope 1, 2, 3', group: 'Emisi' }
      ],
      rubricType: 'quantitative_count',
      skillContent: 'Gunakan metodologi audit GHG Protocol tabel kinerja lingkungan hal 15-30.'
    });

    expect(promptWithSkill).toContain('DIREKTIF UTAMA DARI SKILL BANTUAN AI');
    expect(promptWithSkill).toContain('GHG Protocol tabel kinerja lingkungan');
    expect(promptWithSkill).toContain('WAJIB dijadikan panduan utama');
  });

  it('preprocessTextForCED prioritizes and retains skill keywords during text extraction', () => {
    const dummyPages = [
      '--- HALAMAN 1 ---\nKata Pengantar Direksi dan Profil Bisnis Perusahaan.',
      '--- HALAMAN 2 ---\nIkhtisar Keuangan dan Laporan Manajemen Umum.',
      '--- HALAMAN 3 ---\nTata Kelola Perusahaan dan Struktur Dewan Komisaris.',
      '--- HALAMAN 4 ---\nOperasional dan Fasilitas Logistik Perusahaan.',
      '--- HALAMAN 5 ---\nSumber Daya Manusia dan Pelatihan Karyawan.',
      '--- HALAMAN 6 ---\nManajemen Risiko Umum Perusahaan.',
      '--- HALAMAN 7 ---\nStrategi Bisnis dan Ekspansi Pasar.',
      '--- HALAMAN 8 ---\nKegiatan Sosial dan Hubungan Masyarakat.',
      '--- HALAMAN 9 ---\nTanggung Jawab Sosial Lingkungan Umum.',
      '--- HALAMAN 10 ---\nKomitmen Kepatuhan Regulasi.',
      '--- HALAMAN 11 ---\nTabel Kinerja Lingkungan: Pengolahan Air Limbah Pabrik mencapai 1000000 liter pada FY 2025.',
      '--- HALAMAN 12 ---\nSurat Pernyataan Dewan Direksi dan Penutup Laporan.'
    ].join('\n\n');

    const skill = 'Audit tabel kinerja lingkungan dan ekstraksi air limbah';
    // Budget terbatas hanya cukup untuk 11 halaman pertama
    const processed = preprocessTextForCED(dummyPages, 1000, undefined, skill);

    // Halaman 11 yang memuat kata kunci dari skill (air limbah) wajib diprioritaskan masuk
    expect(processed.toLowerCase()).toContain('air limbah');
  });

  it('encodes and decodes skills_used in record metadata', () => {
    const notesWithSkills = encodeNotesWithAnalyzerMeta('Catatan analisis tahunan', {
      preset_id: 'preset_green_15',
      preset_name: 'Standar Kualitas Perusahaan Hijau',
      owner_username: 'gojira123',
      dynamic_scores: { GHG1: '25000 ton CO2e' },
      skills_used: ['pdfreader', 'esg-auditor']
    });

    const decoded = decodeRecordAnalyzerMeta({
      company_code: 'UNVR',
      fiscal_year: 'FY 2025',
      file_name: 'UNVR.pdf',
      notes: notesWithSkills
    });

    expect(decoded.notes).toBe('Catatan analisis tahunan');
    expect(decoded.preset_id).toBe('preset_green_15');
    expect(decoded.owner_username).toBe('gojira123');
    expect(decoded.skills_used).toEqual(['pdfreader', 'esg-auditor']);
    expect(decoded.dynamic_scores?.['ghg1']).toBe('25000 ton CO2e');
  });

  it('parseUploadedSkillFile parses markdown skill files with frontmatter and multiline descriptions', async () => {
    const mdContent = `---
name: "carbon-expert"
description: >
  Deep carbon footprint and greenhouse gas auditing
  according to ISO 14064 standards.
---

# Carbon Footprint Auditor
Audit scope 1, 2, 3 emissions rigorously.`;

    const file = new File([Buffer.from(mdContent)], 'carbon-expert.md', { type: 'text/markdown' });
    const parsed = await parseUploadedSkillFile(file);

    expect(parsed.name).toBe('carbon expert');
    expect(parsed.description).toContain('Deep carbon footprint');
    expect(parsed.description).toContain('ISO 14064');
    expect(parsed.content).toContain('# Carbon Footprint Auditor');
  });

  it('parseUploadedSkillFile parses JSON skill files', async () => {
    const jsonContent = JSON.stringify({
      name: 'water-auditor',
      description: 'Auditing water consumption and treatment',
      content: '# Water Auditor\nExtract volume in liters or m3.'
    });

    const file = new File([Buffer.from(jsonContent)], 'water-auditor.json', { type: 'application/json' });
    const parsed = await parseUploadedSkillFile(file);

    expect(parsed.name).toBe('water-auditor');
    expect(parsed.description).toBe('Auditing water consumption and treatment');
    expect(parsed.content).toContain('Extract volume in liters');
  });

  it('parseUploadedSkillFile extracts and decompresses .skill ZIP packages containing SKILL.md', async () => {
    const fName = Buffer.from('SKILL.md');
    const skillContent = Buffer.from(`---
name: pdf-extractor
description: Advanced PDF extraction skill package
---

# PDF Extractor Instructions
Scan tables and extract exact numbers.`);

    const comp = zlib.deflateRawSync(skillContent);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // Local file header signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(8, 8); // compression method (8 = Deflate)
    header.writeUInt32LE(comp.length, 18); // compSize
    header.writeUInt32LE(skillContent.length, 22); // uncompSize
    header.writeUInt16LE(fName.length, 26); // nameLen
    header.writeUInt16LE(0, 28); // extraLen

    const zipBuffer = Buffer.concat([header, fName, comp]);
    const file = new File([zipBuffer], 'pdf-extractor.skill', { type: 'application/zip' });

    const parsed = await parseUploadedSkillFile(file);
    expect(parsed.name).toBe('pdf extractor');
    expect(parsed.description).toBe('Advanced PDF extraction skill package');
    expect(parsed.content).toContain('# PDF Extractor Instructions');
  });
});
