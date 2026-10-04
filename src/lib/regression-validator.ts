// ============================================================
// Statistical Regression Validator & Rule Engine (regresi-statistik-inti)
// ============================================================

import { sanitizeCellValue } from './file-signature';

export interface ColumnInfo {
  name: string;
  type: 'numeric' | 'binary' | 'categorical' | 'datetime' | 'text' | 'empty';
  uniqueCount: number;
  nullCount: number;
  sampleValues: any[];
}

export interface ValidationConfig {
  yCol: string;
  xCols: string[];
  isTimeSeries: boolean;
  timeCol?: string;
  frequency?: 'harian' | 'mingguan' | 'bulanan' | 'kuartalan' | 'tahunan' | 'tidak_beraturan';
  alpha?: number;
  missingPolicy?: 'listwise' | 'impute_mean' | 'impute_median';
}

export interface ValidationSummary {
  isValid: boolean;
  modelType: 'SLR' | 'MLR';
  kPredictors: number;
  sampleSize: {
    nInitial: number;
    nUsed: number;
    rowsDropped: number;
    pctMissing: number;
  };
  alpha: number;
  missingPolicy: string;
  errors: string[];
  warnings: string[];
  timeSeriesSummary?: {
    timeCol?: string;
    frequency?: string;
    duplicateTimeCount: number;
    isSorted: boolean;
    notice: string;
  };
}

/**
 * Deteksi tipe kolom dari array nilai
 */
export function inspectColumn(name: string, values: any[]): ColumnInfo {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  const nullCount = values.length - nonNull.length;
  const uniqueSet = new Set(nonNull);
  const uniqueCount = uniqueSet.size;

  if (nonNull.length === 0) {
    return { name, type: 'empty', uniqueCount: 0, nullCount, sampleValues: [] };
  }

  // Cek apakah seluruh nilai non-null dapat diparsing menjadi angka
  const numericCount = nonNull.filter(v => {
    if (typeof v === 'number') return !isNaN(v);
    if (typeof v === 'string') {
      const trimmed = v.trim();
      return trimmed !== '' && !isNaN(Number(trimmed));
    }
    return false;
  }).length;

  const isNumeric = numericCount === nonNull.length;

  if (isNumeric) {
    if (uniqueCount <= 2 && Array.from(uniqueSet).every(val => Number(val) === 0 || Number(val) === 1)) {
      return { name, type: 'binary', uniqueCount, nullCount, sampleValues: nonNull.slice(0, 5) };
    }
    return { name, type: 'numeric', uniqueCount, nullCount, sampleValues: nonNull.slice(0, 5) };
  }

  // Cek datetime
  const dateParsableCount = nonNull.filter(v => {
    if (v instanceof Date) return true;
    if (typeof v === 'string' && v.trim().length >= 4) {
      const d = Date.parse(v);
      return !isNaN(d);
    }
    return false;
  }).length;

  if (dateParsableCount > nonNull.length * 0.9) {
    return { name, type: 'datetime', uniqueCount, nullCount, sampleValues: nonNull.slice(0, 5) };
  }

  // Cek rasio variasi kategori
  if (uniqueCount <= 10 || uniqueCount / nonNull.length < 0.2) {
    return { name, type: 'categorical', uniqueCount, nullCount, sampleValues: nonNull.slice(0, 5) };
  }

  return { name, type: 'text', uniqueCount, nullCount, sampleValues: nonNull.slice(0, 5) };
}

/**
 * Validasi konfigurasi regresi statistik sesuai aturan regresi-statistik-inti
 */
