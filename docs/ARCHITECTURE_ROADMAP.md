# ARCHITECTURE ROADMAP: Analisis Regresi Statistik

Dokumen ini memetakan arsitektur sistem modular untuk penambahan fitur **Analisis Regresi Statistik** pada platform Analyzer, dengan jaminan *zero-regression* terhadap modul **Analisis CED** yang sudah beroperasi.

---

## 1. Prinsip Desain & Batasan Arsitektur

1. **Zero-Interference pada Modul CED (Invarian I7)**:
   - Modul CED dan Regresi berjalan berdampingan pada satu aplikasi Next.js.
   - Tabel basis data CED (`ced_results`, `ced_heartbeat`) terisolasi dari tabel Regresi (`datasets`, `analyses`, `analysis_events`).
   - Route handler CED (`/api/analyze`, `/api/results`) tidak diubah kontrak maupun kodenya.
2. **Autentikasi Bertingkat**:
   - Menu CED: Akses publik / tanpa login (mempertahankan alur saat ini).
   - Menu Regresi: Wajib terautentikasi (Supabase Auth) untuk menegakkan *Tenant Isolation* (Invarian I9).
3. **Pemisahan Komputasi Ilmiah**:
   - Frontend & I/O Orchestration: TypeScript (Next.js App Router).
   - Mesin Statistik Numerik: Python Serverless (`statsmodels`, `scipy`, `numpy`) untuk memastikan akurasi matematis sekelas SPSS, R, dan standar NIST StRD.
4. **Keamanan Berlapis (Defense in Depth)**:
   - Validasi ganda (UI form level dan server/database CHECK constraints).
   - RLS (*Row Level Security*) ketat berbasis `auth.uid() = owner_id`.
   - Pencegahan SSRF pada import link Google Sheets (allowlist domain, blokir IP lokal/privat).
   - Netralisasi formula injection (`=`, `+`, `-`, `@`) pada data tabular.

---

## 2. Diagram Blok Arsitektur

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PRESENTATION LAYER (Next.js 14)                       │
│  ┌─────────────────────────┐                 ┌───────────────────────────────┐  │
│  │   Menu Eksisting: CED   │                 │  Menu Baru: Regresi Statistik │  │
│  │   (Publik / Anonim)     │                 │  (Wajib Login - Supabase Auth)│  │
│  │  - Upload PDF & Gemini  │                 │  - Wizard 6 Langkah:          │  │
│  │  - Tabel Hasil CED      │                 │    1. Sumber Data (Upload/GS) │  │
│  │  - Panduan 18 Indikator │                 │    2. Pilih Sheet             │  │
│  └─────────────────────────┘                 │    3. Pratinjau & Validasi    │  │
│                                              │    4. Pilih Kolom (Y & X)     │  │
│                                              │    5. Konfigurasi Analisis    │  │
│                                              │    6. Ringkasan & Konfirmasi  │  │
│                                              └───────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
┌───────────────────────────────┐             ┌───────────────────────────────────┐
│     INGESTION & STORAGE       │             │   STATISTICAL ENGINE (Vercel Py)  │
│ - Magic Bytes Checker         │             │ - /api/engine/health              │
│ - SSRF-Safe GS Downloader     │             │ - /api/engine/inspect             │
│ - Supabase Storage (datasets) │             │ - /api/engine/validate            │
│   (Upload langsung via JWT)   │             │ - [Tahap 2] /api/engine/estimate  │
└───────────────┬───────────────┘             └─────────────────┬─────────────────┘
                │                                               │
                └──────────────────────┬────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          PERSISTENCE LAYER (Supabase PG 15)                     │
│  ┌───────────────────────┐                    ┌──────────────────────────────┐  │
│  │   Tabel CED (Publik)  │                    │   Tabel Regresi (RLS Aktif)  │  │
│  │  - ced_results        │                    │  - datasets                  │  │
│  │  - ced_heartbeat      │                    │  - analyses                  │  │
│  │  - app_settings       │                    │  - analysis_events (Append)  │  │
│  └───────────────────────┘                    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Peta Jalan Implementasi 3 Tahap

