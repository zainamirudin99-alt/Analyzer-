// ============================================================
// OPTION 3: Verified Peer-Reviewed Literature Registry, Per-Step Glossary,
// & Reproducible Stata 17/18 + R + Stan Implementation Guides (Steps 1–9)
// Strictly distinguishes Native Stata capabilities vs Internal Engine methods
// ============================================================

import {
  AdvLatentEstimationBundle,
  AdvLiteratureReference,
  AdvMonteCarloBundle,
  AdvPreprocessingBundle,
  AdvRankingBundle,
  AdvResolvedConfig,
  AdvStepStataSection,
  AdvValidationBundle,
  MeasurementSource
} from './panel-adv-types';

export interface AdvGlossaryEntry {
  term: string;
  fullName: string;
  meaning: string;
}

export const OPTION3_STEP_GLOSSARY: Record<number, AdvGlossaryEntry[]> = {
  1: [
    {
      term: 'G × T × J',
      fullName: 'Entities × Time Periods × Measurement Sources',
      meaning: 'Dimensi tiga arah data panel multi-sumber: G entitas diamati pada T periode oleh J instrumen pengukuran tanpa Ground Truth.'
    },
    {
      term: 'N_CC',
      fullName: 'Complete-Case Entity-Time Pairs',
      meaning: 'Jumlah sel panel (i, t) tempat seluruh J sumber memiliki pengamatan numerik valid secara simultan.'
    },
    {
      term: 'Identifiability (J ≥ 3)',
      fullName: 'Algebraic Variance Identification Condition',
      meaning: 'Dengan J sumber terdapat J(J+1)/2 momen kovarians unik untuk menaksir 2J parameter (λ_j, σ²_j); syarat perlu identifikasi bebas-referensi adalah J ≥ 3.'
    },
    {
      term: 'MCAR / MAR / MNAR',
      fullName: 'Missing Completely at Random / at Random / Not at Random',
      meaning: 'Taksonomi mekanisme data hilang Rubin. MNAR tidak dapat disingkirkan hanya dari data teramati tanpa informasi eksternal.'
    }
  ],
  2: [
    {
      term: 'Validity-First Hierarchy',
      fullName: '9-Tier Methodological Priority Rule',
      meaning: 'Urutan prioritas mesin otomatis: Validity → Identifiability → Assumption Compatibility → Diagnostics → Predictive → Robustness → Interpretability → Parsimony → Efficiency.'
    },
    {
      term: 'df_cov',
      fullName: 'Covariance Degrees of Freedom',
      meaning: 'Selisih antara jumlah elemen unik matriks kovarians antarsumber J(J+1)/2 dan jumlah parameter varians-loading bebas.'
    },
    {
      term: 'FIML',
      fullName: 'Full-Information / Available-Case Weighted Likelihood',
      meaning: 'Pemanfaatan baris panel yang memiliki minimal ≥ 2 sumber valid pada tahap diagnostik tanpa membuang seluruh baris akibat satu sumber kosong.'
    },
    {
      term: 'Anchor Regime',
      fullName: 'Latent Scale & Location Identification Constraint',
      meaning: 'Aturan matematis pengunci skala dan lokasi sinyal laten θ_it (misal GeoMean(λ)=1 & Median(α/λ)=0). Anchor bukan Ground Truth.'
    }
  ],
  3: [
    {
      term: 'Panel MAD',
      fullName: 'Within-Entity Median Absolute Deviation',
      meaning: 'Detektor pencilan yang menghitung deviasi absolut terhadap median masing-masing entitas sehingga entitas berukuran besar tidak keliru ditandai sebagai outlier.'
    },
    {
      term: 'Yeo-Johnson / Box-Cox',
      fullName: 'Power Family Central Normality Transformations',
      meaning: 'Transformasi daya monotonik (Raymaekers & Rousseeuw, 2021) untuk menstabilkan kecondongan ekstrem; mengubah estimand dari satuan fisik asli ke skala daya.'
    },
    {
      term: 'Student-t Likelihood',
      fullName: 'Heavy-Tailed Robust Measurement Error Model',
      meaning: 'Alternatif likelihood berekor tebal yang meredam pengaruh observasi ekstrem pada bobot posterior tanpa mengubah satuan fisik variabel.'
    }
  ],
  4: [
    {
      term: 'Woodbury MCMC',
      fullName: 'Marginalized Woodbury Covariance Sampler',
      meaning: 'Sampler MCMC yang mengintegrasikan sinyal laten θ_it secara analitik via identitas matriks Sherman-Morrison-Woodbury untuk menghindari pencampuran lambat pada dimensi tinggi.'
    },
    {
      term: 'Split R-hat & Folded R-hat',
      fullName: 'Vehtari et al. (2021) Rank-Normalized Convergence Diagnostics',
      meaning: 'Diagnostik konvergensi rantai MCMC modern berbasis normalisasi peringkat Blom pada paruh rantai (lokasi) dan lipatan deviasi median (skala ekor); ambang ketat ≤ 1.05–1.08.'
    },
    {
      term: 'Bulk-ESS & Tail-ESS',
      fullName: 'Effective Sample Size in Bulk and 5%/95% Quantile Tails',
      meaning: 'Ukuran sampel independen efektif pada pusat distribusi posterior (Bulk-ESS) dan ekor kuantil ekstrem 95% CrI (Tail-ESS).'
    },
    {
      term: 'Half-t Prior',
      fullName: 'Gelman (2006) Weakly Informative Scale Prior',
      meaning: 'Prior skala positif untuk simpangan baku galat dan efek acak yang mencegah jebakan varians nol maupun ledakan ekor Inverse-Gamma.'
    }
  ],
  5: [
    {
      term: 'Marginal WAIC',
      fullName: 'Widely Applicable Information Criterion (Marginalized over θ)',
      meaning: 'Kriteria informasi prediktif Bayesian pada likelihood marginal antarsumber (Merkle, Furr, & Rabe-Hesketh, 2019), lebih sahih daripada conditional WAIC untuk model variabel laten.'
    },
    {
      term: 'PSIS-LOO ELPD',
      fullName: 'Pareto-Smoothed Importance Sampling Leave-One-Out Expected Log Predictive Density',
      meaning: 'Estimasi kepadatan prediktif lintas-validasi (Vehtari, Gelman, & Gabry, 2017) beserta diagnostik ekor Pareto k-hat.'
    },
    {
      term: 'AR(1) Residual (ρ_j)',
      fullName: 'First-Order Autoregressive Measurement Error Persistence',
      meaning: 'Ketergantungan serial galat pengukuran instrumen j antarperiode dalam entitas yang sama.'
    }
  ],
  6: [
    {
      term: 'R_j = σ_j / |λ_j|',
      fullName: 'Scale-Adjusted Noise-to-Sensitivity Ratio',
      meaning: 'Simpangan baku galat instrumen dalam satuan sinyal laten; bersifat invarian terhadap perubahan lokasi dan skala anchor linier, namun mengabaikan bias lokasi konstan α_j.'
    },
    {
      term: 'Anchor Total RMSE',
      fullName: 'Anchor-Conditioned Total Latent Root Mean Squared Error',
      meaning: 'Akar jumlah kuadrat bias lokasi α²_j, distorsi sensitivitas (λ_j−1)²Var(θ), dan varians galat σ²_j pada skala anchor aktif.'
    },
    {
      term: 'P(R_j ≤ k | Y)',
      fullName: 'Cumulative Posterior Ranking Probability',
      meaning: 'Peluang posterior sumber j menempati peringkat ke-1 hingga ke-k di seluruh undian MCMC.'
    },
    {
      term: "Kendall's W",
      fullName: 'Coefficient of Concordance Across Anchor Regimes',
      meaning: 'Ukuran kesepakatan urutan peringkat sumber (0 hingga 1) ketika definisi anchor diubah di seluruh J+2 rezim yang memenuhi syarat.'
    }
  ],
  7: [
    {
      term: 'LOSO Covariance Audit',
      fullName: 'Leave-One-Source-Out Variance Identity Audit',
      meaning: 'Pemeriksaan suku kovarians 2·λ_j·Cov(ε_j, θ̂_-j) dalam identitas Var(A−B)=Var(A)+Var(B)−2Cov(A,B) agar varians benchmark tidak dikurangkan secara naif.'
    },
    {
      term: 'Holm (1979) FWER',
      fullName: 'Sequential Step-Down Familywise Error Rate Control',
      meaning: 'Koreksi nilai-p berpasangan yang jauh lebih bertenaga daripada Bonferroni klasik namun tetap valid di bawah ketergantungan sembarang antar-uji.'
    },
    {
      term: 'Webb 6-Point Wild Bootstrap',
      fullName: 'Six-Point Distribution Wild Cluster Bootstrap',
      meaning: 'Distribusi bobot wild bootstrap (±√(3/2), ±1, ±√(1/2)) (MacKinnon, Nielsen, & Webb, 2023) untuk jumlah klaster kecil G < 15.'
    },
    {
      term: 'Mixed-Effects LoA',
      fullName: 'Repeated-Measures Limits of Agreement (Parker et al., 2020)',
      meaning: 'Batas kesepakatan Bland-Altman yang menggabungkan komponen varians antar-entitas dan dalam-entitas agar interval tidak semu-sempit pada data panel.'
    }
  ],
  8: [
    {
      term: 'CMB',
      fullName: 'Common-Mode / Shared Systematic Bias',
      meaning: 'Bias aditif atau proporsional bersama yang menggeser mayoritas/seluruh sumber searah dan secara matematis terserap ke θ_it bila tanpa kalibrasi eksternal.'
    },
    {
      term: 'DGP',
      fullName: 'Data-Generating Process (Proses Pembangkit Data)',
      meaning: 'Spesifikasi parameter sejati dalam simulasi Monte Carlo untuk mengukur bias parameter, cakupan interval 95%, dan pemulihan peringkat #1 (Morris et al., 2019).'
    }
  ],
  9: [
    {
      term: 'Relative Reliability',
      fullName: 'Reference-Free Conditional Relative Measurement Reliability',
      meaning: 'Kesimpulan keandalan relatif bersyarat terhadap model dan struktur kovarians antarsumber — bukan klaim akurasi absolut terhadap kebenaran fisik.'
    }
  ]
};

