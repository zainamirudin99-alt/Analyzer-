// ============================================================
// Comparative Measurement Accuracy Assessment — Inference Helpers
// F-Distribution P-Value, Matrix Inversion & Pairwise Contrast Tests
// ============================================================

import {
  normalPValueTwoSided,
  studentTCritical95,
  studentTPValueTwoSided
} from './panel-accuracy-bland-altman';
import { runWildClusterBootstrapPairDiff } from './panel-accuracy-bootstrap';
import { PairwiseSourceContrast } from './panel-accuracy-types';

/**
 * Upper-tail p-value for F(df1, df2) using Wilson-Hilferty / Paulson cube-root normal transformation.
 */
export function fDistPValue(fStat: number, df1: number, df2: number): number {
  if (!Number.isFinite(fStat) || fStat <= 0 || df1 <= 0 || df2 <= 0) return 1;
  if (df1 === 1) {
    return studentTPValueTwoSided(Math.sqrt(fStat), df2);
  }
  const a = 2 / (9 * df1);
  const b = 2 / (9 * df2);
  const f13 = Math.cbrt(fStat);
  const num = (1 - b) * f13 - (1 - a);
  const den = Math.sqrt(Math.max(1e-12, b * f13 * f13 + a));
  const z = num / den;
  if (z <= 0) {
    return Math.min(1, 0.5 + 0.5 * (1 - normalPValueTwoSided(z)));
  }
  return 0.5 * normalPValueTwoSided(z);
}

/**
 * Solve K x K symmetric positive-semi-definite system A x = b with Tikhonov regularization fallback.
 */
export function solveSymmetricSystem(mat: number[][], rhs: number[]): number[] {
  const K = rhs.length;
  if (K === 0) return [];
  const A = mat.map((row, i) =>
    row.map((v, j) => (i === j ? v + 1e-10 * Math.max(1, Math.abs(v)) : v))
  );
  const b = [...rhs];

  for (let col = 0; col < K; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < K; r++) {
      if (Math.abs(A[r][col]) > maxVal) {
        maxVal = Math.abs(A[r][col]);
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      [A[col], A[pivotRow]] = [A[pivotRow], A[col]];
      [b[col], b[pivotRow]] = [b[pivotRow], b[col]];
    }
    const piv = Math.abs(A[col][col]) > 1e-12 ? A[col][col] : 1e-12;
    for (let r = col + 1; r < K; r++) {
      const factor = A[r][col] / piv;
      for (let c = col; c < K; c++) {
        A[r][c] -= factor * A[col][c];
      }
      b[r] -= factor * b[col];
    }
  }

  const x = new Array(K).fill(0);
  for (let i = K - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < K; j++) sum -= A[i][j] * x[j];
    const diag = Math.abs(A[i][i]) > 1e-12 ? A[i][i] : 1e-12;
    x[i] = sum / diag;
  }
  return x;
}

/**
 * Compute exact City-Clustered Pairwise Contrast between comparison source A and comparison source B
 * across P complete-case City-Year pairs, including Rademacher Wild Cluster Bootstrap.
 */
export function computePairwiseSourceContrast(params: {
  sourceAId: string;
  sourceALabel: string;
  sourceBId: string;
  sourceBLabel: string;
  pairs: Array<{ city: string; aeA: number; aeB: number }>;
  nLongObs: number;
  nComparisonSources: number;
  bootstrapReplications?: number;
  seed?: number;
}): PairwiseSourceContrast {
  const {
    sourceAId,
    sourceALabel,
    sourceBId,
    sourceBLabel,
    pairs,
    nLongObs,
    nComparisonSources,
    bootstrapReplications = 999,
    seed = 20261116
  } = params;

  const P = pairs.length;
  if (P === 0) {
    return {
      sourceAId,
      sourceALabel,
      sourceBId,
      sourceBLabel,
      maeA: 0,
      maeB: 0,
      diffAminusB: 0,
      seCluster: 0,
      tStat: 0,
      dfCluster: 1,
      pValueCluster: 1,
      ciLowerCluster: 0,
      ciUpperCluster: 0,
      wildBootstrapPValue: 1,
      wildBootstrapCiLower: 0,
      wildBootstrapCiUpper: 0,
      posteriorProbABetterThanB: 0.5,
      isSignificant05: false,
      betterSourceId: null
    };
  }

  const maeA = pairs.reduce((s, p) => s + p.aeA, 0) / P;
  const maeB = pairs.reduce((s, p) => s + p.aeB, 0) / P;
  const diffAminusB = maeA - maeB;

  const cityScores = new Map<string, number>();
  pairs.forEach(p => {
    const dev = (p.aeA - p.aeB) - diffAminusB;
    cityScores.set(p.city, (cityScores.get(p.city) || 0) + dev);
  });

  const G = cityScores.size;
  const dfCluster = Math.max(1, G - 1);
  const Kwithin = Math.max(1, nComparisonSources - 1);
  // Small-sample adjustment matching absorbed Pair Fixed Effects clustered by City ID
  const dofFactor =
    G > 1
      ? (G / (G - 1)) * ((Math.max(2, nLongObs) - 1) / Math.max(1, nLongObs - Kwithin))
      : 1;

  let meat = 0;
  cityScores.forEach(sc => {
    meat += sc * sc;
  });

  const varDiff = P > 0 ? (dofFactor * meat) / (P * P) : 0;
  const seCluster = Math.sqrt(Math.max(0, varDiff));
  const tStat = seCluster > 1e-12 ? diffAminusB / seCluster : 0;
  const pValueCluster = studentTPValueTwoSided(tStat, dfCluster);
  const tCrit = studentTCritical95(dfCluster);
  const ciLowerCluster = diffAminusB - tCrit * seCluster;
  const ciUpperCluster = diffAminusB + tCrit * seCluster;

  const wild = runWildClusterBootstrapPairDiff(
    pairs.map(p => ({ city: p.city, diff: p.aeA - p.aeB })),
    bootstrapReplications,
    seed
  );

  const isSignificant05 = G < 30 ? wild.pValue < 0.05 : pValueCluster < 0.05;
  const betterSourceId = !isSignificant05
    ? null
    : diffAminusB < 0
    ? sourceAId
    : sourceBId;

  return {
    sourceAId,
    sourceALabel,
    sourceBId,
    sourceBLabel,
    maeA,
    maeB,
    diffAminusB,
    seCluster,
    tStat,
    dfCluster,
    pValueCluster,
    ciLowerCluster,
    ciUpperCluster,
    wildBootstrapPValue: wild.pValue,
    wildBootstrapCiLower: wild.ciLower,
    wildBootstrapCiUpper: wild.ciUpper,
    posteriorProbABetterThanB: 0.5,
    isSignificant05,
    betterSourceId
  };
}