### Tahap 1: Fondasi, Arsitektur, dan Data Masuk (Current Phase)
- **Tujuan**: Pengguna dapat masuk, memilih menu regresi, memasukkan data (unggah atau link), memilih sheet, memilih variabel Y dan X, menetapkan opsi time series, mengatur konfigurasi dasar, serta memperoleh ringkasan validasi data tanpa kesalahan.
- **Komponen**:
  1. Arsitektur & ADR: Keputusan mesin statistik (`ADR-01`) dan verifikasi batasan platform Vercel.
  2. Basis Data: Migrasi SQL dengan RLS ketat untuk `datasets`, `analyses`, dan `analysis_events`.
  3. Supabase Storage: Bucket privat `datasets` dengan folder `{auth.uid()}/...`.
  4. Ingestion Data: Validator tanda tangan file (magic bytes), importer Google Sheets anti-SSRF.
  5. UI Wizard: 6 langkah responsif (desktop stepper & mobile bottom sheet).
  6. Kerangka Mesin Python: 3 endpoint (`/health`, `/inspect`, `/validate`).
  7. Gerbang G1: Tes regresi CED, tes dua pengguna RLS, dan verifikasi e2e multi-viewport.

### Tahap 2: Estimasi OLS, Asumsi Klasik, dan Replikasi Output SPSS
- **Tujuan**: Mesin statistik mengeksekusi estimasi regresi OLS (SLR/MLR) dengan verifikasi ganda (`statsmodels` + `numpy.linalg.lstsq` SVD), menjalankan seluruh uji asumsi klasik, dan merender tabel semantik bergaya SPSS.
- **Komponen**:
  1. Estimasi OLS: Koefisien $B$, Std. Error, Beta ($\beta$), nilai $t$, $p$-value, dan selang kepercayaan 95%.
  2. Model Summary & ANOVA: $R$, $R^2$, Adjusted $R^2$, Std. Error of the Estimate, Durbin-Watson, ANOVA $F$-test.
  3. Uji Asumsi Klasik:
     - Normalitas: Shapiro-Wilk ($n \le 50$) dan Lilliefors ($n > 50$).
     - Linearitas: Plot residu vs fit dan Ramsey RESET.
     - Homoskedastisitas: Breusch-Pagan versi Koenker dan Glejser.
     - Multikolinearitas: Tolerance, VIF, dan Collinearity Diagnostics (Belsley).
     - Outlier & Pengaruh: Studentized deleted residuals, Cook's Distance, Centered Leverage.
     - Time Series: ADF, KPSS, Breusch-Godfrey, Ljung-Box, ARCH-LM.
  4. Tabel Keluaran Gaya SPSS: 9 tabel semantik HTML tanpa garis vertikal.
  5. Skor Kesesuaian: S1 (NIST StRD LRE), S2 (Konkordansi sel), dan S3 (Konsistensi internal per analisis).
  6. Gerbang G2: Benchmark terhadap dataset NIST StRD dan fixture acuan R/PSPP.

