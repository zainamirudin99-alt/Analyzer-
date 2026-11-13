# Rencana Implementasi: Panel Latent Variable Measurement Model (Phase 3–7)

> Acuan: [2026-11-13-panel-latent-measurement-design.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/superpowers/specs/2026-11-13-panel-latent-measurement-design.md)

## Fase Pekerjaan & Verifikasi

### Task 1: Fondasi Tipe & Mesin Data Kualitas Panel (`panel-latent-types.ts`, `panel-latent-data.ts`)
- Mendefinisikan seluruh kontrak tipe input, spesifikasi model, posterior draws ringkas, metrik konvergensi, sensitivitas, perbandingan model, dan laporan.
- Implementasi parser *Paste Data* (TSV/CSV), auto-mapping kolom (`City`, `Year`, `X1`, `X2`, `X3`, `SE`), 10 audit kualitas data, serta transformasi *opt-in* (`none`, `log1p`, `zscore`, `winsorize`), EDA deskriptif, dan korelasi antarsumber.
- Menyertakan dataset simulasi realistis kota-tahun emisi CO₂ dengan parameter laten diketahui untuk demo & verifikasi.

### Task 2: Mesin Bayesian Hierarchical MCMC (`panel-latent-mcmc.ts`)
- Implementasi *Seeded PRNG*, distribusi Normal/Gamma/Inverse-Gamma/Truncated-Normal/Student-$t$ scale-mixture.
- Blocked Gibbs + Parameter Expansion + 1D Slice/MH untuk AR(1) $\rho \in (-0.98, 0.98)$ dan Half-Cauchy variance hierarchy.
- Multi-chain execution (default 4 chains, warmup, draws), Rank-normalized Split-$\hat{R}$, Geyer ESS, MCSE, PPC (mean/SD discrepancy $p$-value, RMSE), WAIC, residual correlation audit (*conditional independence*), prior sensitivity runner, dan komparasi model alternatif.

### Task 3: Generator Interpretasi Gaya Stata, Kode Stan/R, & Ekspor 14 Bab
- `panel-latent-interpretation.ts`: Tabel Stata monospace, evaluasi 5 poin reliabilitas/bias/ketidakpastian, dan narasi akademis dinamis bahasa Indonesia.
- `panel-latent-codegen.ts`: Generator kode `.stan` & `.R` (`cmdstanr`/`brms`) yang sinkron persis dengan konfigurasi UI & preprocessing.
- `panel-latent-export-docx.ts`, `panel-latent-export-xlsx.ts`, `panel-latent-export-pdf.ts`, `panel-latent-export-csv`: Seluruh 14 bab laporan riset akademis + API routes `/api/panel-latent/*`.

### Task 4: Komponen UI 9-Langkah & Hub Aman (`PanelTabHub.tsx`, `PanelLatentTab.tsx`, `PanelLatentCharts.tsx`)
- Integrasi hub di `src/app/page.tsx` dengan `Option 1` merender `<PanelTab />` persis seperti semula dan `Option 2` merender `<PanelLatentTab />`.
- Implementasi 9 visualisasi SVG interaktif bertema Emerald/Slate.
- Panel kode dengan Copy & Download, plus tombol ekspor `.pdf`, `.docx`, `.xlsx`, `.csv`.

### Task 5: Parameter-Recovery Tests & Full Zero-Regression Suite
- Uji simulasi parameter recovery (`tests/unit/panel-latent-measurement.test.ts`): membangkitkan data dengan $\alpha_j, \lambda_j, \sigma_{\epsilon,j}, Y^*_{it}$ diketahui dan memverifikasi bahwa estimasi posterior mengembalikan korelasi tinggi dengan $Y^*$ ($r > 0.95$), bias/loading akurat, split-$\hat{R} < 1.05$, identifikasi terdeteksi, ekspor `.pdf`/`.docx`/`.xlsx` ber-header valid, dan generator kode Stan/R valid.
- Menjalankan seluruh suite lama (`tests/regression/panel-regression-complete.test.ts`, `tests/regression/ced-behavior.test.ts`, `tsc --noEmit`, `next build`).

