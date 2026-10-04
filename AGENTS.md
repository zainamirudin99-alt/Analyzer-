# AGENTS.md — Target Stack, Batasan Platform, dan Invarian Proyek

Dokumen ini memuat panduan, arsitektur target, batasan platform Vercel & Supabase, serta invarian sistem untuk agen AI yang bekerja pada repositori **CED & Statistical Regression Analyzer**.

---

## 1. Konteks Proyek & Ground Truth

1. **Aplikasi**:
   - **Menu Eksisting**: "Analisis CED" (Carbon Emission Disclosure) — mendeteksi 18 indikator CED dari laporan PDF menggunakan Gemini AI dan menyimpan riwayat ke tabel `ced_results`. Perilaku menu ini **TIDAK BOLEH BERUBAH** (Invarian I7).
   - **Menu Baru**: "Analisis Regresi Statistik" — modul regresi OLS linear (SLR & MLR) bergaya SPSS dengan pengujian asumsi klasik, penanganan time series, remedial statistik yang sah, dan pelaporan hasil apa adanya.
2. **Stack Target**:
   - **Frontend / Fullstack**: Next.js 14 (App Router), React 18, TypeScript, Vanilla CSS (Design Tokens, tanpa TailwindCSS).
   - **Database & Storage & Auth**: Supabase (PostgreSQL 15+, Supabase Auth, Row Level Security, Supabase Storage).
   - **Mesin Statistik**: Python 3.9+ Serverless Function di Vercel (`numpy`, `scipy`, `statsmodels`, `pandas`, `openpyxl`).

---

## 2. Fakta & Batasan Platform

### A. Vercel Serverless Functions
- **Batas Ukuran Bundel**:
  - Maksimal ukuran uncompressed file bundel serverless adalah **500 MB** (batas arsitektur AWS Lambda di balik Vercel).
  - Maksimal ukuran zip bundel unggah adalah **250 MB** (atau 50 MB direct upload).
  - Pustaka ilmiah Python (`numpy`, `scipy`, `statsmodels`, `pandas`, `matplotlib`) memiliki footprint disk yang besar (bisa mencapai 250–350 MB setelah instalasi). Oleh karena itu, *spike bundel* wajib diukur secara berkala.
- **Batas Eksekusi & Timeout**:
  - Hobby plan: default 10 detik (dapat diatur hingga 15–60 detik pada route tertentu dengan `maxDuration`).
  - Pro plan: hingga 60–300 detik. Konfigurasi `export const maxDuration = 60` digunakan pada route berat.
- **Cold Start**:
  - Runtime Python memiliki overhead inisialisasi cold start (sekitar 1–3 detik untuk import `scipy`/`statsmodels`). Optimasi lazy-import dianjurkan.

### B. Supabase (Database, Auth, Storage)
- **Database (PostgreSQL)**:
  - RLS (*Row Level Security*) wajib aktif di semua tabel data pengguna (`datasets`, `analyses`, `analysis_events`).
  - Kebijakan isolasi: `auth.uid() = owner_id`.
  - Tabel `analysis_events` bersifat *append-only* (hanya `INSERT` dan `SELECT`, tidak ada `UPDATE` atau `DELETE`).
- **Supabase Storage**:
  - Bucket privat: `datasets`.
  - Batas ukuran file per unggah: **10 MB** (sesuai limit bawaan Supabase free tier).
  - Struktur folder: `{auth.uid()}/{dataset_id}/{filename}`.
  - Alur unggahan: Klien terautentikasi langsung mengunggah ke Supabase Storage via `@supabase/supabase-js` menggunakan JWT sesi pengguna.
- **Supabase Auth**:
  - Pengguna harus login untuk mengakses menu "Analisis Regresi Statistik".
  - Menu CED tetap dapat diakses publik/lokal sesuai perilaku saat ini.

---

## 3. Aturan Statistika (Rujukan Skill Inti & Remedial)

