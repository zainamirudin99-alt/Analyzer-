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
  missingPolicy?: 'listwise' | 'impute_mean' | 'impute_median' | 'linear_interpolation' | 'multiple_imputation';
}

export interface TimeSeriesSequenceValidation {
  isValidFormat: boolean;
  isChronological: boolean;
  duplicateCount: number;
  gapCount: number;
  isIrregularInterval: boolean;
  warnings: string[];
  errors: string[];
  sortedPreviewNote: string;
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

  // 6. Pembersihan Missing Data & Estimasi nUsed
  const requiredCols = [yCol, ...xCols];
  if (isTimeSeries && timeCol) {
    requiredCols.push(timeCol);
  }

  const colInfos: Record<string, ColumnInfo> = {};
  for (const x of xCols) {
    colInfos[x] = inspectColumn(x, rows.map(r => r[x]));
  }
  const catXCols = xCols.filter(x => colInfos[x].type === 'categorical' || colInfos[x].type === 'text' || colInfos[x].type === 'binary');

  const validRows = missingPolicy === 'listwise'
    ? rows.filter(row =>
        requiredCols.every(col => {
          const v = row[col];
          return v !== null && v !== undefined && v !== '' && (typeof v !== 'number' || !isNaN(v));
        })
      )
    : rows.filter(row => {
        const tsOk = !isTimeSeries || !timeCol || (row[timeCol] !== null && row[timeCol] !== undefined && row[timeCol] !== '');
        const catOk = catXCols.every(col => row[col] !== null && row[col] !== undefined && row[col] !== '');
        return tsOk && catOk;
      });

  const nUsed = validRows.length;
  const rowsDropped = nInitial - nUsed;
  const pctMissing = nInitial > 0 ? (rowsDropped / nInitial) * 100 : 0;

  if (missingPolicy === 'listwise' && pctMissing > 20.0) {
    warnings.push(`Terdapat ${rowsDropped} baris data hilang (${pctMissing.toFixed(1)}%) yang dibuang secara listwise. Evaluasi representasi sampel.`);
  }

  // Hitung effective predictors (k) memperhitungkan dummy untuk X kategorik
  let effectiveK = 0;
  for (const x of xCols) {
    if (colInfos[x].type === 'categorical' || colInfos[x].type === 'text') {
      effectiveK += Math.max(1, colInfos[x].uniqueCount - 1);
    } else {
      effectiveK += 1;
    }
  }
  const k = Math.max(xCols.length, effectiveK);
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

  // 8. Cek Kolom X Konstan (Zero Variance) — mendukung numerik & kategorik
  for (const x of xCols) {
    const rawUnique = new Set(
      validRows
        .map(r => r[x])
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(v => String(v).trim())
    );
    if (rawUnique.size <= 1) {
      errors.push(`Kolom X ('${x}') bernilai konstan (varians = 0) pada sampel terpakai. Kolom konstan tidak dapat dijadikan prediktor OLS.`);
    }
  }

