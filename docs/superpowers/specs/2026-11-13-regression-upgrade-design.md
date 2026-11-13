# DESIGN SPEC: Refactor, Optimization & Statistical Engine Upgrade — Menu Analisis Regresi Statistik

**Tanggal:** 2026-11-13  
**Status:** Menunggu Persetujuan Pengguna  
**Scope Eksklusif:** Menu **Analisis Regresi Statistik** (`RegressionTab`, `RegressionResultsView`, `src/lib/regression-*`, `src/app/api/engine/*`, `api/py/*`).  
**Zero-Regression Boundary (Invarian I7):** Menu CED (`UploadTab`, `ResultsTab`, `GuideTab`, `SettingsTab`, `/api/analyze`, `/api/results`), menu Regresi Data Panel Stata (`PanelTab`, `panel-*`, `/api/panel/*`), autentikasi global (`AuthGate`), navigasi utama (`Header`, `NavigationDrawer`), dan skema Supabase global **TIDAK DIUBAH**.

---

## 1. Ringkasan Keputusan Arsitektur (Disetujui Pengguna)

1. **Mesin Dual-Mode + Parity Reconciliation**:
   - **Primary Engine (TypeScript)**: Upgrade solver OLS utama di `src/lib/regression-engine.ts` dari normal-equations `matInverse(X'X)` ke **Householder QR Decomposition** dengan deteksi rank & validasi silang **SVD (`solveLstsqSVD`)**.
   - **Cross-Validation Engine (Python Statsmodels)**: Aktifkan endpoint Vercel Serverless non-colliding `api/py/validate.py` menggunakan `numpy`, `scipy`, `statsmodels`, dan `pandas` (hapus `matplotlib` dari `requirements.txt` untuk menjaga ukuran bundel aman di bawah batas Vercel 250MB zip / 500MB uncompressed).
   - **Auto-Fallback & Rekonsiliasi**: Saat berjalan di Vercel dengan Python runtime aktif, frontend/API memverifikasi hasil terhadap `statsmodels` OLS/HC3/Diagnostic dan menampilkan laporan LRE & rekonsiliasi. Saat offline atau di lingkungan lokal tanpa Python (seperti Windows lokal), mesin TypeScript QR/SVD mengeksekusi penuh dan memberi tanda status *"Mode Lokal QR/SVD — Verifikasi Python tidak tersedia di lingkungan lokal"*.
