import { describe, it, expect } from 'vitest';
import {
  classifyAnalysisPath,
  validateAndProfileDataset,
  applyMissingValueFilter,
  calculateDescriptiveStatistics,
  calculateCorrelationMatrix,
  generateVisualChartData,
  INTERNAL_MENU_STRUCTURE,
  DEFAULT_WORKFLOW_STEPS
} from '../../src/lib/regression-data-processor';

describe('Regression Data Processor & Workflow Engine (Tahap 1)', () => {
  it('memverifikasi 15 struktur internal menu dan 12 langkah workflow', () => {
    expect(INTERNAL_MENU_STRUCTURE.length).toBe(15);
    expect(DEFAULT_WORKFLOW_STEPS.length).toBe(12);
    expect(INTERNAL_MENU_STRUCTURE[0].id).toBe('dashboard');
    expect(INTERNAL_MENU_STRUCTURE[14].id).toBe('history');
  });

  describe('1. Klasifikasi 4 Jalur Analisis', () => {
    it('mengklasifikasikan SLR Cross Section dengan tepat (1 Y, 1 X, bukan time series)', () => {
      const res = classifyAnalysisPath(false, 1);
      expect(res.path).toBe('SLR_CROSS_SECTION');
      expect(res.label).toContain('Simple Linear Regression (SLR) Cross Section');
    });

    it('mengklasifikasikan MLR Cross Section dengan tepat (1 Y, 3 X, bukan time series)', () => {
      const res = classifyAnalysisPath(false, 3);
      expect(res.path).toBe('MLR_CROSS_SECTION');
      expect(res.label).toContain('Multiple Linear Regression (MLR) Cross Section');
    });

    it('mengklasifikasikan SLR Time Series dengan tepat (1 Y, 1 X, time series)', () => {
      const res = classifyAnalysisPath(true, 1);
      expect(res.path).toBe('SLR_TIME_SERIES');
      expect(res.label).toContain('Simple Linear Regression (SLR) Time Series');
    });

    it('mengklasifikasikan MLR Time Series dengan tepat (1 Y, 2 X, time series)', () => {
      const res = classifyAnalysisPath(true, 2);
      expect(res.path).toBe('MLR_TIME_SERIES');
      expect(res.label).toContain('Multiple Linear Regression (MLR) Time Series');
    });
  });

  describe('2. Deteksi Struktur Data & Potensi Data Panel', () => {
    it('mendeteksi duplikat, tipe kolom, dan missing values pada dataset biasa', () => {
      const sample = [
        { id: 1, x: 10, y: 20 },
        { id: 2, x: 12, y: 24 },
        { id: 3, x: null, y: 28 }, // 1 missing
        { id: 1, x: 10, y: 20 }   // 1 duplikat
      ];
      const summary = validateAndProfileDataset(sample, 'UjiDataset');
      expect(summary.totalObservations).toBe(4);
      expect(summary.totalVariables).toBe(3);
      expect(summary.duplicateCount).toBe(1);
      expect(summary.hasMissing).toBe(true);
      expect(summary.totalMissingCells).toBe(1);
      expect(summary.isPotentialPanel).toBe(false);
    });

    it('mendeteksi potensi data panel jika ada struktur entitas berulang dan waktu', () => {
      const panelSample = [
        { Perusahaan: 'A', Tahun: 2020, Y: 100, X: 50 },
        { Perusahaan: 'A', Tahun: 2021, Y: 110, X: 55 },
        { Perusahaan: 'A', Tahun: 2022, Y: 120, X: 60 },
        { Perusahaan: 'B', Tahun: 2020, Y: 200, X: 90 },
        { Perusahaan: 'B', Tahun: 2021, Y: 210, X: 95 },
        { Perusahaan: 'B', Tahun: 2022, Y: 220, X: 100 }
      ];
      const summary = validateAndProfileDataset(panelSample, 'PanelSample');
      expect(summary.isPotentialPanel).toBe(true);
      expect(summary.panelAdvisoryMessage).toContain('DATA PANEL');
      expect(summary.panelAdvisoryMessage).toContain('Regresi Data Panel Stata');
    });
  });

  describe('3. Missing Value Handling (Listwise Deletion)', () => {
    it('menjalankan listwise deletion dan menghitung baris terbuang', () => {
      const data = [
        { y: 10, x1: 20, x2: 30 },
        { y: 15, x1: null, x2: 35 }, // drop
        { y: 20, x1: 25, x2: 40 }
      ];
      const res = applyMissingValueFilter(data, ['y', 'x1', 'x2'], 'listwise');
      expect(res.initialN).toBe(3);
      expect(res.usedN).toBe(2);
      expect(res.droppedN).toBe(1);
      expect(res.cleanRows.length).toBe(2);
    });
  });

  describe('4. Descriptive Statistics (8 Parameter SPSS)', () => {
    it('menghitung N, Min, Max, Mean, Variance, SD, Skewness, Kurtosis dengan presisi', () => {
      const data = [
        { val: 10 },
        { val: 20 },
        { val: 30 },
        { val: 40 },
        { val: 50 }
      ];
      const stats = calculateDescriptiveStatistics(data, ['val']);
      expect(stats.length).toBe(1);
      const s = stats[0];
      expect(s.n).toBe(5);
      expect(s.min).toBe(10);
      expect(s.max).toBe(50);
      expect(s.mean).toBe(30);
      expect(s.variance).toBe(250); // sum((x - 30)^2)/4 = 1000/4 = 250
      expect(s.stdDev).toBeCloseTo(15.8114, 3);
      expect(s.skewness).toBeCloseTo(0, 4); // simetris
    });
  });

  describe('5. Matriks Korelasi (Pearson & Spearman)', () => {
    it('menghitung matriks korelasi Pearson dan Spearman antar variabel', () => {
      const data = [
        { y: 10, x: 2 },
        { y: 20, x: 4 },
        { y: 30, x: 6 },
        { y: 40, x: 8 },
        { y: 50, x: 10 }
      ];
      const corr = calculateCorrelationMatrix(data, ['y', 'x']);
      expect(corr.pearson['y']['x']).toBeCloseTo(1.0, 4);
      expect(corr.spearman['y']['x']).toBeCloseTo(1.0, 4);
      expect(corr.pearson['x']['x']).toBe(1.0);
    });
  });

  describe('6. Visual Chart Data Generator', () => {
    it('membuat data histogram, boxplot summary, dan scatterplot', () => {
      const data = [
        { y: 10, x: 1 },
        { y: 20, x: 2 },
        { y: 30, x: 3 },
        { y: 40, x: 4 },
        { y: 50, x: 5 }
      ];
      const chart = generateVisualChartData(data, 'y', 'x');
      expect(chart.histogram.length).toBeGreaterThan(0);
      expect(chart.boxplot.min).toBe(10);
      expect(chart.boxplot.max).toBe(50);
      expect(chart.boxplot.median).toBe(30);
      expect(chart.scatterplot?.length).toBe(5);
    });
  });
});

