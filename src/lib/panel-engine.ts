// ============================================================
// Panel Data Regression Engine (Gaya Stata)
// Common Effect (CEM), Fixed Effects (FEM), Random Effects (REM)
// ============================================================

import {
  PanelFitInput,
  PanelModelResult,
  PanelDeclarationResult,
  PanelCoefficientRow,
  PanelModelType
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
  const invXTX = matInverse(XTX);
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
    isRobust: false
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

  // 4. OLS pada data terpusat (Within Regression tanpa konstanta)
  const XT = matTranspose(X_tilde);
  const XTX = matMul(XT, X_tilde);
  const invXTX = matInverse(XTX);
  const XTY = matMul(XT, y_tilde);
  const betaMat = matMul(invXTX, XTY);
  const beta = betaMat.map(row => row[0]);

  // 5. Hitung residu within dan derajat bebas Stata
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

  const dfResidual = N - nEntities - K; // 200 - 10 - 2 = 188
  const sigma_e2 = sseWithin / dfResidual;
  const sigma_e = Math.sqrt(sigma_e2);

  // 6. Konstanta Stata: cons = grandMeanY - sum(beta_k * grandMeanX_k)
  let beta0 = grandMeanY;
  for (let k = 0; k < K; k++) {
    beta0 -= beta[k] * grandMeanX[k];
  }

  // Varians konsisten Stata untuk _cons: sigma_e^2 / N + X_bar' * V_beta * X_bar
  const V_beta = invXTX.map(row => row.map(val => val * sigma_e2));
  let xBarVxBar = 0;
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      xBarVxBar += grandMeanX[i] * V_beta[i][j] * grandMeanX[j];
    }
  }
  const varCons = sigma_e2 / N + xBarVxBar;
  const seCons = Math.sqrt(Math.max(0, varCons));

  // 7. Estimasi komponen varians FEM sigma_u (Gaya Stata xtreg, fe)
  // Di Stata, sigma_u adalah deviasi standar sampel dari efek tetap entitas alpha_i terhadap intersep rata-rata
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

  // 8. R-squared (Within, Between, Overall)
  // R2 within: korelasi kuadrat antara y_tilde dan yPredWithin
  let ssDemeanedY = 0;
  for (let i = 0; i < N; i++) {
    ssDemeanedY += Math.pow(y_tilde[i][0], 2);
  }
  const r2Within = ssDemeanedY > 0 ? 1 - sseWithin / ssDemeanedY : 0;

  // R2 between: korelasi kuadrat antara y_between dan pred_between
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

  // R2 overall: korelasi kuadrat antara y asli dan prediksi model
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

  // Model F-test: F(K, dfResidual)
  const fStat = (r2Within / K) / ((1 - r2Within) / dfResidual);
  const fPVal = fPValue(fStat, K, dfResidual);

  // Chow F-test (Uji F bahwa semua u_i = 0)
  // Membandingkan dengan SSE dari Pooled OLS
  const cemModel = fitPanelCEM(input);
  const ssePooled = Math.pow(cemModel.sigma_e, 2) * cemModel.dfResidual;
  const dfChowNum = nEntities - 1;
  const chowFStat = ((ssePooled - sseWithin) / dfChowNum) / (sseWithin / dfResidual);
  const chowPVal = fPValue(chowFStat, dfChowNum, dfResidual);

  // 9. Koefisien
  const coefficients: Record<string, PanelCoefficientRow> = {};
  for (let k = 0; k < K; k++) {
    const b = beta[k];
    const se = Math.sqrt(Math.max(0, V_beta[k][k]));
    const t = se === 0 ? 0 : b / se;
    const p = tPValue(t, dfResidual);
    const zCrit = 1.95996;
    coefficients[xCols[k]] = {
      variable: xCols[k],
      b,
      stdError: se,
      tOrZ: t,
      statType: 't',
      sig: p,
      ciLower: b - zCrit * se,
      ciUpper: b + zCrit * se
    };
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
    ciUpper: beta0 + 1.95996 * seCons
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
    dfModel: K,
    dfResidual,
    nEntities,
    nPeriods,
    nObs: N,
    isRobust: false,
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
  const XBinv = matInverse(matMul(XBT, X_between));
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
  const invXTX = matInverse(XTX);
  const XTY = matMul(XT, y_star);
  const betaMat = matMul(invXTX, XTY);
  const beta = betaMat.map(row => row[0]);

  // Stata GLS Covariance matrix: V = sigma_e^2 * (X*'X*)^(-1)
  const V_beta = invXTX.map(row => row.map(val => val * sigma_e2));

  // 5. Wald Chi-Square untuk uji simultan slope: beta_slope' * V_slope^(-1) * beta_slope
  const betaSlope = beta.slice(0, K);
  const VSlope = V_beta.slice(0, K).map(r => r.slice(0, K));
  const invVSlope = matInverse(VSlope);

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
    isRobust: false
  };
}

