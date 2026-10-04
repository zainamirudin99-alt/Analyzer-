# ADR-02: Arsitektur Unggah Supabase Storage dan Kebijakan RLS

- **Status**: Disetujui (Approved)
- **Tanggal**: 2026-10-04
- **Penulis**: Senior Software Engineer Agent

---

## 1. Konteks

Pengguna perlu mengunggah file dataset (`.xlsx`, `.xls`, `.csv`) berukuran hingga 10 MB ke bucket Supabase Storage privat bernama `datasets`. Terdapat dua pendekatan umum dalam ekosistem Supabase:
1. **Pendekatan A (Signed Upload URL via Service Role)**: Server API route membuat URL signed upload menggunakan service_role key, lalu klien melakukan PUT ke URL tersebut.
2. **Pendekatan B (Direct Authenticated Client Upload via User JWT)**: Klien web yang telah terautentikasi (memiliki JWT sesi Supabase Auth) langsung mengunggah file ke Storage via client SDK `@supabase/supabase-js`.

---

## 2. Analisis & Temuan Verifikasi

- Pada Pendekatan A, pembuatan Signed Upload URL sering kali menimbulkan anomali pada evaluasi RLS Supabase Storage. Karena URL ditandatangani oleh `service_role`, konteks `auth.uid()` pada token pengguna dapat hilang atau tidak cocok saat dievaluasi oleh policy `storage.objects` berbasis `auth.uid() = (storage.foldername(name))[1]`. Jika RLS diaktifkan ketat, operasi PUT klien sering kali tertolak (HTTP 403 / 400). Selain itu, jika server mengeksekusi unggah secara proxy melalui Vercel Function, file harus transit di serverless yang membebani memori dan kuota Vercel Function payload (maksimal 4,5 MB pada request body serverless Vercel!).
- Pada Pendekatan B, klien mengunggah langsung ke endpoint REST Supabase Storage dengan menyertakan header `Authorization: Bearer <user_jwt>`. Supabase Storage mengevaluasi RLS objek secara deterministik:
  ```sql
  bucket_id = 'datasets' AND (storage.foldername(name))[1] = auth.uid()::text
  ```
  Dengan cara ini, file 10 MB mengalir langsung dari peramban ke storage cloud tanpa membebani server Next.js/Vercel sama sekali, dan kepemilikan file diisolasi secara native oleh PostgreSQL RLS.

---

## 3. Keputusan

Kami menetapkan **Pendekatan B: Direct Authenticated Client Upload**.
- Format path penyimpanan: `{auth.uid()}/{dataset_id}/{original_name}`.
- Keamanan: Klien terautentikasi hanya memiliki akses write dan read pada subfolder yang diawali oleh `auth.uid()` miliknya. Pengguna B diblokir secara fisik oleh RLS jika mencoba membaca atau mengunggah ke folder milik Pengguna A.
- Untuk import via link (Google Sheets), server route Next.js mengunduh spreadsheet dari Google secara aman (dengan perlindungan SSRF), memvalidasi signature file, lalu mengunggah ke bucket storage atas nama pengguna yang terotentikasi.
