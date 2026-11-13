// ============================================================
// Panel Latent Variable Measurement Model — Data & EDA Engine
// Supports parsing, auto-mapping, 10-point data quality validation,
// opt-in preprocessing, EDA metrics, and realistic CO2 simulation.
// ============================================================

import {
  CleanedLatentObservation,
  DataQualityCheckItem,
  MeasurementSourceKey,
  PanelLatentDataQualityReport,
  PanelLatentEDAResult,
  PanelLatentMapping,
  PanelLatentPreprocessingOptions,
  SourceDescriptiveStats
} from './panel-latent-types';

export const DEFAULT_PREPROCESSING_OPTIONS: PanelLatentPreprocessingOptions = {
  applyLog1p: false,
  applyStandardize: false,
  applyWinsorize: false,
  winsorQuantile: 0.025,
  dropDuplicateCityYear: false,
  allowNegativeValues: false
};

export function parseNumericValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'na' || trimmed.toLowerCase() === 'nan' || trimmed.toLowerCase() === 'null') {
    return null;
  }
  const normalized = trimmed.replace(/,/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Neutralize spreadsheet formula prefixes to prevent CSV/Excel injection.
 */
export function sanitizeSpreadsheetText(val: unknown): string {
  const s = String(val ?? '').trim();
  if (/^[=+\-@]/.test(s)) return `'${s}`;
  return s;
}

/**
 * Parse pasted tabular text (CSV, TSV from Excel/Google Sheets, or semicolon-delimited).
 */
export function parsePastedTabularData(rawText: string): {
  columns: string[];
  rows: Record<string, any>[];
  error?: string;
} {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trimEnd())
    .filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      columns: [],
      rows: [],
      error: 'Minimal diperlukan 1 baris header dan 1 baris data.'
    };
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t')
    ? '\t'
    : headerLine.includes(';') && !headerLine.includes(',')
    ? ';'
    : ',';

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const columns = splitLine(headerLine).map((c, idx) => c || `Kolom_${idx + 1}`);
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.every(c => c === '')) continue;
    const row: Record<string, any> = {};
    columns.forEach((col, cIdx) => {
      const rawCell = cells[cIdx] ?? '';
      const num = parseNumericValue(rawCell);
      row[col] = num !== null && /^-?[\d,.]+$/.test(rawCell) ? num : sanitizeSpreadsheetText(rawCell);
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    return { columns: [], rows: [], error: 'Tidak ada baris observasi valid ditemukan.' };
  }

  return { columns, rows };
}

/**
 * Automatic heuristic column mapping for City, Year, X1 (Self-Reporting),
 * X2 (Satellite), and X3 (Sensor).
 */
