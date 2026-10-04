# HANDOFF TAHAP 2: Mesin Statistik, Diagnostik Asumsi, dan Output Gaya SPSS

Dokumen serah terima (*handoff document*) untuk menyelesaikan Tahap 2 dan memberikan spesifikasi kontrak serta hasil verifikasi sebelum memulai Tahap 3.

---

## 1. Status Gerbang G2: LULUS

Semua kriteria penerimaan Tahap 2 telah terpenuhi dan diverifikasi secara independen:
- **Tabel Basis Data**: `results` dibuat dengan kebijakan RLS pemilik (`auth.uid() = owner_id`) dan `analysis_events` mencatat setiap eksekusi secara append-only.
- **Akurasi Benchmark S1**: Mencapai LRE 13.33–15.11 pada dataset sertifikasi NIST StRD Norris (target minimal $\ge 9.0$).
- **Skor Konsistensi S3**: 100% (8 dari 8 identitas matematis OLS terpenuhi tanpa toleransi pelanggaran).
- **Diagnostik Asumsi**: 9 uji formal asumsi klasik dan time series bekerja akurat pada 8 dataset sintetik berbenih tetap.
- **UI Responsif**: 9 tabel semantik gaya SPSS dengan format `.000`, card view mobile, SVG plot diagnostik interaktif, dan tombol remedial dinonaktifkan ("tersedia di Tahap 3").
- **Kinerja**: Model $n = 10.000, k = 10$ selesai dalam ~300 ms (jauh di bawah batas timeout serverless).
- **Regresi CED (Invarian I7)**: 3/3 pengujian CED lulus tanpa modifikasi.

---

## 2. Skema Data & Kontrak JSON Hasil (`OLSFitResult`)

### A. Tabel Supabase `results`
Tersimpan pada migrasi: [supabase/migrations/20261004_regression_results.sql](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/supabase/migrations/20261004_regression_results.sql)
- `id`: UUID (Primary Key)
- `analysis_id`: UUID (Foreign Key ke `analyses.id`, ON DELETE CASCADE)
- `owner_id`: UUID (Foreign Key ke `auth.users.id`, RLS `auth.uid() = owner_id`)
- `engine_version`: VARCHAR(50) (e.g. `"2.0.0-dual-ols-svd"`)
- `result`: JSONB (Payload lengkap `OLSFitResult`)
- `scores`: JSONB (Skor konsistensi S3, S1 benchmark, catatan validasi)
- `created_at`: TIMESTAMPTZ DEFAULT `now()`

### B. Struktur Kontrak JSON `OLSFitResult`
```typescript
interface OLSFitResult {
  engine_version: string; // "2.0.0-dual-ols-svd"
  n: number;
  k: number;
  df_model: number;
  df_residual: number;
  df_total: number;
  r: number;
  r2: number;
  r2_adj: number;
  std_err_est: number;
  f_stat: number;
  f_pvalue: number;
  ss_reg: number;
  ss_res: number;
  ss_tot: number;
  ms_reg: number;
  ms_res: number;
  coefficients: Array<{
    variable: string;
    b: number;
    std_err: number;
    beta: number | null;
    t_stat: number;
    p_value: number;
    ci_lower: number;
    ci_upper: number;
    zero_order: number;
    partial: number;
    part: number;
    tolerance: number | null;
    vif: number | null;
  }>;
  descriptive_stats: Array<{
    variable: string;
    mean: number;
    std_dev: number;
    n: number;
  }>;
  correlations: {
    variables: string[];
    matrix: number[][];
    p_values: number[][];
  };
  collinearity_diagnostics: Array<{
    dimension: number;
    eigenvalue: number;
    condition_index: number;
    variance_proportions: Record<string, number>;
  }>;
  residuals_stats: Array<{
    stat: string;
    min: number;
    max: number;
    mean: number;
    std_dev: number;
    n: number;
  }>;
  casewise_diagnostics: Array<{
    case_num: number;
    std_residual: number;
    y_actual: number;
    y_pred: number;
    residual: number;
    cooks_d: number;
  }>;
  assumptions: Array<{
    name: string;
    statistic: number;
    p_value: number | null;
    criteria: string;
    status: "terpenuhi" | "waspada" | "gagal" | "tidak_berlaku";
    reason: string;
  }>;
  plots: {
    pp_plot: Array<{ expected: number; observed: number }>;
    qq_plot: Array<{ theoretical: number; sample: number }>;
    residual_histogram: Array<{ bin_start: number; bin_end: number; count: number; normal_curve: number }>;
    res_vs_fit: Array<{ fitted: number; residual: number }>;
    time_series_res?: Array<{ time: string | number; residual: number }>;
    acf_pacf?: {
      lags: number[];
      acf: number[];
      pacf: number[];
      conf_bound: number;
    };
  };
  scores: {
    s3_score: number; // 100%
    s3_passed: boolean;
    s3_failed_checks: string[];
    s1_release_score: number;
  };
}
```

