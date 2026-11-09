// ============================================================
// Types Definition for Analyzer (Carbon Emission Disclosure)
// ============================================================

export type AppLanguage = 'id' | 'en';

export type CEDIndicatorKey =
  | 'cc1' | 'cc2'
  | 'ghg1' | 'ghg2' | 'ghg3' | 'ghg4' | 'ghg5' | 'ghg6' | 'ghg7'
  | 'ec1' | 'ec2' | 'ec3'
  | 'rc1' | 'rc2' | 'rc3' | 'rc4'
  | 'acc1' | 'acc2';

export const INDICATOR_KEYS: CEDIndicatorKey[] = [
  'cc1', 'cc2',
  'ghg1', 'ghg2', 'ghg3', 'ghg4', 'ghg5', 'ghg6', 'ghg7',
  'ec1', 'ec2', 'ec3',
  'rc1', 'rc2', 'rc3', 'rc4',
  'acc1', 'acc2'
];

export const INDICATOR_KEYS_UPPER = [
  'CC1', 'CC2',
  'GHG1', 'GHG2', 'GHG3', 'GHG4', 'GHG5', 'GHG6', 'GHG7',
  'EC1', 'EC2', 'EC3',
  'RC1', 'RC2', 'RC3', 'RC4',
  'ACC1', 'ACC2'
] as const;

export type CEDScores = Record<CEDIndicatorKey, number>;

export interface IndicatorItem {
  id: string;          // misal: 'cc1', 'water1'
  code: string;        // kode kapital, misal: 'CC1', 'WATER1'
  title: string;       // judul indikator utama
  fullDesc: string;    // deskripsi kriteria penilaian utama
  group: string;       // nama kelompok/grup utama
  // Field dwibahasa opsional untuk translasi otomatis ID <-> EN
  title_id?: string;
  title_en?: string;
  fullDesc_id?: string;
  fullDesc_en?: string;
  group_id?: string;
  group_en?: string;
}

export interface RubricItem {
  score: number | string; // nilai numerik (misal 0, 1, 2, ..., 100) atau label nilai riil ('Riil')
  label: string;       // nama tingkatan (ID)
  desc: string;        // rincian kriteria penilaian (ID)
  label_en?: string;   // dwibahasa EN
  desc_en?: string;
}

export type RubricType = 'weighted' | 'binary_count' | 'quantitative_count';

