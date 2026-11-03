# Spesifikasi Desain: Pilihan Indikator Dinamis, Sinkronisasi Multi-Model AI, dan Custom AI Skills

**Tanggal**: 2 November 2026  
**Status**: Disetujui (Approved)  
**Tujuan**: Menghilangkan bilah navigasi atas (top bar redundant), merestrukturisasi drawer dengan menu "Pilihan Indikator" di urutan pertama, mendukung penambahan/pengelolaan indikator kustom via sistem preset, sinkronisasi dua arah model AI antara Upload & Settings, serta kemampuan mengunggah dan memilih Custom AI Skill untuk memandu analisis laporan.

---

## 1. Latar Belakang & Masalah
1. Header aplikasi memiliki tab horizontal atas yang redundan dengan bilah samping (*Navigation Drawer*). Tab atas ini perlu dihilangkan agar antarmuka bersih dan konsisten.
2. Menu "Panduan 18 Indikator" saat ini statis. Pengguna membutuhkan kemampuan memilih kumpulan indikator yang digunakan, menambahkan indikator baru secara manual, dan memposisikan menu ini sebagai pilihan pertama navigasi dengan nama "Pilihan Indikator".
3. Menu Upload & Analisis dan Tabel Hasil Analisis harus dapat menyesuaikan dengan kumpulan indikator aktif yang dipilih.
4. Pemilihan model AI di Upload & Analisis harus interaktif dan tersinkronisasi dua arah dengan Tab Pengaturan.
5. Tab Pengaturan perlu mendukung pengunggahan Custom AI Skill (dokumen `.md` / `.txt` atau form editor) untuk memperkaya instruksi AI, dan Tab Upload & Analisis menyediakan selector untuk memilih skill yang ingin digunakan saat analisis berjalan.

---

## 2. Arsitektur Komponen & UI/UX

### A. Header (`src/components/Header.tsx`)
- Menghapus elemen `<nav className="nav-tabs">` (tab horizontal atas).
- Mempertahankan tombol hamburger drawer, identitas brand, dan status koneksi Supabase.

### B. Drawer Navigasi (`src/components/NavigationDrawer.tsx`)
Urutan menu baru:
1. `indicators` — **🌱 Pilihan Indikator** (posisi teratas)
2. `upload` — **🌿 Upload & Analisis**
3. `results` — **📋 Tabel Hasil Analisis**
4. `settings` — **⚙️ Pengaturan & Database**
5. `regression` — **📊 Analisis Regresi Statistik**
6. `panel` — **📈 Regresi Data Panel Stata**

### C. Halaman Pilihan Indikator (`src/components/GuideTab.tsx` / `IndicatorsTab.tsx`)
- **Kolom Kiri**:
  - Daftar Preset Indikator (Default: *18 Indikator Carbon Emission Disclosure*).
  - Radio button pemilih preset aktif yang tersinkronisasi global ke seluruh sistem.
  - Tombol: `➕ Tambah Preset Baru`, `➕ Tambah Indikator ke Preset`, dan `Duplikasi dari Standar CED 18`.
- **Kolom Kanan**:
  - Rubrik Penilaian Skor (0 - 5).
  - Kartu daftar rincian indikator aktif (Kode, Judul, Deskripsi, Kategori).
  - Aksi edit dan hapus untuk indikator buatan pengguna.

### D. Halaman Upload & Analisis (`src/components/UploadTab.tsx`)
- Card konfigurasi analisis interaktif:
  - **Pilihan Preset Indikator**: Dropdown preset indikator aktif (sinkron dengan menu Pilihan Indikator).
  - **Pilihan Model AI**: Selector provider (Gemini / OpenAI / Claude) dan dropdown model aktif yang tersinkronisasi dua arah dengan `SettingsTab`.
  - **Pilihan Custom AI Skill**: Dropdown skill aktif untuk memandu evaluasi AI (opsi *Tanpa Skill Tambahan* atau daftar skill yang diunggah).

