/**
 * Modul Kamus Singkatan & Istilah Statistika per Step (Tahap 13)
 * Memastikan setiap singkatan teknis pada Step 1–9 memiliki tombol "Keterangan"
 * yang menjelaskan kepanjangan, definisi matematis, dan fungsinya secara transparan.
 */

export interface AcronymGlossaryItem {
  term: string;
  fullName: string;
  meaning: string;
}

export const STEP_ACRONYM_GLOSSARY: Record<number, AcronymGlossaryItem[]> = {
  1: [
    {
      term: 'G',
      fullName: 'Group / Entity Count (Jumlah Entitas Panel)',
      meaning: 'Jumlah unit individu/perusahaan/kota/entitas unik (i = 1..G) yang diamati berulang antarwaktu dalam dataset panel.',
    },
    {
      term: 'T',
      fullName: 'Time Periods (Jumlah Periode Waktu)',
      meaning: 'Banyaknya titik waktu pengamatan berbeda (t = 1..T), seperti tahun, kuartal, atau bulan pada struktur panel.',
    },
    {
      term: 'J',
      fullName: 'Number of Measurement Sources (Jumlah Sumber Pengukuran)',
      meaning: 'Banyaknya instrumen/variabel pengukuran yang diadu setara. Model laten konvensional mensyaratkan minimal J >= 3 agar parameter teridentifikasi.',
    },
    {
      term: 'CC',
      fullName: 'Complete-Case Pairs',
      meaning: 'Jumlah pasangan (Entitas, Waktu) yang seluruh sumber pengukurannya (X1..XJ) terisi lengkap tanpa nilai kosong (missing).',
    },
    {
      term: 'CSV / XLSX',
      fullName: 'Comma-Separated Values / Excel Open XML Workbook',
      meaning: 'Format berkas tabel data yang didukung untuk unggah lokal, selain tautan publik Google Sheets.',
    },
    {
      term: 'Panel',
      fullName: 'Longitudinal / Cross-Sectional Time-Series Data',
      meaning: 'Struktur data dua dimensi yang mengamati G entitas secara berulang sepanjang T periode waktu.',
    },
  ],
  2: [
    {
      term: 'G',
      fullName: 'Group / Entity Count',
      meaning: 'Jumlah kategori entitas unik yang terpetakan sebagai kolom ID Entitas (i) pada uji panel.',
    },
    {
      term: 'T',
      fullName: 'Time Index Span',
      meaning: 'Banyaknya periode unik yang terpetakan pada kolom Waktu (t) dan dicek keunikannya terhadap kombinasi (Entitas, Waktu).',
    },
    {
      term: 'J >= 3',
      fullName: 'Minimum Three Sources Identification Rule',
      meaning: 'Syarat identifikasi minimum model faktor konfirmatif/pengukuran laten: minimal 3 sumber independen diperlukan untuk mengestimasi muatan dan varians galat tanpa asumsi tambahan.',
    },
    {
      term: 'IQR',
      fullName: 'Interquartile Range (Jangkauan Antarkuartil)',
      meaning: 'Rentang antara kuartil ke-3 (Q3) dan kuartil ke-1 (Q1); dipakai dengan pagar 1.5×IQR dan 3.0×IQR untuk mendeteksi outlier tanpa terpengaruh nilai ekstrem.',
    },
    {
      term: 'CC',
      fullName: 'Complete-Case Observations',
      meaning: 'Baris (i, t) dengan seluruh J sumber bernilai numerik valid tanpa missing.',
    },
    {
      term: 'Avail',
      fullName: 'Available-Case Observations',
      meaning: 'Jumlah pengamatan valid yang tersedia secara spesifik pada masing-masing sumber pengukuran secara individual.',
    },
  ],
  3: [
    {
      term: 'SD',
      fullName: 'Standard Deviation (Simpangan Baku)',
      meaning: 'Ukuran sebaran data di sekitar rata-ratanya pada satuan asli atau satuan terstandardisasi.',
    },
    {
      term: 'R^2',
      fullName: 'Coefficient of Determination / Measurement Reliability',
      meaning: 'Proporsi varians sinyal laten sejati yang berhasil ditangkap oleh sebuah sumber pengukuran (0–100%).',
    },
    {
      term: 'R-hat',
      fullName: 'Gelman-Rubin Potential Scale Reduction Factor',
      meaning: 'Metrik konvergensi antar-rantai MCMC. Nilai R-hat <= 1.05 menandakan seluruh rantai simulasi sudah konvergen ke distribusi posterior yang sama.',
    },
    {
      term: 'MCMC',
      fullName: 'Markov Chain Monte Carlo',
      meaning: 'Algoritma simulasi stokastik berulang (di sini 3 rantai paralel) untuk mengambil sampel dari distribusi posterior model hierarkis Bayesian.',
    },
    {
      term: 'IQR',
      fullName: 'Interquartile Range Winsorization',
      meaning: 'Teknik pengendalian outlier ekstrem pada batas bawah/atas distribusi tanpa membuang observasi panel.',
    },
    {
      term: 'z-score',
      fullName: 'Zero-Mean Unit-Variance Standardization',
      meaning: 'Transformasi (X - Mean)/SD agar seluruh sumber dengan satuan sangat berbeda berada pada skala sebanding sebelum penggabungan.',
    },
  ],
  4: [
    {
      term: 'EDA',
      fullName: 'Exploratory Data Analysis',
      meaning: 'Tahap pemeriksaan statistik deskriptif awal untuk memahami sebaran, pusat data, ketimpangan skala, dan korelasi sebelum pemodelan laten.',
    },
    {
      term: 'SD',
      fullName: 'Standard Deviation',
      meaning: 'Mengukur besar penyebaran nilai pengamatan tiap sumber di sekitar nilai rata-ratanya.',
    },
    {
      term: 'IQR',
      fullName: 'Interquartile Range (Q3 - Q1)',
      meaning: 'Ukuran dispersi non-parametrik yang tahan terhadap outlier ekstrem.',
    },
    {
      term: 'CV (%)',
      fullName: 'Coefficient of Variation (Koefisien Variasi = SD / |Mean| × 100%)',
      meaning: 'Mengukur dispersi relatif terhadap besarnya rata-rata sehingga variabilitas sumber berskala berbeda dapat dibandingkan langsung.',
    },
    {
      term: 'r (Pearson)',
      fullName: 'Pearson Product-Moment Correlation Coefficient',
      meaning: 'Kekuatan hubungan linear antara sepasang sumber pengukuran (-1 hingga +1). Korelasi tinggi menunjukkan kedua sumber merespons sinyal yang searah.',
    },
    {
      term: 'rho (Spearman)',
      fullName: 'Spearman Rank Correlation Coefficient',
      meaning: 'Korelasi monotonik berbasis peringkat yang kebal terhadap outlier dan perbedaan transformasi skala non-linear.',
    },
  ],
  5: [
    {
      term: 'MCMC',
      fullName: 'Markov Chain Monte Carlo',
      meaning: 'Metode sampling posterior Bayesian (Gibbs + Metropolis-Hastings pada model marginal Woodbury) dengan beberapa rantai independen.',
    },
    {
      term: 'R-hat',
      fullName: 'Gelman-Rubin Convergence Diagnostic',
      meaning: 'Rasio varians antar-rantai terhadap varians dalam-rantai MCMC. Syarat konvergensi ketat: R-hat <= 1.05 (waspada jika > 1.10).',
    },
    {
      term: 'ESS',
      fullName: 'Effective Sample Size',
      meaning: 'Jumlah sampel posterior independen efektif setelah memperhitungkan autokorelasi antar-iterasi MCMC (target aman > 100–400).',
    },
    {
      term: 'PPP',
      fullName: 'Posterior Predictive P-value',
      meaning: 'Uji kecocokan global model Bayesian. Nilai di rentang 0.05–0.95 (ideal dekat 0.50) berarti data simulasi model cocok dengan pola data aktual.',
    },
    {
      term: 'alpha_j / lambda_j / sigma_eps',
      fullName: 'Additive Bias (α_j), Scale Loading (λ_j), Error SD (σ_ε_j)',
      meaning: 'Tiga parameter kunci: α_j mengukur pergeseran bias sistematis; λ_j mengukur ketepatan penskalaan; σ_ε_j mengukur noise acak instrumen.',
    },
    {
      term: 'R^2',
      fullName: 'Latent Signal Reliability',
      meaning: 'Reliabilitas konsensus: R_j^2 = (λ_j^2 · Var(θ)) / (λ_j^2 · Var(θ) + σ_ε_j^2).',
    },
    {
      term: 'CrI 95%',
      fullName: '95% Credible Interval (Interval Kredibel Posterior)',
      meaning: 'Rentang probabilitas 95% tempat parameter sebenarnya berada menurut distribusi posterior Bayesian.',
    },
    {
      term: 'Corr(eps_a, eps_b)',
      fullName: 'Cross-Source Residual Error Correlation Matrix',
      meaning: 'Korelasi sisaan antar-sumber setelah faktor laten dikeluarkan. |r| > 0.35 menandakan potensi ketergantungan galat (correlated errors).',
    },
  ],
  6: [
    {
      term: 'RMSE',
      fullName: 'Root Mean Squared Error (Total Latent RMSE)',
      meaning: 'Metrik utama peringkat akurasi (ISO 5725): √(α_j^2 + (λ_j - 1)^2·Var(θ) + σ_ε_j^2), menggabungkan Trueness (bias+skala) dan Precision (noise).',
    },
    {
      term: 'MSE',
      fullName: 'Mean Squared Error',
      meaning: 'Kuadrat dari Total Latent RMSE; terdekomposisi rapi menjadi Bias^2 + Scale Distortion^2 + Variance(ε).',
    },
    {
      term: 'LOSO',
      fullName: 'Leave-One-Source-Out Validation',
      meaning: 'Validasi out-of-sample tanpa ground truth: mengeluarkan sumber j, mengestimasi ulang nilai laten θ^(-j) hanya dari sumber sisa, lalu memprediksi X_j.',
    },
    {
      term: 'MAE / MBE / NMAE',
      fullName: 'Mean Absolute Error / Mean Bias Error / Normalized MAE',
      meaning: 'MAE = rata-rata kesalahan absolut |pred - aktual|; MBE = rata-rata arah bias bertanda; NMAE = MAE dibagi rentang/mean agar bebas skala.',
    },
    {
      term: 'Cov95%',
      fullName: '95% LOSO Predictive Interval Coverage',
      meaning: 'Persentase observasi sumber j yang berhasil tertangkap di dalam interval prediksi 95% model LOSO (target kalibrasi ideal ~95%).',
    },
    {
      term: 'CCC',
      fullName: "Lin's Concordance Correlation Coefficient",
      meaning: 'Mengukur seberapa dekat titik observasi (X_ijt, θ_it) menempel pada garis identitas sempurna 45 derajat (menggabungkan presisi r dan akurasi posisi C_b).',
    },
    {
      term: 'LoA',
      fullName: 'Bland-Altman Limits of Agreement (Bias ± 1.96 × SD_diff)',
      meaning: 'Rentang kesepakatan 95% selisih pengukuran sumber j terhadap estimasi konsensus laten θ_it.',
    },
    {
      term: 'Pair FE / AE / DK / WildBoot',
      fullName: 'Pair Fixed Effects / Absolute Error / Driscoll-Kraay SE / Wild Cluster Bootstrap',
      meaning: 'Model regresi perbedaan Absolut Error (AE) antar-sumber dengan pengendali fixed effects sel (Entitas × Waktu) dan tiga inferensi robust klaster: Cluster SE, Driscoll-Kraay (DK) SE, dan Rademacher Wild Bootstrap.',
    },
  ],
  7: [
    {
      term: 'CD',
      fullName: 'Pesaran Cross-Sectional Dependence Test',
      meaning: 'Menguji apakah residual kesalahan antar-entitas (perusahaan/kota/wilayah) saling berkorelasi lintas unit pada waktu yang sama.',
    },
    {
      term: 'AR(1) rho',
      fullName: 'First-Order Autoregressive Serial Correlation',
      meaning: 'Korelasi residual periode t dengan periode sebelumnya t-1 di dalam entitas yang sama. Nilai |rho| tinggi butuh SE robust temporal seperti DK.',
    },
    {
      term: 'DK SE',
      fullName: 'Driscoll-Kraay (1998) Spatial & Temporal Robust Standard Error',
      meaning: 'Kesalahan baku non-parametrik HAC spasial yang tetap konsisten meskipun terdapat korelasi silang antar-entitas sekaligus autokorelasi temporal.',
    },
    {
      term: 'HC1',
      fullName: 'Heteroskedasticity-Consistent (White Small-Sample Adjusted) SE',
      meaning: 'Koreksi varians robust heteroskedastisitas dengan faktor koreksi derajat kebebasan sampel kecil.',
    },
    {
      term: 'CLT',
      fullName: 'Central Limit Theorem (Teorema Limit Pusat)',
      meaning: 'Menjamin statistik uji berbasis rata-rata/regresi Pair FE tetap mendekati distribusi normal secara asimtotik pada sampel cukup besar (N >= 30) meski residual miring.',
    },
    {
      term: 'CC vs Avail',
      fullName: 'Complete-Case vs Available-Case Sensitivity Analysis',
      meaning: 'Uji ketahanan peringkat ketika model dijalankan hanya pada baris lengkap (CC) dibandingkan seluruh data tersedia (Avail).',
    },
    {
      term: 'PPP',
      fullName: 'Posterior Predictive P-value',
      meaning: 'Memverifikasi apakah distribusi residual replikasi posterior sejalan dengan residual aktual data.',
    },
  ],
  8: [
    {
      term: 'ISO 5725',
      fullName: 'International Standard for Accuracy (Trueness & Precision)',
      meaning: 'Standar metrologi internasional yang mendefinisikan Akurasi Total sebagai gabungan Trueness (kedekatan rataan/bias α dan skala λ) serta Precision (kerapatan sebaran σ_ε).',
    },
    {
      term: 'RMSE',
      fullName: 'Total Latent Root Mean Squared Error',
      meaning: 'Skor gabungan Trueness + Scale Distortion + Precision yang menentukan posisi peringkat akurasi relatif setiap sumber.',
    },
    {
      term: 'R^2',
      fullName: 'Latent Signal Reliability (%)',
      meaning: 'Persentase variasi nilai laten yang tercermin murni dalam sumber pengukuran tersebut.',
    },
    {
      term: 'P(Best) / Exp Rank',
      fullName: 'Posterior Probability of Rank #1 / Posterior Expected Rank',
      meaning: 'P(Best) adalah peluang posterior sumber menempati #1 lintas seluruh draw MCMC; Expected Rank mendekati 1.00 menandakan dominasi mutlak.',
    },
    {
      term: 'LOSO MAE',
      fullName: 'Leave-One-Source-Out Mean Absolute Error',
      meaning: 'Rata-rata kesalahan prediksi out-of-sample sumber j ketika sumber tersebut dikeluarkan dari penentuan sinyal konsensus.',
    },
    {
      term: 'WildBoot p',
      fullName: 'Rademacher Wild Cluster Bootstrap p-value',
      meaning: 'Nilai-p non-parametrik berklaster entitas yang membandingkan Absolute Error sumber kandidat versus peringkat #1.',
    },
    {
      term: 'LOCO',
      fullName: 'Leave-One-Cluster-Out Sensitivity Check',
      meaning: 'Pengujian apakah peringkat #1 tetap bertahan saat masing-masing entitas/klaster dikeluarkan satu per satu.',
    },
  ],
  9: [
    {
      term: '.do',
      fullName: 'Stata Master Do-File Script',
      meaning: 'Skrip otomatis Stata yang mereproduksi seluruh alur impor, pra-pemrosesan, pemodelan Bayesian (`bayes: sem`), Pair FE (`reghdfe`), hingga uji diagnostik.',
    },
    {
      term: '.R',
      fullName: 'R Reproducibility Script',
      meaning: 'Skrip statistik R berbasis `brms`/`rstan`/`fixest`/`DescTools` sebagai pembanding independen lintas platform.',
    },
    {
      term: '.stan',
      fullName: 'Stan Probabilistic Programming Model Code',
      meaning: 'Definisi eksplisit model hierarkis Bayesian `X_ijt ~ normal(alpha_j + lambda_j * theta_it, sigma_j)` dengan pembatasan identifikasi lokasi-skala.',
    },
    {
      term: 'PDF',
      fullName: 'Portable Document Format Report',
      meaning: 'Laporan riset akademis siap cetak berformat A4 lengkap dengan tabel Step 1–9, interpretasi 13-bagian, output tabel Stata terurut, dan Master `.do`.',
    },
    {
      term: 'DOCX',
      fullName: 'Microsoft Word Open XML Document',
      meaning: 'Dokumen terstruktur yang mudah disunting untuk keperluan naskah jurnal, skripsi/tesis/disertasi, lengkap dengan tabel berarsir & blok kode Stata.',
    },
    {
      term: 'XLSX / CSV',
      fullName: 'Excel Workbook / Comma-Separated Values Table',
      meaning: 'Workbook Excel 9-sheet berurutan (Ringkasan s.d. Output Stata & Kode) atau CSV ringkas untuk analisis lanjutan dan audit angka presisi.',
    },
  ],
};
