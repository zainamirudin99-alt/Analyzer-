// ============================================================
// Stata Command & Statistical Implementation Generator (Steps 1–9)
// Dynamic Stata .do, R, and Stan Code + 5-Dimension Point Interpretations
// ============================================================

import {
  IntelligentConfigurationReport
} from './panel-accuracy-intelligent-config';
import {
  AccuracyPreprocessingOptions,
  CleanedPanelObservation,
  MeasurementSource,
  PanelAccuracyFitResult,
  PanelAccuracyQualityReport,
  PreprocessingRecommendationBundle
} from './panel-accuracy-types';

export interface StepAnalysisPurpose {
  whatIsAnalyzed: string;
  whyRequired: string;
  statisticalQuestionAnswered: string;
}

export interface StataCommandUsageItem {
  command: string;
  functionSummary: string;
  reasonUsed: string;
  linkToStepGoal: string;
}

export interface StataOutputExplanationItem {
  outputName: string;
  statisticalDefinition: string;
  unit: string;
  researchFunction: string;
  keyValueToWatch: string;
  goodVsWarningCondition: string;
}

export interface FivePointInterpretationItem {
  title: string;
  nilai: string;
  artinya: string;
  caraMembaca: string;
  implikasi: string;
  batasan: string;
}

export interface StepConclusionBlock {
  decisionSummary: string;
  readinessStatus: 'LAYAK DILANJUTKAN' | 'LAYAK DENGAN CATATAN' | 'PERLU PERBAIKAN SEBELUM LANJUT';
  warnings: string[];
}

export interface LeaveOneCityOutSensitivityRow {
  droppedCity: string;
  nRemainingPairs: number;
  topSourceId: string;
  topSourceLabel: string;
  topSourceMae: number;
  secondSourceLabel: string;
  secondSourceMae: number;
  rankConsistentWithFull: boolean;
}

export interface RobustnessSensitivitySummary {
  leaveOneCityOutRows: LeaveOneCityOutSensitivityRow[];
  locoConsistencyPct: number;
  locoSummary: string;
  ccVsAvailableSummary: string;
  scaleTransformationSummary: string;
  outlierTrimmedSummary: string;
}

export interface StepStataDocumentationBundle {
  stepId: number;
  stepTitle: string;
  analysisPurpose: StepAnalysisPurpose;
  stataCode: string;
  companionRCode?: string;
  companionStanCode?: string;
  dependenciesNote: string;
  commandUsages: StataCommandUsageItem[];
  outputExplanations: StataOutputExplanationItem[];
  structuredInterpretations: FivePointInterpretationItem[];
  stepConclusion: StepConclusionBlock;
  robustnessSummary?: RobustnessSensitivitySummary;
}

function safeStataVar(name: string, idx: number): string {
  const cleaned = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^([0-9])/, 'v_$1')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return cleaned || `src_${idx + 1}`;
}

export function computeLeaveOneCityOutSensitivity(params: {
  observations: CleanedPanelObservation[];
  sources: MeasurementSource[];
  fullTopSourceId: string | null;
}): {
  rows: LeaveOneCityOutSensitivityRow[];
  consistencyPct: number;
  summary: string;
} {
  const { observations, sources, fullTopSourceId } = params;
  const refSource = sources.find(s => s.role === 'reference') || sources[0];
  const compSources = sources.filter(s => s.id !== refSource?.id);

  const completeObs = observations.filter(obs =>
    sources.every(s => obs.values[s.id] !== null && Number.isFinite(obs.values[s.id] as number))
  );

  const cities = Array.from(new Set(completeObs.map(o => o.city)));
  if (cities.length < 2 || compSources.length === 0) {
    return {
      rows: [],
      consistencyPct: 100,
      summary: 'Jumlah kota belum mencukupi untuk simulasi Leave-One-City-Out (LOCO).'
    };
  }

  const rows: LeaveOneCityOutSensitivityRow[] = cities.map(droppedCity => {
    const subObs = completeObs.filter(o => o.city !== droppedCity);
    const maes = compSources
      .map(cs => {
        const errs = subObs.map(o =>
          Math.abs((o.values[cs.id] as number) - (o.values[refSource.id] as number))
        );
        const mae =
          errs.length > 0 ? errs.reduce((s, v) => s + v, 0) / errs.length : Infinity;
        return {
          id: cs.id,
          label: `${cs.name} (${cs.label})`,
          mae
        };
      })
      .sort((a, b) => a.mae - b.mae);

    const top = maes[0];
    const second = maes[1] || maes[0];
    const consistent = fullTopSourceId ? top.id === fullTopSourceId : true;

    return {
      droppedCity,
      nRemainingPairs: subObs.length,
      topSourceId: top.id,
      topSourceLabel: top.label,
      topSourceMae: top.mae,
      secondSourceLabel: second.label,
      secondSourceMae: second.mae,
      rankConsistentWithFull: consistent
    };
  });

  const consistentCount = rows.filter(r => r.rankConsistentWithFull).length;
  const consistencyPct = rows.length > 0 ? (consistentCount / rows.length) * 100 : 100;

  return {
    rows,
    consistencyPct,
    summary:
      consistencyPct === 100
        ? `Peringkat #1 MAE stabil 100% (${consistentCount}/${rows.length} iterasi Leave-One-City-Out); tidak ada satu kota pun yang mendominasi kesimpulan peringkat.`
        : `Peringkat #1 MAE konsisten pada ${consistentCount}/${rows.length} iterasi (${consistencyPct.toFixed(1)}%) ketika satu per satu kota dikeluarkan dari sampel.`
  };
}

