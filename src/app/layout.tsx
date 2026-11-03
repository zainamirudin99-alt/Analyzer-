import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export const metadata: Metadata = {
  title: 'ANALYZER(?)',
  description: 'Aplikasi Analisis Indikator Dokumen AI, Regresi Linier SPSS & Regresi Data Panel Stata Menggunakan Multi-Model AI & Supabase.',
  keywords: ['ANALYZER(?)', 'Document Indicator Analyzer', 'SPSS Regression', 'Stata Panel Regression', 'ESG', 'Gemini AI', 'Supabase'],
  authors: [{ name: 'ANALYZER(?) Team' }],
  icons: {
    icon: '/favicon.png?v=2',
    shortcut: '/favicon.png?v=2',
    apple: '/logo.png?v=2',
  }
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
