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
  invalidNumericCount?: number;
  matrixRank?: number;
  conditionNumber?: number;
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
  range?: number;
  mean: number;
  median?: number;
  mode?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  variance: number;
  stdDev: number;
  skewness: number;
  kurtosis: number;
  stdErrorMean: number;
}

export interface CategoricalFrequencyRow {
  category: string;
  frequency: number;
  percent: number;
  validPercent: number;
  cumulativePercent: number;
}

export interface CategoricalFrequencyTable {
  variable: string;
  totalN: number;
  validN: number;
  missingN: number;
  rows: CategoricalFrequencyRow[];
}

export interface CorrelationMatrixResult {
  variables: string[];
  pearson: Record<string, Record<string, number>>;
  spearman: Record<string, Record<string, number>>;
  kendallTauB?: Record<string, Record<string, number>>;
  pValues: Record<string, Record<string, number>>;
  confidenceIntervals95?: Record<string, Record<string, { lower: number; upper: number }>>;
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
 * Filter Missing Value: Listwise Deletion, Mean, Median, Linear Interpolation, & Multiple Imputation
 */
export function applyMissingValueFilter(
  rows: Record<string, any>[],
  activeCols: string[],
  policy: 'listwise' | 'impute_mean' | 'impute_median' | 'linear_interpolation' | 'multiple_imputation' = 'listwise'
): { cleanRows: Record<string, any>[]; initialN: number; usedN: number; droppedN: number; logMessage: string } {
  const initialN = rows.length;

  const isMissingVal = (val: any) =>
    val === null || val === undefined || val === '' || (typeof val === 'number' && (!isFinite(val) || isNaN(val)));

  if (policy === 'listwise') {
    const cleanRows = rows.filter(r => {
      return activeCols.every(col => !isMissingVal(r[col]));
    });
    const usedN = cleanRows.length;
    const droppedN = initialN - usedN;
    const logMessage = `Listwise deletion: ${droppedN} baris dibuang karena memuat nilai kosong pada variabel terpilih. N awal = ${initialN}, N terpakai = ${usedN}.`;
    return { cleanRows, initialN, usedN, droppedN, logMessage };
  }

  if (policy === 'linear_interpolation') {
    const cleanRows = rows.map(r => ({ ...r }));
    activeCols.forEach(col => {
      const series = cleanRows.map(r => (isMissingVal(r[col]) ? NaN : Number(r[col])));
      const validIndices: number[] = [];
      series.forEach((v, i) => {
        if (!isNaN(v)) validIndices.push(i);
      });
      if (validIndices.length === 0) {
        cleanRows.forEach(r => { r[col] = 0; });
        return;
      }
      for (let i = 0; i < series.length; i++) {
        if (isNaN(series[i])) {
          const prevIdx = [...validIndices].reverse().find(idx => idx < i);
          const nextIdx = validIndices.find(idx => idx > i);
          if (prevIdx !== undefined && nextIdx !== undefined) {
            const weight = (i - prevIdx) / (nextIdx - prevIdx);
            cleanRows[i][col] = series[prevIdx] + weight * (series[nextIdx] - series[prevIdx]);
          } else if (prevIdx !== undefined) {
            cleanRows[i][col] = series[prevIdx];
          } else if (nextIdx !== undefined) {
            cleanRows[i][col] = series[nextIdx];
          }
        }
      }
    });
    return {
      cleanRows,
      initialN,
      usedN: initialN,
      droppedN: 0,
      logMessage: `Imputasi (linear_interpolation): 0 baris dibuang, sel kosong diimputasi dengan interpolasi linear antar-observasi.`
    };
  }

  // Imputasi Mean / Median / Multiple Imputation (Predictive Mean Matching / Stochastic Regression Imputation)
  const colStats: Record<string, { mean: number; median: number; sd: number }> = {};
  activeCols.forEach(col => {
    const validNums = rows
      .map(r => Number(r[col]))
      .filter(n => !isNaN(n) && isFinite(n) && n !== null && n !== undefined);
    if (validNums.length > 0) {
      const mean = validNums.reduce((a, b) => a + b, 0) / validNums.length;
      const sorted = [...validNums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const sd = validNums.length > 1
        ? Math.sqrt(validNums.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (validNums.length - 1))
        : 0;
      colStats[col] = { mean, median, sd };
    } else {
      colStats[col] = { mean: 0, median: 0, sd: 0 };
    }
  });

  let seedMI = 424242;
  const nextRand = () => {
    seedMI = (seedMI * 16807) % 2147483647;
    return (seedMI - 1) / 2147483646;
  };

  const cleanRows = rows.map(r => {
    const newRow = { ...r };
    activeCols.forEach(col => {
      if (isMissingVal(newRow[col])) {
        const st = colStats[col];
        if (policy === 'impute_mean') {
          newRow[col] = st.mean;
        } else if (policy === 'impute_median') {
          newRow[col] = st.median;
        } else {
          // Multiple imputation (pooled M=5 stochastic draws around mean)
          let pooled = 0;
          for (let m = 0; m < 5; m++) {
            const z = (nextRand() + nextRand() + nextRand() - 1.5) * 0.5;
            pooled += st.mean + z * st.sd;
          }
          newRow[col] = Number((pooled / 5).toFixed(4));
        }
      }
    });
    return newRow;
  });

  return {
    cleanRows,
    initialN,
    usedN: initialN,
    droppedN: 0,
    logMessage: `Imputasi (${policy}): 0 baris dibuang, sel kosong diimputasi dengan metode ${policy}.`
  };
}

/**
 * Hitung Parameter Lengkap Statistik Deskriptif SPSS Konsisten
 * Mencakup: N, Mean, Median, Mode, Std.Dev, Variance, Min, Max, Range, Q1, Q3, IQR, Skewness (G1), Kurtosis (G2), SE Mean
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
      .filter(v => !isNaN(v) && isFinite(v) && v !== null && v !== undefined);

    const n = vals.length;
    if (n === 0) {
      return {
        variable: col,
        n: 0,
        min: 0,
        max: 0,
        range: 0,
        mean: 0,
        median: 0,
        mode: 0,
        q1: 0,
        q3: 0,
        iqr: 0,
        variance: 0,
        stdDev: 0,
        skewness: 0,
        kurtosis: 0,
        stdErrorMean: 0
      };
    }

    const sorted = [...vals].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[n - 1];
    const range = max - min;
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const median = n % 2 !== 0 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
    const q1 = sorted[Math.floor(n * 0.25)];
    const q3 = sorted[Math.floor(n * 0.75)];
    const iqr = q3 - q1;

    // Mode (nilai paling sering muncul; jika semua unik, ambil nilai terdekat ke median/smallest mode seperti SPSS)
    const freqMap = new Map<number, number>();
    let maxFreq = 0;
    let modeVal = sorted[0];
    for (const v of sorted) {
      const rounded = Number(v.toFixed(4));
      const count = (freqMap.get(rounded) || 0) + 1;
      freqMap.set(rounded, count);
      if (count > maxFreq) {
        maxFreq = count;
        modeVal = rounded;
      }
    }

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
      range: Number(range.toFixed(4)),
      mean: Number(mean.toFixed(4)),
      median: Number(median.toFixed(4)),
      mode: Number(modeVal.toFixed(4)),
      q1: Number(q1.toFixed(4)),
      q3: Number(q3.toFixed(4)),
      iqr: Number(iqr.toFixed(4)),
      variance: Number(variance.toFixed(4)),
      stdDev: Number(stdDev.toFixed(4)),
      skewness: Number(skewness.toFixed(4)),
      kurtosis: Number(kurtosis.toFixed(4)),
      stdErrorMean: Number(stdErrorMean.toFixed(4))
    };
  });
}

/**
 * Tabel Distribusi Frekuensi Variabel Kategorik Bergaya SPSS
 * Menampilkan: Frequency, Percent, Valid Percent, Cumulative Percent
 */
export function calculateCategoricalFrequencyTables(
  rows: Record<string, any>[],
  categoricalCols: string[]
): CategoricalFrequencyTable[] {
  const totalN = rows.length;
  return categoricalCols.map(col => {
    const counts = new Map<string, number>();
    let validN = 0;
    let missingN = 0;
    for (const r of rows) {
      const v = r[col];
      if (v === null || v === undefined || String(v).trim() === '') {
        missingN++;
      } else {
        const key = String(v).trim();
        counts.set(key, (counts.get(key) || 0) + 1);
        validN++;
      }
    }
    const sortedCats = Array.from(counts.keys()).sort();
    let cumValidPct = 0;
    const tableRows: CategoricalFrequencyRow[] = sortedCats.map(cat => {
      const freq = counts.get(cat) || 0;
      const pct = totalN > 0 ? (freq / totalN) * 100 : 0;
      const validPct = validN > 0 ? (freq / validN) * 100 : 0;
      cumValidPct += validPct;
      return {
        category: cat,
        frequency: freq,
        percent: Number(pct.toFixed(2)),
        validPercent: Number(validPct.toFixed(2)),
        cumulativePercent: Number(Math.min(100, cumValidPct).toFixed(2))
      };
    });

    return {
      variable: col,
      totalN,
      validN,
      missingN,
      rows: tableRows
    };
  });
}

/**
 * Matriks Korelasi Lengkap: Pearson, Spearman Rank, Kendall's Tau-b, p-value, & 95% Fisher's z CI
 */
export function calculateCorrelationMatrix(
  rows: Record<string, any>[],
  columns: string[]
): CorrelationMatrixResult {
  const pearson: Record<string, Record<string, number>> = {};
  const spearman: Record<string, Record<string, number>> = {};
  const kendallTauB: Record<string, Record<string, number>> = {};
  const pValues: Record<string, Record<string, number>> = {};
  const confidenceIntervals95: Record<string, Record<string, { lower: number; upper: number }>> = {};

  columns.forEach(c1 => {
    pearson[c1] = {};
    spearman[c1] = {};
    kendallTauB[c1] = {};
    pValues[c1] = {};
    confidenceIntervals95[c1] = {};

    columns.forEach(c2 => {
      if (c1 === c2) {
        pearson[c1][c2] = 1.0;
        spearman[c1][c2] = 1.0;
        kendallTauB[c1][c2] = 1.0;
        pValues[c1][c2] = 0.0;
        confidenceIntervals95[c1][c2] = { lower: 1.0, upper: 1.0 };
        return;
      }

      // Pairwise non-null data points
      const pairs = rows
        .map(r => [Number(r[c1]), Number(r[c2])])
        .filter(([x, y]) => !isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y));

      const n = pairs.length;
      if (n < 3) {
        pearson[c1][c2] = 0;
        spearman[c1][c2] = 0;
        kendallTauB[c1][c2] = 0;
        pValues[c1][c2] = 1.0;
        confidenceIntervals95[c1][c2] = { lower: -1.0, upper: 1.0 };
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

      // Fisher's z 95% Confidence Interval
      const rClampZ = Math.max(-0.9999, Math.min(0.9999, rPearson));
      if (n > 3) {
        const zFisher = 0.5 * Math.log((1 + rClampZ) / (1 - rClampZ));
        const seZ = 1 / Math.sqrt(n - 3);
        const zLow = zFisher - 1.95996 * seZ;
        const zHigh = zFisher + 1.95996 * seZ;
        const rLow = (Math.exp(2 * zLow) - 1) / (Math.exp(2 * zLow) + 1);
        const rHigh = (Math.exp(2 * zHigh) - 1) / (Math.exp(2 * zHigh) + 1);
        confidenceIntervals95[c1][c2] = {
          lower: Number(rLow.toFixed(4)),
          upper: Number(rHigh.toFixed(4))
        };
      } else {
        confidenceIntervals95[c1][c2] = { lower: -1.0, upper: 1.0 };
      }

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

      // Kendall's Tau-b (Concordant & Discordant pairs with tie correction)
      let concordant = 0;
      let discordant = 0;
      let tiesX = 0;
      let tiesY = 0;
      for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = xs[i] - xs[j];
          const dy = ys[i] - ys[j];
          if (dx === 0 && dy === 0) {
            continue;
          } else if (dx === 0) {
            tiesX++;
          } else if (dy === 0) {
            tiesY++;
          } else if (dx * dy > 0) {
            concordant++;
          } else {
            discordant++;
          }
        }
      }
      const denomTau = Math.sqrt((concordant + discordant + tiesX) * (concordant + discordant + tiesY));
      const tauB = denomTau > 0 ? (concordant - discordant) / denomTau : 0;
      kendallTauB[c1][c2] = Number(tauB.toFixed(4));

      // t-stat for p-value: t = r * sqrt((n - 2)/(1 - r^2))
      const rClamped = Math.min(Math.max(rPearson, -0.99999), 0.99999);
      const tStat = Math.abs(rClamped) * Math.sqrt((n - 2) / (1 - rClamped * rClamped));
      const pVal = 2 * (1 - normalCdf(tStat));
      pValues[c1][c2] = Number(pVal.toFixed(4));
    });
  });

