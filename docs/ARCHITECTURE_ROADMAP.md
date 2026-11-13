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
