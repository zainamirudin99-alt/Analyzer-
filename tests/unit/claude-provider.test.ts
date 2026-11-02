import { describe, it, expect } from 'vitest';
import {
  getCleanClaudeBaseUrl,
  CLAUDE_MODEL_CATEGORIES,
  ALL_CLAUDE_MODELS,
  CLAUDE_EFFORT_CONFIGS,
  isExtendedThinkingModel,
  ClaudeEffortLevel
} from '../../src/lib/claude';
import { extractAndParseJSON, normalizeScores } from '../../src/lib/gemini';
import { calculateTotalScore, calculateDisclosureLevel } from '../../src/lib/types';

describe('Anthropic Claude Provider Integration Tests', () => {
  it('membersihkan Base URL Claude secara konsisten', () => {
    expect(getCleanClaudeBaseUrl('')).toBe('https://api.anthropic.com/v1');
    expect(getCleanClaudeBaseUrl('   ')).toBe('https://api.anthropic.com/v1');
    expect(getCleanClaudeBaseUrl('https://api.anthropic.com/v1/')).toBe('https://api.anthropic.com/v1');
    expect(getCleanClaudeBaseUrl('https://custom-proxy.internal/v1///')).toBe('https://custom-proxy.internal/v1');
  });

  it('memastikan 4 kategori model Claude terdefinisi lengkap sesuai permintaan pengguna', () => {
    expect(CLAUDE_MODEL_CATEGORIES.length).toBe(4);

    const cat1 = CLAUDE_MODEL_CATEGORIES[0];
    expect(cat1.category).toContain('Claude Opus');
    expect(cat1.models.map(m => m.id)).toEqual([
      'claude-opus-5-5',
      'claude-opus-5',
      'claude-opus-4-5',
      'claude-3-opus-20240229'
    ]);

    const cat2 = CLAUDE_MODEL_CATEGORIES[1];
    expect(cat2.category).toContain('Claude Sonnet');
    expect(cat2.models.map(m => m.id)).toEqual([
      'claude-sonnet-5-5',
      'claude-sonnet-5',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022'
    ]);

    const cat3 = CLAUDE_MODEL_CATEGORIES[2];
    expect(cat3.category).toContain('Claude Haiku');
    expect(cat3.models.map(m => m.id)).toEqual([
      'claude-haiku-5-5',
      'claude-haiku-4-5',
      'claude-3-5-haiku-20241022'
    ]);

    const cat4 = CLAUDE_MODEL_CATEGORIES[3];
    expect(cat4.category).toContain('Seri Khusus / Riset');
    expect(cat4.models.map(m => m.id)).toEqual([
      'claude-fable-5-1'
    ]);
  });

  it('memverifikasi konfigurasi tingkat kerja (Extended Thinking Budget)', () => {
    const levels: ClaudeEffortLevel[] = ['low', 'medium', 'hard', 'extra'];
    levels.forEach(lvl => {
      expect(CLAUDE_EFFORT_CONFIGS[lvl]).toBeDefined();
      expect(CLAUDE_EFFORT_CONFIGS[lvl].budgetTokens).toBeGreaterThan(0);
      expect(CLAUDE_EFFORT_CONFIGS[lvl].maxTokens).toBeGreaterThan(CLAUDE_EFFORT_CONFIGS[lvl].budgetTokens);
    });

    expect(CLAUDE_EFFORT_CONFIGS.low.budgetTokens).toBe(1024);
    expect(CLAUDE_EFFORT_CONFIGS.medium.budgetTokens).toBe(4096);
    expect(CLAUDE_EFFORT_CONFIGS.hard.budgetTokens).toBe(16384);
    expect(CLAUDE_EFFORT_CONFIGS.extra.budgetTokens).toBe(32768);
  });

  it('mendeteksi kapabilitas Extended Thinking pada model dengan tepat', () => {
    expect(isExtendedThinkingModel('claude-3-7-sonnet-20250219')).toBe(true);
    expect(isExtendedThinkingModel('claude-opus-5-5')).toBe(true);
    expect(isExtendedThinkingModel('claude-fable-5-1')).toBe(true);
    expect(isExtendedThinkingModel('claude-3-5-sonnet-20241022')).toBe(false);
    expect(isExtendedThinkingModel('claude-3-opus-20240229')).toBe(false);
  });

  it('mampu memproses respons JSON 18 indikator CED dari Claude', () => {
    const mockClaudeRaw = JSON.stringify({
      cc1: 4,
      cc2: 5,
      ghg1: 5,
      ghg2: 3,
      ghg3: 2,
      ghg4: 1,
      ghg5: 4,
      ghg6: 3,
      ghg7: 2,
      ec1: 5,
      ec2: 4,
      ec3: 3,
      rc1: 4,
      rc2: 3,
      rc3: 2,
      rc4: 1,
      acc1: 5,
      acc2: 4
    });

    const parsed = extractAndParseJSON(mockClaudeRaw);
    const scores = normalizeScores(parsed);

    expect(scores.cc1).toBe(4);
    expect(scores.cc2).toBe(5);
    expect(scores.acc1).toBe(5);

    const total = calculateTotalScore(scores);
    expect(total).toBe(60);
    expect(calculateDisclosureLevel(total)).toBe('Tinggi (Substantial)');
  });
});
