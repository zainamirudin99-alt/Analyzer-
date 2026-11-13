# Desain Arsitektur: Panel Latent Variable Measurement Model

> **Tanggal**: 2026-11-13
> **Menu Target**: Regresi Data Panel Stata → Option 2: *Panel Latent Variable Measurement Model*
> **Invarian Utama**: **Zero-Regression Total** terhadap Option 1 (*Regresi Data Panel*), menu *Analisis CED*, menu *Analisis Regresi Statistik*, autentikasi, dan skema Supabase global.

---

## 1. Struktur Menu & Pemisahan Modul (Zero-Regression Isolation)

Ketika pengguna membuka tab `panel` di [src/app/page.tsx](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/app/page.tsx), [PanelTabHub.tsx](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/components/PanelTabHub.tsx) menampilkan dua kartu pemilih utama (atau tombol cepat alih mode):

1. **OPTION 1: REGRESI DATA PANEL**
   - Merender komponen [PanelTab.tsx](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/components/PanelTab.tsx) **tanpa modifikasi logika, state, atau tampilan internalnya**.
   - Seluruh API `/api/panel/fit`, `/api/panel/export-docx`, `/api/panel/export-xlsx`, dan pustaka `panel-engine.ts`, `panel-types.ts`, `panel-interpretation.ts`, `panel-docx-builder.ts`, `panel-export-xlsx.ts` tidak disentuh.
2. **OPTION 2: PANEL LATENT VARIABLE MEASUREMENT MODEL**
   - *Subtitle*: Bayesian Hierarchical Measurement Model for Multi-Source Data Integration.
   - Merender komponen mandiri [PanelLatentTab.tsx](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/components/PanelLatentTab.tsx) bersama modul terpisah:
     - `src/lib/panel-latent-types.ts` — Kontrak tipe data lengkap 9 tahap, prior, MCMC, diagnostik, dan hasil.
     - `src/lib/panel-latent-data.ts` — Validasi 10 pemeriksaan kualitas data panel, deteksi skala/satuan, statistik deskriptif EDA, korelasi antarsumber, serta prapemrosesan eksplisit (*opt-in* log1p, z-score standardization, winsorization).
     - `src/lib/panel-latent-mcmc.ts` — Mesin Bayesian *Parameter-Expanded Blocked Gibbs + AR(1) Slice/MH Sampler* (Normal & Student-$t$ likelihood, random intercepts kota & waktu, AR(1) opsional, Half-Cauchy / Normal prior, 4 chains, warmup, split-$\hat{R}$, Geyer ESS, MCSE, PPC, WAIC, Prior Sensitivity).
     - `src/lib/panel-latent-interpretation.ts` — Generator tabel bergaya Stata, evaluasi reliabilitas & identifikasi, deteksi pelanggaran *conditional independence*, dan interpretasi bahasa Indonesia akademis dinamis berbasis angka aktual.
     - `src/lib/panel-latent-codegen.ts` — Generator kode reproduksibel `.stan` (mengacu pada Stan Measurement Error Guide, `stan-dev/example-models`, dan `munchfab/mlts`) dan `.R` (`cmdstanr` + `brms` + `bayesplot`).
     - `src/lib/panel-latent-export-docx.ts`, `src/lib/panel-latent-export-xlsx.ts`, `src/lib/panel-latent-export-pdf.ts` — Laporan akademis 14 bab lengkap (Word, Excel multi-sheet, dan PDF biner murni tanpa dependensi eksternal berat).
     - `src/components/PanelLatentCharts.tsx` — 9 visualisasi SVG interaktif bertema Emerald/Slate dengan judul, sumbu, satuan, legenda, dan catatan interpretatif.
     - `src/app/api/panel-latent/fit/route.ts`, `export-docx/route.ts`, `export-xlsx/route.ts`, `export-pdf/route.ts`.

---

## 2. Spesifikasi Metodologi Bayesian & Identifikasi

### 2.1 Persamaan Pengukuran ($j \in \{1:\text{Self-Reporting}, 2:\text{Satellite}, 3:\text{Sensor}\}$)
$$X_{j,it} = \alpha_j + \lambda_j Y^*_{it} + \epsilon_{j,it}$$
- **Normal Likelihood**: $\epsilon_{j,it} \sim \mathcal{N}(0, \sigma_{\epsilon,j}^2 + s_{j,it}^2)$, dengan $s_{j,it}$ adalah *measurement uncertainty* opsional per observasi.
- **Student-$t$ Likelihood** *(tahan outlier)*: direpresentasikan melalui *scale mixture of normals* eksak:
  $$\epsilon_{j,it} \mid \omega_{j,it} \sim \mathcal{N}\!\left(0, \frac{\sigma_{\epsilon,j}^2}{\omega_{j,it}} + s_{j,it}^2\right), \quad \omega_{j,it} \sim \text{Gamma}\!\left(\frac{\nu}{2}, \frac{\nu}{2}\right)$$

### 2.2 Struktur Panel Hierarkis Laten
$$Y^*_{it} = \mu + u_i + \gamma_t + d_{it}$$
- $u_i \sim \mathcal{N}(0, \sigma_u^2)$: efek acak spesifik kota (terpusat).
- $\gamma_t \sim \mathcal{N}(0, \sigma_\gamma^2)$: efek waktu spesifik tahun (terpusat).
- $d_{it}$:
  - Jika `includeAR1 = false` atau $T < 3$: $d_{it} = \eta_{it} \sim \mathcal{N}(0, \sigma_\eta^2)$.
  - Jika `includeAR1 = true` dan $T \ge 3$ berurutan: $d_{i,t} = \rho \, d_{i,t-1} + \eta_{i,t}$, $\rho \in (-0.98, 0.98)$, dengan varians stasioner awal $\sigma_\eta^2 / (1 - \rho^2)$.