### Tahap 3: Remedial Sah, Normality Pass Rate, Pelaporan Jujur, dan Ekspor
- **Tujuan**: Menangani pelanggaran asumsi dengan opsi yang dapat dipertanggungjawabkan secara statistik, pelaporan model M0 apa adanya, perhitungan Normality Pass Rate, serta ekspor laporan.
- **Komponen**:
  1. Pelaporan M0 Apa Adanya: Hasil awal selalu ditampilkan tanpa disembunyikan.
  2. Matriks Remedial:
     - Koreksi galat baku heteroskedastisitas: HC3 (MacKinnon & White).
     - Transformasi: Logaritma, akar kuadrat, Box-Cox (dengan smearing Duan).
     - Regresi Robust (Huber / Tukey bisquare) dan Kuantil median.
     - Bootstrap BCa (1000–5000 replikasi dengan seed tetap).
     - Koreksi autokorelasi time series: HAC Newey-West dan GLSAR iterative.
  3. Normality Pass Rate (PR): $B = 1000$ subsampel tanpa pengembalian dengan selang kepercayaan Wilson 95%.
  4. Diagnosis $R^2$ Rendah: Deteksi MDES (*Minimum Detectable Effect Size*) via $F$ non-sentral, bukan post-hoc power.
  5. Label Status Laporan: Otomatis menetapkan label *Konfirmatori* vs *Eksploratori*.
  6. Template Interpretasi Naratif: Teks naratif otomatis berbahasa Indonesia yang bersumber langsung dari hasil komputasi numerik.
  7. Ekspor: Word (.docx), PDF, dan Excel (.xlsx) dengan proteksi formula injection.
  8. Gerbang G3: Audit integritas statistik, pelaporan jujur, dan persetujuan rilis.


---

## 4. Arsitektur Tahap 5: 21-Point Advanced Statistical Analysis Engine

Penambahan modul-modul statistik tingkat lanjut tetap menjaga prinsip modularitas dan batas bundel serverless Vercel (< 500 MB):
- `src/lib/regression-engine.ts`: Mesin inti OLS, WLS, GLS, distribusi eksak ($t, F, \chi^2$ via Incomplete Beta/Gamma), Belsley SVD Collinearity Diagnostics, Royston Shapiro-Wilk, Lilliefors K-S, dan Ramsey RESET.
- `src/lib/regression-spss-compatibility.ts`: Seleksi variabel bertahap (*Enter, Forward, Backward, Stepwise*), Anderson-Darling, Harvey-Collier, Breusch-Pagan standar vs Koenker, White, Glejser, Goldfeld-Quandt, Ljung-Box, ACF/PACF, dan validator SPSS.
- `src/lib/regression-remedial.ts`: Kovarians HC0–HC4, Newey-West HAC, Cochrane-Orcutt vs Prais-Winsten, IRLS Robust Regression (Huber & Tukey Bisquare), Bootstrap CI, dan Box-Cox.
- `src/lib/regression-moderation-mra.ts`: Moderated Regression Analysis (MRA) 3-Model Hierarkis, Simple Slope Analysis ($-1\text{ SD}, \text{Mean}, +1\text{ SD}$), Teknik Johnson-Neyman, Moderator Kategorik, dan klasifikasi 4 tipe moderator.
- `src/lib/regression-contingency-chisquare.ts`: Crosstabulation ($2\times 2$ s/d $r\times c$), Pearson $\chi^2$, Likelihood Ratio $G^2$, Yates, Fisher's Exact Test, Fisher-Freeman-Halton / Monte Carlo, Linear-by-Linear, Phi, Cramer's $V$, Contingency Coeff, OR, RR, RD, dan Adjusted Standardized Residuals.
- `src/lib/regression-advanced-models.ts`: Binary/Multinomial/Ordinal Logistic Regression, Poisson, Negative Binomial, Quantile Regression, dan GLM.

---

## 5. Arsitektur Tahap 6: Refactoring Wizard 7-Tahap, Dual-Mode Engine QR/SVD + Python Parity, MRA Multi-Kategori & Kontingensi Terintegrasi

