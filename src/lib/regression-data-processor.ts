// ============================================================
// Regression Data Processor & Foundation Workflow
// Tahap 1: Data Processing, Descriptive Statistics, 4-Path Classifier,
// Panel Structure Advisory, and 12-Step Guided Workflow Engine
// ============================================================

export type RegressionAnalysisPath = 
  | 'SLR_CROSS_SECTION'
  | 'MLR_CROSS_SECTION'
  | 'SLR_TIME_SERIES'
  | 'MLR_TIME_SERIES';

export interface ColumnProfile {
  name: string;
  type: 'numeric' | 'categorical' | 'datetime' | 'constant' | 'id';
  sampleValues: any[];
  totalCount: number;
  missingCount: number;
  missingPercent: number;
  uniqueCount: number;
  isDateOrTime: boolean;
  min?: number;
  max?: number;
}

export interface DatasetValidationSummary {
  datasetName: string;
  totalObservations: number;
  totalVariables: number;
  columns: ColumnProfile[];
  duplicateCount: number;
  duplicatePercent: number;
  hasMissing: boolean;
  totalMissingCells: number;
  dateTimeColumns: string[];
  suggestedEntityCol?: string;
  suggestedTimeCol?: string;
  isPotentialPanel: boolean;
  panelAdvisoryMessage?: string;
  processingLog: string[];
}

export interface DescriptiveStatisticItem {
  variable: string;
  n: number;
  min: number;
  max: number;
  mean: number;
  variance: number;
  stdDev: number;
  skewness: number;
  kurtosis: number;
  stdErrorMean: number;
}

export interface CorrelationMatrixResult {
  variables: string[];
  pearson: Record<string, Record<string, number>>;
  spearman: Record<string, Record<string, number>>;
  pValues: Record<string, Record<string, number>>;
}

export interface VisualChartData {
  histogram: { binStart: number; binEnd: number; count: number; density: number }[];
  boxplot: {
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    iqr: number;
    outliers: number[];
  };
  scatterplot?: { x: number; y: number }[];
  timeSeriesPlot?: { time: string | number; value: number }[];
}

export type StepStatus = 'pending' | 'completed' | 'warning' | 'failed';

export interface WorkflowStepState {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  isOptional: boolean;
  skipReason?: string;
}

/**
 * 15 Menu internal di bawah Analisis Regresi Statistik
 */
export const INTERNAL_MENU_STRUCTURE = [
  { id: 'dashboard', title: '1. Dashboard Analisis', desc: 'Ringkasan status proyek & riwayat pengerjaan' },
  { id: 'import', title: '2. Import Dataset', desc: 'Unggah XLSX, XLS, CSV, SAV, DTA atau link' },
  { id: 'validation', title: '3. Data Validation', desc: 'Pemeriksaan duplikat, missing, & tipe kolom' },
  { id: 'variable_config', title: '4. Variable Configuration', desc: 'Pemetaan Y (dependen), X (independen), & waktu' },
  { id: 'descriptives', title: '5. Descriptive Statistics', desc: 'Statistik 8 parameter & visualisasi distribusi' },
  { id: 'correlation', title: '6. Correlation Analysis', desc: 'Matriks korelasi Pearson & Spearman' },
  { id: 'reg_config', title: '7. Regression Configuration', desc: 'Metode OLS, missing policy, & taraf alpha' },
  { id: 'reg_results', title: '8. Regression Results', desc: 'Tabel ANOVA, Model Summary, & Coefficients SPSS' },
  { id: 'assumptions', title: '9. Classical Assumption Tests', desc: 'Normalitas, multikol, heteroskedastisitas' },
  { id: 'ts_diagnostics', title: '10. Time Series Diagnostics', desc: 'Breusch-Godfrey, ADF, KPSS, & ARCH-LM' },
  { id: 'recommendations', title: '11. Statistical Recommendations', desc: 'Rekomendasi remedial sah tanpa manipulasi' },
  { id: 'model_comparison', title: '12. Model Comparison', desc: 'Perbandingan M0 dengan model remedial' },
  { id: 'interpretation', title: '13. Final Interpretation', desc: 'Narasi ilmiah otomatis bahasa Indonesia' },
  { id: 'report_gen', title: '14. Report Generation', desc: 'Ekspor laporan resmi ke Microsoft Word (.docx)' },
  { id: 'history', title: '15. Analysis History', desc: 'Log append-only riwayat analisis dan parameter' },
];