export const VERIFIED_OPTION3_LITERATURE: AdvLiteratureReference[] = [
  {
    id: 'vehtari_2021_ba',
    authors: 'Vehtari, A., Gelman, A., Simpson, D., Carpenter, B., & Bürkner, P.-C.',
    year: 2021,
    title: 'Rank-normalization, folding, and localization: An improved R-hat for assessing convergence of MCMC',
    journal: 'Bayesian Analysis',
    volumePages: '16(2), 667–718',
    doi: '10.1214/20-BA1221',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Diagnostik konvergensi Rank-Normalized Split R-hat, Folded R-hat, Bulk-ESS, dan Tail-ESS pada Step 4.'
  },
  {
    id: 'vehtari_2017_sc',
    authors: 'Vehtari, A., Gelman, A., & Gabry, J.',
    year: 2017,
    title: 'Practical Bayesian model evaluation using leave-one-out cross-validation and WAIC',
    journal: 'Statistics and Computing',
    volumePages: '27(5), 1413–1432',
    doi: '10.1007/s11222-016-9696-4',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Seleksi kandidat struktur ketergantungan galat M1–M4 berbasis WAIC & PSIS-LOO ELPD beserta Pareto-k pada Step 5.'
  },
  {
    id: 'merkle_2019_psych',
    authors: 'Merkle, E. C., Furr, D., & Rabe-Hesketh, S.',
    year: 2019,
    title: 'Bayesian comparison of latent variable models: Conditional versus marginal likelihoods',
    journal: 'Psychometrika',
    volumePages: '84(3), 802–829',
    doi: '10.1007/s11336-019-09679-0',
    evidenceCategory: 'ESTABLISHED_THEORY',
    roleInOption3: 'Dasar teoretis penggunaan Marginal Likelihood / Marginal WAIC (terintegrasi atas θ_it) dibanding Conditional WAIC pada model variabel laten.'
  },
  {
    id: 'mackinnon_2023_je',
    authors: 'MacKinnon, J. G., Nielsen, M. Ø., & Webb, M. D.',
    year: 2023,
    title: 'Cluster-robust inference: A guide to empirical practice',
    journal: 'Journal of Econometrics',
    volumePages: '232(2), 272–299',
    doi: '10.1016/j.jeconom.2022.04.001',
    evidenceCategory: 'ESTABLISHED_THEORY',
    roleInOption3: 'Aturan pemilihan Cluster-Robust SE satu/dua arah dan distribusi 6-titik Webb ketika jumlah klaster entitas G terbatas.'
  },
  {
    id: 'roodman_2019_sj',
    authors: 'Roodman, D., MacKinnon, J. G., Nielsen, M. Ø., & Webb, M. D.',
    year: 2019,
    title: 'Fast and wild: Bootstrap inference in Stata using boottest',
    journal: 'The Stata Journal',
    volumePages: '19(1), 4–60',
    doi: '10.1177/1536867X19830877',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Implementasi Rademacher & Webb Wild Cluster Bootstrap pada kontras Pair Fixed Effects dan padanan kode Stata boottest di Step 7.'
  },
  {
    id: 'pesaran_2021_ee',
    authors: 'Pesaran, M. H.',
    year: 2021,
    title: 'General diagnostic tests for cross-sectional dependence in panels',
    journal: 'Empirical Economics',
    volumePages: '60(1), 13–50',
    doi: '10.1007/s00181-020-01875-7',
    evidenceCategory: 'ESTABLISHED_THEORY',
    roleInOption3: 'Deteksi ketergantungan lintas-entitas dan aktivasi estimator Driscoll-Kraay HAC pada panel makro/lingkungan.'
  },
  {
    id: 'parker_2020_bmc',
    authors: 'Parker, R. A., Scott, C., Inácio, V., & Stevens, N. T.',
    year: 2020,
    title: 'Using multiple agreement methods for continuous repeated measures data: a tutorial for practitioners',
    journal: 'BMC Medical Research Methodology',
    volumePages: '20, 154',
    doi: '10.1186/s12874-020-01022-x',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Kerangka evaluasi kesepakatan data pengukuran berulang (Mixed-Effects Bland-Altman LoA & CCC) pada Step 7.'
  },
  {
    id: 'parker_2016_plos',
    authors: 'Parker, R. A., Weir, C. J., Rubio, N., et al.',
    year: 2016,
    title: 'Application of mixed effects limits of agreement in the presence of multiple sources of variability',
    journal: 'PLOS ONE',
    volumePages: '11(12), e0168321',
    doi: '10.1371/journal.pone.0168321',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Dekomposisi varians selisih antar-entitas dan dalam-entitas untuk mencegah penyempitan semu Limits of Agreement.'
  },
  {
    id: 'morris_2019_sim',
    authors: 'Morris, T. P., White, I. R., & Crowther, M. J.',
    year: 2019,
    title: 'Using simulation studies to evaluate statistical methods',
    journal: 'Statistics in Medicine',
    volumePages: '38(11), 2074–2102',
    doi: '10.1002/sim.8086',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Arsitektur ADEMP (Aims, Data-generating mechanisms, Estimands, Methods, Performance measures) untuk validasi Monte Carlo 7-keluarga di Step 8.'
  },
  {
    id: 'raymaekers_2021_ml',
    authors: 'Raymaekers, J., & Rousseeuw, P. J.',
    year: 2021,
    title: 'Transforming variables to central normality',
    journal: 'Machine Learning',
    volumePages: '110, 2497–2519',
    doi: '10.1007/s10994-021-05960-5',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Estimasi parameter Box-Cox & Yeo-Johnson yang tangguh terhadap pencilan ekor pada evaluasi transformasi Step 3.'
  },
  {
    id: 'vanerp_2018_pm',
    authors: 'van Erp, S., Mulder, J., & Oberski, D. L.',
    year: 2018,
    title: 'Prior sensitivity analysis in default Bayesian structural equation modeling',
    journal: 'Psychological Methods',
    volumePages: '23(2), 363–388',
    doi: '10.1037/met0000162',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Analisis sensitivitas prior pada model faktor/SEM Bayesian ketika ukuran sampel atau jumlah indikator terbatas.'
  },
  {
    id: 'asparouhov_2021_sem',
    authors: 'Asparouhov, T., & Muthén, B.',
    year: 2021,
    title: 'Advances in Bayesian model fit evaluation for structural equation models',
    journal: 'Structural Equation Modeling',
    volumePages: '28(1), 1–14',
    doi: '10.1080/10705511.2020.1764360',
    evidenceCategory: 'PUBLISHED_EMPIRICAL_METHOD',
    roleInOption3: 'Evaluasi kecocokan posterior predictive p-value (PPP) dan identifikasi kovarians residual berprior penyusutan BSEM.'
  },
  {
    id: 'gelman_2006_holm_1979_classics',
    authors: 'Gelman, A. (2006); Bland, J. M. & Altman, D. G. (2007); Holm, S. (1979); Driscoll, J. C. & Kraay, A. C. (1998)',
    year: 2006,
    title: 'Prior distributions for variance parameters in hierarchical models / Agreement in repeated measurements / Sequentially rejective multiple test procedure / Consistent covariance matrix estimation',
    journal: 'Bayesian Analysis 1(3); J. Biopharm. Stat. 17(4); Scand. J. Stat. 6(2); Rev. Econ. Stat. 80(4)',
    volumePages: '515–534; 571–582; 65–70; 549–560',
    doi: '10.1214/06-BA117A',
    evidenceCategory: 'ESTABLISHED_THEORY',
    roleInOption3: 'Fondasi prior varians Half-t, koreksi FWER sekuensial Holm, LoA pengukuran berulang, dan estimator kovarians spasial-temporal Driscoll-Kraay.'
  }
];