Mengacu pada `docs/superpowers/specs/2026-11-13-regression-upgrade-design.md`:
1. **Wizard 7-Tahap (`RegressionTab.tsx`)**:
   - Step 1: Sumber Data (Upload/Link/Sample Cross-Section & Time Series) + Sheet Selector terpadu.
   - Step 2: Pembersihan & Pratinjau Data (baseline snapshot, missing policy interaktif: Listwise/Mean/Median/Manual, duplikat, statistik deskriptif awal).
   - Step 3: Jenis Data (Cross Section vs Time Series + validator urutan kronologis, duplikat, periode hilang, inkonsistensi interval).
   - Step 4: Metode Analisis (SLR, MLR, MRA, Analisis Kontingensi).
   - Step 5: Konfigurasi Variabel & Parameter (Basic vs Advanced Mode, dummy coding prediktor/moderator kategorikal dengan reference category).
   - Step 6: Ringkasan Pra-Eksekusi & Validasi Invarian/Green (1991).
   - Step 7: Workspace Hasil Gaya SPSS per Metode (`OLSResultView`, `MRAResultView`, `ContingencyResultView`) beserta tab terstruktur, rekomendasi 8-elemen, perbandingan $M_0/M_1/M_2$, plot, dan ekspor `.docx`/`.xlsx`.
2. **Dual-Mode Statistical Parity**:
   - Primary client/Node solver ditingkatkan dari normal equations `matInverse(X'X)` menjadi **Householder QR Decomposition** dengan verifikasi silang **SVD** dan *chronological sort* otomatis pada Time Series.
   - Endpoint Python `api/py/validate.py` (`numpy`, `scipy`, `statsmodels`, `pandas`; tanpa `matplotlib`) bertindak sebagai verifikasi silang Statsmodels di Vercel dengan *auto-fallback* mulus ke TS QR/SVD saat offline/lokal.

---

## 6. Arsitektur Tahap 7 & 8: Regresi Data Panel Stata Option 2 — Reference-Free All-Source Latent Measurement Model, Intelligent Configuration & Per-Step Stata Documentation
1. **`src/lib/panel-accuracy-latent.ts`**: Estimasi **Bayesian Hierarchical Panel Latent Measurement Model** (multi-chain MCMC Gibbs sampler dengan R-hat $\hat{R}$, ESS, Grubbs triangulation initialization, Error Variance $\sigma_{\varepsilon_j}^2$, Reliability $R_j^2$, Posterior Probability of Being Best, dan estimasi $\hat{\theta}_{it}$ / Leave-One-Source-Out $\hat{\theta}_{it}^{(-j)}$) sehingga **seluruh $J \ge 3$ sumber dievaluasi dan diranking setara tanpa Reference Source**.
2. **`src/lib/panel-accuracy-intelligent-config.ts`**: Mesin analisis otomatis 14 dimensi kolom dan 5 blok rekomendasi Step 2 untuk identifikasi panel, kelayakan sumber evaluasi, skala/satuan, identifiabilitas model laten ($J \ge 3$), dan prapemrosesan.
3. **`src/lib/panel-accuracy-step-stata.ts`**: Generator dinamis panel **Stata Command & Statistical Implementation** Step 1–9 (`.do`, `.R`, `.stan`, kegunaan perintah, output, interpretasi 5-poin aktual, Leave-One-City-Out LOCO, dan kesimpulan).
4. **`src/components/PanelAccuracyStepStataPanel.tsx` & `src/components/PanelAccuracyTab.tsx`**: Antarmuka Wizard 9-Step Reference-Free All-Source Accuracy & Latent Reliability Ranking.

---

## 7. Arsitektur Tahap 9: Sistem Rekomendasi Step 3 & Step 7 + Transparansi Bootstrap Server

