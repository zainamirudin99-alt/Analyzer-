# TODO WORKFLOW — Regresi Data Panel

> **Navigasi Dokumen**:
> - [SOURCE_OF_TRUTH.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/SOURCE_OF_TRUTH.md)
> - [ARCHITECTURE_ROADMAP.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/ARCHITECTURE_ROADMAP.md)
> - [TODO_WORKFLOW.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/TODO_WORKFLOW.md) (Dokumen ini)

---

## 1. Rencana Fase Kerja (Roadmap Implementasi)

Implementasi dibagi menjadi 5 fase berurutan tanpa penulisan kode spekulatif. Setiap fase wajib lulus kriteria verifikasi numerik sebelum melangkah ke fase berikutnya:

```
[ Fase 0: Fixtures & Ground Truth ]
               |
               v
[ Fase 1: Core Engine Panel (CEM, FEM, REM) ]
               |
               v
[ Fase 2: Diagnostik & Pemilihan Model (Chow, Hausman, LM) ]
               |
               v
[ Fase 3: Cluster SE, Remedial & Teks Interpretasi ]
               |
               v
[ Fase 4: Antarmuka Stata-Grade & Ekspor Laporan ]
```

---

## 2. Rincian Pekerjaan Tiap Fase

### Fase P0: Navigasi Samping (Drawer Sidebar)
- [x] Membangun komponen `NavigationDrawer.tsx` dengan struktur: Pengaturan & Database, Analyze SR (collapsible: Upload, Hasil, Panduan), Analisis Regresi, dan Regresi Data Panel Stata (cangkang kosong).
- [x] Menambahkan tombol hamburger toggle di `Header.tsx` dengan `aria-expanded` dan `aria-controls="app-navigation-drawer"`.
- [x] Menghubungkan state `isDrawerOpen` di `src/app/page.tsx` dengan keyboard trap `Esc` dan click-outside backdrop overlay.
- [x] Menambahkan style CSS di `src/app/globals.css` (animasi slide, backdrop blur, tema hijau tua aktif).
- [x] Menulis unit test di `tests/unit/navigation-drawer.test.ts` untuk memverifikasi buka/tutup, Esc, backdrop click, auto-expand, dan integrasi rute.
- [x] Mempertahankan bilah tab atas berdampingan hingga drawer lulus verifikasi desktop dan mobile.
- **Bukti Verifikasi Fase P0**: Build dan lint sukses, menu lama membuka halaman identik, navigasi drawer berfungsi mulus di desktop & mobile.

---

### Fase 0: Persiapan Fondasi & Golden Test Fixtures
- [x] Menyimpan dataset publik **Grunfeld (1958)** ($N=10, T=20, NT=200$) dalam format JSON fixture di `tests/fixtures/panel/grunfeld.json`.
- [x] Menyimpan dataset publik **EmplUK (Arellano-Bond 1991)** (panel tidak seimbang) di `tests/fixtures/panel/empluk.json`.
- [x] Menyiapkan skrip acuan verifikasi di `python_engine/benchmark_panel.py` untuk mengekstrak output `linearmodels` dan Stata menjadi golden baseline JSON (`tests/fixtures/panel/stata_grunfeld_expected.json`).
- [x] Mendefinisikan tipe TypeScript lengkap untuk struktur data panel di `src/lib/panel-types.ts` (entitas, waktu, matriks variabel, hasil estimasi, tabel diagnostik, blok Stata).
- **Bukti Verifikasi Fase 0**: Berkas golden baseline JSON tersedia lengkap dengan presisi hingga 8 angka di belakang koma.

---

### Fase 1: Mesin Estimasi Dasar (CEM, FEM, REM)
- [x] Membangun fungsi deklarasi panel (`xtset` validator) di `src/lib/panel-engine.ts` yang mendeteksi $N$, $T$, keseimbangan panel, gap waktu, dan memvalidasi keunikan kunci `(id, year)` (Invarian I10).
- [x] Mengimplementasikan estimasi **Common Effect Model (CEM / Pooled OLS)** dengan SVD/QR decomposition dari `src/lib/regression-engine.ts`.
- [x] Mengimplementasikan estimasi **Fixed Effects Model (FEM / Within Estimator)**:
  - Transformasi terpusat (demeaning per entitas).
  - Derajat bebas residu Stata: $df_r = NT - n - K$.
  - Intersep konstanta Stata: $\hat{\beta}_0 = \bar{y} - \sum \hat{\beta}_k \bar{X}_k$.
  - Perhitungan $R^2$ within, between, dan overall mengikuti rumus Stata.
- [x] Mengimplementasikan estimasi **Random Effects Model (REM / Swamy-Arora GLS)**:
  - Estimasi varians komponen galat $\sigma_e^2$ (dari residual FE) dan $\sigma_u^2$ (dari residual between).
  - Transformasi quasi-demeaning dengan bobot $\theta_i$.
  - Estimasi OLS pada data terbobot untuk menghasilkan parameter GLS.