  // 9. Cek Time Series Sequence Lengkap
  let timeSeriesSummary: ValidationSummary['timeSeriesSummary'] = undefined;
  if (isTimeSeries) {
    if (!timeCol) {
      errors.push("Data dinyatakan sebagai Time Series, namun kolom penunjuk waktu belum dipilih.");
    } else if (!availableCols.includes(timeCol)) {
      errors.push(`Kolom waktu '${timeCol}' tidak ditemukan dalam dataset.`);
    } else if (timeCol === yCol || xCols.includes(timeCol)) {
      errors.push(`Kolom waktu ('${timeCol}') tidak boleh dijadikan variabel dependen Y maupun independen X.`);
    } else {
      const seqCheck = validateTimeSeriesSequence(validRows, timeCol, frequency);
      errors.push(...seqCheck.errors);
      warnings.push(...seqCheck.warnings);

      timeSeriesSummary = {
        timeCol,
        frequency,
        duplicateTimeCount: seqCheck.duplicateCount,
        isSorted: seqCheck.isChronological,
        notice: seqCheck.sortedPreviewNote
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

function parseSortableTimeKey(val: any): { ok: boolean; value: number; isNumericPeriod: boolean } {
  if (val === null || val === undefined || val === '') return { ok: false, value: NaN, isNumericPeriod: false };
  if (typeof val === 'number' && isFinite(val)) return { ok: true, value: val, isNumericPeriod: true };
  const s = String(val).trim();
  const num = Number(s);
  if (!isNaN(num) && isFinite(num)) return { ok: true, value: num, isNumericPeriod: true };
  const ms = Date.parse(s);
  if (!isNaN(ms)) return { ok: true, value: ms, isNumericPeriod: false };
  return { ok: false, value: NaN, isNumericPeriod: false };
}

/**
 * Validasi urutan kronologis, duplikasi periode, gap, dan konsistensi interval Time Series
 */
export function validateTimeSeriesSequence(
  rows: Record<string, any>[],
  timeCol: string,
  frequency: 'harian' | 'mingguan' | 'bulanan' | 'kuartalan' | 'tahunan' | 'tidak_beraturan' = 'tidak_beraturan'
): TimeSeriesSequenceValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!rows || rows.length === 0) {
    return {
      isValidFormat: false,
      isChronological: false,
      duplicateCount: 0,
      gapCount: 0,
      isIrregularInterval: false,
      warnings,
      errors: ['Dataset kosong untuk validasi time series.'],
      sortedPreviewNote: ''
    };
  }

  const parsed = rows.map(r => ({ raw: r[timeCol], ...parseSortableTimeKey(r[timeCol]) }));
  const invalidFormatCount = parsed.filter(p => !p.ok).length;
  const validTimeKeys = parsed.filter(p => p.ok);

  if (invalidFormatCount > 0) {
    warnings.push(`${invalidFormatCount} baris pada kolom waktu '${timeCol}' tidak dapat diparsing sebagai angka periode maupun tanggal standar.`);
  }

  // Check duplicate timestamps/periods
  const rawSet = new Set(parsed.map(p => String(p.raw ?? '').trim()).filter(s => s !== ''));
  const duplicateCount = Math.max(0, parsed.length - rawSet.size);
  if (duplicateCount > 0) {
    warnings.push(`Ditemukan ${duplicateCount} periode waktu duplikat pada kolom '${timeCol}'.`);
  }

  // Check chronological ordering
  let isChronological = true;
  for (let i = 1; i < validTimeKeys.length; i++) {
    if (validTimeKeys[i].value < validTimeKeys[i - 1].value) {
      isChronological = false;
      break;
    }
  }
  if (!isChronological) {
    warnings.push(`Urutan data pada kolom '${timeCol}' belum kronologis menaik; sistem akan mengurutkan data secara otomatis sebelum estimasi lag.`);
  }

  // Check interval consistency & missing period gaps on sorted keys
  const sortedVals = [...validTimeKeys.map(p => p.value)].sort((a, b) => a - b);
  let gapCount = 0;
  let isIrregularInterval = false;

  if (sortedVals.length >= 3) {
    const diffs: number[] = [];
    for (let i = 1; i < sortedVals.length; i++) {
      const d = sortedVals[i] - sortedVals[i - 1];
      if (d > 0) diffs.push(d);
    }
    if (diffs.length >= 2) {
      const sortedDiffs = [...diffs].sort((a, b) => a - b);
      const baseStep = sortedDiffs[Math.floor(sortedDiffs.length / 2)];
      if (baseStep > 0) {
        const tol = baseStep * 0.35;
        for (const d of diffs) {
          if (Math.abs(d - baseStep) > tol) {
            isIrregularInterval = true;
            if (d > baseStep * 1.5) {
              gapCount += Math.max(1, Math.round(d / baseStep) - 1);
            }
          }
        }
      }
    }
  }

  if (gapCount > 0) {
    warnings.push(`Terindikasi sekitar ${gapCount} periode terlewati (gap) pada kolom '${timeCol}' (frekuensi: ${frequency}).`);
  } else if (isIrregularInterval && frequency !== 'tidak_beraturan') {
    warnings.push(`Interval antarperiode pada kolom '${timeCol}' bervariasi; pertimbangkan apakah data termasuk 'tidak_beraturan'.`);
  }

  return {
    isValidFormat: invalidFormatCount < rows.length,
    isChronological,
    duplicateCount,
    gapCount,
    isIrregularInterval,
    warnings,
    errors,
    sortedPreviewNote: isChronological
      ? `Data time series terurut kronologis (${frequency}). Diagnostik ADF, KPSS, Breusch-Godfrey, dan ARCH-LM diaktifkan.`
      : `Data time series akan diurutkan kronologis (${frequency}) sebelum estimasi. Diagnostik ADF, KPSS, Breusch-Godfrey, dan ARCH-LM diaktifkan.`
  };
}

/**
 * Validasi konfigurasi Moderated Regression Analysis (MRA)
 */
export function validateMRAConfig(input: {
  rows: Record<string, any>[];
  yCol: string;
  xCol: string;
  zCol: string;
  covariateCols?: string[];
  isModeratorCategorical?: boolean;
  alpha?: number;
}): { isValid: boolean; errors: string[]; warnings: string[] } {
  const { rows, yCol, xCol, zCol, covariateCols = [], isModeratorCategorical = false, alpha = 0.05 } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rows || rows.length === 0) errors.push('Dataset kosong (0 baris).');
  if (alpha <= 0 || alpha >= 1) errors.push('Nilai alpha harus berada di antara 0 dan 1.');
  if (!yCol || !xCol || !zCol) errors.push('Variabel Y, prediktor utama X, dan moderator Z wajib dipilih.');
  if (yCol === xCol || yCol === zCol || xCol === zCol) {
    errors.push('Variabel Y, X, dan moderator Z tidak boleh saling tumpang tindih.');
  }
  if (covariateCols.includes(yCol) || covariateCols.includes(xCol) || covariateCols.includes(zCol)) {
    errors.push('Variabel kovariat tidak boleh sama dengan Y, X, atau moderator Z.');
  }

  if (errors.length === 0 && rows.length > 0) {
    const yInfo = inspectColumn(yCol, rows.map(r => r[yCol]));
    const xInfo = inspectColumn(xCol, rows.map(r => r[xCol]));
    if (yInfo.type !== 'numeric') errors.push(`Variabel Y ('${yCol}') pada MRA harus bertipe numerik kontinu.`);
    if (xInfo.type !== 'numeric' && xInfo.type !== 'binary') errors.push(`Prediktor utama X ('${xCol}') pada MRA harus numerik atau biner.`);

    const zInfo = inspectColumn(zCol, rows.map(r => r[zCol]));
    if (!isModeratorCategorical && zInfo.type !== 'numeric' && zInfo.type !== 'binary') {
      warnings.push(`Moderator '${zCol}' terdeteksi bertipe ${zInfo.type}; pertimbangkan mengaktifkan opsi Moderator Kategorikal.`);
    }
    if (zInfo.uniqueCount < 2) {
      errors.push(`Variabel moderator '${zCol}' bersifat konstan (hanya ${zInfo.uniqueCount} nilai unik).`);
    }
    if (rows.length < 10 + covariateCols.length) {
      warnings.push(`Ukuran sampel n=${rows.length} relatif kecil untuk uji interaksi moderasi.`);
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Validasi konfigurasi Analisis Kontingensi & Chi-Square
 */
export function validateContingencyConfig(input: {
  rows: Record<string, any>[];
  rowCol: string;
  colCol: string;
  alpha?: number;
}): { isValid: boolean; errors: string[]; warnings: string[] } {
  const { rows, rowCol, colCol, alpha = 0.05 } = input;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rows || rows.length === 0) errors.push('Dataset kosong (0 baris).');
  if (alpha <= 0 || alpha >= 1) errors.push('Nilai alpha harus berada di antara 0 dan 1.');
  if (!rowCol || !colCol) errors.push('Variabel Baris dan Variabel Kolom wajib dipilih.');
  if (rowCol && colCol && rowCol === colCol) errors.push('Variabel Baris dan Variabel Kolom tidak boleh sama.');

  if (errors.length === 0 && rows.length > 0) {
    const valid = rows.filter(r => {
      const a = r[rowCol];
      const b = r[colCol];
      return a !== null && a !== undefined && a !== '' && b !== null && b !== undefined && b !== '';
    });
    const rCats = new Set(valid.map(r => String(r[rowCol]).trim()));
    const cCats = new Set(valid.map(r => String(r[colCol]).trim()));
    if (valid.length < 4) errors.push(`Ukuran sampel valid (n=${valid.length}) terlalu kecil untuk uji kontingensi.`);
    if (rCats.size < 2 || cCats.size < 2) {
      errors.push(`Kedua variabel kontingensi minimal harus memiliki 2 kategori unik (saat ini: ${rCats.size} x ${cCats.size}).`);
    }
    if (rCats.size > 20 || cCats.size > 20) {
      warnings.push(`Dimensi tabel sangat besar (${rCats.size} x ${cCats.size}); periksa apakah variabel tersebut memang kategorikal dan bukan numerik kontinu.`);
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}