// ============================================================
// Model Selection Diagnostics (Chow, Hausman, Mundlak, LM)
// ============================================================

/**
 * Uji Chow (F-Test) membandingkan Pooled OLS (CEM) vs Fixed Effects (FEM)
 */
export function testChow(
  cem: PanelModelResult,
  fem: PanelModelResult,
  alpha = 0.05
): { stat: number; df1: number; df2: number; p: number; preferred: 'CEM' | 'FEM' } {
  const ssePooled = Math.pow(cem.sigma_e, 2) * cem.dfResidual;
  const sseWithin = Math.pow(fem.sigma_e, 2) * fem.dfResidual;
  const df1 = fem.nEntities - 1;
  const df2 = fem.dfResidual;

  const fStat = ((ssePooled - sseWithin) / df1) / (sseWithin / df2);
  const p = fPValue(fStat, df1, df2);
  const preferred = p < alpha ? 'FEM' : 'CEM';

  return {
    stat: Number(fStat.toFixed(2)),
    df1,
    df2,
    p,
    preferred
  };
}

/**
 * Uji Hausman Klasik membandingkan Fixed Effects (FEM) vs Random Effects (REM)
 */
export function testHausman(
  fem: PanelModelResult,
  rem: PanelModelResult,
  input?: PanelFitInput,
  alpha = 0.05
): { chi2: number; df: number; p: number; preferred: 'FEM' | 'REM'; isNegativeChi2: boolean } {
  const slopeVars = Object.keys(fem.coefficients).filter(v => v !== '_cons');
  const K = slopeVars.length;

  const dBeta: number[] = [];
  for (let i = 0; i < K; i++) {
    const varName = slopeVars[i];
    dBeta.push(fem.coefficients[varName].b - rem.coefficients[varName].b);
  }

  let V_diff: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  let isNegativeChi2 = false;

  if (input && typeof input === 'object' && Array.isArray((input as any).rows)) {
    const { rows, idCol, xCols } = input;
    const N = rows.length;

    // Entity means
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
        for (let k = 0; k < K; k++) sumX[k] += Number(r[xCols[k]]);
      }
      entityMeans.set(id, sumX.map(v => v / count));
    }

    // Demeaned X_tilde
    const X_tilde = rows.map(r => {
      const em = entityMeans.get(r[idCol])!;
      return xCols.map((c, k) => Number(r[c]) - em[k]);
    });
    const invXTX_fe = matInverse(matMul(matTranspose(X_tilde), X_tilde));
    const sigma_e2 = Math.pow(fem.sigma_e, 2);
    const V_FE = invXTX_fe.map(r => r.map(v => v * sigma_e2));

    // Quasi-demeaned X_star
    const theta = rem.theta || 0.8614;
    const X_star = rows.map(r => {
      const em = entityMeans.get(r[idCol])!;
      const rowX = xCols.map((c, k) => Number(r[c]) - theta * em[k]);
      return [...rowX, 1 - theta];
    });
    const invXTX_re = matInverse(matMul(matTranspose(X_star), X_star));
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
      const se_re = rem.coefficients[varName].stdError;
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
      const invV = matInverse(V_diff);
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

  return {
    chi2: Number(chi2.toFixed(2)),
    df: K,
    p,
    preferred,
    isNegativeChi2
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

  // 1. Hitung entity means untuk prediktor
  const entityMap = new Map<any, Record<string, any>[]>();
  for (const row of rows) {
    const id = row[idCol];
    if (!entityMap.has(id)) entityMap.set(id, []);
    entityMap.get(id)!.push(row);
  }

  const entityMeans = new Map<any, number[]>();
  for (const [id, eRows] of entityMap.entries()) {
    const count = eRows.length;
    const sumX = new Array(K).fill(0);
    for (const r of eRows) {
      for (let k = 0; k < K; k++) sumX[k] += Number(r[xCols[k]]);
    }
    entityMeans.set(id, sumX.map(v => v / count));
  }

  // 2. Bentuk matriks X_mundlak: [X_1, ..., X_K, Xbar_1, ..., Xbar_K, 1]
  const X_m: number[][] = rows.map(r => {
    const id = r[idCol];
    const em = entityMeans.get(id)!;
    const rowX = xCols.map(c => Number(r[c]));
    return [...rowX, ...em, 1];
  });
  const y_m: number[][] = rows.map(r => [Number(r[yCol])]);

  // 3. Estimasi OLS auxiliary
  const XT = matTranspose(X_m);
  const invXTX = matInverse(matMul(XT, X_m));
  const beta = matMul(invXTX, matMul(XT, y_m)).map(r => r[0]);

  let sse = 0;
  for (let i = 0; i < N; i++) {
    let p = 0;
    for (let j = 0; j < 2 * K + 1; j++) p += X_m[i][j] * beta[j];
    sse += Math.pow(y_m[i][0] - p, 2);
  }
  const s2 = sse / (N - (2 * K + 1));

  // 4. Submatriks kovarians gamma (koefisien entity means)
  const gamma = beta.slice(K, 2 * K);
  const V_gamma: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      V_gamma[i][j] = invXTX[K + i][K + j] * s2;
    }
  }

  const invV_gamma = matInverse(V_gamma);
  let waldChi2 = 0;
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      waldChi2 += gamma[i] * invV_gamma[i][j] * gamma[j];
    }
  }

  const p = chiSquarePValue(waldChi2, K);
  const preferred = p < alpha ? 'FEM' : 'REM';

  return {
    waldChi2: Number(waldChi2.toFixed(2)),
    df: K,
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
  const beta = matMul(matInverse(matMul(XT, X)), matMul(XT, y)).map(r => r[0]);

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
 * Uji Multikolinearitas Panel (VIF & Tolerance)
 * Gaya Stata: `estat vif`
 */
export function testPanelVIF(input: PanelFitInput): {
  meanVif: number;
  variables: Record<string, { vif: number; tolerance: number }>;
} {
  const { rows, xCols } = input;
  const K = xCols.length;

  if (K <= 1) {
    const singleVar = xCols[0] || 'x';
    return {
      meanVif: 1.0,
      variables: {
        [singleVar]: { vif: 1.0, tolerance: 1.0 }
      }
    };
  }

  const variables: Record<string, { vif: number; tolerance: number }> = {};
  let sumVif = 0;

  for (let j = 0; j < K; j++) {
    const targetCol = xCols[j];
    const otherCols = xCols.filter((_, idx) => idx !== j);

    // Target y_j
    const y_j: number[][] = rows.map(r => [Number(r[targetCol])]);
    // Regressors: other X cols + constant 1
    const X_j: number[][] = rows.map(r => [...otherCols.map(c => Number(r[c])), 1]);

    const XT = matTranspose(X_j);
    const XTX = matMul(XT, X_j);
    const iXTX = matInverse(XTX);
    const beta = matMul(iXTX, matMul(XT, y_j)).map(r => r[0]);

    // R^2 calculation
    const N = rows.length;
    let ssRes = 0;
    let ySum = 0;
    for (let i = 0; i < N; i++) {
      const actual = y_j[i][0];
      ySum += actual;
      let pred = 0;
      for (let p = 0; p < otherCols.length; p++) {
        pred += X_j[i][p] * beta[p];
      }
      pred += beta[otherCols.length]; // constant
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

  if (dRows.length < K + 2) {
    return {
      df1: 1,
      df2: 0,
      f: 0,
      p: 1.0,
      hasAutocorrelation: false,
      skippedReason: 'Jumlah observasi selisih pertama tidak mencukupi untuk regresi.'
    };
  }

  // Regresi OLS nocons: dY pada dX
  const dX_mat: number[][] = dRows.map(r => r.dX);
  const dY_mat: number[][] = dRows.map(r => [r.dY]);
  const dXT = matTranspose(dX_mat);
  const beta_d = matMul(matInverse(matMul(dXT, dX_mat)), matMul(dXT, dY_mat)).map(r => r[0]);

  // Residu tahap 1: res_it = dY_it - sum(beta_k * dX_kit)
  const resByEntity = new Map<any, { year: number; res: number }[]>();
  for (let i = 0; i < dRows.length; i++) {
    const r = dRows[i];
    let fit = 0;
    for (let j = 0; j < K; j++) fit += r.dX[j] * beta_d[j];
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
    paramNames = [...xCols];
    for (const [id, obsList] of entityObs) {
      const Ti = obsList.length;
      const yMean = obsList.reduce((acc, o) => acc + o.y, 0) / Ti;
      const xMean = xCols.map((_, j) => obsList.reduce((acc, o) => acc + o.x[j], 0) / Ti);
      for (const o of obsList) {
        Ystar.push([o.y - yMean]);
        Xstar.push(o.x.map((val, j) => val - xMean[j]));
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
  const bread = matInverse(matMul(XT, Xstar));

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
    coefficients: newCoeffs,
    clusterBiasWarning
  };
}



