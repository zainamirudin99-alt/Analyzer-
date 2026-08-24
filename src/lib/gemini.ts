// ============================================================
// Google Gemini AI Integration for CED Analyzer
// Multi-Model Auto-Discovery & Resilient Fallback Engine
// ============================================================

import { CEDScores, INDICATOR_KEYS } from './types';

export const PROVEN_GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash'
];

export interface GeminiAnalysisOptions {
  companyCode: string;
  fiscalYear: string;
  pdfText?: string;
  pdfBase64?: string;
  apiKey?: string;
  preferredModel?: string;
}

export interface GeminiAnalysisResult {
  success: boolean;
  scores: CEDScores;
  modelUsed: string;
  rawResponse?: string;
  error?: string;
}

export function buildCEDPrompt(companyCode: string, fiscalYear: string): string {
  return `Saya adalah peneliti yang ingin mengidentifikasi mengenai carbon emission disclosure pada perusahaan tambang di negara Indonesia. Saya ingin mengidentifikai carbon emission disclosure dengan menggunakan Indikator berikut! Terdapat 18 indikator yaitu:

1. CC1 – Penilaian/deskripsi dari risiko (peraturan/regulasi baik khusus maupun umum) yang berhubungan dengan perubahan iklim dan aksi yang dilakukan atau aksi yang dilakukan untuk mengatasi risiko tersebut.
2. CC2 – Penilaian/deskripsi saat ini (dan masa depan) dari implikasi keuangan, implikasi bisnis dan peluang dari perubahan iklim.
3. GHG1 – Deskripsi tentang metodologi yang digunakan untuk mengkalkulasi (menghitung) emisi GRK (gas rumah kaca atau ISO).
4. GHG2 – Keberadaan verifikasi dari pihak eksternal dalam mengukur jumlah emisi GRK oleh siapa dan pada dasar apa.
5. GHG3 – Total emisi GRK yang dihasilkan.
6. GHG4 – Pengungkapan lingkup 1 dan 2, atau lingkup 3 emisi GRK langsung.
7. GHG5 – Pengungkapan emisi GRK berasarkan pada asal maupun sumber (misalnya: batu bara. Listrik, dll).
8. GHG6 - Pengungkapan emisi GRK berdasarkan fasilitas atau level segmen dari GRK.
9. GHG7 – Perbandingan emisi GRK dengan tahun sebelumnya.
10. EC1 – Total energi yang dikonsumsi (misalnya adakah; liter, tera joule PETA-joule).
11. EC2 – Kuantifikasi energi yang digunakan dari sumber daya yang dapat di perbaharuhi.
12. EC3 – Pengungkapan menurut tipe/jenis, fasilitas atau segmen.
13. RC1 – Rencana atau strategi yang detail untuk mengurangi emisi GRK.
14. RC2 – Spesifikasi dari target tingkat/level dan tahun untuk mengurangi emisi GRK.
15. RC3 – Pengurangan emisi dan biaya atau tabungan (cost or saving) yang dicapai saat ini sebagai akibat dari rencana pengurangan emisi karbon.
16. RC4 – Biaya dari biaya emisi masa depan yang diperhitungkan dalam perencanaan belanja modal (capital expenditure planning).
17. ACC1 – Indikasi dari dewan komite (atau badan eksekutif lainnya) yang memiliki tanggungjawab atas tindakan yang berhubungan dengan perubahan iklim.
18. ACC2 – Deskripsi dari mekanisme dimana dewan (atau suatu badan eksekutif lain) melakukan peninjauan kemajuan perusahaan mengenai perubahan iklim.

Indikator di atas dinilai dengan berdasarkan ketentuan poin 0-5, yang berisikan kriteria berikut!
Scoring
Each indicator was scored on a scale from 0 to 5 based on the extent of disclosure.
0: No disclosure (Tidak ada pengungkapan sama sekali).
1: Disclosed in fewer than three sentences (Diungkapkan dalam kurang dari 3 kalimat).
2: Disclosed in three sentences or one paragraph, no more than half a page (Diungkapkan dalam 3 kalimat atau 1 paragraf, tidak lebih dari 1/2 halaman).
3: Disclosed in at least half a page but less than one A4 page (Diungkapkan minimal 1/2 halaman tetapi kurang dari 1 halaman A4).
4: Disclosed on a full A4 page (Diungkapkan pada 1 halaman A4 penuh).
5: Disclosed on more than one A4 page (Diungkapkan lebih dari 1 halaman A4).

Berikut terlampir dokumen laporan tahunan / laporan keberlanjutan perusahaan "${companyCode}" untuk tahun fiskal "${fiscalYear}".
Bantulah untuk mengidentifikasi ke-18 indikator di atas yang berada pada dokumen dengan nilai skor 0 sampai 5.

INSTRUKSI OUTPUT WAJIB:
Kembalikan HANYA objek JSON murni tanpa markdown, tanpa teks pembuka atau penutup:
{"CC1":0,"CC2":0,"GHG1":0,"GHG2":0,"GHG3":0,"GHG4":0,"GHG5":0,"GHG6":0,"GHG7":0,"EC1":0,"EC2":0,"EC3":0,"RC1":0,"RC2":0,"RC3":0,"RC4":0,"ACC1":0,"ACC2":0}`;
}

