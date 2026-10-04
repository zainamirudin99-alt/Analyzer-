# Tahap 2: Mesin Statistik, Diagnostik Asumsi, dan Output Gaya SPSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun mesin estimasi regresi OLS ganda, menguji seluruh asumsi klasik bergaya SPSS, merender 9 tabel semantik SPSS dan plot SVG modular, serta menghitung skor S1 (NIST) dan S3 (konsistensi internal).

**Architecture:** Frontend Next.js memanggil `/api/engine/fit` yang mengeksekusi OLS, memverifikasi koefisien dengan SVD independen, menguji asumsi klasik komprehensif, mencatat hasil ke tabel `results` dan `analysis_events` Supabase, serta menampilkan tabel semantik dan plot diagnostik tanpa remedial otomatis.

**Tech Stack:** Next.js 14 App Router, TypeScript 5.7, Python 3.9+ Serverless (`statsmodels`, `scipy`, `numpy`, `pandas`), Supabase PostgreSQL RLS, Vanilla CSS & SVG modular.

**Spec:** [docs/superpowers/specs/2026-10-04-tahap-2-mesin-statistik-design.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/superpowers/specs/2026-10-04-tahap-2-mesin-statistik-design.md)

## Global Constraints
- Invarian I4: Tidak ada perbaikan otomatis; tombol opsi perbaikan dinonaktifkan dengan keterangan "tersedia di Tahap 3".
- Invarian I5: Setiap angka dalam tabel dan ringkasan dapat ditelusuri ke objek hasil terstruktur.
- Invarian I6: Setiap eksekusi analisis dicatat append-only di `analysis_events`.
- Invarian I7: Zero-regression pada menu Analisis CED (18 indikator dan skor pengungkapan tidak berubah).
- Invarian I9: Isolasi tenant ketat berbasis RLS `auth.uid() = owner_id`.
- Tampilan tabel wajib semantik HTML `<table>` dengan `<caption>`, garis horizontal khas SPSS, tanpa garis vertikal.
- Format nilai Sig. khas SPSS: `.000` (tanpa angka nol di depan titik desimal).

---

### Task 1: Skema Basis Data Tambahan (`results` & `analysis_events`)

**Files:**
- Create: `supabase/migrations/20261004_regression_results.sql`
- Modify: `tests/integration/rls-two-users.test.ts`

- [ ] **Step 1: Tulis tes integrasi RLS untuk tabel results**
Tambahkan skenario pengujian isolasi tenant untuk tabel `results` (Pengguna B tidak dapat membaca hasil milik Pengguna A).

- [ ] **Step 2: Jalankan tes integrasi untuk memastikan tes gagal sebelum migrasi**
Run: `npx.cmd vitest run tests/integration/rls-two-users.test.ts`
Expected: FAIL / Error pada skenario baru.

- [ ] **Step 3: Tulis file migrasi SQL `supabase/migrations/20261004_regression_results.sql`**
Definisikan tabel `public.results` dengan `analysis_id`, `owner_id`, `result`, `scores`, dan kebijakan RLS (SELECT, INSERT, DELETE) berbasis `auth.uid() = owner_id`.

- [ ] **Step 4: Jalankan tes integrasi kembali untuk memastikan tes lulus**
Run: `npx.cmd vitest run tests/integration/rls-two-users.test.ts`
Expected: PASS.

---

### Task 2: Mesin Estimasi OLS Ganda & Verifikasi SVD (Skor S3)

**Files:**
- Create: `src/lib/regression-engine.ts`
- Create: `api/engine/fit.py`
- Test: `tests/unit/ols-engine.test.ts`

- [ ] **Step 1: Tulis tes unit untuk estimasi OLS dan penghitungan S3**
Uji kesesuaian koefisien $B$, Std. Error, $t$, $p$, $R^2$, $F$, serta 8 cek konsistensi internal S3.

- [ ] **Step 2: Jalankan tes unit untuk memastikan kegagalan awal**
Run: `npx.cmd vitest run tests/unit/ols-engine.test.ts`
Expected: FAIL ("cannot find module regression-engine").

- [ ] **Step 3: Implementasikan algoritma OLS numerik dan verifikasi SVD ganda di `src/lib/regression-engine.ts`**
Menghitung matriks dekomposisi, koefisien $B$, Beta ($\beta$), korelasi zero-order, partial, part, ANOVA table, Model Summary, Belsley Collinearity Diagnostics, Residuals Statistics, dan Casewise Diagnostics.

- [ ] **Step 4: Implementasikan endpoint Python `api/engine/fit.py`**
Mengintegrasikan `statsmodels.api.OLS` dengan `numpy.linalg.lstsq` untuk runtime serverless Vercel.

- [ ] **Step 5: Jalankan tes unit kembali untuk verifikasi keberhasilan**
Run: `npx.cmd vitest run tests/unit/ols-engine.test.ts`
Expected: PASS (S3 = 100%).

---

### Task 3: Diagnostik 9 Asumsi Klasik Komprehensif

