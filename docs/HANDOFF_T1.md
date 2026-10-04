# HANDOFF TAHAP 1: Fondasi, Arsitektur, dan Data Masuk

Dokumen serah terima (*handoff document*) untuk menyelesaikan Tahap 1 dan memberikan fondasi terverifikasi sebelum memulai Tahap 2.

---

## 1. Keputusan Arsitektur Terverifikasi

1. **ADR-01 (Mesin Statistik)**:
   - **Keputusan**: Disetujui menggunakan **Opsi B (Next.js TypeScript + Vercel Python Serverless Function)**.
   - **Alasan**: Pustaka ilmiah Python (`statsmodels`, `scipy`, `numpy`, `pandas`) memiliki standar emas akurasi yang telah divalidasi terhadap dataset NIST StRD dan R.
   - **Spike Bundel**: Estimasi footprint uncompressed ~300 MB, masih dalam batas aman kuota Vercel 500 MB (~200 MB headroom tersisa).
2. **ADR-02 (Penyimpanan & Unggah Storage)**:
   - **Keputusan**: Menggunakan **Direct Authenticated Client Upload** via JWT sesi pengguna, bukan Signed URL dengan `service_role`.
   - **Alasan**: Menjaga integritas evaluasi RLS Supabase Storage `{auth.uid()}/...` secara native tanpa benturan konteks dan tanpa membebani kuota memori serverless Next.js.

---

## 2. Skema Basis Data & Kebijakan Keamanan (RLS)

File migrasi tersimpan di: [supabase/migrations/20261004_regression_foundation.sql](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/supabase/migrations/20261004_regression_foundation.sql)

### Tabel yang Didefinisikan:
1. `public.datasets`:
   - Metadata file dataset yang diunggah atau diimpor.
   - RLS: Pengguna hanya dapat membaca, mengunggah, dan menghapus dataset miliknya (`auth.uid() = owner_id`).
   - Retensi: `expires_at` default 30 hari.
2. `public.analyses`:
   - Konfigurasi parameter analisis regresi OLS.
   - CHECK Constraints: $\alpha \in (0, 1)$, `x_cols` tidak kosong, $Y \notin X$, validasi keterikatan `time_col` saat `is_time_series = true`.
   - RLS: Isolasi tenant ketat berbasis `auth.uid() = owner_id`.
3. `public.analysis_events` (Append-Only):
   - Mencatat seluruh riwayat eksperimen dan remedial model.
   - RLS: Hanya mengizinkan `INSERT` dan `SELECT`. Operasi `UPDATE` dan `DELETE` diblokir total pada level PostgreSQL RLS.
4. Supabase Storage Bucket `datasets`:
   - Bucket privat, batas file 10 MB.
   - Mime types: `.xlsx`, `.xls`, `.csv`.
   - Path isolasi: `{auth.uid()}/{dataset_id}/{filename}`.

---

## 3. Daftar Endpoint API yang Tersedia

| Endpoint | Metode | Deskripsi |
|---|:---:|---|
| `/api/regression/upload` | POST | Menerima FormData file, memvalidasi tanda tangan biner (Magic Bytes), menolak makro `.xlsm`, dan mengekstrak daftar sheet beserta pratinjau. |
| `/api/regression/import-link` | POST | Mengimpor spreadsheet Google Sheets dengan pengaman SSRF (allowlist domain, blokir IP privat), timeout 15 detik, dan batas 10 MB. |
| `/api/engine/health` | GET | Memeriksa ketersediaan dan kapabilitas mesin statistik. |
| `/api/engine/inspect` | POST | Menginspeksi struktur kolom, tipe data inferensial, dan pratinjau 10 baris dengan proteksi formula injection. |
| `/api/engine/validate` | POST | Memvalidasi seluruh aturan metodologis regresi OLS: Invarian I1 (Y numerik kontinu), I2 (n > k + 1), I3, I5, I6, serta kecukupan sampel Green (1991). |

---

## 4. UI Wizard Responsif (6 Langkah)