/**
 * 12 Langkah Next Step Workflow
 */
export const DEFAULT_WORKFLOW_STEPS: WorkflowStepState[] = [
  { id: 1, title: 'Import Dataset', description: 'Unggah berkas spreadsheet, SAV, DTA, atau Google Sheets', status: 'pending', isOptional: false },
  { id: 2, title: 'Data Validation', description: 'Cek baris duplikat, missing value, & deteksi anomali struktur', status: 'pending', isOptional: false },
  { id: 3, title: 'Variable Configuration', description: 'Tentukan 4 jalur (SLR/MLR Cross Section/Time Series)', status: 'pending', isOptional: false },
  { id: 4, title: 'Descriptive Statistics', description: 'Hitung N, Min, Max, Mean, SD, Skewness, Kurtosis', status: 'pending', isOptional: true },
  { id: 5, title: 'Correlation Analysis', description: 'Matriks korelasi Pearson dan Spearman antar variabel', status: 'pending', isOptional: true },
  { id: 6, title: 'Regression Configuration', description: 'Atur metode entri OLS, missing policy, dan alpha', status: 'pending', isOptional: false },
  { id: 7, title: 'Regression Results', description: 'Estimasi OLS dan tabel resmi gaya SPSS', status: 'pending', isOptional: false },
  { id: 8, title: 'Diagnostic Tests', description: 'Uji asumsi klasik dan diagnostik time series', status: 'pending', isOptional: false },
  { id: 9, title: 'Statistical Recommendations', description: 'Saran remedial berbasis bukti (hasil apa adanya)', status: 'pending', isOptional: true },
  { id: 10, title: 'Model Comparison', description: 'Komparasi model M0 vs remedial', status: 'pending', isOptional: true },
  { id: 11, title: 'Final Interpretation', description: 'Interpretasi ilmiah deterministik', status: 'pending', isOptional: false },
  { id: 12, title: 'Report Generation', description: 'Unduh laporan lengkap ke format .docx', status: 'pending', isOptional: false }
];

/**
 * Klasifikasi 4 Jalur Analisis Regresi
 */
export function classifyAnalysisPath(
  isTimeSeries: boolean,
  xColsCount: number
): { path: RegressionAnalysisPath; label: string; description: string } {
  if (!isTimeSeries) {
    if (xColsCount <= 1) {
      return {
        path: 'SLR_CROSS_SECTION',
        label: 'Simple Linear Regression (SLR) Cross Section',
        description: '1 Variabel Dependen (Y) dan 1 Variabel Independen (X) pada data observasi independen.'
      };
    }
    return {
      path: 'MLR_CROSS_SECTION',
      label: 'Multiple Linear Regression (MLR) Cross Section',
      description: '1 Variabel Dependen (Y) dan 2+ Variabel Independen (X) pada data observasi independen.'
    };
  } else {
    if (xColsCount <= 1) {
      return {
        path: 'SLR_TIME_SERIES',
        label: 'Simple Linear Regression (SLR) Time Series',
        description: '1 Variabel Dependen (Y) dan 1 Variabel Independen (X) dengan indeks urutan waktu beruntun.'
      };
    }
    return {
      path: 'MLR_TIME_SERIES',
      label: 'Multiple Linear Regression (MLR) Time Series',
      description: '1 Variabel Dependen (Y) dan 2+ Variabel Independen (X) dengan indeks urutan waktu beruntun.'
    };
  }
}

/**
 * Deteksi apakah kolom memuat format tanggal / waktu
 */
export function isDateTimeString(val: any): boolean {
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'number') {
    // 4 digit tahun (misal 1990 s/d 2050)
    return val >= 1900 && val <= 2099;
  }
  if (typeof val !== 'string') return false;
  const s = val.trim();
  // Format YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, YYYY
  if (/^\d{4}$/.test(s)) {
    const yr = parseInt(s, 10);
    return yr >= 1900 && yr <= 2099;
  }
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(s)) {
    const d = new Date(s);
    return !isNaN(d.getTime());
  }
  return false;
}

/**
 * Validasi Dataset Lengkap & Pemeriksaan Struktur Panel Data
 */
