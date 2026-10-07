/**
 * OpenAI / ChatGPT & Compatible AI Integration for CED Analyzer
 * Supports custom models (e.g. GPT Luna, GPT Pro, gpt-4o, etc.) and custom Base URL endpoints.
 */

import { CEDScores } from './types';
import { buildCEDPrompt, extractAndParseJSON, normalizeScores, preprocessTextForCED } from './gemini';

export interface OpenAIAnalysisOptions {
  companyCode: string;
  fiscalYear: string;
  pdfText?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface OpenAIAnalysisResult {
  success: boolean;
  scores: CEDScores;
  modelUsed: string;
  rawResponse?: string;
  error?: string;
}

export const DEFAULT_OPENAI_MODELS = [
  { id: 'gpt-4o', label: 'gpt-4o ⭐ (Flagship Multimodal & Fast)' },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini (Hemat Kuota & Ringan)' },
  { id: 'gpt-4-turbo', label: 'gpt-4-turbo (High Accuracy Reasoning)' },
  { id: 'o1-mini', label: 'o1-mini (Reasoning Model)' }
];

export function getCleanBaseUrl(baseUrl?: string): string {
  let url = (baseUrl || '').trim();
  if (!url) return 'https://api.openai.com/v1';
  return url.replace(/\/+$/, '');
}

export async function testOpenAIConnection(params: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<{ success: boolean; message: string; activeModel?: string }> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey) {
    return { success: false, message: 'API Key OpenAI belum diisi. Masukkan API Key dari platform OpenAI/provider terkait.' };
  }

  const model = (params.model || 'gpt-4o-mini').trim();
  const rootUrl = getCleanBaseUrl(params.baseUrl);
  const endpoint = `${rootUrl}/chat/completions`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Ping test. Reply with OK.' }],
        max_tokens: 5,
        temperature: 0
      })
    });

    if (res.ok) {
      return {
        success: true,
        message: `Koneksi ke AI Provider (${model}) BERHASIL 100%! 🚀 Model aktif dan siap menganalisis dokumen CED.`,
        activeModel: model
      };
    }

    const errJson = await res.json().catch(() => null);
    const errMsg = errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    return {
      success: false,
      message: `Gagal koneksi ke ${model}: ${errMsg}`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal menghubungi endpoint (${rootUrl}): ${err.message}`
    };
  }
}

export async function analyzeWithOpenAI(options: OpenAIAnalysisOptions): Promise<OpenAIAnalysisResult> {
  const apiKey = (options.apiKey || (typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : '') || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY belum dikonfigurasi. Masukkan API Key di tab Pengaturan atau file .env.local.');
  }

  const model = (options.model || (typeof process !== 'undefined' ? process.env.DEFAULT_OPENAI_MODEL : '') || 'gpt-4o-mini').trim();
  const rootUrl = getCleanBaseUrl(options.baseUrl || (typeof process !== 'undefined' ? process.env.OPENAI_BASE_URL : ''));
  const endpoint = `${rootUrl}/chat/completions`;

  const prompt = buildCEDPrompt(options.companyCode, options.fiscalYear);
  const processedText = options.pdfText ? preprocessTextForCED(options.pdfText, 45000) : '';

  const userContent = processedText
    ? `${prompt}\n\n=== TEKS DOKUMEN LAPORAN (${options.companyCode} ${options.fiscalYear}) ===\n${processedText}`
    : prompt;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert Indonesian ESG and Carbon Emission Disclosure (CED) auditor. You strictly output valid JSON with 18 CED indicators (cc1-cc2, ghg1-ghg7, ec1-ec3, rc1-rc4, acc1-acc2) scored 0 to 5.'
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(`OpenAI Error (${model}): ${msg}`);
  }

  const data = await res.json();
  const rawText = data.choices?.[0]?.message?.content || '';
  if (!rawText.trim()) {
    throw new Error(`Respons dari model ${model} kosong atau gagal diproses.`);
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