export interface IndicatorPreset {
  id: string;          // 'default_ced_18' atau string unik
  name: string;        // nama preset
  description?: string;
  name_id?: string;
  name_en?: string;
  description_id?: string;
  description_en?: string;
  isDefault: boolean;  // true untuk bawaan 18 CED
  rubricType?: RubricType; // 'weighted' (skala skor) | 'quantitative_count' (ekstraksi nilai riil kuantitatif / volume nominal)
  rubric?: RubricItem[];   // kriteria rubrik kustom (jika tidak ada, fallback ke SCORING_RUBRIC atau DEFAULT_QUANTITATIVE_RUBRIC)
  indicators: IndicatorItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomAISkill {
  id: string;          // id unik skill
  name: string;        // nama skill
  description?: string;// deskripsi singkat dari frontmatter YAML jika ada
  fileName?: string;   // nama file saat diunggah (.skill/.md/.txt)
  content: string;     // instruksi pedoman auditing/persona
  createdAt: string;
}

export interface CEDResultRecord extends Partial<CEDScores> {
  [key: string]: any;
  id?: string;
  company_code: string;
  fiscal_year: string;
  file_name: string;
  notes?: string;
  status?: string;
  total_score?: number;
  disclosure_level?: string;
  model_used?: string;
  preset_id?: string;
  preset_name?: string;
  owner_username?: string;
  dynamic_scores?: Record<string, number | string>;
  created_at?: string;
  updated_at?: string;
}

export interface IndicatorGroup {
  id: string;
  name: string;
  emoji: string;
  description: string;
  keys: CEDIndicatorKey[];
}

export const CED_GROUPS: IndicatorGroup[] = [
  {
    id: 'cc',
    name: 'Climate Change (CC)',
    emoji: '🌡️',
    description: 'Penilaian risiko regulasi, strategi mitigasi, serta implikasi finansial dan peluang bisnis dari perubahan iklim.',
    keys: ['cc1', 'cc2']
  },
  {
    id: 'ghg',
    name: 'Greenhouse Gas (GHG)',
    emoji: '💨',
    description: 'Metodologi, verifikasi pihak ketiga, kuantifikasi total, cakupan (Scope 1, 2, 3), sumber emisi, fasilitas, dan tren emisi GRK.',
    keys: ['ghg1', 'ghg2', 'ghg3', 'ghg4', 'ghg5', 'ghg6', 'ghg7']
  },
  {
    id: 'ec',
    name: 'Energy Consumption (EC)',
    emoji: '⚡',
    description: 'Total konsumsi energi fosil/listrik, pemanfaatan energi baru terbarukan (EBT), serta rincian per tipe/fasilitas/segmen.',
    keys: ['ec1', 'ec2', 'ec3']
  },
  {
    id: 'rc',
    name: 'Reduction Commitment (RC)',
    emoji: '🎯',
    description: 'Rencana aksi pengurangan emisi, target tahunan/level, pencapaian penghematan biaya emisi, serta capex belanja modal iklim.',
    keys: ['rc1', 'rc2', 'rc3', 'rc4']
  },
  {
    id: 'acc',
    name: 'Accountability (ACC)',
    emoji: '🏛️',
    description: 'Tata kelola dewan/komite eksekutif yang bertanggung jawab atas aksi iklim dan mekanisme peninjauan berkala kemajuan perusahaan.',
    keys: ['acc1', 'acc2']
  }
];

export const INDICATOR_DESCRIPTIONS: Record<CEDIndicatorKey, { title: string; fullDesc: string; title_en: string; fullDesc_en: string }> = {
  cc1: {
    title: 'Penilaian & Aksi Risiko Perubahan Iklim',
    fullDesc: 'Penilaian/deskripsi dari risiko (peraturan/regulasi baik khusus maupun umum) yang berhubungan dengan perubahan iklim dan aksi yang dilakukan untuk mengatasi risiko tersebut.',
    title_en: 'Climate Change Risk Assessment & Actions',
    fullDesc_en: 'Assessment/description of risks (specific or general regulatory/physical risks) related to climate change and actions taken to manage or mitigate those risks.'
  },
  cc2: {
    title: 'Implikasi Finansial & Peluang Bisnis Iklim',
    fullDesc: 'Penilaian/deskripsi saat ini (dan masa depan) dari implikasi keuangan, implikasi bisnis, dan peluang dari perubahan iklim.',
    title_en: 'Financial Implications & Business Opportunities of Climate Change',
    fullDesc_en: 'Current (and future) assessment/description of financial implications, business impacts, and opportunities arising from climate change.'
  },
  ghg1: {
    title: 'Metodologi Penghitungan Emisi GRK',
    fullDesc: 'Deskripsi tentang metodologi yang digunakan untuk mengkalkulasi (menghitung) emisi GRK (gas rumah kaca atau standar ISO/GHG Protocol).',
    title_en: 'GHG Emissions Calculation Methodology',
    fullDesc_en: 'Description of the methodology used to calculate greenhouse gas (GHG) emissions (e.g., GHG Protocol, IPCC, or ISO standards).'
  },
  ghg2: {
    title: 'Verifikasi Pihak Eksternal Emisi GRK',
    fullDesc: 'Keberadaan verifikasi dari pihak eksternal independen dalam mengukur jumlah emisi GRK (siapa auditornya dan atas dasar standar apa).',
    title_en: 'External Verification / Assurance of GHG Emissions',
    fullDesc_en: 'Presence of independent third-party verification/assurance in measuring GHG emissions (identifying the auditor and assurance standard).'
  },
  ghg3: {
    title: 'Total Kuantifikasi Emisi GRK',
    fullDesc: 'Pengungkapan angka kuantitatif total emisi GRK yang dihasilkan oleh perusahaan.',
    title_en: 'Total GHG Emissions Quantification',
    fullDesc_en: 'Quantitative disclosure of total greenhouse gas (GHG) emissions generated by the company.'
  },
  ghg4: {
    title: 'Cakupan Emisi (Scope 1, 2, atau 3)',
    fullDesc: 'Pengungkapan rincian emisi GRK langsung Lingkup 1 (Scope 1) dan tidak langsung Lingkup 2 (Scope 2), atau Lingkup 3.',
    title_en: 'Emissions Breakdown by Scope (Scope 1, 2, or 3)',
    fullDesc_en: 'Disclosure of direct Scope 1, indirect Scope 2, and/or value-chain Scope 3 GHG emissions.'
  },
  ghg5: {
    title: 'Emisi GRK Berdasarkan Asal / Sumber',
    fullDesc: 'Pengungkapan emisi GRK berdasarkan pada asal maupun sumber energi (misalnya: batu bara, solar/diesel, listrik PLN, gas bumi, dll).',
    title_en: 'GHG Emissions by Source / Fuel Type',
    fullDesc_en: 'Disclosure of GHG emissions broken down by origin or energy source (e.g., coal, diesel, grid electricity, natural gas).'
  },
  ghg6: {
    title: 'Emisi GRK Berdasarkan Fasilitas / Segmen',
    fullDesc: 'Pengungkapan emisi GRK yang dirinci berdasarkan unit fasilitas operasi, wilayah tambang, pabrik peleburan, atau level segmen bisnis.',
    title_en: 'GHG Emissions by Facility / Operating Segment',
    fullDesc_en: 'Disclosure of GHG emissions broken down by operating facility, mine site, plant, or business segment.'
  },
  ghg7: {
    title: 'Tren / Perbandingan Emisi dengan Tahun Lalu',
    fullDesc: 'Perbandingan angka emisi GRK tahun berjalan dengan tahun-tahun sebelumnya (historis/trend analysis).',
    title_en: 'Historical GHG Emissions Trend & Year-on-Year Comparison',
    fullDesc_en: 'Comparison of current year GHG emissions with previous years (historical multi-year trend analysis).'
  },
  ec1: {
    title: 'Total Energi yang Dikonsumsi',
    fullDesc: 'Total energi yang dikonsumsi secara operasional (misalnya dalam satuan Liter, Giga Joule, Tera Joule, Peta Joule, atau MWh).',
    title_en: 'Total Operational Energy Consumed',
    fullDesc_en: 'Total energy consumed across operations (measured in Liters, Gigajoules, Terajoules, Petajoules, or MWh).'
  },
  ec2: {
    title: 'Pemanfaatan Energi Terbarukan (EBT)',
    fullDesc: 'Kuantifikasi energi yang digunakan dari sumber daya yang dapat diperbarui (solar panel, PLTMH, biomassa, biodiesel, dll).',
    title_en: 'Renewable Energy Utilization',
    fullDesc_en: 'Quantification of energy consumed from renewable sources (solar PV, hydro, biomass, biofuel/biodiesel, etc.).'
  },
  ec3: {
    title: 'Rincian Energi per Tipe / Fasilitas / Segmen',
    fullDesc: 'Pengungkapan konsumsi energi yang diklasifikasikan menurut tipe bahan bakar, fasilitas site operasional, atau segmen anak usaha.',
    title_en: 'Energy Breakdown by Type / Facility / Segment',
    fullDesc_en: 'Disclosure of energy consumption classified by fuel type, operational site/facility, or subsidiary segment.'
  },
  rc1: {
    title: 'Rencana & Strategi Detail Pengurangan Emisi',
    fullDesc: 'Rencana atau strategi yang terperinci dan terstruktur untuk mereduksi emisi GRK perusahaan (dekarbonisasi).',
    title_en: 'Detailed Emission Reduction Plan & Strategy',
    fullDesc_en: 'Detailed and structured plan or strategy to reduce corporate GHG emissions (decarbonization roadmap).'
  },
  rc2: {
    title: 'Target Tingkat / Level & Tahun Target Emisi',
    fullDesc: 'Spesifikasi angka target penurunan (persentase pengurangan) beserta tahun target pencapaian (misal Net Zero 2050 / 30% reduction by 2030).',
    title_en: 'Emission Reduction Target Level & Target Year',
    fullDesc_en: 'Specification of quantitative emission reduction targets (percentage/absolute) and target year (e.g., Net Zero 2050 or 30% reduction by 2030).'
  },
  rc3: {
    title: 'Realisasi Pengurangan Emisi & Penghematan Biaya',
    fullDesc: 'Pengurangan emisi aktual dan biaya atau penghematan (cost saving) yang berhasil dicapai sebagai akibat implementasi rencana efisiensi karbon.',
    title_en: 'Actual Emission Reductions & Cost Savings Achieved',
    fullDesc_en: 'Actual emission reductions and associated cost savings achieved to date as a result of carbon efficiency initiatives.'
  },
  rc4: {
    title: 'Biaya Emisi Masa Depan dalam Capex Planning',
    fullDesc: 'Perhitungan perkiraan biaya emisi/pajak karbon masa depan yang diintegrasikan ke dalam perencanaan belanja modal (capital expenditure planning).',
    title_en: 'Future Carbon Emissions Cost in Capex Planning',
    fullDesc_en: 'Factoring of future carbon emissions costs/carbon pricing into capital expenditure (CapEx) planning.'
  },
  acc1: {
    title: 'Komite / Dewan Penanggung Jawab Aksi Iklim',
    fullDesc: 'Indikasi keberadaan dewan komisaris, komite keberlanjutan (ESG Committee), atau badan eksekutif yang memegang tanggung jawab atas aksi perubahan iklim.',
    title_en: 'Board / Committee Responsible for Climate Action',
    fullDesc_en: 'Indication that a board committee, sustainability/ESG committee, or executive body has overall responsibility for actions related to climate change.'
  },
  acc2: {
    title: 'Mekanisme Dewan Meninjau Kemajuan Iklim',
    fullDesc: 'Deskripsi mekanisme formal di mana dewan/manajemen eksekutif melakukan peninjauan (review & audit) berkala atas kemajuan target perubahan iklim perusahaan.',
    title_en: 'Board Mechanism for Reviewing Climate Progress',
    fullDesc_en: 'Description of the formal mechanism by which the board/executive management periodically reviews the company’s progress regarding climate change.'
  }
};

export const SCORING_RUBRIC = [
  {
    score: 0,
    label: '0: Tidak Ada Pengungkapan',
    desc: 'Tidak ada informasi atau pengungkapan sama sekali mengenai indikator terkait.',
    label_en: '0: No Disclosure',
    desc_en: 'No information or disclosure at all regarding the indicator.'
  },
  {
    score: 1,
    label: '1: Kurang dari 3 Kalimat',
    desc: 'Diungkapkan sangat singkat dalam kurang dari tiga kalimat.',
    label_en: '1: Less than 3 Sentences',
    desc_en: 'Disclosed very briefly in fewer than three sentences.'
  },
  {
    score: 2,
    label: '2: 1 Paragraf / ≤ ½ Halaman',
    desc: 'Diungkapkan dalam tiga kalimat hingga satu paragraf (tidak lebih dari setengah halaman).',
    label_en: '2: 1 Paragraph / ≤ ½ Page',
    desc_en: 'Disclosed in three sentences up to one paragraph (no more than half a page).'
  },
  {
    score: 3,
    label: '3: ½ s/d 1 Halaman A4',
    desc: 'Diungkapkan secara substansial minimal setengah halaman tetapi kurang dari satu halaman A4 penuh.',
    label_en: '3: ½ to 1 Full A4 Page',
    desc_en: 'Substantially disclosed across at least half a page but less than one full A4 page.'
  },
  {
    score: 4,
    label: '4: 1 Halaman Penuh A4',
    desc: 'Diungkapkan secara mendalam pada satu halaman A4 penuh.',
    label_en: '4: 1 Full A4 Page',
    desc_en: 'Thoroughly disclosed across one full A4 page.'
  },
  {
    score: 5,
    label: '5: > 1 Halaman A4',
    desc: 'Diungkapkan secara komprehensif pada lebih dari satu halaman A4.',
    label_en: '5: > 1 A4 Page',
    desc_en: 'Comprehensively disclosed across more than one full A4 page.'
  }
];

export const DEFAULT_BINARY_RUBRIC: RubricItem[] = [
  {
    score: 0,
    label: '0: Tidak Diungkapkan',
    desc: 'Tidak ada informasi, data, atau pengungkapan sama sekali mengenai indikator terkait pada file laporan.',
    label_en: '0: Not Disclosed',
    desc_en: 'No information, data, or disclosure found in the report for this indicator.'
  },
  {
    score: 1,
    label: '1: Diungkapkan dalam Laporan',
    desc: 'Indikator ini diidentifikasi dan diungkapkan dalam dokumen laporan (disebutkan, dijelaskan, atau disajikan datanya).',
    label_en: '1: Disclosed in Report',
    desc_en: 'Indicator is identified and disclosed in the report (mentioned, discussed, or supported by data).'
  }
];

export const DEFAULT_QUANTITATIVE_RUBRIC: RubricItem[] = [
  {
    score: '0',
    label: '0: Tidak Ada Pengungkapan',
    desc: 'Jika tidak ditemukan pengungkapan kuantitatif atau tidak ada data dalam laporan, cukup ditulis 0.',
    label_en: '0: No Disclosure',
    desc_en: 'If no quantitative disclosure or data is found in the report, recorded simply as 0.'
  },
  {
    score: 'Riil',
    label: 'Riil: Nilai Nominal & Satuan Sesuai Laporan',
    desc: 'Disesuaikan dengan nilai kuantitas dan satuan yang ada pada hasil analisis laporan (misal: 1000000 liter, 25000 ton CO2e, 50000 kWh, Rp 50 Miliar).',
    label_en: 'Actual: Quantitative Value & Unit per Report',
    desc_en: 'Adjusted to the actual quantitative value and unit found in the report analysis result (e.g. 1000000 liters, 25000 ton CO2e, 50000 kWh).'
  }
];

export function normalizeQuantitativeScoreString(val: any): string {
  if (val === undefined || val === null) return '0';
  const s = String(val).trim();
  if (!s) return '0';
  const lower = s.toLowerCase();
  if (
    lower === '0' ||
    lower === '0 liter' ||
    lower === '0 liters' ||
    lower === '0 unit' ||
    lower === '0 ton' ||
    lower === '0 tco2e' ||
    lower === '0 kwh' ||
    lower === '-' ||
    lower === 'tidak ada' ||
    lower === 'none' ||
    lower === 'null' ||
    lower === 'n/a' ||
    /^0(\.0+)?\s*(liter|liters|unit|ton|kwh|gj|tj|mwh|rp|idr)?$/i.test(lower)
  ) {
    return '0';
  }
  return s;
}

export function isDisclosedQuantitativeValue(val: any): boolean {
  return normalizeQuantitativeScoreString(val) !== '0';
}

export function formatCleanDisclosureLevel(level?: string, isEn = false): string {
  if (!level) return isEn ? 'Low' : 'Rendah';
  const base = level.replace(/\s*\([^)]*\)\s*/g, '').trim();
  if (!isEn) return base || 'Rendah';
  const mapEn: Record<string, string> = {
    'Sangat Tinggi': 'Very High',
    'Tinggi': 'High',
    'Sedang': 'Moderate',
    'Rendah': 'Low',
    'Sangat Rendah': 'Very Low'
  };
  return mapEn[base] || base;
}