### 2.3 Strategi Identifikasi (Wajib)
1. **Anchor Reference Source *(Default)***: Pengguna memilih satu sumber acuan $j^* \in \{1, 2, 3\}$ (bawaan: Sensor/$X_3$), sehingga $\alpha_{j^*} \equiv 0$ dan $\lambda_{j^*} \equiv 1$. Skala $Y^*$ identik dengan satuan sumber acuan; $\alpha_j$ ($j \ne j^*$) mengukur bias aditif relatif terhadap acuan.
2. **Standardized Latent Factor Constraint**: $\mu \equiv 0$, $\text{SD}(Y^*) \equiv 1$ pada setiap iterasi melalui *parameter-expanded rescaling*, dengan pembatasan $\lambda_j > 0$.
3. **Audit Identifikasi & *Conditional Independence***:
   - Memeriksa korelasi pasangan antar sumber sebelum dan residu $\text{Corr}(\hat{\epsilon}_j, \hat{\epsilon}_k)$ sesudah estimasi.
   - Jika $|\text{Corr}(\hat{\epsilon}_j, \hat{\epsilon}_k)| > 0.35$ atau korelasi antarsumber awal lemah ($r \le 0.15$), peringatan identifikasi ditampilkan eksplisit dan kesimpulan akurasi absolut dilarang.

### 2.4 Reliabilitas & Ketidakpastian
$$\text{Reliability}_j = \frac{\lambda_j^2 \, \widehat{\text{Var}}(Y^*)}{\lambda_j^2 \, \widehat{\text{Var}}(Y^*) + \sigma_{\epsilon,j}^2}, \quad \text{Uncertainty}_j = \sigma_{\epsilon,j}$$
Seluruh perbandingan diberi catatan tegas bahwa tanpa data referensi eksternal, peringkat reliabilitas hanya bersifat relatif menurut asumsi model (*conditional independence*).

---

## 3. Alur 9 Langkah Interaktif
1. **Step 1: Data Upload** — Upload `.xlsx`/`.xls`/`.csv`, Google Sheets link (`/api/regression/import-link`), **Paste Data Langsung (CSV/TSV/Tab Excel)**, atau **Dataset Simulasi Emisi CO₂ Kota-Tahun**. Tampilkan metrik observasi, jumlah kota, rentang tahun, jumlah variabel, status panel (*balanced/unbalanced*).
2. **Step 2: Data Mapping** — Auto-mapping + manual selector untuk `City`, `Year`, `X1 (Self-Reporting)`, `X2 (Satellite)`, `X3 (Sensor)`, serta opsional `SE X1 / SE X2 / SE X3`.
3. **Step 3: Data Preprocessing** — Audit 10 risiko kualitas data (missing, duplikat City-Year, non-numerik, nilai $\le 0$, beda satuan/skala rasio $>10\times$, unbalanced, outlier IQR/MAD, sumber hilang). Rekomendasi prapemrosesan **tidak diterapkan otomatis**, melainkan melalui centang persetujuan pengguna (*opt-in*) + perbandingan pratinjau.
4. **Step 4: Exploratory Data Analysis** — Deskriptif tiap sumber, matriks korelasi $X_1, X_2, X_3$, tren kota-tahun, dan scatterplot awal.
5. **Step 5: Model Specification** — Pengaturan identifikasi (Anchor vs Standardized), bias sumber ($\alpha_j$), loading ($\lambda_j$), *city random intercept* ($u_i$), *time effect* ($\gamma_t$), AR(1) (aktif jika $T \ge 3$), Prior (*Weakly Informative / Skeptical Tight / Diffuse*), Likelihood (*Normal / Student-t*), serta jumlah chains, warmup, draws. Penjelasan metodologis interaktif di setiap opsi.
6. **Step 6: Bayesian Estimation** — Eksekusi aktual *multi-chain MCMC* melalui `/api/panel-latent/fit` dengan atribusi mesin komputasi jujur (*Native TypeScript HMC/Blocked-Gibbs Sampler*).
7. **Step 7: Model Diagnostics** — Split-$\hat{R}$, ESS, MCSE, Trace Plot 4 chains, Posterior Density, Acceptance/Numerical Health checks, Posterior Predictive Check ($p$-value, RMSE). Jika $\max \hat{R} > 1.05$ atau $\min \text{ESS} < 100$, peringatan merah ditampilkan dan status konvergensi ditandai **TIDAK KONVERGEN**.
8. **Step 8: Model Evaluation** — Analisis *measurement error* & residu korelasi, ketidakpastian per sumber, **Prior Sensitivity Analysis** (3 rezim prior), serta **Perbandingan Spesifikasi Model** (Baseline vs Normal vs Student-$t$ vs AR(1) via WAIC & RMSE).
9. **Step 9: Final Results, Code & Export** — Tabel estimasi bergaya Stata (`Parameter`, `Mean`, `SD`, `95% CI`, `R-hat`, `ESS`), tabel reliabilitas 3 sumber, tabel estimasi emisi laten $Y^*_{it}$ per kota-tahun, 9 grafik interaktif, interpretasi akademis dinamis, panel kode Stan + R (`cmdstanr`/`brms`) beserta tombol Copy/Download, serta ekspor lengkap `.xlsx`, `.docx`, `.pdf`, `.csv`.