/**
 * Ekstraktor JSON yang tangguh (robust JSON parser)
 */
function extractAndParseJSON(rawText: string): Record<string, number> {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const startIdx = cleaned.indexOf('{');
  if (startIdx !== -1) {
    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    const jsonSubstring = endIdx !== -1
      ? cleaned.substring(startIdx, endIdx + 1)
      : cleaned.substring(startIdx) + '}';

    try {
      return JSON.parse(jsonSubstring);
    } catch {
      // lanjut ke fallback regex parser
    }
  }

  const fallbackScores: Record<string, number> = {};
  const regex = /"?(CC[12]|GHG[1-7]|EC[123]|RC[1-4]|ACC[12])"?\s*:\s*([0-5])/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawText)) !== null) {
    const key = match[1].toUpperCase();
    const val = parseInt(match[2], 10);
    fallbackScores[key] = isNaN(val) ? 0 : Math.max(0, Math.min(5, val));
  }

  return fallbackScores;
}

function normalizeScores(rawObj: Record<string, any>): CEDScores {
  const result: CEDScores = {
    cc1: 0, cc2: 0,
    ghg1: 0, ghg2: 0, ghg3: 0, ghg4: 0, ghg5: 0, ghg6: 0, ghg7: 0,
    ec1: 0, ec2: 0, ec3: 0,
    rc1: 0, rc2: 0, rc3: 0, rc4: 0,
    acc1: 0, acc2: 0
  };

  INDICATOR_KEYS.forEach((k) => {
    const upper = k.toUpperCase();
    const val = rawObj[upper] ?? rawObj[k] ?? 0;
    const num = parseInt(String(val), 10);
    result[k] = isNaN(num) ? 0 : Math.max(0, Math.min(5, num));
  });

  return result;
}

/**
 * Deteksi otomatis model yang aktif dan tersedia untuk API Key pengguna di endpoint resmi v1beta
 */
export async function getAvailableModelsFromApi(apiKey: string): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return PROVEN_GEMINI_MODELS;

  const endpoints = [
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models`,
      headers: { 'x-goog-api-key': cleanKey }
    },
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`,
      headers: {}
    }
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: 'GET',
        headers: ep.headers
      });

      if (res.ok) {
        const data = await res.json();
        if (data.models && Array.isArray(data.models)) {
          const validModels: string[] = data.models
            .filter((m: any) => {
              const methods: string[] = m.supportedGenerationMethods || [];
              return methods.includes('generateContent');
            })
            .map((m: any) => (m.name || '').replace(/^models\//, ''));

          if (validModels.length > 0) {
            const sorted = [
              ...validModels.filter(m => m.includes('1.5-flash') && !m.includes('8b')),
              ...validModels.filter(m => m.includes('2.0-flash')),
              ...validModels.filter(m => m.includes('1.5-pro')),
              ...validModels.filter(m => !m.includes('flash') && !m.includes('pro')),
              ...validModels.filter(m => m.includes('8b'))
            ];
            console.log(`[Gemini API] Berhasil mendeteksi ${sorted.length} model aktif dari Google AI Studio:`, sorted);
            return Array.from(new Set(sorted));
          }
        }
      }
    } catch (e) {
      console.warn('[Gemini Model Discovery Error]:', e);
    }
  }

  return PROVEN_GEMINI_MODELS;
}

/**
 * Panggil Gemini AI Studio menggunakan endpoint resmi v1beta
 */
