import { describe, it, expect } from 'vitest';
import { runStatisticalRegression } from '../../src/lib/regression-engine';

describe('Diagnostik 9 Asumsi Klasik (regresi-statistik-inti)', () => {
  it('menggunakan Shapiro-Wilk saat n <= 50 dan Lilliefors saat n > 50', () => {
    // n = 30 (<= 50) -> Shapiro-Wilk
    const smallData = Array.from({ length: 30 }, (_, i) => ({
      Y: 10 + 2 * i + (Math.sin(i) * 2),
      X: i + 1
    }));
    const resSmall = runStatisticalRegression({
      rows: smallData,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: false
    });
    const normTestSmall = resSmall.assumptions.find(a => a.name.includes('Normalitas'));
    expect(normTestSmall?.name).toContain('Shapiro-Wilk');

    // n = 70 (> 50) -> Lilliefors
    const largeData = Array.from({ length: 70 }, (_, i) => ({
      Y: 10 + 2 * i + (Math.sin(i) * 2),
      X: i + 1
    }));
    const resLarge = runStatisticalRegression({
      rows: largeData,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: false
    });
    const normTestLarge = resLarge.assumptions.find(a => a.name.includes('Normalitas'));
    expect(normTestLarge?.name).toContain('Lilliefors');
  });

  it('menjalankan Ramsey RESET test untuk asumsi linearitas', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({
      Y: 5 + 3 * i,
      X: i + 1
    }));
    const res = runStatisticalRegression({
      rows: data,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: false
    });
    const resetTest = res.assumptions.find(a => a.name.includes('Ramsey RESET'));
    expect(resetTest).toBeDefined();
    expect(resetTest?.criteria).toContain('p >');
    expect(resetTest?.status).toBe('lulus');
  });

  it('menjalankan uji Homoskedastisitas Breusch-Pagan versi Koenker', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({
      Y: 10 + 1.5 * i,
      X: i + 1
    }));
    const res = runStatisticalRegression({
      rows: data,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: false
    });
    const bpHomo = res.assumptions.find(a => a.name.includes('Breusch-Pagan'));
    expect(bpHomo).toBeDefined();
    expect(bpHomo?.criteria).toContain('p >');
  });

  it('memberi status tidak_berlaku pada Multikolinearitas jika model adalah SLR (k=1)', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      Y: 10 + 2 * i,
      X: i + 1
    }));
    const res = runStatisticalRegression({
      rows: data,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: false
    });
    const multiTest = res.assumptions.find(a => a.name.includes('Multikolinearitas'));
    expect(multiTest?.status).toBe('tidak_berlaku');
    expect(multiTest?.reason).toContain('hanya 1 variabel X');
  });

  it('mengaktifkan jalur pengujian Time Series (Breusch-Godfrey, ADF, ARCH-LM) jika isTimeSeries = true', () => {
    const tsData = Array.from({ length: 45 }, (_, i) => ({
      Waktu: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
      Y: 100 + 2.5 * i + Math.sin(i) * 5,
      X: 50 + 1.2 * i
    }));
    const res = runStatisticalRegression({
      rows: tsData,
      yCol: 'Y',
      xCols: ['X'],
      isTimeSeries: true,
      timeCol: 'Waktu',
      frequency: 'bulanan'
    });

    const bgTest = res.assumptions.find(a => a.name.includes('Breusch-Godfrey'));
    const adfTest = res.assumptions.find(a => a.name.includes('ADF'));
    const archTest = res.assumptions.find(a => a.name.includes('ARCH-LM'));

    expect(bgTest).toBeDefined();
    expect(adfTest).toBeDefined();
    expect(archTest).toBeDefined();
    expect(res.timeSeriesSummary?.isTimeSeries).toBe(true);
  });
});
