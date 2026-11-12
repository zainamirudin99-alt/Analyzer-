// ============================================================
// Contingency Analysis, Crosstabulation, & Chi-Square Engine
// Points 09 & 10: 2x2, 2xk, rx2, rxc Crosstabs, Observed/Expected,
// Row/Col/Total %, Pearson/Standardized/Adjusted Residuals,
// Pearson Chi-Square, Likelihood Ratio G2, Yates Correction,
// Exact Hypergeometric Fisher's Test, Fisher-Freeman-Halton /
// Monte Carlo Test, Phi, Cramer's V, Contingency Coefficient,
// Odds Ratio, Relative Risk, & Risk Difference with 95% CI
// ============================================================

import { chiSquarePValue, lnGamma, normalInv } from './regression-engine';

export interface ContingencyCell {
  rowCategory: string;
  colCategory: string;
  observed: number;
  expected: number;
  rowPercent: number;
  colPercent: number;
  totalPercent: number;
  rawResidual: number;
  pearsonResidual: number;
  standardizedResidual: number;
  adjustedResidual: number;
  isSignificantCell: boolean; // |adjustedResidual| >= 1.96
}

export interface ChiSquareTestRow {
  testName: string;
  value: number;
  df: number | string;
  asympSig2Sided?: number;
  exactSig2Sided?: number;
  exactSig1Sided?: number;
  monteCarloSig?: number;
  notes?: string;
}

export interface SymmetricMeasureRow {
  category: 'Nominal by Nominal';
  measureName: 'Phi' | "Cramer's V" | 'Contingency Coefficient';
  value: number;
  approxSig: number;
  interpretation: string;
}

export interface RiskEstimate2x2 {
  is2x2: boolean;
  oddsRatio?: { value: number; ciLower: number; ciUpper: number; label: string };
  relativeRiskCol1?: { value: number; ciLower: number; ciUpper: number; label: string };
  relativeRiskCol2?: { value: number; ciLower: number; ciUpper: number; label: string };
  riskDifference?: { value: number; ciLower: number; ciUpper: number; label: string };
}

export interface ContingencyAnalysisResult {
  rowVar: string;
  colVar: string;
  tableDimensions: {
    r: number;
    c: number;
    typeLabel: '2x2' | '2xk' | 'rx2' | 'rxc';
  };
  sampleSize: {
    totalN: number;
    validN: number;
    missingN: number;
    validPercent: number;
  };
  rowCategories: string[];
  colCategories: string[];
  cells: ContingencyCell[][]; // [r][c]
  rowTotals: { category: string; count: number; percent: number }[];
  colTotals: { category: string; count: number; percent: number }[];
  expectedCountDiagnostics: {
    cellsBelow5Count: number;
    totalCells: number;
    cellsBelow5Percent: number;
    minExpectedCount: number;
    meetsChiSquareAssumption: boolean; // <= 20% cells have E < 5 and min E >= 1
    recommendedPrimaryTest: string;
  };
  chiSquareTests: ChiSquareTestRow[];
  symmetricMeasures: SymmetricMeasureRow[];
  riskEstimates: RiskEstimate2x2;
  visualData: {
    clusteredBar: { rowCat: string; values: Record<string, number> }[];
    stackedBar100: { rowCat: string; percentages: Record<string, number> }[];
    mosaicPlot: {
      rowCat: string;
      rowProp: number;
      segments: { colCat: string; colPropWithinRow: number; observed: number; adjustedResidual: number }[];
    }[];
    residualHeatmap: { rowCat: string; colCat: string; observed: number; expected: number; adjustedResidual: number }[];
  };
  academicInterpretation: string[];
}

/**
 * Exact Hypergeometric Log-Probability ln(P(A = a | R1, R2, C1, N))
 */