export function validateAndProfileDataset(
  rows: Record<string, any>[],
  datasetName: string = 'Dataset'
): DatasetValidationSummary {
  const log: string[] = [];
  log.push(`[Audit] Memulai validasi dataset "${datasetName}" pada ${new Date().toISOString()}`);

  if (!rows || rows.length === 0) {
    return {
      datasetName,
      totalObservations: 0,
      totalVariables: 0,
      columns: [],
      duplicateCount: 0,
      duplicatePercent: 0,
      hasMissing: false,
      totalMissingCells: 0,
      dateTimeColumns: [],
      isPotentialPanel: false,
      processingLog: ['Dataset kosong (0 baris).']
    };
  }

  const totalObservations = rows.length;
  const colNames = Object.keys(rows[0]);
  const totalVariables = colNames.length;
  log.push(`[Struktur] Terdeteksi ${totalObservations} baris observasi dan ${totalVariables} variabel kolom.`);

  // 1. Cek Duplikat Baris Penuh
  const rowSignatures = new Set<string>();
  let duplicateCount = 0;
  rows.forEach(r => {
    const sig = colNames.map(c => String(r[c] ?? '')).join('||');
    if (rowSignatures.has(sig)) {
      duplicateCount++;
    } else {
      rowSignatures.add(sig);
    }
  });
  const duplicatePercent = Math.round((duplicateCount / totalObservations) * 1000) / 10;
  if (duplicateCount > 0) {
    log.push(`[Peringatan] Ditemukan ${duplicateCount} baris duplikat identik (${duplicatePercent}%).`);
  } else {
    log.push(`[Verifikasi] Tidak ditemukan baris duplikat (0 duplikat).`);
  }

  // 2. Profil Tiap Kolom
  let totalMissingCells = 0;
  const dateTimeColumns: string[] = [];
  const columns: ColumnProfile[] = [];

  colNames.forEach(col => {
    const vals = rows.map(r => r[col]);
    let missingCount = 0;
    const uniqueSet = new Set<any>();
    let numericCount = 0;
    let dateTimeCount = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

    vals.forEach(v => {
      if (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) {
        missingCount++;
        totalMissingCells++;
      } else {
        uniqueSet.add(v);
        if (typeof v === 'number' && !isNaN(v)) {
          numericCount++;
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        } else if (typeof v === 'string') {
          const num = Number(v.replace(',', '.'));
          if (!isNaN(num) && v.trim() !== '') {
            numericCount++;
            if (num < minVal) minVal = num;
            if (num > maxVal) maxVal = num;
          }
        }
        if (isDateTimeString(v)) {
          dateTimeCount++;
        }
      }
    });

    const validCount = totalObservations - missingCount;
    const isDate = validCount > 0 && dateTimeCount / validCount > 0.8;
    if (isDate) {
      dateTimeColumns.push(col);
    }

    let type: ColumnProfile['type'] = 'categorical';
    if (uniqueSet.size <= 1 && totalObservations > 1) {
      type = 'constant';
    } else if (uniqueSet.size === totalObservations && !numericCount) {
      type = 'id';
    } else if (isDate) {
      type = 'datetime';
    } else if (validCount > 0 && numericCount / validCount > 0.85) {
      type = 'numeric';
    }

    columns.push({
      name: col,
      type,
      sampleValues: vals.slice(0, 5),
      totalCount: totalObservations,
      missingCount,
      missingPercent: Math.round((missingCount / totalObservations) * 1000) / 10,
      uniqueCount: uniqueSet.size,
      isDateOrTime: isDate,
      min: minVal !== Infinity ? minVal : undefined,
      max: maxVal !== -Infinity ? maxVal : undefined
    });
  });

  // 3. Deteksi Struktur Data Panel (ID + Waktu berulang)
  // Menemukan apakah ada variabel entitas potensial dan variabel waktu
  let isPotentialPanel = false;
  let suggestedEntityCol: string | undefined;
  let suggestedTimeCol: string | undefined;
  let panelAdvisoryMessage: string | undefined;

  if (dateTimeColumns.length > 0) {
    suggestedTimeCol = dateTimeColumns[0];
    // Cari kolom entitas: string/kategorik atau id dengan nilai unik berulang untuk tiap waktu
    const potentialEntities = columns.filter(
      c => c.name !== suggestedTimeCol && (c.type === 'categorical' || c.type === 'id') && c.uniqueCount >= 2 && c.uniqueCount < totalObservations
    );

    if (potentialEntities.length > 0) {
      suggestedEntityCol = potentialEntities[0].name;
      // Periksa apakah ada kombinasi (Entity, Time)
      const entityTimeSet = new Set<string>();
      let combinationsValid = 0;
      rows.forEach(r => {
        const ent = String(r[suggestedEntityCol!]);
        const time = String(r[suggestedTimeCol!]);
        if (ent && time) {
          entityTimeSet.add(`${ent}#${time}`);
          combinationsValid++;
        }
      });

      if (entityTimeSet.size > potentialEntities[0].uniqueCount && combinationsValid > entityTimeSet.size * 0.7) {
        isPotentialPanel = true;
        panelAdvisoryMessage = `Perhatian Ekonometrika: Terdeteksi struktur entitas berulang ("${suggestedEntityCol}") dan indeks waktu ("${suggestedTimeCol}"). Data ini berpotensi merupakan DATA PANEL. Untuk estimasi panel yang tepat (CEM, FEM, REM), disarankan menggunakan menu "Regresi Data Panel Stata".`;
        log.push(`[Advisory Panel] ${panelAdvisoryMessage}`);
      }
    }
  }

  log.push(`[Validasi Selesai] Total sel hilang: ${totalMissingCells}. Status data siap dikonfigurasi.`);

  return {
    datasetName,
    totalObservations,
    totalVariables,
    columns,
    duplicateCount,
    duplicatePercent,
    hasMissing: totalMissingCells > 0,
    totalMissingCells,
    dateTimeColumns,
    suggestedEntityCol,
    suggestedTimeCol,
    isPotentialPanel,
    panelAdvisoryMessage,
    processingLog: log
  };
}

