// ============================================================
// Moderated Regression Analysis (MRA) & Advanced Moderation Engine
// Points 07 & 08: Hierarchical 3-Model MRA, Mean Centering,
// SPSS Change Statistics (R2 Change, F Change, Sig F Change),
// Simple Slope Analysis (-1 SD, Mean, +1 SD), Johnson-Neyman
// Floodlight Technique, & Sharma et al. Moderator Classification
// ============================================================

import {
  matMul,
  matTranspose,
  matInverse,
  sampleStdDev,
  tPValue,
  tCriticalValue,
  fPValue,
  runStatisticalRegression,
  OLSFitResult
} from './regression-engine';

export type ModeratorClassificationType =
  | 'Pure Moderator (Moderasi Murni)'
  | 'Quasi Moderator (Moderasi Semu)'
  | 'Predictor Moderasi (Variabel Independen / Anteseden)'
  | 'Homologizer Moderator (Moderasi Potensial / Homologiser)';

export interface HierarchicalModelStep {
  modelNumber: 1 | 2 | 3;
  modelName: string;
  formula: string;
  fit: OLSFitResult;
  changeStats: {
    rSquaredChange: number;
    fChange: number;
    df1: number;
    df2: number;
    sigFChange: number;
  };
}

export interface SimpleSlopeItem {
  levelLabel: string;
  zCentered: number;
  zRaw: number;
  slope: number;
  stdError: number;
  tStat: number;
  pValue: number;
  ciLower: number;
  ciUpper: number;
  isSignificant: boolean;
  linePoints: {
    xLabel: string;
    xRaw: number;
    yPredicted: number;
  }[];
}

export interface JohnsonNeymanResult {
  hasRealRoots: boolean;
  criticalValuesCentered: number[];
  criticalValuesRaw: number[];
  regionsDescription: string;
  percentBelowLower?: number;
  percentBetween?: number;
  percentAboveUpper?: number;
  percentSignificantTotal: number;
  floodlightCurve: {
    zCentered: number;
    zRaw: number;
    slope: number;
    stdError: number;
    ciLower: number;
    ciUpper: number;
    isSignificant: boolean;
  }[];
}

export interface MRAInput {
  rows: Record<string, any>[];
  yCol: string;
  xCol: string;
  zCol: string; // Moderator variable
  covariateCols?: string[];
  centerVariables?: boolean; // Default true (Mean Centering)
  isModeratorCategorical?: boolean;
  categoricalCoding?: 'dummy' | 'contrast'; // 0/1 vs -0.5/+0.5
  alpha?: number;
  ciLevel?: number;
}

export interface MRAResult {
  yCol: string;
  xCol: string;
  zCol: string;
  interactionCol: string;
  covariateCols: string[];
  nUsed: number;
  centerVariables: boolean;
  isModeratorCategorical: boolean;
  categoricalCoding?: 'dummy' | 'contrast';
  alpha: number;
  ciLevel: number;
  means: {
    meanX: number;
    sdX: number;
    meanZ: number;
    sdZ: number;
    meanY: number;
    sdY: number;
  };
  models: {
    model1: HierarchicalModelStep;
    model2: HierarchicalModelStep;
    model3: HierarchicalModelStep;
  };
  interactionEffect: {
    b3: number;
    stdError: number;
    beta: number;
    tStat: number;
    pValue: number;
    ciLower: number;
    ciUpper: number;
    rSquaredChange: number;
    fChange: number;
    sigFChange: number;
    isSignificant: boolean;
  };
  moderatorClassification: {
    type: ModeratorClassificationType;
    b2MainEffectZ: number;
    p2MainEffectZ: number;
    b3InteractionXZ: number;
    p3InteractionXZ: number;
    homologizerSubgroupR2Diff?: number;
    rationale: string;
  };
  simpleSlopes: SimpleSlopeItem[];
  johnsonNeyman: JohnsonNeymanResult;
  academicInterpretation: string[];
}