export async function executeGeminiRequest(model: string, apiKey: string, requestBody: any): Promise<Response> {
  const cleanKey = apiKey.trim();
  const cleanModel = model.replace(/^models\//, '');

  const attempts = [
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey
      }
    },
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(cleanKey)}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  ];

  let lastResponse: Response | null = null;

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify(requestBody)
      });

      if (res.ok) return res;
      lastResponse = res;
    } catch (err: any) {
      console.warn(`[Gemini Request Failed on ${attempt.url}]:`, err?.message);
    }
  }

  return lastResponse || new Response(JSON.stringify({ error: { message: 'Gagal menghubungi server Google AI Studio (v1beta).' } }), { status: 500 });
}

/**
 * Analisis CED dengan Gemini AI & Automatic Model Discovery
 */
export async function analyzeWithGemini(options: GeminiAnalysisOptions): Promise<GeminiAnalysisResult> {
  const apiKey = (options.apiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi. Masukkan API Key di tab Pengaturan atau file .env.local.');
  }

  // 1. Temukan model yang aktif secara otomatis untuk API Key pengguna
  const discoveredModels = await getAvailableModelsFromApi(apiKey);
  
  let primaryModel = (options.preferredModel || (typeof process !== 'undefined' ? process.env.DEFAULT_GEMINI_MODEL : '') || 'gemini-1.5-flash').trim();
  if (!primaryModel || primaryModel.includes('3.6') || primaryModel.includes('3.5') || primaryModel.includes('2.5')) {
    primaryModel = discoveredModels[0] || 'gemini-1.5-flash';
  }

  const modelQueue = Array.from(new Set([
    primaryModel,
    ...discoveredModels,
    ...PROVEN_GEMINI_MODELS
  ]));

  const prompt = buildCEDPrompt(options.companyCode, options.fiscalYear);
  let lastError = '';

  for (const model of modelQueue) {
    console.log(`[Gemini CED] Mencoba model: ${model}...`);

    const parts: any[] = [];
    if (options.pdfText && options.pdfText.trim().length > 50) {
      parts.push({
        text: `--- KONTEN TEKS LAPORAN TAHUNAN / LAPORAN KEBERLANJUTAN (HASIL EKSTRAKSI PDF) ---\n\n${options.pdfText}\n\n--- AKHIR DOKUMEN ---`
      });
    } else if (options.pdfBase64) {
      parts.push({
        inline_data: {
          mime_type: 'application/pdf',
          data: options.pdfBase64
        }
      });
    } else {
      throw new Error('Tidak ada teks dokumen atau file PDF yang diberikan untuk dianalisis.');
    }

    parts.push({ text: prompt });

    const requestBody = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json'
      }
    };

    try {
      const response = await executeGeminiRequest(model, apiKey, requestBody);

      if (response.status === 200) {
        const data = await response.json();
        const candidate = data.candidates?.[0];
        const rawText = candidate?.content?.parts?.map((p: any) => p.text || '').join('') || '';

        if (!rawText) {
          throw new Error('Respons AI kosong.');
        }

        const parsedRaw = extractAndParseJSON(rawText);
        const scores = normalizeScores(parsedRaw);

        return {
          success: true,
          scores,
          modelUsed: model,
          rawResponse: rawText
        };
      }

      if (response.status === 429) {
        lastError = `Model ${model} terkena limit kuota (429 Rate Limit).`;
        console.warn(`[Gemini CED] ${lastError} Beralih ke model berikutnya...`);
        continue;
      }

      if (response.status === 404) {
        lastError = `Model ${model} tidak ditemukan di Google AI Studio (404).`;
        console.warn(`[Gemini CED] ${lastError} Beralih ke model berikutnya...`);
        continue;
      }

      const errorText = await response.text();
      lastError = `HTTP ${response.status} (${model}): ${errorText.substring(0, 200)}`;
      console.warn(`[Gemini CED] Error: ${lastError}`);
    } catch (err: any) {
      lastError = `Fetch gagal untuk model ${model}: ${err?.message || String(err)}`;
      console.warn(`[Gemini CED] Exception: ${lastError}`);
    }
  }

  throw new Error(`Semua model Gemini AI gagal diakses. Error terakhir: ${lastError}`);
}

export const FALLBACK_MODELS = PROVEN_GEMINI_MODELS;