/**
 * Filter Missing Value: Listwise Deletion (Standar SPSS)
 */
export function applyMissingValueFilter(
  rows: Record<string, any>[],
  activeCols: string[],
  policy: 'listwise' | 'impute_mean' | 'impute_median' = 'listwise'
): { cleanRows: Record<string, any>[]; initialN: number; usedN: number; droppedN: number; logMessage: string } {
  const initialN = rows.length;

  if (policy === 'listwise') {
    const cleanRows = rows.filter(r => {
      return activeCols.every(col => {
        const val = r[col];
        if (val === null || val === undefined || val === '') return false;
        if (typeof val === 'number' && isNaN(val)) return false;
        return true;
      });
    });
    const usedN = cleanRows.length;
    const droppedN = initialN - usedN;
    const logMessage = `Listwise deletion: ${droppedN} baris dibuang karena memuat nilai kosong pada variabel terpilih. N awal = ${initialN}, N terpakai = ${usedN}.`;
    return { cleanRows, initialN, usedN, droppedN, logMessage };
  }

  // Imputasi Mean / Median sebagai opsi lanjutan
  const colStats: Record<string, number> = {};
  activeCols.forEach(col => {
    const validNums = rows
      .map(r => Number(r[col]))
      .filter(n => !isNaN(n) && n !== null && n !== undefined);
    if (validNums.length > 0) {
      if (policy === 'impute_mean') {
        colStats[col] = validNums.reduce((a, b) => a + b, 0) / validNums.length;
      } else {
        const sorted = [...validNums].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        colStats[col] = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      }
    }
  });

  const cleanRows = rows.map(r => {
    const newRow = { ...r };
    activeCols.forEach(col => {
      const val = newRow[col];
      if (val === null || val === undefined || val === '' || (typeof val === 'number' && isNaN(val))) {
        newRow[col] = colStats[col] ?? 0;
      }
    });
    return newRow;
  });

  return {
    cleanRows,
    initialN,
    usedN: initialN,
    droppedN: 0,
    logMessage: `Imputasi (${policy}): 0 baris dibuang, sel kosong diimputasi dengan nilai ${policy === 'impute_mean' ? 'rata-rata' : 'median'} kolom.`
  };
}

/**
 * Hitung 8 Parameter Statistik Deskriptif SPSS Konsisten
 */