const ANALYZER_META_PREFIX = '<!--ANALYZER_META:';
const ANALYZER_META_SUFFIX = '-->';

export function encodeNotesWithAnalyzerMeta(
  userNotes: string,
  meta: {
    preset_id?: string;
    preset_name?: string;
    owner_username?: string;
    dynamic_scores?: Record<string, number | string>;
    total_score?: number;
  }
): string {
  const cleanNotes = (userNotes || '').replace(/<!--ANALYZER_META:[\s\S]*?-->/g, '').trim();
  const payload = JSON.stringify(meta);
  return cleanNotes ? `${cleanNotes}\n${ANALYZER_META_PREFIX}${payload}${ANALYZER_META_SUFFIX}` : `${ANALYZER_META_PREFIX}${payload}${ANALYZER_META_SUFFIX}`;
}

export function decodeRecordAnalyzerMeta(row: CEDResultRecord): CEDResultRecord {
  if (!row || typeof row !== 'object') return row;
  const rawNotes = typeof row.notes === 'string' ? row.notes : '';
  const startIdx = rawNotes.indexOf(ANALYZER_META_PREFIX);
  if (startIdx === -1) {
    if (row.dynamic_scores && typeof row.dynamic_scores === 'object') {
      const normalizedLocal: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(row.dynamic_scores)) {
        const val = typeof v === 'string' ? normalizeQuantitativeScoreString(v) : v;
        normalizedLocal[k.toLowerCase()] = val;
        normalizedLocal[k.toUpperCase()] = val;
      }
      return { ...row, dynamic_scores: normalizedLocal };
    }
    return row;
  }

  const endIdx = rawNotes.indexOf(ANALYZER_META_SUFFIX, startIdx);
  if (endIdx === -1) return row;

  const jsonStr = rawNotes.slice(startIdx + ANALYZER_META_PREFIX.length, endIdx).trim();
  const cleanNotes = (rawNotes.slice(0, startIdx) + rawNotes.slice(endIdx + ANALYZER_META_SUFFIX.length)).trim();

  try {
    const parsedMeta = JSON.parse(jsonStr);
    const dynamicScores: Record<string, number | string> = {
      ...(parsedMeta.dynamic_scores || {}),
      ...(row.dynamic_scores || {})
    };
    const normalizedDynamic: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(dynamicScores)) {
      const val = typeof v === 'string' ? normalizeQuantitativeScoreString(v) : v;
      normalizedDynamic[k.toLowerCase()] = val;
      normalizedDynamic[k.toUpperCase()] = val;
    }

    const ownerUsername = (parsedMeta.owner_username || row.owner_username || '').trim().toLowerCase() || undefined;

    return {
      ...row,
      notes: cleanNotes,
      preset_id: parsedMeta.preset_id || row.preset_id,
      preset_name: parsedMeta.preset_name || row.preset_name,
      owner_username: ownerUsername,
      total_score: parsedMeta.total_score ?? row.total_score,
      dynamic_scores: normalizedDynamic
    };
  } catch {
    return { ...row, notes: cleanNotes };
  }
}

