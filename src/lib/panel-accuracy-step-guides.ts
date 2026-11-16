// ============================================================
// Comparative Measurement Accuracy Assessment — 9-Step Bullet Guides
// Concise Point-by-Point Purpose, Reading Guide & Live Interpretations
// ============================================================

import {
  PanelAccuracyFitResult,
  PanelAccuracyQualityReport
} from './panel-accuracy-types';

export interface AccuracyStepGuide {
  id: number;
  pillLabel: string;
  fullTitle: string;
  purposePoints: string[];
  interpretPoints: string[];
  keyCaveat: string;
}

export const PANEL_ACCURACY_STEP_GUIDES: AccuracyStepGuide[] = [
  {
    id: 1,
    pillLabel: '1. Upload',
    fullTitle: 'Step 1 — Data Upload Multi-Sumber Panel',
    purposePoints: [
      'Memuat data panel Kota-Tahun dengan ≥ 2 sumber pengukuran CO₂.',
      'Mendukung Excel (.xlsx/.xls), CSV, tempel tabel (paste), Google Sheets, atau preset 4 sumber.'
    ],
    interpretPoints: [
      'Total Baris: jumlah baris mentah pada berkas asal.',
      'Pasangan Lengkap (CC): baris Kota-Tahun di mana seluruh sumber terisi valid (tanpa NA).',
      'Status Balanced: setiap kota memiliki tahun pengamatan yang lengkap dan seragam.'
    ],
    keyCaveat:
      'Sampel Complete-Case (CC) menjadi dasar evaluasi berpasangan agar seluruh sumber diuji pada sel Kota-Tahun yang sama.'
  },
  {
    id: 2,
    pillLabel: '2. Mapping & Ref',
    fullTitle: 'Step 2 — Pemetaan Sumber Dinamis & Pemilihan Referensi',
    purposePoints: [
      'Memetakan kolom City ID, Year, satuan, metode, dan SE opsional untuk jumlah sumber dinamis (2, 3, 4, 5+).',
      'Menetapkan tepat 1 Reference Source (r) sebagai pembanding acuan.'
    ],
    interpretPoints: [
      'Reference Source (r): menjadi patokan nol untuk menghitung selisih error = X_pembanding − X_referensi.',
      'Comparison Source: seluruh sumber selain referensi yang akurasi relatifnya dievaluasi.',
      'Mengubah pilihan referensi otomatis menghitung ulang seluruh metrik, grafik, Pair FE, kode, dan peringkat.'
    ],
    keyCaveat:
      'Sumber referensi dipilih sebagai pembanding empiris (benchmark), bukan kebenaran absolut bebas galat.'
  },
  {
    id: 3,
    pillLabel: '3. Audit & Prep',
    fullTitle: 'Step 3 — Audit Kualitas Data, Validitas Referensi & Prapemrosesan',
    purposePoints: [
      'Menguji 10 potensi risiko data panel sekaligus kredibilitas sumber referensi.',
      'Menyediakan prapemrosesan opt-in hanya dengan persetujuan eksplisit pengguna.'
    ],
    interpretPoints: [
      'OK (Hijau): indikator kualitas memenuhi syarat analisis.',
      'Warning (Kuning): ada catatan penting (misal beda sampel CC vs Available-Case atau outlier 1.5×IQR).',
      'Error (Merah): masalah kritis memblokir analisis (misal referensi varians nol atau duplikat City-Year belum dibersihkan).'
    ],
    keyCaveat:
      'Disarankan mempertahankan satuan fisik asli agar nilai MAE dan RMSE mudah dimaknai secara substantif.'
  },
  {
    id: 4,
    pillLabel: '4. EDA',
    fullTitle: 'Step 4 — Exploratory Data Analysis & Korelasi Panel',
    purposePoints: [
      'Menilai sebaran deskriptif tiap sumber (Mean, SD, Median, IQR, CV, Skewness).',
      'Membedakan korelasi lintas-kota dari pergerakan temporal dalam-kota yang sama.'
    ],
    interpretPoints: [
      'Overall Pearson / Spearman: keterkaitan nilai secara keseluruhan antar sumber.',
      'Within-City r: konsistensi fluktuasi dari tahun ke tahun di dalam kota yang sama.',
      'First-Difference r (ΔX_t): kesamaan arah perubahan tahunan.',
      'Garis diagonal 45° pada scatterplot: posisi kesepakatan sempurna tanpa bias maupun penyebaran.'
    ],
    keyCaveat:
      'Korelasi tinggi hanya mengukur kesamaan arah linear/monotonik, BUKAN jaminan bebas bias sistematis.'
  },
  {
    id: 5,
    pillLabel: '5. Accuracy',
    fullTitle: 'Step 5 — Metrik Akurasi, Lin\'s CCC & Bland-Altman',
    purposePoints: [
      'Mengukur selisih error berpasangan setiap comparison source terhadap sumber referensi.',
      'Menggabungkan ukuran error (MAE, RMSE, MBE) dengan ukuran kesepakatan (Lin CCC & Bland-Altman LoA).'
    ],
    interpretPoints: [
      'MAE & RMSE: makin kecil berarti makin dekat dengan referensi (RMSE lebih sensitif terhadap outlier ekstrem).',
      'MBE: arah bias rata-rata (+ overestimation, − underestimation; ideal mendekati 0).',
      'Lin CCC & Cb: mendekati 1 menandakan presisi dan akurasi skala/lokasi tinggi secara bersamaan.',
      '95% LoA Bland-Altman: rentang selisih 95% pengamatan; slope proportional bias signifikan (p < 0.05) menandakan bias berubah theo besar emisi.',
      'Complete-Case vs Available-Case: ditampilkan terpisah bila terdapat missing data parsial.'
    ],
    keyCaveat:
      'Jangan menyembunyikan perbedaan jumlah observasi antara sampel lengkap dan sampel tersedia per sumber.'
  },
  {
    id: 6,
    pillLabel: '6. Pair FE',
    fullTitle: 'Step 6 — Model Inferensial Pair Fixed Effects & Wild Bootstrap',
    purposePoints: [
      'Menguji apakah perbedaan MAE antarsumber pembanding signifikan secara statistik pada pasangan Kota-Tahun yang sama.',
      'Menyerap efek tetap City-Year (α_it) serta mengelompokkan standar error pada level City ID.'
    ],
    interpretPoints: [
      'Koefisien β < 0: MAE sumber tersebut lebih kecil (lebih akurat) dibanding sumber pembanding acuan.',
      'p-value Cluster < 0.05: perbedaan akurasi signifikan secara statistik pada α = 5%.',
      'Wild Bootstrap p-val: p-value acuan utama bila jumlah klaster kota kecil (G < 30) untuk mencegah bias ke bawah SE.'
    ],
    keyCaveat:
      'Tidak memakai Uji Chow, Hausman, atau LM karena α_it langsung menyerap pasangan Kota-Tahun.'
  },
  {
    id: 7,
    pillLabel: '7. Diagnostics',
    fullTitle: 'Step 7 — Diagnostik Statistik & Sensitivitas Outlier',
    purposePoints: [
      'Memeriksa heteroskedastisitas antarsumber, korelasi serial dalam-kota, ketergantungan lintas-kota (Pesaran CD), dan jumlah klaster G.',
      'Menguji ketahanan peringkat MAE ketika 5% error ekstrem disingkirkan.'
    ],
    interpretPoints: [
      'Warning Heteroskedastisitas / AR(1): tetap aman karena inference memakai City Cluster-Robust SE & Wild Bootstrap.',
      'Pesaran CD p < 0.05: menandakan adanya guncangan lintas kota; efek tetap pasangan α_it membantu menyerap guncangan umum.',
      'Outlier Sensitivity: jika peringkat Full MAE vs Trimmed 95% berubah, hasil dipengaruhi segelintir nilai ekstrem.',
      'Normality & CLT: distribusi AE ≥ 0 wajar miring kanan; tidak menuntut normalitas mutlak berkat CLT & bootstrap.'
    ],
    keyCaveat:
      'Pada klaster G < 30, standar error klaster klasik berisiko terlalu sempit sehingga wajib mengacu ke Wild Bootstrap.'
  },
  {
    id: 8,
    pillLabel: '8. Ranking',
    fullTitle: 'Step 8 — Evaluasi Komparatif & Keputusan Peringkat Sumber',
    purposePoints: [
      'Menentukan peringkat sumber pembanding menggunakan MAE sebagai metrik utama.',
      'Memverifikasi konsistensi hasil terhadap RMSE, |MBE|, Lin CCC, dan signifikansi Pair Fixed Effects.'
    ],
    interpretPoints: [
      'TERBUKTI_BERBEDA_SIGNIFIKAN: peringkat #1 unggul secara statistik (p < 0.05) tanpa konflik metrik.',
      'PERBEDAAN_TIDAK_SIGNIFIKAN: MAE teratas tidak berbeda nyata dari peringkat #2 (p ≥ 0.05); tidak ditetapkan pemenang mutlak.',
      'KONFLIK_ANTAR_METRIK: peringkat MAE bertentangan tajam dengan RMSE, CCC, atau sensitivitas outlier.',
      'REFERENSI_TIDAK_VALID: sumber referensi gagal uji kualitas dasar.'
    ],
    keyCaveat:
      'Tidak menggunakan composite score semu; ketidakkonsistenan antar metrik dilaporkan secara jujur.'
  },
  {
    id: 9,
    pillLabel: '9. Final & Export',
    fullTitle: 'Step 9 — Ringkasan Hasil, Tabel Stata, Visualisasi, Kode & Ekspor',
    purposePoints: [
      'Menghimpun tabel bergaya Stata, grafik interaktif, interpretasi poin akademis, dan skrip reproduksi.',
      'Menyediakan ekspor siap publikasi (PDF, Word .docx, Excel .xlsx, CSV, Print).'
    ],
    interpretPoints: [
      'Sub-tab Tabel Gaya Stata: angka konsol resmi siap kutip.',
      'Sub-tab Visualisasi: tren tahunan, scatter 45°, Bland-Altman, bar MAE/RMSE/CCC, & forest plot kontras.',
      'Sub-tab Interpretasi: ringkasan temuan per poin dari Step 1 sampai kesimpulan akhir.',
      'Sub-tab Stata .do & R Script: kode dinamis untuk verifikasi ulang di Stata 17+ atau R.'
    ],
    keyCaveat:
      'Sertakan berkas .do atau .R dalam lampiran penelitian agar setiap perhitungan dapat direproduksi.'
  }
];