function safeStataName(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!cleaned) return fallback;
  const prefixed = /^[a-z]/.test(cleaned) ? cleaned : `v_${cleaned}`;
  return prefixed.slice(0, 26);
}

export function buildOption3StepStataGuides(params: {
  datasetName: string;
  preprocessed: AdvPreprocessingBundle;
  config: AdvResolvedConfig;
  estimation: AdvLatentEstimationBundle;
  ranking: AdvRankingBundle;
  validation: AdvValidationBundle;
  monteCarlo: AdvMonteCarloBundle;
}): AdvStepStataSection[] {
  const { datasetName, preprocessed, config, estimation, ranking, validation, monteCarlo } = params;
  const { profile, sources } = preprocessed;
  const entVar = safeStataName(profile.entityColumn, 'entity_id');
  const timeVar = safeStataName(profile.timeColumn, 'time_id');
  const srcVars = sources.map((s, idx) => ({
    source: s,
    vName: safeStataName(s.columnKey || s.name, `src_${idx + 1}`)
  }));
  const srcVarList = srcVars.map(x => x.vName).join(' ');
  const firstVar = srcVars[0]?.vName || 'src_1';
  const topRow = ranking.rows[0];

  const importBlock = [
    'version 17.0',
    'clear all',
    'set more off',
    `capture noisily import excel using "${datasetName.replace(/"/g, '')}", firstrow clear`,
    `capture confirm numeric variable ${entVar}`,
    `if _rc != 0 encode ${entVar}, gen(panel_ent_id)`,
    `else gen long panel_ent_id = ${entVar}`,
    `capture destring ${timeVar}, gen(panel_time_id) force`,
    ...srcVars.map(
      sv => `capture confirm numeric variable ${sv.vName}\nif _rc != 0 destring ${sv.vName}, replace force`
    )
  ].join('\n');

  // STEP 1
  const step1: AdvStepStataSection = {
    stepNumber: 1,
    stepTitle: 'Step 1 — Data Upload and Data Validation',
    methodName: 'Panel Structure Audit, Duplicate Key Detection & Missingness Profiling',
    purpose:
      'Memverifikasi struktur panel dua dimensi (entitas i × waktu t), mendeteksi duplikasi kunci (i, t), memetakan J sumber pengukuran tanpa mengunci referensi, dan memeriksa kecukupan identifikasi awal.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 1: PANEL DATA VALIDATION & IDENTIFIABILITY CHECK',
      '* ======================================================================',
      importBlock,
      'duplicates report panel_ent_id panel_time_id',
      ...(config.dropDuplicatePairs
        ? ['bysort panel_ent_id panel_time_id: keep if _n == 1']
        : []),
      'xtset panel_ent_id panel_time_id',
      'xtdescribe',
      `misstable summarize ${srcVarList}`,
      `egen byte n_nonmiss = rownonmiss(${srcVarList})`,
      `count if n_nonmiss == ${sources.length}`
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'duplicates report panel_ent_id panel_time_id',
        explanation: 'Mendeteksi apakah terdapat lebih dari satu rekaman pada sel entitas-waktu yang sama sebelum deklarasi xtset.'
      },
      {
        command: 'xtset panel_ent_id panel_time_id / xtdescribe',
        explanation: 'Mendeklarasikan indeks longitudinal dan memeriksa keseimbangan (balanced vs unbalanced) serta cakupan periode T per entitas.'
      },
      {
        command: `misstable summarize ${srcVarList}`,
        explanation: 'Menghitung jumlah dan proporsi observasi hilang pada masing-masing sumber pengukuran.'
      }
    ],
    requiredInputs: `Kolom entitas (${profile.entityColumn}), kolom waktu (${profile.timeColumn}), dan minimal J ≥ 3 kolom sumber numerik (${sources.map(s => s.label).join(', ')}).`,
    expectedOutputs: 'Tabel frekuensi duplikat, pola keseimbangan panel xtdescribe, ringkasan missingness per sumber, dan hitungan pasangan complete-case.',
    howToReadOutput:
      'Pastikan surplus copies pada duplicates report bernilai 0 dan jumlah pasangan lengkap N_CC cukup besar (disarankan ≥ 15–30) dengan J ≥ 3 sumber.',
    pointByPointInterpretation: [
      `Dataset memuat G = ${profile.nEntities} entitas, T = ${profile.nPeriods} periode, dan J = ${profile.nSources} sumber pengukuran (${profile.isBalancedPanel ? 'Panel Seimbang' : 'Panel Tidak Seimbang'}).`,
      `Pasangan complete-case valid: N_CC = ${profile.nCompletePairs} dari ${profile.nRowsRaw} baris mentah (${profile.duplicatePairKeys.length} kunci duplikat terdeteksi).`,
      profile.missingnessPatternNote
    ],
    assumptions: [
      'Baris mewakili unit entitas dan periode waktu yang terdefinisi secara konsisten di seluruh sumber.',
      'Tidak ada sumber pengukuran yang diperlakukan sebagai Ground Truth bebas galat.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: true,
      internalEngineMethod: 'Deterministic Panel Grid & Missingness/Scale Profiler',
      whyNoExactNativeStata: 'Seluruh pemeriksaan struktur panel, duplikasi, dan missingness tersedia langsung secara native di Stata.',
      closestStataAlternative: 'xtset, xtdescribe, duplicates report, misstable summarize',
      expectedNumericalDifferences: 'Identik secara eksak pada jumlah entitas G, periode T, duplikat, dan jumlah pasangan complete-case.'
    },
    nextStepRecommendation:
      profile.nSources >= 3
        ? 'Lanjutkan ke Step 2 untuk meninjau rekomendasi otomatis 12 komponen metodologi berdasarkan profil empiris data ini.'
        : 'PERINGATAN KRITIS: Tambahkan minimal 1 sumber pengukuran lagi (hingga J ≥ 3) agar model pengukuran laten teridentifikasi.'
  };

  // STEP 2
  const step2: AdvStepStataSection = {
    stepNumber: 2,
    stepTitle: 'Step 2 — Automatic Data Configuration and Method Recommendation',
    methodName: '12-Component Validity-First Automatic Statistical Decision Engine',
    purpose:
      'Menetapkan spesifikasi model laten, ketergantungan galat, strategi anchor, prior Bayesian, penangan pencilan/missing, dan metode inferensi berdasarkan hierarki validitas dan derajat bebas identifikasi.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 2: EMPIRICAL DATA PROFILING FOR METHOD SELECTION',
      '* ======================================================================',
      `tabstat ${srcVarList}, statistics(count mean sd median iqr min max skewness kurtosis) columns(statistics)`,
      `pwcorr ${srcVarList}, sig obs`,
      `xtsum ${srcVarList}`,
      `scalar J_src = ${sources.length}`,
      'scalar df_cov_indep = (J_src * (J_src + 1) / 2) - (2 * J_src)',
      'display "Covariance DF (Independent Error Model): " df_cov_indep'
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'tabstat ..., statistics(count mean sd median iqr skewness kurtosis)',
        explanation: 'Mengukur rasio sebaran skala antarsumber serta ketidaknormalan ekor untuk memilih transformasi & likelihood.'
      },
      {
        command: 'xtsum ...',
        explanation: 'Memisahkan simpangan baku overall, between-entity, dan within-entity guna memilih struktur laten dua-arah.'
      },
      {
        command: 'scalar df_cov_indep = (J_src*(J_src+1)/2) - 2*J_src',
        explanation: 'Menghitung derajat bebas identifikasi matriks kovarians: bernilai negatif bila J < 3, tepat 0 bila J = 3, dan positif bila J ≥ 4.'
      }
    ],
    requiredInputs: 'Dataset panel tervalidasi dari Step 1.',
    expectedOutputs: 'Matriks momen deskriptif lintas-sumber, dekomposisi varians panel xtsum, dan skalar derajat bebas kovarians.',
    howToReadOutput:
      'Jika df_cov_indep < 0 maka model faktor bebas-referensi tidak teridentifikasi; jika df_cov_indep == 0 (J=3) model tepat teridentifikasi untuk galat independen namun tidak dapat mengestimasi kovarians galat bebas tanpa informasi tambahan.',
    pointByPointInterpretation: [
      `Struktur laten terpilih: ${config.latentStructure}; model ketergantungan: ${config.dependencyModel}; anchor utama: ${config.anchorStrategy}.`,
      `Strategi skala/transformasi: ${config.transformation}; strategi pencilan: ${config.outlierStrategy}.`,
      `Inferensi komparatif: ${config.standardErrorMethod} + ${config.bootstrapMethod} (${config.bootstrapReplications} replikasi).`
    ],
    assumptions: [
      'Pemilihan otomatis mengutamakan validitas identifikasi di atas kecocokan numerik semata.',
      'Pengguna dapat melakukan manual override dengan pencatatan deviasi transparan.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: false,
      internalEngineMethod: 'Rule- & Diagnostic-Driven 12-Dimension Decision Engine',
      whyNoExactNativeStata: 'Stata menyediakan statistik diagnostik penyusun (tabstat, xtsum, pwcorr), namun tidak memiliki orkestrator keputusan otomatis 12 dimensi bawaan.',
      closestStataAlternative: 'Skrip kondisional .do berbasis skalar r() dari xtsum, tabstat, dan misstable.',
      expectedNumericalDifferences: 'Statistik momen dasar identik; keputusan konfigurasi di Stata memerlukan aturan if/else eksplisit.'
    },
    nextStepRecommendation: 'Lanjutkan ke Step 3 untuk mengaudit distribusi per sumber, deteksi pencilan Panel MAD/IQR, dan dampak transformasi terhadap estimand.'
  };

  // STEP 3
  const transformStataLine =
    config.transformation === 'log1p'
      ? srcVars.map(sv => `gen double tr_${sv.vName} = ln(1 + ${sv.vName})`).join('\n')
      : config.transformation === 'log'
        ? srcVars.map(sv => `gen double tr_${sv.vName} = ln(${sv.vName})`).join('\n')
        : config.transformation === 'sqrt'
          ? srcVars.map(sv => `gen double tr_${sv.vName} = sqrt(${sv.vName})`).join('\n')
          : config.transformation === 'z_standardize'
            ? srcVars.map(sv => `egen double tr_${sv.vName} = std(${sv.vName})`).join('\n')
            : srcVars.map(sv => `gen double tr_${sv.vName} = ${sv.vName}`).join('\n');
  const trVarList = srcVars.map(sv => `tr_${sv.vName}`).join(' ');

  const step3: AdvStepStataSection = {
    stepNumber: 3,
    stepTitle: 'Step 3 — Preprocessing and Transformation',
    methodName: 'Within-Entity Panel MAD/IQR Outlier Audit & Estimand-Aware Transformation Selection',
    purpose:
      'Memeriksa pencilan dalam-entitas tanpa mencampur heterogenitas ukuran entitas, serta mengevaluasi 10 kandidat skala/transformasi secara ketat berdasarkan pelestarian estimand pengukuran.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 3: PANEL MAD OUTLIER AUDIT & WORKING SCALE PREPARATION',
      '* ======================================================================',
      ...srcVars.map(
        sv =>
          `bysort panel_ent_id: egen double med_${sv.vName} = median(${sv.vName})\n` +
          `gen double absdev_${sv.vName} = abs(${sv.vName} - med_${sv.vName})\n` +
          `bysort panel_ent_id: egen double mad_${sv.vName} = median(absdev_${sv.vName})\n` +
          `gen byte mad_flag_${sv.vName} = (absdev_${sv.vName} / (1.4826 * mad_${sv.vName} + 1e-6)) > 3.5 if !missing(${sv.vName})`
      ),
      `tabstat ${ srcVars.map(sv => `mad_flag_${sv.vName}`).join(' ') }, statistics(sum mean)`,
      transformStataLine
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'bysort panel_ent_id: egen med_... = median(...) / mad_...',
        explanation: 'Menghitung median dan MAD spesifik entitas agar pencilan dinilai relatif terhadap trajektori masing-masing entitas, bukan rataan gabungan.'
      },
      {
        command: transformStataLine.split('\n')[0] || 'gen double tr_...',
        explanation: `Membangun variabel skala kerja aktif (${config.transformation}) sesuai keputusan metodologi.`
      }
    ],
    requiredInputs: 'Kolom sumber numerik dan indeks panel_ent_id.',
    expectedOutputs: 'Hitungan flag pencilan Panel MAD per sumber dan variabel skala kerja tr_*.',
    howToReadOutput:
      'Nilai sum pada mad_flag_* menunjukkan banyak titik ekstrem dalam-entitas (> 3.5 MAD). Perhatikan apakah transformasi mempertahankan satuan fisik asli atau mengubah estimand ke skala relatif/terstandardisasi.',
    pointByPointInterpretation: [
      `Rasio sebaran simpangan baku mentah antarsumber = ${profile.scaleSpreadRatioRaw.toFixed(2)}x; |t| heteroskedastisitas proporsional = ${profile.crossScaleHeteroscedasticityAbsT.toFixed(2)}.`,
      `Total observasi ekstrem berdasarkan Panel MAD (>3.5σ_MAD): ${profile.totalPanelMadOutliers} sel.`,
      `Transformasi aktif: ${config.transformation} (Skala kerja: ${profile.workingScaleLabel}).`
    ],
    assumptions: [
      'Uji Grubbs klasik tidak digunakan sebagai default karena data panel memiliki efek tetap entitas dan korelasi berulang.',
      'Transformasi nonlinier (log, Box-Cox, Yeo-Johnson) mengubah arti parameter bias α_j dan galat σ_j ke skala tertransformasi.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: config.transformation !== 'yeo_johnson',
      internalEngineMethod: 'Raymaekers & Rousseeuw (2021) Central Normality Power Evaluator + Panel Within-Entity MAD',
      whyNoExactNativeStata:
        config.transformation === 'yeo_johnson'
          ? 'Stata menyediakan bcskew0/lnskew0 untuk Box-Cox & shifted-log klasik, namun objektif robust central normality Yeo-Johnson (Raymaekers & Rousseeuw, 2021) dieksekusi di mesin internal.'
          : 'Operasi median/MAD per entitas dan transformasi standar tersedia langsung di Stata.',
      closestStataAlternative: 'bysort panel_ent_id: egen median() + bcskew0 / std()',
      expectedNumericalDifferences: 'Identik untuk skala asli, log, log1p, sqrt, dan z-score; berbeda tipis pada estimasi λ Yeo-Johnson robust.'
    },
    nextStepRecommendation: 'Lanjutkan ke Step 4 untuk mengestimasi model pengukuran laten Bayesian dan memeriksa diagnostik konvergensi Vehtari (2021).'
  };

  // STEP 4
  const step4: AdvStepStataSection = {
    stepNumber: 4,
    stepTitle: 'Step 4 — Latent Measurement Model',
    methodName: 'Bayesian Hierarchical Congeneric Latent Factor Model with Vehtari (2021) MCMC Diagnostics',
    purpose:
      'Mengestimasi sinyal laten panel θ_it, bias spesifik sumber α_j, sensitivitas skala λ_j, dan simpangan baku galat σ_j tanpa menunjuk satu pun sumber sebagai kebenaran mutlak.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 4: CONGENERIC LATENT MEASUREMENT MODEL (GSEM & BAYES)',
      '* ======================================================================',
      `keep if n_nonmiss == ${sources.length}`,
      '* 1) Frequentist Congeneric SEM with Entity-Clustered Robust SE (Marker Anchor on Source 1):',
      `gsem (Theta -> (${trVarList})), var(Theta@1) vce(cluster panel_ent_id)`,
      'estat sd',
      '* 2) Native Stata Bayesian SEM (Random-Walk Metropolis-Hastings):',
      `bayes, rseed(20261125) mcmcsize(${Math.max(500, estimation.mcmcDiagnostics.totalPostWarmupDraws)}) burnin(${estimation.mcmcDiagnostics.warmupPerChain}) nchains(${estimation.mcmcDiagnostics.nChains}): ///`,
      `  gsem (Theta -> ${srcVars.map((sv, idx) => (idx === 0 ? `tr_${sv.vName}@1` : `tr_${sv.vName}`)).join(' ')})`,
      'bayesstats summary',
      'bayesstats ess',
      'bayesstats grubin'
    ].join('\n'),
    codeWalkthrough: [
      {
        command: `gsem (Theta -> (${trVarList})), var(Theta@1) vce(cluster panel_ent_id)`,
        explanation: 'Menaksir model faktor kongenerik melalui kuasi-likelihood maksimum dengan standar error terklaster pada level entitas.'
      },
      {
        command: 'bayes, nchains(...) mcmcsize(...) burnin(...): gsem ...',
        explanation: 'Menjalankan estimasi MCMC multi-rantai di Stata 17/18 untuk memperoleh distribusi posterior parameter sumber.'
      },
      {
        command: 'bayesstats grubin / bayesstats ess',
        explanation: 'Menampilkan statistik Gelman-Rubin klasik dan ukuran sampel efektif (ESS) di Stata.'
      }
    ],
    requiredInputs: 'Minimal J ≥ 3 variabel sumber pada sel complete-case.',
    expectedOutputs: 'Estimasi posterior intercept α_j, loading λ_j, varians error σ²_j, dekomposisi varians θ_it, serta diagnostik R-hat dan ESS.',
    howToReadOutput:
      'Periksa konvergensi terlebih dahulu: Rank-Normalized Split R-hat dan Folded R-hat wajib ≤ 1.05–1.08 dengan Bulk-ESS dan Tail-ESS memadai sebelum menginterpretasikan parameter α_j, λ_j, dan σ_j.',
    pointByPointInterpretation: [
      estimation.mcmcDiagnostics.convergenceNote,
      `Dekomposisi varians sinyal laten θ_it: Antar-Entitas = ${estimation.latentVarianceDecomposition.betweenEntitySharePct.toFixed(1)}%, Antar-Periode = ${estimation.latentVarianceDecomposition.betweenTimeSharePct.toFixed(1)}%, Persistensi AR(1) φ = ${estimation.latentVarianceDecomposition.temporalPersistencePhi.toFixed(3)}.`,
      ...estimation.sourceParameters.map(
        sp =>
          `${sp.sourceLabel} (${sp.sourceName}): α = ${sp.biasAlpha.toFixed(4)}, λ = ${sp.loadingLambda.toFixed(4)}, σ_ε = ${sp.errorSd.toFixed(4)} (95% CrI [${sp.errorSdCrILower.toFixed(4)}, ${sp.errorSdCrIUpper.toFixed(4)}]), Reliabilitas R² = ${(sp.reliabilityR2 * 100).toFixed(2)}%.`
      )
    ],
    assumptions: [
      'Hubungan linier pada skala kerja antara sinyal laten θ_it dan masing-masing instrumen Y_itj.',
      'Konstrain identifikasi skala dan lokasi diterapkan secara eksplisit melalui rezim anchor yang dipilih.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: false,
      internalEngineMethod:
        'Marginalized Woodbury Multi-Chain Sampler + Half-t Priors + Symmetric Geometric-Mean Consensus Anchor + Vehtari et al. (2021) Split/Folded R-hat',
      whyNoExactNativeStata:
        'Perintah bawaan `bayes: gsem` di Stata menggunakan sampler Metropolis-Hastings kondisional dengan marker anchor variabel pertama (`@1`) dan Gelman-Rubin klasik (1992), belum menyediakan konstrain nonlinear `GeoMean(λ)=1` langsung atau diagnostik rank-normalized/folded R-hat Vehtari (2021).',
      closestStataAlternative: '`bayes, nchains(4): gsem ...` diikuti `bayesstats grubin` + skrip Stan/R pendamping di Step 9.',
      expectedNumericalDifferences:
        'Rasio presisi bebas-lokasi σ_j/|λ_j| konsisten antara Stata gsem dan mesin internal, sedangkan nilai absolut α_j dan λ_j mengikuti skala marker anchor pada Stata kecuali dinormalisasi ulang pasca-estimasi.'
    },
    nextStepRecommendation: 'Lanjutkan ke Step 5 untuk memeriksa matriks korelasi residual antarsumber, autokorelasi temporal AR(1), dan seleksi model ketergantungan via WAIC/PSIS-LOO.'
  };

  // STEP 5
  const covOptionExample =
    srcVars.length >= 4
      ? `gsem (Theta -> ${trVarList}), var(Theta@1) cov(e.tr_${srcVars[0].vName}*e.tr_${srcVars[1].vName}) vce(cluster panel_ent_id)`
      : `* Catatan Identifikasi: Pada J = ${srcVars.length}, penambahan cov(e.y1*e.y2) melampaui df_cov = 0 (underidentified tanpa prior penyusutan BSEM)`;

  const step5: AdvStepStataSection = {
    stepNumber: 5,
    stepTitle: 'Step 5 — Dependency and Error Structure Analysis',
    methodName: 'Residual Covariance Audit, Temporal AR(1) Persistence & Marginal WAIC / PSIS-LOO Model Selection',
    purpose:
      'Menguji apakah asumsi independensi bersyarat galat pengukuran dilanggar oleh metode/algoritma bersama antarsumber atau korelasi serial dalam-entitas, serta memilih struktur ketergantungan yang teridentifikasi.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 5: ERROR DEPENDENCY & CORRELATED RESIDUAL DIAGNOSTICS',
      '* ======================================================================',
      `quietly gsem (Theta -> (${trVarList})), var(Theta@1) vce(cluster panel_ent_id)`,
      'predict double theta_eb, latent(Theta)',
      ...srcVars.map(
        sv =>
          `quietly regress tr_${sv.vName} theta_eb\npredict double res_${sv.vName}, residuals`
      ),
      `pwcorr ${srcVars.map(sv => `res_${sv.vName}`).join(' ')}, sig`,
      'xtset panel_ent_id panel_time_id',
      ...srcVars.map(
        sv => `capture noisily regress res_${sv.vName} L.res_${sv.vName}, vce(cluster panel_ent_id)`
      ),
      covOptionExample,
      'estat ic'
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'predict double theta_eb, latent(Theta) / pwcorr res_*, sig',
        explanation: 'Mengekstrak prediksi empiris sinyal laten dan memeriksa korelasi residual berpasangan antarsumber.'
      },
      {
        command: 'regress res_j L.res_j, vce(cluster panel_ent_id)',
        explanation: 'Mengukur koefisien autokorelasi galat pengukuran tingkat pertama AR(1) ρ_j pada masing-masing sumber.'
      },
      {
        command: covOptionExample,
        explanation: 'Menguji model kovarians galat eksplisit hanya apabila derajat bebas kovarians mengizinkan (J ≥ 4).'
      }
    ],
    requiredInputs: 'Estimasi faktor laten dari Step 4 dan urutan waktu panel_time_id.',
    expectedOutputs: 'Matriks korelasi residual antarsumber, koefisien AR(1) ρ_j per sumber, dan perbandingan kriteria informasi kandidat model M1–M4.',
    howToReadOutput:
      'Korelasi residual positif yang besar (|r| > 0.25) antara dua sumber menandakan keduanya berbagi gangguan sistematis sehingga konsensus naif berisiko bias ke arah pasangan kembar tersebut.',
    pointByPointInterpretation: [
      `Model ketergantungan terpilih: ${estimation.activeDependencyModel} (Marginal WAIC = ${estimation.mcmcDiagnostics.marginalWaic.toFixed(2)}, PSIS-LOO ELPD = ${estimation.mcmcDiagnostics.psisLooElpd.toFixed(2)}, max Pareto-k = ${estimation.mcmcDiagnostics.psisMaxParetoK.toFixed(3)}).`,
      estimation.flaggedResidualPairs.length > 0
        ? `Terdeteksi ${estimation.flaggedResidualPairs.length} pasangan sumber dengan korelasi residual menonjol: ${estimation.flaggedResidualPairs.map(p => `${p.sourceALabel}–${p.sourceBLabel} (r = ${p.corr.toFixed(3)})`).join('; ')}.`
        : 'Tidak ditemukan pasangan sumber dengan korelasi residual ekstrem (|r| ≤ 0.25).',
      `Rentang persistensi galat serial AR(1) lintas sumber: ${Math.min(...estimation.sourceParameters.map(s => s.ar1RhoResidual)).toFixed(3)} s.d. ${Math.max(...estimation.sourceParameters.map(s => s.ar1RhoResidual)).toFixed(3)}.`
    ],
    assumptions: [
      'J ≥ 4 bukanlah jaminan otomatis bahwa seluruh kovarians galat bebas teridentifikasi; hanya pasangan kovarians jarang dengan df_cov ≥ 0 yang diizinkan.',
      'Perbandingan model variabel laten menggunakan Marginal WAIC (Merkle et al., 2019).'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: false,
      internalEngineMethod: 'Identifiability-Gated M1–M4 Candidate Evaluation via Marginal WAIC & PSIS-LOO (Vehtari et al., 2017)',
      whyNoExactNativeStata: 'Stata `estat ic` dan `bayesstats ic` menghitung AIC/BIC/DIC/LML, namun belum menyediakan PSIS-LOO Pareto-k atau Marginal WAIC yang diintegrasikan atas faktor laten.',
      closestStataAlternative: '`gsem ..., cov(e.y1*e.y2)` + `estat ic` / `lrtest` untuk model bersarang teridentifikasi.',
      expectedNumericalDifferences: 'Arah pemilihan parsimoni konsisten dengan BIC/AIC Stata ketika penalti parameter diterapkan.'
    },
    nextStepRecommendation: 'Lanjutkan ke Step 6 untuk melihat pemeringkatan probabilistik sumber beserta kurva peluang kumulatif P(R_j ≤ k) dan uji sensitivitas multi-anchor.'
  };

  // STEP 6
  const step6: AdvStepStataSection = {
    stepNumber: 6,
    stepTitle: 'Step 6 — Source Ranking and Uncertainty',
    methodName: 'Dual-Estimand Probabilistic Ranking & Multi-Anchor Sensitivity Analysis',
    purpose:
      'Memeringkatkan sumber berdasarkan distribusi posterior penuh — membandingkan Anchor-Conditioned Total RMSE terhadap Scale-Adjusted Precision Ratio R_j = σ_j/|λ_j| serta menguji ketahanan peringkat di seluruh rezim anchor.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 6: SCALE-INVARIANT PRECISION RATIO & ANCHOR SENSITIVITY',
      '* ======================================================================',
      '* Loop across every eligible Marker Anchor k = 1..J:',
      ...srcVars.map((anchorSv, aIdx) => {
        const rhs = srcVars
          .map((sv, idx) => (idx === aIdx ? `(tr_${sv.vName}@1 _cons@0)` : `tr_${sv.vName}`))
          .join(' ');
        const nlExprs = srcVars
          .map(
            (sv, idx) =>
              `(R_${idx + 1}: sqrt(_b[/var(e.tr_${sv.vName})]) / abs(${idx === aIdx ? '1' : `_b[tr_${sv.vName}:Theta]`}))`
          )
          .join(' ');
        return [
          `* --- Anchor Regime ${aIdx + 1}: Marker on ${anchorSv.source.label} ---`,
          `quietly gsem (Theta -> ${rhs}), vce(cluster panel_ent_id)`,
          `nlcom ${nlExprs}`
        ].join('\n');
      })
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'gsem (Theta -> (tr_k@1 _cons@0) ...)',
        explanation: 'Mengestimasi ulang model laten dengan menetapkan masing-masing sumber ke-k sebagai anchor skala dan lokasi secara bergiliran.'
      },
      {
        command: 'nlcom (R_j: sqrt(var(e.tr_j)) / abs(lambda_j))',
        explanation: 'Menghitung rasio presisi bebas-lokasi R_j = σ_j/|λ_j| beserta standar error metode delta pada setiap rezim anchor.'
      }
    ],
    requiredInputs: 'Hasil estimasi model laten dari Step 4–5.',
    expectedOutputs: 'Tabel perbandingan R_j dan Total RMSE lintas J+2 anchor, probabilitas P(R_j = 1 | Y), P(R_j ≤ k | Y), Expected Rank, dan Entropi Peringkat.',
    howToReadOutput:
      'Perhatikan P(R_j = 1 | Y), tumpang-tindih 95% CrI, dan Kendall’s W lintas anchor. Apabila sumber berperingkat #1 berganti ketika anchor digeser atau CrI bertumpang tindih lebar, sistem wajib menyatakan hasil sensitif/seri secara statistik.',
    pointByPointInterpretation: [
      `Status keputusan pemeringkatan: ${ranking.verdictStatus} — ${ranking.rankingSynthesisNarrative}`,
      topRow
        ? `Kandidat teratas: ${topRow.sourceLabel} dengan Anchor Total RMSE = ${topRow.anchorTotalRmse.toFixed(4)} [${topRow.anchorTotalRmseCrI[0].toFixed(4)}, ${topRow.anchorTotalRmseCrI[1].toFixed(4)}], Rasio R_j = ${topRow.scaleAdjustedNoiseRatio.toFixed(4)}, P(Rank=1) = ${(topRow.probRank1 * 100).toFixed(1)}%, E[Rank] = ${topRow.expectedRank.toFixed(2)}, Entropi = ${topRow.rankEntropyNormalized.toFixed(3)}.`
        : 'Pemeringkatan tidak tersedia.',
      estimation.anchorSensitivity.interpretation
    ],
    assumptions: [
      'R_j = σ_j/|λ_j| mengukur presisi sinyal-ke-derau bebas-skala dan tidak menghukum pergeseran aditif konstan α_j.',
      'Total RMSE menghukum bias lokasi α_j relatif terhadap konvensi titik nol anchor yang dipilih.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: false,
      internalEngineMethod: 'Posterior Draw-by-Draw Ranking Matrix (P(R_j<=k), Entropy) + J+2 Anchor Concordance (Kendall’s W)',
      whyNoExactNativeStata: 'Stata `nlcom` memberikan estimasi titik dan SE delta-method per anchor, sedangkan probabilitas urutan simultan P(R_j ≤ k | Y) dan entropi Shannon memerlukan matriks undian posterior penuh.',
      closestStataAlternative: 'Loop `gsem` + `nlcom` (frequentist) atau pemrosesan dataset simpanan MCMC `bayes, saving(...)` di Stata.',
      expectedNumericalDifferences: 'Invariansi R_j = σ_j/|λ_j| lintas marker anchor di `nlcom` terbukti identik secara matematis dengan mesin internal.'
    },
    nextStepRecommendation: 'Lanjutkan ke Step 7 untuk memvalidasi konsistensi lintas-sumber via LOSO beraudit kovarians, Pair Fixed Effects terkoreksi Holm, dan Mixed-Effects Bland-Altman LoA.'
  };

  // STEP 7
  const step7: AdvStepStataSection = {
    stepNumber: 7,
    stepTitle: 'Step 7 — Validation and Comparative Diagnostics',
    methodName: 'Covariance-Audited LOSO, Pair Fixed Effects with Holm (1979) & Webb Wild Cluster Bootstrap, and Mixed-Effects LoA',
    purpose:
      'Menguji apakah keunggulan relatif sumber bertahan pada prediksi Leave-One-Source-Out, kontras Pair Fixed Effects yang mengendalikan familywise error rate, serta analisis kesepakatan pengukuran berulang.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 7: PAIR FIXED EFFECTS, HOLM FWER, WILD BOOTSTRAP & MIXED LOA',
      '* ======================================================================',
      '* 1) Repeated-Measures Mixed-Effects Bland-Altman Variance Components (Parker et al., 2020):',
      ...srcVars.map(
        sv =>
          `gen double diff_${sv.vName} = tr_${sv.vName} - theta_eb\n` +
          `mixed diff_${sv.vName} || panel_ent_id:, reml\n` +
          'estat icc'
      ),
      '* 2) Reshape to Long Panel-Source Format for Pair Fixed Effects:',
      'preserve',
      'egen long pair_cell_id = group(panel_ent_id panel_time_id)',
      ...srcVars.map((sv, idx) => `gen double abs_err_${idx + 1} = abs(tr_${sv.vName} - theta_eb)`),
      'keep pair_cell_id panel_ent_id panel_time_id abs_err_*',
      'reshape long abs_err_, i(pair_cell_id) j(source_num)',
      'xtset pair_cell_id source_num',
      'xtreg abs_err_ i.source_num, fe vce(cluster panel_ent_id)',
      `testparm i.source_num, mtest(holm)`,
      '* Optional SSC packages for Driscoll-Kraay HAC & Webb 6-Point Wild Cluster Bootstrap:',
      '* ssc install xtscc',
      '* ssc install boottest',
      `capture noisily boottest 2.source_num, cluster(panel_ent_id) weighttype(webb) reps(${config.bootstrapReplications}) seed(20261125)`,
      'restore'
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'mixed diff_j || panel_ent_id:, reml',
        explanation: 'Menaksir komponen varians selisih antar-entitas (σ²_b) dan dalam-entitas (σ²_w) sehingga batas kesepakatan ±1.96√(σ²_b+σ²_w) sah untuk data berulang.'
      },
      {
        command: 'xtreg abs_err_ i.source_num, fe vce(cluster panel_ent_id)',
        explanation: 'Estimasi Pair Fixed Effects yang menyerap seluruh guncangan spesifik sel (i, t) saat membandingkan magnitudo deviasi antarsumber.'
      },
      {
        command: 'testparm i.source_num, mtest(holm) / boottest ..., weighttype(webb)',
        explanation: 'Mengendalikan inflasi galat Tipe I akibat perbandingan berganda dengan prosedur sekuensial Holm (1979) serta inferensi wild bootstrap klaster kecil.'
      }
    ],
    requiredInputs: 'Sinyal laten θ̂_it dan pengamatan skala kerja tr_* pada sel complete-case.',
    expectedOutputs: 'Tabel LOSO dengan audit kovarians, statistik F omnibus Pair FE, kontras berpasangan dengan p-value terkoreksi Holm & interval simultan, serta Mixed-Effects LoA dan CCC.',
    howToReadOutput:
      'Pasangan sumber hanya dinyatakan berbeda signifikan secara familywise apabila p_Holm < 0.05 dan interval kepercayaan simultan 95% tidak memuat nol.',
    pointByPointInterpretation: [
      validation.seSelectionRationale,
      `Pair Fixed Effects Omnibus F = ${validation.pairFeOmnibusF.toFixed(3)} (p asimtotik = ${validation.pairFeOmnibusP.toFixed(4)}, p Wild Bootstrap = ${validation.pairFeOmnibusWildP.toFixed(4)}).`,
      `Dari m = ${validation.holmFamilySize} kontras berpasangan, terdapat ${validation.pairwiseHolmContrasts.filter(c => c.significantFamilywise05).length} pasangan berbeda signifikan pasca-koreksi Holm (α_FWER = 0.05).`
    ],
    assumptions: [
      'Identitas varians LOSO memperhitungkan suku kovarians 2·λ_j·Cov(ε_j, θ̂_-j).',
      'Pada J = 3, sub-model LOSO hanya menyisakan 2 sumber sehingga bersifat komparatif terbatas.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: true,
      internalEngineMethod: 'Exact Within-Pair FE + Cluster/Two-Way/DK SE + Webb/Rademacher Wild Bootstrap + Holm Step-Down + REML/ANOVA Mixed LoA',
      whyNoExactNativeStata: 'Seluruh komponen inferensi memiliki padanan langsung di Stata (`xtreg, fe`, `test, mtest(holm)`, `mixed`, serta paket SSC resmi `boottest` dan `xtscc`).',
      closestStataAlternative: '`xtreg ..., fe vce(cluster ...)`, `test ..., mtest(holm)`, `mixed`, SSC `boottest`, SSC `concord`',
      expectedNumericalDifferences: 'Kontras rataan Pair FE dan pengali koreksi Holm identik; nilai-p Wild Bootstrap dapat berbeda ≤ 0.01 karena perbedaan generator bilangan acak.'
    },
    nextStepRecommendation: 'Lanjutkan ke Step 8 untuk menguji batas epistemologis Common-Mode Bias (10 skenario) dan memverifikasi performa metode melalui simulasi Monte Carlo 7 keluarga.'
  };

  // STEP 8
  const step8: AdvStepStataSection = {
    stepNumber: 8,
    stepTitle: 'Step 8 — Robustness and Monte Carlo Validation',
    methodName: '10-Scenario Common-Mode Bias Audit & 7-Family Calibrated Monte Carlo Simulation (Morris et al., 2019)',
    purpose:
      'Membuktikan secara empiris kapan model berhasil memulihkan urutan akurasi sejati (coverage, power, ranking recovery) dan kapan model gagal akibat common-mode bias bersama atau underidentification.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 8: MONTE CARLO SIMULATION & COMMON-MODE BIAS CHECK',
      '* ======================================================================',
      'capture program drop sim_panel_latent_mc',
      'program define sim_panel_latent_mc, rclass',
      '  version 17.0',
      '  drop _all',
      `  set obs ${monteCarlo.calibratedDimensions.G * monteCarlo.calibratedDimensions.T}`,
      `  gen long ent = ceil(_n / ${monteCarlo.calibratedDimensions.T})`,
      '  gen double theta = rnormal(100, 15)',
      '  gen double common_bias = 12.0   // Shared systematic bias absorbed into latent mean!',
      '  gen double y1 = theta + common_bias + rnormal(0, 2.0)',
      '  gen double y2 = theta + common_bias + rnormal(0, 5.0)',
      '  gen double y3 = theta + common_bias + rnormal(0, 9.0)',
      '  quietly gsem (L -> y1@1 y2 y3)',
      '  return scalar sd1 = sqrt(_b[/var(e.y1)])',
      '  return scalar sd2 = sqrt(_b[/var(e.y2)])',
      '  return scalar sd3 = sqrt(_b[/var(e.y3)])',
      '  return scalar top1_recovered = (return(sd1) < return(sd2)) & (return(sd1) < return(sd3))',
      'end',
      'simulate sd1=r(sd1) sd2=r(sd2) sd3=r(sd3) top1=r(top1_recovered), reps(50) seed(20268801): sim_panel_latent_mc',
      'summarize'
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'program define sim_panel_latent_mc, rclass / simulate ..., reps(50)',
        explanation: 'Menjalankan eksperimen simulasi Monte Carlo terkontrol di Stata untuk mengukur tingkat pemulihan peringkat #1 dan dampak bias bersama.'
      }
    ],
    requiredInputs: `Dimensi terkalibrasi dari dataset aktif (G = ${monteCarlo.calibratedDimensions.G}, T = ${monteCarlo.calibratedDimensions.T}, J = ${monteCarlo.calibratedDimensions.J}).`,
    expectedOutputs: 'Metrik kinerja 15 skenario Monte Carlo (bias, RMSE, cakupan 95%, pemulihan peringkat #1, galat Tipe I, kuasa uji) dan 10 skenario Common-Mode Bias.',
    howToReadOutput:
      'Cakupan interval 95% yang sehat berada di sekitar 90–97%, galat Tipe I di sekitar ≤ 5–8%, sedangkan skenario J=2 dan mayoritas sumber berbias identik menunjukkan batas teoretis metode bebas-referensi.',
    pointByPointInterpretation: [
      monteCarlo.overallValidationSummary,
      ranking.commonModeLimitationStatement,
      monteCarlo.missingnessEpistemologicalCaveat
    ],
    assumptions: [
      'Data sintetis Monte Carlo dibangkitkan dari DGP eksplisit dengan kebenaran simulasi yang diketahui hanya di dalam lingkungan eksperimen.',
      'Hasil simulasi memvalidasi properti frekuensi-panjang estimator pada ukuran sampel serupa, bukan membuktikan ketiadaan common-mode bias di dunia nyata.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: true,
      internalEngineMethod: '15-Scenario Calibrated Analytical-Triangulation Monte Carlo Engine (Families A–G)',
      whyNoExactNativeStata: 'Stata mendukung simulasi penuh melalui `simulate` dan `postfile`; waktu eksekusi `gsem` berulang di Stata lebih lambat dibanding estimator analitik vektorisasi internal.',
      closestStataAlternative: '`program define` + `simulate` / `postfile`',
      expectedNumericalDifferences: 'Tingkat pemulihan peringkat dan batas kegagalan identifikasi konsisten secara asimtotik.'
    },
    nextStepRecommendation: 'Lanjutkan ke Step 9 untuk meninjau kesimpulan ilmiah akhir, rujukan literatur terverifikasi, skrip master reproduksibilitas, dan ekspor laporan.'
  };

  // STEP 9
  const step9: AdvStepStataSection = {
    stepNumber: 9,
    stepTitle: 'Step 9 — Final Results and Interpretation',
    methodName: 'Evidence-Gated Scientific Synthesis, Literature Traceability & Multi-Format Reproducible Export',
    purpose:
      'Menyajikan kesimpulan akhir keandalan relatif setiap sumber pengukuran secara jujur beserta ketidakpastian posterior, sensitivitas anchor, batasan epistemologis, dan bundel kode reproduksibilitas lengkap.',
    stataCode: [
      '* ======================================================================',
      '* OPTION 3 - STEP 9: FINAL SUMMARY EXPORT & REPRODUCIBILITY ARCHIVE',
      '* ======================================================================',
      `* Dataset: ${datasetName} | G=${profile.nEntities}, T=${profile.nPeriods}, J=${profile.nSources}, N_CC=${profile.nCompletePairs}`,
      `* Verdict: ${ranking.verdictStatus} | Top Relative Candidate: ${ranking.leaderSourceLabel || 'Inconclusive'}`,
      `quietly gsem (Theta -> (${trVarList})), var(Theta@1) vce(cluster panel_ent_id)`,
      'estimates store opt3_congeneric_sem',
      'estimates table opt3_congeneric_sem, b(%9.4f) se(%9.4f) stats(N ll aic bic)',
      `* Note: For full Marginalized Woodbury Bayesian MCMC + Vehtari (2021) Split/Folded R-hat,`,
      `* run the companion Stan / R script exported alongside this .do file.`
    ].join('\n'),
    codeWalkthrough: [
      {
        command: 'estimates store / estimates table ..., stats(N ll aic bic)',
        explanation: 'Menyusun tabel ringkasan parameter dan statistik kecocokan akhir yang siap dilampirkan pada naskah akademik.'
      }
    ],
    requiredInputs: 'Seluruh bukti empiris dari Step 1–8.',
    expectedOutputs: 'Tabel keputusan akhir keandalan relatif, daftar batasan metodologis, daftar literatur ilmiah terverifikasi, serta dokumen PDF/DOCX/XLSX/Stata/R/Stan.',
    howToReadOutput:
      'Gunakan kesimpulan akhir dengan selalu menyertakan batasan bahwa keandalan yang diukur bersifat relatif terhadap informasi bersama lintas sumber, bukan akurasi absolut terhadap Ground Truth fisik.',
    pointByPointInterpretation: [
      `Keputusan Akhir: ${ranking.verdictStatus} (${ranking.leaderSourceLabel || 'Tidak ada pemimpin tunggal yang terpisah signifikan'}).`,
      ranking.rankingSynthesisNarrative,
      'Prinsip Epistemologis: Tanpa instrumen referensi terkalibrasi atau Ground Truth eksternal, tidak satu pun model statistik murni dapat menyingkirkan kemungkinan bias aditif/skala seragam yang dialami bersama oleh seluruh sumber.'
    ],
    assumptions: [
      'Pelaporan ilmiah wajib mencantumkan baik metrik Total RMSE berjangkar maupun rasio presisi bebas-lokasi R_j = σ_j/|λ_j| beserta 95% CrI.'
    ],
    limitationsAndNativeGap: {
      hasExactNativeStata: false,
      internalEngineMethod: 'Complete 9-Step Bayesian + Frequentist + Monte Carlo Reproducible Synthesis',
      whyNoExactNativeStata: 'Sebagian komponen mutakhir (Marginalized Woodbury sampler, Vehtari 2021 Split/Folded R-hat, Marginal WAIC/PSIS-LOO) tidak tersedia sebagai satu perintah tunggal di Stata standar.',
      closestStataAlternative: 'Kombinasi `gsem`, `bayes: gsem`, `xtreg, fe`, `mixed`, `test, mtest(holm)`, `boottest` [SSC] + skrip R/Stan pendamping.',
      expectedNumericalDifferences: 'Seluruh perbedaan numerik potensial antara pendekatan frequentist Stata dan posterior Bayesian telah didokumentasikan secara transparan di Step 4–7.'
    },
    nextStepRecommendation:
      'Unduh laporan lengkap (PDF/DOCX/XLSX) atau buka tab Komparasi Metodologi (Opsi 2 vs Opsi 3) untuk membandingkan sensitivitas kesimpulan antar-metodologi pada dataset yang sama.'
  };

  void firstVar;
  return [step1, step2, step3, step4, step5, step6, step7, step8, step9];
}

