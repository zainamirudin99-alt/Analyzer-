# SOURCE OF TRUTH (Discovery Repositori)

Dokumen ini memuat seluruh fakta terverifikasi dari inspeksi langsung kode sumber, konfigurasi lingkungan, asumsi yang digunakan, serta pertanyaan terbuka. Sesuatu yang tidak terlihat secara langsung dari file kode dicatat secara tegas sebagai **"tidak diketahui"**.

---

## 1. Fakta yang Terverifikasi (Verified Facts)

### A. Repositori & Bahasa Pemrograman
- **Framework**: Next.js versi `14.2.25` (App Router).
- **Runtime Frontend**: React `18.3.1`, React DOM `18.3.1`.
- **Bahasa**: TypeScript versi `5.7.3`. Konfigurasi `tsconfig.json` menggunakan `target: es5`, `lib: ["dom", "dom.iterable", "esnext"]`, path alias `@/*` mengarah ke `./src/*`.
- **Node.js Lokal**: `v24.19.0` (terdeteksi via `node -v`).
- **NPM Lokal**: `11.17.0` dapat dijalankan via `npm.cmd`. Pemanggilan langsung `npm` terhalang oleh PowerShell ExecutionPolicy Restricted (`npm.ps1` diblokir).
- **Lockfile**: Tidak ditemukan file lock (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, maupun `bun.lockb`).
- **Node Modules**: Direktori `node_modules` belum ada secara lokal pada repositori ini saat discovery.
- **Python Lokal**: Windows App Execution Alias (`python.exe` mengarah ke Microsoft Store shortcut, binary asli Python belum terpasang atau belum didaftarkan di PATH sistem Windows).

### B. Dependensi (package.json)
- **Produksi**:
  - `@supabase/supabase-js`: `^2.48.1`
  - `clsx`: `^2.1.1`
  - `lucide-react`: `^0.475.0`
  - `next`: `^14.2.25`
  - `pdf-parse`: `^1.1.1`
  - `react`: `^18.3.1`
  - `react-dom`: `^18.3.1`
- **Pengembangan**:
  - `@types/node`: `^20.17.19`
  - `@types/pdf-parse`: `^1.1.4`
  - `@types/react`: `^18.3.18`
  - `@types/react-dom`: `^18.3.5`
  - `typescript`: `^5.7.3`
- **Testing**: Saat ini **tidak ada** pustaka pengujian terpasang (belum ada Jest, Vitest, Cypress, maupun Playwright di `package.json`).

### C. Konfigurasi Next.js & Vercel
- **`next.config.js`**:
  - `reactStrictMode: false`
  - `typescript.ignoreBuildErrors: true`
  - `eslint.ignoreDuringBuilds: true`
  - `experimental.serverComponentsExternalPackages: ['pdf-parse']`
- **`vercel.json`**:
  - `framework: "nextjs"`
  - `buildCommand: "next build"`
  - Cron keepalive: 2 cron job `/api/cron/keepalive` setiap pukul 00:00 dan 12:00 UTC untuk mencegah hibernasi Supabase Free Tier.

### D. Arsitektur Menu Eksisting ("Analisis CED")
- Terletak di tab navigasi `upload`, `results`, `guide`, dan `settings`.
- Menggunakan endpoint:
  - `POST /api/analyze`: Menerima FormData (file PDF atau teks, kode emiten, tahun fiskal), mengekstrak teks dengan `pdf-parse`, menganalisis 18 indikator CED via Google Gemini AI (`gemini-2.5-flash` / `gemini-3.7-flash`), dan menyimpan baris ke `ced_results`.
  - `GET, DELETE /api/results`: Mengambil dan menghapus riwayat analisis CED dari tabel Supabase `ced_results`.
  - `GET /api/settings`: Mengecek status koneksi Supabase.
  - `GET /api/cron/keepalive`: Memperbarui baris tabel `ced_heartbeat`.
- **Autentikasi**: Menu CED saat ini beroperasi **tanpa login** (semua pengunjung dapat mengunggah dan membaca tabel publik).

### E. Basis Data Supabase Eksisting (`schema.sql`)
- Tabel `public.ced_results`: 18 indikator CED, skor terakumulasi (`GENERATED ALWAYS AS`), RLS aktif dengan kebijakan `Public All Access` (`FOR ALL USING (true) WITH CHECK (true)`).
- Tabel `public.ced_heartbeat`: Pelacak ping keepalive.
- Tabel `public.app_settings`: Pasangan key-value untuk pengaturan model AI aktif.
- **Tabel Baru untuk Regresi**: Belum ada (`datasets`, `analyses`, `analysis_events` belum dibuat).
- **Storage**: Bucket `datasets` belum ada.

