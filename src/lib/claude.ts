/**
 * Anthropic Claude AI Integration for CED Analyzer
 * Supports Claude Opus, Sonnet, Haiku, Research/Special series,
 * Extended Thinking workload levels (Low, Medium, Hard, Extra), and custom Base URL endpoints.
 */

import { CEDScores, IndicatorItem, RubricItem, RubricType } from './types';
import { buildAnalysisPrompt, buildCEDPrompt, extractAndParseJSON, normalizeScores, preprocessTextForCED } from './gemini';

export type ClaudeEffortLevel = 'low' | 'medium' | 'hard' | 'extra';

export interface ClaudeEffortConfig {
  id: ClaudeEffortLevel;
  label: string;
  description: string;
  budgetTokens: number;
  maxTokens: number;
}

export const CLAUDE_EFFORT_CONFIGS: Record<ClaudeEffortLevel, ClaudeEffortConfig> = {
  low: {
    id: 'low',
    label: 'Low (1.024 tokens)',
    description: 'Cepat & hemat token reasoning untuk verifikasi ringkas.',
    budgetTokens: 1024,
    maxTokens: 4096
  },
  medium: {
    id: 'medium',
    label: 'Medium (4.096 tokens)',
    description: 'Keseimbangan ideal antara kedalaman analisis ESG dan kecepatan.',
    budgetTokens: 4096,
    maxTokens: 8192
  },
  hard: {
    id: 'hard',
    label: 'Hard (16.384 tokens)',
    description: 'Penalaran mendalam untuk laporan keberlanjutan yang kompleks.',
    budgetTokens: 16384,
    maxTokens: 24576
  },
  extra: {
    id: 'extra',
    label: 'Extra (32.768 tokens)',
    description: 'Kapasitas penalaran maksimal untuk investigasi multi-indikator intensif.',
    budgetTokens: 32768,
    maxTokens: 40960
  }
};

export interface ClaudeModelCategory {
  category: string;
  models: { id: string; label: string; supportsThinking?: boolean }[];
}

export const CLAUDE_MODEL_CATEGORIES: ClaudeModelCategory[] = [
  {
    category: '1. Claude Opus (Penalaran Ekstrem & Arsitektur Kompleks)',
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (Flagship penalaran mendalam & agentic workflow)', supportsThinking: true },
      { id: 'claude-opus-5', label: 'Claude Opus 5 (Analisis riset ilmiah & logika tingkat tinggi)', supportsThinking: true },
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5 (Penalaran matematika & evaluasi multi-tahap)', supportsThinking: true },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Versi arsip/legacy)', supportsThinking: false }
    ]
  },
  {
    category: '2. Claude Sonnet (Keseimbangan Terbaik, Coding, & Serbaguna)',
    models: [
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (Standar utama coding lanjutan & tool use)', supportsThinking: true },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (Sintesis data, penulisan, & integrasi sistem)', supportsThinking: true },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude Sonnet 4 / 3.7 (Hybrid reasoning & adaptive thinking)', supportsThinking: true },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Versi populer untuk coding & Artifacts)', supportsThinking: false }
    ]
  },
  {
    category: '3. Claude Haiku (Cepat, Ringan, & Hemat Biaya)',
    models: [
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (Inferensi instan generasi terbaru)', supportsThinking: true },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (Klasifikasi teks & otomatisasi skala besar)', supportsThinking: true },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Operasional real-time & volume tinggi)', supportsThinking: false }
    ]
  },
  {
    category: '4. Seri Khusus / Riset',
    models: [
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (Long-horizon planning & tugas otonom mendalam)', supportsThinking: true }
    ]
  }
];

export const ALL_CLAUDE_MODELS = CLAUDE_MODEL_CATEGORIES.flatMap(cat => cat.models);

export interface ClaudeAnalysisOptions {
  companyCode: string;
  fiscalYear: string;
  pdfText?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  effort?: ClaudeEffortLevel;
  indicators?: IndicatorItem[];
  rubric?: RubricItem[];
  rubricType?: RubricType;
  skillContent?: string;
}

export interface ClaudeAnalysisResult {
  success: boolean;
  scores: Record<string, number>;
  modelUsed: string;
  rawResponse?: string;
  error?: string;
}

export function getCleanClaudeBaseUrl(baseUrl?: string): string {
  let url = (baseUrl || '').trim();
  if (!url) return 'https://api.anthropic.com/v1';
  return url.replace(/\/+$/, '');
}

export function isExtendedThinkingModel(modelId: string): boolean {
  const model = ALL_CLAUDE_MODELS.find(m => m.id === modelId);
  if (model) return Boolean(model.supportsThinking);
  // Default heuristik untuk model baru/kustom yang mengandung sonnet-3-7, opus, 5, atau fable
  return /3-7|opus|sonnet-5|haiku-5|fable/i.test(modelId);
}

/**
 * Uji koneksi API Key Claude ke endpoint Anthropic /v1/messages
 */
