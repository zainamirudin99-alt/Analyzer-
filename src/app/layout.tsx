import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export const metadata: Metadata = {
  title: 'Analyzer – Carbon Emission Disclosure (CED)',
  description: 'Aplikasi Analisis Otomatis 18 Indikator Carbon Emission Disclosure pada Laporan Tahunan Perusahaan Menggunakan Google Gemini AI & Supabase.',
  keywords: ['Carbon Emission Disclosure', 'CED Analyzer', 'ESG', 'Gemini AI', 'Supabase', 'Sustainability Report'],
  authors: [{ name: 'Analyzer AI Team' }]
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
