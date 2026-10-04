# SOURCE OF TRUTH (Discovery Repositori)

Dokumen ini memuat seluruh fakta terverifikasi dari inspeksi langsung kode sumber, konfigurasi lingkungan, asumsi yang digunakan, serta pertanyaan terbuka. Sesuatu yang tidak terlihat secara langsung dari file kode dicatat secara tegas sebagai **"tidak diketahui"**.

---

## 1. Fakta yang Terverifikasi (Verified Facts)

### A. Repositori & Bahasa Pemrograman
- **Framework**: Next.js versi `14.2.25` (App Router).
- **Runtime Frontend**: React `18.3.1`, React DOM `18.3.1`.
- **Bahasa**: TypeScript versi `5.7.3`. Konfigurasi `tsconfig.json` menggunakan `target: es5`, `lib: ["dom", "dom.iterable", "esnext"]`, path alias `@/*` mengarah ke `./src/*`.
- **Node.js Lokal**: `v24.19.0` (terdeteksi via `node -v`).
- **NPM Lokal**: `11.17.0` dapat dijalankan via `npm.cmd`. Pemanggilan langsung `npm` terhalang oleh PowerShell ExecutionPolicy Restricted (`npm.ps1` diblokir).
- **Lockfile**: Tidak ditemukan file lock (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, maupun `bun.lockb`).
- **Node Modules**: Direktori `node_modules` belum ada secara lokal pada repositori ini saat discovery.
- **Python Lokal**: Windows App Execution Alias (`python.exe` mengarah ke Microsoft Store shortcut, binary asli Python belum terpasang atau belum didaftarkan di PATH sistem Windows).

### B. Dependensi (package.json)
- **Produksi**:
  - `@supabase/supabase-js`: `^2.48.1`
  - `clsx`: `^2.1.1`
  - `lucide-react`: `^0.475.0`
  - `next`: `^14.2.25`
  - `pdf-parse`: `^1.1.1`
  - `react`: `^18.3.1`
  - `react-dom`: `^18.3.1`
- **Pengembangan**:
  - `@types/node`: `^20.17.19`
  - `@types/pdf-parse`: `^1.1.4`
  - `@types/react`: `^18.3.18`
  - `@types/react-dom`: `^18.3.5`
  - `typescript`: `^5.7.3`
- **Testing**: Saat ini **tidak ada** pustaka pengujian terpasang (belum ada Jest, Vitest, Cypress, maupun Playwright di `package.json`).

### C. Konfigurasi Next.js & Vercel
- **`next.config.js`**:
  - `reactStrictMode: false`
  - `typescript.ignoreBuildErrors: true`
  - `eslint.ignoreDuringBuilds: true`
  - `experimental.serverComponentsExternalPackages: ['pdf-parse']`
- **`vercel.json`**:
  - `framework: "nextjs"`
  - `buildCommand: "next build"`
  - Cron keepalive: 2 cron job `/api/cron/keepalive` setiap pukul 00:00 dan 12:00 UTC untuk mencegah hibernasi Supabase Free Tier.

### D. Arsitektur Menu Eksisting ("Analisis CED")
- Terletak di tab navigasi `upload`, `results`, `guide`, dan `settings`.
- Menggunakan endpoint:
  - `POST /api/analyze`: Menerima FormData (file PDF atau teks, kode emiten, tahun fiskal), mengekstrak teks dengan `pdf-parse`, menganalisis 18 indikator CED via Google Gemini AI (`gemini-2.5-flash` / `gemini-3.7-flash`), dan menyimpan baris ke `ced_results`.
  - `GET, DELETE /api/results`: Mengambil dan menghapus riwayat analisis CED dari tabel Supabase `ced_results`.
  - `GET /api/settings`: Mengecek status koneksi Supabase.
  - `GET /api/cron/keepalive`: Memperbarui baris tabel `ced_heartbeat`.
- **Autentikasi**: Menu CED saat ini beroperasi **tanpa login** (semua pengunjung dapat mengunggah dan membaca tabel publik).