### E. Halaman Pengaturan & Database (`src/components/SettingsTab.tsx`)
- Modul baru: **Manajemen Custom AI Skills**:
  - Area drag-and-drop / upload file `.md` atau `.txt`.
  - Formulir input/edit skill manual (Nama Skill & Instruksi Khusus).
  - Daftar skill yang tersimpan dengan aksi pratinjau, edit, dan hapus.
- Tambahan skrip SQL DDL Supabase untuk tabel kustom opsional.

### F. Halaman Tabel Hasil Analisis (`src/components/ResultsTab.tsx`)
- Kolom tabel beradaptasi secara dinamis berdasarkan preset indikator dari rekaman analisis.
- Filter toolbar: Opsi filter berdasarkan preset indikator.
- Fungsi salin spreadsheet dan ekspor CSV menyesuaikan kolom indikator secara dinamis.

---

## 3. Skema Data & Model State (`src/lib/types.ts`)

```typescript
export interface IndicatorItem {
  id: string;          // contoh: 'cc1', 'water1'
  code: string;        // contoh: 'CC1', 'WATER1'
  title: string;       // judul indikator
  fullDesc: string;    // deskripsi kriteria pengungkapan
  group: string;       // kategori / kelompok
}

export interface IndicatorPreset {
  id: string;          // 'default_ced_18' atau string unik
  name: string;        // '18 Indikator CED (Default)' atau kustom
  description?: string;
  isDefault: boolean;  // true untuk preset bawaan 18 CED
  indicators: IndicatorItem[];
  createdAt: string;
}

export interface CustomAISkill {
  id: string;          // id unik skill
  name: string;        // nama skill
  fileName?: string;   // nama file sumber
  content: string;     // konten instruksi prompt
  createdAt: string;
}
```

---

## 4. Mesin Analisis AI & Dynamic Prompting
1. Payload `/api/analyze` menerima:
   - `presetId`, `presetName`
   - `indicatorsJson`: JSON array dari indikator yang diuji
   - `skillContent`: teks instruksi skill kustom yang dipilih (jika ada)
2. Prompt Builder (`lib/gemini.ts`, `lib/openai.ts`, `lib/claude.ts`):
   - Merakit daftar indikator secara dinamis dari `indicatorsJson`.
   - Menginjeksi blok instruksi custom skill jika tersedia.
   - Menginstruksikan AI mengembalikan objek JSON skor sesuai kode indikator.
3. Fallback: Jika payload indikator kosong, otomatis menggunakan 18 Indikator CED standar (*Zero Regression - Invarian I7*).
4. Perhitungan Skor:
   - Total skor: $\sum \text{skor}$.
   - Skor maksimal: $\text{jumlah indikator} \times 5$.
   - Kategori pengungkapan: Sangat Tinggi ($\ge 80\%$), Tinggi ($60-79\%$), Sedang ($40-59\%$), Rendah ($20-39\%$), Sangat Rendah ($<20\%$).

---

## 5. Rencana Pengujian
1. Verifikasi UI: Header tab horizontal atas hilang, drawer berfungsi dengan menu Pilihan Indikator di posisi teratas.
2. Verifikasi Preset: Membuat preset baru, menambah indikator kustom, memilih preset aktif.
3. Verifikasi Sinkronisasi Model AI: Mengubah provider/model di UploadTab tercermin di SettingsTab dan sebaliknya.
4. Verifikasi Custom Skill: Mengunggah file `.md`/`.txt`, memilih skill di UploadTab, dan memastikan instruksi terinjeksi ke payload `/api/analyze`.
5. Verifikasi Zero-Regression: Analisis dengan 18 Indikator CED standar tetap berfungsi 100% tanpa error.



---

## 6. Spesifikasi Fase 2: Modal Pop-up Terpusat, Dukungan File `.skill`, dan Lokalisasi Dwibahasa (ID ↔ EN)