export function autoDetectPanelLatentMapping(columns: string[]): PanelLatentMapping {
  const findCol = (patterns: RegExp[], exclude: string[] = []): string => {
    for (const p of patterns) {
      const match = columns.find(c => !exclude.includes(c) && p.test(c.toLowerCase()));
      if (match) return match;
    }
    return '';
  };

  const cityCol = findCol([/^(city|kota|wilayah|region|kabupaten|provinsi|entity|id)$/i, /city|kota|daerah|region/i]) || columns[0] || '';
  const used: string[] = [cityCol].filter(Boolean);

  const yearCol = findCol([/^(year|tahun|periode|time|t)$/i, /year|tahun|periode/i], used) || columns.find(c => !used.includes(c)) || '';
  if (yearCol) used.push(yearCol);

  const x1Col =
    findCol([/^x1$/i, /self[_\s-]*report|pelaporan|inventaris|laporan|edgar|disclos/i], used) ||
    columns.find(c => !used.includes(c)) ||
    '';
  if (x1Col) used.push(x1Col);

  const x2Col =
    findCol([/^x2$/i, /satel|satellite|satelit|oco|tropomi|remote/i], used) ||
    columns.find(c => !used.includes(c)) ||
    '';
  if (x2Col) used.push(x2Col);

  const x3Col =
    findCol([/^x3$/i, /sensor|ground|stasiun|monitor|iot|lapangan/i], used) ||
    columns.find(c => !used.includes(c)) ||
    '';
  if (x3Col) used.push(x3Col);

  const se1Col = findCol([/^se1$/i, /se[_\s-]*x1|uncert.*1|se.*self/i], used) || undefined;
  const se2Col = findCol([/^se2$/i, /se[_\s-]*x2|uncert.*2|se.*sat/i], used) || undefined;
  const se3Col = findCol([/^se3$/i, /se[_\s-]*x3|uncert.*3|se.*sens/i], used) || undefined;

  return {
    cityCol,
    yearCol,
    x1Col,
    x2Col,
    x3Col,
    se1Col,
    se2Col,
    se3Col,
    x1Label: 'Self-Reporting (X1)',
    x2Label: 'Satellite-Based (X2)',
    x3Label: 'Sensor-Based (X3)',
    x1Unit: 'kt CO₂',
    x2Unit: 'kt CO₂',
    x3Unit: 'kt CO₂'
  };
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Compute comprehensive 10-point data quality validation before estimation.
 */
export function validatePanelLatentData(
  rows: Record<string, any>[],
  mapping: PanelLatentMapping,
  preprocessing: PanelLatentPreprocessingOptions = DEFAULT_PREPROCESSING_OPTIONS
): PanelLatentDataQualityReport {
  const checks: DataQualityCheckItem[] = [];
  const recommendedActions: string[] = [];

  if (!rows || rows.length === 0) {
    return {
      nObsRaw: 0,
      nObsValid: 0,
      nCities: 0,
      nYears: 0,
      yearMin: null,
      yearMax: null,
      isBalanced: false,
      missingSourceCells: { X1: 0, X2: 0, X3: 0 },
      duplicateKeys: [],
      checks: [
        {
          id: 'empty',
          title: 'Dataset Kosong',
          severity: 'error',
          count: 0,
          message: 'Tidak ada baris data yang dimuat.'
        }
      ],
      recommendedActions: [],
      hasBlockingError: true
    };
  }

  // Distinct role mapping check
  const roles = [mapping.cityCol, mapping.yearCol, mapping.x1Col, mapping.x2Col, mapping.x3Col].filter(Boolean);
  const distinctRoles = new Set(roles);
  const mappingIncomplete = roles.length < 5 || distinctRoles.size < 5;
  if (mappingIncomplete) {
    checks.push({
      id: 'mapping_role',
      title: 'Kelengkapan & Keunikan Pemetaan Variabel',
      severity: 'error',
      count: 5 - distinctRoles.size,
      message: 'Kolom City, Year, X1, X2, dan X3 wajib terisi lengkap dan tidak boleh menggunakan kolom yang sama.'
    });
  }

  let nonNumericYear = 0;
  let nonNumericSources = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let allThreeMissing = 0;
  const missingSourceCells: Record<MeasurementSourceKey, number> = { X1: 0, X2: 0, X3: 0 };

  const keyCounts = new Map<string, number>();
  const citiesSet = new Set<string>();
  const yearsSet = new Set<number>();
  const cityYearsMap = new Map<string, Set<number>>();
  const sourceValues: Record<MeasurementSourceKey, number[]> = { X1: [], X2: [], X3: [] };

  rows.forEach(row => {
    const city = String(row[mapping.cityCol] ?? '').trim();
    const yr = parseNumericValue(row[mapping.yearCol]);
    if (city) citiesSet.add(city);
    if (yr === null) {
      nonNumericYear++;
    } else {
      yearsSet.add(yr);
      if (city) {
        const key = `${city}::${yr}`;
        keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
        if (!cityYearsMap.has(city)) cityYearsMap.set(city, new Set<number>());
        cityYearsMap.get(city)!.add(yr);
      }
    }

    const rawCells: Array<{ k: MeasurementSourceKey; col: string }> = [
      { k: 'X1', col: mapping.x1Col },
      { k: 'X2', col: mapping.x2Col },
      { k: 'X3', col: mapping.x3Col }
    ];

    let presentHere = 0;
    rawCells.forEach(({ k, col }) => {
      const raw = row[col];
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        missingSourceCells[k]++;
        return;
      }
      const val = parseNumericValue(raw);
      if (val === null) {
        nonNumericSources++;
        missingSourceCells[k]++;
        return;
      }
      presentHere++;
      if (val < 0) negativeCount++;
      if (val === 0) zeroCount++;
      sourceValues[k].push(val);
    });
    if (presentHere === 0) allThreeMissing++;
  });

  const duplicateKeys: string[] = [];
  keyCounts.forEach((cnt, key) => {
    if (cnt > 1) duplicateKeys.push(`${key.replace('::', ' - ')} (${cnt}x)`);
  });

  // 1. Missing values
  const totalMissing = missingSourceCells.X1 + missingSourceCells.X2 + missingSourceCells.X3;
  checks.push({
    id: 'missing_values',
    title: '1. Missing Values Sumber Pengukuran',
    severity: allThreeMissing > 0 ? 'error' : totalMissing > 0 ? 'warning' : 'ok',
    count: totalMissing,
    message:
      allThreeMissing > 0
        ? `${allThreeMissing} baris kehilangan seluruh 3 sumber (X1, X2, X3). Total sel kosong: ${totalMissing}.`
        : totalMissing > 0
        ? `Ditemukan ${totalMissing} sel kosong (X1:${missingSourceCells.X1}, X2:${missingSourceCells.X2}, X3:${missingSourceCells.X3}). Model Bayesian akan mengintegrasikan sumber yang tersedia secara parsial.`
        : 'Tidak ada missing values pada X1, X2, dan X3.'
  });

  // 2. Duplicate City-Year
  checks.push({
    id: 'duplicate_city_year',
    title: '2. Duplikat Kunci Panel (City-Year)',
    severity: duplicateKeys.length > 0 && !preprocessing.dropDuplicateCityYear ? 'error' : duplicateKeys.length > 0 ? 'warning' : 'ok',
    count: duplicateKeys.length,
    message:
      duplicateKeys.length > 0
        ? `Ditemukan ${duplicateKeys.length} kombinasi Kota-Tahun ganda: ${duplicateKeys.slice(0, 4).join(', ')}${duplicateKeys.length > 4 ? '...' : ''}.`
        : 'Seluruh pasangan (City, Year) unik.',
    recommendation: duplicateKeys.length > 0 ? 'Centang opsi hapus duplikat City-Year di Step 3 atau bersihkan di file asal.' : undefined
  });

  // 3. Non-numeric data
  checks.push({
    id: 'non_numeric',
    title: '3. Data Non-Numerik',
    severity: nonNumericYear + nonNumericSources > 0 ? 'warning' : 'ok',
    count: nonNumericYear + nonNumericSources,
    message:
      nonNumericYear + nonNumericSources > 0
        ? `Tahun non-numerik: ${nonNumericYear}; Sel X1/X2/X3 berformat teks: ${nonNumericSources}.`
        : 'Seluruh nilai Year dan sumber X1/X2/X3 terdeteksi numerik valid.'
  });

  // 4. Negative or invalid emission values
  checks.push({
    id: 'negative_invalid',
    title: '4. Nilai Negatif atau Nol (Validitas Emisi CO₂)',
    severity: negativeCount > 0 && !preprocessing.allowNegativeValues ? 'warning' : 'ok',
    count: negativeCount,
    message:
      negativeCount > 0
        ? `Terdeteksi ${negativeCount} nilai negatif (< 0) dan ${zeroCount} nilai tepat 0. Untuk emisi CO₂ fisik, nilai negatif umumnya menandakan kesalahan input atau variabel dalam bentuk net/log.`
        : `Tidak ada nilai negatif (${zeroCount} nilai bernilai tepat 0).`
  });

  // 5 & 6. Unit differences & Scale differences across sources
  const means = (['X1', 'X2', 'X3'] as MeasurementSourceKey[]).map(k => {
    const arr = sourceValues[k];
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  });
  const positiveMeans = means.filter(m => m > 0);
  const scaleRatio =
    positiveMeans.length >= 2 ? Math.max(...positiveMeans) / Math.max(1e-9, Math.min(...positiveMeans)) : 1;

  const unitsSet = new Set(
    [mapping.x1Unit, mapping.x2Unit, mapping.x3Unit].map(u => (u || '').trim().toLowerCase()).filter(Boolean)
  );
  checks.push({
    id: 'unit_mismatch',
    title: '5. Perbedaan Satuan Pengukuran',
    severity: unitsSet.size > 1 ? 'warning' : 'ok',
    count: unitsSet.size > 1 ? unitsSet.size : 0,
    message:
      unitsSet.size > 1
        ? `Label satuan antar sumber berbeda (${mapping.x1Unit || '-'}, ${mapping.x2Unit || '-'}, ${mapping.x3Unit || '-'}). Pastikan satuan seragam atau aktifkan standardisasi/loading bebas.`
        : 'Label satuan konsisten antar sumber.'
  });

  checks.push({
    id: 'scale_difference',
    title: '6. Perbedaan Skala Data Antarsumber',
    severity: scaleRatio > 10 ? 'warning' : 'ok',
    count: scaleRatio > 10 ? 1 : 0,
    message:
      scaleRatio > 10
        ? `Rasio rata-rata antarsumber mencapai ${scaleRatio.toFixed(1)}× (X1=${means[0].toFixed(1)}, X2=${means[1].toFixed(1)}, X3=${means[2].toFixed(1)}). Kemungkinan terdapat perbedaan satuan (mis. ton vs kiloton).`
        : `Rasio skala antarsumber seimbang (${scaleRatio.toFixed(2)}×).`,
    recommendation: scaleRatio > 10 ? 'Pertimbangkan Standardization (Z-score) atau konversi satuan sebelum estimasi.' : undefined
  });
  if (scaleRatio > 10) {
    recommendedActions.push('Standardization (Z-score) karena rasio skala antarsumber > 10×.');
  }

  // 7 & 8. Coverage / Unbalanced panel
  const nCities = citiesSet.size;
  const nYears = yearsSet.size;
  const yearList = Array.from(yearsSet).sort((a, b) => a - b);
  const expectedBalancedObs = nCities * nYears;
  const observedPairs = Array.from(cityYearsMap.values()).reduce((acc, s) => acc + s.size, 0);
  const isBalanced = nCities > 0 && nYears > 0 && observedPairs === expectedBalancedObs;
  const coverageRatio = expectedBalancedObs > 0 ? observedPairs / expectedBalancedObs : 0;

  checks.push({
    id: 'coverage_scope',
    title: '7. Cakupan Wilayah & Periode Kota',
    severity: nCities < 2 || nYears < 2 ? 'error' : coverageRatio < 0.7 ? 'warning' : 'ok',
    count: expectedBalancedObs - observedPairs,
    message: `Terdeteksi ${nCities} kota × ${nYears} tahun (${observedPairs}/${expectedBalancedObs} sel terisi, cakupan ${(coverageRatio * 100).toFixed(1)}%).`
  });

  checks.push({
    id: 'unbalanced_panel',
    title: '8. Keseimbangan Panel (Balanced vs Unbalanced)',
    severity: isBalanced ? 'ok' : 'warning',
    count: isBalanced ? 0 : expectedBalancedObs - observedPairs,
    message: isBalanced
      ? 'Panel seimbang (balanced panel).'
      : `Panel tidak seimbang (unbalanced): ${expectedBalancedObs - observedPairs} kombinasi kota-tahun tidak tercatat.`
  });

  // 9. Outliers via IQR (1.5 * IQR rule) + skewness advisory for log
  let outlierCount = 0;
  let highSkew = false;
  (['X1', 'X2', 'X3'] as MeasurementSourceKey[]).forEach(k => {
    const arr = [...sourceValues[k]].sort((a, b) => a - b);
    if (arr.length < 4) return;
    const q1 = quantile(arr, 0.25);
    const q3 = quantile(arr, 0.75);
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    outlierCount += arr.filter(v => v < lo || v > hi).length;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length) || 1;
    const skew = arr.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0) / arr.length;
    if (Math.abs(skew) > 1.5) highSkew = true;
  });

  checks.push({
    id: 'outliers',
    title: '9. Deteksi Outlier (Aturan 1.5×IQR)',
    severity: outlierCount > 0 ? 'warning' : 'ok',
    count: outlierCount,
    message:
      outlierCount > 0
        ? `Terdeteksi ${outlierCount} nilai ekstrem/outlier di seluruh sumber. Disarankan menggunakan Student-t Likelihood atau Winsorization opsional.`
        : 'Tidak ditemukan outlier signifikan menurut aturan 1.5×IQR.',
    recommendation: outlierCount > 0 ? 'Aktifkan Student-t Likelihood di Step 5 atau Winsorization opsional di Step 3.' : undefined
  });
  if (outlierCount > 0) {
    recommendedActions.push('Winsorization (atau gunakan Student-t Likelihood pada Step 5) karena terdeteksi outlier.');
  }
  if (highSkew && negativeCount === 0) {
    recommendedActions.push('Log Transformation log(1+x) karena distribusi miring kanan (|skewness| > 1.5).');
  }

  // 10. Missing measurement source availability
  const missingSourceCols = (['X1', 'X2', 'X3'] as MeasurementSourceKey[]).filter(k => sourceValues[k].length === 0);
  checks.push({
    id: 'missing_source',
    title: '10. Ketersediaan Masing-Masing Sumber Pengukuran',
    severity: missingSourceCols.length > 0 ? 'error' : 'ok',
    count: missingSourceCols.length,
    message:
      missingSourceCols.length > 0
        ? `Sumber berikut tidak memiliki nilai numerik valid sama sekali: ${missingSourceCols.join(', ')}.`
        : 'Ketiga sumber pengukuran (X1 Self-Reporting, X2 Satellite, X3 Sensor) memiliki observasi numerik valid.'
  });

  const hasBlockingError =
    mappingIncomplete ||
    nCities < 2 ||
    nYears < 2 ||
    missingSourceCols.length > 0 ||
    (duplicateKeys.length > 0 && !preprocessing.dropDuplicateCityYear) ||
    allThreeMissing === rows.length;

  return {
    nObsRaw: rows.length,
    nObsValid: rows.length - allThreeMissing,
    nCities,
    nYears,
    yearMin: yearList.length ? yearList[0] : null,
    yearMax: yearList.length ? yearList[yearList.length - 1] : null,
    isBalanced,
    missingSourceCells,
    duplicateKeys,
    checks,
    recommendedActions,
    hasBlockingError
  };
}