### F. Styling & Desain
- Menggunakan CSS murni di `src/app/globals.css` (2400+ baris).
- Menggunakan CSS variables / design tokens bertema hijau hutan (*forest green*), slate, dan emerald.
- Desain responsif dengan media queries `@media (max-width: 768px)`.
- Tidak menggunakan Tailwind CSS.

### G. Customization & Skills
- `.agents/skills/regresi-statistik-inti/SKILL.md`: Terpasang di workspace dan di global `~/.gemini/config/skills/`.
- `.agents/skills/regresi-statistik-remedial/SKILL.md`: Terpasang di workspace dan di global `~/.gemini/config/skills/`.
- `AGENTS.md`: Terpasang di akar repositori.

---

## 2. Hal-hal yang "Tidak Diketahui" (Unseen / Environment Bounds)

1. **Environment Variables Production**: Variabel lingkungan di dashboard Vercel production tidak terlihat langsung dari file kode lokal.
2. **Kredensial Aktif Supabase Remote**: File `.env.local` tidak ada di repositori lokal; hanya ada `.env.example`. URL dan kunci API Supabase aktual pengguna tidak diketahui secara lokal.
3. **Versi Python Vercel Production**: Versi Python spesifik yang diaktifkan Vercel (3.9 vs 3.10 vs 3.12) saat deployment live belum dapat dibaca langsung dari dashboard Vercel.
4. **Paket Vercel**: Apakah akun Vercel pengguna adalah *Hobby* (timeout 10s) atau *Pro* (timeout 60s) tidak diketahui.
5. **Konfigurasi Supabase Auth Provider**: Pengaturan auth provider di Supabase Dashboard (Email confirm on/off, OAuth provider) tidak diketahui dari repositori.

---

## 3. Asumsi yang Digunakan (Assumptions)

1. **Paket Vercel Serverless**: Diasumsikan minimal dapat mendukung batas `maxDuration = 15` hingga `60` detik untuk Vercel Function.
2. **Supabase Auth**: Untuk memenuhi persyaratan *tenant isolation* (pengguna hanya melihat datanya sendiri), Supabase Auth akan diintegrasikan dengan UI Login/Register modal atau form sederhana.
3. **Ukuran File Dataset**: Dataset umum penelitian/tugas akhir berkisar antara 10 KB sampai 3 MB (di bawah limit 10 MB per file Supabase Storage).
4. **Isolasi Menu CED**: Menu CED tetap berjalan persis seperti sekarang tanpa mewajibkan pengguna CED untuk login (akses tetap publik/anonim untuk CED).
5. **Testing**: Pustaka pengujian modern (Playwright untuk E2E dan Vitest/Jest untuk unit/integration) akan ditambahkan sebagai devDependencies.

---

## 4. Pertanyaan Terbuka (Open Questions)

1. **Metode Autentikasi Pengguna**: Apakah registrasi akun baru dibuka bebas via Email/Password Supabase, atau dibatasi, atau menggunakan Magic Link?
2. **Ketersediaan Python Lokal**: Karena mesin lokal Windows pengguna belum memiliki Python di PATH, apakah eksekusi tes mesin Python lokal akan menggunakan Python virtual environment (venv) yang diunduh/diinstal, atau diuji via Vercel CLI / script runner?
3. **Koneksi Supabase Testing**: Apakah pengujian migrasi SQL & RLS akan dijalankan langsung ke instance remote Supabase (memerlukan nilai `.env.local`) atau melalui Docker Supabase Local / Postgres in-memory?


---

## 8. Ekspansi Tahap 5: 21 Poin Master Smartprompt — Advanced Statistical Analysis Engine (Standar IBM SPSS Statistics)

