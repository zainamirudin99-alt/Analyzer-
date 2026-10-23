# ARCHITECTURE & ROADMAP — Regresi Data Panel

> **Navigasi Dokumen**:
> - [SOURCE_OF_TRUTH.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/SOURCE_OF_TRUTH.md)
> - [ARCHITECTURE_ROADMAP.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/ARCHITECTURE_ROADMAP.md) (Dokumen ini)
> - [TODO_WORKFLOW.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/TODO_WORKFLOW.md)

---

## 1. Mini-ADR: Lokasi Mesin Statistik (Hasil Sidang Council)

### A. Konteks Masalah
Aplikasi berjalan pada infrastruktur gratis Vercel (Hobby) dan Supabase (Free Tier). Diperlukan mesin komputasi untuk regresi panel (CEM, FEM, REM, Chow, Hausman, Mundlak, Breusch-Pagan LM, Wooldridge serial test, Greene groupwise heteroskedasticity, dan cluster-robust standard errors) yang menghasilkan output dengan presisi identik terhadap Stata, biaya $0, tanpa cold start yang mengganggu, dan tidak melanggar batasan platform.

### B. Sidang Empat Perspektif Council

```
+---------------------------------------------------------------------------------+
|                                 DEWAN ARSITEKTUR                                |
+---------------------------------------------------------------------------------+
| 1. Pelaksana Pragmatis  : Manfaatkan apa yang terbukti jalan di repo ini.      |
|                           TypeScript engine sudah berjalan di OLS, zero bundle  |
|                           overhead, zero cold start.                            |
| 2. Prinsip Pertama      : Panel OLS adalah demeaning + SVD. Tidak ada sihir    |
|                           di Stata. Kita dapat menghitung demeaning & sandwich  |
|                           secara eksak jika derajat bebas dicocokkan ke Stata.  |
| 3. Arsitek Jangka Panjang: Arsitektur 2 lapis: TypeScript engine di Next.js     |
|                           App Router untuk produksi real-time, dan Python       |
|                           offline test suite untuk memvalidasi golden fixtures. |
| 4. Adversary            : Waspadai ill-conditioned matrix & beda rumus degrees  |
|                           of freedom Stata. Setiap sel output wajib lulus       |
|                           benchmark vs Stata/R/linearmodels toleransi 1e-6.     |
+---------------------------------------------------------------------------------+
```

### C. Evaluasi 4 Opsi

| Opsi Arsitektur | Kelebihan | Kelemahan Fatal / Kendala Nyata | Status |
|---|---|---|---|
| **(a) Fungsi Python di Vercel Serverless** | Menggunakan pustaka matang (`linearmodels`, `statsmodels`). | 1. Ukuran bundel uncompressed `scipy`+`statsmodels`+`pandas` mencapai 360–450 MB (sangat mepet limit Vercel 500 MB). <br>2. Menimbulkan tabrakan rute Vercel (`/api` Python membajak App Router Next.js, fakta ini terdokumentasi di `python_engine/README.md`). <br>3. Cold start 3–5 detik. | **Ditolak sebagai runtime utama** |
| **(b) Pyodide di Browser (WebAssembly)** | Komputasi di sisi klien, server $0, privasi data aman di browser. | 1. Pustaka `linearmodels` tidak tersedia dalam pre-built wheel bawaan Pyodide (instalasi via micropip berisiko gagal build C/Cython). <br>2. Unduhan awal WebAssembly 25–35 MB sangat lambat pada koneksi seluler/mobile. | **Ditolak** |
| **(c) Layanan Python Terpisah (Render/Fly.io Free)** | Lingkungan Python mandiri tanpa batas bundel Vercel. | 1. Server gratis tidur (*sleep*) setelah 15 menit tidak aktif. Waktu bangun (*cold start spin-up*) memakan 50–90 detik! <br>2. Memerlukan pemeliharaan 2 infrastruktur berbeda. | **Ditolak** |
| **(d) Native TypeScript Engine + Python Fixture Validator** | 1. Kinerja seketika (< 30 ms), cold start 0 detik. <br>2. Bundel 0 MB tambahan di server Vercel. <br>3. Mengembangkan fondasi `src/lib/regression-engine.ts` yang sudah ada. <br>4. Lulus uji presisi $10^{-6}$ terhadap golden dataset Stata/linearmodels. | Memerlukan implementasi algoritma quasi-demeaning GLS dan uji Wooldridge secara teliti di TypeScript. | **DIPILIH & DISETUJUI** |