/**
 * Apply explicit opt-in preprocessing and index cities/years chronologically.
 */
export function preparePanelLatentObservations(
  rows: Record<string, any>[],
  mapping: PanelLatentMapping,
  options: PanelLatentPreprocessingOptions
): {
  observations: CleanedLatentObservation[];
  cities: string[];
  years: number[];
  meansBeforeStd: Record<MeasurementSourceKey, number>;
  sdsBeforeStd: Record<MeasurementSourceKey, number>;
} {
  const seenKeys = new Set<string>();
  const prelim: Array<{
    rowIndex: number;
    city: string;
    year: number;
    x1: number | null;
    x2: number | null;
    x3: number | null;
    se1: number;
    se2: number;
    se3: number;
  }> = [];

  rows.forEach((r, idx) => {
    const city = String(r[mapping.cityCol] ?? '').trim();
    const yr = parseNumericValue(r[mapping.yearCol]);
    if (!city || yr === null) return;
    const key = `${city}::${yr}`;
    if (seenKeys.has(key)) {
      if (options.dropDuplicateCityYear) return;
    }
    seenKeys.add(key);

    const x1 = parseNumericValue(r[mapping.x1Col]);
    const x2 = parseNumericValue(r[mapping.x2Col]);
    const x3 = parseNumericValue(r[mapping.x3Col]);
    if (x1 === null && x2 === null && x3 === null) return;

    const se1 = mapping.se1Col ? Math.max(0, parseNumericValue(r[mapping.se1Col]) ?? 0) : 0;
    const se2 = mapping.se2Col ? Math.max(0, parseNumericValue(r[mapping.se2Col]) ?? 0) : 0;
    const se3 = mapping.se3Col ? Math.max(0, parseNumericValue(r[mapping.se3Col]) ?? 0) : 0;

    prelim.push({ rowIndex: idx, city, year: yr, x1, x2, x3, se1, se2, se3 });
  });

  // Sort chronologically within each city
  prelim.sort((a, b) => (a.city === b.city ? a.year - b.year : a.city.localeCompare(b.city)));

  const cities = Array.from(new Set(prelim.map(p => p.city))).sort();
  const years = Array.from(new Set(prelim.map(p => p.year))).sort((a, b) => a - b);
  const cityIndexMap = new Map(cities.map((c, i) => [c, i]));
  const yearIndexMap = new Map(years.map((y, i) => [y, i]));

  // Clone working arrays per source
  const work: Record<MeasurementSourceKey, Array<number | null>> = {
    X1: prelim.map(p => p.x1),
    X2: prelim.map(p => p.x2),
    X3: prelim.map(p => p.x3)
  };
  const rawSave: Record<MeasurementSourceKey, Array<number | null>> = {
    X1: [...work.X1],
    X2: [...work.X2],
    X3: [...work.X3]
  };

  const keys: MeasurementSourceKey[] = ['X1', 'X2', 'X3'];

  // Step A: Opt-in log1p transformation
  if (options.applyLog1p) {
    keys.forEach(k => {
      work[k] = work[k].map(v => (v !== null && v >= 0 ? Math.log1p(v) : v));
    });
  }

  // Step B: Opt-in Winsorization
  if (options.applyWinsorize) {
    const q = Math.min(0.15, Math.max(0.005, options.winsorQuantile || 0.025));
    keys.forEach(k => {
      const valid = work[k].filter((v): v is number => v !== null).sort((a, b) => a - b);
      if (valid.length < 5) return;
      const lo = quantile(valid, q);
      const hi = quantile(valid, 1 - q);
      work[k] = work[k].map(v => (v === null ? null : Math.min(hi, Math.max(lo, v))));
    });
  }

  // Record means & SDs before Z-score standardization
  const meansBeforeStd: Record<MeasurementSourceKey, number> = { X1: 0, X2: 0, X3: 0 };
  const sdsBeforeStd: Record<MeasurementSourceKey, number> = { X1: 1, X2: 1, X3: 1 };

  keys.forEach(k => {
    const valid = work[k].filter((v): v is number => v !== null);
    if (valid.length > 1) {
      const m = valid.reduce((a, b) => a + b, 0) / valid.length;
      const v = valid.reduce((s, x) => s + (x - m) ** 2, 0) / (valid.length - 1);
      meansBeforeStd[k] = m;
      sdsBeforeStd[k] = Math.sqrt(Math.max(1e-12, v));
    }
  });

  // Step C: Opt-in Standardization
  if (options.applyStandardize) {
    keys.forEach(k => {
      const m = meansBeforeStd[k];
      const sd = sdsBeforeStd[k] || 1;
      work[k] = work[k].map(v => (v === null ? null : (v - m) / sd));
    });
  }

  const observations: CleanedLatentObservation[] = prelim.map((p, idx) => ({
    rowIndex: p.rowIndex,
    city: p.city,
    cityIdx: cityIndexMap.get(p.city)!,
    year: p.year,
    yearIdx: yearIndexMap.get(p.year)!,
    x1: work.X1[idx],
    x2: work.X2[idx],
    x3: work.X3[idx],
    se1: options.applyStandardize ? p.se1 / (sdsBeforeStd.X1 || 1) : p.se1,
    se2: options.applyStandardize ? p.se2 / (sdsBeforeStd.X2 || 1) : p.se2,
    se3: options.applyStandardize ? p.se3 / (sdsBeforeStd.X3 || 1) : p.se3,
    rawX1: rawSave.X1[idx],
    rawX2: rawSave.X2[idx],
    rawX3: rawSave.X3[idx]
  }));

  return { observations, cities, years, meansBeforeStd, sdsBeforeStd };
}

