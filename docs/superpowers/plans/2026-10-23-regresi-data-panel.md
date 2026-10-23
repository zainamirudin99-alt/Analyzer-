# Regresi Data Panel (Gaya Stata) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun modul "Regresi Data Panel" bergaya Stata dengan alur 13 langkah (0 s/d 12), estimasi matematis presisi tinggi (CEM, FEM, REM, Chow, Hausman, Mundlak CRE, Breusch-Pagan LM, Greene heteroskedastisitas, Wooldridge autokorelasi, Cluster-Robust SE), tampilan 4 blok Stata monospace + penjelasan bahasa bayi deterministik, serta ekspor laporan DOCX.

**Architecture:** Native TypeScript engine di `src/lib/panel-engine.ts` yang melayani Next.js App Router API (`src/app/api/panel/*`) dengan nol latensi cold start, dipasangkan dengan unit tests yang memvalidasi presisi numerik terhadap golden dataset Grunfeld (1958) toleransi $\le 10^{-6}$, dan UI responsif stepper modular dengan visualisasi konsol Stata otentik.

**Tech Stack:** Next.js 14.2 (App Router), React 18, TypeScript 5.7, Vitest, Vanilla CSS Tokens, docx.js, xlsx.

**Spec:** [docs/regresi-panel/SOURCE_OF_TRUTH.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/SOURCE_OF_TRUTH.md) dan [docs/regresi-panel/ARCHITECTURE_ROADMAP.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/ARCHITECTURE_ROADMAP.md)

## Global Constraints

