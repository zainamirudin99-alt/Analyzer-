// ============================================================
// Comparative Measurement Accuracy Assessment — Pair Fixed Effects
// Model: AE_ijt = alpha_it + sum_{m != j0} beta_m Source_m + eps_ijt
// Absorbs City-Year Pair Fixed Effect alpha_it; clusters SE by City ID
// ============================================================

import { studentTCritical95 } from './panel-accuracy-bland-altman';
import {
  computePairwiseSourceContrast,
  fDistPValue,
  solveSymmetricSystem
} from './panel-accuracy-inference';
import { computeCityClusterMeanSe } from './panel-accuracy-metrics';
import { PreparedPanelAccuracyData } from './panel-accuracy-preprocessing';
import {
  PairFixedEffectsCoefficient,
  PairFixedEffectsResult,
  PairwiseSourceContrast
} from './panel-accuracy-types';

export function fitPairFixedEffectsModel(
  prepared: PreparedPanelAccuracyData,
  options?: { bootstrapReplications?: number; seed?: number }
): PairFixedEffectsResult {
  const {
    completeCaseObservations,
    referenceSource,
    comparisonSources,
    cities
  } = prepared;

  const P = completeCaseObservations.length;
  const M = comparisonSources.length;
  const nLongObs = P * M;
  const G = new Set(completeCaseObservations.map(o => o.city)).size || cities.length;
  const dfCluster = Math.max(1, G - 1);
  const bootstrapReplications = options?.bootstrapReplications ?? 999;
  const seed = options?.seed ?? 20261116;

  const baselineSource = comparisonSources[0];

  // Build long-format records on Complete-Case City-Year pairs
  const longRows: Array<{
    pairId: string;
    city: string;
    year: number;
    sourceId: string;
    sourceName: string;
    signedError: number;
    absError: number;
    sqError: number;
  }> = [];

  // Matrix of AE[p][m] for p = 0..P-1, m = 0..M-1
  const aeMatrix: number[][] = [];
  completeCaseObservations.forEach(obs => {
    const xr = obs.values[referenceSource.id]!;
    const rowAe: number[] = [];
    comparisonSources.forEach(cs => {
      const xc = obs.values[cs.id]!;
      const signedError = xc - xr;
      const absError = Math.abs(signedError);
      const sqError = signedError * signedError;
      rowAe.push(absError);
      longRows.push({
        pairId: obs.pairKey,
        city: obs.city,
        year: obs.year,
        sourceId: cs.id,
        sourceName: cs.name,
        signedError,
        absError,
        sqError
      });
    });
    aeMatrix.push(rowAe);
  });

  // Mean AE (MAE) per comparison source on complete-case sample
  const maeByIdx = comparisonSources.map((_, m) =>
    P > 0 ? aeMatrix.reduce((s, r) => s + r[m], 0) / P : 0
  );

  // Special case: M === 1 (only 1 comparison source vs 1 reference source; J = 2 total sources)
  if (M <= 1) {
    const aeItems = completeCaseObservations.map((o, p) => ({
      city: o.city,
      val: aeMatrix[p][0]
    }));
    const cl = computeCityClusterMeanSe(aeItems);
    const tCrit = studentTCritical95(dfCluster);
    const coef: PairFixedEffectsCoefficient = {
      sourceId: baselineSource.id,
      sourceName: baselineSource.name,
      sourceLabel: `${baselineSource.name} (${baselineSource.label})`,
      isBaselineComparison: true,
      meanAe: cl.mean,
      betaDiffVsBaseline: 0,
      seCluster: cl.seCluster,
      tStat: 0,
      pValue: 1,
      ciLower: Math.max(0, cl.mean - tCrit * cl.seCluster),
      ciUpper: cl.mean + tCrit * cl.seCluster
    };

    return {
      nCompletePairs: P,
      nComparisonSources: M,
      nLongObs,
      nClustersCity: G,
      dfCluster,
      baselineComparisonSourceId: baselineSource.id,
      baselineComparisonSourceLabel: `${baselineSource.name} (${baselineSource.label})`,
      referenceSourceId: referenceSource.id,
      referenceSourceLabel: `${referenceSource.name} (${referenceSource.label})`,
      withinR2: 0,
      omnibusFStat: 0,
      omnibusDf1: 0,
      omnibusDf2: dfCluster,
      omnibusPValue: 1,
      omnibusWildBootstrapPValue: 1,
      smallClusterWarning: G < 30,
      bootstrapReplications,
      coefficients: [coef],
      pairwiseContrasts: [],
      longObservationsPreview: longRows.slice(0, 60)
    };
  }

  // Within-pair variation R^2 (share of within-City-Year AE variance explained by Source indicators)
  const grandMae = maeByIdx.reduce((a, b) => a + b, 0) / M;
  let tssWithin = 0;
  let essWithin = 0;
  for (let p = 0; p < P; p++) {
    const pairMean = aeMatrix[p].reduce((a, b) => a + b, 0) / M;
    for (let m = 0; m < M; m++) {
      const yTilde = aeMatrix[p][m] - pairMean;
      tssWithin += yTilde * yTilde;
    }
  }
  for (let m = 0; m < M; m++) {
    const bTilde = maeByIdx[m] - grandMae;
    essWithin += P * bTilde * bTilde;
  }
  const withinR2 = tssWithin > 1e-12 ? Math.min(1, Math.max(0, essWithin / tssWithin)) : 0;

  // Compute all pairwise contrasts among comparison sources
  const pairwiseContrasts: PairwiseSourceContrast[] = [];
  for (let a = 0; a < M; a++) {
    for (let b = a + 1; b < M; b++) {
      const srcA = comparisonSources[a];
      const srcB = comparisonSources[b];
      const contrast = computePairwiseSourceContrast({
        sourceAId: srcA.id,
        sourceALabel: `${srcA.name} (${srcA.label})`,
        sourceBId: srcB.id,
        sourceBLabel: `${srcB.name} (${srcB.label})`,
        pairs: completeCaseObservations.map((o, p) => ({
          city: o.city,
          aeA: aeMatrix[p][a],
          aeB: aeMatrix[p][b]
        })),
        nLongObs,
        nComparisonSources: M,
        bootstrapReplications,
        seed: seed + a * 31 + b * 97
      });
      pairwiseContrasts.push(contrast);
    }
  }

  // Build coefficients table (m = 0 is baseline comparison source, m = 1..M-1 contrasted vs baseline m=0)
  const baseAeItems = completeCaseObservations.map((o, p) => ({
    city: o.city,
    val: aeMatrix[p][0]
  }));
  const baseCluster = computeCityClusterMeanSe(baseAeItems);
  const tCrit = studentTCritical95(dfCluster);

  const coefficients: PairFixedEffectsCoefficient[] = comparisonSources.map((cs, m) => {
    if (m === 0) {
      return {
        sourceId: cs.id,
        sourceName: cs.name,
        sourceLabel: `${cs.name} (${cs.label})`,
        isBaselineComparison: true,
        meanAe: maeByIdx[0],
        betaDiffVsBaseline: 0,
        seCluster: baseCluster.seCluster,
        tStat: 0,
        pValue: 1,
        ciLower: Math.max(0, maeByIdx[0] - tCrit * baseCluster.seCluster),
        ciUpper: maeByIdx[0] + tCrit * baseCluster.seCluster
      };
    }

    // Find contrast (0, m): note contrast has diffAminusB = MAE_0 - MAE_m, so beta_m = MAE_m - MAE_0 = -diffAminusB
    const c0m = pairwiseContrasts.find(
      c => c.sourceAId === baselineSource.id && c.sourceBId === cs.id
    )!;
    const beta = -c0m.diffAminusB;
    return {
      sourceId: cs.id,
      sourceName: cs.name,
      sourceLabel: `${cs.name} (${cs.label})`,
      isBaselineComparison: false,
      meanAe: maeByIdx[m],
      betaDiffVsBaseline: beta,
      seCluster: c0m.seCluster,
      tStat: -c0m.tStat,
      pValue: c0m.pValueCluster,
      ciLower: -c0m.ciUpperCluster,
      ciUpper: -c0m.ciLowerCluster,
      wildBootstrapPValue: c0m.wildBootstrapPValue,
      wildBootstrapCi: [-c0m.wildBootstrapCiUpper, -c0m.wildBootstrapCiLower]
    };
  });

  // Omnibus Cluster-Robust Wald F-test for H0: beta_1 = ... = beta_{M-1} = 0
  const K = M - 1;
  const betaVec = coefficients.slice(1).map(c => c.betaDiffVsBaseline);

  // Cluster score vector for city g on (d_{p,1}, ..., d_{p,K}) where d_{p,m} = (AE_{p,m} - AE_{p,0}) - beta_m
  const cityScoreVecs = new Map<string, number[]>();
  for (let p = 0; p < P; p++) {
    const city = completeCaseObservations[p].city;
    if (!cityScoreVecs.has(city)) {
      cityScoreVecs.set(city, new Array(K).fill(0));
    }
    const vec = cityScoreVecs.get(city)!;
    for (let k = 0; k < K; k++) {
      const diff = aeMatrix[p][k + 1] - aeMatrix[p][0];
      vec[k] += diff - betaVec[k];
    }
  }

  const dofFactor =
    G > 1 ? (G / (G - 1)) * ((Math.max(2, nLongObs) - 1) / Math.max(1, nLongObs - K)) : 1;
  const covMat: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
  cityScoreVecs.forEach(vec => {
    for (let r = 0; r < K; r++) {
      for (let c = 0; c < K; c++) {
        covMat[r][c] += (dofFactor * vec[r] * vec[c]) / Math.max(1, P * P);
      }
    }
  });

  let omnibusFStat = 0;
  if (K === 1) {
    omnibusFStat = coefficients[1].tStat * coefficients[1].tStat;
  } else {
    const vInvBeta = solveSymmetricSystem(covMat, betaVec);
    let waldChi2 = 0;
    for (let k = 0; k < K; k++) waldChi2 += betaVec[k] * vInvBeta[k];
    omnibusFStat = Math.max(0, waldChi2 / K);
  }
  const omnibusPValue = fDistPValue(omnibusFStat, K, dfCluster);
  const minWildP = Math.min(...pairwiseContrasts.map(c => c.wildBootstrapPValue), 1);
  // Holm-Bonferroni conservative bound across pairwise wild bootstrap p-values for omnibus check
  const omnibusWildBootstrapPValue = Math.min(1, minWildP * pairwiseContrasts.length);

  return {
    nCompletePairs: P,
    nComparisonSources: M,
    nLongObs,
    nClustersCity: G,
    dfCluster,
    baselineComparisonSourceId: baselineSource.id,
    baselineComparisonSourceLabel: `${baselineSource.name} (${baselineSource.label})`,
    referenceSourceId: referenceSource.id,
    referenceSourceLabel: `${referenceSource.name} (${referenceSource.label})`,
    withinR2,
    omnibusFStat,
    omnibusDf1: K,
    omnibusDf2: dfCluster,
    omnibusPValue,
    omnibusWildBootstrapPValue,
    smallClusterWarning: G < 30,
    bootstrapReplications,
    coefficients,
    pairwiseContrasts,
    longObservationsPreview: longRows.slice(0, 60)
  };
}