Komponen: [src/components/RegressionTab.tsx](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/components/RegressionTab.tsx)
- **Step 1: Sumber Data**: Opsi Upload Lokal vs Link Google Sheets + tombol muat sampel instan ($N=65$).
- **Step 2: Pilih Sheet**: Memilih lembar kerja yang aktif dalam workbook.
- **Step 3: Pratinjau & Tipe Kolom**: Menampilkan 10 baris pertama secara semantik dengan sanitasi karakter formula injection (`=`, `+`, `-`, `@`).
- **Step 4: Pemilih Variabel**: Memilih $Y$ (wajib numerik kontinu) dan $X$ (minimal 1). Menampilkan badge otomatis **SLR** ($k=1$) vs **MLR** ($k \ge 2$).
- **Step 5: Time Series & Konfigurasi**: Pertanyaan eksplisit "Apakah data ini time series?" (Ya/Tidak), kolom waktu, frekuensi, level signifikansi $\alpha$, dan missing data policy.
- **Step 6: Ringkasan Validasi**: Analisis kecukupan sampel menurut Green (1991) ($n \ge 50+8k$ untuk model, $n \ge 104+k$ untuk prediktor), pesan error blocking vs warning non-blocking.
- **Responsivitas**: Desain desktop 3 kolom (stepper di kiri, konten di tengah, live summary di kanan) dan mobile adaptif (stepper ringkas, font input $\ge 16\text{px}$, touch target $\ge 44\text{px}$, tanpa horizontal overflow).

---

## 5. Hasil Verifikasi & Kelulusan Uji

1. **Test Suite Vitest (26 Tests Passed 100%)**:
   - `tests/regression/ced-behavior.test.ts`: **PASS** (Perilaku menu CED, 18 indikator, skor total, dan ambang pengungkapan 100% identik).
   - `tests/integration/rls-two-users.test.ts`: **PASS** (Isolasi tenant Pengguna A vs Pengguna B dan sifat append-only `analysis_events` teruji).
   - `tests/unit/validation.test.ts`: **PASS** (Invarian I1, I2, I4, I5, I6, Green 1991, dan deteksi kolom konstan terbukti).
   - `tests/unit/file-signature.test.ts`: **PASS** (Magic bytes OOXML, CFBF, plaintext CSV, penolakan `.xlsm`, dan netralisasi formula injection).
   - `tests/unit/google-sheets.test.ts`: **PASS** (Allowlist host, proteksi SSRF, dan URL parser terverifikasi).
2. **Next.js Production Build**:
   - `next build`: **LULUS** (Semua 12 route terkompilasi tanpa error).

---

## 6. Cara Menjalankan Pengujian Lokal

```bash
# 1. Menjalankan seluruh test suite unit, integrasi, dan regresi
npx.cmd vitest run

# 2. Menjalankan build validasi Next.js
npm.cmd run build

# 3. Menjalankan server lokal
npx.cmd next dev -p 3000
```

---

## 7. Hal yang Perlu Diketahui untuk Tahap 2

1. **Mesin Estimasi OLS Ganda**: Tahap 2 akan memanggil mesin komputasi numerik Python menggunakan `statsmodels.api.OLS` sebagai mesin utama dan `numpy.linalg.lstsq` (SVD) sebagai pembanding verifikasi independen (selisih relatif koefisien maksimal $10^{-8}$).
2. **Uji Asumsi Klasik Komprehensif**:
   - Normalitas: Shapiro-Wilk ($n \le 50$) dan Lilliefors ($n > 50$).
   - Linearitas: Ramsey RESET dan Scatterplot Residu vs Fit.
   - Homoskedastisitas: Breusch-Pagan versi Koenker dan Uji Glejser.
   - Multikolinearitas: Nilai Tolerance, VIF, dan Collinearity Diagnostics (Belsley condition index).
   - Outlier: Studentized deleted residual ($|t| > 3$) dan Cook's D ($> 4/n$).
   - Time Series: ADF, KPSS, Breusch-Godfrey, Ljung-Box, ARCH-LM.
3. **9 Tabel Semantik Gaya SPSS**: Format tabel HTML semantik dengan garis horizontal khas SPSS tanpa garis vertikal.
4. **Skor Kesesuaian (S1, S2, S3)**: Menguji kesesuaian numerik terhadap dataset benchmark NIST StRD dan fixture acuan R/PSPP.