### E. Basis Data Supabase Eksisting (`schema.sql`)
- Tabel `public.ced_results`: 18 indikator CED, skor terakumulasi (`GENERATED ALWAYS AS`), RLS aktif dengan kebijakan `Public All Access` (`FOR ALL USING (true) WITH CHECK (true)`).
- Tabel `public.ced_heartbeat`: Pelacak ping keepalive.
- Tabel `public.app_settings`: Pasangan key-value untuk pengaturan model AI aktif.
- **Tabel Baru untuk Regresi**: Belum ada (`datasets`, `analyses`, `analysis_events` belum dibuat).
- **Storage**: Bucket `datasets` belum ada.

### F. Styling & Desain
- Menggunakan CSS murni di `src/app/globals.css` (2400+ baris).
- Menggunakan CSS variables / design tokens bertema hijau hutan (*forest green*), slate, dan emerald.
- Desain responsif dengan media queries `@media (max-width: 768px)`.
- Tidak menggunakan Tailwind CSS.

### G. Customization & Skills
- `.agents/skills/regresi-statistik-inti/SKILL.md`: Terpasang di workspace dan di global `~/.gemini/config/skills/`.
- `.agents/skills/regresi-statistik-remedial/SKILL.md`: Terpasang di workspace dan di global `~/.gemini/config/skills/`.
- `AGENTS.md`: Terpasang di akar repositori.

---

## 2. Hal-hal yang "Tidak Diketahui" (Unseen / Environment Bounds)

1. **Environment Variables Production**: Variabel lingkungan di dashboard Vercel production tidak terlihat langsung dari file kode lokal.
2. **Kredensial Aktif Supabase Remote**: File `.env.local` tidak ada di repositori lokal; hanya ada `.env.example`. URL dan kunci API Supabase aktual pengguna tidak diketahui secara lokal.
3. **Versi Python Vercel Production**: Versi Python spesifik yang diaktifkan Vercel (3.9 vs 3.10 vs 3.12) saat deployment live belum dapat dibaca langsung dari dashboard Vercel.
4. **Paket Vercel**: Apakah akun Vercel pengguna adalah *Hobby* (timeout 10s) atau *Pro* (timeout 60s) tidak diketahui.
5. **Konfigurasi Supabase Auth Provider**: Pengaturan auth provider di Supabase Dashboard (Email confirm on/off, OAuth provider) tidak diketahui dari repositori.

---

## 3. Asumsi yang Digunakan (Assumptions)

1. **Paket Vercel Serverless**: Diasumsikan minimal dapat mendukung batas `maxDuration = 15` hingga `60` detik untuk Vercel Function.
2. **Supabase Auth**: Untuk memenuhi persyaratan *tenant isolation* (pengguna hanya melihat datanya sendiri), Supabase Auth akan diintegrasikan dengan UI Login/Register modal atau form sederhana.
3. **Ukuran File Dataset**: Dataset umum penelitian/tugas akhir berkisar antara 10 KB sampai 3 MB (di bawah limit 10 MB per file Supabase Storage).
4. **Isolasi Menu CED**: Menu CED tetap berjalan persis seperti sekarang tanpa mewajibkan pengguna CED untuk login (akses tetap publik/anonim untuk CED).
5. **Testing**: Pustaka pengujian modern (Playwright untuk E2E dan Vitest/Jest untuk unit/integration) akan ditambahkan sebagai devDependencies.

---

## 4. Pertanyaan Terbuka (Open Questions)

1. **Metode Autentikasi Pengguna**: Apakah registrasi akun baru dibuka bebas via Email/Password Supabase, atau dibatasi, atau menggunakan Magic Link?
2. **Ketersediaan Python Lokal**: Karena mesin lokal Windows pengguna belum memiliki Python di PATH, apakah eksekusi tes mesin Python lokal akan menggunakan Python virtual environment (venv) yang diunduh/diinstal, atau diuji via Vercel CLI / script runner?
3. **Koneksi Supabase Testing**: Apakah pengujian migrasi SQL & RLS akan dijalankan langsung ke instance remote Supabase (memerlukan nilai `.env.local`) atau melalui Docker Supabase Local / Postgres in-memory?
