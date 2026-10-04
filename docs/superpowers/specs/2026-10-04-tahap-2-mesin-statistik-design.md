# SPESIFIKASI DESAIN TAHAP 2: Mesin Statistik, Diagnostik Asumsi, dan Output Gaya SPSS

- **Status**: Disetujui (Approved)
- **Tanggal**: 2026-10-04
- **Penulis**: Senior Software Engineer & Applied Statistician Agent
- **Rujukan**: `AGENTS.md`, `.agents/skills/regresi-statistik-inti/SKILL.md`, `.agents/skills/regresi-statistik-remedial/SKILL.md` (bagian 1 & 2)

---

## 1. Ringkasan Eksekutif

Tahap 2 membangun inti komputasi ekonometrika dan statistika terapan untuk fitur "Analisis Regresi Statistik". Berangkat dari konfigurasi data valid yang dihasilkan Tahap 1, sistem akan:
1. Mengeksekusi regresi OLS (SLR & MLR) dengan verifikasi mesin independen ganda.
2. Menguji seluruh asumsi klasik (normalitas, linearitas, homoskedastisitas, multikolinearitas, outlier, time series stasioneritas, autokorelasi, dan ARCH-LM).
3. Merender 9 tabel keluaran semantik bergaya formal SPSS.
4. Menyediakan plot diagnostik interaktif berbasis SVG modular yang ringan.
5. Menghitung skor konsistensi internal S3 (target 100%) dan benchmark S1 terhadap NIST StRD dan R.
6. Menampilkan status asumsi apa adanya (prinsip pelaporan jujur) dengan tombol remedial dinonaktifkan hingga Tahap 3.

---

## 2. Skema Basis Data Tambahan (`results`)

Migrasi baru: `supabase/migrations/20261004_regression_results.sql`

```sql
CREATE TABLE IF NOT EXISTS public.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL DEFAULT auth.uid(),
    engine_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    result JSONB NOT NULL,
    scores JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner Select Results" ON public.results
    FOR SELECT TO authenticated
    USING (auth.uid() = owner_id);

CREATE POLICY "Owner Insert Results" ON public.results
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner Delete Results" ON public.results
    FOR DELETE TO authenticated
    USING (auth.uid() = owner_id);
```

Setiap pemanggilan estimasi wajib mencatat entri append-only ke `public.analysis_events` dengan `event_type = 'OLS_FIT_EXECUTED'` memuat payload konfigurasi, versi pustaka, dan seed.

---

## 3. Desain Komputasi Mesin Statistik (`/api/engine/fit`)

### A. Alur Pemrosesan
1. **Pembersihan Listwise**: Membuang baris yang memiliki nilai null/NaN pada variabel terpilih ($Y$, $X_1, \dots, X_k$, dan kolom waktu bila time series).
2. **Dummy Coding**: Variabel kategorik pada $X$ dikonversi menjadi $C - 1$ variabel dummy dengan kategori referensi eksplisit.
3. **Estimasi OLS Ganda**:
   - Mesin 1: `statsmodels.api.OLS` (menghasilkan koefisien, $t$, $p$, ANOVA, residu, VIF, dll).
   - Mesin 2: `numpy.linalg.lstsq` (SVD) untuk memverifikasi koefisien secara independen. Selisih relatif maksimal $10^{-8}$.
