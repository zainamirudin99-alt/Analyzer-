import { describe, it, expect } from 'vitest';
import { getCleanBaseUrl, DEFAULT_OPENAI_MODELS } from '../../src/lib/openai';
import { extractAndParseJSON, normalizeScores } from '../../src/lib/gemini';
import { calculateTotalScore, calculateDisclosureLevel } from '../../src/lib/types';

describe('Multi-AI Provider Integration Tests', () => {
  it('membersihkan Base URL OpenAI / Compatible secara konsisten', () => {
    expect(getCleanBaseUrl('')).toBe('https://api.openai.com/v1');
    expect(getCleanBaseUrl('   ')).toBe('https://api.openai.com/v1');
    expect(getCleanBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
    expect(getCleanBaseUrl('https://openrouter.ai/api/v1///')).toBe('https://openrouter.ai/api/v1');
    expect(getCleanBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1');
  });

  it('memastikan model bawaan OpenAI terdefinisi lengkap', () => {
    expect(DEFAULT_OPENAI_MODELS.length).toBeGreaterThanOrEqual(4);
    const modelIds = DEFAULT_OPENAI_MODELS.map(m => m.id);
    expect(modelIds).toContain('gpt-4o');
    expect(modelIds).toContain('gpt-4o-mini');
  });

  it('mampu mem-parsing dan menormalkan JSON respons 18 indikator CED dari model OpenAI/Custom (e.g. GPT Luna / GPT Pro)', () => {
    const mockModelOutput = `
\`\`\`json
{
  "cc1": 3,
  "cc2": 2,
  "ghg1": 5,
  "ghg2": 4,
  "ghg3": 1,
  "ghg4": 0,
  "ghg5": 3,
  "ghg6": 2,
  "ghg7": 1,
  "ec1": 4,
  "ec2": 3,
  "ec3": 2,
  "rc1": 3,
  "rc2": 2,
  "rc3": 1,
  "rc4": 0,
  "acc1": 4,
  "acc2": 3
}
\`\`\`
    `;

    const rawParsed = extractAndParseJSON(mockModelOutput);
    const scores = normalizeScores(rawParsed);

    expect(scores.cc1).toBe(3);
    expect(scores.ghg1).toBe(5);
    expect(scores.ghg4).toBe(0);
    expect(scores.acc2).toBe(3);

    const total = calculateTotalScore(scores);
    expect(total).toBe(3 + 2 + 5 + 4 + 1 + 0 + 3 + 2 + 1 + 4 + 3 + 2 + 3 + 2 + 1 + 0 + 4 + 3);
    expect(calculateDisclosureLevel(total)).toBe('Sedang (Moderate)');
  });

  it('menangani respons model AI kustom yang tidak sempurna dengan clamp 0-5', () => {
    const noisyOutput = JSON.stringify({
      CC1: 10, // melebihi 5 -> harus di-clamp ke 5
      GHG1: -2, // negatif -> harus di-clamp ke 0
      EC1: '4', // string angka -> parse ke integer 4
      ACC1: 'invalid' // non-angka -> fallback 0
    });

    const parsed = extractAndParseJSON(noisyOutput);
    const normalized = normalizeScores(parsed);

    expect(normalized.cc1).toBe(5);
    expect(normalized.ghg1).toBe(0);
    expect(normalized.ec1).toBe(4);
    expect(normalized.acc1).toBe(0);
  });
});
