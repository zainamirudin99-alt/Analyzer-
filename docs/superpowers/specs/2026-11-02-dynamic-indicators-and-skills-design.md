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