### D. Keputusan Akhir (ADR Decision)
1. **Mesin Produksi**: Dibangun secara native dalam TypeScript pada [src/lib/panel-engine.ts](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/lib/panel-engine.ts) yang diakses via API Route Next.js App Router (`src/app/api/panel/*`).
2. **Validasi Kualitas (Quality Gate)**: Dibuat harness verifikasi offline berbasis Python di `python_engine/benchmark_panel.py` untuk menguji output Grunfeld & EmplUK terhadap `linearmodels` dan Stata dengan batas toleransi numerik $10^{-6}$.

---

## 2. Modul Impor & Sanitasi Data

```
[ Pengguna ] -> Unggah .xlsx / .csv / Google Sheets Link
                     |
                     v
   +------------------------------------+
   |   Next.js API Route (/api/panel)   |
   +------------------------------------+
   | 1. SSRF Guard (Google Sheets)      | -> Hanya host docs/drive.google.com, port 443
   | 2. File Size & Magic Bytes Check   | -> Maks 10 MB, periksa signature ZIP/CSV
   | 3. Formula Injection Neutralization| -> Sel berawalan '=', '+', '-', '@' dinetralkan
   | 4. Sheet Selector (bila .xlsx)     | -> Tampilkan daftar tab sheet untuk dipilih
   +------------------------------------+
                     |
                     v
   [ Data Matrix Ter-Sanitasi di Memori Sesi ]
```

### A. Pola Google Sheets Terverifikasi
- Format ekspor langsung:
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`
- Hasil pengujian nyata pada sistem: Mengembalikan HTTP `200 OK` dengan redirection valid ke server CDN Google Sheets.
- Sheet privat (memerlukan OAuth) ditolak dengan pesan panduan ramah pengguna agar mengubah izin sheet menjadi "Siapa saja dengan link" atau mengunduh manual.

---

## 3. Alur Pengguna (Langkah 0 s/d 12) & 4 Blok Tampilan Wajib

Setiap langkah dalam aplikasi menyajikan 4 blok terstruktur:
1. **Kode Stata**: Perintah sintaks resmi Stata.
2. **Fungsi Kode**: Penjelasan fungsi metodologis dari perintah tersebut.
3. **Output Gaya Stata**: Tampilan antarmuka monospace presisi dengan header, garis pembatas horizontal, dan urutan kolom Stata asli.
4. **Penjelasan Bahasa Bayi**: Kalimat pendek, analogi sehari-hari, tanpa jargon, deterministik berbasis aturan p-value (tanpa LLM saat runtime).

---

### Langkah 0: Pilih Jenis Analisis & Deteksi Struktur Data
- **(1) Kode Stata**:
  `* Penentuan struktur data: cross-section, time-series, atau panel`
- **(2) Fungsi Kode**:
  Mengidentifikasi dimensi data untuk memilih estimator ekonometrika yang tepat.
- **(3) Output Gaya Stata**:
  ```text
  Data Structure Detection:
    Entity Identifier  : [company] (10 units detected)
    Time Identifier    : [year] (20 periods detected: 1935 to 1954)
    Structure Type     : Panel Data (N > 1 and T > 1)
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Data ini seperti buku rapor 10 siswa yang dicatat nilainya tiap tahun selama 20 tahun berturut-turut. Karena ada banyak siswa dan banyak tahun, kita pakai metode Regresi Data Panel."

---

### Langkah 1: Impor Data
- **(1) Kode Stata**:
  `import excel "dataset.xlsx", sheet("Sheet1") firstrow clear`
- **(2) Fungsi Kode**:
  Membaca berkas spreadsheet, mengambil baris pertama sebagai nama variabel, dan membersihkan memori data sebelumnya.
