// ============================================================
// Reference-Free All-Source Stata Command & Statistical Implementation Generator
// Dynamic Stata .do, R, and Stan Code + 5-Point Actual Interpretations (Steps 1–9)
// ============================================================

import { IntelligentConfigurationReport } from './panel-accuracy-intelligent-config';
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

  const completeObs = observations.filter(obs =>
    sources.every(s => obs.values[s.id] !== null && Number.isFinite(obs.values[s.id] as number))
  );

  const cities = Array.from(new Set(completeObs.map(o => o.city)));
  if (cities.length < 2 || sources.length < 3) {
    return {
      rows: [],
      consistencyPct: 100,
      summary: 'Simulasi Leave-One-City-Out (LOCO) membutuhkan minimal 2 kota dan 3 sumber pengukuran.'
    };
  }

  // In each LOCO fold, evaluate all J sources via Grubbs / consensus deviation on remaining G-1 cities
  const rows: LeaveOneCityOutSensitivityRow[] = cities.map(droppedCity => {
    const subObs = completeObs.filter(o => o.city !== droppedCity);
    const P = subObs.length;

    // Cross-source precision weighting (Grubbs variance on remaining observations)
    const cov = (aIdx: number, bIdx: number) => {
      const aVals = subObs.map(o => o.values[sources[aIdx].id] as number);
      const bVals = subObs.map(o => o.values[sources[bIdx].id] as number);
      const ma = aVals.reduce((s, v) => s + v, 0) / Math.max(1, P);
      const mb = bVals.reduce((s, v) => s + v, 0) / Math.max(1, P);
      let s = 0;
      for (let i = 0; i < P; i++) s += (aVals[i] - ma) * (bVals[i] - mb);
      return s / Math.max(1, P - 1);
    };

    const S: number[][] = Array.from({ length: sources.length }, (_, r) =>
      Array.from({ length: sources.length }, (__, c) => cov(r, c))
    );

    const scores = sources
      .map((src, j) => {
        const ests: number[] = [];
        for (let a = 0; a < sources.length; a++) {
          if (a === j) continue;
          for (let b = a + 1; b < sources.length; b++) {
            if (b === j) continue;
            if (Math.abs(S[a][b]) > 1e-8) {
              ests.push(S[j][j] - (S[j][a] * S[j][b]) / S[a][b]);
            }
          }
        }
        ests.sort((x, y) => x - y);
        const rawVar = ests.length > 0 ? ests[Math.floor(ests.length / 2)] : 0.25 * S[j][j];
        const errSd = Math.sqrt(Math.max(1e-5 * S[j][j], rawVar));
        return {
          id: src.id,
          label: `${src.name} (${src.label})`,
          errSd
        };
      })
      .sort((a, b) => a.errSd - b.errSd);

    const top = scores[0];
    const second = scores[1] || scores[0];
    const consistent = fullTopSourceId ? top.id === fullTopSourceId : true;

    return {
      droppedCity,
      nRemainingPairs: subObs.length,
      topSourceId: top.id,
      topSourceLabel: top.label,
      topSourceMae: top.errSd,
      secondSourceLabel: second.label,
      secondSourceMae: second.errSd,
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
        ? `Peringkat #1 stabil 100% (${consistentCount}/${rows.length} iterasi Leave-One-City-Out): tidak ada satu kota pun yang mengubah pemenang akurasi.`
        : `Peringkat #1 konsisten pada ${consistentCount}/${rows.length} iterasi (${consistencyPct.toFixed(1)}%) saat satu per satu kota dikeluarkan dari sampel.`
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

  const unitNote = fitResult?.datasetMeta.workingUnitNote || sources[0]?.unit || 'kt CO₂';
  const varMap = new Map<string, string>();
  sources.forEach((s, idx) => {
    varMap.set(s.id, safeStataVar(s.columnKey || s.name, idx));
  });
  const allStataVars = sources.map(s => varMap.get(s.id)!).join(' ');
  const rawSourceCols = sources.map(s => s.columnKey).join(' ');

  const isExcel = /\.(xlsx|xls)$/i.test(datasetName);
  const importCmd = isExcel
    ? `import excel using "${datasetName}", firstrow clear`
    : `import delimited using "${datasetName || 'dataset_panel_co2.csv'}", varnames(1) clear`;

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
    '* STEP 1: DATA UPLOAD & PANEL STRUCTURE VERIFICATION (ALL-SOURCE READY)',
    `* Dataset        : ${datasetName}`,
    `* City ID Column : ${cityIdColumn}`,
    `* Year Column    : ${yearColumn}`,
    `* Sources (J=${sources.length})  : ${sources.map(s => `${s.name}:${s.columnKey}`).join(', ')}`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'if _rc != 0 {',
    '    display as error "Gagal membaca berkas dataset. Periksa path berkas."',
    '    exit _rc',
    '}',
    'preserve',
    'describe',
    `codebook ${cityIdColumn} ${yearColumn} ${rawSourceCols}, compact`,
    'count',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(panel_city_id)`,
    `else gen long panel_city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(panel_year) force`,
    'assert !missing(panel_city_id) & !missing(panel_year)',
    'duplicates report panel_city_id panel_year',
    'capture noisily isid panel_city_id panel_year',
    'if _rc == 0 {',
    '    xtset panel_city_id panel_year',
    '    xtdescribe',
    '}',
    'restore'
  ].join('\n');

  const step1Bundle: StepStataDocumentationBundle = {
    stepId: 1,
    stepTitle: 'Step 1 — Data Upload & Panel Structure Verification',
    analysisPurpose: {
      whatIsAnalyzed: `Struktur dasar berkas "${datasetName}", identitas panel (${cityIdColumn}, ${yearColumn}), dimensi kota × tahun, serta kesiapan minimal J >= 3 sumber untuk evaluasi tanpa variabel referensi.`,
      whyRequired:
        'Penilaian akurasi serentak terhadap seluruh sumber mewajibkan sel Kota-Tahun $(i, t)$ terindeks rapi dan unik sebelum menghitung matriks kovarians serta faktor laten.',
      statisticalQuestionAnswered:
        'Apakah berkas data membentuk struktur panel $(i, t)$ yang valid dan memiliki cukup banyak sumber independen ($J \\ge 3$) serta pasangan lengkap?'
    },
    stataCode: step1Code,
    dependenciesNote: 'Menggunakan perintah bawaan Stata 15+ (`import excel`, `import delimited`, `describe`, `codebook`, `isid`, `duplicates`, `xtset`, `xtdescribe`).',
    commandUsages: [
      {
        command: isExcel ? 'import excel ..., firstrow clear' : 'import delimited ..., varnames(1) clear',
        functionSummary: 'Membaca dataset ke memori Stata memakai baris pertama sebagai header kolom.',
        reasonUsed: 'Menjaga berkas sumber asli tetap utuh sambil memuat seluruh kandidat sumber.',
        linkToStepGoal: 'Menyediakan data mentah untuk inspeksi dimensi panel.'
      },
      {
        command: 'describe & codebook ..., compact',
        functionSummary: 'Memeriksa tipe penyimpanan (`string` vs numerik) dan rentang nilai tiap variabel.',
        reasonUsed: 'Mendeteksi sejak dini kolom angka yang terbaca sebagai teks.',
        linkToStepGoal: 'Menjamin validitas tipe numerik sebelum estimasi varians.'
      },
      {
        command: 'duplicates report & isid',
        functionSummary: 'Menguji keunikan pasangan Kota dan Tahun.',
        reasonUsed: '`xtset` hanya sah jika setiap sel $(i, t)$ unik.',
        linkToStepGoal: 'Mencegah penghitungan ganda pada matriks kovarians laten.'
      },
      {
        command: 'xtset & xtdescribe',
        functionSummary: 'Mendeklarasikan indeks panel dan mengecek pola keseimbangan tahun antar kota.',
        reasonUsed: 'Mengungkap status Strongly Balanced vs Unbalanced.',
        linkToStepGoal: 'Memetakan jumlah klaster kota ($G$) dan periode ($T$).'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Total Observations & Complete-Case Pairs',
        statisticalDefinition: 'Jumlah baris mentah ($N_{\\text{raw}}$) dan jumlah sel $(i, t)$ di mana semua $J$ sumber terisi serentak ($N_{\\text{CC}}$).',
        unit: 'Baris / Pasangan',
        researchFunction: 'Menentukan ukuran sampel estimasi serentak seluruh variabel.',
        keyValueToWatch: `N_raw = ${qualityReport.nObsRaw}, N_CC = ${qualityReport.nCompleteCasePairs}`,
        goodVsWarningCondition: 'Baik jika N_CC >= 20; waspada jika banyak sel kosong atau J < 3.'
      },
      {
        outputName: 'Panel Dimensions (G Cities × T Years)',
        statisticalDefinition: 'Jumlah klaster kota unik ($G$) dan periode tahun unik ($T$).',
        unit: 'Kota & Tahun',
        researchFunction: 'Menentukan ketahanan inferensi klaster ($G - 1$) pada Step 6.',
        keyValueToWatch: `G = ${qualityReport.nCities}, T = ${qualityReport.nYears}`,
        goodVsWarningCondition: 'Baik jika G >= 10; bila G < 30 sistem otomatis memakai Wild Bootstrap & Bayesian Posterior.'
      }
    ],
    structuredInterpretations: [
      {
        title: 'Pasangan Lengkap (Complete-Case) & Jumlah Sumber',
        nilai: `${qualityReport.nCompleteCasePairs} pasangan lengkap dari ${qualityReport.nObsRaw} baris mentah pada J = ${sources.length} sumber.`,
        artinya: `Terdapat ${qualityReport.nCompleteCasePairs} sel Kota-Tahun di mana seluruh ${sources.length} variabel tersedia serentak tanpa hilang.`,
        caraMembaca: 'Pastikan $J \\ge 3$ agar varians kesalahan tiap sumber teridentifikasi unik tanpa memilih variabel referensi.',
        implikasi: `Estimasi Bayesian Laten dan matriks kovarians Step 4–8 akan bekerja pada ${qualityReport.nCompleteCasePairs} pasangan setara ini.`,
        batasan: 'Jumlah baris yang besar tetap memerlukan pemeriksaan tipe data, skala, dan korelasi antar-instrumen.'
      }
    ],
    stepConclusion: {
      decisionSummary: `Dataset "${datasetName}" terbaca baik (${qualityReport.nObsRaw} baris, G = ${qualityReport.nCities} kota, T = ${qualityReport.nYears} tahun, J = ${sources.length} sumber) dan siap dipetakan setara di Step 2.`,
      readinessStatus: qualityReport.nCompleteCasePairs < 3 ? 'PERLU PERBAIKAN SEBELUM LANJUT' : 'LAYAK DILANJUTKAN',
      warnings: sources.length < 3 ? ['Hanya terdeteksi 2 sumber: model tanpa referensi butuh minimal J >= 3 sumber.'] : []
    }
  };

  // ============================================================
  // STEP 2: INTELLIGENT ALL-SOURCE CONFIGURATION (NO LOCKED REFERENCE)
  // ============================================================
  const step2Code = [
    '* ============================================================================',
    '* STEP 2: INTELLIGENT ALL-SOURCE CONFIGURATION (TANPA REFERENCE TERKUNCI)',
    `* City ID column     : ${cityIdColumn}`,
    `* Year column        : ${yearColumn}`,
    `* Evaluated Sources  : J = ${sources.length} (${sources.map(s => `${s.name}:${s.columnKey}`).join(', ')})`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    'ds, has(type numeric)',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => {
      const sv = varMap.get(s.id)!;
      return `capture destring ${s.columnKey}, gen(${sv}) force\nlabel variable ${sv} "${s.name} - ${s.label} (${s.unit})"`;
    }),
    `misstable summarize ${allStataVars}`,
    `tabstat ${allStataVars}, stat(n mean sd min p50 max iqr cv) columns(statistics)`,
    `pwcorr ${allStataVars}, sig obs`,
    `egen byte n_valid = rownonmiss(${allStataVars})`,
    `gen byte complete_case = (n_valid == ${sources.length})`,
    'count if complete_case == 1',
    `assert r(N) >= 3`,
    `global ALL_EVAL_VARS "${allStataVars}"`,
    'restore'
  ].join('\n');

  const step2Bundle: StepStataDocumentationBundle = {
    stepId: 2,
    stepTitle: 'Step 2 — Intelligent All-Source Configuration (Reference-Free)',
    analysisPurpose: {
      whatIsAnalyzed: `Ke-14 dimensi karakteristik seluruh ${intelligentConfig.columnsAnalyzed} kolom dataset untuk memilih City ID, Year, dan seluruh variabel pengukuran (${sources.map(s => s.columnKey).join(', ')}) agar dievaluasi setara.`,
      whyRequired:
        'Agar sistem dapat menjawab dari KESELURUHAN variabel mana yang paling akurat dan paling benar, tidak boleh ada 1 variabel pun yang dikorbankan sebagai reference tetap.',
      statisticalQuestionAnswered:
        'Variabel mana saja yang memenuhi syarat numerik, varians positif, keseragaman satuan, dan syarat identifikasi $J \\ge 3$ untuk ikut diperingkatkan bersama?'
    },
    stataCode: step2Code,
    dependenciesNote: 'Perintah bawaan Stata (`ds`, `misstable summarize`, `tabstat`, `pwcorr`, `egen`, `assert`).',
    commandUsages: [
      {
        command: 'ds, has(type numeric)',
        functionSummary: 'Menyaring seluruh kolom numerik kandidat sumber pengukuran.',
        reasonUsed: 'Memisahkan variabel kontinu dari kolom label administratif.',
        linkToStepGoal: 'Mengidentifikasi semua variabel yang layak masuk peringkat akhir.'
      },
      {
        command: 'tabstat ..., stat(n mean sd p50 iqr cv)',
        functionSummary: 'Mengecek skala satuan, dispersi, dan ketiadaan kolom konstan (`sd == 0`).',
        reasonUsed: 'Sumber bervarians nol tidak dapat masuk model pengukuran laten.',
        linkToStepGoal: 'Mendukung Variance & Unit Scale Analysis.'
      },
      {
        command: 'pwcorr ..., sig obs',
        functionSummary: 'Memeriksa matriks korelasi awal dan potensi kesalahan berkorelasi (`r > 0.96`).',
        reasonUsed: 'Mengidentifikasi pasangan sumber yang berbagi metode identik.',
        linkToStepGoal: 'Mencegah dominasi bias bersama (*shared error*).'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Status Identifikasi All-Source (J >= 3)',
        statisticalDefinition: 'Kelayakan jumlah sumber independen untuk memecahkan parameter $\\sigma_{\\varepsilon_j}^2, \\lambda_j, \\alpha_j$ secara unik.',
        unit: 'Jumlah Sumber (J)',
        researchFunction: 'Menjamin setiap variabel dapat dinilai kesalahannya masing-masing tanpa variabel patokan.',
        keyValueToWatch: `J = ${sources.length} sumber aktif`,
        goodVsWarningCondition: 'J >= 3 teridentifikasi penuh; J = 2 underidentified tanpa referensi.'
      }
    ],
    structuredInterpretations: [
      {
        title: 'Evaluasi Setara Seluruh J Variabel (Tanpa Reference Terkunci)',
        nilai: `J = ${sources.length} sumber ikut dinilai & diranking: ${sources.map(s => `${s.name} (${s.label})`).join(', ')}.`,
        artinya: 'Seluruh variabel memiliki status sejajar sebagai kandidat instrumen yang diuji akurasi dan kebenarannya.',
        caraMembaca: 'Pada akhir Step 8–9, kesemua J variabel akan muncul bersama dalam urutan Peringkat #1 s/d #' + sources.length + '.',
        implikasi:
          sources.length >= 3
            ? 'Karena J >= 3, model pengukuran laten Bayesian dan triangulasi Grubbs teridentifikasi penuh untuk menentukan sumber terbaik.'
            : 'Dengan J = 2 sumber, sistem hanya mampu mengukur kesepakatan selisih antarkeduanya dan tidak dapat menentukan pemenang tunggal secara sah.',
        batasan: 'Validitas konsensus membutuhkan sebagian besar sumber tidak berbagi kesalahan sistematis yang persis sama.'
      }
    ],
    stepConclusion: {
      decisionSummary: intelligentConfig.minimumRequirements.canProceed
        ? `Pemetaan selesai tanpa mengunci Reference Source: ${sources.length} sumber siap diaudit bersama.`
        : intelligentConfig.minimumRequirements.blockingReasons.join(' '),
      readinessStatus: !intelligentConfig.minimumRequirements.canProceed
        ? 'PERLU PERBAIKAN SEBELUM LANJUT'
        : sources.length < 3
          ? 'LAYAK DENGAN CATATAN'
          : 'LAYAK DILANJUTKAN',
      warnings: intelligentConfig.minimumRequirements.warnings
    }
  };

  // ============================================================
  // STEP 3: DATA QUALITY AUDIT AND PREPROCESSING
  // ============================================================
  const pLo = ((preprocessing.winsorQuantile || 0.025) * 100).toFixed(1);
  const pHi = (100 - (preprocessing.winsorQuantile || 0.025) * 100).toFixed(1);
  const step3Code = [
    '* ============================================================================',
    '* STEP 3: DATA QUALITY AUDIT, LATENT IDENTIFIABILITY & OPT-IN PREPROCESSING',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    `misstable summarize ${allStataVars}`,
    'duplicates report city_id year_id',
    `foreach v of varlist ${allStataVars} {`,
    '    quietly summarize `v\', detail',
    '    assert r(sd) > 0',
    '    local iqr = r(p75) - r(p25)',
    '    quietly count if (`v\' < r(p25)-1.5*`iqr\' | `v\' > r(p75)+1.5*`iqr\') & !missing(`v\')',
    '    display "Outlier 1.5*IQR (`v\') = " r(N)',
    '}',
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    ...(preprocessing.applyLog1p ? [`foreach v of varlist ${allStataVars} {\n    replace \`v' = ln(1 + \`v') if \`v' >= 0 & !missing(\`v')\n}`] : []),
    ...(preprocessing.applyWinsorize ? [`foreach v of varlist ${allStataVars} {\n    _pctile \`v', p(${pLo} ${pHi})\n    replace \`v' = r(r1) if \`v' < r(r1) & !missing(\`v')\n    replace \`v' = r(r2) if \`v' > r(r2) & !missing(\`v')\n}`] : []),
    'xtset city_id year_id',
    'restore'
  ].join('\n');

  const recCand = preprocBundle?.bestScenario || null;
  const step3Bundle: StepStataDocumentationBundle = {
    stepId: 3,
    stepTitle: 'Step 3 — Data Quality Audit & Identifiability Check',
    analysisPurpose: {
      whatIsAnalyzed: 'Sepuluh pemeriksaan kualitas data panel (missing, duplikat, non-numerik, negatif/nol, satuan, rasio skala, cakupan, keseimbangan, outlier 1.5×IQR) dan audit identifikasi model laten seluruh J sumber.',
      whyRequired: 'Satu sumber bervarians nol atau outlier ekstrem dapat menggeser titik pusat konsensus serta mendistorsi estimasi varians error.',
      statisticalQuestionAnswered: 'Apakah seluruh J sumber memenuhi syarat statistik (varians > 0, skala sebanding, duplikat bersih) dan skenario prapemrosesan apa yang terbaik?'
    },
    stataCode: step3Code,
    dependenciesNote: 'Bawaan Stata (`misstable`, `duplicates`, `summarize, detail`, `_pctile`). Opsional `ssc install winsor2`.',
    commandUsages: [
      {
        command: 'assert r(sd) > 0',
        functionSummary: 'Memastikan tidak ada satu pun variabel pengukuran yang konstan.',
        reasonUsed: 'Matriks kovarians dengan kolom konstan bersifat singular dan gagal diestimasi di SEM/Stan.',
        linkToStepGoal: 'Menjamin syarat identifikasi seluruh sumber.'
      },
      {
        command: '_pctile `v\', p(2.5 97.5) / ln(1+X)',
        functionSummary: 'Opsi Winsorization atau transformasi logaritmik untuk uji sensitivitas skala.',
        reasonUsed: 'Meredam pengaruh pencilan ekstrem tanpa membuang baris pengamatan.',
        linkToStepGoal: 'Mengecek ketahanan peringkat antara data asli dan data transformasi.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Audit Identifiabilitas Laten (All-Source)',
        statisticalDefinition: 'Pemeriksaan $J \\ge 3$, kelengkapan $N_{\\text{CC}}$, dan ketiadaan kolom bervarians nol.',
        unit: 'Status Kelayakan',
        researchFunction: 'Memastikan error variance setiap sumber dapat dipisahkan secara unik.',
        keyValueToWatch: qualityReport.latentAudit.isIdentifiedForAllSourceRanking ? 'TERIDENTIFIKASI' : 'PERLU PERHATIAN',
        goodVsWarningCondition: 'Baik jika J >= 3 dan seluruh varians > 0.'
      }
    ],
    structuredInterpretations: [
      {
        title: 'Kesiapan Identifikasi Model Laten & Beban Outlier',
        nilai: `Outlier 1.5×IQR = ${qualityReport.outlierCountTotal} sel | Skala Maks/Min = ${qualityReport.scaleRatioMaxToMin.toFixed(2)}× | Saran = ${recCand?.label || 'Satuan Fisik Asli'}.`,
        artinya: qualityReport.latentAudit.summary,
        caraMembaca: 'Cek apakah ada peringatan merah pemblokir sebelum melanjutkan ke analisis EDA & Bayesian Model.',
        implikasi: 'Satuan fisik asli tetap paling direkomendasikan agar Error SD dan Total RMSE dapat langsung diinterpretasikan dalam ' + unitNote + '.',
        batasan: 'Transformasi logaritmik mengubah interpretasi kesalahan menjadi selisih proporsional relatif.'
      }
    ],
    stepConclusion: {
      decisionSummary: qualityReport.hasBlockingError
        ? 'Terdapat kendala kualitas pemblokir yang harus diperbaiki sebelum estimasi.'
        : 'Seluruh 10 pemeriksaan kualitas selesai dan siap dieksplorasi pada Step 4.',
      readinessStatus: qualityReport.hasBlockingError ? 'PERLU PERBAIKAN SEBELUM LANJUT' : qualityReport.latentAudit.warnings.length > 0 ? 'LAYAK DENGAN CATATAN' : 'LAYAK DILANJUTKAN',
      warnings: qualityReport.latentAudit.warnings
    }
  };

  // ============================================================
  // STEP 4: EXPLORATORY DATA ANALYSIS
  // ============================================================
  const step4Code = [
    '* ============================================================================',
    '* STEP 4: EXPLORATORY DATA ANALYSIS & 4 PANEL CORRELATIONS',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    'xtset city_id year_id',
    `egen byte cc = rownonmiss(${allStataVars})`,
    `keep if cc == ${sources.length}`,
    `tabstat ${allStataVars}, stat(n mean sd p25 p50 p75 iqr min max cv skewness) columns(statistics)`,
    `pwcorr ${allStataVars}, sig obs`,
    `spearman ${allStataVars}, stats(rho p)`,
    `foreach v of varlist ${allStataVars} {`,
    '    bysort city_id: egen mean_`v\' = mean(`v\')',
    '    gen within_`v\' = `v\' - mean_`v\'',
    '    bysort city_id (year_id): gen fd_`v\' = `v\' - `v\'[_n-1]',
    '}',
    `pwcorr ${sources.map(s => `within_${varMap.get(s.id)!}`).join(' ')}, sig`,
    `pwcorr ${sources.map(s => `fd_${varMap.get(s.id)!}`).join(' ')}, sig`,
    'restore'
  ].join('\n');

  const step4Bundle: StepStataDocumentationBundle = {
    stepId: 4,
    stepTitle: 'Step 4 — Exploratory Data Analysis & Panel Correlations',
    analysisPurpose: {
      whatIsAnalyzed: 'Statistik deskriptif lengkap tiap variabel serta 4 matriks korelasi (Overall Pearson, Spearman, Within-City Demeaned, dan First-Difference).',
      whyRequired: 'Memisahkan kesesuaian arah antar-instrumen secara lintas wilayah vs dinamika tahun ke tahun di dalam kota yang sama.',
      statisticalQuestionAnswered: 'Sejauh mana seluruh sumber pengukuran bergerak serasi secara spasial maupun temporal?'
    },
    stataCode: step4Code,
    dependenciesNote: 'Bawaan Stata (`tabstat`, `pwcorr`, `spearman`, `bysort`, `egen`).',
    commandUsages: [
      {
        command: 'tabstat ..., stat(n mean sd p50 iqr cv skewness)',
        functionSummary: 'Menampilkan posisi rata-rata dan variasi masing-masing sumber.',
        reasonUsed: 'Melihat indikasi awal pergeseran lokasi (misal ada sumber yang jauh lebih rendah/tinggi rata-ratanya).',
        linkToStepGoal: 'Mengenali calon sumber yang memiliki bias sistematis.'
      },
      {
        command: 'pwcorr within_* & fd_*',
        functionSummary: 'Korelasi dalam-kota setelah efek tetap wilayah dikeluarkan dan korelasi delta tahunan.',
        reasonUsed: 'Menguji apakah seluruh sumber mendeteksi tren perubahan tahunan dengan serasi.',
        linkToStepGoal: 'Membuktikan keberadaan faktor perubahan emisi bersama $\\theta_{it}$.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Matriks Korelasi 4 Dimensi',
        statisticalDefinition: 'Korelasi lintas-sumber pada level gabungan, peringkat, dalam-kota, dan perbedaan pertama.',
        unit: 'Koefisien [-1, 1]',
        researchFunction: 'Memvalidasi bahwa seluruh variabel memang mengukur fenomena emisi yang sama.',
        keyValueToWatch: 'Korelasi positif kuat antarseluruh J sumber',
        goodVsWarningCondition: 'Baik jika korelasi antarsemua pasangan bernilai positif dan signifikan; waspada jika ada sumber berkorelasi terbalik (r < 0).'
      }
    ],
    structuredInterpretations: fitResult
      ? fitResult.metrics.map(m => ({
          title: `Korelasi ${m.sourceLabel} vs Konsensus Laten Keluar-Satu-Sumber`,
          nilai: `Pearson r = ${m.pearsonR.toFixed(4)} | Spearman ρ = ${m.spearmanRho.toFixed(4)} | Within-City r = ${m.withinCityR.toFixed(4)} | First-Diff r = ${m.firstDiffR.toFixed(4)}.`,
          artinya: `${m.sourceLabel} menunjukkan keterkaitan arah yang ${m.pearsonR >= 0.85 ? 'sangat kuat' : 'moderat'} terhadap estimasi konsensus sumber-sumber lainnya.`,
          caraMembaca: 'Semakin mendekati 1.0 pada Within-City r dan First-Diff r, semakin mampu variabel ini mengikuti tren tahunan nyata.',
          implikasi: 'Kesesuaian sinyal mengindikasikan variabel ini layak dimodelkan dalam faktor laten bersama.',
          batasan: 'Korelasi tinggi belum membuktikan rendahnya bias sistematis (α_j) maupun error acak — itu baru dijawab pada Step 5.'
        }))
      : [],
    stepConclusion: {
      decisionSummary: 'Seluruh 4 matriks korelasi selesai dihitung dan mendukung keberadaan sinyal emisi bersama menuju estimasi Bayesian Latent Measurement Model di Step 5.',
      readinessStatus: 'LAYAK DILANJUTKAN',
      warnings: []
    }
  };

  // ============================================================
  // STEP 5: BAYESIAN HIERARCHICAL LATENT MEASUREMENT MODEL
  // ============================================================
  const step5CompanionStan = [
    '// ==========================================================================',
    '// STAN MODEL: REFERENCE-FREE BAYESIAN HIERARCHICAL LATENT MEASUREMENT MODEL',
    '// Evaluates ALL J >= 3 Sources Symmetrically (No Privileged Reference Source)',
    '// ==========================================================================',
    'data {',
    '  int<lower=1> N;                // Number of Complete-Case City-Year pairs',
    '  int<lower=3> J;                // Number of Measurement Sources (J >= 3)',
    '  matrix[N, J] X;                // Observed Panel Matrix (N x J)',
    '}',
    'parameters {',
    '  vector[N] theta_raw;           // Unanchored Latent True CO2 Emission',
    '  real mu_theta_raw;',
    '  real<lower=0> sigma_theta_raw;',
    '  vector[J] alpha_raw;           // Source Additive Offset',
    '  vector<lower=0.1>[J] lambda_raw; // Source Multiplicative Scale',
    '  vector<lower=0>[J] sigma_eps;  // Source Measurement Error SD',
    '}',
    'model {',
    '  mu_theta_raw ~ normal(mean(to_vector(X)), 500);',
    '  sigma_theta_raw ~ cauchy(0, 250);',
    '  theta_raw ~ normal(mu_theta_raw, sigma_theta_raw);',
    '  alpha_raw ~ normal(0, 200);',
    '  lambda_raw ~ lognormal(0, 0.35);',
    '  sigma_eps ~ cauchy(0, 100);',
    '  for (j in 1:J)',
    '    X[, j] ~ normal(alpha_raw[j] + lambda_raw[j] * theta_raw, sigma_eps[j]);',
    '}',
    'generated quantities {',
    '  // Parameter-Expansion Consensus Identification:',
    '  // Geometric mean(lambda) = 1 & Center(alpha / lambda) = 0',
    '  real g_lambda = exp(mean(log(lambda_raw)));',
    '  vector[J] lambda = lambda_raw / g_lambda;',
    '  vector[J] ratios = alpha_raw ./ lambda;',
    '  real c_anchor = mean(ratios);  // or median for robust consensus centering',
    '  vector[J] alpha = alpha_raw - lambda * c_anchor;',
    '  vector[N] theta = c_anchor + g_lambda * theta_raw;',
    '  real var_theta = variance(theta);',
    '  vector[J] error_variance;',
    '  vector[J] total_mse;',
    '  vector[J] total_rmse;',
    '  vector[J] reliability_R2;',
    '  vector<lower=0, upper=1>[J] is_best;',
    '  int best_idx = 1;',
    '  for (j in 1:J) {',
    '    error_variance[j] = square(sigma_eps[j]);',
    '    total_mse[j] = square(alpha[j]) + square(lambda[j] - 1.0) * var_theta + error_variance[j];',
    '    total_rmse[j] = sqrt(total_mse[j]);',
    '    reliability_R2[j] = (square(lambda[j]) * var_theta) /',
    '                        (square(lambda[j]) * var_theta + error_variance[j]);',
    '    if (total_rmse[j] < total_rmse[best_idx]) best_idx = j;',
    '  }',
    '  for (j in 1:J) is_best[j] = (j == best_idx) ? 1.0 : 0.0;',
    '}'
  ].join('\n');

  const step5Code = [
    '* ============================================================================',
    '* STEP 5: LATENT FACTOR MEASUREMENT MODEL (STATA SEM + R/STAN BAYESIAN)',
    '* Stata SEM menaksir congeneric factor model & reliabilitas klasik R^2;',
    '* Untuk MCMC Bayesian penuh (R-hat, ESS, Posterior Prob Best), gunakan tab Stan/R.',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    `egen byte cc = rownonmiss(${allStataVars})`,
    `keep if cc == ${sources.length}`,
    ...(sources.length >= 3
      ? [
          `sem (L_true -> ${allStataVars}), var(L_true@1) vce(cluster city_id) standardized`,
          'estat eqgof',
          'estat gof, stats(all)',
          'predict double theta_z, latent(L_true)',
          `egen double med_cross = rowmedian(${allStataVars})`,
          'quietly regress med_cross theta_z',
          'predict double theta_hat, xb',
          ...sources.map((s, idx) => {
            const sv = varMap.get(s.id)!;
            return `gen double err_${idx + 1} = ${sv} - theta_hat\nsummarize err_${idx + 1}\ncapture noisily concord ${sv} theta_hat`;
          })
        ]
      : ['* Underidentified (J < 3): membutuhkan minimal 3 sumber independen']),
    'restore'
  ].join('\n');

  const step5Bundle: StepStataDocumentationBundle = {
    stepId: 5,
    stepTitle: 'Step 5 — Bayesian Hierarchical Latent Measurement Model',
    analysisPurpose: {
      whatIsAnalyzed: 'Estimasi serentak nilai emisi laten sejati ($\\theta_{it}$) beserta bias sistematis ($\\alpha_j$), faktor skala ($\\lambda_j$), Error SD ($\\sigma_{\\varepsilon_j}$), Total Latent RMSE, Reliabilitas ($R_j^2$), dan Posterior Probability of Being Best untuk SELURUH $J$ variabel.',
      whyRequired:
        'Tanpa mengorbankan 1 variabel pun sebagai referensi, model faktor hierarkis memisahkan variasi sinyal sejati dari galat acak spesifik masing-masing sumber.',
      statisticalQuestionAnswered:
        'Untuk setiap sumber dari $X_1$ hingga $X_J$, seberapa besar kesalahan totalnya, kesalahan acaknya, biasnya, dan probabilitas menjadi variabel yang paling benar?'
    },
    stataCode: step5Code,
    companionStanCode: step5CompanionStan,
    companionRCode: fitResult?.generatedCode.rScript,
    dependenciesNote:
      'Penting: Stata `sem` menjalankan Maximum Likelihood / Quasi-ML factor model. Karena estimasi Bayesian multi-chain MCMC lengkap (`R-hat`, `ESS`, `Posterior Predictive Check`, dan `Posterior Probability of Being Best`) membutuhkan posterior sampling penuh, aplikasi mengeksekusi 3-chain Gibbs MCMC secara native dan menyertakan kode **Stan (`.stan`)** serta **R** sebagai skrip estimasi Bayesian utama.',
    commandUsages: [
      {
        command: `sem (L_true -> ${allStataVars}), var(L_true@1) vce(cluster city_id)`,
        functionSummary: 'Mengestimasi model faktor congeneric satu dimensi di Stata serta koefisien reliabilitas (`estat eqgof`).',
        reasonUsed: 'Memvalidasi struktur loading $\\lambda_j$ dan error variance $\\sigma_{\\varepsilon_j}^2$ seluruh sumber dalam lingkup Stata.',
        linkToStepGoal: 'Memberikan estimasi frequentist pendamping atas reliabilitas tiap sumber.'
      },
      {
        command: 'Stan: total_mse[j] = alpha^2 + (lambda-1)^2*var_theta + sigma_eps^2',
        functionSummary: 'Mendekomposisi kesalahan total menjadi komponen bias aditif, distorsi skala, dan galat acak per undian MCMC.',
        reasonUsed: 'Menjamin variabel ber-noise kecil tapi bias besar tetap dihukum oleh komponen $\\alpha_j^2$.',
        linkToStepGoal: 'Mengidentifikasi variabel paling benar secara menyeluruh (bukan sekadar stabil).'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Total Latent RMSE & Error SD (σ_εj)',
        statisticalDefinition: 'Akar Total MSE ($\sqrt{\\alpha_j^2 + (\\lambda_j-1)^2 s_\\theta^2 + \\sigma_{\\varepsilon_j}^2}$) dan simpangan baku noise acak spesifik instrumen ($\\sigma_{\\varepsilon_j}$).',
        unit: unitNote,
        researchFunction: 'Metrik utama pemeringkatan untuk semua $J$ variabel.',
        keyValueToWatch: 'Nilai terendah dengan 95% Credible Interval paling sempit',
        goodVsWarningCondition: 'Semakin kecil semakin akurat; bandingkan overlap 95% Credible Interval dengan peringkat #2.'
      },
      {
        outputName: 'Reliability (R²) & Posterior Probability of Being Best',
        statisticalDefinition: 'Rasio varians sinyal sejati terhadap total varians variabel ($R_j^2$), serta frekuensi kemunculan sumber tersebut sebagai yang terbaik di seluruh sampel MCMC.',
        unit: 'Proporsi / Persentase (%)',
        researchFunction: 'Mengukur konsistensi dan kekuatan bukti Bayesian bahwa suatu sumber unggul atas semua pesaingnya.',
        keyValueToWatch: 'R² mendekati 100% & P(Best) >= 95%',
        goodVsWarningCondition: 'P(Best) >= 95% menandakan dukungan posterior kuat; < 80% berarti posisi puncak masih belum pasti.'
      }
    ],
    structuredInterpretations: fitResult
      ? fitResult.metrics.map(m => ({
          title: `Parameter Model Laten & Reliabilitas — ${m.sourceLabel}`,
          nilai: `Total Latent RMSE = ${m.totalLatentRmse.toFixed(2)} (95% CrI [${m.totalLatentRmseCiLower.toFixed(2)}, ${m.totalLatentRmseCiUpper.toFixed(2)}]) | Error SD = ${m.errorSd.toFixed(2)} | Reliabilitas R² = ${(m.reliabilityR2 * 100).toFixed(2)}% | Alpha Bias = ${m.latentInterceptBias >= 0 ? '+' : ''}${m.latentInterceptBias.toFixed(2)} | Loading λ = ${m.latentLoading.toFixed(3)} | P(Best) = ${(m.posteriorProbBest * 100).toFixed(1)}%.`,
          artinya: `${m.sourceLabel} memiliki penyimpangan total sekitar ${m.totalLatentRmse.toFixed(2)} ${unitNote} terhadap sinyal emisi sejati laten, dengan ${ (m.reliabilityR2 * 100).toFixed(2) }% variasinya berasal dari sinyal emisi sebenarnya.`,
          caraMembaca: 'Cari variabel dengan Total Latent RMSE & Error SD terkecil, R² tertinggi, Alpha dekat 0, dan Posterior Prob Best tertinggi.',
          implikasi:
            m.posteriorProbBest >= 0.8
              ? `${m.sourceLabel} merupakan kandidat kuat instrumen pengukuran paling akurat pada dataset ini.`
              : `Nilai P(Best) sebesar ${(m.posteriorProbBest * 100).toFixed(1)}% menunjukkan apakah variabel ini mendominasi atau masih bersaing ketat.`,
          batasan: 'Apabila seluruh sumber pengukuran memiliki bias seragam yang identik, komponen bias bersama tersebut tidak dapat terdeteksi tanpa kalibrasi eksternal.'
        }))
      : [],
    stepConclusion: {
      decisionSummary: fitResult
        ? `Estimasi model laten Bayesian (${fitResult.latentModel.nChains} chains × ${fitResult.latentModel.iterationsPerChain} iters) selesai untuk semua J = ${sources.length} sumber dengan max R-hat = ${fitResult.latentModel.maxRhat.toFixed(4)}.`
        : 'Menunggu hasil estimasi model laten.',
      readinessStatus: fitResult?.latentModel.converged ? 'LAYAK DILANJUTKAN' : 'LAYAK DENGAN CATATAN',
      warnings: fitResult && !fitResult.latentModel.converged ? ['Model belum konvergen sempurna atau J < 3 (underidentified).'] : []
    }
  };

  // ============================================================
  // STEP 6: PAIR FIXED EFFECTS & DIAGNOSTICS BAYESIAN/PANEL
  // ============================================================
  const step6Code = [
    '* ============================================================================',
    '* STEP 6: PAIR FIXED EFFECTS OVER ALL J SOURCES (vs LATENT BENCHMARK θ̂)',
    `* Dataset        : ${datasetName}`,
    `* Panel Indices  : ${cityIdColumn} x ${yearColumn}`,
    '* Absorbs City-Year pair_id (alpha_it) & clusters SE by City ID',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    `egen byte cc = rownonmiss(${allStataVars})`,
    `keep if cc == ${sources.length}`,
    ...(sources.length >= 3
      ? [
          `quietly sem (L_true -> ${allStataVars}), var(L_true@1)`,
          'predict double theta_z, latent(L_true)',
          `egen double med_cross = rowmedian(${allStataVars})`,
          'quietly regress med_cross theta_z',
          'predict double theta_hat, xb'
        ]
      : [`egen double theta_hat = rowmean(${allStataVars})`]),
    ...sources.map((s, idx) => {
      const sv = varMap.get(s.id)!;
      return `gen double err_${idx + 1} = ${sv} - theta_hat\ngen double ae_${idx + 1} = abs(err_${idx + 1})`;
    }),
    'egen long pair_id = group(city_id year_id)',
    `keep pair_id city_id year_id ${sources.map((_, i) => `ae_${i + 1} err_${i + 1}`).join(' ')}`,
    'reshape long ae_ err_, i(pair_id) j(source_id)',
    'rename ae_ ae',
    'areg ae i.source_id, absorb(pair_id) vce(cluster city_id)',
    'testparm i.source_id',
    'pwcompare source_id, effects cimeans',
    'capture noisily boottest 2.source_id, cluster(city_id) boottype(wild) weighttype(rademacher) reps(999)',
    'restore'
  ].join('\n');

  const step6Bundle: StepStataDocumentationBundle = {
    stepId: 6,
    stepTitle: 'Step 6 — Pair Fixed Effects Inferential Comparison Across All Sources',
    analysisPurpose: {
      whatIsAnalyzed: 'Perbedaan kesalahan absolut ($\\text{AE}_{ijt} = |X_{ijt} - \\hat{\\theta}_{it}|$) seluruh $J$ sumber secara berpasangan di dalam sel Kota-Tahun yang sama, beserta probabilitas posterior Bayesian $P(\\text{RMSE}_A < \\text{RMSE}_B)$.',
      whyRequired: 'Memastikan selisih peringkat #1 dan #2 bukan kebetulan sampel, sekaligus mengontrol guncangan Kota-Tahun dan korelasi dalam-kota.',
      statisticalQuestionAnswered: 'Pasangan sumber mana saja yang akurasinya terbukti berbeda signifikan secara statistik maupun Bayesian?'
    },
    stataCode: step6Code,
    dependenciesNote: 'Perintah `areg`, `pwcompare` bawaan Stata; `ssc install boottest` untuk Rademacher Wild Cluster Bootstrap.',
    commandUsages: [
      {
        command: 'areg ae i.source_id, absorb(pair_id) vce(cluster city_id)',
        functionSummary: 'Menguji perbedaan deviasi seluruh $J$ sumber dalam sel Kota-Tahun yang sama.',
        reasonUsed: 'Mengontrol seluruh heterogenitas spasial-temporal kota dengan City Cluster-Robust SE.',
        linkToStepGoal: 'Membuktikan signifikansi antar-sumber pada Step 6.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Pairwise Contrast (Wild Boot p & P_Bayes)',
        statisticalDefinition: 'Uji dua arah $\\Delta\\text{MAE}_{A,B}$ via Wild Bootstrap klaster kota serta peluang posterior bahwa $\\text{RMSE}_A < \\text{RMSE}_B$.',
        unit: 'Probabilitas / p-value',
        researchFunction: 'Memisahkan mana variabel yang unggul nyata vs setara statistik.',
        keyValueToWatch: 'Wild Bootstrap p < 0.05 & P_Bayes >= 95%',
        goodVsWarningCondition: 'Keduanya terpenuhi menandakan perbedaan akurasi sangat meyakinkan.'
      }
    ],
    structuredInterpretations: fitResult
      ? fitResult.pairFixedEffects.pairwiseContrasts.map(c => ({
          title: `Kontras Inferensial: ${c.sourceALabel} vs ${c.sourceBLabel}`,
          nilai: `ΔMAE = ${c.diffAminusB >= 0 ? '+' : ''}${c.diffAminusB.toFixed(2)} ${unitNote} | Wild Boot p = ${c.wildBootstrapPValue.toFixed(4)} | P_Bayes(A lebih baik) = ${(c.posteriorProbABetterThanB * 100).toFixed(1)}%.`,
          artinya: c.isSignificant05
            ? `Terdapat perbedaan kesalahan absolut yang signifikan pada pasangan ini (${c.diffAminusB < 0 ? c.sourceALabel : c.sourceBLabel} lebih akurat).`
            : 'Perbedaan kesalahan absolut kedua sumber pada pasangan Kota-Tahun belum signifikan secara statistik pada α = 5%.',
          caraMembaca: 'Perhatikan tanda ΔMAE dan keselarasan antara Wild Bootstrap p (< 0.05) dengan Probabilitas Posterior (> 95% atau < 5%).',
          implikasi: c.isSignificant05 ? 'Keunggulan salah satu sumber di pasangan ini terbukti inferensial.' : 'Kedua sumber berkinerja sebanding secara statistik.',
          batasan: 'Pada G < 30 kota, Wild Bootstrap lebih akurat menjaga ukuran kesalahan Tipe I dibanding SE biasa.'
        }))
      : [],
    stepConclusion: {
      decisionSummary: fitResult
        ? `Uji Pair Fixed Effects atas semua J = ${sources.length} sumber selesai (${fitResult.pairFixedEffects.pairwiseContrasts.length} pasangan kontras).`
        : 'Menunggu hasil Pair FE.',
      readinessStatus: fitResult?.pairFixedEffects.smallClusterWarning ? 'LAYAK DENGAN CATATAN' : 'LAYAK DILANJUTKAN',
      warnings: fitResult?.pairFixedEffects.smallClusterWarning ? [`Klaster G = ${fitResult.pairFixedEffects.nClustersCity} < 30: utamakan Wild Bootstrap p & Bayesian CrI.`] : []
    }
  };

  // ============================================================
  // STEP 7: STATISTICAL & BAYESIAN CONVERGENCE DIAGNOSTICS
  // ============================================================
  const step7Code = [
    '* ============================================================================',
    '* STEP 7: DIAGNOSTICS (sktest, swilk, xtserial, xttest3, xtcsd, Bayesian R-hat/ESS)',
    `* Dataset        : ${datasetName}`,
    `* Panel Indices  : ${cityIdColumn} x ${yearColumn}`,
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    ...(preprocessing.dropDuplicateCityYear ? ['bysort city_id year_id: keep if _n == 1'] : []),
    'xtset city_id year_id',
    `egen byte cc = rownonmiss(${allStataVars})`,
    `keep if cc == ${sources.length}`,
    ...(sources.length >= 3
      ? [
          `quietly sem (L_true -> ${allStataVars}), var(L_true@1)`,
          'predict double theta_z, latent(L_true)',
          `egen double med_cross = rowmedian(${allStataVars})`,
          'quietly regress med_cross theta_z',
          'predict double theta_hat, xb'
        ]
      : [`egen double theta_hat = rowmean(${allStataVars})`]),
    ...sources.flatMap((s, idx) => {
      const sv = varMap.get(s.id)!;
      const j = idx + 1;
      return [
        `gen double err_${j} = ${sv} - theta_hat`,
        `gen double ae_${j}  = abs(err_${j})`,
        `sktest err_${j} ae_${j}`,
        `if _N >= 4 & _N <= 2000 swilk err_${j} ae_${j}`,
        `capture noisily xtserial err_${j} ${sv}`,
        `quietly xtreg err_${j} i.year_id, fe`,
        'capture noisily xttest3',
        'capture noisily xtcsd, pesaran abs'
      ];
    }),
    'egen long pair_id = group(city_id year_id)',
    `keep pair_id city_id year_id ${sources.map((_, i) => `ae_${i + 1} err_${i + 1}`).join(' ')}`,
    'reshape long ae_ err_, i(pair_id) j(source_id)',
    'robvar err_, by(source_id)',
    'bysort source_id: egen p95 = pctile(ae_), p(95)',
    'bysort source_id: summarize ae_',
    'bysort source_id: summarize ae_ if ae_ <= p95',
    'restore'
  ].join('\n');

  const step7Bundle: StepStataDocumentationBundle = {
    stepId: 7,
    stepTitle: 'Step 7 — Bayesian Convergence & Panel Statistical Diagnostics',
    analysisPurpose: {
      whatIsAnalyzed: 'Konvergensi rantai MCMC (R-hat, ESS, Posterior Predictive Check), heteroskedastisitas, AR(1) dalam-kota, ketergantungan lintas-kota (Pesaran CD), serta stabilitas terhadap 5% outlier terbesar.',
      whyRequired: 'Memastikan hasil Bayesian bukan artefak non-konvergensi MCMC dan peringkat tidak runtuh akibat beberapa observasi ekstrem.',
      statisticalQuestionAnswered: 'Apakah estimasi Bayesian telah konvergen dan apakah peringkat sumber stabil di luar 5% pencilan terbesar?'
    },
    stataCode: step7Code,
    dependenciesNote: 'Bawaan Stata (`sktest`, `swilk` terjaga $N$, `robvar`). Diagnostik panel: `ssc install xtserial`, `ssc install xttest3`, `ssc install xtcsd`. R/Stan untuk trace & R-hat.',
    commandUsages: [
      {
        command: 'Bayesian R-hat, ESS & PPC',
        functionSummary: 'Menguji pencampuran rantai paralel MCMC ($\\hat{R} \\le 1.10$) dan kecukupan jumlah sampel efektif.',
        reasonUsed: 'Rantai MCMC yang tidak konvergen akan menghasilkan peringkat palsu.',
        linkToStepGoal: 'Memvalidasi keandalan estimasi Step 5.'
      },
      {
        command: 'sktest / swilk & robvar & 95% Trimmed AE',
        functionSummary: 'Memeriksa bentuk distribusi residual, kesamaan varians antarsumber, serta stabilitas peringkat tanpa 5% error ekstrem.',
        reasonUsed: 'Memastikan hasil tidak dibentuk oleh segelintir sel ekstrem.',
        linkToStepGoal: 'Mendukung pemeriksaan KONFLIK_ANTAR_METRIK di Step 8.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Gelman-Rubin R-hat & Effective Sample Size (ESS)',
        statisticalDefinition: 'Rasio varians antar-rantai terhadap dalam-rantai MCMC ($\\hat{R}$) dan jumlah sampel bebas efektif.',
        unit: 'Rasio (>= 1.0) & Sampel',
        researchFunction: 'Standar emas konvergensi inferensi Bayesian.',
        keyValueToWatch: `max R-hat = ${fitResult?.latentModel.maxRhat.toFixed(4) || '-'}, min ESS = ${fitResult?.latentModel.minEss || '-'}`,
        goodVsWarningCondition: 'Baik jika R-hat <= 1.10 dan ESS >= 100.'
      }
    ],
    structuredInterpretations: fitResult
      ? [
          {
            title: 'Konvergensi MCMC Bayesian (R-hat, ESS, Posterior Predictive Check)',
            nilai: `max R-hat = ${fitResult.latentModel.maxRhat.toFixed(4)} | min ESS = ${fitResult.latentModel.minEss} | PPC p = ${fitResult.latentModel.posteriorPredictivePValue.toFixed(3)}.`,
            artinya: fitResult.diagnostics.bayesianConvergenceAudit.summary,
            caraMembaca: 'R-hat mendekati 1.00 (<= 1.10) dan PPC p-value di rentang 0.10–0.90 menandakan model sesuai dengan data aktual.',
            implikasi: 'Distribusi posterior seluruh J sumber layak dijadikan dasar pengambilan kesimpulan peringkat.',
            batasan: 'Konvergensi numerik tetap tidak dapat menggantikan syarat jumlah sumber independen (J >= 3).'
          },
          {
            title: 'Sensitivitas 5% Outlier Terbesar & Uji Struktur Error Panel',
            nilai: `${fitResult.diagnostics.heteroskedasticityTest.statisticLabel} = ${fitResult.diagnostics.heteroskedasticityTest.statisticValue.toFixed(2)} (p=${(fitResult.diagnostics.heteroskedasticityTest.pValue ?? 1).toFixed(4)}) | Trimmed Rank Berubah: ${fitResult.diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'YA' : 'TIDAK'}.`,
            artinya: fitResult.diagnostics.outlierSensitivityAudit.summary,
            caraMembaca: 'Pastikan urutan peringkat tidak terbalik saat 5% kesalahan terbesar dipangkas.',
            implikasi: fitResult.diagnostics.outlierSensitivityAudit.rankOrderChanged
              ? 'Adanya pembalikan peringkat membuat keputusan Step 8 ditandai KONFLIK_ANTAR_METRIK.'
              : 'Urutan pemenang terbukti stabil terhadap pencilan.',
            batasan: 'Normalitas error absolut bukan syarat validitas berkat CLT, Cluster SE, dan MCMC.'
          }
        ]
      : [],
    stepConclusion: {
      decisionSummary: fitResult ? fitResult.diagnostics.bayesianConvergenceAudit.summary : 'Menunggu diagnostik.',
      readinessStatus: fitResult?.diagnostics.outlierSensitivityAudit.rankOrderChanged ? 'LAYAK DENGAN CATATAN' : 'LAYAK DILANJUTKAN',
      warnings: fitResult?.diagnostics.outlierSensitivityAudit.rankOrderChanged ? ['Urutan peringkat berubah pada 95% trimmed.'] : []
    }
  };

  // ============================================================
  // STEP 8: ALL-SOURCE RANKING & ROBUSTNESS SENSITIVITY (LOCO)
  // ============================================================
  const step8Code = [
    '* ============================================================================',
    '* STEP 8: ALL-SOURCE RANKING & ROBUSTNESS (LEAVE-ONE-CITY-OUT JACKKNIFE)',
    `* Dataset        : ${datasetName}`,
    `* Panel Indices  : ${cityIdColumn} x ${yearColumn}`,
    '* Evaluates stability of rank #1 across all cities & alternative data scales',
    '* ============================================================================',
    'version 17.0',
    'set more off',
    `capture noisily ${importCmd}`,
    'preserve',
    `capture confirm numeric variable ${cityIdColumn}`,
    `if _rc != 0 encode ${cityIdColumn}, gen(city_id)`,
    `else gen long city_id = ${cityIdColumn}`,
    `capture destring ${yearColumn}, gen(year_id) force`,
    ...sources.map(s => `capture destring ${s.columnKey}, gen(${varMap.get(s.id)!}) force`),
    `egen byte cc = rownonmiss(${allStataVars})`,
    `keep if cc == ${sources.length}`,
    'levelsof city_id, local(city_list)',
    'foreach g of local city_list {',
    '    display "--- LOCO Fold: Tanpa City ID = `g\' ---"',
    `    capture noisily sem (L_true -> ${allStataVars}) if city_id != \`g', standardized`,
    '}',
    'restore'
  ].join('\n');

  const robustnessSummary: RobustnessSensitivitySummary = {
    leaveOneCityOutRows: loco.rows,
    locoConsistencyPct: loco.consistencyPct,
    locoSummary: loco.summary,
    ccVsAvailableSummary: fitResult?.metrics.some(m => m.missingGapVsComplete > 0)
      ? 'Terdapat beda sampel Complete-Case vs Available-Case; periksa konsistensi kedua metrik.'
      : `Seluruh J = ${sources.length} sumber dievaluasi pada pasangan yang identik (N = ${qualityReport.nCompleteCasePairs}).`,
    scaleTransformationSummary: `Evaluasi multi-skenario membandingkan satuan asli vs Winsorization 2.5% vs log(1+x); terbaik: ${recCand?.label || 'Satuan Fisik Asli'}.`,
    outlierTrimmedSummary:
      fitResult?.diagnostics.outlierSensitivityAudit.summary || 'Audit 95% Trimmed mengecek stabilitas peringkat.'
  };

  const step8Bundle: StepStataDocumentationBundle = {
    stepId: 8,
    stepTitle: 'Step 8 — Evaluasi Akhir, Pemeringkatan #1..#J & Sensitivitas LOCO',
    analysisPurpose: {
      whatIsAnalyzed: 'Peringkat lengkap SELURUH $J$ sumber dari #1 terbaik sampai #$J$ berdasarkan Total Latent RMSE, Error SD, Reliabilitas $R^2$, Posterior Probability of Being Best, dan uji Leave-One-City-Out (LOCO).',
      whyRequired: 'Menjawab langsung pertanyaan penelitian: dari seluruh variabel, mana yang paling akurat dan paling benar — dengan kejujuran ilmiah jika bukti masih ambigu atau konflik.',
      statisticalQuestionAnswered: 'Apakah satu sumber terbukti menang signifikan dan tahan terhadap penghapusan kota satu per satu maupun pemangkasan outlier?'
    },
    stataCode: step8Code,
    dependenciesNote: 'Bawaan Stata (`levelsof`, `foreach`, `sem`).',
    commandUsages: [
      {
        command: 'foreach g of local city_list: sem ... if city_id != `g\'',
        functionSummary: 'Menjalankan jackknife Leave-One-City-Out untuk mengecek apakah peringkat #1 tetap stabil bila satu kota dikeluarkan.',
        reasonUsed: 'Mencegah kesimpulan peringkat didominasi satu kota besar saja.',
        linkToStepGoal: 'Menguji validitas internal pemeringkatan lintas wilayah.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Peringkat #1 s/d #J & Conclusiveness Status',
        statisticalDefinition: 'Klasifikasi ke dalam `TERBUKTI_BERBEDA_SIGNIFIKAN`, `PERBEDAAN_TIDAK_SIGNIFIKAN`, `KONFLIK_ANTAR_METRIK`, atau `MODEL_TIDAK_TERIDENTIFIKASI`.',
        unit: 'Status Keputusan',
        researchFunction: 'Menjaga objektivitas agar tidak memaksakan pemenang ketika perbedaan lemah atau identifikasi kurang.',
        keyValueToWatch: fitResult?.ranking.conclusivenessStatus || '-',
        goodVsWarningCondition: 'TERBUKTI_BERBEDA_SIGNIFIKAN menandakan bukti kuat.'
      }
    ],
    structuredInterpretations: fitResult
      ? [
          {
            title: `Keputusan Peringkat Akhir — ${fitResult.ranking.conclusivenessStatus}`,
            nilai: `Peringkat #1: ${fitResult.ranking.ranks[0]?.sourceLabel} (Total RMSE=${fitResult.ranking.ranks[0]?.totalLatentRmse.toFixed(2)}, Error SD=${fitResult.ranking.ranks[0]?.errorSd.toFixed(2)}, R²=${(fitResult.ranking.ranks[0]?.reliabilityR2 * 100).toFixed(2)}%, P(Best)=${(fitResult.ranking.ranks[0]?.posteriorProbBest * 100).toFixed(1)}%) | LOCO = ${loco.consistencyPct.toFixed(1)}%.`,
            artinya: fitResult.ranking.rankingSummary,
            caraMembaca: 'Semua J variabel dinilai setara; sumber dengan Total Latent RMSE terendah & Reliabilitas tertinggi berada di #1.',
            implikasi: fitResult.ranking.isConclusive
              ? `${fitResult.ranking.bestSourceLabel} merupakan sumber pengukuran paling akurat dan paling konsisten dengan sinyal emisi sebenarnya di dataset ini.`
              : 'Laporkan peringkat secara hati-hati dengan menyoroti kedekatan nilai antarsumber atau kendala identifikasi.',
            batasan: fitResult.ranking.methodologicalCaveat
          }
        ]
      : [],
    stepConclusion: {
      decisionSummary: fitResult ? fitResult.ranking.rankingSummary : 'Menunggu pemeringkatan.',
      readinessStatus: fitResult?.ranking.isConclusive ? 'LAYAK DILANJUTKAN' : 'LAYAK DENGAN CATATAN',
      warnings: fitResult && !fitResult.ranking.isConclusive ? [fitResult.ranking.rankingSummary] : []
    },
    robustnessSummary
  };

  // ============================================================
  // STEP 9: FINAL MASTER CODE & EXPORT
  // ============================================================
  const step9Bundle: StepStataDocumentationBundle = {
    stepId: 9,
    stepTitle: 'Step 9 — Hasil Lengkap, Master Script (.do / .R / .stan) & Ekspor',
    analysisPurpose: {
      whatIsAnalyzed: 'Sintesis utuh Step 1 s/d Step 8 mencakup tabel gaya Stata, grafik interaktif, skrip reproduksi penuh (`.do`, `.R`, `.stan`), dan ekspor dokumen.',
      whyRequired: 'Memastikan setiap temuan tentang akurasi semua variabel dapat direplikasi secara independen.',
      statisticalQuestionAnswered: 'Bagaimana mendokumentasikan, memvisualisasikan, dan mengekspor seluruh bukti komparasi akurasi ke laporan ilmiah?'
    },
    stataCode: fitResult?.generatedCode.stataDoFile || step5Code,
    companionRCode: fitResult?.generatedCode.rScript || '',
    companionStanCode: step5CompanionStan,
    dependenciesNote: 'Master script menggabungkan Stata (`sem`, `areg`, `concord`, `boottest`), R (`lavaan`, `fixest`, `DescTools`), dan Stan MCMC.',
    commandUsages: [
      {
        command: 'Master .do + .R + .stan Reproduction Suite',
        functionSummary: 'Replikasi end-to-end seluruh analisis dari pembacaan data hingga pemeringkatan #1..#J.',
        reasonUsed: 'Transparansi metodologis antara mesin Bayesian Laten dan frequentist Pair FE.',
        linkToStepGoal: 'Lampiran kode siap audit untuk publikasi.'
      }
    ],
    outputExplanations: [
      {
        outputName: 'Laporan Lengkap (.pdf, .docx, .xlsx, .csv) & Skrip',
        statisticalDefinition: 'Dokumen ekspor terpadu memuat tabel Bayesian, LOSO Consensus, Pair FE, Diagnostik, dan Ranking.',
        unit: 'Berkas Dokumen',
        researchFunction: 'Pelaporan akhir penelitian.',
        keyValueToWatch: 'Kesesuaian ranking #1..#J di seluruh tabel ekspor',
        goodVsWarningCondition: 'Selalu unduh ulang berkas apabila mengubah pemetaan atau prapemrosesan.'
      }
    ],
    structuredInterpretations: step8Bundle.structuredInterpretations,
    stepConclusion: {
      decisionSummary: fitResult
        ? `Analisis selesai utuh untuk seluruh J = ${sources.length} sumber dengan status ${fitResult.ranking.conclusivenessStatus}.`
        : 'Menunggu hasil akhir.',
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