Spesifikasi pengembangan lanjutan untuk menyempurnakan dan memperluas menu **Analisis Regresi Statistik** mencakup 21 poin inti:
1. **Poin 01 — Arsitektur Mesin Statistik**: Mesin utama (`regression-engine.ts` & `python_engine/engine/fit.py`) dengan verifikasi konsistensi paritas SVD dan fungsi distribusi eksak (Regularized Incomplete Beta $I_x(a,b)$ & Gamma $\gamma(s,x)$).
2. **Poin 02 — Validasi & Prapemrosesan Data**: Deteksi missing value, duplikat, outlier, tipe data, variabel konstan, nilai numerik invalid (`Inf`/`-Inf`), pemeriksaan *Matrix Rank & Condition Number*, serta opsi *Listwise Deletion*, *Mean/Median Imputation*, *Linear Interpolation* (Time Series), dan *Multiple Imputation*.
3. **Poin 03 — Statistik Deskriptif Lengkap**: Numerik (*Mean, Median, Mode, SD, Variance, Min, Max, Range, Q1, Q3, IQR, Skewness $G_1$, Kurtosis $G_2$, SE Mean*) dan Kategorik (*Frequency, Percentage, Valid Percentage, Cumulative Percentage*).
4. **Poin 04 — Regresi Linear Standar**: OLS, WLS, GLS, Robust Linear Regression (RLM Huber/Tukey IRLS); metode entri variabel (*Enter, Forward, Backward, Stepwise*); struktur tabel resmi IBM SPSS Statistics.
5. **Poin 05 — Diagnostik Regresi Eksak**: Normalitas (*Royston Shapiro-Wilk, Lilliefors K-S, Jarque-Bera, Anderson-Darling*), Multikolinearitas (*VIF, Tolerance, Belsley SVD Eigenvalues & Condition Index*), Heteroskedastisitas (*Breusch-Pagan standar, Koenker, White, Glejser, Goldfeld-Quandt*), Autokorelasi (*Durbin-Watson, Breusch-Godfrey, Ljung-Box, ACF & PACF*), Linearitas (*Ramsey RESET eksak, Harvey-Collier*).
6. **Poin 06 — Metode Statistik Robust**: Kovarians **HC0, HC1, HC2, HC3, HC4**, Newey-West HAC, WLS, Cochrane-Orcutt vs Prais-Winsten AR(1), Bootstrap Confidence Intervals (Case & Block Bootstrap), IRLS Robust Regression, dan Transformasi Variabel.
7. **Poin 07 — Moderated Regression Analysis (MRA)**: Persamaan $Y = \beta_0 + \beta_1 X + \beta_2 Z + \beta_3(XZ) + \varepsilon$, Mean Centering otomatis, Hierarchical Regression 3 Model (Model 1, Model 2, Model 3) dengan *Change Statistics* ($R^2\text{ Change}, F\text{ Change}, df_1, df_2, \text{Sig. } F\text{ Change}$).
8. **Poin 08 — Advanced Moderation Analysis**: *Simple Slope Analysis* pada $Z = -1\text{ SD}, \text{Mean}, +1\text{ SD}$, Teknik *Johnson-Neyman* (batas signifikansi $Z_{\text{JN}}$ & Floodlight Region), Moderator Kategorik (Dummy/Contrast Coding), dan klasifikasi 4 tipe moderator (*Pure, Quasi, Predictor, Homologizer*).
9. **Poin 09 — Contingency Analysis (Crosstabulation)**: Tabel kontingensi $2\times 2, 2\times k, r\times 2, r\times c$ dengan *Observed, Expected, Row %, Column %, Total %, Marginal Totals*.
10. **Poin 10 — Chi-Square & Association Analysis**: *Pearson Chi-Square, Likelihood Ratio ($G^2$), Yates Continuity Correction, Fisher's Exact Test, Fisher-Freeman-Halton / Monte Carlo Significance, Linear-by-Linear Association*; ukuran asosiasi (*Phi, Cramer's V, Contingency Coefficient, Odds Ratio, Relative Risk, Risk Difference*); serta *Pearson, Standardized, & Adjusted Standardized Residuals*.
11. **Poin 11 — Correlation & Association**: *Pearson, Spearman Rank, Kendall's Tau-b, Partial Correlation, Point-Biserial*, 95% CI Fisher's $z$, matriks korelasi & heatmap.
12. **Poin 12 — Advanced Regression Models**: *Binary Logistic, Multinomial Logistic, Ordinal Logistic, Poisson, Negative Binomial, Polynomial, Quantile Regression ($L_1$ Median), dan GLM*.
13. **Poin 13 — Model Evaluation & Validation**: $R^2$, Adj $R^2$, RMSE, MAE, MSE, AIC, BIC, $k$-Fold Cross-Validation ($k=5, 10$), Rolling-Origin Time-Series Validation, dan perbandingan model.
14. **Poin 14 — Visualisasi Statistik**: Scatterplot + Garis Regresi, Partial Regression Plot, P-P, Q-Q, Histogram Residual, ZPRED vs SRESID, ACF/PACF, Interaction & Simple Slope Plot, Johnson-Neyman Plot, Clustered/Stacked Bar, Mosaic Plot, dan Residual Heatmap.
15. **Poin 15 — Mesin Interpretasi Akademik**: Narasi akademik bahasa Indonesia terstruktur 10-elemen (*Tujuan, Metode, $H_0/H_1$, Statistik Uji, p-value, Alpha, CI, Keputusan, Kesimpulan, Implikasi Penelitian*).
16. **Poin 16 — Kompatibilitas Output SPSS**: Struktur tabel identik SPSS, pembulatan desimal terkonfigurasi, format $p < .001$, dan pengaturan tingkat Confidence Interval ($90\%, 95\%, 99\%$).
17. **Poin 17 — Integrasi Skill & Repository Statistik**: Adopsi metodologi `statsmodels`, `scipy`, `pingouin`, `researchpy`, `scikit-posthocs`, `scikit-learn`, dan `K-Dense-AI/scientific-agent-skills`.
18. **Poin 18 — Ekspor Laporan Akademik**: Word (`.docx`) dan multi-sheet Excel (`.xlsx`) mencakup seluruh modul baru.
19. **Poin 19 & 20 — Jaminan Kualitas & Benchmark SPSS**: Unit test komprehensif, stabilitas numerik, dan benchmark terhadap NIST StRD & golden fixtures SPSS/R.
20. **Poin 21 — Perbaikan Kontras Dark Mode**: Penghapusan warna latar putih hardcoded (`#ffffff`) pada kartu pilihan di `RegressionTab.tsx` dan penyelarasan token tema gelap/terang di `globals.css`.