- **(3) Output Gaya Stata**:
  ```text
  (3 vars, 200 obs loaded)
  File source: dataset.xlsx
  Format     : Excel workbook (.xlsx)
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Komputer membuka berkas Excelmu dan menyalin seluruh angka-angkanya ke meja kerja agar siap dihitung."

---

### Langkah 2: Pilih Sheet (Bila Multi-Sheet)
- **(1) Kode Stata**:
  `import excel "dataset.xlsx", describe`  
  `import excel "dataset.xlsx", sheet("Investasi_Firma") firstrow clear`
- **(2) Fungsi Kode**:
  Melihat daftar lembar kerja dalam berkas Excel dan memuat lembar kerja yang dipilih pengguna.
- **(3) Output Gaya Stata**:
  ```text
  Sheets in dataset.xlsx:
    1. Investasi_Firma (200 rows, 5 cols)  <-- Selected
    2. Data_Makro      (20 rows, 4 cols)
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Buku Excelmu punya beberapa lembar halaman. Kamu memilih lembar 'Investasi_Firma' untuk diperiksa."

---

### Langkah 3: Petakan Kolom
- **(1) Kode Stata**:
  `rename var1 company`  
  `rename var2 year`  
  `rename var3 invest`  
  `rename var4 mvalue`  
  `rename var5 kstock`
- **(2) Fungsi Kode**:
  Menetapkan peran masing-masing kolom: Entitas/ID, Waktu/Tahun, Dependen ($Y$), Independen ($X$), dan Kontrol.
- **(3) Output Gaya Stata**:
  ```text
  Variable Role Mapping:
    Entity (ID)        : company (String -> auto-encoded to Long)
    Time Variable (t)  : year (Integer)
    Dependent (Y)      : invest (Continuous Numeric)
    Independent (X1)   : mvalue (Continuous Numeric)
    Independent (X2)   : kstock (Continuous Numeric)
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Kita memberi label nama kartu: siapa siswanya, tahun berapa nilainya, apa target yang mau ditebak, dan apa petunjuk yang dipakai menebak."

---

### Langkah 4: Cek & Pembersihan Data
- **(1) Kode Stata**:
  `duplicates report company year`  
  `misstable summarize invest mvalue kstock`  
  `encode company, generate(id_num)`  
  `winsor2 invest, cuts(1 99) replace`
- **(2) Fungsi Kode**:
  Mendeteksi baris kembar, menghitung sel kosong, mengubah nama teks entitas jadi nomor unik, dan menjinakkan angka ekstrem (*outlier*).
- **(3) Output Gaya Stata**:
  ```text
  Duplicates in terms of company year:
  --------------------------------------
     copies | observations       surplus
  ----------+---------------------------
          1 |          200             0
  --------------------------------------
  Missing values summary: None (0 rows dropped, N = 200)
  Panel balance         : Strongly balanced (all entities have T = 20)
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Kita mengecek apakah ada absensi yang tercatat dua kali, membersihkan baris yang bolong, dan memastikan semua angka rapi sebelum dihitung."

---

### Langkah 5: Statistik Deskriptif (`xtsum`)
- **(1) Kode Stata**:
  `xtsum invest mvalue kstock`
- **(2) Fungsi Kode**:
  Menguraikan rata-rata dan penyebaran angka menjadi tiga dimensi: keseluruhan (*overall*), perbedaan antar entitas (*between*), dan fluktuasi waktu di dalam entitas (*within*).
