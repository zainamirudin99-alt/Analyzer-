import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Optional AI Explanation & Academic Prose Polisher (Section N).
 * Strictly receives validated computation JSON and returns structured explanation prose ONLY;
 * NEVER computes or modifies numerical statistics, p-values, CIs, or rankings.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const summaryPayload = body?.summaryPayload;
    const clientApiKey = String(body?.apiKey || process.env.GEMINI_API_KEY || '').trim();

    if (!summaryPayload) {
      return NextResponse.json(
        { success: false, error: 'Ringkasan hasil komputasi tervalidasi wajib disertakan.' },
        { status: 400 }
      );
    }

    if (!clientApiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            'GEMINI_API_KEY belum dikonfigurasi pada Pengaturan atau server. Laporan jurnal deterministik tetap siap diedit dan diekspor tanpa AI.'
        },
        { status: 400 }
      );
    }

    const prompt = [
      'Anda adalah Profesor Ekonometrika Data Panel dan Measurement Error Models.',
      'Tugas Anda HANYA menyusun penjelasan akademik Bahasa Indonesia yang jernih dan objektif berdasarkan angka komputasi aktual di bawah ini.',
      'ATURAN KERAS ANTI-HALUSINASI:',
      '1. DILARANG mengarang angka statistik, p-value, confidence interval, atau sumber referensi baru.',
      '2. DILARANG membuat klaim peringkat apabila rankingAllowed bernilai false atau J = 2.',
      '3. DILARANG menyatakan korelasi tinggi berarti akurasi tinggi.',
      '4. Kembalikan JSON murni dengan kunci: {"discussion": "...", "conclusion": "...", "simpleSummary": "..."}.',
      '',
      'DATA HASIL KOMPUTASI TERVALIDASI:',
      JSON.stringify(summaryPayload, null, 2)
    ].join('\n');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(clientApiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: 'application/json'
        }
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Layanan AI mengembalikan status HTTP ${res.status}.` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const rawText: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(rawText);

    return NextResponse.json({
      success: true,
      data: {
        discussion: typeof parsed.discussion === 'string' ? parsed.discussion : null,
        conclusion: typeof parsed.conclusion === 'string' ? parsed.conclusion : null,
        simpleSummary: typeof parsed.simpleSummary === 'string' ? parsed.simpleSummary : null
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal memproses lapisan interpretasi AI.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
