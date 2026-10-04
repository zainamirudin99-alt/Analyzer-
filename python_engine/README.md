# Python Engine Scripts (Archive / Offline Utility)

Folder ini berisi skrip Python offline yang sebelumnya berada di `/api/engine`.
Folder dipindahkan dari `/api` ke `python_engine/` untuk mencegah **Vercel Serverless Function Collision**, di mana Vercel secara default memprioritaskan file Python di root `/api` di atas rute Next.js App Router (`src/app/api/engine/*`).

Seluruh mesin statistik produksi, uji asumsi klasik, validasi Invarian I1-I9, benchmark NIST StRD, dan ekspor DOCX dijalankan secara native oleh TypeScript engine di `src/lib/regression-engine.ts` dan dilayani oleh endpoint Next.js App Router (`src/app/api/engine/*`).