4. **9 Tabel Gaya SPSS**:
   - `Descriptive Statistics`: Mean, Std. Deviation, N.
   - `Correlations`: Korelasi Pearson Pearson r, Sig. (1-tailed), N.
   - `Variables Entered/Removed`: Variabel terpilih, metode 'Enter', toleransi input 0.0001.
   - `Model Summary`: $R$, $R^2$, Adjusted $R^2$, Std. Error of Estimate, Durbin-Watson.
   - `ANOVA`: Regression, Residual, Total; Sum of Squares, df, Mean Square, $F$, Sig.
   - `Coefficients`: Unstandardized $B$ dan Std. Error, Standardized Beta ($\beta$), $t$, Sig., 95% CI ($B$), Korelasi (Zero-order, Partial, Part), Collinearity Statistics (Tolerance, VIF).
   - `Collinearity Diagnostics`: Dimension, Eigenvalue, Condition Index ($\sqrt{\lambda_{\max}/\lambda_j}$), Variance Proportions tanpa centering (metode Belsley).
   - `Residuals Statistics`: Min, Max, Mean, Std. Dev, N untuk Predicted, Std. Predicted, Residual, Std. Residual, Stud. Deleted Residual, Cook's D, Centered Leverage Value.
   - `Casewise Diagnostics`: Baris dengan $|\text{Std. Residual}| > 3$.

### B. Diagnostik Asumsi Klasik Komprehensif
Setiap uji dilaporkan sebagai objek `{ name, statistic, p_value, criteria, status: 'lulus'|'gagal'|'tidak_berlaku', reason }`:
- **Normalitas Residu**:
  - Shapiro-Wilk bila $n \le 50$.
  - Lilliefors (K-S dengan koreksi mean & varians terestimasi) bila $n > 50$.
  - Bila $n > 200$, beri catatan bahwa uji formal over-sensitif dan evaluasi skewness/kurtosis serta Q-Q plot.
- **Linearitas**:
  - Ramsey RESET test ($F$-test pada kuadrat dan kubik prediksi).
- **Homoskedastisitas**:
  - Breusch-Pagan versi Koenker (robust terhadap non-normalitas).
  - Glejser test (regresikan $|e_i|$ terhadap prediktor).
- **Multikolinearitas (MLR)**:
  - Tolerance $> 0.10$ dan VIF $< 10$ (waspada VIF $> 5$).
  - Belsley Condition Index $> 30$ dengan $\ge 2$ proporsi varians $> 0.5$.
  - Pada SLR: berstatus `tidak_berlaku` ("Hanya 1 prediktor, multikolinearitas tidak relevan").
- **Outlier & Pengaruh**:
  - Studentized deleted residual ($|t| > 3$), Cook's Distance ($D > 4/n$), Centered Leverage ($h > 2(k+1)/n$).
  - Hanya menandai titik amat, tidak menghapus baris.
- **Autokorelasi**:
  - Non-time series: Durbin-Watson hanya sebagai acuan deskriptif.
  - Time series: Durbin-Watson, Breusch-Godfrey ($p > \alpha$), Ljung-Box, ACF/PACF.
- **Stasioneritas & Kointegrasi (Time Series)**:
  - Augmented Dickey-Fuller (ADF) dan KPSS pada $Y$ dan pada residu.
  - Peringatan regresi lancung (*spurious regression*) jika $Y$ dan $X$ non-stasioner dan $R^2 > DW$.
- **Heteroskedastisitas Bersyarat (Time Series)**:
  - Uji ARCH-LM ($p > \alpha$).

### C. Data Koordinat Plot Diagnostik (Array Numerik)
Endpoint menghasilkan array data numerik untuk dirender oleh komponen SVG frontend:
- `normal_pp_plot`: Titik kuantil empiris vs kuantil teoretis normal.
- `qq_plot`: Titik residual vs kuantil teoretis beserta garis referensi 45 derajat.
- `residual_histogram`: Bins frekuensi residu beserta kurva normal teoritis.
- `residual_vs_fitted`: Scatter plot residu vs nilai prediksi $\hat{y}$ dengan garis nol horizontal.
- `time_series_residual_plot`: Residu terhadap waktu kronologis (jika time series).
- `acf_pacf_plot`: Nilai autokorelasi lag 1 hingga $p$ beserta selang signifikansi Bartlett 95% (jika time series).

---

## 4. Mesin Verifikasi Independen & Penghitungan Skor S3

