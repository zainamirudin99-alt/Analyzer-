# Tahap 3: Remedial Sah, Pelaporan Jujur, Ekspor Word, dan Finalisasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menuntaskan Tahap 3 Analisis Regresi Statistik: modul remedial diagnostik yang sah, lapisan pelaporan jujur (M0 abadi, K percobaan dicatat, label Konfirmatori/Eksploratori, Invarian I10), narasi interpretasi deterministik, ekspor Word (.docx) berstandar SPSS dengan gambar 200 dpi, serta audit pengerasan rilis.

**Architecture:** Modul remedial TypeScript (`src/lib/regression-remedial.ts`) mengeksekusi perhitungan diagnostik, Box-Cox, HC3, outlier removal $\le 5\%$, dan simulasi Normality Pass Rate $B=1000$ secara instan (<500ms). Generator narasi deterministik (`src/lib/regression-interpretation.ts`) menyusun teks interpretasi 100% data-bound. Endpoint Python `/api/engine/plot` merender PNG 200 dpi tajam, dan rute Node `/api/regression/export-docx` memproduksi berkas Word `.docx` dengan tabel semantik asli SPSS. Antarmuka UI diintegrasikan ke `RegressionResultsView.tsx`.

**Tech Stack:** Next.js 14 App Router, TypeScript, docx (npm), Python (matplotlib), Supabase RLS, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-tahap-3-remedial-pelaporan-jujur-export-design.md`

## Global Constraints
- Invarian I4: Tidak ada perbaikan otomatis; pengguna wajib memilih dan menyetujui.
- Invarian I5: Setiap angka dalam narasi dapat ditelusuri ke objek hasil komputasi (zero text halusinasi).
- Invarian I6: Setiap percobaan perbaikan dicatat append-only di `analysis_events`.
- Invarian I7: Menu CED tidak boleh mengalami regresi fungsional (Zero-Regression).
- Invarian I9: Pengguna hanya dapat mengakses data miliknya sendiri (RLS `auth.uid() = owner_id`).
- Invarian I10: Dilarang keras ada jalur kode yang merekomendasikan perbaikan berdasarkan p-value koefisien prediktor.
- Outlier removal: Batas maksimal kumulatif 5% dari total $N$, dengan konfirmasi per baris.
- Model awal M0 tidak pernah dihapus atau disembunyikan.

---

### Task 1: Instalasi Dependensi & Uji Remedial (TDD)

**Files:**
- Create: `tests/unit/remedial.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: Test suite untuk Box-Cox, HC3, Outlier removal $\le 5\%$, Pass Rate Wilson CI, HAC Newey-West, dan verifikasi Invarian I10.

- [ ] **Step 1: Install `docx` dependency**
  Run: `npm.cmd install docx`
- [ ] **Step 2: Tulis failing test di `tests/unit/remedial.test.ts`**
  Memvalidasi Box-Cox $\lambda \in [-2, 2]$, HC3 standard errors, batas outlier 5%, Wilson score interval, dan bukti Invarian I10 (remedial tidak menerima p-value koefisien).
- [ ] **Step 3: Jalankan test untuk memverifikasi kegagalan (Red)**
  Run: `npx.cmd vitest run tests/unit/remedial.test.ts`
  Expected: FAIL (modul `src/lib/regression-remedial.ts` belum ada).

---

### Task 2: Implementasi Mesin Remedial Terapan (`src/lib/regression-remedial.ts`)

**Files:**
- Create: `src/lib/regression-remedial.ts`
- Test: `tests/unit/remedial.test.ts`

**Interfaces:**
- Produces: `detectOutliers`, `applyOutlierRemoval`, `computeBoxCoxProfile`, `applyTransformation`, `computeHC3StandardErrors`, `computeHACNeweyWest`, `calculateNormalityPassRate`, `computeMDES`, `getPermittedRemedials`.

