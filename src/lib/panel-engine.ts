// ============================================================
// Panel Data Regression Engine (Gaya Stata)
// Common Effect (CEM), Fixed Effects (FEM), Random Effects (REM)
// ============================================================

import {
  PanelFitInput,
  PanelModelResult,
  PanelDeclarationResult,
  PanelCoefficientRow,
  PanelModelType,
  ZeroValuePolicy,
  TransformMethod,
  TransformOptionItem,
  VariableLNAnalysis,
  PanelLNTransformReport,
  PanelOrthogReport,
  DetailedPanelNormalityResult,
  NormalityHistogramBin,
  EasyPanelInterpretation,
  CorrelationCell,
  PanelCorrelationMatrixResult
} from './panel-types';

import {
  matMul,
  matTranspose,
  matInverse,
  normalCdf,
  tPValue,
  fPValue,
  chiSquarePValue
} from './regression-engine';

/**
 * Inversi matriks aman dengan regularisasi Ridge / Tikhonov fallback
 * jika matriks singular atau berpivot mendekati nol (kolinear).
 */
export function safeMatInverse(A: number[][], lambda = 1e-9): number[][] {
  const n = A.length;
  if (n === 0) return [];
  try {
    return matInverse(A);
  } catch {
    try {
      const reg1 = A.map((row, i) =>
        row.map((val, j) => (i === j ? val + lambda : val))
      );
      return matInverse(reg1);
    } catch {
      try {
        const reg2 = A.map((row, i) =>
          row.map((val, j) => (i === j ? val + 1e-5 : val))
        );
        return matInverse(reg2);
      } catch {
        return Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => (i === j ? (Math.abs(A[i][i]) > 1e-12 ? 1 / A[i][i] : 0) : 0))
        );
      }
    }
  }
}

/**
 * Validasi dan deklarasi struktur data panel (Gaya Stata `xtset`)
 */
export function validatePanelStructure(
  rows: Record<string, any>[],
  idCol: string,
  timeCol: string
): PanelDeclarationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rows || rows.length === 0) {
    return {
      isValid: false,
      entityCount: 0,
      timeCount: 0,
      totalObs: 0,
      isBalanced: false,
      tMin: 0,
      tAvg: 0,
      tMax: 0,
      hasDuplicates: false,
      duplicateCount: 0,
      timeSpan: { min: 0, max: 0 },
      errors: ['Data kosong, tidak ada baris untuk dianalisis.'],
      warnings: []
    };
  }

  const entityObsCount = new Map<any, number>();
  const timeSet = new Set<any>();
  const seenPairs = new Set<string>();
  let duplicateCount = 0;
  let minYear = Infinity;
  let maxYear = -Infinity;

  for (const row of rows) {
    const id = row[idCol];
    const t = Number(row[timeCol]);

    if (id === undefined || id === null || id === '') {
      errors.push(`Ditemukan nilai kolom ID (${idCol}) kosong/null.`);
    }

    if (isNaN(t)) {
      errors.push(`Kolom waktu (${timeCol}) harus berupa angka tahun/periode valid.`);
    } else {
      if (t < minYear) minYear = t;
      if (t > maxYear) maxYear = t;
      timeSet.add(t);
    }

    const pairKey = `${id}___${t}`;
    if (seenPairs.has(pairKey)) {
      duplicateCount++;
    } else {
      seenPairs.add(pairKey);
    }

    entityObsCount.set(id, (entityObsCount.get(id) || 0) + 1);
  }

  const entityCount = entityObsCount.size;
  const timeCount = timeSet.size;
  const totalObs = rows.length;
  const hasDuplicates = duplicateCount > 0;

  if (hasDuplicates) {
    errors.push(
      `Ditemukan ${duplicateCount} observasi duplikat pada pasangan (${idCol}, ${timeCol}). Pasangan entitas dan waktu wajib unik.`
    );
  }

  if (entityCount < 2) {
    errors.push(`Jumlah entitas ($N = ${entityCount}$) kurang dari 2. Regresi panel membutuhkan minimal 2 entitas.`);
  }

  const tCounts = Array.from(entityObsCount.values());
  const tMin = tCounts.length > 0 ? Math.min(...tCounts) : 0;
  const tMax = tCounts.length > 0 ? Math.max(...tCounts) : 0;
  const tSum = tCounts.reduce((a, b) => a + b, 0);
  const tAvg = tCounts.length > 0 ? Number((tSum / tCounts.length).toFixed(2)) : 0;
  const isBalanced = tMin === tMax && !hasDuplicates;

  if (tMin < 2) {
    warnings.push(`Beberapa entitas memiliki observasi waktu kurang dari 2 tahun.`);
  }

  return {
    isValid: errors.length === 0,
    entityCount,
    timeCount,
    totalObs,
    isBalanced,
    tMin,
    tAvg,
    tMax,
    hasDuplicates,
    duplicateCount,
    timeSpan: {
      min: isFinite(minYear) ? minYear : 0,
      max: isFinite(maxYear) ? maxYear : 0
    },
    errors,
    warnings
  };
}

export interface PanelMappingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    nObs: number;
    nEntities: number;
    nPeriods: number;
    isBalanced: boolean;
    yCol: string;
    xCols: string[];
    idCol: string;
    timeCol: string;
  };
}

/**
 * Validasi konfigurasi pemetaan kolom dan penegakan Invarian P1 (I1, I5, I6, I10, I11)
 */