export function resolveRecordPresetId(
  row: CEDResultRecord,
  allPresets?: IndicatorPreset[]
): string {
  const DEFAULT_ID = 'default_ced_18';
  if (!row || typeof row !== 'object') return DEFAULT_ID;

  let candidatePreset: IndicatorPreset | undefined;
  if (allPresets && allPresets.length > 0) {
    if (row.preset_id) {
      candidatePreset = allPresets.find(p => p.id === row.preset_id);
    }
    if (!candidatePreset && row.preset_name) {
      const targetName = row.preset_name.trim().toLowerCase();
      candidatePreset = allPresets.find(
        p =>
          p.name.trim().toLowerCase() === targetName ||
          (p.name_id && p.name_id.trim().toLowerCase() === targetName) ||
          (p.name_en && p.name_en.trim().toLowerCase() === targetName)
      );
    }
  }

  const rawPresetId = candidatePreset?.id || row.preset_id || DEFAULT_ID;
  if (rawPresetId === DEFAULT_ID) {
    return DEFAULT_ID;
  }

  // Untuk preset kustom, pastikan data ini benar-benar memiliki dynamic_scores hasil analisis preset tersebut,
  // bukan rekaman lama CED-18 yang tercampur di cache lokal.
  const dyn = row.dynamic_scores;
  if (!dyn || typeof dyn !== 'object' || Object.keys(dyn).length === 0) {
    return DEFAULT_ID;
  }

  if (candidatePreset && candidatePreset.indicators && candidatePreset.indicators.length > 0) {
    const defaultKeySet = new Set<string>(INDICATOR_KEYS.map(k => k.toLowerCase()));
    const allPresetCodes = candidatePreset.indicators.map(i => i.code.toLowerCase());
    const presetCodeSet = new Set<string>(allPresetCodes);
    const customUniqueCodes = allPresetCodes.filter(code => !defaultKeySet.has(code));
    const overlappingDefaultCodes = allPresetCodes.filter(code => defaultKeySet.has(code));
    const excludedDefaultCodes = INDICATOR_KEYS.map(k => k.toLowerCase()).filter(code => !presetCodeSet.has(code));

    // Jika preset kustom memiliki kode indikator unik di luar 18 kode CED (misal ENRG1, WATER1, WASTE1),
    // rekaman hasil analisis wajib memiliki minimal salah satu kode unik tersebut di dynamic_scores.
    if (customUniqueCodes.length > 0) {
      const hasCustomKey = customUniqueCodes.some(
        code => code in dyn || code.toUpperCase() in dyn
      );
      if (!hasCustomKey) {
        return DEFAULT_ID;
      }

      const allCustomUniqueZero = customUniqueCodes.every(code => {
        const v = dyn[code] ?? dyn[code.toUpperCase()];
        return !isDisclosedQuantitativeValue(v);
      });

      if (allCustomUniqueZero) {
        // 1. Jika baris memiliki nilai > 0 pada kolom standar CED-18 yang TIDAK ada di preset kustom ini (misal ghg2..acc2),
        // maka baris ini adalah hasil analisis Standar CED-18.
        const hasExcludedCedScore = excludedDefaultCodes.some(code => {
          const v = dyn[code] ?? dyn[code.toUpperCase()] ?? (row as any)[code] ?? (row as any)[code.toUpperCase()];
          return typeof v === 'number' ? v > 0 : isDisclosedQuantitativeValue(v);
        });
        if (hasExcludedCedScore) {
          return DEFAULT_ID;
        }

        // 2. Pada preset quantitative_count atau binary_count, jika kode yang beririsan (misal GHG1, CC1, CC2)
        // berisi angka bulat skala Likert 1-5 tanpa satuan sedangkan seluruh kode unik bernilai 0,
        // maka baris ini berasal dari analisis Standar CED-18.
        const rubricType = getPresetRubricType(candidatePreset);
        if ((rubricType === 'quantitative_count' || rubricType === 'binary_count') && overlappingDefaultCodes.length > 0) {
          const overlappingDisclosedVals = overlappingDefaultCodes
            .map(code => dyn[code] ?? dyn[code.toUpperCase()] ?? (row as any)[code] ?? (row as any)[code.toUpperCase()])
            .filter(v => isDisclosedQuantitativeValue(v));

          const allOverlappingAreBareLikert =
            overlappingDisclosedVals.length > 0 &&
            overlappingDisclosedVals.every(v => /^[1-5]$/.test(String(v).trim()));

          if (allOverlappingAreBareLikert) {
            return DEFAULT_ID;
          }
        }
      }
    }
  }

  return rawPresetId;
}