- **Bukti Verifikasi Fase 1**: Selisih nilai koefisien $\hat{\beta}$, standar error, $t$/$z$, dan $p$-value model CEM, FEM, dan REM pada dataset Grunfeld terhadap output resmi Stata $\le 10^{-6}$ (0.000001).

---

### Fase 2: Uji Diagnostik Pemilihan Model & Asumsi Klasik
- [x] Mengimplementasikan **Uji Chow (F-Test)**:
  - Membandingkan $SSE$ dari model Pooled OLS (restricted) terhadap $SSE$ Fixed Effects (unrestricted).
  - Menghitung $F(n-1, NT-n-K)$ dan $p$-value distribusi F.
- [x] Mengimplementasikan **Uji Hausman Klasik & Mundlak CRE**:
  - Hausman klasik: $\chi^2(K) = (\hat{\beta}_{FE} - \hat{\beta}_{RE})' (\hat{V}_{FE} - \hat{V}_{RE})^{-1} (\hat{\beta}_{FE} - \hat{\beta}_{RE})$.
  - Mundlak Correlated Random Effects (CRE): auxiliary regression dengan variabel rata-rata entitas $\bar{X}_i$ dan uji Wald robust $\chi^2(K)$ (solusi chi2 negatif dan kompatibel dengan robust SE).
- [x] Mengimplementasikan **Uji Breusch-Pagan LM (`xttest0`)**:
  - Menghitung statistik Lagrange Multiplier dari residu Pooled OLS untuk menguji $H_0: \sigma_u^2 = 0$.
- [x] Mengimplementasikan **Matriks Logika Pemilihan Model Otomatis**:
  - Menentukan model terpilih (CEM / FEM / REM) berdasarkan kombinasi hasil Chow, Hausman, dan LM sesuai matriks keputusan pada [SOURCE_OF_TRUTH.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/SOURCE_OF_TRUTH.md).
- [x] Mengimplementasikan **Uji Multikolinearitas (VIF)**:
  - Menghitung VIF dan Tolerance dari within-transformed data pada FEM atau OLS data pada CEM/REM.
- [x] Mengimplementasikan **Uji Heteroskedastisitas Panel (`xttest3` Greene & Breusch-Pagan)**:
  - Modified Wald test for groupwise heteroskedasticity pada Fixed Effects.
  - Breusch-Pagan / Cook-Weisberg test pada Pooled OLS.
- [x] Mengimplementasikan **Uji Autokorelasi Panel Wooldridge (`xtserial`)**:
  - Melakukan first-differencing $\Delta y$ dan $\Delta X$.
  - Meregresikan residu beda pertama $\hat{e}_{\Delta, it}$ pada lag-nya $\hat{e}_{\Delta, i, t-1}$ dengan SE ter-cluster.
  - Memvalidasi prasyarat $T \ge 3$. Jika $T < 3$, uji di-skip dengan label ramah pengguna.
- [x] Mengimplementasikan **Uji Normalitas Residual (`swilk` & `sktest`)**:
  - Shapiro-Wilk untuk $N \le 2000$.
  - D'Agostino-Pearson Skewness/Kurtosis atau Jarque-Bera untuk $N > 2000$.
- **Bukti Verifikasi Fase 2**: Nilai statistik uji Chow, Hausman, Breusch-Pagan LM, VIF, dan Wooldridge cocok persis dengan Stata 17/18 pada toleransi $10^{-6}$.

---

### Fase 3: Standard Errors Ter-Cluster, Remedial & Teks Interpretasi
- [x] Mengimplementasikan **Arellano (1987) Cluster-Robust Standard Errors**:
  - Sandwich estimator dengan pengelompokan per entitas (`vce(cluster id)`).
  - Menerapkan faktor koreksi derajat bebas Stata: $\frac{G}{G-1} \frac{NT-1}{NT-K-1}$ untuk Pooled OLS dan $\frac{G}{G-1}$ untuk FEM.
  - Derajat bebas distribusi $t$ menggunakan $G - 1$.
- [x] Menambahkan **Deteksi Small Cluster ($G < 30$)**:
  - Peringatan otomatis jika jumlah cluster $G < 30$ mengenai risiko *downward bias* standar error.
- [x] Mengimplementasikan **Logika Remedial Terkendali**:
  - Tawaran perbaikan cluster-robust SE jika heteroskedastisitas atau autokorelasi terdeteksi.
  - Pencatatan seluruh perubahan spesifikasi model secara terstruktur (maksimal 1 putaran uji ulang).
- [x] Membangun **Mesin Pembuat Teks Penjelasan Bahasa Bayi & Akademik**:
  - Generator kalimat deterministik berbasis aturan ambang $p$-value dan arah tanda koefisien (100% bebas halusinasi LLM runtime).
- **Bukti Verifikasi Fase 3**: Standar error robust pada model FEM dan REM cocok dengan output Stata `vce(cluster id)` hingga $10^{-6}$.