export function generateOption3MasterStataDoFile(sections: AdvStepStataSection[], datasetName: string): string {
  const header = [
    '* ============================================================================',
    '* MASTER STATA 17/18 DO-FILE — OPTION 3: ADVANCED LATENT MEASUREMENT MODEL',
    '* & PANEL ACCURACY VALIDATION (STEPS 1 TO 9)',
    `* Dataset : ${datasetName}`,
    '* Note    : Native Stata commands + explicit SSC/Stan notes where applicable.',
    '* ============================================================================',
    ''
  ].join('\n');
  return header + sections.map(s => s.stataCode).join('\n\n');
}

export function generateOption3RScript(params: {
  datasetName: string;
  preprocessed: AdvPreprocessingBundle;
  config: AdvResolvedConfig;
}): string {
  const { datasetName, preprocessed, config } = params;
  const srcCols = preprocessed.sources.map(s => `"${s.columnKey}"`).join(', ');
  return [
    '# ============================================================================',
    '# COMPANION R SCRIPT — OPTION 3: ADVANCED LATENT MEASUREMENT MODEL',
    '# Packages: readxl, dplyr, cmdstanr/rstan, posterior (Vehtari 2021), loo, lme4',
    '# ============================================================================',
    'library(readxl)',
    'library(posterior) # rhat(), rhat_basic(), ess_bulk(), ess_tail() - Vehtari et al. (2021)',
    'library(loo)       # waic(), loo() - Vehtari, Gelman, & Gabry (2017)',
    'library(lme4)      # lmer() repeated-measures Bland-Altman LoA - Parker et al. (2020)',
    '',
    `df_raw <- read_excel("${datasetName.replace(/"/g, '')}")`,
    `source_cols <- c(${srcCols})`,
    `cat("Active Transformation:", "${config.transformation}", "\\n")`,
    '# Fit Stan model (see companion .stan file) and compute Vehtari (2021) diagnostics:',
    '# draws <- fit$draws()',
    '# summarise_draws(draws, mean, sd, ~quantile(.x, probs = c(0.025, 0.975)), rhat, ess_bulk, ess_tail)',
    '# Pairwise Holm-adjusted p-values:',
    '# p.adjust(raw_p_values, method = "holm")'
  ].join('\n');
}

