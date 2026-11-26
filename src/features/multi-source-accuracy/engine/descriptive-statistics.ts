
import {
  MsmaDescriptiveBundle,
  MsmaDescriptiveSourceRow,
  MsmaPairwiseScatterSummary,
  MsmaSourceConfig
} from '../types';
import {
  mad,
  mean,
  median,
  pearsonCorrAndP,
  quantileSorted,
  sampleSd,
  sampleVariance,
  simpleLinearRegression,
  skewnessAndExcessKurtosis,
  spearmanCorrAndP
} from '../utils/numerical';

export interface AlignedPanelObservation {
  rowIndex: number;
  entity: string;
  period: number;
  valuesBySource: Record<string, number | null>;
}

export function computeDescriptiveAndQualityAnalysis(
  observations: AlignedPanelObservation[],
  sources: MsmaSourceConfig[]
): MsmaDescriptiveBundle {
  const nTotalPanelRows = observations.length;
  const completeObs = observations.filter(obs =>
    sources.every(s => obs.valuesBySource[s.id] !== null && Number.isFinite(obs.valuesBySource[s.id]))
  );

  const sourceStats: MsmaDescriptiveSourceRow[] = sources.map(src => {
    const validPairs = observations
      .map(o => ({ entity: o.entity, period: o.period, val: o.valuesBySource[src.id] }))
      .filter((x): x is { entity: string; period: number; val: number } => x.val !== null && Number.isFinite(x.val));

    const vals = validPairs.map(v => v.val);
    const sorted = [...vals].sort((a, b) => a - b);
    const nValid = vals.length;
    const nMissing = nTotalPanelRows - nValid;
    const missingPct = nTotalPanelRows > 0 ? (nMissing / nTotalPanelRows) * 100 : 0;

    const m = mean(vals);
    const med = median(vals);
    const sd = sampleSd(vals);
    const variance = sampleVariance(vals);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    const q25 = quantileSorted(sorted, 0.25);
    const q75 = quantileSorted(sorted, 0.75);
    const iqr = q75 - q25;
    const { skewness, kurtosisExcess } = skewnessAndExcessKurtosis(vals);

    const madScale = mad(vals);
    const outlierCountMad =
      madScale > 1e-12
        ? vals.filter(v => Math.abs(v - med) / madScale > 3.5).length
        : 0;
    const outlierPctMad = nValid > 0 ? (outlierCountMad / nValid) * 100 : 0;

    // Stata xtsum decomposition: Between-entity SD & Within-entity SD
    const byEntity = new Map<string, number[]>();
    for (const item of validPairs) {
      const arr = byEntity.get(item.entity) ?? [];
      arr.push(item.val);
      byEntity.set(item.entity, arr);
    }
    const entityMeans: number[] = [];
    const withinAdjusted: number[] = [];
    byEntity.forEach(arr => {
      const em = mean(arr);
      entityMeans.push(em);
      for (const v of arr) {
        withinAdjusted.push(v - em + m);
      }
    });
    const betweenEntitySd = sampleSd(entityMeans);
    const withinEntitySd = sampleSd(withinAdjusted);

    return {
      sourceId: src.id,
      displayName: src.displayName,
      unit: src.unit,
      nValid,
      nMissing,
      missingPct,
      mean: m,
      median: med,
      sd,
      variance,
      min,
      max,
      skewness,
      kurtosisExcess,
      iqr,
      outlierCountMad,
      outlierPctMad,
      betweenEntitySd,
      withinEntitySd
    };
  });

  const J = sources.length;
  const pearsonMatrix: number[][] = Array.from({ length: J }, (_, i) =>
    Array.from({ length: J }, (__, j) => (i === j ? 1 : 0))
  );
  const spearmanMatrix: number[][] = Array.from({ length: J }, (_, i) =>
    Array.from({ length: J }, (__, j) => (i === j ? 1 : 0))
  );
  const pairwiseScatters: MsmaPairwiseScatterSummary[] = [];

  for (let i = 0; i < J; i++) {
    for (let j = i + 1; j < J; j++) {
      const sA = sources[i];
      const sB = sources[j];
      const paired = observations
        .map(o => ({
          entity: o.entity,
          period: o.period,
          a: o.valuesBySource[sA.id],
          b: o.valuesBySource[sB.id]
        }))
        .filter(
          (p): p is { entity: string; period: number; a: number; b: number } =>
            p.a !== null && p.b !== null && Number.isFinite(p.a) && Number.isFinite(p.b)
        );

      const xs = paired.map(p => p.a);
      const ys = paired.map(p => p.b);
      const { r, p: pPearson } = pearsonCorrAndP(xs, ys);
      const { rho, p: pSpearman } = spearmanCorrAndP(xs, ys);
      const ols = simpleLinearRegression(xs, ys);

      pearsonMatrix[i][j] = r;
      pearsonMatrix[j][i] = r;
      spearmanMatrix[i][j] = rho;
      spearmanMatrix[j][i] = rho;

      const diffs = paired.map(p => p.b - (ols.intercept + ols.slope * p.a));
      const diffMed = median(diffs);
      const diffMad = mad(diffs);

      pairwiseScatters.push({
        sourceAId: sA.id,
        sourceBId: sB.id,
        sourceAName: sA.displayName,
        sourceBName: sB.displayName,
        nPairs: paired.length,
        pearsonR: r,
        pearsonP: pPearson,
        spearmanRho: rho,
        spearmanP: pSpearman,
        olsSlope: ols.slope,
        olsIntercept: ols.intercept,
        points: paired.map((p, idx) => ({
          entity: p.entity,
          period: p.period,
          a: p.a,
          b: p.b,
          isOutlier: diffMad > 1e-12 ? Math.abs(diffs[idx] - diffMed) / diffMad > 3.5 : false
        }))
      });
    }
  }

  // Annual/Period means
  const periods = Array.from(new Set(observations.map(o => o.period))).sort((a, b) => a - b);
  const periodMeans = periods.map(period => {
    const slice = observations.filter(o => o.period === period);
    const valuesBySource: Record<string, number | null> = {};
    for (const s of sources) {
      const vals = slice
        .map(o => o.valuesBySource[s.id])
        .filter((v): v is number => v !== null && Number.isFinite(v));
      valuesBySource[s.id] = vals.length > 0 ? mean(vals) : null;
    }
    return { period, valuesBySource };
  });

  // Entity means
  const entities = Array.from(new Set(observations.map(o => o.entity))).sort((a, b) => a.localeCompare(b));
  const entityMeans = entities.map(entity => {
    const slice = observations.filter(o => o.entity === entity);
    const valuesBySource: Record<string, number | null> = {};
    for (const s of sources) {
      const vals = slice
        .map(o => o.valuesBySource[s.id])
        .filter((v): v is number => v !== null && Number.isFinite(v));
      valuesBySource[s.id] = vals.length > 0 ? mean(vals) : null;
    }
    return { entity, valuesBySource };
  });

  // Missingness Grid (capped to first 40 entities for crisp rendering while preserving full stats)
  const missingnessGrid: MsmaDescriptiveBundle['missingnessGrid'] = [];
  const entitySubset = entities.slice(0, 40);
  for (const entity of entitySubset) {
    for (const period of periods) {
      const matching = observations.find(o => o.entity === entity && o.period === period);
      const presentBySource: Record<string, boolean> = {};
      for (const s of sources) {
        const val = matching?.valuesBySource[s.id] ?? null;
        presentBySource[s.id] = val !== null && Number.isFinite(val);
      }
      missingnessGrid.push({ entity, period, presentBySource });
    }
  }

  return {
    nCompleteCasesAllSources: completeObs.length,
    nTotalPanelRows,
    sourceStats,
    pearsonMatrix,
    spearmanMatrix,
    pairwiseScatters,
    periodMeans,
    entityMeans,
    missingnessGrid
  };
}
