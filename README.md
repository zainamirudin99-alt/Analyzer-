# 🌲 Analyzer – Carbon Emission Disclosure (CED)

Aplikasi web modern untuk mengidentifikasi, mengekstrak, dan menilai **18 Indikator Carbon Emission Disclosure (CED)** pada laporan tahunan (Annual Report) atau laporan keberlanjutan (Sustainability Report) perusahaan tambang/emiten di Indonesia.

Dibangun dengan arsitektur modern:
- **Hosting**: [Vercel](https://vercel.com) (Serverless & Global Edge CDN)
- **Database**: [Supabase](https://supabase.com) (PostgreSQL Database)
- **AI Backend**: [Google Gemini AI Studio API](https://aistudio.google.com/app/apikey) (Multimodal & Fast Text Processing)
- **Framework**: Next.js (App Router), TypeScript, dan Vanilla CSS Design Tokens (Lush Forest Green & High-Tech Sustainability Aesthetics).

---

## 🌟 Fitur Utama

1. **Pipeline Konversi PDF ➔ TXT Otomatis**:
   - Saat pengguna mengunggah file PDF, sistem secara otomatis mengekstrak seluruh teks per halaman menjadi format teks bersih (`.txt`).
   - Format TXT dikirim ke Gemini AI sehingga pemrosesan lebih cepat, hemat token, dan bebas dari kendala render PDF kompleks.
2. **18 Indikator Carbon Emission Disclosure (CED)**:
   - 🌡️ **Climate Change**: CC1, CC2
   - 💨 **Greenhouse Gas**: GHG1, GHG2, GHG3, GHG4, GHG5, GHG6, GHG7
   - ⚡ **Energy Consumption**: EC1, EC2, EC3
   - 🎯 **Reduction Commitment**: RC1, RC2, RC3, RC4
   - 🏛️ **Accountability**: ACC1, ACC2
3. **Penilaian Skor 0 s/d 5 (Total Maksimal 90)**:
   - 0 = Tidak ada pengungkapan
   - 1 = Kurang dari 3 kalimat
   - 2 = 1 paragraf / ≤ ½ halaman
   - 3 = ½ s/d 1 halaman A4
   - 4 = 1 halaman A4 penuh
   - 5 = Lebih dari 1 halaman A4
4. **Tabel Database & Statistik Terpusat**:
   - Filter cepat berdasarkan ticker perusahaan dan tahun fiskal.
   - Ringkasan statistik otomatis (Jumlah entri, rata-rata skor industri, nilai tertinggi & terendah).
   - Fitur **Ekspor ke File CSV / Excel** dan **Cetak Laporan**.
5. **Zero-Drop Failover**:
   - Otomatis melakukan *failover* ke model alternatif (`gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`) jika terjadi batas kuota (*HTTP 429 Rate Limit*).

---

## 🔗 Alur Penyambungan Supabase ke Vercel

```
[Dashboard Supabase (API Settings)]
   ├── Project URL
   └── anon public key
        │
        ▼ (Input ke Vercel Environment Variables)
[Dashboard Vercel (Project Settings -> Environment Variables)]
   ├── NEXT_PUBLIC_SUPABASE_URL
   ├── NEXT_PUBLIC_SUPABASE_ANON_KEY
   └── GEMINI_API_KEY
        │
        ▼ (Otomatis terhubung pada Serverless API Routes)
[Aplikasi Next.js Analyzer @ Vercel] ➔ [PostgreSQL Database @ Supabase]
```

### 🔹 Langkah 1: Ambil Kredensial dari Supabase
1. Buka [Supabase Dashboard](https://supabase.com/dashboard) ➔ Pilih project Anda.
2. Buka menu **Project Settings** (⚙️) ➔ Pilih tab **API**.
3. Salin **Project URL** dan **anon / public key**.

### 🔹 Langkah 2: Masukkan ke Vercel
1. Buka [Vercel Dashboard](https://vercel.com) ➔ Pilih project `analyzer`.
2. Masuk ke tab **Settings** ➔ **Environment Variables**.
3. Tambahkan variabel:
   - `NEXT_PUBLIC_SUPABASE_URL` = *(Project URL Supabase)*
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = *(anon public key Supabase)*
   - `SUPABASE_SERVICE_ROLE_KEY` = *(service_role key Supabase)*
   - `GEMINI_API_KEY` = *(API Key Google AI Studio)*
   - `DEFAULT_GEMINI_MODEL` = `gemini-2.5-flash`
4. Klik **Save** dan lakukan **Redeploy** pada deployment terbaru.

---

## 🚀 Panduan Inisialisasi SQL di Supabase

Sebelum menjalankan aplikasi, inisialisasi tabel di Supabase:
1. Buka [Supabase SQL Editor](https://supabase.com).
2. Buka file `schema.sql` pada proyek ini, salin seluruh isi kodenya dan klik **Run**.

---

## 💻 Menjalankan di Komputer Lokal

```bash
# 1. Install dependensi
npm install

# 2. Jalankan server pengembang
npm run dev

# 3. Buka di browser
# http://localhost:3000
```