1. **`src/lib/panel-accuracy-types.ts` & `src/lib/panel-accuracy-orchestrator.ts`**: Penambahan metrik evaluasi bebas-skala (*Mean Reliability $R^2$*, *Max $\hat{R}$*, *Composite Statistical Quality Score*) dan `actionItems` pada `PreprocessingRecommendationBundle` (Step 3), serta penerusan parameter presisi `bootstrapReplications` & `mcmcIterations` dan `executionMeta`.
2. **`src/lib/panel-accuracy-diagnostics.ts`**: Penambahan generator `buildStep7DiagnosticAdvisor(...)` yang memproduksi `Step7AdvisorBundle` (skor kesehatan diagnostik, status kelayakan inferensi, dan aksi perbaikan metodologis satu-klik tanpa manipulasi *p-value*).
3. **`src/app/api/panel-accuracy/fit/route.ts`**: Menerima parameter opsional tervalidasi `bootstrapReplications` (`[499, 1999]`) dan `mcmcIterations` (`[250, 900]`) dari Step 6 & Step 7.
4. **`src/components/PanelAccuracyTab.tsx`**: Pembaruan UI Step 3 (tabel rekomendasi bebas-skala + Checklist Aksi Optimal), Step 6/7 (Banner Status & Delta Verifikasi Bootstrap Server + tombol presisi tinggi `1.999 Wild Bootstrap + 800 MCMC`), dan panel **Rekomendasi Cerdas Step 7**; plus pembersihan sisa teks lama Step 2.

---

## 8. Arsitektur Tahap 10: Pemilihan Sheet Excel & Google Sheets di Step 1 Option 2

1. **`src/lib/panel-accuracy-types.ts`**: Penambahan tipe `ImportedSheetData` dan `EvaluatedSheetCandidate`.
2. **`src/lib/panel-accuracy-validation.ts`**: Penambahan fungsi murni `evaluateImportedWorkbookSheets(sheets)` untuk menilai kelayakan tabel panel per sheet (deteksi rasio `__EMPTY`, baris minimal, jumlah kolom numerik) dan menentukan `recommendedSheetName`.
3. **`src/components/PanelAccuracyTab.tsx`**: Pembaruan `handleFileUpload`, `handleImportLink`, serta penambahan panel terpadu **WorkbookSheetSelector** pada Step 1 yang tampil baik untuk **Upload Excel/CSV** maupun **Google Sheets** dengan kartu pil sheet interaktif + dropdown tersinkronisasi dan koreksi pembacaan `json.data.originalName`.

---

## 9. Arsitektur Tahap 11: Stabilitas Konvergensi Lintas-Skala & Aturan Konflik Metrik Step 8

1. **`src/lib/panel-accuracy-latent.ts`**: Normalisasi `globalScale` internal pada MCMC Woodbury + adaptasi step-size seluruh blok burn-in + moves *ridge alignment* + skala ulang presisi balik ke satuan asli (`α`, `σ_ε`, `Total RMSE`, `θ̂`).
2. **`src/lib/panel-accuracy-orchestrator.ts`**: Auto-eskalasi iterasi MCMC bila $J \ge 3$ awal memiliki `maxRhat > 1.08`.
3. **`src/lib/panel-accuracy-ranking.ts` & `src/components/PanelAccuracyTab.tsx`**: Koreksi aturan `precisionConflict` agar tidak menolak pemenang ber-bias rendah hanya karena sumber ber-bias besar punya `Error SD` kecil; pembersihan format teks alasan dan panduan syarat konklusif di Step 8.

---

## 10. Arsitektur Tahap 12: Rekonstruksi Total Opsi 2 (Master Smartprompt)