export function doesRecordMatchPreset(
  row: CEDResultRecord,
  preset: IndicatorPreset,
  allPresets?: IndicatorPreset[]
): boolean {
  if (!row || !preset) return false;
  const effectiveId = resolveRecordPresetId(row, allPresets);
  return effectiveId === preset.id;
}

export function getRecordScoreForPresetIndicator(
  row: CEDResultRecord,
  indicatorCode: string,
  preset: IndicatorPreset,
  allPresets?: IndicatorPreset[]
): string | number {
  const isQuantitativeMode =
    getPresetRubricType(preset) === 'quantitative_count' ||
    getPresetRubricType(preset) === 'binary_count';

  // Jika baris ini dianalisis menggunakan pilihan indikator lain, jangan tampilkan nilainya
  if (!doesRecordMatchPreset(row, preset, allPresets)) {
    return isQuantitativeMode ? '0' : 0;
  }

  const lower = indicatorCode.toLowerCase();
  const upper = indicatorCode.toUpperCase();
  const isCustomPreset = preset.id !== 'default_ced_18';

  const raw = isCustomPreset
    ? row.dynamic_scores?.[lower] ?? row.dynamic_scores?.[upper]
    : row.dynamic_scores?.[lower] ??
      row.dynamic_scores?.[upper] ??
      (row as any)[lower] ??
      (row as any)[upper];

  if (isQuantitativeMode) {
    return normalizeQuantitativeScoreString(raw);
  }

  if (raw !== undefined && raw !== null && raw !== '') {
    if (typeof raw === 'number' && !isNaN(raw)) return raw;
    if (typeof raw === 'string') {
      const cleaned = normalizeQuantitativeScoreString(raw);
      if (cleaned === '0') return 0;
      const parsedNum = Number(cleaned);
      if (!isNaN(parsedNum)) return parsedNum;
      return cleaned;
    }
  }
  return 0;
}

