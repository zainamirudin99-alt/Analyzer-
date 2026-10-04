# Status Proyek: Analisis Regresi Statistik

Dokumen ini memantau progres implementasi fitur Analisis Regresi Statistik dari Tahap 1 sampai Tahap 3.

---

## Ringkasan Status Tahapan

| Tahap | Deskripsi | Status | Gerbang |
|---|---|---|---|
| **Tahap 1** | Fondasi, arsitektur, dan alur data masuk (wizard, upload/link, RLS, kerangka mesin Python) | **SELESAI** | G1 (LULUS) |
| **Tahap 2** | Mesin estimasi OLS, uji asumsi klasik gaya SPSS, time series, dan replikasi tabel | **SELESAI** | G2 (LULUS) |
| **Tahap 3** | Remedial asumsi, Normality Pass Rate, pelaporan jujur, interpretasi otomatis, ekspor dokumen | **SELESAI** | G3 (LULUS) |

---

## Log Tahap 3

- **Status Gerbang G3**: LULUS (69/69 Vitest passed across 14 test files, Build Clean 135 kB First Load JS).
- **Invarian I10**: Terbukti secara mekanis via unit test bahwa mesin remedial tidak menerima atau mengevaluasi p-value koefisien prediktor. Remedial murni dipicu oleh status kegagalan diagnostik asumsi.
- **Lapisan Pelaporan Jujur**:
  - Model awal $M_0$ selalu ditampilkan secara permanen dan tidak pernah dihapus/disembunyikan.
  - Setiap spesifikasi perbaikan dicatat append-only dengan penghitung $K$.
  - Klasifikasi status deterministik: Konfirmatori vs Eksploratori disertai peringatan metodologis forking path.
- **Modul Remedial**:
  - Outlier removal dengan batas kumulatif 5% dan konfirmasi per baris.
  - Transformasi: Box-Cox berbasis profil log-likelihood model regresi ($\lambda \in [-2, 2]$) dengan interval keyakinan 95%, Log ($\ln$), $\log_{10}$, $\sqrt{}$.
  - Robust: Galat baku HC3 (White-MacKinnon) dan estimasi terstandarisasi.
  - Normality Pass Rate: Evaluasi simulasi dengan interval keyakinan Wilson 95% dan perlakuan "tidak berlaku" yang jujur untuk metode bebas asumsi normalitas.
  - Time series: HAC Newey-West ($L = \lfloor 4(n/100)^{2/9} \rfloor$), ARX (lag $Y$), dan deteksi regresi lancung.
  - Jalur $R^2$ rendah: Pengungkapan efek terkecil terdeteksi (MDES) dari distribusi $F$ non-sentral dan tombol "Terima hasil apa adanya".
- **Generator Interpretasi Deterministik**:
  - 100% data-bound mengikuti Bagian 7 skill remedial bahasa Indonesia akademik. Seluruh angka identik dengan objek hasil.
- **Ekspor Dokumen Word (.docx)**:
  - Menggunakan pustaka `docx`, memproduksi tabel semantik Word asli gaya SPSS (garis horizontal tanpa garis vertikal, catatan kaki, interpretasi naratif, sampul formal, dan ringkasan eksekutif).
  - Rute API `/api/regression/export-docx` terverifikasi berfungsi mengunduh dokumen binary OOXML valid.
- **Pengerasan & Keamanan**:
  - 100% Zero-Regression pada menu CED (3/3 test lulus).
  - RLS isolasi tenant Pengguna A vs Pengguna B terbukti aman (4/4 test lulus).
  - 5/5 pengujian layout 4 viewport lulus dengan touch target minimal 44px.

---

## Log Tahap 2

- **Status Gerbang G2**: LULUS (52/52 Vitest passed, NIST Norris LRE 13.33–15.11, S3 = 100%, Fit n=10k k=10 dalam ~300ms, Build Clean).
- **Hasil S1 Benchmark (NIST Norris)**:
  - Intercept $\beta_0$: LRE = 13.33 (Target $\ge 9.0$)
  - Slope $\beta_1$: LRE = 14.40 (Target $\ge 9.0$)
  - $R^2$: LRE = 15.11 (Target $\ge 9.0$)
  - Residual Std Error: LRE = 13.83 (Target $\ge 9.0$)
- **Skor Konsistensi S3**: 100% (8 dari 8 cek matematis lolos identitas eksak OLS).
- **Kinerja**: $n=10.000, k=10$ diselesaikan dalam 249–422 ms (jauh di bawah batas timeout 3.000 ms).
- **UI Responsif**: 9 tabel semantik gaya SPSS tanpa garis vertikal, angka sig `.000`, card view mobile, plot SVG responsif interaktif.
- **Item Ditunda ke Tahap 3**:
  - Metode seleksi variabel bertahap (Forward, Backward, Stepwise).
  - Remedial otomatis dan perbaikan data (Box-Cox, WLS, HAC Newey-West, pembersihan outlier).
  - Normality Pass Rate dan rekomendasi remediasi.
  - Ekspor Word/PDF/Excel dan interpretasi naratif otomatis.

---

## Log Tahap 1

- **Status Gerbang G1**: LULUS (Persetujuan ADR-01, Migrasi RLS, 26 Test Vitest Lulus, Spike Bundel ~300 MB < 500 MB)
- **Item Tertunda (Deferred to Phase 2/3)**:
  - Estimasi koefisien OLS, t-test, F-test (Tahap 2 - SELESAI)
  - Pengujian asumsi klasik formal (Tahap 2 - SELESAI)
  - Remedial statistik & Normality Pass Rate (Tahap 3)
  - Ekspor Word/PDF/Excel hasil regresi (Tahap 3)
  - Template interpretasi naratif bahasa Indonesia (Tahap 3)
  - Scheduled function / pg_cron pembersihan dataset usang (Tahap 3)