export function computePearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 1e-12 ? num / den : 0;
}

function rankArray(vals: number[]): number[] {
  const indexed = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(vals.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

/**
 * Compute Exploratory Data Analysis (descriptives, Pearson/Spearman matrices, trends).
 */
export function computePanelLatentEDA(
  observations: CleanedLatentObservation[],
  mapping: PanelLatentMapping
): PanelLatentEDAResult {
  const keys: MeasurementSourceKey[] = ['X1', 'X2', 'X3'];
  const labels: Record<MeasurementSourceKey, string> = {
    X1: mapping.x1Label || mapping.x1Col || 'Self-Reporting (X1)',
    X2: mapping.x2Label || mapping.x2Col || 'Satellite (X2)',
    X3: mapping.x3Label || mapping.x3Col || 'Sensor (X3)'
  };

  const getVal = (o: CleanedLatentObservation, k: MeasurementSourceKey) =>
    k === 'X1' ? o.x1 : k === 'X2' ? o.x2 : o.x3;

  const descriptives: SourceDescriptiveStats[] = keys.map(k => {
    const vals = observations.map(o => getVal(o, k)).filter((v): v is number => v !== null);
    const sorted = [...vals].sort((a, b) => a - b);
    const n = vals.length;
    const mean = n ? vals.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
    const sd = Math.sqrt(variance);
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const skew =
      n > 2 && sd > 1e-12
        ? vals.reduce((s, v) => s + ((v - mean) / sd) ** 3, 0) / n
        : 0;
    return {
      sourceKey: k,
      label: labels[k],
      n,
      mean,
      sd,
      median,
      q1,
      q3,
      iqr: q3 - q1,
      min: sorted[0] ?? 0,
      max: sorted[n - 1] ?? 0,
      cv: Math.abs(mean) > 1e-12 ? sd / Math.abs(mean) : 0,
      skewness: skew
    };
  });

  const pearsonMatrix = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
  const spearmanMatrix = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];

  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const pairs = observations
        .map(o => ({ va: getVal(o, keys[a]), vb: getVal(o, keys[b]) }))
        .filter((p): p is { va: number; vb: number } => p.va !== null && p.vb !== null);
      const xa = pairs.map(p => p.va);
      const xb = pairs.map(p => p.vb);
      const rp = computePearsonCorrelation(xa, xb);
      const rs = pairs.length >= 3 ? computePearsonCorrelation(rankArray(xa), rankArray(xb)) : 0;
      pearsonMatrix[a][b] = pearsonMatrix[b][a] = rp;
      spearmanMatrix[a][b] = spearmanMatrix[b][a] = rs;
    }
  }

  const byCity = new Map<string, Array<{ year: number; x1: number | null; x2: number | null; x3: number | null }>>();
  const byYear = new Map<number, { s1: number[]; s2: number[]; s3: number[] }>();

  observations.forEach(o => {
    if (!byCity.has(o.city)) byCity.set(o.city, []);
    byCity.get(o.city)!.push({ year: o.year, x1: o.x1, x2: o.x2, x3: o.x3 });

    if (!byYear.has(o.year)) byYear.set(o.year, { s1: [], s2: [], s3: [] });
    const yEntry = byYear.get(o.year)!;
    if (o.x1 !== null) yEntry.s1.push(o.x1);
    if (o.x2 !== null) yEntry.s2.push(o.x2);
    if (o.x3 !== null) yEntry.s3.push(o.x3);
  });

  const cityTrends = Array.from(byCity.entries()).map(([city, points]) => ({
    city,
    points: points.sort((a, b) => a.year - b.year)
  }));

  const meanOrNull = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const yearlyAverages = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, s]) => ({
      year,
      x1: meanOrNull(s.s1),
      x2: meanOrNull(s.s2),
      x3: meanOrNull(s.s3)
    }));

  return {
    descriptives,
    pearsonMatrix,
    spearmanMatrix,
    cityTrends,
    yearlyAverages
  };
}