export function generateOption3StanCode(params: {
  nSources: number;
  priorStrategy: AdvResolvedConfig['priorStrategy'];
}): string {
  const halfTScale = params.priorStrategy === 'SKEPTICAL_BSEM_SHRINKAGE' ? '1.5' : '2.5';
  return [
    '// ===========================================================================',
    '// STAN MODEL — OPTION 3: HIERARCHICAL PANEL CONGENERIC LATENT MODEL',
    '// Symmetric Consensus Identification: GeoMean(lambda) = 1, Sum(alpha) = 0',
    '// Weakly Informative Half-t Priors (Gelman, 2006) + Posterior Ranking Draws',
    '// ===========================================================================',
    'data {',
    '  int<lower=3> J;                    // Number of measurement sources',
    '  int<lower=5> P;                    // Complete-case entity-time cells',
    '  int<lower=2> G;                    // Number of panel entities',
    '  array[P] int<lower=1, upper=G> ent_id;',
    '  matrix[P, J] Y;                    // Working-scale observations',
    '}',
    'parameters {',
    '  vector[G] u_ent_z;',
    '  real<lower=1e-6> sigma_u;',
    '  vector[P] w_cell_z;',
    '  real<lower=1e-6> sigma_w;',
    '  real mu_theta;',
    '  vector[J] alpha_raw;',
    '  vector<lower=0.1>[J] lambda_raw;',
    '  vector<lower=1e-6>[J] sigma_eps;',
    '}',
    'transformed parameters {',
    '  real geo_lam = exp(mean(log(lambda_raw)));',
    '  vector[J] lambda = lambda_raw / geo_lam;',
    '  vector[J] alpha = alpha_raw - mean(alpha_raw);',
    '  vector[P] theta;',
    '  for (p in 1:P)',
    '    theta[p] = mu_theta + sigma_u * u_ent_z[ent_id[p]] + sigma_w * w_cell_z[p];',
    '}',
    'model {',
    '  u_ent_z ~ std_normal();',
    '  w_cell_z ~ std_normal();',
    `  sigma_u ~ student_t(4, 0, ${halfTScale});`,
    `  sigma_w ~ student_t(4, 0, ${halfTScale});`,
    '  log(lambda_raw) ~ normal(0, 0.35);',
    '  alpha_raw ~ normal(0, 5.0);',
    `  sigma_eps ~ student_t(4, 0, ${halfTScale});`,
    '  for (j in 1:J)',
    '    Y[, j] ~ normal(alpha[j] + lambda[j] * theta, sigma_eps[j]);',
    '}',
    'generated quantities {',
    '  real var_theta = variance(theta);',
    '  vector[J] noise_ratio;',
    '  vector[J] anchor_total_rmse;',
    '  for (j in 1:J) {',
    '    noise_ratio[j] = sigma_eps[j] / abs(lambda[j]);',
    '    anchor_total_rmse[j] = sqrt(square(alpha[j]) + square(lambda[j] - 1.0) * var_theta + square(sigma_eps[j]));',
    '  }',
    '}'
  ].join('\n');
}