- **(3) Output Gaya Stata**:
  ```text
  Variable         |      Mean   Std. dev.       Min        Max |    Observations
  -----------------+--------------------------------------------+----------------
  invest   overall |  145.9583   216.8753          .9       1486 |     N =     200
           between |             166.7037    13.0645    624.4935 |     n =      10
           within  |             142.1481   -439.5348   1007.465 | T-bar =      20
  -----------------+--------------------------------------------+----------------
  mvalue   overall |  1081.681   1314.996        26.7     5530.2 |     N =     200
           between |             1190.222     157.065   3890.365 |     n =      10
           within  |             600.7303   -1049.034   2721.516 | T-bar =      20
  -----------------+--------------------------------------------+----------------
  kstock   overall |  276.0172   379.8415          .8     2226.1 |     N =     200
           between |             334.6192      10.825     1225.5 |     n =      10
           within  |             184.8142   -369.0428   1276.617 | T-bar =      20
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Tabel ini memotret rata-rata nilai siswa: ada perbedaan nilai antar teman sekelas (between), dan ada naik-turunnya nilai siswa itu sendiri dari tahun ke tahun (within)."

---

### Langkah 6: Korelasi Matriks & Spearman
- **(1) Kode Stata**:
  `spearman invest mvalue kstock, star(0.05)`  
  `pwcorr invest mvalue kstock, star(0.05) sig`
- **(2) Fungsi Kode**:
  Mengukur kekuatan hubungan searah antar variabel tanpa asumsi distribusi normal, mendeteksi potensi korelasi liar.
- **(3) Output Gaya Stata**:
  ```text
               |   invest   mvalue   kstock
  -------------+---------------------------
        invest |   1.0000
        mvalue |   0.8276*  1.0000
               |   0.0000
        kstock |   0.6225*  0.5124*  1.0000
               |   0.0000   0.0000
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Kita melihat apakah dua hal berjalan beriringan: jika modal perusahaan naik, apakah investasinya juga ikut naik?"

---

### Langkah 7: Deklarasi Struktur Panel (`xtset`)
- **(1) Kode Stata**:
  `xtset id_num year`
- **(2) Fungsi Kode**:
  Mengumumkan kepada mesin statistik bahwa data tersusun berdasarkan urutan entitas `id_num` dan urutan waktu `year`.
- **(3) Output Gaya Stata**:
  ```text
         panel variable:  id_num (strongly balanced)
          time variable:  year, 1935 to 1954
                  delta:  1 unit
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Komputer mengunci aturan main: baris data sekarang diurutkan rapi per siswa dari tahun pertama sampai tahun terakhir tanpa ada yang tertukar."

---

### Langkah 8: Estimasi 3 Model Awal (CEM, FEM, REM)
- **(1) Kode Stata**:
  `reg invest mvalue kstock` (CEM)  
  `xtreg invest mvalue kstock, fe` (FEM)  
  `xtreg invest mvalue kstock, re` (REM)
- **(2) Fungsi Kode**:
  Menjalankan ketiga pendekatan ekonometrika utama untuk menyiapkan perbandingan model.
- **(3) Output Gaya Stata (Kutipan FEM)**:
  ```text
  Fixed-effects (within) regression               Number of obs     =        200
  Group variable: id_num                          Number of groups  =         10
  R-squared:                                      Obs per group:
       within  = 0.7668                                     min =         20
       between = 0.8194                                     avg =       20.0
       overall = 0.8060                                     max =         20
  corr(u_i, Xb) = -0.1517                         F(2, 188)         =     309.01
                                                  Prob > F          =     0.0000
  ------------------------------------------------------------------------------
        invest | Coefficient  Std. err.      t    P>|t|     [95% conf. interval]
  -------------+----------------------------------------------------------------
        mvalue |   .1101238   .0118567     9.29   0.000     .0867258    .1335218
        kstock |   .3100653   .0173545    17.87   0.000     .2758189    .3443118
         _cons |  -58.74393   12.45369    -4.72   0.000    -83.31835   -34.16951
  -------------+----------------------------------------------------------------
       sigma_u |   85.73347
       sigma_e |   52.76791
           rho |  .72524979   (fraction of variance due to u_i)
  ------------------------------------------------------------------------------
  F test that all u_i=0: F(9, 188) = 49.18                     Prob > F = 0.0000
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Komputer menghitung tiga jenis kacamata: kacamata sama-rata (CEM), kacamata tiap siswa punya sifat unik yang melekat (FEM), dan kacamata sifat unik siswa itu terjadi acak (REM)."

---

### Langkah 9: Uji Pemilihan Model (Chow + Hausman/Mundlak + Breusch-Pagan LM)
- **(1) Kode Stata**:
  `* 1. Uji Chow (diambil dari output F-test FEM)`  
  `quietly xtreg invest mvalue kstock, fe`  
  `* 2. Uji Hausman`  
  `estimates store fe_model`  
  `quietly xtreg invest mvalue kstock, re`  
  `estimates store re_model`  
  `hausman fe_model re_model`  
  `* 3. Uji Breusch-Pagan LM`  
  `xttest0`