export function getPresetRubric(preset?: IndicatorPreset | null): RubricItem[] {
  if (!preset) return SCORING_RUBRIC;
  if (preset.rubric && preset.rubric.length > 0) return preset.rubric;
  if (preset.rubricType === 'binary_count' || preset.rubricType === 'quantitative_count') {
    return DEFAULT_QUANTITATIVE_RUBRIC;
  }
  return SCORING_RUBRIC;
}

export function getPresetRubricType(preset?: IndicatorPreset | null): RubricType {
  return preset?.rubricType || 'weighted';
}

export function getPresetMaxScore(preset?: IndicatorPreset | null): number {
  if (!preset) return 90;
  const indCount = preset.indicators?.length || 0;
  const rubricType = getPresetRubricType(preset);
  if (rubricType === 'binary_count' || rubricType === 'quantitative_count') {
    return indCount;
  }
  const rubric = getPresetRubric(preset);
  const maxTier = rubric.length > 0 ? Math.max(...rubric.map(r => Number(r.score) || 0)) : 5;
  return indCount * maxTier;
}

export function calculateTotalScore(scores: Partial<CEDScores>): number {
  return INDICATOR_KEYS.reduce((sum, key) => sum + (scores[key] || 0), 0);
}

export function calculateDisclosureLevel(totalScore: number): string {
  if (totalScore >= 72) return 'Sangat Tinggi (High Disclosure)';
  if (totalScore >= 54) return 'Tinggi (Substantial)';
  if (totalScore >= 36) return 'Sedang (Moderate)';
  if (totalScore >= 18) return 'Rendah (Low)';
  return 'Sangat Rendah (Minimal)';
}
