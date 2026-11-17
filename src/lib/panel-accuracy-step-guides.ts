// ============================================================
// Reference-Free All-Source Latent & Consensus Assessment
// 9-Step Bullet Guides + Live Actual Point-by-Point Interpretations
// ============================================================

import { PanelAccuracyFitResult } from './panel-accuracy-types';

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
      'Memuat data panel Kota-Tahun dengan minimal 3 sumber pengukuran CO₂ yang akan dinilai bersama (tanpa mengunci 1 sumber referensi).',
      'Mendukung Excel (.xlsx/.xls), CSV, tempel tabel (paste), Google Sheets, atau preset 4 sumber CO₂.'
    ],
    interpretPoints: [
      'Total Baris: jumlah baris mentah pada berkas asal.',
      'Pasangan Lengkap (CC): baris Kota-Tahun di mana seluruh J sumber terisi valid tanpa missing value.',
      'Status Balanced: setiap kota memiliki periode tahun pengamatan yang lengkap dan seragam.'
    ],
    keyCaveat:
      'Untuk memisahkan error varians dan menemukan variabel paling benar tanpa patokan eksternal, secara teoretis dibutuhkan minimal J >= 3 sumber pengukuran independen.'
  },
  {
    id: 2,
    pillLabel: '2. Config All',
    fullTitle: 'Step 2 — Intelligent All-Source Mapping (Tanpa Reference Terkunci)',
    purposePoints: [
      'Menganalisis 14 karakteristik kolom untuk memetakan City ID, Year, dan seluruh J sumber pengukuran secara setara.',
      'Menjamin SEMUA variabel yang dipetakan ikut dinilai dan berpeluang menempati Peringkat #1.'
    ],
    interpretPoints: [
      'Evaluated Source (1..J): seluruh variabel diposisikan sejajar tanpa ada yang dikecualikan sebagai patokan nol.',
      'Recommended vs Warning: menilai kesiapan cakupan, varians positif, dan konsistensi skala/satuan.',
      'Identifiabilitas Laten (J >= 3): memastikan model triangulasi dan Bayesian MCMC dapat mengurai reliabilitas tiap variabel.'
    ],
    keyCaveat:
      'Tidak menetapkan satu sumber pun sebagai kebenaran mutlak; akurasi tiap variabel diukur melalui model laten bersama dan triangulasi.'
  },
  {
    id: 3,
    pillLabel: '3. Audit & Prep',
    fullTitle: 'Step 3 — Audit Kualitas, Identifiabilitas Laten & Prapemrosesan',
    purposePoints: [
      'Menguji 10 potensi risiko data panel sekaligus syarat identifiabilitas model pengukuran laten (J >= 3, varians > 0).',
      'Menyediakan opsi prapemrosesan eksplisit (Hapus Duplikat, Winsorization 2.5%, Transformasi log(1+x)).'
    ],
    interpretPoints: [
      'OK (Hijau): seluruh sumber memenuhi syarat identifikasi dan kualitas panel.',
      'Warning (Kuning): ada sel kosong parsial, perbedaan skala, outlier 1.5×IQR, atau J = 2 (underidentified).',
      'Error (Merah): masalah pemblokir (varians nol pada salah satu sumber atau duplikat City-Year aktif).'
    ],
    keyCaveat:
      'Pertahankan satuan fisik asli agar Error SD (σ_εj), Total Latent RMSE, dan alpha bias mudah dimaknai secara substantif.'
  },
  {
    id: 4,
    pillLabel: '4. EDA',
    fullTitle: 'Step 4 — Exploratory Data Analysis & Korelasi Panel',
    purposePoints: [
      'Menilai sebaran deskriptif seluruh J sumber (Mean, SD, Median, IQR, CV, Skewness).',
      'Membedakan korelasi antar-kota dari dinamika perubahan tahunan di dalam kota yang sama.'
    ],
    interpretPoints: [
      'Overall Pearson / Spearman: keterkaitan linear dan monotonik seluruh pasangan sumber.',
      'Within-City r: konsistensi naik-turun tahunan di dalam kota yang sama.',
      'First-Difference r (ΔX_t): kesamaan arah perubahan emisi tahunan antarsumber.',
      'Tren Tahunan & Scatter vs θ̂: posisi masing-masing sumber terhadap estimasi konsensus.'
    ],
    keyCaveat:
      'Korelasi tinggi belum membuktikan variabel paling benar — variabel dengan r tinggi masih bisa memiliki bias aditif besar atau skala miring.'
  },
  {
    id: 5,
    pillLabel: '5. Latent Bayes',
    fullTitle: 'Step 5 — Bayesian Hierarchical Latent Model & Agreement Assessment',
    purposePoints: [
      'Mengestimasi nilai emisi sejati laten (θ_it) beserta bias aditif (α_j), loading (λ_j), Error SD (σ_εj), dan Reliabilitas (R²) untuk SEMUA J sumber.',
      'Menghitung Total Latent RMSE, Posterior Probability of Being Best, serta Leave-One-Source-Out MAE, Lin CCC & Bland-Altman.'
    ],
    interpretPoints: [
      'Total Latent RMSE & Error SD: semakin mendekati 0 berarti variabel paling dekat ke emisi laten sejati dan error randomnya paling kecil.',
      'Reliabilitas R²: porsi variasi data variabel tersebut yang mencerminkan sinyal emisi sejati (mendekati 100% = paling konsisten).',
      'Posterior Prob Best (%): peluang posterior bahwa variabel tersebut menjadi yang paling akurat di antara seluruh J variabel.',
      'LOSO MAE & Lin CCC: uji kesepakatan tiap variabel terhadap konsensus gabungan J−1 variabel lainnya (bebas self-inclusion).'
    ],
    keyCaveat:
      'Identifikasi memakai Median(α_j/λ_j) = 0 & GeoMean(λ_j) = 1; bias kolektif bila seluruh instrumen menyimpang seragam tetap merupakan batasan statistik.'
  },
  {
    id: 6,
    pillLabel: '6. Pair FE',
    fullTitle: 'Step 6 — Pair Fixed Effects & Posterior Contrasts Semua Sumber',
    purposePoints: [
      'Menguji signifikansi perbedaan kesalahan absolut (AE_ijt = |X_ijt − θ̂_it|) antarseluruh J sumber pada sel Kota-Tahun yang sama.',
      'Menggabungkan uji frequentist (City Cluster SE + Rademacher Wild Bootstrap) dengan probabilitas posterior Bayesian P(RMSE_A < RMSE_B).'
    ],
    interpretPoints: [
      'Beta Diff < 0: deviasi variabel tersebut lebih kecil dibanding kategori pembanding acuan.',
      'Wild Bootstrap p < 0.05 & P_Bayes >= 95%: perbedaan akurasi antar kedua sumber terbukti kuat.',
      'Seluruh C(J, 2) pasangan dievaluasi agar peringkat #1 benar-benar diuji melawan peringkat #2, #3, ..., #J.'
    ],
    keyCaveat:
      'Untuk jumlah kota G < 30, prioritaskan p-value Wild Cluster Bootstrap dan Credible Interval Bayesian dibanding SE asimtotik.'
  },
  {
    id: 7,
    pillLabel: '7. Diagnostics',
    fullTitle: 'Step 7 — Diagnostik MCMC (R-hat/ESS), Panel Error & Outlier Sensitivity',
    purposePoints: [
      'Memeriksa konvergensi MCMC (max R-hat <= 1.10, min ESS, Posterior Predictive p-value) dan keandalan Grubbs triangulation.',
      'Menguji heteroskedastisitas, autokorelasi AR(1), Pesaran CD, jumlah klaster G, dan sensitivitas 95% Trimmed MAE.'
    ],
    interpretPoints: [
      'R-hat <= 1.05–1.10: seluruh rantai MCMC telah menyatu stabil pada distribusi posterior sejati.',
      'Heteroskedastisitas / AR(1) Warning: aman karena model memodelkan σ_εj per sumber + Cluster SE + Wild Bootstrap.',
      'Outlier Sensitivity: bila urutan peringkat berbalik di 95% Trimmed, kesimpulan tidak boleh dipaksakan menang.'
    ],
    keyCaveat:
      'Jangan menilai validitas model dari uji normalitas AE karena nilai error absolut (|e| >= 0) secara alami menceng kanan.'
  },
  {
    id: 8,
    pillLabel: '8. Ranking',
    fullTitle: 'Step 8 — Evaluasi Komparatif & Pemeringkatan Akhir Seluruh Sumber (1..J)',
    purposePoints: [
      'Menyusun peringkat lengkap #1 sampai #J berdasarkan Total Latent RMSE terendah & Reliabilitas R² tertinggi.',
      'Menguji ketahanan peringkat melalui simulasi Leave-One-City-Out (LOCO) jackknife dan aturan 4-status konklusif.'
    ],
    interpretPoints: [
      'TERBUKTI_BERBEDA_SIGNIFIKAN: #1 unggul konsisten di Total Latent RMSE, R², Posterior Prob, & Pair FE tanpa konflik metrik.',
      'PERBEDAAN_TIDAK_SIGNIFIKAN: selisih #1 vs #2 tidak signifikan (belum cukup bukti menetapkan pemenang tunggal).',
      'KONFLIK_ANTAR_METRIK: terdapat pertentangan antara Total RMSE, Error SD/R², LOSO MAE, atau 95% Trimmed.',
      'MODEL_TIDAK_TERIDENTIFIKASI: J < 3 sumber atau MCMC gagal konvergen.'
    ],
    keyCaveat:
      'Keputusan peringkat berlaku pada kesepakatan instrumen di dataset ini; verifikasi kalibrasi fisik lapangan tetap disarankan bila semua sumber bias seragam.'
  },
  {
    id: 9,
    pillLabel: '9. Final & Export',
    fullTitle: 'Step 9 — Hasil Akhir, Tabel Stata, Visualisasi, Kode (.do/.R/.stan) & Ekspor',
    purposePoints: [
      'Menyajikan ringkasan utuh seluruh J sumber: Tabel Gaya Stata, Visualisasi Publikasi, Interpretasi Akademis, serta kode reproduksi .do, .R, dan .stan.',
      'Mendukung ekspor siap laporan ke PDF, Word (.docx), Excel (.xlsx), CSV, dan Print.'
    ],
    interpretPoints: [
      'Tabel Stata & Bayar Laten: mencakup Reliabilitas R², Error SD, Alpha, Lambda, Posterior Prob, dan Pair FE.',
      'Visualisasi: dilengkapi grafik Latent Reliability R² & Posterior Probability of Being Best serta Forest Plot kontras.',
      'Kode Reproduksi: mencakup Stata sem/areg, R lavaan/fixest, serta model Stan MCMC lengkap.'
    ],
    keyCaveat:
      'Laporkan seluruh 4 komponen keterbatasan epistemologis bila menyertakan kesimpulan ranking di publikasi ilmiah.'
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
  const { datasetMeta, qualityReport, latentModel, metrics, pairFixedEffects, diagnostics, ranking } = result;

  const step1 = [
    `Dataset memuat ${datasetMeta.nObsRaw} baris mentah pada ${datasetMeta.nCities} kota × ${datasetMeta.nYears} tahun (${qualityReport.yearMin ?? '-'}–${qualityReport.yearMax ?? '-'}).`,
    `Tersedia ${datasetMeta.nCompletePairs} pasangan City-Year lengkap (Complete-Case) dengan ${result.sources.length} sumber pengukuran yang dievaluasi bersama.`,
    `Struktur panel: ${datasetMeta.isBalanced ? 'Balanced (seluruh sel City-Year lengkap)' : 'Unbalanced / Parsial'}.`
  ];

  const step2 = [
    `Mode Evaluasi: Reference-Free All-Source Latent & Consensus Ranking (TIDAK ada variabel yang dikecualikan sebagai reference).`,
    `Seluruh J = ${result.sources.length} sumber dievaluasi setara: ${result.sources.map(s => `${s.name} (${s.label})`).join(', ')}.`,
    `${latentModel.identificationRule}`
  ];

  const step3 = [
    `Audit Identifikasi Laten: ${qualityReport.latentAudit.summary}`,
    `Duplikat kunci (City, Year): ${qualityReport.duplicateKeys.length} kasus; outlier total (1.5×IQR): ${qualityReport.outlierCountTotal} titik; rasio skala maks/min: ${qualityReport.scaleRatioMaxToMin.toFixed(2)}×.`,
    `Prapemrosesan aktif: ${
      result.preprocessing.applyLog1p || result.preprocessing.applyWinsorize || result.preprocessing.dropDuplicateCityYear
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
        `${m.sourceLabel}: Pearson r = ${m.pearsonR.toFixed(4)} | Spearman ρ = ${m.spearmanRho.toFixed(4)} | Within-City r = ${m.withinCityR.toFixed(4)} | First-Diff r = ${m.firstDiffR.toFixed(4)} (vs konsensus peer).`
    ),
    'Korelasi tinggi belum cukup menentukan sumber paling akurat; periksa bias (α_j) dan Error SD (σ_εj) pada Step 5.'
  ];

  const step5 = [
    ...metrics.map(
      m =>
        `${m.sourceLabel}: Total Latent RMSE = ${m.totalLatentRmse.toFixed(2)} | Error SD = ${m.errorSd.toFixed(2)} [95% CrI ${m.errorSdCiLower.toFixed(1)}..${m.errorSdCiUpper.toFixed(1)}] | Reliabilitas R² = ${(m.reliabilityR2 * 100).toFixed(2)}% | Alpha Bias = ${m.latentInterceptBias >= 0 ? '+' : ''}${m.latentInterceptBias.toFixed(2)} | Posterior Prob Best = ${(m.posteriorProbBest * 100).toFixed(1)}% | LOSO MAE = ${m.mae.toFixed(2)}.`
    ),
    metrics.some(m => m.missingGapVsComplete > 0)
      ? `Catatan sampel: N Complete-Case = ${datasetMeta.nCompletePairs}, sedangkan Available-Case berkisar ${Math.min(...metrics.map(m => m.nAvailableCase))}–${Math.max(...metrics.map(m => m.nAvailableCase))}.`
      : `Seluruh J = ${metrics.length} sumber dievaluasi pada jumlah pasangan identik N = ${datasetMeta.nCompletePairs}.`
  ];

  const step6 = [
    `Model Pair Fixed Effects membandingkan deviasi absolut seluruh ${pairFixedEffects.nComparisonSources} sumber terhadap estimasi laten θ̂_it (${pairFixedEffects.nCompletePairs} pasangan Kota-Tahun, ${pairFixedEffects.nClustersCity} klaster kota).`,
    `Uji Omnibus Wald: F(${pairFixedEffects.omnibusDf1}, ${pairFixedEffects.omnibusDf2}) = ${pairFixedEffects.omnibusFStat.toFixed(3)}, p cluster = ${pairFixedEffects.omnibusPValue.toFixed(4)}, Wild Bootstrap p = ${pairFixedEffects.omnibusWildBootstrapPValue.toFixed(4)}.`,
    ...pairFixedEffects.pairwiseContrasts.map(
      c =>
        `${c.sourceALabel} vs ${c.sourceBLabel}: ΔMAE = ${c.diffAminusB >= 0 ? `+${c.diffAminusB.toFixed(2)}` : c.diffAminusB.toFixed(2)} | Wild p = ${c.wildBootstrapPValue.toFixed(4)} | P_Bayes(A<B) = ${(c.posteriorProbABetterThanB * 100).toFixed(1)}%.`
    )
  ];

  const step7 = [
    diagnostics.bayesianConvergenceAudit.summary,
    diagnostics.heteroskedasticityTest.conclusion,
    diagnostics.serialCorrelationTest.conclusion,
    diagnostics.crossSectionalDependenceTest.conclusion,
    diagnostics.clusterCountAudit.message,
    diagnostics.outlierSensitivityAudit.summary
  ];

  const step8 = [
    `Status Keputusan: ${ranking.conclusivenessStatus} — ${ranking.bestSourceLabel ? `Sumber Paling Akurat & Benar (Rank #1 dari ${ranking.ranks.length}): ${ranking.bestSourceLabel}` : 'Belum terdapat bukti cukup untuk menetapkan satu pemenang tunggal'}.`,
    ...ranking.ranks.map(
      r =>
        `Peringkat #${r.rank} ${r.sourceLabel}: Total RMSE = ${r.totalLatentRmse.toFixed(2)} | Error SD = ${r.errorSd.toFixed(2)} | Reliabilitas R² = ${(r.reliabilityR2 * 100).toFixed(2)}% | P(Best) = ${(r.posteriorProbBest * 100).toFixed(1)}%${r.rank > 1 && r.pValueVsTopWildBootstrap !== null ? ` | vs #1: P_Bayes=${((r.posteriorProbBetterThanSecond ?? 0.5) * 100).toFixed(1)}%, Wild p=${r.pValueVsTopWildBootstrap.toFixed(4)}` : ''}.`
    ),
    ranking.methodologicalCaveat
  ];

  const step9 = [
    `Tabel gaya Stata lengkap, grafik Latent Reliability & Agreement, interpretasi akademis, kode Stata (.do), R (.R), dan Stan (.stan) mencakup seluruh J = ${metrics.length} sumber secara setara.`,
    `Tersedia ekspor langsung ke PDF, Word (.docx), Excel (.xlsx), CSV, dan Print.`
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