2. **Struktur Wizard 7-Tahap Terpandu + Basic/Advanced Mode**:
   - **Tahap 1 — Sumber Data & Sheet**: Upload `.xlsx/.xls/.csv` (plus dukungan `.sav/.dta` yang ada), Link Google Sheets, Sample Cross-Section (`N=65`) & Sample Time Series, deteksi ukuran file/baris/kolom, dan pemilih sheet multi-sheet terintegrasi.
   - **Tahap 2 — Pembersihan & Pratinjau Data**: Simpan snapshot *original baseline dataset*, tampilkan missing value count per kolom, duplikasi, nilai non-numerik/invalid, statistik deskriptif awal, dan opsi eksplisit penanganan missing value (`Listwise Deletion`, `Mean Imputation`, `Median Imputation`, `Manual Handling` per baris/sel) dengan pratinjau jumlah observasi terdampak sebelum diterapkan. Tidak ada imputasi otomatis tanpa persetujuan.
   - **Tahap 3 — Pemilihan Jenis Data**: Pilihan eksplisit **Cross Section** vs **Time Series**. Jika Time Series: pilih kolom waktu, format, frekuensi (tahunan, semesteran, triwulanan, bulanan, mingguan, harian, tidak beraturan), serta cek otomatis urutan kronologis, duplikasi waktu, periode hilang (*gap*), dan interval tidak konsisten.
   - **Tahap 4 — Pemilihan Metode Analisis**: 4 kartu metode setara:
     1. **SLR** (*Simple Linear Regression*: $Y = \beta_0 + \beta_1 X + \varepsilon$)
     2. **MLR** (*Multiple Linear Regression*: $Y = \beta_0 + \beta_1 X_1 + \dots + \beta_k X_k + \varepsilon$)
     3. **MRA** (*Moderated Regression Analysis*: $Y = \beta_0 + \beta_1 X + \beta_2 Z + \beta_3(X \times Z) + \varepsilon$ via Hierarchical Regression Model 1–3)
     4. **Analisis Kontingensi** (*Crosstabulation, Chi-Square, Fisher's Exact, Cramér's V, Phi, Odds Ratio* — mesin dan output terpisah dari OLS)
   - **Tahap 5 — Konfigurasi Variabel & Parameter**: Form adaptif per metode terpilih, toggle **Basic Mode** (default metodologis aman) vs **Advanced Mode** (Enter/Forward/Backward/Stepwise, jenis koreksi HC0–HC4, opsi normalitas/center variables, dummy coding & reference category untuk prediktor/moderator kategorikal).
   - **Tahap 6 — Ringkasan Pra-Eksekusi & Validasi Akhir**: Cek Invarian I1–I6, kecukupan sampel Green (1991), zero-variance check, condition number / rank check, dan tombol `Jalankan Analisis Statistik`.
   - **Tahap 7 — Ruang Kerja Hasil Gaya SPSS**: Tampilan terstruktur dengan tab bersih (bukan satu dashboard menumpuk):
     - Untuk SLR/MLR: Tab *Tabel Utama SPSS*, *Diagnostik Asumsi*, *Rekomendasi & Remedial ($M_0/M_1/M_2$)*, *Visualisasi Plot*, *Model Lanjutan (Logistic/Poisson/Quantile/Polynomial — Advanced Mode only)*, dan *Ekspor & Validasi SPSS/Python*.
     - Untuk MRA: Output Hierarki Model 1–3 ($R^2$, $\Delta R^2$, $F_{\text{change}}$, $\text{Sig. } F\text{ Change}$), Koefisien Efek Utama & Interaksi, Klasifikasi Moderator Sharma et al. (1981), Simple Slope ($\pm 1\text{ SD}$ / kategori), Johnson-Neyman Floodlight, Interaction Plot, serta uji asumsi Model 3.
     - Untuk Kontingensi: Case Processing Summary, Contingency Table (Observed, Expected, Row/Col/Total %, Adjusted Standardized Residual), Pearson $\chi^2$, Likelihood Ratio $G^2$, Yates, Fisher's Exact / Monte Carlo, peringatan expected count $< 5$, Symmetric Measures ($\phi$, Cramér's $V$, Contingency Coefficient), Risk Estimates ($2\times 2$), Grouped/Stacked Bar & Mosaic Plot.

---

## 2. Pemetaan Masalah Kode Eksisting & Solusi Teknis