**Tanggal**: 3 November 2026  
**Status**: Disetujui (Approved)

### A. Pop-up Modal di Tengah & Alur Input Indikator Berkelanjutan (`globals.css`, `GuideTab.tsx`)
1. Menambahkan definisi CSS `.modal-backdrop` (`position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(15, 29, 11, 0.58); backdrop-filter: blur(4px)`) dan `.modal-card` (`background: var(--white); border-radius: var(--radius); box-shadow: var(--shadow-lg); max-height: 90vh; overflow-y: auto; padding: 24px`) agar seluruh modal pop-up tampil tepat di tengah layar.
2. Alur *Chained Wizard* saat klik **"Tambah Pilihan Indikator Baru"**:
   - Langkah 1: Pengguna mengisi **Nama Preset** & **Deskripsi** lalu klik **"Simpan & Lanjut Input Indikator"**.
   - Langkah 2: Modal otomatis bertransisi ke form **Input Indikator** untuk preset baru tersebut, menampilkan daftar indikator yang sudah diinput dalam sesi modal, tombol **"+ Tambah Indikator Lagi"** (untuk menambah indikator beruntun), dan tombol **"Selesai"** untuk menutup modal.

### B. Dukungan Upload File `.skill` (`SettingsTab.tsx`)
1. Memperbarui atribut input file pada Manajemen Custom AI Skills menjadi `accept=".skill,.md,.txt,.json,.yaml"`.
2. Parser file `.skill` mendukung:
   - File `.skill` berbasis teks/Markdown (beserta ekstraksi YAML frontmatter `name` dan `description`).
   - File `.skill` berbasis paket arsip ZIP (`PK\x03\x04`), dengan ekstraksi otomatis entri `SKILL.md` / `.md` tanpa dependensi eksternal berat.

### C. Pilihan Bahasa Tampilan (ID / EN) & Translasi Otomatis Indikator Dua Arah (`src/lib/i18n.ts`, `/api/translate`)
1. Menambahkan pengaturan **Bahasa Tampilan / Display Language** (`id` = Bahasa Indonesia, `en` = English) di `SettingsTab.tsx`, disimpan di `localStorage` (`analyzer_language`) dan dipancarkan via event `analyzer_language_changed`.
2. Seluruh label antarmuka utama (`Header`, `NavigationDrawer`, `GuideTab`, `UploadTab`, `ResultsTab`, `SettingsTab`) beradaptasi secara reaktif terhadap bahasa aktif.
3. **Translasi Dua Arah Indikator (ID ↔ EN)**:
   - Untuk 18 indikator standar CED dan rubrik skor (0–5): disediakan kamus dwibahasa baku (ID & EN) di `src/lib/i18n.ts`.
   - Untuk preset dan indikator kustom: `IndicatorItem` dan `IndicatorPreset` menyimpan atribut dwibahasa (`title_id`, `title_en`, `fullDesc_id`, `fullDesc_en`, `group_id`, `group_en`, `name_id`, `name_en`, `desc_id`, `desc_en`).
   - Saat indikator diinput dalam Bahasa Indonesia dan pengguna beralih ke Bahasa Inggris (atau sebaliknya), sistem otomatis menerjemahkan teks indikator secara asinkron melalui endpoint `/api/translate` dan menyimpannya ke cache `localStorage`.


---

## 7. Spesifikasi Fase 3: Pemilihan Multi-Skill AI & Sinkronisasi Penuh Tabel Hasil Analisis

**Tanggal**: 3 November 2026  
**Status**: Disetujui (Approved)

