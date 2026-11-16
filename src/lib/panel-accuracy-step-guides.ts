// ============================================================
// Comparative Measurement Accuracy Assessment — 9-Step Guide
// Purpose & Interpretation Guide for Every Step (1..9)
// ============================================================

export interface AccuracyStepGuide {
  id: number;
  pillLabel: string;
  fullTitle: string;
  purpose: string;
  howToInterpret: string;
  keyCaveat: string;
}

export const PANEL_ACCURACY_STEP_GUIDES: AccuracyStepGuide[] = [
  {
    id: 1,
    pillLabel: '1. Upload',
    fullTitle: 'Step 1 — Data Upload Multi-Sumber Panel',
    purpose:
      'Memuat dataset panel kota-tahun yang berisi minimal 2 sumber pengukuran emisi CO₂ (format .xlsx, .xls, .csv, tempel/paste, Google Sheets, atau preset 4 sumber).',
    howToInterpret:
      'Periksa 6 kartu ringkasan: "Total Baris" = seluruh baris mentah; "Pasangan Lengkap (CC)" = jumlah baris Kota-Tahun yang seluruh sumbernya terisi tanpa NA; "Balanced" berarti semua kota memiliki seluruh tahun lengkap tanpa sel kosong.',
    keyCaveat:
      'Jumlah Complete-Case (CC) menjadi dasar evaluasi berpasangan agar semua sumber dibandingkan pada sel Kota-Tahun yang identik.'
  },
  {
    id: 2,
    pillLabel: '2. Mapping & Ref',
    fullTitle: 'Step 2 — Pemetaan Sumber Dinamis & Pemilihan Referensi',
    purpose:
      'Menentukan kolom City ID, Year, daftar sumber pengukuran (2, 3, 4, 5, atau lebih), satuan fisik, keterangan metode, serta memilih tepat 1 Reference Source (r) sebagai patokan perbandingan.',
    howToInterpret:
      'Sumber bertanda REFERENCE SOURCE (r) menjadi titik acuan perhitungan error: Error_ijt = X_ijt − X_irt. Mengganti sumber referensi akan otomatis menghitung ulang MAE, RMSE, MBE, Lin CCC, Bland-Altman, Pair FE, dan peringkat.',
    keyCaveat:
      'Sumber referensi adalah pembanding empiris (benchmark) pilihan peneliti, bukan kebenaran absolut bebas galat.'
  },
  {
    id: 3,
    pillLabel: '3. Audit & Prep',
    fullTitle: 'Step 3 — Audit Kualitas Data, Validitas Referensi & Prapemrosesan',
    purpose:
      'Memeriksa 10 risiko panel (duplikat kunci City-Year, missing, beda satuan, rasio skala >10×, outlier 1.5×IQR, serta kelayakan sumber referensi) dan menawarkan pembersihan opt-in yang disetujui eksplisit oleh pengguna.',
    howToInterpret:
      'Kartu hijau (OK) menandakan lolos; kuning (Warning) berarti perlu dicermati; merah (Error) memblokir perhitungan (mis. referensi varians nol atau duplikat City-Year belum ditangani). Rekomendasi sistem menyarankan skenario yang menjaga satuan fisik asli.',
    keyCaveat:
      'Jangan mengubah skala (log1p/Winsorize) kecuali memang diperlukan; metrik MAE/RMSE paling bermakna ketika seluruh sumber memakai satuan fisik asli yang setara.'
  },
  {
    id: 4,
    pillLabel: '4. EDA',
    fullTitle: 'Step 4 — Exploratory Data Analysis & Korelasi Panel',
    purpose:
      'Mengeksplorasi distribusi setiap sumber serta membedakan korelasi lintas-kota (overall) dengan korelasi dinamika waktu di dalam kota yang sama.',
    howToInterpret:
      'Overall Pearson/Spearman mengukur keterkaitan global; "Within-City r" mengukur kesesuaian pergerakan antar-tahun di dalam kota yang sama; "First-Difference r" mengukur kesamaan arah perubahan tahunan (ΔX_t). Di scatterplot garis diagonal 45° adalah kesamaan sempurna.',
    keyCaveat:
      'Korelasi tinggi (mis. r > 0.95) hanya membuktikan keterkaitan arah, BUKAN ketiadaan error atau bias aditif sistematis.'
  },
  {
    id: 5,
    pillLabel: '5. Accuracy',
    fullTitle: 'Step 5 — Metrik Akurasi, Lin\'s CCC & Bland-Altman',
    purpose:
      'Mengukur seberapa dekat setiap comparison source terhadap sumber referensi memakai MAE, RMSE, MBE, Lin\'s CCC, serta batas kesepakatan Bland-Altman.',
    howToInterpret:
      'MAE = rata-rata kesalahan absolut (makin kecil makin akurat); RMSE = akar rata-rata kuadrat error (lebih peka outlier); MBE = rata-rata bias bertanda (+ overestimation, − underestimation, ideal ≈ 0); Lin CCC mendekati 1 berarti presisi tinggi dan minim bias (Cb = faktor penalti bias); 95% LoA Bland-Altman menunjukkan rentang 95% selisih observasi.',
    keyCaveat:
      'Bandingkan tabel Complete-Case vs Available-Case jika ada missing values parsial agar perbedaan ukuran sampel (N) tidak menipu.'
  },
  {
    id: 6,
    pillLabel: '6. Pair FE',
    fullTitle: 'Step 6 — Model Inferensial Pair Fixed Effects & Wild Bootstrap',
    purpose:
      'Menguji apakah perbedaan Absolute Error (MAE) antar sumber pembanding signifikan secara statistik pada pasangan Kota-Tahun yang sama: AE_ijt = α_it + Σ β_j Source_j + ε_ijt.',
    howToInterpret:
      'Koefisien β bernilai negatif berarti MAE sumber tersebut lebih kecil (lebih akurat) dari sumber acuan; p-value Cluster < 0.05 berarti selisih MAE signifikan secara statistik dengan standar error terklaster di tingkat kota. Pada jumlah kota kecil (G < 30), prioritaskan "Wild Bootstrap p-val".',
    keyCaveat:
      'Tidak memakai Uji Chow/Hausman/LM karena α_it menyerap karakteristik bersama tiap pasangan Kota-Tahun secara langsung.'
  },
  {
    id: 7,
    pillLabel: '7. Diagnostics',
    fullTitle: 'Step 7 — Diagnostik Statistik & Sensitivitas Outlier',
    purpose:
      'Memeriksa keandalan inferensi statistik: heteroskedastisitas antarsumber, korelasi serial dalam-kota, ketergantungan lintas-kota (Pesaran CD), kecukupan klaster G, serta ketahanan peringkat terhadap outlier.',
    howToInterpret:
      'Warning pada heteroskedastisitas/AR(1) tetap aman ditangani oleh Cluster-Robust SE dan Wild Cluster Bootstrap. Periksa "Audit Sensitivitas Outlier": jika peringkat Full vs Trimmed 95% berubah, hasil dipengaruhi sedikit nilai ekstrem. Ketidaknormalan residual AE ≥ 0 adalah wajar dan inferensi tetap sah melalui CLT.',
    keyCaveat:
      'Jika G < 30, standar error asimtotik cenderung terlalu sempit sehingga Wild Cluster Bootstrap wajib dijadikan rujukan utama.'
  },
  {
    id: 8,
    pillLabel: '8. Ranking',
    fullTitle: 'Step 8 — Evaluasi Komparatif & Keputusan Peringkat Sumber',
    purpose:
      'Menyusun peringkat objektif seluruh sumber pembanding menggunakan MAE sebagai metrik utama yang diverifikasi konsistensinya dengan RMSE, |MBE|, Lin CCC, dan signifikansi Pair Fixed Effects.',
    howToInterpret:
      'Status "TERBUKTI_BERBEDA_SIGNIFIKAN" berarti #1 unggul secara statistik atas #2 tanpa konflik metrik. Status "PERBEDAAN_TIDAK_SIGNIFIKAN" atau "KONFLIK_ANTAR_METRIK" berarti sistem secara jujur menyatakan belum cukup bukti menetapkan satu sumber terbaik mutlak.',
    keyCaveat:
      'Tidak memakai skor komposit semu agar pertentangan antar metrik tetap terlihat transparan.'
  },
  {
    id: 9,
    pillLabel: '9. Final & Export',
    fullTitle: 'Step 9 — Ringkasan Hasil, Tabel Stata, Visualisasi, Kode & Ekspor',
    purpose:
      'Menyajikan seluruh keluaran siap lapor: tabel konsol bergaya Stata, visualisasi interaktif lengkap, narasi interpretasi akademis Bahasa Indonesia, skrip reproduksi Stata (.do) & R (.R), serta berkas unduhan.',
    howToInterpret:
      'Gunakan 4 sub-tab untuk beralih antara Tabel Stata, Grafik Interaktif, Interpretasi Akademis 8 bagian, dan Kode Reproduksi Stata/R. Tombol PDF, Word (.docx), Excel (.xlsx), CSV, dan Print langsung mengemas hasil aktual dataset Anda.',
    keyCaveat:
      'Simpan file .do atau .R bersama laporan ekspor agar seluruh komputasi dapat direplikasi ulang secara independen.'
  }
];
