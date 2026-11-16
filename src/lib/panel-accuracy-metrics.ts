// ============================================================
// Comparative Measurement Accuracy Assessment — Accuracy Metrics
// MAE, RMSE, MBE, Cluster-Robust Confidence Intervals,
// Complete-Case vs Source-Specific Available-Case Comparison
// ============================================================

import {
  computeBlandAltmanAgreement,
  studentTCritical95,
  studentTPValueTwoSided
} from './panel-accuracy-bland-altman';
import { computeLinsCCC } from './panel-accuracy-ccc';
import {
  computeFirstDifferencePearsonR,
  computePearsonR,
  computeSpearmanRho,
  computeWithinCityPearsonR
} from './panel-accuracy-correlation';
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
    // Fallback to classic i.i.d. SE if only 1 city present
    const v = items.reduce((s, x) => s + (x.val - mean) ** 2, 0) / (n - 1);
    return { mean, seCluster: Math.sqrt(v / n), nClusters: 1, dfCluster: Math.max(1, n - 1) };
  }

  let meat = 0;
  clusterSums.forEach(sumScore => {
    meat += sumScore * sumScore;
  });

  // Small-sample adjustment: (G / (G - 1)) * ((n - 1) / n)
  const factor = (G / (G - 1)) * ((n - 1) / n);
  const varMean = (factor * meat) / (n * n);
  return {
    mean,
    seCluster: Math.sqrt(Math.max(0, varMean)),
    nClusters: G,
    dfCluster: G - 1
  };
}

function summarizeAvailableCase(
  obsList: CleanedPanelObservation[],
  compSource: MeasurementSource,
  refSource: MeasurementSource
): AvailableCaseMetricSummary {
  const n = obsList.length;
  if (n === 0) {
    return { n: 0, mae: 0, rmse: 0, mbe: 0, pearsonR: 0, spearmanRho: 0, ccc: 0 };
  }
  const compVals: number[] = [];
  const refVals: number[] = [];
  let sumAe = 0;
  let sumSe = 0;
  let sumErr = 0;

  obsList.forEach(o => {
    const xc = o.values[compSource.id]!;
    const xr = o.values[refSource.id]!;
    const err = xc - xr;
    compVals.push(xc);
    refVals.push(xr);
    sumErr += err;
    sumAe += Math.abs(err);
    sumSe += err * err;
  });

  const cccRes = computeLinsCCC(compVals, refVals, compSource);

  return {
    n,
    mae: sumAe / n,
    rmse: Math.sqrt(sumSe / n),
    mbe: sumErr / n,
    pearsonR: computePearsonR(compVals, refVals),
    spearmanRho: computeSpearmanRho(compVals, refVals),
    ccc: cccRes.ccc
  };
}

/**
 * Compute complete accuracy and agreement metrics for all comparison sources against the selected reference source.
 */
export function computeAllSourceAccuracyMetrics(
  prepared: PreparedPanelAccuracyData
): SourceAccuracyMetricRow[] {
  const {
    completeCaseObservations,
    availableCaseBySourceId,
    referenceSource,
    comparisonSources
  } = prepared;

  const nCC = completeCaseObservations.length;
  const refValsCC = completeCaseObservations.map(o => o.values[referenceSource.id]!);
  const refMeanAbs =
    nCC > 0
      ? Math.abs(refValsCC.reduce((a, b) => a + b, 0) / nCC)
      : 1;

  return comparisonSources.map(comp => {
    const availObs = availableCaseBySourceId[comp.id] || [];
    const availableCase = summarizeAvailableCase(availObs, comp, referenceSource);

    const compValsCC = completeCaseObservations.map(o => o.values[comp.id]!);
    const aeItems = completeCaseObservations.map((o, i) => ({
      city: o.city,
      val: Math.abs(compValsCC[i] - refValsCC[i])
    }));
    const seItems = completeCaseObservations.map((o, i) => {
      const e = compValsCC[i] - refValsCC[i];
      return { city: o.city, val: e * e };
    });
    const errItems = completeCaseObservations.map((o, i) => ({
      city: o.city,
      val: compValsCC[i] - refValsCC[i]
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
    // Delta method SE(sqrt(MSE)) = SE(MSE) / (2 * RMSE)
    const rmseSe = rmse > 1e-12 ? seClusterStats.seCluster / (2 * rmse) : 0;
    const rmseCiLower = Math.max(0, rmse - tCrit * rmseSe);
    const rmseCiUpper = rmse + tCrit * rmseSe;

    const mbe = mbeCluster.mean;
    const mbeSe = mbeCluster.seCluster;
    const mbeCiLower = mbe - tCrit * mbeSe;
    const mbeCiUpper = mbe + tCrit * mbeSe;
    const mbeTStat = mbeSe > 1e-12 ? mbe / mbeSe : 0;
    const mbePValue = studentTPValueTwoSided(mbeTStat, mbeCluster.dfCluster);

    const nmaePct = refMeanAbs > 1e-12 ? (mae / refMeanAbs) * 100 : 0;
    const pearsonR = computePearsonR(compValsCC, refValsCC);
    const spearmanRho = computeSpearmanRho(compValsCC, refValsCC);
    const withinCityR = computeWithinCityPearsonR(completeCaseObservations, comp.id, referenceSource.id);
    const firstDiffR = computeFirstDifferencePearsonR(completeCaseObservations, comp.id, referenceSource.id);

    const ccc = computeLinsCCC(compValsCC, refValsCC, comp);
    const baPairs = completeCaseObservations.map((o, i) => ({
      city: o.city,
      year: o.year,
      compVal: compValsCC[i],
      refVal: refValsCC[i]
    }));
    const blandAltman = computeBlandAltmanAgreement(baPairs, comp);

    return {
      sourceId: comp.id,
      sourceName: comp.name,
      sourceLabel: `${comp.name} (${comp.label})`,
      unit: comp.unit || referenceSource.unit || 'kt CO₂',
      nCompleteCase: nCC,
      nAvailableCase: availObs.length,
      missingGapVsComplete: availObs.length - nCC,
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