Agen wajib mematuhi aturan pada skill:
1. `.agents/skills/regresi-statistik-inti/SKILL.md`
2. `.agents/skills/regresi-statistik-remedial/SKILL.md`

Poin-poin kritis:
- **Prinsip Hasil Apa Adanya**: Model M0 selalu ditampilkan apa adanya. Dilarang menawarkan trik/modifikasi data semata-mata demi membuat p-value signifikan.
- **Normalitas**: Shapiro-Wilk untuk $n \le 50$, Lilliefors untuk $n > 50$. Koreksi Lilliefors wajib karena mean dan varians diestimasi dari sampel.
- **Multikolinearitas**: Tolerance $< 0.10$ dan VIF $> 10$ menandai masalah (waspada VIF $> 5$). Belsley condition index $> 30$.
- **Time Series**: Pilihan eksplisit pengguna (Ya/Tidak). Jika Ya: periksa stasioneritas (ADF & KPSS), autokorelasi Breusch-Godfrey, heteroskedastisitas bersyarat ARCH-LM, koreksi HAC Newey-West. Jika Bukan: Durbin-Watson hanya sebagai acuan.
- **Kecukupan Sampel (Green, 1991)**: $n \ge 50 + 8k$ (uji model) dan $n \ge 104 + k$ (uji prediktor).

---

## 4. Invarian Sistem (Wajib Ditegakkan di Dua Lapis: UI dan Server/DB)

| Invarian | Definisi |
|---|---|
| **I1** | $Y$ harus numerik kontinu (bukan biner, bukan teks, bukan ordinal). |
| **I2** | Ukuran sampel $n > k + 1$ dan matriks $X$ harus berperingkat penuh (*full rank*). Kolom konstan atau kolinear sempurna diblokir. |
| **I3** | Tingkat signifikansi $\alpha \in (0, 1)$ eksklusif (misal $0.05, 0.01$). |
| **I4** | $X$ minimal 1 kolom ($k \ge 1$). Jika $k = 1$ maka SLR, jika $k \ge 2$ maka MLR. |
| **I5** | $Y$ tidak boleh menjadi anggota $X$. |
| **I6** | Jika `is_time_series` bernilai true, `time_col` wajib diisi dan tidak boleh menjadi anggota $X$ ataupun $Y$. |
| **I7** | Menu CED tidak boleh mengalami regresi fungsional atau perubahan perilaku (*Zero-Regression*). |
| **I8** | Impor link hanya dari host yang diizinkan (Google Sheets export), dengan validasi timeout (15s) dan batas ukuran file (10MB). Tolak redirect ke IP privat/lokal (SSRF protection). |
| **I9** | Pengguna hanya dapat mengakses dan memodifikasi dataset serta analisis miliknya sendiri (*Tenant Isolation via RLS*). |

---

## 5. Standar UI/UX

- **Aroma Desain**: Tema gelap/terang modern, palet warna emerald/forest green & slate, konsisten dengan brand Analyzer.
- **Layout Desktop**: Stepper di sebelah kiri, formulir/konten utama di tengah, panel ringkasan konfigurasi di kanan.
- **Layout Mobile**: Stepper ringkas di bagian atas, pemilih variabel berupa bottom-sheet modal dengan pencarian, tombol aksi ("Lanjut") menempel di bawah dengan `env(safe-area-inset-bottom)`.
- **Aksesibilitas**: Target sentuh minimal $44 \times 44\text{ px}$, ukuran font input minimal $16\text{ px}$ (mencegah auto-zoom iOS), tidak ada scroll horizontal halaman pada viewport $360\text{px}$, $390\text{px}$, $768\text{px}$, dan $1440\text{px}$.
- **Keamanan Formula Excel**: Sel yang diawali `=`, `+`, `-`, `@` wajib dinetralkan saat impor/ekspor untuk mencegah *formula injection*.