| Komponen / File | Celah / Bug Saat Ini | Solusi Refactor & Upgrade |
|---|---|---|
| `src/lib/regression-engine.ts` | 1. Primary solver pakai `matInverse(XTX)` (kuadratkan condition number).<br>2. `missingPolicy` di `OLSFitInput` diabaikan (selalu listwise).<br>3. Tidak mengurutkan baris berdasarkan `timeCol` pada mode Time Series.<br>4. Prediktor kategorikal ($X$) di `Number(r[c])` menghasilkan `NaN` (tidak ada dummy coding engine). | 1. Implementasi `solveQRHouseholder(X, Y)` sebagai solver primer + verifikasi silang `solveLstsqSVD(X, Y)` + rank & collinearity check sebelum estimasi.<br>2. Terapkan `applyMissingPolicy(rows, requiredCols, policy)` untuk `listwise`, `impute_mean`, `impute_median`.<br>3. Urutkan kronologis jika `isTimeSeries && timeCol`.<br>4. Tambah `encodeCategoricalPredictors(rows, xCols, refCategories)` menghasilkan dummy $m-1$ menghindari dummy trap. |
| `src/lib/regression-moderation-mra.ts` | Moderator kategorikal (`isModeratorCategorical`) hanya membuat 1 dummy biner (`uniqueCats[1]` vs lain), gagal jika $\ge 3$ kategori. | Refactor agar untuk moderator kategorikal dengan $m \ge 2$ kategori dan `referenceCategory` pilihan pengguna, dibangun $m-1$ dummy ($D_1 \dots D_{m-1}$) beserta $m-1$ suku interaksi ($X \times D_j$), plus uji simultan $\Delta R^2$ & $F_{\text{change}}$ Model 3 terhadap Model 2 dengan $df_1 = m - 1$. |
| `src/lib/regression-validator.ts` | Belum mendukung mode MRA & Kontingensi secara eksplisit, serta belum mengecek periode hilang & interval waktu tidak konsisten pada Time Series. | Tambah `validateTimeSeriesSequence(rows, timeCol, frequency)` (deteksi urutan, duplikat, gap, interval tak konsisten) serta validator khusus `MRA` dan `Contingency`. |
| `src/lib/regression-recommendation-engine.ts` | Kartu rekomendasi belum memuat seluruh 8 elemen wajib secara seragam (kelebihan/kekurangan metode & konsekuensi terhadap interpretasi koefisien masih bercampur). | Standarisasi tipe & output `StatisticalRecommendationCard` agar memuat lengkap 8 elemen (Masalah, Bukti, Penyebab, Dampak, Alternatif, Kelebihan & Kekurangan, Konsekuensi Interpretasi Koefisien, Aksi Simulasi Remedial) + aturan khusus MRA (mean centering) & non-causality language guard. |
| `src/components/RegressionTab.tsx` | Wizard OLS-only 7 langkah, tidak ada Step Jenis Data terpisah, tidak ada Step Metode (SLR/MLR/MRA/Kontingensi), tidak ada Data Cleaning Stage interaktif, tidak ada Basic vs Advanced Mode. | Refactor total UI `RegressionTab.tsx` menjadi 7-step wizard bersih (sesuai Tahap 1–7 di atas), memisahkan `basicMode` vs `advancedMode`, menyimpan `originalRows` vs `cleanedRows`, dan merutekan eksekusi sesuai metode (`SLR/MLR` -> `/api/engine/fit`, `MRA` -> `runModeratedRegressionAnalysis`, `Contingency` -> `runContingencyAnalysis`). |
| `src/components/RegressionResultsView.tsx` | Terkunci ke output `OLSFitResult` saja; terlalu banyak modal/kartu bertumpuk; MRA & Kontingensi tersembunyi di sub-panel pasca-OLS. | Refactor Stage 7 menjadi router view per metode (`OLSResultView`, `MRAResultView`, `ContingencyResultView`) dengan tab navigasi bersih, tombol Basic/Advanced detail, perbandingan Model $M_0/M_1/M_2$ berdampingan (termasuk OLS vs HC3 berdampingan), serta badge status Konfirmatori vs Eksploratori. |
| `src/lib/regression-docx-builder.ts` & `regression-export-xlsx.ts` | Hanya mendukung `OLSFitResult`; belum mengekspor tabel MRA & Kontingensi ke Word/Excel. | Tambah generator Word (.docx) dan multi-sheet Excel (.xlsx) untuk hasil **MRA** (Model 1–3, Change Stats, Simple Slopes, Johnson-Neyman, Interpretasi) dan **Kontingensi** (Crosstabs, Chi-Square, Symmetric Measures, Risk Estimates). |
| `requirements.txt` & `api/py/validate.py` | `python_engine/` hanya arsip offline; `requirements.txt` memuat `matplotlib>=3.8.0`. | Hapus `matplotlib` dari `requirements.txt`; tambahkan `api/py/validate.py` untuk verifikasi paritas Statsmodels/SciPy di Vercel tanpa menabrak `/api/engine/*`. |

---

## 3. Rencana Pengujian & Verifikasi (Acceptance Gate)

1. **Unit & Statistical Tests (Vitest)**:
   - QR vs SVD vs NIST StRD benchmark datasets (`Norris`, `Pontius`, `Longley`, `Wampler1`, `Wampler2`) dengan target LRE $\ge 8$.
   - Missing value policies (`listwise`, `impute_mean`, `impute_median`) & dummy coding (kategorikal $m=2$ dan $m=3$ kategori tanpa dummy trap).
   - MRA: interaksi positif, interaksi negatif, tidak signifikan, moderator kontinu (mean-centered vs uncentered), moderator kategorikal 2 & $\ge 3$ level + Johnson-Neyman.
   - Contingency: $2\times 2$ (Fisher Exact, Yates, Odds Ratio), $2\times k$, $r\times c$, peringatan expected count $< 5$, Cramér's V.
   - Time series diagnostics: gap/duplicate/unsorted timestamp detection, ADF, KPSS, Breusch-Godfrey, HAC Newey-West.
   - Exports: validasi buffer `.docx` dan `.xlsx` untuk SLR/MLR, MRA, dan Kontingensi.
2. **Zero-Regression & Build Checks**:
   - Seluruh test CED (`tests/regression/ced-behavior.test.ts`), Panel (`tests/unit/panel-*.test.ts`), dan `tsc --noEmit` lulus 100%.
   - Verifikasi manual alur penuh di browser via Playwright / build check untuk desktop & mobile (`360px`, `768px`, `1440px`).

