import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export const metadata: Metadata = {
  title: 'PDF Analyzer – Carbon Emission Disclosure (CED)',
  description: 'Aplikasi Analisis Otomatis 18 Indikator Carbon Emission Disclosure pada Laporan Tahunan Perusahaan Menggunakan Google Gemini AI & Supabase.',
  keywords: ['Carbon Emission Disclosure', 'CED Analyzer', 'PDF Analyzer', 'ESG', 'Gemini AI', 'Supabase', 'Sustainability Report'],
  authors: [{ name: 'Analyzer AI Team' }],
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/logo.png',
  }
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
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