**Files:**
- Modify: `src/lib/regression-engine.ts`
- Test: `tests/unit/assumptions.test.ts`

- [ ] **Step 1: Tulis tes unit untuk seluruh 9 uji asumsi klasik**
Menguji normalitas (Shapiro/Lilliefors), linearitas (Ramsey RESET), homoskedastisitas (Koenker/Glejser), multikolinearitas (Tolerance/VIF/Belsley), outlier (Cook's D/Leverage), dan time series (Breusch-Godfrey, ADF, KPSS, ARCH-LM).

- [ ] **Step 2: Jalankan tes unit untuk memastikan kegagalan awal**
Run: `npx.cmd vitest run tests/unit/assumptions.test.ts`

- [ ] **Step 3: Implementasikan fungsi diagnostik asumsi klasik lengkap di `src/lib/regression-engine.ts`**
Menghasilkan objek status (`lulus`, `gagal`, `tidak_berlaku`), statistik, $p$-value, dan alasan logis.

- [ ] **Step 4: Jalankan tes unit dan pastikan semua lulus**
Run: `npx.cmd vitest run tests/unit/assumptions.test.ts`
Expected: PASS.

---

### Task 4: Harness Benchmark S1 (NIST StRD & R Fixtures)

**Files:**
- Create: `tests/fixtures/nist-fixtures.ts`
- Create: `tests/fixtures/synthetic-datasets.ts`
- Test: `tests/benchmark/s1-benchmark.test.ts`

- [ ] **Step 1: Siapkan dataset sintetik berbenih tetap dan fixture bersumber resmi NIST StRD**
Fixture NIST: Norris, Pontius, Longley beserta tanggal rilis dan URL sumber resmi NIST.

- [ ] **Step 2: Tulis fungsi penghitung LRE (Log Relative Error) dan tes benchmark S1**
$LRE = -\log_{10}(|q - c| / |c|)$. Target $LRE \ge 9$ pada dataset bernutrisi baik.

- [ ] **Step 3: Jalankan tes benchmark S1**
Run: `npx.cmd vitest run tests/benchmark/s1-benchmark.test.ts`
Expected: PASS (Semua LRE memenuhi target).

---

### Task 5: Komponen Visualisasi Plot SVG Modular

**Files:**
- Create: `src/components/DiagnosticPlots.tsx`
- Test: `tests/unit/diagnostic-plots.test.ts`

- [ ] **Step 1: Tulis tes unit untuk rendering data koordinat plot SVG**
Memvalidasi kalkulasi scaling, pembuatan elemen SVG, titik scatter Q-Q, P-P, histogram baris, dan kurva residu.

- [ ] **Step 2: Implementasikan komponen `DiagnosticPlots.tsx`**
SVG murni, responsif mengikuti lebar kontainer, tooltip sentuh, zero bundle bloat.

- [ ] **Step 3: Jalankan tes unit plot diagnostik**
Run: `npx.cmd vitest run tests/unit/diagnostic-plots.test.ts`
Expected: PASS.

---

### Task 6: Tampilan Hasil Gaya SPSS & Integrasi Wizard

**Files:**
- Create: `src/components/RegressionResultsView.tsx`
- Create: `src/app/api/engine/fit/route.ts`
- Modify: `src/components/RegressionTab.tsx`

- [ ] **Step 1: Implementasikan Route Handler `src/app/api/engine/fit/route.ts`**
Menerima `analysis_id` dan dataset, mengeksekusi OLS & diagnostik asumsi, dan mengembalikan payload hasil terstruktur.

- [ ] **Step 2: Buat komponen `RegressionResultsView.tsx`**
Merender 9 tabel semantik gaya formal SPSS, kartu kesesuaian S1/S3, ringkasan asumsi dengan tombol remedial dinonaktifkan (Tahap 3), dan tab visualisasi SVG.

- [ ] **Step 3: Sambungkan Step 6 pada `RegressionTab.tsx` dengan `RegressionResultsView`**
Pengguna menekan "Jalankan Analisis OLS" -> memanggil API -> menampilkan view hasil lengkap.

---

### Task 7: Benchmark Kinerja & Verifikasi Gerbang G2

**Files:**
- Test: `tests/benchmark/performance.test.ts`
- Modify: `docs/STATUS.md`
- Create: `docs/HANDOFF_T2.md`

- [ ] **Step 1: Jalankan pengujian performa untuk $n=10.000$ dan $k=10$**
Catat waktu eksekusi OLS (wajib < 3 detik di serverless).

- [ ] **Step 2: Jalankan seluruh test suite komprehensif**
Run: `npx.cmd vitest run` (Semua test unit, integrasi, regresi CED, benchmark NIST harus LULUS).

- [ ] **Step 3: Jalankan build Next.js**
Run: `npm.cmd run build` (Harus sukses tanpa error kompilasi).

- [ ] **Step 4: Susun `docs/HANDOFF_T2.md` dan perbarui `docs/STATUS.md` ke G2 LULUS**
Dokumentasikan tabel LRE, hasil uji S3, dan catatan persiapan Tahap 3.