1. **`src/lib/panel-accuracy-types.ts` & `src/lib/panel-accuracy-latent.ts`**: Penambahan dekomposisi kesalahan (`scaleDistortion`, `posteriorExpectedLoss`, `expectedRank`, `rankingStabilityPct`), `mcmcTraceDraws`, matriks korelasi residual $\text{Corr}(\hat{\varepsilon}_a, \hat{\varepsilon}_b)$, deteksi *correlated errors* & *weak identification*, serta estimasi ulang $\hat{\theta}_{it}^{(-j)}$ murni untuk validasi LOSO.
2. **`src/lib/panel-accuracy-metrics.ts` & `src/lib/panel-accuracy-fixed-effects.ts` & `src/lib/panel-accuracy-diagnostics.ts`**: Perhitungan `losoPredictiveCoverage95`, `losoCalibrationSlope`, standar error **Driscoll-Kraay (`seDriscollKraay`)**, sensitivitas *missing data* (`complete-case` vs `available-case`), dan Advisor dengan proyeksi dampak ranking & risiko.
3. **`src/lib/panel-accuracy-ranking.ts` & `src/lib/panel-accuracy-step-stata.ts` & `src/components/PanelAccuracyStepStataPanel.tsx`**: Algoritma pemeringkatan 8-tahap dengan 4 status (`PEMENANG_TERBUKTI_RELATIF`, `KANDIDAT_TERBAIK_BELUM_KONKLUSIF`, `KONFLIK_ANTAR_METRIK`, `MODEL_TIDAK_TERIDENTIFIKASI`), seksi 8-poin `whyBestSourceAnalysis`, dan struktur 6-bagian panel Stata (termasuk *2. Konsep Statistik*).
4. **`src/components/PanelAccuracyCharts.tsx` & `src/components/PanelAccuracyTab.tsx`**: Visualisasi **MCMC Trace Plot** (Step 5) & **Loss Decomposition Chart** (Step 6), fitur perbandingan Sebelum vs Sesudah + **Audit Trail** di Step 3 & Step 7, seksi *Mengapa Sumber Ini Terbaik?* di Step 8, serta laporan akademik 13-bagian & ekspor `.stan` di Step 9.

---

## 11. Arsitektur Tahap 13: Penamaan Opsi C, Tombol Keterangan per Step, Output Stata Urut Step 1–9, & Ekspor Rapi Lengkap

1. **`src/components/PanelTabHub.tsx`**: Pembaruan judul kartu Option 2 menjadi `OPTION 2: MODEL PENGUKURAN LATEN & AKURASI PANEL` beserta subjudul dan deskripsi netral ISO 5725 (Option 1 tetap 0 diff).
2. **`src/lib/panel-accuracy-glossary.ts` & `src/components/PanelAccuracyTab.tsx`**: Modul kamus singkatan `STEP_ACRONYM_GLOSSARY` (Step 1–9) dan komponen tombol **`Keterangan`** sejajar kanan pada setiap header Step 1–9 yang membuka panel penjelasan singkatan interaktif.
3. **`src/lib/panel-accuracy-types.ts` & `src/lib/panel-accuracy-interpretation.ts`**: Penambahan `orderedStepOutputs` pada `StataAccuracyOutputBundle` berisi tabel output bergaya Stata yang urut Step 1–9 (lebar aman `<= 94` karakter, presisi desimal adaptif) serta render terstruktur pada Sub-Tab Output Stata di Step 9.
4. **`src/lib/panel-accuracy-export-pdf.ts`, `panel-accuracy-export-docx.ts`, & `panel-accuracy-export-xlsx.ts`**: Perombakan total tata letak ekspor laporan PDF, DOCX, dan XLSX agar komplit dari Step 1 hingga Step 9, rapi berbingkai/terformat, mencakup seluruh tabel Tahap 12 + 8-poin analisis pemenang + tabel output Stata berurutan Step 1–9 + kode Master `.do`/`.R`/`.stan`, tanpa memengaruhi fungsi ekspor Option 1 atau CED.

---

## 12. Arsitektur Tahap 14: Tombol `Kode Stata` (Collapsible Step 1–8)

1. **`src/components/PanelAccuracyStepStataPanel.tsx`**: Menambahkan state per-step `expandedByStep` di dalam komponen. Untuk `bundle.stepId <= 8`, default bernilai tertutup (`false`) dan menyediakan tombol **`Kode Stata`** (`minHeight: 44px`, `Terminal` + `ChevronDown`/`ChevronUp`) di header panel. Ketika diklik, bagian 1–6 (Tujuan, Konsep, Kode Stata/R/Stan, Penjelasan Kode, Output & Cara Membaca, LOCO, Interpretasi Statistik) tampil di atas bagian **Ringkasan Keputusan Step (`stepConclusion`)**, sedangkan bagian kesimpulan tersebut tetap tampil di bagian bawah setiap saat. Pada `stepId === 9`, default tetap terbuka (`true`).