- [ ] **Step 1: Implementasi fungsi diagnostik dan remedial**
  - Deteksi outlier ($|t| > 3$ atau Cook's $D > 4/n$), batas $\le 5\%$.
  - Box-Cox profile likelihood search $\lambda \in [-2, 2]$ dengan shift constant $c = |\min(Y)| + 1$ bila $Y \le 0$.
  - HC3 heteroskedasticity-consistent covariance matrix: $(X^T X)^{-1} X^T \text{diag}\left(\frac{e_i^2}{(1 - h_{ii})^2}\right) X (X^T X)^{-1}$.
  - HAC Newey-West dengan lag $L = \lfloor 4(n/100)^{2/9} \rfloor$.
  - Simulasi Normality Pass Rate $B = 1000$ subsampel $m = \lfloor 0.8n \rfloor$ dengan 95% Wilson interval: $\frac{\hat{p} + \frac{z^2}{2B} \pm z\sqrt{\frac{\hat{p}(1-\hat{p})}{B} + \frac{z^2}{4B^2}}}{1 + \frac{z^2}{B}}$.
  - Fungsi `getPermittedRemedials` yang HANYA menerima `assumptions: DiagnosticAssumption[]` dan `isTimeSeries: boolean`, tanpa parameter koefisien prediktor (Penegakan Invarian I10).
- [ ] **Step 2: Jalankan test unit remedial (Green)**
  Run: `npx.cmd vitest run tests/unit/remedial.test.ts`
  Expected: PASS

---

### Task 3: Generator Narasi Interpretasi Deterministik

**Files:**
- Create: `src/lib/regression-interpretation.ts`
- Create: `tests/unit/interpretation.test.ts`

**Interfaces:**
- Produces: `generateDeterministicInterpretation(result: OLSFitResult, modelSpec: RemedialSpecification, kTried: number)`

- [ ] **Step 1: Tulis test unit di `tests/unit/interpretation.test.ts`**
  Memastikan teks narasi (Model Summary, ANOVA, Koefisien, Asumsi, Low R2, dan Remedial) mengandung angka-angka eksak dari objek `OLSFitResult`.
- [ ] **Step 2: Implementasi generator narasi deterministik**
  Sesuai Bagian 7 skill remedial dengan bahasa Indonesia baku akademik.
- [ ] **Step 3: Jalankan test interpretasi**
  Run: `npx.cmd vitest run tests/unit/interpretation.test.ts`
  Expected: PASS

---

### Task 4: Endpoint Python Render Grafik Diagnostik 200 DPI

**Files:**
- Create: `api/engine/plot.py`

**Interfaces:**
- Consumes: POST body `{ plot_type: "pp" | "qq" | "res_fit" | "histogram" | "acf_pacf", data: any }`
- Produces: PNG image buffer 200 dpi

- [ ] **Step 1: Tulis handler `api/engine/plot.py`**
  Menggunakan `matplotlib.pyplot` dengan `dpi=200`, styling bersih, grid tipis, label Bahasa Indonesia, dan mengembalikan `image/png`.

---

### Task 5: Endpoint Ekspor Word (.docx)

**Files:**
- Create: `src/app/api/regression/export-docx/route.ts`
- Create: `tests/integration/export-docx.test.ts`

**Interfaces:**
- Produces: File binary `.docx` dengan tabel Word asli (SPSS border top/bottom tanpa vertical lines), narasi deterministik, metadata cover page, perbandingan M0 vs Mk, dan gambar grafik.

- [ ] **Step 1: Tulis integration test `tests/integration/export-docx.test.ts`**
- [ ] **Step 2: Implementasi route handler `/api/regression/export-docx`**
- [ ] **Step 3: Jalankan test ekspor docx**
  Run: `npx.cmd vitest run tests/integration/export-docx.test.ts`
  Expected: PASS

---

### Task 6: Integrasi Antarmuka UI (Remedial Drawer, M0 Permanen, & Ekspor)

**Files:**
- Modify: `src/components/RegressionResultsView.tsx`

**Interfaces:**
- Menampilkan M0 secara permanen di tab/accordion.
- Tombol "Opsi Perbaikan Sah" aktif bila ada asumsi gagal (Invarian I4 & I10).
- Dialog konfirmasi baris outlier dengan batas 5%.
- Tabel perbandingan model (M0 vs M1...Mk) dan Pass Rate.
- Badge status laporan: Konfirmatori vs Eksploratori dengan peringatan metodologis.
- Tombol unduh laporan Word (.docx).

- [ ] **Step 1: Modifikasi `RegressionResultsView.tsx`**
- [ ] **Step 2: Verifikasi interaktivitas dan layout**
  Run: `npx.cmd vitest run tests/unit/viewport-layout.test.ts`

---

### Task 7: Pengerasan, Audit RLS, dan Verifikasi Lengkap

**Files:**
- Modify: `docs/STATUS.md`
- Create: `docs/HANDOFF_T3.md`

- [ ] **Step 1: Jalankan seluruh test suite Vitest (52+ tests)**
  Run: `npx.cmd vitest run`
- [ ] **Step 2: Jalankan build produksi Next.js**
  Run: `npm.cmd run build`
- [ ] **Step 3: Uji verifikasi regresi CED**
  Run: `npx.cmd vitest run tests/regression/ced-behavior.test.ts`
- [ ] **Step 4: Update `docs/STATUS.md` dan tulis `docs/HANDOFF_T3.md`**
- [ ] **Step 5: Git commit dan push**
