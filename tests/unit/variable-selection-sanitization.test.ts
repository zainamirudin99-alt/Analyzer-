import { describe, it, expect } from 'vitest';
import { validateRegressionConfig } from '../../src/lib/regression-validator';

describe('Variable Selection & Dataset Column Sanitization Tests', () => {
  it('automatically classifies model as SLR when k = 1 and MLR when k >= 2', () => {
    const mockData = [
      { 'Nilai Perusahaan': 100, Jumlah: 50, Lainnya: 20 },
      { 'Nilai Perusahaan': 120, Jumlah: 60, Lainnya: 25 },
      { 'Nilai Perusahaan': 140, Jumlah: 70, Lainnya: 30 },
      { 'Nilai Perusahaan': 160, Jumlah: 80, Lainnya: 35 },
      { 'Nilai Perusahaan': 180, Jumlah: 90, Lainnya: 40 },
    ];

    // Single predictor X: Should be SLR
    const slrSummary = validateRegressionConfig(mockData, {
      yCol: 'Nilai Perusahaan',
      xCols: ['Jumlah'],
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(slrSummary.modelType).toBe('SLR');
    expect(slrSummary.kPredictors).toBe(1);
    expect(slrSummary.isValid).toBe(true);
    expect(slrSummary.errors).toHaveLength(0);

    // Multiple predictors X: Should be MLR
    const mlrSummary = validateRegressionConfig(mockData, {
      yCol: 'Nilai Perusahaan',
      xCols: ['Jumlah', 'Lainnya'],
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(mlrSummary.modelType).toBe('MLR');
    expect(mlrSummary.kPredictors).toBe(2);
    expect(mlrSummary.isValid).toBe(true);
    expect(mlrSummary.errors).toHaveLength(0);
  });

  it('demonstrates that ghost columns (not in dataset) trigger validation errors and sanitization prevents it', () => {
    const mockData = [
      { 'Nilai Perusahaan': 100, Jumlah: 50 },
      { 'Nilai Perusahaan': 120, Jumlah: 60 },
      { 'Nilai Perusahaan': 140, Jumlah: 70 },
      { 'Nilai Perusahaan': 160, Jumlah: 80 },
      { 'Nilai Perusahaan': 180, Jumlah: 90 },
    ];

    const availableColumns = Object.keys(mockData[0]);

    // Unsanitized ghost columns from initial state
    const dirtyXCols = ['Pengeluaran_RND', 'Biaya_Promosi', 'Jumlah'];
    const dirtySummary = validateRegressionConfig(mockData, {
      yCol: 'Nilai Perusahaan',
      xCols: dirtyXCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(dirtySummary.isValid).toBe(false);
    expect(dirtySummary.errors.some(e => e.includes('Pengeluaran_RND'))).toBe(true);
    expect(dirtySummary.errors.some(e => e.includes('Biaya_Promosi'))).toBe(true);

    // Sanitized columns: Only columns present in active dataset
    const sanitizedXCols = dirtyXCols.filter(col => availableColumns.includes(col));
    expect(sanitizedXCols).toEqual(['Jumlah']);

    const cleanSummary = validateRegressionConfig(mockData, {
      yCol: 'Nilai Perusahaan',
      xCols: sanitizedXCols,
      isTimeSeries: false,
      alpha: 0.05
    });

    expect(cleanSummary.modelType).toBe('SLR');
    expect(cleanSummary.kPredictors).toBe(1);
    expect(cleanSummary.isValid).toBe(true);
    expect(cleanSummary.errors).toHaveLength(0);
  });
});