export function calculateDescriptiveStatistics(
  rows: Record<string, any>[],
  columns: string[]
): DescriptiveStatisticItem[] {
  return columns.map(col => {
    const vals = rows
      .map(r => {
        const v = r[col];
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
          const num = Number(v.replace(',', '.'));
          return !isNaN(num) ? num : NaN;
        }
        return NaN;
      })
      .filter(v => !isNaN(v) && v !== null && v !== undefined);

    const n = vals.length;
    if (n === 0) {
      return {
        variable: col,
        n: 0,
        min: 0,
        max: 0,
        mean: 0,
        variance: 0,
        stdDev: 0,
        skewness: 0,
        kurtosis: 0,
        stdErrorMean: 0
      };
    }

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // Sample variance (divided by n - 1)
    let variance = 0;
    if (n > 1) {
      const ss = vals.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0);
      variance = ss / (n - 1);
    }
    const stdDev = Math.sqrt(variance);
    const stdErrorMean = n > 0 ? stdDev / Math.sqrt(n) : 0;

    // SPSS Skewness with bias correction: G1 = (n / ((n - 1)(n - 2))) * sum(((x - mean)/s)^3)
    let skewness = 0;
    if (n > 2 && stdDev > 0) {
      const m3 = vals.reduce((acc, x) => acc + Math.pow((x - mean) / stdDev, 3), 0);
      skewness = (n / ((n - 1) * (n - 2))) * m3;
    }

    // SPSS Kurtosis (Excess Kurtosis with bias correction): G2
    let kurtosis = 0;
    if (n > 3 && stdDev > 0) {
      const m4 = vals.reduce((acc, x) => acc + Math.pow((x - mean) / stdDev, 4), 0);
      const factor1 = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
      const factor2 = (3 * Math.pow(n - 1, 2)) / ((n - 2) * (n - 3));
      kurtosis = factor1 * m4 - factor2;
    }

    return {
      variable: col,
      n,
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      mean: Number(mean.toFixed(4)),
      variance: Number(variance.toFixed(4)),
      stdDev: Number(stdDev.toFixed(4)),
      skewness: Number(skewness.toFixed(4)),
      kurtosis: Number(kurtosis.toFixed(4)),
      stdErrorMean: Number(stdErrorMean.toFixed(4))
    };
  });
}

/**
 * Matriks Korelasi Pearson & Spearman Lengkap
 */
export function calculateCorrelationMatrix(
  rows: Record<string, any>[],
  columns: string[]
): CorrelationMatrixResult {
  const pearson: Record<string, Record<string, number>> = {};
  const spearman: Record<string, Record<string, number>> = {};
  const pValues: Record<string, Record<string, number>> = {};

  columns.forEach(c1 => {
    pearson[c1] = {};
    spearman[c1] = {};
    pValues[c1] = {};

    columns.forEach(c2 => {
      if (c1 === c2) {
        pearson[c1][c2] = 1.0;
        spearman[c1][c2] = 1.0;
        pValues[c1][c2] = 0.0;
        return;
      }

      // Pairwise non-null data points
      const pairs = rows
        .map(r => [Number(r[c1]), Number(r[c2])])
        .filter(([x, y]) => !isNaN(x) && !isNaN(y));

      const n = pairs.length;
      if (n < 3) {
        pearson[c1][c2] = 0;
        spearman[c1][c2] = 0;
        pValues[c1][c2] = 1.0;
        return;
      }

      const xs = pairs.map(p => p[0]);
      const ys = pairs.map(p => p[1]);

      // Pearson
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let denX = 0;
      let denY = 0;
      for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      const rPearson = denX > 0 && denY > 0 ? num / Math.sqrt(denX * denY) : 0;
      pearson[c1][c2] = Number(rPearson.toFixed(4));

      // Spearman (Rank-based correlation)
      const rank = (arr: number[]): number[] => {
        const sorted = arr.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
        const ranks = new Array(arr.length);
        let i = 0;
        while (i < sorted.length) {
          let j = i;
          while (j < sorted.length - 1 && sorted[j + 1].val === sorted[j].val) {
            j++;
          }
          const avgRank = (i + 1 + j + 1) / 2;
          for (let k = i; k <= j; k++) {
            ranks[sorted[k].idx] = avgRank;
          }
          i = j + 1;
        }
        return ranks;
      };

      const rx = rank(xs);
      const ry = rank(ys);
      const mrx = rx.reduce((a, b) => a + b, 0) / n;
      const mry = ry.reduce((a, b) => a + b, 0) / n;
      let numR = 0;
      let denRx = 0;
      let denRy = 0;
      for (let i = 0; i < n; i++) {
        const dx = rx[i] - mrx;
        const dy = ry[i] - mry;
        numR += dx * dy;
        denRx += dx * dx;
        denRy += dy * dy;
      }
      const rSpearman = denRx > 0 && denRy > 0 ? numR / Math.sqrt(denRx * denRy) : 0;
      spearman[c1][c2] = Number(rSpearman.toFixed(4));

      // t-stat for p-value: t = r * sqrt((n - 2)/(1 - r^2))
      const rClamped = Math.min(Math.max(rPearson, -0.99999), 0.99999);
      const tStat = Math.abs(rClamped) * Math.sqrt((n - 2) / (1 - rClamped * rClamped));
      // Normal approximation p-value for large n, or standard t-approx
      const pVal = 2 * (1 - normalCdf(tStat));
      pValues[c1][c2] = Number(pVal.toFixed(4));
    });
  });

  return { variables: columns, pearson, spearman, pValues };
}

