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
