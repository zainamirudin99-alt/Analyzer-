// ============================================================
// Synthetic Datasets with Fixed Seeds & Reference Values
// Formatted for regression engine testing & validation
// ============================================================

export interface SyntheticDataset {
  id: string;
  name: string;
  description: string;
  n: number;
  k: number;
  isTimeSeries: boolean;
  timeCol?: string;
  yCol: string;
  xCols: string[];
  data: Record<string, number>[];
  expectedCharacteristics: {
    rSquaredMin?: number;
    rSquaredMax?: number;
    expectedViolations?: string[];
    spuriousRegressionWarning?: boolean;
  };
  referenceStats?: {
    intercept: number;
    coefficients: Record<string, number>;
    rSquared: number;
    fStatistic: number;
    fPValue: number;
    residualStdError: number;
  };
}

// 1. SLR n = 20 (Simple Linear Regression, clean)
// Ground truth: Y = 3.5 + 2.1 * X + e
export const DATASET_SLR_N20: SyntheticDataset = {
  id: 'slr_n20',
  name: 'SLR (n=20)',
  description: 'Simple Linear Regression dengan n=20 observasi, memenuhi asumsi klasik',
  n: 20,
  k: 1,
  isTimeSeries: false,
  yCol: 'Y',
  xCols: ['X1'],
  data: [
    { Y: 5.4, X1: 1.0 }, { Y: 7.8, X1: 2.0 }, { Y: 9.9, X1: 3.0 }, { Y: 12.1, X1: 4.0 },
    { Y: 13.8, X1: 5.0 }, { Y: 16.2, X1: 6.0 }, { Y: 18.0, X1: 7.0 }, { Y: 20.4, X1: 8.0 },
    { Y: 22.3, X1: 9.0 }, { Y: 24.6, X1: 10.0 }, { Y: 26.5, X1: 11.0 }, { Y: 28.8, X1: 12.0 },
    { Y: 30.7, X1: 13.0 }, { Y: 33.1, X1: 14.0 }, { Y: 35.0, X1: 15.0 }, { Y: 37.2, X1: 16.0 },
    { Y: 39.4, X1: 17.0 }, { Y: 41.5, X1: 18.0 }, { Y: 43.6, X1: 19.0 }, { Y: 45.7, X1: 20.0 }
  ],
  expectedCharacteristics: {
    rSquaredMin: 0.99,
    expectedViolations: []
  }
};

// 2. MLR n = 200 (Multiple Linear Regression, clean)
// Seeded generation: Y = 10 + 1.5*X1 - 2.0*X2 + 0.8*X3 + e
const generateMLR200 = () => {
  const rows: Record<string, number>[] = [];
  let s = 12345;
  const pseudoRand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 1; i <= 200; i++) {
    const x1 = Math.round((pseudoRand() * 20 + 5) * 10) / 10;
    const x2 = Math.round((pseudoRand() * 15 + 2) * 10) / 10;
    const x3 = Math.round((pseudoRand() * 30 + 10) * 10) / 10;
    const err = (pseudoRand() + pseudoRand() + pseudoRand() - 1.5) * 2;
    const y = Math.round((10 + 1.5 * x1 - 2.0 * x2 + 0.8 * x3 + err) * 100) / 100;
    rows.push({ Y: y, X1: x1, X2: x2, X3: x3 });
  }
  return rows;
};

export const DATASET_MLR_N200: SyntheticDataset = {
  id: 'mlr_n200',
  name: 'MLR (n=200)',
  description: 'Multiple Linear Regression k=3, n=200 tanpa pelanggaran asumsi',
  n: 200,
  k: 3,
  isTimeSeries: false,
  yCol: 'Y',
  xCols: ['X1', 'X2', 'X3'],
  data: generateMLR200(),
  expectedCharacteristics: {
    rSquaredMin: 0.80,
    expectedViolations: []
  }
};

// 3. WITH OUTLIER (n = 30, with 2 high leverage / large residual points)
export const DATASET_WITH_OUTLIER: SyntheticDataset = {
  id: 'with_outlier',
  name: 'Dataset dengan Outlier (n=30)',
  description: 'Dataset dengan 2 pencilan ekstrem yang melanggar casewise diagnostic (Cook D > 1)',
  n: 30,
  k: 1,
  isTimeSeries: false,
  yCol: 'Y',
  xCols: ['X1'],
  data: [
    ...Array.from({ length: 28 }, (_, i) => ({
      Y: Math.round((2.0 + 1.5 * (i + 1) + ((i % 3) - 1) * 0.4) * 100) / 100,
      X1: i + 1
    })),
    // Outlier 1: Extreme vertical residual
    { Y: 95.0, X1: 15 },
    // Outlier 2: Extreme leverage and residual
    { Y: -40.0, X1: 45 }
  ],
  expectedCharacteristics: {
    expectedViolations: ['outliers']
  }
};

// 4. HETEROSKEDASTIC (Variance grows proportionally with X)
export const DATASET_HETEROSKEDASTIC: SyntheticDataset = {
  id: 'heteroskedastic',
  name: 'Dataset Heteroskedastis (n=60)',
  description: 'Varians residual membesar seiring nilai X, memicu kegagalan Breusch-Pagan & Glejser',
  n: 60,
  k: 1,
  isTimeSeries: false,
  yCol: 'Y',
  xCols: ['X1'],
  data: Array.from({ length: 60 }, (_, i) => {
    const x = i + 1;
    // Error variance expands heavily with X
    const noise = (Math.sin(i * 11) * 0.8) * (x * 0.45);
    return {
      Y: Math.round((5.0 + 2.0 * x + noise) * 100) / 100,
      X1: x
    };
  }),
  expectedCharacteristics: {
    expectedViolations: ['heteroskedasticity']
  }
};

