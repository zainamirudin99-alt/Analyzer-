import { describe, it, expect } from 'vitest';
import { validateRegressionConfig, inspectColumn } from '../../src/lib/regression-validator';

describe('Statistical Regression Validator (regresi-statistik-inti)', () => {
  const sampleData = Array.from({ length: 65 }, (_, i) => ({
    ID: i + 1,
    Y: 10 + 2 * i + (i % 3),
    X1: 5 + i * 0.5,
    X2: 12 + i * 1.5,
    ConstantX: 42, // Kolom konstan (varians nol)
    BinaryY: i % 2 === 0 ? 1 : 0, // Biner 0/1
    TextCol: `Kategori_${i % 4}`,
    DateCol: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`
  }));

  it('mengidentifikasi model SLR vs MLR secara akurat', () => {
    // SLR: 1 prediktor
    const slr = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: ['X1'],
      isTimeSeries: false
    });
    expect(slr.isValid).toBe(true);
    expect(slr.modelType).toBe('SLR');
    expect(slr.kPredictors).toBe(1);

    // MLR: 2 prediktor
    const mlr = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: ['X1', 'X2'],
      isTimeSeries: false
    });
    expect(mlr.isValid).toBe(true);
    expect(mlr.modelType).toBe('MLR');
    expect(mlr.kPredictors).toBe(2);
  });

  it('Invarian I1: memblokir Y bertipe biner (0/1)', () => {
    const res = validateRegressionConfig(sampleData, {
      yCol: 'BinaryY',
      xCols: ['X1'],
      isTimeSeries: false
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('biner'))).toBe(true);
  });

  it('Invarian I1: memblokir Y bertipe non-numerik', () => {
    const res = validateRegressionConfig(sampleData, {
      yCol: 'TextCol',
      xCols: ['X1'],
      isTimeSeries: false
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('non-numerik'))).toBe(true);
  });

  it('Invarian I5: memblokir jika Y dimasukkan sebagai anggota X', () => {
    const res = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: ['Y', 'X1'],
      isTimeSeries: false
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('tidak boleh dipilih kembali'))).toBe(true);
  });

  it('Invarian I4: memblokir jika X kosong', () => {
    const res = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: [],
      isTimeSeries: false
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('minimal 1 kolom'))).toBe(true);
  });

  it('Invarian I2: memblokir jika n <= k + 1', () => {
    const tinyData = sampleData.slice(0, 3); // n = 3, k = 2 -> k + 1 = 3 -> n <= k + 1
    const res = validateRegressionConfig(tinyData, {
      yCol: 'Y',
      xCols: ['X1', 'X2'],
      isTimeSeries: false
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('tidak mencukupi'))).toBe(true);
  });

  it('Kecukupan Sampel Green (1991): memberi peringatan jika n < 50 + 8k atau n < 104 + k', () => {
    const mediumData = sampleData.slice(0, 45); // n = 45 < 50 + 8(1) = 58
    const res = validateRegressionConfig(mediumData, {
      yCol: 'Y',
      xCols: ['X1'],
      isTimeSeries: false
    });
    // Tetap valid (peringatan non-blocking)
    expect(res.isValid).toBe(true);
    expect(res.warnings.some(w => w.includes('Green (1991)'))).toBe(true);
  });

  it('menolak prediktor X yang bersifat konstan (varians nol)', () => {
    const res = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: ['ConstantX'],
      isTimeSeries: false
    });
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('konstan'))).toBe(true);
  });

  it('Invarian I6: memvalidasi konfigurasi Time Series secara ketat', () => {
    // Error jika Time Series aktif tetapi timeCol tidak diisi
    const noTimeCol = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: ['X1'],
      isTimeSeries: true
    });
    expect(noTimeCol.isValid).toBe(false);
    expect(noTimeCol.errors.some(e => e.includes('kolom penunjuk waktu'))).toBe(true);

    // Error jika timeCol sama dengan Y
    const timeAsY = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: ['X1'],
      isTimeSeries: true,
      timeCol: 'Y'
    });
    expect(timeAsY.isValid).toBe(false);
    expect(timeAsY.errors.some(e => e.includes('tidak boleh dijadikan variabel dependen'))).toBe(true);

    // Valid bila timeCol sah
    const validTS = validateRegressionConfig(sampleData, {
      yCol: 'Y',
      xCols: ['X1'],
      isTimeSeries: true,
      timeCol: 'DateCol',
      frequency: 'bulanan'
    });
    expect(validTS.isValid).toBe(true);
    expect(validTS.timeSeriesSummary?.notice).toContain('Data time series');
  });
});
