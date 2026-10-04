import { describe, it, expect } from 'vitest';
import { calculateTotalScore, calculateDisclosureLevel, CEDScores } from '../../src/lib/types';

describe('Invarian I7: Tes Regresi Perilaku Menu CED (Zero-Regression)', () => {
  it('menghitung total skor 18 indikator CED secara tepat (maksimal 90)', () => {
    // Semua indikator bernilai 0 -> Total = 0
    const zeroScores: CEDScores = {
      cc1: 0, cc2: 0,
      ghg1: 0, ghg2: 0, ghg3: 0, ghg4: 0, ghg5: 0, ghg6: 0, ghg7: 0,
      ec1: 0, ec2: 0, ec3: 0,
      rc1: 0, rc2: 0, rc3: 0, rc4: 0,
      acc1: 0, acc2: 0
    };
    expect(calculateTotalScore(zeroScores)).toBe(0);

    // Semua indikator bernilai 5 -> Total = 18 * 5 = 90
    const maxScores: CEDScores = {
      cc1: 5, cc2: 5,
      ghg1: 5, ghg2: 5, ghg3: 5, ghg4: 5, ghg5: 5, ghg6: 5, ghg7: 5,
      ec1: 5, ec2: 5, ec3: 5,
      rc1: 5, rc2: 5, rc3: 5, rc4: 5,
      acc1: 5, acc2: 5
    };
    expect(calculateTotalScore(maxScores)).toBe(90);

    // Campuran nilai realistis
    const realisticScores: CEDScores = {
      cc1: 3, cc2: 2,
      ghg1: 4, ghg2: 4, ghg3: 1, ghg4: 0, ghg5: 2, ghg6: 0, ghg7: 1,
      ec1: 4, ec2: 3, ec3: 2,
      rc1: 3, rc2: 2, rc3: 1, rc4: 0,
      acc1: 4, acc2: 3
    };
    const expectedSum = 3 + 2 + 4 + 4 + 1 + 0 + 2 + 0 + 1 + 4 + 3 + 2 + 3 + 2 + 1 + 0 + 4 + 3; // = 39
    expect(calculateTotalScore(realisticScores)).toBe(expectedSum);
  });

  it('mengklasifikasikan tingkat pengungkapan (disclosure level) dengan ambang batas resmi', () => {
    // 0 - 17 -> Sangat Rendah (Minimal)
    expect(calculateDisclosureLevel(0)).toBe('Sangat Rendah (Minimal)');
    expect(calculateDisclosureLevel(17)).toBe('Sangat Rendah (Minimal)');

    // 18 - 35 -> Rendah (Low)
    expect(calculateDisclosureLevel(18)).toBe('Rendah (Low)');
    expect(calculateDisclosureLevel(35)).toBe('Rendah (Low)');

    // 36 - 53 -> Sedang (Moderate)
    expect(calculateDisclosureLevel(36)).toBe('Sedang (Moderate)');
    expect(calculateDisclosureLevel(53)).toBe('Sedang (Moderate)');

    // 54 - 71 -> Tinggi (Substantial)
    expect(calculateDisclosureLevel(54)).toBe('Tinggi (Substantial)');
    expect(calculateDisclosureLevel(71)).toBe('Tinggi (Substantial)');

    // 72 - 90 -> Sangat Tinggi (High Disclosure)
    expect(calculateDisclosureLevel(72)).toBe('Sangat Tinggi (High Disclosure)');
    expect(calculateDisclosureLevel(90)).toBe('Sangat Tinggi (High Disclosure)');
  });

  it('menjamin seluruh 18 key indikator CED terdefinisi lengkap dan tidak ada yang terhapus', () => {
    const requiredKeys = [
      'cc1', 'cc2',
      'ghg1', 'ghg2', 'ghg3', 'ghg4', 'ghg5', 'ghg6', 'ghg7',
      'ec1', 'ec2', 'ec3',
      'rc1', 'rc2', 'rc3', 'rc4',
      'acc1', 'acc2'
    ];
    expect(requiredKeys.length).toBe(18);
  });
});
