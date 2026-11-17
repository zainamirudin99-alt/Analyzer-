// ============================================================
// Reference-Free All-Source Measurement Accuracy Metrics
// Combines Bayesian Hierarchical Latent Estimates (Error SD, Reliability R²,
// Total Latent RMSE, Posterior Prob Best) with Empirical Consensus Error
// (MAE, RMSE, MBE, Lin's CCC, Bland-Altman vs Leave-One-Out & Shared Latent θ̂)
// ============================================================

import {
  computeBlandAltmanAgreement,
  studentTCritical95,
  studentTPValueTwoSided
} from './panel-accuracy-bland-altman';
import { computeLinsCCC } from './panel-accuracy-ccc';
import {
  computeFirstDifferencePearsonRVec,
  computePearsonR,
  computeSpearmanRho,
  computeWithinCityPearsonRVec
} from './panel-accuracy-correlation';
import { LatentEngineInternalOutput } from './panel-accuracy-latent';
import { PreparedPanelAccuracyData } from './panel-accuracy-preprocessing';
import {
  AvailableCaseMetricSummary,
  CleanedPanelObservation,
  MeasurementSource,
  SourceAccuracyMetricRow
} from './panel-accuracy-types';

/**
 * Exact Stata `mean z, vce(cluster city)` standard error for a sample mean of panel observations.
 */
export function computeCityClusterMeanSe(
  items: Array<{ city: string; val: number }>
): { mean: number; seCluster: number; nClusters: number; dfCluster: number } {
  const n = items.length;
  if (n === 0) return { mean: 0, seCluster: 0, nClusters: 0, dfCluster: 1 };
  const mean = items.reduce((s, x) => s + x.val, 0) / n;
  if (n === 1) return { mean, seCluster: 0, nClusters: 1, dfCluster: 1 };

  const clusterSums = new Map<string, number>();
  items.forEach(it => {
    clusterSums.set(it.city, (clusterSums.get(it.city) || 0) + (it.val - mean));
  });

  const G = clusterSums.size;
  if (G <= 1) {
    const v = items.reduce((s, x) => s + (x.val - mean) ** 2, 0) / (n - 1);
    return { mean, seCluster: Math.sqrt(v / n), nClusters: 1, dfCluster: Math.max(1, n - 1) };
  }

  let meat = 0;
  clusterSums.forEach(sumScore => {
    meat += sumScore * sumScore;
  });

  const factor = (G / (G - 1)) * ((n - 1) / n);
  const varMean = (factor * meat) / (n * n);
  return {
    mean,
    seCluster: Math.sqrt(Math.max(0, varMean)),
    nClusters: G,
    dfCluster: G - 1
  };
}

function summarizeAvailableCaseConsensus(
  obsList: CleanedPanelObservation[],
  targetSource: MeasurementSource,
  allSources: MeasurementSource[],
  latentOut: LatentEngineInternalOutput
): AvailableCaseMetricSummary {
  const n = obsList.length;
  if (n === 0) {
    return { n: 0, mae: 0, rmse: 0, mbe: 0, pearsonR: 0, spearmanRho: 0, ccc: 0 };
  }

  const estMap = new Map(latentOut.summary.sourceEstimates.map(e => [e.sourceId, e]));
  const compVals: number[] = [];
  const benchVals: number[] = [];
  let sumAe = 0;
  let sumSe = 0;
  let sumErr = 0;

  obsList.forEach(o => {
    const xc = o.values[targetSource.id]!;
    // Inverse-variance weighted peer consensus on this row excluding targetSource
    let wSum = 0;
    let valSum = 0;
    allSources.forEach(peer => {
      if (peer.id === targetSource.id) return;
      const xp = o.values[peer.id];
      if (xp === null || !Number.isFinite(xp)) return;
      const est = estMap.get(peer.id);
      const w = est
        ? (est.loadingLambda * est.loadingLambda) / Math.max(1e-6, est.errorVariance)
        : 1;
      const deBiased = est
        ? (xp - est.interceptBiasAlpha) / Math.max(0.1, est.loadingLambda)
        : xp;
      valSum += w * deBiased;
      wSum += w;
    });
    const bench = wSum > 1e-12 ? valSum / wSum : xc;
    const err = xc - bench;
    compVals.push(xc);
    benchVals.push(bench);
    sumErr += err;
    sumAe += Math.abs(err);
    sumSe += err * err;
  });

  const cccRes = computeLinsCCC(compVals, benchVals, targetSource);

  return {
    n,
    mae: sumAe / n,
    rmse: Math.sqrt(sumSe / n),
    mbe: sumErr / n,
    pearsonR: computePearsonR(compVals, benchVals),
    spearmanRho: computeSpearmanRho(compVals, benchVals),
    ccc: cccRes.ccc
  };
}

/**
 * Compute comprehensive All-Source Accuracy & Latent Reliability Metrics for ALL J evaluated sources.
 */