---

### Fase 4: Antarmuka Pengguna (UI/UX) & Integrasi Sistem
- [x] Mengintegrasikan tab navigasi baru "Regresi Data Panel" di header navigasi [src/app/page.tsx](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/app/page.tsx).
- [x] Membangun komponen **PanelStepper.tsx**:
  - Layout desktop: Stepper navigasi di kiri, lembar kerja di tengah, ringkasan di kanan.
  - Layout mobile: Stepper horizontal ringkas di atas, pemilih variabel bottom-sheet modal.
- [x] Membangun komponen **StataConsoleBlock.tsx**:
  - Menampilkan 4 blok terpisah (Kode Stata, Fungsi Kode, Output Monospace Stata, Penjelasan Bahasa Bayi) pada setiap langkah (0 s/d 12).
- [x] Membangun komponen pemetaan variabel interaktif (ID, Tahun, Dependen, Independen, Kontrol).
- [x] Mengintegrasikan modul impor link Google Sheets server-side dengan SSRF guard dan proteksi formula Excel.
- [x] Membangun generator ekspor berkas laporan Word (.docx) bergaya tabel resmi Stata via pustaka `docx`.
- [x] Menjalankan pengujian akhir *Zero-Regression* terhadap Menu Analisis CED eksisting (Invarian I7).
- **Bukti Verifikasi Fase 4**: Alur stepper 0 s/d 12 berjalan mulus tanpa error console, lolos uji viewport responsif ($360\text{px}$, $768\text{px}$, $1440\text{px}$), dan berkas Word dapat dibuka rapi di Microsoft Word.

---

## 3. Matriks Risiko & Rencana Mitigasi Teknis

| Risiko Teknis / Metodologis | Probabilitas & Dampak | Rencana Mitigasi |
|---|---|---|
| **Matriks Covariance Hausman Non-PSD** | Sedang / Tinggi | Gunakan **Mundlak Correlated Random Effects (CRE)** sebagai validator default yang selalu positif definit dan valid untuk robust SE. |
| **Ukuran Entitas Sangat Sedikit ($G < 15$)** | Sedang / Sedang | Tampilkan peringatan jelas bahwa Cluster SE mengalami bias ke bawah (*underestimated SE*) dan tawarkan perbandingan nilai SE non-robust. |
| **Data Panel Sangat Tidak Seimbang (*Heavy Unbalance*)** | Rendah / Sedang | Gunakan pembobotan unbalance harmonik Stata ($\bar{T} = \frac{n}{\sum 1/T_i}$) pada perhitungan varians komponen Swamy-Arora. |
| **Pengguna Mengunggah File Format Rumit** | Tinggi / Sedang | Sediakan pemilih sheet dan pratinjau tabel 10 baris pertama sebelum pemetaan kolom dikonfirmasi. |
| **Koneksi Google Sheets Lambat / Putus** | Sedang / Rendah | Terapkan batas waktu *abort controller* 15 detik dan instruksikan pengguna untuk mengunduh berkas .xlsx jika terjadi kegagalan jaringan. |

---

## 4. Definisi Selesai (Definition of Done - DoD) — STATUS: 100% SELESAI (COMPLETED)

Fitur "Regresi Data Panel" dinyatakan selesai dan telah memenuhi seluruh kriteria DoD:
- [x] 1. Seluruh dokumen arsitektur ([SOURCE_OF_TRUTH.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/SOURCE_OF_TRUTH.md), [ARCHITECTURE_ROADMAP.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/ARCHITECTURE_ROADMAP.md), [TODO_WORKFLOW.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/TODO_WORKFLOW.md)) saling tertaut tanpa ada tag "TBD".
- [x] 2. Seluruh 8 dugaan ekonometrika diuji dan berstatus final (`Terverifikasi` / `Dikoreksi`) pada Bab 4 [SOURCE_OF_TRUTH.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/SOURCE_OF_TRUTH.md).
- [x] 3. Seluruh koefisien matematis pada dataset benchmark Grunfeld 1958 cocok terhadap output Stata dengan toleransi $\le 10^{-6}$ (dibuktikan pada `panel-p3-estimations.test.ts` dan `panel-regression-complete.test.ts`).
- [x] 4. Tampilan 4 blok Stata (Kode, Fungsi, Output Monospace, Bahasa Bayi) tersedia lengkap pada langkah 0 s/d 12 (dibuktikan pada `panel-p6-export-and-blocks.test.ts`).
- [x] 5. Invarian I1 sampai I12 ditegakkan tanpa melanggar fungsionalitas menu CED eksisting (Invarian I7 Zero-Regression dibuktikan pada `ced-behavior.test.ts` dan `panel-regression-complete.test.ts`).
- [x] 6. Seluruh 33 berkas uji Vitest (181 tes) lulus 100%, kompilasi TypeScript `tsc --noEmit` lolos 0 error, dan `next build` berhasil menghasilkan bundel produksi.