/**
 * Jalankan Moderated Regression Analysis (MRA) Hierarkis 3 Model + Simple Slopes + Johnson-Neyman
 */
export function runModeratedRegressionAnalysis(input: MRAInput): MRAResult {
  const {
    rows,
    yCol,
    xCol,
    zCol,
    covariateCols = [],
    centerVariables = true,
    isModeratorCategorical = false,
    categoricalCoding = 'dummy',
    alpha = 0.05,
    ciLevel = 0.95
  } = input;

  const reqCols = [yCol, xCol, zCol, ...covariateCols];
  const validRows = rows.filter(r =>
    reqCols.every(c => {
      const v = r[c];
      if (v === null || v === undefined || v === '') return false;
      if (c === zCol && isModeratorCategorical) return true;
      return !isNaN(Number(v)) && isFinite(Number(v));
    })
  );

  const n = validRows.length;
  if (n < 6 + covariateCols.length) {
    throw new Error(`Ukuran sampel valid (n=${n}) terlalu kecil untuk Moderated Regression Analysis.`);
  }

  const rawY = validRows.map(r => Number(r[yCol]));
  const rawX = validRows.map(r => Number(r[xCol]));

  let rawZ: number[] = [];
  if (isModeratorCategorical) {
    const uniqueCats = Array.from(new Set(validRows.map(r => String(r[zCol]).trim()))).sort();
    const highCat = uniqueCats.length > 1 ? uniqueCats[1] : uniqueCats[0];
    rawZ = validRows.map(r => {
      const isHigh = String(r[zCol]).trim() === highCat;
      if (categoricalCoding === 'contrast') {
        return isHigh ? 0.5 : -0.5;
      }
      return isHigh ? 1.0 : 0.0;
    });
  } else {
    rawZ = validRows.map(r => Number(r[zCol]));
  }

  const meanY = rawY.reduce((a, b) => a + b, 0) / n;
  const sdY = sampleStdDev(rawY, meanY);
  const meanX = rawX.reduce((a, b) => a + b, 0) / n;
  const sdX = sampleStdDev(rawX, meanX);
  const meanZ = rawZ.reduce((a, b) => a + b, 0) / n;
  const sdZ = sampleStdDev(rawZ, meanZ);

  const xUsedName = centerVariables ? `${xCol}_c` : xCol;
  const zUsedName = centerVariables && !isModeratorCategorical ? `${zCol}_c` : zCol;
  const xzName = `${xCol}_x_${zCol}`;

  const preparedRows = validRows.map((r, i) => {
    const xc = centerVariables ? rawX[i] - meanX : rawX[i];
    const zc = centerVariables && !isModeratorCategorical ? rawZ[i] - meanZ : rawZ[i];
    const nextRow: Record<string, any> = {
      ...r,
      [yCol]: rawY[i],
      [xUsedName]: xc,
      [zUsedName]: zc,
      [xzName]: xc * zc
    };
    return nextRow;
  });

  // Model 1: Y = b0 + b1*X (+ Covariates)
  const m1Cols = [xUsedName, ...covariateCols];
  const fit1 = runStatisticalRegression({
    rows: preparedRows,
    yCol,
    xCols: m1Cols,
    alpha,
    ciLevel
  });

  // Model 2: Y = b0 + b1*X + b2*Z (+ Covariates)
  const m2Cols = [xUsedName, zUsedName, ...covariateCols];
  const fit2 = runStatisticalRegression({
    rows: preparedRows,
    yCol,
    xCols: m2Cols,
    alpha,
    ciLevel
  });

  // Model 3 (Full MRA): Y = b0 + b1*X + b2*Z + b3*(X*Z) (+ Covariates)
  const m3Cols = [xUsedName, zUsedName, xzName, ...covariateCols];
  const fit3 = runStatisticalRegression({
    rows: preparedRows,
    yCol,
    xCols: m3Cols,
    alpha,
    ciLevel
  });

  // Hierarchical Change Statistics
  const r2_1 = fit1.modelSummary.rSquared;
  const df1_1 = fit1.anova.regression.df;
  const df2_1 = fit1.anova.residual.df;
  const fChange1 = fit1.anova.regression.f;
  const sigFChange1 = fit1.anova.regression.sig;

  const r2_2 = fit2.modelSummary.rSquared;
  const deltaR2_2 = Math.max(0, r2_2 - r2_1);
  const df1_2 = 1;
  const df2_2 = fit2.anova.residual.df;
  const fChange2 = (1 - r2_2) > 1e-12 ? (deltaR2_2 / df1_2) / ((1 - r2_2) / df2_2) : 0;
  const sigFChange2 = fPValue(fChange2, df1_2, df2_2);

  const r2_3 = fit3.modelSummary.rSquared;
  const deltaR2_3 = Math.max(0, r2_3 - r2_2);
  const df1_3 = 1;
  const df2_3 = fit3.anova.residual.df;
  const fChange3 = (1 - r2_3) > 1e-12 ? (deltaR2_3 / df1_3) / ((1 - r2_3) / df2_3) : 0;
  const sigFChange3 = fPValue(fChange3, df1_3, df2_3);

  const model1Step: HierarchicalModelStep = {
    modelNumber: 1,
    modelName: 'Model 1 (Main Effect X)',
    formula: `${yCol} = b0 + b1(${xUsedName})${covariateCols.length ? ' + Covariates' : ''}`,
    fit: { ...fit1, modelSummary: { ...fit1.modelSummary, model: 1 } },
    changeStats: {
      rSquaredChange: Number(r2_1.toFixed(6)),
      fChange: Number(fChange1.toFixed(4)),
      df1: df1_1,
      df2: df2_1,
      sigFChange: Number(sigFChange1.toFixed(4))
    }
  };

  const model2Step: HierarchicalModelStep = {
    modelNumber: 2,
    modelName: 'Model 2 (Main Effects X & Z)',
    formula: `${yCol} = b0 + b1(${xUsedName}) + b2(${zUsedName})${covariateCols.length ? ' + Covariates' : ''}`,
    fit: { ...fit2, modelSummary: { ...fit2.modelSummary, model: 2 } },
    changeStats: {
      rSquaredChange: Number(deltaR2_2.toFixed(6)),
      fChange: Number(fChange2.toFixed(4)),
      df1: df1_2,
      df2: df2_2,
      sigFChange: Number(sigFChange2.toFixed(4))
    }
  };

  const model3Step: HierarchicalModelStep = {
    modelNumber: 3,
    modelName: 'Model 3 (Full Interaction MRA)',
    formula: `${yCol} = b0 + b1(${xUsedName}) + b2(${zUsedName}) + b3(${xzName})${covariateCols.length ? ' + Covariates' : ''}`,
    fit: { ...fit3, modelSummary: { ...fit3.modelSummary, model: 3 } },
    changeStats: {
      rSquaredChange: Number(deltaR2_3.toFixed(6)),
      fChange: Number(fChange3.toFixed(4)),
      df1: df1_3,
      df2: df2_3,
      sigFChange: Number(sigFChange3.toFixed(4))
    }
  };

  // Extract Full Covariance Matrix of Model 3 for Exact Conditional SE & Johnson-Neyman
  // Columns of Xmat3: [1, X_used, Z_used, XZ, ...covariates]
  const Xmat3 = preparedRows.map(r => [
    1.0,
    Number(r[xUsedName]),
    Number(r[zUsedName]),
    Number(r[xzName]),
    ...covariateCols.map(c => Number(r[c]))
  ]);
  const XT3 = matTranspose(Xmat3);
  const invXTX3 = matInverse(matMul(XT3, Xmat3));
  const mse3 = fit3.anova.residual.ms;
  const cov3 = invXTX3.map(row => row.map(v => v * mse3));

  const b0 = fit3.coefficients[0].b;
  const b1Row = fit3.coefficients[1];
  const b2Row = fit3.coefficients[2];
  const b3Row = fit3.coefficients[3];

  const b1 = b1Row.b;
  const b2 = b2Row.b;
  const b3 = b3Row.b;

  const varB1 = Math.max(1e-14, cov3[1][1]);
  const varB3 = Math.max(1e-14, cov3[3][3]);
  const covB1B3 = cov3[1][3];

  const dfRes3 = fit3.anova.residual.df;
  const tCrit = tCriticalValue(dfRes3, 1 - ciLevel);

  // ============================================================
  // Point 08A: Simple Slope Analysis (-1 SD, Mean, +1 SD)
  // ============================================================
  const zLevels: { label: string; zVal: number; zRawVal: number }[] = isModeratorCategorical
    ? (categoricalCoding === 'contrast'
        ? [
            { label: 'Kategori Rendah / Acuan (-0.5)', zVal: -0.5, zRawVal: -0.5 },
            { label: 'Kategori Tinggi / Pembanding (+0.5)', zVal: 0.5, zRawVal: 0.5 }
          ]
        : [
            { label: 'Kategori 0 (Kelompok Acuan)', zVal: 0.0, zRawVal: 0.0 },
            { label: 'Kategori 1 (Kelompok Pembanding)', zVal: 1.0, zRawVal: 1.0 }
          ])
    : (centerVariables
        ? [
            { label: 'Rendah (-1 SD)', zVal: -sdZ, zRawVal: meanZ - sdZ },
            { label: 'Rata-rata (Mean)', zVal: 0.0, zRawVal: meanZ },
            { label: 'Tinggi (+1 SD)', zVal: sdZ, zRawVal: meanZ + sdZ }
          ]
        : [
            { label: 'Rendah (-1 SD)', zVal: meanZ - sdZ, zRawVal: meanZ - sdZ },
            { label: 'Rata-rata (Mean)', zVal: meanZ, zRawVal: meanZ },
            { label: 'Tinggi (+1 SD)', zVal: meanZ + sdZ, zRawVal: meanZ + sdZ }
          ]);

  const xPlotLevels = centerVariables
    ? [
        { xLabel: 'Rendah (-1 SD)', xUsed: -sdX, xRaw: meanX - sdX },
        { xLabel: 'Rata-rata (Mean)', xUsed: 0.0, xRaw: meanX },
        { xLabel: 'Tinggi (+1 SD)', xUsed: sdX, xRaw: meanX + sdX }
      ]
    : [
        { xLabel: 'Rendah (-1 SD)', xUsed: meanX - sdX, xRaw: meanX - sdX },
        { xLabel: 'Rata-rata (Mean)', xUsed: meanX, xRaw: meanX },
        { xLabel: 'Tinggi (+1 SD)', xUsed: meanX + sdX, xRaw: meanX + sdX }
      ];

  const simpleSlopes: SimpleSlopeItem[] = zLevels.map(lvl => {
    const z = lvl.zVal;
    const slope = b1 + b3 * z;
    const se = Math.sqrt(Math.max(1e-14, varB1 + z * z * varB3 + 2 * z * covB1B3));
    const tStat = slope / se;
    const pVal = tPValue(tStat, dfRes3);
    const ciLow = slope - tCrit * se;
    const ciHigh = slope + tCrit * se;

    const linePoints = xPlotLevels.map(xp => ({
      xLabel: xp.xLabel,
      xRaw: Number(xp.xRaw.toFixed(4)),
      yPredicted: Number((b0 + b1 * xp.xUsed + b2 * z + b3 * xp.xUsed * z).toFixed(4))
    }));

    return {
      levelLabel: lvl.label,
      zCentered: Number(z.toFixed(4)),
      zRaw: Number(lvl.zRawVal.toFixed(4)),
      slope: Number(slope.toFixed(4)),
      stdError: Number(se.toFixed(4)),
      tStat: Number(tStat.toFixed(4)),
      pValue: Number(pVal.toFixed(4)),
      ciLower: Number(ciLow.toFixed(4)),
      ciUpper: Number(ciHigh.toFixed(4)),
      isSignificant: pVal <= alpha,
      linePoints
    };
  });

  // ============================================================
  // Point 08B: Johnson-Neyman Floodlight Analysis
  // Quadratic boundary: (b1 + b3*z)^2 = tCrit^2 * (varB1 + 2*z*covB1B3 + z^2*varB3)
  // => A*z^2 + B*z + C = 0
  // ============================================================
  const tCritSq = tCrit * tCrit;
  const quadA = b3 * b3 - tCritSq * varB3;
  const quadB = 2 * b1 * b3 - 2 * tCritSq * covB1B3;
  const quadC = b1 * b1 - tCritSq * varB1;
  const discriminant = quadB * quadB - 4 * quadA * quadC;

  const criticalValuesCentered: number[] = [];
  const criticalValuesRaw: number[] = [];
  let hasRealRoots = false;

  if (Math.abs(quadA) > 1e-14 && discriminant >= 0) {
    hasRealRoots = true;
    const sqrtD = Math.sqrt(discriminant);
    const r1 = (-quadB - sqrtD) / (2 * quadA);
    const r2 = (-quadB + sqrtD) / (2 * quadA);
    const sortedRoots = [r1, r2].sort((a, b) => a - b);
    sortedRoots.forEach(r => {
      criticalValuesCentered.push(Number(r.toFixed(4)));
      const rawRoot = centerVariables && !isModeratorCategorical ? r + meanZ : r;
      criticalValuesRaw.push(Number(rawRoot.toFixed(4)));
    });
  }

  // Generate 41-point floodlight curve across observed Z range
  const zObsUsed = preparedRows.map(r => Number(r[zUsedName]));
  const minZUsed = Math.min(...zObsUsed, -2 * sdZ);
  const maxZUsed = Math.max(...zObsUsed, 2 * sdZ);
  const stepZ = (maxZUsed - minZUsed) / 40 || 0.1;
  const floodlightCurve: JohnsonNeymanResult['floodlightCurve'] = [];

  for (let idx = 0; idx <= 40; idx++) {
    const zVal = minZUsed + idx * stepZ;
    const zRawVal = centerVariables && !isModeratorCategorical ? zVal + meanZ : zVal;
    const slp = b1 + b3 * zVal;
    const seVal = Math.sqrt(Math.max(1e-14, varB1 + zVal * zVal * varB3 + 2 * zVal * covB1B3));
    const tVal = slp / seVal;
    const pVal = tPValue(tVal, dfRes3);
    floodlightCurve.push({
      zCentered: Number(zVal.toFixed(4)),
      zRaw: Number(zRawVal.toFixed(4)),
      slope: Number(slp.toFixed(4)),
      stdError: Number(seVal.toFixed(4)),
      ciLower: Number((slp - tCrit * seVal).toFixed(4)),
      ciUpper: Number((slp + tCrit * seVal).toFixed(4)),
      isSignificant: pVal <= alpha
    });
  }

  // Count how many observed Z values fall in significant region
  let sigObsCount = 0;
  for (const zObs of zObsUsed) {
    const slp = b1 + b3 * zObs;
    const seVal = Math.sqrt(Math.max(1e-14, varB1 + zObs * zObs * varB3 + 2 * zObs * covB1B3));
    if (tPValue(slp / seVal, dfRes3) <= alpha) {
      sigObsCount++;
    }
  }
  const percentSignificantTotal = Number(((sigObsCount / n) * 100).toFixed(2));

  let regionsDescription = '';
  if (hasRealRoots && criticalValuesRaw.length === 2) {
    regionsDescription = `Titik kritis Johnson-Neyman pada skala asli ${zCol} berada pada Z_1 = ${criticalValuesRaw[0].toFixed(3)} dan Z_2 = ${criticalValuesRaw[1].toFixed(3)} (${percentSignificantTotal}% sampel berada pada wilayah pengaruh signifikan p <= ${alpha}).`;
  } else if (percentSignificantTotal === 100) {
    regionsDescription = `Pengaruh ${xCol} terhadap ${yCol} signifikan secara statistik pada seluruh rentang nilai moderator ${zCol} (100% sampel signifikan).`;
  } else {
    regionsDescription = `Tidak ditemukan batas transisi nyata Johnson-Neyman pada rentang data (${percentSignificantTotal}% sampel berada pada wilayah signifikan).`;
  }

  // ============================================================
  // Point 08C: Sharma, Durand, & Gur-Arie (1981) Moderator Classification
  // ============================================================
  const p2 = b2Row.sig;
  const p3 = b3Row.sig;
  let modType: ModeratorClassificationType;
  let modRationale = '';
  let homologizerSubgroupR2Diff: number | undefined;

  if (p3 <= alpha && p2 > alpha) {
    modType = 'Pure Moderator (Moderasi Murni)';
    modRationale = `Koefisien interaksi ${xzName} signifikan (b3 = ${b3.toFixed(4)}, p = ${p3.toFixed(4)} <= ${alpha}), sedangkan efek utama moderator ${zCol} tidak signifikan (b2 = ${b2.toFixed(4)}, p = ${p2.toFixed(4)} > ${alpha}). Variabel ${zCol} murni memodifikasi kekuatan/arah pengaruh ${xCol} terhadap ${yCol} tanpa menjadi prediktor langsung.`;
  } else if (p3 <= alpha && p2 <= alpha) {
    modType = 'Quasi Moderator (Moderasi Semu)';
    modRationale = `Baik koefisien interaksi ${xzName} (b3 = ${b3.toFixed(4)}, p = ${p3.toFixed(4)} <= ${alpha}) maupun efek utama moderator ${zCol} (b2 = ${b2.toFixed(4)}, p = ${p2.toFixed(4)} <= ${alpha}) keduanya signifikan. Variabel ${zCol} berinteraksi dengan ${xCol} sekaligus berfungsi sebagai prediktor langsung terhadap ${yCol}.`;
  } else if (p3 > alpha && p2 <= alpha) {
    modType = 'Predictor Moderasi (Variabel Independen / Anteseden)';
    modRationale = `Koefisien interaksi ${xzName} tidak signifikan (b3 = ${b3.toFixed(4)}, p = ${p3.toFixed(4)} > ${alpha}), namun efek utama ${zCol} signifikan (b2 = ${b2.toFixed(4)}, p = ${p2.toFixed(4)} <= ${alpha}). Variabel ${zCol} tidak memoderasi hubungan ${xCol} terhadap ${yCol}, melainkan berperan sebagai variabel independen/prediktor langsung.`;
  } else {
    modType = 'Homologizer Moderator (Moderasi Potensial / Homologiser)';
    // Median split subgroup R2 comparison (Sharma et al. 1981)
    const sortedZ = [...rawZ].sort((a, b) => a - b);
    const medZ = sortedZ[Math.floor(n / 2)];
    const lowSub = validRows.filter((_, idx) => rawZ[idx] <= medZ);
    const highSub = validRows.filter((_, idx) => rawZ[idx] > medZ);
    try {
      if (lowSub.length >= 4 && highSub.length >= 4) {
        const fLow = runStatisticalRegression({ rows: lowSub, yCol, xCols: [xCol], alpha });
        const fHigh = runStatisticalRegression({ rows: highSub, yCol, xCols: [xCol], alpha });
        homologizerSubgroupR2Diff = Number(Math.abs(fHigh.modelSummary.rSquared - fLow.modelSummary.rSquared).toFixed(4));
      }
    } catch {
      homologizerSubgroupR2Diff = 0;
    }
    modRationale = `Baik koefisien interaksi ${xzName} (b3 = ${b3.toFixed(4)}, p = ${p3.toFixed(4)} > ${alpha}) maupun efek utama ${zCol} (b2 = ${b2.toFixed(4)}, p = ${p2.toFixed(4)} > ${alpha}) tidak signifikan. Berdasarkan taksonomi Sharma et al. (1981), ${zCol} diklasifikasikan sebagai Homologizer Moderator (memengaruhi kekuatan hubungan melalui varians galat sub-kelompok${homologizerSubgroupR2Diff !== undefined ? `, selisih R² antar-subkelompok = ${homologizerSubgroupR2Diff}` : ''}).`;
  }

  const academicInterpretation: string[] = [
    `1. Spesifikasi Hierarkis MRA: Analisis Regresi Moderasi (MRA) dilakukan dalam 3 tahap hierarkis dengan N = ${n} observasi${centerVariables ? ' menggunakan pemusatan rata-rata (mean centering) untuk mereduksi multikolinearitas struktural' : ''}.`,
    `2. Perubahan Koefisien Determinasi (Change Statistics): Penambahan suku interaksi (${xzName}) pada Model 3 meningkatkan R² dari ${(r2_2 * 100).toFixed(2)}% menjadi ${(r2_3 * 100).toFixed(2)}% (R² Change = ${deltaR2_3.toFixed(4)}, F Change(${df1_3}, ${df2_3}) = ${fChange3.toFixed(3)}, Sig. F Change = ${sigFChange3.toFixed(4)}).`,
    `3. Klasifikasi Moderator (Sharma et al., 1981): Variabel ${zCol} teridentifikasi sebagai "${modType}". ${modRationale}`,
    `4. Analisis Simple Slope: ${simpleSlopes.map(s => `Pada tingkat ${s.levelLabel} (Z = ${s.zRaw.toFixed(2)}), kemiringan pengaruh ${xCol} terhadap ${yCol} adalah b = ${s.slope.toFixed(4)} (t = ${s.tStat.toFixed(3)}, p = ${s.pValue.toFixed(4)}, ${s.isSignificant ? 'Signifikan' : 'Tidak Signifikan'})`).join('; ')}.`,
    `5. Wilayah Signifikansi Johnson-Neyman: ${regionsDescription}`
  ];

  return {
    yCol,
    xCol,
    zCol,
    interactionCol: xzName,
    covariateCols,
    nUsed: n,
    centerVariables,
    isModeratorCategorical,
    categoricalCoding: isModeratorCategorical ? categoricalCoding : undefined,
    alpha,
    ciLevel,
    means: {
      meanX: Number(meanX.toFixed(4)),
      sdX: Number(sdX.toFixed(4)),
      meanZ: Number(meanZ.toFixed(4)),
      sdZ: Number(sdZ.toFixed(4)),
      meanY: Number(meanY.toFixed(4)),
      sdY: Number(sdY.toFixed(4))
    },
    models: {
      model1: model1Step,
      model2: model2Step,
      model3: model3Step
    },
    interactionEffect: {
      b3: Number(b3.toFixed(6)),
      stdError: Number(b3Row.stdError.toFixed(6)),
      beta: Number(b3Row.beta.toFixed(6)),
      tStat: Number(b3Row.t.toFixed(4)),
      pValue: Number(p3.toFixed(4)),
      ciLower: Number(b3Row.ciLower.toFixed(6)),
      ciUpper: Number(b3Row.ciUpper.toFixed(6)),
      rSquaredChange: Number(deltaR2_3.toFixed(6)),
      fChange: Number(fChange3.toFixed(4)),
      sigFChange: Number(sigFChange3.toFixed(4)),
      isSignificant: p3 <= alpha
    },
    moderatorClassification: {
      type: modType,
      b2MainEffectZ: Number(b2.toFixed(6)),
      p2MainEffectZ: Number(p2.toFixed(4)),
      b3InteractionXZ: Number(b3.toFixed(6)),
      p3InteractionXZ: Number(p3.toFixed(4)),
      homologizerSubgroupR2Diff,
      rationale: modRationale
    },
    simpleSlopes,
    johnsonNeyman: {
      hasRealRoots,
      criticalValuesCentered,
      criticalValuesRaw,
      regionsDescription,
      percentSignificantTotal,
      floodlightCurve
    },
    academicInterpretation
  };
}