### A. Pemilihan Multi-Skill AI Lebih dari Satu (`indicators-storage.ts`, `UploadTab.tsx`)
1. Menambahkan helper `getActiveSkillIds(): string[]`, `setActiveSkillIds(ids: string[])`, dan `getActiveSkills(): CustomAISkill[]` pada `src/lib/indicators-storage.ts` (tetap menjaga kompatibilitas mundur dengan `getActiveSkillId`).
2. Mengubah UI pemilih **Skill Bantuan AI (Custom Skill)** pada `UploadTab.tsx` menjadi komponen **Multi-Skill Selector** berbasis chip/checkbox interaktif:
   - Pengguna dapat mencentang/memilih 1, beberapa, atau seluruh skill sekaligus (**Pilih Semua** / **Reset Pilihan**).
   - Saat analisis dijalankan, instruksi dari seluruh skill yang aktif digabungkan secara terstruktur (`skillContent`) dan diinjeksikan ke prompt AI.

### B. Sinkronisasi Penuh Tabel Hasil Analisis & Kartu Skor dengan Indikator Terpilih (`ResultsTab.tsx`, `UploadTab.tsx`)
1. `ResultsTab.tsx` secara otomatis mensinkronkan filter preset indikator dengan preset yang sedang aktif (`getActivePresetId()`), dan perubahan pilihan preset pada `ResultsTab.tsx` juga menyinkronkan preset aktif (`setActivePresetId`) ketika memilih preset spesifik.
2. Menampilkan banner informasi preset aktif beserta daftar kode indikator dan skor maksimal ($\text{Jumlah Indikator} \times 5$) di `ResultsTab.tsx`.
3. Mempertahankan `preset_id`, `preset_name`, dan skor indikator kustom dari penyimpanan lokal saat menggabungkan data dengan Supabase agar kolom indikator kustom tidak hilang.
4. Kartu hasil analisis di `UploadTab.tsx` menampilkan skor maksimal dinamis ($N \times 5$), persentase pengungkapan dinamis, dan tombol salin sesuai jumlah indikator dari preset aktif.


---

## 8. Spesifikasi Fase 4: Optimasi Alur Regresi Linier (Gaya SPSS) & Regresi Data Panel 9-Langkah (Gaya Stata)

**Tanggal**: 3 November 2026  
**Status**: Disetujui (Approved)

### A. Menu Analisis Regresi Statistik (`RegressionTab.tsx`, `RegressionResultsView.tsx`, `regression-remedial.ts`) — Output Gaya SPSS
1. **Penyederhanaan Alur Konfigurasi (Quick Run & Streamlined Flow)**:
   - Memungkinkan pengguna memilih Sumber Data, Sheet, Variabel ($Y$ & $X$), dan konfigurasi Time Series secara ringkas serta menyediakan tombol **"⚡ Jalankan Analisis OLS (Hasil SPSS) Sekarang"** begitu variabel $Y$ dan $X$ valid tanpa harus melewati 6 layar terpisah secara kaku.
2. **Kaidah Statistika Data Time Series**:
   - Ketika `isTimeSeries === true`, menampilkan panduan dan pemeriksaan otomatis:
     - Pengurutan kronologis berdasarkan `timeCol` dan deteksi jeda/duplikasi waktu.
     - Uji Stasioneritas (**ADF & KPSS**) pada $Y, X$, dan residual $e_t$, deteksi **Regresi Lancung (Spurious Regression / Granger-Newbold)** jika $R^2 > DW$, serta dukungan **First Difference ($\Delta Y_t, \Delta X_t$)** dan **Uji Kointegrasi Engle-Granger**.
     - Uji Autokorelasi Serial (**Durbin-Watson**, **Breusch-Godfrey LM**, **Ljung-Box Q**) dan **Heteroskedastisitas Bersyarat ARCH-LM**.