- Invarian I1: $Y$ harus numerik kontinu (bukan biner, teks, atau ordinal).
- Invarian I2: Matriks $X$ harus full rank ($X'X$ nonsingular).
- Invarian I5: $Y \notin X$ (dependen tidak boleh masuk independen).
- Invarian I6: `id_col` dan `time_col` tidak boleh menjadi anggota $Y$ maupun $X$.
- Invarian I7: Zero-regression pada menu Analisis CED (18 indikator dan riwayat Supabase tidak berubah).
- Invarian I8: Proteksi SSRF impor link Google Sheets (hanya host docs/drive.google.com, batas 10MB, timeout 15 detik).
- Invarian I10: Pasangan `(id, time)` wajib unik (tidak ada duplikat observasi).
- Invarian I11: Batas dimensi panel $N \ge 2$, $T \ge 2$ ($T \ge 3$ untuk uji autokorelasi Wooldridge).
- Invarian I12: Variabel bebas time-invariant otomatis dideteksi dan didrop pada Fixed Effects dengan peringatan.
- Tampilan 4 blok Stata wajib hadir pada setiap langkah 0 s/d 12.
- Penjelasan bahasa bayi 100% deterministik berbasis aturan p-value (tanpa LLM runtime).

---

### Task 1: Fixtures Dataset Publik & Tipe Data TypeScript

**Files:**
- Create: `tests/fixtures/panel/grunfeld.json`
- Create: `tests/fixtures/panel/stata_grunfeld_expected.json`
- Create: `src/lib/panel-types.ts`
- Test: `tests/unit/panel-types.test.ts`

**Interfaces:**
- Produces: `PanelFitInput`, `PanelFitResult`, `ModelSelectionResult`, `AssumptionTestResult`, `StataBlockOutput` in `src/lib/panel-types.ts`.

- [x] **Step 1: Tulis fixture dataset Grunfeld (1958)**
Buat berkas `tests/fixtures/panel/grunfeld.json` yang memuat 200 baris observasi ($N=10$, $T=20$) dengan kolom `company`, `year`, `invest`, `mvalue`, `kstock`.

- [x] **Step 2: Tulis fixture hasil benchmark Stata resmi**
Buat `tests/fixtures/panel/stata_grunfeld_expected.json` dengan angka acuan resmi Stata 17/18:
  - FEM: $\beta_{mvalue} = 0.1101238$, $\beta_{kstock} = 0.3100653$, $\text{\_cons} = -58.74393$, $F(9, 188) = 49.18$.
  - REM: $\beta_{mvalue} = 0.1097812$, $\beta_{kstock} = 0.3081130$, $\text{\_cons} = -57.83441$, Wald $\chi^2(2) = 689.70$.
  - Hausman: $\chi^2(2) = 2.33$, $p = 0.3118$.
  - Breusch-Pagan LM: $\chi^2(1) = 798.16$, $p = 0.0000$.
  - Wooldridge autokorelasi: $F(1, 9) = 13.974$, $p = 0.0046$.
  - Heteroskedastisitas Greene: $\chi^2(10) = 485.45$, $p = 0.0000$.

- [x] **Step 3: Tulis unit test untuk validasi tipe dan integritas fixture**
Buat `tests/unit/panel-types.test.ts` yang memuat dan memvalidasi tipe `grunfeld.json` dan struktur objek `stata_grunfeld_expected.json`.

- [x] **Step 4: Jalankan tes unit untuk memastikan kegagalan awal**
Run: `npx.cmd vitest run tests/unit/panel-types.test.ts`
Expected: FAIL ("cannot find module panel-types").

- [x] **Step 5: Definisikan antarmuka TypeScript di `src/lib/panel-types.ts`**
Buat kontrak tipe lengkap untuk deklarasi panel, input fit, hasil estimasi, diagnostik asumsi, dan blok output Stata.

- [x] **Step 6: Jalankan kembali tes unit**
Run: `npx.cmd vitest run tests/unit/panel-types.test.ts`
Expected: PASS.

---

### Task 2: Mesin Estimasi Dasar Data Panel (CEM, FEM / Within, REM / Swamy-Arora GLS)

**Files:**
- Create: `src/lib/panel-engine.ts`
- Test: `tests/unit/panel-engine.test.ts`

**Interfaces:**
- Consumes: `PanelFitInput` from `src/lib/panel-types.ts`.
- Produces: `fitPanelCEM`, `fitPanelFEM`, `fitPanelREM`, `computePanelSummary` in `src/lib/panel-engine.ts`.

- [x] **Step 1: Tulis tes unit untuk estimasi CEM, FEM, dan REM terhadap benchmark Grunfeld**
Buat `tests/unit/panel-engine.test.ts` yang menguji koefisien, standar error, nilai t/z, p-value, dan derajat bebas terhadap `stata_grunfeld_expected.json` dengan toleransi $10^{-6}$.

- [x] **Step 2: Jalankan tes unit untuk memastikan kegagalan awal**
Run: `npx.cmd vitest run tests/unit/panel-engine.test.ts`
Expected: FAIL.

- [x] **Step 3: Implementasikan algoritma demeaning FEM (Within Estimator)**
Hitung rata-rata per entitas $\bar{y}_i, \bar{X}_{ki}$, transformasi data terpusat, estimasi OLS residu derajat bebas $NT - n - K$, konstanta Stata $\bar{y} - \sum \hat{\beta}_k \bar{X}_k$, dan dekomposisi $R^2$ within, between, overall.

- [x] **Step 4: Implementasikan algoritma quasi-demeaning REM (Swamy-Arora GLS)**
Hitung $\sigma_e^2$ dari residual within, $\sigma_u^2 = \max(0, \frac{s_b^2 - \sigma_e^2}{\bar{T}})$, bobot quasi-demeaning $\theta_i = 1 - \sqrt{\frac{\sigma_e^2}{\sigma_e^2 + T_i \sigma_u^2}}$, dan regresi OLS pada variabel terbobot.

- [x] **Step 5: Implementasikan estimasi Pooled OLS (CEM)**
Estimasi OLS standar pada data gabungan seluruh observasi $NT$.

- [x] **Step 6: Jalankan tes unit untuk memastikan seluruh estimasi lulus presisi $10^{-6}$**
Run: `npx.cmd vitest run tests/unit/panel-engine.test.ts`
Expected: PASS (seluruh koefisien cocok dengan Stata).

---

### Task 3: Uji Pemilihan Model (Chow F-test, Hausman, Mundlak CRE, Breusch-Pagan LM)

**Files:**
- Modify: `src/lib/panel-engine.ts`
- Test: `tests/unit/panel-model-selection.test.ts`

**Interfaces:**
- Consumes: Output model CEM, FEM, REM dari Task 2.
- Produces: `testChow`, `testHausman`, `testMundlakCRE`, `testBreuschPaganLM`, `selectOptimalPanelModel`.

- [x] **Step 1: Tulis tes unit untuk seluruh pengujian pemilihan model**
Buat `tests/unit/panel-model-selection.test.ts` yang menguji nilai statistik Chow $F$, Hausman $\chi^2$, Mundlak Wald $\chi^2$, Breusch-Pagan LM $\chi^2$, dan logika matriks keputusan model terpilih.

- [x] **Step 2: Jalankan tes unit untuk memastikan kegagalan**
Run: `npx.cmd vitest run tests/unit/panel-model-selection.test.ts`
Expected: FAIL.

- [x] **Step 3: Implementasikan Uji Chow (F-test pooled vs FE)**
Hitung $F(n-1, NT-n-K) = \frac{(SSE_{pooled} - SSE_{FE}) / (n - 1)}{SSE_{FE} / (NT - n - K)}$ dan p-value distribusi F.

- [x] **Step 4: Implementasikan Uji Hausman Klasik & Mundlak CRE**
  - Hausman klasik: $\chi^2(K) = (\hat{\beta}_{FE} - \hat{\beta}_{RE})' (\hat{V}_{FE} - \hat{V}_{RE})^{-1} (\hat{\beta}_{FE} - \hat{\beta}_{RE})$.
  - Mundlak CRE: auxiliary regression dengan prediktor rata-rata entitas $\bar{X}_i$ dan uji Wald bersama $H_0: \gamma = 0$ (kebal terhadap $\chi^2$ negatif).

- [x] **Step 5: Implementasikan Uji Breusch-Pagan LM (`xttest0`)**
Hitung Lagrange Multiplier dari residu Pooled OLS menguji $H_0: \sigma_u^2 = 0$.

- [x] **Step 6: Implementasikan logika matriks keputusan otomatis**
Terapkan pohon keputusan Chow $\times$ Hausman $\times$ LM (termasuk 2 kasus anomali siklis) sesuai tabel di `SOURCE_OF_TRUTH.md`.

- [x] **Step 7: Jalankan tes unit kembali**
Run: `npx.cmd vitest run tests/unit/panel-model-selection.test.ts`
Expected: PASS.

---

### Task 4: Uji Asumsi Klasik Panel & Cluster-Robust Standard Errors

**Files:**
- Modify: `src/lib/panel-engine.ts`
- Test: `tests/unit/panel-assumptions-robust.test.ts`

**Interfaces:**
- Produces: `testPanelVIF`, `testGroupwiseHeteroGreene`, `testWooldridgeSerial`, `computeClusterRobustSE`.

- [x] **Step 1: Tulis tes unit untuk uji asumsi dan standar error ter-cluster**
Buat `tests/unit/panel-assumptions-robust.test.ts` menguji Greene heteroskedastisitas ($W \sim \chi^2(n)$), Wooldridge autokorelasi ($F(1, G-1)$), VIF data terpusat, dan cluster sandwich estimator Arellano.

- [x] **Step 2: Jalankan tes unit untuk memastikan kegagalan**
Run: `npx.cmd vitest run tests/unit/panel-assumptions-robust.test.ts`
Expected: FAIL.

- [x] **Step 3: Implementasikan Uji Heteroskedastisitas Greene (`xttest3`)**
Modified Wald test for groupwise heteroskedasticity pada model Fixed Effects.

- [x] **Step 4: Implementasikan Uji Autokorelasi Wooldridge (`xtserial`)**
Transformasi beda pertama $\Delta y$ dan $\Delta X$, regresi residu $\hat{e}_{\Delta, it}$ pada $\hat{e}_{\Delta, i, t-1}$ dengan SE ter-cluster, validasi prasyarat $T \ge 3$.

- [x] **Step 5: Implementasikan Arellano Cluster-Robust Standard Errors**
Sandwich estimator per entitas dengan faktor penyesuaian derajat bebas Stata $\frac{G}{G-1}$ dan peringatan *downward bias* jika $G < 30$.

- [x] **Step 6: Jalankan tes unit kembali**
Run: `npx.cmd vitest run tests/unit/panel-assumptions-robust.test.ts`
Expected: PASS.

---

### Task 5: Generator Teks Penjelasan Deterministic 4 Blok Stata & Remedial

**Files:**
- Create: `src/lib/panel-interpretation.ts`
- Test: `tests/unit/panel-interpretation.test.ts`

**Interfaces:**
- Consumes: Hasil estimasi dan diagnostik dari `panel-engine.ts`.
- Produces: `generateStataConsoleBlocks`, `generateBabyLanguageExplanation` for all steps 0 to 12.

- [x] **Step 1: Tulis tes unit untuk generator teks dan blok Stata**
Buat `tests/unit/panel-interpretation.test.ts` yang memverifikasi bahwa untuk setiap langkah 0 s/d 12, keempat blok (Kode Stata, Fungsi, Output Monospace, Bahasa Bayi) terisi lengkap tanpa nilai kosong atau placeholder.

- [x] **Step 2: Jalankan tes unit untuk memastikan kegagalan**
Run: `npx.cmd vitest run tests/unit/panel-interpretation.test.ts`
Expected: FAIL.

- [x] **Step 3: Implementasikan pembuat blok Stata monospace dan bahasa bayi berbasis aturan**
Susun template string presisi tinggi yang memformat angka sesuai standar Stata (min/avg/max, pembatas garis horizontal, header tabel) dan menghasilkan narasi analogi sehari-hari tanpa jargon teknis.

- [x] **Step 4: Jalankan kembali tes unit**
Run: `npx.cmd vitest run tests/unit/panel-interpretation.test.ts`
Expected: PASS.

---

### Task 6: Antarmuka Pengguna (UI/UX) PanelStepper & StataConsoleBlock

**Files:**
- Create: `src/components/PanelTab.tsx`
- Create: `src/components/PanelStepper.tsx`
- Create: `src/components/StataConsoleBlock.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/Header.tsx`
- Test: `tests/unit/panel-ui.test.ts`

- [x] **Step 1: Tulis tes unit untuk komponen UI panel**
Buat `tests/unit/panel-ui.test.ts` menguji render tab baru, transisi stepper dari langkah 0 hingga 12, dan render blok Stata.

- [x] **Step 2: Jalankan tes unit untuk memastikan kegagalan awal**
Run: `npx.cmd vitest run tests/unit/panel-ui.test.ts`
Expected: FAIL.

- [x] **Step 3: Bangun komponen `StataConsoleBlock.tsx`**
Komponen visual dengan tema gelap/terang, tipografi monospace, kontras warna tinggi, tombol salin sintaks Stata, dan kartu penjelasan bahasa bayi.

- [x] **Step 4: Bangun komponen `PanelStepper.tsx` dan `PanelTab.tsx`**
Implementasikan alur lengkap: impor data, pemilihan sheet, pemetaan variabel (ID, Waktu, Y, X, Kontrol), persetujuan pembersihan data, statistik deskriptif, hingga model akhir.

- [x] **Step 5: Hubungkan ke `src/app/page.tsx` dan `Header.tsx`**
Tambahkan tab navigasi "Regresi Panel" di samping "Analisis CED" dan "Regresi OLS".

- [x] **Step 6: Jalankan tes unit kembali**
Run: `npx.cmd vitest run tests/unit/panel-ui.test.ts`
Expected: PASS.

---

### Task 7: Ekspor Dokumen Laporan DOCX Gaya Stata & Endpoint API

**Files:**
- Create: `src/app/api/panel/fit/route.ts`
- Create: `src/app/api/panel/export-docx/route.ts`
- Create: `src/lib/panel-docx-builder.ts`
- Test: `tests/integration/panel-api.test.ts`

- [x] **Step 1: Tulis tes integrasi API route panel**
Buat `tests/integration/panel-api.test.ts` menguji pemanggilan endpoint `POST /api/panel/fit` dengan payload data Grunfeld dan `POST /api/panel/export-docx`.

- [x] **Step 2: Jalankan tes integrasi untuk memastikan kegagalan**
Run: `npx.cmd vitest run tests/integration/panel-api.test.ts`
Expected: FAIL.

- [x] **Step 3: Implementasikan route API `POST /api/panel/fit`**
Menerima array observasi, memvalidasi Invarian I1-I12, menjalankan estimasi dan diagnostik lengkap, serta mengembalikan payload JSON terstruktur.

- [x] **Step 4: Implementasikan pembangun dokumen Word `panel-docx-builder.ts`**
Menghasilkan dokumen .docx berformat tabel resmi Stata (tanpa garis vertikal, border horizontal tebal pada header, ringkasan model, dan catatan kaki diagnostik).

- [x] **Step 5: Jalankan seluruh suite pengujian proyek**
Run: `npx.cmd vitest run`
Expected: ALL PASS (termasuk tes CED eksisting).
