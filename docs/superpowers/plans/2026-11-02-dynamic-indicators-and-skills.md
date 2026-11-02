# Dynamic Indicators, AI Synchronization, and Custom Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menghapus bilah tab horizontal atas di Header, merestrukturisasi drawer dengan "Pilihan Indikator" di urutan pertama, membangun sistem preset indikator dinamis dengan penambahan manual, sinkronisasi dua arah model AI, upload & seleksi Custom AI Skills, dan adaptasi tabel hasil analisis dinamis.

**Architecture:** Menggunakan arsitektur hybrid (LocalStorage untuk reaktivitas instan tanpa login + skrip DDL Supabase opsional). Abstraksi prompt generator AI diperluas untuk menerima daftar indikator dinamis dan injeksi teks skill kustom, dengan fallback 100% ke 18 indikator CED standar (Invarian I7).

**Tech Stack:** Next.js 14 (App Router), TypeScript, React 18, Vanilla CSS (Design Tokens), Lucide Icons, Gemini AI / OpenAI / Anthropic Claude API.

**Spec:** `docs/superpowers/specs/2026-11-02-dynamic-indicators-and-skills-design.md`

## Global Constraints
- Invarian I7: Zero functional regression pada CED bawaan (18 indikator CED tetap berfungsi penuh).
- Tanpa TailwindCSS: Seluruh styling menggunakan Vanilla CSS dan tokens yang ada di `app/globals.css`.
- Desain Responsif: Desktop split 2 kolom, mobile stacked tanpa scroll horizontal (< 768px, 390px, 360px).
- Commit dibuat atas nama pengguna tanpa atribusi bot.

---

### Task 1: Tipe Data & Helper Storage Indikator dan Skills

**Files:**
- Create: `src/lib/indicators-storage.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `IndicatorItem`, `IndicatorPreset`, `CustomAISkill`, `getStoredPresets()`, `saveStoredPresets()`, `getActivePreset()`, `setActivePresetId()`, `getStoredSkills()`, `saveStoredSkills()`.

- [ ] **Step 1: Definisikan tipe data di `src/lib/types.ts`**
  Tambahkan interface `IndicatorItem`, `IndicatorPreset`, `CustomAISkill`, dan perbarui `CEDResultRecord` agar mendukung `preset_id`, `preset_name`, dan `dynamic_scores?: Record<string, number>`.

- [ ] **Step 2: Buat utilitas storage di `src/lib/indicators-storage.ts`**
  Implementasikan fungsi untuk membaca/menyimpan preset indikator dan custom skills dari `localStorage`, dengan default preset 18 Indikator CED otomatis dibuat jika belum ada.

---

### Task 2: Refactor Prompt AI Generator & API Route `/api/analyze`

**Files:**
- Modify: `src/lib/gemini.ts`
- Modify: `src/lib/openai.ts`
- Modify: `src/lib/claude.ts`
- Modify: `src/app/api/analyze/route.ts`

**Interfaces:**
- Produces: `buildAnalysisPrompt({ companyCode, fiscalYear, indicators, skillContent })`
- Consumes: `IndicatorItem[]`, `skillContent` string dari FormData `/api/analyze`.

- [ ] **Step 1: Refactor `buildCEDPrompt` menjadi `buildAnalysisPrompt` di `src/lib/gemini.ts`**
  Dukung parameter indikator dinamis dan injeksi teks skill tambahan. Pertahankan alias `buildCEDPrompt` untuk backward compatibility.

- [ ] **Step 2: Sinkronkan generator di `src/lib/openai.ts` dan `src/lib/claude.ts`**
  Pastikan ketiga engine AI (Gemini, OpenAI, Claude) menggunakan generator prompt dinamis yang sama.

- [ ] **Step 3: Perbarui `src/app/api/analyze/route.ts`**
  Baca `indicatorsJson`, `skillContent`, `presetId`, dan `presetName` dari FormData, hitung total skor dan klasifikasi pengungkapan secara dinamis berdasarkan jumlah indikator.

---

### Task 3: Pembersihan Header & Reorganisasi Drawer Navigasi

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/components/NavigationDrawer.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Hapus top horizontal navigation tabs di `src/components/Header.tsx`**
  Hapus elemen `<nav className="nav-tabs">` beserta tab buttons di dalamnya. Pertahankan hamburger button, brand info, dan status pill.

- [ ] **Step 2: Reorganisasi urutan menu di `src/components/NavigationDrawer.tsx`**
  Posisikan "Pilihan Indikator" di urutan teratas, diikuti "Upload & Analisis", "Tabel Hasil Analisis", "Pengaturan & Database", "Analisis Regresi Statistik", dan "Regresi Data Panel Stata".

- [ ] **Step 3: Pastikan navigasi di `src/app/page.tsx` sinkron**
  Tab key `guide` atau `indicators` terhubung dengan mulus ke tampilan Pilihan Indikator.

---

### Task 4: Halaman "Pilihan Indikator" (Split 2 Kolom & Penambahan Manual)

**Files:**
- Modify: `src/components/GuideTab.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Bangun kolom kiri (Manajemen Preset Indikator)**
  Daftar preset yang tersedia, radio button pemilih preset aktif, tombol "Tambah Preset Baru", "Tambah Indikator", dan "Duplikasi dari CED 18".