---

## 13. Arsitektur Tahap 15: Optimalisasi Aksi Nyata Step 3/7, Audit Korelasi $J=3$, & Kontinuitas ke Step 8

1. **`src/lib/panel-accuracy-types.ts` & `src/lib/panel-accuracy-diagnostics.ts`**: Penambahan union `APPLY_DRISCOLL_KRAAY_SENSITIVITY` dan `AUDIT_CORRELATED_ERRORS` serta dukungan `driscollKraayActivated` / `correlatedErrorReviewed` di `Step7DiagnosticsContext` agar skor kesehatan & prioritas Advisor merespons tindakan pengguna secara nyata.
2. **`src/lib/panel-accuracy-latent.ts`**: Penambahan *Chi-square sampling-noise guard* pada cabang $J = 3$ untuk mencegah *false positive* deteksi `correlatedErrorPairs` akibat varians sumber ke-3 yang tinggi.
3. **`src/components/PanelAccuracyTab.tsx`**: Perbaikan *async await* + `preprocessingOverride` (bebas *stale closure*), *auto-reverify server* saat prapemrosesan berubah jika server result aktif, panel **Audit Korelasi Residual** interaktif di Step 7, tampilan **Driscoll-Kraay SE** di Step 6–8, tombol aktif/selesai tanpa perulangan `1999 -> 1999`, tabel **Sebelum vs Sesudah** lengkap (`Rank`, `TotRMSE`, `Rel R²`, `Bias α`, `Skor Diagnostik`), serta dukungan penuh **Undo Multi-Langkah (`undoHistoryStack`) & Toggle-Off Pembatalan** langsung di setiap tombol rekomendasi Step 3 & Step 7.

---

## 14. Arsitektur Tahap 16: Pengembangan Terisolasi Option 3 & Modul Komparasi Option 2 vs Option 3

1. **Isolasi Modul Backend Option 3 (`src/lib/panel-adv-*.ts`)**:
   - `panel-adv-types.ts`: Kontrak tipe 6 fase, 9 step, 12 keputusan otomatis, hasil Monte Carlo, dan katalog literatur ilmiah terverifikasi (2016–2023 + klasik).
   - `panel-adv-preprocessing.ts`: Audit 13 dimensi data panel, diagnostik outlier *Panel MAD/IQR*, dan evaluasi 10 kandidat transformasi berbasis pelestarian estimand.
   - `panel-adv-auto-engine.ts`: *Automatic Decision Engine* 12 komponen dengan hierarki *validity-first* dan dukungan *manual override* + *restore initial config*.
   - `panel-adv-estimation.ts`: Mesin Bayesian Hierarchical Panel Latent ($\theta_{it} = \mu_\theta + u_i + v_t + w_{it}$), prior Half-$t$ + sensitivitas prior, diagnostik Vehtari (2021) (Rank-Normalized $\widehat{R}$, Folded $\widehat{R}$, Bulk/Tail ESS, MCSE), evaluasi **Multi-Anchor** ($J+2$ anchor), dan seleksi model ketergantungan galat via Marginal WAIC / LOO-ELPD.
   - `panel-adv-ranking.ts`: Pemeringkatan multi-indikator ($R_j = \sigma_j/|\lambda_j|$ & $\text{TRMSE}_j^{(a)}$), distribusi probabilitas ranking posterior $P(R_j=1)$ & $P(R_j \le k)$, dispersi ranking, stabilitas entitas/waktu, dan simulasi 10 skenario *Common-Mode Bias*.
   - `panel-adv-validation.ts`: LOSO dengan audit kovarians $\text{Var}(A-B)$, Pair FE dengan koreksi *Holm (1979)*, seleksi SE adaptif termasuk *Webb 6-Point / Rademacher Wild Cluster Bootstrap*, dan *Repeated-Measures Mixed-Effects Bland-Altman LoA*.
   - `panel-adv-montecarlo.ts`: Simulator Monte Carlo 7 keluarga skenario (`A`–`G`) dengan 15 metrik pemulihan parameter & ranking.
   - `panel-adv-stata.ts` & `panel-adv-orchestrator.ts`: Generator kode Stata/R/Stan terverifikasi per Step 1–9, ekspor laporan, dan orkestrator mandiri Option 3.