export interface ActualStepInterpretationPoints {
  step1: string[];
  step2: string[];
  step3: string[];
  step4: string[];
  step5: string[];
  step6: string[];
  step7: string[];
  step8: string[];
  step9: string[];
}

export function buildActualStepInterpretationPoints(
  result: PanelAccuracyFitResult
): ActualStepInterpretationPoints {
  const { datasetMeta, referenceSource, comparisonSources, qualityReport, metrics, pairFixedEffects, diagnostics, ranking } = result;
  const refTag = `${referenceSource.name} (${referenceSource.label})`;

  const step1 = [
    `Dataset memuat ${datasetMeta.nObsRaw} baris mentah pada ${datasetMeta.nCities} kota × ${datasetMeta.nYears} tahun (${qualityReport.yearMin ?? '-'}–${qualityReport.yearMax ?? '-'}).`,
    `Tersedia ${datasetMeta.nCompletePairs} pasangan City-Year lengkap (Complete-Case) dengan ${result.sources.length} sumber pengukuran.`,
    `Struktur panel: ${datasetMeta.isBalanced ? 'Balanced (seluruh sel City-Year lengkap)' : 'Unbalanced / Parsial (terdapat sel kosong atau tidak seimbang)'}.`
  ];

  const step2 = [
    `Reference Source (r): ${refTag} [Kolom: ${referenceSource.columnKey}, Satuan: ${datasetMeta.workingUnitNote}].`,
    `Comparison Sources (${comparisonSources.length} sumber): ${comparisonSources.map(s => `${s.name} (${s.label})`).join(', ')}.`,
    `Seluruh kesalahan pengukuran (e_ijt = X_ijt − X_irt) diukur relatif terhadap ${refTag}.`
  ];

  const step3 = [
    `Status audit referensi: ${qualityReport.referenceAudit.summary}`,
    `Duplikat kunci (City, Year): ${qualityReport.duplicateKeys.length} kasus; outlier total (1.5×IQR): ${qualityReport.outlierCountTotal} titik.`,
    `Rasio skala maksimum antarsumber: ${qualityReport.scaleRatioMaxToMin.toFixed(2)}×; prapemrosesan aktif: ${result.preprocessing.applyLog1p || result.preprocessing.applyWinsorize || result.preprocessing.dropDuplicateCityYear
      ? [
        result.preprocessing.dropDuplicateCityYear ? 'Hapus Duplikat' : '',
        result.preprocessing.applyWinsorize ? 'Winsorization 2.5%' : '',
        result.preprocessing.applyLog1p ? 'log(1+x)' : ''
      ]
        .filter(Boolean)
        .join(', ')
      : 'Tidak ada (satuan fisik asli dipertahankan)'
    }.`
  ];

  const step4 = [
    ...metrics.map(
      m =>
        `${m.sourceLabel}: Pearson r = ${m.pearsonR.toFixed(4)} | Spearman ρ = ${m.spearmanRho.toFixed(4)} | Within-City r = ${m.withinCityR.toFixed(4)} | First-Diff r = ${m.firstDiffR.toFixed(4)}.`
    ),
    'Korelasi tinggi hanya menandakan keselarasan variasi/arah, bukan bukti akurasi mutlak tanpa bias aditif atau skala.'
  ];

  const step5 = [
    ...metrics.map(
      m =>
        `${m.sourceLabel}: MAE = ${m.mae.toFixed(3)} [95% CI ${m.maeCiLower.toFixed(2)}..${m.maeCiUpper.toFixed(2)}] | RMSE = ${m.rmse.toFixed(3)} | MBE = ${m.mbe >= 0 ? `+${m.mbe.toFixed(3)}` : m.mbe.toFixed(3)} (p=${m.mbePValue.toFixed(4)}) | Lin CCC = ${m.ccc.ccc.toFixed(4)} (Cb=${m.ccc.biasCorrectionFactorCb.toFixed(3)}) | 95% LoA [${m.blandAltman.loaLower.toFixed(2)}, ${m.blandAltman.loaUpper.toFixed(2)}].`
    ),
    metrics.some(m => m.missingGapVsComplete > 0)
      ? `Perbedaan sampel terdeteksi: N Complete-Case = ${datasetMeta.nCompletePairs}, sedangkan Available-Case berkisar ${Math.min(...metrics.map(m => m.nAvailableCase))}–${Math.max(...metrics.map(m => m.nAvailableCase))}.`
      : `Seluruh sumber dievaluasi pada jumlah pasangan identik N = ${datasetMeta.nCompletePairs} (tidak ada selisih Complete-Case vs Available-Case).`
  ];

  const step6 =
    pairFixedEffects.nComparisonSources <= 1
      ? [
        `Hanya terdapat 1 sumber pembanding (${pairFixedEffects.baselineComparisonSourceLabel}) dengan MAE = ${pairFixedEffects.coefficients[0]?.meanAe.toFixed(3) ?? '0'}.`,
        `Standar error dikelompokkan berdasarkan ${pairFixedEffects.nClustersCity} kota (Cluster SE = ${pairFixedEffects.coefficients[0]?.seCluster.toFixed(3) ?? '0'}).`,
        'Perbandingan antar sumber pembanding melalui Pair Fixed Effects memerlukan ≥ 2 comparison sources (total ≥ 3 sumber).'
      ]
      : [
        `Model Pair Fixed Effects menyerap ${pairFixedEffects.nCompletePairs} pasangan Kota-Tahun (${pairFixedEffects.nLongObs} observasi long) dengan cluster ${pairFixedEffects.nClustersCity} kota.`,
        `Uji Omnibus Wald: F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${pairFixedEffects.omnibusFStat.toFixed(3)}, p cluster = ${pairFixedEffects.omnibusPValue.toFixed(4)}, Wild Bootstrap p = ${pairFixedEffects.omnibusWildBootstrapPValue.toFixed(4)}.`,
        ...pairFixedEffects.pairwiseContrasts.map(
          c =>
            `Kontras ${c.sourceALabel} vs ${c.sourceBLabel}: ΔMAE = ${c.diffAminusB >= 0 ? `+${c.diffAminusB.toFixed(3)}` : c.diffAminusB.toFixed(3)} | p cluster = ${c.pValueCluster.toFixed(4)} | Wild Boot p = ${c.wildBootstrapPValue.toFixed(4)} (${c.isSignificant05 ? 'Signifikan α=0.05' : 'Tidak Signifikan'}).`
        ),
        ...(pairFixedEffects.smallClusterWarning
          ? [`Peringatan G = ${pairFixedEffects.nClustersCity} (< 30): prioritaskan p-value Wild Cluster Bootstrap (${pairFixedEffects.bootstrapReplications} replikasi).`]
          : [])
      ];

  const step7 = [
    diagnostics.heteroskedasticityTest.conclusion,
    diagnostics.serialCorrelationTest.conclusion,
    diagnostics.crossSectionalDependenceTest.conclusion,
    diagnostics.clusterCountAudit.message,
    diagnostics.outlierSensitivityAudit.summary,
    `Normalitas & CLT: skewness residual = ${diagnostics.normalityAndCltNote.residualSkewness.toFixed(3)}; distribusi AE ≥ 0 wajar miring kanan dan inferensi tetap sah melalui CLT & Wild Bootstrap.`
  ];

  const step8 = [
    `Status Keputusan: ${ranking.conclusivenessStatus} — ${ranking.bestSourceLabel ? `Terbaik relatif: ${ranking.bestSourceLabel}` : 'Belum terdapat bukti cukup untuk menetapkan satu sumber terbaik mutlak'}.`,
    ...ranking.ranks.map(
      r =>
        `Peringkat #${r.rank} ${r.sourceLabel}: MAE = ${r.mae.toFixed(3)} | RMSE = ${r.rmse.toFixed(3)} | MBE = ${r.mbe.toFixed(3)} | Lin CCC = ${r.ccc.toFixed(4)}${r.rank > 1 && r.pValueVsTopCluster !== null ? ` | vs #1: Cluster p=${r.pValueVsTopCluster.toFixed(4)}, Wild p=${(r.pValueVsTopWildBootstrap ?? 1).toFixed(4)}` : ''}.`
    ),
    ranking.methodologicalCaveat
  ];

  const step9 = [
    `Tabel gaya Stata lengkap, 5+ grafik interaktif, interpretasi terstruktur, kode Stata (.do), dan skrip R telah disusun otomatis untuk referensi ${refTag}.`,
    `Hasil tersedia untuk diunduh sebagai PDF, Word (.docx), Excel (.xlsx), CSV, atau dicetak langsung.`
  ];

  return {
    step1,
    step2,
    step3,
    step4,
    step5,
    step6,
    step7,
    step8,
    step9
  };
}