- **(2) Fungsi Kode**:
  Menyaring model mana yang paling valid secara teori ekonometrika melalui 3 pengujian formal bertahap.
- **(3) Output Gaya Stata**:
  ```text
  Test 1: Chow Test (Pooled OLS vs Fixed Effects)
    F(9, 188) = 49.18 | Prob > F = 0.0000 --> FEM preferred over CEM (p < 0.05)

  Test 2: Hausman Specification Test (Fixed vs Random Effects)
                 ---- Coefficients ----
                 (b)          (B)            (b-B)     sqrt(diag(V_b-V_B))
                  fe           re         Difference       S.E.
        mvalue |  .1101238     .1097812     .0003426        .0055112
        kstock |  .3100653      .308113     .0019523        .0024479
    chi2(2) = (b-B)'[(V_b-V_B)^(-1)](b-B) = 2.33 | Prob > chi2 = 0.3118
    --> REM preferred over FEM (p >= 0.05)

  Test 3: Breusch and Pagan Lagrangian Multiplier Test (Pooled OLS vs Random Effects)
    chibar2(01) = 798.16 | Prob > chibar2 = 0.0000 --> REM preferred over CEM (p < 0.05)
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Tiga juri bersidang: Juri 1 bilang kacamata FEM lebih bagus dari CEM. Juri 2 bilang kacamata REM lebih pas dibanding FEM. Juri 3 setuju kacamata REM jauh lebih baik dari CEM. Maka pemenangnya adalah REM."

---

### Langkah 10: Model Terpilih
- **(1) Kode Stata**:
  `* Model Terpilih Berdasarkan Matriks Keputusan: Random Effects (REM)`  
  `xtreg invest mvalue kstock, re`
- **(2) Fungsi Kode**:
  Menampilkan estimasi resmi dari model yang dinyatakan menang dalam pengujian diagnostik.
- **(3) Output Gaya Stata**:
  ```text
  Selected Model Specification: Random-effects GLS regression
  Coefficients and Inference:
  ------------------------------------------------------------------------------
        invest | Coefficient  Std. err.      z    P>|z|     [95% conf. interval]
  -------------+----------------------------------------------------------------
        mvalue |   .1097812   .0104928    10.46   0.000     .0892157    .1303468
        kstock |   .3081130   .0171804    17.93   0.000     .2744401    .3417859
         _cons |  -57.83441   28.89893    -2.00   0.045    -114.4753   -1.193554
  ------------------------------------------------------------------------------
  Wald chi2(2) = 689.70 | Prob > chi2 = 0.0000 | R-sq within = 0.7668
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Ini hasil akhir dari model juara: jika nilai pasar naik 1 poin, investasi perusahaan naik 0,11 poin dengan tingkat keyakinan sangat tinggi."

---

### Langkah 11: Uji Asumsi Klasik Model Terpilih + Perbaikan
- **(1) Kode Stata**:
  `* 1. Multikolinearitas`  
  `quietly reg invest mvalue kstock`  
  `estat vif`  
  `* 2. Heteroskedastisitas (Modified Wald untuk FE / Breusch-Pagan)`  
  `xttest3`  
  `* 3. Autokorelasi Panel Wooldridge`  
  `xtserial invest mvalue kstock`  
  `* 4. Normalitas Residu`  
  `predict e, residual`  
  `swilk e`
- **(2) Fungsi Kode**:
  Memeriksa apakah data melanggar asumsi dasar statistik (bebas korelasi antar prediktor, varians konstan, bebas autokorelasi, galat normal).