/**
 * Standard Normal CDF approximation (Abramowitz & Stegun)
 */
function normalCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0.0) {
    const t = 1.0 / (1.0 + p * x);
    return 1.0 - c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  } else {
    const t = 1.0 / (1.0 - p * x);
    return c * Math.exp(-x * x / 2.0) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
}

/**
 * Visual Chart Data Generators: Histogram, Boxplot, Scatterplot
 */
export function generateVisualChartData(
  rows: Record<string, any>[],
  targetCol: string,
  predictorCol?: string,
  timeCol?: string
): VisualChartData {
  const vals = rows
    .map(r => Number(r[targetCol]))
    .filter(n => !isNaN(n) && n !== null && n !== undefined)
    .sort((a, b) => a - b);

  const n = vals.length;
  if (n === 0) {
    return {
      histogram: [],
      boxplot: { min: 0, q1: 0, median: 0, q3: 0, max: 0, iqr: 0, outliers: [] }
    };
  }

  // 1. Boxplot Five-number Summary
  const min = vals[0];
  const max = vals[n - 1];
  const median = n % 2 !== 0 ? vals[Math.floor(n / 2)] : (vals[n / 2 - 1] + vals[n / 2]) / 2;
  const q1 = vals[Math.floor(n * 0.25)];
  const q3 = vals[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const outliers = vals.filter(v => v < lowerFence || v > upperFence);

  // 2. Histogram (Sturges / Freedman-Diaconis rule)
  const numBins = Math.min(15, Math.max(5, Math.ceil(Math.log2(n) + 1)));
  const binWidth = (max - min) / (numBins || 1);
  const histogram: VisualChartData['histogram'] = [];

  for (let b = 0; b < numBins; b++) {
    const binStart = min + b * binWidth;
    const binEnd = b === numBins - 1 ? max : binStart + binWidth;
    const count = vals.filter(v => (b === numBins - 1 ? v >= binStart && v <= binEnd : v >= binStart && v < binEnd)).length;
    const density = n > 0 && binWidth > 0 ? count / (n * binWidth) : 0;
    histogram.push({
      binStart: Number(binStart.toFixed(2)),
      binEnd: Number(binEnd.toFixed(2)),
      count,
      density: Number(density.toFixed(4))
    });
  }

  // 3. Scatterplot (Y vs X) jika predictorCol diberikan
  let scatterplot: { x: number; y: number }[] | undefined;
  if (predictorCol) {
    scatterplot = rows
      .map(r => ({ x: Number(r[predictorCol]), y: Number(r[targetCol]) }))
      .filter(p => !isNaN(p.x) && !isNaN(p.y));
  }

  // 4. Time Series Plot jika timeCol diberikan
  let timeSeriesPlot: { time: string | number; value: number }[] | undefined;
  if (timeCol) {
    timeSeriesPlot = rows
      .map(r => ({ time: r[timeCol] ?? '', value: Number(r[targetCol]) }))
      .filter(p => p.time !== '' && !isNaN(p.value));
  }

  return {
    histogram,
    boxplot: {
      min: Number(min.toFixed(2)),
      q1: Number(q1.toFixed(2)),
      median: Number(median.toFixed(2)),
      q3: Number(q3.toFixed(2)),
      max: Number(max.toFixed(2)),
      iqr: Number(iqr.toFixed(2)),
      outliers: outliers.map(o => Number(o.toFixed(2)))
    },
    scatterplot,
    timeSeriesPlot
  };
}