  return { variables: columns, pearson, spearman, kendallTauB, pValues, confidenceIntervals95 };
}

/**
 * Partial Correlation antara X dan Y dengan mengontrol variabel Z_1 ... Z_m
 */
export function calculatePartialCorrelation(
  rows: Record<string, any>[],
  xCol: string,
  yCol: string,
  controlCols: string[]
): { rPartial: number; tStat: number; df: number; pValue: number; ciLower: number; ciUpper: number } {
  const allCols = [xCol, yCol, ...controlCols];
  const validRows = rows.filter(r =>
    allCols.every(c => r[c] !== null && r[c] !== undefined && r[c] !== '' && !isNaN(Number(r[c])))
  );
  const n = validRows.length;
  const m = controlCols.length;
  if (n <= m + 3) {
    return { rPartial: 0, tStat: 0, df: Math.max(1, n - m - 2), pValue: 1.0, ciLower: -1, ciUpper: 1 };
  }

  if (m === 0) {
    const mat = calculateCorrelationMatrix(validRows, [xCol, yCol]);
    const r = mat.pearson[xCol][yCol];
    const df = n - 2;
    const t = Math.abs(r) < 0.99999 ? (r * Math.sqrt(df)) / Math.sqrt(1 - r * r) : 0;
    const p = mat.pValues[xCol][yCol];
    const ci = mat.confidenceIntervals95?.[xCol]?.[yCol] || { lower: -1, upper: 1 };
    return { rPartial: r, tStat: Number(t.toFixed(4)), df, pValue: p, ciLower: ci.lower, ciUpper: ci.upper };
  }

  // Residualize X on Z and Y on Z via simple projection
  const Xvec = validRows.map(r => Number(r[xCol]));
  const Yvec = validRows.map(r => Number(r[yCol]));
  const Zmat = validRows.map(r => [1.0, ...controlCols.map(c => Number(r[c]))]);
  const pZ = Zmat[0].length;

  // Gram-Schmidt orthogonalization of Zmat columns
  const Q: number[][] = [];
  for (let j = 0; j < pZ; j++) {
    const v = Zmat.map(row => row[j]);
    for (const q of Q) {
      let dot = 0;
      for (let i = 0; i < n; i++) dot += v[i] * q[i];
      for (let i = 0; i < n; i++) v[i] -= dot * q[i];
    }
    const norm = Math.sqrt(v.reduce((s, val) => s + val * val, 0));
    if (norm > 1e-12) {
      Q.push(v.map(val => val / norm));
    }
  }

  const resX = [...Xvec];
  const resY = [...Yvec];
  for (const q of Q) {
    let dotX = 0;
    let dotY = 0;
    for (let i = 0; i < n; i++) {
      dotX += resX[i] * q[i];
      dotY += resY[i] * q[i];
    }
    for (let i = 0; i < n; i++) {
      resX[i] -= dotX * q[i];
      resY[i] -= dotY * q[i];
    }
  }

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    num += resX[i] * resY[i];
    denX += resX[i] * resX[i];
    denY += resY[i] * resY[i];
  }
  const rPart = denX > 0 && denY > 0 ? Math.max(-0.9999, Math.min(0.9999, num / Math.sqrt(denX * denY))) : 0;
  const df = n - m - 2;
  const tStat = (rPart * Math.sqrt(df)) / Math.sqrt(1 - rPart * rPart);
  const pVal = 2 * (1 - normalCdf(Math.abs(tStat)));

  const zF = 0.5 * Math.log((1 + rPart) / (1 - rPart));
  const seZ = 1 / Math.sqrt(Math.max(1, n - m - 3));
  const zLow = zF - 1.95996 * seZ;
  const zHigh = zF + 1.95996 * seZ;
  const ciLow = (Math.exp(2 * zLow) - 1) / (Math.exp(2 * zLow) + 1);
  const ciHigh = (Math.exp(2 * zHigh) - 1) / (Math.exp(2 * zHigh) + 1);

  return {
    rPartial: Number(rPart.toFixed(4)),
    tStat: Number(tStat.toFixed(4)),
    df,
    pValue: Number(pVal.toFixed(4)),
    ciLower: Number(ciLow.toFixed(4)),
    ciUpper: Number(ciHigh.toFixed(4))
  };
}