---

## 9. Ekspansi Tahap 7 & 8: Regresi Data Panel Stata Option 2 — Reference-Free All-Source Latent & Consensus Measurement Accuracy Assessment

Spesifikasi terkini untuk **Regresi Data Panel Stata → Option 2** (`PanelAccuracyTab.tsx`):
1. **Metodologi Utama (Opsi B — Reference-Free All-Source Evaluation)**: Evaluasi komparatif seluruh $J \ge 3$ sumber pengukuran secara **setara tanpa mengunci satu variabel sebagai Reference Source**, memadukan:
   - **Bayesian Hierarchical Panel Latent Measurement Model (`panel-accuracy-latent.ts`)**: Mengestimasi nilai kebenaran emisi laten ($\theta_{it}$) bersama *additive bias* ($\alpha_j$), *multiplicative loading* ($\lambda_j$), *measurement error SD/variance* ($\sigma_{\varepsilon_j}^2$), **Classical Reliability ($R_j^2$)**, **Posterior Probability of Being Best ($P(\text{Best}=j)$)**, serta diagnostik konvergensi **MCMC R-hat ($\hat{R}$)** & **Effective Sample Size (ESS)** (identifikasi *sum-to-zero bias* & *unit geometric-mean loading*).
   - **Leave-One-Source-Out (LOSO) Consensus Evaluation & Pair Fixed Effects**: Menguji kesalahan absolut relatif setiap sumber terhadap konsensus laten keluar-satu-sumber ($\hat{\theta}_{it}^{(-j)}$) agar sumber tidak menilai dirinya sendiri, dilengkapi **Lin's CCC**, **Bland-Altman LoA**, model **Pair Fixed Effects** (`areg ae i.source_id, absorb(pair_id) vce(cluster city_id)`) pada seluruh $J$ sumber, dan **Rademacher Wild Cluster Bootstrap**.
   - **4 Status Keputusan Peringkat**: `TERBUKTI_BERBEDA_SIGNIFIKAN`, `PERBEDAAN_TIDAK_SIGNIFIKAN`, `KONFLIK_ANTAR_METRIK`, dan `MODEL_TIDAK_TERIDENTIFIKASI`.
2. **Stata Command & Statistical Implementation di Seluruh 9 Step**: Setiap step memiliki panel 6 bagian (Tujuan Analisis, Kode Stata/R/Stan dinamis dengan Copy & Download, Kegunaan Setiap Kode, Penjelasan Output, Interpretasi 5-poin aktual, dan Kesimpulan Step).
3. **Intelligent Measurement Source Configuration Engine (Step 2)**: Analisis 14 karakteristik kolom otomatis dan 5 blok rekomendasi sistem tanpa mewajibkan pemilihan Reference Source.
4. **Isolasi Mutlak**: Option 1 (`PanelTab.tsx`, `panel-engine.ts`, `/api/panel/*`) dan seluruh menu lain tetap tidak tersentuh (`0` perubahan).

---

## 10. Ekspansi Tahap 9: Rekomendasi Cerdas Step 3 & Step 7 serta Transparansi Verifikasi Bootstrap Server

