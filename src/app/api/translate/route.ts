import { NextRequest, NextResponse } from 'next/server';

const ESG_DICTIONARY_ID_TO_EN: Record<string, string> = {
  'umum': 'General',
  'lingkungan': 'Environmental',
  'sosial': 'Social',
  'tata kelola': 'Governance',
  'emisi': 'Emissions',
  'energi': 'Energy',
  'air': 'Water',
  'limbah': 'Waste',
  'keanekaragaman hayati': 'Biodiversity',
  'keselamatan dan kesehatan kerja': 'Occupational Health and Safety',
  'kumpulan indikator kustom.': 'Custom indicator collection.',
  'salinan indikator ced standar yang dapat anda tambah, ubah, atau kurangi.': 'Editable copy of the standard 18 CED indicators.'
};

const ESG_DICTIONARY_EN_TO_ID: Record<string, string> = {
  'general': 'Umum',
  'environmental': 'Lingkungan',
  'social': 'Sosial',
  'governance': 'Tata Kelola',
  'emissions': 'Emisi',
  'energy': 'Energi',
  'water': 'Air',
  'waste': 'Limbah',
  'biodiversity': 'Keanekaragaman Hayati',
  'occupational health and safety': 'Keselamatan dan Kesehatan Kerja',
  'custom indicator collection.': 'Kumpulan indikator kustom.',
  'editable copy of the standard 18 ced indicators.': 'Salinan indikator CED standar yang dapat Anda tambah, ubah, atau kurangi.'
};

async function translateSingleText(text: string, targetLang: 'id' | 'en'): Promise<string> {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (targetLang === 'en' && ESG_DICTIONARY_ID_TO_EN[lower]) {
    return ESG_DICTIONARY_ID_TO_EN[lower];
  }
  if (targetLang === 'id' && ESG_DICTIONARY_EN_TO_ID[lower]) {
    return ESG_DICTIONARY_EN_TO_ID[lower];
  }

  const sourceLang = targetLang === 'en' ? 'id' : 'en';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(trimmed)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0]
          .map((segment: any) => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
          .join('');
        if (translated.trim()) {
          return translated.trim();
        }
      }
    }
  } catch {
    // Fallback ke kamus kata per kata jika jaringan terblokir
  }

  return trimmed;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const texts: string[] = Array.isArray(body?.texts) ? body.texts : [];
    const targetLang: 'id' | 'en' = body?.targetLang === 'en' ? 'en' : 'id';

    if (texts.length === 0) {
      return NextResponse.json({ translations: [] });
    }

    const translations = await Promise.all(
      texts.map(item => translateSingleText(String(item || ''), targetLang))
    );

    return NextResponse.json({ translations });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Translation failed', translations: [] },
      { status: 500 }
    );
  }
}