/**
 * Built-in realistic multi-city CO2 measurement integration preset dataset
 * (8 cities × 6 years = 48 panel observations) generated from known latent structure.
 */
export function generateCO2PresetDataset(): Record<string, any>[] {
  const cities = [
    { name: 'Jakarta', base: 1450 },
    { name: 'Surabaya', base: 1120 },
    { name: 'Bandung', base: 860 },
    { name: 'Semarang', base: 820 },
    { name: 'Medan', base: 940 },
    { name: 'Makassar', base: 690 },
    { name: 'Balikpapan', base: 1050 },
    { name: 'Palembang', base: 780 }
  ];
  const years = [2019, 2020, 2021, 2022, 2023, 2024];
  const timeShocks = [0, -65, -20, 35, 80, 115];

  // Deterministic pseudo-random helper
  let seed = 4219;
  const randn = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const u1 = Math.max(1e-7, seed / 4294967296);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const u2 = Math.max(1e-7, seed / 4294967296);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const rows: Record<string, any>[] = [];
  cities.forEach((city, cIdx) => {
    let arState = randn() * 18;
    years.forEach((year, tIdx) => {
      arState = 0.45 * arState + randn() * 20;
      const yStar = city.base + timeShocks[tIdx] + (cIdx % 2 === 0 ? tIdx * 12 : tIdx * 6) + arState;
      // X1: Self-Reporting (underreporting bias -55, loading 0.94, noisier SD=48)
      const x1 = Number((-55 + 0.94 * yStar + randn() * 48).toFixed(2));
      // X2: Satellite (positive bias +42, loading 1.06, moderate SD=34)
      const x2 = Number((42 + 1.06 * yStar + randn() * 34).toFixed(2));
      // X3: Sensor (anchor: bias 0, loading 1.0, lowest SD=22)
      const x3 = Number((0 + 1.0 * yStar + randn() * 22).toFixed(2));

      rows.push({
        City: city.name,
        Year: year,
        Self_Reporting_CO2: x1,
        Satellite_CO2: x2,
        Sensor_CO2: x3
      });
    });
  });

  return rows;
}