export function buildAllStepStataDocumentation(params: {
  datasetName: string;
  cityIdColumn: string;
  yearColumn: string;
  sources: MeasurementSource[];
  preprocessing: AccuracyPreprocessingOptions;
  qualityReport: PanelAccuracyQualityReport;
  intelligentConfig: IntelligentConfigurationReport;
  preprocBundle: PreprocessingRecommendationBundle | null;
  cleanedObservations: CleanedPanelObservation[];
  fitResult: PanelAccuracyFitResult | null;
}): Record<number, StepStataDocumentationBundle> {
  const {
    datasetName,
    cityIdColumn,
    yearColumn,
    sources,
    preprocessing,
    qualityReport,
    intelligentConfig,
    preprocBundle,
    cleanedObservations,
    fitResult
  } = params;

  const refSource = sources.find(s => s.role === 'reference') || sources[0];
  const compSources = sources.filter(s => s.id !== refSource?.id);
  const unitNote = fitResult?.datasetMeta.workingUnitNote || refSource?.unit || 'kt CO₂';

  const varMap = new Map<string, string>();
  sources.forEach((s, idx) => {
    varMap.set(s.id, safeStataVar(s.columnKey || s.name, idx));
  });
  const refStataVar = refSource ? varMap.get(refSource.id)! : 'x_ref';
  const allStataVars = sources.map(s => varMap.get(s.id)!).join(' ');
  const rawSourceCols = sources.map(s => s.columnKey).join(' ');

  const isExcel = /\.(xlsx|xls)$/i.test(datasetName);
  const importCmd = isExcel
    ? `import excel using "${datasetName}", firstrow clear`
    : `import delimited using "${datasetName || 'dataset_panel_co2.csv'}", varnames(1) clear`;

  // Compute LOCO sensitivity for Step 8
  const fullTopId = fitResult?.ranking.ranks[0]?.sourceId || null;
  const loco = computeLeaveOneCityOutSensitivity({
    observations: cleanedObservations,
    sources,
    fullTopSourceId: fullTopId
  });

  // ============================================================
  // STEP 1: DATA UPLOAD AND PANEL STRUCTURE
  // ============================================================
  const step1Code = [
    '* ============================================================================',
    '* STEP 1: DATA UPLOAD AND PANEL STRUCTURE VERIFICATION',
    `* Dataset        : ${datasetName}`,
    `* City ID Column : ${cityIdColumn}`,
    `* Year Column    : ${yearColumn}`,
    `* Mapped Sources : ${sources.map(s => `${s.name}:${s.columnKey}`).join(', ')}`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    '',
    '* 1. Baca dataset asli tanpa mengubah berkas sumber',
    `capture noisily ${importCmd}`,
    'if _rc != 0 {',
    '    display as error "Gagal membaca berkas dataset. Periksa nama/path berkas."',
    '    exit _rc',
    '}',
    'preserve',
    '',
    '* 2. Periksa struktur variabel, tipe penyimpanan, dan jumlah observasi',
    'describe',
    `codebook ${cityIdColumn} ${yearColumn} ${rawSourceCols}, compact`,
    'count',
    '',
    '* 3. Konversi aman identitas Kota dan Tahun ke struktur panel numerik',
    `capture confirm numeric variable ${cityIdColumn}`,
    'if _rc != 0 {',
    `    encode ${cityIdColumn}, gen(panel_city_id)`,
    '}',
    'else {',
    `    gen long panel_city_id = ${cityIdColumn}`,
    '}',
    `capture destring ${yearColumn}, gen(panel_year) force`,
    'assert !missing(panel_city_id) & !missing(panel_year)',
    '',
    '* 4. Periksa keunikan dan duplikasi pasangan City-Year',
    'duplicates report panel_city_id panel_year',
    'duplicates list panel_city_id panel_year',
    'capture noisily isid panel_city_id panel_year',
    '',
    '* 5. Deklarasikan struktur data panel dan periksa keseimbangan (Balanced/Unbalanced)',
    'if _rc == 0 {',
    '    xtset panel_city_id panel_year',
    '    xtdescribe',
    '}',
    'else {',
    '    display as error "Peringatan: Terdapat duplikat (City, Year). Bersihkan di Step 3 sebelum xtset."',
    '}',
    'restore'
  ].join('\n');

  const step1Bundle: StepStataDocumentationBundle = {
    stepId: 1,
    stepTitle: 'Step 1 — Data Upload & Panel Structure Verification',
    analysisPurpose: {
      whatIsAnalyzed: `Struktur dasar berkas dataset (${datasetName}), tipe data kolom identitas (${cityIdColumn}, ${yearColumn}), dimensi lintas-kota ($G$) dan periode waktu ($T$), serta keseimbangan struktur panel.`,
      whyRequired:
        'Evaluasi akurasi berbasis data panel mensyaratkan setiap pengamatan dapat diindeks secara unik pada sel Kota-Tahun $(i, t)$ sebelum menghitung selisih antarsumber.',
      statisticalQuestionAnswered:
        'Apakah dataset memenuhi struktur panel dua dimensi $(i, t)$ yang valid, bebas korupsi tipe data, dan memiliki pasangan lengkap yang memadai?'
    },
    stataCode: step1Code,
    dependenciesNote: 'Menggunakan perintah bawaan Stata 15/16/17/18 (`import excel`, `import delimited`, `describe`, `codebook`, `isid`, `duplicates`, `xtset`, `xtdescribe`) tanpa paket eksternal.',
    commandUsages: [
      {
        command: isExcel ? 'import excel ..., firstrow clear' : 'import delimited ..., varnames(1) clear',
        functionSummary: 'Membaca berkas dataset ke memori kerja Stata dengan baris pertama sebagai nama variabel.',
        reasonUsed: 'Memastikan seluruh kolom sumber pengukuran dan identitas terbaca sesuai header asli.',
        linkToStepGoal: 'Menyediakan data mentah untuk audit dimensi Kota-Tahun pada Step 1.'
      },
      {
        command: 'describe & codebook ..., compact',
        functionSummary: 'Menampilkan tipe penyimpanan (`str`, `double`, `long`), jumlah nilai unik, dan ringkasan rentang variabel.',
        reasonUsed: 'Mendeteksi sejak dini apabila kolom pengukuran masih bertipe teks (`string`) akibat simbol/karakter.',
        linkToStepGoal: 'Memvalidasi tipe variabel sebelum pemetaan sumber di Step 2.'
      },
      {
        command: 'duplicates report & isid panel_city_id panel_year',
        functionSummary: 'Memeriksa dan menguji secara formal apakah kombinasi Kota dan Tahun bersifat unik.',
        reasonUsed: 'Perintah `xtset` akan gagal (`r(451)`) bila terdapat lebih dari satu baris pada pasangan Kota-Tahun yang sama.',
        linkToStepGoal: 'Menjamin integritas indeks panel $(i, t)$.'
      },
      {
        command: 'xtset panel_city_id panel_year & xtdescribe',
        functionSummary: 'Mendeklarasikan struktur panel $(i, t)$ dan memetakan pola keikutsertaan tahun per kota.',
        reasonUsed: 'Mengidentifikasi apakah panel bersifat strongly balanced atau unbalanced.',
        linkToStepGoal: 'Menentukan ketersediaan pasangan Kota-Tahun lintas sumber.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Total Observations (_N)',
        statisticalDefinition: 'Jumlah seluruh baris pengamatan mentah yang terbaca di memori.',
        unit: 'Baris observasi',
        researchFunction: 'Menentukan ukuran populasi sampel awal sebelum penyaringan Complete-Case.',
        keyValueToWatch: `N = ${qualityReport.nObsRaw} baris`,
        goodVsWarningCondition: 'Baik jika N >= 20 dan mencakup minimal 2 kota × 2 tahun; waspada jika N sangat kecil (< 10).'
      },
      {
        outputName: 'Panel Dimensions (G Cities × T Years)',
        statisticalDefinition: 'Jumlah unit cross-section unik ($G$) dan jumlah titik waktu unik ($T$).',
        unit: 'Kota & Tahun',
        researchFunction: 'Menentukan derajat bebas klaster ($df = G - 1$) untuk inferensi standar error klaster di Step 6.',
        keyValueToWatch: `G = ${qualityReport.nCities} kota, T = ${qualityReport.nYears} tahun`,
        goodVsWarningCondition: 'Baik jika G >= 10 (ideal G >= 30); jika G < 30 wajib memakai Wild Cluster Bootstrap di Step 6.'
      },
      {
        outputName: 'Panel Balance Status (xtdescribe)',
        statisticalDefinition: 'Kesesuaian jumlah periode waktu $T_i$ antar seluruh entitas kota.',
        unit: 'Status Kategorikal',
        researchFunction: 'Mengungkap apakah seluruh kota diamati pada tahun yang seragam.',
        keyValueToWatch: qualityReport.isBalanced ? 'Strongly Balanced' : 'Unbalanced / Parsial',
        goodVsWarningCondition: 'Balanced memudahkan perbandingan lintas waktu; Unbalanced tetap sah namun memerlukan pemisahan Complete-Case vs Available-Case.'
      }
    ],
    structuredInterpretations: [
      {
        title: 'Ukuran Sampel & Pasangan Lengkap (Complete-Case)',
        nilai: `${qualityReport.nCompleteCasePairs} pasangan lengkap dari ${qualityReport.nObsRaw} baris mentah.`,
        artinya: `Terdapat ${qualityReport.nCompleteCasePairs} sel Kota-Tahun $(i, t)$ di mana seluruh ${sources.length} sumber pengukuran memiliki angka numerik valid secara bersamaan.`,
        caraMembaca: 'Bandingkan angka Complete-Case terhadap Total Baris; selisih keduanya menunjukkan jumlah baris yang memiliki data kosong (missing) pada minimal satu sumber.',
        implikasi: `Evaluasi akurasi berpasangan utama pada Step 5–8 akan menggunakan ${qualityReport.nCompleteCasePairs} observasi yang setara (head-to-head).`,
        batasan: 'Kecukupan jumlah baris belum menjamin kualitas kalibrasi instrumen maupun bebasnya data dari pencilan ekstrem.'
      },
      {
        title: 'Struktur Dimensi Panel (Kota × Tahun)',
        nilai: `G = ${qualityReport.nCities} Kota, T = ${qualityReport.nYears} Tahun (${qualityReport.yearMin ?? '-'}–${qualityReport.yearMax ?? '-'}).`,
        artinya: `Data melacak ${qualityReport.nCities} wilayah kota selama ${qualityReport.nYears} periode tahunan dengan status ${qualityReport.isBalanced ? 'Balanced Panel' : 'Unbalanced Panel'}.`,
        caraMembaca: 'G menunjukkan banyaknya klaster independen wilayah, sedangkan T menunjukkan panjang deret waktu per kota.',
        implikasi:
          qualityReport.nCities < 30
            ? `Karena G = ${qualityReport.nCities} < 30 klaster, inferensi pada Step 6 wajib mengandalkan Rademacher Wild Cluster Bootstrap.`
            : `Jumlah klaster G = ${qualityReport.nCities} >= 30 cukup kuat untuk inferensi Cluster-Robust SE asimtotik maupun Wild Bootstrap.`,
        batasan: 'Keseimbangan dimensi panel hanya memvalidasi indeks $(i, t)$, bukan keseragaman satuan fisik antarsumber.'
      },
      {
        title: 'Keunikan Kunci Panel (Duplicates Report)',
        nilai: `${qualityReport.duplicateKeys.length} duplikat pasangan (City, Year).`,
        artinya:
          qualityReport.duplicateKeys.length === 0
            ? 'Setiap kombinasi Kota dan Tahun bersifat unik (memenuhi syarat `isid` dan `xtset`).'
            : `Ditemukan ${qualityReport.duplicateKeys.length} kunci Kota-Tahun ganda yang melanggar syarat identifikasi panel.`,
        caraMembaca: 'Nilai 0 berarti lulus uji keunikan `isid`; nilai > 0 berarti ada pengamatan ganda pada kota dan tahun yang sama.',
        implikasi:
          qualityReport.duplicateKeys.length === 0
            ? 'Deklarasi `xtset` dapat langsung dijalankan tanpa risiko gagal.'
            : 'Pengguna wajib mengaktifkan penghapusan duplikat pada Step 3 sebelum melanjutkan ke estimasi inferensial.',
        batasan: 'Bebas duplikat administratif tidak membuktikan bahwa tidak ada kesalahan entri angka pada sel emisi.'
      }
    ],
    stepConclusion: {
      decisionSummary:
        qualityReport.nCompleteCasePairs >= 2
          ? `Dataset "${datasetName}" berhasil dimuat (${qualityReport.nObsRaw} baris, G = ${qualityReport.nCities} kota, T = ${qualityReport.nYears} tahun, N_CC = ${qualityReport.nCompleteCasePairs}) dan siap dikonfigurasi pada Step 2.`
          : 'Dataset belum memiliki cukup pasangan observasi lengkap (minimal 2 baris Complete-Case).',
      readinessStatus:
        qualityReport.nCompleteCasePairs < 2
          ? 'PERLU PERBAIKAN SEBELUM LANJUT'
          : qualityReport.duplicateKeys.length > 0 || !qualityReport.isBalanced
            ? 'LAYAK DENGAN CATATAN'
            : 'LAYAK DILANJUTKAN',
      warnings:
        qualityReport.duplicateKeys.length > 0
          ? [`Terdapat ${qualityReport.duplicateKeys.length} duplikat pasangan (City, Year) yang harus dibersihkan di Step 3.`]
          : []
    }
  };

  // ============================================================
  // STEP 2: INTELLIGENT DATA CONFIGURATION AND SOURCE RECOMMENDATION
  // ============================================================
  const step2Code = [
    '* ============================================================================',
    '* STEP 2: INTELLIGENT DATA CONFIGURATION & SOURCE RECOMMENDATION',
    `* Active City ID         : ${cityIdColumn}`,
    `* Active Year            : ${yearColumn}`,
    `* Active Reference (r)   : ${refSource?.name} (${refSource?.label}) -> Col: ${refSource?.columnKey}`,
    `* Active Comparison (j)  : ${compSources.map(c => `${c.name}:${c.columnKey}`).join(', ')}`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    '',
    '* 1. Identifikasi tipe variabel numerik vs string secara otomatis',
    'describe',
    'ds, has(type numeric)',
    'display "Daftar kolom numerik: `r(varlist)\'"',
    '',
    '* 2. Validasi identitas panel dan hitung jumlah nilai unik (G dan T)',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    'quietly tab city_id',
    'display "Jumlah Kota unik (G) = " r(r)',
    'quietly tab year_id',
    'display "Jumlah Tahun unik (T) = " r(r)',
    '',
    '* 3. Petakan variabel sumber pengukuran sesuai konfigurasi Step 2',
    ...sources.map((s, i) => {
      const sv = varMap.get(s.id)!;
      return `capture destring ${s.columnKey}, gen(${sv}) force\nlabel variable ${sv} "${s.name} - ${s.label} (${s.unit}) [${s.role.toUpperCase()}]"`;
    }),
    '',
    '* 4. Periksa missing values, variasi, kesamaan skala, dan korelasi awal',
    `misstable summarize ${allStataVars}`,
    `tabstat ${allStataVars}, stat(n mean sd min p50 max iqr cv) columns(statistics)`,
    `summarize ${allStataVars}, detail`,
    `pwcorr ${allStataVars}, sig obs`,
    '',
    '* 5. Hitung pasangan observasi lengkap (Complete-Case) dan simpan macro konfigurasi',
    `egen byte n_valid_sources = rownonmiss(${allStataVars})`,
    `gen byte complete_case = (n_valid_sources == ${sources.length})`,
    'count if complete_case == 1',
    'assert r(N) >= 2',
    `global PANEL_REF_VAR "${refStataVar}"`,
    `global PANEL_COMP_VARS "${compSources.map(c => varMap.get(c.id)!).join(' ')}"`,
    'restore'
  ].join('\n');

  const step2Bundle: StepStataDocumentationBundle = {
    stepId: 2,
    stepTitle: 'Step 2 — Intelligent Data Configuration & Source Recommendation',
    analysisPurpose: {
      whatIsAnalyzed: `Karakteristik 14 dimensi dari seluruh ${intelligentConfig.columnsAnalyzed} kolom dataset untuk menentukan pemetaan terbaik variabel identitas (${cityIdColumn}, ${yearColumn}), sumber pengukuran aktif ($J = ${sources.length}$), dan sumber referensi ($r = \\text{${refSource?.name}}$).`,
      whyRequired:
        'Kesalahan memilih kolom identitas, mengikutsertakan kolom konstan/non-numerik, atau memilih referensi dengan cakupan buruk akan mendistorsi seluruh perhitungan error hilir.',
      statisticalQuestionAnswered:
        'Kolom mana yang secara statistik layak menjadi City ID, Year, Reference Source, dan Comparison Sources berdasarkan kelengkapan, varians, konsistensi skala, dan struktur model?'
    },
    stataCode: step2Code,
    dependenciesNote: 'Menggunakan perintah bawaan Stata (`ds`, `describe`, `misstable summarize`, `tabstat`, `summarize, detail`, `pwcorr`, `egen`, `assert`).',
    commandUsages: [
      {
        command: 'ds, has(type numeric)',
        functionSummary: 'Menyaring dan mendaftarkan seluruh kolom yang memiliki tipe data numerik.',
        reasonUsed: 'Memisahkan kandidat sumber pengukuran kuantitatif dari kolom teks/label.',
        linkToStepGoal: 'Mendukung Automatic Column & Measurement Variable Detection.'
      },
      {
        command: 'tabstat ..., stat(n mean sd min p50 max iqr cv)',
        functionSummary: 'Menghitung ukuran pemusatan, penyebaran, median, IQR, dan koefisien variasi (CV) secara berdampingan.',
        reasonUsed: 'Memeriksa apakah ada sumber dengan varians nol (`sd == 0`) atau perbedaan skala satuan yang mencolok (> 10×).',
        linkToStepGoal: 'Mendukung Variance, Range, dan Measurement Unit Scale Analysis.'
      },
      {
        command: 'pwcorr ..., sig obs',
        functionSummary: 'Menghitung matriks korelasi Pearson berpasangan beserta p-value dan jumlah sampel berpasangan.',
        reasonUsed: 'Memeriksa arah hubungan awal dan mendeteksi kemungkinan ketergantungan galat antarsumber (`r > 0.96`).',
        linkToStepGoal: 'Mendukung Correlation & Potential Measurement Dependency Analysis.'
      },
      {
        command: 'egen byte n_valid_sources = rownonmiss(...) & assert r(N) >= 2',
        functionSummary: 'Menghitung ketersediaan observasi berpasangan lengkap dan memastikan syarat minimum sampel terpenuhi.',
        reasonUsed: 'Memblokir eksekusi apabila jumlah pasangan lengkap kurang dari syarat minimum.',
        linkToStepGoal: 'Menegakkan validasi syarat minimum sebelum lanjut ke Step 3.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Tabel Ringkasan tabstat (Mean, SD, Median, IQR, CV)',
        statisticalDefinition: 'Perbandingan profil skala dan dispersi relatif seluruh kandidat sumber pengukuran.',
        unit: unitNote,
        researchFunction: 'Memverifikasi apakah seluruh sumber berada pada satuan fisik yang sebanding dan memiliki variasi positif.',
        keyValueToWatch: `Rasio skala median maks/min = ${intelligentConfig.blockCUnits.scaleRatioMaxToMin.toFixed(2)}×`,
        goodVsWarningCondition: 'Baik jika SD > 0 dan rasio median antarsumber <= 10×; waspada jika rasio > 10× (indikasi beda satuan).'
      },
      {
        outputName: 'Matriks Korelasi Awal (pwcorr)',
        statisticalDefinition: 'Koefisien korelasi linear Pearson $r \\in [-1, 1]$ antarkandidat sumber.',
        unit: 'Tanpa satuan (rasio [-1, 1])',
        researchFunction: 'Mendeteksi anomali tanda korelasi negatif atau kemiripan metodologi ekstrem antarsumber.',
        keyValueToWatch: 'Korelasi positif signifikan antar sumber CO₂',
        goodVsWarningCondition: 'Waspada jika r < 0 (terbalik) atau r > 0.96 antar dua satelit (indikasi galat berkorelasi); ingat korelasi tertinggi bukan bukti sumber paling akurat.'
      }
    ],
    structuredInterpretations: [
      {
        title: 'Rekomendasi Sumber Referensi (Multi-Kriteria)',
        nilai: `Aktif: ${refSource?.name} (${refSource?.label} — Kolom "${refSource?.columnKey}") | Rekomendasi Sistem: "${intelligentConfig.blockBSources.recommendedReferenceCol}".`,
        artinya: `Sumber ${refSource?.name} ditetapkan sebagai titik acuan nol ($r$) untuk mengukur kesalahan relatif ${compSources.length} sumber pembanding lainnya.`,
        caraMembaca: 'Periksa apakah kolom referensi aktif sesuai dengan rekomendasi multi-kriteria sistem (cakupan pasangan lengkap, varians positif, ketahanan outlier, dan instrumen kalibrasi).',
        implikasi: `Seluruh nilai $\\text{Error}_{ijt} = X_{ijt} - X_{irt}$ pada Step 5–9 dihitung relatif terhadap ${refSource?.name}.`,
        batasan: 'Pemilihan sumber referensi tidak didasarkan pada korelasi tertinggi semata dan tidak menjadikan referensi tersebut kebenaran mutlak bebas galat.'
      },
      {
        title: 'Kesesuaian Skala & Satuan Pengukuran',
        nilai: `Rasio median terbesar/terkecil = ${intelligentConfig.blockCUnits.scaleRatioMaxToMin.toFixed(2)}× (Satuan kerja: ${unitNote}).`,
        artinya:
          intelligentConfig.blockCUnits.scaleRatioMaxToMin <= 10
            ? 'Seluruh sumber pengukuran berada pada orde magnitudo skala yang sepadan.'
            : 'Terdapat perbedaan skala lebih dari satu orde magnitudo (> 10×) di antara sumber pengukuran.',
        caraMembaca: 'Rasio mendekati 1.0 menunjukkan kesetaraan skala satuan; rasio > 10× menandakan potensi perbedaan unit (mis. ton vs kiloton).',
        implikasi:
          intelligentConfig.blockCUnits.scaleRatioMaxToMin <= 10
            ? 'Perbandingan langsung tanpa konversi satuan aman dilakukan.'
            : 'Wajib memeriksa satuan asli sebelum menghitung MAE/RMSE agar selisih tidak didominasi perbedaan unit.',
        batasan: 'Sistem tidak melakukan konversi satuan otomatis secara buta apabila satuan fisik asli belum dikonfirmasi peneliti.'
      },
      {
        title: 'Kompatibilitas Struktur Model (Reference-Based & Latent)',
        nilai: `J = ${sources.length} sumber aktif (${compSources.length} pembanding + 1 referensi), N_CC = ${intelligentConfig.blockDModelStructure.completeCasePairs} pasangan.`,
        artinya: intelligentConfig.blockDModelStructure.latentIdentificationNote,
        caraMembaca: 'Minimal J >= 2 diperlukan untuk Reference-Based Pair FE; minimal J >= 3 diperlukan untuk identifikasi penuh model pengukuran laten tanpa batasan varians.',
        implikasi: 'Struktur variabel saat ini memenuhi syarat identifikasi untuk estimasi utama dan diagnostik.',
        batasan:
          intelligentConfig.blockDModelStructure.errorDependencyWarnings[0] ||
          'Asumsi independensi galat antar instrumen tetap harus diuji secara diagnostik pada Step 7.'
      }
    ],
    stepConclusion: {
      decisionSummary: intelligentConfig.minimumRequirements.canProceed
        ? `Konfigurasi variabel valid: City ID = "${cityIdColumn}", Year = "${yearColumn}", Reference = "${refSource?.columnKey}", dan ${compSources.length} Comparison Sources siap diaudit pada Step 3.`
        : `Konfigurasi belum memenuhi syarat minimum: ${intelligentConfig.minimumRequirements.blockingReasons.join(' ')}`,
      readinessStatus: !intelligentConfig.minimumRequirements.canProceed
        ? 'PERLU PERBAIKAN SEBELUM LANJUT'
        : intelligentConfig.minimumRequirements.warnings.length > 0
          ? 'LAYAK DENGAN CATATAN'
          : 'LAYAK DILANJUTKAN',
      warnings: [
        ...intelligentConfig.minimumRequirements.blockingReasons,
        ...intelligentConfig.minimumRequirements.warnings
      ]
    }
  };

  // ============================================================
  // STEP 3: DATA QUALITY AUDIT AND PREPROCESSING
  // ============================================================
  const pLo = ((preprocessing.winsorQuantile || 0.025) * 100).toFixed(1);
  const pHi = (100 - (preprocessing.winsorQuantile || 0.025) * 100).toFixed(1);

  const step3Code = [
    '* ============================================================================',
    '* STEP 3: DATA QUALITY AUDIT & OPT-IN PREPROCESSING',
    `* Drop Duplicate (City,Year) : ${preprocessing.dropDuplicateCityYear ? 'YA (Aktif)' : 'TIDAK (Data Asli)'}`,
    `* Winsorization (${pLo}%/${pHi}%) : ${preprocessing.applyWinsorize ? 'YA (Aktif)' : 'TIDAK (Data Asli)'}`,
    `* Transformasi ln(1 + X)     : ${preprocessing.applyLog1p ? 'YA (Aktif)' : 'TIDAK (Satuan Fisik Asli)'}`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    '',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    '',
    '* 1. Audit Missing Values, Pola Ketidaklengkapan, dan Duplikat',
    `misstable summarize ${allStataVars}`,
    `misstable patterns ${allStataVars}`,
    'duplicates report city_id year_id',
    '',
    '* 2. Audit Nilai Negatif, Nilai Nol, Distribusi, dan Outlier 1.5*IQR',
    `foreach v of varlist ${allStataVars} {`,
    '    quietly summarize `v\', detail',
    '    local iqr = r(p75) - r(p25)',
    '    local lo  = r(p25) - 1.5 * `iqr\'',
    '    local hi  = r(p75) + 1.5 * `iqr\'',
    '    quietly count if `v\' < 0 & !missing(`v\')',
    '    local n_neg = r(N)',
    '    quietly count if `v\' == 0 & !missing(`v\')',
    '    local n_zero = r(N)',
    '    quietly count if (`v\' < `lo\' | `v\' > `hi\') & !missing(`v\')',
    '    display "Variabel `v\': Negatif=" `n_neg\' " | Nol=" `n_zero\' " | Outlier(1.5*IQR)=" r(N)',
    '}',
    '',
    '* 3. Bandingkan Ukuran Sampel Complete-Case vs Available-Case per Sumber',
    `egen byte n_nonmiss = rownonmiss(${allStataVars})`,
    `gen byte complete_case = (n_nonmiss == ${sources.length})`,
    'count if complete_case == 1',
    `foreach v of varlist ${compSources.map(c => varMap.get(c.id)!).join(' ')} {`,
    `    quietly count if !missing(\`v') & !missing(${refStataVar})`,
    '    display "Available-Case (`v\' vs Reference) N = " r(N)',
    '}',
    '',
    '* 4. Terapkan Prapemrosesan Eksplisit (Tanpa Merusak Data Sumber Asli)',
    ...(preprocessing.dropDuplicateCityYear
      ? ['bysort city_id year_id: keep if _n == 1']
      : ['* Opsi hapus duplikat tidak diaktifkan']),
    ...(preprocessing.applyLog1p
      ? [
          `foreach v of varlist ${allStataVars} {`,
          '    replace `v\' = ln(1 + `v\') if `v\' >= 0 & !missing(`v\')',
          '}'
        ]
      : ['* Transformasi ln(1+X) tidak diaktifkan (mempertahankan satuan fisik asli)']),
    ...(preprocessing.applyWinsorize
      ? [
          '* Catatan: Dapat menggunakan package `winsor2` (ssc install winsor2) atau _pctile bawaan:',
          `foreach v of varlist ${allStataVars} {`,
          `    _pctile \`v', p(${pLo} ${pHi})`,
          '    replace `v\' = r(r1) if `v\' < r(r1) & !missing(`v\')',
          '    replace `v\' = r(r2) if `v\' > r(r2) & !missing(`v\')',
          '}'
        ]
      : ['* Winsorization tidak diaktifkan (mempertahankan observasi ekstrem asli)']),
    '',
    'xtset city_id year_id',
    'restore'
  ].join('\n');

  const recCandidate = preprocBundle?.bestScenario || null;

  const step3Bundle: StepStataDocumentationBundle = {
    stepId: 3,
    stepTitle: 'Step 3 — Data Quality Audit, Reference Validity & Preprocessing',
    analysisPurpose: {
      whatIsAnalyzed:
        'Sepuluh indikator kualitas data panel (missing values, perbedaan Complete-Case vs Available-Case, duplikat, non-numerik, negatif/nol, satuan, rasio skala, cakupan, keseimbangan panel, outlier 1.5×IQR, dan kelayakan sumber referensi) beserta dampak prapemrosesan.',
      whyRequired:
        'Outlier ekstrem atau skala yang timpang dapat membuat RMSE menggelembung dan membalik urutan peringkat sumber pembanding.',
      statisticalQuestionAnswered:
        'Apakah sumber referensi kredibel sebagai benchmark dan skenario prapemrosesan mana yang paling menjaga stabilitas inferensi tanpa mendistorsi makna fisik emisi?'
    },
    stataCode: step3Code,
    dependenciesNote: 'Menggunakan perintah bawaan Stata (`misstable`, `duplicates`, `summarize, detail`, `_pctile`). Opsional: `ssc install winsor2` jika ingin menjalankan sintaks singkat `winsor2 varlist, cuts(2.5 97.5) replace`.',
    commandUsages: [
      {
        command: 'misstable summarize & misstable patterns',
        functionSummary: 'Memetakan jumlah sel kosong per sumber dan pola kombinasi kehilangan data lintas sumber.',
        reasonUsed: 'Memastikan transparansi antara sampel Complete-Case dan Available-Case.',
        linkToStepGoal: 'Menjawab audit kelengkapan pasangan Kota-Tahun.'
      },
      {
        command: 'summarize `v\', detail (1.5*IQR fence)',
        functionSummary: 'Menghitung kuartil $Q_1, Q_3$, rentang antarkuartil $\\text{IQR}$, serta mendeteksi nilai di luar $[Q_1 - 1.5\\text{IQR}, Q_3 + 1.5\\text{IQR}]$.',
        reasonUsed: 'Mengukur beban pencilan yang berpotensi mendistorsi RMSE dan rata-rata galat.',
        linkToStepGoal: 'Menentukan apakah Winsorization atau analisis sensitivitas Trimmed MAE diperlukan.'
      },
      {
        command: '_pctile `v\', p(2.5 97.5) / winsor2',
        functionSummary: 'Memangkas ekor ekstrem bawah/atas ke persentil 2.5% dan 97.5% tanpa membuang baris pengamatan.',
        reasonUsed: 'Menekan pengaruh kesalahan entri ekstrem sembari menjaga ukuran sampel $N$ tetap utuh.',
        linkToStepGoal: 'Menyediakan uji ketahanan (robustness) terhadap pencilan.'
      },
      {
        command: 'replace `v\' = ln(1 + `v\')',
        functionSummary: 'Mentransformasi nilai emisi ke skala logaritmik natural $\\ln(1 + X)$ untuk nilai non-negatif.',
        reasonUsed: 'Mengurangi kecondongan kanan (*right-skewness*) dan menstabilkan varians lintas kota besar vs kecil.',
        linkToStepGoal: 'Menguji apakah peringkat akurasi berubah antara skala fisik asli dan skala proporsional/logaritmik.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Audit Kelayakan Sumber Referensi (Reference Audit)',
        statisticalDefinition: 'Evaluasi cakupan sampel (%), keberagaman nilai (varians > 0), dan beban pencilan pada sumber referensi $r$.',
        unit: 'Persentase (%) & Hitungan',
        researchFunction: 'Menjamin bahwa patokan pembanding tidak rusak atau konstan.',
        keyValueToWatch: `Cakupan = ${qualityReport.referenceAudit.coveragePct.toFixed(1)}%, Outlier = ${qualityReport.referenceAudit.outlierCount}`,
        goodVsWarningCondition: 'Baik jika cakupan >= 70% dan varians > 0; jika gagal, status akhir di Step 8 menjadi REFERENSI_TIDAK_VALID.'
      },
      {
        outputName: 'Perbandingan Complete-Case vs Available-Case',
        statisticalDefinition: 'Jumlah observasi saat seluruh sumber lengkap ($N_{\\text{CC}}$) dibandingkan saat hanya pasangan $(X_j, X_r)$ yang tersedia ($N_{\\text{Avail}, j}$).',
        unit: 'Observasi Kota-Tahun',
        researchFunction: 'Mencegah bias seleksi sampel ketika salah satu sumber memiliki banyak missing value.',
        keyValueToWatch: `N(CC) = ${qualityReport.nCompleteCasePairs}`,
        goodVsWarningCondition: 'Baik jika N(CC) = N(Avail); waspada jika terdapat selisih besar antar sumber.'
      }
    ],
    structuredInterpretations: [
      {
        title: 'Validitas & Kredibilitas Sumber Referensi',
        nilai: `${qualityReport.referenceAudit.referenceSourceName} (${qualityReport.referenceAudit.referenceSourceLabel}): Cakupan ${qualityReport.referenceAudit.coveragePct.toFixed(1)}% (${qualityReport.referenceAudit.nValid}/${qualityReport.nObsRaw} baris), Outlier = ${qualityReport.referenceAudit.outlierCount}.`,
        artinya: qualityReport.referenceAudit.isCredibleReference
          ? 'Sumber referensi memenuhi syarat kelayakan statistik sebagai benchmark pembanding.'
          : 'Sumber referensi mengalami masalah kelayakan serius (cakupan rendah, varians nol, atau beban outlier tinggi).',
        caraMembaca: 'Cakupan >= 70% dan varians positif menandakan referensi layak dijadikan pengurang pada rumus $\\text{Error}_{ijt} = X_{ijt} - X_{irt}$.',
        implikasi: qualityReport.referenceAudit.isCredibleReference
          ? 'Perhitungan metrik akurasi pada Step 5 dapat dipercaya secara metodologis.'
          : 'Pengguna disarankan mengganti sumber referensi di Step 2 agar kesimpulan tidak berstatus REFERENSI_TIDAK_VALID.',
        batasan: 'Lulus audit statistik pada sumber referensi tetap tidak mengubah sifatnya dari benchmark empiris menjadi kebenaran absolut.'
      },
      {
        title: 'Beban Outlier & Dampak Prapemrosesan',
        nilai: `Total Outlier (1.5×IQR) = ${qualityReport.outlierCountTotal} titik | Skenario Direkomendasikan: ${recCandidate?.label || 'Baseline Satuan Fisik Asli'}.`,
        artinya: `Di seluruh sumber terdeteksi ${qualityReport.outlierCountTotal} pengamatan yang melampaui pagar kuartil $1.5\\times\\text{IQR}$.`,
        caraMembaca: 'Semakin banyak outlier, semakin besar selisih antara RMSE (kuadratik) dan MAE (linier absolut).',
        implikasi:
          'Mempertahankan satuan fisik asli menjaga kemudahan interpretasi (dalam ' +
          unitNote +
          '), sedangkan Winsorization/log(1+x) berguna menguji ketahanan peringkat terhadap nilai ekstrem.',
        batasan: 'Transformasi logaritmik mengubah arti MAE dari selisih fisik absolut menjadi selisih proporsional log-poin.'
      }
    ],
    stepConclusion: {
      decisionSummary: !qualityReport.hasBlockingError
        ? `Audit kualitas Step 3 selesai без error pemblokir (${qualityReport.checks.filter(c => c.severity === 'ok').length} OK, ${qualityReport.checks.filter(c => c.severity === 'warning').length} Warning). Analisis siap dilanjutkan ke Step 4.`
        : `Terdapat error kritis pada Step 3 (${qualityReport.checks.filter(c => c.severity === 'error').map(c => c.title).join(', ')}) yang wajib diperbaiki terlebih dahulu.`,
      readinessStatus: qualityReport.hasBlockingError
        ? 'PERLU PERBAIKAN SEBELUM LANJUT'
        : qualityReport.checks.some(c => c.severity === 'warning')
          ? 'LAYAK DENGAN CATATAN'
          : 'LAYAK DILANJUTKAN',
      warnings: qualityReport.checks
        .filter(c => c.severity !== 'ok')
        .map(c => `${c.title}: ${c.message}`)
    }
  };

  // ============================================================
  // STEP 4: EXPLORATORY DATA ANALYSIS (EDA)
  // ============================================================
  const step4Code = [
    '* ============================================================================',
    '* STEP 4: EXPLORATORY DATA ANALYSIS & PANEL CORRELATIONS',
    `* Reference Source : ${refSource?.name} (${refStataVar})`,
    `* All Sources      : ${allStataVars}`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    '',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    'xtset city_id year_id',
    `egen byte complete_case = rownonmiss(${allStataVars})`,
    `replace complete_case = (complete_case == ${sources.length})`,
    '',
    '* 1. Statistik Deskriptif Lengkap (Mean, SD, Median, Q1, Q3, IQR, CV, Skewness)',
    `summarize ${allStataVars} if complete_case, detail`,
    `tabstat ${allStataVars} if complete_case, stat(n mean sd p25 p50 p75 iqr min max cv skewness) columns(statistics)`,
    '',
    '* 2. Korelasi Overall Pearson & Spearman Rank',
    `pwcorr ${allStataVars} if complete_case, sig obs`,
    `spearman ${allStataVars} if complete_case, stats(rho p)`,
    '',
    '* 3. Korelasi Within-City (Demeaned) & First-Difference (Delta Tahunan)',
    `foreach v of varlist ${allStataVars} {`,
    '    bysort city_id: egen mean_`v\' = mean(`v\') if complete_case',
    '    gen within_`v\' = `v\' - mean_`v\' if complete_case',
    '    bysort city_id (year_id): gen fd_`v\' = `v\' - `v\'[_n-1] if complete_case',
    '}',
    `pwcorr ${sources.map(s => `within_${varMap.get(s.id)!}`).join(' ')} if complete_case, sig`,
    `pwcorr ${sources.map(s => `fd_${varMap.get(s.id)!}`).join(' ')} if complete_case, sig`,
    '',
    '* 4. Visualisasi Tren Tahunan & Scatter Plot 45-Derajat terhadap Referensi',
    ...compSources.map((cs, i) => {
      const cv = varMap.get(cs.id)!;
      return `twoway (scatter ${cv} ${refStataVar} if complete_case) (function y = x, range(${refStataVar})), title("${cs.name} vs Reference ${refSource?.name}") name(scat_${i + 1}, replace)`;
    }),
    'restore'
  ].join('\n');

  const edaInterpItems: FivePointInterpretationItem[] = [];
  if (fitResult) {
    fitResult.metrics.forEach(m => {
      edaInterpItems.push({
        title: `Korelasi Panel ${m.sourceName} (${m.sourceLabel}) vs Referensi ${fitResult.referenceSource.name}`,
        nilai: `Pearson r = ${m.pearsonR.toFixed(4)} | Spearman ρ = ${m.spearmanRho.toFixed(4)} | Within-City r = ${m.withinCityR.toFixed(4)} | First-Diff r = ${m.firstDiffR.toFixed(4)}.`,
        artinya:
          Math.abs(m.pearsonR) >= 0.8
            ? `Hubungan linear dan monotonik antara ${m.sourceName} dan referensi tergolong sangat kuat, baik secara lintas-kota maupun dinamika tahunan.`
            : `Hubungan antara ${m.sourceName} dan referensi bersifat moderat/lemah dengan deviasi pola yang cukup terlihat.`,
        caraMembaca:
          'Overall r mengukur keterkaitan total; Within-City r mengukur keselarasan naik-turun di dalam kota yang sama setelah efek ukuran kota dikeluarkan; First-Diff r mengukur kesamaan perubahan tahun ke tahun ($\\Delta X_t$).',
        implikasi:
          m.withinCityR >= 0.7
            ? `${m.sourceName} mampu melacak dinamika temporal emisi di dalam kota secara konsisten terhadap referensi.`
            : `${m.sourceName} kurang sensitif menangkap fluktuasi tahunan di dalam kota yang sama meskipun korelasi lintas-kotanya mungkin tinggi.`,
        batasan:
          'Korelasi tinggi ($r \\to 1$) hanya membuktikan kesamaan arah linear, BUKAN bukti bahwa sumber tersebut bebas bias sistematis (additive/multiplicative shift) atau paling akurat.'
      });
    });
  }

  const step4Bundle: StepStataDocumentationBundle = {
    stepId: 4,
    stepTitle: 'Step 4 — Exploratory Data Analysis & Panel Correlations',
    analysisPurpose: {
      whatIsAnalyzed:
        'Profil distribusi deskriptif setiap sumber pengukuran serta 4 struktur korelasi panel (Overall Pearson, Overall Spearman, Within-City Demeaned, dan First-Difference).',
      whyRequired:
        'Pada data panel, korelasi gabungan (overall) sering kali semu karena didominasi perbedaan ukuran kota besar vs kota kecil (*between-city effect*). Dekomposisi Within-City dan First-Difference wajib dilakukan.',
      statisticalQuestionAnswered:
        'Seberapa konsisten pergerakan masing-masing sumber pengukuran baik lintas wilayah maupun antarwaktu di dalam kota yang sama?'
    },
    stataCode: step4Code,
    dependenciesNote: 'Menggunakan perintah bawaan Stata (`summarize, detail`, `tabstat`, `pwcorr`, `spearman`, `bysort`, `egen`, `twoway`).',
    commandUsages: [
      {
        command: 'tabstat ..., stat(n mean sd p25 p50 p75 iqr min max cv skewness)',
        functionSummary: 'Menyajikan tabel ringkas ukuran pemusatan, kuartil, penyebaran, dan kemencengan distribusi setiap sumber.',
        reasonUsed: 'Membandingkan rata-rata dan median antarsumber sebelum menghitung error berpasangan.',
        linkToStepGoal: 'Mengidentifikasi pergeseran lokasi (mean shift) dan kemencengan distribusi.'
      },
      {
        command: 'pwcorr & spearman',
        functionSummary: 'Menghitung korelasi parametrik linear (Pearson $r$) dan non-parametrik berbasis peringkat (Spearman $\\rho$).',
        reasonUsed: 'Membandingkan sensitivitas asosiasi terhadap pencilan ekstrem.',
        linkToStepGoal: 'Mengevaluasi konsistensi urutan besaran emisi antarsumber.'
      },
      {
        command: 'bysort city_id: egen mean_v = mean(v) & gen within_v = v - mean_v',
        functionSummary: 'Menghilangkan rata-rata spesifik kota (*within transformation*) sebelum menghitung korelasi.',
        reasonUsed: 'Menguji apakah dua sumber bergerak searah dari tahun ke tahun di dalam kota yang sama.',
        linkToStepGoal: 'Memisahkan konsistensi temporal dari sekadar perbedaan skala antar-kota.'
      },
      {
        command: 'twoway (scatter ...) (function y = x)',
        functionSummary: 'Memplot nilai sumber pembanding terhadap sumber referensi beserta garis identitas $45^\\circ$ ($Y = X$).',
        reasonUsed: 'Visualisasi langsung penyimpangan di atas/bawah garis kesepakatan sempurna.',
        linkToStepGoal: 'Memperlihatkan perbedaan antara korelasi linear dan kesepakatan aktual ($Y = X$).'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Overall Pearson (r) vs Spearman (ρ)',
        statisticalDefinition: 'Ukuran kekuatan asosiasi linear dan peringkat monotonik gabungan lintas kota dan tahun.',
        unit: 'Tanpa satuan ([-1, 1])',
        researchFunction: 'Mengukur keterkaitan kasar antarsumber pengukuran.',
        keyValueToWatch: 'Perbedaan antara Pearson r dan Spearman ρ',
        goodVsWarningCondition: 'Baik jika keduanya tinggi (> 0.80); namun r = 1.0 sekalipun tetap bisa memiliki bias sistematis besar jika titik-titik berada sejajar di luar garis 45°.'
      },
      {
        outputName: 'Within-City & First-Difference Correlation',
        statisticalDefinition: 'Korelasi setelah efek tetap rata-rata kota dihilangkan ($X_{it} - \\bar{X}_i$) dan korelasi perubahan tahunan ($\\Delta X_{it}$).',
        unit: 'Tanpa satuan ([-1, 1])',
        researchFunction: 'Menguji kemampuan instrumen melacak perubahan waktu di kota yang sama.',
        keyValueToWatch: 'Within-City r dan First-Diff r',
        goodVsWarningCondition: 'Baik jika tetap positif kuat (> 0.60); waspada jika Overall r tinggi tetapi Within-City r mendekati nol.'
      }
    ],
    structuredInterpretations: edaInterpItems,
    stepConclusion: {
      decisionSummary:
        'Eksplorasi distribusi dan keempat matriks korelasi panel telah dihitung. Karena korelasi hanya mengukur asosiasi arah (bukan akurasi terhadap garis $45^\\circ$), evaluasi dilanjutkan ke perhitungan MAE, RMSE, MBE, Lin\'s CCC, dan Bland-Altman pada Step 5.',
      readinessStatus: 'LAYAK DILANJUTKAN',
      warnings: [
        'Ingat prinsip metodologis: korelasi Pearson/Spearman yang tinggi tidak boleh dijadikan bukti akurasi pengukuran.'
      ]
    }
  };

  // ============================================================
  // STEP 5: MEASUREMENT ERROR, ACCURACY ASSESSMENT & COMPANION LATENT MODEL
  // ============================================================
  const step5Code = [
    '* ============================================================================',
    '* STEP 5: MEASUREMENT ERROR, ACCURACY ASSESSMENT (MAE, RMSE, MBE, CCC, BLAND-ALTMAN)',
    '*         + COMPANION LATENT MEASUREMENT MODEL SPECIFICATION',
    `* Reference Source (r) : ${refSource?.name} (${refStataVar})`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    '',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    'xtset city_id year_id',
    `egen byte complete_case = rownonmiss(${allStataVars})`,
    `replace complete_case = (complete_case == ${sources.length})`,
    '',
    '* 1. Hitung Error Berpasangan, Absolute Error (AE), dan Squared Error (SE) pada Complete-Case',
    ...compSources.flatMap((cs, idx) => {
      const cv = varMap.get(cs.id)!;
      const j = idx + 1;
      return [
        `* --- Sumber Pembanding #${j}: ${cs.name} (${cs.label}) vs Referensi ${refSource?.name} ---`,
        `gen double err_${j} = ${cv} - ${refStataVar} if complete_case`,
        `gen double ae_${j}  = abs(err_${j}) if complete_case`,
        `gen double se_${j}  = (err_${j})^2 if complete_case`,
        `* Estimasi MAE dan MBE dengan Cluster-Robust SE pada level City ID`,
        `mean ae_${j} err_${j} if complete_case, vce(cluster city_id)`,
        `quietly summarize se_${j} if complete_case`,
        `display "RMSE ${cs.name} (Complete-Case) = " sqrt(r(mean))`,
        `* Bland-Altman Mean Bias, 95% Limits of Agreement (LoA), & Uji Proportional Bias`,
        `gen double ba_mean_${j} = (${cv} + ${refStataVar}) / 2 if complete_case`,
        `quietly summarize err_${j} if complete_case`,
        `display "Bland-Altman 95% LoA ${cs.name}: [" r(mean) - 1.96*r(sd) ", " r(mean) + 1.96*r(sd) "]"`,
        `regress err_${j} ba_mean_${j} if complete_case, vce(cluster city_id)`,
        `* Lin's Concordance Correlation Coefficient (requires: ssc install concord)`,
        `capture noisily concord ${cv} ${refStataVar} if complete_case`,
        `* Evaluasi Terpisah pada Available-Case (Pasangan Tersedia Spesifik Sumber #${j})`,
        `gen double err_avail_${j} = ${cv} - ${refStataVar} if !missing(${cv}) & !missing(${refStataVar})`,
        `gen double ae_avail_${j}  = abs(err_avail_${j})`,
        `quietly summarize ae_avail_${j}`,
        `display "Available-Case ${cs.name}: N=" r(N) " | MAE=" r(mean)`,
        ''
      ];
    }),
    ...(sources.length >= 3
      ? [
          '* 2. Pendamping (Opsional): Estimasi Faktor Laten Teranker pada Sumber Referensi (Stata SEM / Bayes)',
          `* Menganker skala laten L_emission pada ${refStataVar} (loading = 1, intercept = 0):`,
          `capture noisily sem (L_emission -> ${refStataVar}@1 ${compSources.map(c => varMap.get(c.id)!).join(' ')}), vce(cluster city_id) standardized`,
          '* Jika lisensi Stata Bayes tersedia, dapat dijalankan dengan prefix bayes:',
          `* capture noisily bayes, rseed(2026): sem (L_emission -> ${refStataVar}@1 ${compSources.map(c => varMap.get(c.id)!).join(' ')})`
        ]
      : ['* Catatan: Estimasi SEM Laten tanpa batasan varians membutuhkan minimal J >= 3 sumber.']),
    'restore'
  ].join('\n');

  const step5CompanionStan = [
    '// Companion Stan Model: Hierarchical Panel Latent Measurement Model',
    '// Anchored on Reference Source r (lambda_ref = 1, alpha_ref = 0)',
    'data {',
    '  int<lower=1> N;              // Complete-case City-Year pairs',
    '  int<lower=2> J;              // Number of measurement sources',
    '  int<lower=1,upper=J> ref_j;  // Index of chosen reference source',
    '  matrix[N, J] X;              // Observed panel measurements',
    '}',
    'parameters {',
    '  vector[N] theta;             // Latent emission level per City-Year',
    '  real mu_theta;',
    '  real<lower=0> sigma_theta;',
    '  vector[J] alpha_raw;         // Source intercept / additive bias',
    '  vector<lower=0>[J] lambda_raw; // Multiplicative scaling / loading',
    '  vector<lower=0>[J] sigma_eps;  // Source measurement error SD',
    '}',
    'transformed parameters {',
    '  vector[J] alpha = alpha_raw;',
    '  vector[J] lambda = lambda_raw;',
    '  alpha[ref_j] = 0.0;          // Anchor location on Reference Source',
    '  lambda[ref_j] = 1.0;         // Anchor scale on Reference Source',
    '}',
    'model {',
    '  mu_theta ~ normal(0, 1000);',
    '  sigma_theta ~ cauchy(0, 250);',
    '  theta ~ normal(mu_theta, sigma_theta);',
    '  alpha_raw ~ normal(0, 200);',
    '  lambda_raw ~ lognormal(0, 0.5);',
    '  sigma_eps ~ cauchy(0, 100);',
    '  for (j in 1:J)',
    '    X[, j] ~ normal(alpha[j] + lambda[j] * theta, sigma_eps[j]);',
    '}',
    'generated quantities {',
    '  vector[J] error_variance;',
    '  vector[J] reliability;',
    '  for (j in 1:J) {',
    '    error_variance[j] = square(sigma_eps[j]);',
    '    reliability[j] = (square(lambda[j]) * square(sigma_theta)) /',
    '                     (square(lambda[j]) * square(sigma_theta) + error_variance[j]);',
    '  }',
    '}'
  ].join('\n');

  const step5Interpretations: FivePointInterpretationItem[] = [];
  if (fitResult) {
    fitResult.metrics.forEach(m => {
      step5Interpretations.push({
        title: `MAE & RMSE — ${m.sourceName} (${m.sourceLabel})`,
        nilai: `MAE = ${m.mae.toFixed(3)} ${unitNote} (95% Cluster CI: [${m.maeCiLower.toFixed(3)}, ${m.maeCiUpper.toFixed(3)}]) | RMSE = ${m.rmse.toFixed(3)} ${unitNote} (N_CC = ${m.nCompleteCase}).`,
        artinya: `Rata-rata penyimpangan absolut ${m.sourceName} terhadap referensi ${fitResult.referenceSource.name} adalah ${m.mae.toFixed(3)} ${unitNote}, dengan akar kuadrat galat rata-rata sebesar ${m.rmse.toFixed(3)} ${unitNote}.`,
        caraMembaca:
          'Semakin kecil nilai MAE dan RMSE (mendekati 0), semakin dekat pengukuran sumber tersebut terhadap sumber referensi. Selisih RMSE − MAE yang besar menandakan adanya galat ekstrem pada kota/tahun tertentu.',
        implikasi:
          `Pada metrik utama MAE, ${m.sourceName} mencatat tingkat kesalahan relatif sebesar ${m.nmaePct.toFixed(2)}% dari rata-rata emisi referensi.`,
        batasan:
          'MAE dan RMSE mengukur ketidakakuratan relatif terhadap sumber referensi yang dipilih, bukan terhadap nilai emisi kebenaran absolut yang tidak teramati.'
      });

      step5Interpretations.push({
        title: `MBE, Lin's CCC & Bland-Altman — ${m.sourceName} (${m.sourceLabel})`,
        nilai: `MBE = ${m.mbe >= 0 ? '+' : ''}${m.mbe.toFixed(3)} ${unitNote} (p = ${m.mbePValue.toFixed(4)}) | Lin's CCC = ${m.ccc.ccc.toFixed(4)} (Cb = ${m.ccc.biasCorrectionFactorCb.toFixed(4)}) | 95% LoA = [${m.blandAltman.loaLower.toFixed(2)}, ${m.blandAltman.loaUpper.toFixed(2)}].`,
        artinya:
          `${m.sourceName} memiliki kecenderungan ${m.mbe > 0 ? 'overestimation (bias positif)' : m.mbe < 0 ? 'underestimation (bias negatif)' : 'netral'} yang ${m.mbePValue < 0.05 ? 'signifikan secara statistik (p < 0.05)' : 'tidak signifikan secara statistik (p >= 0.05)'}, dengan kesepakatan konkordansi Lin CCC sebesar ${m.ccc.ccc.toFixed(4)}.`,
        caraMembaca:
          'Lin CCC menggabungkan presisi korelasi ($r$) dan akurasi kedekatan ke garis $45^\\circ$ ($C_b$); rentang 95% LoA Bland-Altman menunjukkan batas selisih individual untuk 95% pasangan Kota-Tahun.',
        implikasi:
          m.blandAltman.hasProportionalBias
            ? `Terdeteksi proportional bias signifikan (slope = ${m.blandAltman.propBiasSlope.toFixed(4)}, p = ${m.blandAltman.propBiasPValue.toFixed(4)}): besaran bias berubah seiring tingkat emisi kota.`
            : `Tidak terdeteksi proportional bias signifikan (p = ${m.blandAltman.propBiasPValue.toFixed(4)}): besaran selisih relatif konstan lintas skala kota.`,
        batasan:
          'Nilai CCC yang tinggi tetap harus dikonfirmasi dengan uji inferensial berpasangan di Step 6 untuk membuktikan apakah selisih MAE antarsumber signifikan.'
      });
    });
  }

  const step5Bundle: StepStataDocumentationBundle = {
    stepId: 5,
    stepTitle: 'Step 5 — Measurement Error, Accuracy Assessment & Companion Model',
    analysisPurpose: {
      whatIsAnalyzed:
        'Kesalahan pengukuran berpasangan ($\\text{Error}_{ijt}, \\text{AE}_{ijt}, \\text{SE}_{ijt}$), metrik akurasi (MAE, RMSE, MBE), Lin\'s Concordance Correlation Coefficient ($\\rho_c, r, C_b, u, v$), dan Bland-Altman Limits of Agreement (95% LoA & Proportional Bias).',
      whyRequired:
        'Korelasi saja gagal mendeteksi pergeseran sistematis (bias lokasi maupun kemiringan skala). Kombinasi MAE, RMSE, MBE, Lin\'s CCC, dan Bland-Altman memberikan potret akurasi dan presisi secara menyeluruh.',
      statisticalQuestionAnswered:
        'Berapa besar kesalahan absolut, kesalahan kuadratik, bias sistematis, dan tingkat kesepakatan setiap sumber pembanding terhadap sumber referensi pada pasangan Kota-Tahun yang sama?'
    },
    stataCode: step5Code,
    companionStanCode: step5CompanionStan,
    dependenciesNote: 'Perhitungan MAE, RMSE, MBE, dan regresi Bland-Altman menggunakan perintah bawaan Stata (`mean ..., vce(cluster city_id)`, `summarize`, `regress`). Untuk Lin\'s CCC di Stata instal paket resmi: `ssc install concord`. Tersedia pula kode pendamping `.stan` untuk model pengukuran laten hierarkis.',
    commandUsages: [
      {
        command: 'gen double err_j = X_j - X_ref & gen double ae_j = abs(err_j)',
        functionSummary: 'Menghitung selisih bertanda ($\text{Error}_{ijt}$) dan selisih mutlak ($\text{AE}_{ijt}$) pada setiap sel Kota-Tahun.',
        reasonUsed: 'Membentuk variabel dasar untuk perhitungan MAE dan MBE berpasangan.',
        linkToStepGoal: 'Mengukur jarak fisik setiap instrumen terhadap sumber referensi.'
      },
      {
        command: 'mean ae_j err_j if complete_case, vce(cluster city_id)',
        functionSummary: 'Mengestimasi nilai rata-rata MAE dan MBE beserta standar error dan 95% CI yang diklasterkan pada tingkat Kota.',
        reasonUsed: 'Mengakomodasi korelasi serial error di dalam kota yang sama lintas tahun.',
        linkToStepGoal: 'Menghasilkan interval kepercayaan MAE dan uji signifikansi bias rata-rata (MBE).'
      },
      {
        command: 'concord X_j X_ref if complete_case',
        functionSummary: 'Menghitung Lin\'s Concordance Correlation Coefficient ($\\rho_c$), faktor koreksi bias ($C_b$), dan statistik Bland-Altman.',
        reasonUsed: 'Mengukur sejauh mana pasangan pengamatan jatuh tepat pada garis kesetaraan $45^\\circ$.',
        linkToStepGoal: 'Membedakan korelasi linear biasa ($r$) dari kesepakatan nilai aktual ($\\rho_c = r \\times C_b$).'
      },
      {
        command: 'regress err_j ba_mean_j, vce(cluster city_id)',
        functionSummary: 'Menguji kemiringan (*slope*) selisih terhadap rata-rata pengukuran pada plot Bland-Altman.',
        reasonUsed: 'Mendeteksi apakah bias membesar/mengecil pada kota beremisi tinggi (*proportional bias*).',
        linkToStepGoal: 'Memvalidasi konsistensi bias lintas skala emisi.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Mean Absolute Error (MAE) & Root Mean Squared Error (RMSE)',
        statisticalDefinition: '$\\text{MAE}_j = \\frac{1}{N}\\sum |X_{ijt} - X_{irt}|$ dan $\\text{RMSE}_j = \\sqrt{\\frac{1}{N}\\sum (X_{ijt} - X_{irt})^2}$.',
        unit: unitNote,
        researchFunction: 'Metrik utama (MAE) dan metrik sensitif-outlier (RMSE) untuk menilai ketidakakuratan pengukuran.',
        keyValueToWatch: 'Sumber dengan nilai MAE dan RMSE paling rendah',
        goodVsWarningCondition: 'Semakin mendekati 0 semakin akurat; jika RMSE >> MAE, periksa adanya pencilan besar pada beberapa Kota-Tahun.'
      },
      {
        outputName: 'Mean Bias Error (MBE)',
        statisticalDefinition: '$\\text{MBE}_j = \\frac{1}{N}\\sum (X_{ijt} - X_{irt})$.',
        unit: unitNote,
        researchFunction: 'Menunjukkan arah penyimpangan rata-rata: positif berarti *overestimation*, negatif berarti *underestimation*.',
        keyValueToWatch: 'Nilai MBE dan p-value uji t terhadap 0',
        goodVsWarningCondition: 'Baik jika MBE mendekati 0 dan p >= 0.05; waspada jika p < 0.05 (terdapat bias sistematis).'
      },
      {
        outputName: 'Lin\'s CCC (ρ_c) & Bias Correction Factor (C_b)',
        statisticalDefinition: '$\\rho_c = r \\times C_b$, di mana $r$ adalah presisi Pearson dan $C_b \\in (0, 1]$ adalah penalti pergeseran lokasi ($u$) dan skala ($v$).',
        unit: 'Tanpa satuan ([-1, 1])',
        researchFunction: 'Mengukur kesepakatan total terhadap garis identitas $45^\\circ$.',
        keyValueToWatch: 'Nilai CCC dan C_b mendekati 1.0000',
        goodVsWarningCondition: 'Sangat baik jika CCC >= 0.90; jika r tinggi tetapi CCC rendah (C_b << 1), berarti sumber mengalami bias skala/lokasi.'
      },
      {
        outputName: 'Bland-Altman 95% Limits of Agreement (LoA) & Proportional Bias',
        statisticalDefinition: 'Rentang $\\text{MBE} \\pm 1.96 \\times SD(\\text{Error})$ serta koefisien kemiringan regresi selisih terhadap rata-rata.',
        unit: unitNote,
        researchFunction: 'Menentukan seberapa lebar rentang penyimpangan pada 95% kasus Kota-Tahun.',
        keyValueToWatch: 'Lebar LoA, % di luar LoA (~5%), dan p-value Proportional Bias',
        goodVsWarningCondition: 'Baik jika LoA sempit dan p Proportional Bias >= 0.05; waspada jika LoA sangat lebar atau p < 0.05.'
      }
    ],
    structuredInterpretations: step5Interpretations,
    stepConclusion: {
      decisionSummary: fitResult
        ? `Metrik akurasi seluruh ${compSources.length} sumber pembanding berhasil dihitung pada N_CC = ${fitResult.datasetMeta.nCompletePairs} pasangan Kota-Tahun. Sumber dengan MAE terendah secara deskriptif adalah ${fitResult.ranking.ranks[0]?.sourceLabel || '-'} (MAE = ${fitResult.ranking.ranks[0]?.mae.toFixed(3) || '-'} ${unitNote}).`
        : 'Menunggu konfigurasi data valid untuk menghitung metrik akurasi.',
      readinessStatus: 'LAYAK DILANJUTKAN',
      warnings: fitResult?.metrics.some(m => m.missingGapVsComplete > 0)
        ? ['Terdapat perbedaan jumlah sampel antara Complete-Case dan Available-Case; periksa kedua tabel secara berdampingan.']
        : []
    }
  };

  // ============================================================
  // STEP 6: PANEL FIXED EFFECTS INFERENTIAL COMPARISON
  // ============================================================
  const step6Code = [
    '* ============================================================================',
    '* STEP 6: PANEL FIXED EFFECTS INFERENTIAL COMPARISON & WILD CLUSTER BOOTSTRAP',
    '* Model: AE_ijt = alpha_it + sum_{m != base} beta_m * Source_m + eps_ijt',
    '* Absorbing City-Year Pair Fixed Effects (pair_id), Clustered by City ID',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    '',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    `egen byte complete_case = rownonmiss(${allStataVars})`,
    `keep if complete_case == ${sources.length}`,
    '',
    '* 1. Hitung Absolute Error (AE) dan Signed Error untuk setiap Comparison Source',
    ...compSources.map((cs, idx) => {
      const cv = varMap.get(cs.id)!;
      const j = idx + 1;
      return `gen double ae_${j} = abs(${cv} - ${refStataVar})\ngen double err_${j} = ${cv} - ${refStataVar}`;
    }),
    '',
    '* 2. Bentuk Struktur Panel Long (City-Year-Source) dengan Pair ID (alpha_it)',
    'egen long pair_id = group(city_id year_id)',
    `keep pair_id city_id year_id ${compSources.map((_, i) => `ae_${i + 1} err_${i + 1}`).join(' ')}`,
    'reshape long ae_ err_, i(pair_id) j(source_id)',
    'rename ae_ ae',
    'rename err_ signed_err',
    '',
    '* 3. Estimasi Pair Fixed Effects dengan Cluster-Robust SE pada level City ID',
    'areg ae i.source_id, absorb(pair_id) vce(cluster city_id)',
    'testparm i.source_id',
    '',
    '* 4. Kontras Berpasangan Seluruh Sumber Pembanding (Delta MAE = MAE_A - MAE_B)',
    ...(compSources.length >= 2
      ? [
          'margins source_id',
          'margins r.source_id, contrast(nowald)',
          'pwcompare source_id, effects cimeans'
        ]
      : ['* Hanya terdapat 1 sumber pembanding (J=2); kontras antarsumber pembanding tidak diperlukan.']),
    '',
    '* 5. Rademacher Wild Cluster Bootstrap (Wajib terutama bila G < 30 klaster kota)',
    '* Requires package: ssc install boottest',
    ...(compSources.length >= 2
      ? compSources.slice(1).map((_, idx) =>
          `capture noisily boottest ${idx + 2}.source_id, cluster(city_id) boottype(wild) weighttype(rademacher) reps(999) seed(20260416)`
        )
      : []),
    'restore'
  ].join('\n');

  const step6Interpretations: FivePointInterpretationItem[] = [];
  if (fitResult) {
    const pfe = fitResult.pairFixedEffects;
    step6Interpretations.push({
      title: 'Uji Omnibus Pair Fixed Effects (Perbedaan Simultan MAE Antarsumber)',
      nilai: `Wald F(${pfe.omnibusDf1}, ${pfe.omnibusDf2}) = ${pfe.omnibusFStat.toFixed(3)} | Cluster p-value = ${pfe.omnibusPValue.toFixed(4)} | Wild Bootstrap p-value = ${pfe.omnibusWildBootstrapPValue.toFixed(4)} (Within R² = ${pfe.withinR2.toFixed(4)}).`,
      artinya:
        pfe.omnibusWildBootstrapPValue < 0.05
          ? 'Terdapat perbedaan rata-rata kesalahan absolut (MAE) yang signifikan secara statistik di antara sumber-sumber pembanding pada pasangan Kota-Tahun yang sama.'
          : 'Secara simultan belum terdapat perbedaan MAE yang signifikan secara statistik di antara sumber-sumber pembanding.',
      caraMembaca:
        'Nilai p < 0.05 menolak hipotesis nol ($H_0: \\beta_1 = \\beta_2 = \\dots = 0$) bahwa seluruh sumber pembanding memiliki tingkat kesalahan MAE yang identik.',
      implikasi:
        pfe.smallClusterWarning
          ? `Karena jumlah klaster kota G = ${pfe.nClustersCity} < 30, keputusan inferensi wajib mengacu pada Wild Bootstrap p-value (${pfe.omnibusWildBootstrapPValue.toFixed(4)}).`
          : `Baik Cluster-Robust p-value maupun Wild Bootstrap p-value memberikan kesimpulan inferensial yang konsisten pada ${pfe.nClustersCity} klaster kota.`,
      batasan:
        'Uji omnibus hanya menyatakan ada/tidaknya perbedaan antarsumber secara global; untuk menentukan pasangan sumber mana yang berbeda signifikan, periksa tabel Kontras Berpasangan.'
    });

    pfe.pairwiseContrasts.forEach(c => {
      step6Interpretations.push({
        title: `Kontras Berpasangan: ${c.sourceALabel} vs ${c.sourceBLabel}`,
        nilai: `ΔMAE (A − B) = ${c.diffAminusB >= 0 ? '+' : ''}${c.diffAminusB.toFixed(3)} ${unitNote} (SE = ${c.seCluster.toFixed(3)}, t = ${c.tStat.toFixed(2)}) | Cluster p = ${c.pValueCluster.toFixed(4)} | Wild Bootstrap p = ${c.wildBootstrapPValue.toFixed(4)} (95% Wild CI: [${c.wildBootstrapCiLower.toFixed(2)}, ${c.wildBootstrapCiUpper.toFixed(2)}]).`,
        artinya:
          c.isSignificant05
            ? `Perbedaan akurasi antara ${c.sourceALabel} dan ${c.sourceBLabel} terbukti signifikan secara statistik pada $\\alpha = 0.05$ (${c.diffAminusB < 0 ? c.sourceALabel : c.sourceBLabel} memiliki MAE lebih rendah/lebih akurat).`
            : `Selisih MAE sebesar ${Math.abs(c.diffAminusB).toFixed(3)} ${unitNote} antara ${c.sourceALabel} dan ${c.sourceBLabel} tidak signifikan secara statistik (dapat disebabkan oleh variasi acak sampel).`,
        caraMembaca:
          'ΔMAE negatif ($\text{MAE}_A - \text{MAE}_B < 0$) berarti Sumber A memiliki rata-rata kesalahan lebih kecil daripada Sumber B; periksa apakah interval kepercayaan 95% memotong angka 0.',
        implikasi:
          c.isSignificant05
            ? 'Keunggulan akurasi salah satu sumber dalam pasangan ini didukung bukti inferensial yang kuat setelah mengontrol efek tetap Kota-Tahun.'
            : 'Kedua sumber dalam pasangan ini secara statistik setara (indistinguishable) pada tingkat signifikansi 5%.',
        batasan:
          'Signifikansi statistik pada sampel berpasangan bergantung pada kredibilitas sumber referensi dan jumlah klaster kota ($G$).'
      });
    });
  }

  const step6Bundle: StepStataDocumentationBundle = {
    stepId: 6,
    stepTitle: 'Step 6 — Panel Fixed Effects Inferential Comparison & Wild Bootstrap',
    analysisPurpose: {
      whatIsAnalyzed:
        'Perbedaan rata-rata kesalahan absolut ($\\Delta\\text{MAE}$) antarsumber pembanding menggunakan model regresi panel struktur *long* dengan menyerap efek tetap pasangan Kota-Tahun ($\\alpha_{it}$) dan mengelompokkan standar error pada level Kota ($G$ klaster).',
      whyRequired:
        'Mengurutkan angka MAE secara deskriptif saja tidak cukup; diperlukan uji hipotesis formal pada unit pengamatan yang sama untuk memastikan selisih MAE bukan sekadar fluktuasi kebetulan.',
      statisticalQuestionAnswered:
        'Apakah selisih MAE antara sumber pembanding #1 dan sumber pembanding lainnya signifikan secara statistik setelah mengontrol heterogenitas spesifik Kota-Tahun?'
    },
    stataCode: step6Code,
    dependenciesNote: 'Menggunakan perintah bawaan Stata (`reshape long`, `areg ..., absorb(pair_id) vce(cluster city_id)`, `margins`, `pwcompare`). Untuk Rademacher Wild Cluster Bootstrap di Stata instal paket: `ssc install boottest`.',
    commandUsages: [
      {
        command: 'egen long pair_id = group(city_id year_id) & reshape long ae_',
        functionSummary: 'Membentuk pengenal unik pasangan Kota-Tahun dan mengubah data ke struktur *long* (satu baris per Kota-Tahun-Sumber).',
        reasonUsed: 'Memungkinkan perbandingan antarsumber di dalam sel Kota-Tahun yang persis sama.',
        linkToStepGoal: 'Menyusun matriks desain untuk model Pair Fixed Effects.'
      },
      {
        command: 'areg ae i.source_id, absorb(pair_id) vce(cluster city_id)',
        functionSummary: 'Mengestimasi perbedaan MAE antarsumber dengan menyerap efek tetap $\\alpha_{it}$ (`pair_id`) dan menghitung Cluster-Robust SE pada level `city_id`.',
        reasonUsed: 'Menghilangkan seluruh faktor pengganggu spesifik kota-tahun (ukuran ekonomi, cuaca tahunan, populasi) dan mengoreksi autokorelasi dalam-kota.',
        linkToStepGoal: 'Menghasilkan estimasi $\\beta_m = \\text{MAE}_m - \\text{MAE}_{\\text{base}}$ yang tak-bias.'
      },
      {
        command: 'margins r.source_id & pwcompare source_id, effects cimeans',
        functionSummary: 'Menghitung seluruh kontras berpasangan $\\Delta\\text{MAE}_{A,B} = \\text{MAE}_A - \\text{MAE}_B$ beserta t-statistik dan p-value.',
        reasonUsed: 'Membandingkan setiap pasang sumber pembanding secara langsung, bukan hanya terhadap satu kategori acuan.',
        linkToStepGoal: 'Menentukan apakah sumber peringkat #1 unggul signifikan atas peringkat #2.'
      },
      {
        command: 'boottest ..., cluster(city_id) boottype(wild) weighttype(rademacher) reps(999)',
        functionSummary: 'Menjalankan Rademacher Wild Cluster Bootstrap dengan 999 replikasi pada tingkat klaster kota.',
        reasonUsed: 'Mencegah *downward bias* pada standar error asimtotik ketika jumlah klaster kota sedikit ($G < 30$).',
        linkToStepGoal: 'Menjamin validitas p-value dan 95% CI pada sampel klaster kecil.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Koefisien β (Diff vs Baseline Comparison Source)',
        statisticalDefinition: 'Selisih rata-rata kesalahan absolut sumber $m$ terhadap sumber pembanding acuan ($\\beta_m = \\text{MAE}_m - \\text{MAE}_{j_0}$).',
        unit: unitNote,
        researchFunction: 'Menunjukkan pengurangan ($\\beta_m < 0$) atau penambahan ($\\beta_m > 0$) kesalahan dibanding sumber pembanding pertama.',
        keyValueToWatch: 'Tanda koefisien β, t-stat, dan p-value',
        goodVsWarningCondition: 'β < 0 dengan p < 0.05 berarti sumber tersebut secara signifikan lebih akurat dibanding sumber pembanding acuan.'
      },
      {
        outputName: 'Wild Cluster Bootstrap p-value & 95% CI',
        statisticalDefinition: 'Nilai probabilitas empiris dan interval kepercayaan hasil penimbangan ulang Rademacher ($\\pm 1$) per klaster kota.',
        unit: 'Probabilitas [0, 1] & ' + unitNote,
        researchFunction: 'Acuan inferensi utama untuk menguji perbedaan akurasi saat jumlah kota terbatas ($G < 30$).',
        keyValueToWatch: 'Wild Bootstrap p-val pada kontras #1 vs #2',
        goodVsWarningCondition: 'Jika p < 0.05 maka keunggulan sumber #1 terbukti signifikan secara inferensial.'
      }
    ],
    structuredInterpretations: step6Interpretations,
    stepConclusion: {
      decisionSummary: fitResult
        ? `Estimasi Pair Fixed Effects menyerap ${fitResult.pairFixedEffects.nCompletePairs} pasangan Kota-Tahun pada ${fitResult.pairFixedEffects.nClustersCity} klaster kota (${fitResult.pairFixedEffects.bootstrapReplications} replikasi Wild Bootstrap).`
        : 'Menunggu hasil estimasi Pair Fixed Effects.',
      readinessStatus: fitResult?.pairFixedEffects.smallClusterWarning
        ? 'LAYAK DENGAN CATATAN'
        : 'LAYAK DILANJUTKAN',
      warnings: fitResult?.pairFixedEffects.smallClusterWarning
        ? [`Jumlah klaster kota G = ${fitResult.pairFixedEffects.nClustersCity} < 30: gunakan Wild Bootstrap p-value sebagai dasar pengambilan keputusan.`]
        : []
    }
  };

  // ============================================================
  // STEP 7: STATISTICAL DIAGNOSTICS & INFERENCE
  // ============================================================
  const step7Code = [
    '* ============================================================================',
    '* STEP 7: STATISTICAL DIAGNOSTICS, PANEL RESIDUAL TESTS & OUTLIER SENSITIVITY',
    '* Includes: sktest, swilk (sample-size guarded), xtserial, xttest3, xtcsd,',
    '*           Levene/Brown-Forsythe error variance test, and 95% Trimmed MAE',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    '',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    'xtset city_id year_id',
    `egen byte complete_case = rownonmiss(${allStataVars})`,
    `keep if complete_case == ${sources.length}`,
    '',
    '* 1. Diagnostik Panel per Comparison Source (Autokorelasi Serial, Heteroskedastisitas, Cross-Sectional Dependence)',
    ...compSources.flatMap((cs, idx) => {
      const cv = varMap.get(cs.id)!;
      const j = idx + 1;
      return [
        `* --- Diagnostik Error Sumber #${j}: ${cs.name} (${cs.label}) ---`,
        `gen double err_${j} = ${cv} - ${refStataVar}`,
        `gen double ae_${j}  = abs(err_${j})`,
        '* Uji Normalitas Residual/Error (Catatan: AE >= 0 secara alami miring kanan; inferensi mengandalkan CLT + Cluster/Bootstrap)',
        `sktest err_${j} ae_${j}`,
        'if _N >= 4 & _N <= 2000 {',
        `    swilk err_${j} ae_${j}`,
        '}',
        '* Uji Autokorelasi Serial Wooldridge pada Panel (requires: ssc install xtserial)',
        `capture noisily xtserial err_${j} ${cv}`,
        '* Estimasi FE untuk diagnostik Groupwise Heteroskedasticity (xttest3) & Pesaran CD (xtcsd)',
        `quietly xtreg err_${j} i.year_id, fe`,
        'capture noisily xttest3',
        'capture noisily xtcsd, pesaran abs',
        ''
      ];
    }),
    '* 2. Uji Homogenitas Varians Error Antarsumber (Levene / Brown-Forsythe via robvar)',
    'egen long pair_id = group(city_id year_id)',
    `keep pair_id city_id year_id ${compSources.map((_, i) => `ae_${i + 1} err_${i + 1}`).join(' ')}`,
    'reshape long ae_ err_, i(pair_id) j(source_id)',
    'robvar err_, by(source_id)',
    '',
    '* 3. Audit Sensitivitas Outlier: Full Sample MAE vs 95% Trimmed MAE (Tanpa 5% AE Terbesar)',
    'bysort source_id: egen p95_ae = pctile(ae_), p(95)',
    'bysort source_id: summarize ae_',
    'bysort source_id: summarize ae_ if ae_ <= p95_ae',
    'restore'
  ].join('\n');

  const step7Interpretations: FivePointInterpretationItem[] = [];
  if (fitResult) {
    const diag = fitResult.diagnostics;
    [
      diag.heteroskedasticityTest,
      diag.serialCorrelationTest,
      diag.crossSectionalDependenceTest
    ].forEach(d => {
      step7Interpretations.push({
        title: d.testName,
        nilai: `${d.statisticLabel} = ${d.statisticValue.toFixed(3)} (${d.dfLabel}) | p-value = ${(d.pValue ?? 1).toFixed(4)} [Status: ${d.status.toUpperCase()}].`,
        artinya: d.conclusion,
        caraMembaca:
          'Nilai p < 0.05 menolak hipotesis nol ($H_0$: varians error homogen / tidak ada korelasi serial / tidak ada ketergantungan lintas-kota).',
        implikasi: d.implication,
        batasan:
          'Adanya heteroskedastisitas atau autokorelasi serial tidak membatalkan ketakbiasan MAE, melainkan mengharuskan penggunaan Cluster-Robust SE / Wild Cluster Bootstrap.'
      });
    });

    step7Interpretations.push({
      title: 'Audit Sensitivitas Outlier (Full MAE vs 95% Trimmed MAE)',
      nilai: diag.outlierSensitivityAudit.entries
        .map(
          e =>
            `${e.sourceLabel}: Full=${e.maeFull.toFixed(2)} (#${e.rankFull}) vs Trimmed95=${e.maeTrimmed95.toFixed(2)} (#${e.rankTrimmed95}, Δ=${e.shiftPct.toFixed(1)}%)`
        )
        .join(' | '),
      artinya: diag.outlierSensitivityAudit.summary,
      caraMembaca:
        'Bandingkan urutan peringkat pada sampel penuh (100%) dengan sampel setelah 5% nilai kesalahan absolut terbesar dipangkas (95% Trimmed).',
      implikasi: diag.outlierSensitivityAudit.rankOrderChanged
        ? 'PERINGATAN: Urutan peringkat sumber berubah saat 5% pencilan terbesar dikeluarkan, sehingga kesimpulan Step 8 otomatis ditandai KONFLIK_ANTAR_METRIK.'
        : 'Urutan peringkat sumber terbukti kokoh (robust) dan tidak bergantung pada segelintir observasi ekstrem.',
      batasan:
        'Pemangkasan 5% hanya digunakan sebagai uji sensitivitas diagnostik, bukan untuk menghapus observasi secara sembunyi-sembunyi dari laporan utama.'
    });
  }

  const step7Bundle: StepStataDocumentationBundle = {
    stepId: 7,
    stepTitle: 'Step 7 — Statistical Diagnostics, Residual Tests & Outlier Sensitivity',
    analysisPurpose: {
      whatIsAnalyzed:
        'Heteroskedastisitas varians galat antarsumber, autokorelasi serial dalam-kota (AR(1)), ketergantungan lintas-kota (Pesaran CD), kecukupan jumlah klaster ($G$), distribusi residual (`sktest`/`swilk`), dan sensitivitas peringkat terhadap 5% outlier terbesar.',
      whyRequired:
        'Data panel emisi CO₂ umumnya memiliki galat yang berkorelasi antarwaktu di kota yang sama serta terpengaruh guncangan makro bersama lintas kota.',
      statisticalQuestionAnswered:
        'Apakah asumsi struktur kovarians galat membutuhkan koreksi klaster/bootstrap, dan apakah urutan peringkat akurasi tahan terhadap nilai pencilan?'
    },
    stataCode: step7Code,
    dependenciesNote: 'Menggunakan `sktest`, `swilk` (dijaga otomatis untuk $4 \\le N \\le 2000$), dan `robvar` bawaan Stata. Untuk diagnostik panel lanjutan instal: `ssc install xtserial`, `ssc install xttest3`, dan `ssc install xtcsd`.',
    commandUsages: [
      {
        command: 'sktest & swilk (with sample size guard)',
        functionSummary: 'Menguji kecondongan (*skewness*), keruncingan (*kurtosis*), dan normalitas Shapiro-Wilk pada distribusi galat.',
        reasonUsed: 'Memeriksa bentuk sebaran galat bertanda (`err`) dan galat absolut (`ae`).',
        linkToStepGoal: 'Mendokumentasikan kecondongan distribusi sembari menegaskan peran Central Limit Theorem (CLT).'
      },
      {
        command: 'xtserial & xttest3 & xtcsd, pesaran abs',
        functionSummary: 'Menguji autokorelasi serial Wooldridge ($H_0$: tidak ada AR(1)), heteroskedastisitas grup Wald ($H_0$: $\\sigma_i^2 = \\sigma^2$), dan ketergantungan lintas-seksi Pesaran CD.',
        reasonUsed: 'Mengidentifikasi pelanggaran asumsi Gauss-Markov pada dimensi ruang dan waktu panel.',
        linkToStepGoal: 'Membenarkan penggunaan Cluster-Robust SE pada level Kota dan Wild Cluster Bootstrap.'
      },
      {
        command: 'robvar err_, by(source_id)',
        functionSummary: 'Menjalankan uji Levene ($W_0$) dan Brown-Forsythe ($W_{50}, W_{10}$) untuk kesamaan varians error antarsumber.',
        reasonUsed: 'Menguji apakah tingkat kepresisian (dispersi galat) berbeda signifikan lintas instrumen.',
        linkToStepGoal: 'Melengkapi uji heteroskedastisitas antarsumber pada Step 7.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Heteroskedasticity & Serial Correlation Tests',
        statisticalDefinition: 'Statistik uji perbedaan varians galat antarsumber ($F$) dan korelasi galat lag-1 dalam kota yang sama ($\\rho_1$).',
        unit: 'Statistik F / t & p-value',
        researchFunction: 'Menentukan validitas standar error OLS biasa vs Cluster-Robust SE.',
        keyValueToWatch: 'p-value < 0.05 menandakan heteroskedastisitas / autokorelasi serial aktif',
        goodVsWarningCondition: 'Jika p < 0.05, jangan gunakan SE OLS biasa; sistem ini sudah otomatis memakai City Cluster SE + Wild Bootstrap.'
      },
      {
        outputName: '95% Trimmed MAE Sensitivity Audit',
        statisticalDefinition: 'Rata-rata kesalahan absolut setelah mengeluarkan 5% observasi dengan $\\text{AE}_{ijt}$ paling ekstrem.',
        unit: unitNote,
        researchFunction: 'Mendeteksi apakah pemenang peringkat #1 hanya menang/kalah karena 1–2 observasi pencilan.',
        keyValueToWatch: 'Perbandingan urutan Peringkat Penuh vs Peringkat Trimmed',
        goodVsWarningCondition: 'Baik jika urutan peringkat tidak berubah; waspada tinggi jika urutan peringkat berbalik.'
      }
    ],
    structuredInterpretations: step7Interpretations,
    stepConclusion: {
      decisionSummary: fitResult
        ? `Diagnostik selesai: ${fitResult.diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'Terdeteksi perubahan urutan peringkat saat 5% outlier dipangkas.' : 'Urutan peringkat MAE stabil terhadap pemangkasan 5% outlier.'}`
        : 'Menunggu hasil diagnostik.',
      readinessStatus: fitResult?.diagnostics.outlierSensitivityAudit.rankOrderChanged
        ? 'LAYAK DENGAN CATATAN'
        : 'LAYAK DILANJUTKAN',
      warnings: fitResult?.diagnostics.outlierSensitivityAudit.rankOrderChanged
        ? ['Peringkat sensitif terhadap 5% outlier terbesar; status peringkat di Step 8 akan menandai konflik sensitivitas.']
        : []
    }
  };

  // ============================================================
  // STEP 8: COMPARATIVE EVALUATION, SOURCE RANKING & ROBUSTNESS
  // ============================================================
  const step8Code = [
    '* ============================================================================',
    '* STEP 8: COMPARATIVE SOURCE RANKING & ROBUSTNESS / SENSITIVITY ANALYSIS',
    '* Includes: MAE-Primary Ranking, Leave-One-City-Out (LOCO) Jackknife Loop,',
    '*           Complete-Case vs Available-Case, and Original vs Transformed Scale',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    '',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    `egen byte complete_case = rownonmiss(${allStataVars})`,
    `keep if complete_case == ${sources.length}`,
    '',
    '* 1. Hitung Metrik Pemeringkatan Utama (MAE, RMSE, |MBE|) pada Sampel Lengkap',
    ...compSources.map((cs, idx) => {
      const cv = varMap.get(cs.id)!;
      const j = idx + 1;
      return `gen double err_${j} = ${cv} - ${refStataVar}\ngen double ae_${j} = abs(err_${j})\ngen double se_${j} = err_${j}^2`;
    }),
    `tabstat ${compSources.map((_, i) => `ae_${i + 1}`).join(' ')}, stat(n mean sd p50 iqr) columns(statistics)`,
    '',
    '* 2. Sensitivitas Leave-One-City-Out (LOCO): Uji Ketahanan Peringkat Saat 1 Kota Dikeluarkan',
    'levelsof city_id, local(city_list)',
    'foreach g of local city_list {',
    '    display "--- Leave-One-City-Out: Tanpa City ID = `g\' ---"',
    `    tabstat ${compSources.map((_, i) => `ae_${i + 1}`).join(' ')} if city_id != \`g', stat(mean) columns(statistics)`,
    '}',
    '',
    '* 3. Sensitivitas Skala: Bandingkan Peringkat pada Skala Fisik Asli vs Skala Logaritmik ln(1+X)',
    ...compSources.map((cs, idx) => {
      const cv = varMap.get(cs.id)!;
      const j = idx + 1;
      return `gen double ae_log_${j} = abs(ln(1 + max(0, ${cv})) - ln(1 + max(0, ${refStataVar})))`;
    }),
    `tabstat ${compSources.map((_, i) => `ae_log_${i + 1}`).join(' ')}, stat(n mean sd p50) columns(statistics)`,
    'restore'
  ].join('\n');

  const step8Interpretations: FivePointInterpretationItem[] = [];
  if (fitResult) {
    const rk = fitResult.ranking;
    step8Interpretations.push({
      title: `Status Konklusif & Keputusan Akhir Pemeringkatan`,
      nilai: `Status = ${rk.conclusivenessStatus} | Sumber Terbaik = ${rk.bestSourceLabel || 'Tidak Ditetapkan (Inkonklusif)'}.`,
      artinya: rk.rankingSummary,
      caraMembaca:
        'Sistem hanya menobatkan satu pemenang tunggal (`TERBUKTI_BERBEDA_SIGNIFIKAN`) apabila peringkat #1 memiliki MAE terendah, mengungguli #2 secara signifikan (p < 0.05), bebas konflik metrik (RMSE/CCC/Outlier), dan menggunakan referensi yang valid.',
      implikasi:
        rk.isConclusive
          ? `${rk.bestSourceLabel} dapat direkomendasikan sebagai instrumen pembanding yang paling mendekati sumber referensi ${rk.referenceSourceLabel}.`
          : 'Peneliti harus melaporkan hasil secara jujur bahwa bukti statistik belum konklusif atau terdapat trade-off antarmetrik.',
      batasan: rk.methodologicalCaveat
    });

    rk.ranks.forEach(r => {
      step8Interpretations.push({
        title: `Peringkat #${r.rank} — ${r.sourceLabel}`,
        nilai: `MAE = ${r.mae.toFixed(3)} ${unitNote} | RMSE = ${r.rmse.toFixed(3)} | MBE = ${r.mbe >= 0 ? '+' : ''}${r.mbe.toFixed(3)} | Lin CCC = ${r.ccc.toFixed(4)} | ΔMAE vs #1 = +${r.diffFromTopMae.toFixed(3)} (WildBoot p = ${r.pValueVsTopWildBootstrap !== null ? r.pValueVsTopWildBootstrap.toFixed(4) : '-'}).`,
        artinya: r.rankNote,
        caraMembaca:
          'Peringkat diurutkan murni berdasarkan MAE terendah pada sampel Complete-Case tanpa skor komposit buatan, lalu diuji signifikansi selisihnya terhadap peringkat #1.',
        implikasi:
          r.rank === 1
            ? `${r.sourceLabel} menempati posisi teratas dengan rata-rata kesalahan absolut terkecil terhadap referensi.`
            : r.isStatisticallyIndistinguishableFromTop
              ? `Meskipun berada di peringkat #${r.rank}, akurasi ${r.sourceLabel} secara statistik tidak berbeda signifikan dari peringkat #1 (p >= 0.05).`
              : `${r.sourceLabel} memiliki kesalahan absolut yang lebih besar secara signifikan dibandingkan peringkat #1.`,
        batasan:
          'Urutan peringkat berlaku spesifik pada domain kota, rentang tahun, dan sumber referensi yang dianalisis.'
      });
    });

    step8Interpretations.push({
      title: 'Analisis Sensitivitas Leave-One-City-Out (LOCO) & Multi-Skenario',
      nilai: `Konsistensi Peringkat #1 LOCO = ${loco.consistencyPct.toFixed(1)}% (${loco.rows.filter(x => x.rankConsistentWithFull).length}/${loco.rows.length} kota) | Konsistensi Skala & Trimmed = ${fitResult.diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'Berubah' : 'Stabil'}.`,
      artinya: loco.summary,
      caraMembaca:
        'Konsistensi 100% berarti mengeluarkan kota mana pun satu per satu dari dataset tidak pernah mengubah sumber pemenang peringkat #1.',
      implikasi:
        loco.consistencyPct >= 90
          ? 'Kesimpulan pemeringkatan memiliki validitas internal lintas-wilayah yang tinggi.'
          : 'Kesimpulan peringkat sensitif terhadap keberadaan kota tertentu di dalam sampel.',
      batasan:
        'Uji Leave-One-City-Out mengevaluasi stabilitas internal sampel, bukan generalisasi otomatis ke negara atau rezim regulasi yang berbeda.'
    });
  }

  const robustnessSummary: RobustnessSensitivitySummary = {
    leaveOneCityOutRows: loco.rows,
    locoConsistencyPct: loco.consistencyPct,
    locoSummary: loco.summary,
    ccVsAvailableSummary: fitResult?.metrics.some(m => m.missingGapVsComplete > 0)
      ? 'Terdapat selisih ukuran sampel antara Complete-Case dan Available-Case; periksa konsistensi MAE pada kedua tabel Step 5.'
      : `Seluruh sumber memiliki ukuran sampel identik (N_CC = N_Avail = ${qualityReport.nCompleteCasePairs}), sehingga tidak ada bias kehilangan data parsial.`,
    scaleTransformationSummary: `Evaluasi multi-skenario Step 3 membandingkan 4 spesifikasi (Satuan Asli, Winsorized 2.5%, Log(1+x), dan Log+Winsor); rekomendasi terbaik: ${recCandidate?.label || 'Satuan Fisik Asli'}.`,
    outlierTrimmedSummary:
      fitResult?.diagnostics.outlierSensitivityAudit.summary ||
      'Audit Trimmed MAE 95% mengevaluasi ketahanan urutan peringkat terhadap 5% nilai galat terbesar.'
  };

  const step8Bundle: StepStataDocumentationBundle = {
    stepId: 8,
    stepTitle: 'Step 8 — Comparative Source Ranking & Robustness Sensitivity Analysis',
    analysisPurpose: {
      whatIsAnalyzed:
        'Pemeringkatan sumber pembanding berbasis MAE (didukung RMSE, |MBE|, Lin\'s CCC, lebar LoA, dan signifikansi Pair FE) serta uji ketahanan (*robustness*) Leave-One-City-Out (LOCO), Complete-Case vs Available-Case, dan skala asli vs transformasi.',
      whyRequired:
        'Mencegah klaim kemenangan semu apabila selisih MAE antarsumber tidak signifikan, bertentangan dengan RMSE/CCC, atau hanya didorong oleh satu kota pencilan.',
      statisticalQuestionAnswered:
        'Sumber pengukuran mana yang terbukti paling akurat secara signifikan dan apakah kesimpulan tersebut tahan terhadap perubahan asumsi serta penghapusan satu per satu kota?'
    },
    stataCode: step8Code,
    dependenciesNote: 'Menggunakan perintah bawaan Stata (`levelsof`, `foreach`, `tabstat`) tanpa ketergantungan eksternal.',
    commandUsages: [
      {
        command: 'tabstat ae_1 ae_2 ..., stat(n mean sd p50 iqr)',
        functionSummary: 'Menyusun tabel perbandingan langsung rata-rata dan median kesalahan absolut seluruh sumber pembanding.',
        reasonUsed: 'Menetapkan urutan peringkat berbasis MAE pada sampel Complete-Case yang sama.',
        linkToStepGoal: 'Menghasilkan urutan kandidat peringkat #1 hingga #K.'
      },
      {
        command: 'levelsof city_id, local(city_list) & foreach g of local city_list',
        functionSummary: 'Menjalankan pengulangan *jackknife* Leave-One-City-Out dengan menghitung ulang MAE tanpa kota ke-$g$.',
        reasonUsed: 'Menguji apakah peringkat #1 berubah ketika salah satu kota dikeluarkan dari analisis.',
        linkToStepGoal: 'Membuktikan ketahanan (*robustness*) peringkat terhadap dominasi satu kota.'
      },
      {
        command: 'gen double ae_log_j = abs(ln(1 + X_j) - ln(1 + X_ref))',
        functionSummary: 'Menghitung kesalahan absolut pada skala logaritmik proporsional sebagai pembanding sensitivitas.',
        reasonUsed: 'Memeriksa apakah urutan peringkat tetap konsisten pada skala proporsional/persentase.',
        linkToStepGoal: 'Melengkapi analisis sensitivitas spesifikasi skala.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Status Konklusif Pemeringkatan (4-Way Conclusiveness Status)',
        statisticalDefinition: 'Klasifikasi keputusan akhir ke dalam `TERBUKTI_BERBEDA_SIGNIFIKAN`, `PERBEDAAN_TIDAK_SIGNIFIKAN`, `KONFLIK_ANTAR_METRIK`, atau `REFERENSI_TIDAK_VALID`.',
        unit: 'Status Keputusan',
        researchFunction: 'Menjaga kejujuran ilmiah agar tidak memaksakan satu pemenang saat bukti statistik lemah atau saling bertentangan.',
        keyValueToWatch: fitResult?.ranking.conclusivenessStatus || '-',
        goodVsWarningCondition: 'Konklusif hanya jika TERBUKTI_BERBEDA_SIGNIFIKAN; tiga status lainnya wajib dilaporkan apa adanya beserta alasannya.'
      },
      {
        outputName: 'Leave-One-City-Out (LOCO) Consistency Rate',
        statisticalDefinition: 'Persentase iterasi jackknife lintas-kota yang menghasilkan sumber peringkat #1 yang sama dengan sampel penuh.',
        unit: 'Persentase (%)',
        researchFunction: 'Mengukur stabilitas peringkat terhadap penghapusan entitas kota individual.',
        keyValueToWatch: `${loco.consistencyPct.toFixed(1)}% konsisten`,
        goodVsWarningCondition: 'Sangat kokoh jika 100%; waspada jika < 80% (peringkat bergantung pada 1–2 kota tertentu).'
      }
    ],
    structuredInterpretations: step8Interpretations,
    stepConclusion: {
      decisionSummary: fitResult
        ? `Keputusan Step 8: ${fitResult.ranking.conclusivenessStatus}. Konsistensi Leave-One-City-Out = ${loco.consistencyPct.toFixed(1)}%.`
        : 'Menunggu hasil pemeringkatan.',
      readinessStatus: fitResult?.ranking.isConclusive ? 'LAYAK DILANJUTKAN' : 'LAYAK DENGAN CATATAN',
      warnings: fitResult && !fitResult.ranking.isConclusive ? [fitResult.ranking.rankingSummary] : []
    },
    robustnessSummary
  };

  // ============================================================
  // STEP 9: FINAL RESULTS, REPRODUCIBLE SCRIPTS (.do, .R, .stan) & EXPORT
  // ============================================================
  const step9Interpretations: FivePointInterpretationItem[] = [];
  if (fitResult) {
    const top = fitResult.ranking.ranks[0];
    step9Interpretations.push({
      title: 'Sintesis Akhir Evaluasi Akurasi Pengukuran Panel',
      nilai: `Referensi: ${fitResult.referenceSource.name} (${fitResult.referenceSource.label}) | Peringkat #1: ${top?.sourceLabel || '-'} (MAE = ${top?.mae.toFixed(3) || '-'} ${unitNote}, RMSE = ${top?.rmse.toFixed(3) || '-'}, CCC = ${top?.ccc.toFixed(4) || '-'}) | Status: ${fitResult.ranking.conclusivenessStatus}.`,
      artinya: fitResult.ranking.rankingSummary,
      caraMembaca:
        'Gabungkan bukti dari Tabel Metrik Akurasi (Step 5), Uji Inferensial Pair FE & Wild Bootstrap (Step 6), Diagnostik & Sensitivitas (Step 7–8) untuk menyusun kesimpulan akhir penelitian.',
      implikasi:
        'Seluruh tabel bergaya Stata, grafik interaktif, narasi akademis, serta berkas kode reproduksi (`.do`, `.R`, `.stan`) dan laporan (`.pdf`, `.docx`, `.xlsx`, `.csv`) telah tersinkronisasi penuh dengan konfigurasi aktif.',
      batasan: fitResult.ranking.methodologicalCaveat
    });
  }

  const step9Bundle: StepStataDocumentationBundle = {
    stepId: 9,
    stepTitle: 'Step 9 — Final Results, Master Reproducible Code (.do / .R / .stan) & Export',
    analysisPurpose: {
      whatIsAnalyzed:
        'Integrasi menyeluruh hasil Step 1 hingga Step 8 ke dalam tabel bergaya Stata, visualisasi publikasi, interpretasi akademis terstruktur, dan berkas kode reproduksi utuh (`.do`, `.R`, `.stan`).',
      whyRequired:
        'Memastikan transparansi ilmiah dan reproduksibilitas penuh (*reproducible research*) sehingga peneliti atau penguji dapat menjalankan ulang seluruh tahapan di Stata maupun R/Stan dengan hasil yang konsisten.',
      statisticalQuestionAnswered:
        'Bagaimana merangkum, memvisualisasikan, dan mereproduksi seluruh bukti statistik evaluasi akurasi pengukuran emisi CO₂ secara utuh dan dapat diaudit?'
    },
    stataCode: fitResult?.generatedCode.stataDoFile || step6Code,
    companionRCode: fitResult?.generatedCode.rScript || '',
    companionStanCode: step5CompanionStan,
    dependenciesNote: 'Skrip master `.do` menggabungkan Step 1 s/d Step 8 (`concord`, `boottest`, `xtserial`, `xttest3`, `xtcsd`). Skrip `.R` menggunakan `fixest`, `clubSandwich`, `DescTools`, dan `boot`. Skrip `.stan` disediakan untuk pemodelan faktor laten pendamping via `rstan`/`cmdstanr`.',
    commandUsages: [
      {
        command: 'Master Stata Do-File (.do) — End-to-End Pipeline',
        functionSummary: 'Menjalankan rangkaian utuh mulai dari impor data, validasi panel, korelasi, metrik akurasi, Pair FE, Wild Bootstrap, hingga sensitivitas LOCO.',
        reasonUsed: 'Menjamin setiap tabel yang tampil di aplikasi dapat direproduksi satu-per-satu di Stata.',
        linkToStepGoal: 'Menyediakan dokumentasi kode siap lampiran skripsi/tesis/jurnal.'
      },
      {
        command: 'Master R Script (.R) & Companion Stan (.stan)',
        functionSummary: 'Mereproduksi estimasi Pair FE (`fixest::feols`), Cluster SE (`clubSandwich`), Lin\'s CCC, serta model faktor laten Bayesian.',
        reasonUsed: 'Memberikan verifikasi lintas-lingkungan komputasi terbuka (R & Stan) di samping Stata.',
        linkToStepGoal: 'Memenuhi standar reproduksibilitas multi-perangkat lunak.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Paket Laporan & Skrip Reproduksi (.pdf, .docx, .xlsx, .csv, .do, .R, .stan)',
        statisticalDefinition: 'Kumpulan keluaran tabel statistik, grafik, interpretasi poin-per-poin, dan kode sumber analisis.',
        unit: 'Dokumen & Kode Sumber',
        researchFunction: 'Dokumentasi resmi hasil analisis untuk pelaporan akademik dan audit replikasi.',
        keyValueToWatch: 'Kesesuaian nama variabel, sumber referensi, dan status konklusif di seluruh format ekspor',
        goodVsWarningCondition: 'Pastikan selalu mengunduh ulang berkas ekspor setelah mengganti sumber referensi atau opsi prapemrosesan.'
      }
    ],
    structuredInterpretations: step9Interpretations,
    stepConclusion: {
      decisionSummary: fitResult
        ? `Seluruh rangkaian 9 Step selesai dieksekusi dengan status akhir ${fitResult.ranking.conclusivenessStatus}. Kode reproduksi (.do, .R, .stan) dan 5 format ekspor siap diunduh.`
        : 'Menunggu hasil analisis lengkap.',
      readinessStatus: 'LAYAK DILANJUTKAN',
      warnings: []
    },
    robustnessSummary
  };

  return {
    1: step1Bundle,
    2: step2Bundle,
    3: step3Bundle,
    4: step4Bundle,
    5: step5Bundle,
    6: step6Bundle,
    7: step7Bundle,
    8: step8Bundle,
    9: step9Bundle
  };
}
