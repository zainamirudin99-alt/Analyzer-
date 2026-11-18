// ============================================================
// Reference-Free All-Source Pair Fixed Effects Comparison
// Model: AE_ijt = alpha_it + sum_{m != j0} beta_m Source_m + eps_ijt
// where AE_ijt = |X_ijt - theta_hat_it| evaluates ALL J sources symmetrically
// against the shared Bayesian Latent True Emission theta_hat_it inside every City-Year pair.
// ============================================================

import {
  studentTCritical95,
  studentTPValueTwoSided
} from './panel-accuracy-bland-altman';
import {
  computePairwiseSourceContrast,
  fDistPValue,
  solveSymmetricSystem
} from './panel-accuracy-inference';
import { LatentEngineInternalOutput } from './panel-accuracy-latent';
import { computeCityClusterMeanSe } from './panel-accuracy-metrics';
import { PreparedPanelAccuracyData } from './panel-accuracy-preprocessing';
import {
  PairFixedEffectsCoefficient,
  PairFixedEffectsResult,
  PairwiseSourceContrast
} from './panel-accuracy-types';

/**
 * Driscoll-Kraay (1998) Cross-Sectionally & Temporally Robust Standard Error
 * for a panel difference series d_it across cities i and years t using Bartlett Newey-West kernel.
 */
function computeDriscollKraayDiffSe(
  items: Array<{ year: number; diff: number }>
): { seDk: number; pValueDk: number } {
  const P = items.length;
  if (P < 2) return { seDk: 0, pValueDk: 1 };
  const meanDiff = items.reduce((s, x) => s + x.diff, 0) / P;

  const byYear = new Map<number, number>();
  items.forEach(it => {
    byYear.set(it.year, (byYear.get(it.year) || 0) + (it.diff - meanDiff));
  });
  const sortedYears = Array.from(byYear.keys()).sort((a, b) => a - b);
  const T = sortedYears.length;
  if (T < 2) {
    const v = items.reduce((s, x) => s + (x.diff - meanDiff) ** 2, 0) / Math.max(1, P - 1);
    const se = Math.sqrt(v / P);
    return { seDk: se, pValueDk: se > 1e-12 ? studentTPValueTwoSided(Math.abs(meanDiff / se), Math.max(1, P - 1)) : 1 };
  }

  const h = sortedYears.map(yr => byYear.get(yr)!);
  const maxLag = Math.max(1, Math.min(T - 1, Math.floor(4 * Math.pow(T / 100, 2 / 9))));
  let omega = h.reduce((s, v) => s + v * v, 0);
  for (let l = 1; l <= maxLag; l++) {
    const weight = 1 - l / (maxLag + 1);
    let gammaL = 0;
    for (let t = l; t < T; t++) {
      gammaL += h[t] * h[t - l];
    }
    omega += 2 * weight * gammaL;
  }
  const seDk = Math.sqrt(Math.max(1e-16, omega)) / P;
  const tDk = seDk > 1e-12 ? Math.abs(meanDiff) / seDk : 0;
  const pValueDk = studentTPValueTwoSided(tDk, Math.max(1, T - 1));
  return { seDk, pValueDk };
}

export function fitPairFixedEffectsModel(
  prepared: PreparedPanelAccuracyData,
  latentOut: LatentEngineInternalOutput,
  options?: { bootstrapReplications?: number; seed?: number }
): PairFixedEffectsResult {
  const {
    completeCaseObservations,
    referenceSource,
    comparisonSources, // ALL J evaluated sources symmetrically
    cities
  } = prepared;

  const P = completeCaseObservations.length;
  const M = comparisonSources.length;
  const nLongObs = P * M;
  const G = new Set(completeCaseObservations.map(o => o.city)).size || cities.length;
  const dfCluster = Math.max(1, G - 1);
  const bootstrapReplications = options?.bootstrapReplications ?? 999;
  const seed = options?.seed ?? 20261117;

  const baselineSource = comparisonSources[0];

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

  // Compare ALL J sources against shared Latent Posterior Mean theta_hat_it inside each City-Year pair
  const aeMatrix: number[][] = [];
  completeCaseObservations.forEach((obs, p) => {
    const thetaHat = latentOut.sharedLatentTheta[p];
    const rowAe: number[] = [];
    comparisonSources.forEach(src => {
      const xVal = obs.values[src.id]!;
      const signedError = xVal - thetaHat;
      const absError = Math.abs(signedError);
      const sqError = signedError * signedError;
      rowAe.push(absError);
      longRows.push({
        pairId: obs.pairKey,
        city: obs.city,
        year: obs.year,
        sourceId: src.id,
        sourceName: src.name,
        signedError,
        absError,
        sqError
      });
    });
    aeMatrix.push(rowAe);
  });

  const maeByIdx = comparisonSources.map((_, m) =>
    P > 0 ? aeMatrix.reduce((s, r) => s + r[m], 0) / P : 0
  );

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
      referenceSourceLabel: referenceSource.label,
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

  // Within-pair R²
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

  // All C(J, 2) pairwise contrasts across ALL J evaluated sources
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

      const dk = computeDriscollKraayDiffSe(
        completeCaseObservations.map((o, p) => ({
          year: o.year,
          diff: aeMatrix[p][a] - aeMatrix[p][b]
        }))
      );

      const postProbAB = latentOut.pairwisePosteriorProb[`${srcA.id}::${srcB.id}`] ?? 0.5;
      pairwiseContrasts.push({
        ...contrast,
        seDriscollKraay: dk.seDk,
        pValueDriscollKraay: dk.pValueDk,
        posteriorProbABetterThanB: postProbAB
      });
    }
  }

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
        seDriscollKraay: baseCluster.seCluster,
        tStat: 0,
        pValue: 1,
        ciLower: Math.max(0, maeByIdx[0] - tCrit * baseCluster.seCluster),
        ciUpper: maeByIdx[0] + tCrit * baseCluster.seCluster
      };
    }

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
      seDriscollKraay: c0m.seDriscollKraay,
      tStat: -c0m.tStat,
      pValue: c0m.pValueCluster,
      ciLower: -c0m.ciUpperCluster,
      ciUpper: -c0m.ciLowerCluster,
      wildBootstrapPValue: c0m.wildBootstrapPValue,
      wildBootstrapCi: [-c0m.wildBootstrapCiUpper, -c0m.wildBootstrapCiLower]
    };
  });

  // Omnibus Cluster-Robust Wald F-test
  const K = M - 1;
  const betaVec = coefficients.slice(1).map(c => c.betaDiffVsBaseline);
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
    referenceSourceLabel: referenceSource.label,
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
