
import {
  MsmaMethodId,
  SelectMeasurementMethodInput,
  SelectMeasurementMethodOutput
} from '../types';

export function getMethodHumanLabel(methodId: MsmaMethodId): string {
  switch (methodId) {
    case 'BLAND_ALTMAN_DEMING':
      return 'Repeated-Measures Panel Bland-Altman & Deming Regression';
    case 'TRIPLE_COLLOCATION':
      return 'Triple Collocation Analysis (TCA) & Extended Triple Collocation (ETC)';
    case 'CORRELATED_TRIPLE_COLLOCATION_FALLBACK':
      return 'Sensitivity-Guarded Triple Collocation & Pairwise Panel Agreement (Indikasi Korelasi Galat)';
    case 'N_CORNERED_HAT':
      return 'Scale-Calibrated N-Cornered Hat (PSD-Constrained)';
    case 'EXTENDED_COLLOCATION':
      return 'Extended Collocation (EC — Gruber et al., 2016)';
    case 'BLOCKED_CONSTRUCT_MISMATCH':
      return 'Diblokir — Perbedaan Konstruk Pengukuran Tanpa Model Konversi Fisik Valid (Contoh B)';
    case 'INSUFFICIENT_DATA':
      return 'Data Tidak Mencukupi / Model Tidak Teridentifikasi';
  }
}