Mesin verifikasi melakukan 8 pengujian matematis internal independen:
1. $\max |\frac{B_{\text{statsmodels}} - B_{\text{svd}}}{B_{\text{statsmodels}}}| \le 10^{-8}$.
2. Dekomposisi jumlah kuadrat: $|SST - (SSR + SSE)| / SST \le 10^{-8}$.
3. Koefisien determinasi: $|R^2 - \frac{SSR}{SST}| \le 10^{-8}$.
4. Hubungan $F$-test: $|F - \frac{MSR}{MSE}| \le 10^{-8}$.
5. Ekuivalensi SLR: $|t^2 - F| \le 10^{-8}$ saat $k = 1$.
6. Standardisasi koefisien: $|\beta_j - B_j \frac{s_{xj}}{s_y}| \le 10^{-8}$.
7. Verifikasi komputasi ulang $p$-value terhadap distribusi $t$ dan $F$.
8. Peringatan kondisi matriks jika condition number $X > 10^8$.

Skor S3 dihitung sebagai persentase cek yang lulus:
$$S_3 = 100 \times \frac{\text{Cek Lulus}}{\text{Total Cek}}\%$$

---

## 5. Harness Benchmark S1 (NIST StRD & R Fixtures)

Tingkat akurasi logaritma (Log Relative Error):
$$LRE = -\log_{10}\left(\frac{|q - c|}{|c|}\right)$$
- Target: $LRE \ge 9$ untuk dataset NIST StRD dengan kondisi numerik baik (Norris, Pontius, Longley).
- Dataset ill-conditioned (Filip, Wampler) dilaporkan nilainya sebagai uji ketahanan, bukan syarat kelulusan.
- 8 dataset sintetik berbenih tetap (SLR $n=20$, MLR $n=200$, outlier, heteroskedastis, multikolinear, $R^2$ rendah, time series AR(1), dan random walk non-stasioner) divalidasi terhadap fixture acuan R.

---

## 6. Antarmuka Pengguna Hasil (SPSS Styling & Komponen SVG)

1. **Format Tabel Gaya SPSS**:
   - `<table>` semantik dengan `<caption>`.
   - Border tebal atas dan bawah ($1.5\text{px}$ solid hitam/slate), pemisah header ($1\text{px}$ solid), tanpa border vertikal.
   - Format angka: koefisien 3–4 desimal, nilai Sig. diformat gaya SPSS tanpa nol di depan (misal `.000`, `.018`).
   - Catatan kaki bersimbol a, b.
2. **Adaptabilitas Mobile**:
   - Kontainer tabel dengan scroll horizontal dan kolom pertama tetap menempel (`position: sticky; left: 0`).
   - Tombol toggle ke "Mode Tampilan Kartu" (*card view*) per baris tabel untuk kemudahan membaca di layar $360\text{px}$ - $390\text{px}$.
3. **Komponen Visualisasi SVG Murni**:
   - Komponen reaktif SVG tanpa pustaka pihak ketiga.
   - Titik scatter interaktif dengan tooltip sentuh (touch-friendly).
4. **Ringkasan Asumsi Jujur**:
   - Asumsi yang gagal ditampilkan apa adanya dengan teks deskriptif netral.
   - Tombol "Opsi Perbaikan" dinonaktifkan dengan label: *"Tersedia di Tahap 3 (Remedial & Pelaporan Jujur)"*.
5. **Kartu Skor Kesesuaian**:
   - Menampilkan skor $S_3$ untuk analisis saat ini dan $S_1$/$S_2$ terhadap benchmark acuan R/NIST/PSPP.

---

## 7. Kriteria Gerbang G2

- Toleransi numerik terhadap acuan R: relative error $\le 10^{-6}$ untuk estimasi koefisien dan $\le 10^{-4}$ untuk $p$-value.
- $S_3 = 100\%$ pada seluruh dataset uji valid.
- Semua uji asumsi mendeteksi pelanggaran secara akurat pada dataset yang dirancang melanggar.
- Tampilan responsif pada 4 viewport (360x640, 390x844, 768x1024, 1440x900).
- Zero-regression pada menu CED. Tidak ada kode remedial aktif (Tahap 3).