1. **Rekomendasi Optimal Step 3 (`PreprocessingRecommendationBundle` + `actionItems`)**:
   - Mengevaluasi seluruh skenario prapemrosesan secara komparatif menggunakan metrik **bebas-skala (*scale-invariant*)** yang adil antara skala asli dan `log(1+x)`: **Mean Reliability ($R^2$)**, **Max MCMC $\hat{R}$**, **Proportional Bias ($|t|$)**, **Outlier Rank Shift (%)**, dan **Skor Kualitas Statistik (0–100)** (menggantikan perbandingan MAE mentah lintas skala yang bias).
   - Menghasilkan daftar `actionItems` konkret (duplikat, outlier ekstrem pengubah ranking, proportional bias & skewness, identifiabilitas $J \ge 3$) beserta tombol satu-klik **Terapkan Seluruh Rekomendasi Terbaik Step 3** dan ringkasan dampak *Sebelum vs Sesudah*.
2. **Rekomendasi Optimal Step 7 (`Step7DiagnosticAdvisor`)**:
   - Menganalisis gabungan hasil diagnostik Step 7 (Heteroskedastisitas, Autokorelasi Serial AR(1), Pesaran CD, Small Cluster $G < 30$, Sensitivitas Outlier 95% Trim, Konvergensi MCMC $\hat{R}$/ESS, PPP, Proportional Bias, Skewness) dan menghasilkan daftar aksi terprioritas yang **sah secara statistika** (tanpa *p-hacking* / fabrikasi signifikansi).
   - Menyediakan eksekusi langsung dari Step 7 (termasuk **Verifikasi Presisi Tinggi: 1.999 Wild Bootstrap + 800 MCMC**, uji komparatif Winsorization 2.5%, evaluasi skala `log(1+x)`, atau pengembalian ke satuan asli).
