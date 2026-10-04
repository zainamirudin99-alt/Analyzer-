# TODO WORKFLOW: Rencana Kerja Implementasi 3 Tahap

Dokumen ini memuat daftar tugas operasional dari Tahap 1 hingga Tahap 3 beserta gerbang kelulusan (*quality gates*).

---

## TAHAP 1: Fondasi, Arsitektur, dan Data Masuk

### Milestone 1.1: Discovery & Keputusan Arsitektur
- [x] Buat `AGENTS.md` di akar repositori memuat batasan platform dan invarian sistem.
- [x] Buat `docs/STATUS.md` dengan status awal ketiga tahap `BELUM`.
- [x] Lakukan inspeksi menyeluruh repo dan buat `docs/SOURCE_OF_TRUTH.md`.
- [x] Susun `docs/ARCHITECTURE_ROADMAP.md` untuk gambaran besar sistem.
- [x] Susun `docs/adr/ADR-01-mesin-statistik.md` membandingkan Opsi A, B, dan C.
- [ ] **[CHECKPOINT AKTIF]**: Dapatkan persetujuan pemilik repositori atas `ADR-01`.

---

### Milestone 1.2: Basis Data & Supabase Storage (Setelah ADR-01 Disetujui)
- [ ] Buat file migrasi SQL `supabase/migrations/20261004_regression_foundation.sql`:
  - [ ] Tabel `datasets` (id, owner_id, source_type, storage_path, original_name, size_bytes, sheet_names, created_at, expires_at).
  - [ ] Tabel `analyses` (id, owner_id, dataset_id, sheet_name, y_col, x_cols, is_time_series, time_col, frequency, alpha, missing_policy, normality_test, entry_method, status, created_at).
  - [ ] Tabel `analysis_events` (id, analysis_id, seq, event_type, payload, created_at) — *append-only*.
  - [ ] CHECK constraints: $0 < \alpha < 1$, `x_cols` tidak kosong, $Y \notin X$, `time_col` wajib bila `is_time_series = true` dan bukan anggota $X$.
  - [ ] RLS policies: Isolasi tenant `auth.uid() = owner_id` pada semua tabel.
  - [ ] RLS policy `analysis_events`: Hanya `INSERT` dan `SELECT` (blokir `UPDATE` dan `DELETE`).
- [ ] Konfigurasi Supabase Storage:
  - [ ] Bucket privat `datasets` (limit 10 MB, mime types whitelist: `.xlsx`, `.xls`, `.csv`).
  - [ ] Storage RLS: `{auth.uid()}/...` hanya dapat diakses oleh pemiliknya.
- [ ] Uji isolasi data dua pengguna (Pengguna A vs Pengguna B).

---

### Milestone 1.3: Navigasi, Menu, dan Autentikasi
- [ ] Tambahkan tab navigasi "Analisis Regresi Statistik" pada [Header.tsx](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/components/Header.tsx).
- [ ] Buat guard autentikasi untuk menu regresi (modal / form login Supabase jika belum login).
- [ ] Pastikan menu CED tetap dapat diakses publik tanpa login.
- [ ] Buat tes regresi perilaku menu CED untuk membuktikan zero-regression (Invarian I7).

---

### Milestone 1.4: Ingestion Data (Unggah & Google Sheets)
- [ ] Handler upload file lokal:
  - [ ] Validasi signature file (magic bytes: ZIP/OOXML untuk `.xlsx`, CFBF untuk `.xls`, UTF-8/ASCII untuk `.csv`).
  - [ ] Blokir file bertipe `.xlsm` atau file biner yang tidak diizinkan.
  - [ ] Unggah langsung dari browser terautentikasi ke Supabase Storage via JWT sesi.
- [ ] Handler impor Google Sheets:
  - [ ] Validasi host allowlist (`docs.google.com`, `drive.google.com`).
  - [ ] SSRF guard: Tolak redirect ke IP lokal, private, atau loopback (`127.0.0.1`, `10.*`, `192.168.*`, `169.254.*`).
  - [ ] Timeout request 15 detik dan batas ukuran unduhan 10 MB.
  - [ ] Simpan file unduhan ke Supabase Storage untuk reproduktibilitas analisis.

---

### Milestone 1.5: Kerangka Mesin Python
- [ ] Siapkan struktur direktori Python serverless:
  - `api/engine/health.py` (atau Next.js rewrites ke Python runner).
  - `api/engine/inspect.py` (membaca dataset, mengembalikan sheet, dimensi, 10 baris pratinjau, tipe data).
  - `api/engine/validate.py` (memeriksa aturan validasi data regresi).
  - `requirements.txt` dengan pustaka minimal.
- [ ] Ukur spike bundel serverless terhadap batas 500 MB Vercel.

---