export function computeAllSourceAccuracyMetrics(
  prepared: PreparedPanelAccuracyData,
  latentOut: LatentEngineInternalOutput
): SourceAccuracyMetricRow[] {
  const {
    completeCaseObservations,
    availableCaseBySourceId,
    comparisonSources, // Contains ALL J sources symmetrically
    workingUnitNote
  } = prepared;

  const nCC = completeCaseObservations.length;
  const estMap = new Map(latentOut.summary.sourceEstimates.map(e => [e.sourceId, e]));
  const benchMeanAbs =
    nCC > 0
      ? Math.abs(
          latentOut.sharedLatentTheta.reduce((a, b) => a + b, 0) / nCC
        )
      : 1;

  return comparisonSources.map(src => {
    const est = estMap.get(src.id)!;
    const availObs = availableCaseBySourceId[src.id] || [];
    const availableCase = summarizeAvailableCaseConsensus(
      availObs,
      src,
      comparisonSources,
      latentOut
    );

    const srcValsCC = completeCaseObservations.map(o => o.values[src.id]!);
    // Out-of-sample Leave-One-Source-Out Consensus benchmark theta_hat^(-j)
    const losoBenchCC = latentOut.losoConsensusBySource[src.id] || latentOut.sharedLatentTheta;

    const aeItems = completeCaseObservations.map((o, i) => ({
      city: o.city,
      val: Math.abs(srcValsCC[i] - losoBenchCC[i])
    }));
    const seItems = completeCaseObservations.map((o, i) => {
      const e = srcValsCC[i] - losoBenchCC[i];
      return { city: o.city, val: e * e };
    });
    const errItems = completeCaseObservations.map((o, i) => ({
      city: o.city,
      val: srcValsCC[i] - losoBenchCC[i]
    }));

    const maeCluster = computeCityClusterMeanSe(aeItems);
    const seClusterStats = computeCityClusterMeanSe(seItems);
    const mbeCluster = computeCityClusterMeanSe(errItems);

    const tCrit = studentTCritical95(maeCluster.dfCluster);
    const mae = maeCluster.mean;
    const maeCiLower = Math.max(0, mae - tCrit * maeCluster.seCluster);
    const maeCiUpper = mae + tCrit * maeCluster.seCluster;

    const mse = Math.max(0, seClusterStats.mean);
    const rmse = Math.sqrt(mse);
    const rmseSe = rmse > 1e-12 ? seClusterStats.seCluster / (2 * rmse) : 0;
    const rmseCiLower = Math.max(0, rmse - tCrit * rmseSe);
    const rmseCiUpper = rmse + tCrit * rmseSe;

    const mbe = mbeCluster.mean;
    const mbeSe = mbeCluster.seCluster;
    const mbeCiLower = mbe - tCrit * mbeSe;
    const mbeCiUpper = mbe + tCrit * mbeSe;
    const mbeTStat = mbeSe > 1e-12 ? mbe / mbeSe : 0;
    const mbePValue = studentTPValueTwoSided(mbeTStat, mbeCluster.dfCluster);

    const nmaePct = benchMeanAbs > 1e-12 ? (mae / benchMeanAbs) * 100 : 0;
    const pearsonR = computePearsonR(srcValsCC, losoBenchCC);
    const spearmanRho = computeSpearmanRho(srcValsCC, losoBenchCC);
    const withinCityR = computeWithinCityPearsonRVec(
      completeCaseObservations,
      srcValsCC,
      losoBenchCC
    );
    const firstDiffR = computeFirstDifferencePearsonRVec(
      completeCaseObservations,
      srcValsCC,
      losoBenchCC
    );

    const ccc = computeLinsCCC(srcValsCC, losoBenchCC, src);
    const baPairs = completeCaseObservations.map((o, i) => ({
      city: o.city,
      year: o.year,
      compVal: srcValsCC[i],
      refVal: losoBenchCC[i]
    }));
    const blandAltman = computeBlandAltmanAgreement(baPairs, src);

    return {
      sourceId: src.id,
      sourceName: src.name,
      sourceLabel: `${src.name} (${src.label})`,
      unit: src.unit || workingUnitNote || 'kt CO₂',
      nCompleteCase: nCC,
      nAvailableCase: availObs.length,
      missingGapVsComplete: availObs.length - nCC,
      latentInterceptBias: est.interceptBiasAlpha,
      latentLoading: est.loadingLambda,
      errorVariance: est.errorVariance,
      errorSd: est.errorSd,
      errorSdCiLower: est.errorSdCiLower,
      errorSdCiUpper: est.errorSdCiUpper,
      totalLatentRmse: est.totalLatentRmse,
      totalLatentRmseCiLower: est.totalLatentRmseCiLower,
      totalLatentRmseCiUpper: est.totalLatentRmseCiUpper,
      reliabilityR2: est.reliabilityR2,
      reliabilityCiLower: est.reliabilityCiLower,
      reliabilityCiUpper: est.reliabilityCiUpper,
      posteriorProbBest: est.posteriorProbBestTotalError,
      mcmcRhat: est.mcmcRhat,
      mcmcEss: est.mcmcEss,
      grubbsErrorVariance: est.grubbsErrorVariance,
      mae,
      maeSeCluster: maeCluster.seCluster,
      maeCiLower,
      maeCiUpper,
      rmse,
      rmseCiLower,
      rmseCiUpper,
      mbe,
      mbeSeCluster: mbeSe,
      mbeCiLower,
      mbeCiUpper,
      mbeTStat,
      mbePValue,
      nmaePct,
      pearsonR,
      spearmanRho,
      withinCityR,
      firstDiffR,
      ccc,
      blandAltman,
      availableCase
    };
  });
}