export async function testClaudeConnection(params: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  effort?: ClaudeEffortLevel;
}): Promise<{ success: boolean; message: string; activeModel?: string }> {
  const cleanKey = params.apiKey.trim();
  if (!cleanKey) {
    return { success: false, message: 'API Key Claude belum diisi. Masukkan API Key dari Anthropic Console.' };
  }

  const model = (params.model || 'claude-3-7-sonnet-20250219').trim();
  const rootUrl = getCleanClaudeBaseUrl(params.baseUrl);
  const endpoint = `${rootUrl}/messages`;
  const effortLevel = params.effort || 'medium';
  const effortConfig = CLAUDE_EFFORT_CONFIGS[effortLevel] || CLAUDE_EFFORT_CONFIGS.medium;

  const tryRequest = async (useThinking: boolean) => {
    const payload: Record<string, any> = {
      model,
      max_tokens: useThinking ? effortConfig.maxTokens : 20,
      messages: [{ role: 'user', content: 'Ping test. Balas singkat dengan kata OK.' }]
    };

    if (useThinking) {
      payload.thinking = {
        type: 'enabled',
        budget_tokens: effortConfig.budgetTokens
      };
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cleanKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });
  };

  try {
    const shouldTryThinking = isExtendedThinkingModel(model);
    let res = await tryRequest(shouldTryThinking);

    // Jika gagal karena parameter thinking tidak didukung oleh model tertentu, coba ulang tanpa thinking
    if (!res.ok && shouldTryThinking) {
      const errClone = await res.clone().json().catch(() => null);
      const errMsg = errClone?.error?.message || '';
      if (/thinking/i.test(errMsg) || /budget/i.test(errMsg) || /unsupported/i.test(errMsg)) {
        res = await tryRequest(false);
      }
    }

    if (res.ok) {
      return {
        success: true,
        message: `Koneksi ke Anthropic Claude (${model}) BERHASIL 100%! 🚀 Model aktif dan siap menganalisis dokumen CED (Tingkat Kerja: ${effortConfig.label}).`,
        activeModel: model
      };
    }

    const errJson = await res.json().catch(() => null);
    const errMsg = errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    return {
      success: false,
      message: `Gagal koneksi ke Claude (${model}): ${errMsg}`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal menghubungi endpoint Anthropic (${rootUrl}): ${err.message}`
    };
  }
}

/**
 * Eksekusi analisis dokumen CED menggunakan model Anthropic Claude
 */
export async function analyzeWithClaude(options: ClaudeAnalysisOptions): Promise<ClaudeAnalysisResult> {
  const apiKey = (options.apiKey || (typeof process !== 'undefined' ? process.env.ANTHROPIC_API_KEY : '') || '').trim();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY belum dikonfigurasi. Masukkan API Key di tab Pengaturan.');
  }

  const model = (options.model || (typeof process !== 'undefined' ? process.env.DEFAULT_CLAUDE_MODEL : '') || 'claude-3-7-sonnet-20250219').trim();
  const rootUrl = getCleanClaudeBaseUrl(options.baseUrl || (typeof process !== 'undefined' ? process.env.ANTHROPIC_BASE_URL : ''));
  const endpoint = `${rootUrl}/messages`;

  const effortLevel = options.effort || 'medium';
  const effortConfig = CLAUDE_EFFORT_CONFIGS[effortLevel] || CLAUDE_EFFORT_CONFIGS.medium;

  const prompt = buildAnalysisPrompt({
    companyCode: options.companyCode,
    fiscalYear: options.fiscalYear,
    indicators: options.indicators,
    rubric: options.rubric,
    rubricType: options.rubricType,
    skillContent: options.skillContent
  });
  const customKeys = options.indicators?.map(i => i.code);
  const processedText = options.pdfText ? preprocessTextForCED(options.pdfText, 45000) : '';

  const userContent = processedText
    ? `${prompt}\n\n=== TEKS DOKUMEN LAPORAN (${options.companyCode} ${options.fiscalYear}) ===\n${processedText}`
    : prompt;

  const systemPrompt =
    'You are an expert auditor for sustainability and disclosure indicators. ' +
    'You strictly evaluate the report and return ONLY a valid JSON object containing indicator scores each scored from 0 to 5, ' +
    'plus notes explaining key findings. Do not include markdown codeblock wrappers like ```json if possible, just the raw JSON.';

  const executeRequest = async (useThinking: boolean) => {
    const payload: Record<string, any> = {
      model,
      system: systemPrompt,
      max_tokens: useThinking ? effortConfig.maxTokens : 4096,
      messages: [{ role: 'user', content: userContent }]
    };

    if (useThinking) {
      payload.thinking = {
        type: 'enabled',
        budget_tokens: effortConfig.budgetTokens
      };
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });
  };

  const shouldTryThinking = isExtendedThinkingModel(model);
  let res = await executeRequest(shouldTryThinking);

  // Fallback tanpa extended thinking jika model menolaknya
  if (!res.ok && shouldTryThinking) {
    const errClone = await res.clone().json().catch(() => null);
    const errMsg = errClone?.error?.message || '';
    if (/thinking/i.test(errMsg) || /budget/i.test(errMsg) || /unsupported/i.test(errMsg)) {
      res = await executeRequest(false);
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    const msg = errBody?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(`Claude API Error (${model}): ${msg}`);
  }

  const data = await res.json();

  // Anthropic messages content adalah array blok { type: 'text' | 'thinking', text: '...' }
  let rawText = '';
  if (Array.isArray(data.content)) {
    const textBlocks = data.content.filter((b: any) => b.type === 'text');
    rawText = textBlocks.map((b: any) => b.text).join('\n');
  } else if (typeof data.content === 'string') {
    rawText = data.content;
  }

  if (!rawText.trim()) {
    throw new Error(`Respons teks dari model Claude ${model} kosong atau gagal diproses.`);
  }

  const parsedRaw = extractAndParseJSON(rawText, customKeys);
  const scores = normalizeScores(parsedRaw, customKeys, options.rubric, options.rubricType);

  return {
    success: true,
    scores,
    modelUsed: `${model} (${effortConfig.label})`,
    rawResponse: rawText
  };
}
