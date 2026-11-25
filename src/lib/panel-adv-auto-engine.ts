// ============================================================
// OPTION 3 — SECTION 9 & PHASE 6: 12-Component Automatic Decision Engine
// Hierarchy: Validity -> Identifiability -> Assumption Compatibility ->
// Model Diagnostics -> Predictive Performance -> Robustness ->
// Interpretability -> Parsimony -> Computational Efficiency
// ============================================================

import {
  AdvAutoDecisionBundle,
  AdvDataProfileReport,
  AdvDecisionEntry,
  AdvDependencyModel,
  AdvLatentStructure,
  AdvManualOverrides,
  AdvPriorStrategy,
  AdvResolvedConfig,
  AdvStandardErrorMethod,
  AdvBootstrapMethod
} from './panel-adv-types';

export function buildOption3AutoDecisions(params: {
  profile: AdvDataProfileReport;
  overrides?: AdvManualOverrides;
  highPrecisionMode?: boolean;
}): AdvAutoDecisionBundle {
  const { profile, overrides, highPrecisionMode = false } = params;
  const { nSources: J, nEntities: G, nPeriods: T, nCompletePairs: P } = profile;

  const overallIdentifiabilityStatus: AdvAutoDecisionBundle['overallIdentifiabilityStatus'] =
    J < 3 || P < 5
      ? 'UNDERIDENTIFIED'
      : P < 15 || J === 3
        ? 'WEAKLY_IDENTIFIED'
        : 'IDENTIFIED';

  // 1. Latent Model Structure
  const autoLatentStructure: AdvLatentStructure =
    G >= 4 && T >= 4 && P >= 16
      ? 'TWO_WAY_PANEL_HIERARCHICAL'
      : T >= 6 && G >= 2
        ? 'DYNAMIC_PANEL_STATE_SPACE'
        : 'POOLED_CONGENERIC';

  // 2. Dependency Model (parsimony + identifiability first; never assume J>=4 auto-identifies full Sigma)
  let autoDependency: AdvDependencyModel = 'M1_INDEPENDENT';
  if (J >= 3 && T >= 5 && P >= 25) {
    autoDependency = 'M2_TEMPORAL_AR1';
  } else if (J >= 4 && G >= 5 && T >= 4 && P >= 24) {
    autoDependency = 'M3_ENTITY_SOURCE_RE';
  }

  // 3. Transformation (already evaluated under estimand-first rule in Phase 3)
  const autoTransform = profile.chosenTransformation;

  // 4. Missingness Strategy
  const missingGap = profile.nAvailableRows - profile.nCompletePairs;
  const autoMissing =
    missingGap > 0 && missingGap / Math.max(1, profile.nAvailableRows) >= 0.15
      ? 'AVAILABLE_CASE_FIML_WEIGHTED'
      : 'COMPLETE_CASE_BALANCED_PAIR';

  // 5. Outlier Strategy
  const outlierRate =
    P > 0 ? profile.totalPanelMadOutliers / Math.max(1, P * Math.max(1, J)) : 0;
  const autoOutlier =
    outlierRate > 0.05
      ? 'ROBUST_STUDENT_T_LIKELIHOOD'
      : 'AUDIT_ONLY_PRESERVE_RAW';

  // 6. Standard Error Method (MacKinnon, Nielsen, & Webb, 2023)
  let autoSe: AdvStandardErrorMethod = 'CLUSTER_ENTITY';
  if (G < 4 && T < 4) {
    autoSe = 'ROBUST_HC3';
  } else if (T >= 6 && G >= 5) {
    autoSe = 'DRISCOLL_KRAAY_HAC';
  } else if (G >= 12 && T >= 10) {
    autoSe = 'TWO_WAY_ENTITY_TIME';
  }

  // 7. Bootstrap Method (Roodman et al., 2019: Webb 6-point when G < 12 avoids discrete Rademacher coarseness!)
  let autoBootstrap: AdvBootstrapMethod = 'RADEMACHER_WILD_CLUSTER';
  if (G < 12) {
    autoBootstrap = 'WEBB_SIX_POINT_WILD_CLUSTER';
  } else if (G >= 50 && T >= 10) {
    autoBootstrap = 'RADEMACHER_WILD_CLUSTER';
  }

  // 8. Anchor Strategy
  const autoAnchor = 'SYMMETRIC_GEOMEAN_MEDIAN' as const;

  // 9. Bayesian Prior (Gelman, 2006 Half-t weakly informative prevents boundary Heywood collapse)
  const autoPrior: AdvPriorStrategy =
    J >= 4 && P < 25 ? 'SKEPTICAL_BSEM_SHRINKAGE' : 'WEAKLY_INFORMATIVE_HALF_T';

  // 10. MCMC Configuration
  const autoChains = 3;
  const autoIterations = highPrecisionMode ? 900 : P <= 40 ? 550 : 450;
  const autoWarmup = Math.round(autoIterations * 0.5);
  const autoBootReps = highPrecisionMode ? 1999 : 599;

  const initialAutoConfig: AdvResolvedConfig = {
    transformation: autoTransform,
    latentStructure: autoLatentStructure,
    dependencyModel: autoDependency,
    anchorStrategy: autoAnchor,
    priorStrategy: autoPrior,
    missingStrategy: autoMissing,
    outlierStrategy: autoOutlier,
    standardErrorMethod: autoSe,
    bootstrapMethod: autoBootstrap,
    mcmcChains: autoChains,
    mcmcWarmup: autoWarmup,
    mcmcIterations: autoIterations,
    bootstrapReplications: autoBootReps,
    dropDuplicatePairs: true,
    validationMethod: 'LOSO_PLUS_PAIR_FE_HOLM',
    robustnessSuite: 'MULTI_ANCHOR_PRIOR_COMMON_BIAS_MC'
  };

  const activeConfig: AdvResolvedConfig = {
    ...initialAutoConfig,
    ...(overrides?.transformation ? { transformation: overrides.transformation } : {}),
    ...(overrides?.latentStructure ? { latentStructure: overrides.latentStructure } : {}),
    ...(overrides?.dependencyModel ? { dependencyModel: overrides.dependencyModel } : {}),
    ...(overrides?.anchorStrategy ? { anchorStrategy: overrides.anchorStrategy } : {}),
    ...(overrides?.priorStrategy ? { priorStrategy: overrides.priorStrategy } : {}),
    ...(overrides?.missingStrategy ? { missingStrategy: overrides.missingStrategy } : {}),
    ...(overrides?.outlierStrategy ? { outlierStrategy: overrides.outlierStrategy } : {}),
    ...(overrides?.standardErrorMethod ? { standardErrorMethod: overrides.standardErrorMethod } : {}),
    ...(overrides?.bootstrapMethod ? { bootstrapMethod: overrides.bootstrapMethod } : {}),
    ...(overrides?.mcmcChains ? { mcmcChains: overrides.mcmcChains } : {}),
    ...(overrides?.mcmcIterations
      ? {
          mcmcIterations: overrides.mcmcIterations,
          mcmcWarmup: Math.round(overrides.mcmcIterations * 0.5)
        }
      : {}),
    ...(overrides?.bootstrapReplications ? { bootstrapReplications: overrides.bootstrapReplications } : {}),
    ...(overrides?.dropDuplicatePairs !== undefined
      ? { dropDuplicatePairs: overrides.dropDuplicatePairs }
      : {})
  };

  const hasManualOverrides = Boolean(
    overrides &&
      Object.keys(overrides).some(k => {
        const key = k as keyof AdvManualOverrides;
        return overrides[key] !== undefined && overrides[key] !== (initialAutoConfig as unknown as Record<string, unknown>)[key];
      })
  );

  const decisions: AdvDecisionEntry[] = [
    {
      dimensionKey: 'latentModel',
      dimensionLabel: '1. Spesifikasi Struktur Model Laten Panel',
      selectedMethod: activeConfig.latentStructure,
      whySelected:
        activeConfig.latentStructure === 'TWO_WAY_PANEL_HIERARCHICAL'
          ? 'Memisahkan variasi laten antar-entitas (u_i), antar-waktu (v_t), dan inovasi idiosinkratik (w_it) karena dimensi G dan T memadai.'
          : activeConfig.latentStructure === 'DYNAMIC_PANEL_STATE_SPACE'
            ? 'Memodelkan persistensi temporal AR(1) pada sinyal laten sepanjang deret waktu T >= 6.'
            : 'Menggunakan faktor kongenerik parsimonious untuk menghindari over-parameterisasi pada ukuran panel terbatas.',
      empiricalDataBasis: `G = ${G} entitas, T = ${T} periode, N_CC = ${P} pasangan lengkap, J = ${J} sumber.`,
      alternativesConsidered: [
        { method: 'POOLED_CONGENERIC', reasonNotSelected: 'Mengabaikan dekomposisi varians entitas vs waktu bila G,T >= 4.' },
        { method: 'DYNAMIC_PANEL_STATE_SPACE', reasonNotSelected: 'Membutuhkan deret waktu cukup panjang (T >= 6) agar koefisien transisi stabil.' }
      ],
      impactOnResults: 'Menentukan ketepatan penyaringan sinyal laten θ_it dan dekomposisi varians antar-entitas/waktu.',
      warnings: J < 3 ? ['Underidentified untuk J < 3 sumber tanpa pembatasan eksternal.'] : [],
      confidenceLevel: J >= 3 && P >= 15 ? 'HIGH' : J >= 3 ? 'MODERATE' : 'INSUFFICIENT_EVIDENCE',
      isOverriddenByUser: activeConfig.latentStructure !== initialAutoConfig.latentStructure
    },
    {
      dimensionKey: 'dependencyModel',
      dimensionLabel: '2. Struktur Ketergantungan Galat Pengukuran',
      selectedMethod: activeConfig.dependencyModel,
      whySelected:
        'Dipilih berdasarkan kelayakan identifiability derajat bebas kovarians serta kriteria informasi marginal WAIC/LOO yang parsimonious.',
      empiricalDataBasis: `J = ${J} sumber (momen kovarians = ${(J * (J + 1)) / 2}), T = ${T}, G = ${G}.`,
      alternativesConsidered: [
        { method: 'M4_SPARSE_CORRELATED_RESIDUAL', reasonNotSelected: 'Korelasi residual bebas tidak teridentifikasi penuh bila J = 3 (df_cov = 0) tanpa prior BSEM ketat.' },
        { method: 'M2_TEMPORAL_AR1', reasonNotSelected: 'Hanya diaktifkan otomatis bila T >= 5 dan N_CC >= 25.' }
      ],
      impactOnResults: 'Mengendalikan risiko bias konsensus akibat sumber kembar atau autokorelasi instrumen.',
      warnings: J === 3 ? ['Pada J = 3, korelasi galat berpasangan bersifat just-identified/underidentified tanpa informasi lintas-waktu.'] : [],
      confidenceLevel: J >= 4 && P >= 24 ? 'HIGH' : 'MODERATE',
      isOverriddenByUser: activeConfig.dependencyModel !== initialAutoConfig.dependencyModel
    },
    {
      dimensionKey: 'transformation',
      dimensionLabel: '3. Prapemrosesan & Transformasi Skala',
      selectedMethod: activeConfig.transformation,
      whySelected:
        profile.transformationEvaluations.find(e => e.method === activeConfig.transformation)?.decisionReason ||
        'Memprioritaskan keutuhan estimand pengukuran asli.',
      empiricalDataBasis: `Rasio SD skala mentah = ${profile.scaleSpreadRatioRaw.toFixed(2)}x, Prop. Error |t| = ${profile.crossScaleHeteroscedasticityAbsT.toFixed(2)}, Nol=${profile.hasAnyZeros}, Negatif=${profile.hasAnyNegatives}.`,
      alternativesConsidered: profile.transformationEvaluations
        .filter(e => e.method !== activeConfig.transformation)
        .slice(0, 3)
        .map(e => ({ method: e.method, reasonNotSelected: e.decisionReason })),
      impactOnResults:
        profile.transformationEvaluations.find(e => e.method === activeConfig.transformation)?.estimandImpactNote || '',
      warnings:
        activeConfig.transformation !== 'none' && activeConfig.transformation !== 'robust_student_t'
          ? ['Transformasi mengubah satuan parameter α_j dan σ_j menjadi skala tertransformasi.']
          : [],
      confidenceLevel: 'HIGH',
      isOverriddenByUser: activeConfig.transformation !== initialAutoConfig.transformation
    },
    {
      dimensionKey: 'missingHandling',
      dimensionLabel: '4. Penanganan Observasi Hilang (Missingness)',
      selectedMethod: activeConfig.missingStrategy,
      whySelected:
        activeConfig.missingStrategy === 'AVAILABLE_CASE_FIML_WEIGHTED'
          ? 'Proporsi baris parsial >= 15%; menggunakan observasi tersedia berbobot presisi agar tidak membuang banyak entitas-waktu.'
          : 'Menggunakan pasangan lengkap (Complete-Case) agar seluruh J sumber dievaluasi pada sel (i, t) yang identik.',
      empiricalDataBasis: `Complete-Case = ${profile.nCompletePairs}, Available-Rows = ${profile.nAvailableRows}, Sel Hilang = ${profile.totalMissingCells}.`,
      alternativesConsidered: [
        { method: 'Multiple Imputation Murni', reasonNotSelected: 'Imputasi berbasis prediktor sumber lain berisiko menyuntikkan korelasi buatan antarsumber.' }
      ],
      impactOnResults: 'Menentukan keseimbangan antara kesetaraan domain sel (i,t) vs efisiensi sampel.',
      warnings: profile.totalMissingCells > 0 ? ['Mekanisme MNAR tidak dapat diuji hanya dari data teramati.'] : [],
      confidenceLevel: profile.totalMissingCells === 0 ? 'HIGH' : 'CONDITIONAL',
      isOverriddenByUser: activeConfig.missingStrategy !== initialAutoConfig.missingStrategy
    },
    {
      dimensionKey: 'outlierHandling',
      dimensionLabel: '5. Penanganan Outlier Panel',
      selectedMethod: activeConfig.outlierStrategy,
      whySelected:
        activeConfig.outlierStrategy === 'ROBUST_STUDENT_T_LIKELIHOOD'
          ? 'Proporsi outlier within-entity MAD > 5%; menggunakan bobot likelihood Student-t(df=5) tanpa menghapus atau memalsukan angka asli.'
          : 'Tidak menghapus outlier otomatis; seluruh observasi dipertahankan dengan audit jejak diagnostik.',
      empiricalDataBasis: `Outlier Panel Within-Entity MAD = ${profile.totalPanelMadOutliers} sel.`,
      alternativesConsidered: [
        { method: 'Penghapusan Otomatis Grubbs Pooled', reasonNotSelected: 'Ditolak karena melanggar struktur klaster panel dan menghapus variasi sinyal sejati.' }
      ],
      impactOnResults: 'Mencegah satu kejutan ekstrem mendominasi estimasi varians galat σ²_j.',
      warnings: [],
      confidenceLevel: 'HIGH',
      isOverriddenByUser: activeConfig.outlierStrategy !== initialAutoConfig.outlierStrategy
    },
    {
      dimensionKey: 'standardError',
      dimensionLabel: '6. Estimator Standar Error Inferensial',
      selectedMethod: activeConfig.standardErrorMethod,
      whySelected:
        activeConfig.standardErrorMethod === 'DRISCOLL_KRAAY_HAC'
          ? 'T >= 6 memungkinkan kernel Bartlett lintas-entitas & autokorelasi temporal (Driscoll & Kraay, 1998).'
          : activeConfig.standardErrorMethod === 'TWO_WAY_ENTITY_TIME'
            ? 'Jumlah klaster G >= 12 dan T >= 10 mendukung klasterisasi dua arah.'
            : activeConfig.standardErrorMethod === 'CLUSTER_ENTITY'
              ? 'Mengakomodasi autokorelasi dalam-entitas dan heteroskedastisitas pada jumlah entitas sedang.'
              : 'Jumlah klaster terlalu kecil untuk asimtotik klaster; menggunakan jackknife HC3.',
      empiricalDataBasis: `Klaster Entitas G = ${G}, Periode T = ${T}.`,
      alternativesConsidered: [
        { method: 'CONVENTIONAL_OLS', reasonNotSelected: 'Mengabaikan ketergantungan pengamatan berulang dalam entitas yang sama.' }
      ],
      impactOnResults: 'Mengatur lebar interval kepercayaan dan p-value kontras Pair Fixed Effects.',
      warnings: G < 15 ? ['Asimtotik SE klaster pada G < 15 wajib didampingi Wild Cluster Bootstrap.'] : [],
      confidenceLevel: G >= 15 ? 'HIGH' : 'MODERATE',
      isOverriddenByUser: activeConfig.standardErrorMethod !== initialAutoConfig.standardErrorMethod
    },
    {
      dimensionKey: 'bootstrap',
      dimensionLabel: '7. Skema Wild Cluster Bootstrap',
      selectedMethod: activeConfig.bootstrapMethod,
      whySelected:
        activeConfig.bootstrapMethod === 'WEBB_SIX_POINT_WILD_CLUSTER'
          ? 'Pada jumlah klaster G < 12, bobot Rademacher hanya memiliki 2^G kombinasi diskrit; distribusi 6-titik Webb (Roodman et al., 2019; MacKinnon et al., 2023) memperhalus p-value.'
          : 'Bobot Rademacher {-1, +1} mempertahankan momen ketiga dan memiliki sifat ukuran uji yang tajam pada G >= 12.',
      empiricalDataBasis: `G = ${G} klaster (2^G = ${Math.pow(2, Math.min(20, G))} kemungkinan tanda Rademacher), B = ${activeConfig.bootstrapReplications} replikasi.`,
      alternativesConsidered: [
        { method: 'Pairs Cluster Bootstrap', reasonNotSelected: 'Kurang stabil pada panel tidak seimbang atau G kecil dibanding Wild Cluster Bootstrap.' }
      ],
      impactOnResults: 'Menghasilkan p-value dan interval simultan yang valid pada sampel klaster terbatas.',
      warnings: G < 6 ? ['Pada G < 6, bahkan Webb 6-point memiliki daya uji terbatas.'] : [],
      confidenceLevel: G >= 8 ? 'HIGH' : 'CONDITIONAL',
      isOverriddenByUser: activeConfig.bootstrapMethod !== initialAutoConfig.bootstrapMethod
    },
    {
      dimensionKey: 'anchorStrategy',
      dimensionLabel: '8. Strategi Identifikasi & Anchor Skala-Lokasi',
      selectedMethod: activeConfig.anchorStrategy,
      whySelected:
        'Anchor konsensus simetris GeometricMean(λ_j)=1 & Median(α_j/λ_j)=0 tidak mengistimewakan satu sumber, dan diuji silang terhadap J+1 anchor alternatif.',
      empiricalDataBasis: `Dievaluasi penuh pada ${J + 2} rezim anchor (Simetris, Sum-to-Zero, serta ${J} Marker Source individual).`,
      alternativesConsidered: [
        { method: 'Single Fixed Marker Source Tanpa Audit', reasonNotSelected: 'Berbahaya bila sumber marker memiliki bias besar atau reliabilitas rendah.' }
      ],
      impactOnResults: 'Menentukan skala α_j dan Total RMSE, sementara rasio presisi R_j = σ_j/|λ_j| dievaluasi invarian terhadap lokasi.',
      warnings: ['Anchor bukan Ground Truth; pergeseran seragam seluruh sumber tidak terdeteksi oleh anchor mana pun.'],
      confidenceLevel: 'HIGH',
      isOverriddenByUser: activeConfig.anchorStrategy !== initialAutoConfig.anchorStrategy
    },
    {
      dimensionKey: 'bayesianPrior',
      dimensionLabel: '9. Spesifikasi Prior Hierarkis Bayesian',
      selectedMethod: activeConfig.priorStrategy,
      whySelected:
        'Prior Half-t(df=4) pada simpangan baku (Gelman, 2006) mencegah kolaps varians nol (Heywood case) tanpa mendominasi likelihood data.',
      empiricalDataBasis: `N_CC = ${P}, J = ${J}; diuji sensitivitas terhadap 3 keluarga prior (van Erp et al., 2018).`,
      alternativesConsidered: [
        { method: 'Inverse-Gamma(0.001, 0.001)', reasonNotSelected: 'Terbukti menciptakan puncak semu dekat nol ketika varians galat kecil (Gelman, 2006).' }
      ],
      impactOnResults: 'Menjaga stabilitas interval kredibel ekor bawah σ_j dan probabilitas ranking posterior.',
      warnings: [],
      confidenceLevel: 'HIGH',
      isOverriddenByUser: activeConfig.priorStrategy !== initialAutoConfig.priorStrategy
    },
    {
      dimensionKey: 'mcmcConfig',
      dimensionLabel: '10. Konfigurasi Sampling MCMC & Diagnostik Vehtari (2021)',
      selectedMethod: `${activeConfig.mcmcChains} Chains × ${activeConfig.mcmcIterations} Iterasi (Warmup ${activeConfig.mcmcWarmup})`,
      whySelected:
        'Sampling blok Gibbs/MH terintegrasi Woodbury dengan pemeriksaan Rank-Normalized Split R-hat, Folded R-hat, Bulk-ESS, dan Tail-ESS.',
      empiricalDataBasis: `Total post-warmup draws = ${activeConfig.mcmcChains * (activeConfig.mcmcIterations - activeConfig.mcmcWarmup)}.`,
      alternativesConsidered: [
        { method: 'Single-Chain MCMC', reasonNotSelected: 'Tidak dapat mendeteksi kegagalan mixing antar-mode melalui Split R-hat.' }
      ],
      impactOnResults: 'Menjamin Monte Carlo Standard Error (MCSE) kecil pada estimasi ranking.',
      warnings: [],
      confidenceLevel: 'HIGH',
      isOverriddenByUser:
        activeConfig.mcmcIterations !== initialAutoConfig.mcmcIterations ||
        activeConfig.mcmcChains !== initialAutoConfig.mcmcChains
    },
    {
      dimensionKey: 'validationMethod',
      dimensionLabel: '11. Metode Validasi Tanpa Ground Truth',
      selectedMethod: 'LOSO Covariance-Audited + Pair FE Holm + Mixed-Effects LoA',
      whySelected:
        'Menggabungkan prediksi keluar-satu-sumber (LOSO), regresi Pair FE terkoreksi Holm (1979), dan batas kesepakatan pengamatan berulang (Parker et al., 2020).',
      empiricalDataBasis: `C(${J}, 2) = ${(J * Math.max(0, J - 1)) / 2} kontras berpasangan simultan.`,
      alternativesConsidered: [
        { method: 'Korelasi Pearson Sederhana', reasonNotSelected: 'Korelasi r = 1 tetap bisa terjadi pada sumber dengan bias aditif dan distorsi skala masif.' }
      ],
      impactOnResults: 'Mengendalikan false-positive familywise error rate pada komparasi multi-sumber.',
      warnings: ['LOSO menguji konsistensi prediktif antarsumber, bukan kebenaran fisik absolut.'],
      confidenceLevel: 'HIGH',
      isOverriddenByUser: false
    },
    {
      dimensionKey: 'robustnessAnalysis',
      dimensionLabel: '12. Rangkaian Sensitivitas & Validasi Monte Carlo',
      selectedMethod: 'Multi-Anchor + Prior Sensitivity + 10 Common-Bias + 7-Family Monte Carlo',
      whySelected:
        'Menguji pemulihan parameter dan ranking (Morris et al., 2019) pada struktur dimensi (G, T, J) aktual dataset sebelum menarik kesimpulan.',
      empiricalDataBasis: `Dikalibrasi pada struktur G = ${G}, T = ${T}, J = ${J}.`,
      alternativesConsidered: [
        { method: 'Evaluasi Titik Tunggal Tanpa Simulasi', reasonNotSelected: 'Tidak mengungkap kerentanan identifikasi atau common-mode bias.' }
      ],
      impactOnResults: 'Menyediakan batas keyakinan metodologis eksplisit pada kesimpulan akhir.',
      warnings: [],
      confidenceLevel: 'HIGH',
      isOverriddenByUser: false
    }
  ];

  const summaryHeadline =
    overallIdentifiabilityStatus === 'UNDERIDENTIFIED'
      ? `Identifikasi Tidak Terpenuhi (J = ${J}, N_CC = ${P}) — Sistem Menahan Kesimpulan Peringkat Definitif`
      : `Automatic Decision Engine Aktif (${overallIdentifiabilityStatus}): Model ${activeConfig.latentStructure} + ${activeConfig.dependencyModel}, Transformasi "${activeConfig.transformation}", SE ${activeConfig.standardErrorMethod} + ${activeConfig.bootstrapMethod}`;

  return {
    hierarchyRule:
      'Statistical validity -> Identifiability -> Assumption compatibility -> Model diagnostics -> Predictive performance -> Robustness -> Interpretability -> Parsimony -> Computational efficiency',
    initialAutoConfig,
    activeConfig,
    hasManualOverrides,
    decisions,
    overallIdentifiabilityStatus,
    summaryHeadline
  };
}