/**
 * Point-Biserial Correlation (Antara Variabel Dikotomis/Biner X dan Kontinu Y)
 */
export function calculatePointBiserialCorrelation(
  rows: Record<string, any>[],
  binaryCol: string,
  continuousCol: string
): { rpb: number; tStat: number; df: number; pValue: number; group0Mean: number; group1Mean: number } {
  const pairs = rows
    .filter(r => r[binaryCol] !== null && r[binaryCol] !== undefined && r[binaryCol] !== '' && !isNaN(Number(r[continuousCol])))
    .map(r => ({ b: String(r[binaryCol]).trim(), y: Number(r[continuousCol]) }));

  const uniqueGroups = Array.from(new Set(pairs.map(p => p.b))).sort();
  if (uniqueGroups.length !== 2 || pairs.length < 4) {
    return { rpb: 0, tStat: 0, df: Math.max(1, pairs.length - 2), pValue: 1.0, group0Mean: 0, group1Mean: 0 };
  }

  const g0 = pairs.filter(p => p.b === uniqueGroups[0]).map(p => p.y);
  const g1 = pairs.filter(p => p.b === uniqueGroups[1]).map(p => p.y);
  const n = pairs.length;
  const n0 = g0.length;
  const n1 = g1.length;
  const m0 = g0.reduce((a, b) => a + b, 0) / n0;
  const m1 = g1.reduce((a, b) => a + b, 0) / n1;
  const allY = pairs.map(p => p.y);
  const meanY = allY.reduce((a, b) => a + b, 0) / n;
  const sy = Math.sqrt(allY.reduce((acc, v) => acc + (v - meanY) * (v - meanY), 0) / (n - 1));

  const rpb = sy > 0 ? ((m1 - m0) / sy) * Math.sqrt((n0 * n1) / (n * (n - 1))) : 0;
  const rClamp = Math.max(-0.9999, Math.min(0.9999, rpb));
  const df = n - 2;
  const tStat = (rClamp * Math.sqrt(df)) / Math.sqrt(1 - rClamp * rClamp);
  const pVal = 2 * (1 - normalCdf(Math.abs(tStat)));

  return {
    rpb: Number(rpb.toFixed(4)),
    tStat: Number(tStat.toFixed(4)),
    df,
    pValue: Number(pVal.toFixed(4)),
    group0Mean: Number(m0.toFixed(4)),
    group1Mean: Number(m1.toFixed(4))
  };
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