3. **Transparansi Verifikasi Bootstrap Server (Step 6 & Step 7)**:
   - Menjelaskan perbedaan mode klien cepat (`499` replikasi) vs server penuh (`999` / `1.999` replikasi) dan menampilkan **Kartu Status & Delta Verifikasi** (`Max |\Delta p_{\text{boot}}|`, `Max |\Delta \hat{R}|`, waktu eksekusi, dan konsistensi peringkat #1) setiap kali tombol Bootstrap selesai dijalankan, sehingga pengguna melihat bukti nyata hasil verifikasi bukan perubahan senyap.

---

## 11. Ekspansi Tahap 10: Pemilihan Sheet Workbook Multi-Sheet (Excel & Google Sheets) pada Step 1 Option 2

1. **Cakupan**: Berlaku pada menu **Regresi Data Panel Stata → Option 2 (`PanelAccuracyTab.tsx`)** untuk sumber unggahan **Upload Excel/CSV** (`.xlsx`, `.xls`, `.csv`) maupun **Google Sheets Link**. Option 1 dan menu lain tidak tersentuh.
2. **Evaluasi & Seleksi Awal Cerdas (`evaluateImportedWorkbookSheets`)**:
   - Memeriksa setiap sheet yang dikembalikan API (`sheetName`, `rowCount`, `columnCount`, rasio header `__EMPTY`, dan jumlah kolom numerik).
   - Menandai sheet yang layak sebagai tabel panel (`isPanelReady`) vs non-tabel/cover/dashboard. Jika `sheets[0]` berupa sheet cover/dashboard (`__EMPTY`), sistem otomatis memilih sheet tabel data terbaik sebagai sheet aktif awal dan menampilkan notifikasi jelas beserta daftar seluruh sheet agar pengguna tetap bebas berpindah sheet kapan saja.
3. **Antarmuka Pemilihan Sheet Unified (Step 1)**:
   - Menampilkan panel **Pemilihan Sheet Workbook** di bawah kotak input `Upload Excel/CSV` maupun `Google Sheets`, berisi ringkasan jumlah sheet, daftar tombol kartu/pil sheet (`min-height: 44px`, jumlah baris × kolom, badge status `Siap Panel` / `Disarankan` / `Cover/Non-Tabel`), dan dropdown `<select>` tersinkronisasi (`font-size >= 15px`) untuk workbook dengan banyak sheet. Memilih sheet langsung memperbarui `rawRows`, preview tabel, KPI Step 1, dan auto-deteksi Step 2.

---

## 12. Ekspansi Tahap 11: Invariansi Skala MCMC (`globalScale` + Burn-In Adaptation) & Aturan Konflik Metrik Berbasis Akurasi Total (ISO 5725)

1. **Invariansi Skala Mesin Bayesian (`panel-accuracy-latent.ts`)**:
   - Menormalisasi matriks pengamatan terpusat dengan faktor skala sampel global (`globalScale = sqrt(median(var))`) sebelum menjalankan Gibbs/MH *Marginalized Woodbury* sehingga data berskala kecil (`0.01–5.0`) maupun besar (`10^3–10^9`) terpetakan pada varians internal `O(1)`.
   - Menerapkan adaptasi lebar proposal burn-in pada seluruh blok parameter (`stepLogSig`, `stepAlpha`, `stepLogLambda`, `stepMuTheta`, `stepLogVarT`) serta langkah penyejajaran *ridge shift* (`μ_θ ↔ α`) agar `max R-hat ≤ 1.05` untuk seluruh skala $J \ge 3$ tanpa kegagalan konvergensi semu.
2. **Eskalasi Iterasi Konvergensi Otomatis (`panel-accuracy-orchestrator.ts`)**:
   - Bila pada dataset $J \ge 3$ hasil MCMC awal mencatat `max R-hat > 1.08`, orkestrator melakukan 1 kali eskalasi otomatis hingga `1.000` iterasi (`burn-in = 550`) agar model $J \ge 3$ yang teridentifikasi secara teoretis tidak tertolak sebagai `MODEL_TIDAK_TERIDENTIFIKASI`.
3. **Aturan Konflik Metrik Berbasis Total Accuracy (`panel-accuracy-ranking.ts`)**:
   - Menyelaraskan definisi konflik metrik dengan metrologi **ISO 5725 (Trueness + Precision = Total RMSE)**: sumber pemenang dengan `Total Latent RMSE` terendah, `Reliabilitas R² >= 70%` (misal 97.2%), `Posterior P(Best) >= 95%`, dan `WildBoot p < 0.05` **tetap konklusif sebagai pemenang mutlak** meskipun sumber lain memiliki `Error SD` lebih kecil namun membawa bias sistematis besar (`α_j` tinggi sehingga `Total RMSE` jauh lebih buruk). Juga menghilangkan tanda kurung kosong `()` bila `warnings` kosong dan membedakan pesan tidak konvergen vs kurang sumber ($J < 3$).

---

## 13. Ekspansi Tahap 12: Rekonstruksi Total Opsi 2 (Master Smartprompt — Doctoral-Grade Bayesian Hierarchical Latent Measurement System)

1. **Deteksi Korelasi Galat Antarsumber & Identifikasi Lemah (`D1 & D3`)**:
   - Menghitung matriks korelasi residual pengukuran $\text{Corr}(\hat{\varepsilon}_a, \hat{\varepsilon}_b)$ pasca-estimasi laten, mendeteksi pasangan sumber dengan ketergantungan galat ($|r_{\varepsilon}| > 0.35$), menghitung estimasi sensitivitas terboboti (*Correlated-Error Adjusted Latent Benchmark*), serta menandai *weak identification* ($\hat{\lambda}_j \le 0.15$ atau $R_j^2 < 0.20$).
2. **Dekomposisi Akurasi, Expected Loss, Expected Rank, & Out-of-Sample LOSO (`E & F`)**:
   - Dekomposisi `Total Latent MSE` ke 3 komponen eksplisit: $\text{Bias}^2 = \alpha_j^2$, $\text{Scale Distortion}^2 = (\lambda_j - 1)^2 \text{Var}(\theta)$, dan $\text{Imprecision}^2 = \sigma_{\varepsilon_j}^2$, ditambah `Posterior Expected Loss`, `Expected Rank` ($E[\text{Rank}_j \mid X]$), `Ranking Stability (%)`, dan data `mcmcTraceDraws` (3 rantai).
   - Validasi prediktif **Leave-One-Source-Out (LOSO)** murni dengan mengestimasi ulang $\hat{\theta}_{it}^{(-j)}$ hanya dari sumber $m \ne j$ (tanpa membocorkan parameter sumber $j$), menghasilkan `LOSO MAE`, `LOSO RMSE`, `LOSO MBE`, **95% Predictive Interval Coverage**, dan **LOSO Calibration Slope**.
3. **Ekonometrika Komplementer & 4 Status Keputusan (`H & I`)**:
   - Menambahkan **Driscoll-Kraay (1998) Cross-Sectionally & Temporally Robust SE (`seDriscollKraay`)** pada model Pair Fixed Effects di samping City-Clustered SE dan Rademacher Wild Cluster Bootstrap.
   - Menggunakan 4 status kanonik: `PEMENANG_TERBUKTI_RELATIF`, `KANDIDAT_TERBAIK_BELUM_KONKLUSIF`, `KONFLIK_ANTAR_METRIK`, dan `MODEL_TIDAK_TERIDENTIFIKASI`, serta seksi wajib **`MENGAPA SUMBER INI MENJADI YANG TERBAIK?`** (8 poin).
4. **Statistical Advisor dengan Audit Trail & Panel 6-Bagian Stata (`J, K, L`)**:
   - Step 7 memiliki 4 tombol interaktif (`Terapkan Rekomendasi`, `Jalankan Analisis Alternatif`, `Bandingkan Hasil` Sebelum vs Sesudah, `Kembali ke Pengaturan Sebelumnya`) beserta log **Audit Trail**.
   - Panel **Stata Command & Statistical Implementation** di seluruh Step 1–9 memiliki 6 bagian eksplisit: (1) Tujuan Analisis, (2) Konsep Statistik, (3) Stata Command (+ R & Stan), (4) Penjelasan Setiap Kode, (5) Output dan Cara Membaca, (6) Interpretasi Statistik.
5. **16 Skenario Validasi Vitest (`O`)**: Mencakup $J=3,4,5$, balanced/unbalanced, missing, duplicate, outlier, scale mismatch, high-bias/low-var, low-bias/high-var, correlated errors, weak identification, non-convergence, small cluster, dan sensitivity rank flip.

---

## 14. Ekspansi Tahap 13: Penyempurnaan Penamaan Opsi C, Glosarium Singkatan per Step, & Ekspor Rapi Lengkap Step 1–9

1. **Verifikasi & Penerapan Penamaan Opsi C (`PanelTabHub.tsx`)**:
   - Memverifikasi keabsahan statistika Opsi C: metode inti pada Option 2 adalah *Bayesian Hierarchical Congeneric Latent Measurement Model* ($\theta_{it}$) yang menurunkan metrik akurasi pengukuran panel berbasis konsensus (*Trueness* $\alpha_j$, *Scale* $\lambda_j$, *Precision* $\sigma_{\varepsilon_j}$, *Total Latent RMSE*, Validasi LOSO, Pair Fixed Effects, & Driscoll-Kraay SE) tanpa sumber referensi terkunci (ISO 5725).
   - Menetapkan penamaan kanonik paralel dengan Option 1 (`REGRESI DATA PANEL`): **`OPTION 2: MODEL PENGUKURAN LATEN & AKURASI PANEL`**, subjudul `Komparasi Bayesian Multi-Sumber Tanpa Reference Source (ISO 5725)`, serta deskripsi netral lintas domain (tanpa mengunci contoh emisi CO₂ semata).
2. **Tombol Glosarium `Keterangan` di Sebelah Kanan Setiap Step (`panel-accuracy-glossary.ts` & `PanelAccuracyTab.tsx`)**:
   - Menyediakan kamus singkatan per Step (`STEP_ACRONYM_GLOSSARY[1..9]`) yang mencakup `MCMC`, `R-hat`, `ESS`, `PPP`, `LOSO`, `MAE`, `RMSE`, `MSE`, `MBE`, `NMAE`, `CCC`, `LoA`, `CrI`, `Pair FE`, `AE`, `DK`, `AR(1)`, `CD`, `HC1`, `CLT`, `EDA`, `IQR`, `CV`, `SD`, `CC`, `Avail`, `G`, `T`, `J`, `ISO 5725`, `LOCO`, `.do`, `.R`, `.stan`, `PDF`, `DOCX`, `XLSX`, dan `CSV`.
   - Menampilkan tombol **`Keterangan`** (`minHeight >= 44px`) di sisi kanan header setiap Step (1–9) yang membuka panel ringkas berisi **Singkatan**, **Kepanjangan**, dan **Arti & Fungsi pada Step Ini**.
3. **Output Tabel Stata Terurut Step 1–9 & Ekspor Rapi PDF, Word (`.docx`), Excel (`.xlsx`)**:
   - Memperluas `StataAccuracyOutputBundle` dengan `orderedStepOutputs` (9 blok output tabel Stata terformat `<= 94` karakter per baris, berurutan kronologis Step 1 hingga Step 9, bebas pemotongan kolom dan adaptif presisi desimal).
   - Memperbarui generator PDF murni TS (`escapePdf` penuh Unicode→ASCII, header/footer bernomor halaman, garis pemisah rapi, tabel Step 1–9 lengkap, output Stata Step 1–9 tanpa `.slice(0, 102)`, dan Master `.do`), Word `.docx` (header tabel berarsir navy, padding sel, seluruh tabel Step 1–9, 8-poin *Why Best*, output Stata urut & Master `.do`), dan Excel `.xlsx` (9 worksheet berurutan `01_Ringkasan_Riset` s.d. `09_Kode_Stata_R_Stan` dengan lebar kolom terukur & `sanitizeSpreadsheetText`).

---

## 15. Ekspansi Tahap 14: Progressive Disclosure Tombol `Kode Stata` pada Step 1–8

1. **Pelipatan Progresif Panel Kode, Output & Interpretasi Stata (`PanelAccuracyStepStataPanel.tsx`)**:
   - Pada **Step 1 s.d. Step 8**, bagian dokumentasi teknis Stata (Tujuan Analisis, Konsep Statistik, Kode Stata/R/Stan, Penjelasan Setiap Kode, Output & Cara Membaca Output Stata, tabel LOCO Step 8, serta Interpretasi Statistik Per Poin) disembunyikan secara default di balik tombol interaktif **`Kode Stata`** (`minHeight >= 44px`, `aria-expanded`, indikator ikon buka/tutup) untuk menjaga keterbacaan alur langkah.
   - **Bagian Kesimpulan Tetap Terlihat**: Kotak **Ringkasan Keputusan Step (`stepConclusion`)** dan **Interpretasi Ringkas Step** tetap selalu tampil di bagian bawah setiap Step 1–8 tanpa perlu membuka tombol `Kode Stata`.
   - **Step 9 Tetap Terbuka Default**: Step 9 (Final Results, Code & Export) menampilkan seluruh panel secara terbuka secara default (tetap dapat dilipat bila tombol `Kode Stata` diklik).

---

## 16. Ekspansi Tahap 15: Optimalisasi Tombol Rekomendasi Nyata (Step 3 & Step 7), Stabilitas `Corr(ε)` J=3, & Sinkronisasi Hasil Step 6–8

1. **Aksi Rekomendasi Spesifik & Berdampak Nyata (`panel-accuracy-types.ts`, `panel-accuracy-diagnostics.ts`, `PanelAccuracyTab.tsx`)**:
   - Memisahkan aksi `APPLY_DRISCOLL_KRAAY_SENSITIVITY` (mengaktifkan fokus & tabel pembanding *Driscoll-Kraay SE* di Step 6/7/8 + menyalin perintah `xtscc` ke clipboard + memastikan verifikasi presisi penuh) dan `AUDIT_CORRELATED_ERRORS` (membuka panel matriks $\text{Corr}(\hat{\varepsilon}_a, \hat{\varepsilon}_b)$ & uji sensitivitas sumber kembar *Adjusted Top Source* serta menandai tinjauan terverifikasi).
   - `RUN_HIGH_PRECISION_VERIFICATION` hanya dipicu jika replikasi Bootstrap `< 1999` atau MCMC belum optimal (`R-hat > 1.05` / `ESS < 150`); setelah aktif pada `1.999 Bootstrap + 800 MCMC`, Advisor menandai status **OPTIMAL (Terverifikasi ✓)** alih-alih mengulang komputasi identik dengan delta `0.0000`.
   - Menghilangkan *stale closure* pada `handleRunServerPipeline` lewat parameter `preprocessingOverride` serta menunggu hasil async (`await`) sebelum mencatat **Audit Trail** dan membuka tabel **Sebelum vs Sesudah** (yang kini menampilkan perbandingan `Total RMSE`, `Reliabilitas R²`, `Bias α`, & perubahan `Skor Diagnostik`).
2. **Stabilitas Deteksi Korelasi Galat pada $J = 3$ (`panel-accuracy-latent.ts`)**:
   - Menambahkan penjaga ragam sampel hingga ($\text{SE}(\hat{\sigma}_c^2) = \hat{\sigma}_c^2\sqrt{2/(P-1)}$) dan penyebut stabil pada cabang $J = 3$ agar varians besar dari sumber ke-3 yang bising tidak memicu *false positive* korelasi galat antar dua sumber yang akurat & independen.
3. **Transparansi Driscoll-Kraay SE di Step 6 & Step 8 (`PanelAccuracyTab.tsx`)**:
   - Menampilkan kolom `DK SE` pada tabel Pair FE Step 6, `DK p` pada kontras Step 6, serta `DK p vs #1` pada Step 8 ketika inferensi Driscoll-Kraay diaktifkan dari Step 7.
4. **Undo Multi-Langkah & Pembatalan Langsung Per Tombol Rekomendasi (`PanelAccuracyTab.tsx`)**:
   - Menambahkan tumpukan snapshot multi-langkah (`undoHistoryStack`, maksimal 15 langkah) yang menyimpan `preprocessing`, `driscollKraayActive`, `correlatedErrorReviewed`, `correlatedErrorAuditOpen`, serta hasil server terverifikasi sebelumnya (`serverFitResult` & `verificationFeedback`).
   - Memungkinkan pembatalan instan (*toggle off*) langsung lewat tombol **`Batalkan`** pada setiap kartu rekomendasi yang aktif (baik di Step 3 maupun Step 7), tombol **`Undo / Batalkan Terakhir (N)`** di Step 3 & Step 7, serta **`Reset ke Awal`**.
