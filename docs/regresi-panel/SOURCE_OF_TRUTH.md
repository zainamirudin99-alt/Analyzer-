# SOURCE OF TRUTH — Regresi Data Panel

> **Navigasi Dokumen**:
> - [SOURCE_OF_TRUTH.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/SOURCE_OF_TRUTH.md) (Dokumen ini)
> - [ARCHITECTURE_ROADMAP.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/ARCHITECTURE_ROADMAP.md)
> - [TODO_WORKFLOW.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/docs/regresi-panel/TODO_WORKFLOW.md)

---

## 1. Fakta Repositori & Lingkungan Riil

Pemeriksaan langsung pada repositori lokal:

| Komponen | Status / Versi Nyata | Path / Catatan |
|---|---|---|
| **Framework Web** | Next.js `14.2.25` (App Router) | [package.json](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/package.json) |
| **UI Library** | React `18.3.1`, React DOM `18.3.1` | Vanilla CSS tanpa TailwindCSS |
| **Bahasa Utama** | TypeScript `5.7.3` | [tsconfig.json](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/tsconfig.json) |
| **Node.js Host** | `v24.19.0` (Lokal Windows) | Terverifikasi via `node -v` |
| **Python Host** | Tidak terpasang di PATH Windows | `python --version` mengarah ke Microsoft Store shortcut |
| **Supabase Client** | `@supabase/supabase-js` `^2.48.1` | [src/lib/supabase.ts](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/lib/supabase.ts) |
| **Spreadsheet Parser** | `xlsx` `^0.18.5` | Parsing sheet .xlsx & .csv |
| **Mesin Statistik Eksisting** | TypeScript Native Engine | [src/lib/regression-engine.ts](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/src/lib/regression-engine.ts) |
| **Status Python Serverless** | Diarsipkan ke `python_engine/` | Dipindahkan dari `/api` untuk mencegah tabrakan rute Vercel |

---

## 2. Batasan Platform Resmi (Vercel & Supabase Free Tier)

Diperoleh dari dokumentasi resmi per tanggal verifikasi (tanpa estimasi atau halusinasi):