2. **Modul Komparasi Metodologi (`src/lib/panel-methodology-comparison.ts`)**:
   - Menjalankan Option 2 (tanpa modifikasi) dan Option 3 (mandiri) pada `PanelDataset` mentah yang identik, menyusun matriks perbandingan 19 dimensi, atribusi perbedaan ranking, 10 diagnostik komparatif, dan 6 kategori kesimpulan ilmiah.
3. **API & Antarmuka Pengguna (`src/app/api/panel-adv-accuracy/fit/route.ts`, `src/components/`)**:
   - `PanelAdvancedAccuracyCharts.tsx`, `PanelAdvancedAccuracyTab.tsx` (9 Step penuh), `PanelMethodologyComparisonPanel.tsx`, serta integrasi pemilih 4 mode (`Option 1`, `Option 2`, `Option 3`, `Komparasi Opsi 2 vs Opsi 3`) pada `PanelTabHub.tsx`.

---

## 15. Arsitektur Tahap 17: Pengembangan Terisolasi Option 4 (`Multi-Source Measurement Accuracy Analysis`)

Mengacu pada `docs/superpowers/specs/2026-11-26-multi-source-measurement-accuracy-design.md`:
1. **Isolasi Modul Fitur (`src/features/multi-source-accuracy/`)**:
   - `types/index.ts`, `utils/numerical.ts`, `utils/bibliography.ts` (18 literatur Crossref terverifikasi & glosarium Bahasa Indonesia).
   - `engine/`: `data-validation.ts`, `panel-detection.ts`, `measurement-classification.ts` (Contoh A vs Contoh B), `conversion-advisor.ts` (rekomendasi konversi metrik SI & jembatan empiris Contoh B), `descriptive-statistics.ts`, `decision-engine.ts` (`selectMeasurementMethod`), `bland-altman-deming.ts` ($J=2$), `triple-collocation.ts` ($J=3$ TCA/ETC), `n-cornered-hat-ec.ts` ($J \ge 4$ NCH & Extended Collocation), `diagnostics.ts`, `transformation.ts`, `uncertainty-robustness.ts` (Entity-Cluster Bootstrap & 8 skenario sensitivitas), `stata-code-generator.ts` (Stata 17/18 + Mata asli), dan `report-generator.ts` (14-bagian generator artikel jurnal).
   - `services/export-service.ts`, `hooks/use-msma-history.ts` (snapshot Undo/Redo/Restore/Audit Trail), dan `components/` (`MultiSourceAccuracyTab.tsx`, `MsmaCharts.tsx`, `MsmaModals.tsx`).
2. **Endpoint Server Terisolasi (`src/app/api/msma/`)**:
   - `export/route.ts` (PDF A4 bergaya jurnal, DOCX kompatibel Google Docs, XLSX multi-sheet aman formula, Stata `.do`) dan `ai-interpret/route.ts` (opsional penyempurnaan narasi berbasis hasil numerik tervalidasi).
3. **Integrasi Tanpa Regresi (`src/components/PanelTabHub.tsx`)**:
   - Penambahan kartu pemilih mandiri `msma` tanpa menyentuh state, komponen, atau algoritma Option 1, Option 2, maupun Option 3.