3. **Perbaikan Pelanggaran Asumsi & Optimasi $R^2$ Komprehensif Sesuai Kaidah Statistika**:
   - Mempertahankan Model `M0` secara utuh dan memberi label **Konfirmatori** vs **Eksploratori** sesuai `.agents/skills/regresi-statistik-remedial/SKILL.md`:
     - **Pelanggaran Normalitas**: Eliminasi outlier ekstrem ($|\text{Stud. Deleted Res}| > 3$ atau $\text{Cook's } D > 4/n$, maks 5%), Transformasi variabel ($\ln$, $\log_{10}$, $\sqrt{}$, Box-Cox $\lambda$ dengan auto-shift positif), Regresi Robust (Huber/Bisquare M-Estimator), WLS, atau Bootstrap BCa.
     - **Pelanggaran Heteroskedastisitas**: Robust Standard Errors **HC3** atau **Weighted Least Squares (WLS)**.
     - **Pelanggaran Multikolinearitas ($\text{VIF} > 10$)**: **Transformasi Ortogonal Gram-Schmidt (`orthog`)**, **Mean-Centering**, **Ridge Regression ($L_2$)**, atau eliminasi prediktor redundan.
     - **Pelanggaran Time Series (Autokorelasi / Non-Stasioner)**: **HAC Newey-West SE**, **Cochrane-Orcutt / Prais-Winsten AR(1) (GLSAR)**, **First Difference ($\Delta Y_t, \Delta X_t$)**, dan penambahan Lag Dependen ($Y_{t-1}$).
     - **Optimasi $R^2$ Kecil (Auto-Scan & Best Valid Specification)**: Tombol pemindaian pintar 1-klik yang menguji bentuk fungsional sah (Double-Log $\ln Y$ & $\ln X$, Semi-Log, Polinomial Kuadratik Terpusat, Interaksi $X_1 \times X_2$, kombinasi prediktor kandidat, dan pembersihan outlier leverage) lalu merekomendasikan spesifikasi terbaik dengan $R^2$ & Adjusted $R^2$ tertinggi yang sah secara statistika.

### B. Menu Regresi Data Panel (`PanelTab.tsx`, `PanelStepper.tsx`, `panel-engine.ts`, `panel-types.ts`, `panel-interpretation.ts`) — Output Gaya Stata
Mengimplementasikan alur 9 langkah terstruktur bergaya Stata sesuai kaidah ekonometrika data panel:
1. **Langkah 1 — Input Data & Pemetaan Variabel Awal**:
   - Menggabungkan Impor Data (File / Link Google Sheets / Preset Grunfeld), Pemilihan Sheet, dan Pemetaan Kolom (`idCol`, `timeCol`, `yCol`, `xCols`). Begitu input terpenuhi, langsung siap lanjut ke **Langkah 2: Cleaning Data**.
2. **Langkah 2 — Cleaning Data Pintar & Pilihan Perlakuan Nilai `0` (Nol)**:
   - Sistem menganalisis dataset untuk mendeteksi *missing values*, duplikasi `(id, time)`, dan **nilai `0` (nol)** pada setiap variabel.
   - Jika terdeteksi nilai `0`, sistem menampilkan pilihan interaktif kepada pengguna:
     - **Opsi A: Data `0` adalah Nilai Sebenarnya (`True Zero`)** — Nilai `0` dipertahankan sebagai angka riil (dan bila ditransformasi `LN` pada langkah berikutnya, menggunakan $\ln(x + 1)$ atau konstanta shift agar tidak menghasilkan `NaN`/`-Inf`).
     - **Opsi B: Data `0` berarti Tidak Ada Pengungkapan / Missing (`Zero as Missing / No Disclosure`)** — Nilai `0` diperlakukan sebagai data hilang dengan pilihan *Listwise Deletion (Drop Baris)* atau *Imputasi Mean / Median Entitas*.
3. **Langkah 3 — Analisis Distribusi Lanjutan & Transformasi `LN` (`gen ln_var = ln(...)`)**:
   - Setelah data bersih, sistem menganalisis kecondongan (*skewness*), *kurtosis*, dan rentang skala tiap variabel serta merekomendasikan variabel mana yang perlu ditransformasi **`LN`**.
   - Pengguna dapat memilih/menerapkan transformasi `LN` (`ln_<var>`) dan variabel hasil transformasi tersebut menjadi variabel aktif untuk langkah-langkah selanjutnya.
4. **Langkah 4 — Deklarasi `xtset` (`xtset id year` + `xtsum` + `pwcorr`)**:
   - Mengunci struktur panel (`strongly balanced` vs `unbalanced`) dan menampilkan statistik tiga dimensi (`overall`, `between`, `within`).
5. **Langkah 5 — Pemanggilan 3 Model Panel (`CEM`, `FEM`, `REM`)**:
   - Menjalankan dan menampilkan output bergaya Stata untuk **CEM (`reg`)**, **FEM (`xtreg, fe`)**, dan **REM (`xtreg, re`)**.
6. **Langkah 6 — Uji Pemilihan Model Adaptif (`Uji Chow Pendekatan Dummy`, `Uji Hausman`, & `Uji LM`)**:
   - **Uji Chow Pendekatan Dummy (`reg y x1 ... i.id` + `testparm i.id`)**: Menguji signifikansi simultan variabel dummy entitas (CEM vs FEM).
   - **Uji Hausman (`hausman fe re`)**: Menguji FEM vs REM dan otomatis menyesuaikan dengan kondisi data (dilengkapi fallback/pendamping **Mundlak CRE** bila matriks kovarians selisih non-positif definit atau terdapat variabel *time-invariant*).
   - **Uji Breusch-Pagan LM (`xttest0`)**: Menguji CEM vs REM secara adaptif.
7. **Langkah 7 — Uji Asumsi Klasik & Transformasi `orthog` untuk Multikolinearitas**:
   - **Pendekatan Multikolinearitas Sesuai Model Terpilih**:
     - Jika terpilih **FEM atau REM (`xtreg`)** $\rightarrow$ menggunakan **Uncentered VIF (`vif, uncentered`)**.
     - Jika terpilih **CEM (`reg`)** $\rightarrow$ menggunakan **Centered VIF (`estat vif`)**.
   - **Transformasi `orthog` Otomatis**: Jika terdapat variabel yang mengalami multikolinearitas ($\text{VIF} > 10$), variabel tersebut ditransformasi menggunakan ortogonalisasi Gram-Schmidt (`orthog var1 var2, generate(orth_var1 orth_var2)`) dan **variabel terakhir hasil transformasi (`orth_` / `ln_`) digunakan pada estimasi model `xtreg` / `reg` selanjutnya**.
   - Menampilkan juga **Uji Heteroskedastisitas** (`xttest3` / `hettest`) dan **Uji Autokorelasi Wooldridge** (`xtserial`).
8. **Langkah 8 — Uji Normalitas Residual (`predict e, e` vs `predict resid, residuals`), Histogram Visual, serta `sktest`, `swilk`, & `ksmirnov`**:
   - Menjelaskan dan memilih secara tepat antara **`predict e, e`** (komponen galat idiosinkratik $e_{it}$ untuk model panel `xtreg` FEM/REM) dan **`predict resid, residuals`** (residual total untuk `reg` CEM), dengan opsi toggle untuk membandingkan keduanya.
   - Menampilkan **Histogram Residual dengan Kurva Normal Overlay** (`histogram e, normal`).
   - Menampilkan tabel gaya Stata untuk **`sktest`** (Skewness & Kurtosis test), **`swilk`** (Shapiro-Wilk $W$ test), dan **`ksmirnov`** (Kolmogorov-Smirnov / Lilliefors test).
9. **Langkah 9 — Hasil Akhir `vce(robust)` & Interpretasi Bahasa Mudah**:
   - Mengestimasi ulang model terpilih menggunakan **variabel terakhir yang aktif** (setelah `ln_` dan/atau `orthog`) dengan **`vce(robust)`** (Cluster-Robust Standard Errors).
   - Menyajikan tabel akhir gaya Stata beserta kartu **Interpretasi Hasil Akhir dengan Bahasa yang Mudah Dipahami** untuk uji simultan ($F / \text{Wald } \chi^2$), $R^2$, dan arti ekonomi/praktis tiap variabel independen.