### A. Vercel Functions (Hobby / Free Plan)
- **Batas Ukuran Bundel Uncompressed**: **500 MB** ([Dokumentasi Resmi Vercel](https://vercel.com/docs/functions/limitations)).
- **Batas Durasi Eksekusi (`maxDuration`)**: Default **300 detik** (5 menit), batas maksimal tetap **300 detik** pada Hobby plan (tidak dapat ditingkatkan ke 800s/1800s seperti akun Pro) ([Dokumentasi Resmi Vercel](https://vercel.com/docs/functions/limitations)).
- **Memori & vCPU**: Tetap pada **2 GB Memory / 1 vCPU** ([Dokumentasi Runtime Python Vercel](https://vercel.com/docs/functions/runtimes/python)).
- **Scratch Space Disk**: Direktori `/tmp` dapat ditulis hingga **500 MB** ([Dokumentasi Runtime Python Vercel](https://vercel.com/docs/functions/runtimes/python)).

### B. Supabase (Free Tier Plan)
- **Kapasitas Database PostgreSQL**: **500 MB** per proyek ([Dokumentasi Pengelolaan Kuota Supabase](https://supabase.com/docs/guides/platform/manage-your-usage)).
- **Penyimpanan Berkas (Supabase Storage)**: **1 GB** total penyimpanan ([Dokumentasi Pengelolaan Kuota Supabase](https://supabase.com/docs/guides/platform/manage-your-usage)).
- **Batas Ukuran Unggah Berkas Global**: Maksimal **50 MB** pada Free Tier ([Dokumentasi Batas Storage Supabase](https://supabase.com/docs/guides/storage/limits)). Metode multipart standar optimal hingga 6 MB, di atas 6 MB disarankan resumable upload (TUS).
- **Pengguna Aktif Bulanan (Auth)**: **50.000 MAU** ([Dokumentasi Pengelolaan Kuota Supabase](https://supabase.com/docs/guides/platform/manage-your-usage)).
- **Edge Function Invocations**: **500.000 panggilan/bulan** ([Dokumentasi Pengelolaan Kuota Supabase](https://supabase.com/docs/guides/platform/manage-your-usage)).
- **Kebijakan Hibernasi (Inactivity Pause)**: Proyek gratis yang tidak memiliki aktivitas kueri database pengguna selama **7 hari berturut-turut** akan otomatis di-pause ([Dokumentasi Pengelolaan Kuota Supabase](https://supabase.com/docs/guides/platform/manage-your-usage)). Proyek ini telah dipasang cron keepalive setiap 12 jam pada [vercel.json](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/CED%20Analyzer/vercel.json).

---

## 3. Invarian Sistem Regresi Panel (Ditegakkan Dua Lapis)

Setiap operasi wajib mematuhi Invarian berikut di lapis UI (validasi interaktif) dan Server (validasi engine):

| Kode | Nama Invarian | Definisi & Penegakan |
|---|---|---|
| **I1** | Dependen Kontinu | $Y$ harus numerik kontinu (bukan biner, bukan teks, bukan ordinal). |
| **I2** | Matriks Full Rank | Matriks $X$ harus berperingkat penuh (*full rank*). Kolom konstan atau kolinear sempurna diblokir. |
| **I3** | Tingkat Signifikansi Valid | $\alpha \in (0, 1)$ eksklusif (default $0.05$, pilihan $0.01$ atau $0.10$). |
| **I4** | Prediktor Minimal | Jumlah variabel independen $k \ge 1$. |
| **I5** | Ortogonalitas Y dan X | $Y \notin X$ (variabel dependen tidak boleh dipilih sebagai variabel independen/kontrol). |
| **I6** | Isolasi Kolom Identitas | Kolom `Entity_ID` dan `Time_Col` tidak boleh menjadi anggota $Y$ maupun $X$. |
| **I7** | Zero-Regression Menu CED | Menu Analisis CED eksisting tidak boleh mengalami perubahan alur, schema, atau perilaku. |
| **I8** | Keamanan Impor & SSRF | URL Google Sheets wajib HTTPS, host hanya `docs.google.com` / `drive.google.com`, port 443, batas unduh 10 MB, timeout 15 detik. |
| **I9** | Isolasi Data Pengguna | Data sesi atau database terisolasi penuh; ekspor dan impor aman dari formula injection (`=`, `+`, `-`, `@`). |
| **I10** | Keunikan Kunci Panel | Pasangan `(Entity_ID, Time_Col)` wajib unik. Jika ditemukan duplikasi observasi, eksekusi `xtset` diblokir. |
| **I11** | Batas Dimensi Panel | Minimal $N \ge 2$ (jumlah entitas) dan $T \ge 2$ (jumlah periode waktu). Untuk uji autokorelasi panel Wooldridge (`xtserial`), wajib $T \ge 3$. |
| **I12** | Non-Invarian Waktu pada FEM | Pada model Fixed Effects (FEM), variabel independen yang bernilai konstan sepanjang waktu dalam suatu entitas (*time-invariant*) wajib dideteksi dan dikeluarkan dengan peringatan eksplisit (seperti Stata mendrop variabel time-invariant). |

---

## 4. Verifikasi & Koreksi 8 Dugaan Ekonometrika

Tabel status verifikasi seluruh dugaan dari prompt:

| No | Dugaan / Topik | Status Verifikasi | Temuan & Hasil Koreksi | Sumber Acuan Resmi |
|---|---|---|---|---|
| **1** | `xtsum` = ringkasan overall, between, within | **Terverifikasi** | Stata menguraikan variabel $x_{it}$ menjadi variasi overall ($NT$), between ($n$ entitas), dan within ($x_{it} - \bar{x}_i + \bar{x}$). Standar deviasi within menggunakan pembagi $NT-1$. | Stata Base Reference Manual: `[XT] xtsum` |
| **2** | Chow = uji F `all u_i=0` pada `xtreg, fe` (tanpa robust); Hausman = `hausman fe re`; LM = Breusch-Pagan `xttest0` | **Terverifikasi** | Perilaku Stata terverifikasi persis: Uji Chow adalah uji F dari FE model tanpa opsi robust ($F(n-1, N-n-k)$). Jika robust aktif, Stata menonaktifkan uji F `all u_i=0`. Uji Hausman menguji ortogonalitas efek acak. Uji Breusch-Pagan LM (`xttest0`) menguji $H_0: \sigma_u^2 = 0$. | Stata Manual: `[XT] xtreg`, `[R] hausman`, `[XT] xttest0` |
| **3** | Alur Pemilihan Model (Chow, Hausman, LM) | **Terverifikasi & Diperluas** | Alur dasar pengguna terverifikasi. Namun, dibuatkan matriks lengkap yang mencakup 4 jalur umum dan 2 skenario anomali hasil yang bertentangan (siklis). | Baltagi (2021) *Econometric Analysis of Panel Data*; Wooldridge (2010) |
| **4** | Hausman klasik tidak valid dengan robust SE & chi2 negatif | **Terverifikasi & Diputuskan** | Matriks kovarians selisih $\hat{V}_{FE} - \hat{V}_{RE}$ sering kali tidak positif semi-definit di sampel hingga sehingga $\chi^2 < 0$. Opsi `sigmamore` tidak menyelesaikan masalah jika terdapat heteroskedastisitas atau korelasi serial. **Solusi Ekonometrika Terpilih: Mundlak (1978) Correlated Random Effects (CRE) / Auxiliary Regression Test**. | Wooldridge (2010) Bab 10; Cameron & Trivedi (2010) *Microeconometrics Using Stata* |
| **5** | Uji Asumsi Klasik: VIF (`estat vif`), Heteroskedastisitas (`xttest3` untuk FEM, padanan CEM/REM), Autokorelasi (`xtserial` butuh $T \ge 3$), Normalitas (`swilk` / `sktest`) | **Terverifikasi & Diputuskan** | - VIF: pada FEM dihitung dari within-transformed data. <br>- Heteroskedastisitas FEM: `xttest3` (Modified Wald test for groupwise heteroskedasticity). Padanan CEM: `estat hettest` (Breusch-Pagan/Cook-Weisberg). Padanan REM: Breusch-Pagan heteroskedasticity test atau robust cluster SE. <br>- Autokorelasi: `xtserial` (Wooldridge test) butuh $T \ge 3$ karena first-difference kehilangan 1 periode dan lag residual kehilangan 1 periode lagi. <br>- Normalitas: `swilk` untuk $N \le 2000$, `sktest` atau Jarque-Bera untuk $N > 2000$. | Baum (2001) `xttest3`; Drukker (2003) `xtserial`; Greene (2000) Econometric Analysis |
| **6** | Perbaikan Pelanggaran (Saran multiko, SE cluster untuk hetero/auto, normalitas CLT) | **Terverifikasi** | Multikolinearitas tidak boleh menghapus variabel otomatis. Pelanggaran hetero dan autokorelasi diperbaiki secara simultan menggunakan Arellano (1987) Cluster-Robust Standard Errors per entitas. Normalitas residual tidak membatalkan konsistensi penaksir jika $N$ memadai (Teorema Limit Pusat). Maksimal 1 putaran uji ulang tercatat. | Arellano (1987); Wooldridge (2010); Cameron & Miller (2015) |
| **7** | Model akhir tidak selalu robust; bias SE cluster jika $G < 30$ | **Terverifikasi & Diputuskan** | Dugaan sangat tepat. Jika asumsi homoskedastik dan no-autocorrelation terpenuhi, model non-robust adalah BLUE (paling efisien). Cluster SE bergantung pada asimtotik jumlah grup $G$. Jika $G < 30$, SE cluster mengalami *downward bias* (meremehkan standar error, membesarkan t-stat, p-value palsu). Ambang: $G < 30$ (bahaya), $30 \le G < 50$ (waspada). | Cameron, Gelbach, & Miller (2008); Angrist & Pischke (2009) |
| **8** | Perlunya pembedaan Cross Section, Time Series, Data Panel | **Terverifikasi** | Ekonometrika dan struktur matematis ketiganya berbeda fundamental. Aplikasi mendeteksi otomatis dari pemetaan kolom ID dan Tahun, lalu menyajikan konfirmasi kepada pengguna. Modul Panel dibangun sebagai prioritas utama. | Gujarati & Porter (2009); Wooldridge (2010) |

---

## 5. Matriks Keputusan Pemilihan Model Lengkap

Matriks pengambilan keputusan antar model Common Effect Model (CEM / Pooled OLS), Fixed Effect Model (FEM), dan Random Effect Model (REM):

```
                        [ Uji Chow (F-Test) ]
                        /                   \
        p < alpha (Tolak H0)             p >= alpha (Gagal Tolak H0)
        FEM lebih baik drpd CEM           CEM lebih baik drpd FEM
              |                                     |
    [ Uji Hausman / Mundlak ]               [ Uji Breusch-Pagan LM ]
      /                   \                    /                  \
p < alpha             p >= alpha           p < alpha           p >= alpha
(Tolak H0)          (Gagal Tolak H0)       (Tolak H0)       (Gagal Tolak H0)
FEM Terpilih          REM vs CEM          REM Terpilih         CEM Terpilih
                          |                    |
                  [ Uji LM BP ]                |
                  /           \                |
              p < alpha    p >= alpha          |
              REM Terpilih  (Anomali 1)   (Anomali 2)
```

### Tabel Rincian Jalur Keputusan & Penanganan Kasus

| Kasus | Chow (CEM vs FEM) | Hausman / Mundlak (FEM vs REM) | LM Breusch-Pagan (CEM vs REM) | Model Terpilih | Justifikasi Ekonometrika & Rekomendasi |
|---|---|---|---|---|---|
| **1 (Standar)** | Signifikan ($p < \alpha$) | Signifikan ($p < \alpha$) | *(Tidak wajib diuji)* | **FEM (Fixed Effects)** | Efek entitas bersifat tetap dan berkorelasi dengan prediktor ($\text{Cov}(u_i, X_{it}) \ne 0$). REM tidak konsisten. |
| **2 (Standar)** | Signifikan ($p < \alpha$) | Tidak Signifikan ($p \ge \alpha$) | Signifikan ($p < \alpha$) | **REM (Random Effects)** | Variasi antar entitas acak ($\sigma_u^2 > 0$) dan tidak berkorelasi dengan prediktor. REM konsisten dan lebih efisien daripada FEM. |
| **3 (Standar)** | Tidak Signifikan ($p \ge \alpha$) | *(Tidak relevan)* | Tidak Signifikan ($p \ge \alpha$) | **CEM (Pooled OLS)** | Tidak ada heterogenitas antar entitas yang signifikan ($\sigma_u^2 \approx 0$). Model Pooled OLS adalah penaksir terbaik. |
| **4 (Standar)** | Tidak Signifikan ($p \ge \alpha$) | Tidak Signifikan ($p \ge \alpha$) | Signifikan ($p < \alpha$) | **REM (Random Effects)** | Efek tetap tidak berbeda nyata, tetapi terdapat varians acak individual yang signifikan. REM mengakomodasi struktur galat ini. |
| **5 (Anomali 1: Siklis)** | Signifikan ($p < \alpha$) [FEM > CEM] | Tidak Signifikan ($p \ge \alpha$) [REM > FEM] | Tidak Signifikan ($p \ge \alpha$) [CEM > REM] | **FEM (dengan Evaluasi Pooled OLS)** | Siklus preferensi FEM > CEM > REM > FEM. Terjadi ketika $N$ kecil atau varians efek acak mendekati nol namun intersep grup berbeda. Rekomendasi: Gunakan **FEM** dengan menampilkan perbandingan Pooled OLS ber-cluster SE. |
| **6 (Anomali 2: Kontradiktif)** | Tidak Signifikan ($p \ge \alpha$) [CEM > FEM] | Signifikan ($p < \alpha$) [FEM > REM] | Signifikan ($p < \alpha$) [REM > CEM] | **FEM (dengan Mundlak CRE Check)** | Hausman menuntut FE karena korelasi endogen, tetapi F-test Chow menganggap intersep bersama cukup. Rekomendasi: Jalankan **Mundlak Test**; jika koefisien rata-rata grup signifikan, pertahankan **FEM** untuk menghindari bias endogenitas. |

---

## 6. Formulasi Matematika & Algoritma Mesin Panel

### A. Common Effect Model (CEM / Pooled OLS)
$$y_{it} = \beta_0 + \sum_{k=1}^K \beta_k X_{kit} + e_{it}$$
- Diestimasi via Ordinary Least Squares standar pada seluruh observasi $NT$.
- Matriks varians kovarians klasik: $\hat{V}(\hat{\beta}) = s_e^2 (X'X)^{-1}$.

### B. Fixed Effects Model (FEM / Within Estimator)
Transformasi data terpusat (demeaning):
$$\tilde{y}_{it} = y_{it} - \bar{y}_i, \quad \tilde{X}_{kit} = X_{kit} - \bar{X}_{ki}$$
Dimana $\bar{y}_i = \frac{1}{T_i}\sum_{t=1}^{T_i} y_{it}$. Regresi OLS pada data demeaning:
$$\tilde{y}_{it} = \sum_{k=1}^K \beta_k \tilde{X}_{kit} + \tilde{e}_{it}$$
- **Derajat Bebas Residu Stata**: $df_r = NT - n - K$.
- **Konstanta Gaya Stata (`_cons`)**: $\hat{\beta}_0 = \bar{y} - \sum_{k=1}^K \hat{\beta}_k \bar{X}_k$.
- **Standar Deviasi Komponen Galat**:
  $$\sigma_e = \sqrt{\frac{SSE_{within}}{NT - n - K}}, \quad \sigma_u = \sqrt{\max\left(0, \frac{SSE_{between}}{n - K - 1} - \frac{\sigma_e^2}{\bar{T}}\right)}, \quad \rho = \frac{\sigma_u^2}{\sigma_u^2 + \sigma_e^2}$$

### C. Random Effects Model (REM / Swamy-Arora GLS)
Transformasi quasi-demeaning:
$$y_{it}^* = y_{it} - \theta_i \bar{y}_i, \quad X_{kit}^* = X_{kit} - \theta_i \bar{X}_{ki}$$
Bobot GLS Swamy-Arora:
$$\theta_i = 1 - \sqrt{\frac{\sigma_e^2}{\sigma_e^2 + T_i \sigma_u^2}}$$
Regresi OLS pada variabel $y^*$ dan $X^*$ menghasilkan penaksir GLS yang efisien.

### D. Uji Alternatif Hausman: Mundlak Correlated Random Effects (CRE)
Menghitung rata-rata entitas untuk setiap variabel independen: $\bar{X}_{ki} = \frac{1}{T_i} \sum_{t=1}^{T_i} X_{kit}$.
Membentuk model regresi tambahan (Auxiliary Regression):
$$y_{it} = \beta_0 + \sum_{k=1}^K \beta_k X_{kit} + \sum_{k=1}^K \gamma_k \bar{X}_{ki} + v_{it}$$
- Menjalankan uji Wald bersama (Robust Wald Test):
  $$H_0: \gamma_1 = \gamma_2 = \dots = \gamma_K = 0$$
- Distribusi statistik: $W \sim \chi^2(K)$.
- Jika $p < \alpha \implies$ Tolak $H_0 \implies$ Pilih **Fixed Effects (FEM)**.
- Jika $p \ge \alpha \implies$ Gagal tolak $H_0 \implies$ Pilih **Random Effects (REM)**.
- **Keunggulan**: Valid secara asimtotik dengan Cluster-Robust SE dan tidak pernah menghasilkan nilai negatif.

### E. Arellano (1987) Cluster-Robust Standard Errors
Kovarians sandwich untuk mengoreksi heteroskedastisitas dan autokorelasi dalam entitas:
$$\hat{V}_{cluster} = (X'X)^{-1} \left( \sum_{i=1}^G X_i' \hat{e}_i \hat{e}_i' X_i \right) (X'X)^{-1} \times \text{df\_adj}$$
Faktor koreksi derajat bebas Stata:
- Untuk OLS / Pooled CEM: $\text{df\_adj} = \frac{G}{G - 1} \frac{NT - 1}{NT - K - 1}$.
- Untuk `xtreg, fe`: $\text{df\_adj} = \frac{G}{G - 1}$.
- Pengujian hipotesis menggunakan distribusi $t$ dengan derajat bebas $G - 1$.

---

## 7. Dataset Acuan & Golden Fixtures (NIST / Stata Benchmarks)

Dataset publik yang dijadikan acuan matematis:

1. **Grunfeld Investment Panel (1958)**:
   - $N = 10$ perusahaan, $T = 20$ tahun (1935–1954), $NT = 200$ observasi seimbang (*balanced panel*).
   - Dependen: `invest`, Independen: `mvalue`, `kstock`.
   - Output acuan terverifikasi Stata 17/18:
     - FEM: $\hat{\beta}_{mvalue} = 0.1101238$, $\hat{\beta}_{kstock} = 0.3100653$, $\hat{\beta}_0 = -58.74393$, $F(9, 188) = 49.18$ ($p = 0.0000$).
     - REM: $\hat{\beta}_{mvalue} = 0.1097812$, $\hat{\beta}_{kstock} = 0.3081130$, $\hat{\beta}_0 = -57.83441$, Wald $\chi^2(2) = 689.70$ ($p = 0.0000$).
     - Hausman: $\chi^2(2) = 2.33$, $p = 0.3118$.
     - Breusch-Pagan LM (`xttest0`): $\chi^2(1) = 798.16$, $p = 0.0000$.
     - Wooldridge Autocorrelation (`xtserial`): $F(1, 9) = 13.974$, $p = 0.0046$.
     - Groupwise Heteroskedasticity (`xttest3`): $\chi^2(10) = 485.45$, $p = 0.0000$.
2. **EmplUK Panel Data (Arellano & Bond, 1991)**:
   - Panel tidak seimbang (*unbalanced panel*) $N = 140$ perusahaan UK, $T = 7$ sampai $9$ tahun.
   - Digunakan untuk pengujian panel gap dan bobot unbalance Stata.

---

## 8. Arsitektur Navigasi Aplikasi (Drawer Samping / Sidebar)

Bilah tab horizontal dipindahkan menjadi panel navigasi samping (drawer) yang dibuka melalui tombol toggle (ikon hamburger) di Header.

### Struktur Hierarki Panel:
1. **Pengaturan & Database** (`settings` - ⚙️)
2. **Analyze SR** (Grup Collapsible, otomatis terbuka jika salah satu anak aktif):
   - Upload & Analisis (`upload` - 🌿)
   - Tabel Hasil Analisis (`results` - 📋)
   - Panduan 18 Indikator (`guide` - 🌱)
3. **Analisis Regresi Statistik** (`regression` - 📊)
4. **Regresi Data Panel Stata** (`panel` - 📈, mengarah ke cangkang kosong pada P0)

### Kontrak Aksesibilitas & Perilaku:
- **Default State**: Tertutup, membuka slide-in dari kiri.
- **Mekanisme Tutup**: Klik tombol toggle, klik overlay backdrop di luar panel, atau tekan tombol `Esc`.
- **Keyboard & Focus Trap**: Saat panel ditutup via `Esc` atau backdrop, fokus keyboard dikembalikan ke tombol toggle.
- **Atribut ARIA**: Tombol toggle memiliki `aria-expanded` (true/false) dan `aria-controls="app-navigation-drawer"`.
- **Layar Sempit / Mobile**: Tampil sebagai drawer overlay penuh dengan `env(safe-area-inset-bottom)`.
- **Transisi Aman**: Bilah tab horizontal lama dipertahankan berdampingan hingga drawer samping lulus verifikasi desktop & mobile.