### Milestone 1.6: UI Wizard Responsif (6 Langkah)
- [ ] Step 1: Sumber Data (Pilihan Upload File / Input Link Google Sheets).
- [ ] Step 2: Pilih Sheet (Dropdown sheet name yang terdeteksi).
- [ ] Step 3: Pratinjau & Validasi (Tabel 10 baris pertama, deteksi tipe kolom, missing values).
- [ ] Step 4: Pemilih Variabel (Y = 1 variabel numerik kontinu, X = 1 atau lebih variabel, pemilih kategori referensi jika ada kategori).
- [ ] Step 5: Pertanyaan Time Series & Konfigurasi Dasar (Pilihan Ya/Tidak dengan penjelasan, frekuensi, alpha, missing policy).
- [ ] Step 6: Ringkasan & Konfirmasi Validasi (Kecukupan sampel Green 1991, rank check, identifikasi SLR vs MLR).
- [ ] Responsivitas UI: Desktop (kiri-tengah-kanan) dan Mobile (stepper atas, bottom sheet, bottom sticky action bar).
- [ ] Netralisasi formula injection (`=`, `+`, `-`, `@`).

---

### Gerbang G1 (Kriteria Kelulusan Tahap 1)
- [ ] ADR-01 disetujui pemilik repositori.
- [ ] Migrasi SQL & kebijakan RLS berjalan; uji dua pengguna lolos (Pengguna B tidak bisa akses data Pengguna A).
- [ ] Wizard data selesai hingga ringkasan di 4 viewport (360x640, 390x844, 768x1024, 1440x900) dengan tangkapan layar.
- [ ] Tes regresi CED lulus 100%.
- [ ] Semua kasus tepi tertangani (file kosong, sheet kosong, kolom konstan, Y non-numerik, link privat, file corrupt).
- [ ] `docs/HANDOFF_T1.md` selesai dan `docs/STATUS.md` diperbarui.

---

## TAHAP 2: Estimasi OLS, Asumsi Klasik, dan Replikasi Output SPSS

- [ ] Mesin estimasi OLS ganda: `statsmodels` (mesin utama) dan `numpy.linalg.lstsq` SVD (mesin verifikasi independen).
- [ ] Implementasi uji asumsi klasik:
  - [ ] Normalitas: Shapiro-Wilk ($n \le 50$) dan Lilliefors ($n > 50$).
  - [ ] Linearitas: Plot residu vs fit dan Ramsey RESET.
  - [ ] Homoskedastisitas: Breusch-Pagan versi Koenker dan Glejser.
  - [ ] Multikolinearitas: Tolerance, VIF, dan Collinearity Diagnostics (Belsley: condition index & variance proportions).
  - [ ] Outlier & Pengaruh: Studentized deleted residual ($|t| > 3$), Cook's D ($> 4/n$), Centered Leverage ($> 2(k+1)/n$).
  - [ ] Autokorelasi: Durbin-Watson (non-time series hanya sebagai acuan; time series: Breusch-Godfrey, Ljung-Box, ACF/PACF).
  - [ ] Time Series: Stasioneritas ADF & KPSS pada Y dan residu, heteroskedastisitas bersyarat ARCH-LM.
- [ ] Render 9 tabel keluaran gaya SPSS (HTML semantik `<table>` dengan `<caption>`, border horizontal, tanpa garis vertikal).
- [ ] Perhitungan skor kesesuaian:
  - [ ] S1: Benchmark rilis terhadap dataset NIST StRD (LRE $\ge 9$ pada kondisi baik).
  - [ ] S2: Konkordansi tampilan 100% terhadap fixture R / GNU PSPP.
  - [ ] S3: Konsistensi per analisis 100% (cek konsistensi internal dua mesin).
- [ ] **Gerbang G2**: Lulus uji benchmark NIST StRD, konkordansi tabel 100%, konsistensi internal S3 lulus.

---

## TAHAP 3: Remedial Sah, Normality Pass Rate, Pelaporan Jujur, dan Ekspor

- [ ] Pelaporan Model M0 apa adanya (tidak menyembunyikan hasil jelek, tidak ada tombol "buat signifikan").
- [ ] Matriks remedial:
  - [ ] Koreksi galat baku heteroskedastisitas HC3.
  - [ ] Transformasi (Log, akar, Box-Cox dengan smearing Duan).
  - [ ] Estimasi Robust (Huber/Tukey bisquare) & Kuantil median / Theil-Sen.
  - [ ] Bootstrap BCa non-time series & block bootstrap time series ($B = 1000$ sampai $5000$).
  - [ ] Koreksi autokorelasi time series: HAC Newey-West & GLSAR iterative.
- [ ] Normality Pass Rate (PR): $B = 1000$ subsampel tanpa pengembalian berukuran $m = \lfloor 0.8n \rfloor$ dengan selang kepercayaan Wilson 95%.
- [ ] Jalur $R^2$ rendah atau $F$ tidak signifikan: Analisis MDES via distribusi $F$ non-sentral (hindari post-hoc power).
- [ ] Penetapan label otomatis oleh sistem: **Konfirmatori** vs **Eksploratori**.
- [ ] Template interpretasi naratif otomatis berbahasa Indonesia.
- [ ] Ekspor laporan: Word (`.docx`), PDF, dan Excel (`.xlsx`) dengan proteksi formula injection.
- [ ] Skrip pembersihan berkala data usang (`expires_at`).
- [ ] **Gerbang G3**: Audit kepatuhan pelaporan jujur, uji ekspor dokumen, evaluasi akhir pengguna.