---

## 3. Daftar Fixture Pengujian

### A. NIST StRD (Standard Reference Data)
- **Dataset**: Norris (Linear calibration dataset)
- **URL Sumber**: https://www.itl.nist.gov/div898/strd/lls/data/LINKS/DATA/Norris.dat
- **Tanggal Diambil**: 2026-10-04
- **Nilai Acuan Bersertifikat**:
  - Sample Size: $n = 36$
  - Intercept $\beta_0$: `-0.126319329728499` (Std. Dev: `0.197907455160864`)
  - Slope $\beta_1$: `1.00211681802045` (Std. Dev: `0.429709265435404E-03`)
  - Residual Std Dev: `0.881845118776092`
  - $R^2$: `0.999993745883712`

### B. 8 Dataset Sintetik Berbenih Tetap (`tests/fixtures/synthetic-datasets.ts`)
1. **SLR Baseline** ($n = 20$, Seed: `12345`): Model sederhana $Y = 2 + 1.5X + \epsilon$.
2. **MLR Baseline** ($n = 200$, Seed: `54321`): Tiga prediktor bebas $X_1, X_2, X_3$.
3. **Outlier / Influential Cases** ($n = 35$, Seed: `999`): Disuntikkan kasus ekstrem pada indeks 0 dan 1 untuk memicu Cook's D $> 4/n$ dan $|t| > 3$.
4. **Heteroskedasticity** ($n = 100$, Seed: `777`): Varians kesalahan bertumbuh sebanding dengan $X^2$ ($\sigma_i = 0.5 X_i$), memicu gagal homoskedastisitas (Koenker BP $p < 0.05$).
5. **High Multicollinearity** ($n = 60$, Seed: `444`): $X_2 = 0.99 X_1 + \delta$, memicu VIF $> 10$, Tolerance $< 0.1$, dan Condition Index $> 30$.
6. **Low $R^2$** ($n = 80$, Seed: `333`): Prediktor murni acak terhadap respon, menghasilkan $R^2 < 0.05$ dan $F\text{-sig} > 0.05$.
7. **Time Series AR(1)** ($n = 50$, Seed: `888`): Residu memiliki autokorelasi positif kuat ($\rho = 0.8$), memicu Durbin-Watson $\ll 1.5$ dan Breusch-Godfrey LM $p < 0.05$.
8. **Spurious Non-Stationary Time Series** ($n = 100$, Seed: `666`): Dua random walk independen tanpa kointegrasi, memicu peringatan regresi lancung ($R^2 > DW$, ADF $p > 0.05$).

### C. Skrip Generator R (`tests/fixtures/generate_r_fixtures.R`)
Menghasilkan acuan komparasi dari R standar (`lm`, `bptest`, `bgtest`, `shapiro.test`, `car::vif`).

---

## 4. Hasil Pengujian Benchmark & Skor Kesesuaian

### A. Tabel LRE (Log Relative Error) terhadap NIST Norris
$$\text{LRE} = -\log_{10}\left(\frac{|\text{est} - \text{ref}|}{|\text{ref}|}\right)$$

| Statistik | Nilai Estimasi Mesin | Nilai Sertifikasi NIST | LRE | Status ($\ge 9.0$) |
|---|---|---|:---:|:---:|
| Intercept ($\beta_0$) | `-0.12631932972849313` | `-0.126319329728499` | **13.33** | LULUS |
| Slope ($\beta_1$) | `1.0021168180204467` | `1.00211681802045` | **14.40** | LULUS |
| $R^2$ | `0.9999937458837119` | `0.999993745883712` | **15.11** | LULUS |
| Residual Std Error | `0.8818451187760932` | `0.881845118776092` | **13.83** | LULUS |