- [ ] **Step 2: Modal / Formulir Tambah & Edit Indikator Manual**
  Input kode indikator (misal `WATER1`), judul, deskripsi kriteria pengungkapan, dan kategori/grup.

- [ ] **Step 3: Bangun kolom kanan (Rubrik & Rincian Indikator Aktif)**
  Tampilkan rubrik penilaian skor 0-5 dan daftar kartu indikator dari preset aktif dengan opsi edit/hapus pada indikator kustom.

- [ ] **Step 4: Responsif & Styling di `src/app/globals.css`**
  Pastikan tata letak split 2 kolom di desktop dan responsif di mobile tanpa horizontal overflow.

---

### Task 5: Sinkronisasi Multi-Model AI & Dropdown Preset di Upload & Analisis

**Files:**
- Modify: `src/components/UploadTab.tsx`

- [ ] **Step 1: Tambahkan Selector Preset Indikator Aktif**
  Dropdown di UploadTab yang menampilkan preset indikator aktif dan sinkron dengan Tab Pilihan Indikator.

- [ ] **Step 2: Tambahkan Selector Model AI Interaktif Dua Arah**
  Tambahkan pemilih Provider (Gemini / OpenAI / Claude) dan dropdown model langsung di UploadTab, tersinkronisasi dua arah dengan `SettingsTab` via storage listener.

- [ ] **Step 3: Tambahkan Selector Custom AI Skill**
  Dropdown pilihan skill bantuan audit yang tersimpan di sistem.

- [ ] **Step 4: Kirim data dinamis ke `/api/analyze`**
  Append `indicatorsJson`, `presetId`, `presetName`, dan `skillContent` ke FormData analisis.

---

### Task 6: Modul Upload & Manajemen Custom AI Skills di Pengaturan

**Files:**
- Modify: `src/components/SettingsTab.tsx`

- [ ] **Step 1: Buat card "Manajemen Custom AI Skills"**
  Zona upload file `.md` / `.txt` serta formulir tambah skill manual (Nama Skill & Teks Panduan).

- [ ] **Step 2: Daftar Skill & Pratinjau**
  Tampilkan daftar skill yang tersimpan dengan aksi Pratinjau Isi, Edit, dan Hapus.

- [ ] **Step 3: Skrip SQL DDL Supabase Tambahan**
  Sertakan DDL untuk tabel `custom_indicator_presets` dan `custom_ai_skills` di tab Pengaturan.

---

### Task 7: Adaptasi Tabel Hasil Analisis Dinamis

**Files:**
- Modify: `src/components/ResultsTab.tsx`

- [ ] **Step 1: Toolbar Filter Preset Indikator**
  Dropdown pemfilter hasil berdasarkan preset yang digunakan saat analisis.

- [ ] **Step 2: Render Kolom Indikator Dinamis**
  Render kolom skor sesuai dengan kode indikator dari data analisis terkait.

- [ ] **Step 3: Adaptasi Salin Spreadsheet & Ekspor CSV**
  Format salinan teks tab-separated dan CSV menyesuaikan dengan kolom indikator rekaman.

---

### Task 8: Verifikasi Komprehensif & Quality Audit

- [ ] **Step 1: Uji Build TypeScript**
  Jalankan `npm run build` untuk memverifikasi tidak ada error kompilasi dan tipe data.

- [ ] **Step 2: Jalankan audit kebersihan kode (aislop)**
  Pastikan kode bersih dari duplikasi dan anti-pattern.