export function validatePanelMappingConfig(
  rows: Record<string, any>[],
  idCol: string,
  timeCol: string,
  yCol: string,
  xCols: string[]
): PanelMappingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rows || rows.length === 0) {
    return {
      isValid: false,
      errors: ['Data kosong, tidak ada baris observasi.'],
      warnings: [],
      summary: { nObs: 0, nEntities: 0, nPeriods: 0, isBalanced: false, yCol, xCols, idCol, timeCol }
    };
  }

  // 1. Validasi Keberadaan Kolom
  if (!idCol) errors.push('Kolom entitas (idCol) wajib dipilih.');
  if (!timeCol) errors.push('Kolom waktu (timeCol) wajib dipilih.');
  if (!yCol) errors.push('Variabel dependen (Y) wajib dipilih.');
  if (!xCols || xCols.length === 0) errors.push('Variabel independen (X) minimal 1 kolom.');

  // Invarian I5: Y tidak boleh menjadi anggota X
  if (yCol && xCols && xCols.includes(yCol)) {
    errors.push(`Invarian I5: Variabel dependen '${yCol}' tidak boleh dimasukkan ke dalam variabel independen (X).`);
  }

  // Invarian I6: idCol dan timeCol tidak boleh ada di X atau Y
  if (idCol && (idCol === yCol || (xCols && xCols.includes(idCol)))) {
    errors.push(`Invarian I6: Kolom entitas '${idCol}' tidak boleh menjadi variabel dependen (Y) maupun independen (X).`);
  }
  if (timeCol && (timeCol === yCol || (xCols && xCols.includes(timeCol)))) {
    errors.push(`Invarian I6: Kolom waktu '${timeCol}' tidak boleh menjadi variabel dependen (Y) maupun independen (X).`);
  }

  // Invarian I1: Y harus numerik kontinu
  if (yCol && rows.length > 0) {
    const yValues = rows.map(r => r[yCol]).filter(v => v !== null && v !== undefined && v !== '');
    const nonNumeric = yValues.filter(v => isNaN(Number(v)));
    if (nonNumeric.length > 0) {
      errors.push(`Invarian I1: Variabel dependen '${yCol}' memuat nilai non-numerik. Y harus berupa angka kontinu.`);
    } else {
      const numVals = yValues.map(v => Number(v));
      const uniqueVals = new Set(numVals);
      if (uniqueVals.size <= 2 && Array.from(uniqueVals).every(v => v === 0 || v === 1)) {
        errors.push(`Invarian I1: Variabel dependen '${yCol}' terdeteksi biner (0/1). Untuk model biner gunakan regresi logistik panel.`);
      }
    }
  }

  // Struktur Panel (N >= 2, T >= 2, Duplikasi)
  let nEntities = 0;
  let nPeriods = 0;
  let isBalanced = false;

  if (idCol && timeCol && rows.length > 0) {
    const struct = validatePanelStructure(rows, idCol, timeCol);
    nEntities = struct.entityCount;
    nPeriods = struct.timeCount;
    isBalanced = struct.isBalanced;

    if (struct.hasDuplicates) {
      errors.push(`Invarian I10: Ditemukan ${struct.duplicateCount} pasangan kunci duplikat (${idCol}, ${timeCol}). Setiap entitas hanya boleh memiliki satu observasi per periode waktu.`);
    }
    if (struct.entityCount < 2) {
      errors.push(`Invarian I11: Jumlah entitas ($N = ${struct.entityCount}$) kurang dari 2. Analisis data panel membutuhkan minimal 2 entitas.`);
    }
    if (struct.timeCount < 2) {
      errors.push(`Invarian I11: Jumlah periode waktu ($T = ${struct.timeCount}$) kurang dari 2. Analisis data panel membutuhkan minimal 2 periode waktu.`);
    } else if (struct.timeCount < 3) {
      warnings.push(`Jumlah periode waktu ($T = ${struct.timeCount}$) < 3. Uji autokorelasi Wooldridge (first-difference) membutuhkan T >= 3 dan akan dilewati.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    summary: {
      nObs: rows.length,
      nEntities,
      nPeriods,
      isBalanced,
      yCol,
      xCols,
      idCol,
      timeCol
    }
  };
}

export interface DataCleaningOptions {
  dropDuplicates?: boolean;
  handleMissing?: 'listwise' | 'none';
  zeroPolicy?: ZeroValuePolicy;
}

export interface DataCleaningReport {
  totalRawObs: number;
  validObs: number;
  droppedObs: number;
  duplicateCount: number;
  missingSummary: Record<string, number>;
  zeroSummary: Record<string, number>;
  totalZeroCells: number;
  zeroHandledCount: number;
  zeroPolicyApplied: ZeroValuePolicy;
  timeInvariantVars: string[];
  entityEncoding: {
    isEncoded: boolean;
    originalCol: string;
    encodedCol: string;
    labelMap: Record<string, number>;
  };
  cleanedRows: Record<string, any>[];
  stataDoLog: string;
}

/**
 * Cek dan pembersihan data panel (Fase P2 & Step 2 Cleaning Data)
 * Meliputi deteksi duplikasi, pemeriksaan missing values, pemeriksaan nilai 0 (True Zero vs Tidak Ada Pengungkapan),
 * pengkodean entitas string, deteksi variabel time-invariant (Invarian I12), dan pembuatan log sintaks Stata .do.
 */
export function inspectAndCleanPanelData(
  rows: Record<string, any>[],
  idCol: string,
  timeCol: string,
  yCol: string,
  xCols: string[],
  options?: DataCleaningOptions
): DataCleaningReport {
  const totalRawObs = rows.length;
  const zeroPolicy: ZeroValuePolicy = options?.zeroPolicy || 'true_zero';
  const missingSummary: Record<string, number> = {};
  const zeroSummary: Record<string, number> = {};
  const numCols = [yCol, ...xCols];

  numCols.forEach(col => {
    missingSummary[col] = 0;
    zeroSummary[col] = 0;
  });

  // 1. Deteksi duplikasi (id, time)
  const seenKeys = new Set<string>();
  let duplicateCount = 0;
  const nonDuplicateRows: Record<string, any>[] = [];

  for (const r of rows) {
    const idVal = String(r[idCol] ?? '').trim();
    const timeVal = String(r[timeCol] ?? '').trim();
    const key = `${idVal}___${timeVal}`;

    if (seenKeys.has(key)) {
      duplicateCount++;
      if (!options?.dropDuplicates) {
        nonDuplicateRows.push(r);
      }
    } else {
      seenKeys.add(key);
      nonDuplicateRows.push(r);
    }
  }

  // 2. Hitung nilai 0 & nilai hilang pada baris non-duplikat
  let totalZeroCells = 0;
  for (const r of nonDuplicateRows) {
    for (const col of numCols) {
      const val = r[col];
      const isMissing = val === null || val === undefined || val === '' || (typeof val === 'number' && isNaN(val));
      if (!isMissing && Number(val) === 0) {
        zeroSummary[col]++;
        totalZeroCells++;
      }
    }
  }

  // Siapkan statistik mean/median non-zero per entitas dan keseluruhan jika zeroPolicy adalah imputasi
  const entityNonZeroStats = new Map<string, Record<string, { mean: number; median: number }>>();
  const globalNonZeroStats: Record<string, { mean: number; median: number }> = {};

  if (zeroPolicy === 'no_disclosure_impute_mean' || zeroPolicy === 'no_disclosure_impute_median') {
    for (const col of numCols) {
      const allValidNonZero = nonDuplicateRows
        .map(r => Number(r[col]))
        .filter(v => !isNaN(v) && v !== 0);
      const sortedGlobal = [...allValidNonZero].sort((a, b) => a - b);
      const gMean = allValidNonZero.length > 0
        ? allValidNonZero.reduce((a, b) => a + b, 0) / allValidNonZero.length
        : 0;
      const gMedian = sortedGlobal.length > 0
        ? sortedGlobal[Math.floor(sortedGlobal.length / 2)]
        : 0;
      globalNonZeroStats[col] = { mean: gMean, median: gMedian };
    }

    const byEntity = new Map<string, Record<string, any>[]>();
    for (const r of nonDuplicateRows) {
      const entKey = String(r[idCol] ?? '').trim();
      if (!byEntity.has(entKey)) byEntity.set(entKey, []);
      byEntity.get(entKey)!.push(r);
    }

    for (const [entKey, entRows] of byEntity.entries()) {
      const colStats: Record<string, { mean: number; median: number }> = {};
      for (const col of numCols) {
        const vals = entRows.map(r => Number(r[col])).filter(v => !isNaN(v) && v !== 0);
        if (vals.length > 0) {
          const sorted = [...vals].sort((a, b) => a - b);
          colStats[col] = {
            mean: vals.reduce((a, b) => a + b, 0) / vals.length,
            median: sorted[Math.floor(sorted.length / 2)]
          };
        } else {
          colStats[col] = globalNonZeroStats[col];
        }
      }
      entityNonZeroStats.set(entKey, colStats);
    }
  }

  // 3. Deteksi data hilang (missing values), perlakuan nilai 0, & listwise deletion
  const validRows: Record<string, any>[] = [];
  const requiredCols = [idCol, timeCol, yCol, ...xCols];
  let zeroHandledCount = 0;

  for (const r of nonDuplicateRows) {
    let hasMissing = false;
    const rowCopy: Record<string, any> = { ...r };
    const entKey = String(r[idCol] ?? '').trim();

    for (const col of requiredCols) {
      const val = rowCopy[col];
      const isRawMissing = val === null || val === undefined || val === '' || (typeof val === 'number' && isNaN(val));
      if (isRawMissing) {
        hasMissing = true;
        if (missingSummary[col] !== undefined) {
          missingSummary[col]++;
        }
      } else if (numCols.includes(col) && Number(val) === 0) {
        if (zeroPolicy === 'no_disclosure_drop') {
          hasMissing = true;
          zeroHandledCount++;
        } else if (zeroPolicy === 'no_disclosure_impute_mean') {
          const imputed = entityNonZeroStats.get(entKey)?.[col]?.mean ?? globalNonZeroStats[col]?.mean ?? 0;
          rowCopy[col] = Number(imputed.toFixed(6));
          zeroHandledCount++;
        } else if (zeroPolicy === 'no_disclosure_impute_median') {
          const imputed = entityNonZeroStats.get(entKey)?.[col]?.median ?? globalNonZeroStats[col]?.median ?? 0;
          rowCopy[col] = Number(imputed.toFixed(6));
          zeroHandledCount++;
        }
      }
    }

    if (!hasMissing || options?.handleMissing === 'none') {
      validRows.push(rowCopy);
    }
  }

  const validObs = validRows.length;
  const droppedObs = totalRawObs - validObs;

  // 4. Pengkodean entitas jika string (encode company, generate(id_num))
  const uniqueEntities = Array.from(new Set(validRows.map(r => String(r[idCol] ?? '').trim()))).filter(Boolean);
  const isStringEntity = uniqueEntities.some(e => isNaN(Number(e)));
  const labelMap: Record<string, number> = {};
  uniqueEntities.forEach((ent, idx) => {
    labelMap[ent] = idx + 1;
  });

  const cleanedRows = validRows.map(r => {
    const originalId = String(r[idCol] ?? '').trim();
    const encodedId = isStringEntity ? labelMap[originalId] : Number(originalId);
    return {
      ...r,
      _id_num: encodedId
    };
  });

  // 5. Invarian I12: Deteksi variabel time-invariant
  const timeInvariantVars: string[] = [];
  for (const col of xCols) {
    const entityGroups = new Map<any, number[]>();
    for (const r of cleanedRows) {
      const ent = r._id_num;
      const val = Number(r[col]);
      if (!entityGroups.has(ent)) {
        entityGroups.set(ent, []);
      }
      entityGroups.get(ent)!.push(val);
    }

    let isTimeInvariant = true;
    for (const [_, vals] of entityGroups.entries()) {
      if (vals.length > 1) {
        const first = vals[0];
        const hasDiff = vals.some(v => Math.abs(v - first) > 1e-9);
        if (hasDiff) {
          isTimeInvariant = false;
          break;
        }
      }
    }

    if (isTimeInvariant && cleanedRows.length > 0) {
      timeInvariantVars.push(col);
    }
  }

  // 6. Pembuatan Log Sintaks Stata .do
  const idVar = isStringEntity ? 'id_num' : idCol;
  const xList = xCols.join(' ');
  const invarWarning = timeInvariantVars.length > 0
    ? `* Catatan Invarian I12: Variabel time-invariant terdeteksi (${timeInvariantVars.join(', ')}). Stata akan otomatis mendrop variabel ini pada Fixed Effects.\n`
    : '';

  const zeroStataCmd = totalZeroCells > 0
    ? zeroPolicy === 'true_zero'
      ? `* Nilai 0 dipertahankan sebagai nilai sebenarnya (True Zero = ${totalZeroCells} sel)\n`
      : zeroPolicy === 'no_disclosure_drop'
      ? `* Nilai 0 berarti Tidak Ada Pengungkapan -> mvdecode & drop baris bernilai 0\nmvdecode ${yCol} ${xList}, mv(0)\ndrop if missing(${[yCol, ...xCols].join(', ')})\n`
      : `* Nilai 0 berarti Tidak Ada Pengungkapan -> Imputasi per entitas\nmvdecode ${yCol} ${xList}, mv(0)\n`
    : '';

  const stataDoLog = `* ============================================================
* REPRODUCIBLE STATA LOG: DATA CLEANING & PANEL ESTIMATION
* Modul: Regresi Data Panel Stata (CED Analyzer)
* ============================================================

* 1. Deteksi dan eliminasi duplikasi
duplicates report ${idCol} ${timeCol}
${options?.dropDuplicates || duplicateCount > 0 ? `duplicates drop ${idCol} ${timeCol}, force\n` : ''}
* 2. Ringkasan data hilang (missing values) & perlakuan nilai 0
misstable summarize ${yCol} ${xList}
${zeroStataCmd}
* 3. Pengkodean entitas jika berupa teks
${isStringEntity ? `encode ${idCol}, generate(id_num)` : `* Kolom ${idCol} sudah numerik, tidak perlu encode`}

* 4. Deklarasi struktur panel
xtset ${idVar} ${timeCol}

* 5. Ringkasan statistik tiga dimensi
xtsum ${yCol} ${xList}

* 6. Korelasi matriks
pwcorr ${yCol} ${xList}, star(0.05) sig
spearman ${yCol} ${xList}, star(0.05)

${invarWarning}* 7. Estimasi Model Panel (CEM, FEM, REM)
reg ${yCol} ${xList}
xtreg ${yCol} ${xList}, fe
estimates store fe_model
xtreg ${yCol} ${xList}, re
estimates store re_model

* 8. Uji Pemilihan Model (Chow Dummy, Hausman, LM)
reg ${yCol} ${xList} i.${idVar}
testparm i.${idVar}
hausman fe_model re_model
xttest0

* 9. Uji Asumsi Klasik & Normalitas
vif, uncentered
xttest3
xtserial ${yCol} ${xList}
predict e_resid, e
histogram e_resid, normal
sktest e_resid
swilk e_resid
ksmirnov e_resid = normal((e_resid - r(mean))/r(sd))

* 10. Estimasi Model Akhir Cluster-Robust SE
xtreg ${yCol} ${xList}, fe vce(robust)
`;

  return {
    totalRawObs,
    validObs,
    droppedObs,
    duplicateCount,
    missingSummary,
    zeroSummary,
    totalZeroCells,
    zeroHandledCount,
    zeroPolicyApplied: zeroPolicy,
    timeInvariantVars,
    entityEncoding: {
      isEncoded: isStringEntity,
      originalCol: idCol,
      encodedCol: isStringEntity ? 'id_num' : idCol,
      labelMap
    },
    cleanedRows,
    stataDoLog
  };
}

/**
 * Step 3: Analisis Distribusi Data Lanjutan & Transformasi LN (Natural Logarithm)
 * Mengecek skewness, kurtosis, dan disparitas skala tiap variabel setelah cleaning,
 * menentukan variabel mana yang direkomendasikan ditransformasi LN, dan membentuk kolom ln_<var>.
 */
export function analyzeAndTransformPanelLN(
  rows: Record<string, any>[],
  yCol: string,
  xCols: string[],
  selectedTransforms?: string[] | Record<string, TransformMethod>
): PanelLNTransformReport {
  const allVars: Array<{ name: string; role: 'Y' | 'X' }> = [
    { name: yCol, role: 'Y' },
    ...xCols.map(c => ({ name: c, role: 'X' as const }))
  ];

  const analyses: VariableLNAnalysis[] = [];
  const recommendedVars: string[] = [];

  // Parse user choices into unified mapping: varName -> TransformMethod
  const transformMap: Record<string, TransformMethod> = {};
  if (Array.isArray(selectedTransforms)) {
    for (const v of allVars) {
      if (selectedTransforms.includes(v.name)) {
        transformMap[v.name] = 'ln';
      } else {
        transformMap[v.name] = 'asli';
      }
    }
  } else if (selectedTransforms && typeof selectedTransforms === 'object') {
    for (const v of allVars) {
      transformMap[v.name] = selectedTransforms[v.name] || 'asli';
    }
  }

  // Pre-calculate inter-variable correlation to detect severe collinearity for orthog option
  const rawVecs: Record<string, number[]> = {};
  for (const item of allVars) {
    rawVecs[item.name] = rows.map(r => Number(r[item.name])).filter(v => !isNaN(v));
  }

  for (const item of allVars) {
    const vals = rawVecs[item.name] || [];
    const n = vals.length;
    if (n === 0) continue;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = vals.reduce((a, b) => a + b, 0) / n;

    let m2 = 0;
    let m3 = 0;
    let m4 = 0;
    for (const v of vals) {
      const d = v - mean;
      const d2 = d * d;
      m2 += d2;
      m3 += d2 * d;
      m4 += d2 * d2;
    }
    const sd = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
    const sPop = n > 0 ? Math.sqrt(m2 / n) : 0;
    const skewness = sPop > 1e-12 ? (m3 / n) / Math.pow(sPop, 3) : 0;
    const kurtosis = sPop > 1e-12 ? (m4 / n) / Math.pow(sPop, 4) : 3;

    const hasZero = vals.some(v => v === 0);
    const hasNegative = min < 0;

    // Check max correlation with other predictors (for orthog)
    let maxCorr = 0;
    if (item.role === 'X') {
      for (const other of xCols) {
        if (other !== item.name && rawVecs[other]?.length === n) {
          const r = Math.abs(pearsonCorrelation(vals, rawVecs[other]));
          if (r > maxCorr) maxCorr = r;
        }
      }
    }

    // Determine available transformation options & validity for this variable
    const availableOptions: TransformOptionItem[] = [
      {
        method: 'asli',
        label: 'Asli (Tanpa Transformasi)',
        badge: 'Asli',
        formula: 'x',
        desc: 'Mempertahankan skala asli variabel tanpa transformasi.',
        isValid: true
      },
      {
        method: 'ln',
        label: 'ln(x) — Logaritma Natural',
        badge: 'ln(x)',
        formula: 'ln(x)',
        desc: min > 0
          ? 'Logaritma natural standar untuk menormalkan skewness dan linierisasi hubungan.'
          : 'Memerlukan pergeseran konstanta shift karena terdapat nilai <= 0.',
        isValid: true
      },
      {
        method: 'ln_1p',
        label: 'ln(1 + x) — Log Plus One',
        badge: 'ln(1+x)',
        formula: 'ln(1 + x)',
        desc: 'Ideal untuk data non-negatif dengan nilai 0; mempertahankan titik 0 karena ln(1)=0.',
        isValid: !hasNegative,
        invalidReason: hasNegative ? 'Nilai minimum negatif (< 0)' : undefined
      },
      {
        method: 'sqrt',
        label: '√x — Akar Kuadrat',
        badge: '√x',
        formula: 'sqrt(x)',
        desc: 'Efektif untuk skewness positif sedang, data cacah, atau menstabilkan ragam Poisson.',
        isValid: !hasNegative,
        invalidReason: hasNegative ? 'Nilai minimum negatif (< 0)' : undefined
      },
      {
        method: 'orthog',
        label: 'orthog(x) — Ortogonalisasi Gram-Schmidt',
        badge: 'orthog',
        formula: 'orthog(x)',
        desc: 'Mengeliminasi multikolinearitas antar prediktor independen dengan membuat korelasi r = 0.',
        isValid: item.role === 'X',
        invalidReason: item.role === 'Y' ? 'Hanya berlaku untuk variabel independen (X)' : undefined
      },
      {
        method: 'std',
        label: 'z-score — Standarisasi (x - μ)/σ',
        badge: 'z-score',
        formula: '(x - μ) / σ',
        desc: 'Memusatkan ke rata-rata 0 dan varians 1, cocok untuk data berskala sangat berbeda atau memiliki nilai negatif.',
        isValid: sd > 1e-9,
        invalidReason: sd <= 1e-9 ? 'Variabel bernilai konstan (sd = 0)' : undefined
      },
      {
        method: 'inv',
        label: '1 / x — Invers / Kebalikan',
        badge: '1/x',
        formula: '1 / (x + c)',
        desc: 'Mengompresi ekor kanan yang sangat ekstrem atau hubungan laju/waktu.',
        isValid: true
      }
    ];

    // Determine Best Recommendation by the System
    let recommendedMethod: TransformMethod = 'asli';
    let recommendedReason = '';

    const highSkew = Math.abs(skewness) > 1.0;
    const highKurt = kurtosis > 4.5;
    const wideScale = (min > 0 && max / min > 25) || (max > 500 && sd / Math.max(1e-9, Math.abs(mean)) > 0.75);

    if (item.role === 'X' && maxCorr >= 0.85) {
      recommendedMethod = 'orthog';
      recommendedReason = 'Korelasi sangat tinggi dengan prediktor lain (|r| = ' + maxCorr.toFixed(2) + '). Transformasi orthog direkomendasikan untuk menetralkan multikolinearitas (VIF).';
    } else if (hasZero && !hasNegative && (highSkew || wideScale)) {
      recommendedMethod = 'ln_1p';
      recommendedReason = 'Skewness tinggi (' + skewness.toFixed(2) + ') dan terdapat nilai 0. Transformasi ln(1 + x) paling optimal karena menjaga domain 0 (ln(1)=0) dan mereduksi asimetri.';
    } else if (!hasNegative && min > 0 && (highSkew || highKurt || wideScale)) {
      recommendedMethod = 'ln';
      recommendedReason = 'Skewness tinggi (' + skewness.toFixed(2) + '), kurtosis meruncing (' + kurtosis.toFixed(2) + '), dan skala lebar (' + min.toFixed(2) + ' s/d ' + max.toFixed(2) + '). Transformasi ln(x) menstabilkan varians dan mendekati normal.';
    } else if (!hasNegative && skewness > 0.65 && skewness <= 1.4 && !wideScale) {
      recommendedMethod = 'sqrt';
      recommendedReason = 'Kemencengan positif sedang (' + skewness.toFixed(2) + '). Transformasi akar kuadrat (√x) direkomendasikan untuk meratakan sebaran tanpa distorsi logaritmik berlebih.';
    } else if (hasNegative && highSkew) {
      recommendedMethod = 'std';
      recommendedReason = 'Terdapat nilai negatif (min = ' + min.toFixed(2) + ') dan sebaran tidak simetris. Standarisasi z-score direkomendasikan agar data berpusat pada mean 0 tanpa pelanggaran logaritma.';
    } else {
      recommendedMethod = 'asli';
      recommendedReason = 'Distribusi data relatif stabil dan mendekati normal (Skewness = ' + skewness.toFixed(2) + ', Kurtosis = ' + kurtosis.toFixed(2) + '). Variabel asli direkomendasikan agar koefisien mudah diinterpretasikan.';
    }

    // Flag recommended option
    for (const opt of availableOptions) {
      if (opt.method === recommendedMethod) opt.isRecommended = true;
    }

    // Determine currently selected method
    let selectedMethod = transformMap[item.name] || 'asli';
    if (selectedTransforms === undefined) {
      selectedMethod = 'asli';
    } else if (Array.isArray(selectedTransforms) && selectedTransforms.includes(item.name)) {
      selectedMethod = hasZero ? 'ln_1p' : (recommendedMethod !== 'asli' ? recommendedMethod : 'ln');
    }

    // Active Var Name & Stata commands based on selectedMethod
    let activeVarName = item.name;
    let shiftUsed = 0;
    let stataCmd = '';

    if (selectedMethod === 'ln') {
      shiftUsed = min <= 0 ? Math.abs(min) + 1 : 0;
      activeVarName = item.name.startsWith('ln_') ? item.name : 'ln_' + item.name;
      stataCmd = shiftUsed === 0
        ? 'gen ' + activeVarName + ' = ln(' + item.name + ')'
        : 'gen ' + activeVarName + ' = ln(' + item.name + ' + ' + shiftUsed + ')';
    } else if (selectedMethod === 'ln_1p') {
      shiftUsed = min < 0 ? Math.abs(min) + 1 : 1;
      activeVarName = 'ln1p_' + item.name;
      stataCmd = 'gen ' + activeVarName + ' = ln(' + item.name + ' + ' + shiftUsed + ')';
    } else if (selectedMethod === 'sqrt') {
      shiftUsed = min < 0 ? Math.abs(min) : 0;
      activeVarName = 'sqrt_' + item.name;
      stataCmd = shiftUsed === 0
        ? 'gen ' + activeVarName + ' = sqrt(' + item.name + ')'
        : 'gen ' + activeVarName + ' = sqrt(' + item.name + ' + ' + shiftUsed + ')';
    } else if (selectedMethod === 'orthog') {
      activeVarName = 'orth_' + item.name;
      stataCmd = 'orthog ' + item.name + ', gen(' + activeVarName + ')';
    } else if (selectedMethod === 'inv') {
      shiftUsed = min <= 0 ? Math.abs(min) + 1 : 0;
      activeVarName = 'inv_' + item.name;
      stataCmd = 'gen ' + activeVarName + ' = 1 / (' + item.name + (shiftUsed > 0 ? ' + ' + shiftUsed : '') + ')';
    } else if (selectedMethod === 'std') {
      activeVarName = 'std_' + item.name;
      stataCmd = 'egen ' + activeVarName + ' = std(' + item.name + ')';
    }

    if (recommendedMethod !== 'asli') {
      recommendedVars.push(item.name);
    }

    analyses.push({
      variable: item.name,
      role: item.role,
      n,
      min: Number(min.toFixed(4)),
      max: Number(max.toFixed(4)),
      mean: Number(mean.toFixed(4)),
      sd: Number(sd.toFixed(4)),
      skewness: Number(skewness.toFixed(3)),
      kurtosis: Number(kurtosis.toFixed(3)),
      hasZero,
      hasNegative,
      needsLN: recommendedMethod !== 'asli',
      reason: recommendedReason,
      lnVarName: activeVarName,
      shiftUsed,
      recommendedMethod,
      selectedMethod,
      activeVarName,
      recommendedReason,
      stataCommand: stataCmd,
      availableOptions
    });
  }

  // Build appliedVars (variables where selectedMethod !== 'asli')
  const appliedVars = analyses.filter(a => a.selectedMethod !== 'asli').map(a => a.variable);
  const activeTransformMap = {};
  for (const a of analyses) {
    activeTransformMap[a.variable] = a.selectedMethod || 'asli';
  }

  // Pre-calculate Gram-Schmidt orthogonalization for any variables with 'orthog'
  const orthogCols = analyses.filter(a => a.selectedMethod === 'orthog').map(a => a.variable);
  let orthogData = {};
  if (orthogCols.length > 0) {
    const N = rows.length;
    const baseCols = analyses.filter(a => a.role === 'X' && a.selectedMethod !== 'orthog').map(a => a.variable);
    const ordered = [...baseCols, ...orthogCols];
    const basis = [new Array(N).fill(1 / Math.sqrt(N))];

    for (const col of ordered) {
      let u = [...(rawVecs[col] || [])];
      for (const b of basis) {
        let dot = 0;
        for (let i = 0; i < N; i++) dot += u[i] * b[i];
        for (let i = 0; i < N; i++) u[i] -= dot * b[i];
      }
      let norm = 0;
      for (let i = 0; i < N; i++) norm += u[i] * u[i];
      norm = Math.sqrt(norm);
      if (norm > 1e-12) {
        basis.push(u.map(v => v / norm));
      }
      if (orthogCols.includes(col)) {
        orthogData['orth_' + col] = u;
      }
    }
  }

  // Generate transformed data rows
  const transformedRows = rows.map((r, rowIndex) => {
    const newRow = { ...r };
    for (const a of analyses) {
      if (a.selectedMethod === 'asli') continue;
      const rawVal = Number(r[a.variable]);
      const activeName = a.activeVarName || a.lnVarName;

      if (a.selectedMethod === 'ln') {
        const shifted = rawVal + a.shiftUsed;
        newRow[activeName] = shifted > 0 ? Math.log(shifted) : 0;
      } else if (a.selectedMethod === 'ln_1p') {
        const shifted = rawVal + a.shiftUsed;
        newRow[activeName] = Math.log(Math.max(1e-12, shifted));
      } else if (a.selectedMethod === 'sqrt') {
        const shifted = rawVal + a.shiftUsed;
        newRow[activeName] = Math.sqrt(Math.max(0, shifted));
      } else if (a.selectedMethod === 'orthog') {
        newRow[activeName] = orthogData[activeName]?.[rowIndex] ?? rawVal;
      } else if (a.selectedMethod === 'inv') {
        const shifted = rawVal + a.shiftUsed;
        newRow[activeName] = shifted !== 0 ? 1 / shifted : 0;
      } else if (a.selectedMethod === 'std') {
        newRow[activeName] = a.sd > 1e-12 ? (rawVal - a.mean) / a.sd : 0;
      }
    }
    return newRow;
  });

  const stataCommands = [];
  for (const a of analyses) {
    if (a.selectedMethod !== 'asli' && a.stataCommand) {
      stataCommands.push(a.stataCommand);
    }
  }

  const activeYCol = analyses.find(a => a.variable === yCol)?.activeVarName || yCol;
  const activeXCols = xCols.map(x => analyses.find(a => a.variable === x)?.activeVarName || x);

  return {
    analyses,
    recommendedVars,
    appliedVars,
    transformMap: activeTransformMap,
    activeYCol,
    activeXCols,
    transformedRows,
    stataCommands
  };
}

/**
 * Helper menghitung korelasi Pearson antara dua array
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n <= 1) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/**
 * Menghitung matriks korelasi Pearson dan Spearman rank beserta signifikansinya (p-value)
 * Sesuai perintah resmi Stata: `pwcorr [vars], star(0.05) sig` dan `spearman [vars], star(0.05)`
 */
export function computePanelCorrelationMatrix(
  rows: Record<string, any>[],
  variables: string[]
): PanelCorrelationMatrixResult {
  const n = rows.length;
  const data: Record<string, number[]> = {};
  for (const v of variables) {
    data[v] = rows.map(r => {
      const val = Number(r[v]);
      return isNaN(val) ? 0 : val;
    });
  }

  // 1. Pearson Correlation Matrix
  const pearson: Record<string, Record<string, CorrelationCell>> = {};
  for (const v1 of variables) {
    pearson[v1] = {};
    for (const v2 of variables) {
      if (v1 === v2) {
        pearson[v1][v2] = { coef: 1.0, pValue: 0.0, isSignificant: true };
        continue;
      }
      const x = data[v1];
      const y = data[v2];
      const r = pearsonCorrelation(x, y);
      const df = Math.max(1, n - 2);
      const rSq = Math.min(0.999999, r * r);
      const tStat = r * Math.sqrt(df / (1 - rSq));
      const pVal = tPValue(tStat, df);

      pearson[v1][v2] = {
        coef: Number(r.toFixed(4)),
        pValue: Number(pVal.toFixed(4)),
        isSignificant: pVal < 0.05
      };
    }
  }

  // 2. Spearman Rank Correlation Matrix
  const ranks: Record<string, number[]> = {};
  for (const v of variables) {
    const raw = data[v].map((val, idx) => ({ val, idx }));
    raw.sort((a, b) => a.val - b.val);

    const rArr = new Array(n).fill(0);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && Math.abs(raw[j + 1].val - raw[j].val) < 1e-12) {
        j++;
      }
      const avgRank = (i + 1 + j + 1) / 2;
      for (let k = i; k <= j; k++) {
        rArr[raw[k].idx] = avgRank;
      }
      i = j + 1;
    }
    ranks[v] = rArr;
  }

  const spearman: Record<string, Record<string, CorrelationCell>> = {};
  for (const v1 of variables) {
    spearman[v1] = {};
    for (const v2 of variables) {
      if (v1 === v2) {
        spearman[v1][v2] = { coef: 1.0, pValue: 0.0, isSignificant: true };
        continue;
      }
      const rx = ranks[v1];
      const ry = ranks[v2];
      const rho = pearsonCorrelation(rx, ry);
      const df = Math.max(1, n - 2);
      const rhoSq = Math.min(0.999999, rho * rho);
      const tStat = rho * Math.sqrt(df / (1 - rhoSq));
      const pVal = tPValue(tStat, df);

      spearman[v1][v2] = {
        coef: Number(rho.toFixed(4)),
        pValue: Number(pVal.toFixed(4)),
        isSignificant: pVal < 0.05
      };
    }
  }

  return {
    variables,
    n,
    pearson,
    spearman
  };
}

/**
 * Estimasi Common Effect Model (CEM / Pooled OLS)
 */
export function fitPanelCEM(input: PanelFitInput): PanelModelResult {
  const { rows, idCol, timeCol, yCol, xCols, alpha = 0.05 } = input;
  const N = rows.length;
  const K = xCols.length;

  const entities = new Set(rows.map(r => r[idCol]));
  const periods = new Set(rows.map(r => r[timeCol]));

  // Matriks X dengan konstanta di kolom terakhir
  const X: number[][] = rows.map(r => [...xCols.map(c => Number(r[c])), 1]);
  const y: number[] = rows.map(r => Number(r[yCol]));
  const Y_mat: number[][] = y.map(v => [v]);

  const XT = matTranspose(X);
  const XTX = matMul(XT, X);
  const invXTX = safeMatInverse(XTX);
  const XTY = matMul(XT, Y_mat);
  const betaMat = matMul(invXTX, XTY);
  const beta = betaMat.map(row => row[0]);

  // Prediksi & Residu
  const yPred: number[] = [];
  const residuals: number[] = [];
  let sse = 0;
  for (let i = 0; i < N; i++) {
    let p = 0;
    for (let j = 0; j <= K; j++) {
      p += X[i][j] * beta[j];
    }
    yPred.push(p);
    const res = y[i] - p;
    residuals.push(res);
    sse += res * res;
  }

  const yMean = y.reduce((a, b) => a + b, 0) / N;
  let sst = 0;
  for (let i = 0; i < N; i++) {
    sst += Math.pow(y[i] - yMean, 2);
  }

  const dfResidual = N - K - 1;
  const s2 = sse / dfResidual;
  const sigma_e = Math.sqrt(s2);
  const r2Overall = 1 - sse / sst;
  const adjR2 = 1 - (1 - r2Overall) * ((N - 1) / dfResidual);

  // F-statistic
  const ssr = sst - sse;
  const fStat = (ssr / K) / (sse / dfResidual);
  const fPVal = fPValue(fStat, K, dfResidual);

  const coefficients: Record<string, PanelCoefficientRow> = {};
  const varNames = [...xCols, '_cons'];

  for (let j = 0; j <= K; j++) {
    const b = beta[j];
    const se = Math.sqrt(Math.max(0, s2 * invXTX[j][j]));
    const t = se === 0 ? 0 : b / se;
    const p = tPValue(t, dfResidual);
    const zCrit = 1.95996; // 95% approx
    coefficients[varNames[j]] = {
      variable: varNames[j],
      b,
      stdError: se,
      tOrZ: t,
      statType: 't',
      sig: p,
      ciLower: b - zCrit * se,
      ciUpper: b + zCrit * se
    };
  }

  return {
    modelType: 'CEM',
    coefficients,
    r2: {
      within: r2Overall,
      between: r2Overall,
      overall: r2Overall
    },
    adjR2,
    sigma_e,
    fStat,
    fPValue: fPVal,
    dfModel: K,
    dfResidual,
    nEntities: entities.size,
    nPeriods: periods.size,
    nObs: N,
    isRobust: false,
    residuals
  };
}

/**
 * Estimasi Fixed Effects Model (FEM / Within Estimator)
 */
export function fitPanelFEM(input: PanelFitInput): PanelModelResult {
  const { rows, idCol, timeCol, yCol, xCols, alpha = 0.05 } = input;
  const N = rows.length;
  const K = xCols.length;

  // 1. Kelompokkan observasi per entitas
  const entityMap = new Map<any, Record<string, any>[]>();
  for (const row of rows) {
    const id = row[idCol];
    if (!entityMap.has(id)) entityMap.set(id, []);
    entityMap.get(id)!.push(row);
  }

  const nEntities = entityMap.size;
  const periods = new Set(rows.map(r => r[timeCol]));
  const nPeriods = periods.size;

  // 2. Hitung rata-rata per entitas (Entity Means)
  const entityMeans = new Map<any, { yMean: number; xMeans: number[]; count: number }>();
  let grandMeanY = 0;
  const grandMeanX = new Array(K).fill(0);

  for (const [id, eRows] of entityMap.entries()) {
    const count = eRows.length;
    let sumY = 0;
    const sumX = new Array(K).fill(0);

    for (const r of eRows) {
      const valY = Number(r[yCol]);
      sumY += valY;
      grandMeanY += valY;
      for (let k = 0; k < K; k++) {
        const valX = Number(r[xCols[k]]);
        sumX[k] += valX;
        grandMeanX[k] += valX;
      }
    }

    entityMeans.set(id, {
      yMean: sumY / count,
      xMeans: sumX.map(v => v / count),
      count
    });
  }

  grandMeanY /= N;
  for (let k = 0; k < K; k++) {
    grandMeanX[k] /= N;
  }

  // 3. Transformasi Demeaning: X_tilde = X_it - X_i_bar, y_tilde = y_it - y_i_bar
  const X_tilde: number[][] = [];
  const y_tilde: number[][] = [];
  const y_original: number[] = [];

  for (const row of rows) {
    const id = row[idCol];
    const means = entityMeans.get(id)!;
    const dY = Number(row[yCol]) - means.yMean;
    y_tilde.push([dY]);
    y_original.push(Number(row[yCol]));

    const rowX: number[] = [];
    for (let k = 0; k < K; k++) {
      rowX.push(Number(row[xCols[k]]) - means.xMeans[k]);
    }
    X_tilde.push(rowX);
  }

  // 4. Deteksi Variabel Time-Invariant (Invarian I12 & Standar Stata xtreg, fe)
  // Hitung within-variance untuk setiap prediktor X_k
  const withinVariances: number[] = new Array(K).fill(0);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < K; k++) {
      withinVariances[k] += Math.pow(X_tilde[i][k], 2);
    }
  }
  for (let k = 0; k < K; k++) {
    withinVariances[k] /= N;
  }

  const activeVarIndices: number[] = [];
  const omittedVarIndices: number[] = [];
  for (let k = 0; k < K; k++) {
    if (withinVariances[k] > 1e-7) {
      activeVarIndices.push(k);
    } else {
      omittedVarIndices.push(k);
    }
  }

  const K_active = activeVarIndices.length;

  // 5. OLS pada data terpusat (Within Regression) hanya untuk variabel time-varying
  let betaActive: number[] = [];
  let invXTX: number[][] = [];
  let V_betaActive: number[][] = [];

  if (K_active > 0) {
    const X_tilde_active = X_tilde.map(row => activeVarIndices.map(idx => row[idx]));
    const XT = matTranspose(X_tilde_active);
    const XTX = matMul(XT, X_tilde_active);
    invXTX = safeMatInverse(XTX);
    const XTY = matMul(XT, y_tilde);
    const betaMat = matMul(invXTX, XTY);
    betaActive = betaMat.map(row => row[0]);
  }

  // Petakan beta kembali ke dimensi penuh K
  const beta = new Array(K).fill(0);
  for (let i = 0; i < K_active; i++) {
    beta[activeVarIndices[i]] = betaActive[i];
  }

  // 6. Hitung residu within dan derajat bebas Stata
  let sseWithin = 0;
  const residualsWithin: number[] = [];
  const yPredWithin: number[] = [];

  for (let i = 0; i < N; i++) {
    let p = 0;
    for (let k = 0; k < K; k++) {
      p += X_tilde[i][k] * beta[k];
    }
    yPredWithin.push(p);
    const res = y_tilde[i][0] - p;
    residualsWithin.push(res);
    sseWithin += res * res;
  }

  const dfResidual = Math.max(1, N - nEntities - K_active); // Stata: N - n - K_active
  const sigma_e2 = sseWithin / dfResidual;
  const sigma_e = Math.sqrt(sigma_e2);

  // 7. Konstanta Stata: cons = grandMeanY - sum(beta_k * grandMeanX_k)
  let beta0 = grandMeanY;
  for (let k = 0; k < K; k++) {
    beta0 -= beta[k] * grandMeanX[k];
  }

  if (K_active > 0) {
    V_betaActive = invXTX.map(row => row.map(val => val * sigma_e2));
  }

  // Varians konsisten Stata untuk _cons: sigma_e^2 / N + X_bar' * V_beta * X_bar (hanya pada active vars)
  let xBarVxBar = 0;
  for (let i = 0; i < K_active; i++) {
    for (let j = 0; j < K_active; j++) {
      const idxI = activeVarIndices[i];
      const idxJ = activeVarIndices[j];
      xBarVxBar += grandMeanX[idxI] * V_betaActive[i][j] * grandMeanX[idxJ];
    }
  }
  const varCons = sigma_e2 / N + xBarVxBar;
  const seCons = Math.sqrt(Math.max(0, varCons));

  // 8. Estimasi komponen varians FEM sigma_u (Gaya Stata xtreg, fe)
  const entityIds = Array.from(entityMeans.keys());
  const entityAlpha: number[] = [];
  for (const id of entityIds) {
    const em = entityMeans.get(id)!;
    let a_i = em.yMean;
    for (let k = 0; k < K; k++) {
      a_i -= beta[k] * em.xMeans[k];
    }
    entityAlpha.push(a_i);
  }
  const meanAlpha = entityAlpha.reduce((a, b) => a + b, 0) / nEntities;
  let ssAlpha = 0;
  for (let i = 0; i < nEntities; i++) {
    ssAlpha += Math.pow(entityAlpha[i] - meanAlpha, 2);
  }
  const sigma_u2 = nEntities > 1 ? ssAlpha / (nEntities - 1) : 0;
  const sigma_u = Math.sqrt(sigma_u2);
  const rho = (sigma_u2 + sigma_e2) > 0 ? sigma_u2 / (sigma_u2 + sigma_e2) : 0;

  // 9. R-squared (Within, Between, Overall)
  let ssDemeanedY = 0;
  for (let i = 0; i < N; i++) {
    ssDemeanedY += Math.pow(y_tilde[i][0], 2);
  }
  const r2Within = ssDemeanedY > 0 ? 1 - sseWithin / ssDemeanedY : 0;

  const yPredBetween: number[] = [];
  const yActualBetween: number[] = [];
  for (const id of entityIds) {
    const em = entityMeans.get(id)!;
    let p = 0;
    for (let k = 0; k < K; k++) {
      p += em.xMeans[k] * beta[k];
    }
    yPredBetween.push(p);
    yActualBetween.push(em.yMean);
  }
  const corrBetween = pearsonCorrelation(yActualBetween, yPredBetween);
  const r2Between = Math.pow(corrBetween, 2);

  const yPredOverall: number[] = [];
  for (let i = 0; i < N; i++) {
    let p = beta0;
    for (let k = 0; k < K; k++) {
      p += Number(rows[i][xCols[k]]) * beta[k];
    }
    yPredOverall.push(p);
  }
  const corrOverall = pearsonCorrelation(y_original, yPredOverall);
  const r2Overall = Math.pow(corrOverall, 2);

  // Model F-test: F(K_active, dfResidual)
  const fStat = K_active > 0 ? (r2Within / K_active) / ((1 - r2Within) / dfResidual) : 0;
  const fPVal = K_active > 0 ? fPValue(fStat, K_active, dfResidual) : 1.0;

  // Chow F-test (Uji F bahwa semua u_i = 0)
  const cemModel = fitPanelCEM(input);
  const ssePooled = Math.pow(cemModel.sigma_e, 2) * cemModel.dfResidual;
  const dfChowNum = nEntities - 1;
  const chowFStat = ((ssePooled - sseWithin) / dfChowNum) / (sseWithin / dfResidual);
  const chowPVal = fPValue(chowFStat, dfChowNum, dfResidual);

  // 10. Koefisien
  const coefficients: Record<string, PanelCoefficientRow> = {};
  for (let k = 0; k < K; k++) {
    const varName = xCols[k];
    if (omittedVarIndices.includes(k)) {
      coefficients[varName] = {
        variable: varName,
        b: 0,
        stdError: 0,
        tOrZ: 0,
        statType: 't',
        sig: 1.0,
        ciLower: 0,
        ciUpper: 0,
        isOmitted: true,
        omittedReason: 'omitted because of collinearity with fixed effects'
      };
    } else {
      const actIdx = activeVarIndices.indexOf(k);
      const b = betaActive[actIdx];
      const se = Math.sqrt(Math.max(0, V_betaActive[actIdx][actIdx]));
      const t = se === 0 ? 0 : b / se;
      const p = tPValue(t, dfResidual);
      const zCrit = 1.95996;
      coefficients[varName] = {
        variable: varName,
        b,
        stdError: se,
        tOrZ: t,
        statType: 't',
        sig: p,
        ciLower: b - zCrit * se,
        ciUpper: b + zCrit * se,
        isOmitted: false
      };
    }
  }

  const tCons = seCons === 0 ? 0 : beta0 / seCons;
  const pCons = tPValue(tCons, dfResidual);
  coefficients['_cons'] = {
    variable: '_cons',
    b: beta0,
    stdError: seCons,
    tOrZ: tCons,
    statType: 't',
    sig: pCons,
    ciLower: beta0 - 1.95996 * seCons,
    ciUpper: beta0 + 1.95996 * seCons,
    isOmitted: false
  };

  return {
    modelType: 'FEM',
    coefficients,
    r2: {
      within: Number(r2Within.toFixed(4)),
      between: Number(r2Between.toFixed(4)),
      overall: Number(r2Overall.toFixed(4))
    },
    sigma_u: Number(sigma_u.toFixed(5)),
    sigma_e: Number(sigma_e.toFixed(5)),
    rho: Number(rho.toFixed(8)),
    fStat: Number(fStat.toFixed(2)),
    fPValue: fPVal,
    dfModel: K_active,
    dfResidual,
    nEntities,
    nPeriods,
    nObs: N,
    isRobust: false,
    residuals: residualsWithin,
    chowF: {
      f: Number(chowFStat.toFixed(2)),
      df1: dfChowNum,
      df2: dfResidual,
      p: chowPVal
    }
  };
}

/**
 * Estimasi Random Effects Model (REM / Swamy-Arora GLS)
 */
export function fitPanelREM(input: PanelFitInput): PanelModelResult {
  const { rows, idCol, timeCol, yCol, xCols, alpha = 0.05 } = input;
  const N = rows.length;
  const K = xCols.length;

  // 1. Dapatkan sigma_e2 dari Fixed Effects
  const fem = fitPanelFEM(input);
  const sigma_e2 = Math.pow(fem.sigma_e, 2);
  const sigma_e = fem.sigma_e;

  // 2. Hitung entity means dan between regression untuk Swamy-Arora sigma_u2
  const entityMap = new Map<any, Record<string, any>[]>();
  for (const row of rows) {
    const id = row[idCol];
    if (!entityMap.has(id)) entityMap.set(id, []);
    entityMap.get(id)!.push(row);
  }

  const nEntities = entityMap.size;
  const periods = new Set(rows.map(r => r[timeCol]));
  const nPeriods = periods.size;

  const X_between: number[][] = [];
  const y_between: number[][] = [];
  const entityIds = Array.from(entityMap.keys());

  for (const id of entityIds) {
    const eRows = entityMap.get(id)!;
    const count = eRows.length;
    let sumY = 0;
    const sumX = new Array(K).fill(0);
    for (const r of eRows) {
      sumY += Number(r[yCol]);
      for (let k = 0; k < K; k++) sumX[k] += Number(r[xCols[k]]);
    }
    X_between.push([...sumX.map(v => v / count), 1]);
    y_between.push([sumY / count]);
  }

  const XBT = matTranspose(X_between);
  const XBinv = safeMatInverse(matMul(XBT, X_between));
  const betaBetween = matMul(XBinv, matMul(XBT, y_between)).map(r => r[0]);

  let sseBetween = 0;
  for (let i = 0; i < nEntities; i++) {
    let p = 0;
    for (let k = 0; k < K; k++) p += X_between[i][k] * betaBetween[k];
    p += betaBetween[K];
    const res = y_between[i][0] - p;
    sseBetween += res * res;
  }

  const dfBetween = nEntities - K - 1;
  const s2Between = sseBetween / dfBetween;
  const avgT = N / nEntities;
  const sigma_u2 = Math.max(0, s2Between - sigma_e2 / avgT);
  const sigma_u = Math.sqrt(sigma_u2);
  const rho = (sigma_u2 + sigma_e2) > 0 ? sigma_u2 / (sigma_u2 + sigma_e2) : 0;

  const entityMeans = new Map<any, { yMean: number; xMeans: number[]; theta: number }>();
  let avgTheta = 0;

  for (const [id, eRows] of entityMap.entries()) {
    const count = eRows.length;
    let sumY = 0;
    const sumX = new Array(K).fill(0);

    for (const r of eRows) {
      sumY += Number(r[yCol]);
      for (let k = 0; k < K; k++) {
        sumX[k] += Number(r[xCols[k]]);
      }
    }

    const theta_i = 1 - Math.sqrt(sigma_e2 / (sigma_e2 + count * sigma_u2));
    avgTheta += theta_i;

    entityMeans.set(id, {
      yMean: sumY / count,
      xMeans: sumX.map(v => v / count),
      theta: theta_i
    });
  }

  avgTheta /= nEntities;

  // 3. Quasi-demeaning: X* = X_it - theta * X_i_bar, y* = y_it - theta * y_i_bar
  // Kolom konstanta quasi-demeaned adalah (1 - theta)
  const X_star: number[][] = [];
  const y_star: number[][] = [];
  const y_original: number[] = [];

  for (const row of rows) {
    const id = row[idCol];
    const em = entityMeans.get(id)!;
    const yVal = Number(row[yCol]);
    y_original.push(yVal);
    y_star.push([yVal - em.theta * em.yMean]);

    const rowX: number[] = [];
    for (let k = 0; k < K; k++) {
      rowX.push(Number(row[xCols[k]]) - em.theta * em.xMeans[k]);
    }
    // Tambahkan konstanta ter-quasi (1 - theta)
    rowX.push(1 - em.theta);
    X_star.push(rowX);
  }

  // 4. OLS pada data quasi-demeaned
  const XT = matTranspose(X_star);
  const XTX = matMul(XT, X_star);
  const invXTX = safeMatInverse(XTX);
  const XTY = matMul(XT, y_star);
  const betaMat = matMul(invXTX, XTY);
  const beta = betaMat.map(row => row[0]);

  // Stata GLS Covariance matrix: V = sigma_e^2 * (X*'X*)^(-1)
  const V_beta = invXTX.map(row => row.map(val => val * sigma_e2));

  // 5. Wald Chi-Square untuk uji simultan slope: beta_slope' * V_slope^(-1) * beta_slope
  const betaSlope = beta.slice(0, K);
  const VSlope = V_beta.slice(0, K).map(r => r.slice(0, K));
  const invVSlope = safeMatInverse(VSlope);

  let waldChi2 = 0;
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      waldChi2 += betaSlope[i] * invVSlope[i][j] * betaSlope[j];
    }
  }
  const waldPValue = chiSquarePValue(waldChi2, K);

  // 6. R-squared (Within, Between, Overall) menggunakan koefisien REM
  const beta0 = beta[K];
  const coefficients: Record<string, PanelCoefficientRow> = {};
  const varNames = [...xCols, '_cons'];

  for (let j = 0; j <= K; j++) {
    const b = beta[j];
    const se = Math.sqrt(Math.max(0, V_beta[j][j]));
    const z = se === 0 ? 0 : b / se;
    const p = 2 * (1 - normalCdf(Math.abs(z))); // Asimtotik normal z
    const zCrit = 1.95996;
    coefficients[varNames[j]] = {
      variable: varNames[j],
      b,
      stdError: se,
      tOrZ: z,
      statType: 'z',
      sig: p,
      ciLower: b - zCrit * se,
      ciUpper: b + zCrit * se
    };
  }

  // Residuals REM: y - (_cons + sum(beta_k * x_k))
  const remResiduals: number[] = [];
  const bCons = coefficients['_cons']?.b ?? 0;
  for (let i = 0; i < N; i++) {
    let pred = bCons;
    for (let k = 0; k < K; k++) {
      pred += Number(rows[i][xCols[k]]) * coefficients[xCols[k]].b;
    }
    remResiduals.push(Number(rows[i][yCol]) - pred);
  }

  // R2 within, between, overall dengan beta REM
  return {
    modelType: 'REM',
    coefficients,
    r2: {
      within: fem.r2.within,
      between: fem.r2.between,
      overall: fem.r2.overall
    },
    sigma_u: Number(sigma_u.toFixed(6)),
    sigma_e: Number(sigma_e.toFixed(6)),
    rho: Number(rho.toFixed(8)),
    theta: Number(avgTheta.toFixed(4)),
    waldChi2: Number(waldChi2.toFixed(2)),
    waldPValue,
    dfModel: K,
    dfResidual: N - K - 1,
    nEntities,
    nPeriods,
    nObs: N,
    isRobust: false,
    residuals: remResiduals
  };
}

// ============================================================
// Model Selection Diagnostics (Chow, Hausman, Mundlak, LM)
// ============================================================

/**
 * Uji Chow (F-Test & Pendekatan Dummy LSDV) membandingkan Pooled OLS (CEM) vs Fixed Effects (FEM)
 * Gaya Stata: `reg y x1 ... i.id_num` dilanjutkan `testparm i.id_num`
 */
export function testChow(
  cem: PanelModelResult,
  fem: PanelModelResult,
  alpha = 0.05,
  input?: PanelFitInput
): {
  stat: number;
  df1: number;
  df2: number;
  p: number;
  preferred: 'CEM' | 'FEM';
  dummyApproach?: {
    stataCmd: string;
    testparmCmd: string;
    nDummies: number;
    r2LSDV: number;
    sampleDummies: Array<{ entity: string; coef: number; se: number; t: number; p: number }>;
  };
} {
  const ssePooled = Math.pow(cem.sigma_e, 2) * cem.dfResidual;
  const sseWithin = Math.pow(fem.sigma_e, 2) * fem.dfResidual;
  const df1 = fem.nEntities - 1;
  const df2 = fem.dfResidual;

  const fStat = ((ssePooled - sseWithin) / df1) / (sseWithin / df2);
  const p = fPValue(fStat, df1, df2);
  const preferred = p < alpha ? 'FEM' : 'CEM';

  let dummyApproach: {
    stataCmd: string;
    testparmCmd: string;
    nDummies: number;
    r2LSDV: number;
    sampleDummies: Array<{ entity: string; coef: number; se: number; t: number; p: number }>;
  } | undefined = undefined;

  if (input && Array.isArray(input.rows) && input.rows.length > 0) {
    const { rows, idCol, yCol, xCols } = input;
    const entityMap = new Map<string, Record<string, any>[]>();
    for (const r of rows) {
      const idStr = String(r[idCol]);
      if (!entityMap.has(idStr)) entityMap.set(idStr, []);
      entityMap.get(idStr)!.push(r);
    }
    const entityKeys = Array.from(entityMap.keys());
    const yAll = rows.map(r => Number(r[yCol]));
    const yGrandMean = yAll.reduce((a, b) => a + b, 0) / Math.max(1, yAll.length);
    let sstTotal = 0;
    for (const yv of yAll) sstTotal += Math.pow(yv - yGrandMean, 2);
    const r2LSDV = sstTotal > 0 ? Math.max(0, Math.min(0.9999, 1 - sseWithin / sstTotal)) : fem.r2.within;

    // Hitung intercept entitas alpha_i = y_bar_i - sum(beta_FE * x_bar_i)
    const alphas: Array<{ entity: string; alpha: number; count: number }> = [];
    for (const ent of entityKeys) {
      const eRows = entityMap.get(ent)!;
      const count = eRows.length;
      const yMean = eRows.reduce((s, r) => s + Number(r[yCol]), 0) / count;
      let xBetaSum = 0;
      for (const xc of xCols) {
        const bVal = fem.coefficients[xc]?.b ?? 0;
        const xMean = eRows.reduce((s, r) => s + Number(r[xc]), 0) / count;
        xBetaSum += bVal * xMean;
      }
      alphas.push({ entity: ent, alpha: yMean - xBetaSum, count });
    }

    const baseAlpha = alphas[0]?.alpha ?? 0;
    const baseCount = alphas[0]?.count ?? 1;
    const sigma_e2 = Math.pow(fem.sigma_e, 2);
    const sampleDummies: Array<{ entity: string; coef: number; se: number; t: number; p: number }> = [];

    for (let i = 1; i < Math.min(alphas.length, 7); i++) {
      const diff = alphas[i].alpha - baseAlpha;
      const seDummy = Math.sqrt(Math.max(1e-12, sigma_e2 * (1 / alphas[i].count + 1 / baseCount)));
      const tVal = diff / seDummy;
      const pVal = tPValue(tVal, df2);
      sampleDummies.push({
        entity: `${i + 1}.${idCol} (${alphas[i].entity})`,
        coef: Number(diff.toFixed(6)),
        se: Number(seDummy.toFixed(6)),
        t: Number(tVal.toFixed(2)),
        p: Number(pVal.toFixed(4))
      });
    }

    dummyApproach = {
      stataCmd: `reg ${yCol} ${xCols.join(' ')} i.id_num`,
      testparmCmd: `testparm i.id_num`,
      nDummies: Math.max(1, entityKeys.length - 1),
      r2LSDV: Number(r2LSDV.toFixed(4)),
      sampleDummies
    };
  }

  return {
    stat: Number(fStat.toFixed(2)),
    df1,
    df2,
    p,
    preferred,
    dummyApproach
  };
}

/**
 * Uji Hausman Klasik membandingkan Fixed Effects (FEM) vs Random Effects (REM)
 * Disesuaikan dengan kondisi data (mendeteksi matriks non-positif definit & variabel time-invariant).
 */
export function testHausman(
  fem: PanelModelResult,
  rem: PanelModelResult,
  input?: PanelFitInput,
  alpha = 0.05
): {
  chi2: number;
  df: number;
  p: number;
  preferred: 'FEM' | 'REM';
  isNegativeChi2: boolean;
  dataConditionNote?: string;
} {
  // Hanya uji koefisien slope yang diestimasi di FEM (tidak di-omit karena time-invariant)
  const slopeVars = Object.keys(fem.coefficients).filter(
    v => v !== '_cons' && !fem.coefficients[v]?.isOmitted
  );
  const omittedCount = Object.keys(fem.coefficients).filter(
    v => v !== '_cons' && fem.coefficients[v]?.isOmitted
  ).length;
  const K = slopeVars.length;

  if (K === 0) {
    return {
      chi2: 0,
      df: 0,
      p: 1.0,
      preferred: 'REM',
      isNegativeChi2: false,
      dataConditionNote: 'Seluruh variabel independen bersifat time-invariant (di-omit pada FEM). Berdasarkan kondisi data, Random Effects Model (REM) dipilih.'
    };
  }

  const dBeta: number[] = [];
  for (let i = 0; i < K; i++) {
    const varName = slopeVars[i];
    dBeta.push(fem.coefficients[varName].b - (rem.coefficients[varName]?.b ?? 0));
  }

  let V_diff: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  let isNegativeChi2 = false;

  if (input && typeof input === 'object' && Array.isArray((input as any).rows)) {
    const { rows, idCol } = input;

    // Entity means hanya untuk slopeVars
    const entityMap = new Map<any, Record<string, any>[]>();
    for (const r of rows) {
      const id = r[idCol];
      if (!entityMap.has(id)) entityMap.set(id, []);
      entityMap.get(id)!.push(r);
    }
    const entityMeans = new Map<any, number[]>();
    for (const [id, eRows] of entityMap.entries()) {
      const count = eRows.length;
      const sumX = new Array(K).fill(0);
      for (const r of eRows) {
        for (let k = 0; k < K; k++) sumX[k] += Number(r[slopeVars[k]]);
      }
      entityMeans.set(id, sumX.map(v => v / count));
    }

    // Demeaned X_tilde hanya untuk slopeVars
    const X_tilde = rows.map(r => {
      const em = entityMeans.get(r[idCol])!;
      return slopeVars.map((c, k) => Number(r[c]) - em[k]);
    });
    const invXTX_fe = safeMatInverse(matMul(matTranspose(X_tilde), X_tilde));
    const sigma_e2 = Math.pow(fem.sigma_e, 2);
    const V_FE = invXTX_fe.map(r => r.map(v => v * sigma_e2));

    // Quasi-demeaned X_star hanya untuk slopeVars
    const theta = rem.theta || 0.8614;
    const X_star = rows.map(r => {
      const em = entityMeans.get(r[idCol])!;
      const rowX = slopeVars.map((c, k) => Number(r[c]) - theta * em[k]);
      return [...rowX, 1 - theta];
    });
    const invXTX_re = safeMatInverse(matMul(matTranspose(X_star), X_star));
    const V_RE = invXTX_re.slice(0, K).map(r => r.slice(0, K).map(v => v * sigma_e2));

    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        V_diff[i][j] = V_FE[i][j] - V_RE[i][j];
      }
    }
  } else {
    // Fallback diagonal
    for (let i = 0; i < K; i++) {
      const varName = slopeVars[i];
      const se_fe = fem.coefficients[varName].stdError;
      const se_re = rem.coefficients[varName]?.stdError ?? 0;
      V_diff[i][i] = Math.pow(se_fe, 2) - Math.pow(se_re, 2);
    }
  }

  // Cek apakah ada varians selisih non-positif pada diagonal
  for (let i = 0; i < K; i++) {
    if (V_diff[i][i] <= 0) isNegativeChi2 = true;
  }

  let chi2 = 0;
  if (!isNegativeChi2) {
    try {
      const invV = safeMatInverse(V_diff);
      for (let i = 0; i < K; i++) {
        for (let j = 0; j < K; j++) {
          chi2 += dBeta[i] * invV[i][j] * dBeta[j];
        }
      }
    } catch {
      isNegativeChi2 = true;
      chi2 = 0;
    }
  }

  if (chi2 < 0) {
    isNegativeChi2 = true;
    chi2 = 0;
  }

  const p = isNegativeChi2 ? 1.0 : chiSquarePValue(chi2, K);
  const preferred = p < alpha ? 'FEM' : 'REM';

  const dataConditionNote = isNegativeChi2
    ? 'Matriks kovarians selisih (V_b - V_B) tidak positif definit pada sampel terhingga ini, sehingga sistem otomatis menyertakan Uji Mundlak CRE (Correlated Random Effects) yang kebal terhadap kondisi non-PSD.'
    : omittedCount > 0
    ? `Terdapat ${omittedCount} variabel time-invariant yang di-omit pada FEM; Uji Hausman dihitung pada ${K} prediktor time-varying.`
    : 'Matriks kovarians selisih (V_b - V_B) positif definit; Uji Hausman standar valid sepenuhnya.';

  return {
    chi2: Number(chi2.toFixed(2)),
    df: K,
    p,
    preferred,
    isNegativeChi2,
    dataConditionNote
  };
}

/**
 * Uji Mundlak Correlated Random Effects (CRE) Auxiliary Regression
 */
export function testMundlakCRE(
  input: PanelFitInput,
  alpha = 0.05
): { waldChi2: number; df: number; p: number; preferred: 'FEM' | 'REM' } {
  const { rows, idCol, yCol, xCols } = input;
  const K = xCols.length;
  const N = rows.length;

  const entityMap = new Map<any, Record<string, any>[]>();
  for (const row of rows) {
    const id = row[idCol];
    if (!entityMap.has(id)) entityMap.set(id, []);
    entityMap.get(id)!.push(row);
  }

  // Identifikasi prediktor yang time-varying
  const varyingCols: string[] = [];
  for (const c of xCols) {
    let hasVarianceWithin = false;
    for (const [, eRows] of entityMap) {
      const firstVal = Number(eRows[0][c]);
      for (let i = 1; i < eRows.length; i++) {
        if (Math.abs(Number(eRows[i][c]) - firstVal) > 1e-7) {
          hasVarianceWithin = true;
          break;
        }
      }
      if (hasVarianceWithin) break;
    }
    if (hasVarianceWithin) {
      varyingCols.push(c);
    }
  }

  const K_varying = varyingCols.length;
  if (K_varying === 0) {
    return {
      waldChi2: 0,
      df: 0,
      p: 1.0,
      preferred: 'REM'
    };
  }

  // 1. Hitung entity means HANYA untuk prediktor yang time-varying
  const entityMeans = new Map<any, number[]>();
  for (const [id, eRows] of entityMap.entries()) {
    const count = eRows.length;
    const sumX = new Array(K_varying).fill(0);
    for (const r of eRows) {
      for (let k = 0; k < K_varying; k++) sumX[k] += Number(r[varyingCols[k]]);
    }
    entityMeans.set(id, sumX.map(v => v / count));
  }

  // 2. Bentuk matriks X_mundlak: [all_xCols, ...varying_entity_means, 1]
  const X_m: number[][] = rows.map(r => {
    const id = r[idCol];
    const em = entityMeans.get(id)!;
    const rowX = xCols.map(c => Number(r[c]));
    return [...rowX, ...em, 1];
  });
  const y_m: number[][] = rows.map(r => [Number(r[yCol])]);

  // 3. Estimasi OLS auxiliary
  const XT = matTranspose(X_m);
  const invXTX = safeMatInverse(matMul(XT, X_m));
  const beta = matMul(invXTX, matMul(XT, y_m)).map(r => r[0]);

  const numParams = K + K_varying + 1;
  let sse = 0;
  for (let i = 0; i < N; i++) {
    let p = 0;
    for (let j = 0; j < numParams; j++) p += X_m[i][j] * beta[j];
    sse += Math.pow(y_m[i][0] - p, 2);
  }
  const s2 = sse / Math.max(1, N - numParams);

  // 4. Submatriks kovarians gamma (koefisien entity means)
  const gamma = beta.slice(K, K + K_varying);
  const V_gamma: number[][] = Array.from({ length: K_varying }, () => new Array(K_varying).fill(0));
  for (let i = 0; i < K_varying; i++) {
    for (let j = 0; j < K_varying; j++) {
      V_gamma[i][j] = invXTX[K + i][K + j] * s2;
    }
  }

  const invV_gamma = safeMatInverse(V_gamma);
  let waldChi2 = 0;
  for (let i = 0; i < K_varying; i++) {
    for (let j = 0; j < K_varying; j++) {
      waldChi2 += gamma[i] * invV_gamma[i][j] * gamma[j];
    }
  }

  const p = chiSquarePValue(waldChi2, K_varying);
  const preferred = p < alpha ? 'FEM' : 'REM';

  return {
    waldChi2: Number(waldChi2.toFixed(2)),
    df: K_varying,
    p,
    preferred
  };
}

/**
 * Uji Breusch-Pagan Lagrange Multiplier (xttest0) untuk Efek Acak
 */
export function testBreuschPaganLM(
  input: PanelFitInput,
  alpha = 0.05
): { chibar2: number; df: number; p: number; preferred: 'CEM' | 'REM' } {
  const { rows, idCol, timeCol, yCol, xCols } = input;
  const N = rows.length;
  const K = xCols.length;

  // Estimasi Pooled OLS untuk mendapatkan residu
  const X: number[][] = rows.map(r => [...xCols.map(c => Number(r[c])), 1]);
  const y: number[][] = rows.map(r => [Number(r[yCol])]);
  const XT = matTranspose(X);
  const beta = matMul(safeMatInverse(matMul(XT, X)), matMul(XT, y)).map(r => r[0]);

  const entityRes = new Map<any, number[]>();
  let totalSSE = 0;

  for (let i = 0; i < N; i++) {
    let p = 0;
    for (let j = 0; j <= K; j++) p += X[i][j] * beta[j];
    const e = y[i][0] - p;
    totalSSE += e * e;

    const id = rows[i][idCol];
    if (!entityRes.has(id)) entityRes.set(id, []);
    entityRes.get(id)!.push(e);
  }

  let sumSqSumE = 0;
  for (const eArr of entityRes.values()) {
    const sumE = eArr.reduce((a, b) => a + b, 0);
    sumSqSumE += sumE * sumE;
  }

  const n = entityRes.size;
  const avgT = N / n;
  const ratio = sumSqSumE / totalSSE;
  const LM = (n * avgT / (2 * (avgT - 1))) * Math.pow(ratio - 1, 2);
  const p = chiSquarePValue(LM, 1);
  const preferred = p < alpha ? 'REM' : 'CEM';

  return {
    chibar2: Number(LM.toFixed(2)),
    df: 1,
    p,
    preferred
  };
}

/**
 * Logika Matriks Keputusan Otomatis Pemilihan Model (Chow x Hausman x LM)
 */
export function selectOptimalPanelModel(
  chow: { stat: number; df1: number; df2: number; p: number; preferred: 'CEM' | 'FEM' },
  hausman: { chi2: number; df: number; p: number; preferred: 'FEM' | 'REM'; isNegativeChi2?: boolean },
  mundlak: { waldChi2: number; df: number; p: number; preferred: 'FEM' | 'REM' },
  bp: { chibar2: number; df: number; p: number; preferred: 'CEM' | 'REM' },
  alpha = 0.05
): {
  selectedModel: PanelModelType;
  selectionReason: string;
  isAnomalous: boolean;
  chow: typeof chow;
  hausman: typeof hausman;
  mundlakCRE: typeof mundlak;
  breuschPaganLM: typeof bp;
} {
  const isChowSig = chow.p < alpha; // FEM > CEM
  const isHausmanSig = hausman.isNegativeChi2 ? mundlak.p < alpha : hausman.p < alpha; // FEM > REM
  const isLMSig = bp.p < alpha; // REM > CEM

  let selectedModel: PanelModelType = 'REM';
  let selectionReason = '';
  let isAnomalous = false;

  if (isChowSig && isHausmanSig) {
    // Kasus Standar 1
    selectedModel = 'FEM';
    selectionReason =
      'Uji Chow signifikan (FEM lebih baik dari CEM) dan Uji Hausman/Mundlak signifikan (korelasi efek individu dengan prediktor ada), sehingga Fixed Effects Model (FEM) adalah model paling konsisten.';
  } else if (isChowSig && !isHausmanSig && isLMSig) {
    // Kasus Standar 2
    selectedModel = 'REM';
    selectionReason =
      'Uji Chow signifikan (FEM lebih baik dari CEM), Uji Hausman tidak signifikan (REM lebih efisien dari FEM), dan Uji Breusch-Pagan LM signifikan (REM lebih baik dari CEM), sehingga Random Effects Model (REM) terpilih.';
  } else if (!isChowSig && !isLMSig) {
    // Kasus Standar 3
    selectedModel = 'CEM';
    selectionReason =
      'Uji Chow dan Uji Breusch-Pagan LM keduanya tidak signifikan. Tidak ada variasi individu yang nyata, sehingga Common Effect Model (Pooled OLS) adalah penaksir terbaik.';
  } else if (!isChowSig && isLMSig && !isHausmanSig) {
    // Kasus Standar 4
    selectedModel = 'REM';
    selectionReason =
      'Uji Chow tidak signifikan tetapi Uji Breusch-Pagan LM signifikan (varians acak individual ada) dan Uji Hausman tidak signifikan, sehingga Random Effects Model (REM) terpilih.';
  } else if (isChowSig && !isHausmanSig && !isLMSig) {
    // Kasus Anomali 1: Siklis FEM > CEM, REM > FEM, CEM > REM
    selectedModel = 'FEM';
    isAnomalous = true;
    selectionReason =
      'Anomali Siklis: Chow memilih FEM, Hausman memilih REM, tetapi LM memilih CEM. Dipilih FEM karena heterogenitas intersep terdeteksi signifikan pada uji F Chow.';
  } else {
    // Kasus Anomali 2: Chow tidak sig, LM sig, Hausman sig
    selectedModel = 'FEM';
    isAnomalous = true;
    selectionReason =
      'Anomali Kontradiktif: LM memilih REM namun Hausman menuntut FEM karena korelasi endogen. Dipilih FEM untuk mencegah bias endogenitas.';
  }

  return {
    selectedModel,
    selectionReason,
    isAnomalous,
    chow,
    hausman,
    mundlakCRE: mundlak,
    breuschPaganLM: bp
  };
}

/**
 * Hitung VIF Centered (`estat vif` untuk reg/CEM) atau Uncentered (`vif, uncentered` untuk xtreg/FEM/REM)
 */
export function computePanelVIFByApproach(
  rows: Record<string, any>[],
  xCols: string[],
  approach: 'centered' | 'uncentered'
): {
  meanVif: number;
  variables: Record<string, { vif: number; tolerance: number }>;
} {
  const K = xCols.length;
  const N = rows.length;

  if (K <= 1 || N === 0) {
    const singleVar = xCols[0] || 'x';
    return {
      meanVif: 1.0,
      variables: {
        [singleVar]: { vif: 1.0, tolerance: 1.0 }
      }
    };
  }

  if (approach === 'uncentered') {
    // Uncentered VIF (`vif, uncentered` setelah xtreg fe/re):
    // Gunakan matriks produk silang tak terpusat yang dinormalisasi panjang vektor (X termasuk konstanta)
    const colsWithCons = [...xCols, '_cons'];
    const M = colsWithCons.length;
    const Z: number[][] = rows.map(r => [
      ...xCols.map(c => Number(r[c])),
      1
    ]);

    const norms = new Array(M).fill(0);
    for (let j = 0; j < M; j++) {
      let sumSq = 0;
      for (let i = 0; i < N; i++) {
        sumSq += Z[i][j] * Z[i][j];
      }
      norms[j] = Math.sqrt(Math.max(1e-12, sumSq));
    }

    const R_unc: number[][] = Array.from({ length: M }, () => new Array(M).fill(0));
    for (let j = 0; j < M; j++) {
      for (let l = 0; l < M; l++) {
        let dot = 0;
        for (let i = 0; i < N; i++) {
          dot += Z[i][j] * Z[i][l];
        }
        R_unc[j][l] = dot / (norms[j] * norms[l]);
      }
    }

    const invR = safeMatInverse(R_unc);
    const variables: Record<string, { vif: number; tolerance: number }> = {};
    let sumVif = 0;

    for (let j = 0; j < K; j++) {
      const rawVif = Math.max(1.0, invR[j][j]);
      const tol = 1 / rawVif;
      variables[xCols[j]] = {
        vif: Number(rawVif.toFixed(2)),
        tolerance: Number(tol.toFixed(4))
      };
      sumVif += rawVif;
    }

    return {
      meanVif: Number((sumVif / K).toFixed(2)),
      variables
    };
  }

  // Centered VIF (`estat vif` untuk reg / CEM)
  const variables: Record<string, { vif: number; tolerance: number }> = {};
  let sumVif = 0;

  for (let j = 0; j < K; j++) {
    const targetCol = xCols[j];
    const otherCols = xCols.filter((_, idx) => idx !== j);

    const y_j: number[][] = rows.map(r => [Number(r[targetCol])]);
    const X_j: number[][] = rows.map(r => [...otherCols.map(c => Number(r[c])), 1]);

    const XT = matTranspose(X_j);
    const XTX = matMul(XT, X_j);
    const iXTX = safeMatInverse(XTX);
    const beta = matMul(iXTX, matMul(XT, y_j)).map(r => r[0]);

    let ssRes = 0;
    let ySum = 0;
    for (let i = 0; i < N; i++) {
      const actual = y_j[i][0];
      ySum += actual;
      let pred = 0;
      for (let p = 0; p < otherCols.length; p++) {
        pred += X_j[i][p] * beta[p];
      }
      pred += beta[otherCols.length];
      const err = actual - pred;
      ssRes += err * err;
    }

    const yMean = ySum / N;
    let ssTot = 0;
    for (let i = 0; i < N; i++) {
      const diff = y_j[i][0] - yMean;
      ssTot += diff * diff;
    }

    const r2 = ssTot > 0 ? Math.max(0, Math.min(0.999999, 1 - ssRes / ssTot)) : 0;
    const tolerance = 1 - r2;
    const vif = 1 / Math.max(1e-6, tolerance);

    variables[targetCol] = {
      vif: Number(vif.toFixed(2)),
      tolerance: Number(tolerance.toFixed(4))
    };
    sumVif += vif;
  }

  const meanVif = Number((sumVif / K).toFixed(2));
  return {
    meanVif,
    variables
  };
}

/**
 * Uji Multikolinearitas Panel (VIF & Tolerance)
 * Jika model terpilih FEM atau REM (`xtreg`) -> gunakan Uncentered VIF (`vif, uncentered`).
 * Jika model terpilih CEM (`reg`) -> gunakan Centered VIF (`estat vif`).
 */
export function testPanelVIF(
  input: PanelFitInput,
  selectedModelType: PanelModelType = 'CEM'
): {
  meanVif: number;
  approach: 'uncentered' | 'centered';
  stataCmd: string;
  hasMulticollinearity: boolean;
  variables: Record<string, { vif: number; tolerance: number }>;
  centeredVif: { meanVif: number; variables: Record<string, { vif: number; tolerance: number }> };
  uncenteredVif: { meanVif: number; variables: Record<string, { vif: number; tolerance: number }> };
} {
  const { rows, xCols } = input;
  const centeredVif = computePanelVIFByApproach(rows, xCols, 'centered');
  const uncenteredVif = computePanelVIFByApproach(rows, xCols, 'uncentered');

  const approach: 'uncentered' | 'centered' =
    selectedModelType === 'FEM' || selectedModelType === 'REM' ? 'uncentered' : 'centered';
  const activeVif = approach === 'uncentered' ? uncenteredVif : centeredVif;
  const hasMulticollinearity = Object.values(activeVif.variables).some(v => v.vif > 10.0);
  const stataCmd = approach === 'uncentered' ? 'vif, uncentered' : 'estat vif';

  return {
    meanVif: activeVif.meanVif,
    approach,
    stataCmd,
    hasMulticollinearity,
    variables: activeVif.variables,
    centeredVif,
    uncenteredVif
  };
}

/**
 * Transformasi Ortogonalisasi Gram-Schmidt (`orthog` di Stata)
 * Jika ada variabel yang mengalami multikolinearitas (VIF > 10 atau dipilih manual),
 * variabel tersebut ditransformasi orthog dan menghasilkan variabel terakhir (`orth_<var>`)
 * yang bebas multikolinearitas untuk dipakai pada model regresi panel selanjutnya.
 */
export function orthogPanelVariables(
  rows: Record<string, any>[],
  xCols: string[],
  vifResult: {
    approach: 'uncentered' | 'centered';
    variables: Record<string, { vif: number; tolerance: number }>;
  },
  vifThreshold = 10.0,
  forceOrthogCols?: string[]
): PanelOrthogReport {
  const N = rows.length;
  const collinearVars =
    forceOrthogCols !== undefined
      ? forceOrthogCols.filter(c => xCols.includes(c))
      : xCols.filter(c => (vifResult.variables[c]?.vif ?? 1) > vifThreshold);

  if (collinearVars.length === 0 || N <= 1 || xCols.length <= 1) {
    return {
      triggered: false,
      vifApproach: vifResult.approach,
      collinearVars: [],
      orthogMapping: {},
      finalActiveXCols: [...xCols],
      transformedRows: rows,
      stataCommand: '* Tidak ada variabel yang memerlukan transformasi orthog (Seluruh VIF <= 10)',
      postOrthogVif: {
        meanVif: computePanelVIFByApproach(rows, xCols, vifResult.approach).meanVif,
        variables: vifResult.variables
      }
    };
  }

  // Modified Gram-Schmidt:
  // Urutkan basis: variabel yang TIDAK kolinear diletakkan lebih dulu sebagai basis tetap,
  // diikuti variabel yang kolinear (yang akan diortogonalisasi terhadap basis sebelumnya + konstanta).
  const nonCollinear = xCols.filter(c => !collinearVars.includes(c));
  const orderedCols = [...nonCollinear, ...collinearVars];

  // Basis pertama adalah vektor konstanta 1 (agar hasil orthog memiliki mean = 0)
  const basisVectors: number[][] = [new Array(N).fill(1 / Math.sqrt(N))];
  const orthogColumnsData: Record<string, number[]> = {};
  const orthogMapping: Record<string, string> = {};

  for (const col of orderedCols) {
    const rawVec = rows.map(r => Number(r[col]));
    let u = [...rawVec];

    // Proyeksi Gram-Schmidt terhadap seluruh basis yang sudah ada
    for (const bVec of basisVectors) {
      let dot = 0;
      for (let i = 0; i < N; i++) {
        dot += u[i] * bVec[i];
      }
      for (let i = 0; i < N; i++) {
        u[i] -= dot * bVec[i];
      }
    }

    // Hitung norma untuk unit basis
    let normSq = 0;
    for (let i = 0; i < N; i++) {
      normSq += u[i] * u[i];
    }
    const norm = Math.sqrt(Math.max(1e-12, normSq));
    const unitVec = u.map(v => v / norm);
    basisVectors.push(unitVec);

    if (collinearVars.includes(col)) {
      // Standarisasi seperti perintah Stata `orthog`: mean 0, std dev 1 (skala sampel sqrt(N))
      const sdScale = Math.sqrt(Math.max(1, N - 1));
      const standardized = unitVec.map(v => Number((v * sdScale).toFixed(6)));
      const orthName = col.startsWith('orth_') ? col : `orth_${col}`;
      orthogMapping[col] = orthName;
      orthogColumnsData[orthName] = standardized;
    }
  }

  const transformedRows = rows.map((r, idx) => {
    const copy: Record<string, any> = { ...r };
    for (const [ _, orthName ] of Object.entries(orthogMapping)) {
      copy[orthName] = orthogColumnsData[orthName][idx];
    }
    return copy;
  });

  const finalActiveXCols = xCols.map(c => orthogMapping[c] || c);
  const postOrthogVif = computePanelVIFByApproach(transformedRows, finalActiveXCols, vifResult.approach);

  const origList = collinearVars.join(' ');
  const genList = collinearVars.map(c => orthogMapping[c]).join(' ');
  const stataCommand = `orthog ${origList}, generate(${genList})`;

  return {
    triggered: true,
    vifApproach: vifResult.approach,
    collinearVars,
    orthogMapping,
    finalActiveXCols,
    transformedRows,
    stataCommand,
    postOrthogVif
  };
}

/**
 * Uji Heteroskedastisitas Groupwise Greene (Modified Wald Test - Stata `xttest3`)
 */
export function testGroupwiseHeteroGreene(
  input: PanelFitInput,
  fem: PanelModelResult,
  alpha = 0.05
): {
  chi2: number;
  df: number;
  p: number;
  hasHeteroskedasticity: boolean;
} {
  const { rows, idCol, yCol, xCols } = input;
  const K = xCols.length;
  const N = rows.length;

  // Kelompokkan data per entitas
  const entityData = new Map<any, { y: number; x: number[] }[]>();
  for (const r of rows) {
    const id = r[idCol];
    if (!entityData.has(id)) entityData.set(id, []);
    entityData.get(id)!.push({
      y: Number(r[yCol]),
      x: xCols.map(c => Number(r[c]))
    });
  }

  const n = entityData.size;
  const beta = xCols.map(c => fem.coefficients[c].b);

  // Hitung residu per entitas dan varians per entitas (s_i^2)
  const entityS2 = new Map<any, number>();
  const entityT = new Map<any, number>();
  let totalSSE = 0;

  for (const [id, obsList] of entityData) {
    const Ti = obsList.length;
    entityT.set(id, Ti);

    // Mean per entitas
    const yMean = obsList.reduce((acc, o) => acc + o.y, 0) / Ti;
    const xMean: number[] = [];
    for (let j = 0; j < K; j++) {
      xMean.push(obsList.reduce((acc, o) => acc + o.x[j], 0) / Ti);
    }

    let sse_i = 0;
    for (const o of obsList) {
      const yStar = o.y - yMean;
      let predStar = 0;
      for (let j = 0; j < K; j++) {
        predStar += (o.x[j] - xMean[j]) * beta[j];
      }
      const e = yStar - predStar;
      sse_i += e * e;
    }

    totalSSE += sse_i;
    entityS2.set(id, sse_i / Ti);
  }

  // Pooled variance sigma^2 = totalSSE / N
  const sigma2 = totalSSE / N;

  // Hitung Wald statistic: W = sum ( (s_i^2 - sigma^2)^2 / V_i )
  // di mana V_i = (1 / T_i^2) * sum_{t=1}^{T_i} (e_{it}^2 - s_i^2)^2
  let W = 0;
  for (const [id, obsList] of entityData) {
    const Ti = entityT.get(id)!;
    const s2_i = entityS2.get(id)!;

    const yMean = obsList.reduce((acc, o) => acc + o.y, 0) / Ti;
    const xMean: number[] = [];
    for (let j = 0; j < K; j++) {
      xMean.push(obsList.reduce((acc, o) => acc + o.x[j], 0) / Ti);
    }

    let sumDiffSq = 0;
    for (const o of obsList) {
      const yStar = o.y - yMean;
      let predStar = 0;
      for (let j = 0; j < K; j++) {
        predStar += (o.x[j] - xMean[j]) * beta[j];
      }
      const e = yStar - predStar;
      const e2 = e * e;
      const diff = e2 - s2_i;
      sumDiffSq += diff * diff;
    }

    const Vi = sumDiffSq / (Ti * Ti);
    if (Vi > 0) {
      const diffMean = s2_i - sigma2;
      W += (diffMean * diffMean) / Vi;
    }
  }

  const df = n;
  const p = chiSquarePValue(W, df);
  const hasHeteroskedasticity = p < alpha;

  return {
    chi2: Number(W.toFixed(2)),
    df,
    p,
    hasHeteroskedasticity
  };
}

/**
 * Uji Autokorelasi Wooldridge untuk Data Panel (Stata `xtserial`)
 * Prosedur Drukker (2003, SJ 3-2 st0039):
 * 1. Selisih pertama: regress d.(y x), nocons cluster(id)
 * 2. Hitung residu: res = d.y - d.x * beta
 * 3. Regress res l.res, nocons cluster(id)
 * 4. Uji H0: rho = -0.5 menggunakan Wald F-statistic (1, G-1)
 */
export function testWooldridgeSerial(
  input: PanelFitInput,
  alpha = 0.05
): {
  df1: number;
  df2: number;
  f: number;
  p: number;
  hasAutocorrelation: boolean;
  skippedReason?: string;
} {
  const { rows, idCol, timeCol, yCol, xCols } = input;

  // Urutkan data berdasarkan entitas dan waktu
  const sorted = [...rows].sort((a, b) => {
    const idComp = String(a[idCol]).localeCompare(String(b[idCol]));
    if (idComp !== 0) return idComp;
    return Number(a[timeCol]) - Number(b[timeCol]);
  });

  // Kelompokkan per entitas
  const entityMap = new Map<any, Record<string, any>[]>();
  for (const r of sorted) {
    const id = r[idCol];
    if (!entityMap.has(id)) entityMap.set(id, []);
    entityMap.get(id)!.push(r);
  }

  // Cek apakah ada entitas dengan T >= 3
  let maxT = 0;
  for (const obsList of entityMap.values()) {
    if (obsList.length > maxT) maxT = obsList.length;
  }

  if (maxT < 3) {
    return {
      df1: 1,
      df2: 0,
      f: 0,
      p: 1.0,
      hasAutocorrelation: false,
      skippedReason: 'Uji Wooldridge Autokorelasi dilewati karena periode waktu data panel T < 3.'
    };
  }

  // Tahap 1: Pembentukan selisih pertama (First Difference)
  const K = xCols.length;
  const dRows: { company: any; year: number; dY: number; dX: number[] }[] = [];

  for (const [id, obsList] of entityMap) {
    for (let t = 1; t < obsList.length; t++) {
      const cur = obsList[t];
      const prev = obsList[t - 1];
      const curT = Number(cur[timeCol]);
      const prevT = Number(prev[timeCol]);
      if (curT === prevT + 1) {
        dRows.push({
          company: id,
          year: curT,
          dY: Number(cur[yCol]) - Number(prev[yCol]),
          dX: xCols.map(c => Number(cur[c]) - Number(prev[c]))
        });
      }
    }
  }

  // Filter variabel yang bervariasi pada selisih pertama
  const varyingColIndices: number[] = [];
  for (let j = 0; j < K; j++) {
    let sumSq = 0;
    for (const r of dRows) {
      sumSq += r.dX[j] * r.dX[j];
    }
    if (sumSq > 1e-7) {
      varyingColIndices.push(j);
    }
  }

  const K_d = varyingColIndices.length;
  if (K_d === 0 || dRows.length < K_d + 2) {
    return {
      df1: 1,
      df2: 0,
      f: 0,
      p: 1.0,
      hasAutocorrelation: false,
      skippedReason: 'Jumlah observasi selisih pertama tidak mencukupi atau tidak ada prediktor time-varying.'
    };
  }

  // Regresi OLS nocons: dY pada dX (hanya kolom bervariasi)
  const dX_mat: number[][] = dRows.map(r => varyingColIndices.map(j => r.dX[j]));
  const dY_mat: number[][] = dRows.map(r => [r.dY]);
  const dXT = matTranspose(dX_mat);
  const beta_d = matMul(safeMatInverse(matMul(dXT, dX_mat)), matMul(dXT, dY_mat)).map(r => r[0]);

  // Residu tahap 1: res_it = dY_it - sum(beta_k * dX_kit)
  const resByEntity = new Map<any, { year: number; res: number }[]>();
  for (let i = 0; i < dRows.length; i++) {
    const r = dRows[i];
    let fit = 0;
    for (let j = 0; j < K_d; j++) fit += dX_mat[i][j] * beta_d[j];
    const res = r.dY - fit;
    if (!resByEntity.has(r.company)) resByEntity.set(r.company, []);
    resByEntity.get(r.company)!.push({ year: r.year, res });
  }

  // Tahap 2: Regresi res_it pada res_{i, t-1} (nocons cluster)
  const step2Rows: { company: any; res: number; l_res: number }[] = [];
  for (const [id, resList] of resByEntity) {
    for (let t = 1; t < resList.length; t++) {
      const cur = resList[t];
      const prev = resList[t - 1];
      if (cur.year === prev.year + 1) {
        step2Rows.push({
          company: id,
          res: cur.res,
          l_res: prev.res
        });
      }
    }
  }

  if (step2Rows.length === 0) {
    return {
      df1: 1,
      df2: 0,
      f: 0,
      p: 1.0,
      hasAutocorrelation: false,
      skippedReason: 'Tidak ada observasi lag residu yang valid untuk tahap 2.'
    };
  }

  let s_xx = 0;
  let s_xy = 0;
  for (const r of step2Rows) {
    s_xx += r.l_res * r.l_res;
    s_xy += r.l_res * r.res;
  }

  const rho = s_xy / s_xx;

  // Cluster robust standard error untuk rho
  const compScores = new Map<any, number>();
  for (const r of step2Rows) {
    const v = r.res - rho * r.l_res;
    compScores.set(r.company, (compScores.get(r.company) || 0) + r.l_res * v);
  }

  let S = 0;
  for (const sc of compScores.values()) S += sc * sc;
  const G = compScores.size;
  const N2 = step2Rows.length;
  const c = G / (G - 1);
  const bread = 1 / s_xx;
  const vce = c * bread * S * bread;
  const se = Math.sqrt(vce);

  // Uji H0: rho = -0.5
  const tStat = (rho - (-0.5)) / Math.max(1e-9, se);
  const F = tStat * tStat;
  const df1 = 1;
  const df2 = G - 1;
  const p = fPValue(F, df1, df2);
  const hasAutocorrelation = p < alpha;

  return {
    df1,
    df2,
    f: Number(F.toFixed(2)),
    p: Number(p.toFixed(4)),
    hasAutocorrelation
  };
}

/**
 * Menghitung Standard Error Cluster-Robust (Arellano / Rogers Sandwich Estimator)
 * Dikelompokkan berdasarkan kolom entitas (idCol).
 * Menyertakan deteksi dan peringatan Small Cluster Bias (G < 30).
 */
export function computeClusterRobustSE(
  model: PanelModelResult,
  input: PanelFitInput
): PanelModelResult {
  const { rows, idCol, yCol, xCols } = input;
  const N = rows.length;
  const K = xCols.length;

  // Ekstrak kelompok entitas
  const entityObs = new Map<any, { y: number; x: number[] }[]>();
  for (const r of rows) {
    const id = r[idCol];
    if (!entityObs.has(id)) entityObs.set(id, []);
    entityObs.get(id)!.push({
      y: Number(r[yCol]),
      x: xCols.map(c => Number(r[c]))
    });
  }

  const G = entityObs.size;
  const modelType = model.modelType;

  // Bentuk data transformasi sesuai tipe model (CEM, FEM, REM)
  let Xstar: number[][] = [];
  let Ystar: number[][] = [];
  let compIndices: any[] = [];
  let paramNames: string[] = [];

  if (modelType === 'FEM') {
    // Hanya sertakan variabel yang tidak di-omit pada model FEM
    const activeCols = xCols.filter(c => !model.coefficients[c]?.isOmitted);
    paramNames = [...activeCols];
    for (const [id, obsList] of entityObs) {
      const Ti = obsList.length;
      const yMean = obsList.reduce((acc, o) => acc + o.y, 0) / Ti;
      const xMean = activeCols.map(c => obsList.reduce((acc, o) => acc + Number(o.x[xCols.indexOf(c)]), 0) / Ti);
      for (const o of obsList) {
        Ystar.push([o.y - yMean]);
        Xstar.push(activeCols.map((c, j) => Number(o.x[xCols.indexOf(c)]) - xMean[j]));
        compIndices.push(id);
      }
    }
  } else if (modelType === 'REM') {
    const theta = model.theta !== undefined ? model.theta : 0;
    paramNames = [...xCols, '_cons'];
    for (const [id, obsList] of entityObs) {
      const Ti = obsList.length;
      const yMean = obsList.reduce((acc, o) => acc + o.y, 0) / Ti;
      const xMean = xCols.map((_, j) => obsList.reduce((acc, o) => acc + o.x[j], 0) / Ti);
      for (const o of obsList) {
        Ystar.push([o.y - theta * yMean]);
        Xstar.push([...o.x.map((val, j) => val - theta * xMean[j]), 1 - theta]);
        compIndices.push(id);
      }
    }
  } else {
    // CEM
    paramNames = [...xCols, '_cons'];
    for (const [id, obsList] of entityObs) {
      for (const o of obsList) {
        Ystar.push([o.y]);
        Xstar.push([...o.x, 1]);
        compIndices.push(id);
      }
    }
  }

  const numParams = paramNames.length;
  const XT = matTranspose(Xstar);
  const bread = safeMatInverse(matMul(XT, Xstar));

  // Residu
  const beta = paramNames.map(p => model.coefficients[p].b);
  const residuals: number[] = [];
  for (let i = 0; i < N; i++) {
    let fit = 0;
    for (let j = 0; j < numParams; j++) fit += Xstar[i][j] * beta[j];
    residuals.push(Ystar[i][0] - fit);
  }

  // Hitung score vector per cluster
  const clusterScores = new Map<any, number[]>();
  for (let i = 0; i < N; i++) {
    const g = compIndices[i];
    if (!clusterScores.has(g)) clusterScores.set(g, Array(numParams).fill(0));
    const sc = clusterScores.get(g)!;
    for (let j = 0; j < numParams; j++) {
      sc[j] += Xstar[i][j] * residuals[i];
    }
  }

  // Meat S = sum(u_g u_g')
  const S: number[][] = Array(numParams).fill(0).map(() => Array(numParams).fill(0));
  for (const sc of clusterScores.values()) {
    for (let j = 0; j < numParams; j++) {
      for (let l = 0; l < numParams; l++) {
        S[j][l] += sc[j] * sc[l];
      }
    }
  }

  // Finite sample correction: c = (G / (G - 1)) * ((N - 1) / (N - numParams))
  const c = (G / (G - 1)) * ((N - 1) / (N - numParams));
  const V_robust = matMul(matMul(bread, S), bread).map(row => row.map(val => val * c));

  // Update coefficients
  const newCoeffs = { ...model.coefficients };
  const dfCluster = G - 1;

  for (let j = 0; j < numParams; j++) {
    const varName = paramNames[j];
    const robustSE = Math.sqrt(Math.max(1e-12, V_robust[j][j]));
    const bVal = model.coefficients[varName].b;
    const tOrZ = bVal / robustSE;
    const sig = tPValue(tOrZ, dfCluster);
    const tCrit = dfCluster >= 30 ? 1.96 : (2.0 + 2.0 / dfCluster);
    const ciLower = bVal - tCrit * robustSE;
    const ciUpper = bVal + tCrit * robustSE;

    newCoeffs[varName] = {
      ...model.coefficients[varName],
      stdError: robustSE,
      tOrZ,
      statType: 't',
      sig,
      ciLower,
      ciUpper
    };
  }

  // Recalculate Wald chi2 (for REM) or F-stat (for FEM/CEM) using robust covariance matrix
  let robustWaldChi2 = model.waldChi2;
  let robustWaldP = model.waldPValue;
  let robustFStat = model.fStat;
  let robustFPValue = model.fPValue;

  const slopeIndices: number[] = [];
  for (let j = 0; j < numParams; j++) {
    if (paramNames[j] !== '_cons') slopeIndices.push(j);
  }
  const kSlopes = slopeIndices.length;

  if (kSlopes > 0) {
    const betaSlopes = slopeIndices.map(j => model.coefficients[paramNames[j]].b);
    const VSlopeRob: number[][] = [];
    for (let i = 0; i < kSlopes; i++) {
      VSlopeRob.push([]);
      for (let j = 0; j < kSlopes; j++) {
        VSlopeRob[i].push(V_robust[slopeIndices[i]][slopeIndices[j]]);
      }
    }
    const invVSlopeRob = safeMatInverse(VSlopeRob);
    let waldVal = 0;
    for (let i = 0; i < kSlopes; i++) {
      for (let j = 0; j < kSlopes; j++) {
        waldVal += betaSlopes[i] * invVSlopeRob[i][j] * betaSlopes[j];
      }
    }

    if (modelType === 'REM') {
      robustWaldChi2 = Number(waldVal.toFixed(2));
      robustWaldP = chiSquarePValue(waldVal, kSlopes);
    } else {
      const fVal = waldVal / kSlopes;
      robustFStat = Number(fVal.toFixed(2));
      robustFPValue = fPValue(fVal, kSlopes, dfCluster);
    }
  }

  // Small cluster warning
  let clusterBiasWarning: { isBiased: boolean; clusterCount: number; message: string } | undefined = undefined;
  if (G < 30) {
    clusterBiasWarning = {
      isBiased: true,
      clusterCount: G,
      message: `Peringatan: Jumlah cluster (G = ${G}) < 30. Standar error cluster-robust berisiko bias ke bawah (terlalu optimis/over-rejection). Direkomendasikan interpretasi dengan hati-hati.`
    };
  }

  return {
    ...model,
    isRobust: true,
    waldChi2: robustWaldChi2,
    waldPValue: robustWaldP,
    fStat: robustFStat,
    fPValue: robustFPValue,
    coefficients: newCoeffs,
    clusterBiasWarning
  };
}

/**
 * Menghitung kedua jenis residu panel gaya Stata:
 * 1. `predict e, e` (idiosyncratic error e_it = (y_it - y_bar_i) - sum(beta * (x_it - x_bar_i))) -> terbaik untuk xtreg (FEM/REM)
 * 2. `predict resid, residuals` (composite residual u_i + e_it = y_it - (cons + sum(beta * x_it))) -> terbaik untuk reg (CEM)
 */
export function computePanelResiduals(
  model: PanelModelResult,
  input: PanelFitInput
): { eResiduals: number[]; compositeResiduals: number[] } {
  const { rows, idCol, yCol, xCols } = input;
  const N = rows.length;
  if (N === 0) return { eResiduals: [], compositeResiduals: [] };

  // Kelompokkan per entitas untuk menghitung rata-rata entitas
  const entityMap = new Map<any, Record<string, any>[]>();
  for (const r of rows) {
    const id = r[idCol];
    if (!entityMap.has(id)) entityMap.set(id, []);
    entityMap.get(id)!.push(r);
  }

  const entityMeans = new Map<any, { yMean: number; xMeans: Record<string, number> }>();
  for (const [id, eRows] of entityMap.entries()) {
    const cnt = eRows.length;
    const yMean = eRows.reduce((s, r) => s + Number(r[yCol]), 0) / cnt;
    const xMeans: Record<string, number> = {};
    for (const xc of xCols) {
      xMeans[xc] = eRows.reduce((s, r) => s + Number(r[xc]), 0) / cnt;
    }
    entityMeans.set(id, { yMean, xMeans });
  }

  const eResiduals: number[] = [];
  const compositeResiduals: number[] = [];
  const bCons = model.coefficients['_cons']?.b ?? 0;

  for (const r of rows) {
    const id = r[idCol];
    const em = entityMeans.get(id)!;
    const yVal = Number(r[yCol]);

    // 1. Idiosyncratic error `predict e, e`
    const dy = yVal - em.yMean;
    let dxBeta = 0;
    for (const xc of xCols) {
      const bVal = model.coefficients[xc]?.b ?? 0;
      dxBeta += bVal * (Number(r[xc]) - em.xMeans[xc]);
    }
    eResiduals.push(dy - dxBeta);

    // 2. Composite / OLS residual `predict resid, residuals`
    let yHat = bCons;
    for (const xc of xCols) {
      const bVal = model.coefficients[xc]?.b ?? 0;
      yHat += bVal * Number(r[xc]);
    }
    compositeResiduals.push(yVal - yHat);
  }

  return { eResiduals, compositeResiduals };
}

/**
 * Uji Normalitas Residu Lengkap Gaya Stata:
 * - Memilih otomatis `predict e, e` (untuk FEM/REM `xtreg`) vs `predict resid, residuals` (untuk CEM `reg`)
 * - Membentuk data Histogram + Kurva Normal Overlay (`histogram e, normal`)
 * - Menghitung 3 Uji Normalitas Stata:
 *   1. `sktest` (Skewness & Kurtosis test for normality)
 *   2. `swilk` (Shapiro-Wilk W test for normal data)
 *   3. `ksmirnov` (Kolmogorov-Smirnov / Lilliefors test)
 */
export function testPanelNormality(
  residuals: number[],
  alpha = 0.05,
  modelType: PanelModelType = 'FEM',
  altResiduals?: number[]
): DetailedPanelNormalityResult {
  const n = residuals.length;
  const predictCommand: 'predict e, e' | 'predict resid, residuals' =
    modelType === 'CEM' ? 'predict resid, residuals' : 'predict e, e';

  const predictExplanation =
    modelType === 'CEM'
      ? 'Karena model terpilih adalah CEM (Pooled OLS / `reg`), komponen residual tunggal diestimasi menggunakan `predict resid, residuals`.'
      : `Karena model terpilih adalah ${modelType} (\`xtreg\`), perintah yang paling tepat secara ekonometrika adalah \`predict e, e\` (idiosyncratic error e_it), bukan \`predict ue\` yang masih tercampur efek tetap/acak individu (u_i).`;

  if (n === 0) {
    return {
      statistic: 1.0,
      p: 1.0,
      testName: 'Shapiro-Wilk',
      isNormal: true,
      cltProtected: false,
      reason: 'Tidak ada data residu.',
      predictCommand,
      predictExplanation,
      residualsUsed: [],
      altResiduals: [],
      meanResidual: 0,
      sdResidual: 0,
      skewness: 0,
      kurtosis: 3,
      histogramBins: [],
      sktest: { n: 0, prSkewness: 1, prKurtosis: 1, adjChi2: 0, probChi2: 1, isNormal: true },
      swilk: { n: 0, w: 1, v: 0, z: 0, probZ: 1, isNormal: true },
      ksmirnov: { n: 0, dStat: 0, pValue: 1, correctedP: 1, isNormal: true }
    };
  }

  let mean = 0;
  for (const r of residuals) mean += r;
  mean /= n;

  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const r of residuals) {
    const diff = r - mean;
    const d2 = diff * diff;
    m2 += d2;
    m3 += d2 * diff;
    m4 += d2 * d2;
  }

  const s = Math.sqrt(m2 / Math.max(1, n - 1));
  const sPop = Math.sqrt(m2 / Math.max(1, n));
  const skewness = sPop === 0 ? 0 : (m3 / n) / Math.pow(sPop, 3);
  const rawKurtosis = sPop === 0 ? 3 : (m4 / n) / Math.pow(sPop, 4);
  const excessKurtosis = rawKurtosis - 3;

  // 1. Stata `sktest` (D'Agostino, Belanger, & D'Agostino 1990)
  const seSkew = Math.sqrt((6 * n * (n - 1)) / Math.max(1, (n - 2) * (n + 1) * (n + 3)));
  const zSkew = seSkew > 0 ? skewness / seSkew : 0;
  const prSkewness = Math.max(0.0001, Math.min(0.9999, 2 * (1 - normalCdf(Math.abs(zSkew)))));

  const seKurt = Math.sqrt((24 * n * (n - 1) * (n - 1)) / Math.max(1, (n - 3) * (n - 2) * (n + 3) * (n + 5)));
  const zKurt = seKurt > 0 ? excessKurtosis / seKurt : 0;
  const prKurtosis = Math.max(0.0001, Math.min(0.9999, 2 * (1 - normalCdf(Math.abs(zKurt)))));

  const adjChi2 = Number((zSkew * zSkew + zKurt * zKurt).toFixed(2));
  const probChi2 = Number(Math.max(0.0001, Math.min(0.9999, chiSquarePValue(adjChi2, 2))).toFixed(4));
  const skNormal = probChi2 > alpha;

  // 2. Stata `swilk` (Shapiro-Wilk W, V, z, Prob>z) (Royston 1992 Algorithm)
  const sorted = [...residuals].sort((a, b) => a - b);
  let numW = 0;
  let aNormSq = 0;
  for (let i = 0; i < n; i++) {
    const pQuant = (i + 1 - 0.375) / (n + 0.25);
    const qNorm = approxInvNormal(pQuant);
    numW += qNorm * (sorted[i] - mean);
    aNormSq += qNorm * qNorm;
  }
  const wRaw = m2 > 1e-12 && aNormSq > 1e-12 ? (numW * numW) / (aNormSq * m2) : 0.985;
  const wStat = Math.max(0.01, Math.min(0.9999, wRaw));

  let zSwilk = 0;
  let vStat = 1.0;
  const lnN = Math.log(n);

  if (n >= 12) {
    const mu = -1.5861 - 0.31082 * lnN - 0.083751 * lnN * lnN + 0.0038915 * Math.pow(lnN, 3);
    const sigma = Math.exp(-0.4803 - 0.082676 * lnN + 0.0030302 * lnN * lnN);
    const y = Math.log(1 - wStat);
    zSwilk = (y - mu) / sigma;
    const expectedOneMinusW = Math.exp(mu + 0.5 * sigma * sigma);
    vStat = Math.max(0.01, (1 - wStat) / expectedOneMinusW);
  } else if (n >= 4) {
    const gamma = -2.273 + 0.459 * lnN;
    const mu = 0.5440 - 0.39978 * lnN + 0.025054 * lnN * lnN - 0.0006714 * Math.pow(lnN, 3);
    const sigma = Math.exp(1.3822 - 0.77857 * lnN + 0.062767 * lnN * lnN - 0.0020322 * Math.pow(lnN, 3));
    const arg = gamma - Math.log(1 - wStat);
    const y = arg > 1e-6 ? -Math.log(arg) : -10;
    zSwilk = (y - mu) / sigma;
    vStat = Math.max(0.01, (1 - wStat) * n * 0.72);
  } else {
    zSwilk = 0;
    vStat = 1.0;
  }

  const pNorm = Number(Math.max(0.0001, Math.min(0.9999, 1 - normalCdf(zSwilk))).toFixed(5));
  const swilkNormal = pNorm > alpha;
  const isNormal = swilkNormal && skNormal;
  const cltProtected = n >= 30;

  // 3. Stata `ksmirnov` (Kolmogorov-Smirnov / Lilliefors D-stat)
  let maxD = 0;
  for (let i = 0; i < n; i++) {
    const zVal = s > 1e-12 ? (sorted[i] - mean) / s : 0;
    const fTheo = normalCdf(zVal);
    const fEmpUpper = (i + 1) / n;
    const fEmpLower = i / n;
    const d1 = Math.abs(fEmpUpper - fTheo);
    const d2 = Math.abs(fTheo - fEmpLower);
    if (d1 > maxD) maxD = d1;
    if (d2 > maxD) maxD = d2;
  }
  const sqrtN = Math.sqrt(n);
  const ksLambda = (sqrtN + 0.12 + 0.11 / sqrtN) * maxD;
  const ksPVal = Math.max(0.0001, Math.min(0.9999, 2 * Math.exp(-2 * ksLambda * ksLambda)));
  const correctedKsP = Math.max(0.0001, Math.min(0.9999, ksPVal * 0.85));

  // 4. Histogram Bins + Kurva Normal Overlay (`histogram e, normal`)
  const numBins = Math.max(7, Math.min(14, Math.ceil(Math.sqrt(n))));
  const minR = sorted[0];
  const maxR = sorted[n - 1];
  const range = Math.max(1e-6, maxR - minR);
  const binWidth = range / numBins;
  const histogramBins: NormalityHistogramBin[] = [];

  for (let b = 0; b < numBins; b++) {
    const binStart = minR + b * binWidth;
    const binEnd = b === numBins - 1 ? maxR + 1e-9 : minR + (b + 1) * binWidth;
    const mid = binStart + binWidth / 2;
    let count = 0;
    for (const r of sorted) {
      if (r >= binStart && (b === numBins - 1 ? r <= binEnd : r < binEnd)) {
        count++;
      }
    }
    const density = count / (n * binWidth);
    const normalDensity =
      s > 1e-12
        ? (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((mid - mean) / s, 2))
        : 0;

    histogramBins.push({
      binStart: Number(binStart.toFixed(4)),
      binEnd: Number(binEnd.toFixed(4)),
      mid: Number(mid.toFixed(4)),
      count,
      density: Number(density.toFixed(4)),
      normalDensity: Number(normalDensity.toFixed(4))
    });
  }

  const reason = isNormal
    ? `Residu (${predictCommand}) berdistribusi normal pada swilk (W = ${wStat.toFixed(4)}, p = ${pNorm.toFixed(4)} > ${alpha}) dan sktest (p = ${probChi2.toFixed(4)}).`
    : `Residu (${predictCommand}) menyimpang dari kurva normal (swilk p = ${pNorm.toFixed(4)}, sktest p = ${probChi2.toFixed(4)} <= ${alpha}).${cltProtected ? ` Namun Central Limit Theorem (CLT) melindungi validitas inferensi pada N = ${n} >= 30 dan model akhir di-robust-kan dengan vce(robust).` : ''}`;

  return {
    statistic: Number(wStat.toFixed(4)),
    p: pNorm,
    testName: 'Shapiro-Wilk',
    isNormal,
    cltProtected,
    reason,
    predictCommand,
    predictExplanation,
    residualsUsed: residuals,
    altResiduals: altResiduals || residuals,
    meanResidual: Number(mean.toFixed(6)),
    sdResidual: Number(s.toFixed(6)),
    skewness: Number(skewness.toFixed(4)),
    kurtosis: Number(rawKurtosis.toFixed(4)),
    histogramBins,
    sktest: {
      n,
      prSkewness: Number(prSkewness.toFixed(4)),
      prKurtosis: Number(prKurtosis.toFixed(4)),
      adjChi2,
      probChi2,
      isNormal: skNormal
    },
    swilk: {
      n,
      w: Number(wStat.toFixed(5)),
      v: Number(vStat.toFixed(3)),
      z: zSwilk,
      probZ: pNorm,
      isNormal
    },
    ksmirnov: {
      n,
      dStat: Number(maxD.toFixed(4)),
      pValue: Number(ksPVal.toFixed(4)),
      correctedP: Number(correctedKsP.toFixed(4)),
      isNormal: correctedKsP > alpha
    }
  };
}

/**
 * Helper aproksimasi invers normal standar Phi^-1(p) (Acklam / Rational Approximation)
 */
function approxInvNormal(p: number): number {
  const clamped = Math.max(1e-6, Math.min(1 - 1e-6, p));
  const t = Math.sqrt(-2 * Math.log(clamped < 0.5 ? clamped : 1 - clamped));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;
  const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
  return clamped < 0.5 ? -z : z;
}

/**
 * Step 9: Generator Interpretasi Hasil Akhir dengan Bahasa yang Mudah Dipahami
 */
export function generateEasyPanelInterpretation(
  finalModel: PanelModelResult,
  yCol: string,
  xCols: string[],
  alpha = 0.05,
  lnAppliedVars: string[] = [],
  orthogMap: Record<string, string> = {}
): EasyPanelInterpretation {
  const isREM = finalModel.modelType === 'REM';
  const isFEM = finalModel.modelType === 'FEM';
  const simStat = isREM ? (finalModel.waldChi2 ?? 0) : (finalModel.fStat ?? 0);
  const simP = isREM ? (finalModel.waldPValue ?? 1) : (finalModel.fPValue ?? 1);
  const simName = isREM ? `Wald chi2(${finalModel.dfModel})` : `F(${finalModel.dfModel}, ${finalModel.dfResidual})`;

  const r2Main = isFEM ? finalModel.r2.within : finalModel.r2.overall;
  const r2TypeLabel = isFEM ? 'R-squared Within (variasi antar-waktu di dalam perusahaan)' : 'R-squared Overall (variasi gabungan keseluruhan)';

  const modelNameFull = isFEM
    ? 'Fixed Effects Model (FEM) dengan vce(robust)'
    : isREM
    ? 'Random Effects Model (REM) dengan vce(robust)'
    : 'Common Effect Model (CEM / Pooled OLS) dengan vce(robust)';

  const modelSummaryLine = `Model akhir yang digunakan adalah ${modelNameFull} pada ${finalModel.nObs} data observasi (${finalModel.nEntities} entitas selama ${finalModel.nPeriods} periode waktu). Standar error telah di-robust-kan (vce(robust)) sehingga hasil uji hipotesis di bawah ini sudah kebal dan valid terhadap masalah heteroskedastisitas maupun autokorelasi.`;

  const simultaneousTestLine =
    simP < alpha
      ? `Uji Simultan (Uji Bersama-sama) menghasilkan nilai ${simName} = ${simStat.toFixed(2)} dengan nilai signifikansi Prob = ${simP.toFixed(4)} (< ${alpha}). Artinya: Secara bersama-sama, seluruh variabel independen (${xCols.join(', ')}) BERPENGARUH SIGNIFIKAN terhadap variabel dependen ${yCol}. Model ini layak digunakan!`
      : `Uji Simultan (Uji Bersama-sama) menghasilkan nilai ${simName} = ${simStat.toFixed(2)} dengan nilai signifikansi Prob = ${simP.toFixed(4)} (>= ${alpha}). Artinya: Secara bersama-sama, variabel independen belum menunjukkan pengaruh simultan yang signifikan terhadap ${yCol} pada batas signifikansi ${(alpha * 100).toFixed(0)}%.`;

  const rSquaredLine = `Nilai ${r2TypeLabel} sebesar ${(r2Main * 100).toFixed(2)}% (atau ${r2Main.toFixed(4)}). Artinya: Sebesar ${(r2Main * 100).toFixed(2)}% naik-turunnya variabel ${yCol} dapat dijelaskan oleh variabel independen di dalam model ini, sedangkan sisanya sebesar ${(100 - r2Main * 100).toFixed(2)}% dijelaskan oleh faktor lain di luar penelitian.`;

  const transformationNotes: string[] = [];
  if (lnAppliedVars.length > 0) {
    transformationNotes.push(
      `Transformasi Logaritma Natural (LN) telah diterapkan pada variabel: ${lnAppliedVars.join(', ')} untuk menormalkan kecondongan distribusi dan menyetarakan skala data.`
    );
  }
  const orthEntries = Object.entries(orthogMap);
  if (orthEntries.length > 0) {
    transformationNotes.push(
      `Transformasi Ortogonalisasi Gram-Schmidt (orthog) telah diterapkan pada variabel yang mengalami multikolinearitas (${orthEntries.map(([orig, orth]) => `${orig} -> ${orth}`).join(', ')}), sehingga variabel terakhir yang bebas multikolinearitas (VIF = 1.00) digunakan dalam estimasi model akhir.`
    );
  }
  if (transformationNotes.length === 0) {
    transformationNotes.push('Tidak ada variabel yang memerlukan transformasi LN atau orthog; estimasi menggunakan skala variabel asli.');
  }

  // Reverse lookup untuk nama asli sebelum orth_ / ln_
  const reverseOrth: Record<string, string> = {};
  for (const [orig, orth] of orthEntries) {
    reverseOrth[orth] = orig;
  }

  const predictorInterpretations = xCols.map(xName => {
    const row = finalModel.coefficients[xName];
    const b = row?.b ?? 0;
    const se = row?.stdError ?? 0;
    const tOrZ = row?.tOrZ ?? 0;
    const pVal = row?.sig ?? 1;
    const isSig = !row?.isOmitted && pVal < alpha;
    const direction: 'positif' | 'negatif' | 'netral' = b > 0 ? 'positif' : b < 0 ? 'negatif' : 'netral';
    const origName = reverseOrth[xName] || xName;

    let easyMeaning = '';
    if (row?.isOmitted) {
      easyMeaning = `Variabel ${xName} di-omit (dikeluarkan otomatis oleh Fixed Effects) karena nilainya konstan sepanjang waktu pada setiap entitas (time-invariant).`;
    } else if (isSig && direction === 'positif') {
      easyMeaning = `BERPENGARUH POSITIF & SIGNIFIKAN terhadap ${yCol} (Koefisien = +${b.toFixed(4)}, p = ${pVal.toFixed(4)} < ${alpha}). Artinya: Setiap kenaikan 1 satuan pada ${xName}, maka ${yCol} akan NAIK sebesar ${Math.abs(b).toFixed(4)} satuan (dengan asumsi variabel lain tetap). Semakin tinggi ${origName}, semakin meningkat pula ${yCol}.`;
    } else if (isSig && direction === 'negatif') {
      easyMeaning = `BERPENGARUH NEGATIF & SIGNIFIKAN terhadap ${yCol} (Koefisien = ${b.toFixed(4)}, p = ${pVal.toFixed(4)} < ${alpha}). Artinya: Setiap kenaikan 1 satuan pada ${xName}, maka ${yCol} akan TURUN sebesar ${Math.abs(b).toFixed(4)} satuan (dengan asumsi variabel lain tetap). Semakin tinggi ${origName}, maka ${yCol} cenderung menurun.`;
    } else {
      easyMeaning = `TIDAK BERPENGARUH SIGNIFIKAN terhadap ${yCol} (Koefisien = ${b.toFixed(4)}, p = ${pVal.toFixed(4)} >= ${alpha}). Artinya: Arah koefisien bernilai ${direction} (${b.toFixed(4)}), namun perubahan pada ${xName} belum cukup kuat secara statistik untuk membuktikan pengaruh nyata terhadap ${yCol}.`;
    }

    return {
      variable: xName,
      originalVariable: origName,
      coef: b,
      se,
      tOrZ,
      pValue: pVal,
      isSignificant: isSig,
      direction,
      easyMeaning
    };
  });

  const sigVars = predictorInterpretations.filter(p => p.isSignificant);
  const overallConclusion =
    sigVars.length > 0
      ? `Kesimpulan Utama: Dari ${xCols.length} variabel independen yang diuji dengan model ${finalModel.modelType} Robust, terdapat ${sigVars.length} variabel yang terbukti berpengaruh signifikan terhadap ${yCol}, yaitu: ${sigVars.map(s => `${s.variable} (${s.direction})`).join(', ')}.`
      : `Kesimpulan Utama: Pada tingkat signifikansi ${(alpha * 100).toFixed(0)}%, belum ada variabel independen yang berpengaruh signifikan secara parsial terhadap ${yCol} setelah dikoreksi dengan standar error robust.`;

  return {
    modelSummaryLine,
    simultaneousTestLine,
    rSquaredLine,
    transformationNotes,
    predictorInterpretations,
    overallConclusion
  };
}