### B. Skor Konsistensi Matematis S3 (100%)
8 Identitas matematis OLS yang diverifikasi pada setiap analisis:
1. $SST = SSR + SSE$ (Toleransi selisih relatif $< 10^{-7}$)
2. $\sum e_i = 0$ (Jumlah residual mendekati 0, $< 10^{-7}$)
3. $\sum e_i \hat{y}_i = 0$ (Ortogonalitas residual terhadap fitted value)
4. $\sum e_i X_{ij} = 0$ (Ortogonalitas residual terhadap seluruh prediktor $X$)
5. $R^2 = 1 - SSE/SST = SSR/SST$
6. $F = \frac{R^2/k}{(1-R^2)/(n-k-1)}$
7. Selisih koefisien OLS vs SVD ($numpy.linalg.lstsq$) $< 10^{-8}$
8. Kesesuaian derajat kebebasan: $df_{tot} = df_{reg} + df_{res}$

---

## 5. Kinerja & Eksekusi

Uji kinerja pada `tests/benchmark/performance.test.ts`:
- Dataset: $n = 10.000$ baris, $k = 10$ prediktor.
- Durasi eksekusi: **249–422 ms** (Rata-rata ~310 ms).
- Batas ambang: $< 3.000$ ms.
- Rekomendasi UI: Batas $N = 50.000$ baris dapat dijalankan dengan aman di lingkungan peramban/serverless tanpa memicu timeout.

---

## 6. Catatan Platform & Perbedaan Perilaku terhadap SPSS

1. **Ketersediaan GNU PSPP**:
   - GNU PSPP tidak tersedia pada lingkungan instalasi lokal Windows (`where.exe pspp` menghasilkan returncode 1).
   - Acuan benchmark mengandalkan NIST StRD dan paket standar R (`stats`, `lmtest`, `car`), yang memberikan presisi lebih tinggi.
2. **Uji Normalitas Lilliefors**:
   - Untuk $n > 50$, koreksi Lilliefors menggunakan aproksimasi analitik Molin-Abdi / Dallal-Wilkinson untuk p-value Kolmogorov-Smirnov dengan estimasi parameter sampel.
3. **Uji Heteroskedastisitas Breusch-Pagan**:
   - Menggunakan bentuk *Koenker studentized test* ($LM = n R_{e^2}^2$), yang tangguh terhadap pelanggaran normalitas residual (berbeda dengan BP klasik non-studentized SPSS lama).
4. **Uji Stasioneritas ADF (Augmented Dickey-Fuller)**:
   - Evaluasi p-value dan penolakan hipotesis nol unit root menggunakan nilai kritis asimtotik MacKinnon (1996) ($-3.51$ untuk 1%, $-2.89$ untuk 5%, $-2.58$ untuk 10%), bukan distribusi normal standar.

---

## 7. Cara Menjalankan Benchmark Lokal

```bash
# Menjalankan seluruh test suite (52 tests)
npx.cmd vitest run

# Menjalankan spesifik benchmark S1 dan S3
npx.cmd vitest run tests/benchmark/s1-benchmark.test.ts

# Menjalankan uji performa skala besar (n=10k, k=10)
npx.cmd vitest run tests/benchmark/performance.test.ts

# Menjalankan verifikasi layout 4 viewport & aksesibilitas
npx.cmd vitest run tests/unit/viewport-layout.test.ts
```

---

## 8. Item yang Ditunda ke Tahap 3 (Out of Scope Tahap 2)

Sesuai aturan Invarian I4 dan batasan ruang lingkup:
- **Metode Seleksi Prediktor Otomatis**: Forward, Backward, dan Stepwise regression.
- **Remedial Asumsi Otomatis**: Transformasi Box-Cox, Log/Ln, kuadratik, WLS (Weighted Least Squares), pembersihan outlier berdasar ambang batas, dan estimasi HAC Newey-West.
- **Normality Pass Rate**: Evaluasi lintas transformasi untuk rekomendasi penanganan non-normalitas.
- **Ekspor Dokumen**: Generator laporan format DOCX, PDF, dan Excel.
- **Interpretasi Naratif**: Pembuatan narasi kesimpulan otomatis dalam bahasa Indonesia akademik.