function logHypergeometricProb(a: number, r1: number, r2: number, c1: number, n: number): number {
  const b = r1 - a;
  const c = c1 - a;
  const d = r2 - c;
  if (a < 0 || b < 0 || c < 0 || d < 0) return -Infinity;
  const lnChoose = (nVal: number, kVal: number) =>
    lnGamma(nVal + 1) - lnGamma(kVal + 1) - lnGamma(nVal - kVal + 1);
  return lnChoose(r1, a) + lnChoose(r2, c) - lnChoose(n, c1);
}

/**
 * Exact Fisher's Test for 2x2 Table [ [a, b], [c, d] ]
 */
export function computeFisherExact2x2(
  a: number,
  b: number,
  c: number,
  d: number
): { p2Sided: number; p1Sided: number } {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  if (n === 0) return { p2Sided: 1.0, p1Sided: 1.0 };

  const minA = Math.max(0, c1 - r2);
  const maxA = Math.min(r1, c1);
  const logPObs = logHypergeometricProb(a, r1, r2, c1, n);
  const pObs = Math.exp(logPObs);

  let p2Sided = 0;
  let pLeft = 0;
  let pRight = 0;

  for (let x = minA; x <= maxA; x++) {
    const pX = Math.exp(logHypergeometricProb(x, r1, r2, c1, n));
    if (pX <= pObs * (1 + 1e-11)) {
      p2Sided += pX;
    }
    if (x <= a) pLeft += pX;
    if (x >= a) pRight += pX;
  }

  return {
    p2Sided: Math.min(1.0, Math.max(0.0, p2Sided)),
    p1Sided: Math.min(1.0, Math.max(0.0, Math.min(pLeft, pRight)))
  };
}

/**
 * Monte Carlo / Fisher-Freeman-Halton Permutation p-value for r x c Table with Fixed Marginals
 */
