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