// 5. MULTICOLLINEAR (High correlation between X1 and X2, VIF > 10)
export const DATASET_MULTICOLLINEAR: SyntheticDataset = {
  id: 'multicollinear',
  name: 'Dataset Multikolinear (n=50, k=2)',
  description: 'Korelasi X1 dan X2 r > 0.98 memicu VIF > 10 dan Tolerance < 0.10',
  n: 50,
  k: 2,
  isTimeSeries: false,
  yCol: 'Y',
  xCols: ['X1', 'X2'],
  data: Array.from({ length: 50 }, (_, i) => {
    const x1 = i + 1;
    // X2 is almost identical to X1 with tiny noise
    const x2 = Math.round((x1 * 1.02 + Math.cos(i) * 0.05) * 100) / 100;
    const y = Math.round((10 + 2.5 * x1 + 1.2 * x2 + (i % 2 === 0 ? 0.3 : -0.3)) * 100) / 100;
    return { Y: y, X1: x1, X2: x2 };
  }),
  expectedCharacteristics: {
    expectedViolations: ['multicollinearity']
  }
};

// 6. LOW R2 (Independent noise, R2 < 0.05)
export const DATASET_LOW_R2: SyntheticDataset = {
  id: 'low_r2',
  name: 'Dataset R-kuadrat Rendah (n=50)',
  description: 'Y tidak berkorelasi dengan prediktor, R2 < 0.05 dan model tidak signifikan',
  n: 50,
  k: 1,
  isTimeSeries: false,
  yCol: 'Y',
  xCols: ['X1'],
  data: Array.from({ length: 50 }, (_, i) => ({
    Y: Math.round((50 + Math.sin(i * 1.7) * 15 + Math.cos(i * 3.1) * 10) * 100) / 100,
    X1: i + 1
  })),
  expectedCharacteristics: {
    rSquaredMax: 0.08,
    expectedViolations: ['low_r2']
  }
};

// 7. TIME SERIES WITH AR(1) AUTOCORRELATION
// e_t = 0.8 * e_{t-1} + u_t
export const DATASET_TIME_SERIES_AR1: SyntheticDataset = {
  id: 'time_series_ar1',
  name: 'Time Series Autokorelasi AR(1) (n=60)',
  description: 'Residual time series memiliki autokorelasi positif kuat, Breusch-Godfrey & DW gagal',
  n: 60,
  k: 1,
  isTimeSeries: true,
  timeCol: 'Tahun',
  yCol: 'Y',
  xCols: ['X1'],
  data: (() => {
    const rows: Record<string, number>[] = [];
    let prevErr = 0;
    for (let t = 1; t <= 60; t++) {
      const u = Math.sin(t * 7) * 1.5;
      const err = 0.8 * prevErr + u;
      prevErr = err;
      const x = 10 + t * 0.5;
      const y = Math.round((20 + 1.2 * x + err) * 100) / 100;
      rows.push({ Tahun: 1960 + t, Y: y, X1: Math.round(x * 100) / 100 });
    }
    return rows;
  })(),
  expectedCharacteristics: {
    expectedViolations: ['autocorrelation']
  }
};

// 8. TIME SERIES NON-STATIONARY (Two independent Random Walks)
// Spurious regression: High R2, but residuals non-stationary (ADF test fails)
export const DATASET_TIME_SERIES_NONSTATIONARY: SyntheticDataset = {
  id: 'time_series_nonstationary',
  name: 'Time Series Regresi Lancung (Non-Stasioner)',
  description: 'Dua random walk independen menghasilkan R2 semu tinggi dan peringatan regresi lancung',
  n: 80,
  k: 1,
  isTimeSeries: true,
  timeCol: 'Waktu',
  yCol: 'Y',
  xCols: ['X1'],
  data: (() => {
    const rows: Record<string, number>[] = [];
    let s = 987654321;
    const prng = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    let rwY = 100;
    let rwX = 50;
    for (let t = 1; t <= 80; t++) {
      const u1 = (prng() - 0.5) * 3 + 0.9;
      const u2 = (prng() - 0.5) * 3 + 0.7;
      rwY += u1;
      rwX += u2;
      rows.push({
        Waktu: t,
        Y: Math.round(rwY * 100) / 100,
        X1: Math.round(rwX * 100) / 100
      });
    }
    return rows;
  })(),
  expectedCharacteristics: {
    spuriousRegressionWarning: true,
    expectedViolations: ['non_stationary']
  }
};

export const ALL_SYNTHETIC_DATASETS: SyntheticDataset[] = [
  DATASET_SLR_N20,
  DATASET_MLR_N200,
  DATASET_WITH_OUTLIER,
  DATASET_HETEROSKEDASTIC,
  DATASET_MULTICOLLINEAR,
  DATASET_LOW_R2,
  DATASET_TIME_SERIES_AR1,
  DATASET_TIME_SERIES_NONSTATIONARY
];