- **(3) Output Gaya Stata**:
  ```text
  1. Multicollinearity: Mean VIF = 1.42 (Max VIF = 1.42 < 10.0) -> PASS
  2. Groupwise Heteroskedasticity (xttest3): chi2(10) = 485.45 | Prob > chi2 = 0.0000 -> FAIL
  3. Wooldridge Autocorrelation (xtserial): F(1, 9) = 13.974 | Prob > F = 0.0046 -> FAIL
  4. Residual Normality (swilk): z = 1.841 | Prob > z = 0.03281 -> FAIL (CLT protects N=200)

  Remedial Action Applied:
    -> Cluster-Robust Standard Errors per Entity (vce(cluster id_num))
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Data kita dicek kesehatannya: tidak ada variabel kembar, tapi ada gejala 'demam' (varians tidak merata dan ada korelasi antar tahun). Komputer memberikan obat resep khusus bernama Cluster-Robust SE agar hasil tetap jujur dan tidak bias."

---

### Langkah 12: Model Akhir & Pelaporan
- **(1) Kode Stata**:
  `xtreg invest mvalue kstock, re vce(cluster id_num)`
- **(2) Fungsi Kode**:
  Menyajikan model final yang telah diperbaiki menggunakan standar error yang kebal terhadap heteroskedastisitas dan autokorelasi.
- **(3) Output Gaya Stata**:
  ```text
  Random-effects GLS regression                   Number of obs     =        200
  Group variable: id_num                          Number of groups  =         10
  R-squared:                                      Obs per group:
       within  = 0.7668                                     min =         20
       between = 0.8194                                     avg =       20.0
       overall = 0.8060                                     max =         20
                                                  Wald chi2(2)      =     324.18
  corr(u_i, X)   = 0 (assumed)                    Prob > chi2       =     0.0000
                                (Std. err. adjusted for 10 clusters in id_num)
  ------------------------------------------------------------------------------
               |               Robust
        invest | Coefficient  Std. err.      z    P>|z|     [95% conf. interval]
  -------------+----------------------------------------------------------------
        mvalue |   .1097812   .0152418     7.20   0.000     .0799078    .1396546
        kstock |   .3081130   .0264192    11.66   0.000     .2563323    .3598937
         _cons |  -57.83441   34.21884    -1.69   0.091    -124.9021    9.233284
  ------------------------------------------------------------------------------
  Small Cluster Warning: Number of clusters (G = 10) < 30.
  Cluster-robust standard errors may be downward biased. Wild bootstrap recommended.
  ```
- **(4) Penjelasan Bahasa Bayi**:
  "Ini hasil final yang siap dicetak di skripsi atau laporanmu. Karena perusahaannya cuma 10, kita beri catatan kecil bahwa perhitungan ini sudah dipasangi pelindung ekstra agar hasilnya kuat dipertahankan."

---

## 4. Mekanisme Pembersihan Data Terstruktur

Semua pembersihan data dijalankan atas persetujuan pengguna (*opt-in*) dan dicatat dalam log sintaks Stata:

| Masalah Data | Deteksi Mesin | Usulan Solusi Otomatis | Sintaks Kode Stata |
|---|---|---|---|
| **Duplikat Kunci** | Cek pasangan `(id, year)` identik | Hapus baris duplikat persis atau agregasikan rata-rata | `duplicates drop id year, force` |
| **Missing Values** | Nilai `null`, `NaN`, atau kosong | Default: Listwise deletion (buang baris yang tidak lengkap) | `drop if missing(invest, mvalue, kstock)` |
| **Panel Unbalanced / Gap** | Ada entitas dengan $T_i < T_{max}$ atau tahun terputus | Laporkan status unbalanced; hitung harmonisasi $T$-bar Stata | `xtdescribe` |
| **Outlier Ekstrem** | Residu terstandardisasi $> 3$ atau Cook's $D > 4/n$ | Usulkan winsorizing persentil 1% dan 99% | `winsor2 varname, cuts(1 99) replace` |
| **Kemencengan (Skewness)** | Skewness $> 2.0$ dan semua nilai $> 0$ | Usulkan transformasi natural log ($\ln X$) | `generate ln_x = ln(x)` |
| **Variabel Konstan** | Standar deviasi within $s_W = 0$ | Peringatan: variabel akan didrop oleh model FE | `* Dropped due to collinearity with fixed effects` |
| **ID Teks Non-Numerik** | Tipe string pada kolom entitas | Encode string menjadi nilai integer terindeks | `encode company_name, generate(id_num)` |
| **Ukuran Sampel Kecil** | $N < 2$, $T < 2$, atau $T < 3$ | Peringatkan batas metodologis pengujian panel | `* Error: Dimension insufficient for panel estimation` |

---

## 5. Jalur Gagal Tiap Komponen & Tampilan Pesan Error di UI

| Komponen / Titik Gagal | Kondisi Pemicu | Respon Mesin Server | Tampilan Pesan di Antarmuka Pengguna (UI) |
|---|---|---|---|
| **Matriks Singular / Kolinear** | Rank matriks $X'X < K$ atau $VIF = \infty$ | HTTP 422: `MATRIX_RANK_DEFICIENT` | **Modal Merah**: "Variabel [X1] dan [X2] memiliki hubungan kolinearitas sempurna (identik). Silakan hapus salah satu variabel dari daftar prediktor." |
| **Periode Waktu $T < 3$** | Periode waktu pada data hanya 2 tahun ($T=2$) | Skip `xtserial`: `AUTOCORR_T_TOO_SHORT` | **Callout Amber**: "Uji autokorelasi Wooldridge membutuhkan minimal 3 periode waktu ($T \ge 3$) untuk perhitungan first-difference. Langkah ini dilewati secara aman." |
| **Duplikasi Entitas dan Waktu** | Pasangan ID dan Tahun muncul lebih dari 1 kali | HTTP 400: `DUPLICATE_PANEL_KEY` | **Banner Peringatan**: "Ditemukan [k] baris dengan ID dan Tahun yang sama persis. Deklarasi panel (`xtset`) diblokir sebelum duplikat dibersihkan." |
| **Kolom ID Berupa Teks** | Pengguna memetakan kolom kode/nama emiten string | Auto-encode di memori | **Badge Info**: "Kolom [Kode Emiten] berupa teks dan otomatis di-encode menjadi ID numerik 1 s/d N mengikuti perintah Stata `encode`." |
| **Timeout Impor Google Sheets** | Google Sheets tidak merespon dalam 15 detik | HTTP 504: `FETCH_TIMEOUT` | **Toast Merah**: "Gagal mengunduh spreadsheet dari Google (Waktu habis 15 detik). Silakan unduh sebagai file .xlsx dan unggah langsung melalui tombol Unggah File." |
| **Ukuran Berkas Melebihi Batas** | Ukuran file unggah $> 10$ MB | HTTP 413: `FILE_TOO_LARGE` | **Toast Merah**: "Ukuran file ([x] MB) melebihi batas maksimal 10 MB. Harap kurangi baris/kolom yang tidak diperlukan." |
| **Nilai Dependen Bukan Kontinu** | Kolom $Y$ bernilai biner (0/1) atau teks | HTTP 400: `INVALID_DEPENDENT_TYPE` | **Modal Merah**: "Variabel dependen harus berupa angka kontinu. Data terdeteksi berupa biner/kategori. Untuk model biner gunakan regresi logistik panel." |

---

## 6. Arsitektur Drawer Navigasi Samping (P0 Roadmap)

```
[ AppHeader ]
   |
   +--> [ Tombol Toggle Hamburger ] (aria-expanded, aria-controls="app-navigation-drawer")
   |
   +--> [ NavigationDrawer (Slide-in dari kiri) ]
           |
           +--> 1. Pengaturan & Database (settings)
           +--> 2. Analyze SR (Collapsible Group)
           |       |-- Upload & Analisis (upload)
           |       |-- Tabel Hasil Analisis (results)
           |       \-- Panduan 18 Indikator (guide)
           +--> 3. Analisis Regresi Statistik (regression)
           \--> 4. Regresi Data Panel Stata (panel)
```

Perilaku Interaksi:
- Keyboard `Escape`: Menutup drawer dan memindahkan fokus kembali ke tombol toggle.
- Backdrop Click: Menutup drawer secara instan.
- Auto-expand Analyze SR: Jika `activeTab` berada di `upload`, `results`, atau `guide`, grup Analyze SR otomatis terbuka.
- Bilah tab lama dipertahankan berdampingan hingga seluruh alur drawer lulus verifikasi desktop dan mobile.

