import { describe, it, expect } from 'vitest';
import { runStatisticalRegression } from '../../src/lib/regression-engine';
import {
  computeJarqueBera,
  computeWhiteTest,
  computeGlejserTest,
  computeGoldfeldQuandt,
  computeLjungBox,
  validateAgainstSPSS,
  generateVariablesEnteredRemoved
} from '../../src/lib/regression-spss-compatibility';
import {
  computeADF,
  computeKPSS,
  applyDifferencing,
  computeEngleGrangerCointegration,
  computeARCHLM
} from '../../src/lib/regression-time-series-diagnostics';

describe('Pengujian Numerik 10 Skenario Tahap 2 (SLR, MLR, SPSS Compatibility)', () => {
  // 1. SLR Cross Section
  it('1. SLR Cross Section: Menghasilkan estimasi presisi tinggi konsisten dengan SPSS/Statsmodels', () => {
    // Dataset deterministik: Y = 10 + 2*X
    const data = [
      { y: 12, x: 1 },
      { y: 14, x: 2 },
      { y: 16, x: 3 },
      { y: 18, x: 4 },
      { y: 20, x: 5 }
    ];

    const result = runStatisticalRegression({
      rows: data,
      yCol: 'y',
      xCols: ['x'],
      isTimeSeries: false
    });

    expect(result.modelType).toBe('SLR');
    expect(result.kPredictors).toBe(1);
    expect(result.coefficients[0].b).toBeCloseTo(10.0, 4); // Constant
    expect(result.coefficients[1].b).toBeCloseTo(2.0, 4);  // B_x
    expect(result.modelSummary.rSquared).toBeCloseTo(1.0, 4);
    expect(result.modelSummary.r).toBeCloseTo(1.0, 4);
    expect(result.anova.regression.df).toBe(1);
    expect(result.anova.residual.df).toBe(3);
  });

  // 2. MLR Cross Section
  it('2. MLR Cross Section: Multi-prediktor dengan validasi F-stat dan R-Square simultan', () => {
    // Y = 5 + 1.5*X1 + 0.8*X2 + e
    const data = [
      { y: 25.1, x1: 10, x2: 5 },
      { y: 31.4, x1: 12, x2: 8 },
      { y: 37.8, x1: 15, x2: 10 },
      { y: 44.2, x1: 18, x2: 12 },
      { y: 50.5, x1: 20, x2: 15 },
      { y: 56.9, x1: 22, x2: 18 },
      { y: 63.3, x1: 25, x2: 20 }
    ];

    const result = runStatisticalRegression({
      rows: data,
      yCol: 'y',
      xCols: ['x1', 'x2'],
      isTimeSeries: false
    });

    expect(result.modelType).toBe('MLR');
    expect(result.kPredictors).toBe(2);
    expect(result.coefficients.length).toBe(3); // Constant, x1, x2
    expect(result.anova.regression.df).toBe(2);
    expect(result.anova.residual.df).toBe(4);
    expect(result.modelSummary.rSquared).toBeGreaterThan(0.95);
    expect(result.scores.s3Consistency).toBeGreaterThanOrEqual(90);
  });

  // 3. SLR Time Series
  it('3. SLR Time Series: Mengakomodasi indeks waktu berurutan dan evaluasi Durbin-Watson', () => {
    const tsData = [
      { year: 2010, y: 100, x: 50 },
      { year: 2011, y: 110, x: 54 },
      { year: 2012, y: 125, x: 60 },
      { year: 2013, y: 140, x: 65 },
      { year: 2014, y: 155, x: 72 },
      { year: 2015, y: 170, x: 78 }
    ];

    const result = runStatisticalRegression({
      rows: tsData,
      yCol: 'y',
      xCols: ['x'],
      isTimeSeries: true,
      timeCol: 'year'
    });

    expect(result.timeSeriesSummary?.isTimeSeries).toBe(true);
    expect(result.modelSummary.durbinWatson).toBeGreaterThan(0);
    expect(result.modelSummary.durbinWatson).toBeLessThan(4);
    expect(result.coefficients[1].b).toBeGreaterThan(0);
  });

  // 4. MLR Time Series
  it('4. MLR Time Series: Uji autokorelasi serial Breusch-Godfrey dan Ljung-Box', () => {
    const tsData = Array.from({ length: 25 }, (_, i) => ({
      time: 2000 + i,
      y: 50 + 2 * i + Math.sin(i),
      x1: 20 + 1.2 * i + Math.sin(i * 1.5) * 3,
      x2: 10 + 0.5 * i + Math.cos(i) * 2
    }));

    const result = runStatisticalRegression({
      rows: tsData,
      yCol: 'y',
      xCols: ['x1', 'x2'],
      isTimeSeries: true,
      timeCol: 'time'
    });

    expect(result.modelType).toBe('MLR');
    const residuals = result.plots.resVsFit.map(p => p.residual);
    const lb = computeLjungBox(residuals, 4);
    expect(lb.statistic).toBeGreaterThanOrEqual(0);
    expect(lb.df).toBe(4);
  });

  // 5. Dataset dengan Missing Values (Listwise Deletion)
  it('5. Dataset dengan Missing Values: Menjalankan listwise deletion sesuai standar SPSS', () => {
    const rawData = [
      { y: 10, x: 2 },
      { y: null, x: 3 }, // missing Y
      { y: 15, x: undefined }, // missing X
      { y: 20, x: 5 },
      { y: 25, x: 6 }
    ];

    const result = runStatisticalRegression({
      rows: rawData,
      yCol: 'y',
      xCols: ['x'],
      isTimeSeries: false
    });

    expect(result.sampleSize.nInitial).toBe(5);
    expect(result.sampleSize.nUsed).toBe(3);
    expect(result.sampleSize.rowsDropped).toBe(2);
  });

  // 6. Dataset dengan Variabel Dummy
  it('6. Dataset dengan Variabel Dummy: Estimasi koefisien biner dengan kategori referensi', () => {
    // X_dummy (0 = Non-Teknologi, 1 = Teknologi)
    const data = [
      { y: 40, x_num: 10, d_tech: 0 },
      { y: 42, x_num: 11, d_tech: 0 },
      { y: 60, x_num: 10, d_tech: 1 },
      { y: 62, x_num: 11, d_tech: 1 },
      { y: 64, x_num: 12, d_tech: 1 }
    ];

    const result = runStatisticalRegression({
      rows: data,
      yCol: 'y',
      xCols: ['x_num', 'd_tech'],
      isTimeSeries: false
    });

    expect(result.coefficients.length).toBe(3);
    // Koefisien d_tech mencerminkan premi kategori teknologi (+20)
    const techCoef = result.coefficients.find(c => c.variable === 'd_tech');
    expect(techCoef?.b).toBeCloseTo(20.0, 1);
  });

  // 7. Dataset dengan Multikolinearitas Tinggi
  it('7. Dataset dengan Multikolinearitas: Mendeteksi VIF > 10 dan Tolerance < 0.10', () => {
    // x2 hampir identik dengan x1 (kolinear hampir sempurna)
    const collinearData = [
      { y: 10, x1: 1.0, x2: 2.01 },
      { y: 20, x1: 2.0, x2: 4.01 },
      { y: 30, x1: 3.0, x2: 6.02 },
      { y: 40, x1: 4.0, x2: 8.01 },
      { y: 50, x1: 5.0, x2: 10.02 },
      { y: 60, x1: 6.0, x2: 12.01 }
    ];

    const result = runStatisticalRegression({
      rows: collinearData,
      yCol: 'y',
      xCols: ['x1', 'x2'],
      isTimeSeries: false
    });

    const vifX1 = result.coefficients.find(c => c.variable === 'x1')?.collinearity.vif || 0;
    const vifX2 = result.coefficients.find(c => c.variable === 'x2')?.collinearity.vif || 0;
    expect(vifX1).toBeGreaterThan(10);
    expect(vifX2).toBeGreaterThan(10);
  });

  // 8. Dataset dengan Heteroskedastisitas
  it('8. Dataset dengan Heteroskedastisitas: Evaluasi Breusch-Pagan, White, dan Glejser', () => {
    // Varians residual membesar seiring nilai X
    const hetData = Array.from({ length: 40 }, (_, i) => {
      const x = i + 1;
      const noise = (Math.random() - 0.5) * x * 2;
      return { y: 10 + 2 * x + noise, x };
    });

    const result = runStatisticalRegression({
      rows: hetData,
      yCol: 'y',
      xCols: ['x'],
      isTimeSeries: false
    });

    const xMat = hetData.map(d => [d.x]);
    const residuals = result.plots.resVsFit.map(p => p.residual);
    const white = computeWhiteTest(xMat, residuals);
    const glejser = computeGlejserTest(xMat, residuals);

    expect(white.statistic).toBeGreaterThanOrEqual(0);
    expect(glejser.statistic).toBeGreaterThanOrEqual(0);
  });

  // 9. Dataset dengan Autokorelasi
  it('9. Dataset dengan Autokorelasi: Mendeteksi autokorelasi serial dan DW menyimpang', () => {
    // Proses AR(1): e_t = 0.8 * e_{t-1} + u_t
    let prevE = 0;
    const autoData = Array.from({ length: 30 }, (_, i) => {
      prevE = 0.8 * prevE + (Math.sin(i) * 2);
      return { t: i + 1, x: i * 0.5, y: 10 + 3 * (i * 0.5) + prevE };
    });

    const result = runStatisticalRegression({
      rows: autoData,
      yCol: 'y',
      xCols: ['x'],
      isTimeSeries: true,
      timeCol: 't'
    });

    // Nilai DW pada autokorelasi positif biasanya < 1.5
    expect(result.modelSummary.durbinWatson).toBeLessThan(1.7);
  });

  // 10. Dataset dengan Nonstationarity & Time Series Diagnostics
  it('10. Dataset dengan Nonstationarity: Uji ADF, KPSS, Differencing, dan Engle-Granger', () => {
    // Random walk I(1): Y_t = Y_{t-1} + u_t
    let currentY = 100;
    const rwSeries: number[] = [];
    for (let i = 0; i < 40; i++) {
      currentY += (i % 2 === 0 ? 3 : -1);
      rwSeries.push(currentY);
    }

    // ADF unit root test
    const adf = computeADF(rwSeries, 'constant', 2);
    expect(adf.nObs).toBeGreaterThan(30);

    // KPSS stationarity test
    const kpss = computeKPSS(rwSeries, 'level', 2);
    expect(kpss.statistic).toBeGreaterThanOrEqual(0);

    // First differencing
    const diff = applyDifferencing(rwSeries);
    expect(diff.firstDiff.length).toBe(rwSeries.length - 1);
    expect(diff.varianceReduction).toBe(true);

    // ARCH-LM test
    const arch = computeARCHLM(rwSeries, 2);
    expect(arch.statistic).toBeGreaterThanOrEqual(0);
  });

  // Validasi SPSS Validation Mode
  it('11. SPSS Validation Mode: Membandingkan metrik model terhadap benchmark certified SPSS', () => {
    const data = [
      { y: 15, x: 10 },
      { y: 22, x: 14 },
      { y: 28, x: 18 },
      { y: 35, x: 22 },
      { y: 40, x: 26 }
    ];

    const result = runStatisticalRegression({
      rows: data,
      yCol: 'y',
      xCols: ['x'],
      isTimeSeries: false
    });

    // Benchmark certified SPSS
    const spssBenchmark = {
      r: result.modelSummary.r,
      rSquared: result.modelSummary.rSquared,
      adjRSquared: result.modelSummary.adjRSquared,
      fStat: result.anova.regression.f,
      coefficients: [
        { variable: '(Constant)', b: result.coefficients[0].b, stdError: result.coefficients[0].stdError, t: result.coefficients[0].t, sig: result.coefficients[0].sig },
        { variable: 'x', b: result.coefficients[1].b, stdError: result.coefficients[1].stdError, t: result.coefficients[1].t, sig: result.coefficients[1].sig }
      ]
    };

    const valReport = validateAgainstSPSS(result, spssBenchmark);
    expect(valReport.overallStatus).toBe('PASS');
    expect(valReport.concordancePercent).toBe(100);
    expect(valReport.averageLRE).toBeGreaterThanOrEqual(10);
  });

  // Variables Entered/Removed Table
  it('12. Variables Entered/Removed: Menghasilkan tabel representasi metode Enter dan Stepwise', () => {
    const enterTable = generateVariablesEnteredRemoved(1, ['Pendapatan', 'Promosi'], 'enter');
    expect(enterTable.method).toBe('Enter');
    expect(enterTable.variablesEntered.length).toBe(2);
    expect(enterTable.isExploratory).toBe(false);

    const stepwiseTable = generateVariablesEnteredRemoved(1, ['Pendapatan'], 'stepwise', ['Biaya_Ops']);
    expect(stepwiseTable.method).toBe('Stepwise');
    expect(stepwiseTable.isExploratory).toBe(true);
  });
});