export function computeMonteCarloChiSquare(
  obsChiSq: number,
  rowTotals: number[],
  colTotals: number[],
  totalN: number,
  replications: number = 2000
): number {
  if (totalN <= 0 || replications <= 0) return 1.0;
  const r = rowTotals.length;
  const c = colTotals.length;

  // Build pool of column indices according to colTotals
  const colPoolTemplate: number[] = [];
  for (let j = 0; j < c; j++) {
    for (let k = 0; k < colTotals[j]; k++) {
      colPoolTemplate.push(j);
    }
  }

  // Expected counts
  const expected: number[][] = Array.from({ length: r }, (_, i) =>
    Array.from({ length: c }, (__, j) => (rowTotals[i] * colTotals[j]) / totalN)
  );

  let seed = 135792468;
  const prng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  let extremeCount = 0;
  const pool = [...colPoolTemplate];

  for (let rep = 0; rep < replications; rep++) {
    // Fisher-Yates shuffle of pool
    for (let i = totalN - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    // Fill simulated table with fixed rowTotals and colTotals
    let cursor = 0;
    let simChiSq = 0;
    for (let i = 0; i < r; i++) {
      const rowCounts = new Array(c).fill(0);
      const rTot = rowTotals[i];
      for (let m = 0; m < rTot; m++) {
        rowCounts[pool[cursor++]]++;
      }
      for (let j = 0; j < c; j++) {
        const exp = expected[i][j];
        if (exp > 0) {
          const diff = rowCounts[j] - exp;
          simChiSq += (diff * diff) / exp;
        }
      }
    }

    if (simChiSq >= obsChiSq - 1e-10) {
      extremeCount++;
    }
  }

  return Math.min(1.0, Math.max(0.0, extremeCount / replications));
}

/**
 * Jalankan Analisis Kontingensi (Crosstabs) & Uji Chi-Square Komprehensif Bergaya SPSS
 */
export function runContingencyAnalysis(options: {
  rows: Record<string, any>[];
  rowVar: string;
  colVar: string;
  alpha?: number;
  ciLevel?: number;
}): ContingencyAnalysisResult {
  const { rows, rowVar, colVar, alpha = 0.05, ciLevel = 0.95 } = options;
  const totalN = rows.length;

  const validPairs: { rVal: string; cVal: string }[] = [];
  for (const row of rows) {
    const rv = row[rowVar];
    const cv = row[colVar];
    if (
      rv !== null &&
      rv !== undefined &&
      String(rv).trim() !== '' &&
      cv !== null &&
      cv !== undefined &&
      String(cv).trim() !== ''
    ) {
      validPairs.push({ rVal: String(rv).trim(), cVal: String(cv).trim() });
    }
  }

  const validN = validPairs.length;
  const missingN = totalN - validN;
  if (validN === 0) {
    throw new Error(`Tidak ada pasangan observasi valid untuk variabel "${rowVar}" dan "${colVar}".`);
  }

  const rowCategories = Array.from(new Set(validPairs.map(p => p.rVal))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  const colCategories = Array.from(new Set(validPairs.map(p => p.cVal))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  const r = rowCategories.length;
  const c = colCategories.length;
  if (r < 2 || c < 2) {
    throw new Error(
      `Tabel kontingensi memerlukan minimal 2 kategori baris dan 2 kategori kolom (terdeteksi ${r} x ${c}).`
    );
  }

  const typeLabel: '2x2' | '2xk' | 'rx2' | 'rxc' =
    r === 2 && c === 2 ? '2x2' : r === 2 ? '2xk' : c === 2 ? 'rx2' : 'rxc';

  // Count matrix O[i][j]
  const obsMatrix: number[][] = Array.from({ length: r }, () => new Array(c).fill(0));
  const rMap = new Map(rowCategories.map((cat, idx) => [cat, idx]));
  const cMap = new Map(colCategories.map((cat, idx) => [cat, idx]));

  for (const pair of validPairs) {
    const i = rMap.get(pair.rVal)!;
    const j = cMap.get(pair.cVal)!;
    obsMatrix[i][j]++;
  }

  const rCounts = obsMatrix.map(row => row.reduce((a, b) => a + b, 0));
  const cCounts = Array.from({ length: c }, (_, j) => obsMatrix.reduce((acc, row) => acc + row[j], 0));

  // Cells, Chi-Square, Likelihood Ratio G2, Yates
  const cells: ContingencyCell[][] = [];
  let pearsonChiSq = 0;
  let likelihoodRatioG2 = 0;
  let yatesChiSq = 0;
  let cellsBelow5Count = 0;
  let minExpectedCount = Infinity;

  const zCrit = Math.abs(normalInv(1 - (1 - ciLevel) / 2));

  for (let i = 0; i < r; i++) {
    const cellRow: ContingencyCell[] = [];
    for (let j = 0; j < c; j++) {
      const obs = obsMatrix[i][j];
      const exp = (rCounts[i] * cCounts[j]) / validN;
      if (exp < 5.0) cellsBelow5Count++;
      if (exp < minExpectedCount) minExpectedCount = exp;

      const rowPct = rCounts[i] > 0 ? (obs / rCounts[i]) * 100 : 0;
      const colPct = cCounts[j] > 0 ? (obs / cCounts[j]) * 100 : 0;
      const totPct = (obs / validN) * 100;

      const rawRes = obs - exp;
      const pearsonRes = exp > 0 ? rawRes / Math.sqrt(exp) : 0;
      const adjDenom = Math.sqrt(Math.max(1e-12, exp * (1 - rCounts[i] / validN) * (1 - cCounts[j] / validN)));
      const adjRes = adjDenom > 0 ? rawRes / adjDenom : 0;

      if (exp > 0) {
        pearsonChiSq += (rawRes * rawRes) / exp;
        if (obs > 0) {
          likelihoodRatioG2 += 2 * obs * Math.log(obs / exp);
        }
        if (r === 2 && c === 2) {
          const yatesDiff = Math.max(0, Math.abs(rawRes) - 0.5);
          yatesChiSq += (yatesDiff * yatesDiff) / exp;
        }
      }

      cellRow.push({
        rowCategory: rowCategories[i],
        colCategory: colCategories[j],
        observed: obs,
        expected: Number(exp.toFixed(2)),
        rowPercent: Number(rowPct.toFixed(2)),
        colPercent: Number(colPct.toFixed(2)),
        totalPercent: Number(totPct.toFixed(2)),
        rawResidual: Number(rawRes.toFixed(2)),
        pearsonResidual: Number(pearsonRes.toFixed(3)),
        standardizedResidual: Number(pearsonRes.toFixed(3)),
        adjustedResidual: Number(adjRes.toFixed(3)),
        isSignificantCell: Math.abs(adjRes) >= zCrit
      });
    }
    cells.push(cellRow);
  }

  const df = (r - 1) * (c - 1);
  const pPearson = chiSquarePValue(pearsonChiSq, df);
  const pLR = chiSquarePValue(likelihoodRatioG2, df);
  const monteCarloP = computeMonteCarloChiSquare(pearsonChiSq, rCounts, cCounts, validN, 2000);

  // Linear-by-Linear Association (using numeric category scores 1..r and 1..c or parsed numbers)
  const rScores = rowCategories.map((cat, idx) => (!isNaN(Number(cat)) ? Number(cat) : idx + 1));
  const cScores = colCategories.map((cat, idx) => (!isNaN(Number(cat)) ? Number(cat) : idx + 1));
  let meanR = 0;
  let meanC = 0;
  for (let i = 0; i < r; i++) meanR += (rScores[i] * rCounts[i]) / validN;
  for (let j = 0; j < c; j++) meanC += (cScores[j] * cCounts[j]) / validN;
  let covRC = 0;
  let varR = 0;
  let varC = 0;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const dr = rScores[i] - meanR;
      const dc = cScores[j] - meanC;
      covRC += obsMatrix[i][j] * dr * dc;
      varR += obsMatrix[i][j] * dr * dr;
      varC += obsMatrix[i][j] * dc * dc;
    }
  }
  const rLin = varR > 0 && varC > 0 ? covRC / Math.sqrt(varR * varC) : 0;
  const linearByLinearM2 = (validN - 1) * rLin * rLin;
  const pLinear = chiSquarePValue(linearByLinearM2, 1);

  const chiSquareTests: ChiSquareTestRow[] = [
    {
      testName: 'Pearson Chi-Square',
      value: Number(pearsonChiSq.toFixed(4)),
      df,
      asympSig2Sided: Number(pPearson.toFixed(4)),
      monteCarloSig: Number(monteCarloP.toFixed(4))
    },
    {
      testName: 'Likelihood Ratio (G²)',
      value: Number(likelihoodRatioG2.toFixed(4)),
      df,
      asympSig2Sided: Number(pLR.toFixed(4))
    }
  ];

  if (r === 2 && c === 2) {
    const pYates = chiSquarePValue(yatesChiSq, 1);
    chiSquareTests.push({
      testName: "Continuity Correction (Yates' 2x2)",
      value: Number(yatesChiSq.toFixed(4)),
      df: 1,
      asympSig2Sided: Number(pYates.toFixed(4))
    });

    const fisher = computeFisherExact2x2(
      obsMatrix[0][0],
      obsMatrix[0][1],
      obsMatrix[1][0],
      obsMatrix[1][1]
    );
    chiSquareTests.push({
      testName: "Fisher's Exact Test",
      value: Number(pearsonChiSq.toFixed(4)),
      df: '-',
      exactSig2Sided: Number(fisher.p2Sided.toFixed(4)),
      exactSig1Sided: Number(fisher.p1Sided.toFixed(4))
    });
  } else {
    chiSquareTests.push({
      testName: 'Fisher-Freeman-Halton / Monte Carlo Exact Test',
      value: Number(pearsonChiSq.toFixed(4)),
      df,
      monteCarloSig: Number(monteCarloP.toFixed(4)),
      notes: 'Berdasarkan 2.000 simulasi permutasi tabel bermarginal tetap'
    });
  }

  chiSquareTests.push({
    testName: 'Linear-by-Linear Association (Mantel-Haenszel)',
    value: Number(linearByLinearM2.toFixed(4)),
    df: 1,
    asympSig2Sided: Number(pLinear.toFixed(4))
  });

  // Expected count adequacy diagnostics
  const totalCells = r * c;
  const cellsBelow5Percent = Number(((cellsBelow5Count / totalCells) * 100).toFixed(2));
  const meetsChiSquareAssumption = cellsBelow5Percent <= 20.0 && minExpectedCount >= 1.0;
  let recommendedPrimaryTest = 'Pearson Chi-Square';
  if (!meetsChiSquareAssumption) {
    recommendedPrimaryTest =
      r === 2 && c === 2
        ? "Fisher's Exact Test (karena terdapat sel dengan Expected Count < 5)"
        : 'Likelihood Ratio (G²) / Fisher-Freeman-Halton Monte Carlo Test (karena >20% sel memiliki Expected Count < 5)';
  }

  // Symmetric Measures (Effect Size)
  let phiVal = Math.sqrt(pearsonChiSq / validN);
  if (r === 2 && c === 2) {
    const det = obsMatrix[0][0] * obsMatrix[1][1] - obsMatrix[0][1] * obsMatrix[1][0];
    const denom = Math.sqrt(rCounts[0] * rCounts[1] * cCounts[0] * cCounts[1]);
    phiVal = denom > 0 ? det / denom : 0;
  }
  const minDim = Math.min(r - 1, c - 1);
  const cramersV = Math.sqrt(pearsonChiSq / (validN * Math.max(1, minDim)));
  const contingencyC = Math.sqrt(pearsonChiSq / (pearsonChiSq + validN));

  const interpretEffect = (v: number): string => {
    const absV = Math.abs(v);
    if (absV < 0.10) return 'Sangat Lemah / Dapat Diabaikan';
    if (absV < 0.30) return 'Lemah - Sedang (Small to Medium)';
    if (absV < 0.50) return 'Sedang - Kuat (Medium to Large)';
    return 'Sangat Kuat (Large Association)';
  };

  const symmetricMeasures: SymmetricMeasureRow[] = [
    {
      category: 'Nominal by Nominal',
      measureName: 'Phi',
      value: Number(phiVal.toFixed(4)),
      approxSig: Number(pPearson.toFixed(4)),
      interpretation: interpretEffect(phiVal)
    },
    {
      category: 'Nominal by Nominal',
      measureName: "Cramer's V",
      value: Number(cramersV.toFixed(4)),
      approxSig: Number(pPearson.toFixed(4)),
      interpretation: interpretEffect(cramersV)
    },
    {
      category: 'Nominal by Nominal',
      measureName: 'Contingency Coefficient',
      value: Number(contingencyC.toFixed(4)),
      approxSig: Number(pPearson.toFixed(4)),
      interpretation: interpretEffect(contingencyC)
    }
  ];

  // Risk Estimates for 2x2 Table (Odds Ratio, Relative Risk, Risk Difference)
  let riskEstimates: RiskEstimate2x2 = { is2x2: false };
  if (r === 2 && c === 2) {
    let a = obsMatrix[0][0];
    let b = obsMatrix[0][1];
    let cCell = obsMatrix[1][0];
    let d = obsMatrix[1][1];
    // Haldane-Anscombe 0.5 correction if any cell is zero
    if (a === 0 || b === 0 || cCell === 0 || d === 0) {
      a += 0.5;
      b += 0.5;
      cCell += 0.5;
      d += 0.5;
    }
    const r1Eff = a + b;
    const r2Eff = cCell + d;

    const orVal = (a * d) / (b * cCell);
    const seLnOR = Math.sqrt(1 / a + 1 / b + 1 / cCell + 1 / d);
    const orLow = Math.exp(Math.log(orVal) - zCrit * seLnOR);
    const orHigh = Math.exp(Math.log(orVal) + zCrit * seLnOR);

    // Cohort Col 1 Risk: p1 = a / r1, p2 = c / r2
    const p1 = a / r1Eff;
    const p2 = cCell / r2Eff;
    const rr1 = p2 > 0 ? p1 / p2 : 1;
    const seLnRR1 = Math.sqrt((1 - p1) / a + (1 - p2) / cCell);
    const rr1Low = Math.exp(Math.log(rr1) - zCrit * seLnRR1);
    const rr1High = Math.exp(Math.log(rr1) + zCrit * seLnRR1);

    // Cohort Col 2 Risk: q1 = b / r1, q2 = d / r2
    const q1 = b / r1Eff;
    const q2 = d / r2Eff;
    const rr2 = q2 > 0 ? q1 / q2 : 1;
    const seLnRR2 = Math.sqrt((1 - q1) / b + (1 - q2) / d);
    const rr2Low = Math.exp(Math.log(rr2) - zCrit * seLnRR2);
    const rr2High = Math.exp(Math.log(rr2) + zCrit * seLnRR2);

    // Risk Difference RD = p1 - p2
    const rd = p1 - p2;
    const seRD = Math.sqrt((p1 * (1 - p1)) / r1Eff + (p2 * (1 - p2)) / r2Eff);
    const rdLow = rd - zCrit * seRD;
    const rdHigh = rd + zCrit * seRD;

    riskEstimates = {
      is2x2: true,
      oddsRatio: {
        value: Number(orVal.toFixed(4)),
        ciLower: Number(orLow.toFixed(4)),
        ciUpper: Number(orHigh.toFixed(4)),
        label: `Odds Ratio untuk ${rowVar} (${rowCategories[0]} / ${rowCategories[1]})`
      },
      relativeRiskCol1: {
        value: Number(rr1.toFixed(4)),
        ciLower: Number(rr1Low.toFixed(4)),
        ciUpper: Number(rr1High.toFixed(4)),
        label: `Untuk Kohort ${colVar} = ${colCategories[0]}`
      },
      relativeRiskCol2: {
        value: Number(rr2.toFixed(4)),
        ciLower: Number(rr2Low.toFixed(4)),
        ciUpper: Number(rr2High.toFixed(4)),
        label: `Untuk Kohort ${colVar} = ${colCategories[1]}`
      },
      riskDifference: {
        value: Number(rd.toFixed(4)),
        ciLower: Number(rdLow.toFixed(4)),
        ciUpper: Number(rdHigh.toFixed(4)),
        label: `Selisih Risiko (Risk Difference) ${colCategories[0]}`
      }
    };
  }

  // Visual Data Structures
  const clusteredBar = cells.map(row => {
    const values: Record<string, number> = {};
    row.forEach(cell => {
      values[cell.colCategory] = cell.observed;
    });
    return { rowCat: row[0].rowCategory, values };
  });

  const stackedBar100 = cells.map(row => {
    const percentages: Record<string, number> = {};
    row.forEach(cell => {
      percentages[cell.colCategory] = cell.rowPercent;
    });
    return { rowCat: row[0].rowCategory, percentages };
  });

  const mosaicPlot = cells.map((row, i) => ({
    rowCat: rowCategories[i],
    rowProp: Number((rCounts[i] / validN).toFixed(4)),
    segments: row.map(cell => ({
      colCat: cell.colCategory,
      colPropWithinRow: Number((cell.rowPercent / 100).toFixed(4)),
      observed: cell.observed,
      adjustedResidual: cell.adjustedResidual
    }))
  }));

  const residualHeatmap: ContingencyAnalysisResult['visualData']['residualHeatmap'] = [];
  cells.forEach(row => {
    row.forEach(cell => {
      residualHeatmap.push({
        rowCat: cell.rowCategory,
        colCat: cell.colCategory,
        observed: cell.observed,
        expected: cell.expected,
        adjustedResidual: cell.adjustedResidual
      });
    });
  });

  const sigCells = residualHeatmap.filter(cItem => Math.abs(cItem.adjustedResidual) >= zCrit);
  const academicInterpretation: string[] = [
    `1. Struktur Tabel Kontingensi (${typeLabel}): Analisis tabulasi silang antara "${rowVar}" (${r} kategori) dan "${colVar}" (${c} kategori) melibatkan N = ${validN} observasi valid (${missingN} missing).`,
    `2. Kelayakan Ekspektasi Sel: Terdapat ${cellsBelow5Count} dari ${totalCells} sel (${cellsBelow5Percent}%) yang memiliki frekuensi harapan (Expected Count) < 5, dengan nilai harapan minimum sebesar ${minExpectedCount.toFixed(2)}. Metode uji utama yang direkomendasikan adalah: ${recommendedPrimaryTest}.`,
    `3. Pengujian Hipotesis Independensi: Statistik Pearson Chi-Square = ${pearsonChiSq.toFixed(3)} (df = ${df}, Sig. = ${pPearson.toFixed(4)}) dan Likelihood Ratio G² = ${likelihoodRatioG2.toFixed(3)} (Sig. = ${pLR.toFixed(4)}). Karena nilai p ${pPearson <= alpha ? `<= ${alpha}, hipotesis nol ditolak: terdapat asosiasi/hubungan yang signifikan secara statistik antara ${rowVar} dan ${colVar}` : `> ${alpha}, hipotesis nol gagal ditolak: tidak terdapat bukti hubungan yang signifikan antara ${rowVar} dan ${colVar}`}.`,
    `4. Kekuatan Asosiasi (Effect Size): Nilai Cramer's V = ${cramersV.toFixed(4)} dan Koefisien Kontingensi C = ${contingencyC.toFixed(4)} mengindikasikan kekuatan hubungan dalam kategori "${interpretEffect(cramersV)}".`,
    sigCells.length > 0
      ? `5. Analisis Residual Terstandarisasi Disesuaikan (Adjusted Standardized Residuals): Sel yang memberikan kontribusi penyimpangan signifikan (|z_adj| >= ${zCrit.toFixed(2)}) adalah: ${sigCells.map(sc => `[${sc.rowCat} × ${sc.colCat}: z_adj = ${sc.adjustedResidual.toFixed(2)}]`).join(', ')}.`
      : `5. Analisis Residual Sel: Tidak ditemukan sel spesifik yang melampaui ambang batas residual terstandarisasi disesuaikan (|z_adj| >= ${zCrit.toFixed(2)}).`
  ];

  return {
    rowVar,
    colVar,
    tableDimensions: { r, c, typeLabel },
    sampleSize: {
      totalN,
      validN,
      missingN,
      validPercent: Number(((validN / Math.max(1, totalN)) * 100).toFixed(2))
    },
    rowCategories,
    colCategories,
    cells,
    rowTotals: rowCategories.map((cat, i) => ({
      category: cat,
      count: rCounts[i],
      percent: Number(((rCounts[i] / validN) * 100).toFixed(2))
    })),
    colTotals: colCategories.map((cat, j) => ({
      category: cat,
      count: cCounts[j],
      percent: Number(((cCounts[j] / validN) * 100).toFixed(2))
    })),
    expectedCountDiagnostics: {
      cellsBelow5Count,
      totalCells,
      cellsBelow5Percent,
      minExpectedCount: Number(minExpectedCount.toFixed(2)),
      meetsChiSquareAssumption,
      recommendedPrimaryTest
    },
    chiSquareTests,
    symmetricMeasures,
    riskEstimates,
    visualData: {
      clusteredBar,
      stackedBar100,
      mosaicPlot,
      residualHeatmap
    },
    academicInterpretation
  };
}