export function selectMeasurementMethod(
  input: SelectMeasurementMethodInput
): SelectMeasurementMethodOutput {
  const {
    sourceCount,
    measurementType,
    commonTarget,
    panelStructure,
    errorIndependence,
    missingPattern,
    sampleSize,
    temporalStructure,
    spatialStructure,
    modelIdentifiability
  } = input;

  // 1. Construct mismatch guard (Section E)
  if (measurementType === 'CONTOH_B_UNHARMONIZED' || !commonTarget) {
    return {
      recommendedMethod: 'BLOCKED_CONSTRUCT_MISMATCH',
      recommendedMethodLabel: getMethodHumanLabel('BLOCKED_CONSTRUCT_MISMATCH'),
      alternativeMethods: [
        {
          methodId: 'BLAND_ALTMAN_DEMING',
          label: 'Evaluasi Sub-Kelompok Konstruk Sejenis (mis. ppm vs ppm saja)',
          whenAppropriate: 'Ketika setidaknya 2 sumber memiliki dimensi dan satuan fisik yang sama.',
          identifiable: true
        }
      ],
      methodJustification: [
        'Sumber pengukuran diklasifikasikan sebagai Contoh B (Different Measurement Construct) tanpa model konversi fisik yang tervalidasi.',
        'Penerapan TCA, N-Cornered Hat, atau Extended Collocation secara langsung atas besaran fisik berbeda melanggar model laten tunggal X_k = α_k + β_k T + ε_k.'
      ],
      assumptions: ['Seluruh sumber wajib merepresentasikan realisasi dari variabel target fisik yang sepadan.'],
      limitations: [
        'Standardisasi Z-score atau normalisasi Min-Max tidak dapat mengubah konsentrasi atmosfer (ppm) menjadi fluks emisi tahunan (ton/tahun).',
        'Pemeringkatan akurasi bersama ditangguhkan hingga model konversi fisik diaktifkan atau sumber dipilih dari konstruk sejenis.'
      ],
      eligibilityStatus: 'Tidak memenuhi'
    };
  }

  // 2. Minimum source & sample guard
  if (sourceCount < 2 || sampleSize < 6 || panelStructure.nEntities < 2) {
    return {
      recommendedMethod: 'INSUFFICIENT_DATA',
      recommendedMethodLabel: getMethodHumanLabel('INSUFFICIENT_DATA'),
      alternativeMethods: [],
      methodJustification: [
        `Jumlah sumber (${sourceCount}), observasi lengkap (${sampleSize}), atau jumlah entitas (${panelStructure.nEntities}) belum memenuhi syarat minimum estimasi panel.`
      ],
      assumptions: ['Minimal 2 sumber numerik dan minimal >= 6 observasi berpasangan pada >= 2 entitas.'],
      limitations: ['Estimasi kovarians tidak stabil atau singular pada ukuran sampel sangat kecil.'],
      eligibilityStatus: 'Tidak dapat diidentifikasi'
    };
  }

  // 3. Condition D.1: Two measurement sources (J = 2)
  if (sourceCount === 2) {
    const justification: string[] = [
      'Terdapat tepat J = 2 sumber pengukuran tanpa Ground Truth: matriks kovarians hanya menyediakan 3 momen unik (Var(X₁), Var(X₂), Cov(X₁,X₂)) yang tidak cukup untuk mengidentifikasi varians galat masing-masing sumber secara terpisah (4 parameter tak diketahui).',
      `Struktur data bersifat panel (${panelStructure.nEntities} entitas × ${panelStructure.nPeriods} periode, N = ${sampleSize}), sehingga Repeated-Measures Bland-Altman (Parker et al., 2020) dipilih untuk memisahkan varians selisih antarentitas dan dalam-entitas.`,
      'Deming Regression (Linnet, 1993) dipasangkan untuk menguji bias proporsional (kemiringan ≠ 1) dan bias sistematis dengan mempertimbangkan galat pada kedua sumbu.'
    ];
    if (!panelStructure.isBalanced || missingPattern.overallMissingPct > 5) {
      justification.push(
        `Panel bersifat tidak seimbang (missing ${missingPattern.overallMissingPct.toFixed(1)}%); perhitungan difokuskan pada pasangan observasi lengkap dengan bootstrap klaster entitas.`
      );
    }

    return {
      recommendedMethod: 'BLAND_ALTMAN_DEMING',
      recommendedMethodLabel: getMethodHumanLabel('BLAND_ALTMAN_DEMING'),
      alternativeMethods: [
        {
          methodId: 'TRIPLE_COLLOCATION',
          label: 'Triple Collocation Analysis (Membutuhkan Tambahan Sumber ke-3 Independen)',
          whenAppropriate: 'Jika peneliti dapat menambahkan 1 sumber pengukuran independen ketiga atas target yang sama.',
          identifiable: false
        }
      ],
      methodJustification: justification,
      assumptions: [
        'Kedua sumber mengukur konstruk fisik yang sepadan (Contoh A atau terharmonisasi fisik).',
        'Selisih pengukuran berdistribusi stasioner di sekitar fungsi linear rata-rata untuk interpretasi 95% Limits of Agreement.',
        'Rasio varians galat λ = σ²_ε2 / σ²_ε1 pada Deming Regression ditetapkan sebagai asumsi kerja (default λ = 1 untuk Orthogonal Deming kecuali diketahui dari kalibrasi eksternal).'
      ],
      limitations: [
        'BATAS IDENTIFIKASI MUTLAK: Dua sumber tanpa Ground Truth TIDAK cukup untuk menghasilkan peringkat akurasi absolut individual (tidak dapat memastikan apakah Sumber 1 atau Sumber 2 yang memiliki varians galat lebih kecil tanpa mengetahui λ eksternal).',
        'Korelasi tinggi atau selisih rata-rata kecil hanya membuktikan kesepakatan bersama, bukan ketiadaan bias bersama (common-mode bias).'
      ],
      eligibilityStatus: sampleSize >= 20 ? 'Selesai' : 'Perlu perhatian'
    };
  }

  // 4. Condition D.2: Exactly three measurement sources (J = 3)
  if (sourceCount === 3) {
    const hasSevereIssue =
      !modelIdentifiability.isIdentified || errorIndependence.hasHeywoodNegativeVariance;
    const hasCorrWarning =
      errorIndependence.suspectedCorrelatedPairsCount > 0 ||
      errorIndependence.maxEstimatedErrorCorrAbs > 0.35;

    if (hasSevereIssue) {
      return {
        recommendedMethod: 'CORRELATED_TRIPLE_COLLOCATION_FALLBACK',
        recommendedMethodLabel: getMethodHumanLabel('CORRELATED_TRIPLE_COLLOCATION_FALLBACK'),
        alternativeMethods: [
          {
            methodId: 'BLAND_ALTMAN_DEMING',
            label: 'Pairwise Panel Bland-Altman & Deming Regression per Pasangan Sumber',
            whenAppropriate: 'Digunakan ketika struktur kovarians 3-sumber mengalami kasus Heywood (varians galat negatif) akibat korelasi galat kuat atau sinyal laten lemah.',
            identifiable: true
          },
          {
            methodId: 'EXTENDED_COLLOCATION',
            label: 'Extended Collocation (Membutuhkan Sumber ke-4 Independen)',
            whenAppropriate: 'Jika tersedia instrumen ke-4 untuk mengidentifikasi kovarians galat lintas-sumber secara eksplisit.',
            identifiable: false
          }
        ],
        methodJustification: [
          `Meskipun terdapat J = 3 sumber, pemeriksaan matriks kovarians menunjukkan masalah identifikasi (${modelIdentifiability.reason}).`,
          'Pada J = 3, model Correlated Triple Collocation tidak dapat diidentifikasi tanpa nilai korelasi galat eksternal yang diketahui apriori (karena hanya ada 6 momen kovarians untuk 7 parameter bila 1 kovarians galat ditambahkan).',
          'Sistem menahan estimasi TCA klasik agar tidak mengeluarkan peringkat semu dan menyediakan kurva sensitivitas korelasi galat serta evaluasi kesepakatan berpasangan.'
        ],
        assumptions: [
          'Kovarians silang antarsumber harus bernilai positif konsisten (C_12, C_13, C_23 > 0) dan C_kk > C_kj C_km / C_jm.',
          'Independensi galat E[ε_j ε_k] = 0 untuk seluruh pasangan j ≠ k.'
        ],
        limitations: [
          'Kasus Heywood (estimasi varians galat negatif) umumnya menandakan pelanggaran asumsi independensi galat antara dua sumber atau ukuran sampel terlalu kecil.',
          'Tanpa sumber ke-4 atau prior korelasi galat eksternal, parameter korelasi galat pada J = 3 bersifat under-identified.'
        ],
        eligibilityStatus: 'Tidak dapat diidentifikasi'
      };
    }

    const justification: string[] = [
      `Terdapat tepat J = 3 sumber pengukuran sepadan dengan 6 momen kovarians unik yang tepat mengidentifikasi 6 parameter model kalibrasi linear X_k = α_k + β_k T + ε_k (Stoffelen, 1998; McColl et al., 2014).`,
      `Ukuran sampel panel lengkap N = ${sampleSize} (${panelStructure.nEntities} entitas × ${panelStructure.nPeriods} periode; variasi antarkota menyumbang ${spatialStructure.betweenEntitySharePct.toFixed(1)}% varians) memadai untuk dekomposisi kovarians sinyal vs galat.`
    ];
    if (temporalStructure.maxResidualAr1Abs > 0.3) {
      justification.push(
        `Terdeteksi autokorelasi temporal moderat (max |ρ_AR1| = ${temporalStructure.maxResidualAr1Abs.toFixed(2)}), sehingga ketidakpastian diestimasi dengan Entity-Cluster Bootstrap dan dilengkapi dekomposisi galat autokorelasi Dong & Crow (2017).`
      );
    }
    if (hasCorrWarning) {
      justification.push(
        'PERINGATAN KORELASI GALAT: Terdapat indikasi kemiripan struktur residual pada sebagian pasangan sumber; hasil TCA wajib dibaca bersama analisis sensitivitas korelasi galat pada Step 9.'
      );
    }

    return {
      recommendedMethod: 'TRIPLE_COLLOCATION',
      recommendedMethodLabel: getMethodHumanLabel('TRIPLE_COLLOCATION'),
      alternativeMethods: [
        {
          methodId: 'BLAND_ALTMAN_DEMING',
          label: 'Pairwise Repeated-Measures Bland-Altman & Deming Regression',
          whenAppropriate: 'Sebagai pemeriksaan pelengkap bias aditif dan proporsional antar-pasangan sumber.',
          identifiable: true
        }
      ],
      methodJustification: justification,
      assumptions: [
        'Linearitas hubungan setiap sumber terhadap variabel laten sebenarnya T.',
        'Ortogonalitas galat terhadap sinyal laten: Cov(ε_k, T) = 0.',
        'Independensi galat antarsumber: Cov(ε_j, ε_k) = 0 untuk j ≠ k.',
        'Stasioneritas struktur varians-kovarians galat pada domain sampel yang dianalisis.'
      ],
      limitations: [
        'TCA klasik mengestimasi presisi acak (error variance) dan faktor skala relatif; bias aditif bersama (common-mode offset di semua sumber) tidak teridentifikasi tanpa Ground Truth.',
        hasCorrWarning
          ? 'Indikasi korelasi galat terdeteksi: jika dua sumber berbagi galat positif, TCA klasik cenderung meremehkan varians galat keduanya.'
          : 'Apabila dua sumber menggunakan algoritma pemrosesan yang sama, potensi korelasi galat tetap perlu diuji pada Step 9.'
      ],
      eligibilityStatus: hasCorrWarning || sampleSize < 45 ? 'Perlu perhatian' : 'Selesai'
    };
  }

  // 5. Condition D.3 & D.4: Four or more measurement sources (J = 4 or J >= 5)
  const J = sourceCount;
  const covDof = (J * (J + 1)) / 2;
  const maxIdentifiableCorrPairs = Math.max(0, Math.floor((J * (J - 3)) / 2));
  const needsErrorCovarianceModeling =
    errorIndependence.suspectedCorrelatedPairsCount > 0 &&
    errorIndependence.maxEstimatedErrorCorrAbs > 0.25 &&
    modelIdentifiability.isIdentified &&
    sampleSize >= 40;

  const chosen: MsmaMethodId = needsErrorCovarianceModeling
    ? 'EXTENDED_COLLOCATION'
    : 'N_CORNERED_HAT';
  const alt: MsmaMethodId =
    chosen === 'N_CORNERED_HAT' ? 'EXTENDED_COLLOCATION' : 'N_CORNERED_HAT';

  const justification: string[] =
    chosen === 'N_CORNERED_HAT'
      ? [
          `Terdapat J = ${J} sumber pengukuran (${covDof} momen kovarians unik). Diagnostik galat tidak menunjukkan korelasi galat lintas-sumber yang dominan (max |r_ε| = ${errorIndependence.maxEstimatedErrorCorrAbs.toFixed(3)} ≤ 0.25).`,
          `Sesuai prinsip parsimoni statistik, Scale-Calibrated N-Cornered Hat berkendala Positive Semidefinite (Premoli & Tavella, 1993) diprioritaskan karena mengestimasi lebih sedikit parameter (${2 * J - 1} vs ${2 * J}..${2 * J + Math.min(2, maxIdentifiableCorrPairs)} parameter) dengan varians estimator lebih rendah.`,
          `Extended Collocation (Gruber et al., 2016) tetap dievaluasi secara paralel sebagai pembanding kelayakan identifikasi.`
        ]
      : [
          `Terdapat J = ${J} sumber pengukuran dan terdeteksi ${errorIndependence.suspectedCorrelatedPairsCount} pasangan sumber dengan indikasi korelasi galat lintas-sumber (max |r_ε| = ${errorIndependence.maxEstimatedErrorCorrAbs.toFixed(3)} > 0.25).`,
          `Dengan ${covDof} momen kovarians unik dan kuartet independen yang mencukupi, Extended Collocation (Gruber et al., 2016) dipilih karena mampu mengestimasi kovarians galat lintas-sumber secara eksplisit tanpa membiasakan varians sumber lainnya.`,
          `N-Cornered Hat ditampilkan berdampingan untuk mengukur seberapa besar pergeseran peringkat apabila korelasi galat diabaikan.`
        ];

  if (J === 4) {
    justification.push(
      'Catatan identifikasi J = 4: Empat sumber menyediakan 6 kovarians lintas-sumber untuk 4 parameter skala/sinyal, sehingga paling banyak 1 pasangan kovarians galat lintas-sumber yang dapat diidentifikasi secara simultan — sistem tidak mengasumsikan seluruh 6 korelasi galat dapat diestimasi sekaligus.'
    );
  } else {
    justification.push(
      `Catatan identifikasi J = ${J}: Meskipun terdapat lebih banyak derajat bebas kovarians, hanya pasangan kovarians galat yang ditopang kuartet independen berperingkat penuh yang diizinkan masuk ke spesifikasi Extended Collocation.`
    );
  }

  return {
    recommendedMethod: chosen,
    recommendedMethodLabel: getMethodHumanLabel(chosen),
    alternativeMethods: [
      {
        methodId: alt,
        label: getMethodHumanLabel(alt),
        whenAppropriate:
          alt === 'EXTENDED_COLLOCATION'
            ? 'Gunakan apabila terdapat bukti kuat dua instrumen berbagi gangguan pengukuran bersama (mis. dua sensor satelit optik sejenis).'
            : 'Gunakan apabila korelasi galat lintas-sumber tidak signifikan sehingga model diagonal yang lebih parsimonius lebih stabil.',
        identifiable: modelIdentifiability.isIdentified
      },
      {
        methodId: 'TRIPLE_COLLOCATION',
        label: 'Sub-Triplet Collocation Ensemble Diagnostics',
        whenAppropriate: 'Melihat konsistensi varians galat di setiap kombinasi 3 sumber.',
        identifiable: true
      }
    ],
    methodJustification: justification,
    assumptions: [
      'Seluruh J sumber mengukur variabel laten fisik yang sepadan secara linear (X_k = α_k + β_k T + ε_k).',
      'Ortogonalitas galat terhadap variabel laten: Cov(ε_k, T) = 0.',
      chosen === 'N_CORNERED_HAT'
        ? 'Galat pengukuran saling bebas lintas seluruh pasangan sumber: Cov(ε_j, ε_k) = 0 untuk j ≠ k.'
        : 'Pasangan sumber di luar blok berkorelasi memiliki galat saling bebas sehingga membentuk kuartet pengidentifikasi yang sah (Gruber et al., 2016).',
      'Matriks kovarians galat memenuhi sifat Positive Semidefinite (PSD).'
    ],
    limitations: [
      J === 4
        ? 'Pada J = 4 sumber, maksimal hanya 1 kovarians galat lintas-sumber yang dapat diidentifikasi pada satu spesifikasi model.'
        : `Pada J = ${J} sumber, penambahan terlalu banyak parameter kovarians galat dapat menurunkan kestabilan numerik pada sampel terbatas.`,
      'Sama seperti seluruh keluarga collocation tanpa Ground Truth, bias sistematis seragam yang dialami seluruh sumber secara bersamaan tidak dapat terdeteksi.'
    ],
    eligibilityStatus: !modelIdentifiability.isIdentified
      ? 'Tidak dapat diidentifikasi'
      : sampleSize < 40 || missingPattern.missingnessBiasRisk === 'TINGGI'
        ? 'Perlu perhatian'
        : 'Selesai'
  };
}
