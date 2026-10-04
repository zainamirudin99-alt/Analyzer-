# Spesifikasi Desain Tahap 3: Perbaikan Sah, Pelaporan Jujur, Ekspor Word, dan Finalisasi

**Tanggal**: 2026-10-04  
**Status**: Disetujui  
**Penulis**: Tim Rekayasa & Statistika Terapan  
**Target Rilis**: Vercel & Supabase (CED Analyzer v2.0)

---

## 1. Konteks dan Tujuan

Tahap 3 menyelesaikan fitur "Analisis Regresi Statistik" dengan menambahkan:
1. **Lapisan Pelaporan Jujur (*Honest Reporting Layer*)**:
   - Model awal $M_0$ selalu ditampilkan apa adanya (tidak pernah disembunyikan/dihapus).
   - Setiap eksperimen perbaikan ($M_1, M_2, \dots, M_K$) dicatat *append-only* di `analysis_events`.
   - Klasifikasi deterministik label laporan: **Konfirmatori** vs **Eksploratori** dengan peringatan metodologis.
   - Penegakan **Invarian I10**: Rekomendasi perbaikan hanya dipicu oleh diagnostik asumsi, bukan oleh p-value koefisien prediktor.
2. **Mesin Remedial Terapan**:
   - Residu non-normal: Hapus outlier $\le 5\%$ berkonfirmasi per baris, Transformasi ($\ln$, $\log_{10}$, $\sqrt{}$, Box-Cox $\lambda$ via profile likelihood OLS), Robust (Huber, Tukey bisquare, HC3), Kuantil median / Theil-Sen, Bootstrap (BCa non-time series, Moving Block time series).
   - *Normality Pass Rate (PR)*: Simulasi $B = 1000$ subsampel $m = \lfloor 0.8n \rfloor$ dengan Wilson 95% CI.
   - Pelanggaran lain: HC3 / WLS, eliminasi/penggabungan $X$, Ridge, PCA, suku kuadratik/polinom centered.
   - Time Series: Peringatan regresi lancung (*spurious regression*), koreksi HAC Newey-West ($L = \lfloor 4(n/100)^{2/9} \rfloor$), ARX (lag $Y$), expanding-window validation.
   - Jalur $R^2$ rendah: Deteksi $f^2$, perhitungan MDES dari $F$ non-sentral, $k$-fold cross-validation, dan opsi "Terima hasil apa adanya".
3. **Generator Interpretasi Deterministik**:
   - Mengikuti template Bahasa Indonesia baku akademik Bagian 7 skill remedial.
   - 100% data-bound: seluruh angka diambil langsung dari objek hasil komputasi tanpa teks bebas/halusinasi.
4. **Ekspor Word (.docx) & Visualisasi 200 DPI**:
   - Endpoint Python `/api/engine/plot`: render grafik diagnostik matplotlib 200 dpi (P-P, Q-Q, Res vs Fit, Histogram, ACF/PACF).
   - Endpoint Node `/api/regression/export-docx`: menyusun dokumen `.docx` berstandar publikasi (sampul formal, ringkasan eksekutif, tabel semantik Word asli gaya SPSS, gambar plot tersemat, log audit, dan status eksploratori/konfirmatori).
5. **Pengerasan & Keamanan**:
   - Pemeriksaan RLS, mitigasi SSRF, sanitasi formula spreadsheet (`=`, `+`, `-`, `@`), audit WCAG 2.1 AA, dan uji *Zero-Regression* menu CED.

---

## 2. Struktur Modul & Antarmuka Data

### A. Modul Remedial (`src/lib/regression-remedial.ts`)
```typescript
export interface OutlierCase {
  index: number;
  rowNumber: number;
  yActual: number;
  yPred: number;
  residual: number;
  studentizedResidual: number;
  cooksD: number;
  isEligible: boolean; // |t| > 3 or Cook's D > 4/n
}

export interface BoxCoxResult {
  optimalLambda: number;
  roundedLambda: number;
  ciLower: number;
  ciUpper: number;
  shiftConstant: number;
  profileLogLikelihood: Array<{ lambda: number; logLik: number }>;
}

export interface PassRateResult {
  passRate: number; // 0 - 100%
  wilsonCiLower: number;
  wilsonCiUpper: number;
  b: number; // 1000
  subsampleSize: number; // floor(0.8n)
  m0PassRate?: number;
  isApplicable: boolean;
  inapplicabilityReason?: string;
}

export interface RemedialSpecification {
  id: string; // "M0", "M1", etc.
  type: "baseline" | "outlier_removal" | "transformation" | "robust_hc3" | "robust_rlm" | "quantile" | "bootstrap" | "ridge" | "pca" | "polynomial" | "hac_newey_west" | "arx_lag";
  parameters: Record<string, any>;
  effectiveN: number;
  seed?: number;
  kIndex: number;
  label: "Konfirmatori" | "Eksploratori";
  exploratoryReason?: string;
}
```

### B. Template Interpretasi Deterministik (`src/lib/regression-interpretation.ts`)
Fungsi `generateDeterministicInterpretation(result: OLSFitResult, modelSpec: RemedialSpecification, kTried: number): NarrativeSections`:
- `modelSummary`: Narasi $R^2$, $\text{Adj } R^2$, dan persentase variasi.
- `anova`: Narasi uji $F(df_1, df_2)$, nilai statistik, p-value, dan kelayakan model.
- `coefficients`: Narasi per prediktor ($B$, arah kenaikan/penurunan, CI 95%, signifikansi pada $\alpha$).
- `assumptions`: Satu kalimat per uji asumsi (Normalitas, Heteroskedastisitas, Multikolinearitas, Autokorelasi, Outlier, Stasioneritas).
- `lowR2`: Kalimat deteksi variasi rendah dan nilai MDES $f^2$.
- `remedialHistory`: Rekapitulasi model yang dicoba, nilai Pass Rate, dan status laporan.

### C. Ekspor Word (`src/app/api/regression/export-docx/route.ts`)
Menggunakan pustaka `docx` untuk merender:
1. Cover Page: Tabel metadata aplikasi, tanggal, dataset, variabel, $\alpha$, seed, status.
2. Executive Summary: 3–5 kalimat hasil, skor S1, S2, S3.
3. 9 Tabel SPSS asli Word (menggunakan `Table`, `TableRow`, `TableCell`, border top/bottom ganda tanpa border vertikal).
4. Paragraf narasi interpretasi di bawah setiap tabel.
5. Gambar plot diagnostik 200 dpi (buffer PNG dari `/api/engine/plot`).
6. Tabel perbandingan $M_0$ s.d. $M_K$.
7. Lampiran audit event.

---

## 3. Rencana Pengujian

1. `tests/unit/remedial.test.ts`:
   - Pembuktian Invarian I10: Remedial generator tidak menerima / mengecek p-value koefisien.
   - Uji batas outlier $\le 5\%$ dan konfirmasi per baris.
   - Uji Box-Cox $\lambda$ profiling vs acuan R.
   - Uji HC3 standard errors vs acuan R `sandwich::vcovHC(type = "HC3")`.
   - Uji Wilson 95% CI untuk Pass Rate.
   - Uji HAC Newey-West lag formula.
2. `tests/unit/interpretation.test.ts`:
   - Validasi identitas angka pada teks narasi terhadap objek hasil komputasi.
3. `tests/integration/export-docx.test.ts`:
   - Verifikasi pembentukan binary docx valid dan kelengkapan tabel.
4. `tests/regression/ced-behavior.test.ts`:
   - Verifikasi isolasi dan integritas menu CED (Zero regression).
5. Build dan validasi antarmuka 4 viewport.
