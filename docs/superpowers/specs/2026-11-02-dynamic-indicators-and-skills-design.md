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
