// ============================================================
// Google Gemini AI Integration for CED Analyzer
// ============================================================

import { CEDScores, INDICATOR_KEYS } from './types';

export const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite'
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
 * Panggil Gemini AI dengan dual strategy (Header x-goog-api-key dan URL Query Key)
 */
export async function executeGeminiRequest(model: string, apiKey: string, requestBody: any): Promise<Response> {
  const cleanKey = apiKey.trim();

  // Strategi 1: Header x-goog-api-key (standar resmi Google AI Studio untuk format AQ... & AIza...)
  const urlHeader = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  try {
    const res1 = await fetch(urlHeader, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey
      },
      body: JSON.stringify(requestBody)
    });

    if (res1.status === 200) return res1;

    // Jika strategi 1 gagal bukan karena model 404/429, coba strategi 2 (URL Query ?key=)
    if (res1.status === 400 || res1.status === 401 || res1.status === 403) {
      const urlQuery = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const res2 = await fetch(urlQuery, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (res2.status === 200) return res2;
      return res2;
    }

    return res1;
  } catch (err: any) {
    const urlQuery = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
    return fetch(urlQuery, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
  }
}

/**
 * Panggil Gemini AI Studio API dengan model queue fallback
 */
export async function analyzeWithGemini(options: GeminiAnalysisOptions): Promise<GeminiAnalysisResult> {
  const apiKey = (options.apiKey || (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi. Masukkan API Key di tab Pengaturan atau file .env.local.');
  }

  let primaryModel = (options.preferredModel || (typeof process !== 'undefined' ? process.env.DEFAULT_GEMINI_MODEL : '') || 'gemini-3.6-flash').trim();
  if (primaryModel === 'gemini-2.5-flash' || !primaryModel) {
    primaryModel = 'gemini-3.6-flash';
  }
  const modelQueue = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];
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
        console.warn(`[Gemini CED] ${lastError} Beralih ke fallback model berikutnya...`);
        continue;
      }

      if (response.status === 404) {
        lastError = `Model ${model} tidak ditemukan atau deprecated (404).`;
        console.warn(`[Gemini CED] ${lastError} Beralih ke fallback model berikutnya...`);
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