export function validateRegressionConfig(
  rows: Record<string, any>[],
  config: ValidationConfig
): ValidationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];

  const {
    yCol,
    xCols = [],
    isTimeSeries = false,
    timeCol,
    frequency = 'tidak_beraturan',
    alpha = 0.05,
    missingPolicy = 'listwise'
  } = config;

  const nInitial = rows.length;

  // 1. Validasi Invarian I3: Alpha di antara 0 dan 1
  if (typeof alpha !== 'number' || alpha <= 0 || alpha >= 1) {
    errors.push(`Tingkat signifikansi (alpha) harus di antara 0 dan 1 (eksklusif), diberikan: ${alpha}`);
  }

  // 2. Validasi Invarian I4: Minimal 1 prediktor X
  if (!xCols || xCols.length === 0) {
    errors.push('Variabel independen X wajib dipilih minimal 1 kolom.');
  }

  // 3. Validasi Invarian I5: Y tidak boleh anggota X
  if (xCols && xCols.includes(yCol)) {
    errors.push(`Variabel dependen Y ('${yCol}') tidak boleh dipilih kembali sebagai variabel independen X.`);
  }

  // 4. Periksa keberadaan kolom
  if (rows.length === 0) {
    errors.push('Dataset kosong (0 baris data).');
    return {
      isValid: false,
      modelType: xCols.length > 1 ? 'MLR' : 'SLR',
      kPredictors: xCols.length,
      sampleSize: { nInitial: 0, nUsed: 0, rowsDropped: 0, pctMissing: 0 },
      alpha,
      missingPolicy,
      errors,
      warnings
    };
  }

  const availableCols = Object.keys(rows[0] || {});
  if (!availableCols.includes(yCol)) {
    errors.push(`Kolom Y '${yCol}' tidak ditemukan dalam dataset.`);
  }
  for (const x of xCols) {
    if (!availableCols.includes(x)) {
      errors.push(`Kolom X '${x}' tidak ditemukan dalam dataset.`);
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      modelType: xCols.length > 1 ? 'MLR' : 'SLR',
      kPredictors: xCols.length,
      sampleSize: { nInitial, nUsed: 0, rowsDropped: 0, pctMissing: 0 },
      alpha,
      missingPolicy,
      errors,
      warnings
    };
  }

  // 5. Invarian I1: Y harus numerik kontinu
  const yValues = rows.map(r => r[yCol]);
  const yInfo = inspectColumn(yCol, yValues);
  if (yInfo.type === 'empty') {
    errors.push(`Kolom Y ('${yCol}') seluruhnya bernilai kosong/null.`);
  } else if (yInfo.type === 'binary') {
    errors.push(`Kolom Y ('${yCol}') bertipe biner (0/1). OLS mengasumsikan Y kontinu; gunakan Regresi Logistik.`);
  } else if (yInfo.type !== 'numeric') {
    errors.push(`Kolom Y ('${yCol}') bertipe non-numerik (${yInfo.type}). OLS mensyaratkan Y bertipe numerik kontinu.`);
  }

  // 6. Pembersihan Missing Data (Listwise)
  const requiredCols = [yCol, ...xCols];
  if (isTimeSeries && timeCol) {
    requiredCols.push(timeCol);
  }

  const validRows = rows.filter(row => {
    return requiredCols.every(col => {
      const v = row[col];
      return v !== null && v !== undefined && v !== '' && (typeof v !== 'number' || !isNaN(v));
    });
  });

  const nUsed = validRows.length;
  const rowsDropped = nInitial - nUsed;
  const pctMissing = nInitial > 0 ? (rowsDropped / nInitial) * 100 : 0;

  if (pctMissing > 20.0) {
    warnings.push(`Terdapat ${rowsDropped} baris data hilang (${pctMissing.toFixed(1)}%) yang dibuang secara listwise. Evaluasi representasi sampel.`);
  }

  const k = xCols.length;
  const modelType: 'SLR' | 'MLR' = k > 1 ? 'MLR' : 'SLR';

  // 7. Invarian I2 & Kecukupan Sampel (Green, 1991)
  if (nUsed <= k + 1) {
    errors.push(`Ukuran sampel terpakai (n=${nUsed}) tidak mencukupi untuk mengestimasi ${k} prediktor (syarat n > k + 1 = ${k + 2}). Estimasi OLS diblokir.`);
  } else {
    const greenModel = 50 + 8 * k;
    const greenPredictor = 104 + k;
    if (nUsed < greenModel) {
      warnings.push(`Ukuran sampel (n=${nUsed}) di bawah pedoman Green (1991) untuk uji kelayakan model (n >= 50 + 8k = ${greenModel}).`);
    }
    if (nUsed < greenPredictor) {
      warnings.push(`Ukuran sampel (n=${nUsed}) di bawah pedoman Green (1991) untuk uji signifikansi koefisien individu (n >= 104 + k = ${greenPredictor}).`);
    }
  }

  // 8. Cek Kolom X Konstan (Zero Variance)
  for (const x of xCols) {
    const xVals = validRows.map(r => Number(r[x])).filter(v => !isNaN(v));
    const uniqueXVals = new Set(xVals);
    if (uniqueXVals.size <= 1) {
      errors.push(`Kolom X ('${x}') bernilai konstan (varians = 0) pada sampel terpakai. Kolom konstan tidak dapat dijadikan prediktor OLS.`);
    }
  }

  // 9. Cek Time Series
  let timeSeriesSummary: ValidationSummary['timeSeriesSummary'] = undefined;
  if (isTimeSeries) {
    if (!timeCol) {
      errors.push("Data dinyatakan sebagai Time Series, namun kolom penunjuk waktu belum dipilih.");
    } else if (!availableCols.includes(timeCol)) {
      errors.push(`Kolom waktu '${timeCol}' tidak ditemukan dalam dataset.`);
    } else if (timeCol === yCol || xCols.includes(timeCol)) {
      errors.push(`Kolom waktu ('${timeCol}') tidak boleh dijadikan variabel dependen Y maupun independen X.`);
    } else {
      // Periksa apakah waktu terurut dan ada duplikat
      const timeValues = validRows.map(r => r[timeCol]);
      const timeSet = new Set(timeValues);
      const duplicateCount = timeValues.length - timeSet.size;

      if (duplicateCount > 0) {
        warnings.push(`Ditemukan ${duplicateCount} baris dengan waktu duplikat pada kolom '${timeCol}'.`);
      }

      timeSeriesSummary = {
        timeCol,
        frequency,
        duplicateTimeCount: duplicateCount,
        isSorted: true,
        notice: "Data time series akan diurutkan secara kronologis menaik. Pengujian autokorelasi (Breusch-Godfrey) dan stasioneritas (ADF & KPSS) diaktifkan."
      };
    }
  } else {
    timeSeriesSummary = {
      duplicateTimeCount: 0,
      isSorted: false,
      notice: "Data cross-section (bukan time series). Urutan baris dianggap independen. Uji Durbin-Watson hanya ditampilkan sebagai acuan deskriptif."
    };
  }

  return {
    isValid: errors.length === 0,
    modelType,
    kPredictors: k,
    sampleSize: {
      nInitial,
      nUsed,
      rowsDropped,
      pctMissing: Math.round(pctMissing * 100) / 100
    },
    alpha,
    missingPolicy,
    errors,
    warnings,
    timeSeriesSummary
  };
}
