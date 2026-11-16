// ============================================================
// Comparative Measurement Accuracy Assessment — Validation & Preset
// Dynamic J >= 2 Sources, 10-Point Quality Audit & Reference Audit
// ============================================================

import {
  AccuracyPreprocessingOptions,
  DataQualityCheckItem,
  MeasurementSource,
  PanelAccuracyQualityReport,
  PanelDataset,
  ReferenceSourceAudit
} from './panel-accuracy-types';

export const DEFAULT_ACCURACY_PREPROCESSING: AccuracyPreprocessingOptions = {
  dropDuplicateCityYear: false,
  applyLog1p: false,
  applyWinsorize: false,
  winsorQuantile: 0.025,
  applyUnitMultiplier: false,
  unitMultipliers: {},
  allowNegativeValues: false
};

export function sanitizeSpreadsheetText(val: unknown): string {
  const s = String(val ?? '').trim();
  if (/^[=+\-@]/.test(s) && !/^-[0-9]+([.,][0-9]+)?$/.test(s)) {
    return `'${s}`;
  }
  return s;
}

export function parseNumericCell(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const raw = String(val).trim();
  if (!raw || /^(na|n\/a|null|nan|-|\.|#n\/a)$/i.test(raw)) return null;
  const normalized =
    raw.includes(',') && !raw.includes('.')
      ? raw.replace(',', '.')
      : raw.replace(/,/g, '');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function quantileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function parsePastedAccuracyData(text: string): {
  columns: string[];
  rows: Record<string, unknown>[];
  error?: string;
} {
  const lines = (text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { columns: [], rows: [], error: 'Data tempel minimal memiliki 1 baris header dan 1 baris observasi.' };
  }

  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0]
    .split(sep)
    .map((h, idx) => sanitizeSpreadsheetText(h.replace(/^["']|["']$/g, '')) || `Col_${idx + 1}`);

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map(c => c.replace(/^["']|["']$/g, '').trim());
    if (cells.every(c => c === '')) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, cIdx) => {
      const rawCell = cells[cIdx] ?? '';
      const num = parseNumericCell(rawCell);
      row[h] = num !== null && rawCell !== '' ? num : sanitizeSpreadsheetText(rawCell);
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    return { columns: headers, rows: [], error: 'Tidak ada baris data valid setelah header.' };
  }
  return { columns: headers, rows };
}

function inferLabelFromCol(col: string, index: number): string {
  const clean = col.replace(/[_-]+/g, ' ').trim();
  if (/self|report|lapor/i.test(col)) return 'Self-Reporting';
  if (/sat.*alt|high.*res|oco|tropomi/i.test(col)) return 'Alternative Satellite';
  if (/sat|remote/i.test(col)) return 'Satellite Measurement';
  if (/sens|cems|ground|ref|stasiun/i.test(col)) return 'Field Sensor';
  if (/indep|audit|verif/i.test(col)) return 'Independent Monitoring';
  return clean || `Source ${index + 1}`;
}

export function autoDetectAccuracyDatasetConfig(
  columns: string[],
  rows: Record<string, unknown>[] = []
): {
  cityIdColumn: string;
  yearColumn: string;
  sources: MeasurementSource[];
} {
  const used: string[] = [];
  const findCol = (patterns: RegExp[]): string => {
    for (const pat of patterns) {
      const hit = columns.find(c => !used.includes(c) && pat.test(c));
      if (hit) return hit;
    }
    return '';
  };

  const cityIdColumn =
    findCol([/^(city|kota|kab|entity|id|region|wilayah|prov)/i, /city|kota|wilayah/i]) ||
    columns[0] ||
    '';
  if (cityIdColumn) used.push(cityIdColumn);

  const yearColumn =
    findCol([/^(year|tahun|yr|periode|time|waktu)$/i, /year|tahun|periode/i]) ||
    columns.find(c => !used.includes(c)) ||
    '';
  if (yearColumn) used.push(yearColumn);

  // Exclude obvious SE / uncertainty auxiliary columns from main source list
  const remaining = columns.filter(c => !used.includes(c));
  const seCols = remaining.filter(c => /^(se|uncert|sd|err)[_\s-]/i.test(c) || /[_\s-](se|uncert)$/i.test(c));
  const candidateCols = remaining.filter(c => !seCols.includes(c));

  // Keep numeric-bearing columns if rows are provided
  const numericCols = candidateCols.filter(col => {
    if (rows.length === 0) return true;
    return rows.some(r => parseNumericCell(r[col]) !== null);
  });

  const chosenCols = (numericCols.length >= 2 ? numericCols : candidateCols).slice(0, 8);

  // Choose default reference source: prefer sensor/ref column, else last source
  let refIndex = chosenCols.findIndex(c => /sens|ref|ground|cems|acuan/i.test(c));
  if (refIndex < 0) refIndex = Math.max(0, chosenCols.length - 1);

  const sources: MeasurementSource[] = chosenCols.map((col, idx) => {
    const isRef = idx === refIndex;
    const matchSe = seCols.find(
      sc =>
        sc.toLowerCase().includes(col.toLowerCase()) ||
        sc.toLowerCase().endsWith(String(idx + 1))
    );
    return {
      id: `src_${idx + 1}`,
      name: `X${idx + 1}`,
      label: inferLabelFromCol(col, idx),
      columnKey: col,
      unit: 'kt CO₂',
      role: isRef ? 'reference' : 'comparison',
      uncertaintyColumn: matchSe,
      methodDescription: isRef
        ? 'Instrumen pembanding acuan (dikaji cakupan, kalibrasi, dan konsistensi satuan)'
        : 'Sumber pengukuran yang dievaluasi terhadap sumber referensi'
    };
  });

  return {
    cityIdColumn,
    yearColumn,
    sources
  };
}

/**
 * Validate dynamic panel accuracy dataset (J >= 2 sources, exactly 1 reference source).
 */
export function validatePanelAccuracyDataset(
  dataset: PanelDataset,
  preprocessing: AccuracyPreprocessingOptions = DEFAULT_ACCURACY_PREPROCESSING
): PanelAccuracyQualityReport {
  const { cityIdColumn, yearColumn, sources, observations } = dataset;
  const checks: DataQualityCheckItem[] = [];
  const recommendedActions: string[] = [];

  const refSources = sources.filter(s => s.role === 'reference');
  const compSources = sources.filter(s => s.role === 'comparison');
  const refSource = refSources[0];

  const missingBySource: Record<string, number> = {};
  const availablePairsBySource: Record<string, number> = {};
  sources.forEach(s => {
    missingBySource[s.id] = 0;
    if (s.role === 'comparison') availablePairsBySource[s.id] = 0;
  });

  if (!observations || observations.length === 0) {
    return {
      nObsRaw: 0,
      nObsValidAny: 0,
      nCompleteCasePairs: 0,
      nCities: 0,
      nYears: 0,
      yearMin: null,
      yearMax: null,
      isBalanced: false,
      missingBySource,
      availablePairsBySource,
      duplicateKeys: [],
      scaleRatioMaxToMin: 1,
      outlierCountTotal: 0,
      referenceAudit: {
        referenceSourceId: refSource?.id || '',
        referenceSourceName: refSource?.name || '-',
        referenceSourceLabel: refSource?.label || '-',
        nValid: 0,
        coveragePct: 0,
        hasZeroVariance: true,
        outlierCount: 0,
        hasMethodNote: false,
        isCredibleReference: false,
        warnings: ['Dataset kosong.'],
        summary: 'Dataset belum memuat observasi.'
      },
      checks: [
        {
          id: 'empty_dataset',
          title: 'Dataset Kosong',
          severity: 'error',
          count: 0,
          message: 'Tidak ada baris observasi yang dimuat.'
        }
      ],
      recommendedActions: [],
      hasBlockingError: true
    };
  }

  // Check source count & reference uniqueness
  const mappedCols = [cityIdColumn, yearColumn, ...sources.map(s => s.columnKey)].filter(Boolean);
  const distinctCols = new Set(mappedCols);
  const hasDuplicateColMapping = distinctCols.size !== mappedCols.length;
  const invalidSourceCount = sources.length < 2 || refSources.length !== 1 || compSources.length < 1;

  if (invalidSourceCount || hasDuplicateColMapping || !cityIdColumn || !yearColumn) {
    checks.push({
      id: 'source_configuration',
      title: 'Konfigurasi Sumber & Referensi',
      severity: 'error',
      count: 1,
      message:
        sources.length < 2
          ? 'Minimal diperlukan 2 sumber pengukuran (1 Reference Source dan minimal 1 Comparison Source).'
          : refSources.length !== 1
          ? `Harus dipilih tepat 1 Reference Source (saat ini terpilih ${refSources.length}).`
          : 'Kolom City ID, Year, dan setiap sumber pengukuran harus terpetakan pada kolom yang berbeda.'
    });
  }

  let nonNumericYear = 0;
  let nonNumericCells = 0;
  let negativeCells = 0;
  let zeroCells = 0;
  let nObsValidAny = 0;
  let nCompleteCasePairs = 0;

  const keyCounts = new Map<string, number>();
  const citiesSet = new Set<string>();
  const yearsSet = new Set<number>();
  const cityYearsMap = new Map<string, Set<number>>();
  const sourceValues: Record<string, number[]> = {};
  sources.forEach(s => {
    sourceValues[s.id] = [];
  });

  const seenKeysForComplete = new Set<string>();

  observations.forEach(row => {
    const city = String(row[cityIdColumn] ?? '').trim();
    const yr = parseNumericCell(row[yearColumn]);
    if (city) citiesSet.add(city);
    if (yr === null) {
      nonNumericYear++;
    } else {
      yearsSet.add(yr);
      if (city) {
        const pKey = `${city}::${yr}`;
        keyCounts.set(pKey, (keyCounts.get(pKey) || 0) + 1);
        if (!cityYearsMap.has(city)) cityYearsMap.set(city, new Set<number>());
        cityYearsMap.get(city)!.add(yr);
      }
    }

    const rowNumericBySource: Record<string, number | null> = {};
    let rowHasAny = false;

    sources.forEach(src => {
      const raw = row[src.columnKey];
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        missingBySource[src.id]++;
        rowNumericBySource[src.id] = null;
        return;
      }
      const parsed = parseNumericCell(raw);
      if (parsed === null) {
        nonNumericCells++;
        missingBySource[src.id]++;
        rowNumericBySource[src.id] = null;
        return;
      }
      const mult =
        preprocessing.applyUnitMultiplier && Number.isFinite(preprocessing.unitMultipliers[src.id])
          ? preprocessing.unitMultipliers[src.id]
          : 1;
      const val = parsed * mult;
      rowNumericBySource[src.id] = val;
      rowHasAny = true;
      if (val < 0) negativeCells++;
      if (val === 0) zeroCells++;
      sourceValues[src.id].push(val);
    });

    if (rowHasAny) nObsValidAny++;

    if (city && yr !== null) {
      const pKey = `${city}::${yr}`;
      const skipDup = preprocessing.dropDuplicateCityYear && seenKeysForComplete.has(pKey);
      seenKeysForComplete.add(pKey);

      if (!skipDup && refSource) {
        const refVal = rowNumericBySource[refSource.id];
        if (refVal !== null) {
          compSources.forEach(cs => {
            if (rowNumericBySource[cs.id] !== null) {
              availablePairsBySource[cs.id] = (availablePairsBySource[cs.id] || 0) + 1;
            }
          });
          const allPresent = sources.every(s => rowNumericBySource[s.id] !== null);
          if (allPresent) nCompleteCasePairs++;
        }
      }
    }
  });

  const duplicateKeys: string[] = [];
  keyCounts.forEach((cnt, key) => {
    if (cnt > 1) duplicateKeys.push(`${key.replace('::', ' - ')} (${cnt}x)`);
  });

  // 1. Missing values & Complete-case vs Available-case transparency
  const totalMissing = Object.values(missingBySource).reduce((a, b) => a + b, 0);
  const availCounts = Object.values(availablePairsBySource);
  const hasSampleGap = availCounts.some(c => c !== nCompleteCasePairs);
  const missingDetail = sources.map(s => `${s.name}:${missingBySource[s.id]}`).join(', ');

  checks.push({
    id: 'missing_values',
    title: '1. Missing Values & Ketersediaan Pasangan (Complete vs Available)',
    severity: nCompleteCasePairs < 4 ? 'error' : totalMissing > 0 ? 'warning' : 'ok',
    count: totalMissing,
    message:
      totalMissing > 0
        ? `Total sel kosong: ${totalMissing} (${missingDetail}). Pasangan Complete-Case = ${nCompleteCasePairs}; Available-Case per sumber ditampilkan terpisah.`
        : `Tidak ada missing values pada seluruh ${sources.length} sumber (${nCompleteCasePairs} pasangan City-Year lengkap).`,
    recommendation: hasSampleGap
      ? 'Perhatikan perbedaan jumlah observasi Complete-Case vs Available-Case pada tabel metrik Step 5.'
      : undefined
  });

  // 2. Duplicate City-Year
  checks.push({
    id: 'duplicate_city_year',
    title: '2. Duplikat Kunci Panel (City-Year)',
    severity:
      duplicateKeys.length > 0 && !preprocessing.dropDuplicateCityYear
        ? 'error'
        : duplicateKeys.length > 0
        ? 'warning'
        : 'ok',
    count: duplicateKeys.length,
    message:
      duplicateKeys.length > 0
        ? `Ditemukan ${duplicateKeys.length} pasangan (City, Year) ganda: ${duplicateKeys.slice(0, 4).join(', ')}${duplicateKeys.length > 4 ? '...' : ''}.`
        : 'Seluruh pasangan (City, Year) unik.',
    recommendation:
      duplicateKeys.length > 0
        ? 'Aktifkan opsi hapus duplikat (City, Year) pada Step 3 atau bersihkan dataset asal.'
        : undefined
  });
  if (duplicateKeys.length > 0) {
    recommendedActions.push('Hapus baris duplikat (City, Year) agar setiap pasangan pengamatan unik.');
  }

  // 3. Non-numeric cells
  checks.push({
    id: 'non_numeric',
    title: '3. Nilai Non-Numerik',
    severity: nonNumericYear + nonNumericCells > 0 ? 'warning' : 'ok',
    count: nonNumericYear + nonNumericCells,
    message:
      nonNumericYear + nonNumericCells > 0
        ? `Terdeteksi ${nonNumericYear} nilai Year non-numerik dan ${nonNumericCells} sel sumber berformat teks.`
        : 'Seluruh nilai Year dan sumber pengukuran berformat numerik valid.'
  });

  // 4. Negative or zero values
  checks.push({
    id: 'negative_or_zero',
    title: '4. Nilai Negatif & Nol pada Emisi CO₂',
    severity: negativeCells > 0 && !preprocessing.allowNegativeValues ? 'warning' : 'ok',
    count: negativeCells,
    message:
      negativeCells > 0
        ? `Terdeteksi ${negativeCells} nilai negatif dan ${zeroCells} nilai tepat 0. Untuk emisi CO₂ fisik, periksa kemungkinan kesalahan tanda atau selisih net.`
        : `Tidak ada nilai negatif (${zeroCells} sel bernilai 0).`
  });

  // 5. Unit consistency
  const distinctUnits = new Set(sources.map(s => (s.unit || '').trim().toLowerCase()).filter(Boolean));
  checks.push({
    id: 'unit_consistency',
    title: '5. Konsistensi Satuan Pengukuran Antarsumber',
    severity: distinctUnits.size > 1 && !preprocessing.applyUnitMultiplier ? 'warning' : 'ok',
    count: distinctUnits.size > 1 ? distinctUnits.size : 0,
    message:
      distinctUnits.size > 1
        ? `Label satuan berbeda antarsumber (${sources.map(s => `${s.name}:${s.unit || '-'}`).join(', ')}). Perbandingan error absolut wajib menggunakan satuan fisik yang setara.`
        : `Satuan pengukuran seragam (${sources[0]?.unit || 'kt CO₂'}).`,
    recommendation:
      distinctUnits.size > 1
        ? 'Samakan satuan melalui faktor konversi satuan di Step 3 sebelum menghitung MAE/RMSE.'
        : undefined
  });

  // 6. Scale differences across sources
  const positiveMeans = sources
    .map(s => {
      const arr = sourceValues[s.id];
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    })
    .filter(m => m > 0);
  const scaleRatioMaxToMin =
    positiveMeans.length >= 2
      ? Math.max(...positiveMeans) / Math.max(1e-9, Math.min(...positiveMeans))
      : 1;

  checks.push({
    id: 'scale_mismatch',
    title: '6. Rasio Skala Besaran Antarsumber',
    severity: scaleRatioMaxToMin > 10 ? 'warning' : 'ok',
    count: scaleRatioMaxToMin > 10 ? 1 : 0,
    message:
      scaleRatioMaxToMin > 10
        ? `Rasio rata-rata tertinggi terhadap terendah mencapai ${scaleRatioMaxToMin.toFixed(2)}×. Waspadai perbedaan unit (misal ton vs kiloton).`
        : `Rasio skala rata-rata antarsumber seimbang (${scaleRatioMaxToMin.toFixed(2)}×).`,
    recommendation:
      scaleRatioMaxToMin > 10
        ? 'Periksa apakah salah satu sumber dicatat dalam kelipatan ribuan (ton vs kt) dan sesuaikan pengali satuan.'
        : undefined
  });
  if (scaleRatioMaxToMin > 10) {
    recommendedActions.push(`Periksa kesetaraan satuan karena rasio skala antarsumber mencapai ${scaleRatioMaxToMin.toFixed(1)}×.`);
  }

  // 7 & 8. Panel coverage and balance
  const nCities = citiesSet.size;
  const nYears = yearsSet.size;
  const sortedYears = Array.from(yearsSet).sort((a, b) => a - b);
  const expectedCells = nCities * nYears;
  const observedCells = Array.from(cityYearsMap.values()).reduce((s, set) => s + set.size, 0);
  const isBalanced = nCities > 0 && nYears > 0 && observedCells === expectedCells && totalMissing === 0;
  const coverageRatio = expectedCells > 0 ? observedCells / expectedCells : 0;

  checks.push({
    id: 'panel_coverage',
    title: '7. Cakupan Wilayah Kota & Periode Tahun',
    severity: nCities < 2 || nYears < 2 ? 'error' : coverageRatio < 0.7 ? 'warning' : 'ok',
    count: Math.max(0, expectedCells - observedCells),
    message: `Terdeteksi ${nCities} kota × ${nYears} periode tahun (${observedCells}/${expectedCells} pasangan City-Year tercatat, cakupan ${(coverageRatio * 100).toFixed(1)}%).`
  });

  checks.push({
    id: 'panel_balance',
    title: '8. Keseimbangan Struktur Panel',
    severity: isBalanced ? 'ok' : 'warning',
    count: Math.max(0, expectedCells - nCompleteCasePairs),
    message: isBalanced
      ? 'Panel seimbang penuh (balanced panel) tanpa sel hilang.'
      : `Panel tidak seimbang / parsial: ${nCompleteCasePairs} dari ${expectedCells} sel City-Year memiliki data lengkap di seluruh sumber.`
  });

  // 9. Outlier detection (1.5 * IQR)
  let outlierCountTotal = 0;
  const outlierBySource: Record<string, number> = {};
  sources.forEach(s => {
    const sorted = [...sourceValues[s.id]].sort((a, b) => a - b);
    if (sorted.length < 4) {
      outlierBySource[s.id] = 0;
      return;
    }
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    const cnt = sorted.filter(v => v < lo || v > hi).length;
    outlierBySource[s.id] = cnt;
    outlierCountTotal += cnt;
  });

  checks.push({
    id: 'outlier_detection',
    title: '9. Deteksi Nilai Ekstrem / Outlier (1.5×IQR)',
    severity: outlierCountTotal > 0 ? 'warning' : 'ok',
    count: outlierCountTotal,
    message:
      outlierCountTotal > 0
        ? `Terdeteksi ${outlierCountTotal} observasi ekstrem (${sources.map(s => `${s.name}:${outlierBySource[s.id] || 0}`).join(', ')}). RMSE lebih sensitif terhadap outlier dibanding MAE.`
        : 'Tidak ditemukan outlier ekstrem berdasarkan aturan 1.5×IQR.',
    recommendation:
      outlierCountTotal > 0
        ? 'Periksa audit sensitivitas outlier di Step 7 atau gunakan Winsorization opsional di Step 3 jika murni kesalahan input.'
        : undefined
  });

  // 10. Reference Source Quality & Credibility Audit
  const refVals = refSource ? sourceValues[refSource.id] || [] : [];
  const refMean = refVals.length ? refVals.reduce((a, b) => a + b, 0) / refVals.length : 0;
  const refVar =
    refVals.length > 1
      ? refVals.reduce((s, v) => s + (v - refMean) ** 2, 0) / (refVals.length - 1)
      : 0;
  const refCoveragePct = observations.length > 0 ? (refVals.length / observations.length) * 100 : 0;
  const refZeroVar = refVals.length < 2 || refVar <= 1e-12;
  const refOutliers = refSource ? outlierBySource[refSource.id] || 0 : 0;
  const refWarnings: string[] = [];

  if (refCoveragePct < 80) {
    refWarnings.push(`Cakupan observasi sumber referensi rendah (${refCoveragePct.toFixed(1)}% < 80%).`);
  }
  if (refZeroVar) {
    refWarnings.push('Sumber referensi memiliki varians nol (konstan), sehingga korelasi & CCC tidak terdefinisi.');
  }
  if (refOutliers > Math.max(2, Math.floor(refVals.length * 0.1))) {
    refWarnings.push(`Sumber referensi memiliki ${refOutliers} nilai ekstrem yang dapat mendistorsi selisih error.`);
  }

  const isCredibleReference = Boolean(refSource) && !refZeroVar && refVals.length >= 4 && refCoveragePct >= 50;
  const referenceAudit: ReferenceSourceAudit = {
    referenceSourceId: refSource?.id || '',
    referenceSourceName: refSource?.name || '-',
    referenceSourceLabel: refSource?.label || '-',
    nValid: refVals.length,
    coveragePct: refCoveragePct,
    hasZeroVariance: refZeroVar,
    outlierCount: refOutliers,
    hasMethodNote: Boolean(refSource?.methodDescription && refSource.methodDescription.trim().length > 0),
    isCredibleReference,
    warnings: refWarnings,
    summary: isCredibleReference
      ? `Sumber referensi "${refSource.label} (${refSource.name})" memiliki ${refVals.length} observasi valid (${refCoveragePct.toFixed(1)}%) dengan variasi memadai. Ingat: sumber referensi adalah pembanding acuan, bukan kebenaran absolut tanpa galat.`
      : `Sumber referensi "${refSource?.label || '-'}" belum memenuhi kelayakan minimum (${refWarnings.join(' ') || 'data kurang'}).`
  };

  checks.push({
    id: 'reference_quality',
    title: `10. Audit Kelayakan Sumber Referensi (${refSource?.name || '-'})`,
    severity: !isCredibleReference ? 'error' : refWarnings.length > 0 ? 'warning' : 'ok',
    count: refWarnings.length,
    message: referenceAudit.summary,
    recommendation:
      !isCredibleReference
        ? 'Pilih sumber referensi lain yang memiliki cakupan data valid dan varians non-nol di Step 2.'
        : undefined
  });

  const emptyComparisonSources = compSources.filter(cs => (availablePairsBySource[cs.id] || 0) < 3);
  if (emptyComparisonSources.length > 0) {
    checks.push({
      id: 'insufficient_pairs',
      title: 'Kecukupan Pasangan Observasi Sumber Pembanding',
      severity: 'error',
      count: emptyComparisonSources.length,
      message: `Sumber pembanding berikut memiliki < 3 pasangan observasi valid dengan referensi: ${emptyComparisonSources.map(s => s.label).join(', ')}.`
    });
  }

  const hasBlockingError =
    invalidSourceCount ||
    hasDuplicateColMapping ||
    !cityIdColumn ||
    !yearColumn ||
    nCities < 2 ||
    nYears < 1 ||
    nCompleteCasePairs < 3 ||
    !isCredibleReference ||
    emptyComparisonSources.length > 0 ||
    (duplicateKeys.length > 0 && !preprocessing.dropDuplicateCityYear);

  return {
    nObsRaw: observations.length,
    nObsValidAny,
    nCompleteCasePairs,
    nCities,
    nYears,
    yearMin: sortedYears.length ? sortedYears[0] : null,
    yearMax: sortedYears.length ? sortedYears[sortedYears.length - 1] : null,
    isBalanced,
    missingBySource,
    availablePairsBySource,
    duplicateKeys,
    scaleRatioMaxToMin,
    outlierCountTotal,
    referenceAudit,
    checks,
    recommendedActions,
    hasBlockingError
  };
}

/**
 * Built-in realistic multi-city CO2 measurement accuracy preset dataset
 * (10 cities × 6 years = 60 observations, 4 measurement sources by default).
 * Reference: X3 (Field Sensor). Comparison: X1 (Self-Reporting), X2 (Satellite Standard), X4 (Alternative High-Res Satellite).
 */
export function generateMultiSourceCO2PresetDataset(): {
  cityIdColumn: string;
  yearColumn: string;
  sources: MeasurementSource[];
  observations: Record<string, unknown>[];
} {
  const cities = [
    { name: 'Jakarta', base: 1480 },
    { name: 'Surabaya', base: 1140 },
    { name: 'Bandung', base: 880 },
    { name: 'Semarang', base: 830 },
    { name: 'Medan', base: 960 },
    { name: 'Makassar', base: 710 },
    { name: 'Balikpapan', base: 1060 },
    { name: 'Palembang', base: 790 },
    { name: 'Denpasar', base: 540 },
    { name: 'Batam', base: 910 }
  ];
  const years = [2019, 2020, 2021, 2022, 2023, 2024];
  const yearTrend = [0, -55, -15, 30, 75, 110];

  let seed = 90210;
  const randn = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const u1 = Math.max(1e-7, seed / 4294967296);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const u2 = Math.max(1e-7, seed / 4294967296);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const observations: Record<string, unknown>[] = [];
  cities.forEach((c, cIdx) => {
    let shock = randn() * 14;
    years.forEach((yr, tIdx) => {
      shock = 0.4 * shock + randn() * 18;
      const refTrue = Number((c.base + yearTrend[tIdx] + cIdx * 7 + tIdx * 9 + shock).toFixed(2));
      // X1 Self-Reporting: systematic underreporting bias (-48 kt) + larger noise (SD=42)
      const x1 = Number((refTrue - 48 + randn() * 42).toFixed(2));
      // X2 Satellite Standard: mild positive bias (+24 kt) + moderate noise (SD=28)
      const x2 = Number((refTrue + 24 + randn() * 28).toFixed(2));
      // X3 Field Sensor (Reference): calibrated ground network
      const x3 = refTrue;
      // X4 High-Res Satellite: very small bias (+6 kt) + low noise (SD=15) -> most accurate comparison source
      const x4 = Number((refTrue + 6 + randn() * 15).toFixed(2));

      observations.push({
        City: c.name,
        Year: yr,
        X1_Self_Reporting: x1,
        X2_Satellite_Standard: x2,
        X3_Field_Sensor_Ref: x3,
        X4_Alt_Satellite_HiRes: x4
      });
    });
  });

  const sources: MeasurementSource[] = [
    {
      id: 'src_1',
      name: 'X1',
      label: 'Self-Reporting',
      columnKey: 'X1_Self_Reporting',
      unit: 'kt CO₂',
      role: 'comparison',
      methodDescription: 'Pelaporan mandiri inventarisasi emisi tahunan kota (bottom-up).'
    },
    {
      id: 'src_2',
      name: 'X2',
      label: 'Satellite Standard',
      columnKey: 'X2_Satellite_Standard',
      unit: 'kt CO₂',
      role: 'comparison',
      methodDescription: 'Estimasi penginderaan jauh satelit resolusi menengah.'
    },
    {
      id: 'src_3',
      name: 'X3',
      label: 'Field Sensor',
      columnKey: 'X3_Field_Sensor_Ref',
      unit: 'kt CO₂',
      role: 'reference',
      methodDescription: 'Jaringan sensor pemantauan darat terkalibrasi (Reference Source).'
    },
    {
      id: 'src_4',
      name: 'X4',
      label: 'Alternative Satellite',
      columnKey: 'X4_Alt_Satellite_HiRes',
      unit: 'kt CO₂',
      role: 'comparison',
      methodDescription: 'Inversi satelit resolusi tinggi terkalibrasi plume perkotaan.'
    }
  ];

  return {
    cityIdColumn: 'City',
    yearColumn: 'Year',
    sources,
    observations
  };
}
